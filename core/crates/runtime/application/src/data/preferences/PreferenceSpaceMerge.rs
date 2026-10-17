//! Wires owner-provided declarations into the Core preference merge executor.
use operit_store::PreferenceMerge::PreferenceMergeSchema;

use super::FunctionalConfigManager::FunctionalConfigManager;
use super::ModelConfigManager::ModelConfigManager;
use super::SttConfigManager::SttConfigManager;
use super::ThemeConfigManager::ThemeConfigManager;
use super::TtsConfigManager::TtsConfigManager;

/// Prepares owner-versioned stores before composing data-only merge declarations.
pub(crate) fn schema(
    storage: std::sync::Arc<dyn operit_host_api::RuntimeStorageHost>,
) -> Result<PreferenceMergeSchema, String> {
    let model = ModelConfigManager::spaceMergeCatalog();
    let tts = TtsConfigManager::spaceMergeCatalog();
    let stt = SttConfigManager::spaceMergeCatalog();
    let theme = ThemeConfigManager::spaceMergeCatalog();
    let functional = FunctionalConfigManager::spaceMergeReference();
    for store in [
        ModelConfigManager::preferenceStore(storage.clone(), model.store.path),
        TtsConfigManager::preferenceStore(storage.clone(), tts.store.path),
        SttConfigManager::preferenceStore(storage.clone(), stt.store.path),
        super::UserPreferencesManager::UserPreferencesManager::store(storage.clone()),
        FunctionalConfigManager::preferenceStore(storage, functional.store.path),
    ] {
        store.data().map_err(|error| error.to_string())?;
    }
    Ok(PreferenceMergeSchema {
        catalogs: vec![model, tts, stt, theme],
        projections: vec![ThemeConfigManager::spaceMergeProjection()],
        references: vec![
            ThemeConfigManager::spaceMergeReference(),
            TtsConfigManager::spaceMergeReference(),
            SttConfigManager::spaceMergeReference(),
            functional,
        ],
    })
}
