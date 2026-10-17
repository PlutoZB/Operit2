//! Native offline ABI; all target selection remains behind platform_runtime.
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use operit_host_data_rescue::{NativeRescueSession, StorageLease};
use serde_json::{json, Value};

static RUNTIME_LEASE: OnceLock<Mutex<Option<StorageLease>>> = OnceLock::new();
static RESCUE_SESSION: OnceLock<Mutex<Option<NativeRescueSession>>> = OnceLock::new();

/// Executes an offline maintenance command and preserves structured diagnostics at the ABI boundary.
pub fn execute(default_runtime: PathBuf, encoded: &str) -> String {
    let result = serde_json::from_str(encoded).map_err(|error| error.to_string())
        .and_then(|request| dispatch(default_runtime, request));
    match result {
        Ok(value) => json!({"ok": true, "value": value}).to_string(),
        Err(error) => json!({"ok": false, "error": error}).to_string(),
    }
}

/// Separates process access leases from exclusive rescue sessions before touching any business state.
fn dispatch(default_runtime: PathBuf, request: Value) -> Result<Value, String> {
    if request["operation"] == "launchMode" { return Ok(json!({"rescue": false})); }
    if request["operation"] == "runtimeLease" {
        let mut lease = RUNTIME_LEASE.get_or_init(|| Mutex::new(None)).lock().map_err(|error| error.to_string())?;
        if lease.is_none() { *lease = Some(StorageLease::acquire(&default_runtime, false)?); }
        return Ok(Value::Null);
    }
    if request["operation"] == "stopNormalProcess" {
        return Err("The current platform does not expose a process-stop operation through the rescue ABI".into());
    }
    let mut session = RESCUE_SESSION.get_or_init(|| Mutex::new(None)).lock().map_err(|error| error.to_string())?;
    match request["operation"].as_str() {
        Some("open") => {
            if session.is_none() {
                let secrets = crate::PlatformRuntimeFactory::rescue_secret_store(&default_runtime)?;
                *session = Some(NativeRescueSession::open(default_runtime, secrets)?);
            }
            session.as_ref().ok_or("Maintenance session is unavailable")?.describe_startup()
        }
        Some("close") => { *session = None; Ok(Value::Null) }
        _ => session.as_mut().ok_or("Open an exclusive maintenance session first")?.execute(request),
    }
}
