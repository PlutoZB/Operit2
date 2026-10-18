//! Executes the shared preference merge declarations for Rust owners and plugins.
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use operit_host_api::RuntimeStorageHost;
use operit_host_api::PluginStorage::{
    StoragePreferencesMergeCatalog, StoragePreferencesMergeDescriptor,
    StoragePreferencesMergeKey, StoragePreferencesMergePathSegment,
};
pub use operit_host_api::PluginStorage::PLUGIN_MERGE_DECLARATION_KEY;
use serde_json::Value;
use crate::MergeRules::{canonicalContent, uniqueNames};

use crate::PreferencesDataStore::{
    stringPreferencesKey, Preferences, PreferencesDataStore, PreferencesDataStoreError,
    PreferencesSyncedEntry,
};
use crate::SyncOperationStore::{SyncOperation, SyncOperationStore};
use operit_util::RuntimeStorageLayout::RUNTIME_SYNC_DIR_PATH;

/// Binds the shared data declaration to its owning preference store.
#[derive(Clone, Debug)]
pub struct PreferenceMergeStore {
    pub path: String,
    pub encrypted: bool,
    pub merge: StoragePreferencesMergeDescriptor,
}

/// Collects store ownership without introducing another merge declaration model.
#[derive(Clone, Debug, Default)]
pub struct PreferenceMergeSchema {
    pub stores: Vec<PreferenceMergeStore>,
}

impl PreferenceMergeSchema {
    /// Iterates the catalogs together with their explicit storage ownership.
    fn catalogs(&self) -> impl Iterator<Item = (&PreferenceMergeStore, &StoragePreferencesMergeCatalog)> {
        self.stores.iter().filter_map(|store| store.merge.catalog.as_ref().map(|catalog| (store, catalog)))
    }
}

/// Validates the shared declaration contract before owner-specific namespace checks.
fn validateDeclaration(descriptor: &StoragePreferencesMergeDescriptor) -> Result<(), String> {
    if descriptor.version != 1 || descriptor.references.len() > 256 {
        return Err("Invalid preference merge declaration".into());
    }
    if let Some(catalog) = &descriptor.catalog {
        if catalog.key_prefix.is_empty() || catalog.identity_field.is_empty()
            || catalog.name_field.is_empty() || catalog.identity_field == catalog.name_field
            || catalog.ignored_fields.iter().any(|field| field == &catalog.name_field)
            || catalog.ignored_fields.len() > 64 || catalog.retired_keys.len() > 64 {
            return Err("Invalid preference merge catalog declaration".into());
        }
    }
    for reference in &descriptor.references {
        if reference.target.is_empty() || reference.target.len() > 512
            || !reference.target.ends_with(".preferences.json")
            || !reference.target.starts_with("runtime/")
            || reference.target.split('/').any(|part| part.is_empty() || part == "." || part == "..")
            || reference.target.chars().any(|character| character.is_control() || character == '\\')
            || reference.path.len() > 32 {
            return Err("Invalid preference merge reference declaration".into());
        }
        match &reference.key {
            StoragePreferencesMergeKey::Exact { key } if key.is_empty() || key == PLUGIN_MERGE_DECLARATION_KEY =>
                return Err("Invalid preference reference key".into()),
            StoragePreferencesMergeKey::Records { prefix, .. } if prefix.is_empty() =>
                return Err("Invalid preference record selector".into()),
            _ => {}
        }
        for (index, segment) in reference.path.iter().enumerate() {
            match segment {
                StoragePreferencesMergePathSegment::Field { name }
                | StoragePreferencesMergePathSegment::Variant { name } if name.is_empty() =>
                    return Err("Invalid preference reference path".into()),
                StoragePreferencesMergePathSegment::Identity { .. } if index + 1 != reference.path.len() =>
                    return Err("Preference identity selector must be terminal".into()),
                _ => {}
            }
        }
    }
    if let Some(projection) = &descriptor.projection {
        if descriptor.catalog.is_none() || projection.selection_key.is_empty()
            || projection.source_field.is_empty() || projection.fields.len() > 256
            || projection.retired_keys.len() > 64 {
            return Err("Invalid preference projection declaration".into());
        }
    }
    Ok(())
}

