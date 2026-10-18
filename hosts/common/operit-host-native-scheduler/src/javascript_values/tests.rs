use super::*;
use rquickjs::{Context, Runtime};

/// Captures one request before async work and transfers its tree only once.
#[test]
fn owned_snapshot_is_immutable_and_rejects_accessors_without_invoking_them() {
    let runtime =
        Runtime::new_with_alloc(crate::javascript_allocator::JavaScriptAllocator::default())
            .unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|ctx| {
        let intrinsics = std::rc::Rc::new(std::cell::RefCell::new(Some(JsonIntrinsics::new(&ctx).unwrap())));
        install_owned_snapshot(&ctx, std::rc::Rc::downgrade(&intrinsics)).unwrap();
        ctx.eval::<(), _>(r#"
            var request = {nested:{text:'before'},values:[1,2,3],['__proto__']:{safe:true}};
            var captured = __operitHostSnapshotJsonObject(request);
            request.nested.text='after';request.values.push(4);
            var getterCalls=0, rejected=0;
            for (var value of [
                {get value(){getterCalls++; return 1;}},
                {array:[,1]}, {array:Object.assign([1],{extra:2})},
                {hidden:Object.defineProperty({},'value',{value:1})},
                {value:undefined}, {value:NaN}, {value:new Date()},
                {value:Symbol('invalid')}, {value:1n}
            ]) { try { __operitHostSnapshotJsonObject(value); } catch (_) {rejected++;} }
            if (getterCalls!==0 || rejected!==9) throw Error('Strict snapshot contract changed');
        "#).unwrap();
        let captured: Value = ctx.globals().get("captured").unwrap();
        let guard = intrinsics.borrow();
        let converter = guard.as_ref().unwrap();
        let result = converter.from_js(&ctx, captured.clone()).unwrap().unwrap();
        assert_eq!(result, serde_json::json!({"nested":{"text":"before"},"values":[1,2,3],"__proto__":{"safe":true}}));
        assert!(converter.from_js(&ctx, captured).is_err());
        ctx.catch();
    });
}

/// Reusing host allocations must replace every field and remain independent
/// of caller mutations, changing schemas, empty values and reentrant proxies.
#[test]
fn recycled_snapshots_replace_all_data_and_bound_retained_memory() {
    let runtime =
        Runtime::new_with_alloc(crate::javascript_allocator::JavaScriptAllocator::default())
            .unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|ctx| {
        let intrinsics = std::rc::Rc::new(std::cell::RefCell::new(Some(JsonIntrinsics::new(&ctx).unwrap())));
        install_owned_snapshot(&ctx, std::rc::Rc::downgrade(&intrinsics)).unwrap();
        let requests = [
            r#"({old:1, rows:[{id:1,name:'first',tags:['a','b','c']},{id:2,name:'second',tags:[]}]})"#,
            r#"({next:2, rows:[{id:9,name:'updated',tags:['longer']}]})"#,
            r#"({rows:[],next:null})"#,
            r#"({rows:[{nested:{safe:true}}],['__proto__']:{safe:true}})"#,
            r#"({rows:[{},[],null,'',true],next:{other:3}})"#,
        ];
        for _ in 0..5 {
            for expression in requests {
                let value: Value = ctx.eval(expression).unwrap();
                let expected = intrinsics.borrow().as_ref().unwrap().from_js(&ctx, value.clone()).unwrap().unwrap();
                let captured = intrinsics.borrow().as_ref().unwrap().snapshot_owned(&ctx, value).unwrap();
                let result = intrinsics.borrow().as_ref().unwrap().from_js(&ctx, captured).unwrap().unwrap();
                assert_eq!(result, expected, "{expression}");
                // A normal tool response wraps its payload before recycling.
                intrinsics.borrow().as_ref().unwrap().recycle_result(serde_json::json!({"success":true,"data":result}));
            }
        }
        let captured: Value = ctx.eval(r#"__operitHostSnapshotJsonObject(new Proxy({value:1},{ownKeys(t){ __operitHostSnapshotJsonObject({nested:1}); return Reflect.ownKeys(t); }}))"#).unwrap();
        assert_eq!(intrinsics.borrow().as_ref().unwrap().from_js(&ctx, captured).unwrap().unwrap(), serde_json::json!({"value":1}));
        let guard = intrinsics.borrow();
        let converter = guard.as_ref().unwrap();
        converter.recycle_result(JsonValue::Array((0..50_000).map(|_| JsonValue::Array(Vec::new())).collect()));
        converter.recycle_result(JsonValue::Array((0..50_000).map(|_| JsonValue::String(String::new())).collect()));
        let scratch = converter.scratch.borrow();
        assert!(scratch.bytes <= JsonScratch::LIMIT);
        assert!(scratch.arrays.len() * 48 <= JsonScratch::LIMIT);
        assert!(scratch.strings.iter().map(Vec::len).sum::<usize>() * 48 <= JsonScratch::LIMIT);
    });
}

