import type { Storage } from "../../../../../../types/storage";
import type { Chat } from "../../../../../../types/chat";
import type { CharacterStorage } from "../preferences";
import { configurationNames, recordPrefix } from "../preferences";
import type { ObjectMutation } from "../memory";
import type { StoredRecord } from "../records";
type RecordChange = { collection: string; key: string; expectedValue: Storage.Value | null } &
  ({ op: "put"; value: Storage.Value } | { op: "delete" });
import { uuid } from "../../identity";
import { assertInteger, assertObject, requireId } from "../../validation";
import { clone, equal, records, stateFromRecords, storedValue } from "../records";
import { assertCharacterState, userDocumentPath } from "../state";

type Document = Record<string, Storage.Value>;
type AuthorTarget = Extract<Chat.ExtensionTarget, { kind: "message" }>;
interface AuthorChange { target: AuthorTarget; before: string; after: string }
interface FileChange { source: string; destination: string }
interface MigrationPlan {
  from: "released";
  to: 1;
  phase: "files" | "authors" | "records" | "verify" | "cleanup";
  cursor: number;
  active: Storage.Value;
  identities: Record<string, string>;
  files: FileChange[];
  directories: FileChange[];
  authors: AuthorChange[];
  changes: RecordChange[][];
}

/** Rejects malformed durable work before resuming filesystem or record mutations. */
function assertMigrationPlan(value: unknown): asserts value is MigrationPlan {
  assertObject(value, "character schema migration");
  if (value.from !== "released" || value.to !== 1) throw new Error("Unsupported pending character schema migration");
  if (!["files", "authors", "records", "verify", "cleanup"].some(phase => phase === value.phase)) throw new Error("Invalid character migration phase");
  assertInteger(value.cursor, "character migration cursor", 0);
  assertObject(value.identities, "character migration identities");
  for (const field of ["files", "directories", "authors", "changes"] as const)
    if (!Array.isArray(value[field])) throw new Error("Invalid character migration work: " + field);
  for (const directory of value.directories as unknown[]) {
    assertObject(directory, "character migration directory");
    for (const field of ["source", "destination"] as const)
      if (typeof directory[field] !== "string" || !/^owners\/(?:character|shared)%3A[^/]+$/u.test(directory[field]))
        throw new Error("Invalid character migration owner directory");
    if (directory.source === directory.destination) throw new Error("Character migration owner directory must change");
  }
  for (const file of value.files as unknown[]) {
    assertObject(file, "character migration file");
    if (typeof file.source !== "string" || typeof file.destination !== "string") throw new Error("Invalid character migration file path");
    const source = file.source, destination = file.destination;
    if (!(value.directories as FileChange[]).some(directory => source.startsWith(directory.source + "/") && destination === directory.destination + source.slice(directory.source.length)))
      throw new Error("Character migration file is outside its owner directory");
  }
  for (const group of value.changes as unknown[])
    if (!Array.isArray(group) || group.length < 1 || group.length > 2) throw new Error("Invalid atomic character migration record change");
  const lengths = { files: (value.files as unknown[]).length, authors: (value.authors as unknown[]).length, records: (value.changes as unknown[]).length, verify: 0, cleanup: (value.directories as unknown[]).length };
  if (value.cursor > lengths[value.phase as keyof typeof lengths]) throw new Error("Character migration cursor exceeds its work");
}

/** Requires the host to report a successful file mutation. */
function completed(result: { successful: boolean; details: string }): void {
  if (!result.successful) throw new Error(result.details);
}

/** Resolves a declared plugin-relative resource without permitting directory traversal. */
function absolute(directory: string, relative: string): string {
  if (relative.split("/").some(part => part === "" || part === "." || part === ".." || /[\\:\u0000-\u001f]/u.test(part)))
    throw new Error("Invalid character migration resource path: " + relative);
  return directory + "/" + relative;
}