/// Validates aggregate limits and relationships after every owner's shared contract is checked.
fn validateSchema(schema: &PreferenceMergeSchema) -> Result<(), String> {
    let mut paths = BTreeSet::new();
    let mut catalogs = BTreeMap::new();
    let mut referenceCount = 0;
    let mut projectionCount = 0;
    for store in &schema.stores {
        validateDeclaration(&store.merge)?;
        if store.path.is_empty() || store.path.len() > 512
            || store.path.chars().any(char::is_control) || !paths.insert(store.path.as_str()) {
            return Err("Invalid or duplicate preference merge store declaration".into());
        }
        if let Some(catalog) = &store.merge.catalog {
            catalogs.insert(store.path.as_str(), catalog);
        }
        referenceCount += store.merge.references.len();
        projectionCount += usize::from(store.merge.projection.is_some());
    }
    if catalogs.len() > 64 || referenceCount > 256 || projectionCount > 64 {
        return Err("Preference merge declaration exceeds resource limits".into());
    }
    for store in &schema.stores {
        let mut references = BTreeSet::new();
        for reference in &store.merge.references {
            if !catalogs.contains_key(reference.target.as_str())
                || !references.insert((&reference.key, &reference.path)) {
                return Err("Invalid preference merge reference declaration".into());
            }
        }
        if let Some(projection) = &store.merge.projection {
            if !store.merge.references.iter().any(|reference| {
                reference.key == StoragePreferencesMergeKey::Exact { key: projection.selection_key.clone() }
                    && reference.path.is_empty() && reference.target == store.path
            }) {
                return Err("Invalid preference projection declaration".into());
            }
            let catalog = catalogs.get(store.path.as_str())
                .ok_or("Projection requires a declared entity catalog")?;
            let mut projectedKeys = BTreeSet::new();
            for key in projection.fields.values() {
                if key.is_empty() || key == &projection.selection_key || keyMatches(key, catalog)
                    || !projectedKeys.insert(key) {
                    return Err("Invalid or overlapping preference projection field".into());
                }
            }
        }
    }
    Ok(())
}

#[derive(Clone)]
struct ConfigRecord {
    id: String,
    key: String,
    value: Value,
}

/// Checks plugin storage ownership before applying the shared declaration validator.
pub(crate) fn validatePluginDeclaration(path: &str, descriptor: &StoragePreferencesMergeDescriptor) -> Result<(), String> {
    let canonical = operit_util::PluginStoragePaths::resolveStoragePath(path)?;
    if canonical != path || !path.ends_with(".preferences.json") {
        return Err("Invalid plugin preference merge declaration".into());
    }
    validateDeclaration(descriptor)
}

/// Recovers immutable plugin contracts from already decoded preference history.
fn pluginDeclarations(entries: &[PreferencesSyncedEntry]) -> Result<BTreeMap<String, StoragePreferencesMergeDescriptor>, String> {
    let mut declarations = BTreeMap::new();
    for entry in entries {
        if !entry.keys().contains(&PLUGIN_MERGE_DECLARATION_KEY) { continue; }
        let path = entry.storagePath().to_owned();
        if entry.encrypted() { return Err("Plugin preference declarations require an unencrypted plugin store".into()); }
        let mut extracted = false;
        entry.clone().rewriteRootEntries(|key, value| {
            if key != PLUGIN_MERGE_DECLARATION_KEY { return Ok(()); }
            let value = value.ok_or_else(|| PreferencesDataStoreError::Message("Preference merge declarations cannot be removed".into()))?;
            let descriptor: StoragePreferencesMergeDescriptor = serde_json::from_value(value.clone())?;
            validatePluginDeclaration(&path, &descriptor).map_err(PreferencesDataStoreError::Message)?;
            match declarations.entry(path.clone()) {
                std::collections::btree_map::Entry::Vacant(entry) => { entry.insert(descriptor); }
                std::collections::btree_map::Entry::Occupied(entry) if entry.get() != &descriptor =>
                    return Err(PreferencesDataStoreError::Message("Conflicting preference merge declarations".into())),
                std::collections::btree_map::Entry::Occupied(_) => {}
            }
            extracted = true;
            Ok(())
        }).map_err(|error| error.to_string())?;
        if !extracted && entry.identityAlias().is_none() { return Err("Preference merge declarations must be complete immutable records".into()); }
    }
    if declarations.len() > 64 { return Err("Plugin preference merge declaration limit exceeded".into()); }
    Ok(declarations)
}

