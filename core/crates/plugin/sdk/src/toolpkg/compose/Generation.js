/// Retains generation scopes separately from transport records and updates captured action closures.
var OperitComposeGeneration = function () {
  var contexts = new WeakMap();
  var nodes = new WeakMap();
  var actionBinding = false;
  var callbackCells = new WeakMap();

  /// Identifies nodes whose construction inputs are owned by the generation registry.
  function owns(node) {
    return nodes.has(node);
  }

  /// Attaches a retained node owner without retaining detached node graphs globally.
  function watch(node, listener) {
    var listeners = record(node).listeners;
    listeners.add(listener);
    /// Releases one retained occurrence when it leaves the composition.
    return function () {
      listeners.delete(listener);
    };
  }

  /// Resolves the factory-owned record without reading through public mutation proxies.
  function record(node) {
    var entry = nodes.get(node);
    if (!entry) throw new Error('Compose node must be created by the DSL node factory');
    return entry;
  }

  /// Supplies retained reconciliation with the observed node's underlying containers.
  function read(node) {
    return record(node).value;
  }

  /// Updates the internal callback reference without treating ownership binding as a plugin mutation.
  function rebind(reference, id) {
    actionBinding = true;
    try {
      reference.__actionId = id;
    } finally {
      actionBinding = false;
    }
  }

  /// Invalidates a cached transport record when a plugin mutates its public node object.
  function observeNode(node) {
    var seen = new WeakMap();
    var root;
    /// Publishes the exact mutation path without invalidating unrelated retained occurrences.
    function changed(path) {
      if (actionBinding) return;
      record(root).listeners.forEach(
      /// Enqueues the affected retained occurrence instead of walking its ancestors.
      function (listener) {
        listener(path);
      });
    }
    /// Wraps owned containers while retaining child node identity and public object shape.
    function observe(value, path) {
      if (value === null || typeof value !== 'object') return value;
      if (value !== node && value.__composeNode === true) return value;
      if (seen.has(value)) return seen.get(value);
      var proxy = new Proxy(value, {
        /// Reads nested containers through the same mutation observer.
        get(target, key) {
          var next = Reflect.get(target, key);
          if (next === null || typeof next !== 'object') return next;
          if (next !== node && next.__composeNode === true) return next;
          if (seen.has(next)) return seen.get(next);
          return observe(next, path.concat(key));
        },
        /// Invalidates record caching before an explicit plugin assignment.
        set(target, key, next) {
          var previous = Reflect.get(target, key);
          var changedKey = path.length === 0 && key === 'props' && previous && previous.key !== next.key;
          if (Object.is(previous, next)) return true;
          if (changedKey) changed(['props', 'key']);else changed(path.concat(key));
          return Reflect.set(target, key, next);
        },
        /// Invalidates record caching before a plugin removes a property.
        deleteProperty(target, key) {
          if (!Reflect.has(target, key)) return true;
          changed(path.concat(key));
          return Reflect.deleteProperty(target, key);
        },
        /// Invalidates record caching when a plugin defines a property descriptor.
        defineProperty(target, key, descriptor) {
          var previous = Reflect.getOwnPropertyDescriptor(target, key);
          if (previous && previous.configurable === descriptor.configurable && previous.enumerable === descriptor.enumerable && previous.writable === descriptor.writable && previous.value === descriptor.value && previous.get === descriptor.get && previous.set === descriptor.set) return true;
          changed(path.concat(key));
          return Reflect.defineProperty(target, key, descriptor);
        }
      });
      seen.set(value, proxy);
      OperitComposeActions.inherit(value, proxy);
      return proxy;
    }
    root = observe(node, []);
    nodes.set(root, { value: node, listeners: new Set() });
    return root;
  }
  function contextState(ctx) {
    var state = contexts.get(ctx);
    if (!state) throw new TypeError('Compose expressions require the original SDK context');
    return state;
  }
  function ownedContext(ctx) {
    var context = contextState(ctx);
    return context.active || context.root;
  }
  function region() {
    return { scopes: new Map(), pass: 0,
      memos: new Map(), liveMemos: new Set(), hasNodes: false };
  }
  function beginRegion(state) {
    state.pass += 1;
    state.liveMemos.clear();
    state.hasNodes = false;
  }
  function endRegion(state) {
    state.scopes.forEach(function (siteState, site) {
      if (siteState.pass !== state.pass) state.scopes.delete(site);
      else siteState.entries.length = siteState.count;
    });
    state.memos.forEach(function (value, key) {
      if (!state.liveMemos.has(key)) state.memos.delete(key);
    });
  }

  /// Creates generation state owned by exactly one public DSL context.
  function attach(ctx) {
    contexts.set(ctx, { root: region(), active: null, entry: null, epoch: 0 });
  }

  /// Starts one render traversal without discarding retained expression results.
  function begin(ctx, entry) {
    var context = contextState(ctx);
    if (entry !== undefined && context.entry !== entry) {
      context.entry = entry;
      context.epoch += 1;
    }
    context.active = context.root;
    beginRegion(context.root);
  }

  /// Releases scopes belonging to branches and loop entries that left the current composition.
  function end(ctx) {
    var context = contextState(ctx);
    endRegion(context.root);
    context.active = null;
  }

  /// Gives a memo factory its own occurrence counters, so skipped UI cannot rebind a sibling's callbacks.
  function memo(ctx, key, previous, changed, factory) {
    var context = contextState(ctx);
    var parent = ownedContext(ctx);
    parent.liveMemos.add(key);
    var child = parent.memos.get(key);
    if (!child) {
      child = region();
      parent.memos.set(key, child);
    }
    var reusable = !changed && previous && (!previous.hasNodes || previous.epoch === context.epoch);
    var result = OperitComposeReactive.memo(ctx, key, reusable, function () {
      // Plain data keeps its public keyed identity after branch removal or source reload.
      if (reusable && !previous.hasNodes) return previous;
      var active = context.active;
      context.active = child;
      beginRegion(child);
      try {
        var value = factory();
        return { value: value, hasNodes: child.hasNodes, epoch: context.epoch };
      } finally {
        endRegion(child);
        context.active = active;
      }
    });
    child.hasNodes = result.hasNodes;
    parent.hasNodes = parent.hasNodes || child.hasNodes;
    return result;
  }

  /// Retains a lazy item's generation inside its window; disposal uses the existing memo region.
  function memoItem(ctx, key, version, factory) {
    var parent = ownedContext(ctx);
    var child = parent.memos.get(key);
    var cached = child && child.cachedItem;
    var result = memo(ctx, key, cached && cached.generated,
      !cached || cached.version !== version, factory);
    parent.memos.get(key).cachedItem = { version: version, generated: result };
    return result.value;
  }

  /// Tags node-producing memos for source reload without invalidating ordinary memoized data.
  function created(ctx) {
    if (contexts.has(ctx)) ownedContext(ctx).hasNodes = true;
  }

  /// Selects a call-site occurrence while preserving independent loop instances.
  function scope(ctx, site) {
    var state = ownedContext(ctx);
    state.hasNodes = true;
    var siteState = state.scopes.get(site);
    if (!siteState) {
      siteState = { entries: [], count: 0, pass: state.pass };
      state.scopes.set(site, siteState);
    } else if (siteState.pass !== state.pass) {
      siteState.count = 0;
      siteState.pass = state.pass;
    }
    var index = siteState.count++;
    if (!siteState.entries[index]) siteState.entries[index] = { initialized: false };
    return siteState.entries[index];
  }

  /// Retains immutable argument snapshots and action trampolines with replaceable captured closures.
  function snapshot(value, seen, previous) {
    if (typeof value === 'function') {
      var cell = typeof previous === 'function' ? callbackCells.get(previous) : null;
      if (!cell) {
        cell = { handler: value };
        /// Keeps the callback in its existing snapshot slot while replacing the closure.
        cell.invoke = function () {
          return cell.handler.apply(this, arguments);
        };
        callbackCells.set(cell.invoke, cell);
      }
      cell.handler = value;
      OperitComposeActions.forward(cell.invoke, value);
      return cell.invoke;
    }
    if (value === null || typeof value !== 'object') return value;
    if (value.__composeNode === true) return value;
    if (seen.has(value)) throw new TypeError('Compose arguments must not contain cycles');
    seen.add(value);
    var array = Array.isArray(value);
    var keys = Object.keys(value);
    var reusable = previous !== null && typeof previous === 'object' &&
      Array.isArray(previous) === array && Object.keys(previous).length === keys.length;
    var result = reusable ? null : array ? [] : {};
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var hadKey = reusable && Object.prototype.hasOwnProperty.call(previous, key);
      var before = hadKey ? previous[key] : undefined;
      var child = value[key];
      var next = child === null || typeof child !== 'object' && typeof child !== 'function'
        ? child : snapshot(child, seen, before);
      if (result === null && (!hadKey || !Object.is(before, next))) {
        result = array ? [] : {};
        // Earlier entries are already equal to their detached snapshots.
        for (var copied = 0; copied < index; copied += 1) {
          var copiedKey = keys[copied];
          result[copiedKey] = previous[copiedKey];
        }
      }
      if (result !== null) result[key] = next;
    }
    seen.delete(value);
    return result === null ? previous : result;
  }

  /// Applies changed construction inputs without replacing the mounted node handle.
  function reconcile(entry, next) {
    var nextValue = read(next);
    var previous = entry.initialized ? read(entry.value) : null;
    if (previous && previous.type === nextValue.type && previous.props.key === nextValue.props.key) {
      if (!OperitComposeRetained.equal(previous.props, nextValue.props)) entry.value.props = nextValue.props;
      if (!OperitComposeRetained.equal(previous.children, nextValue.children)) entry.value.children = nextValue.children;
      if (!OperitComposeRetained.equal(previous.slots, nextValue.slots)) {
        if (Object.prototype.hasOwnProperty.call(nextValue, 'slots')) entry.value.slots = nextValue.slots;else delete entry.value.slots;
      }
    } else entry.value = next;
    entry.initialized = true;
    return entry.value;
  }

  /// Builds a node only when its normalized construction inputs actually changed.
  function evaluate(entry, args, factory) {
    var values = snapshot(args, new Set(), entry.templateFactory ? undefined : entry.args);
    if (!entry.initialized || entry.templateFactory || entry.args !== values) {
      reconcile(entry, factory.apply(undefined, values));
      entry.args = values;
      entry.templateFactory = null;
    }
    return entry.value;
  }

  /// Compares a compiler-owned flat vector without enumerating fixed property names.
  function templateValues(values, previous) {
    var reusable = previous && previous.length === values.length;
    var result = reusable ? null : new Array(values.length);
    var seen;
    for (var index = 0; index < values.length; index += 1) {
      var value = values[index];
      var before = reusable ? previous[index] : undefined;
      var next = value;
      if (typeof value === 'function') next = snapshot(value, undefined, before);
      else if (value !== null && typeof value === 'object' && !nodes.has(value)) {
        if (!seen) seen = new Set();
        next = snapshot(value, seen, before);
      }
      if (result === null && !Object.is(next, before)) result = previous.slice();
      if (result !== null) result[index] = next;
    }
    return result === null ? previous : result;
  }
  var emptyTemplateValues = [];

  /// Keeps fixed UI structure in its compiled factory and snapshots only dynamic values.
  function evaluateTemplate(entry, ctx, values, factory) {
    var next = templateValues(values || emptyTemplateValues, entry.templateFactory === factory ? entry.args : undefined);
    if (!entry.initialized || entry.templateFactory !== factory || entry.args !== next) {
      reconcile(entry, factory(ctx, next));
      entry.args = next;
      entry.templateFactory = factory;
    }
    return entry.value;
  }

  /// Retains one compiled template for each call-site occurrence in an opaque root.
  function template(ctx, site, values, factory) {
    return evaluateTemplate(scope(ctx, site), ctx, values, factory);
  }

  /// Evaluates effectful arguments in source order while retaining unchanged node construction.
  function node(ctx, site, args, factory) {
    return evaluate(scope(ctx, site), args, factory);
  }

  /// Skips a pure leaf expression before argument construction when its lexical inputs are unchanged.
  function leaf(ctx, site, deps, argumentsFactory, factory) {
    var entry = scope(ctx, site);
    var primitiveInputs = deps.every(function (value) {
      return value === null || typeof value !== 'object' && typeof value !== 'function';
    });
    if (primitiveInputs && entry.initialized && OperitComposeRetained.equal(entry.deps, deps)) return entry.value;
    // Object dependencies cannot take this fast path: read actual arguments
    // below instead of allocating an unused deep snapshot of their contents.
    entry.deps = primitiveInputs ? deps.slice() : null;
    return evaluate(entry, argumentsFactory(), factory);
  }
  return {
    memo: memo,
    memoItem: memoItem,
    created: created,
    evaluate: evaluate,
    evaluateTemplate: evaluateTemplate,
    template: template,
    observeNode: observeNode,
    read: read,
    watch: watch,
    rebind: rebind,
    owns: owns,
    attach: attach,
    begin: begin,
    end: end,
    node: node,
    leaf: leaf
  };
}();