/** Enumerates exact source files before persisting any migration work. */
async function ownerFiles(directory: string, source: string, destination: string): Promise<FileChange[]> {
  const listing = await Tools.Files.list(absolute(directory, source));
  const result: FileChange[] = [];
  for (const entry of listing.entries) {
    if (entry.name === "." || entry.name === ".." || /[/\\:\u0000-\u001f]/u.test(entry.name))
      throw new Error("Invalid owner resource entry: " + entry.name);
    const from = source + "/" + entry.name, to = destination + "/" + entry.name;
    if (entry.isDirectory) result.push(...await ownerFiles(directory, from, to));
    else result.push({ source: from, destination: to });
  }
  return result;
}

/** Plans the plugin-owned released Core identities and their explicit references exactly once. */
async function prepareVersionOne(storage: CharacterStorage, metadata: Document, directory: string): Promise<MigrationPlan> {
  const rows = await migrationRecords(storage);
  const input = clone(rows);
  for (const row of input) {
    if (row.collection === "cards") { assertObject(row.value, "legacy card"); delete row.value.isDefault; }
  }
  const inputMetadata: Document = { ...metadata, version: 1 }; delete inputMetadata.legacyImportPending;
  const state = stateFromRecords(inputMetadata, input);
  const before = records(state), identities: Record<string, string> = {};
  /** Allocates a UUID in an explicit domain scope while preserving existing UUIDs. */
  function identity(scope: string, value: string): string {
    requireId(value, scope + " identity");
    const key = JSON.stringify([scope, value]);
    if (!Object.prototype.hasOwnProperty.call(identities, key)) identities[key] = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value) ? value : uuid();
    return identities[key];
  }
  /** Resolves an existing domain reference without inventing missing targets. */
  function reference(scope: string, value: string): string {
    const key = JSON.stringify([scope, value]);
    if (!Object.prototype.hasOwnProperty.call(identities, key)) throw new Error("Missing migration reference: " + key);
    return identities[key];
  }
  for (const collection of configurationNames)
    for (const record of state[collection]) record.id = identity(collection, record.id);
  /** Converts the documented selection variants without modifying Core model identities. */
  function selection(value: string): string {
    if (value === "model:chat") return value;
    if (value.startsWith("card:")) return "card:" + reference("cards", value.slice(5));
    if (value.startsWith("group:")) return "group:" + reference("groups", value.slice(6));
    throw new Error("Invalid migration selection: " + value);
  }
  for (const card of state.cards) {
    card.attachedTagIds = card.attachedTagIds.map(id => reference("tags", id));
    if (card.sharedMemoryId !== null) card.sharedMemoryId = reference("stores", card.sharedMemoryId);
    for (const mount of card.sharedMemoryMounts) mount.sharedMemoryId = reference("stores", mount.sharedMemoryId);
  }
  for (const group of state.groups)
    for (const member of group.members) member.characterCardId = reference("cards", member.characterCardId);
  for (const group of state.conversationGroups)
    if (group.ownerSelection !== null) group.ownerSelection = selection(group.ownerSelection);
  if ("CharacterCard" in state.active) state.active.CharacterCard.id = reference("cards", state.active.CharacterCard.id);
  if ("CharacterGroup" in state.active) state.active.CharacterGroup.id = reference("groups", state.active.CharacterGroup.id);
  const directories: FileChange[] = [];
  for (const owner of state.owners) {
    const old = owner.ownerKey;
    if (old.startsWith("character:")) owner.ownerKey = "character:" + reference("cards", old.slice(10));
    else if (old.startsWith("shared:")) owner.ownerKey = "shared:" + reference("stores", old.slice(7));
    else throw new Error("Invalid migration owner: " + old);
    owner.userDocumentPath = userDocumentPath(owner.ownerKey);
    if (old !== owner.ownerKey) directories.push({ source: "owners/" + encodeURIComponent(old), destination: "owners/" + encodeURIComponent(owner.ownerKey) });
    const scope = owner.ownerKey;
    for (const collection of ["memories", "links", "chunks", "candidates", "embeddings"] as const)
      for (const record of owner[collection]) record.id = identity(scope + "/" + collection, record.id);
    for (const memory of owner.memories) {
      memory.uuid = identity(scope + "/memoryUuid", memory.uuid);
      for (const tag of memory.tags) tag.id = identity(scope + "/memoryTags", tag.id);
      for (const property of memory.properties) property.id = identity(scope + "/memoryProperties", property.id);
    }
    for (const link of owner.links) {
      link.sourceMemoryId = reference(scope + "/memories", link.sourceMemoryId);
      link.targetMemoryId = reference(scope + "/memories", link.targetMemoryId);
    }
    for (const chunk of owner.chunks) chunk.memoryUuid = reference(scope + "/memoryUuid", chunk.memoryUuid);
    if (owner.rebuildTask !== null) owner.rebuildTask.id = identity(scope + "/rebuildTask", owner.rebuildTask.id);
  }
  for (const owner of state.owners) for (const memory of owner.memories)
    for (const field of ["documentPath", "chunkIndexFilePath"] as const) {
      const path = memory[field];
      if (path === null) continue;
      for (const move of directories) if (path.startsWith(move.source + "/")) {
        memory[field] = move.destination + path.slice(move.source.length);
        break;
      }
    }
  assertCharacterState(state);
  const after = records(state), changes: RecordChange[][] = [];
  const original = new Map(rows.map(row => [JSON.stringify([row.collection, row.key]), row]));
  const targets = new Set<string>();
  for (let index = 0; index < after.length; index += 1) {
    const from = before[index], to = after[index], key = JSON.stringify([to.collection, to.key]);
    if (targets.has(key)) throw new Error("Duplicate migration destination: " + key);
    targets.add(key);
    const source = original.get(JSON.stringify([from.collection, from.key]));
    if (source === undefined) throw new Error("Missing migration source record");
    if (from.key === to.key) {
      if (!equal(source.value, to.value)) changes.push([{ op: "put", collection: to.collection, key: to.key, value: to.value, expectedValue: source.value }]);
    } else {
      if (original.has(key)) throw new Error("Occupied migration destination: " + key);
      changes.push([
        { op: "put", collection: to.collection, key: to.key, value: to.value, expectedValue: null },
        { op: "delete", collection: from.collection, key: from.key, expectedValue: source.value },
      ]);
    }
  }
  for (const [key, originalValue] of (await storage.chats.data()).entries()) {
    const collection = key.startsWith("binding_") ? "chat_bindings" : key.startsWith("draft_") ? "chat_drafts" : null;
    if (collection === null) throw new Error("Unsupported chat preference during migration: " + key);
    const id = key.slice(collection === "chat_bindings" ? 8 : 6);
    assertObject(originalValue, collection); const value = clone(originalValue);
    value.selection = selection(requireId(value.selection, "stored selection"));
    if (!equal(value, originalValue)) changes.push([{ op: "put", collection, key: id, value, expectedValue: originalValue }]);
  }
  const files: FileChange[] = [];
  for (const move of directories) {
    const entries = await ownerFiles(directory, move.source, move.destination);
    if (!entries.some(entry => entry.source === move.source + "/USER.md")) throw new Error("Missing source owner USER.md: " + move.source);
    files.push(...entries);
  }
  const authors: AuthorChange[] = [];
  const cardIds = new Map(before.filter(row => row.collection === "cards").map(row => [row.key, reference("cards", row.key)]));
  if ([...cardIds].some(([old, next]) => old !== next)) {
    const chats = await Tools.Chat.listAll();
    for (const chat of chats.chats) for (let start = 0; start < chat.messageCount; start += 100) {
      const page = await Tools.Chat.getMessagesRange(chat.id, { order: "asc", start, end: Math.min(chat.messageCount - 1, start + 99) });
      for (const message of page.messages) for (let variantIndex = 0; variantIndex < message.variantCount; variantIndex += 1) {
        const target: AuthorTarget = { kind: "message", chatId: chat.id, messageTimestamp: message.timestamp, variantIndex };
        const { extension } = await Tools.Chat.readExtension(target);
        if (extension === null) continue;
        assertObject(extension, "legacy message author");
        if (Object.keys(extension).length !== 1) throw new Error("Invalid legacy message author");
        const participant = requireId(extension.participantId, "legacy participant id"), next = cardIds.get(participant);
        if (next === undefined) throw new Error("Missing message author character: " + participant);
        if (next !== participant) authors.push({ target, before: participant, after: next });
      }
    }
  }
  return { from: "released", to: 1, phase: "files", cursor: 0, active: storedValue(state.active), identities, files, directories, authors, changes };
}

