//! Canonical Rust declarations for plugin-owned database facades.
use super::core::AbortSignal;
use super::storage::{StorageMergeDescriptor, StorageRequest, StorageTable};
use super::{JsAny, JsAsyncIterableIterator, JsFuture, JsNullable};
use std::collections::BTreeMap;

/// Represents a structured value stored by the object database.
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
pub enum StorageValue {
    Null,
    Boolean(bool),
    Number(f64),
    Text(String),
    Array(Vec<StorageValue>),
    Object(StorageValueObject),
}
/// Stores recursive structured properties as a named object declaration.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageValueObject {
    #[serde(flatten)]
    pub additional_properties: BTreeMap<String, StorageValue>,
}
/// Preserves native JavaScript SQLite values.
pub enum StorageFacadeSqlValue {
    Null,
    Text(String),
    Real(f64),
    Integer(super::JsBigInt),
    Blob(super::JsUint8Array),
}
/// Selects a plugin-owned path and its merge contract.
pub struct StorageOpenOptions {
    pub path: String,
    pub merge: Option<StorageMergeDescriptor>,
}
/// Selects the exact previous record version, including explicit absence.
pub struct StorageVersionOptions {
    pub expectedVersion: super::JsOptional<String>,
}
/// Reports the committed logical version.
pub struct StorageFacadeReceipt {
    pub version: String,
}
/// Carries one decoded record and its exact version.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageEntry<T = StorageValue> {
    pub value: T,
    pub version: String,
}
/// Carries one primary-key-ordered record.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageListedEntry<T = StorageValue> {
    #[serde(flatten)]
    pub entry: StorageEntry<T>,
    pub key: String,
}
/// Cancels a pending storage read when the owning collector is released.
pub struct StorageWatchOptions {
    pub signal: Option<AbortSignal>,
}
/// Owns a database handle within one authenticated engine.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageHandle {
    pub path: String,
}
pub trait StorageHandleMethods: Send + Sync {
    /// Releases the current execution handle without deleting durable data.
    fn close(&self) -> JsFuture<()>;
}
/// Selects one parameterized SQL write.
pub struct StorageFacadeStatement {
    pub sql: String,
    pub params: Option<Vec<StorageFacadeSqlValue>>,
    pub expectedAffectedRows: Option<u32>,
}
/// Reports the result of one committed SQL statement.
pub struct StorageSqlReceipt {
    pub affectedRows: u32,
    pub lastInsertId: String,
}
/// Selects one collection record identity.
pub struct StorageFacadeWhenAbsent {
    pub collection: String,
    pub key: String,
}
/// Guards a SQL batch against an existing record.
pub struct StorageTransactionOptions {
    pub whenAbsent: StorageFacadeWhenAbsent,
}
/// Owns a parameterized SQL database.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageSqliteDatabase {
    #[serde(flatten)]
    pub handle: StorageHandle,
}
pub trait StorageSqliteDatabaseMethods: Send + Sync {
    /// Queries caller-selected columns while preserving integer precision.
    fn query(
        &self,
        sql: String,
        params: Option<Vec<StorageFacadeSqlValue>>,
    ) -> JsFuture<Vec<BTreeMap<String, StorageFacadeSqlValue>>>;
    /// Commits a parameterized statement and its change journal atomically.
    fn execute(
        &self,
        sql: String,
        params: Option<Vec<StorageFacadeSqlValue>>,
    ) -> JsFuture<StorageSqlReceipt>;
    /// Commits a bounded SQL transaction with an optional absence guard.
    fn transaction(
        &self,
        statements: Vec<StorageFacadeStatement>,
        options: Option<StorageTransactionOptions>,
    ) -> JsFuture<Vec<StorageSqlReceipt>>;
    /// Declares a tracked table with a nonnullable primary key.
    fn defineTable(&self, table: StorageTable) -> JsFuture<StorageDefineTableReceipt>;
}
/// Reports whether a tracked table was newly defined.
pub struct StorageDefineTableReceipt {
    pub changed: bool,
}
/// Retains a mutable object with its original exact version.
pub struct StorageEditor<T = StorageValue> {
    pub value: T,
}
pub trait StorageEditorMethods<T>: Send + Sync {
    /// Atomically flushes tracked edits against the original version.
    fn flush(&self) -> JsFuture<StorageFacadeReceipt>;
}
/// Selects a collection within the owned database.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageCollection<T = StorageValue> {
    marker: std::marker::PhantomData<T>,
}
pub trait StorageCollectionMethods<T>: Send + Sync {
    /// Reads a record without conflating a stored null with an absent key.
    fn get(&self, key: String) -> JsFuture<JsNullable<StorageEntry<T>>>;
    /// Emits the current record or absence and subsequent changes to this exact key.
    fn watch(
        &self,
        key: String,
        options: Option<StorageWatchOptions>,
    ) -> JsAsyncIterableIterator<JsNullable<StorageEntry<T>>>;
    /// Lists primary-key-ordered records with a bounded page size.
    fn list(
        &self,
        after: Option<JsNullable<String>>,
        limit: Option<u32>,
    ) -> JsFuture<Vec<StorageListedEntry<T>>>;
    /// Saves one structured record with an optional version precondition.
    fn put(
        &self,
        key: String,
        value: T,
        options: Option<StorageVersionOptions>,
    ) -> JsFuture<StorageFacadeReceipt>;
    /// Removes one record with an optional version precondition.
    fn remove(
        &self,
        key: String,
        options: Option<StorageVersionOptions>,
    ) -> JsFuture<StorageFacadeReceipt>;
    /// Opens an existing object for tracked edits.
    fn edit(&self, key: String) -> JsFuture<StorageEditor<T>>;
}
/// Describes a bounded atomic object mutation.
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(tag = "op")]
pub enum StorageObjectMutation {
    #[serde(rename = "put")]
    Put {
        collection: String,
        key: String,
        value: StorageValue,
        expectedVersion: super::JsOptional<String>,
    },
    #[serde(rename = "delete")]
    Delete {
        collection: String,
        key: String,
        expectedVersion: super::JsOptional<String>,
    },
}
/// Owns an object database with exact-key collection subscriptions.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageObjectDatabase {
    #[serde(flatten)]
    pub handle: StorageHandle,
}
pub trait StorageObjectDatabaseMethods: Send + Sync {
    /// Selects a collection on this retained database handle.
    fn collection<T>(&self, name: String) -> StorageCollection<T>;
    /// Commits bounded mutations across collections atomically.
    fn commit(&self, mutations: Vec<StorageObjectMutation>) -> JsFuture<StorageFacadeReceipt>;
}
/// Selects atomic key writes, removals, and exact preconditions.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageDataStoreBatch {
    pub set: Option<BTreeMap<String, StorageValue>>,
    pub remove: Option<Vec<String>>,
    pub expectedVersions: Option<BTreeMap<String, JsNullable<String>>>,
}
/// Owns one key-value database with exact-key subscriptions.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageDataStore {
    #[serde(flatten)]
    pub handle: StorageHandle,
    #[serde(flatten)]
    pub collection: StorageCollection,
}
pub trait StorageDataStoreMethods: Send + Sync {
    /// Commits key writes and removals atomically.
    fn commit(&self, batch: StorageDataStoreBatch) -> JsFuture<StorageFacadeReceipt>;
}
/// Opens SQLite at an explicit plugin-owned path.
pub trait StorageSqliteHost: Send + Sync {
    /// Opens a parameterized SQLite database.
    fn open(&self, options: StorageOpenOptions) -> JsFuture<StorageSqliteDatabase>;
}
/// Opens generic object collections.
pub trait StorageObjectsHost: Send + Sync {
    /// Opens a transactional object database.
    fn open(&self, options: StorageOpenOptions) -> JsFuture<StorageObjectDatabase>;
}
/// Opens a transactional key-value store.
pub trait StorageDataStoreHost: Send + Sync {
    /// Opens the named plugin-owned key-value database.
    fn open(&self, options: StorageOpenOptions) -> JsFuture<StorageDataStore>;
}
/// Dispatches the exact wire contract through the authenticated host.
pub trait StorageFacadeHost: Send + Sync {
    /// Dispatches one typed wire request.
    fn request(&self, request: StorageRequest) -> JsFuture<JsAny>;
}
