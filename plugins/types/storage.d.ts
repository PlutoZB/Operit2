// Generated from operit-plugin-sdk Rust declarations.

import type { StorageMergeDescriptor, StorageRequest, StorageTable } from "./storage.generated";

/**
 * Dispatches the exact wire contract through the authenticated host.
 */
export namespace Storage {
  /**
   * Represents a structured value stored by the object database.
   */
  export type Value = null | boolean | number | string | Value[] | ValueObject;

  /**
   * Stores recursive structured properties as a named object declaration.
   */
  export interface ValueObject {
    [key: string]: Value;
  }

  /**
   * Preserves native JavaScript SQLite values.
   */
  export type SqlValue = null | string | number | bigint | Uint8Array;

  /**
   * Selects a plugin-owned path and its merge contract.
   */
  export interface OpenOptions {
    path: string;
    merge?: StorageMergeDescriptor;
  }

  /**
   * Selects the exact previous record version, including explicit absence.
   */
  export interface VersionOptions {
    expectedVersion?: string | null;
  }

  /**
   * Reports the committed logical version.
   */
  export interface Receipt {
    version: string;
  }

  /**
   * Carries one decoded record and its exact version.
   */
  export interface Entry<T = Value> {
    value: T;
    version: string;
  }

  /**
   * Carries one primary-key-ordered record.
   */
  export interface ListedEntry<T = Value> extends Entry<T> {
    key: string;
  }

  /**
   * Cancels a pending storage read when the owning collector is released.
   */
  export interface WatchOptions {
    signal?: AbortSignal;
  }

  /**
   * Owns a database handle within one authenticated engine.
   */
  export interface Handle {
    path: string;
    /**
     * Releases the current execution handle without deleting durable data.
     */
    close(): Promise<void>;
  }

  /**
   * Selects one parameterized SQL write.
   */
  export interface Statement {
    sql: string;
    params?: SqlValue[];
    expectedAffectedRows?: number;
  }

  /**
   * Reports the result of one committed SQL statement.
   */
  export interface SqlReceipt {
    affectedRows: number;
    lastInsertId: string;
  }

  /**
   * Selects one collection record identity.
   */
  export interface WhenAbsent {
    collection: string;
    key: string;
  }

  /**
   * Guards a SQL batch against an existing record.
   */
  export interface TransactionOptions {
    whenAbsent: WhenAbsent;
  }

  /**
   * Owns a parameterized SQL database.
   */
  export interface SqliteDatabase extends Handle {
    /**
     * Queries caller-selected columns while preserving integer precision.
     */
    query(sql: string, params?: SqlValue[]): Promise<Record<string, SqlValue>[]>;
    /**
     * Commits a parameterized statement and its change journal atomically.
     */
    execute(sql: string, params?: SqlValue[]): Promise<SqlReceipt>;
    /**
     * Commits a bounded SQL transaction with an optional absence guard.
     */
    transaction(statements: Statement[], options?: TransactionOptions): Promise<SqlReceipt[]>;
    /**
     * Declares a tracked table with a nonnullable primary key.
     */
    defineTable(table: StorageTable): Promise<DefineTableReceipt>;
  }

  /**
   * Reports whether a tracked table was newly defined.
   */
  export interface DefineTableReceipt {
    changed: boolean;
  }

  /**
   * Retains a mutable object with its original exact version.
   */
  export interface Editor<T = Value> {
    value: T;
    /**
     * Atomically flushes tracked edits against the original version.
     */
    flush(): Promise<Receipt>;
  }

  /**
   * Selects a collection within the owned database.
   */
  export interface Collection<T = Value> {
    marker: T;
    /**
     * Reads a record without conflating a stored null with an absent key.
     */
    get(key: string): Promise<Entry<T> | null>;
    /**
     * Emits the current record or absence and subsequent changes to this exact key.
     */
    watch(key: string, options?: WatchOptions): AsyncIterableIterator<Entry<T> | null>;
    /**
     * Lists primary-key-ordered records with a bounded page size.
     */
    list(after?: string | null, limit?: number): Promise<ListedEntry<T>[]>;
    /**
     * Saves one structured record with an optional version precondition.
     */
    put(key: string, value: T, options?: VersionOptions): Promise<Receipt>;
    /**
     * Removes one record with an optional version precondition.
     */
    remove(key: string, options?: VersionOptions): Promise<Receipt>;
    /**
     * Opens an existing object for tracked edits.
     */
    edit(key: string): Promise<Editor<T>>;
  }

  /**
   * Describes a bounded atomic object mutation.
   */
  export type ObjectMutation = { op: "put"; collection: string; key: string; value: Value; expectedVersion?: string | null; } | { op: "delete"; collection: string; key: string; expectedVersion?: string | null; };

  /**
   * Owns an object database with exact-key collection subscriptions.
   */
  export interface ObjectDatabase extends Handle {
    /**
     * Selects a collection on this retained database handle.
     */
    collection<T>(name: string): Collection<T>;
    /**
     * Commits bounded mutations across collections atomically.
     */
    commit(mutations: ObjectMutation[]): Promise<Receipt>;
  }

  /**
   * Selects atomic key writes, removals, and exact preconditions.
   */
  export interface DataStoreBatch {
    set?: Record<string, Value>;
    remove?: string[];
    expectedVersions?: Record<string, string | null>;
  }

  /**
   * Owns one key-value database with exact-key subscriptions.
   */
  export interface DataStore extends Handle, Collection {
    /**
     * Commits key writes and removals atomically.
     */
    commit(batch: DataStoreBatch): Promise<Receipt>;
  }

  /**
   * Opens SQLite at an explicit plugin-owned path.
   */
  export namespace sqlite {
    /**
     * Opens a parameterized SQLite database.
     */
    function open(options: Storage.OpenOptions): Promise<Storage.SqliteDatabase>;
  }

  /**
   * Opens generic object collections.
   */
  export namespace objects {
    /**
     * Opens a transactional object database.
     */
    function open(options: Storage.OpenOptions): Promise<Storage.ObjectDatabase>;
  }

  /**
   * Opens a transactional key-value store.
   */
  export namespace dataStore {
    /**
     * Opens the named plugin-owned key-value database.
     */
    function open(options: Storage.OpenOptions): Promise<Storage.DataStore>;
  }

  /**
   * Dispatches one typed wire request.
   */
  function request(request: StorageRequest): Promise<any>;
}

export type { StorageRequest, StorageTable, StorageSqlValue, StorageMergeDescriptor, StorageKind, StorageColumn, StorageColumnType, StorageMutation, StorageStatement, StorageMergeEntity, StorageMergeReference, StorageMergeTarget, StorageMergeKeyEncoding } from "./storage.generated";
