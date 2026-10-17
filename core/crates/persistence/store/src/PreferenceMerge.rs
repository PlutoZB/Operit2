//! Executes data-only preference merge declarations without application-specific storage knowledge.
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use operit_host_api::RuntimeStorageHost;
use serde_json::{Map, Value};

use crate::PreferencesDataStore::{
    stringPreferencesKey, Preferences, PreferencesDataStore, PreferencesDataStoreError,
};
use crate::SyncOperationStore::{SyncOperation, SyncOperationStore};
use operit_util::RuntimeStorageLayout::RUNTIME_SYNC_DIR_PATH;

/// Identifies a preference store independently of its entity layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PreferenceMergeStore {
    pub path: &'static str,
    pub encrypted: bool,
}

/// Describes one owner's complete entity records and retired membership metadata.
#[derive(Clone, Copy, Debug)]
pub struct PreferenceMergeCatalog {
    pub store: PreferenceMergeStore,
    pub keyPrefix: &'static str,
    pub keySuffix: &'static str,
    pub identityField: &'static str,
    pub nameField: &'static str,
    pub ignoredFields: &'static [&'static str],
    pub retiredKeys: &'static [&'static str],
}

/// Selects an explicit object field or every entry in a declared object map.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum PreferenceMergePathSegment {
    Field(&'static str),
    ObjectValues,
}

/// Declares one reference location and its target entity namespace.
#[derive(Clone, Copy, Debug)]
pub struct PreferenceMergeReference {
    pub store: PreferenceMergeStore,
    pub key: &'static str,
    pub path: &'static [PreferenceMergePathSegment],
    pub target: &'static str,
}

/// Projects selected entity fields into the owner's ordinary scalar preferences.
#[derive(Clone, Debug)]
pub struct PreferenceMergeProjection {
    pub store: PreferenceMergeStore,
    pub selectionKey: &'static str,
    pub sourceField: &'static str,
    pub fields: Vec<(&'static str, &'static str)>,
    pub retiredKeys: &'static [&'static str],
}

/// Collects owner-provided data declarations, never executable merge callbacks.
#[derive(Clone, Debug)]
pub struct PreferenceMergeSchema {
    pub catalogs: Vec<PreferenceMergeCatalog>,
    pub references: Vec<PreferenceMergeReference>,
    pub projections: Vec<PreferenceMergeProjection>,
}