/// Composes shared Rust and plugin declarations before invoking the single merge executor.
pub fn applyOperations<F>(
    storageHost: Arc<dyn RuntimeStorageHost>,
    schema: &PreferenceMergeSchema,
    history: &[SyncOperation],
    incoming: &[SyncOperation],
    retain: F,
    complete: bool,
) -> Result<BTreeMap<String, String>, String>
where
    F: Fn(&str, &str) -> bool,
{
    let known = history.iter().chain(incoming)
        .filter(|operation| operation.domain == "preferences").cloned().collect::<Vec<_>>();
    let batch = PreferencesDataStore::prepareSyncedEntries(&[], &known)
        .map_err(|error| error.to_string())?;
    let declarations = pluginDeclarations(&PreferencesDataStore::filterSyncedEntries(&batch, |_, _| true)
        .map_err(|error| error.to_string())?)?;
    let mut combined = schema.clone();
    combined.stores.extend(declarations.into_iter()
        .filter(|(path, _)| retain(path, PLUGIN_MERGE_DECLARATION_KEY))
        .map(|(path, merge)| PreferenceMergeStore { path, encrypted: false, merge }));
    validateSchema(&combined)?;
    let entries = PreferencesDataStore::filterSyncedEntries(&batch, |path, key| {
        retain(path, key) && !combined.catalogs().any(|(store, catalog)| {
            store.path == path && catalog.retired_keys.iter().any(|retired| retired == key)
        })
    }).map_err(|error| error.to_string())?;
    applyDeclaredOperations(storageHost, &combined, entries, complete)
}

