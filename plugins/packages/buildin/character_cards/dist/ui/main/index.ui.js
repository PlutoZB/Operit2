// @operit-compose-artifact 2
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/ui/main/index.ui.ts
var index_ui_exports = {};
__export(index_ui_exports, {
  default: () => Screen
});
module.exports = __toCommonJS(index_ui_exports);

// src/avatar-resources.ts
function createAvatarResources(origin) {
  const references = /* @__PURE__ */ new Map();
  const files = /* @__PURE__ */ new Map();
  const remote = /* @__PURE__ */ new Set();
  let defaultPath = null;
  let next = 0;
  function source(path) {
    return __async(this, null, function* () {
      if (path === null) {
        if (defaultPath === null) {
          const pending = ToolPkg.readResource("character_default_avatar", "operit-avatar.png").then((path2) => {
            if (path2.trim() === "") throw new Error("\u9ED8\u8BA4\u5934\u50CF\u8D44\u6E90\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A");
            return path2;
          });
          defaultPath = pending;
          pending.catch(() => {
            if (defaultPath === pending) defaultPath = null;
          });
        }
        path = yield defaultPath;
      }
      if (path.trim() === "") throw new Error("\u5934\u50CF\u8D44\u6E90\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A");
      if (/^data:image\//i.test(path)) return path;
      const existing = references.get(path);
      if (existing !== void 0) return existing;
      const reference = "avatars/" + ++next;
      references.set(path, reference);
      files.set(origin + reference, path);
      if (/^https?:\/\//i.test(path)) remote.add(path);
      return reference;
    });
  }
  function intercept(request2) {
    if (remote.has(request2.url) && !request2.isMainFrame && (request2.method === "GET" || request2.method === "HEAD")) return { action: "allow" };
    const path = files.get(request2.url);
    if (path === void 0) return null;
    if (request2.isMainFrame || request2.method !== "GET" && request2.method !== "HEAD") return { action: "block" };
    if (remote.has(path)) return { action: "rewrite", url: path };
    return { action: "respond", response: { statusCode: 200, reasonPhrase: "OK", filePath: path } };
  }
  return { source, intercept };
}

// src/validation.ts
function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} \u5FC5\u987B\u662F\u5BF9\u8C61`);
}
function assertString(value, label) {
  if (typeof value !== "string") throw new Error(`${label} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
}
function requireId(value, label) {
  assertString(value, label);
  if (value.trim() === "" || value !== value.trim()) throw new Error(`${label} \u65E0\u6548`);
  return value;
}

// src/chat-bindings.ts
function parseChatSelection(selection2) {
  requireId(selection2, "chat selection");
  const parsed = /^(card|group|model):([^\s]+)$/u.exec(selection2);
  if (parsed === null) throw new Error("Invalid plugin chat selection: " + selection2);
  const kind = parsed[1];
  if (kind === "model" && parsed[2] !== "chat") throw new Error("Invalid model selection: " + selection2);
  if (kind !== "card" && kind !== "group" && kind !== "model") throw new Error("Invalid chat selection kind: " + kind);
  return { kind, id: parsed[2] };
}
function selectionForActive(active) {
  if ("Model" in active) return "model:chat";
  if ("CharacterCard" in active) return "card:" + active.CharacterCard.id;
  return "group:" + active.CharacterGroup.id;
}

// src/chat-markers.ts
function markerValue(value, path) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(path + " must be a finite JSON number");
    return value;
  }
  if (Array.isArray(value)) return value.map(
    /** Validates and copies every actual nested JSON value. */
    (item, index) => markerValue(item, path + "[" + index + "]")
  );
  return markerObject(value, path);
}
function markerObject(value, path) {
  assertObject(value, path);
  const result = {};
  for (const [key, item] of Object.entries(value)) Object.defineProperty(result, key, { value: markerValue(item, path + "." + key), enumerable: true, configurable: true, writable: true });
  return result;
}

