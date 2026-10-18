//! Eager host-result conversion into ordinary, fully materialized JS values.
use super::{MAX_DEPTH, MAX_NODES};
use rquickjs::{qjs, Ctx, Exception, Value};
use serde_json::Value as JsonValue;

/// Owns the atoms reused throughout a single result conversion. Repeated row
/// schemas intern each field once instead of constructing atoms per cell.
struct ResultWriter<'a, 'js> {
    ctx: &'a Ctx<'js>,
    atoms: Vec<(&'a str, qjs::JSAtom)>,
    extra_atoms: std::collections::HashMap<&'a str, qjs::JSAtom>,
    strings: Vec<(&'a str, qjs::JSValue)>,
    extra_strings: std::collections::HashMap<&'a str, qjs::JSValue>,
    nodes: usize,
}
impl Drop for ResultWriter<'_, '_> {
    fn drop(&mut self) {
        for value in self
            .strings
            .iter()
            .map(|(_, value)| value)
            .chain(self.extra_strings.values())
        {
            unsafe { qjs::JS_FreeValue(self.ctx.as_raw().as_ptr(), *value) }
        }
        for atom in self
            .atoms
            .iter()
            .map(|(_, atom)| atom)
            .chain(self.extra_atoms.values())
        {
            // SAFETY: each atom is owned by this conversion and its live context.
            unsafe { qjs::JS_FreeAtom(self.ctx.as_raw().as_ptr(), *atom) }
        }
    }
}
impl<'a, 'js> ResultWriter<'a, 'js> {
    fn write(&mut self, value: &'a JsonValue, depth: usize) -> rquickjs::Result<qjs::JSValue> {
        self.nodes += 1;
        if depth > MAX_DEPTH || self.nodes > MAX_NODES {
            return Err(Exception::throw_range(
                self.ctx,
                "Tool result exceeds structured bridge depth/node limit",
            ));
        }
        let ctx = self.ctx.as_raw().as_ptr();
        // SAFETY: all handles here belong to ctx. Scalars return owned handles;
        // a container is released on every error and transferred on success.
        let result = unsafe {
            match value {
                JsonValue::Null => qjs::JS_NULL,
                JsonValue::Bool(value) => {
                    if *value {
                        qjs::JS_TRUE
                    } else {
                        qjs::JS_FALSE
                    }
                }
                JsonValue::Number(value) => qjs::JS_NewFloat64(value.as_f64().unwrap_or(f64::NAN)),
                JsonValue::String(value) => {
                    if depth == 0 {
                        return {
                            let text =
                                qjs::JS_NewStringLen(ctx, value.as_ptr().cast(), value.len() as _);
                            if qjs::JS_IsException(text) {
                                Err(rquickjs::Error::Exception)
                            } else {
                                Ok(text)
                            }
                        };
                    }
                    if let Some(cached) = self
                        .strings
                        .iter()
                        .find(|(text, _)| *text == value.as_str())
                        .map(|(_, value)| value)
                        .or_else(|| self.extra_strings.get(value.as_str()))
                    {
                        qjs::JS_DupValue(ctx, *cached)
                    } else {
                        let text =
                            qjs::JS_NewStringLen(ctx, value.as_ptr().cast(), value.len() as _);
                        if qjs::JS_IsException(text) {
                            return Err(rquickjs::Error::Exception);
                        }
                        if self.strings.len() < 16 {
                            self.strings.push((value.as_str(), text));
                        } else {
                            self.extra_strings.insert(value.as_str(), text);
                        }
                        qjs::JS_DupValue(ctx, text)
                    }
                }
                JsonValue::Array(values) => {
                    // Most nested arrays (tags, coordinates, options) fit on the
                    // stack. Only a large array needs an intermediate Vec.
                    if values.len() <= 16 {
                        let mut elements = [qjs::JS_UNDEFINED; 16];
                        for (index, value) in values.iter().enumerate() {
                            elements[index] = match self.write(value, depth + 1) {
                                Ok(value) => value,
                                Err(error) => {
                                    for value in &elements[..index] {
                                        qjs::JS_FreeValue(ctx, *value);
                                    }
                                    return Err(error);
                                }
                            };
                        }
                        qjs::JS_NewArrayFrom(ctx, values.len() as _, elements.as_ptr())
                    } else {
                        let elements = self.elements(values.iter(), depth)?;
                        // NewArrayFrom consumes handles on success AND failure.
                        qjs::JS_NewArrayFrom(ctx, elements.len() as _, elements.as_ptr())
                    }
                }
                JsonValue::Object(values) => {
                    let object = qjs::JS_NewObject(ctx);
                    if qjs::JS_IsException(object) {
                        return Err(rquickjs::Error::Exception);
                    }
                    for (key, value) in values {
                        let atom = if let Some(atom) = self
                            .atoms
                            .iter()
                            .find(|(name, _)| *name == key.as_str())
                            .map(|(_, atom)| atom)
                            .or_else(|| self.extra_atoms.get(key.as_str()))
                        {
                            *atom
                        } else {
                            let atom = qjs::JS_NewAtomLen(ctx, key.as_ptr().cast(), key.len() as _);
                            if atom == qjs::JS_ATOM_NULL {
                                qjs::JS_FreeValue(ctx, object);
                                return Err(rquickjs::Error::Exception);
                            }
                            if self.atoms.len() < 16 {
                                self.atoms.push((key.as_str(), atom));
                            } else {
                                self.extra_atoms.insert(key.as_str(), atom);
                            }
                            atom
                        };
                        let element = match self.write(value, depth + 1) {
                            Ok(value) => value,
                            Err(error) => {
                                qjs::JS_FreeValue(ctx, object);
                                return Err(error);
                            }
                        };
                        if qjs::JS_DefinePropertyValue(
                            ctx,
                            object,
                            atom,
                            element,
                            (qjs::JS_PROP_C_W_E | qjs::JS_PROP_THROW) as _,
                        ) < 0
                        {
                            qjs::JS_FreeValue(ctx, object);
                            return Err(rquickjs::Error::Exception);
                        }
                    }
                    object
                }
            }
        };
        if unsafe { qjs::JS_IsException(result) } {
            Err(rquickjs::Error::Exception)
        } else {
            Ok(result)
        }
    }
    fn elements(
        &mut self,
        values: impl Iterator<Item = &'a JsonValue>,
        depth: usize,
    ) -> rquickjs::Result<Vec<qjs::JSValue>> {
        let mut elements = Vec::with_capacity(values.size_hint().0);
        for value in values {
            match self.write(value, depth + 1) {
                Ok(value) => elements.push(value),
                Err(error) => {
                    for value in elements {
                        unsafe {
                            qjs::JS_FreeValue(self.ctx.as_raw().as_ptr(), value);
                        }
                    }
                    return Err(error);
                }
            }
        }
        Ok(elements)
    }
}

/// Builds the result directly with engine handles, retaining a single Rust Ctx
/// wrapper at the root rather than cloning it for every field in every row.
pub(crate) fn to_js<'js>(ctx: &Ctx<'js>, value: &JsonValue) -> rquickjs::Result<Value<'js>> {
    let raw = ResultWriter {
        ctx,
        atoms: Default::default(),
        extra_atoms: Default::default(),
        strings: Default::default(),
        extra_strings: Default::default(),
        nodes: 0,
    }
    .write(value, 0)?;
    // SAFETY: writer transfers the result's owned root handle to this Value.
    Ok(unsafe { Value::from_raw(ctx.clone(), raw) })
}
