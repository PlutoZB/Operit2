import type { Storage } from "../../../../../types/storage";
import type {
  CharacterDirectories,
  CharacterState,
  Card,
  ActivePrompt,
  Group,
  GlobalMemoryPreferences,
  MemorySettings,
  MemorySearchConfig,
  Snapshot,
  Store,
  Tag,
  UserDocument,
  UserDocumentWrite,
} from "../model";
import type {
  CharacterRepository,
  CharacterRepositoryOwner,
} from "../canonical";
import { RepositorySession } from "../repository";
import { assertCharacterState, createInitialState } from "./state";
import {
  clone,
  collections,
  equal,
  records,
  stateFromRecords,
  storedValue,
} from "./records";
import type { StoredRecord } from "./records";
import { RelationalDatabase, decodeScalarProjection, migrateCharacterSchema, characterSchemaVersion } from "./relational";
import type { RelationalMutation } from "./relational";
import {
  assertBoolean,
  assertCard,
  assertGroup,
  assertObject,
  assertString,
  assertTag,
  assertMemorySettings,
  assertSearchConfig,
  requireId,
} from "../validation";
import { userDocumentPath } from "./state";

/** Requires the original Files operation result for actual user document writes. */
function completed(result: { successful: boolean; details: string }): void {
  if (!result.successful) throw new Error(result.details);
}

/** Owns record transactions in the persistent synchronized plugin data namespace. */
export class DatabaseCharacterRepository implements CharacterRepositoryOwner {
  private busy = false;
  private publicationFailure: { error: unknown } | null = null;
  private readonly waiters: (() => void)[] = [];

  /** Retains the host database handle and the explicit external directory readers. */
  private constructor(
    private readonly database: RelationalDatabase,
    private readonly directory: string,
    private readonly directories: CharacterDirectories | null,
  ) {}

  /** Initializes a new plugin database or opens the records written by the centralized Core migration. */
  static async open(
    directories: CharacterDirectories | null = null,
  ): Promise<DatabaseCharacterRepository> {
    const directory = ToolPkg.getSpaceDataDir();
    if (typeof directory !== "string" || directory.trim() === "")
      throw new Error("Plugin data directory is unavailable");
    const database = await RelationalDatabase.open();
    const repository = new DatabaseCharacterRepository(
      database,
      directory,
      directories,
    );
    const existingMetadata = await database.get("meta", "state");
    if (existingMetadata === null) {
      const state = createInitialState(Date.now());
      assertCharacterState(state);
      const initialized = await database.commit([
        { op: "put", collection: "schema_migrations", key: "character", expectedVersion: null, value: { version: characterSchemaVersion } },
        ...records(state).map(row => ({ op: "put" as const, ...row, expectedVersion: null })),
        { op: "put", collection: "meta", key: "state", expectedVersion: null,
          value: { version: state.version, nextId: state.nextId,
            active: "Model" in state.active ? null : storedValue(state.active),
            memoryPreferences: storedValue(state.memoryPreferences) } },
      ], { collection: "meta", key: "state" });
      if (initialized !== null) {
        for (const owner of state.owners) {
          const path = directory + "/" + owner.userDocumentPath;
          completed(await Tools.Files.mkdir(path.slice(0, path.lastIndexOf("/")), true));
          completed(await Tools.Files.write(path, "", false));
        }
      }
    } else {
      await migrateCharacterSchema(database, async () => directories === null ? [] : directories.listModels());
    }
    const metadata = await database.get("meta", "state");
    if (metadata === null) throw new Error("Character initialization did not publish metadata");
    assertCharacterState(stateFromRecords(metadata.value, await repository.readRecords()));
    return repository;
  }

