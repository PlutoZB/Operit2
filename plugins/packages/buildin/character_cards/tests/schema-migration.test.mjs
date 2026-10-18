import assert from "node:assert/strict";
import test from "node:test";
import { createDiskHarness } from "./disk-files.mjs";
import { loadModule, plain } from "./runtime.mjs";
import { fixture } from "./fixtures.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reads exact plugin-relative resource bytes within the isolated disk fixture. */
function bytes(disk, relative) { return disk.readBytes(disk.directory + "/" + relative); }

/** Reads the actual migration marker independently of the TS migration implementation. */
function metadata(disk) {
  return disk.storage.inspectPreferences("meta", values => values.state);
}

/** Supplies the generic Chat host with exact revision extensions and a separate foreign namespace. */
function chatHost() {
  const extensions = new Map([[0, { participantId: "operit" }], [1, { participantId: "travel" }], [2, null]]);
  const foreign = { participantId: "unrelated-plugin-identity" }, writes = [];
  return {
    extensions, foreign, writes,
    /** Lists Core conversations without reading character binding projections. */
    async listAll() { return { chats: [{ id: "core-chat", messageCount: 1 }] }; },
    /** Supplies all revision counts through the existing paged message contract. */
    async getMessagesRange(chatId, options) {
      assert.equal(chatId, "core-chat"); assert.equal(options.start, 0);
      return { messages: [{ timestamp: 987, variantIndex: 1, variantCount: 3 }] };
    },
    /** Reads only the authenticated plugin namespace at the exact Core revision. */
    async readExtension(target) {
      assert.equal(target.chatId, "core-chat"); assert.equal(target.messageTimestamp, 987);
      assert.ok(extensions.has(target.variantIndex));
      return { extension: structuredClone(extensions.get(target.variantIndex)) };
    },
    /** Writes only the authenticated namespace while retaining foreign extensions. */
    async writeExtension(target, value) {
      writes.push(structuredClone({ target, value })); extensions.set(target.variantIndex, structuredClone(value));
      return { extension: structuredClone(value) };
    },
  };
}

/** Opens production plugin storage with generic host fixtures only. */
async function open(disk, chat) {
  const globals = { ...disk.globals, Tools: { Files: disk.files, Storage: disk.storage, Chat: chat } };
  return loadModule("src/storage/preferences.ts", globals).CharacterStorage.open();
}