// src/domain.ts
function record(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be a JSON object`);
  return value;
}
function text(value, path) {
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
}
function nonblank(value, path) {
  text(value, path);
  if (value.trim() === "") throw new Error(`${path} must not be blank`);
}
function parseMemoryIdentifier(value, path, _positive = true) {
  if (typeof value !== "string" || value.trim() === "" || value !== value.trim() || value.length > 256) throw new Error(`${path} must be a nonblank identity`);
  return value;
}
function memoryIdentifier(value, path) {
  parseMemoryIdentifier(value, path);
}
function propertyIdentifier(value, path) {
  parseMemoryIdentifier(value, path, false);
}
function boolean(value, path) {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`);
}
function number(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
}
function integer(value, path) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${path} must be a safe integer`);
}
function messageVariant(value, path) {
  integer(value, path);
  if (typeof value !== "number" || value < 0 || value > 2147483647) throw new Error(path + " must be a nonnegative i32 message variant index");
}
function score(value, path) {
  number(value, path);
  if (value < 0 || value > 1) throw new Error(`${path} must be between 0 and 1`);
}
function nonnegative(value, path) {
  number(value, path);
  if (value < 0) throw new Error(`${path} must not be negative`);
}
function enumeration(...values) {
  const allowed = new Set(values);
  return (value, path) => {
    if (typeof value !== "string" || !allowed.has(value)) throw new Error(`${path} must be ${values.join(" | ")}`);
  };
}
function nullable(validate) {
  return (value, path) => {
    if (value !== null) validate(value, path);
  };
}
function array(validate) {
  return (value, path) => {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    for (let index = 0; index < value.length; index += 1) validate(value[index], `${path}[${index}]`);
  };
}
function required(validate) {
  return { validate, required: true };
}
function optional(validate) {
  return { validate, required: false };
}
function shape(fields2, nonempty = false) {
  return (value, path) => {
    const object = record(value, path);
    const keys = Object.keys(object);
    if (nonempty && keys.length === 0) throw new Error(`${path} must contain at least one field`);
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(fields2, key)) throw new Error(`${path}.${key} is not a supported field`);
      fields2[key].validate(object[key], `${path}.${key}`);
    }
    for (const key of Object.keys(fields2)) {
      if (fields2[key].required && !Object.prototype.hasOwnProperty.call(object, key)) throw new Error(`${path}.${key} is required`);
    }
  };
}
function owner(value, path) {
  if (typeof value !== "string" || !/^(character|shared):[^:\s]+$/.test(value)) throw new Error(`${path} must be character:<id> or shared:<id>`);
}
var strings = array(text);
var identifiers = array(nonblank);
var member = shape({ characterCardId: required(nonblank), orderIndex: required(integer) });
var mount = shape({ sharedMemoryId: required(nonblank), readable: required(boolean), writable: required(boolean) });
var toolAccess = shape({ enabled: required(boolean), allowedBuiltinTools: required(strings), allowedPackages: required(strings), allowedSkills: required(strings), allowedMcpServers: required(strings) });
var property = shape({ id: required(propertyIdentifier), key: required(text), value: required(text) });
var characterFields = {
  name: optional(nonblank),
  description: optional(text),
  characterSetting: optional(text),
  openingStatement: optional(text),
  otherContentChat: optional(text),
  otherContentVoice: optional(text),
  avatarUri: optional(nullable(text)),
  attachedTagIds: optional(identifiers),
  advancedCustomPrompt: optional(text),
  marks: optional(text),
  chatModelBindingMode: optional(enumeration("FOLLOW_GLOBAL", "FIXED_MODEL")),
  chatModelId: optional(nullable(text)),
  chatProviderId: optional(nullable(text)),
  ttsConfigId: optional(nullable(text)),
  themeConfigId: optional(nullable(text)),
  memoryBindingMode: optional(enumeration("CHARACTER", "SHARED")),
  sharedMemoryId: optional(nullable(text)),
  sharedMemoryMounts: optional(array(mount)),
  toolAccessConfig: optional(toolAccess),
  createdAt: optional(integer),
  updatedAt: optional(integer)
};
var groupFields = { name: optional(nonblank), description: optional(text), themeConfigId: optional(nullable(text)), members: optional(array(member)), createdAt: optional(integer), updatedAt: optional(integer) };
var tagFields = { name: optional(nonblank), description: optional(text), promptContent: optional(text), tagType: optional(enumeration("TONE", "CHARACTER", "FUNCTION", "CUSTOM")), createdAt: optional(integer), updatedAt: optional(integer) };
var memoryFields = {
  uuid: optional(text),
  title: optional(nonblank),
  content: optional(text),
  contentType: optional(text),
  source: optional(text),
  credibility: optional(score),
  importance: optional(score),
  documentPath: optional(nullable(text)),
  isDocumentNode: optional(boolean),
  chunkIndexFilePath: optional(nullable(text)),
  folderPath: optional(nullable(text)),
  createdAt: optional(integer),
  updatedAt: optional(integer),
  lastAccessedAt: optional(integer),
  tags: optional(strings),
  properties: optional(array(property))
};
var settings = shape({
  autoSaveIntervalMinutes: required(nonnegative),
  nextAutoSaveRunAtMs: required(integer),
  memoryExtractionCustomRules: required(text),
  profileAutoUpdateEnabled: required(boolean),
  profileAutoUpdateLocked: required(boolean),
  cloudEmbeddingEnabled: required(boolean),
  cloudEmbeddingEndpoint: required(text),
  cloudEmbeddingApiKey: required(text),
  cloudEmbeddingModel: required(text)
});
var searchConfig = shape({ scoreMode: required(enumeration("BALANCED", "KEYWORD_FIRST", "SEMANTIC_FIRST")), keywordWeight: required(nonnegative), tagWeight: required(nonnegative), vectorWeight: required(nonnegative), edgeWeight: required(nonnegative) });
var empty = shape({});
var id = shape({ id: required(nonblank) });
var ownerOnly = shape({ ownerKey: required(owner) });
var contentOnly = shape({ content: required(text) });
var format = enumeration("operit", "tavern");
var memoryQueryRequest = shape({ participantId: required(nonblank), query: required(nonblank), limit: required(nonnegative), snapshotId: required(nullable(nonblank)) });
var validators = {
  "memory.searchWithOptions": shape({ ownerKey: required(owner), query: required(text), folderPath: required(nullable(text)), relevanceThreshold: required(nonnegative), createdAtStartMs: required(nullable(integer)), createdAtEndMs: required(nullable(integer)) }),
  "memory.chat.list": ownerOnly,
  "memory.chat.update": shape({ ownerKey: required(owner), chatId: required(nonblank) }),
  "memory.categorize": ownerOnly,
  "memory.rebuild.start": shape({ ownerKey: required(owner), rebuild: required(shape({ chatIds: required(strings), windowMessageCount: required(integer), fromInclusive: required(nullable(integer)), toInclusive: required(nullable(integer)) })) }),
  "memory.rebuild.progress": ownerOnly,
  "memory.rebuild.cancel": ownerOnly,
  "memory.embeddings.rebuild": ownerOnly,
  "memory.candidate.enqueue": shape({ chatId: required(nonblank), timestamp: required(integer), variantIndex: required(messageVariant), sourceType: required(enumeration("reply_finalized_auto", "selected_user_message")), ownerKey: required(nullable(owner)) }),
  "chat.configuration.resolve": parseChatConfigurationRequest,
  "chat.configuration.binding.read": shape({ chatId: required(nonblank) }),
  "chat.configuration.binding.write": shape({ chatId: required(nonblank), selection: required(nonblank) }),
  "chat.configuration.binding.delete": shape({ chatId: required(nonblank) }),
  snapshot: empty,
  "character.list": empty,
  "character.get": id,
  "character.create": shape({ values: required(shape({ ...characterFields, id: optional(text), name: required(nonblank) })) }),
  "character.update": shape({ id: required(nonblank), changes: required(shape(characterFields, true)) }),
  "character.delete": id,
  "character.setActive": id,
  "character.combine": shape({ id: required(nonblank), promptFunctionType: optional(enumeration("CHAT", "VOICE")), additionalTagIds: optional(identifiers) }),
  "character.export": shape({ id: required(nonblank), format: required(format) }),
  "character.import": shape({ format: required(format), content: required(nonblank) }),
  "character.exportBackup": empty,
  "character.importBackup": contentOnly,
  "group.list": empty,
  "group.get": id,
  "group.create": shape({ values: required(shape({ ...groupFields, id: optional(text), name: required(nonblank) })) }),
  "group.update": shape({ id: required(nonblank), changes: required(shape(groupFields, true)) }),
  "group.delete": id,
  "group.setActive": id,
  "group.duplicate": shape({ id: required(nonblank), newName: optional(nonblank) }),
  "group.export": id,
  "group.import": contentOnly,
  "group.exportBackup": empty,
  "group.importBackup": contentOnly,
  "activePrompt.get": empty,
  "activePrompt.setModel": empty,
  "activePrompt.setCard": id,
  "activePrompt.setGroup": id,
  "activePrompt.activateForChat": shape({ characterCardName: required(nullable(nonblank)), characterGroupId: required(nullable(nonblank)) }),
  "activePrompt.resolvedCard": empty,
  "tag.list": empty,
  "tag.get": id,
  "tag.create": shape({ values: required(shape({ ...tagFields, id: optional(text), name: required(nonblank) })) }),
  "tag.update": shape({ id: required(nonblank), changes: required(shape(tagFields, true)) }),
  "tag.delete": id,
  "memory.shared.list": empty,
  "memory.shared.create": shape({ name: required(nonblank) }),
  "memory.shared.rename": shape({ id: required(nonblank), name: required(nonblank) }),
  "memory.shared.delete": id,
  "memory.mount": shape({ characterId: required(nonblank), sharedId: required(nonblank), readable: required(boolean), writable: required(boolean) }),
  "memory.unmount": shape({ characterId: required(nonblank), sharedId: required(nonblank) }),
  "memory.user.read": ownerOnly,
  "memory.user.write": shape({ ownerKey: required(owner), content: required(text) }),
  "memory.user.path": ownerOnly,
  "memory.resolveOwner": shape({ characterId: required(nonblank) }),
  "memory.settings.read": ownerOnly,
  "memory.settings.write": shape({ ownerKey: required(owner), settings: required(settings) }),
  "memory.searchConfig.read": ownerOnly,
  "memory.searchConfig.write": shape({ ownerKey: required(owner), config: required(searchConfig) }),
  "memory.graph": ownerOnly,
  "memory.list": ownerOnly,
  "memory.search": shape({ ownerKey: required(owner), query: required(nonblank) }),
  "memory.get": shape({ ownerKey: required(owner), title: required(nonblank) }),
  "memory.create": shape({ ownerKey: required(owner), values: required(shape({ ...memoryFields, id: optional(memoryIdentifier), title: required(nonblank), content: required(text) })) }),
  "memory.update": shape({ ownerKey: required(owner), originalTitle: required(nonblank), expectedId: optional(memoryIdentifier), changes: required(shape(memoryFields, true)) }),
  "memory.delete": shape({ ownerKey: required(owner), id: required(memoryIdentifier) }),
  "memory.move": shape({ ownerKey: required(owner), ids: required(array(memoryIdentifier)), folderPath: required(text) }),
  "memory.link.create": shape({ ownerKey: required(owner), sourceTitle: required(nonblank), targetTitle: required(nonblank), linkType: required(nonblank), weight: required(score), description: required(text) }),
  "memory.link.update": shape({ ownerKey: required(owner), linkId: required(memoryIdentifier), changes: required(shape({ linkType: optional(nonblank), weight: optional(score), description: optional(text) }, true)) }),
  "memory.link.delete": shape({ ownerKey: required(owner), linkId: required(memoryIdentifier) }),
  "memory.export": ownerOnly,
  "memory.import": shape({ ownerKey: required(owner), content: required(nonblank), strategy: required(enumeration("SKIP", "UPDATE", "CREATE_NEW")) })
};
function parseDomainPayload(operation, payload) {
  if (!Object.prototype.hasOwnProperty.call(validators, operation)) throw new Error(`Unknown character domain operation: ${String(operation)}`);
  validators[operation](payload, operation);
  return payload;
}
function parseChatConfigurationRequest(value) {
  shape({
    purpose: required(enumeration("display", "execution")),
    chatId: required(nullable(nonblank)),
    chatExtension: required(nullable(markerObject)),
    participantId: required(nullable(nonblank)),
    promptFunctionType: required(enumeration("CHAT", "VOICE")),
    defaultModelBinding: required(shape({ providerId: required(text), modelId: required(text) })),
    defaultTtsConfigId: required(text)
  })(value, "chat.configuration.resolve");
  const request2 = value;
  if (request2.purpose === "display") {
    if (request2.participantId !== null) throw new Error("Display configuration cannot request an execution participant");
  } else {
    nonblank(request2.defaultModelBinding.providerId, "execution default provider");
    nonblank(request2.defaultModelBinding.modelId, "execution default model");
    nonblank(request2.defaultTtsConfigId, "execution default TTS configuration");
  }
  return request2;
}

// src/presentation.ts
function fields(value, keys, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const object = value, actual = Object.keys(object);
  if (actual.length !== keys.length || actual.some(
    /** Compares exact field identities rather than interpreting string fragments. */
    (key) => keys.indexOf(key) < 0
  )) throw new Error(`${path} must have exactly ${keys.join(", ")}`);
  return object;
}
function text2(value, path) {
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
  return value;
}
function identity(value, path) {
  const result = text2(value, path);
  if (result.trim() === "") throw new Error(`${path} must not be blank`);
  return result;
}
function entityKind(value) {
  if (value !== "card" && value !== "group") throw new Error("screen.entity must be card or group");
  return value;
}
function selection(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("screen.selection must be an active prompt object");
  const keys = Object.keys(value);
  if (keys.length !== 1) throw new Error("screen.selection must have one active prompt discriminator");
  const object = value;
  switch (keys[0]) {
    case "Model": {
      const model = fields(object.Model, ["id"], "screen.selection.Model");
      if (model.id !== "chat") throw new Error("Invalid model selection identity");
      return { Model: { id: "chat" } };
    }
    case "CharacterCard":
      return { CharacterCard: { id: identity(fields(object.CharacterCard, ["id"], "screen.selection.CharacterCard").id, "screen.selection.id") } };
    case "CharacterGroup":
      return { CharacterGroup: { id: identity(fields(object.CharacterGroup, ["id"], "screen.selection.CharacterGroup").id, "screen.selection.id") } };
    default:
      throw new Error("screen.selection has an unknown active prompt discriminator");
  }
}
function parseScreenInput(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("screen.input must be an object");
  const object = value;
  switch (object.mode) {
    case "manage": {
      if (object.view === void 0) {
        fields(object, ["mode"], "screen.input");
        return { mode: "manage" };
      }
      fields(object, ["mode", "view"], "screen.input");
      if (object.view !== "characters" && object.view !== "memory") throw new Error("screen.view must be characters or memory");
      return { mode: "manage", view: object.view };
    }
    case "select": {
      fields(object, ["mode", "kind", "selected"], "screen.input");
      if (object.kind !== "card" && object.kind !== "group" && object.kind !== "all") throw new Error("screen.kind must be card, group, or all");
      const selected = object.selected === null ? null : selection(object.selected);
      if (selected !== null && (object.kind === "card" && !("CharacterCard" in selected) && !("Model" in selected) || object.kind === "group" && !("CharacterGroup" in selected))) throw new Error("screen.selected does not match screen.kind");
      return { mode: "select", kind: object.kind, selected };
    }
    case "preview":
    case "edit":
      fields(object, ["mode", "entity", "id"], "screen.input");
      return { mode: object.mode, entity: entityKind(object.entity), id: identity(object.id, "screen.id") };
    case "memory-attachment": {
      fields(object, ["mode", "ownerKey", "folderPath"], "screen.input");
      const ownerKey = object.ownerKey === null ? null : identity(object.ownerKey, "screen.ownerKey");
      const folderPath = object.folderPath === null ? null : text2(object.folderPath, "screen.folderPath");
      if (ownerKey === null && folderPath !== null) throw new Error("screen.folderPath requires an explicitly selected ownerKey");
      return { mode: "memory-attachment", ownerKey, folderPath };
    }
    default:
      throw new Error("screen.input has an unknown mode");
  }
}
function parseScreenResult(value, input) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("screen.result must be an object");
  const object = value;
  if (object.mode !== input.mode) throw new Error("screen.result.mode does not match the active presentation");
  switch (input.mode) {
    case "select": {
      fields(object, ["mode", "selection"], "screen.result");
      const result = selection(object.selection);
      if (input.kind === "card" && !("CharacterCard" in result) && !("Model" in result) || input.kind === "group" && !("CharacterGroup" in result)) throw new Error("screen.result.selection does not match screen.kind");
      return { mode: "select", selection: result };
    }
    case "preview":
    case "edit": {
      fields(object, input.mode === "edit" ? ["mode", "entity", "id", "operation"] : ["mode", "entity", "id"], "screen.result");
      if (object.entity !== input.entity || object.id !== input.id) throw new Error("screen.result does not match the presented entity");
      if (input.mode === "preview") return { mode: "preview", entity: input.entity, id: input.id };
      if (object.operation !== "saved" && object.operation !== "deleted") throw new Error("screen.result.operation must be saved or deleted");
      return { mode: "edit", entity: input.entity, id: input.id, operation: object.operation };
    }
    case "memory-attachment": {
      fields(object, ["mode", "ownerKey", "folderPath", "content"], "screen.result");
      const ownerKey = identity(object.ownerKey, "screen.result.ownerKey"), folderPath = text2(object.folderPath, "screen.result.folderPath");
      if (input.ownerKey !== null && ownerKey !== input.ownerKey || input.folderPath !== null && folderPath !== input.folderPath) throw new Error("screen.result does not match the presented attachment scope");
      return { mode: "memory-attachment", ownerKey, folderPath, content: text2(object.content, "screen.result.content") };
    }
  }
}
function createScreenSession(presentation) {
  let input, requestId;
  if (presentation === null) {
    input = { mode: "manage" };
    requestId = null;
  } else {
    const envelope = fields(presentation, ["requestId", "input"], "presentation");
    requestId = identity(envelope.requestId, "presentation.requestId");
    input = parseScreenInput(envelope.input);
    if (input.mode === "manage") throw new Error("The management route must not have a presentation request");
  }
  let finished = false;
  function activeRequest() {
    if (requestId === null || input.mode === "manage") throw new Error("The management route has no presentation result channel");
    if (finished) throw new Error(`Presentation ${requestId} has already finished`);
    return { requestId, input };
  }
  return {
    /** Copies screen parameters so WebView consumers cannot mutate this session's contract. */
    currentScreen() {
      return { requestId, input: parseScreenInput(input) };
    },
    /** Returns the explicit generic completion discriminator only after validating this result. */
    completeScreen(value) {
      const active = activeRequest(), result = parseScreenResult(value, active.input);
      finished = true;
      return { type: "toolpkg.presentation.complete", requestId: active.requestId, value: result };
    },
    /** Returns the explicit cancellation discriminator without a synthetic domain result. */
    cancelScreen() {
      const active = activeRequest();
      finished = true;
      return { type: "toolpkg.presentation.cancel", requestId: active.requestId };
    }
  };
}

// src/drafts.ts
function createCharacterDraft() {
  return {
    id: "",
    name: "",
    description: "",
    characterSetting: "",
    openingStatement: "",
    otherContentChat: "",
    otherContentVoice: "",
    avatarUri: null,
    attachedTagIds: [],
    advancedCustomPrompt: "",
    marks: "",
    chatModelBindingMode: "FOLLOW_GLOBAL",
    chatModelId: null,
    chatProviderId: null,
    ttsConfigId: null,
    themeConfigId: null,
    memoryBindingMode: "CHARACTER",
    sharedMemoryId: null,
    sharedMemoryMounts: [],
    toolAccessConfig: { enabled: false, allowedBuiltinTools: [], allowedPackages: [], allowedSkills: [], allowedMcpServers: [] },
    createdAt: 0,
    updatedAt: 0
  };
}
function createGroupDraft() {
  return { id: "", name: "", description: "", members: [], themeConfigId: null, createdAt: 0, updatedAt: 0 };
}

// src/definition.ts
var definition = { id: "com.operit.character_cards", title: "\u89D2\u8272\u5361", icon: "Badge", order: 150 };
var chatUiRoutes = {
  editor: `toolpkg:${definition.id}:ui:main`,
  selection: `toolpkg:${definition.id}:ui:selection`,
  execution: `toolpkg:${definition.id}:ui:group-execution`
};

// src/ui-contributions.ts
function callMainDomain(operation, input) {
  const checked = parseDomainPayload(operation, input);
  return ToolPkg.ipc.call("character-memory.domain", { operation, input: checked }, { targetRuntime: "main" });
}
function chatIdentity(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(label + " must be a nonblank string");
  return value;
}
function encodeSelection(selection2) {
  return selectionForActive(selection2);
}
function createUiScreenSession(presentation) {
  let selectorTarget = null;
  let checked = presentation;
  if (presentation !== null && presentation.input.mode === "select") {
    const { chatId, ...screenInput } = presentation.input;
    if (chatId !== null) chatIdentity(chatId, "presentation.input.chatId");
    selectorTarget = { chatId };
    checked = { requestId: presentation.requestId, input: screenInput };
  }
  const session = createScreenSession(checked);
  let completing = false, finished = false;
  return {
    /** Reads only the package screen parameters needed by the reused typed Web view. */
    currentScreen: () => session.currentScreen(),
    /** Persists a selector choice through main IPC before acknowledging its caller-owned request. */
    completeScreen(value) {
      return __async(this, null, function* () {
        if (finished) throw new Error("This presentation has already finished");
        if (completing) throw new Error("A presentation completion is already running");
        const current = session.currentScreen();
        if (current.input.mode === "manage") throw new Error("Management has no presentation completion channel");
        const result = parseScreenResult(value, current.input);
        completing = true;
        try {
          let completion;
          switch (result.mode) {
            case "select": {
              if (selectorTarget === null) throw new Error("Selector has no explicit global or chat target");
              const selection2 = encodeSelection(result.selection);
              if (selectorTarget.chatId === null) {
                const identity2 = parseChatSelection(selection2);
                const active = identity2.kind === "model" ? yield callMainDomain("activePrompt.setModel", {}) : identity2.kind === "card" ? yield callMainDomain("activePrompt.setCard", { id: identity2.id }) : yield callMainDomain("activePrompt.setGroup", { id: identity2.id });
                if (!active.active || active.id !== identity2.id || active.type !== (identity2.kind === "model" ? "model" : identity2.kind === "card" ? "character_card" : "character_group")) throw new Error("Main runtime did not confirm the selected global active prompt");
              } else {
                const chatId = selectorTarget.chatId;
                const binding = yield callMainDomain("chat.configuration.binding.write", { chatId, selection: selection2 });
                if (binding.chatId !== chatId || binding.selection !== selection2) throw new Error("Main runtime did not confirm the selected chat binding");
              }
              const complete = session.completeScreen(result);
              completion = { ...complete, value: { selection: selection2, contextKey: selection2 } };
              break;
            }
            case "memory-attachment": {
              const complete = session.completeScreen(result);
              completion = { ...complete, value: { type: "text", name: "\u8BB0\u5FC6\u9644\u4EF6", content: result.content, mediaType: "text/plain" } };
              break;
            }
            case "preview":
            case "edit":
              completion = session.completeScreen(result);
              break;
          }
          finished = true;
          return completion;
        } finally {
          completing = false;
        }
      });
    },
    /** Cancels the same caller request without invoking any binding write or returning domain data. */
    cancelScreen() {
      if (finished) throw new Error("This presentation has already finished");
      if (completing) throw new Error("Cannot cancel during a presentation commit");
      const cancellation = session.cancelScreen();
      finished = true;
      return cancellation;
    }
  };
}

// src/host-path.ts
function hostFilePath(path, platform) {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/app/") || normalized.startsWith("/mnt/")) return normalized;
  if (platform === "windows" && /^[a-z]:\//i.test(normalized)) return `/mnt/windows/${normalized[0].toLowerCase()}/${normalized.slice(3)}`;
  if (!normalized.startsWith("/")) return null;
  if (platform === "macos" || platform === "linux") return `/mnt/${platform}${normalized}`;
  if (platform === "android") return `/mnt/android/root${normalized}`;
  return null;
}

// src/image-source.ts
function readAvatarImport(path) {
  return __async(this, null, function* () {
    const file = yield Tools.Files.readBinary(path);
    if (file.size > 8 * 1024 * 1024) throw new Error("\u5934\u50CF\u56FE\u7247\u4E0D\u80FD\u8D85\u8FC7 8 MB");
    const b = file.contentBase64;
    if (!(b.startsWith("iVBOR") || b.startsWith("/9j/") || b.startsWith("R0lGOD") || b.startsWith("UklGR") || b.startsWith("Qk"))) {
      throw new Error("\u8BF7\u9009\u62E9 PNG\u3001JPEG\u3001GIF\u3001WebP \u6216 BMP \u56FE\u7247");
    }
    return b;
  });
}
function pickedImagePath(path, platform) {
  const mapped = hostFilePath(path, platform);
  if (mapped !== null) return mapped;
  if (!path.replace(/\\/g, "/").startsWith("/")) throw new Error("\u9009\u62E9\u5668\u6CA1\u6709\u8FD4\u56DE\u53EF\u8BFB\u53D6\u7684\u6587\u4EF6\u8DEF\u5F84");
  throw new Error("\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301\u5BFC\u5165\u6B64\u56FE\u7247\u8DEF\u5F84");
}

// src/ui-entity-preview.ts
function renderEntityPreview(ctx, input) {
  const colors = ctx.MaterialTheme.colorScheme;
  const entity = input.card ?? input.group;
  if (entity === null) return [];
  const card = input.card;
  const selectable = (key, value, subdued = false) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:34119",[key,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:34154",[value,subdued ? colors.onSurfaceVariant : colors.onSurface],__operitUiTemplate_34154)],__operitUiTemplate_34119);
  const pill = (key, label) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:34318",[key,colors.primaryContainer.copy({ alpha: 0.38 }),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:34505",[label,colors.onPrimaryContainer],__operitUiTemplate_34505)],__operitUiTemplate_34318);
  const attachedTags = card === null ? [] : input.tags.filter((tag) => card.attachedTagIds.includes(tag.id));
  const identity2 = OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:34722",[[
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:34830",[card === null ? OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:34931",[colors.primaryContainer.copy({ alpha: 0.48 }),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:35100",[colors.primary],__operitUiTemplate_35100)],__operitUiTemplate_34931) : OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:35175",[{
        key: "entity-avatar",
        ...card.avatarUri === null ? { path: input.avatar ?? void 0 } : { uri: card.avatarUri },
        width: 72,
        height: 72,
        contentScale: "crop",
        contentDescription: card.name,
        modifier: ctx.Modifier.clip({ cornerRadius: 20 })
      }],__operitUiTemplate_35175),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:35499",[[
        OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:35550",[entity.name],__operitUiTemplate_35550),
        ...card === null ? [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:35719",[input.group.members.length + " \u4F4D\u89D2\u8272",colors.onSurfaceVariant],__operitUiTemplate_35719)] : []
      ]],__operitUiTemplate_35499)],__operitUiTemplate_34830),
    ...entity.description.trim() === "" ? [] : [selectable("entity-preview-description", entity.description, true)],
    ...attachedTags.length === 0 ? [] : [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:36028",[attachedTags.map((tag) => pill("entity-preview-tag-" + tag.id, tag.name))],__operitUiTemplate_36028)]
  ]],__operitUiTemplate_34722);
  const contentSection = (key, title, value, quote = false) => value.trim() === "" ? [] : [
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:36280",["entity-preview-" + key,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:36377",[{
        fillMaxWidth: true,
        spacing: 10,
        ...quote ? { padding: 18, backgroundColor: colors.primaryContainer.copy({ alpha: 0.22 }), backgroundShape: { cornerRadius: 16 } } : {}
      },OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:36604",[[
          ...quote ? [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:36704",[colors.primary],__operitUiTemplate_36704)] : [],
          OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:36790",[title,quote ? colors.primary : colors.onSurfaceVariant],__operitUiTemplate_36790)
        ]],__operitUiTemplate_36604),selectable("entity-preview-" + key + "-text", value)],__operitUiTemplate_36377)],__operitUiTemplate_36280)
  ];
  const themeLabel = entity.themeConfigId === null ? "\u8DDF\u968F\u5F53\u524D\u4E3B\u9898" : input.themeError !== "" ? "\u4E3B\u9898\u540D\u79F0\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6" : input.themes === null ? "\u6B63\u5728\u8BFB\u53D6\u4E3B\u9898\u540D\u79F0\u2026" : input.themes.find((theme) => theme.id === entity.themeConfigId)?.label ?? "\u4E3B\u9898\u914D\u7F6E\u5DF2\u4E0D\u53EF\u7528";
  const rows = [];
  const contents = [identity2];
  if (card !== null) {
    contents.push(
      ...contentSection("opening", "\u5F00\u573A\u767D", card.openingStatement, true),
      ...contentSection("setting", "\u89D2\u8272\u8BBE\u5B9A", card.characterSetting),
      ...contentSection("chat", "\u804A\u5929\u9644\u52A0\u5185\u5BB9", card.otherContentChat),
      ...contentSection("voice", "\u8BED\u97F3\u9644\u52A0\u5185\u5BB9", card.otherContentVoice),
      ...contentSection("prompt", "\u9AD8\u7EA7\u81EA\u5B9A\u4E49 Prompt", card.advancedCustomPrompt),
      ...contentSection("notes", "\u5907\u6CE8", card.marks)
    );
    const model = input.snapshot.models.find((model2) => model2.providerId === card.chatProviderId && model2.modelId === card.chatModelId);
    rows.push(
      { key: "model", label: "\u804A\u5929\u6A21\u578B", value: card.chatModelBindingMode === "FIXED_MODEL" ? model === void 0 ? "\u56FA\u5B9A\u6A21\u578B\u5DF2\u4E0D\u53EF\u7528" : model.providerName + " \xB7 " + model.modelId : "\u8DDF\u968F\u5168\u5C40\u6A21\u578B" },
      { key: "theme", label: "\u4E3B\u9898", value: themeLabel },
      { key: "tts", label: "\u8BED\u97F3", value: card.ttsConfigId === null ? "\u8DDF\u968F\u5168\u5C40\u8BED\u97F3\u914D\u7F6E" : input.snapshot.ttsConfigs.find((config) => config.id === card.ttsConfigId)?.name ?? "\u8BED\u97F3\u914D\u7F6E\u5DF2\u4E0D\u53EF\u7528" },
      { key: "memory", label: "\u8BB0\u5FC6\u5E93", value: card.memoryBindingMode === "SHARED" ? input.snapshot.stores.find((store) => store.id === card.sharedMemoryId)?.name ?? "\u5171\u4EAB\u8BB0\u5FC6\u5E93\u5DF2\u4E0D\u53EF\u7528" : "\u89D2\u8272\u72EC\u7ACB\u8BB0\u5FC6\u5E93" }
    );
    if (card.sharedMemoryMounts.length !== 0) rows.push({ key: "mounts", label: "\u5171\u4EAB\u8BB0\u5FC6\u6302\u8F7D", value: card.sharedMemoryMounts.map((mount2) => {
      const name = input.snapshot.stores.find((store) => store.id === mount2.sharedMemoryId)?.name ?? "\u8BB0\u5FC6\u5E93\u5DF2\u4E0D\u53EF\u7528";
      const permissions = [mount2.readable ? "\u53EF\u8BFB" : "", mount2.writable ? "\u53EF\u5199" : ""].filter(Boolean).join("\u3001") || "\u65E0\u8BBF\u95EE\u6743\u9650";
      return name + "\uFF08" + permissions + "\uFF09";
    }).join("\n") });
    const policy = card.toolAccessConfig;
    const toolNames = [
      { ids: policy.allowedBuiltinTools, catalog: input.snapshot.toolCatalog.builtinTools },
      { ids: policy.allowedPackages, catalog: input.snapshot.toolCatalog.packages },
      { ids: policy.allowedSkills, catalog: input.snapshot.toolCatalog.skills },
      { ids: policy.allowedMcpServers, catalog: input.snapshot.toolCatalog.mcpServers }
    ].flatMap((source) => source.ids.map((id2) => source.catalog.find((item) => item.name === id2)?.displayName ?? "\u6765\u6E90\u5DF2\u4E0D\u53EF\u7528"));
    rows.push({ key: "tools", label: "\u5DE5\u5177\u8BBF\u95EE", value: !policy.enabled ? "\u8DDF\u968F\u5168\u5C40\u5DE5\u5177\u914D\u7F6E" : toolNames.length === 0 ? "\u672A\u5141\u8BB8\u4EFB\u4F55\u5DE5\u5177\u6765\u6E90" : toolNames.join("\u3001") });
  } else {
    const members = [...input.group.members].sort((a, b) => a.orderIndex - b.orderIndex);
    contents.push(OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:40611",[[
      OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:40720",[colors.onSurfaceVariant],__operitUiTemplate_40720),
      ...members.length === 0 ? [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:40876",[colors.onSurfaceVariant],__operitUiTemplate_40876)] : members.map((member2, index) => {
        const record2 = input.snapshot.cards.find((card2) => card2.id === member2.characterCardId);
        return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:41143",["entity-preview-member-" + member2.characterCardId,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:41310",[String(index + 1).padStart(2, "0"),colors.onSurfaceVariant],__operitUiTemplate_41310),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:41433",[{ width: 40, height: 40, ...record2?.avatarUri == null ? { path: input.avatar ?? void 0 } : { uri: record2.avatarUri }, contentScale: "crop", contentDescription: record2?.name ?? "\u89D2\u8272\u5DF2\u79FB\u9664", modifier: ctx.Modifier.clip({ cornerRadius: 12 }) }],__operitUiTemplate_41433),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:41723",[[
            OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:41778",[record2?.name ?? "\u89D2\u8272\u5DF2\u79FB\u9664"],__operitUiTemplate_41778),
            ...record2?.description.trim() ? [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:41958",[record2.description,colors.onSurfaceVariant],__operitUiTemplate_41958)] : []
          ]],__operitUiTemplate_41723)],__operitUiTemplate_41143);
      })
    ]],__operitUiTemplate_40611));
    rows.push({ key: "theme", label: "\u4E3B\u9898", value: themeLabel });
  }
  contents.push(OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:42217",[colors.surfaceContainerLow,[
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:42375",[input.onToggleConfiguration,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:42553",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:42653",[colors.onSurfaceVariant],__operitUiTemplate_42653),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:42733",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:42786",null,__operitUiTemplate_42786),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:42887",[card === null ? "\u4E3B\u9898\u914D\u7F6E" : "\u6A21\u578B\u3001\u8BED\u97F3\u4E0E\u8BB0\u5FC6",colors.onSurfaceVariant],__operitUiTemplate_42887)],__operitUiTemplate_42733),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:43078",[input.configurationExpanded ? "ExpandLess" : "ExpandMore",colors.onSurfaceVariant],__operitUiTemplate_43078)],__operitUiTemplate_42553)],__operitUiTemplate_42375),
    ...input.configurationExpanded ? [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:43254",[rows.map((row) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:43427",["entity-preview-config-" + row.key,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:43528",[row.label,colors.onSurfaceVariant],__operitUiTemplate_43528),selectable("entity-preview-config-" + row.key + "-value", row.value)],__operitUiTemplate_43427))],__operitUiTemplate_43254)] : []
  ]],__operitUiTemplate_42217));
  return contents;
}

// src/ui-entity-native.ts
function copy(value) {
  return JSON.parse(JSON.stringify(value));
}
function resultJson(value) {
  return JSON.parse(JSON.stringify(value));
}
function request(input) {
  return ToolPkg.ipc.call("character-memory.request", input, { targetRuntime: "main" });
}
function renderEntityScreen(ctx, presentation) {
  const owner2 = ctx.useRef("entity-presentation-owner", JSON.stringify(presentation));
  const session = ctx.useRef("entity-presentation-session", null);
  if (session.current === null) session.current = createUiScreenSession(presentation);
  const current = session.current.currentScreen(), screenSession = session.current;
  if (current.input.mode !== "preview" && current.input.mode !== "edit") throw new Error("Native entity screen requires a preview or edit presentation");
  const input = current.input;
  return renderNativeEntity(ctx, input, {
    assertOwner() {
      const [actual] = ctx.useState("presentation", null);
      if (owner2.current !== JSON.stringify(actual)) throw new Error("Native entity presentation cannot change its owning request");
    },
    complete(operation) {
      return __async(this, null, function* () {
        return resultJson(input.mode === "preview" ? yield screenSession.completeScreen({ mode: "preview", entity: input.entity, id: input.id }) : yield screenSession.completeScreen({ mode: "edit", entity: input.entity, id: input.id, operation }));
      });
    },
    cancel: () => resultJson(screenSession.cancelScreen())
  });
}
function renderManagedEntityScreen(ctx, pending, finish) {
  const assertOwner = () => {
    const [active] = ctx.useState("managed-entity", null);
    if (active?.requestId !== pending.requestId) throw new Error("Native management entity request is no longer active");
  };
  return renderNativeEntity(ctx, pending.input, {
    assertOwner,
    complete(operation, id2) {
      return __async(this, null, function* () {
        assertOwner();
        finish(operation === void 0 ? null : { operation, id: id2 ?? pending.input.id });
        return null;
      });
    },
    cancel() {
      assertOwner();
      finish(null);
      return null;
    }
  }, "managed-entity:" + pending.requestId + ":");
}
function renderNativeEntity(ctx, input, lifecycle, statePrefix = "") {
  const [state, setState] = ctx.useState(statePrefix + "native-entity-state", {
    snapshot: null,
    card: null,
    group: null,
    editing: input.mode !== "preview",
    tab: 0,
    previewConfigurationExpanded: false,
    loading: true,
    busy: false,
    error: "",
    fullscreen: false,
    deleting: false,
    finished: false,
    tags: [],
    tagChanges: { created: [], updated: [], deleted: [] },
    tagDraft: null,
    tagDeleting: false,
    nextTag: 0,
    expanded: null,
    picker: null,
    tagManaging: false,
    toolDraft: null,
    toolTab: 0,
    toolQuery: "",
    exporting: false,
    exportContent: "",
    exportName: "",
    avatar: null,
    themes: null,
    themeError: ""
  });
  const live = ctx.useRef(statePrefix + "native-entity-live", state);
  live.current = state;
  const assertOwner = lifecycle.assertOwner;
  assertOwner();
  function update(patch) {
    live.current = { ...live.current, ...patch };
    setState(live.current);
  }
  function act(operation) {
    return __async(this, null, function* () {
      assertOwner();
      if (live.current.busy || live.current.finished) return null;
      update({ busy: true, error: "" });
      try {
        const value = yield operation();
        if (!live.current.finished) assertOwner();
        return value ?? null;
      } catch (error) {
        assertOwner();
        update({ error: String(error) });
      } finally {
        update({ busy: false });
      }
      return null;
    });
  }
  function card() {
    if (live.current.card === null) throw new Error("\u89D2\u8272\u5361\u5C1A\u672A\u52A0\u8F7D");
    return live.current.card;
  }
  function group() {
    if (live.current.group === null) throw new Error("\u7FA4\u7EC4\u5C1A\u672A\u52A0\u8F7D");
    return live.current.group;
  }
  function changeCard(patch) {
    assertOwner();
    if (!live.current.busy) update({ card: { ...card(), ...patch } });
  }
  function changeGroup(patch) {
    assertOwner();
    if (!live.current.busy) update({ group: { ...group(), ...patch } });
  }
  function loadThemes() {
    return __async(this, null, function* () {
      try {
        const themes = yield request({ action: "listThemeChoices" });
        if (live.current.finished) return;
        assertOwner();
        const picker = live.current.picker;
        update({ themes, themeError: "", ...picker !== null && (picker.key === "theme" || picker.key === "entity-theme-picker") ? { picker: { ...picker, choices: themes } } : {} });
      } catch (error) {
        if (live.current.finished) return;
        try {
          assertOwner();
        } catch {
          return;
        }
        update({ themeError: String(error) });
      }
    });
  }
  function loadDefaultAvatar() {
    return __async(this, null, function* () {
      try {
        const avatar = yield ToolPkg.readResource("character_default_avatar", "operit-avatar.png");
        if (avatar.trim() === "" || live.current.finished) return;
        assertOwner();
        update({ avatar });
      } catch {
      }
    });
  }
  function load() {
    return __async(this, null, function* () {
      yield act(() => __async(null, null, function* () {
        const snapshot2 = yield request({ action: "snapshot" });
        assertOwner();
        const record2 = input.mode === "create" ? input.entity === "card" ? createCharacterDraft() : createGroupDraft() : input.entity === "card" ? snapshot2.cards.find((value) => value.id === input.id) : snapshot2.groups.find((value) => value.id === input.id);
        if (record2 === void 0) throw new Error("\u9884\u89C8\u5B9E\u4F53\u4E0D\u5B58\u5728\uFF1A" + input.id);
        assertOwner();
        update({ snapshot: snapshot2, tags: copy(snapshot2.tags), card: input.entity === "card" ? copy(record2) : null, group: input.entity === "group" ? copy(record2) : null, loading: false });
        if (input.entity === "group" || record2.avatarUri === null) void loadDefaultAvatar();
        if (live.current.editing) void loadThemes();
      }));
      if (live.current.loading) update({ loading: false });
    });
  }
  function close() {
    return __async(this, null, function* () {
      assertOwner();
      if (live.current.busy || live.current.finished) return null;
      if (live.current.expanded !== null) {
        update({ expanded: null, fullscreen: false });
        return null;
      }
      if (live.current.picker !== null) {
        update({ picker: null });
        return null;
      }
      if (live.current.toolDraft !== null) {
        update({ toolDraft: null });
        return null;
      }
      if (live.current.exporting) {
        update({ exporting: false, exportContent: "" });
        return null;
      }
      if (live.current.tagManaging && live.current.tagDraft === null) {
        update({ tagManaging: false });
        return null;
      }
      if (live.current.tagDraft !== null) {
        update({ tagDraft: null, tagDeleting: false });
        return null;
      }
      if (live.current.deleting) {
        update({ deleting: false });
        return null;
      }
      if (input.mode === "preview" && live.current.editing) {
        const snapshot2 = live.current.snapshot;
        if (snapshot2 === null) throw new Error("\u9884\u89C8\u6570\u636E\u5C1A\u672A\u52A0\u8F7D");
        update({
          editing: false,
          tab: 0,
          error: "",
          tags: copy(snapshot2.tags),
          tagChanges: { created: [], updated: [], deleted: [] },
          card: input.entity === "card" ? copy(snapshot2.cards.find((value) => value.id === input.id) ?? card()) : null,
          group: input.entity === "group" ? copy(snapshot2.groups.find((value) => value.id === input.id) ?? group()) : null
        });
        return null;
      }
      update({ finished: true });
      return input.mode === "preview" ? lifecycle.complete() : lifecycle.cancel();
    });
  }
  function edit() {
    return __async(this, null, function* () {
      assertOwner();
      update({ editing: true, tab: 0 });
      if (live.current.themes === null) void loadThemes();
    });
  }
  function togglePreviewConfiguration() {
    assertOwner();
    const expanded = !live.current.previewConfigurationExpanded;
    update({ previewConfigurationExpanded: expanded });
    if (expanded && (live.current.card ?? live.current.group)?.themeConfigId != null && live.current.themes === null) void loadThemes();
  }
  function save() {
    return __async(this, null, function* () {
      return act(() => __async(null, null, function* () {
        let snapshot2;
        if (input.entity === "card") {
          const draft = card();
          if (draft.name.trim() === "") throw new Error("\u89D2\u8272\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
          if (draft.chatModelBindingMode === "FIXED_MODEL" && !live.current.snapshot?.models.some((model) => model.providerId === draft.chatProviderId && model.modelId === draft.chatModelId)) throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u7684\u56FA\u5B9A\u804A\u5929\u6A21\u578B");
          if (draft.memoryBindingMode === "SHARED" && !live.current.snapshot?.stores.some((store) => store.id === draft.sharedMemoryId)) throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u7684\u5171\u4EAB\u8BB0\u5FC6\u5E93");
          snapshot2 = yield request({ action: "saveCharacter", card: copy(draft), create: input.mode === "create", tagChanges: copy(live.current.tagChanges) });
        } else {
          const draft = group();
          if (draft.name.trim() === "") throw new Error("\u7FA4\u7EC4\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
          snapshot2 = yield request({ action: "saveGroup", group: copy(draft), create: input.mode === "create" });
        }
        const previousSnapshot = live.current.snapshot;
        assertOwner();
        update({
          snapshot: snapshot2,
          editing: false,
          tab: 0,
          tags: copy(snapshot2.tags),
          tagChanges: { created: [], updated: [], deleted: [] },
          card: input.entity === "card" ? copy(snapshot2.cards.find((value) => value.id === input.id) ?? card()) : null,
          group: input.entity === "group" ? copy(snapshot2.groups.find((value) => value.id === input.id) ?? group()) : null
        });
        if (input.mode !== "preview") {
          const before = previousSnapshot;
          const saved = input.mode === "create" ? input.entity === "card" ? snapshot2.cards.find((value) => !before.cards.some((old) => old.id === value.id)) : snapshot2.groups.find((value) => !before.groups.some((old) => old.id === value.id)) : input.entity === "card" ? snapshot2.cards.find((value) => value.id === input.id) : snapshot2.groups.find((value) => value.id === input.id);
          if (saved === void 0) throw new Error("\u4FDD\u5B58\u7ED3\u679C\u7F3A\u5C11\u5B9E\u4F53\u6807\u8BC6");
          update({ finished: true });
          return lifecycle.complete("saved", saved.id);
        }
        return null;
      }));
    });
  }
  function stageTag() {
    return __async(this, null, function* () {
      return act(() => __async(null, null, function* () {
        const draft = live.current.tagDraft;
        if (draft === null) throw new Error("\u6CA1\u6709\u6807\u7B7E\u8349\u7A3F");
        const changes = copy(live.current.tagChanges);
        let tags = copy(live.current.tags), attachedTagIds = [...card().attachedTagIds];
        if (live.current.tagDeleting) {
          tags = tags.filter((tag) => tag.id !== draft.id);
          attachedTagIds = attachedTagIds.filter((id2) => id2 !== draft.id);
          if (changes.created.some((tag) => tag.draftId === draft.id)) changes.created = changes.created.filter((tag) => tag.draftId !== draft.id);
          else {
            changes.updated = changes.updated.filter((tag) => tag.id !== draft.id);
            changes.deleted.push(draft.id);
          }
        } else {
          if (draft.name.trim() === "") throw new Error("\u6807\u7B7E\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
          const id2 = draft.id === "" ? "draft_prompt_tag_" + (live.current.nextTag + 1) : draft.id;
          const tag = { ...draft, id: id2, name: draft.name.trim(), description: draft.description.trim() };
          const { id: _id, ...values } = tag;
          if (draft.id === "") {
            tags.push(tag);
            attachedTagIds.push(id2);
            changes.created.push({ draftId: id2, values });
          } else {
            tags = tags.map((value) => value.id === id2 ? tag : value);
            const created = changes.created.find((value) => value.draftId === id2);
            if (created !== void 0) created.values = values;
            else {
              changes.updated = changes.updated.filter((value) => value.id !== id2);
              changes.updated.push(tag);
            }
          }
        }
        update({ tags, tagChanges: changes, card: { ...card(), attachedTagIds }, tagDraft: null, tagDeleting: false, nextTag: live.current.nextTag + 1 });
      }));
    });
  }
  function remove() {
    return __async(this, null, function* () {
      return act(() => __async(null, null, function* () {
        yield request(input.entity === "card" ? { action: "deleteCharacter", id: input.id } : { action: "deleteGroup", id: input.id });
        assertOwner();
        update({ finished: true });
        return lifecycle.complete(input.mode === "preview" ? void 0 : "deleted");
      }));
    });
  }
  function chooseAvatar() {
    return __async(this, null, function* () {
      yield act(() => __async(null, null, function* () {
        const selected = yield ctx.openFilePicker({ picker: "image", allowMultiple: false, mimeTypes: ["image/*"] });
        assertOwner();
        if (selected.cancelled) return;
        if (selected.files.length !== 1) throw new Error("\u8BF7\u9009\u62E9\u4E00\u4E2A\u5934\u50CF\u6587\u4EF6");
        const platform = (yield Tools.System.terminal.info()).platform, contentBase64 = yield readAvatarImport(pickedImagePath(selected.files[0].path, platform));
        assertOwner();
        const directory = ToolPkg.getConfigDir().replace(/\/$/, "") + "/avatars";
        const created = yield Tools.Files.mkdir(directory, true);
        if (!created.successful) throw new Error(created.details);
        const uri = directory + "/" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".image";
        const written = yield Tools.Files.writeBinary(uri, contentBase64);
        if (!written.successful) throw new Error(written.details);
        assertOwner();
        update({ card: { ...card(), avatarUri: uri } });
      }));
    });
  }
  const colors = ctx.MaterialTheme.colorScheme, enabled = !state.busy && !state.finished;
  const text3 = (value) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:58745",[value],__operitUiTemplate_58745);
  const caption = (value) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:58845",[value,colors.onSurfaceVariant],__operitUiTemplate_58845);
  const section = (title, value) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:58983",["preview-" + title,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:59083",[title,colors.onSurfaceVariant],__operitUiTemplate_59083),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:59170",[text3(value)],__operitUiTemplate_59170)],__operitUiTemplate_58983);
  const field = (key, label, value, apply, maxLines = 1) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:59280",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:59334",[{
    key: "entity-field-" + key,
    label,
    value,
    fillMaxWidth: true,
    enabled,
    singleLine: maxLines === 1,
    minLines: maxLines,
    maxLines,
    style: {},
    onValueChange: apply,
    ...maxLines === 1 ? {} : { suffixIconWidth: 36, suffixIconHeight: 36, trailingIcon: OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:59643",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:59709",["entity-expand-" + key,enabled,() => {
        assertOwner();
        update({ expanded: { key, label, value, apply }, fullscreen: true });
      },OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60007",null,__operitUiTemplate_60007)],__operitUiTemplate_59709)],__operitUiTemplate_59643) }
  }],__operitUiTemplate_59334)],__operitUiTemplate_59280);
  const check = (key, label, checked, apply) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60112",[key,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60194",[checked,enabled,apply],__operitUiTemplate_60194),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60257",[label],__operitUiTemplate_60257)],__operitUiTemplate_60112);
  const configure = (key, label, value, apply) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60350",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60413",[key,enabled ? apply : void 0,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60527",[label,enabled,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60569",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60647",[value],__operitUiTemplate_60647),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:60744",null,__operitUiTemplate_60744)],__operitUiTemplate_60569)],__operitUiTemplate_60527)],__operitUiTemplate_60413)],__operitUiTemplate_60350);
  const select = (key, label, value, choices, apply, empty2 = "\u4E0D\u7ED1\u5B9A") => configure(key, label, choices.find((option) => option.id === value)?.label ?? (value === null ? empty2 : "\u5DF2\u7ED1\u5B9A\u914D\u7F6E\u4E0D\u5B58\u5728\uFF1A" + value), () => {
    assertOwner();
    update({ picker: { title: "\u9009\u62E9" + label, key, value, choices, apply, query: "" } });
  });
  const binding = (key, title, subtitleOff, subtitleOn, checked, apply, children, switchEnabled = true) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:61295",[key,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:61353",[ctx.Modifier.border(1, colors.outlineVariant.copy({ alpha: 0.24 }), { cornerRadius: 12 }),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:61541",[[
      OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:61587",[ctx.Modifier.heightIn({ minHeight: 46 }),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:61725",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:61767",[title,enabled && switchEnabled ? colors.onSurface : colors.onSurface.copy({ alpha: 0.46 })],__operitUiTemplate_61767),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:61923",[checked ? subtitleOn : subtitleOff,enabled && switchEnabled ? colors.onSurfaceVariant : colors.onSurfaceVariant.copy({ alpha: 0.46 })],__operitUiTemplate_61923)],__operitUiTemplate_61725),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:62113",[key + "-switch",checked,enabled && switchEnabled,ctx.Modifier.scale(0.82),apply],__operitUiTemplate_62113)],__operitUiTemplate_61587),
      ...checked || !switchEnabled ? [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:62305",null,__operitUiTemplate_62305), ...children] : []
    ]],__operitUiTemplate_61541)],__operitUiTemplate_61353)],__operitUiTemplate_61295);
  const body = (key, children, padding = { paddingStart: 18, paddingTop: 10, paddingEnd: 18, paddingBottom: 10 }) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:62483",[key,children.map((child, index) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:62561",[key + "-item-" + String(child.props?.key ?? index),padding.paddingStart,padding.paddingEnd,index === 0 ? padding.paddingTop : 0,index === children.length - 1 ? padding.paddingBottom : 0,child],__operitUiTemplate_62561))],__operitUiTemplate_62483);
  const tabs = (key, labels, selected, apply) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:62930",[key,selected,labels.map((label, tab) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:63055",[key + "-" + tab,selected === tab,enabled,() => {
      assertOwner();
      apply(tab);
    },OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:63192",[label],__operitUiTemplate_63192)],__operitUiTemplate_63055))],__operitUiTemplate_62930);
  const standardButton = (key, label, action, filled = false) => filled ? OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:63324",[key,label,enabled,action],__operitUiTemplate_63324) : OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:63388",[key,label,enabled,action],__operitUiTemplate_63388);
  function shell(title, child, actions, width = 760, height = 820, plainBody = false, reading = false) {
    return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:63571",[{ key: "native-entity-panel", ...state.fullscreen ? { fillMaxSize: true } : { width, height }, modifier: ctx.Modifier.clip({ cornerRadius: state.fullscreen ? 0 : 28 }) },[
      OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:63764",[reading ? 18 : 22,reading ? 8 : 12,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:63958",[{ text: title, style: reading ? "labelLarge" : "headlineSmall", fontWeight: reading ? "600" : "700", ...reading ? { color: colors.onSurfaceVariant, fontSize: 14 } : {}, maxLines: 2, overflow: "ellipsis", weight: 1 }],__operitUiTemplate_63958),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:64196",[enabled,close],__operitUiTemplate_64196)],__operitUiTemplate_63764),
      ...state.busy ? [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:64312",null,__operitUiTemplate_64312)] : [],
      ...state.error === "" ? [] : [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:64410",[state.error,colors.error],__operitUiTemplate_64410)],
      OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:64557",[{ key: "entity-content", weight: 1, fillMaxWidth: true, ...plainBody ? {} : { paddingStart: 24, paddingTop: 16, paddingEnd: 24, paddingBottom: 20 } },child],__operitUiTemplate_64557),
      OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:64733",[actions],__operitUiTemplate_64733)
    ]],__operitUiTemplate_63571);
  }
  let panel;
  const cancel = standardButton("entity-cancel", "\u53D6\u6D88", close);
  if (state.expanded !== null) {
    const expanded = state.expanded;
    panel = shell(expanded.label, OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:65130",[expanded.label,expanded.value,enabled,(value) => {
      assertOwner();
      if (live.current.expanded !== null) update({ expanded: { ...live.current.expanded, value } });
    }],__operitUiTemplate_65130), [
      cancel,
      standardButton("entity-primary", "\u4FDD\u5B58", () => {
        assertOwner();
        const draft = live.current.expanded;
        if (draft !== null) {
          draft.apply(draft.value);
          update({ expanded: null, fullscreen: false });
        }
      }, true)
    ], 760, 620);
  } else if (state.picker !== null) {
    const picker = state.picker;
    const themePending = (picker.key === "theme" || picker.key === "entity-theme-picker") && state.themes === null;
    const choose = (id2) => {
      assertOwner();
      picker.apply(id2);
      update({ picker: null });
    };
    const choices = picker.choices.filter((option) => (option.label + " " + (option.subtitle ?? "")).toLowerCase().includes(picker.query.trim().toLowerCase()));
    panel = shell(picker.title, OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:66249",[[
      field("picker-query", "\u641C\u7D22", picker.query, (query) => {
        assertOwner();
        if (live.current.picker !== null) update({ picker: { ...live.current.picker, query } });
      }),
      ...themePending ? [state.themeError === "" ? caption("\u6B63\u5728\u8BFB\u53D6\u4E3B\u9898\u914D\u7F6E\u2026") : OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:66608",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:66647",[state.themeError,colors.error],__operitUiTemplate_66647),standardButton("entity-picker-retry", "\u91CD\u65B0\u52A0\u8F7D\u4E3B\u9898", loadThemes)],__operitUiTemplate_66608)] : [],
      OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:66814",[[
        OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:66904",[() => choose(null),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:67081",[picker.value === null ? "CheckCircle" : "CircleOutlined",picker.value === null ? colors.primary : colors.onSurfaceVariant],__operitUiTemplate_67081),text3("\u8DDF\u968F\u5168\u5C40 / \u4E0D\u7ED1\u5B9A")],__operitUiTemplate_66904),
        ...choices.map((option) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:67337",["entity-picker-" + option.id,() => choose(option.id),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:67526",[picker.value === option.id ? "CheckCircle" : "CircleOutlined",picker.value === option.id ? colors.primary : colors.onSurfaceVariant],__operitUiTemplate_67526),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:67699",[[text3(option.label), ...option.subtitle === void 0 ? [] : [caption(option.subtitle)]]],__operitUiTemplate_67699)],__operitUiTemplate_67337))
      ]],__operitUiTemplate_66814)
    ]],__operitUiTemplate_66249), [cancel], 580, 560);
  } else if (state.toolDraft !== null && state.snapshot !== null) {
    const draft = state.toolDraft, catalog = state.snapshot.toolCatalog;
    const names = ["\u5185\u7F6E\u5DE5\u5177", "\u63D2\u4EF6", "\u6280\u80FD", "MCP"], keys = ["allowedBuiltinTools", "allowedPackages", "allowedSkills", "allowedMcpServers"];
    const key = keys[state.toolTab], options = [catalog.builtinTools, catalog.packages, catalog.skills, catalog.mcpServers][state.toolTab];
    const children = options.filter((option) => (option.displayName + " " + option.description).toLowerCase().includes(state.toolQuery.toLowerCase())).map((option) => check("entity-tool-" + key + "-" + option.name, option.displayName, draft[key].includes(option.name), (checked) => {
      assertOwner();
      const policy = live.current.toolDraft;
      if (policy !== null) update({ toolDraft: { ...policy, [key]: checked ? [...policy[key], option.name] : policy[key].filter((name) => name !== option.name) } });
    }));
    panel = shell("\u914D\u7F6E\u5141\u8BB8\u4F7F\u7528\u7684\u5DE5\u5177", OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:68915",[tabs("entity-tool-tabs", names, state.toolTab, (toolTab) => update({ toolTab })),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:69048",[field("tool-query", "\u641C\u7D22", state.toolQuery, (toolQuery) => update({ toolQuery }))],__operitUiTemplate_69048),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:69221",[body("entity-tool-list", children)],__operitUiTemplate_69221)],__operitUiTemplate_68915), [cancel, standardButton("entity-primary", "\u786E\u5B9A", () => {
      assertOwner();
      if (live.current.toolDraft !== null) changeCard({ toolAccessConfig: copy(live.current.toolDraft) });
      update({ toolDraft: null });
    }, true)], 760, 620, true);
  } else if (state.exporting) {
    const exportFile = (format2) => __async(null, null, function* () {
      yield act(() => __async(null, null, function* () {
        const content = input.entity === "card" ? yield request({ action: "exportCharacter", id: input.id, format: format2 }) : yield request({ action: "exportGroup", id: input.id });
        assertOwner();
        const name = input.entity === "card" ? card().name : group().name;
        update({ exportContent: content, exportName: name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") + "-" + format2 + ".json" });
      }));
    });
    const writeExport = () => __async(null, null, function* () {
      yield act(() => __async(null, null, function* () {
        const result = yield ctx.saveFile({ suggestedName: live.current.exportName, content: live.current.exportContent, mimeType: "application/json", extensions: ["json"] });
        assertOwner();
        if (result.cancelled) return;
        update({ exporting: false, exportContent: "", exportName: "" });
      }));
    });
    panel = shell("\u5BFC\u51FA", state.exportContent === "" ? OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:70678",[[standardButton("entity-export-json", "\u5BFC\u51FA JSON", () => exportFile("operit")), ...input.entity === "card" ? [standardButton("entity-export-tavern", "\u5BFC\u51FA\u9152\u9986 JSON", () => exportFile("tavern"))] : []]],__operitUiTemplate_70678) : body("entity-export-body", [caption("\u70B9\u51FB\u4FDD\u5B58\u6587\u4EF6\u9009\u62E9\u4FDD\u5B58\u4F4D\u7F6E\u3002"), section("JSON", state.exportContent)]), [cancel, ...state.exportContent === "" ? [] : [standardButton("entity-export-save", "\u4FDD\u5B58\u6587\u4EF6", writeExport, true)]], state.exportContent === "" ? 420 : 760, state.exportContent === "" ? 240 : 620);
  } else if (state.tagDraft !== null) {
    const draft = state.tagDraft;
    const children = state.tagDeleting ? [text3(`\u786E\u5B9A\u5220\u9664\u6807\u7B7E\u201C${draft.name}\u201D\uFF1F`)] : [["name", "\u6807\u7B7E\u540D\u79F0", 1], ["description", "\u63CF\u8FF0", 1], ["promptContent", "\u63D0\u793A\u8BCD\u5185\u5BB9", 6]].map(([key, label, lines]) => field("tag-" + key, label, draft[key], (value) => {
      assertOwner();
      if (live.current.tagDraft !== null) update({ tagDraft: { ...live.current.tagDraft, [key]: value } });
    }, lines));
    panel = shell(state.tagDeleting ? "\u5220\u9664\u6807\u7B7E" : draft.id === "" ? "\u521B\u5EFA\u6807\u7B7E" : "\u7F16\u8F91\u6807\u7B7E", body("entity-tag-body", children, { paddingStart: 0, paddingTop: 0, paddingEnd: 0, paddingBottom: 0 }), [
      ...draft.id === "" || state.tagDeleting ? [] : [standardButton("entity-tag-delete", "\u5220\u9664", () => {
        assertOwner();
        update({ tagDeleting: true });
      })],
      cancel,
      standardButton("entity-primary", state.tagDeleting ? "\u5220\u9664" : "\u4FDD\u5B58", stageTag, true)
    ], 620, state.tagDeleting ? 240 : 520);
  } else if (state.tagManaging) {
    panel = shell("\u7BA1\u7406\u6807\u7B7E", body("entity-tag-manager", state.tags.map((tag) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:72618",["entity-tag-row-" + tag.id,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:72723",[check("entity-tag-" + tag.id, tag.name, state.card?.attachedTagIds.includes(tag.id) ?? false, (checked) => changeCard({ attachedTagIds: checked ? [...card().attachedTagIds, tag.id] : card().attachedTagIds.filter((id2) => id2 !== tag.id) }))],__operitUiTemplate_72723),standardButton("entity-tag-edit-" + tag.id, "\u7F16\u8F91", () => {
        assertOwner();
        update({ tagDraft: copy(tag) });
      }),standardButton("entity-tag-remove-" + tag.id, "\u5220\u9664", () => {
        assertOwner();
        update({ tagDraft: copy(tag), tagDeleting: true });
      })],__operitUiTemplate_72618)), { paddingStart: 0, paddingTop: 0, paddingEnd: 0, paddingBottom: 0 }), [standardButton("entity-tag-create", "\u521B\u5EFA\u6807\u7B7E", () => {
      assertOwner();
      update({ tagDraft: { id: "", name: "", description: "", promptContent: "", tagType: "CUSTOM" } });
    }), standardButton("entity-cancel", "\u5B8C\u6210", close)], 620, 560);
  } else if (state.deleting) {
    panel = shell("\u786E\u8BA4\u5220\u9664", text3(`\u786E\u5B9A\u5220\u9664\u201C${state.card?.name ?? state.group?.name}\u201D\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002`), [cancel, standardButton("entity-primary", "\u5220\u9664", remove, true)], 560, 240);
  } else {
    const pages = [[], [], []];
    if (state.loading) pages[0].push(OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:74045",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:74107",null,__operitUiTemplate_74107)],__operitUiTemplate_74045));
    else if (state.snapshot === null) pages[0].push(standardButton("entity-retry", "\u91CD\u65B0\u52A0\u8F7D", load));
    else if (state.card !== null) {
      const draft = state.card, snapshot2 = state.snapshot;
      if (!state.editing) {
        pages[0].push(...renderEntityPreview(ctx, {
          card: draft,
          group: null,
          snapshot: snapshot2,
          tags: state.tags,
          avatar: state.avatar,
          themes: state.themes,
          themeError: state.themeError,
          configurationExpanded: state.previewConfigurationExpanded,
          onToggleConfiguration: togglePreviewConfiguration
        }));
      } else {
        pages[0].push(
          field("name", "\u89D2\u8272\u540D\u79F0", draft.name, (name) => changeCard({ name })),
          field("description", "\u63CF\u8FF0", draft.description, (description) => changeCard({ description })),
          OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:75052",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:75106",[enabled,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:75176",[[
            OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:75254",[{ key: "entity-edit-avatar", ...draft.avatarUri === null ? { path: state.avatar ?? void 0 } : { uri: draft.avatarUri }, width: 44, height: 44, contentScale: "crop", contentDescription: "\u89D2\u8272\u5934\u50CF", modifier: ctx.Modifier.clip({ type: "circle" }) }],__operitUiTemplate_75254),
            OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:75544",null,__operitUiTemplate_75544),
            OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:75586",[draft.avatarUri ?? "\u672A\u8BBE\u7F6E"],__operitUiTemplate_75586),
            OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:75729",null,__operitUiTemplate_75729),
            standardButton("entity-choose-avatar", "\u9009\u62E9", chooseAvatar),
            ...draft.avatarUri === null ? [] : [standardButton("entity-clear-avatar", "\u6E05\u9664", () => __async(null, null, function* () {
              yield act(() => __async(null, null, function* () {
                assertOwner();
                update({ card: { ...card(), avatarUri: null } });
                if (live.current.avatar === null) void loadDefaultAvatar();
              }));
            }))]
          ]],__operitUiTemplate_75176)],__operitUiTemplate_75106)],__operitUiTemplate_75052),
          field("characterSetting", "\u89D2\u8272\u8BBE\u5B9A", draft.characterSetting, (characterSetting) => changeCard({ characterSetting }), 6),
          field("openingStatement", "\u5F00\u573A\u767D", draft.openingStatement, (openingStatement) => changeCard({ openingStatement }), 3),
          OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:76573",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:76644",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:76709",null,__operitUiTemplate_76709),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:76778",[enabled,() => {
              assertOwner();
              update({ tagManaging: true });
            },OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:76942",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:76999",null,__operitUiTemplate_76999),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:77040",null,__operitUiTemplate_77040)],__operitUiTemplate_76942)],__operitUiTemplate_76778)],__operitUiTemplate_76644),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:77108",null,__operitUiTemplate_77108),state.tags.length === 0 ? caption("\u6682\u65E0\u63D0\u793A\u8BCD\u6807\u7B7E") : OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:77232",[state.tags.map((tag) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:77302",["entity-tag-" + tag.id,draft.attachedTagIds.includes(tag.id),enabled,OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:77416",[tag.name,ctx.Modifier.widthIn({ maxWidth: 160 })],__operitUiTemplate_77416),() => {
              assertOwner();
              changeCard({ attachedTagIds: card().attachedTagIds.includes(tag.id) ? card().attachedTagIds.filter((id2) => id2 !== tag.id) : [...card().attachedTagIds, tag.id] });
            }],__operitUiTemplate_77302))],__operitUiTemplate_77232)],__operitUiTemplate_76573)
        );
        for (const [key, label, lines] of [["otherContentChat", "\u804A\u5929\u9644\u52A0\u5185\u5BB9", 4], ["otherContentVoice", "\u8BED\u97F3\u9644\u52A0\u5185\u5BB9", 4], ["advancedCustomPrompt", "\u9AD8\u7EA7\u81EA\u5B9A\u4E49 Prompt", 4], ["marks", "\u5907\u6CE8", 3]]) pages[1].push(field(key, label, draft[key], (value) => changeCard({ [key]: value }), lines));
        const tts = snapshot2.ttsConfigs.find((config) => config.id === draft.ttsConfigId);
        const policy = draft.toolAccessConfig, count = policy.allowedBuiltinTools.length + policy.allowedPackages.length + policy.allowedSkills.length + policy.allowedMcpServers.length;
        pages[2].push(
          binding("entity-model", "\u804A\u5929\u6A21\u578B", "\u8DDF\u968F\u5168\u5C40\u6A21\u578B\u914D\u7F6E", "\u4F7F\u7528\u56FA\u5B9A\u6A21\u578B\u914D\u7F6E", draft.chatModelBindingMode === "FIXED_MODEL", (checked) => changeCard({ chatModelBindingMode: checked ? "FIXED_MODEL" : "FOLLOW_GLOBAL", chatModelId: checked ? card().chatModelId : null, chatProviderId: checked ? card().chatProviderId : null }), [select("entity-model-picker", "\u804A\u5929\u6A21\u578B\u914D\u7F6E", draft.chatProviderId === null || draft.chatModelId === null ? null : JSON.stringify([draft.chatProviderId, draft.chatModelId]), snapshot2.models.map((value) => ({ id: JSON.stringify([value.providerId, value.modelId]), label: value.modelId, subtitle: value.providerName })), (selected) => {
            const model = snapshot2.models.find((value) => JSON.stringify([value.providerId, value.modelId]) === selected);
            if (model === void 0) throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u7684\u63D0\u4F9B\u5546\u4E0E\u6A21\u578B");
            changeCard({ chatProviderId: model.providerId, chatModelId: model.modelId });
          }, "\u8BF7\u9009\u62E9\u804A\u5929\u6A21\u578B")]),
          binding("entity-theme", "\u4E3B\u9898\u914D\u7F6E", "\u4E0D\u6539\u53D8\u5F53\u524D\u72EC\u7ACB\u4E3B\u9898", "\u4F7F\u7528\u89D2\u8272\u5361\u4E3B\u9898\u914D\u7F6E", draft.themeConfigId !== null, (checked) => {
            if (!checked) changeCard({ themeConfigId: null });
            else update({ picker: { title: "\u9009\u62E9\u4E3B\u9898\u914D\u7F6E", key: "theme", value: draft.themeConfigId, choices: state.themes ?? [], apply: (themeConfigId) => changeCard({ themeConfigId }), query: "" } });
          }, [select("entity-theme-picker", "\u4E3B\u9898\u914D\u7F6E", draft.themeConfigId, state.themes ?? [], (themeConfigId) => changeCard({ themeConfigId }))]),
          binding("entity-tts", "TTS \u914D\u7F6E", "\u8DDF\u968F\u5168\u5C40 TTS \u914D\u7F6E", "\u4F7F\u7528\u89D2\u8272\u5361 TTS \u914D\u7F6E", draft.ttsConfigId !== null, (checked) => {
            if (!checked) changeCard({ ttsConfigId: null });
            else update({ picker: { title: "\u9009\u62E9 TTS \u914D\u7F6E", key: "tts", value: draft.ttsConfigId, choices: snapshot2.ttsConfigs.map((config) => ({ id: config.id, label: config.name, subtitle: config.providerType + " \xB7 " + config.voice })), apply: (ttsConfigId) => changeCard({ ttsConfigId }), query: "" } });
          }, [select("entity-tts-picker", "TTS \u914D\u7F6E", draft.ttsConfigId, snapshot2.ttsConfigs.map((config) => ({ id: config.id, label: config.name, subtitle: config.providerType + " \xB7 " + config.voice })), (ttsConfigId) => changeCard({ ttsConfigId }), tts?.name ?? "\u8BF7\u9009\u62E9 TTS \u914D\u7F6E")]),
          binding("entity-memory", "\u8BB0\u5FC6\u7ED1\u5B9A", "\u4F7F\u7528\u89D2\u8272\u8BB0\u5FC6", "\u4F7F\u7528\u5171\u4EAB\u8BB0\u5FC6", draft.memoryBindingMode === "SHARED", (checked) => changeCard({ memoryBindingMode: checked ? "SHARED" : "CHARACTER", sharedMemoryId: checked ? card().sharedMemoryId : null }), [snapshot2.stores.length === 0 ? caption("\u8FD8\u6CA1\u6709\u5171\u4EAB\u8BB0\u5FC6\u5E93") : select("entity-store-picker", "\u5171\u4EAB\u8BB0\u5FC6\u5E93", draft.sharedMemoryId, snapshot2.stores.map((store) => ({ id: store.id, label: store.name })), (sharedMemoryId) => changeCard({ sharedMemoryId }), "\u8BF7\u9009\u62E9\u5171\u4EAB\u8BB0\u5FC6\u5E93")], snapshot2.stores.length !== 0),
          binding("entity-tool", "\u5DE5\u5177\u8BBF\u95EE", "\u8DDF\u968F\u5168\u5C40\u5DE5\u5177\u914D\u7F6E", "\u81EA\u5B9A\u4E49\u5141\u8BB8\u4F7F\u7528\u7684\u5DE5\u5177", policy.enabled, (checked) => changeCard({ toolAccessConfig: { ...card().toolAccessConfig, enabled: checked } }), [configure("entity-tool-configure", "\u914D\u7F6E\u5141\u8BB8\u4F7F\u7528\u7684\u5DE5\u5177", "\u5DF2\u914D\u7F6E " + count + " \u4E2A\u5DE5\u5177\u6765\u6E90", () => {
            assertOwner();
            update({ toolDraft: copy(card().toolAccessConfig), toolTab: 0, toolQuery: "" });
          })])
        );
        if (draft.sharedMemoryMounts.length !== 0) pages[2].push(section("\u5171\u4EAB\u8BB0\u5FC6\u6302\u8F7D", JSON.stringify(draft.sharedMemoryMounts, null, 2)));
        if (state.themeError !== "") pages[2].push(OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:82758",[state.themeError,colors.error],__operitUiTemplate_82758), standardButton("entity-theme-retry", "\u91CD\u65B0\u52A0\u8F7D\u4E3B\u9898", () => __async(null, null, function* () {
          yield act(loadThemes);
        })));
      }
    } else if (state.group !== null && state.snapshot !== null) {
      const draft = state.group, snapshot2 = state.snapshot;
      if (!state.editing) pages[0].push(...renderEntityPreview(ctx, {
        card: null,
        group: draft,
        snapshot: snapshot2,
        tags: state.tags,
        avatar: state.avatar,
        themes: state.themes,
        themeError: state.themeError,
        configurationExpanded: state.previewConfigurationExpanded,
        onToggleConfiguration: togglePreviewConfiguration
      }));
      else {
        pages[0].push(field("name", "\u7FA4\u7EC4\u540D\u79F0", draft.name, (name) => changeGroup({ name })), field("description", "\u63CF\u8FF0", draft.description, (description) => changeGroup({ description })), select("entity-theme-picker", "\u4E3B\u9898\u914D\u7F6E", draft.themeConfigId, state.themes ?? [], (themeConfigId) => changeGroup({ themeConfigId })), OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:83899",null,__operitUiTemplate_83899));
        for (const option of snapshot2.cards) {
          const selected = draft.members.some((member2) => member2.characterCardId === option.id);
          pages[0].push(OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:84195",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:84248",["entity-member-" + option.id,selected ? colors.primaryContainer.copy({ alpha: 0.16 }) : colors.surfaceContainerHighest.copy({ alpha: 0.28 }),ctx.Modifier.border(1, selected ? colors.primary.copy({ alpha: 0.45 }) : colors.outlineVariant.copy({ alpha: 0.28 }), { cornerRadius: 10 }),() => {
              assertOwner();
              const members = selected ? group().members.filter((member2) => member2.characterCardId !== option.id) : [...group().members, { characterCardId: option.id, orderIndex: group().members.length }];
              changeGroup({ members: members.map((member2, orderIndex) => ({ ...member2, orderIndex })) });
            },OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:85081",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:85202",[selected ? "CheckCircle" : "CircleOutlined",selected ? colors.primary : colors.onSurfaceVariant],__operitUiTemplate_85202),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:85339",[{ width: 28, height: 28, ...option.avatarUri === null ? { path: state.avatar ?? void 0 } : { uri: option.avatarUri }, modifier: ctx.Modifier.clip({ type: "circle" }), contentScale: "crop", contentDescription: option.name }],__operitUiTemplate_85339),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:85577",[[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:85607",[option.name],__operitUiTemplate_85607), ...option.description.trim() === "" ? [] : [caption(option.description)]]],__operitUiTemplate_85577)],__operitUiTemplate_85081)],__operitUiTemplate_84248)],__operitUiTemplate_84195));
        }
      }
    }
    const isCard = state.card !== null;
    const reading = !state.editing;
    const page = reading ? body("entity-preview-body", pages[0], { paddingStart: 24, paddingTop: 8, paddingEnd: 24, paddingBottom: 24 }) : isCard ? OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:86047",[tabs("entity-tab", ["\u57FA\u7840", "\u5185\u5BB9", "\u7ED1\u5B9A"], state.tab, (tab) => update({ tab })),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:86192",[state.tab,(tab) => {
      assertOwner();
      if (tab >= 0 && tab < 3) update({ tab });
    },pages.map((children, index) => body("entity-body-" + index, children))],__operitUiTemplate_86192)],__operitUiTemplate_86047) : body("entity-body", pages[0], { paddingStart: 0, paddingTop: 0, paddingEnd: 0, paddingBottom: 0 });
    const title = state.editing ? input.mode === "create" ? input.entity === "card" ? "\u521B\u5EFA\u89D2\u8272\u5361" : "\u521B\u5EFA\u7FA4\u7EC4" : input.entity === "card" ? "\u7F16\u8F91\u89D2\u8272\u5361" : "\u7F16\u8F91\u7FA4\u7EC4" : input.entity === "card" ? "\u89D2\u8272\u5361" : "\u89D2\u8272\u7FA4\u7EC4";
    panel = shell(title, page, [
      ...state.editing && input.mode !== "create" ? [
        standardButton("entity-delete", "\u5220\u9664", () => {
          assertOwner();
          update({ deleting: true });
        }),
        standardButton("entity-export", "\u5BFC\u51FA", () => {
          assertOwner();
          update({ exporting: true });
        })
      ] : [],
      standardButton("entity-cancel", state.editing ? "\u53D6\u6D88" : "\u5173\u95ED", close),
      ...state.snapshot === null || state.finished ? [] : [standardButton("entity-primary", state.editing ? "\u4FDD\u5B58" : "\u7F16\u8F91", state.editing ? save : edit, true)]
    ], reading ? isCard ? 680 : 620 : isCard ? 760 : 620, reading ? 760 : 820, reading || isCard, reading);
  }
  return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:87662",[load,close,colors.surfaceContainerHigh,state.fullscreen ? 0 : 28,state.fullscreen,panel],__operitUiTemplate_87662);
}

// src/ui-editor.ts
function webArguments(value, expected) {
  if (value.length !== 1 || !Array.isArray(value[0]) || value[0].length !== expected) throw new Error(`CharacterMemoryHost expects ${expected} arguments`);
  return value[0];
}
function renderScreen(ctx, definition2, requiredMode = null, managementView = "characters") {
  const controller = ctx.createWebViewController("character-memory-web");
  const [path, setPath] = ctx.useState("character-memory-html", "");
  const [error, setError] = ctx.useState("character-memory-error", "");
  const ready = ctx.useRef("character-memory-ready", false);
  const unsubscribe = ctx.useRef("character-memory-theme-subscription", null);
  const [presentation] = ctx.useState("presentation", null);
  const session = ctx.useRef("character-memory-screen-session", null);
  if (session.current === null) session.current = createUiScreenSession(presentation);
  const screenSession = session.current;
  const [managed, setManaged] = ctx.useState("managed-entity", null);
  const managedLive = ctx.useRef("managed-entity-live", managed);
  managedLive.current = managed;
  const nextManaged = ctx.useRef("managed-entity-counter", 0);
  function finishEntity(result) {
    managedLive.current = null;
    setManaged(null);
    void controller.evaluateJavascript("window.dispatchEvent(new CustomEvent('character-entity-closed', { detail: " + JSON.stringify(result) + " }));").catch((error2) => setError(String(error2)));
  }
  if (requiredMode !== null && screenSession.currentScreen().input.mode !== requiredMode) throw new Error("The attachment route requires an explicit attachment presentation");
  const origin = "https://characters.operit.local/";
  const avatars = ctx.useRef("character-memory-avatar-resources", createAvatarResources(origin)).current;
  function applyTheme(theme) {
    return __async(this, null, function* () {
      if (ready.current) yield controller.evaluateJavascript(`window.applyCharacterMemoryTheme(${JSON.stringify(theme)});`);
    });
  }
  function initialize() {
    return __async(this, null, function* () {
      try {
        controller.addJavascriptInterface("CharacterMemoryHost", {
          /** Loads the initial route, palette and domain aggregate in one existing bridge invocation. */
          loadScreen: (...args) => __async(null, null, function* () {
            webArguments(args, 0);
            const current = screenSession.currentScreen();
            const screen = current.input.mode === "manage" && managementView === "memory" ? { ...current, input: { mode: "manage", view: "memory" } } : current;
            const snapshot2 = yield ToolPkg.ipc.call("character-memory.request", { action: "snapshot" }, { targetRuntime: "main" });
            ready.current = true;
            return { theme: ctx.Theme.getCurrent(), screen, snapshot: snapshot2 };
          }),
          /** Routes all editing operations through this package's main runtime. */
          request: (...args) => __async(null, null, function* () {
            const [request2] = webArguments(args, 1);
            const decoded = record(request2, "character-memory.request");
            return ToolPkg.ipc.call("character-memory.request", decoded, { targetRuntime: "main" });
          }),
          /** Returns an explicit completion action result for this exact presented screen. */
          completeScreen: (...args) => {
            const [result] = webArguments(args, 1);
            const current = screenSession.currentScreen();
            if (current.input.mode === "manage") throw new Error("Management has no presentation completion channel");
            return screenSession.completeScreen(parseScreenResult(result, current.input));
          },
          /** Returns an explicit cancellation action result without changing the selected identity. */
          cancelScreen: (...args) => {
            webArguments(args, 0);
            return screenSession.cancelScreen();
          },
          /** Returns a document resource reference without transporting image bytes through JS. */
          avatarImage: (...args) => __async(null, null, function* () {
            const [uri] = webArguments(args, 1);
            if (uri !== null && typeof uri !== "string") throw new Error("\u5934\u50CF\u8DEF\u5F84\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216 null");
            return avatars.source(uri);
          }),
          /** Opens the same native entity renderer used by chat avatars and the sidebar. */
          openEntity: (...args) => {
            const [mode, entity, id2] = webArguments(args, 3);
            if (screenSession.currentScreen().input.mode !== "manage") throw new Error("Only management can open a local entity dialog");
            if (mode !== "create" && mode !== "edit" && mode !== "preview" || entity !== "card" && entity !== "group" || typeof id2 !== "string" || (mode === "create" ? id2 !== "" : id2.trim() === "")) throw new Error("Invalid native entity dialog request");
            if (managedLive.current !== null) throw new Error("An entity dialog is already open");
            const request2 = { requestId: "management-" + ++nextManaged.current, input: mode === "create" ? { mode, entity, id: "" } : { mode, entity, id: id2 } };
            managedLive.current = request2;
            setManaged(request2);
            return null;
          },
          /** Saves an export through the same host boundary used for file selection. */
          exportFile: (...args) => __async(null, null, function* () {
            const [name, content] = webArguments(args, 2);
            if (typeof name !== "string" || name.trim() === "") throw new Error("\u5BFC\u51FA\u6587\u4EF6\u540D\u4E0D\u80FD\u4E3A\u7A7A");
            if (typeof content !== "string") throw new Error("\u5BFC\u51FA\u5185\u5BB9\u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
            return ctx.saveFile({ suggestedName: name, content, mimeType: "application/json", extensions: ["json"] });
          })
        });
        unsubscribe.current = ctx.Theme.subscribe(applyTheme);
        setPath(yield ToolPkg.readResource("character_memory_html", "character-memory.html"));
      } catch (failure) {
        setError(String(failure));
      }
    });
  }
  function dispose() {
    ready.current = false;
    if (unsubscribe.current !== null) {
      unsubscribe.current();
      unsubscribe.current = null;
    }
  }
  return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:94423",[initialize,[path === "" ? OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:94492",[error === "" ? `\u6B63\u5728\u52A0\u8F7D${managementView === "memory" ? "\u8BB0\u5FC6" : definition2.title}\u2026` : error],__operitUiTemplate_94492) : OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/main/index.ui.js:94640",[controller,origin,(request2) => request2.url === origin ? { action: "allow" } : { action: "cancel" },(request2) => avatars.intercept(request2) ?? (request2.url === origin ? { action: "respond", response: { mimeType: "text/html", encoding: "utf-8", statusCode: 200, reasonPhrase: "OK", filePath: path } } : { action: "block" }),(event) => {
      if (event.type === "Disposed") dispose();
    }],__operitUiTemplate_94640), ...managed === null ? [] : [renderManagedEntityScreen(ctx, managed, finishEntity)]]],__operitUiTemplate_94423);
}

// src/ui/main/index.ui.ts
function Screen(ctx) {
  const [presentation] = ctx.useState("presentation", null);
  if (presentation !== null && (presentation.input.mode === "preview" || presentation.input.mode === "edit")) return renderEntityScreen(ctx, presentation);
  return renderScreen(ctx, definition);
}

function __operitUiTemplate_34154(__ctx,__values){return __ctx.UI.Text({text:__values[0],fillMaxWidth:true,style:"bodyMedium",color:__values[1]}); }
function __operitUiTemplate_34119(__ctx,__values){return __ctx.UI.SelectionContainer({key:__values[0]},__values[1]); }
function __operitUiTemplate_34505(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"labelMedium",color:__values[1]}); }
function __operitUiTemplate_34318(__ctx,__values){return __ctx.UI.Box({key:__values[0],paddingHorizontal:10,paddingVertical:5,backgroundColor:__values[1],backgroundShape:{cornerRadius:8}},__values[2]); }
function __operitUiTemplate_35100(__ctx,__values){return __ctx.UI.Icon({name:"GroupsOutlined",size:34,tint:__values[0]}); }
function __operitUiTemplate_34931(__ctx,__values){return __ctx.UI.Box({width:72,height:72,contentAlignment:"center",backgroundColor:__values[0],backgroundShape:{cornerRadius:20}},__values[1]); }
function __operitUiTemplate_35175(__ctx,__values){return __ctx.UI.Image(__values[0]); }
function __operitUiTemplate_35550(__ctx,__values){return __ctx.UI.Text({key:"entity-preview-name",text:__values[0],style:"headlineSmall",fontSize:24,fontWeight:"700",fillMaxWidth:true}); }
function __operitUiTemplate_35719(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"labelMedium",color:__values[1]}); }
function __operitUiTemplate_35499(__ctx,__values){return __ctx.UI.Column({weight:1,spacing:6},__values[0]); }
function __operitUiTemplate_34830(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true,spacing:16,verticalAlignment:"center"},[__values[0],__values[1]]); }
function __operitUiTemplate_36028(__ctx,__values){return __ctx.UI.FlowRow({key:"entity-preview-tags",spacing:6,runSpacing:6},__values[0]); }
function __operitUiTemplate_34722(__ctx,__values){return __ctx.UI.Column({key:"entity-preview-identity",fillMaxWidth:true,spacing:14,paddingBottom:22},__values[0]); }
function __operitUiTemplate_36704(__ctx,__values){return __ctx.UI.Icon({name:"FormatQuote",size:20,tint:__values[0]}); }
function __operitUiTemplate_36790(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"titleSmall",fontWeight:"600",color:__values[1],weight:1}); }
function __operitUiTemplate_36604(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true,spacing:8,verticalAlignment:"center"},__values[0]); }
function __operitUiTemplate_36377(__ctx,__values){return __ctx.UI.Column(__values[0],[__values[1],__values[2]]); }
function __operitUiTemplate_36280(__ctx,__values){return __ctx.UI.Box({key:__values[0],fillMaxWidth:true,paddingBottom:22},__values[1]); }
function __operitUiTemplate_40720(__ctx,__values){return __ctx.UI.Text({text:"\u7EC4\u5185\u89D2\u8272",style:"titleSmall",fontWeight:"600",color:__values[0]}); }
function __operitUiTemplate_40876(__ctx,__values){return __ctx.UI.Text({text:"\u6682\u672A\u6DFB\u52A0\u89D2\u8272",style:"bodyMedium",color:__values[0]}); }
function __operitUiTemplate_41310(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"labelMedium",color:__values[1]}); }
function __operitUiTemplate_41433(__ctx,__values){return __ctx.UI.Image(__values[0]); }
function __operitUiTemplate_41778(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"titleSmall",fontWeight:"600",fillMaxWidth:true}); }
function __operitUiTemplate_41958(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"bodySmall",color:__values[1],fillMaxWidth:true}); }
function __operitUiTemplate_41723(__ctx,__values){return __ctx.UI.Column({weight:1,spacing:4},__values[0]); }
function __operitUiTemplate_41143(__ctx,__values){return __ctx.UI.Row({key:__values[0],fillMaxWidth:true,paddingVertical:10,spacing:12,verticalAlignment:"center"},[__values[1],__values[2],__values[3]]); }
function __operitUiTemplate_40611(__ctx,__values){return __ctx.UI.Column({key:"entity-preview-members",fillMaxWidth:true,spacing:10,paddingBottom:22},__values[0]); }
function __operitUiTemplate_42653(__ctx,__values){return __ctx.UI.Icon({name:"Tune",size:20,tint:__values[0]}); }
function __operitUiTemplate_42786(__ctx,__values){return __ctx.UI.Text({text:"\u914D\u7F6E\u6458\u8981",style:"titleSmall",fontWeight:"600"}); }
function __operitUiTemplate_42887(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"bodySmall",color:__values[1]}); }
function __operitUiTemplate_42733(__ctx,__values){return __ctx.UI.Column({weight:1,spacing:3},[__values[0],__values[1]]); }
function __operitUiTemplate_43078(__ctx,__values){return __ctx.UI.Icon({name:__values[0],size:20,tint:__values[1]}); }
function __operitUiTemplate_42553(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true,padding:16,spacing:10,verticalAlignment:"center"},[__values[0],__values[1],__values[2]]); }
function __operitUiTemplate_42375(__ctx,__values){return __ctx.UI.Surface({key:"entity-preview-config-toggle",fillMaxWidth:true,color:"transparent",shape:{cornerRadius:16},onClick:__values[0]},__values[1]); }
function __operitUiTemplate_43528(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"labelMedium",color:__values[1]}); }
function __operitUiTemplate_43427(__ctx,__values){return __ctx.UI.Column({key:__values[0],fillMaxWidth:true,spacing:4},[__values[1],__values[2]]); }
function __operitUiTemplate_43254(__ctx,__values){return __ctx.UI.Column({key:"entity-preview-config-details",fillMaxWidth:true,paddingStart:16,paddingEnd:16,paddingBottom:18,spacing:14},__values[0]); }
function __operitUiTemplate_42217(__ctx,__values){return __ctx.UI.Column({key:"entity-preview-config",fillMaxWidth:true,backgroundColor:__values[0],backgroundShape:{cornerRadius:16}},__values[1]); }
function __operitUiTemplate_58745(__ctx,__values){return __ctx.UI.Text({text:__values[0],fillMaxWidth:true,style:"bodyMedium"}); }
function __operitUiTemplate_58845(__ctx,__values){return __ctx.UI.Text({text:__values[0],fillMaxWidth:true,style:"bodySmall",color:__values[1]}); }
function __operitUiTemplate_59083(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"labelLarge",color:__values[1]}); }
function __operitUiTemplate_59170(__ctx,__values){return __ctx.UI.SelectionContainer({},__values[0]); }
function __operitUiTemplate_58983(__ctx,__values){return __ctx.UI.Column({key:__values[0],fillMaxWidth:true,paddingBottom:12,spacing:6},[__values[1],__values[2]]); }
function __operitUiTemplate_60007(__ctx,__values){return __ctx.UI.Icon({name:"Fullscreen",size:18}); }
function __operitUiTemplate_59709(__ctx,__values){return __ctx.UI.IconButton({key:__values[0],width:28,height:28,contentPadding:{horizontal:0,vertical:0},enabled:__values[1],onClick:__values[2]},__values[3]); }
function __operitUiTemplate_59643(__ctx,__values){return __ctx.UI.Box({width:36,height:36,contentAlignment:"center"},__values[0]); }
function __operitUiTemplate_59334(__ctx,__values){return __ctx.UI.TextField(__values[0]); }
function __operitUiTemplate_59280(__ctx,__values){return __ctx.UI.Box({fillMaxWidth:true,paddingBottom:12},__values[0]); }
function __operitUiTemplate_60194(__ctx,__values){return __ctx.UI.Checkbox({checked:__values[0],enabled:__values[1],onCheckedChange:__values[2]}); }
function __operitUiTemplate_60257(__ctx,__values){return __ctx.UI.Text({text:__values[0],weight:1}); }
function __operitUiTemplate_60112(__ctx,__values){return __ctx.UI.Row({key:__values[0],fillMaxWidth:true,verticalAlignment:"center",spacing:8},[__values[1],__values[2]]); }
function __operitUiTemplate_60647(__ctx,__values){return __ctx.UI.Text({text:__values[0],weight:1,maxLines:1,overflow:"ellipsis",style:"bodyMedium"}); }
function __operitUiTemplate_60744(__ctx,__values){return __ctx.UI.Icon({name:"Tune",size:24}); }
function __operitUiTemplate_60569(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true,verticalAlignment:"center",spacing:12},[__values[0],__values[1]]); }
function __operitUiTemplate_60527(__ctx,__values){return __ctx.UI.InputDecorator({label:__values[0],enabled:__values[1]},__values[2]); }
function __operitUiTemplate_60413(__ctx,__values){return __ctx.UI.Surface({key:__values[0],fillMaxWidth:true,color:"transparent",onClick:__values[1]},__values[2]); }
function __operitUiTemplate_60350(__ctx,__values){return __ctx.UI.Box({fillMaxWidth:true,paddingBottom:12},__values[0]); }
function __operitUiTemplate_61767(__ctx,__values){return __ctx.UI.Text({text:__values[0],fontSize:14,fontWeight:"700",color:__values[1]}); }
function __operitUiTemplate_61923(__ctx,__values){return __ctx.UI.Text({text:__values[0],fontSize:12,color:__values[1]}); }
function __operitUiTemplate_61725(__ctx,__values){return __ctx.UI.Column({weight:1,spacing:1},[__values[0],__values[1]]); }
function __operitUiTemplate_62113(__ctx,__values){return __ctx.UI.Switch({key:__values[0],checked:__values[1],enabled:__values[2],modifier:__values[3],onCheckedChange:__values[4]}); }
function __operitUiTemplate_61587(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true,modifier:__values[0],verticalAlignment:"center",spacing:8},[__values[1],__values[2]]); }
function __operitUiTemplate_62305(__ctx,__values){return __ctx.UI.Spacer({height:6}); }
function __operitUiTemplate_61541(__ctx,__values){return __ctx.UI.Column({fillMaxWidth:true},__values[0]); }
function __operitUiTemplate_61353(__ctx,__values){return __ctx.UI.Box({fillMaxWidth:true,modifier:__values[0],paddingHorizontal:10,paddingVertical:6},__values[1]); }
function __operitUiTemplate_61295(__ctx,__values){return __ctx.UI.Box({key:__values[0],fillMaxWidth:true,paddingBottom:7},__values[1]); }
function __operitUiTemplate_62561(__ctx,__values){return __ctx.UI.Box({key:__values[0],fillMaxWidth:true,paddingStart:__values[1],paddingEnd:__values[2],paddingTop:__values[3],paddingBottom:__values[4]},__values[5]); }
function __operitUiTemplate_62483(__ctx,__values){return __ctx.UI.LazyColumn({key:__values[0],fillMaxWidth:true},__values[1]); }
function __operitUiTemplate_63192(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"titleSmall"}); }
function __operitUiTemplate_63055(__ctx,__values){return __ctx.UI.Tab({key:__values[0],selected:__values[1],enabled:__values[2],onClick:__values[3]},__values[4]); }
function __operitUiTemplate_62930(__ctx,__values){return __ctx.UI.PrimaryTabRow({key:__values[0],fillMaxWidth:true,selectedTabIndex:__values[1],tabs:__values[2]}); }
function __operitUiTemplate_63324(__ctx,__values){return __ctx.UI.Button({key:__values[0],text:__values[1],enabled:__values[2],onClick:__values[3]}); }
function __operitUiTemplate_63388(__ctx,__values){return __ctx.UI.TextButton({key:__values[0],text:__values[1],enabled:__values[2],onClick:__values[3]}); }
function __operitUiTemplate_63958(__ctx,__values){return __ctx.UI.Text(__values[0]); }
function __operitUiTemplate_64196(__ctx,__values){return __ctx.UI.IconButton({key:"entity-close",icon:"Close",enabled:__values[0],onClick:__values[1]}); }
function __operitUiTemplate_63764(__ctx,__values){return __ctx.UI.Row({key:"entity-header",fillMaxWidth:true,paddingStart:24,paddingTop:__values[0],paddingEnd:16,paddingBottom:__values[1],verticalAlignment:"center"},[__values[2],__values[3]]); }
function __operitUiTemplate_64312(__ctx,__values){return __ctx.UI.LinearProgressIndicator({fillMaxWidth:true}); }
function __operitUiTemplate_64410(__ctx,__values){return __ctx.UI.Text({key:"entity-error",text:__values[0],color:__values[1],fillMaxWidth:true,paddingHorizontal:24,paddingBottom:12}); }
function __operitUiTemplate_64557(__ctx,__values){return __ctx.UI.Box(__values[0],__values[1]); }
function __operitUiTemplate_64733(__ctx,__values){return __ctx.UI.FlowRow({key:"entity-footer",fillMaxWidth:true,paddingStart:24,paddingTop:0,paddingEnd:24,paddingBottom:20,horizontalArrangement:"end",spacing:8,runSpacing:8},__values[0]); }
function __operitUiTemplate_63571(__ctx,__values){return __ctx.UI.Column(__values[0],__values[1]); }
function __operitUiTemplate_65130(__ctx,__values){return __ctx.UI.TextField({key:"entity-expanded-input",label:__values[0],value:__values[1],fillMaxSize:true,minLines:16,maxLines:40,enabled:__values[2],onValueChange:__values[3]}); }
function __operitUiTemplate_66647(__ctx,__values){return __ctx.UI.Text({text:__values[0],color:__values[1]}); }
function __operitUiTemplate_66608(__ctx,__values){return __ctx.UI.Column({fillMaxWidth:true},[__values[0],__values[1]]); }
function __operitUiTemplate_67081(__ctx,__values){return __ctx.UI.Icon({name:__values[0],size:20,tint:__values[1]}); }
function __operitUiTemplate_66904(__ctx,__values){return __ctx.UI.Row({key:"entity-picker-clear",fillMaxWidth:true,paddingHorizontal:8,paddingVertical:9,verticalAlignment:"center",spacing:10,onClick:__values[0]},[__values[1],__values[2]]); }
function __operitUiTemplate_67526(__ctx,__values){return __ctx.UI.Icon({name:__values[0],size:20,tint:__values[1]}); }
function __operitUiTemplate_67699(__ctx,__values){return __ctx.UI.Column({weight:1},__values[0]); }
function __operitUiTemplate_67337(__ctx,__values){return __ctx.UI.Row({key:__values[0],fillMaxWidth:true,paddingHorizontal:8,paddingVertical:9,verticalAlignment:"center",spacing:10,onClick:__values[1]},[__values[2],__values[3]]); }
function __operitUiTemplate_66814(__ctx,__values){return __ctx.UI.LazyColumn({key:"entity-picker-list",weight:1,fillMaxWidth:true},__values[0]); }
function __operitUiTemplate_66249(__ctx,__values){return __ctx.UI.Column({fillMaxSize:true},__values[0]); }
function __operitUiTemplate_69048(__ctx,__values){return __ctx.UI.Box({fillMaxWidth:true,paddingHorizontal:18,paddingTop:10},__values[0]); }
function __operitUiTemplate_69221(__ctx,__values){return __ctx.UI.Box({weight:1,fillMaxWidth:true},__values[0]); }
function __operitUiTemplate_68915(__ctx,__values){return __ctx.UI.Column({fillMaxSize:true},[__values[0],__values[1],__values[2]]); }
function __operitUiTemplate_70678(__ctx,__values){return __ctx.UI.Column({fillMaxWidth:true,spacing:8},__values[0]); }
function __operitUiTemplate_72723(__ctx,__values){return __ctx.UI.Box({weight:1},__values[0]); }
function __operitUiTemplate_72618(__ctx,__values){return __ctx.UI.Row({key:__values[0],fillMaxWidth:true,verticalAlignment:"center"},[__values[1],__values[2],__values[3]]); }
function __operitUiTemplate_74107(__ctx,__values){return __ctx.UI.LoadingIndicator({size:32}); }
function __operitUiTemplate_74045(__ctx,__values){return __ctx.UI.Box({fillMaxSize:true,contentAlignment:"center"},__values[0]); }
function __operitUiTemplate_75254(__ctx,__values){return __ctx.UI.Image(__values[0]); }
function __operitUiTemplate_75544(__ctx,__values){return __ctx.UI.Spacer({width:12}); }
function __operitUiTemplate_75586(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"bodyMedium",weight:1,maxLines:1,overflow:"ellipsis"}); }
function __operitUiTemplate_75729(__ctx,__values){return __ctx.UI.Spacer({width:8}); }
function __operitUiTemplate_75176(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true,verticalAlignment:"center"},__values[0]); }
function __operitUiTemplate_75106(__ctx,__values){return __ctx.UI.InputDecorator({label:"\u89D2\u8272\u5934\u50CF",enabled:__values[0]},__values[1]); }
function __operitUiTemplate_75052(__ctx,__values){return __ctx.UI.Box({fillMaxWidth:true,paddingBottom:12},__values[0]); }
function __operitUiTemplate_76709(__ctx,__values){return __ctx.UI.Text({text:"\u6807\u7B7E",weight:1,fontWeight:"700"}); }
function __operitUiTemplate_76999(__ctx,__values){return __ctx.UI.Icon({name:"Tune",size:18}); }
function __operitUiTemplate_77040(__ctx,__values){return __ctx.UI.Text({text:"\u7BA1\u7406\u6807\u7B7E"}); }
function __operitUiTemplate_76942(__ctx,__values){return __ctx.UI.Row({spacing:8,verticalAlignment:"center"},[__values[0],__values[1]]); }
function __operitUiTemplate_76778(__ctx,__values){return __ctx.UI.TextButton({key:"entity-tags-manage",enabled:__values[0],onClick:__values[1]},__values[2]); }
function __operitUiTemplate_76644(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true,verticalAlignment:"center"},[__values[0],__values[1]]); }
function __operitUiTemplate_77108(__ctx,__values){return __ctx.UI.Spacer({height:6}); }
function __operitUiTemplate_77416(__ctx,__values){return __ctx.UI.Text({text:__values[0],maxLines:1,overflow:"ellipsis",modifier:__values[1]}); }
function __operitUiTemplate_77302(__ctx,__values){return __ctx.UI.FilterChip({key:__values[0],selected:__values[1],enabled:__values[2],label:__values[3],onClick:__values[4]}); }
function __operitUiTemplate_77232(__ctx,__values){return __ctx.UI.FlowRow({spacing:8,runSpacing:8},__values[0]); }
function __operitUiTemplate_76573(__ctx,__values){return __ctx.UI.Column({fillMaxWidth:true,paddingBottom:12},[__values[0],__values[1],__values[2]]); }
function __operitUiTemplate_82758(__ctx,__values){return __ctx.UI.Text({text:__values[0],color:__values[1]}); }
function __operitUiTemplate_83899(__ctx,__values){return __ctx.UI.Text({text:"\u7EC4\u5185\u89D2\u8272",style:"titleSmall",fontWeight:"700",paddingTop:8,paddingBottom:8}); }
function __operitUiTemplate_85202(__ctx,__values){return __ctx.UI.Icon({name:__values[0],size:18,tint:__values[1]}); }
function __operitUiTemplate_85339(__ctx,__values){return __ctx.UI.Image(__values[0]); }
function __operitUiTemplate_85607(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"bodyMedium",fontWeight:"700",maxLines:1,overflow:"ellipsis"}); }
function __operitUiTemplate_85577(__ctx,__values){return __ctx.UI.Column({weight:1},__values[0]); }
function __operitUiTemplate_85081(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true,paddingHorizontal:12,paddingVertical:8,spacing:10,verticalAlignment:"center"},[__values[0],__values[1],__values[2]]); }
function __operitUiTemplate_84248(__ctx,__values){return __ctx.UI.Surface({key:__values[0],fillMaxWidth:true,color:__values[1],shape:{cornerRadius:10},modifier:__values[2],onClick:__values[3]},__values[4]); }
function __operitUiTemplate_84195(__ctx,__values){return __ctx.UI.Box({fillMaxWidth:true,paddingBottom:6},__values[0]); }
function __operitUiTemplate_86192(__ctx,__values){return __ctx.UI.HorizontalPager({key:"entity-pager",weight:1,fillMaxWidth:true,currentPage:__values[0],onPageChanged:__values[1]},__values[2]); }
function __operitUiTemplate_86047(__ctx,__values){return __ctx.UI.Column({fillMaxSize:true},[__values[0],__values[1]]); }
function __operitUiTemplate_87662(__ctx,__values){return __ctx.UI.Dialog({key:"character-presentation",onLoad:__values[0],closeOnDismissRequest:false,onDismissRequest:__values[1],containerColor:__values[2],shape:{cornerRadius:__values[3]},properties:{fullscreen:__values[4],usePlatformDefaultWidth:false,dismissOnClickOutside:false}},__values[5]); }
function __operitUiTemplate_94492(__ctx,__values){return __ctx.UI.Text({text:__values[0]}); }
function __operitUiTemplate_94640(__ctx,__values){return __ctx.UI.WebView({key:"character-memory-web",controller:__values[0],fillMaxSize:true,url:__values[1],javaScriptEnabled:true,domStorageEnabled:true,supportZoom:false,useWideViewPort:true,onShouldOverrideUrlLoading:__values[2],onInterceptRequest:__values[3],onLifecycleEvent:__values[4]}); }
function __operitUiTemplate_94423(__ctx,__values){return __ctx.UI.Box({fillMaxSize:true,onLoad:__values[0]},__values[1]); }