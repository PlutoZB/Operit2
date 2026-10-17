# Operit2 Data Rescue

Operit2 includes a standalone data-maintenance entry that can run without Core, SQLite, plugin loading, normal bootstrap parsing, or user preferences. It is intended for recovery when the normal application cannot start.

## Entrances

- Android: long-press the `Operit2` launcher icon and choose `数据救援`; the shortcut starts the separate maintenance process.
- iOS: use the `Data Rescue` Home Screen shortcut while the app is fully closed. While the app is already running, iOS displays an explicit instruction to quit and relaunch through that shortcut.
- OpenHarmony: launch the separately exported `DataRescueAbility`.
- Windows: open the `Operit2` folder in the Start Menu and choose `Operit2 Data Rescue`, or start the executable with `--data-rescue`.
- macOS: use the native `Operit2 Data Rescue` menu command, or start the executable with `--data-rescue`.
- Linux: use the installed `Operit2 Data Rescue` desktop entry, or start the executable with `--data-rescue`.
- Web: open `data-rescue.html` from the deployed site, or use `?mode=data-rescue`.
- CLI: run `operit2 rescue describe`, `export`, `inspect`, `import`, or `resume`.

The Flutter maintenance screen is a separate route and does not construct `CoreApplicationService`, `RuntimeBootstrapManager`, the normal logger path, or the normal business UI. Native rescue processes register the file picker and offline rescue ABI without registering the application plugin set. Browser maintenance uses a separate Worker and an exclusive Web Lock.

## Archive and restore

Native platforms use the encrypted `operit.files.v1` archive layout. Browser storage uses the independent `operit.browser.v1` layout because OPFS, IndexedDB, and browser origin storage are not the same storage contract as native files. Archives require a password of at least 12 characters. The archive contains every selected regular file, all configured identity roots, workspaces, client bootstrap data, application-owned files, registered portable host secrets, empty directories, and portable Unix permission bits. Windows retains the destination security ACL. ZIP entries are authenticated and every payload is checked for declared size and SHA-256 before restore.

Restore is staged and verified before publication. The maintenance lease is exclusive, and normal runtime access uses a shared lease. A pending publication journal blocks normal startup. The original directories are retained under a generated `.operit-retained-*` path on native platforms and `data-rescue/retained-*` in the browser. The journal is durable and recovery is explicit; the implementation does not silently discard or substitute damaged data.

If the normal process is still holding the lease, the maintenance screen reports the concrete lock error. Android exposes an explicit stop-normal-process command from its maintenance activity. iOS requires a cold launch through the Home Screen shortcut. Other platforms require the normal process to be closed by the user or by the platform's normal lifecycle controls.

An import retains the displaced native roots and application-owned entries. A durable interrupted publication blocks normal startup and is only advanced by an explicit resume operation. Incomplete pre-publication staging is discarded when the user closes the maintenance session. Corrupt archive metadata, unsupported filesystem objects such as symbolic links, overlapping roots, or modified pending payloads produce an explicit error before the corresponding publication step. External disk failure, device loss, storage hardware failure, and OS-level revocation remain outside software guarantees; keep the exported archive on a separate device or storage medium.

Native and browser archives are deliberately not cross-importable in this version. The logical data contract differs between native filesystem data and browser OPFS/IndexedDB records.