/** Seeds released-shape version-one JSON records and exact owner resource bytes on real disk. */
async function seed(t, count = 3) {
  const disk = await createDiskHarness(t, { legacyIdentity: "operit" });
  const source = fixture(), model = loadModule("src/storage/state.ts");
  const state = {
    version: 1, memoryPreferences: source.snapshot.memoryPreferences,
    cards: source.snapshot.cards, groups: source.snapshot.groups, tags: source.snapshot.tags, stores: source.snapshot.stores,
    active: source.snapshot.active,
    owners: ["character:operit", "character:travel", "shared:shared-main"].map(key => plain(model.createMemorySpace(key))),
    conversationGroups: [{ id: "manual-1", ownerSelection: "group:group-one", name: "Manual group", chatIds: ["core-chat"], pinned: false, displayOrder: 0, createdAt: 1, updatedAt: 2 }],
  };
  state.cards[0].isDefault = true;
  state.cards[0].chatModelId = "external-model";
  state.cards[0].chatProviderId = "external-provider";
  state.cards[0].ttsConfigId = "external-tts";
  state.cards[0].themeConfigId = "external-theme";
  state.cards[0].sharedMemoryMounts = [{ sharedMemoryId: "shared-main", readable: true, writable: false }];
  state.owners[0].memories = Array.from({ length: count }, (_, index) => ({ ...structuredClone(source.graph.items[index % 3]), id: String(index + 1), uuid: "memory-" + (index + 1) }));
  state.owners[0].memories[0].isDocumentNode = true;
  state.owners[0].memories[0].documentPath = "owners/character%3Aoperit/resources/source.txt";
  state.owners[0].memories[0].chunkIndexFilePath = "owners/character%3Aoperit/resources/index.bin";
  state.owners[0].links = source.links;
  state.owners[0].chunks = [{ id: "1", memoryUuid: "memory-1", chunkIndex: 0, content: "Exact document chunk" }];
  state.owners[0].candidates = [{ id: "1", chatId: "core-chat", triggerMessageTimestamp: 987, triggerVariantIndex: 1, createdAt: 1, updatedAt: 2, status: "processing", attemptCount: 3, lastError: "original status", sourceType: "reply_finalized_auto" }];
  state.owners[0].embeddings = [{ id: "1", endpoint: "https://fixture.invalid", model: "model", text: "input", vector: [1, 0], updatedAt: 12 }];
  state.owners[0].rebuildTask = { id: "task-1", windows: [{ chatId: "core-chat", chatTitle: "Original chat", sourceMessageCount: 1, messages: [{ sender: "ai", content: "Original source", timestamp: 987, variantIndex: 1, variantCount: 3, provider: "original-provider", modelName: "original-model" }] }], nextWindow: 0 };
  Object.assign(state.owners[0].rebuildProgress, { status: "running", totalChats: 1, totalWindows: 1, totalSourceMessages: 1 });
  state.owners[2].memories = [structuredClone(source.graph.items[0])];
  state.owners[2].memories[0].documentPath = "owners/character%3Aoperit/resources/source.txt";
  disk.replaceState(state);
  for (const owner of state.owners) {
    const path = disk.directory.replaceAll("\\", "/") + "/" + owner.userDocumentPath;
    await disk.files.mkdir(path.slice(0, path.lastIndexOf("/")), true);
    await disk.files.write(path, "# Original USER " + owner.ownerKey + "\nUnicode 用户资料");
  }
  const root = disk.directory.replaceAll("\\", "/") + "/owners/character%3Aoperit/resources";
  await disk.files.mkdir(root, true);
  await disk.files.write(root + "/source.txt", "Original document 用户\u0000bytes");
  await disk.files.write(root + "/index.bin", "Exact index bytes");
  const raw = await disk.storage.dataStore.open({ path: disk.directory + "/chats.preferences.json" });
  await raw.edit(preferences => {
    preferences.set("binding_core-chat", { version: 1, selection: "card:operit" });
    preferences.set("draft_core-draft", { version: 1, selection: "group:group-one" });
  });
  await raw.close();
  disk.storage.inspectPreferences("meta", values => { values.__operit_preferences_schema_version = 0; values.state.legacyImportPending = true; });
  return { disk, state, chat: chatHost() };
}