/** Verifies identical bytes before accepting or retiring a migrated owner resource. */
async function verifyFile(directory: string, file: FileChange): Promise<void> {
  const source = await Tools.Files.readBinary(absolute(directory, file.source));
  const target = await Tools.Files.readBinary(absolute(directory, file.destination));
  if (source.size !== target.size || source.contentBase64 !== target.contentBase64)
    throw new Error("Character migration resource verification failed: " + file.destination);
}

/** Reads the explicit configuration owners and the independent memory engine for migration planning. */
async function migrationRecords(storage: CharacterStorage): Promise<StoredRecord[]> {
  const rows: StoredRecord[] = [], configuration = await storage.data();
  for (const name of configurationNames) for (const [key, value] of configuration[name].entries()) {
    if (!key.startsWith(recordPrefix)) throw new Error("Unknown character preference during migration: " + key);
    rows.push({ collection: name, key: key.slice(recordPrefix.length), value, version: null });
  }
  for (const collection of ["owners", "memories", "links", "chunks", "candidates", "embeddings"])
    for (const entry of await storage.memory.read(collection)) rows.push({ collection, ...entry });
  return rows;
}

/** Applies one durable migration unit and accepts only its exact source or already verified result. */
async function applyChanges(storage: CharacterStorage, changes: RecordChange[]): Promise<void> {
  const first = changes[0];
  if (first === undefined) throw new Error("Empty character migration unit");
  if (changes.some(change => change.collection !== first.collection)) throw new Error("Migration unit spans storage owners");
  const collection = first.collection;
  const name = configurationNames.find(name => name === collection);
  const store = name === undefined ? collection === "chat_bindings" || collection === "chat_drafts" ? storage.chats : null : storage.configuration[name];
  if (store !== null) {
    await store.edit(preferences => {
      const prefix = collection === "chat_bindings" ? "binding_" : collection === "chat_drafts" ? "draft_" : recordPrefix;
      for (const change of changes) {
        const key = prefix + change.key, value = preferences.get(key);
        if (change.op === "put" && equal(value, change.value) || change.op === "delete" && value === undefined) continue;
        if (change.expectedValue === null ? value !== undefined : !equal(value, change.expectedValue)) throw new Error("Character migration source changed: " + collection + "/" + change.key);
        if (change.op === "put") preferences.set(key, change.value);
        else preferences.remove(key);
      }
    });
    return;
  }
  const mutations: ObjectMutation[] = [];
  for (const change of changes) {
    const entry = await storage.memory.get(collection, change.key);
    if (change.op === "put" && entry !== null && equal(entry.value, change.value) || change.op === "delete" && entry === null) continue;
    if (change.expectedValue === null ? entry !== null : entry === null || !equal(entry.value, change.expectedValue)) throw new Error("Character memory migration source changed: " + change.key);
    mutations.push(change.op === "put" ? { op: "put", collection, key: change.key, value: change.value, expectedVersion: entry === null ? null : entry.version } : { op: "delete", collection, key: change.key, expectedVersion: entry === null ? null : entry.version });
  }
  if (mutations.length !== 0) await storage.memory.commit(mutations);
}

