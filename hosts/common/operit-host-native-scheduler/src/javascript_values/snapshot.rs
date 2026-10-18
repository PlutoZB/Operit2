//! Strict tool-parameter snapshot, one-shot ownership transfer and bounded buffer reuse.
use super::{JsonIntrinsics, MAX_DEPTH, MAX_NODES};
use rquickjs::{object::Property, qjs, Ctx, Exception, Function, Object, Value};
use serde_json::{Map, Number, Value as JsonValue};

/// Reuses allocations after a result has been fully materialized in QuickJS.
/// This holds no JS values. Retained buffers are never used as cached results:
/// every snapshot rereads the input and replaces every field. Retention is bounded
/// to one MiB per engine.
#[derive(Default)]
pub(super) struct JsonScratch {
    pub(super) strings: [Vec<String>; 13],
    objects: [Vec<(Map<String, JsonValue>, usize)>; 17],
    pub(super) arrays: Vec<Vec<JsonValue>>,
    pub(super) bytes: usize,
}
impl JsonScratch {
    pub(super) const LIMIT: usize = 1024 * 1024;
    fn string(&mut self, text: &str) -> String {
        let class = text
            .len()
            .max(1)
            .checked_next_power_of_two()
            .map(usize::trailing_zeros)
            .unwrap_or(usize::MAX as u32) as usize;
        if let Some(pool) = self.strings.get_mut(class) {
            if let Some(mut value) = pool.pop() {
                self.bytes -= value.capacity() + 48;
                value.clear();
                value.push_str(text);
                return value;
            }
        }
        text.to_owned()
    }
    fn object(&mut self, length: usize) -> Map<String, JsonValue> {
        if let Some((value, bytes)) = self.objects.get_mut(length).and_then(Vec::pop) {
            self.bytes -= bytes;
            value
        } else {
            Map::new()
        }
    }
    fn array(&mut self, length: usize) -> Vec<JsonValue> {
        let mut value = self
            .arrays
            .pop()
            .map(|value| {
                self.bytes -= value.capacity() * std::mem::size_of::<JsonValue>() + 48;
                value
            })
            .unwrap_or_default();
        value.resize_with(length, || JsonValue::Null);
        value
    }
    fn reserve(&mut self, bytes: usize) -> bool {
        if bytes <= Self::LIMIT.saturating_sub(self.bytes) {
            self.bytes += bytes;
            true
        } else {
            false
        }
    }
    fn recycle(&mut self, value: JsonValue) {
        match value {
            JsonValue::String(value) => {
                let capacity = value.capacity();
                let class = capacity
                    .max(1)
                    .checked_next_power_of_two()
                    .map(usize::trailing_zeros)
                    .unwrap_or(usize::MAX as u32) as usize;
                if class < self.strings.len() && self.reserve(capacity + 48) {
                    self.strings[class].push(value);
                }
            }
            JsonValue::Array(mut values) => {
                for value in &mut values {
                    self.recycle(std::mem::take(value));
                }
                if self.reserve(values.capacity() * std::mem::size_of::<JsonValue>() + 48) {
                    self.arrays.push(values);
                }
            }
            JsonValue::Object(mut values) => {
                let mut key_bytes = 0;
                for (key, value) in values.iter_mut() {
                    key_bytes += key.capacity();
                    self.recycle(std::mem::take(value));
                }
                // Budget BTreeMap node slack and twice the pool slot size.
                let bytes = 768 * (1 + values.len() / 5) + key_bytes + 64;
                if values.len() < self.objects.len() && self.reserve(bytes) {
                    self.objects[values.len()].push((values, bytes));
                }
            }
            _ => {}
        }
    }
}

/// A private transport capsule. Rust owns the request tree; the JS object only
/// carries its lifetime until the host callback takes ownership exactly once.
struct OwnedJson {
    value: std::cell::RefCell<Option<JsonValue>>,
    nodes: usize,
    depth: usize,
}