test("TS released-data import into v1 converts every owned identity and reference and preserves user content", async t => {
  const { disk, state: old, chat } = await seed(t), database = await open(disk, chat), state = plain(disk.readState());
  assert.equal(state.version, 1); assert.equal(disk.storage.inspectPreferences("migration", values => values.plan), undefined);
  for (const collection of ["cards", "groups", "tags", "stores", "conversationGroups"])
    for (const record of state[collection]) assert.match(record.id, uuidPattern);
  const first = state.cards.find(card => card.name === old.cards[0].name), second = state.cards.find(card => card.name === old.cards[1].name);
  assert.equal(first.isDefault, undefined);
  for (const key of ["chatModelId", "chatProviderId", "ttsConfigId", "themeConfigId", "characterSetting", "createdAt", "updatedAt"]) assert.deepEqual(first[key], old.cards[0][key]);
  assert.deepEqual(first.attachedTagIds, [state.tags.find(tag => tag.name === old.tags[0].name).id]);
  assert.equal(first.sharedMemoryMounts[0].sharedMemoryId, state.stores[0].id);
  assert.equal(second.sharedMemoryId, state.stores[0].id);
  assert.deepEqual(state.groups[0].members.map(member => member.characterCardId), [first.id, second.id]);
  assert.deepEqual(state.active, { CharacterCard: { id: first.id } });
  assert.equal(state.conversationGroups[0].ownerSelection, "group:" + state.groups[0].id);
  assert.deepEqual(state.conversationGroups[0].chatIds, ["core-chat"]);
  assert.equal((await database.chats.data()).get("binding_core-chat").selection, "card:" + first.id);
  assert.equal((await database.chats.data()).get("draft_core-draft").selection, "group:" + state.groups[0].id);
  const owner = state.owners.find(owner => owner.ownerKey === "character:" + first.id);
  for (const collection of ["memories", "links", "chunks", "candidates", "embeddings"])
    for (const record of owner[collection]) assert.match(record.id, uuidPattern);
  for (const memory of owner.memories) {
    assert.match(memory.uuid, uuidPattern);
    for (const record of [...memory.tags, ...memory.properties]) assert.match(record.id, uuidPattern);
  }
  const document = owner.memories.find(memory => memory.isDocumentNode);
  assert.equal(owner.chunks[0].memoryUuid, document.uuid);
  assert.equal(owner.links[0].sourceMemoryId, document.id);
  assert.equal(owner.memories.some(memory => memory.id === owner.links[0].targetMemoryId), true);
  assert.match(owner.rebuildTask.id, uuidPattern); assert.equal(owner.rebuildTask.nextWindow, 0);
  assert.deepEqual({ ...owner.candidates[0], id: "1" }, old.owners[0].candidates[0]);
  const shared = state.owners.find(owner => owner.ownerKey === "shared:" + state.stores[0].id);
  assert.notEqual(shared.memories[0].id, document.id);
  assert.equal(shared.memories[0].documentPath, document.documentPath);
  assert.equal((await bytes(disk, document.documentPath)).toString(), "Original document 用户\u0000bytes");
  assert.equal((await bytes(disk, document.chunkIndexFilePath)).toString(), "Exact index bytes");
  assert.equal((await bytes(disk, owner.userDocumentPath)).toString(), "# Original USER character:operit\nUnicode 用户资料");
  assert.equal((await disk.files.exists(disk.directory + "/owners/character%3Aoperit")).exists, false);
  assert.deepEqual(chat.extensions.get(0), { participantId: first.id });
  assert.deepEqual(chat.extensions.get(1), { participantId: second.id });
  assert.equal(chat.extensions.get(2), null); assert.equal(chat.writes.length, 2);
  assert.deepEqual(chat.foreign, { participantId: "unrelated-plugin-identity" });
  const snapshotBytes = disk.stateBytes(); disk.clearCalls(); await open(disk, chat);
  assert.deepEqual(disk.stateBytes(), snapshotBytes); assert.equal(disk.calls.some(call => call.method === "storage.commit"), false);
});

test("released-data conversion commits bounded atomic key swaps and resumes with the persisted UUIDs", async t => {
  const { disk, chat } = await seed(t, 1100), originalOpen = disk.storage.objects.open;
  let batches = 0;
  const failure = new Error("Injected second record-page failure");
  /** Interrupts the actual generic transaction boundary after the first committed record page. */
  disk.storage.objects.open = async options => {
    const handle = await originalOpen(options), commit = handle.commit;
    return { ...handle,
      /** Rejects one record page without mutating SQLite or inventing a receipt. */
      async commit(mutations) {
        if (mutations.some(mutation => mutation.collection === "memories") && ++batches === 2) throw failure;
        return commit(mutations);
      },
    };
  };
  await assert.rejects(open(disk, chat), error => error === failure);
  const pending = disk.storage.inspectPreferences("migration", values => values.plan), identities = structuredClone(pending.identities);
  assert.equal(metadata(disk).version, 1); assert.equal(pending.phase, "records"); assert.ok(pending.cursor > 0);
  disk.storage.objects.open = originalOpen;
  await open(disk, chat);
  const state = plain(disk.readState()), cardId = identities[JSON.stringify(["cards", "operit"])];
  const owner = state.owners.find(owner => owner.ownerKey === "character:" + cardId);
  assert.equal(owner.memories.length, 1100);
  assert.ok(owner.memories.some(memory => memory.id === identities[JSON.stringify([owner.ownerKey + "/memories", "1"])]));
  assert.equal(chat.writes.length, 2);
  for (const call of disk.calls.filter(call => call.method === "storage.commit")) {
    const mutations = call.args[0]; assert.ok(mutations.length <= 1000);
    for (const mutation of mutations.filter(mutation => mutation.op === "delete" && mutation.collection === "memories"))
      assert.ok(mutations.some(other => other.op === "put" && other.collection === mutation.collection));
  }
});

