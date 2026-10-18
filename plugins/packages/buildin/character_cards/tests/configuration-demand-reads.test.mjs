import assert from "node:assert/strict";
import test from "node:test";
import { createDiskHarness } from "./disk-files.mjs";
import { loadModule, plain } from "./runtime.mjs";

const directoryInput = plain(loadModule("tests/host-directories-input.ts").hostDirectoriesTestInput);

/** Opens the production repository over real SQLite and records each independent directory read. */
async function environment(t) {
  const disk = await createDiskHarness(t, { legacyIdentity: "default" }), directories = plain(directoryInput), calls = [];
  const repository = await loadModule("src/storage/database.ts", disk.globals).DatabaseCharacterRepository.open({
    /** Returns the explicitly supplied model catalog. */
    async listModels() { calls.push("models"); return plain(directories.models); },
    /** Returns the explicitly supplied speech catalog. */
    async listTtsConfigs() { calls.push("tts"); return plain(directories.ttsConfigs); },
    /** Records tool reads so execution tests can reject unnecessary catalog loads. */
    async readToolCatalog() { calls.push("tools"); return plain(directories.toolCatalog); },
  });
  const service = loadModule("src/service.ts", disk.globals).createCharacterCardsService(repository);
  /** Discards setup reads while retaining the actual database and all service state. */
  function reset() { disk.clearCalls(); calls.length = 0; }
  /** Resolves through the real service dispatcher and its live privacy check. */
  function resolve(input) { return service.dispatchDomain("chat.configuration.resolve", input); }
  reset();
  return { disk, service, directories, calls, reset, resolve };
}

/** Supplies the exact public execution contract with explicit model and speech defaults. */
function request(selection, extra = {}) {
  return { purpose: "execution", chatId: null, chatExtension: { version: 1, selection }, participantId: null,
    promptFunctionType: "CHAT", defaultModelBinding: { providerId: directoryInput.models[0].providerId, modelId: directoryInput.models[0].modelId },
    defaultTtsConfigId: directoryInput.ttsConfigs[0].id, ...extra };
}

/** Projects real object reads for independent resource-use assertions. */
function queries(disk) {
  return disk.calls.filter(call => ["storage.preferences.data", "storage.get", "storage.list", "storage.getMany"].includes(call.method));
}
/** Counts exact collection reads and preserves their explicit identities. */
function reads(disk, collection) {
  return queries(disk).filter(call => call.method === "storage.preferences.data" && call.args[0].endsWith("/" + collection + ".preferences.json")).map(call => ({ values: [] }));
}

/** A simple role must not pay for full directories or repeated role and memory-owner reads. */
test("configuration reads: an untagged character uses 12 storage queries and no unrelated directories", async t => {
  const h = await environment(t), result = plain(await h.resolve(request("card:default")));
  assert.equal(result.profile.id, "default");
  assert.equal(result.executionData.primaryOwnerKey, "character:default");
  assert.deepEqual(h.calls, ["models", "tts"]);
  assert.equal(queries(h.disk).some(call => ["memories", "embeddings", "candidates"].includes(call.args[0])), false);
  assert.deepEqual(reads(h.disk, "cards").map(
    /** Requires a single primary-key read of the selected role. */
    query => query.values,
  ), [[]]);
  for (const table of ["groups", "tags", "stores"]) assert.equal(reads(h.disk, table).length, 0, table);
});

/** Model conversations need model and speech validation, while presentation needs only model identity. */
test("configuration reads: model execution and display never load character storage or tools", async t => {
  const h = await environment(t);
  await h.resolve(request("model:chat"));
  assert.deepEqual(h.calls, ["models", "tts"]);
  assert.equal(queries(h.disk).length, 1, "Only the final live privacy flag read is required");
  h.reset();
  const result = plain(await h.resolve(request("model:chat", { purpose: "display" })));
  assert.equal(result.identity.title, directoryInput.models[0].modelId);
  assert.deepEqual(h.calls, ["models"]);
  assert.equal(queries(h.disk).length, 0);
});

/** An opening message shares the selected role with its strict execution resolution. */
test("configuration reads: an authored opening reuses its display character read", async t => {
  const h = await environment(t);
  const card = await h.service.dispatchDomain("character.create", { values: { name: "Opening author", openingStatement: "Hello" } });
  h.reset();
  const result = plain(await h.resolve(request("card:" + card.id, { purpose: "display" })));
  assert.equal(result.initialMessages[0].content, "Hello");
  assert.equal(reads(h.disk, "cards").length, 1);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(result.initialMessages[0], { content: "Hello", displayName: "Opening author", participantId: card.id });
});