/// Validates namespaces and bounded selectors before changing persistent state.
fn validateSchema(schema: &PreferenceMergeSchema) -> Result<(), String> {
    if schema.catalogs.len() > 64 || schema.references.len() > 256 || schema.projections.len() > 64
    {
        return Err("Preference merge declaration exceeds resource limits".to_string());
    }
    let mut catalogs = BTreeSet::new();
    let mut stores = BTreeMap::new();
    for catalog in &schema.catalogs {
        if catalog.store.path.is_empty()
            || catalog.keyPrefix.is_empty()
            || catalog.identityField.is_empty()
            || catalog.nameField.is_empty()
            || catalog.identityField == catalog.nameField
            || catalog.ignoredFields.contains(&catalog.nameField)
            || catalog.store.path.len() > 512
            || catalog.store.path.chars().any(char::is_control)
            || catalog.ignoredFields.len() > 64
            || catalog.retiredKeys.len() > 64
            || !catalogs.insert(catalog.store.path)
        {
            return Err("Invalid preference merge catalog declaration".to_string());
        }
        if let Some(encrypted) = stores.insert(catalog.store.path, catalog.store.encrypted) {
            if encrypted != catalog.store.encrypted {
                return Err("Conflicting preference merge store declaration".to_string());
            }
        }
    }
    let mut references = BTreeSet::new();
    for reference in &schema.references {
        if reference.store.path.is_empty()
            || reference.key.is_empty()
            || reference.path.len() > 32
            || !schema.catalogs.iter().any(|catalog| catalog.store.path == reference.target)
            || reference.path.iter().any(|segment| {
                matches!(segment, PreferenceMergePathSegment::Field(field) if field.is_empty())
            })
            || schema.catalogs.iter().any(|catalog| {
                catalog.store.path == reference.store.path && keyMatches(reference.key, *catalog)
            })
            || !references.insert((reference.store.path, reference.key, reference.path))
        {
            return Err("Invalid preference merge reference declaration".to_string());
        }
        if let Some(encrypted) = stores.insert(reference.store.path, reference.store.encrypted) {
            if encrypted != reference.store.encrypted {
                return Err("Conflicting preference merge store declaration".to_string());
            }
        }
    }
    let mut projectedKeys = BTreeSet::new();
    for projection in &schema.projections {
        if projection.sourceField.is_empty()
            || projection.fields.len() > 256
            || projection.retiredKeys.len() > 64
            || !schema.references.iter().any(|reference| {
                reference.store == projection.store
                    && reference.key == projection.selectionKey
                    && reference.path.is_empty()
                    && reference.target == projection.store.path
            })
        {
            return Err("Invalid preference projection declaration".into());
        }
        let catalog = schema
            .catalogs
            .iter()
            .find(|catalog| catalog.store == projection.store)
            .ok_or("Projection requires a declared entity catalog")?;
        for (_, key) in &projection.fields {
            if key.is_empty()
                || *key == projection.selectionKey
                || keyMatches(key, *catalog)
                || !projectedKeys.insert((projection.store.path, *key))
            {
                return Err("Invalid or overlapping preference projection field".into());
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

/// Applies the complete preference merge pipeline through one validated materialization entry point.
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
    validateSchema(schema)?;
    let known = history
        .iter()
        .chain(incoming)
        .filter(|operation| operation.domain == "preferences")
        .cloned()
        .collect::<Vec<_>>();
    let entries = PreferencesDataStore::orderedSyncedEntries(&[], &known, |path, key| {
        retain(path, key)
            && !schema
                .catalogs
                .iter()
                .any(|catalog| catalog.store.path == path && catalog.retiredKeys.contains(&key))
    })
    .map_err(|error| error.to_string())?;
    let mut policies = BTreeMap::new();
    for store in schema
        .catalogs
        .iter()
        .map(|catalog| catalog.store)
        .chain(schema.references.iter().map(|reference| reference.store))
    {
        policies.insert(store.path.to_string(), store.encrypted);
    }
    for entry in &entries {
        if let Some(encrypted) = policies.insert(entry.storagePath().to_string(), entry.encrypted())
        {
            if encrypted != entry.encrypted() {
                return Err("Conflicting preference store encryption policy".to_string());
            }
        }
    }
    // Only explicit decisions establish historical equivalence; transient old snapshots do not.
    let mut recordedAliases = BTreeMap::new();
    for entry in &entries {
        let Some((source, target)) = entry.identityAlias() else {
            continue;
        };
        let catalog = schema
            .catalogs
            .iter()
            .find(|catalog| catalog.store.path == entry.storagePath())
            .ok_or_else(|| "Identity alias requires a declared catalog".to_string())?;
        let source = catalogIdentity(source, *catalog)?;
        let target = catalogIdentity(target, *catalog)?;
        let left = resolveIdentity(catalog.store.path, source, &recordedAliases)?;
        let right = resolveIdentity(catalog.store.path, target, &recordedAliases)?;
        if left != right {
            let (canonical, alias) = if left < right {
                (left, right)
            } else {
                (right, left)
            };
            recordedAliases.insert(referenceKey(catalog.store.path, &alias), canonical);
        }
    }
    let journal = SyncOperationStore::new(storageHost.clone(), RUNTIME_SYNC_DIR_PATH.to_string());
    PreferencesDataStore::materializeSyncedSnapshots(storageHost, policies, |staged| {
        // Reconstruct touched roots from their immutable history, never from a previous projection.
        for entry in &entries {
            if entry.identityAlias().is_some() {
                continue;
            }
            let preferences = staged.get_mut(entry.storagePath()).ok_or_else(|| {
                PreferencesDataStoreError::Message("Validated preference store is missing".into())
            })?;
            for key in entry.keys() {
                preferences.remove(&stringPreferencesKey(key));
                if let Some(catalog) = schema.catalogs.iter().find(|catalog| {
                    catalog.store.path == entry.storagePath() && keyMatches(key, **catalog)
                }) {
                    let id = catalogIdentity(key, *catalog)
                        .map_err(PreferencesDataStoreError::Message)?;
                    let canonical = resolveIdentity(catalog.store.path, id, &recordedAliases)
                        .map_err(PreferencesDataStoreError::Message)?;
                    preferences.remove(&stringPreferencesKey(&format!(
                        "{}{}{}",
                        catalog.keyPrefix, canonical, catalog.keySuffix
                    )));
                }
            }
        }
        let mut referenceMap = recordedAliases.clone();
        for mut entry in entries {
            if entry.identityAlias().is_some() {
                continue;
            }
            if let Some(&catalog) = schema
                .catalogs
                .iter()
                .find(|catalog| catalog.store.path == entry.storagePath())
            {
                entry.rewriteRootEntries(|key, value| {
                    if !keyMatches(key, catalog) {
                        return Ok(());
                    }
                    let id = key
                        .strip_prefix(catalog.keyPrefix)
                        .and_then(|id| id.strip_suffix(catalog.keySuffix))
                        .ok_or_else(|| {
                            PreferencesDataStoreError::Message("Invalid entity key".into())
                        })?;
                    let canonical = resolveIdentity(catalog.store.path, id, &referenceMap)
                        .map_err(PreferencesDataStoreError::Message)?;
                    if let Some(value) = value {
                        if value.get(catalog.identityField).and_then(Value::as_str) != Some(id) {
                            return Err(PreferencesDataStoreError::Message(
                                "Entity identity differs from its key".into(),
                            ));
                        }
                        value[catalog.identityField] = Value::String(canonical.clone());
                    }
                    *key = format!("{}{}{}", catalog.keyPrefix, canonical, catalog.keySuffix);
                    Ok(())
                })?;
            }
            entry.apply(staged.get_mut(entry.storagePath()).ok_or_else(|| {
                PreferencesDataStoreError::Message("Validated preference store is missing".into())
            })?)?;
        }
        for &catalog in &schema.catalogs {
            let preferences = staged.get_mut(catalog.store.path).ok_or_else(|| {
                PreferencesDataStoreError::Message(
                    "Declared preference catalog store is missing".into(),
                )
            })?;
            let records =
                currentRecords(preferences, catalog).map_err(PreferencesDataStoreError::Message)?;
            let (records, ids) = mergeRecords(records, catalog, complete)
                .map_err(PreferencesDataStoreError::Message)?;
            referenceMap.extend(ids);
            writeRecords(preferences, catalog, &records)?;
        }
        let aliases = referenceMap.keys().cloned().collect::<Vec<_>>();
        for alias in aliases {
            let (path, id) = alias.split_once('\u{001f}').ok_or_else(|| {
                PreferencesDataStoreError::Message("Invalid entity reference namespace".into())
            })?;
            let canonical = resolveIdentity(path, id, &referenceMap)
                .map_err(PreferencesDataStoreError::Message)?;
            referenceMap.insert(alias, canonical);
        }
        for reference in &schema.references {
            let preferences = staged.get_mut(reference.store.path).ok_or_else(|| {
                PreferencesDataStoreError::Message(
                    "Declared preference reference store is missing".into(),
                )
            })?;
            let key = stringPreferencesKey(reference.key);
            if let Some(mut value) = preferences.get(&key).cloned() {
                rewriteReferenceValue(&mut value, reference.path, reference.target, &referenceMap)
                    .map_err(PreferencesDataStoreError::Message)?;
                preferences.set(&key, value);
            }
        }
        for projection in &schema.projections {
            let catalog = schema
                .catalogs
                .iter()
                .find(|catalog| catalog.store == projection.store)
                .ok_or_else(|| {
                    PreferencesDataStoreError::Message("Projection catalog is missing".into())
                })?;
            let preferences = staged.get_mut(projection.store.path).ok_or_else(|| {
                PreferencesDataStoreError::Message("Projection store is missing".into())
            })?;
            let selection = preferences
                .get(&stringPreferencesKey(projection.selectionKey))
                .cloned();
            match selection {
                None | Some(Value::Null) => continue,
                Some(Value::String(id)) => {
                    let key = format!("{}{}{}", catalog.keyPrefix, id, catalog.keySuffix);
                    let source = preferences
                        .get(&stringPreferencesKey(&key))
                        .and_then(|record| record.get(projection.sourceField))
                        .and_then(Value::as_object)
                        .cloned()
                        .ok_or_else(|| {
                            PreferencesDataStoreError::Message(
                                "Selected entity projection source is missing".into(),
                            )
                        })?;
                    for (field, key) in &projection.fields {
                        match source.get(*field) {
                            None | Some(Value::Null) => {
                                preferences.remove(&stringPreferencesKey(key))
                            }
                            Some(value)
                                if value.is_boolean() || value.is_number() || value.is_string() =>
                            {
                                preferences.set(&stringPreferencesKey(key), value.clone());
                            }
                            _ => {
                                return Err(PreferencesDataStoreError::Message(
                                    "Projection requires scalar fields".into(),
                                ))
                            }
                        }
                    }
                    for key in projection.retiredKeys {
                        preferences.remove(&stringPreferencesKey(key));
                    }
                }
                _ => {
                    return Err(PreferencesDataStoreError::Message(
                        "Projection selection must be an identity or null".into(),
                    ))
                }
            }
        }
        let newAliases = referenceMap
            .iter()
            .filter(|(key, target)| match recordedAliases.get(*key) {
                Some(previous) => previous != *target,
                None => true,
            })
            .collect::<Vec<_>>();
        if !newAliases.is_empty() {
            let deviceId = journal.localDeviceId()?;
            for (key, target) in newAliases {
                let (path, source) = key.split_once('\u{001f}').ok_or_else(|| {
                    PreferencesDataStoreError::Message("Invalid alias namespace".into())
                })?;
                let catalog = schema
                    .catalogs
                    .iter()
                    .find(|catalog| catalog.store.path == path)
                    .ok_or_else(|| {
                        PreferencesDataStoreError::Message("Alias catalog is missing".into())
                    })?;
                crate::PreferencesDataStore::PreferencesSyncedEntry::appendIdentityAlias(
                    &journal,
                    &deviceId,
                    path,
                    catalog.store.encrypted,
                    &format!("{}{}{}", catalog.keyPrefix, source, catalog.keySuffix),
                    &format!("{}{}{}", catalog.keyPrefix, target, catalog.keySuffix),
                )?;
            }
        }
        Ok(referenceMap)
    })
    .map_err(|error| error.to_string())
}

/// Reads all currently materialized records belonging to one declared configuration catalog.
fn currentRecords(
    preferences: &Preferences,
    descriptor: PreferenceMergeCatalog,
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
                .get(descriptor.identityField)
                .and_then(Value::as_str)
                .ok_or_else(|| format!("configuration {key} has no string id"))?;
            let expectedId = key
                .strip_prefix(descriptor.keyPrefix)
                .and_then(|id| id.strip_suffix(descriptor.keySuffix))
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
    descriptor: PreferenceMergeCatalog,
    coalesce: bool,
) -> Result<(Vec<ConfigRecord>, BTreeMap<String, String>), String> {
    let byId = records
        .into_iter()
        .map(|record| (record.id.clone(), record))
        .collect::<BTreeMap<_, _>>();
    let mut referenceMap = BTreeMap::new();
    let mut byContent = BTreeMap::<String, String>::new();
    let mut merged = BTreeMap::<String, ConfigRecord>::new();
    for record in byId.into_values() {
        let content = canonicalContent(&record.value, descriptor)?;
        if let Some(canonicalId) = byContent.get(&content).filter(|_| coalesce) {
            referenceMap.insert(
                referenceKey(descriptor.store.path, &record.id),
                canonicalId.clone(),
            );
        } else {
            byContent.insert(content, record.id.clone());
            merged.insert(record.id.clone(), record);
        }
    }
    let mut names = BTreeMap::<String, Vec<String>>::new();
    for record in merged.values() {
        let name = record
            .value
            .get(descriptor.nameField)
            .and_then(Value::as_str)
            .ok_or_else(|| format!("Configuration {} has no declared string name", record.id))?;
        names
            .entry(name.to_string())
            .or_default()
            .push(record.id.clone());
    }
    let mut usedNames = names.keys().cloned().collect::<BTreeSet<_>>();
    for (name, ids) in names {
        for id in ids.into_iter().skip(1) {
            let mut suffix = 1usize;
            let renamed = loop {
                let candidate = format!("{name}（{suffix}）");
                if usedNames.insert(candidate.clone()) {
                    break candidate;
                }
                suffix += 1;
            };
            let record = merged
                .get_mut(&id)
                .ok_or_else(|| format!("Configuration {id} disappeared during merge"))?;
            record.value[descriptor.nameField] = Value::String(renamed);
        }
    }
    Ok((merged.into_values().collect(), referenceMap))
}

/// Compares complete owner-declared content while excluding identity and declared metadata.
fn canonicalContent(value: &Value, descriptor: PreferenceMergeCatalog) -> Result<String, String> {
    let mut object = value
        .as_object()
        .ok_or_else(|| "Configuration record must be an object".to_string())?
        .clone();
    object.remove(descriptor.identityField);
    for field in descriptor.ignoredFields {
        object.remove(*field);
    }
    serde_json::to_string(&canonicalValue(Value::Object(object))).map_err(|error| error.to_string())
}

/// Produces a stable structural representation without treating JSON text order as business data.
fn canonicalValue(value: Value) -> Value {
    match value {
        Value::Object(object) => Value::Object(
            object
                .into_iter()
                .map(|(key, value)| (key, canonicalValue(value)))
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .collect::<Map<_, _>>(),
        ),
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalValue).collect()),
        other => other,
    }
}

/// Extracts an identity only from a validated catalog root key.
fn catalogIdentity(key: &str, catalog: PreferenceMergeCatalog) -> Result<&str, String> {
    if !keyMatches(key, catalog) {
        return Err("Identity alias does not target a declared entity".into());
    }
    key.strip_prefix(catalog.keyPrefix)
        .and_then(|id| id.strip_suffix(catalog.keySuffix))
        .ok_or_else(|| "Invalid catalog identity key".into())
}

/// Matches only the declared entity key pattern, excluding retired membership keys.
fn keyMatches(key: &str, descriptor: PreferenceMergeCatalog) -> bool {
    if descriptor.retiredKeys.contains(&key) {
        return false;
    }
    key.strip_prefix(descriptor.keyPrefix)
        .and_then(|rest| rest.strip_suffix(descriptor.keySuffix))
        .is_some_and(|identity| !identity.is_empty())
}

/// Writes canonical records without modifying unrelated preferences or emitting new operations.
fn writeRecords(
    preferences: &mut Preferences,
    descriptor: PreferenceMergeCatalog,
    records: &[ConfigRecord],
) -> Result<(), PreferencesDataStoreError> {
    let keys = preferences
        .iterEntries()
        .filter_map(|(key, _)| keyMatches(key, descriptor).then(|| key.to_string()))
        .collect::<Vec<_>>();
    for key in keys {
        preferences.remove(&stringPreferencesKey(&key));
    }
    for key in descriptor.retiredKeys {
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
    path: &[PreferenceMergePathSegment],
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
    let object = value
        .as_object_mut()
        .ok_or_else(|| "Declared preference reference selector requires an object".to_string())?;
    match segment {
        PreferenceMergePathSegment::Field(field) => {
            let child = object.get_mut(*field).ok_or_else(|| {
                format!("Declared preference reference field is missing: {field}")
            })?;
            rewriteReferenceValue(child, remaining, target, referenceMap)?;
        }
        PreferenceMergePathSegment::ObjectValues => {
            for child in object.values_mut() {
                rewriteReferenceValue(child, remaining, target, referenceMap)?;
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
