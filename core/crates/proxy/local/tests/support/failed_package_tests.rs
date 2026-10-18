use super::*;
use operit_store::ExtensionStore::ExtensionStore;
use operit_store::PreferencesDataStore::{stringPreferencesKey, CoreNodeStateStore};

/// Covers the recovery path using an actual bundled package and isolated runtime files.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn failed_package_deletion_allows_bundled_reinstallation() {
    let _test_guard = SHARED_CONCURRENCY_TEST_LOCK.lock().await;
    let storage = register_test_runtime_roots();
    let mut hosts = HostManager::withFileSystemHost(Arc::new(PosixFileSystemHost::new()));
    hosts.runtimeStorageHost = Some(storage.clone());
    hosts.runtimeSqliteHost = Some(storage.clone());
    hosts.hostSecretStore = Some(Arc::new(TestSecretStore::default()));
    hosts.hostJavaScriptRuntimeHost = Some(Arc::new(NativeHostJavaScriptRuntimeHost::new()));
    hosts.hostRuntimeTaskSchedulerHost = Some(Arc::new(NativeHostRuntimeTaskSchedulerHost::new()));
    ui_resource_tests::configure_package_hosts(&mut hosts);
    let app = OperitApplication::newWithContext(hosts);
    let packages = app.packageManager();
    let mut manager = packages.lock().unwrap();
    manager.loadAvailablePackages();
    let name = "com.operit.goal_mode_bundle";
    let store = ExtensionStore::new(storage.clone());
    let mut record = store.record("package", name).unwrap();
    assert_eq!(record.scope, "space");
    let record_path = storage
        .list("runtime/extensions/space/records")
        .unwrap()
        .into_iter()
        .find(|entry| {
            serde_json::from_slice::<Value>(&storage.readBytes(&entry.path).unwrap()).unwrap()["id"]
                == name
        })
        .unwrap()
        .path;
    record.scope = "device".into();
    record.sourceName.clear();
    record.settings["builtin"] = json!(true);
    record
        .settings
        .as_object_mut()
        .unwrap()
        .remove("installationScope");
    storage
        .writeBytes(
            &record_path.replace("/space/", "/device/"),
            &serde_json::to_vec(&record).unwrap(),
        )
        .unwrap();

    // A legacy bookkeeping entry must not block deletion of the conflicting package.
    let preferences = CoreNodeStateStore::newWithStorage(
        storage.clone(),
        "runtime/extensions/device/manager.preferences.json",
    );
    preferences
        .edit(|prefs| {
            prefs.set(
                &stringPreferencesKey("bundled_external_imports"),
                json!({
                    name: {"packageName": name, "sourceFileName": "goal_mode.toolpkg",
                        "destinationFileName": "goal_mode.toolpkg", "sourceSignature": "old"},
                    "unrelated": {"packageName": "unrelated"}
                }),
            );
        })
        .unwrap();
    manager.loadAvailablePackages();
    let issue = manager
        .getToolPkgLoadIssues()
        .into_iter()
        .find(|issue| issue.packageName.as_deref() == Some(name))
        .unwrap();
    assert!(issue.message.contains("ownership conflict"), "{issue:?}");
    manager.deleteToolPkgLoadIssue(issue.clone()).unwrap();
    manager.loadAvailablePackages();
    assert!(store.record("package", name).is_err());
    let candidate = manager
        .getBundledExternalPackageCandidates()
        .into_iter()
        .find(|candidate| candidate.packageName == name)
        .unwrap();
    assert_eq!(
        candidate.requiredInstallationScope.as_deref(),
        Some("space")
    );
    assert!(manager
        .getBundledExternalToolPkgContainerRuntimes()
        .iter()
        .any(|runtime| runtime.packageName == name));
    assert!(
        manager.deleteToolPkgLoadIssue(issue).is_err(),
        "stale errors must not delete reinstalled packages"
    );

    let imports_issue = manager
        .getToolPkgLoadIssues()
        .into_iter()
        .find(|issue| issue.packageKind == "package_manager")
        .unwrap();
    manager.deleteToolPkgLoadIssue(imports_issue).unwrap();
    assert!(manager
        .getToolPkgLoadIssues()
        .iter()
        .all(|issue| issue.packageKind != "package_manager"));
    let imported = manager.importBundledExternalToolPkgContainer(name);
    assert!(imported.starts_with("Successfully"), "{imported}");
    manager.loadAvailablePackages();
    assert_eq!(store.record("package", name).unwrap().scope, "space");
    assert!(manager
        .getToolPkgLoadIssues()
        .iter()
        .all(|issue| issue.packageName.as_deref() != Some(name)));

    // A malformed archive has neither a package ID nor an ownership record.
    let paths = operit_store::RuntimeStorePaths::RuntimeStorePaths::default();
    let broken = paths.runtime_storage_path("runtime/extensions/device/packages/broken.toolpkg");
    std::fs::write(&broken, b"invalid archive").unwrap();
    manager.loadAvailablePackages();
    let issue = manager
        .getToolPkgLoadIssues()
        .into_iter()
        .find(|issue| issue.sourcePath == broken.to_string_lossy())
        .unwrap();
    assert!(issue.packageName.is_none());
    manager.deleteToolPkgLoadIssue(issue).unwrap();
    assert!(!broken.exists());
    assert!(store.record("package", name).is_ok());

    // Deleting a duplicate source must preserve the valid installation of the same ID.
    let extra = "com.operit.context_limiter";
    let imported = manager.importBundledExternalToolPkgContainer(extra);
    assert!(imported.starts_with("Successfully"), "{imported}");
    let valid = store.record("package", extra).unwrap();
    let original = paths
        .runtime_storage_path("runtime/extensions/device/packages")
        .join(&valid.sourceName);
    std::fs::write(&original, b"corrupted installed archive").unwrap();
    manager.loadAvailablePackages();
    let issue = manager
        .getToolPkgLoadIssues()
        .into_iter()
        .find(|issue| issue.sourcePath == original.to_string_lossy())
        .unwrap();
    assert!(issue.packageName.is_none());
    manager.deleteToolPkgLoadIssue(issue).unwrap();
    assert!(store.record("package", extra).is_err());
    let imported = manager.importBundledExternalToolPkgContainer(extra);
    assert!(imported.starts_with("Successfully"), "{imported}");
    let duplicate =
        paths.runtime_storage_path("runtime/extensions/device/packages/zzz_duplicate.toolpkg");
    std::fs::copy(original, &duplicate).unwrap();
    manager.loadAvailablePackages();
    let issue = manager
        .getToolPkgLoadIssues()
        .into_iter()
        .find(|issue| issue.sourcePath == duplicate.to_string_lossy())
        .unwrap();
    assert_eq!(issue.code, "duplicate_package");
    manager.deleteToolPkgLoadIssue(issue).unwrap();
    assert!(!duplicate.exists());
    assert_eq!(store.record("package", extra).unwrap().scope, "device");
    assert!(manager.getToolPkgContainerRuntime(extra).is_some());
}