/** Group members share only demanded dependencies and retain prompt, resource and member ordering. */
test("configuration reads: group members reuse exact tags, stores and catalogs within one request", async t => {
  const h = await environment(t);
  const tag = await h.service.dispatchDomain("tag.create", { values: { name: "Shared tag", promptContent: "Exact tag content" } });
  const store = await h.service.dispatchDomain("memory.shared.create", { name: "Shared library" });
  const a = await h.service.dispatchDomain("character.create", { values: { name: "A", characterSetting: "Setting A", otherContentChat: "Chat A", otherContentVoice: "Voice A", advancedCustomPrompt: "Advanced A", attachedTagIds: [tag.id], memoryBindingMode: "SHARED", sharedMemoryId: store.id,
    sharedMemoryMounts: [{ sharedMemoryId: store.id, readable: true, writable: false }] } });
  const b = await h.service.dispatchDomain("character.create", { values: { name: "B", attachedTagIds: [tag.id], sharedMemoryMounts: [{ sharedMemoryId: store.id, readable: true, writable: false }] } });
  const group = await h.service.dispatchDomain("group.create", { values: { name: "Ordered group", members: [{ characterCardId: a.id, orderIndex: 9 }, { characterCardId: b.id, orderIndex: 2 }] } });
  h.reset();
  const result = plain(await h.resolve(request("group:" + group.id, { participantId: a.id, promptFunctionType: "VOICE" })));
  assert.deepEqual(result.participants.map(
    /** Preserves persisted member order independently of the chosen executor. */
    participant => participant.id,
  ), [b.id, a.id]);
  assert.ok(result.profile.introPrompt.startsWith("Setting A\n\nVoice A\n\nExact tag content\n\nAdvanced A"));
  assert.equal(result.executionData.primaryOwnerKey, "shared:" + store.id);
  assert.deepEqual(result.profile.resources, [{ key: "shared:" + store.id, readable: true, writable: true }]);
  assert.equal(reads(h.disk, "cards").length, 2);
  assert.equal(reads(h.disk, "groups").length, 1);
  assert.deepEqual(reads(h.disk, "tags").map(
    /** Verifies a single referenced tag read rather than a full tag scan. */
    query => query.values,
  ), [[]]);
  assert.deepEqual(reads(h.disk, "stores").map(
    /** Verifies a single referenced shared library read despite repeated mounts. */
    query => query.values,
  ), [[]]);
  assert.deepEqual(h.calls, ["models", "tts"]);
});

/** Request-local reuse must never retain stale role or prompt data across sends. */
test("configuration reads: the next request observes edits to its character and attached tag", async t => {
  const h = await environment(t);
  const tag = await h.service.dispatchDomain("tag.create", { values: { name: "Editable", promptContent: "Before tag" } });
  const card = await h.service.dispatchDomain("character.create", { values: { name: "Before name", attachedTagIds: [tag.id] } });
  await h.resolve(request("card:" + card.id));
  await h.service.dispatchDomain("character.update", { id: card.id, changes: { name: "After name" } });
  await h.service.dispatchDomain("tag.update", { id: tag.id, changes: { promptContent: "After tag" } });
  h.reset();
  const result = plain(await h.resolve(request("card:" + card.id)));
  assert.equal(result.profile.name, "After name");
  assert.match(result.profile.introPrompt, /After tag/);
  assert.equal(reads(h.disk, "cards").length, 1);
  assert.equal(reads(h.disk, "tags").length, 1);
});

/** Missing and ambiguous dependencies remain hard errors after removing the aggregate snapshot. */
test("configuration reads: exact model, speech, tag and shared-library validation is retained", async t => {
  const h = await environment(t), input = request("card:default");
  await assert.rejects(() => h.resolve({ ...input, defaultModelBinding: { providerId: "removed", modelId: "removed" } }), /Model binding unavailable/);
  await assert.rejects(() => h.resolve({ ...input, defaultTtsConfigId: "removed" }), /TTS configuration not found/);
  h.directories.models.push(plain(h.directories.models[0]));
  await assert.rejects(() => h.resolve(input), /Model binding unavailable or duplicated/);
  h.directories.models.pop();
  const state = h.disk.readState();
  state.cards[0].attachedTagIds = ["removed-tag"];
  h.disk.replaceState(state);
  await assert.rejects(() => h.resolve(input), /Tag not found: removed-tag/);
  state.cards[0].attachedTagIds = [];
  state.cards[0].sharedMemoryMounts = [{ sharedMemoryId: "removed-store", readable: true, writable: false }];
  h.disk.replaceState(state);
  await assert.rejects(() => h.resolve(input), /Shared memory not found: removed-store/);
});

/** Every resolution uses current configuration and performs no SQL mutations after initialization. */
test("configuration reads: current role and privacy settings are used without any writes", async t => {
  const h = await environment(t);
  await h.resolve(request("card:default"));
  await h.service.dispatchDomain("character.update", { id: "default", changes: { characterSetting: "Current changed prompt" } });
  await h.service.dispatch({ action: "writeGlobalMemoryPreference", key: "userDescriptionEnabled", value: false });
  h.reset();
  const result = plain(await h.resolve(request("card:default", { participantId: "default" })));
  assert.match(result.profile.introPrompt, /Current changed prompt/);
  assert.equal(result.profile.userPreferencesText, "");
  assert.equal(h.disk.calls.filter(call => ["storage.execute", "storage.commit", "storage.commit"].includes(call.method)).length, 0);
  assert.equal(reads(h.disk, "cards").length, 1);
  await assert.rejects(async () => h.resolve({ ...request("card:default"), executionData: result.executionData }), /not a supported field/);
});

/** A privacy change during file IO must still be applied after all participant reads finish. */
test("configuration reads: the final privacy check observes a flag changed during resolution", async t => {
  const h = await environment(t);
  await h.service.dispatchDomain("memory.user.write", { ownerKey: "character:default", content: "Current private profile" });
  const port = {
    ...h.service,
    /** Changes the live preference after the exact document read begins. */
    async dispatchDomain(operation, input) {
      const result = await h.service.dispatchDomain(operation, input);
      if (operation === "memory.user.read") {
        await h.service.dispatch({ action: "writeGlobalMemoryPreference", key: "userDescriptionEnabled", value: false });
      }
      return result;
    },
  };
  const result = plain(await loadModule("src/operations.ts", h.disk.globals).resolveConfiguration(request("card:default"), port));
  assert.equal(result.profile.userPreferencesText, "");
  assert.equal(result.participants[0].userPreferencesText, "");
});