test("owner copy interruption retains source bytes and resumes with the same UUID map", async t => {
  const { disk, chat } = await seed(t), failure = new Error("Injected owner copy failure");
  disk.failNext("copy", failure);
  await assert.rejects(open(disk, chat), error => error === failure);
  const pending = disk.storage.inspectPreferences("migration", values => values.plan), id = pending.identities[JSON.stringify(["cards", "operit"])];
  assert.equal(pending.phase, "files");
  assert.equal((await bytes(disk, "owners/character%3Aoperit/USER.md")).toString(), "# Original USER character:operit\nUnicode 用户资料");
  await open(disk, chat); assert.ok(disk.readState().cards.some(card => card.id === id));
});

test("conflicting owner destination bytes stop migration and retain the original records", async t => {
  const { disk, chat } = await seed(t);
  disk.failNext("copy", new Error("Pause after persisted plan")); await assert.rejects(open(disk, chat));
  const pending = disk.storage.inspectPreferences("migration", values => values.plan), file = pending.files[0], target = disk.directory.replaceAll("\\", "/") + "/" + file.destination;
  await disk.files.mkdir(target.slice(0, target.lastIndexOf("/")), true); await disk.files.write(target, "Conflicting data");
  await assert.rejects(open(disk, chat), /resource verification failed/);
  assert.equal(metadata(disk).version, 1);
  assert.notEqual((await bytes(disk, file.source)).toString(), "Conflicting data");
  assert.ok(disk.storage.inspectPreferences("cards", values => values.record_operit));
});

test("an interrupted message-author write resumes without rewriting the already converted revision", async t => {
  const { disk, chat } = await seed(t), originalWrite = chat.writeExtension;
  let writes = 0;
  /** Simulates a process interruption after a real extension write but before its progress marker. */
  chat.writeExtension = async (target, value) => {
    await originalWrite(target, value);
    if (++writes === 1) throw new Error("Author write response interrupted");
    return { extension: value };
  };
  await assert.rejects(open(disk, chat), /Author write response interrupted/);
  chat.writeExtension = originalWrite;
  await open(disk, chat); assert.equal(chat.writes.length, 2); assert.equal(disk.readState().version, 1);
});

for (const version of [0, 2, 3]) test("unsupported schema " + version + " fails before any mutation", async t => {
  const { disk, chat } = await seed(t);
  disk.storage.inspectPreferences("meta", values => { values.state.version = version; });
  disk.clearCalls(); await assert.rejects(open(disk, chat), /Unsupported character schema version/);
  assert.equal(disk.calls.some(call => call.method === "storage.commit"), false);
  assert.equal(chat.writes.length, 0);
});

test("existing UUIDs and the Core model selection survive a released-data import unchanged", async t => {
  const disk = await createDiskHarness(t, { legacyIdentity: "a8f78f9b-3fe5-467a-8b54-3269b78a246a" });
  const state = plain(disk.readState()); state.version = 1; state.active = { Model: { id: "chat" } }; disk.replaceState(state);
  await open(disk, null);
  assert.deepEqual(plain(disk.readState()), { ...state, version: 1 });
  assert.equal(disk.calls.some(call => call.method === "copy" || call.method === "deleteFile"), false);
});