/// Materializes validated declarations and prepared operations through one storage-host pipeline.
fn applyDeclaredOperations(
    storageHost: Arc<dyn RuntimeStorageHost>,
    schema: &PreferenceMergeSchema,
    entries: Vec<PreferencesSyncedEntry>,
    complete: bool,
) -> Result<BTreeMap<String, String>, String> {
    let mut policies = schema.stores.iter().map(|store| (store.path.clone(), store.encrypted))
        .collect::<BTreeMap<_, _>>();
    for entry in &entries {
        if let Some(encrypted) = policies.insert(entry.storagePath().to_owned(), entry.encrypted()) {
            if encrypted != entry.encrypted() {
                return Err("Conflicting preference store encryption policy".into());
            }
        }
    }
    let mut recordedAliases = BTreeMap::new();
    for entry in &entries {
        let Some((source, target)) = entry.identityAlias() else { continue; };
        let (store, catalog) = schema.catalogs().find(|(store, _)| store.path == entry.storagePath())
            .ok_or("Identity alias requires a declared catalog")?;
        let source = catalogIdentity(source, catalog)?;
        let target = catalogIdentity(target, catalog)?;
        let left = resolveIdentity(&store.path, source, &recordedAliases)?;
        let right = resolveIdentity(&store.path, target, &recordedAliases)?;
        if left != right {
            let (canonical, alias) = if left < right { (left, right) } else { (right, left) };
            recordedAliases.insert(referenceKey(&store.path, &alias), canonical);
        }
    }
    let journal = SyncOperationStore::new(storageHost.clone(), RUNTIME_SYNC_DIR_PATH.to_string());
    PreferencesDataStore::materializeSyncedSnapshots(storageHost, policies, |staged| {
        // Reconstruct touched roots from immutable history before projecting canonical identities.
        for entry in &entries {
            if entry.identityAlias().is_some() { continue; }
            let preferences = staged.get_mut(entry.storagePath()).ok_or_else(|| {
                PreferencesDataStoreError::Message("Validated preference store is missing".into())
            })?;
            for key in entry.keys() {
                preferences.remove(&stringPreferencesKey(key));
                if let Some((store, catalog)) = schema.catalogs().find(|(store, catalog)| {
                    store.path == entry.storagePath() && keyMatches(key, catalog)
                }) {
                    let id = catalogIdentity(key, catalog).map_err(PreferencesDataStoreError::Message)?;
                    let canonical = resolveIdentity(&store.path, id, &recordedAliases)
                        .map_err(PreferencesDataStoreError::Message)?;
                    preferences.remove(&stringPreferencesKey(&format!("{}{}{}", catalog.key_prefix, canonical, catalog.key_suffix)));
                }
            }
        }
        let mut referenceMap = recordedAliases.clone();
        for mut entry in entries {
            if entry.identityAlias().is_some() { continue; }
            if let Some((store, catalog)) = schema.catalogs().find(|(store, _)| store.path == entry.storagePath()) {
                entry.rewriteRootEntries(|key, value| {
                    if !keyMatches(key, catalog) { return Ok(()); }
                    let id = key.strip_prefix(catalog.key_prefix.as_str())
                        .and_then(|id| id.strip_suffix(catalog.key_suffix.as_str()))
                        .ok_or_else(|| PreferencesDataStoreError::Message("Invalid entity key".into()))?;
                    let canonical = resolveIdentity(&store.path, id, &referenceMap)
                        .map_err(PreferencesDataStoreError::Message)?;
                    if let Some(value) = value {
                        if value.get(&catalog.identity_field).and_then(Value::as_str) != Some(id) {
                            return Err(PreferencesDataStoreError::Message("Entity identity differs from its key".into()));
                        }
                        value[&catalog.identity_field] = Value::String(canonical.clone());
                    }
                    *key = format!("{}{}{}", catalog.key_prefix, canonical, catalog.key_suffix);
                    Ok(())
                })?;
            }
            entry.apply(staged.get_mut(entry.storagePath()).ok_or_else(|| {
                PreferencesDataStoreError::Message("Validated preference store is missing".into())
            })?)?;
        }
        loop {
            let aliases = referenceMap.keys().cloned().collect::<Vec<_>>();
            for alias in aliases {
                let (path, id) = alias.split_once('\u{001f}').ok_or_else(|| {
                    PreferencesDataStoreError::Message("Invalid entity reference namespace".into())
                })?;
                let canonical = resolveIdentity(path, id, &referenceMap).map_err(PreferencesDataStoreError::Message)?;
                referenceMap.insert(alias, canonical);
            }
            rewriteReferences(staged, schema, &referenceMap)?;
            let previousAliasCount = referenceMap.len();
            for (store, catalog) in schema.catalogs() {
                let preferences = staged.get_mut(&store.path).ok_or_else(|| {
                    PreferencesDataStoreError::Message("Declared preference catalog store is missing".into())
                })?;
                let records = currentRecords(preferences, catalog).map_err(PreferencesDataStoreError::Message)?;
                let (records, ids) = mergeRecords(records, &store.path, catalog, complete, false)
                    .map_err(PreferencesDataStoreError::Message)?;
                referenceMap.extend(ids);
                writeRecords(preferences, catalog, &records)?;
            }
            if referenceMap.len() == previousAliasCount { break; }
        }
        // Resolve display names after dependent catalogs reach canonical identities.
        for (store, catalog) in schema.catalogs() {
            let preferences = staged.get_mut(&store.path).expect("validated catalog store");
            let records = currentRecords(preferences, catalog).map_err(PreferencesDataStoreError::Message)?;
            let (records, _) = mergeRecords(records, &store.path, catalog, false, true)
                .map_err(PreferencesDataStoreError::Message)?;
            writeRecords(preferences, catalog, &records)?;
        }
        for store in &schema.stores {
            let Some(projection) = &store.merge.projection else { continue; };
            let catalog = store.merge.catalog.as_ref().ok_or_else(|| {
                PreferencesDataStoreError::Message("Projection catalog is missing".into())
            })?;
            let preferences = staged.get_mut(&store.path).ok_or_else(|| {
                PreferencesDataStoreError::Message("Projection store is missing".into())
            })?;
            let selection = preferences.get(&stringPreferencesKey(&projection.selection_key)).cloned();
            match selection {
                None | Some(Value::Null) => continue,
                Some(Value::String(id)) => {
                    let key = format!("{}{}{}", catalog.key_prefix, id, catalog.key_suffix);
                    let source = preferences.get(&stringPreferencesKey(&key))
                        .and_then(|record| record.get(&projection.source_field))
                        .and_then(Value::as_object).cloned().ok_or_else(|| {
                            PreferencesDataStoreError::Message("Selected entity projection source is missing".into())
                        })?;
                    for (field, key) in &projection.fields {
                        match source.get(field) {
                            None | Some(Value::Null) => { preferences.remove(&stringPreferencesKey(key)); }
                            Some(value) if value.is_boolean() || value.is_number() || value.is_string() => {
                                preferences.set(&stringPreferencesKey(key), value.clone());
                            }
                            _ => return Err(PreferencesDataStoreError::Message("Projection requires scalar fields".into())),
                        }
                    }
                    for key in &projection.retired_keys { preferences.remove(&stringPreferencesKey(key)); }
                }
                _ => return Err(PreferencesDataStoreError::Message("Projection selection must be an identity or null".into())),
            }
        }
        let newAliases = referenceMap.iter().filter(|(key, target)| match recordedAliases.get(*key) {
            Some(previous) => previous != *target,
            None => true,
        }).collect::<Vec<_>>();
        if !newAliases.is_empty() {
            let deviceId = journal.localDeviceId()?;
            for (key, target) in newAliases {
                let (path, source) = key.split_once('\u{001f}').ok_or_else(|| {
                    PreferencesDataStoreError::Message("Invalid alias namespace".into())
                })?;
                let (store, catalog) = schema.catalogs().find(|(store, _)| store.path == path).ok_or_else(|| {
                    PreferencesDataStoreError::Message("Alias catalog is missing".into())
                })?;
                PreferencesSyncedEntry::appendIdentityAlias(&journal, &deviceId, path, store.encrypted,
                    &format!("{}{}{}", catalog.key_prefix, source, catalog.key_suffix),
                    &format!("{}{}{}", catalog.key_prefix, target, catalog.key_suffix))?;
            }
        }
        Ok(referenceMap)
    }).map_err(|error| error.to_string())
}