/// Returned values support ordinary JS reads, writes, enumeration and sealing.
#[test]
fn returned_values_preserve_json_object_and_array_semantics() {
    let runtime =
        Runtime::new_with_alloc(crate::javascript_allocator::JavaScriptAllocator::default())
            .unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|ctx| {
        let intrinsics = std::rc::Rc::new(std::cell::RefCell::new(Some(JsonIntrinsics::new(&ctx).unwrap())));
        let result = to_js(&ctx, &serde_json::json!({
            "rows":[{"id":0,"name":"one"},{"id":1,"name":"two"}],
            "__proto__":{"safe":true}, "value":null,
        })).unwrap();
        ctx.globals().set("mapped", result).unwrap();
        ctx.eval::<(), _>(r#"
            if (!Array.isArray(mapped.rows) || mapped.rows.length!==2) throw Error('Array identity');
            if (mapped.rows['01']!==undefined || '01' in mapped.rows) throw Error('Noncanonical index');
            if (mapped.rows[0]!==mapped.rows[0] || mapped.rows[0].name!=='one') throw Error('Identity');
            if (!Object.hasOwn(mapped,'__proto__') || mapped.safe!==undefined || !mapped.__proto__.safe) throw Error('Prototype safety');
            var original=mapped.rows.map(value=>value.id).join(',');
            if (original!=='0,1') throw Error('Array iteration');
            mapped.rows[0].name='changed';
            delete mapped.rows[1].name;
            if ('name' in mapped.rows[1]) throw Error('Deleted field resurrected');
            mapped.rows[1].extra=true;
            var encoded=JSON.stringify(mapped.rows);
            if(encoded!=='[{"id":0,"name":"changed"},{"id":1,"extra":true}]') throw Error(encoded);
            mapped.rows.length=0; mapped.rows.length=2;
            if (0 in mapped.rows || mapped.rows[0]!==undefined) throw Error('Truncated row resurrected');
            mapped.rows[0]={id:7};
            Object.seal(mapped);
            if (!Object.isSealed(mapped) || mapped.rows[0].id!==7) throw Error('Seal');
            Object.freeze(mapped.rows);
            if (!Object.isFrozen(mapped.rows)) throw Error('Freeze');
        "#).unwrap();
        let mapped: Value = ctx.globals().get("mapped").unwrap();
        let result = intrinsics.borrow().as_ref().unwrap().from_js(&ctx, mapped).unwrap().unwrap();
        assert_eq!(result["rows"], serde_json::json!([{"id":7},null]));
        ctx.globals().set("mapped", Value::new_undefined(ctx.clone())).unwrap();
    });
    runtime.run_gc();
}

/// Measures the native halves independently without a task pool or a model.
#[test]
#[ignore = "manual release codec benchmark"]
fn owned_value_codec_benchmark() {
    let iterations: usize = std::env::var("OPERIT_JS_BRIDGE_BENCH_ITERATIONS")
        .unwrap()
        .parse()
        .unwrap();
    let runtime =
        Runtime::new_with_alloc(crate::javascript_allocator::JavaScriptAllocator::default())
            .unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|ctx| {
        let intrinsics = JsonIntrinsics::new(&ctx).unwrap();
        let value: Value = ctx.eval(r#"({rows:Array.from({length:256},(_,id)=>({id,name:'role-'+id,enabled:true,settings:{prompt:'x'.repeat(64),tags:['a','b','c']}}))})"#).unwrap();
        let data = intrinsics.from_js(&ctx, value.clone()).unwrap().unwrap();
        for mode in ["input", "output", "serde-copy"] {
            let mut times = Vec::new();
            for sample in 0..6 {
                let started = std::time::Instant::now();
                for _ in 0..iterations {
                    match mode {
                        "input" => { std::hint::black_box(intrinsics.snapshot_owned(&ctx, value.clone()).unwrap()); }
                        "output" => { std::hint::black_box(to_js(&ctx, &data).unwrap()); }
                        _ => { std::hint::black_box(serde_json::to_value(&data).unwrap()); }
                    }
                }
                if sample > 0 { times.push(started.elapsed().as_secs_f64() * 1e6 / iterations as f64); }
            }
            times.sort_by(f64::total_cmp);
            eprintln!("BRIDGE_CODEC rows=256 mode={mode} median_us_per_call={:.3}", times[2]);
        }
    });
}