unsafe impl<'js> rquickjs::JsLifetime<'js> for OwnedJson {
    type Changed<'to> = OwnedJson;
}
impl<'js> rquickjs::class::Trace<'js> for OwnedJson {
    fn trace<'a>(&self, _: rquickjs::class::Tracer<'a, 'js>) {}
}
impl<'js> rquickjs::class::JsClass<'js> for OwnedJson {
    const NAME: &'static str = "OperitOwnedJson";
    type Mutable = rquickjs::class::Readable;
    fn prototype(_: &Ctx<'js>) -> rquickjs::Result<Option<Object<'js>>> {
        Ok(None)
    }
    fn constructor(_: &Ctx<'js>) -> rquickjs::Result<Option<rquickjs::function::Constructor<'js>>> {
        Ok(None)
    }
}

/// Holds the engine's own-key snapshot, releasing every atom even on rejection.
struct OwnPropertyNames {
    ctx: *mut qjs::JSContext,
    pointer: *mut qjs::JSPropertyEnum,
    len: u32,
}
impl Drop for OwnPropertyNames {
    fn drop(&mut self) {
        // SAFETY: this table and its atoms were allocated by this same context.
        unsafe { qjs::JS_FreePropertyEnum(self.ctx, self.pointer, self.len) }
    }
}

impl JsonIntrinsics {
    /// Captures a strict request directly into its final Rust-owned representation.
    /// No intermediate JS tree, JSON text or address supplied by the plugin is used.
    pub(super) fn snapshot_owned<'js>(
        &self,
        ctx: &Ctx<'js>,
        value: Value<'js>,
    ) -> rquickjs::Result<Value<'js>> {
        if !value.is_object() || value.is_array() {
            return Err(Exception::throw_type(
                ctx,
                "Tool parameters must be a JSON object",
            ));
        }
        let mut reader = PlainDataReader {
            ctx,
            intrinsics: self,
            prototype: self.plain_prototype.clone().restore(ctx)?,
            ancestors: Vec::new(),
            keys: Default::default(),
            nodes: 0,
            depth: 0,
            scratch: self.scratch.take(),
        };
        let value = reader.read(value.as_raw(), 0);
        *self.scratch.borrow_mut() = std::mem::take(&mut reader.scratch);
        let value = value?;
        if !value.is_object() {
            return Err(Exception::throw_type(
                ctx,
                "Tool parameters must be a JSON object",
            ));
        }
        let nodes = reader.nodes;
        let max_depth = reader.depth;
        let capsule = rquickjs::Class::instance(
            ctx.clone(),
            OwnedJson {
                value: std::cell::RefCell::new(Some(value)),
                nodes,
                depth: max_depth,
            },
        )?;
        // SAFETY: capsule is a live host-owned class object.
        self.owned_class.set(Some(unsafe {
            qjs::JS_GetClassID(capsule.as_value().as_raw())
        }));
        Ok(capsule.into_value())
    }

    pub(crate) fn recycle_result(&self, value: JsonValue) {
        self.scratch.borrow_mut().recycle(value);
    }

    pub(super) fn take_owned<'js>(
        &self,
        ctx: &Ctx<'js>,
        value: &Value<'js>,
        nodes: &mut usize,
        depth: usize,
    ) -> rquickjs::Result<Option<JsonValue>> {
        if !value.is_object()
            || self.owned_class.get() != Some(unsafe { qjs::JS_GetClassID(value.as_raw()) })
        {
            return Ok(None);
        }
        let Some(capsule) = value
            .as_object()
            .and_then(|object| object.as_class::<OwnedJson>())
        else {
            return Ok(None);
        };
        let capsule = capsule.borrow();
        if nodes.saturating_add(capsule.nodes.saturating_sub(1)) > MAX_NODES
            || depth.saturating_add(capsule.depth) > MAX_DEPTH
        {
            return Err(Exception::throw_range(
                ctx,
                "Tool request exceeds structured depth/node limit",
            ));
        }
        *nodes += capsule.nodes.saturating_sub(1);
        let result = capsule.value.borrow_mut().take().map(Some).ok_or_else(|| {
            Exception::throw_type(ctx, "Owned tool parameters have already been consumed")
        });
        result
    }
}

