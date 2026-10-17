import type { Storage, StorageMergeDescriptor, StorageTable } from "../../../../../types/storage";
import * as definition from "./schema.json";

interface FieldPresence {
  nullEncoding?: "column";
  nullable?: boolean;
  optional?: boolean;
}
export type NodeSchema = FieldPresence &
  (
    | { kind: "text" | "number" | "integer" | "boolean" | "vector" }
    | { kind: "object"; fields: Record<string, NodeSchema> }
    | { kind: "array" | "map"; item: NodeSchema }
  );
interface Layout {
  name: string;
  node: NodeSchema;
  table: StorageTable;
  children: Layout[];
}
type Row = Record<string, Storage.SqlValue>;
export type RelationalMutation = (
  { op: "put"; value: Storage.Value } | { op: "delete" }
) & { collection: string; key: string; expectedVersion: string | null };
export const characterSchemaVersion = definition.version;
const schemas = definition.collections as Record<string, NodeSchema>;

/** Quotes only identifiers originating in the declared plugin schema. */
function quote(name: string): string {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name))
    throw new Error("Invalid relational identifier: " + name);
  return '"' + name + '"';
}
/** Names a flattened field without interpreting business values. */
function field(path: string): string {
  return path === "" ? "_value" : path;
}
/** Keeps released presence columns while storing explicitly declared nullable scalars directly. */
function usesPresenceColumn(node: NodeSchema): boolean {
  if (node.nullEncoding === "column") {
    if (!node.nullable || node.optional || node.kind === "object" || node.kind === "array" || node.kind === "map")
      throw new Error("Column null encoding requires a required nullable scalar");
    return false;
  }
  return node.optional === true || node.nullable === true;
}
/** Builds typed columns and separate ordered tables for each declared collection. */
function layout(name: string, node: NodeSchema, child = false): Layout {
  const columns: StorageTable["columns"] = [
    { name: "_key", affinity: "text", nullable: false },
    { name: "_revision", affinity: "text", nullable: false },
  ];
  if (child)
    columns.push(
      { name: "_root", affinity: "text", nullable: false },
      { name: "_parent", affinity: "text", nullable: false },
      { name: "_position", affinity: "integer", nullable: false },
      { name: "_map_key", affinity: "text", nullable: true },
    );
  const children: Layout[] = [];
  /** Flattens objects and declares each nested collection as a real relation. */
  function visit(schema: NodeSchema, path: string, absent: boolean): void {
    if (usesPresenceColumn(schema))
      columns.push({
        name: field(path) + "__state",
        affinity: "integer",
        nullable: absent,
      });
    const nullable =
      absent || schema.optional === true || schema.nullable === true;
    if (schema.kind === "object") {
      for (const [key, value] of Object.entries(schema.fields).sort(
        ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
      ))
        visit(value, path === "" ? key : path + "__" + key, nullable);
    } else if (schema.kind === "array" || schema.kind === "map") {
      columns.push({
        name: field(path) + "__count",
        affinity: "integer",
        nullable,
      });
      children.push(layout(name + "_" + field(path), schema.item, true));
    } else
      columns.push({
        name: field(path),
        affinity:
          schema.kind === "text"
            ? "text"
            : schema.kind === "vector"
              ? "blob"
              : schema.kind === "boolean" || schema.kind === "integer"
                ? "integer"
                : "real",
        nullable,
      });
  }
  visit(node, "", false);
  return { name, node, table: { name, primaryKey: "_key", columns }, children };
}
export const layouts = Object.fromEntries(
  Object.entries(schemas).map(([name, node]) => [name, layout(name, node)]),
);