/// Rewrites declared references using the executor's canonical identity map.
fn rewriteReferences(
    staged: &mut BTreeMap<String, Preferences>,
    schema: &PreferenceMergeSchema,
    referenceMap: &BTreeMap<String, String>,
) -> Result<(), PreferencesDataStoreError> {
    for store in &schema.stores {
        for reference in &store.merge.references {
            let preferences = staged.get_mut(&store.path).ok_or_else(|| {
                PreferencesDataStoreError::Message("Declared preference reference store is missing".into())
            })?;
            let keys = preferences.iterEntries().filter(|(key, _)| reference.key.matches(key))
                .map(|(key, _)| stringPreferencesKey(key)).collect::<Vec<_>>();
            for key in keys {
                let mut value = preferences.get(&key).cloned().expect("selected preference exists");
                rewriteReferenceValue(&mut value, &reference.path, &reference.target, referenceMap)
                    .map_err(PreferencesDataStoreError::Message)?;
                preferences.set(&key, value);
            }
        }
    }
    Ok(())
}

/// Reads all currently materialized records belonging to one declared configuration catalog.
fn currentRecords(
    preferences: &Preferences,
    descriptor: &StoragePreferencesMergeCatalog,
) -> Result<Vec<ConfigRecord>, String> {
    preferences
        .iterEntries()
        .filter_map(|(key, value)| {
            if !keyMatches(key, descriptor) {
                return None;
            }
            Some((key.to_string(), value.clone()))
        })
        .map(|(key, value)| {
            let id = value
                .get(&descriptor.identity_field)
                .and_then(Value::as_str)
                .ok_or_else(|| format!("configuration {key} has no string id"))?;
            let expectedId = key
                .strip_prefix(descriptor.key_prefix.as_str())
                .and_then(|id| id.strip_suffix(descriptor.key_suffix.as_str()))
                .ok_or_else(|| {
                    format!("configuration key is outside its declared catalog: {key}")
                })?;
            if id != expectedId {
                return Err(format!("configuration identity does not match key: {key}"));
            }
            Ok(ConfigRecord {
                id: id.to_string(),
                key,
                value,
            })
        })
        .collect()
}

