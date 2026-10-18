/// Compiles existing UI calls into internal generation scopes without changing plugin source APIs.
var OperitComposeCompiler = function () {
  /// Lowers source inputs and validates already lowered artifacts through the same ABI.
  function prepare(source, identity) {
    var compiled = OperitComposeArtifact.read(source);
    return compiled === null ? OperitComposeCompiler.compile(source, identity) : compiled;
  }
  /// Emits ordinary portable JS; no runtime objects, bytecode or user state are captured.
  function artifact(source, identity) {
    var compiled = OperitComposeArtifact.read(source);
    return compiled === null ? OperitComposeArtifact.prefix + OperitComposeArtifact.version + '\n' + compile(source, identity) : compiled;
  }
  var childNodes = new WeakMap();
  /// Visits direct ESTree child nodes without traversing locations or primitive properties.
  function children(node) {
    if (childNodes.has(node)) return childNodes.get(node);
    var result = [];
    Object.keys(node).forEach(function (key) {
      var value = node[key];
      if (Array.isArray(value)) value.forEach(function (item) {
        if (item && typeof item.type === 'string') result.push(item);
      });else if (value && typeof value.type === 'string') result.push(value);
    });
    result.sort(function (a, b) {
      return a.start - b.start;
    });
    childNodes.set(node, result);
    return result;
  }

  /// Recognizes the existing context.UI.Type call using its parsed member structure.
  function uiCall(node) {
    if (node.type !== 'CallExpression' || node.optional) return null;
    var member = node.callee;
    if (member.type !== 'MemberExpression' || member.computed || member.optional) return null;
    var registry = member.object;
    if (registry.type !== 'MemberExpression' || registry.computed || registry.optional || registry.property.name !== 'UI') return null;
    return registry.object.type === 'Identifier' ? registry.object : null;
  }

  /// Transforms only parsed UI construction calls and leaves user control flow and side effects intact.
  function compile(source, identity) {
    var compiled = OperitComposeArtifact.read(source);
    if (compiled !== null) return compiled;
    var ast = __operitAcorn.parse(source, {
      ecmaVersion: 2022,
      sourceType: 'script',
      allowReturnOutsideFunction: true
    });
    var templates = [];
    var templatePrefix = '__operitUiTemplate_';
    while (source.indexOf(templatePrefix) !== -1) templatePrefix += '_';

    /// Preserves observable enumeration, prototype and duplicate-property semantics.
    function fixedObject(node) {
      var keys = new Set();
      return node.properties.every(function (property) {
        if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method) return false;
        var key = property.key.type === 'Identifier' ? property.key.name : String(property.key.value);
        if (key === '__proto__' || keys.has(key) || String(Number(key) >>> 0) === key && Number(key) < 4294967295) return false;
        keys.add(key);
        return true;
      });
    }

    /// Leaves fixed literal structure in a hoisted factory; evaluates dynamic leaves in source order.
    function templateArgument(node, plan, values) {
      if (node.type === 'Literal' && !node.regex) return source.slice(node.start, node.end);
      if (node.type === 'ObjectExpression' && fixedObject(node)) {
        return '{' + node.properties.map(function (property) {
          return source.slice(property.key.start, property.key.end) + ':' + templateArgument(property.value, plan, values);
        }).join(',') + '}';
      }
      if (node.type === 'ArrayExpression' && node.elements.every(function (element) {
        return element && element.type !== 'SpreadElement';
      })) {
        return '[' + node.elements.map(function (element) {
          return templateArgument(element, plan, values);
        }).join(',') + ']';
      }
      values.push(emit(node, plan));
      return '__values[' + (values.length - 1) + ']';
    }

    /// Recognizes a statically keyed state binding whose lexical value can be refreshed independently.
    function stateBinding(declaration, context) {
      var call = declaration.init;
      return declaration.id.type === 'ArrayPattern' && declaration.id.elements.length <= 2 && declaration.id.elements.every(function (item) {
        return item === null || item.type === 'Identifier';
      }) && call && call.type === 'CallExpression' && call.callee.type === 'MemberExpression' && !call.callee.computed && call.callee.object.type === 'Identifier' && call.callee.object.name === context && call.callee.property.name === 'useState' && call.arguments[0] && call.arguments[0].type === 'Literal' && typeof call.arguments[0].value === 'string';
    }

    /// Keeps observable calls, mutations and control-flow effects inside their original execution unit.
    function separable(node) {
      if (!node) return true;
      if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return true;
      if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression' || node.type === 'AwaitExpression' || node.type === 'YieldExpression' || node.type === 'NewExpression' || node.type === 'TaggedTemplateExpression') return false;
      if (node.type === 'UnaryExpression' && node.operator === 'delete') return false;
      if (node.type === 'CallExpression') {
        if (!uiCall(node) && !(node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property.name === 'map')) return false;
      }
      return children(node).every(separable);
    }

    /// Rejects captured variable assignments that lack an observable state-write boundary.
    function capturedWrites(node, names) {
      if (!node) return false;
      if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
        var target = node.type === 'AssignmentExpression' ? node.left : node.argument;
        if (target.type === 'Identifier' && names.has(target.name)) return true;
      }
      return children(node).some(function (child) {
        return capturedWrites(child, names);
      });
    }

    /// Partitions straight-line synchronous render functions into lexical binding and expression units.
    function renderFrame(fn) {
      if (fn.async || fn.generator || fn.params.length !== 1 || fn.params[0].type !== 'Identifier' || fn.body.type !== 'BlockStatement') return null;
      var context = fn.params[0].name;
      var statements = fn.body.body;
      if (!statements.length || statements[statements.length - 1].type !== 'ReturnStatement') return null;
      var hasState = false;
      var variables = new Set();
      for (var index = 0; index < statements.length - 1; index += 1) {
        var statement = statements[index];
        if (statement.type === 'FunctionDeclaration') continue;
        if (statement.type !== 'VariableDeclaration') return null;
        for (var declaration of statement.declarations) {
          if (stateBinding(declaration, context)) {
            hasState = true;
            if (declaration.id.elements[0]) variables.add(declaration.id.elements[0].name);
          } else if (declaration.id.type === 'Identifier' && declaration.init && separable(declaration.init)) {
            if (declaration.init.type !== 'ArrowFunctionExpression' && declaration.init.type !== 'FunctionExpression') variables.add(declaration.id.name);
          } else return null;
        }
      }
      if (!hasState || !uiCall(statements[statements.length - 1].argument) || !separable(statements[statements.length - 1].argument)) return null;
      if (capturedWrites(fn.body, variables)) return null;
      return {
        context: context,
        variables: variables,
        statements: statements,
        frame: '__operitFrame_' + fn.start
      };
    }

    /// Finds lexical reads used by this execution unit, excluding independently registered UI expressions and callbacks.
    function reads(node, plan, output) {
      if (!node || uiCall(node) || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return;
      if (node.type === 'Identifier') {
        if (plan.variables.has(node.name)) output.add(node.name);
        return;
      }
      if (node.type === 'MemberExpression') {
        reads(node.object, plan, output);
        if (node.computed) reads(node.property, plan, output);
        return;
      }
      if (node.type === 'Property') {
        if (node.computed) reads(node.key, plan, output);
        reads(node.value, plan, output);
        return;
      }
      children(node).forEach(function (child) {
        reads(child, plan, output);
      });
    }

    /// Emits dependency keys bound to the exact captured lexical frame.
    function readKeys(node, plan) {
      var names = new Set();
      reads(node, plan, names);
      return '[' + Array.from(names).map(function (name) {
        return plan.frame + '.key+' + JSON.stringify(':value:' + name);
      }).join(',') + ']';
    }

    /// Preserves captured lexical variables while registering their independent refresh functions.
    function emitFrame(fn, plan) {
      var output = source.slice(fn.start, fn.body.start) + '{\nconst ' + plan.frame + '=OperitComposeReactive.frame(' + plan.context + ',' + JSON.stringify(identity + ':' + fn.start) + ');\n';
      for (var index = 0; index < plan.statements.length - 1; index += 1) {
        var statement = plan.statements[index];
        if (statement.type === 'FunctionDeclaration') {
          output += emit(statement) + '\n';
          continue;
        }
        for (var declaration of statement.declarations) {
          if (stateBinding(declaration, plan.context)) {
            var name = declaration.id.elements[0];
            output += 'let ' + source.slice(declaration.id.start, declaration.id.end) + '=' + source.slice(declaration.init.start, declaration.init.end) + ';\n';
            if (name) output += 'OperitComposeReactive.state(' + plan.frame + ',' + JSON.stringify(name.name) + ',' + source.slice(declaration.init.arguments[0].start, declaration.init.arguments[0].end) + ',(__value)=>{' + name.name + '=__value;});\n';
          } else if (declaration.init.type === 'ArrowFunctionExpression' || declaration.init.type === 'FunctionExpression') {
            output += 'const ' + declaration.id.name + '=' + emit(declaration.init) + ';\n';
          } else {
            output += 'let ' + declaration.id.name + ';OperitComposeReactive.derived(' + plan.frame + ',' + JSON.stringify(declaration.id.name) + ',' + readKeys(declaration.init, plan) + ',()=>(' + emit(declaration.init, plan) + '),(__value)=>{' + declaration.id.name + '=__value;});\n';
          }
        }
      }
      return output + 'return ' + emit(plan.statements[plan.statements.length - 1].argument, plan) + ';\n}';
    }

    /// Materializes a source range only when an enclosing rewrite needs its complete text.
    function emit(node, plan) {
      var rewritten = rewrite(node, plan);
      return rewritten === null ? source.slice(node.start, node.end) : rewritten;
    }

    /// Produces replacements only for AST ranges that contain an actual DSL transformation.
    function rewrite(node, plan) {
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        var partition = renderFrame(node);
        if (partition) return emitFrame(node, partition);
      }
      var receiver = uiCall(node);
      if (receiver) {
        var context = source.slice(receiver.start, receiver.end);
        var site = JSON.stringify(identity + ':' + node.start);
        // Argument spreading has observable iteration and is handled by the existing generic path.
        if (node.arguments.some(function (argument) { return argument.type === 'SpreadElement'; })) {
          var args = '[' + node.arguments.map(function (argument) { return emit(argument, plan); }).join(',') + ']';
          var callee = source.slice(node.callee.start, node.callee.end);
          var genericFactory = '(...__operitArgs)=>' + callee + '(...__operitArgs)';
          if (plan) {
            var spreadNames = new Set();
            node.arguments.forEach(function (argument) { reads(argument, plan, spreadNames); });
            var spreadKeys = '[' + Array.from(spreadNames).map(function (name) {
              return plan.frame + '.key+' + JSON.stringify(':value:' + name);
            }).join(',') + ']';
            return 'OperitComposeReactive.expression(' + plan.frame + ',' + site + ',' + spreadKeys + ',()=>' + args + ',' + genericFactory + ')';
          }
          return 'OperitComposeGeneration.node(' + context + ',' + site + ',' + args + ',' + genericFactory + ')';
        }
        var values = [];
        var construction = node.arguments.map(function (argument) { return templateArgument(argument, plan, values); }).join(',');
        var factory = templatePrefix + node.start;
        templates.push('function ' + factory + '(__ctx,__values){return __ctx.UI.' + node.callee.property.name + '(' + construction + '); }');
        var vector = values.length ? '[' + values.join(',') + ']' : 'null';
        if (plan) {
          var names = new Set();
          node.arguments.forEach(function (argument) { reads(argument, plan, names); });
          var keys = '[' + Array.from(names).map(function (name) {
            return plan.frame + '.key+' + JSON.stringify(':value:' + name);
          }).join(',') + ']';
          return 'OperitComposeReactive.expressionTemplate(' + plan.frame + ',' + site + ',' + keys + ',()=>' + vector + ',' + factory + ')';
        }
        return 'OperitComposeGeneration.template(' + context + ',' + site + ',' + vector + ',' + factory + ')';
      }
      var cursor = node.start;
      var visitedEnd = node.start;
      var output = null;
      children(node).forEach(function (child) {
        if (child.start < visitedEnd) return;
        visitedEnd = child.end;
        var replacement = rewrite(child, plan);
        if (replacement === null) return;
        if (output === null) output = '';
        output += source.slice(cursor, child.start) + replacement;
        cursor = child.end;
      });
      return output === null ? null : output + source.slice(cursor, node.end);
    }
    var lowered = emit(ast);
    return lowered + (templates.length ? '\n' + templates.join('\n') : '');
  }
  return {
    compile: compile,
    prepare: prepare,
    artifact: artifact,
    artifactVersion: OperitComposeArtifact.version
  };
}();