#[test]
fn structured_parameters_match_json_stringify_semantics() {
    let runtime =
        Runtime::new_with_alloc(crate::javascript_allocator::JavaScriptAllocator::default())
            .unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|ctx| {
        let intrinsics = JsonIntrinsics::new(&ctx).unwrap();
        for expression in [
            "({text:'引号\\\"\\n\\u2028', flag:true, nil:null, integer:42, large:1e16})",
            "({rounded:18446744073709550000, negative:-9223372036854775808, exp:1e21, huge:1.79e308})",
            "({drop:undefined, fn:function(){}, symbol:Symbol('x'), nan:NaN, inf:Infinity})",
            "({array:[undefined, function(){}, Symbol('x'), NaN, , 5], nested:{a:1}})",
            "({date:new Date('2020-01-01T00:00:00Z'), n:new Number(3), s:new String('x'), b:new Boolean(false)})",
            "({value:{toJSON(key){return {key:key, text:'done'};}}})",
            "({value: (()=>{ var f=function(k){return k;}; f.call=null; return {toJSON:f}; })()})",
            "({a:1, get b(){delete this.a; this.c=3; return 2;}})",
            "({shared:(()=>{var a={v:2};return [a,a];})()})",
            "({__proto__:null, ['__proto__']:{polluted:true}, ['constructor']:'plain'})",
            "({boxed:(()=>{var n=new Number(3);n.valueOf=()=>5;return n;})()})",
            "({array:new Proxy([1,,3],{})})",
            "({array:new Proxy([1,2,3],{get(t,k){return k==='length'?2.9:Reflect.get(t,k);}})})",
            "({typed:new Uint8Array([1,2,3]), map:new Map([['x',1]])})",
            "({get a(){return undefined;}, get b(){return null;}})",
            "({value:{toJSON(){return function(){};}}})",
        ] {
            // Evaluate separately because getters can mutate the object.
            let expected: String = ctx.eval(format!("JSON.stringify({expression})")).unwrap();
            let value: Value = ctx.eval(expression).unwrap();
            let actual = intrinsics.from_js(&ctx, value).unwrap().unwrap();
            let expected: JsonValue = serde_json::from_str(&expected).unwrap();
            assert_eq!(actual, expected, "{expression}");
        }
    });
}

#[test]
fn cycles_bigints_getters_and_depth_are_rejected_without_poisoning_context() {
    let runtime =
        Runtime::new_with_alloc(crate::javascript_allocator::JavaScriptAllocator::default())
            .unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|ctx| {
        let intrinsics = JsonIntrinsics::new(&ctx).unwrap();
        for source in [
            "(()=>{let x={};x.self=x;return x;})()",
            "({value:1n})",
            "({value:Object(1n)})",
            "({get value(){throw new Error('getter failure');}})",
            "(()=>{let x={};for(let i=0;i<140;i++)x={x};return x;})()",
            "({value:new Array(1000001)})",
        ] {
            let value: Value = ctx.eval(source).unwrap();
            assert!(intrinsics.from_js(&ctx, value).is_err(), "{source}");
            ctx.catch();
            assert_eq!(ctx.eval::<i32, _>("1+1").unwrap(), 2);
        }
        let value: Value = ctx.eval("({value:{toJSON(){return 4;}}})").unwrap();
        assert_eq!(
            intrinsics.from_js(&ctx, value).unwrap(),
            Some(serde_json::json!({"value":4}))
        );
    });
}

#[test]
fn result_arrays_do_not_invoke_inherited_index_setters() {
    let runtime =
        Runtime::new_with_alloc(crate::javascript_allocator::JavaScriptAllocator::default())
            .unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|ctx| {
        ctx.eval::<(), _>("globalThis.setterCalls=0; Object.defineProperty(Array.prototype,'0',{set(){setterCalls++;},configurable:true});").unwrap();
        let result = to_js(&ctx, &serde_json::json!([7, {"nested":[8]}])).unwrap();
        ctx.globals().set("result", result).unwrap();
        assert_eq!(ctx.eval::<i32, _>("setterCalls").unwrap(), 0);
        assert!(ctx.eval::<bool, _>("Object.hasOwn(result,'0') && Object.hasOwn(result[1].nested,'0')").unwrap());
        assert_eq!(ctx.eval::<String, _>("JSON.stringify(result)").unwrap(), "[7,{\"nested\":[8]}]");
    });
}

#[test]
fn results_preserve_proto_keys_as_own_data_properties() {
    let runtime =
        Runtime::new_with_alloc(crate::javascript_allocator::JavaScriptAllocator::default())
            .unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|ctx| {
        let value = serde_json::json!({"__proto__":{"polluted":true}, "text":"\"\n\u{2028}中"});
        ctx.globals().set("result", to_js(&ctx, &value).unwrap()).unwrap();
        assert!(ctx.eval::<bool,_>("Object.getPrototypeOf(result)===Object.prototype && Object.hasOwn(result,'__proto__') && result.polluted===undefined").unwrap());
        let serialized: String = ctx.eval("JSON.stringify(result)").unwrap();
        assert_eq!(serde_json::from_str::<JsonValue>(&serialized).unwrap(), value);
    });
}