  /** Overlaps the fixed collection reads while preserving each collection's ordered pagination. */
  private async readRecords(): Promise<StoredRecord[]> {
    const results = await Promise.allSettled(
      collections.map(async (collection) => {
        const rows: StoredRecord[] = [];
        for (const entry of await this.database.read(collection))
          rows.push({ collection, ...entry });
        return rows;
      }),
    );
    const rows: StoredRecord[] = [];
    // Settle every read before releasing the repository queue, including on
    // failure, so a subsequent mutation cannot race an unfinished read.
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      for (const row of result.value) rows.push(row);
    }
    return rows;
  }

  /** Refreshes host records for each operation so remote synchronization and snapshot imports remain visible. */
  async run<T>(
    action: (repository: CharacterRepository) => Promise<T>,
  ): Promise<T> {
    await this.acquire();
    try {
      if (this.publicationFailure !== null) throw this.publicationFailure.error;
      const metadata = await this.database.get("meta", "state");
      if (metadata === null)
        throw new Error("Character database metadata disappeared");
      const rows = await this.readRecords(),
        checked = await this.database.get("meta", "state");
      if (checked === null || checked.version !== metadata.version)
        throw new Error(
          "Character records changed during the read; operation was not started",
        );
      assertObject(metadata.value, "character metadata");
      const before = stateFromRecords(metadata.value, rows);
      const state = clone(before),
        session = new RepositorySession(
          state,
          this.directory,
          this.directories,
        );
      const result = await action(session);
      assertCharacterState(state);
      const documents = session.documentWrites();
      const removed = before.owners
        .filter(
          (owner) =>
            !state.owners.some(
              (retained) => retained.ownerKey === owner.ownerKey,
            ),
        )
        .map(
          (owner) =>
            this.directory +
            "/" +
            owner.userDocumentPath.slice(
              0,
              owner.userDocumentPath.lastIndexOf("/"),
            ),
        );
      if (!equal(before, state) || documents.length !== 0) {
        try {
          await this.publish(
            state,
            rows,
            documents,
            removed,
            metadata.version,
            metadata.value,
          );
        } catch (error) {
          this.publicationFailure = { error };
          throw error;
        }
      }
      return result;
    } finally {
      this.release();
    }
  }

  private requirePublicationReady(): void {
    if (this.publicationFailure !== null) throw this.publicationFailure.error;
  }

  /** Retries only overlapping commits; readers never reserve the editing queue. */
  private async readConsistent<T>(read: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      this.requirePublicationReady();
      const before = await this.database.get("meta", "state");
      if (before === null) throw new Error("Character database metadata disappeared");
      assertObject(before.value, "character metadata");
      if (before.value.migrationStatus === "writing") throw new Error("Character migration has not completed");
      let result: T | undefined;
      let failure: { error: unknown } | null = null;
      try { result = await read(); } catch (error) { failure = { error }; }
      const after = await this.database.get("meta", "state");
      this.requirePublicationReady();
      if (after === null) throw new Error("Character database metadata disappeared");
      if (before.version !== after.version) continue;
      if (failure !== null) throw failure.error;
      return result as T;
    }
    throw new Error("Character records kept changing during the read; retry the operation");
  }

  /** Reads role presentation independently of memory editing and background jobs. */
  readSidebarDirectory(): Promise<Pick<Snapshot, "cards" | "groups">> {
    return this.readConsistent(async () => {
      const [cards, groups] = await Promise.all([this.readCharacters(), this.readGroups()]);
      const ids = new Set(cards.map(card => card.id));
      for (const group of groups)
        for (const member of group.members)
          if (!ids.has(member.characterCardId)) throw new Error("Missing group member: " + member.characterCardId);
      return { cards, groups };
    });
  }

  readActive(): Promise<ActivePrompt> {
    this.requirePublicationReady();
    return this.readMetadata().then(metadata => metadata.active);
  }

  /** Reads configuration records only; memory content and vectors remain in their own queries. */
  readConfigurationSnapshot(): Promise<Snapshot> {
    if (this.directories === null) throw new Error("External directory readers are unavailable");
    const directories = this.directories;
    return this.readConsistent(async () => {
      const [cards, groups, stores, tags, models, ttsConfigs, toolCatalog, metadata] = await Promise.all([
        this.readCharacters(),
        this.readGroups(),
        this.database.read<Store>("stores").then(rows => rows.map(row => row.value)),
        this.readTags(),
        Promise.resolve().then(() => directories.listModels()),
        Promise.resolve().then(() => directories.listTtsConfigs()),
        Promise.resolve().then(() => directories.readToolCatalog()),
        this.readMetadata(),
      ]);
      return { cards, groups, stores, tags, models, ttsConfigs, toolCatalog, ...metadata };
    });
  }

  listCharacters(): Promise<Card[]> { return this.readConsistent(() => this.readCharacters()); }
  listGroups(): Promise<Group[]> { return this.readConsistent(() => this.readGroups()); }
  listStores(): Promise<Store[]> {
    return this.readConsistent(async () => (await this.database.read<Store>("stores")).map(row => row.value));
  }
  listTags(): Promise<Tag[]> { return this.readConsistent(() => this.readTags()); }

  private async readCharacters(): Promise<Card[]> {
    return (await this.database.read<Card>("cards")).map(row => {
      assertCard(row.value);
      return row.value;
    });
  }

  private async readGroups(): Promise<Group[]> {
    return (await this.database.read<Group>("groups")).map(row => {
      assertGroup(row.value);
      return row.value;
    });
  }

  private async readTags(): Promise<Tag[]> {
    return (await this.database.read<Tag>("tags")).map(row => {
      assertTag(row.value);
      return row.value;
    });
  }

  getCharacter(id: string): Promise<Card> {
    requireId(id, "角色卡标识");
    return this.readConsistent(async () => {
      const row = await this.database.get<Card>("cards", id);
      if (row === null) throw new Error("Character not found: " + id);
      assertCard(row.value);
      return row.value;
    });
  }

  getGroup(id: string): Promise<Group> {
    requireId(id, "群组标识");
    return this.readConsistent(async () => {
      const row = await this.database.get<Group>("groups", id);
      if (row === null) throw new Error("Group not found: " + id);
      assertGroup(row.value);
      return row.value;
    });
  }

  private async readMetadata(): Promise<Pick<Snapshot, "active" | "memoryPreferences">> {
    const row = await this.database.get<{
      active: Exclude<ActivePrompt, { Model: { id: "chat" } }> | null;
      memoryPreferences: GlobalMemoryPreferences;
      migrationStatus?: string;
    }>("meta", "state");
    if (row === null) throw new Error("Character database metadata disappeared");
    assertObject(row.value, "character metadata");
    if (row.value.migrationStatus === "writing") throw new Error("Character migration has not completed");
    assertObject(row.value.memoryPreferences, "global memory preferences");
    assertBoolean(row.value.memoryPreferences.userDescriptionEnabled, "user description enabled");
    assertBoolean(row.value.memoryPreferences.autoUpdateEnabled, "memory auto update enabled");
    return {
      active: row.value.active ?? { Model: { id: "chat" } },
      memoryPreferences: row.value.memoryPreferences,
    };
  }

  /** Reads memory settings without loading bodies, vectors or job relations. */
  readMemorySettings(ownerKey: string): Promise<MemorySettings> {
    return this.readOwnerMetadata(ownerKey, (row) => {
      const settings = decodeScalarProjection("owners", "settings", row);
      assertMemorySettings(settings);
      return settings;
    });
  }

  /** Reads only the selected owner's search weights and mode. */
  readMemorySearchConfig(ownerKey: string): Promise<MemorySearchConfig> {
    return this.readOwnerMetadata(ownerKey, (row) => {
      const config = decodeScalarProjection("owners", "searchConfig", row);
      assertSearchConfig(config);
      return config;
    });
  }

  async readGlobalMemoryPreferences(): Promise<GlobalMemoryPreferences> {
    this.requirePublicationReady();
    return (await this.readMetadata()).memoryPreferences;
  }

  /** Reads the selected owner's actual USER.md document. */
  readUser(ownerKey: string): Promise<UserDocument> {
    return this.readOwnerMetadata(ownerKey, async (row) => {
      const document = await Tools.Files.read(
        this.ownerDocumentPath(ownerKey, row),
      );
      assertString(document.content, "USER.md content");
      return { ownerKey, content: document.content };
    });
  }

  /** Resolves the canonical document path for an existing owner. */
  readUserPath(ownerKey: string): Promise<string> {
    return this.readOwnerMetadata(ownerKey, (row) =>
      this.ownerDocumentPath(ownerKey, row),
    );
  }

  /** Validates the stored document identity before exposing a filesystem path. */
  private ownerDocumentPath(
    ownerKey: string,
    row: Record<string, Storage.SqlValue>,
  ): string {
    assertString(row.userDocumentPath, "owner document path");
    if (row.userDocumentPath !== userDocumentPath(ownerKey))
      throw new Error("Invalid owner document path");
    return this.directory + "/" + row.userDocumentPath;
  }

  /** Reads one owner directly; file IO never occupies the full-state editing queue. */
  private async readOwnerMetadata<T>(
    ownerKey: string,
    action: (row: Record<string, Storage.SqlValue>) => T | Promise<T>,
  ): Promise<T> {
    requireId(ownerKey, "memory owner");
    if (this.publicationFailure !== null) throw this.publicationFailure.error;
    const rows = await this.database.sql.query(
      `SELECT o.* FROM "owners" o JOIN "meta" state ON state."_key" = 'state'
      WHERE o."_key" = ? AND (state."migrationStatus__state" = 0 OR state."migrationStatus" = 'complete')
      AND (EXISTS (SELECT 1 FROM "cards" c WHERE 'character:' || c."id" = o."ownerKey")
        OR EXISTS (SELECT 1 FROM "stores" s WHERE 'shared:' || s."id" = o."ownerKey"))`,
      [ownerKey],
    );
    if (rows.length !== 1) throw new Error("Memory owner is missing or its migration is incomplete: " + ownerKey);
    return action(rows[0]);
  }

  /** Serializes domain sessions within this execution while exact host versions guard other executions. */
  private acquire(): Promise<void> {
    if (!this.busy) {
      this.busy = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** Grants the next waiting operation after the current session completes. */
  private release(): void {
    const waiter = this.waiters.shift();
    if (waiter === undefined) this.busy = false;
    else waiter();
  }

  /** Commits only changed domain records and retains the migration provenance in the metadata guard. */
  private async publish(
    state: CharacterState,
    before: StoredRecord[],
    documents: UserDocumentWrite[],
    removed: string[],
    metadataVersion: string | null,
    metadata: Record<string, Storage.Value>,
  ): Promise<void> {
    const previous = new Map(
      before.map((row) => [row.collection + "\0" + row.key, row]),
    );
    const mutations: RelationalMutation[] = [];
    for (const row of records(state)) {
      const key = row.collection + "\0" + row.key,
        existing = previous.get(key);
      if (existing === undefined || !equal(existing.value, row.value))
        mutations.push({
          op: "put",
          collection: row.collection,
          key: row.key,
          value: row.value,
          expectedVersion: existing === undefined ? null : existing.version,
        });
      previous.delete(key);
    }
    for (const row of previous.values())
      mutations.push({
        op: "delete",
        collection: row.collection,
        key: row.key,
        expectedVersion: row.version,
      });
    mutations.push({
      op: "put",
      collection: "meta",
      key: "state",
      value: {
        ...metadata,
        version: state.version,
        nextId: state.nextId,
        active: "Model" in state.active ? null : storedValue(state.active),
        memoryPreferences: storedValue(state.memoryPreferences),
      },
      expectedVersion: metadataVersion,
    });
    if (mutations.length > 1000)
      throw new Error(
        "Character operation exceeds the host transaction limit of 1000 records",
      );
    const stagedDocuments: { path: string; stagedPath: string }[] = [];
    for (const document of documents) {
      if (document.newDocument) {
        const existing = await Tools.Files.exists(document.path);
        if (existing.exists)
          throw new Error(
            "New owner document path is already occupied: " + document.path,
          );
        completed(
          await Tools.Files.mkdir(
            document.path.slice(0, document.path.lastIndexOf("/")),
            true,
          ),
        );
      }
      const stagedPath = document.path + ".pending";
      completed(await Tools.Files.write(stagedPath, document.content, false));
      stagedDocuments.push({ path: document.path, stagedPath });
    }
    await this.database.commit(mutations);
    for (const document of stagedDocuments)
      completed(await Tools.Files.move(document.stagedPath, document.path));
    for (const path of removed)
      completed(await Tools.Files.deleteFile(path, true));
  }
}
