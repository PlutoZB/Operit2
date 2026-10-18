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
    let model = ModelConfigManager::spaceMergeStore();
    let tts = TtsConfigManager::spaceMergeStore();
    let stt = SttConfigManager::spaceMergeStore();
    let theme = ThemeConfigManager::spaceMergeStore();
    let functional = FunctionalConfigManager::spaceMergeStore();
    for store in [
        ModelConfigManager::preferenceStore(storage.clone(), model.path.clone()),
        TtsConfigManager::preferenceStore(storage.clone(), tts.path.clone()),
        SttConfigManager::preferenceStore(storage.clone(), stt.path.clone()),
        super::UserPreferencesManager::UserPreferencesManager::store(storage.clone()),
        FunctionalConfigManager::preferenceStore(storage, functional.path.clone()),
    ] {
        store.data().map_err(|error| error.to_string())?;
    }
    Ok(PreferenceMergeSchema { stores: vec![model, tts, stt, theme, functional] })
}