/// Coalesces identical distinct identities and assigns collision-free names in UUID order.
fn mergeRecords(
    records: Vec<ConfigRecord>,
    storePath: &str,
    descriptor: &StoragePreferencesMergeCatalog,
    coalesce: bool,
    rename: bool,
) -> Result<(Vec<ConfigRecord>, BTreeMap<String, String>), String> {
    let byId = records
        .into_iter()
        .map(|record| (record.id.clone(), record))
        .collect::<BTreeMap<_, _>>();
    let mut referenceMap = BTreeMap::new();
    let mut byContent = BTreeMap::<String, String>::new();
    let mut merged = BTreeMap::<String, ConfigRecord>::new();
    for record in byId.into_values() {
        let content = canonicalContent(&record.value, &descriptor.identity_field, descriptor.ignored_fields.iter().map(String::as_str))?;
        if let Some(canonicalId) = byContent.get(&content).filter(|_| coalesce) {
            referenceMap.insert(
                referenceKey(storePath, &record.id),
                canonicalId.clone(),
            );
        } else {
            byContent.insert(content, record.id.clone());
            merged.insert(record.id.clone(), record);
        }
    }
    if !rename { return Ok((merged.into_values().collect(), referenceMap)); }
    let names = merged.iter().map(|(id, record)| {
        let name = record.value.get(&descriptor.name_field).and_then(Value::as_str)
            .ok_or_else(|| format!("Configuration {id} has no declared string name"))?;
        Ok((id.clone(), name.to_string()))
    }).collect::<Result<BTreeMap<_, _>, String>>()?;
    for (id, name) in uniqueNames(&names) {
        let record = merged.get_mut(&id).ok_or_else(|| format!("Configuration {id} disappeared during merge"))?;
        record.value[&descriptor.name_field] = Value::String(name);
    }
    Ok((merged.into_values().collect(), referenceMap))
}

/// Extracts an identity only from a validated catalog root key.
fn catalogIdentity<'a>(key: &'a str, catalog: &StoragePreferencesMergeCatalog) -> Result<&'a str, String> {
    if !keyMatches(key, catalog) {
        return Err("Identity alias does not target a declared entity".into());
    }
    key.strip_prefix(catalog.key_prefix.as_str())
        .and_then(|id| id.strip_suffix(catalog.key_suffix.as_str()))
        .ok_or_else(|| "Invalid catalog identity key".into())
}

/// Matches only the declared entity key pattern, excluding retired membership keys.
fn keyMatches(key: &str, descriptor: &StoragePreferencesMergeCatalog) -> bool {
    if descriptor.retired_keys.iter().any(|retired| retired == key) {
        return false;
    }
    key.strip_prefix(descriptor.key_prefix.as_str())
        .and_then(|rest| rest.strip_suffix(descriptor.key_suffix.as_str()))
        .is_some_and(|identity| !identity.is_empty())
}