/// Reads directly from live engine handles. One reader owns the traversal budget,
/// ancestor stack and interned field names for the whole request.
struct PlainDataReader<'a, 'js> {
    ctx: &'a Ctx<'js>,
    intrinsics: &'a JsonIntrinsics,
    prototype: Value<'js>,
    ancestors: Vec<qjs::JSValue>,
    keys: std::collections::BTreeMap<qjs::JSAtom, std::rc::Rc<str>>,
    scratch: JsonScratch,
    nodes: usize,
    depth: usize,
}
impl Drop for PlainDataReader<'_, '_> {
    fn drop(&mut self) {
        for atom in self.keys.keys() {
            unsafe { qjs::JS_FreeAtom(self.ctx.as_raw().as_ptr(), *atom) }
        }
    }
}
struct PropertyValueGuard {
    ctx: *mut qjs::JSContext,
    descriptor: qjs::JSPropertyDescriptor,
}
impl Drop for PropertyValueGuard {
    fn drop(&mut self) {
        // GetOwnProperty transfers these handles, including on an accessor.
        unsafe {
            qjs::JS_FreeValue(self.ctx, self.descriptor.value);
            qjs::JS_FreeValue(self.ctx, self.descriptor.getter);
            qjs::JS_FreeValue(self.ctx, self.descriptor.setter);
        }
    }
}
impl<'a, 'js> PlainDataReader<'a, 'js> {
    fn text(&mut self, value: qjs::JSValue) -> rquickjs::Result<String> {
        let ctx = self.ctx.as_raw().as_ptr();
        let mut length = 0;
        // SAFETY: value is live; the engine CString is released after copying.
        let pointer = unsafe { qjs::JS_ToCStringLen(ctx, &mut length, value) };
        if pointer.is_null() {
            return Err(rquickjs::Error::Exception);
        }
        let bytes = unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), length) };
        let result = std::str::from_utf8(bytes)
            .map(|text| self.scratch.string(text))
            .map_err(rquickjs::Error::from);
        unsafe { qjs::JS_FreeCString(ctx, pointer) };
        result
    }

    fn key(&mut self, atom: qjs::JSAtom) -> rquickjs::Result<std::rc::Rc<str>> {
        if let Some(key) = self.keys.get(&atom) {
            return Ok(key.clone());
        }
        let ctx = self.ctx.as_raw().as_ptr();
        let value = unsafe { qjs::JS_AtomToValue(ctx, atom) };
        if unsafe { qjs::JS_IsException(value) } {
            return Err(rquickjs::Error::Exception);
        }
        let result = if unsafe { qjs::JS_IsString(value) } {
            self.text(value)
        } else {
            Err(Exception::throw_type(
                self.ctx,
                "Tool request contains a non-JSON key",
            ))
        };
        unsafe { qjs::JS_FreeValue(ctx, value) };
        let key: std::rc::Rc<str> = result?.into();
        unsafe { qjs::JS_DupAtom(ctx, atom) };
        self.keys.insert(atom, key.clone());
        Ok(key)
    }

    /// Reads one JSON-compatible value while validating its properties and array shape.
    fn read(&mut self, value: qjs::JSValue, depth: usize) -> rquickjs::Result<JsonValue> {
        self.nodes += 1;
        self.depth = self.depth.max(depth);
        if self.nodes > MAX_NODES || depth > MAX_DEPTH {
            return Err(Exception::throw_range(
                self.ctx,
                "Tool request exceeds structured depth/node limit",
            ));
        }
        // SAFETY: callers retain every input handle until read returns. Only
        // primitives are inspected here; no script or coercing getter runs.
        unsafe {
            if qjs::JS_IsNull(value) {
                return Ok(JsonValue::Null);
            }
            if qjs::JS_IsBool(value) {
                return Ok(JsonValue::Bool(qjs::JS_VALUE_GET_INT(value) != 0));
            }
            if qjs::JS_IsInt(value) {
                let number = qjs::JS_VALUE_GET_INT(value);
                return Ok(JsonValue::Number(if number < 0 {
                    Number::from(number as i64)
                } else {
                    Number::from(number as u64)
                }));
            }
            if qjs::JS_IsNumber(value) {
                let number = qjs::JS_VALUE_GET_FLOAT64(value);
                if number.is_finite() {
                    if number.fract() == 0.0 && number.abs() <= 9_007_199_254_740_991.0 {
                        return Ok(JsonValue::Number(if number < 0.0 {
                            Number::from(number as i64)
                        } else {
                            Number::from(number as u64)
                        }));
                    }
                    if number.fract() != 0.0 {
                        return Ok(JsonValue::Number(Number::from_f64(number).unwrap()));
                    }
                    // Preserve the existing decimal semantics for large integers.
                    let owned = Value::from_raw(
                        self.ctx.clone(),
                        qjs::JS_DupValue(self.ctx.as_raw().as_ptr(), value),
                    );
                    return self
                        .intrinsics
                        .from_js(self.ctx, owned)?
                        .ok_or(rquickjs::Error::Unknown);
                }
            }
            if qjs::JS_IsString(value) {
                return self.text(value).map(JsonValue::String);
            }
            if !qjs::JS_IsObject(value) {
                return Err(Exception::throw_type(
                    self.ctx,
                    "Tool request contains a non-JSON value",
                ));
            }
        }
        let ctx = self.ctx.as_raw().as_ptr();
        if self.intrinsics.owned_class.get() == Some(unsafe { qjs::JS_GetClassID(value) }) {
            let value = unsafe { Value::from_raw(self.ctx.clone(), qjs::JS_DupValue(ctx, value)) };
            if let Some(value) =
                self.intrinsics
                    .take_owned(self.ctx, &value, &mut self.nodes, depth)?
            {
                return Ok(value);
            }
        }
        let proxy = unsafe { qjs::JS_IsProxy(value) };
        let array = unsafe { qjs::JS_IsArray(value) }
            || (proxy && {
                let value =
                    unsafe { Value::from_raw(self.ctx.clone(), qjs::JS_DupValue(ctx, value)) };
                self.intrinsics
                    .is_array
                    .clone()
                    .restore(self.ctx)?
                    .call::<_, bool>((value,))?
            });
        if !array {
            let prototype = unsafe { qjs::JS_GetPrototype(ctx, value) };
            if unsafe { qjs::JS_IsException(prototype) } {
                return Err(rquickjs::Error::Exception);
            }
            let plain = unsafe {
                qjs::JS_IsNull(prototype)
                    || (qjs::JS_IsObject(prototype)
                        && qjs::JS_VALUE_GET_PTR(prototype)
                            == qjs::JS_VALUE_GET_PTR(self.prototype.as_raw()))
            };
            unsafe { qjs::JS_FreeValue(ctx, prototype) };
            if !plain {
                return Err(Exception::throw_type(
                    self.ctx,
                    "Tool request contains a non-JSON value",
                ));
            }
        }
        if self.ancestors.iter().any(|ancestor| unsafe {
            qjs::JS_VALUE_GET_PTR(*ancestor) == qjs::JS_VALUE_GET_PTR(value)
        }) {
            return Err(Exception::throw_type(
                self.ctx,
                "Tool request contains a cyclic value",
            ));
        }
        let mut pointer = std::ptr::null_mut();
        let mut len = 0;
        if unsafe {
            qjs::JS_GetOwnPropertyNames(
                ctx,
                &mut pointer,
                &mut len,
                value,
                (qjs::JS_GPN_STRING_MASK | qjs::JS_GPN_SYMBOL_MASK) as _,
            )
        } < 0
        {
            return Err(rquickjs::Error::Exception);
        }
        let names = OwnPropertyNames { ctx, pointer, len };
        let length = if array {
            let mut length = 0;
            if unsafe { qjs::JS_GetLength(ctx, value, &mut length) } < 0 {
                return Err(rquickjs::Error::Exception);
            }
            usize::try_from(length)
                .map_err(|_| Exception::throw_type(self.ctx, "Invalid tool array length"))?
        } else {
            0
        };
        if array && (length > MAX_NODES.saturating_sub(self.nodes) || len as usize != length + 1) {
            return Err(Exception::throw_type(
                self.ctx,
                "Tool request contains non-JSON array properties",
            ));
        }
        self.ancestors.push(value);
        let mut items = if array {
            Map::new()
        } else {
            self.scratch.object(len as usize)
        };
        let mut elements = if array {
            self.scratch.array(length)
        } else {
            Vec::new()
        };
        let mut offset = 0;
        for index in 0..names.len {
            let atom = unsafe { (*names.pointer.add(index as usize)).atom };
            if array && atom == qjs::JS_ATOM_length as qjs::JSAtom {
                continue;
            }
            let position = if array && !proxy {
                let expected = unsafe { qjs::JS_NewAtomUInt32(ctx, offset) };
                let valid = atom == expected;
                unsafe { qjs::JS_FreeAtom(ctx, expected) };
                if !valid {
                    return Err(Exception::throw_type(
                        self.ctx,
                        "Tool request contains a non-JSON array hole or property",
                    ));
                }
                let position = offset as usize;
                offset += 1;
                Some(position)
            } else {
                None
            };
            let key = if position.is_none() {
                Some(self.key(atom)?)
            } else {
                None
            };
            let mut descriptor = std::mem::MaybeUninit::<qjs::JSPropertyDescriptor>::uninit();
            let found =
                unsafe { qjs::JS_GetOwnProperty(ctx, descriptor.as_mut_ptr(), value, atom) };
            if found < 0 {
                return Err(rquickjs::Error::Exception);
            }
            if found == 0 {
                return Err(Exception::throw_type(
                    self.ctx,
                    "Tool request contains a non-JSON property",
                ));
            }
            let guard = PropertyValueGuard {
                ctx,
                descriptor: unsafe { descriptor.assume_init() },
            };
            if guard.descriptor.flags & qjs::JS_PROP_ENUMERABLE as i32 == 0
                || guard.descriptor.flags & qjs::JS_PROP_GETSET as i32 != 0
            {
                return Err(Exception::throw_type(
                    self.ctx,
                    "Tool request contains a non-JSON property",
                ));
            }
            let element = self.read(guard.descriptor.value, depth + 1)?;
            if array {
                let position = match position {
                    Some(position) => position,
                    None => {
                        let key = key.as_ref().unwrap();
                        key.parse::<usize>()
                            .ok()
                            .filter(|position| {
                                *position < length && position.to_string() == key.as_ref()
                            })
                            .ok_or_else(|| {
                                Exception::throw_type(
                                    self.ctx,
                                    "Tool request contains a non-JSON array hole or property",
                                )
                            })?
                    }
                };
                elements[position] = element;
            } else {
                let key = key.unwrap();
                if let Some(slot) = items.get_mut(key.as_ref()) {
                    *slot = element;
                } else {
                    items.insert(key.to_string(), element);
                }
            }
        }
        if !array && items.len() != names.len as usize {
            let mut current = Vec::with_capacity(names.len as usize);
            for index in 0..names.len {
                current.push(self.key(unsafe { (*names.pointer.add(index as usize)).atom })?);
            }
            items.retain(|key, _| current.iter().any(|name| name.as_ref() == key));
        }
        self.ancestors.pop();
        Ok(if array {
            JsonValue::Array(elements)
        } else {
            JsonValue::Object(items)
        })
    }
}

/// Installs the host's mandatory request snapshot operation. The closure keeps
/// only a weak converter reference, so dropping a realm releases all payloads.
pub(crate) fn install_owned_snapshot<'js>(
    ctx: &Ctx<'js>,
    intrinsics: std::rc::Weak<std::cell::RefCell<Option<JsonIntrinsics>>>,
) -> rquickjs::Result<()> {
    let function = Function::new(ctx.clone(), move |ctx: Ctx<'js>, value: Value<'js>| {
        let intrinsics = intrinsics.upgrade().ok_or(rquickjs::Error::Unknown)?;
        let guard = intrinsics.borrow();
        guard
            .as_ref()
            .ok_or(rquickjs::Error::Unknown)?
            .snapshot_owned(&ctx, value)
    })?;
    ctx.globals()
        .prop("__operitHostSnapshotJsonObject", Property::from(function))
}