test("v1 storage adopts another released source using the same import boundary", async t => {
  const { disk, state, chat } = await seed(t), existingId = "42f09266-5477-4d3b-80e8-bf1fc3a34930";
  const existing = { ...structuredClone(state.cards[0]), id: existingId, name: "Existing UUID character", attachedTagIds: [], sharedMemoryMounts: [] };
  delete existing.isDefault;
  state.cards.push(existing);
  const owner = plain(loadModule("src/storage/state.ts").createMemorySpace("character:" + existingId));
  state.owners.push(owner); state.version = 1; disk.replaceState(state);
  const path = disk.directory.replaceAll("\\", "/") + "/" + owner.userDocumentPath;
  await disk.files.mkdir(path.slice(0, path.lastIndexOf("/")), true); await disk.files.write(path, "Existing v1 USER.md");
  disk.storage.inspectPreferences("meta", values => { values.state.legacyImportPending = true; });
  disk.failNext("copy", new Error("Interrupted legacy import conversion"));
  await assert.rejects(open(disk, chat), /Interrupted legacy import conversion/);
  assert.equal(metadata(disk).version, 1); assert.equal(metadata(disk).legacyImportPending, true);
  await open(disk, chat);
  const current = plain(disk.readState());
  assert.deepEqual(current.cards.find(card => card.id === existingId), existing);
  assert.equal(current.cards.length, 3);
  assert.equal(current.cards.some(card => card.id === "operit" || card.id === "travel"), false);
  assert.equal(metadata(disk).legacyImportPending, undefined);
  assert.equal((await bytes(disk, owner.userDocumentPath)).toString(), "Existing v1 USER.md");
});

test("file-copy response interruption verifies the existing destination without copying it twice", async t => {
  const { disk, chat } = await seed(t), originalCopy = disk.files.copy;
  let copies = 0;
  /** Interrupts after an actual file copy while its durable progress cursor still names that file. */
  disk.files.copy = async (...args) => {
    await originalCopy(...args);
    if (++copies === 1) throw new Error("Copy response interrupted");
    return { successful: true, details: "Native copy completed" };
  };
  await assert.rejects(open(disk, chat), /Copy response interrupted/);
  const plan = disk.storage.inspectPreferences("migration", values => values.plan), file = plan.files[0]; assert.equal(plan.cursor, 0);
  assert.deepEqual(await bytes(disk, file.source), await bytes(disk, file.destination));
  disk.files.copy = originalCopy; disk.clearCalls(); await open(disk, chat);
  assert.equal(disk.calls.some(call => call.method === "copy" && call.args[0].endsWith("/" + file.source)), false);
});

test("cleanup response interruption resumes after the already retired source owner directory", async t => {
  const { disk, chat } = await seed(t), originalDelete = disk.files.deleteFile;
  /** Interrupts after a real verified source directory removal and before its progress commit. */
  disk.files.deleteFile = async (...args) => {
    await originalDelete(...args); throw new Error("Cleanup response interrupted");
  };
  await assert.rejects(open(disk, chat), /Cleanup response interrupted/);
  assert.equal(disk.storage.inspectPreferences("migration", values => values.plan).phase, "cleanup");
  disk.files.deleteFile = originalDelete; await open(disk, chat);
  assert.equal(disk.readState().version, 1); assert.equal(disk.storage.inspectPreferences("migration", values => values.plan), undefined);
});

test("a missing role reference fails before any UUID plan or domain change is committed", async t => {
  const { disk, state, chat } = await seed(t);
  state.groups[0].members[0].characterCardId = "missing-character"; disk.replaceState(state);
  disk.storage.inspectPreferences("meta", values => { values.__operit_preferences_schema_version = 0; values.state.legacyImportPending = true; }); disk.clearCalls();
  await assert.rejects(open(disk, chat), /missing character|Missing.*member|Missing group|missing member/i);
  assert.equal(disk.calls.some(call => call.method === "storage.commit"), false);
  assert.equal(disk.storage.inspectPreferences("migration", values => values.plan), undefined);
});

test("malformed persisted migration work fails before filesystem or record changes", async t => {
  const { disk, chat } = await seed(t);
  disk.storage.inspectPreferences("migration", values => { values.plan = { from: "released", to: 1, phase: "records", cursor: 99, identities: {}, files: [], directories: [], authors: [], changes: [] }; });
  disk.clearCalls(); await assert.rejects(open(disk, chat), /cursor exceeds its work/);
  assert.equal(disk.calls.some(call => call.method === "storage.commit" || call.method === "deleteFile"), false);
});