/// Writes canonical records without modifying unrelated preferences or emitting new operations.
fn writeRecords(
    preferences: &mut Preferences,
    descriptor: &StoragePreferencesMergeCatalog,
    records: &[ConfigRecord],
) -> Result<(), PreferencesDataStoreError> {
    let keys = preferences
        .iterEntries()
        .filter_map(|(key, _)| keyMatches(key, descriptor).then(|| key.to_string()))
        .collect::<Vec<_>>();
    for key in keys {
        preferences.remove(&stringPreferencesKey(&key));
    }
    for key in &descriptor.retired_keys {
        preferences.remove(&stringPreferencesKey(key));
    }
    for record in records {
        preferences.set(&stringPreferencesKey(&record.key), record.value.clone());
    }
    Ok(())
}

/// Follows a bounded explicit selector instead of guessing business fields in arbitrary JSON.
fn rewriteReferenceValue(
    value: &mut Value,
    path: &[StoragePreferencesMergePathSegment],
    target: &str,
    referenceMap: &BTreeMap<String, String>,
) -> Result<(), String> {
    let Some((segment, remaining)) = path.split_first() else {
        match value {
            Value::Null => {}
            Value::String(id) => {
                if let Some(canonicalId) = referenceMap.get(&referenceKey(target, id)) {
                    *id = canonicalId.clone();
                }
            }
            _ => return Err("Declared preference reference must be a string or null".to_string()),
        }
        return Ok(());
    };
    match segment {
        StoragePreferencesMergePathSegment::Field { name: field } => {
            let object = value.as_object_mut().ok_or("Declared preference reference selector requires an object")?;
            let child = object.get_mut(field).ok_or_else(|| {
                format!("Declared preference reference field is missing: {field}")
            })?;
            rewriteReferenceValue(child, remaining, target, referenceMap)?;
        }
        StoragePreferencesMergePathSegment::ObjectValues => {
            let object = value.as_object_mut().ok_or("Declared preference reference selector requires an object")?;
            for child in object.values_mut() {
                rewriteReferenceValue(child, remaining, target, referenceMap)?;
            }
        }
        StoragePreferencesMergePathSegment::ArrayValues => {
            let array = value.as_array_mut().ok_or("Declared preference reference selector requires an array")?;
            for child in array { rewriteReferenceValue(child, remaining, target, referenceMap)?; }
        }
        StoragePreferencesMergePathSegment::Variant { name } => {
            if value.is_null() { return Ok(()); }
            let object = value.as_object_mut().ok_or("Declared preference variant selector requires an object")?;
            if object.len() != 1 { return Err("Declared preference variant requires one discriminant".into()); }
            if let Some(child) = object.get_mut(name) {
                rewriteReferenceValue(child, remaining, target, referenceMap)?;
            }
        }
        StoragePreferencesMergePathSegment::Identity { prefix, suffix } => {
            if !remaining.is_empty() { return Err("Preference identity selector must be terminal".into()); }
            if value.is_null() { return Ok(()); }
            let text = value.as_str().ok_or("Declared preference identity requires a string")?;
            if let Some(id) = text.strip_prefix(prefix.as_str()).and_then(|text| text.strip_suffix(suffix.as_str())) {
                if let Some(mapped) = referenceMap.get(&referenceKey(target, id)) {
                    *value = Value::String(format!("{prefix}{mapped}{suffix}"));
                }
            }
        }
    }
    Ok(())
}

/// Resolves historical aliases transitively and rejects malformed cycles.
fn resolveIdentity(
    path: &str,
    id: &str,
    aliases: &BTreeMap<String, String>,
) -> Result<String, String> {
    let mut current = id.to_owned();
    let mut seen = BTreeSet::new();
    while let Some(next) = aliases.get(&referenceKey(path, &current)) {
        if !seen.insert(current.clone()) {
            return Err("Cyclic preference identity mapping".into());
        }
        current = next.clone();
    }
    Ok(current)
}

/// Builds a namespace-scoped key for one canonical identity mapping.
fn referenceKey(path: &str, id: &str) -> String {
    format!("{path}\u{001f}{id}")
}
