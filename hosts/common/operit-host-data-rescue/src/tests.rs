use super::*;
use operit_host_api::HostResult;
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};

const PASSWORD: &str = "test rescue password 123";

/// Owns a unique test directory and removes only that exact directory after handles close.
struct Fixture(PathBuf);
impl Fixture {
    /// Creates a private, unique application data tree for one test.
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("operit-rescue-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }

    /// Creates one raw payload without using any database or normal bootstrap service.
    fn write(&self, path: &str, bytes: &[u8]) {
        let target = self.0.join(path);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(target, bytes).unwrap();
    }

    /// Returns explicit complete storage roots for this application.
    fn roots(&self) -> RescueRoots {
        RescueRoots { runtime_root: self.0.join("runtime"), workspace_root: self.0.join("workspaces"), cli_config_root: None }
    }

    /// Opens and configures the independent maintenance service.
    fn session(&self, secrets: Option<Arc<dyn HostSecretStore>>) -> NativeRescueSession {
        let mut session = NativeRescueSession::open(self.0.join("runtime"), secrets).unwrap();
        session.execute(json!({"operation": "configure", "roots": self.roots()})).unwrap();
        session
    }
}
impl Drop for Fixture {
    /// Deletes only the UUID-owned fixture after its borrowed sessions have been dropped.
    fn drop(&mut self) {
        assert_eq!(self.0.parent(), Some(std::env::temp_dir().as_path()));
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[derive(Default)]
struct Secrets { values: Mutex<BTreeMap<String, Vec<u8>>>, fail_writes: AtomicBool }
impl HostSecretStore for Secrets {
    /// Reads a deterministic portable secret for archive verification.
    fn readSecret(&self, key: &str) -> HostResult<Option<Vec<u8>>> { Ok(self.values.lock().unwrap().get(key).cloned()) }
    /// Supports deliberate interruption after filesystem publication for recovery tests.
    fn writeSecret(&self, key: &str, value: &[u8]) -> HostResult<()> {
        if self.fail_writes.load(Ordering::SeqCst) && key == SECRET_KEYS[0] { return Err(operit_host_api::HostError::new("injected secret write interruption")); }
        self.values.lock().unwrap().insert(key.into(), value.into());
        Ok(())
    }
    /// Deletes only the exact registered secret requested by the engine.
    fn deleteSecret(&self, key: &str) -> HostResult<()> { self.values.lock().unwrap().remove(key); Ok(()) }
}

/// Streams an encrypted source archive into another session through the production protocol.
fn transfer(source: &Value, destination: &mut NativeRescueSession) -> String {
    let bytes = fs::read(source["fileReference"].as_str().unwrap()).unwrap();
    let upload = destination.execute(json!({"operation": "beginUpload", "byteLength": bytes.len()})).unwrap();
    let id = upload["archiveId"].as_str().unwrap().to_string();
    for chunk in bytes.chunks(operit_data_rescue::CHUNK_BYTES) {
        destination.execute(json!({"operation": "uploadChunk", "archiveId": id, "bytes": STANDARD.encode(chunk)})).unwrap();
    }
    destination.execute(json!({"operation": "sealUpload", "archiveId": id})).unwrap();
    id
}

/// Authenticates complete encrypted raw storage and preserves the displaced live data.
#[test]
fn encrypted_roundtrip_preserves_identities_workspaces_secrets_and_originals() {
    let source = Fixture::new();
    source.write("runtime/identities/a/corrupt.sqlite", b"not a sqlite database\0");
    source.write("runtime/identities/b/attachment.bin", &vec![23; 140_000]);
    source.write("workspaces/identities/b/project/empty", b"");
    source.write("client/link/local_runtime_storage.json", br#"{"confirmed":true,"runtimeRoot":"old","workspaceRoot":"old","identities":[]}"#);
    source.write("settings/extra.json", b"raw extra app data");
    fs::create_dir_all(source.0.join("runtime/identities/a/empty-directory/nested")).unwrap();
    fs::create_dir_all(source.0.join("empty-application-directory/nested")).unwrap();
    let secrets = Arc::new(Secrets::default());
    secrets.values.lock().unwrap().insert(SECRET_KEYS[0].into(), b"portable key bytes".to_vec());
    let mut exporting = source.session(Some(secrets));
    let archive = exporting.execute(json!({"operation":"export","password":PASSWORD})).unwrap();
    let encrypted = fs::read(archive["fileReference"].as_str().unwrap()).unwrap();
    assert!(!encrypted.windows(18).any(|part| part == b"portable key bytes"));

    let target = Fixture::new();
    target.write("runtime/original", b"old runtime");
    target.write("obsolete-settings", b"must be retained, not mixed into restored data");
    let imported_secrets = Arc::new(Secrets::default());
    let mut importing = target.session(Some(imported_secrets.clone()));
    let id = transfer(&archive, &mut importing);
    assert!(importing.execute(json!({"operation":"restore","archiveId":id,"password":"wrong password 123"})).is_err());
    assert_eq!(fs::read(target.0.join("runtime/original")).unwrap(), b"old runtime");
    let inspected = importing.execute(json!({"operation":"inspect","archiveId":id,"password":PASSWORD})).unwrap();
    assert_eq!(inspected["layout"], "operit.files.v1");
    let restored = importing.execute(json!({"operation":"restore","archiveId":id,"password":PASSWORD})).unwrap();
    assert_eq!(restored["restored"], true);
    assert_eq!(fs::read(target.0.join("runtime/identities/a/corrupt.sqlite")).unwrap(), b"not a sqlite database\0");
    assert_eq!(fs::metadata(target.0.join("workspaces/identities/b/project/empty")).unwrap().len(), 0);
    assert!(target.0.join("runtime/identities/a/empty-directory/nested").is_dir());
    assert!(target.0.join("empty-application-directory/nested").is_dir());
    assert!(!target.0.join("obsolete-settings").exists());
    assert_eq!(imported_secrets.readSecret(SECRET_KEYS[0]).unwrap().unwrap(), b"portable key bytes");
    let bootstrap: Value = serde_json::from_slice(&fs::read(target.0.join("client/link/local_runtime_storage.json")).unwrap()).unwrap();
    assert_eq!(bootstrap["runtimeRoot"], json!(target.0.join("runtime")));
    let retained = restored["retainedData"].as_array().unwrap();
    assert!(retained.iter().any(|path| Path::new(path.as_str().unwrap()).join("original").is_file()));
    assert!(!target.0.join("data-rescue/commit.json").exists());
    let completed = fs::read(restored["retainedCatalog"].as_str().unwrap()).unwrap();
    assert!(!completed.windows(b"portable key bytes".len()).any(|part| part == b"portable key bytes"));
    assert!(!completed.windows(STANDARD.encode(b"portable key bytes").len()).any(|part| part == STANDARD.encode(b"portable key bytes").as_bytes()));
}

/// Rejects changed published payloads on resume while retaining every displaced original.
#[test]
fn interrupted_import_rechecks_payloads_before_resuming() {
    let source = Fixture::new();
    source.write("runtime/new", b"verified payload");
    let source_secrets = Arc::new(Secrets::default());
    source_secrets.values.lock().unwrap().insert(SECRET_KEYS[0].into(), b"verified secret".to_vec());
    let mut exporting = source.session(Some(source_secrets));
    let archive = exporting.execute(json!({"operation":"export","password":PASSWORD})).unwrap();
    let target = Fixture::new();
    target.write("runtime/old", b"untouched original");
    let secrets = Arc::new(Secrets::default());
    secrets.fail_writes.store(true, Ordering::SeqCst);
    let mut importing = target.session(Some(secrets.clone()));
    let id = transfer(&archive, &mut importing);
    assert!(importing.execute(json!({"operation":"restore","archiveId":id,"password":PASSWORD})).is_err());
    let journal: Journal = serde_json::from_slice(&fs::read(target.0.join("data-rescue/commit.json")).unwrap()).unwrap();
    let retained = journal.publications.iter().find(|plan| plan.target == target.0.join("runtime")).unwrap().retained.clone();
    target.write("runtime/new", b"tampered payload");
    secrets.fail_writes.store(false, Ordering::SeqCst);
    let error = importing.execute(json!({"operation":"resumeRestore"})).unwrap_err();
    assert!(error.starts_with("Pending import payload integrity check failed:"), "{error}");
    assert_eq!(fs::read(retained.join("old")).unwrap(), b"untouched original");
    assert!(target.0.join("data-rescue/commit.json").is_file());
    assert!(secrets.readSecret(SECRET_KEYS[0]).unwrap().is_none());
}

/// Rejects incomplete and aliased directory metadata before creating any staging tree.
#[test]
fn native_metadata_rejects_aliases_and_missing_ancestors() {
    let fixture = Fixture::new();
    fixture.write("runtime/original", b"must remain unchanged");
    let host = NativeRescueHost::new(&fixture.0.join("runtime"), fixture.roots(), None).unwrap();
    let payload = RescueFile { path: "runtime/folder/file".into(), byte_length: 0, sha256: "0".repeat(64) };
    let mut manifest = RescueManifest {
        format: "operit.data-rescue".into(), version: 1, layout: "operit.files.v1".into(),
        files: vec![payload, RescueFile { path: SYSTEM_SECRETS.into(), byte_length: 2, sha256: "0".repeat(64) }],
        metadata: json!({"storageNodes": [
            {"path":"runtime", "directory":true, "unixMode":null},
            {"path":"runtime/folder/file", "directory":false, "unixMode":null}
        ]}),
    };
    assert!(host.begin_restore(&uuid::Uuid::new_v4().to_string(), &manifest).unwrap_err().starts_with("Missing directory metadata:"));
    manifest.metadata["storageNodes"].as_array_mut().unwrap().extend([
        json!({"path":"runtime/folder", "directory":true, "unixMode":null}),
        json!({"path":"runtime/FOLDER", "directory":true, "unixMode":null}),
    ]);
    assert!(host.begin_restore(&uuid::Uuid::new_v4().to_string(), &manifest).unwrap_err().starts_with("Aliased or duplicate native destination:"));
    assert_eq!(fs::read(fixture.0.join("runtime/original")).unwrap(), b"must remain unchanged");
    assert!(!fixture.0.join("data-rescue").exists());
}

/// Exports a broken bootstrap without decoding it or opening any database.
#[test]
fn damaged_bootstrap_is_available_as_raw_encrypted_data() {
    let fixture = Fixture::new();
    fixture.write("client/link/local_runtime_storage.json", b"{broken startup record");
    let mut session = fixture.session(None);
    let startup = session.describe_startup().unwrap();
    assert_eq!(STANDARD.decode(startup["bootstrapBase64"].as_str().unwrap()).unwrap(), b"{broken startup record");
    let archive = session.execute(json!({"operation":"export","password":PASSWORD})).unwrap();
    assert!(session.execute(json!({"operation":"inspect","archiveId":archive["archiveId"],"password":PASSWORD})).is_ok());
}

/// Blocks concurrent runtime access and resumes a journal independently of damaged bootstrap.
#[test]
fn interrupted_publication_requires_explicit_resume_and_keeps_originals() {
    let source = Fixture::new();
    source.write("runtime/new", b"new data");
    let exporting_secrets = Arc::new(Secrets::default());
    exporting_secrets.values.lock().unwrap().insert(SECRET_KEYS[0].into(), b"imported key".to_vec());
    let mut exporting = source.session(Some(exporting_secrets));
    let archive = exporting.execute(json!({"operation":"export","password":PASSWORD})).unwrap();
    let target = Fixture::new();
    target.write("runtime/old", b"original data");
    let secrets = Arc::new(Secrets::default());
    secrets.fail_writes.store(true, Ordering::SeqCst);
    {
        let mut importing = target.session(Some(secrets.clone()));
        assert!(StorageLease::acquire(&target.0.join("runtime"), false).is_err());
        let id = transfer(&archive, &mut importing);
        let error = importing.execute(json!({"operation":"restore","archiveId":id,"password":PASSWORD})).unwrap_err();
        assert!(error.starts_with("injected secret write interruption"));
    }
    assert!(StorageLease::acquire(&target.0.join("runtime"), false).is_err());
    target.write("client/link/local_runtime_storage.json", b"broken after interruption");
    secrets.fail_writes.store(false, Ordering::SeqCst);
    {
        let mut importing = target.session(Some(secrets));
        let startup = importing.describe_startup().unwrap();
        assert_eq!(startup["recoveryRoots"]["runtimeRoot"], json!(target.0.join("runtime")));
        let restored = importing.execute(json!({"operation":"resumeRestore"})).unwrap();
        assert_eq!(restored["restored"], true);
        assert!(restored["retainedData"].as_array().unwrap().iter().any(|path| Path::new(path.as_str().unwrap()).join("old").is_file()));
    }
    assert!(StorageLease::acquire(&target.0.join("runtime"), false).is_ok());
}

/// Rejects overlapping roots before the service can traverse or stage any user data.
#[test]
fn root_overlap_is_an_explicit_error() {
    let fixture = Fixture::new();
    let mut roots = fixture.roots();
    roots.workspace_root = roots.runtime_root.join("nested-workspace");
    let mut session = NativeRescueSession::open(fixture.0.join("runtime"), None).unwrap();
    assert!(session.execute(json!({"operation":"configure","roots":roots})).is_err());
}
