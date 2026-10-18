/// Builds SDK nodes and separates child slots from JSON properties.
var OperitComposeNodes = function () {
  var actionProps = new WeakMap();

  function isComposeNodeLike(value) {
    return !!(value && typeof value === 'object' && value.__composeNode === true && typeof value.type === 'string');
  }
  function flattenComposeValue(value, out) {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        flattenComposeValue(value[i], out);
      }
      return;
    }
    if (isComposeNodeLike(value)) {
      out.push(value);
    }
  }
  function normalizeChildren(children) {
    var out = [];
    flattenComposeValue(children, out);
    return out;
  }
  function normalizeSlotChildren(value) {
    return normalizeChildren(value);
  }
  function normalizeSerializableValue(value, runtime, seen, state) {
    if (value == null) {
      return value;
    }
    if (typeof value === 'function') {
      state.hasActions = true;
      return runtime.actions.reference(value);
    }
    if (typeof value !== 'object') {
      return value;
    }
    if (seen.indexOf(value) >= 0) {
      return null;
    }
    seen.push(value);
    if (Array.isArray(value)) {
      var arr = [];
      for (var i = 0; i < value.length; i += 1) {
        arr.push(normalizeSerializableValue(value[i], runtime, seen, state));
      }
      seen.pop();
      return arr;
    }
    if (value.__modifierOps && Array.isArray(value.__modifierOps)) {
      seen.pop();
      return {
        __modifierOps: normalizeSerializableValue(value.__modifierOps, runtime, [], state)
      };
    }
    var out = {};
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        if (key === '__composeNode') {
          continue;
        }
        out[key] = normalizeSerializableValue(value[key], runtime, seen, state);
      }
    }
    seen.pop();
    return out;
  }
  function buildNode(runtime, type, props, children) {
    var rawProps = props && typeof props === 'object' && !Array.isArray(props) ? props : {};
    var nodeProps = {};
    var slots = {};
    var contentChildren = children;
    var normalizationState = { hasActions: false };
    for (var key in rawProps) {
      if (!Object.prototype.hasOwnProperty.call(rawProps, key)) {
        continue;
      }
      var value = rawProps[key];
      if (key === 'content' && typeof contentChildren === 'undefined') {
        contentChildren = value;
        continue;
      }
      // Most properties are scalars. Do not allocate traversal state or probe
      // node/array contracts for text, numbers, flags and absent properties.
      if (value === null || typeof value !== 'object' && typeof value !== 'function') {
        nodeProps[key] = value;
        continue;
      }
      if (isComposeNodeLike(value) || Array.isArray(value)) {
        var slotNodes = normalizeSlotChildren(value);
        if (slotNodes.length > 0) {
          slots[key] = slotNodes;
          continue;
        }
      }
      nodeProps[key] = normalizeSerializableValue(value, runtime, [], normalizationState);
    }
    var normalizedChildren = normalizeChildren(contentChildren);
    actionProps.set(nodeProps, normalizationState.hasActions);
    var node = {
      __composeNode: true,
      type: String(type || 'Box'),
      props: nodeProps,
      children: normalizedChildren
    };
    if (Object.keys(slots).length > 0) {
      node.slots = slots;
    }
    OperitComposeGeneration.created(runtime.ctx);
    return OperitComposeGeneration.observeNode(node);
  }
  /// Retains one factory per node type without changing the public registry shape.
  function createUiRegistry(runtime) {
    var factories = new Map();
    return new Proxy({}, {
      get: function (_target, prop) {
        if (typeof prop !== 'string') {
          return undefined;
        }
        if (!factories.has(prop)) {
          /// Builds nodes with one factory per type owned by this exact context.
          factories.set(prop, function (props, children) {
            return buildNode(runtime, prop, props, children);
          });
        }
        return factories.get(prop);
      }
    });
  }
  function createModifierProxy(ops) {
    var state = Array.isArray(ops) ? ops.slice() : [];
    function append(name, argsLike) {
      var args = Array.prototype.slice.call(argsLike || []);
      return createModifierProxy(state.concat([{
        name: name,
        args: args
      }]));
    }
    return new Proxy({
      __modifierOps: state
    }, {
      get: function (target, prop) {
        if (prop === '__modifierOps') {
          return target.__modifierOps;
        }
        if (prop === 'toJSON') {
          return function () {
            return {
              __modifierOps: target.__modifierOps
            };
          };
        }
        if (typeof prop !== 'string') {
          return undefined;
        }
        return function () {
          return append(prop, arguments);
        };
      }
    });
  }
  return {
    build: buildNode,
    hasActions: function (props) { return actionProps.get(props); },
    registry: createUiRegistry,
    modifier: createModifierProxy,
    serialize: normalizeSerializableValue
  };
}();
