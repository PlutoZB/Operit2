//! Owned JSON-compatible values at the native engine boundary. No JSON text is
//! generated on the ordinary path. Only JS handles on the owner thread are used.
//!
//! General bindings retain JSON value semantics (`toJSON`, boxed values, dates).
//! Tool parameters use `snapshot` to validate plain data once and move its owned
//! Rust tree into the binding; `writer` eagerly creates ordinary JS results.
//! Engine allocation reuse is isolated in `javascript_allocator`.
use rquickjs::{
    convert::Coerced, function::This, qjs, Array, Ctx, Exception, FromJs, Function, IntoJs, Object,
    Persistent, Value,
};
use serde_json::{Map, Number, Value as JsonValue};

mod snapshot;
#[cfg(test)]
mod tests;
mod writer;

pub(crate) use snapshot::install_owned_snapshot;
use snapshot::JsonScratch;
pub(crate) use writer::to_js;

const MAX_DEPTH: usize = 128;
const MAX_NODES: usize = 1_000_000;

/// Captured intrinsics implement JSON's toJSON/unboxing rules even when globals
/// are subsequently replaced by a plugin. Class ids are discovered, not hardcoded.
pub(crate) struct JsonIntrinsics {
    prepare: Persistent<Function<'static>>,
    plain_prototype: Persistent<Value<'static>>,
    owned_class: std::cell::Cell<Option<qjs::JSClassID>>,
    scratch: std::cell::RefCell<JsonScratch>,
    boolean_value: Persistent<Function<'static>>,
    bigint_value: Persistent<Function<'static>>,
    classes: [qjs::JSClassID; 5],
    is_array: Persistent<Function<'static>>,
}

impl JsonIntrinsics {
    /// Captures the original conversion intrinsics before any plugin executes.
    pub(crate) fn new(ctx: &Ctx<'_>) -> rquickjs::Result<Self> {
        let wrappers: Array = ctx.eval(
            "[new Number(0), new String(''), new Boolean(false), Object(0n), new Proxy({}, {})]",
        )?;
        let mut classes = [0; 5];
        for (index, class) in classes.iter_mut().enumerate() {
            let value: Value = wrappers.get(index)?;
            // SAFETY: live object values belong to this context; GetClassID only
            // reads the object's class and neither consumes nor retains the value.
            *class = unsafe { qjs::JS_GetClassID(value.as_raw()) };
        }
        let prepare: Function = ctx.eval("(function(apply) { return function(value, key) { var f = value.toJSON; return typeof f === 'function' ? apply(f, value, [key]) : value; }; })(Reflect.apply)")?;
        let boolean_value: Function = ctx.eval("Boolean.prototype.valueOf")?;
        let bigint_value: Function = ctx.eval("BigInt.prototype.valueOf")?;
        let is_array: Function = ctx.eval("Array.isArray")?;
        Ok(Self {
            prepare: Persistent::save(ctx, prepare),
            plain_prototype: Persistent::save(ctx, ctx.eval::<Value, _>("Object.prototype")?),
            owned_class: std::cell::Cell::new(None),
            scratch: Default::default(),
            boolean_value: Persistent::save(ctx, boolean_value),
            bigint_value: Persistent::save(ctx, bigint_value),
            is_array: Persistent::save(ctx, is_array),
            classes,
        })
    }