/** Resumes the released-data import work while the native schema callback retains the metadata snapshot. */
export async function migrateLegacyToV1(storage: CharacterStorage, preferences: Storage.MutablePreferences, directory: string, source: Document): Promise<void> {
  const metadata = clone(source);
  let plan: MigrationPlan;
  const persisted = (await storage.migration.data()).get("plan");
  if (persisted === undefined) plan = await prepareVersionOne(storage, metadata, directory);
  else { assertMigrationPlan(persisted); plan = clone(persisted); }
  let previous: Storage.Value | undefined = persisted === undefined ? undefined : storedValue(persisted);
  /** Saves the exact work cursor in a separate native preference edit for interruption recovery. */
  async function publish(): Promise<void> {
    await storage.migration.edit(work => {
      if (!equal(work.get("plan"), previous)) throw new Error("Character migration plan changed concurrently");
      work.set("plan", storedValue(clone(plan)));
    });
    previous = storedValue(clone(plan));
  }
  if (persisted === undefined) await publish();
  while (true) {
    switch (plan.phase) {
      case "files":
        for (; plan.cursor < plan.files.length;) {
          const file = plan.files[plan.cursor], destination = absolute(directory, file.destination);
          const exists = await Tools.Files.exists(destination);
          if (!exists.exists) {
            completed(await Tools.Files.mkdir(destination.slice(0, destination.lastIndexOf("/")), true));
            completed(await Tools.Files.copy(absolute(directory, file.source), destination, false));
          }
          await verifyFile(directory, file);
          plan.cursor += 1; await publish();
        }
        plan.phase = "authors"; plan.cursor = 0; await publish(); break;
      case "authors":
        for (; plan.cursor < plan.authors.length;) {
          const author = plan.authors[plan.cursor], { extension } = await Tools.Chat.readExtension(author.target);
          if (extension === null || Object.keys(extension).length !== 1 || (extension.participantId !== author.before && extension.participantId !== author.after))
            throw new Error("Message author changed during character migration");
          if (extension.participantId === author.before) await Tools.Chat.writeExtension(author.target, { participantId: author.after });
          const written = await Tools.Chat.readExtension(author.target);
          if (!equal(written.extension, { participantId: author.after })) throw new Error("Message author migration verification failed");
          plan.cursor += 1; await publish();
        }
        plan.phase = "records"; plan.cursor = 0; await publish(); break;
      case "records":
        while (plan.cursor < plan.changes.length) {
          const batch: RecordChange[] = [], collection = plan.changes[plan.cursor][0].collection;
          let cursor = plan.cursor;
          while (cursor < plan.changes.length && plan.changes[cursor][0].collection === collection && batch.length + plan.changes[cursor].length <= 1000) {
            batch.push(...plan.changes[cursor]); cursor += 1;
          }
          await applyChanges(storage, batch);
          plan.cursor = cursor;
          await publish();
        }
        plan.phase = "verify"; plan.cursor = 0; await publish(); break;
      case "verify": {
        const rows = await migrationRecords(storage);
        const finalMetadata: Document = { ...metadata, version: 1, active: plan.active }; delete finalMetadata.legacyImportPending;
        stateFromRecords(finalMetadata, rows);
        for (const group of plan.changes) for (const change of group) {
          let value: Storage.Value | undefined;
          const name = configurationNames.find(name => name === change.collection);
          if (name !== undefined) value = (await storage.configuration[name].data()).get(recordPrefix + change.key);
          else if (change.collection === "chat_bindings" || change.collection === "chat_drafts") value = (await storage.chats.data()).get((change.collection === "chat_bindings" ? "binding_" : "draft_") + change.key);
          else { const entry = await storage.memory.get(change.collection, change.key); value = entry === null ? undefined : entry.value; }
          if (change.op === "put" ? !equal(value, change.value) : value !== undefined)
            throw new Error("Character schema record verification failed: " + change.key);
        }
        for (const file of plan.files) await verifyFile(directory, file);
        plan.phase = "cleanup"; plan.cursor = 0; await publish(); break;
      }
      case "cleanup":
        for (; plan.cursor < plan.directories.length;) {
          const source = absolute(directory, plan.directories[plan.cursor].source);
          if ((await Tools.Files.exists(source)).exists) {
            for (const file of plan.files) if (file.source.startsWith(plan.directories[plan.cursor].source + "/")) await verifyFile(directory, file);
            completed(await Tools.Files.deleteFile(source, true));
          }
          plan.cursor += 1; await publish();
        }
        metadata.version = 1; metadata.active = plan.active; delete metadata.legacyImportPending;
        preferences.set("state", metadata);
        return;
      default: throw new Error("Invalid character migration phase");
    }
  }
}