/** Declares the character-card entity and reference contract enforced by Core during space merge. */
export const spaceMergeDescriptor: StorageMergeDescriptor = {
  version: 3,
  maxEntities: 6,
  maxReferences: 48,
  entities: [
    {
      collection: "cards",
      identityColumn: "id",
      nameColumn: "name",
      ignoredColumns: ["_revision", "id", "createdAt", "updatedAt"],
      keyEncoding: "length_prefixed_root",
      matchMode: "content",
      keyReferences: [],
      childCollections: tables(layouts["cards"]).slice(1).map(child => child.name),
      references: [
        { collection: "cards", column: "chatProviderId", target: { kind: "preference", path: "runtime/config/preferences/model_configs.preferences.json" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
        { collection: "cards", column: "ttsConfigId", target: { kind: "preference", path: "runtime/config/preferences/tts_configs.preferences.json" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
        { collection: "cards", column: "themeConfigId", target: { kind: "preference", path: "runtime/config/preferences/user_preferences.preferences.json" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
        { collection: "cards", column: "sharedMemoryId", target: { kind: "collection", collection: "stores" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
        { collection: "cards_attachedTagIds", column: "_value", target: { kind: "collection", collection: "tags" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
        { collection: "cards_sharedMemoryMounts", column: "sharedMemoryId", target: { kind: "collection", collection: "stores" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
      ],
    },
    {
      collection: "groups",
      identityColumn: "id",
      nameColumn: "name",
      ignoredColumns: ["_revision", "id", "createdAt", "updatedAt"],
      keyEncoding: "length_prefixed_root",
      matchMode: "content",
      keyReferences: [],
      childCollections: tables(layouts["groups"]).slice(1).map(child => child.name),
      references: [
        { collection: "groups", column: "themeConfigId", target: { kind: "preference", path: "runtime/config/preferences/user_preferences.preferences.json" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
        { collection: "groups_members", column: "characterCardId", target: { kind: "collection", collection: "cards" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
      ],
    },
    {
      collection: "tags",
      identityColumn: "id",
      nameColumn: "name",
      ignoredColumns: ["_revision", "id", "createdAt", "updatedAt"],
      keyEncoding: "length_prefixed_root",
      matchMode: "content",
      keyReferences: [],
      childCollections: [],
      references: [],
    },
    {
      collection: "stores",
      identityColumn: "id",
      nameColumn: "name",
      ignoredColumns: ["_revision", "id", "createdAt", "updatedAt"],
      keyEncoding: "length_prefixed_root",
      matchMode: "content",
      keyReferences: [],
      childCollections: [],
      references: [],
    },
    {
      collection: "owners",
      identityColumn: "ownerKey",
      nameColumn: null,
      ignoredColumns: ["_revision"],
      keyEncoding: "slash_root",
      matchMode: "identity",
      keyReferences: [
        { collection: "cards", prefix: "character:" },
        { collection: "stores", prefix: "shared:" },
      ],
      childCollections: ["memories", "links", "chunks", "candidates", "embeddings"],
      references: [
        { collection: "owners", column: "ownerKey", target: { kind: "collection", collection: "cards" }, keyPrefix: "character:", keySuffix: "", valueEncoding: "direct" },
        { collection: "owners", column: "ownerKey", target: { kind: "collection", collection: "stores" }, keyPrefix: "shared:", keySuffix: "", valueEncoding: "direct" },
        { collection: "owners", column: "userDocumentPath", target: { kind: "collection", collection: "owners" }, keyPrefix: "owners/", keySuffix: "/USER.md", valueEncoding: "uri_component" },
        { collection: "memories", column: "ownerKey", target: { kind: "collection", collection: "cards" }, keyPrefix: "character:", keySuffix: "", valueEncoding: "direct" },
        { collection: "memories", column: "ownerKey", target: { kind: "collection", collection: "stores" }, keyPrefix: "shared:", keySuffix: "", valueEncoding: "direct" },
        { collection: "links", column: "ownerKey", target: { kind: "collection", collection: "cards" }, keyPrefix: "character:", keySuffix: "", valueEncoding: "direct" },
        { collection: "links", column: "ownerKey", target: { kind: "collection", collection: "stores" }, keyPrefix: "shared:", keySuffix: "", valueEncoding: "direct" },
        { collection: "chunks", column: "ownerKey", target: { kind: "collection", collection: "cards" }, keyPrefix: "character:", keySuffix: "", valueEncoding: "direct" },
        { collection: "chunks", column: "ownerKey", target: { kind: "collection", collection: "stores" }, keyPrefix: "shared:", keySuffix: "", valueEncoding: "direct" },
        { collection: "candidates", column: "ownerKey", target: { kind: "collection", collection: "cards" }, keyPrefix: "character:", keySuffix: "", valueEncoding: "direct" },
        { collection: "candidates", column: "ownerKey", target: { kind: "collection", collection: "stores" }, keyPrefix: "shared:", keySuffix: "", valueEncoding: "direct" },
        { collection: "embeddings", column: "ownerKey", target: { kind: "collection", collection: "cards" }, keyPrefix: "character:", keySuffix: "", valueEncoding: "direct" },
        { collection: "embeddings", column: "ownerKey", target: { kind: "collection", collection: "stores" }, keyPrefix: "shared:", keySuffix: "", valueEncoding: "direct" },
      ],
    },
    {
      collection: "meta",
      identityColumn: "_key",
      nameColumn: null,
      ignoredColumns: ["_revision"],
      keyEncoding: "length_prefixed_root",
      matchMode: "identity",
      keyReferences: [],
      childCollections: [],
      references: [
        { collection: "meta", column: "active__CharacterCard__id", target: { kind: "collection", collection: "cards" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
        { collection: "meta", column: "active__CharacterGroup__id", target: { kind: "collection", collection: "groups" }, keyPrefix: "", keySuffix: "", valueEncoding: "direct" },
      ],
    },
  ],
};

/** Applies one owner migration and returns the complete guarded mutations for its transaction. */
type SchemaMigrationStep = (version: number) => Promise<RelationalMutation[]>;

/** Reads the persisted owner schema version without accepting malformed migration metadata. */
function schemaVersion(entry: Storage.ListedEntry | null): number {
  if (entry === null) return 1;
  if (entry.value === null || Array.isArray(entry.value) || typeof entry.value !== "object")
    throw new Error("Invalid character schema migration record");
  const version = entry.value.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    throw new Error("Invalid character schema migration version");
  return version;
}

/** Runs the character owner migration table using one explicit switch per released schema version. */
export async function migrateCharacterSchema(
  database: RelationalDatabase,
  readModels: () => Promise<readonly { providerId: string; modelId: string }[]>,
): Promise<void> {
  await database.migrateSchema("character", characterSchemaVersion, async version => {
    switch (version) {
      case 1: {
        const models = await readModels();
        const mutations: RelationalMutation[] = [];
        for (const entry of await database.read("cards")) {
          const card = entry.value as Record<string, Storage.Value>;
          if (card.chatModelBindingMode !== "FIXED_MODEL" || card.chatModelId === null || card.chatProviderId !== null) continue;
          const candidates = models.filter(model => model.modelId === card.chatModelId);
          if (candidates.length !== 1) continue;
          mutations.push({ op: "put", collection: "cards", key: entry.key,
            expectedVersion: entry.version, value: { ...card, chatProviderId: candidates[0].providerId } });
        }
        return mutations;
      }
      default:
        throw new Error("Missing character schema migration: " + version + " -> " + (version + 1));
    }
  });
}
/** Enumerates a collection's physical tables in stable schema order. */
export function tables(root: Layout): Layout[] {
  return [root, ...root.children.flatMap(tables)];
}
/** Encodes an ordered relation identity unambiguously from its parent and slot. */
function childKey(parent: string, index: number): string {
  return parent.length + ":" + parent + ":" + index;
}
/** Encodes a finite numeric embedding with a fixed portable little-endian format. */
function vector(value: Storage.Value | undefined): Uint8Array {
  if (!Array.isArray(value))
    throw new Error("Embedding vector must be an array");
  const bytes = new Uint8Array(value.length * 8),
    view = new DataView(bytes.buffer);
  value.forEach((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item))
      throw new Error("Invalid embedding component");
    view.setFloat64(index * 8, item, true);
  });
  return bytes;
}
/** Projects a validated record into typed parent and child rows, preserving null and absent fields. */
export function encode(
  collection: string,
  key: string,
  value: Storage.Value,
  revision: string,
): Map<string, Row[]> {
  const root = layouts[collection];
  if (root === undefined)
    throw new Error("Unknown relational collection: " + collection);
  const rows = new Map(tables(root).map((table) => [table.name, [] as Row[]]));
  /** Encodes one row and its ordered descendants. */
  function record(
    current: Layout,
    identity: string,
    input: Storage.Value,
    extra: Row,
  ): void {
    const row: Row = { _key: identity, _revision: revision, ...extra };
    /** Validates explicit schema fields and writes only scalar SQLite values. */
    function visit(
      node: NodeSchema,
      path: string,
      item: Storage.Value | undefined,
      absent = false,
    ): void {
      const column = field(path);
      if (usesPresenceColumn(node))
        row[column + "__state"] =
          item === undefined ? 0 : item === null ? 1 : 2;
      if (item === undefined && !node.optional && !absent)
        throw new Error(collection + "/" + key + " missing " + path);
      if (item === null && !node.nullable && !absent)
        throw new Error(collection + "/" + key + " null " + path);
      const empty = absent || item === undefined || item === null;
      if (node.kind === "object") {
        if (!empty && (typeof item !== "object" || Array.isArray(item)))
          throw new Error("Expected object: " + path);
        if (!empty)
          for (const name of Object.keys(item as object))
            if (!Object.prototype.hasOwnProperty.call(node.fields, name))
              throw new Error("Undeclared stored field: " + path + "." + name);
        for (const [name, schema] of Object.entries(node.fields))
          visit(
            schema,
            path === "" ? name : path + "__" + name,
            empty ? undefined : (item as Record<string, Storage.Value>)[name],
            empty,
          );
      } else if (node.kind === "array" || node.kind === "map") {
        if (empty) {
          row[column + "__count"] = null;
          return;
        }
        if (node.kind === "array" && !Array.isArray(item))
          throw new Error("Expected array: " + path);
        if (
          node.kind === "map" &&
          (typeof item !== "object" || Array.isArray(item))
        )
          throw new Error("Expected map: " + path);
        const child = current.children.find(
          (table) => table.name === current.name + "_" + column,
        )!;
        const items =
          node.kind === "array"
            ? (item as Storage.Value[]).map(
                (entry, index) => [null, entry] as const,
              )
            : Object.entries(item as Record<string, Storage.Value>);
        row[column + "__count"] = items.length;
        items.forEach(([mapKey, entry], index) =>
          record(child, childKey(identity, index), entry, {
            _root: key,
            _parent: identity,
            _position: index,
            _map_key: mapKey,
          }),
        );
      } else if (empty) row[column] = null;
      else if (node.kind === "vector") row[column] = vector(item);
      else if (node.kind === "boolean") {
        if (typeof item !== "boolean")
          throw new Error("Expected boolean: " + path);
        row[column] = item ? 1 : 0;
      } else if (node.kind === "text") {
        if (typeof item !== "string") throw new Error("Expected text: " + path);
        row[column] = item;
      } else {
        if (typeof item !== "number" || !Number.isFinite(item))
          throw new Error("Expected finite number: " + path);
        if (node.kind === "integer" && !Number.isSafeInteger(item))
          throw new Error("Expected safe integer: " + path);
        row[column] = item;
      }
    }
    visit(current.node, "", input);
    rows.get(current.name)!.push(row);
  }
  record(root, key, value, {});
  return rows;
}
/** Decodes a standalone root through the same relation codec used by database reads. */
export function decode(
  collection: string,
  row: Row,
  rows: Map<string, Row[]>,
): Storage.Value {
  const root = layouts[collection];
  if (root === undefined)
    throw new Error("Unknown relational collection: " + collection);
  return decodeLayout(root, row, indexRelations(root, rows));
}

type RelationIndex = Map<string, Map<Storage.SqlValue, Row[]>>;

/** Groups ordered child rows once so decoding never rescans a whole collection per parent. */
function indexRelations(root: Layout, rows: Map<string, Row[]>): RelationIndex {
  const index: RelationIndex = new Map();
  for (const table of tables(root)) {
    for (const child of table.children) {
      const parents = new Map<Storage.SqlValue, Row[]>(
        rows.get(table.name)!.map((row) => [row._key, []]),
      );
      for (const row of rows.get(child.name)!) {
        const siblings = parents.get(row._parent);
        if (siblings === undefined)
          throw new Error("Orphan relation: " + child.name);
        siblings.push(row);
      }
      for (const siblings of parents.values())
        siblings.sort(
          (left, right) => Number(left._position) - Number(right._position),
        );
      index.set(child.name, parents);
    }
  }
  return index;
}

/** Decodes a declared layout or scalar projection using one shared field codec. */
function decodeLayout(
  root: Layout,
  row: Row,
  rows: RelationIndex = new Map(),
): Storage.Value {
  /** Decodes fields and rejects incomplete relation ordering. */
  function record(current: Layout, stored: Row): Storage.Value {
    /** Decodes the declared scalar, object or relation at an exact field path. */
    function visit(node: NodeSchema, path: string): Storage.Value | undefined {
      const column = field(path);
      if (node.nullEncoding === "column" && stored[column] === null) return null;
      if (usesPresenceColumn(node)) {
        const state = Number(stored[column + "__state"]);
        if (state === 0 && node.optional) return undefined;
        if (state === 1 && node.nullable) return null;
        if (state !== 2) throw new Error("Invalid field presence: " + path);
      }
      if (node.kind === "object") {
        const value: Record<string, Storage.Value> = {};
        for (const [key, schema] of Object.entries(node.fields)) {
          const item = visit(schema, path === "" ? key : path + "__" + key);
          if (item !== undefined) value[key] = item;
        }
        return value;
      }
      if (node.kind === "array" || node.kind === "map") {
        const child = current.children.find(
          (table) => table.name === current.name + "_" + column,
        )!;
        const children = rows.get(child.name)!.get(stored._key)!;
        if (children.length !== Number(stored[column + "__count"]))
          throw new Error("Incomplete relation: " + child.name);
        children.forEach((item, index) => {
          if (
            Number(item._position) !== index ||
            item._key !== childKey(String(stored._key), index) ||
            item._revision !== stored._revision
          )
            throw new Error("Incomplete ordered relation: " + child.name);
        });
        if (node.kind === "array")
          return children.map((item) => record(child, item));
        const result: Record<string, Storage.Value> = {};
        for (const item of children) {
          if (
            typeof item._map_key !== "string" ||
            Object.prototype.hasOwnProperty.call(result, item._map_key)
          )
            throw new Error("Invalid map relation");
          Object.defineProperty(result, item._map_key, {
            value: record(child, item),
            enumerable: true,
          });
        }
        return result;
      }
      const value = stored[column];
      if (node.kind === "vector") {
        if (
          !(value instanceof Uint8Array) &&
          Object.prototype.toString.call(value) !== "[object Uint8Array]"
        )
          throw new Error("Invalid embedding bytes");
        const bytes = value as Uint8Array;
        if (bytes.byteLength % 8 !== 0)
          throw new Error("Invalid embedding length");
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        return Array.from({ length: bytes.byteLength / 8 }, (_, index) =>
          view.getFloat64(index * 8, true),
        );
      }
      if (node.kind === "boolean") {
        if (value !== 0 && value !== 1 && value !== 0n && value !== 1n)
          throw new Error("Invalid stored boolean");
        return Number(value) === 1;
      }
      if (node.kind === "text") {
        if (typeof value !== "string")
          throw new Error("Invalid stored text: " + path);
        return value;
      }
      if (typeof value !== "number" && typeof value !== "bigint")
        throw new Error("Invalid stored number: " + path);
      const number = Number(value);
      if (
        !Number.isFinite(number) ||
        (node.kind === "integer" && !Number.isSafeInteger(number))
      )
        throw new Error("Invalid stored number: " + path);
      return number;
    }
    return visit(current.node, "")!;
  }
  return record(root, row);
}

/** Decodes a declared scalar object projection without reading its unrelated relations. */
export function decodeScalarProjection(
  collection: string,
  fieldName: string,
  row: Row,
): Storage.Value {
  const root = layouts[collection].node;
  if (root.kind !== "object")
    throw new Error("Projection requires an object collection");
  const node = root.fields[fieldName];
  if (node.kind !== "object")
    throw new Error("Projection requires an object field");
  const projected: Row = {};
  for (const [name, schema] of Object.entries(node.fields)) {
    if (
      schema.kind !== "text" &&
      schema.kind !== "number" &&
      schema.kind !== "integer" &&
      schema.kind !== "boolean"
    ) {
      throw new Error("Projection requires scalar fields");
    }
    projected[name] = row[fieldName + "__" + name];
  }
  // The projection uses the same scalar decoder as complete records.
  const name = collection + "_" + fieldName + "_projection";
  return decodeLayout(
    { name, node, table: layouts[collection].table, children: [] },
    projected,
  );
}

/** Owns the plugin's typed SQL tables and atomic versioned mutations. */
export class RelationalDatabase {
  private sequence = 0;
  private readonly executionId = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, "0"),
  ).join("");
  /** Retains the generic host SQL handle. */
  private constructor(readonly sql: Storage.SqliteDatabase) {}
  /** Commits one versioned schema step together with its durable migration marker. */
  async migrateSchema(
    key: string,
    targetVersion: number,
    step: SchemaMigrationStep,
  ): Promise<void> {
    let marker = await this.get("schema_migrations", key);
    let version = schemaVersion(marker);
    if (version > targetVersion) throw new Error("Stored schema is newer than this runtime");
    while (version < targetVersion) {
      const mutations = await step(version);
      const nextVersion = version + 1;
      await this.commit([
        ...mutations,
        {
          op: "put",
          collection: "schema_migrations",
          key,
          expectedVersion: marker?.version ?? null,
          value: { version: nextVersion },
        },
      ]);
      marker = await this.get("schema_migrations", key);
      version = schemaVersion(marker);
    }
  }
  /** Opens the sole runtime database and declares its exact typed schema. */
  static async open(): Promise<RelationalDatabase> {
    const directory = ToolPkg.getSpaceDataDir();
    if (typeof directory !== "string" || directory.trim() === "")
      throw new Error("Plugin data directory is unavailable");
    const sql = await Tools.Storage.sqlite.open({
      path: directory + "/characters-relational.sqlite",
      merge: spaceMergeDescriptor,
    });
    for (const root of Object.values(layouts))
      for (const table of tables(root)) await sql.defineTable(table.table);
    for (const root of Object.values(layouts))
      for (const child of tables(root).slice(1))
        await sql.execute(
          "CREATE INDEX IF NOT EXISTS " +
            quote(child.name + "_root_idx") +
            " ON " +
            quote(child.name) +
            ' ("_root", "_parent", "_position")',
        );
    await sql.execute(
      'CREATE INDEX IF NOT EXISTS "chat_binding_selection_idx" ON "chat_bindings" ("selection")',
    );
    return new RelationalDatabase(sql);
  }
  /** Reads a collection as typed records with all child rows from the same guarded operation snapshot. */
  async read<T = Storage.Value>(collection: string, key?: string): Promise<Storage.ListedEntry<T>[]> {
    const root = layouts[collection];
    if (root === undefined)
      throw new Error("Unknown relational collection: " + collection);
    const rows = new Map<string, Row[]>();
    for (const table of tables(root))
      rows.set(
        table.name,
        await this.sql.query(
          "SELECT * FROM " +
            quote(table.name) +
            (key === undefined
              ? ""
              : " WHERE " + quote(table === root ? "_key" : "_root") + " = ?") +
            ' ORDER BY "_key"',
          key === undefined ? [] : [key],
        ),
      );
    const relations = indexRelations(root, rows);
    return rows.get(collection)!.map((row) => {
      if (typeof row._key !== "string" || typeof row._revision !== "string")
        throw new Error("Invalid stored identity");
      return {
        key: row._key,
        version: row._revision,
        value: decodeLayout(root, row, relations) as T,
      };
    });
  }
  /** Reads one exact root identity and its declared child relations. */
  async get<T = Storage.Value>(
    collection: string,
    key: string,
  ): Promise<Storage.ListedEntry<T> | null> {
    const rows = await this.read<T>(collection, key);
    return rows.length === 0 ? null : rows[0];
  }
  /** Writes guarded roots and their relations atomically through the host journal. */
  async commit(mutations: RelationalMutation[], whenAbsent?: {collection: string; key: string}): Promise<Storage.Receipt | null> {
    const version = this.executionId + ":" + ++this.sequence;
    const statements: Storage.Statement[] = [];
    for (const mutation of mutations) {
      const root = layouts[mutation.collection];
      if (root === undefined)
        throw new Error(
          "Unknown relational collection: " + mutation.collection,
        );
      const { key, expectedVersion } = mutation;
      if (mutation.op === "delete") {
        statements.push({
          sql:
            "DELETE FROM " +
            quote(root.name) +
            ' WHERE "_key" = ? AND "_revision" = ?',
          params: [key, expectedVersion],
          expectedAffectedRows: 1,
        });
      } else {
        const encoded = encode(root.name, key, mutation.value, version);
        const row = encoded.get(root.name)![0];
        statements.push(rootWrite(root.name, row, expectedVersion));
        if (expectedVersion !== null)
          statements.push(...deleteRelations(root, key));
        for (const table of tables(root).slice(1)) {
          for (const child of encoded.get(table.name)!)
            statements.push(insertRow(table.name, child));
        }
      }
      if (mutation.op === "delete")
        statements.push(...deleteRelations(root, key));
    }
    if (statements.length === 0 || statements.length > 1000) {
      throw new Error(
        "Relational operation exceeds the host transaction statement limit",
      );
    }
    const result = await this.sql.transaction(statements, whenAbsent === undefined ? undefined : { whenAbsent });
    return result.length === 0 ? null : { version };
  }
}

/** Inserts one declared row and requires one genuinely affected identity. */
function insertRow(table: string, row: Row): Storage.Statement {
  const columns = Object.keys(row);
  return {
    sql:
      "INSERT INTO " +
      quote(table) +
      " (" +
      columns.map(quote).join(", ") +
      ") VALUES (" +
      columns.map(() => "?").join(", ") +
      ")",
    params: columns.map((column) => row[column]),
    expectedAffectedRows: 1,
  };
}

/** Chooses creation or an exact-version update from the caller's declared write intent. */
function rootWrite(
  table: string,
  row: Row,
  expectedVersion: string | null,
): Storage.Statement {
  if (expectedVersion === null) return insertRow(table, row);
  const columns = Object.keys(row).filter((column) => column !== "_key");
  return {
    sql:
      "UPDATE " +
      quote(table) +
      " SET " +
      columns.map((column) => quote(column) + " = ?").join(", ") +
      ' WHERE "_key" = ? AND "_revision" = ?',
    params: [
      ...columns.map((column) => row[column]),
      row._key,
      expectedVersion,
    ],
    expectedAffectedRows: 1,
  };
}

/** Removes only descendants of the already guarded root inside the same transaction. */
function deleteRelations(root: Layout, key: string): Storage.Statement[] {
  return tables(root)
    .slice(1)
    .reverse()
    .map((child) => ({
      sql: "DELETE FROM " + quote(child.name) + ' WHERE "_root" = ?',
      params: [key],
    }));
}