    /// Converts one standalone JSON-compatible argument using bounded value semantics.
    pub(crate) fn from_js<'js>(
        &self,
        ctx: &Ctx<'js>,
        value: Value<'js>,
    ) -> rquickjs::Result<Option<JsonValue>> {
        let mut nodes = 0;
        self.convert(ctx, value, "", &mut Vec::new(), &mut nodes, 0)
    }

    /// Converts a complete host argument list under one shared depth and node budget.
    pub(crate) fn arguments_from_js<'js>(
        &self,
        ctx: &Ctx<'js>,
        arguments: Vec<Value<'js>>,
    ) -> rquickjs::Result<Vec<JsonValue>> {
        let mut nodes = 0;
        arguments
            .into_iter()
            .map(|value| {
                self.convert(ctx, value, "", &mut Vec::new(), &mut nodes, 0)?
                    .ok_or_else(|| {
                        Exception::throw_type(ctx, "Host arguments must be JSON-compatible values")
                    })
            })
            .collect()
    }

    /// Recursively normalizes an owned argument without using JSON text or evaluating callback source.
    fn convert<'js>(
        &self,
        ctx: &Ctx<'js>,
        mut value: Value<'js>,
        key: &str,
        stack: &mut Vec<Value<'js>>,
        nodes: &mut usize,
        depth: usize,
    ) -> rquickjs::Result<Option<JsonValue>> {
        *nodes += 1;
        if depth > MAX_DEPTH || *nodes > MAX_NODES {
            return Err(Exception::throw_range(
                ctx,
                "Tool parameters exceed structured bridge depth/node limit",
            ));
        }
        if let Some(owned) = self.take_owned(ctx, &value, nodes, depth)? {
            return Ok(Some(owned));
        }
        // SerializeJSONProperty: toJSON is called once, before unboxing and
        // before detecting an ancestor cycle. Primitive BigInts can have toJSON.
        if let Some(object) = value.as_object() {
            // Read with the engine API directly. The ordinary plain-data path
            // must not enter a JS helper for every object in a request tree.
            let to_json: Value = object.get("toJSON")?;
            if let Some(function) = to_json.as_function() {
                value = function.call((This(value.clone()), key))?;
            }
        } else if value.is_big_int() {
            value = self.prepare.clone().restore(ctx)?.call((value, key))?;
        }
        let mut proxy_array = false;
        if value.is_object() {
            // SAFETY: GetClassID receives a live object and does not retain it.
            let class = unsafe { qjs::JS_GetClassID(value.as_raw()) };
            if class == self.classes[4] {
                proxy_array = self.is_array.clone().restore(ctx)?.call((value.clone(),))?;
            }
            if class == self.classes[0] {
                value = Coerced::<f64>::from_js(ctx, value)?.0.into_js(ctx)?;
            } else if class == self.classes[1] {
                value = Coerced::<String>::from_js(ctx, value)?.0.into_js(ctx)?;
            } else if class == self.classes[2] {
                value = self
                    .boolean_value
                    .clone()
                    .restore(ctx)?
                    .call((This(value),))?;
            } else if class == self.classes[3] {
                value = self
                    .bigint_value
                    .clone()
                    .restore(ctx)?
                    .call((This(value),))?;
            }
        }
        if value.is_null() {
            return Ok(Some(JsonValue::Null));
        }
        if let Some(flag) = value.as_bool() {
            return Ok(Some(JsonValue::Bool(flag)));
        }
        if let Some(number) = value.as_number() {
            // JSON text represented integral JS numbers as integer tokens. Keep
            // that distinction for SDK tools using Value::as_u64/as_i64.
            let number = if number.is_finite() && number.fract() == 0.0 {
                if number.abs() <= 9_007_199_254_740_991.0 {
                    Some(if number < 0.0 {
                        Number::from(number as i64)
                    } else {
                        Number::from(number as u64)
                    })
                } else {
                    // Beyond JS's exact integer range, the old text protocol
                    // parsed the shortest decimal spelling, not an f64->u64
                    // cast. Preserve that rare scalar case without serializing
                    // the request tree or invoking a mutable JSON global.
                    let decimal = Coerced::<String>::from_js(ctx, value.clone())?.0;
                    Some(
                        decimal
                            .parse::<Number>()
                            .map_err(|error| Exception::throw_type(ctx, &error.to_string()))?,
                    )
                }
            } else {
                Number::from_f64(number)
            };
            return Ok(Some(
                number.map(JsonValue::Number).unwrap_or(JsonValue::Null),
            ));
        }
        if let Some(text) = value.as_string() {
            return Ok(Some(JsonValue::String(text.to_string()?)));
        }
        if value.is_big_int() {
            return Err(Exception::throw_type(
                ctx,
                "BigInt cannot be serialized in tool parameters",
            ));
        }
        if value.is_undefined() || value.is_symbol() || value.is_function() {
            return Ok(None);
        }
        let object = Object::from_js(ctx, value.clone())?;
        if stack.iter().any(|ancestor| ancestor == &value) {
            return Err(Exception::throw_type(
                ctx,
                "Converting circular structure to tool parameters",
            ));
        }
        stack.push(value.clone());
        let result = if value.is_array() || proxy_array {
            let array = value.as_array();
            let len = if let Some(array) = array {
                array.len()
            } else {
                // JSON's IsArray follows proxies; the low-level JS_IsArray does
                // not. Proxy length uses ToLength and may execute a get trap.
                let length: Coerced<f64> = object.get("length")?;
                if length.0.is_nan() || length.0 <= 0.0 {
                    0
                } else if length.0 > MAX_NODES as f64 {
                    MAX_NODES + 1
                } else {
                    length.0.floor() as usize
                }
            };
            if len > MAX_NODES.saturating_sub(*nodes) {
                return Err(Exception::throw_range(
                    ctx,
                    "Tool parameters exceed structured bridge node limit",
                ));
            }
            let mut items = Vec::with_capacity(len);
            for index in 0..len {
                let element: Value = if let Some(array) = array {
                    array.get(index)?
                } else {
                    object.get(index.to_string())?
                };
                items.push(
                    self.convert(ctx, element, &index.to_string(), stack, nodes, depth + 1)?
                        .unwrap_or(JsonValue::Null),
                );
            }
            JsonValue::Array(items)
        } else {
            // Snapshot enumerable own keys before invoking getters. This matches
            // JSON.stringify when a getter mutates sibling properties.
            // The iterator snapshots own keys on creation and reads each value
            // by its existing atom, avoiding a String -> atom lookup per field.
            let properties = object.props::<String, Value>();
            let mut items = Map::new();
            for property in properties {
                let (key, element) = property?;
                if let Some(element) = self.convert(ctx, element, &key, stack, nodes, depth + 1)? {
                    items.insert(key, element);
                }
            }
            JsonValue::Object(items)
        };
        stack.pop();
        Ok(Some(result))
    }
}
