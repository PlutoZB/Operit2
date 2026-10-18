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

// src/ui/selection/index.ui.ts
var index_ui_exports = {};
__export(index_ui_exports, {
  default: () => Screen
});
module.exports = __toCommonJS(index_ui_exports);

// src/validation.ts
function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} \u5FC5\u987B\u662F\u5BF9\u8C61`);
}
function assertString(value, label) {
  if (typeof value !== "string") throw new Error(`${label} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
}
function assertBoolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} \u5FC5\u987B\u662F\u5E03\u5C14\u503C`);
}
function assertNumber(value, label, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} \u5FC5\u987B\u5728 ${min} \u5230 ${max} \u4E4B\u95F4`);
}
function assertInteger(value, label, min) {
  assertNumber(value, label, min, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} \u5FC5\u987B\u662F\u5B89\u5168\u6574\u6570`);
}
function assertNullableString(value, label) {
  if (value !== null) assertString(value, label);
}
function assertStrings(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  for (const item of value) assertString(item, label);
}
function requireId(value, label) {
  assertString(value, label);
  if (value.trim() === "" || value !== value.trim()) throw new Error(`${label} \u65E0\u6548`);
  return value;
}
function requireName(value, label) {
  assertString(value, label);
  const name = value.trim();
  if (name === "") throw new Error(`${label} \u4E0D\u80FD\u4E3A\u7A7A`);
  return name;
}
function assertConversationGroupScope(value) {
  if (value !== null) requireId(value, "conversation group scope");
}
function assertConversationGroup(value) {
  assertObject(value, "conversation group");
  requireId(value.id, "conversation group id");
  assertConversationGroupScope(value.ownerSelection);
  const name = requireName(value.name, "conversation group name");
  if (name !== value.name) throw new Error("Conversation group names must be stored in their trimmed form");
  assertBoolean(value.pinned, "conversation group pinned");
  assertStrings(value.chatIds, "conversation group chats");
  for (const field of ["displayOrder", "createdAt", "updatedAt"]) assertInteger(value[field], field, 0);
  const chats = /* @__PURE__ */ new Set();
  for (const chatId of value.chatIds) {
    requireId(chatId, "conversation group chat id");
    if (chats.has(chatId)) throw new Error("Duplicate chat within a conversation group: " + chatId);
    chats.add(chatId);
  }
}
function assertConversationGroups(value) {
  if (!Array.isArray(value)) throw new Error("conversationGroups must be an array");
  const ids = /* @__PURE__ */ new Set(), names = /* @__PURE__ */ new Set(), orders = /* @__PURE__ */ new Set(), chats = /* @__PURE__ */ new Set();
  const scopeCounts = /* @__PURE__ */ new Map();
  for (const group of value) {
    assertConversationGroup(group);
    if (ids.has(group.id)) throw new Error("Duplicate conversation group id: " + group.id);
    ids.add(group.id);
    const nameKey = JSON.stringify([group.ownerSelection, group.name]);
    if (names.has(nameKey)) throw new Error("Conversation group name already exists in this scope: " + group.name);
    names.add(nameKey);
    const orderKey = JSON.stringify([group.ownerSelection, group.displayOrder]);
    if (orders.has(orderKey)) throw new Error("Duplicate conversation group order in one scope");
    orders.add(orderKey);
    const count = scopeCounts.get(group.ownerSelection);
    scopeCounts.set(group.ownerSelection, count === void 0 ? 1 : count + 1);
    for (const chatId of group.chatIds) {
      if (chats.has(chatId)) throw new Error("Chat belongs to more than one conversation group: " + chatId);
      chats.add(chatId);
    }
  }
  for (const group of value) {
    assertConversationGroup(group);
    const count = scopeCounts.get(group.ownerSelection);
    if (count === void 0 || group.displayOrder >= count) throw new Error("Conversation group order must be a complete zero-based scoped sequence");
  }
}
function assertToolAccess(value) {
  assertObject(value, "\u5DE5\u5177\u8BBF\u95EE\u914D\u7F6E");
  assertBoolean(value.enabled, "\u5DE5\u5177\u8BBF\u95EE\u5F00\u5173");
  for (const field of ["allowedBuiltinTools", "allowedPackages", "allowedSkills", "allowedMcpServers"]) assertStrings(value[field], field);
}
function assertCard(value) {
  assertObject(value, "\u89D2\u8272\u5361");
  for (const field of ["id", "name", "description", "characterSetting", "openingStatement", "otherContentChat", "otherContentVoice", "advancedCustomPrompt", "marks", "chatModelBindingMode", "memoryBindingMode"]) assertString(value[field], field);
  for (const field of ["avatarUri", "chatProviderId", "chatModelId", "ttsConfigId", "themeConfigId", "sharedMemoryId"]) assertNullableString(value[field], field);
  if (value.themeConfigId !== null) requireId(value.themeConfigId, "\u89D2\u8272\u4E3B\u9898\u914D\u7F6E");
  assertStrings(value.attachedTagIds, "\u89D2\u8272\u6807\u7B7E");
  assertInteger(value.createdAt, "\u89D2\u8272\u521B\u5EFA\u65F6\u95F4", 0);
  assertInteger(value.updatedAt, "\u89D2\u8272\u4FEE\u6539\u65F6\u95F4", 0);
  assertToolAccess(value.toolAccessConfig);
  if (!Array.isArray(value.sharedMemoryMounts)) throw new Error("\u5171\u4EAB\u8BB0\u5FC6\u6302\u8F7D\u5FC5\u987B\u662F\u6570\u7EC4");
  for (const mount2 of value.sharedMemoryMounts) {
    assertObject(mount2, "\u5171\u4EAB\u8BB0\u5FC6\u6302\u8F7D");
    requireId(mount2.sharedMemoryId, "\u5171\u4EAB\u8BB0\u5FC6\u6302\u8F7D\u6807\u8BC6");
    assertBoolean(mount2.readable, "\u5171\u4EAB\u8BB0\u5FC6\u8BFB\u53D6\u5F00\u5173");
    assertBoolean(mount2.writable, "\u5171\u4EAB\u8BB0\u5FC6\u5199\u5165\u5F00\u5173");
  }
}
function assertGroupValues(value) {
  assertObject(value, "\u89D2\u8272\u7FA4\u7EC4");
  for (const field of ["id", "name", "description"]) assertString(value[field], field);
  assertNullableString(value.themeConfigId, "group.themeConfigId");
  if (value.themeConfigId !== null) requireId(value.themeConfigId, "\u7FA4\u7EC4\u4E3B\u9898\u914D\u7F6E");
  if (!Array.isArray(value.members)) throw new Error("\u7FA4\u7EC4\u6210\u5458\u5FC5\u987B\u662F\u6570\u7EC4");
  for (const member2 of value.members) {
    assertObject(member2, "\u7FA4\u7EC4\u6210\u5458");
    requireId(member2.characterCardId, "\u7FA4\u7EC4\u89D2\u8272\u6807\u8BC6");
    assertInteger(member2.orderIndex, "\u7FA4\u7EC4\u6210\u5458\u987A\u5E8F", -2147483648);
    if (member2.orderIndex > 2147483647) throw new Error("\u7FA4\u7EC4\u6210\u5458\u987A\u5E8F\u8D85\u51FA i32 \u8303\u56F4");
  }
}
function assertGroup(value) {
  assertObject(value, "\u89D2\u8272\u7FA4\u7EC4");
  const record2 = value;
  assertGroupValues(value);
  assertInteger(record2.createdAt, "\u7FA4\u7EC4\u521B\u5EFA\u65F6\u95F4", 0);
  assertInteger(record2.updatedAt, "\u7FA4\u7EC4\u4FEE\u6539\u65F6\u95F4", 0);
}
function assertTagValues(value) {
  assertObject(value, "\u6807\u7B7E");
  for (const field of ["name", "description", "promptContent"]) assertString(value[field], field);
  if (value.tagType !== "TONE" && value.tagType !== "CHARACTER" && value.tagType !== "FUNCTION" && value.tagType !== "CUSTOM") throw new Error("\u6807\u7B7E\u7C7B\u578B\u65E0\u6548");
}
function assertTag(value) {
  assertObject(value, "\u6807\u7B7E");
  const record2 = value;
  assertTagValues(value);
  requireId(record2.id, "\u6807\u7B7E\u6807\u8BC6");
  assertInteger(record2.createdAt, "\u6807\u7B7E\u521B\u5EFA\u65F6\u95F4", 0);
  assertInteger(record2.updatedAt, "\u6807\u7B7E\u4FEE\u6539\u65F6\u95F4", 0);
}
function assertMemory(value) {
  assertObject(value, "\u8BB0\u5FC6\u8BB0\u5F55");
  requireId(value.id, "\u8BB0\u5FC6\u6570\u636E\u5E93\u6807\u8BC6");
  requireId(value.uuid, "\u8BB0\u5FC6 UUID");
  for (const field of ["title", "content", "contentType", "source"]) assertString(value[field], field);
  assertNumber(value.credibility, "\u53EF\u4FE1\u5EA6", 0, 1);
  assertNumber(value.importance, "\u91CD\u8981\u6027", 0, 1);
  for (const field of ["documentPath", "chunkIndexFilePath", "folderPath"]) assertNullableString(value[field], field);
  assertBoolean(value.isDocumentNode, "\u6587\u6863\u8282\u70B9\u6807\u8BC6");
  for (const field of ["createdAt", "updatedAt", "lastAccessedAt"]) assertInteger(value[field], field, 0);
  if (!Array.isArray(value.tags) || !Array.isArray(value.properties)) throw new Error("\u8BB0\u5FC6\u6807\u7B7E\u548C\u5C5E\u6027\u5FC5\u987B\u662F\u6570\u7EC4");
  for (const tag of value.tags) {
    assertObject(tag, "\u8BB0\u5FC6\u6807\u7B7E");
    requireId(tag.id, "\u8BB0\u5FC6\u6807\u7B7E\u6807\u8BC6");
    assertString(tag.name, "\u8BB0\u5FC6\u6807\u7B7E\u540D\u79F0");
  }
  for (const property2 of value.properties) {
    assertObject(property2, "\u8BB0\u5FC6\u5C5E\u6027");
    requireId(property2.id, "\u8BB0\u5FC6\u5C5E\u6027\u6807\u8BC6");
    assertString(property2.key, "\u8BB0\u5FC6\u5C5E\u6027\u952E");
    assertString(property2.value, "\u8BB0\u5FC6\u5C5E\u6027\u503C");
  }
}
function assertMemoryChatMessage(value) {
  assertObject(value, "chat message");
  assertInteger(value.timestamp, "message timestamp", 0);
  for (const key of ["sender", "content", "provider", "modelName"]) assertString(value[key], key);
  assertInteger(value.variantIndex, "message variant index", 0);
  assertInteger(value.variantCount, "message variant count", 1);
  if (value.variantIndex > 2147483647 || value.variantCount > 2147483647 || value.variantIndex >= value.variantCount) throw new Error("Invalid persisted message variant identity");
}
function assertMemorySettings(value) {
  assertObject(value, "\u8BB0\u5FC6\u8BBE\u7F6E");
  assertInteger(value.autoSaveIntervalMinutes, "\u81EA\u52A8\u4FDD\u5B58\u95F4\u9694", 1);
  if (value.autoSaveIntervalMinutes > 30) throw new Error("\u81EA\u52A8\u4FDD\u5B58\u95F4\u9694\u5FC5\u987B\u5728 1 \u5230 30 \u5206\u949F\u4E4B\u95F4");
  assertInteger(value.nextAutoSaveRunAtMs, "\u4E0B\u6B21\u81EA\u52A8\u4FDD\u5B58\u65F6\u95F4", 0);
  for (const field of ["memoryExtractionCustomRules", "cloudEmbeddingEndpoint", "cloudEmbeddingApiKey", "cloudEmbeddingModel"]) assertString(value[field], field);
  for (const field of ["profileAutoUpdateEnabled", "profileAutoUpdateLocked", "cloudEmbeddingEnabled"]) assertBoolean(value[field], field);
}
function assertSearchConfig(value) {
  assertObject(value, "\u8BB0\u5FC6\u641C\u7D22\u8BBE\u7F6E");
  if (value.scoreMode !== "BALANCED" && value.scoreMode !== "KEYWORD_FIRST" && value.scoreMode !== "SEMANTIC_FIRST") throw new Error("\u8BB0\u5FC6\u8BC4\u5206\u6A21\u5F0F\u65E0\u6548");
  for (const field of ["keywordWeight", "tagWeight", "vectorWeight", "edgeWeight"]) assertNumber(value[field], field, 0, Number.MAX_VALUE);
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
function requireChatSelection(selection2, cards, groups) {
  const parsed = parseChatSelection(selection2);
  if (parsed.kind === "model") return parsed;
  const records2 = parsed.kind === "card" ? cards : groups;
  let matches = 0;
  for (const record2 of records2) if (record2.id === parsed.id) matches += 1;
  if (matches !== 1) throw new Error("Chat selection does not identify exactly one stored record: " + selection2);
  if (parsed.kind === "group") {
    for (const group of groups) if (group.id === parsed.id && group.members.length === 0) throw new Error("A bound chat group must have actual participants: " + group.id);
  }
  return parsed;
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
function markerVersion(value, path) {
  if (value.version !== 1) throw new Error("Unsupported " + path + " version");
}
function decodeChatMarker(value) {
  const extension = markerObject(value, "chat extension");
  markerVersion(extension, "chat marker");
  const selection2 = requireId(extension.selection, "chat marker selection");
  parseChatSelection(selection2);
  if (Object.prototype.hasOwnProperty.call(extension, "groupId")) throw new Error("Conversation membership is owned by plugin files, not chat extension.groupId");
  return { version: 1, selection: selection2 };
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
  const request = value;
  if (request.purpose === "display") {
    if (request.participantId !== null) throw new Error("Display configuration cannot request an execution participant");
  } else {
    nonblank(request.defaultModelBinding.providerId, "execution default provider");
    nonblank(request.defaultModelBinding.modelId, "execution default model");
    nonblank(request.defaultTtsConfigId, "execution default TTS configuration");
  }
  return request;
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

// src/identity.ts
function uuid() {
  const bytes = [];
  for (let index = 0; index < 16; index += 1) bytes.push(Math.floor(Math.random() * 256));
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const text3 = bytes.map(
    /** Encodes every byte as two hexadecimal digits. */
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
  return text3.slice(0, 8) + "-" + text3.slice(8, 12) + "-" + text3.slice(12, 16) + "-" + text3.slice(16, 20) + "-" + text3.slice(20);
}

// src/storage/merge.json
var merge_default = {
  cards: {
    version: 1,
    catalog: {
      keyPrefix: "record_",
      keySuffix: "",
      identityField: "id",
      nameField: "name",
      ignoredFields: [
        "id",
        "createdAt",
        "updatedAt"
      ],
      retiredKeys: []
    },
    references: [
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "chatProviderId"
          }
        ],
        target: "runtime/config/preferences/model_configs.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "ttsConfigId"
          }
        ],
        target: "runtime/config/preferences/tts_configs.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "themeConfigId"
          }
        ],
        target: "runtime/config/preferences/user_preferences.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "sharedMemoryId"
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/stores.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "attachedTagIds"
          },
          {
            kind: "array_values"
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/tags.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "sharedMemoryMounts"
          },
          {
            kind: "array_values"
          },
          {
            kind: "field",
            name: "sharedMemoryId"
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/stores.preferences.json"
      }
    ],
    projection: null
  },
  groups: {
    version: 1,
    catalog: {
      keyPrefix: "record_",
      keySuffix: "",
      identityField: "id",
      nameField: "name",
      ignoredFields: [
        "id",
        "createdAt",
        "updatedAt"
      ],
      retiredKeys: []
    },
    references: [
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "themeConfigId"
          }
        ],
        target: "runtime/config/preferences/user_preferences.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "members"
          },
          {
            kind: "array_values"
          },
          {
            kind: "field",
            name: "characterCardId"
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
      }
    ],
    projection: null
  },
  tags: {
    version: 1,
    catalog: {
      keyPrefix: "record_",
      keySuffix: "",
      identityField: "id",
      nameField: "name",
      ignoredFields: [
        "id",
        "createdAt",
        "updatedAt"
      ],
      retiredKeys: []
    },
    references: [],
    projection: null
  },
  stores: {
    version: 1,
    catalog: {
      keyPrefix: "record_",
      keySuffix: "",
      identityField: "id",
      nameField: "name",
      ignoredFields: [
        "id",
        "createdAt",
        "updatedAt"
      ],
      retiredKeys: []
    },
    references: [],
    projection: null
  },
  conversationGroups: {
    version: 1,
    catalog: null,
    references: [
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "ownerSelection"
          },
          {
            kind: "identity",
            prefix: "card:",
            suffix: ""
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "record_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "ownerSelection"
          },
          {
            kind: "identity",
            prefix: "group:",
            suffix: ""
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/groups.preferences.json"
      }
    ],
    projection: null
  },
  meta: {
    version: 1,
    catalog: null,
    references: [
      {
        key: {
          kind: "exact",
          key: "state"
        },
        path: [
          {
            kind: "field",
            name: "active"
          },
          {
            kind: "variant",
            name: "CharacterCard"
          },
          {
            kind: "field",
            name: "id"
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
      },
      {
        key: {
          kind: "exact",
          key: "state"
        },
        path: [
          {
            kind: "field",
            name: "active"
          },
          {
            kind: "variant",
            name: "CharacterGroup"
          },
          {
            kind: "field",
            name: "id"
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/groups.preferences.json"
      }
    ],
    projection: null
  },
  chats: {
    version: 1,
    catalog: null,
    references: [
      {
        key: {
          kind: "records",
          prefix: "binding_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "selection"
          },
          {
            kind: "identity",
            prefix: "card:",
            suffix: ""
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "draft_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "selection"
          },
          {
            kind: "identity",
            prefix: "card:",
            suffix: ""
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "binding_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "selection"
          },
          {
            kind: "identity",
            prefix: "group:",
            suffix: ""
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/groups.preferences.json"
      },
      {
        key: {
          kind: "records",
          prefix: "draft_",
          suffix: ""
        },
        path: [
          {
            kind: "field",
            name: "selection"
          },
          {
            kind: "identity",
            prefix: "group:",
            suffix: ""
          }
        ],
        target: "runtime/plugin_data/space/com.operit.character_cards/groups.preferences.json"
      }
    ],
    projection: null
  }
};

// src/memory-jobs/embeddings.ts
function assertEmbedding(value) {
  assertObject(value, "embedding");
  requireId(value.id, "embedding id");
  requireName(value.endpoint, "embedding endpoint");
  requireName(value.model, "embedding model");
  assertString(value.text, "embedding text");
  assertInteger(value.updatedAt, "embedding timestamp", 0);
  if (!Array.isArray(value.vector) || value.vector.length === 0) throw new Error("Embedding must contain a nonempty vector");
  let norm = 0;
  for (const component of value.vector) {
    assertNumber(component, "embedding component", -Number.MAX_VALUE, Number.MAX_VALUE);
    norm += component * component;
  }
  if (!Number.isFinite(norm) || norm === 0) throw new Error("Embedding vector has an invalid norm");
}

// src/storage/state.ts
function userDocumentPath(ownerKey) {
  return "owners/" + encodeURIComponent(ownerKey) + "/USER.md";
}
function array2(value, label) {
  if (!Array.isArray(value)) throw new Error(label + " must be an array");
}
function identities(records2, label) {
  const ids = /* @__PURE__ */ new Set();
  for (const record2 of records2) {
    assertObject(record2, label);
    const id2 = requireId(record2.id, label + " id");
    if (ids.has(id2)) throw new Error(label + " has duplicate id: " + id2);
    ids.add(id2);
  }
  return ids;
}
function assertCharacterState(value) {
  assertObject(value, "character state");
  if (value.version !== 1) throw new Error("Unsupported character database version");
  const fields2 = /* @__PURE__ */ new Set(["memoryPreferences", "version", "cards", "groups", "tags", "stores", "active", "owners", "conversationGroups"]);
  for (const key of Object.keys(value)) if (!fields2.has(key)) throw new Error("Unsupported character state field: " + key);
  assertObject(value.memoryPreferences, "global memory preferences");
  assertBoolean(value.memoryPreferences.userDescriptionEnabled, "user description enabled");
  assertBoolean(value.memoryPreferences.autoUpdateEnabled, "auto update enabled");
  assertConversationGroups(value.conversationGroups);
  const cards = value.cards, groups = value.groups, tags = value.tags, stores = value.stores, owners = value.owners;
  array2(cards, "cards");
  array2(groups, "groups");
  array2(tags, "tags");
  array2(stores, "stores");
  array2(owners, "owners");
  const cardIds = identities(cards, "cards"), groupIds = identities(groups, "groups"), tagIds = identities(tags, "tags"), storeIds = identities(stores, "stores");
  for (const card of cards) {
    assertCard(card);
    requireId(card.id, "card id");
    for (const id2 of card.attachedTagIds) if (!tagIds.has(id2)) throw new Error("Missing attached tag: " + id2);
    if (card.chatModelBindingMode !== "FOLLOW_GLOBAL" && card.chatModelBindingMode !== "FIXED_MODEL") throw new Error("Invalid model binding mode");
    if (card.chatModelBindingMode === "FIXED_MODEL") requireId(card.chatModelId, "fixed model id");
    if (card.memoryBindingMode !== "CHARACTER" && card.memoryBindingMode !== "SHARED") throw new Error("Invalid memory binding mode");
    if (card.memoryBindingMode === "SHARED" && !storeIds.has(requireId(card.sharedMemoryId, "shared memory id"))) throw new Error("Missing primary shared library");
    for (const mount2 of card.sharedMemoryMounts) if (!storeIds.has(mount2.sharedMemoryId)) throw new Error("Missing shared memory mount: " + mount2.sharedMemoryId);
  }
  for (const group of groups) {
    assertGroup(group);
    const members = /* @__PURE__ */ new Set();
    for (const member2 of group.members) {
      if (!cardIds.has(member2.characterCardId)) throw new Error("Missing group member: " + member2.characterCardId);
      if (members.has(member2.characterCardId)) throw new Error("Duplicate group member: " + member2.characterCardId);
      members.add(member2.characterCardId);
    }
  }
  for (const tag of tags) assertTag(tag);
  for (const store of stores) {
    assertObject(store, "store");
    assertString(store.name, "store name");
    assertInteger(store.createdAt, "store createdAt", 0);
    assertInteger(store.updatedAt, "store updatedAt", 0);
  }
  assertObject(value.active, "active");
  const activeKeys = Object.keys(value.active);
  if (activeKeys.length !== 1) throw new Error("Active prompt must select exactly one entity");
  const activeKey = activeKeys[0];
  if (activeKey !== "CharacterCard" && activeKey !== "CharacterGroup" && activeKey !== "Model") throw new Error("Invalid active prompt kind");
  const selected = value.active[activeKey];
  assertObject(selected, "active selection");
  const activeId = requireId(selected.id, "active id");
  if (activeKey === "Model" ? activeId !== "chat" : !(activeKey === "CharacterCard" ? cardIds : groupIds).has(activeId)) throw new Error("Active prompt references a missing entity: " + activeId);
  const expectedOwners = /* @__PURE__ */ new Set();
  for (const id2 of cardIds) expectedOwners.add("character:" + id2);
  for (const id2 of storeIds) expectedOwners.add("shared:" + id2);
  const actualOwners = /* @__PURE__ */ new Set();
  for (const owner2 of owners) {
    assertObject(owner2, "memory space");
    const ownerKey = requireId(owner2.ownerKey, "owner key");
    if (!expectedOwners.has(ownerKey) || actualOwners.has(ownerKey)) throw new Error("Invalid or duplicate memory owner: " + ownerKey);
    actualOwners.add(ownerKey);
    assertMemorySpace(owner2);
  }
  if (actualOwners.size !== expectedOwners.size) throw new Error("Character state is missing an owner memory space");
}
function assertMemorySpace(value) {
  assertObject(value, "memory space");
  requireId(value.ownerKey, "memory owner");
  array2(value.memories, "memories");
  array2(value.links, "links");
  array2(value.chunks, "chunks");
  array2(value.candidates, "candidates");
  const memoryIds = identities(value.memories, "memories");
  identities(value.links, "links");
  identities(value.chunks, "chunks");
  identities(value.candidates, "candidates");
  const memoriesByUuid = /* @__PURE__ */ new Map();
  for (const memory of value.memories) {
    assertMemory(memory);
    if (memoriesByUuid.has(memory.uuid)) throw new Error("Duplicate memory UUID: " + memory.uuid);
    memoriesByUuid.set(memory.uuid, memory);
  }
  for (const link of value.links) {
    assertObject(link, "link");
    requireId(link.id, "link id");
    const source = requireId(link.sourceMemoryId, "source memory id"), target = requireId(link.targetMemoryId, "target memory id");
    if (!memoryIds.has(source) || !memoryIds.has(target)) throw new Error("Relationship references a missing memory: " + link.id);
    if (source === target) throw new Error("Relationship cannot point to itself");
    assertString(link.type_, "link type");
    assertNumber(link.weight, "link weight", 0, 1);
    assertString(link.description, "link description");
  }
  const indices = /* @__PURE__ */ new Set();
  for (const chunk of value.chunks) {
    assertObject(chunk, "chunk");
    requireId(chunk.id, "chunk id");
    const memoryUuid = requireId(chunk.memoryUuid, "chunk memory UUID");
    assertInteger(chunk.chunkIndex, "chunk index", 0);
    assertString(chunk.content, "chunk content");
    const memory = memoriesByUuid.get(memoryUuid);
    if (memory === void 0 || !memory.isDocumentNode) throw new Error("Chunk references a missing document memory");
    const identity2 = JSON.stringify([chunk.memoryUuid, chunk.chunkIndex]);
    if (indices.has(identity2)) throw new Error("Duplicate document chunk index");
    indices.add(identity2);
  }
  const candidateSources = /* @__PURE__ */ new Set();
  for (const candidate of value.candidates) {
    assertObject(candidate, "candidate");
    requireId(candidate.id, "candidate id");
    requireId(candidate.chatId, "candidate chat id");
    for (const field of ["triggerMessageTimestamp", "triggerVariantIndex", "createdAt", "updatedAt", "attemptCount"]) assertInteger(candidate[field], field, 0);
    for (const field of ["status", "lastError", "sourceType"]) assertString(candidate[field], field);
    if (candidate.status !== "pending" && candidate.status !== "processing" && candidate.status !== "failed") throw new Error("Invalid candidate status");
    if (candidate.sourceType !== "reply_finalized_auto" && candidate.sourceType !== "selected_user_message") throw new Error("Invalid candidate source type");
    if (typeof candidate.triggerVariantIndex !== "number" || candidate.triggerVariantIndex > 2147483647) throw new Error("Candidate message variant exceeds the host range");
    const sourceKey = JSON.stringify([candidate.chatId, candidate.triggerMessageTimestamp, candidate.triggerVariantIndex, candidate.sourceType]);
    if (candidateSources.has(sourceKey)) throw new Error("Duplicate persisted candidate source");
    candidateSources.add(sourceKey);
  }
  assertMemorySettings(value.settings);
  assertSearchConfig(value.searchConfig);
  assertString(value.userDocumentPath, "USER.md path");
  if (value.userDocumentPath !== userDocumentPath(requireId(value.ownerKey, "owner key"))) throw new Error("Invalid owner USER.md path");
  assertObject(value.rebuildProgress, "rebuild progress");
  for (const field of ["status", "currentChatTitle", "lastError"]) assertString(value.rebuildProgress[field], field);
  for (const field of ["totalChats", "completedChats", "totalWindows", "completedWindows", "totalSourceMessages", "processedSourceMessages", "failedWindows"]) assertInteger(value.rebuildProgress[field], field, 0);
  if (!["idle", "preparing", "running", "completed", "failed", "cancelled"].some(
    /** Accepts only the declared durable task lifecycle states. */
    (status) => value.rebuildProgress !== null && typeof value.rebuildProgress === "object" && "status" in value.rebuildProgress && value.rebuildProgress.status === status
  )) throw new Error("Invalid memory rebuild status");
  if (value.rebuildTask !== null) {
    assertObject(value.rebuildTask, "rebuild task");
    requireId(value.rebuildTask.id, "rebuild task id");
    array2(value.rebuildTask.windows, "rebuild windows");
    assertInteger(value.rebuildTask.nextWindow, "rebuild cursor", 0);
    if (value.rebuildTask.windows.length === 0 || value.rebuildTask.nextWindow > value.rebuildTask.windows.length) throw new Error("Invalid rebuild cursor or source plan");
    let sourceTotal = 0, processedTotal = 0, completedChats = 0, windowIndex = 0;
    const chats = /* @__PURE__ */ new Set(), finishedChats = /* @__PURE__ */ new Set();
    let previousChat = null;
    for (const window of value.rebuildTask.windows) {
      assertObject(window, "rebuild window");
      requireId(window.chatId, "rebuild chat id");
      assertString(window.chatTitle, "rebuild chat title");
      assertInteger(window.sourceMessageCount, "source message count", 1);
      array2(window.messages, "rebuild messages");
      if (window.messages.length < window.sourceMessageCount) throw new Error("Rebuild source count exceeds the stored messages");
      sourceTotal += window.sourceMessageCount;
      if (windowIndex < value.rebuildTask.nextWindow) processedTotal += window.sourceMessageCount;
      const chatId = requireId(window.chatId, "window chat id");
      if (previousChat !== null && previousChat !== chatId) {
        finishedChats.add(previousChat);
        if (finishedChats.has(chatId)) throw new Error("Rebuild plan repeats a completed chat block");
        if (windowIndex <= value.rebuildTask.nextWindow) completedChats += 1;
      }
      previousChat = chatId;
      chats.add(chatId);
      windowIndex += 1;
      for (const message of window.messages) {
        assertMemoryChatMessage(message);
        if (message.sender !== "user" && message.sender !== "ai" && message.sender !== "assistant") throw new Error("Rebuild window has an unsupported source sender");
        assertString(message.content, "source message content");
        if (message.content.trim() === "") throw new Error("Rebuild window contains a blank source message");
      }
    }
    if (value.rebuildTask.nextWindow === value.rebuildTask.windows.length) completedChats += 1;
    if (value.rebuildProgress.totalWindows !== value.rebuildTask.windows.length || value.rebuildProgress.completedWindows !== value.rebuildTask.nextWindow) throw new Error("Rebuild plan and progress disagree");
    if (value.rebuildProgress.totalSourceMessages !== sourceTotal || value.rebuildProgress.processedSourceMessages !== processedTotal || value.rebuildProgress.totalChats !== chats.size || value.rebuildProgress.completedChats !== completedChats) throw new Error("Rebuild counters disagree with the actual source plan");
    if (value.rebuildProgress.status === "completed" && value.rebuildTask.nextWindow !== value.rebuildTask.windows.length) throw new Error("Completed rebuild has unprocessed source windows");
    if (value.rebuildProgress.status === "preparing" && value.rebuildTask.nextWindow !== 0) throw new Error("Preparing rebuild already has processed source windows");
  } else if (value.rebuildProgress.status !== "idle") throw new Error("Rebuild progress is missing its source plan");
  array2(value.embeddings, "embeddings");
  const embeddingKeys = /* @__PURE__ */ new Set();
  for (const item of value.embeddings) {
    assertEmbedding(item);
    const key = JSON.stringify([item.endpoint, item.model, item.text]);
    if (embeddingKeys.has(key)) throw new Error("Duplicate stored embedding input");
    embeddingKeys.add(key);
  }
}

// src/storage/records.ts
var ownerCollections = [
  "memories",
  "links",
  "chunks",
  "candidates",
  "embeddings"
];
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clone(item)])
    );
  return value;
}
function equal(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  const keys = Object.keys(left), other = Object.keys(right);
  return Array.isArray(left) === Array.isArray(right) && keys.length === other.length && keys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && equal(
      left[key],
      right[key]
    )
  );
}
function recordKey(value) {
  assertObject(value, "stored record");
  return requireId(value.id, "stored record id");
}
function storedValue(record2) {
  return record2;
}
function records(state) {
  const result = [];
  for (const collection of [
    "cards",
    "groups",
    "tags",
    "stores",
    "conversationGroups"
  ]) {
    for (const record2 of state[collection])
      result.push({
        collection,
        key: record2.id,
        value: storedValue(record2),
        version: null
      });
  }
  for (const owner2 of state.owners) {
    const { memories, links, chunks, candidates, embeddings, ...metadata } = owner2;
    result.push({
      collection: "owners",
      key: owner2.ownerKey,
      value: storedValue(metadata),
      version: null
    });
    for (const collection of ownerCollections)
      for (const record2 of owner2[collection])
        result.push({
          collection,
          key: owner2.ownerKey + "/" + recordKey(storedValue(record2)),
          value: storedValue({ ownerKey: owner2.ownerKey, record: record2 }),
          version: null
        });
  }
  return result;
}
function stateFromRecords(metadata, rows) {
  assertObject(metadata, "character database metadata");
  if (metadata.migrationStatus === "writing" || metadata.legacyImportPending === true)
    throw new Error("Character migration has not completed");
  const state = {
    version: metadata.version,
    active: metadata.active === null ? { Model: { id: "chat" } } : metadata.active,
    memoryPreferences: metadata.memoryPreferences,
    cards: [],
    groups: [],
    tags: [],
    stores: [],
    conversationGroups: [],
    owners: []
  };
  const owners = /* @__PURE__ */ new Map();
  for (const row of rows) {
    switch (row.collection) {
      case "owners": {
        assertObject(row.value, "memory owner metadata");
        const owner2 = {
          ...row.value,
          memories: [],
          links: [],
          chunks: [],
          candidates: [],
          embeddings: []
        };
        if (owner2.ownerKey !== row.key || owners.has(row.key))
          throw new Error("Invalid memory owner record: " + row.key);
        owners.set(row.key, owner2);
        state.owners.push(owner2);
        break;
      }
      case "cards":
      case "groups":
      case "tags":
      case "stores":
      case "conversationGroups":
        state[row.collection].push(row.value);
        break;
    }
  }
  for (const row of rows) {
    if (!ownerCollections.some((collection) => collection === row.collection))
      continue;
    assertObject(row.value, "owner-scoped record");
    const ownerKey = requireId(row.value.ownerKey, "record owner key");
    const owner2 = owners.get(ownerKey);
    if (owner2 === void 0)
      throw new Error("Missing record owner: " + ownerKey);
    const entries = owner2[row.collection];
    if (!Array.isArray(entries))
      throw new Error("Invalid owner collection: " + row.collection);
    if (row.key !== ownerKey + "/" + recordKey(row.value.record)) {
      throw new Error("Invalid owner-scoped record: " + row.key);
    }
    entries.push(row.value.record);
  }
  assertCharacterState(state);
  return state;
}

// src/storage/migrations/legacy-to-v1.ts
function assertMigrationPlan(value) {
  assertObject(value, "character schema migration");
  if (value.from !== "released" || value.to !== 1) throw new Error("Unsupported pending character schema migration");
  if (!["files", "authors", "records", "verify", "cleanup"].some((phase) => phase === value.phase)) throw new Error("Invalid character migration phase");
  assertInteger(value.cursor, "character migration cursor", 0);
  assertObject(value.identities, "character migration identities");
  for (const field of ["files", "directories", "authors", "changes"])
    if (!Array.isArray(value[field])) throw new Error("Invalid character migration work: " + field);
  for (const directory of value.directories) {
    assertObject(directory, "character migration directory");
    for (const field of ["source", "destination"])
      if (typeof directory[field] !== "string" || !/^owners\/(?:character|shared)%3A[^/]+$/u.test(directory[field]))
        throw new Error("Invalid character migration owner directory");
    if (directory.source === directory.destination) throw new Error("Character migration owner directory must change");
  }
  for (const file of value.files) {
    assertObject(file, "character migration file");
    if (typeof file.source !== "string" || typeof file.destination !== "string") throw new Error("Invalid character migration file path");
    const source = file.source, destination = file.destination;
    if (!value.directories.some((directory) => source.startsWith(directory.source + "/") && destination === directory.destination + source.slice(directory.source.length)))
      throw new Error("Character migration file is outside its owner directory");
  }
  for (const group of value.changes)
    if (!Array.isArray(group) || group.length < 1 || group.length > 2) throw new Error("Invalid atomic character migration record change");
  const lengths = { files: value.files.length, authors: value.authors.length, records: value.changes.length, verify: 0, cleanup: value.directories.length };
  if (value.cursor > lengths[value.phase]) throw new Error("Character migration cursor exceeds its work");
}
function completed(result) {
  if (!result.successful) throw new Error(result.details);
}
function absolute(directory, relative) {
  if (relative.split("/").some((part) => part === "" || part === "." || part === ".." || /[\\:\u0000-\u001f]/u.test(part)))
    throw new Error("Invalid character migration resource path: " + relative);
  return directory + "/" + relative;
}
function ownerFiles(directory, source, destination) {
  return __async(this, null, function* () {
    const listing = yield Tools.Files.list(absolute(directory, source));
    const result = [];
    for (const entry of listing.entries) {
      if (entry.name === "." || entry.name === ".." || /[/\\:\u0000-\u001f]/u.test(entry.name))
        throw new Error("Invalid owner resource entry: " + entry.name);
      const from = source + "/" + entry.name, to = destination + "/" + entry.name;
      if (entry.isDirectory) result.push(...yield ownerFiles(directory, from, to));
      else result.push({ source: from, destination: to });
    }
    return result;
  });
}
function prepareVersionOne(storage, metadata, directory) {
  return __async(this, null, function* () {
    const rows = yield migrationRecords(storage);
    const input = clone(rows);
    for (const row of input) {
      if (row.collection === "cards") {
        assertObject(row.value, "legacy card");
        delete row.value.isDefault;
      }
    }
    const inputMetadata = { ...metadata, version: 1 };
    delete inputMetadata.legacyImportPending;
    const state = stateFromRecords(inputMetadata, input);
    const before = records(state), identities2 = {};
    function identity2(scope, value) {
      requireId(value, scope + " identity");
      const key = JSON.stringify([scope, value]);
      if (!Object.prototype.hasOwnProperty.call(identities2, key)) identities2[key] = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value) ? value : uuid();
      return identities2[key];
    }
    function reference(scope, value) {
      const key = JSON.stringify([scope, value]);
      if (!Object.prototype.hasOwnProperty.call(identities2, key)) throw new Error("Missing migration reference: " + key);
      return identities2[key];
    }
    for (const collection of configurationNames)
      for (const record2 of state[collection]) record2.id = identity2(collection, record2.id);
    function selection2(value) {
      if (value === "model:chat") return value;
      if (value.startsWith("card:")) return "card:" + reference("cards", value.slice(5));
      if (value.startsWith("group:")) return "group:" + reference("groups", value.slice(6));
      throw new Error("Invalid migration selection: " + value);
    }
    for (const card of state.cards) {
      card.attachedTagIds = card.attachedTagIds.map((id2) => reference("tags", id2));
      if (card.sharedMemoryId !== null) card.sharedMemoryId = reference("stores", card.sharedMemoryId);
      for (const mount2 of card.sharedMemoryMounts) mount2.sharedMemoryId = reference("stores", mount2.sharedMemoryId);
    }
    for (const group of state.groups)
      for (const member2 of group.members) member2.characterCardId = reference("cards", member2.characterCardId);
    for (const group of state.conversationGroups)
      if (group.ownerSelection !== null) group.ownerSelection = selection2(group.ownerSelection);
    if ("CharacterCard" in state.active) state.active.CharacterCard.id = reference("cards", state.active.CharacterCard.id);
    if ("CharacterGroup" in state.active) state.active.CharacterGroup.id = reference("groups", state.active.CharacterGroup.id);
    const directories = [];
    for (const owner2 of state.owners) {
      const old = owner2.ownerKey;
      if (old.startsWith("character:")) owner2.ownerKey = "character:" + reference("cards", old.slice(10));
      else if (old.startsWith("shared:")) owner2.ownerKey = "shared:" + reference("stores", old.slice(7));
      else throw new Error("Invalid migration owner: " + old);
      owner2.userDocumentPath = userDocumentPath(owner2.ownerKey);
      if (old !== owner2.ownerKey) directories.push({ source: "owners/" + encodeURIComponent(old), destination: "owners/" + encodeURIComponent(owner2.ownerKey) });
      const scope = owner2.ownerKey;
      for (const collection of ["memories", "links", "chunks", "candidates", "embeddings"])
        for (const record2 of owner2[collection]) record2.id = identity2(scope + "/" + collection, record2.id);
      for (const memory of owner2.memories) {
        memory.uuid = identity2(scope + "/memoryUuid", memory.uuid);
        for (const tag of memory.tags) tag.id = identity2(scope + "/memoryTags", tag.id);
        for (const property2 of memory.properties) property2.id = identity2(scope + "/memoryProperties", property2.id);
      }
      for (const link of owner2.links) {
        link.sourceMemoryId = reference(scope + "/memories", link.sourceMemoryId);
        link.targetMemoryId = reference(scope + "/memories", link.targetMemoryId);
      }
      for (const chunk of owner2.chunks) chunk.memoryUuid = reference(scope + "/memoryUuid", chunk.memoryUuid);
      if (owner2.rebuildTask !== null) owner2.rebuildTask.id = identity2(scope + "/rebuildTask", owner2.rebuildTask.id);
    }
    for (const owner2 of state.owners) for (const memory of owner2.memories)
      for (const field of ["documentPath", "chunkIndexFilePath"]) {
        const path = memory[field];
        if (path === null) continue;
        for (const move of directories) if (path.startsWith(move.source + "/")) {
          memory[field] = move.destination + path.slice(move.source.length);
          break;
        }
      }
    assertCharacterState(state);
    const after = records(state), changes = [];
    const original = new Map(rows.map((row) => [JSON.stringify([row.collection, row.key]), row]));
    const targets = /* @__PURE__ */ new Set();
    for (let index = 0; index < after.length; index += 1) {
      const from = before[index], to = after[index], key = JSON.stringify([to.collection, to.key]);
      if (targets.has(key)) throw new Error("Duplicate migration destination: " + key);
      targets.add(key);
      const source = original.get(JSON.stringify([from.collection, from.key]));
      if (source === void 0) throw new Error("Missing migration source record");
      if (from.key === to.key) {
        if (!equal(source.value, to.value)) changes.push([{ op: "put", collection: to.collection, key: to.key, value: to.value, expectedValue: source.value }]);
      } else {
        if (original.has(key)) throw new Error("Occupied migration destination: " + key);
        changes.push([
          { op: "put", collection: to.collection, key: to.key, value: to.value, expectedValue: null },
          { op: "delete", collection: from.collection, key: from.key, expectedValue: source.value }
        ]);
      }
    }
    for (const [key, originalValue] of (yield storage.chats.data()).entries()) {
      const collection = key.startsWith("binding_") ? "chat_bindings" : key.startsWith("draft_") ? "chat_drafts" : null;
      if (collection === null) throw new Error("Unsupported chat preference during migration: " + key);
      const id2 = key.slice(collection === "chat_bindings" ? 8 : 6);
      assertObject(originalValue, collection);
      const value = clone(originalValue);
      value.selection = selection2(requireId(value.selection, "stored selection"));
      if (!equal(value, originalValue)) changes.push([{ op: "put", collection, key: id2, value, expectedValue: originalValue }]);
    }
    const files = [];
    for (const move of directories) {
      const entries = yield ownerFiles(directory, move.source, move.destination);
      if (!entries.some((entry) => entry.source === move.source + "/USER.md")) throw new Error("Missing source owner USER.md: " + move.source);
      files.push(...entries);
    }
    const authors = [];
    const cardIds = new Map(before.filter((row) => row.collection === "cards").map((row) => [row.key, reference("cards", row.key)]));
    if ([...cardIds].some(([old, next]) => old !== next)) {
      const chats = yield Tools.Chat.listAll();
      for (const chat of chats.chats) for (let start = 0; start < chat.messageCount; start += 100) {
        const page = yield Tools.Chat.getMessagesRange(chat.id, { order: "asc", start, end: Math.min(chat.messageCount - 1, start + 99) });
        for (const message of page.messages) for (let variantIndex = 0; variantIndex < message.variantCount; variantIndex += 1) {
          const target = { kind: "message", chatId: chat.id, messageTimestamp: message.timestamp, variantIndex };
          const { extension } = yield Tools.Chat.readExtension(target);
          if (extension === null) continue;
          assertObject(extension, "legacy message author");
          if (Object.keys(extension).length !== 1) throw new Error("Invalid legacy message author");
          const participant = requireId(extension.participantId, "legacy participant id"), next = cardIds.get(participant);
          if (next === void 0) throw new Error("Missing message author character: " + participant);
          if (next !== participant) authors.push({ target, before: participant, after: next });
        }
      }
    }
    return { from: "released", to: 1, phase: "files", cursor: 0, active: storedValue(state.active), identities: identities2, files, directories, authors, changes };
  });
}
function verifyFile(directory, file) {
  return __async(this, null, function* () {
    const source = yield Tools.Files.readBinary(absolute(directory, file.source));
    const target = yield Tools.Files.readBinary(absolute(directory, file.destination));
    if (source.size !== target.size || source.contentBase64 !== target.contentBase64)
      throw new Error("Character migration resource verification failed: " + file.destination);
  });
}
function migrationRecords(storage) {
  return __async(this, null, function* () {
    const rows = [], configuration = yield storage.data();
    for (const name of configurationNames) for (const [key, value] of configuration[name].entries()) {
      if (!key.startsWith(recordPrefix)) throw new Error("Unknown character preference during migration: " + key);
      rows.push({ collection: name, key: key.slice(recordPrefix.length), value, version: null });
    }
    for (const collection of ["owners", "memories", "links", "chunks", "candidates", "embeddings"])
      for (const entry of yield storage.memory.read(collection)) rows.push({ collection, ...entry });
    return rows;
  });
}
function applyChanges(storage, changes) {
  return __async(this, null, function* () {
    const first = changes[0];
    if (first === void 0) throw new Error("Empty character migration unit");
    if (changes.some((change) => change.collection !== first.collection)) throw new Error("Migration unit spans storage owners");
    const collection = first.collection;
    const name = configurationNames.find((name2) => name2 === collection);
    const store = name === void 0 ? collection === "chat_bindings" || collection === "chat_drafts" ? storage.chats : null : storage.configuration[name];
    if (store !== null) {
      yield store.edit((preferences) => {
        const prefix = collection === "chat_bindings" ? "binding_" : collection === "chat_drafts" ? "draft_" : recordPrefix;
        for (const change of changes) {
          const key = prefix + change.key, value = preferences.get(key);
          if (change.op === "put" && equal(value, change.value) || change.op === "delete" && value === void 0) continue;
          if (change.expectedValue === null ? value !== void 0 : !equal(value, change.expectedValue)) throw new Error("Character migration source changed: " + collection + "/" + change.key);
          if (change.op === "put") preferences.set(key, change.value);
          else preferences.remove(key);
        }
      });
      return;
    }
    const mutations = [];
    for (const change of changes) {
      const entry = yield storage.memory.get(collection, change.key);
      if (change.op === "put" && entry !== null && equal(entry.value, change.value) || change.op === "delete" && entry === null) continue;
      if (change.expectedValue === null ? entry !== null : entry === null || !equal(entry.value, change.expectedValue)) throw new Error("Character memory migration source changed: " + change.key);
      mutations.push(change.op === "put" ? { op: "put", collection, key: change.key, value: change.value, expectedVersion: entry === null ? null : entry.version } : { op: "delete", collection, key: change.key, expectedVersion: entry === null ? null : entry.version });
    }
    if (mutations.length !== 0) yield storage.memory.commit(mutations);
  });
}
function migrateLegacyToV1(storage, preferences, directory, source) {
  return __async(this, null, function* () {
    const metadata = clone(source);
    let plan;
    const persisted = (yield storage.migration.data()).get("plan");
    if (persisted === void 0) plan = yield prepareVersionOne(storage, metadata, directory);
    else {
      assertMigrationPlan(persisted);
      plan = clone(persisted);
    }
    let previous = persisted === void 0 ? void 0 : storedValue(persisted);
    function publish() {
      return __async(this, null, function* () {
        yield storage.migration.edit((work) => {
          if (!equal(work.get("plan"), previous)) throw new Error("Character migration plan changed concurrently");
          work.set("plan", storedValue(clone(plan)));
        });
        previous = storedValue(clone(plan));
      });
    }
    if (persisted === void 0) yield publish();
    while (true) {
      switch (plan.phase) {
        case "files":
          for (; plan.cursor < plan.files.length; ) {
            const file = plan.files[plan.cursor], destination = absolute(directory, file.destination);
            const exists = yield Tools.Files.exists(destination);
            if (!exists.exists) {
              completed(yield Tools.Files.mkdir(destination.slice(0, destination.lastIndexOf("/")), true));
              completed(yield Tools.Files.copy(absolute(directory, file.source), destination, false));
            }
            yield verifyFile(directory, file);
            plan.cursor += 1;
            yield publish();
          }
          plan.phase = "authors";
          plan.cursor = 0;
          yield publish();
          break;
        case "authors":
          for (; plan.cursor < plan.authors.length; ) {
            const author = plan.authors[plan.cursor], { extension } = yield Tools.Chat.readExtension(author.target);
            if (extension === null || Object.keys(extension).length !== 1 || extension.participantId !== author.before && extension.participantId !== author.after)
              throw new Error("Message author changed during character migration");
            if (extension.participantId === author.before) yield Tools.Chat.writeExtension(author.target, { participantId: author.after });
            const written = yield Tools.Chat.readExtension(author.target);
            if (!equal(written.extension, { participantId: author.after })) throw new Error("Message author migration verification failed");
            plan.cursor += 1;
            yield publish();
          }
          plan.phase = "records";
          plan.cursor = 0;
          yield publish();
          break;
        case "records":
          while (plan.cursor < plan.changes.length) {
            const batch = [], collection = plan.changes[plan.cursor][0].collection;
            let cursor = plan.cursor;
            while (cursor < plan.changes.length && plan.changes[cursor][0].collection === collection && batch.length + plan.changes[cursor].length <= 1e3) {
              batch.push(...plan.changes[cursor]);
              cursor += 1;
            }
            yield applyChanges(storage, batch);
            plan.cursor = cursor;
            yield publish();
          }
          plan.phase = "verify";
          plan.cursor = 0;
          yield publish();
          break;
        case "verify": {
          const rows = yield migrationRecords(storage);
          const finalMetadata = { ...metadata, version: 1, active: plan.active };
          delete finalMetadata.legacyImportPending;
          stateFromRecords(finalMetadata, rows);
          for (const group of plan.changes) for (const change of group) {
            let value;
            const name = configurationNames.find((name2) => name2 === change.collection);
            if (name !== void 0) value = (yield storage.configuration[name].data()).get(recordPrefix + change.key);
            else if (change.collection === "chat_bindings" || change.collection === "chat_drafts") value = (yield storage.chats.data()).get((change.collection === "chat_bindings" ? "binding_" : "draft_") + change.key);
            else {
              const entry = yield storage.memory.get(change.collection, change.key);
              value = entry === null ? void 0 : entry.value;
            }
            if (change.op === "put" ? !equal(value, change.value) : value !== void 0)
              throw new Error("Character schema record verification failed: " + change.key);
          }
          for (const file of plan.files) yield verifyFile(directory, file);
          plan.phase = "cleanup";
          plan.cursor = 0;
          yield publish();
          break;
        }
        case "cleanup":
          for (; plan.cursor < plan.directories.length; ) {
            const source2 = absolute(directory, plan.directories[plan.cursor].source);
            if ((yield Tools.Files.exists(source2)).exists) {
              for (const file of plan.files) if (file.source.startsWith(plan.directories[plan.cursor].source + "/")) yield verifyFile(directory, file);
              completed(yield Tools.Files.deleteFile(source2, true));
            }
            plan.cursor += 1;
            yield publish();
          }
          metadata.version = 1;
          metadata.active = plan.active;
          delete metadata.legacyImportPending;
          preferences.set("state", metadata);
          return;
        default:
          throw new Error("Invalid character migration phase");
      }
    }
  });
}

// src/storage/schema.ts
function migrateCharacterSchema(storage, preferences, directory) {
  return __async(this, null, function* () {
    const metadata = preferences.get("state");
    if (metadata === void 0) return;
    assertObject(metadata, "character schema metadata");
    if (metadata.migrationStatus === "writing") throw new Error("Character migration has not completed: legacy import is still writing");
    if (metadata.version !== 1) throw new Error("Unsupported character schema version: " + metadata.version);
    yield migrateLegacyToV1(storage, preferences, directory, metadata);
  });
}

// src/storage/memory-merge.json
var memory_merge_default = {
  version: 3,
  maxEntities: 1,
  maxReferences: 48,
  entities: [
    {
      collection: "owners",
      identityColumn: "ownerKey",
      nameColumn: null,
      ignoredColumns: [],
      keyEncoding: "slash_root",
      matchMode: "identity",
      keyReferences: [
        {
          prefix: "character:",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
          }
        },
        {
          prefix: "shared:",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/stores.preferences.json"
          }
        }
      ],
      childCollections: [
        "memories",
        "links",
        "chunks",
        "candidates",
        "embeddings"
      ],
      references: [
        {
          collection: "owners",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
          },
          keyPrefix: "character:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "owners",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/stores.preferences.json"
          },
          keyPrefix: "shared:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "owners",
          column: "userDocumentPath",
          target: {
            kind: "collection",
            collection: "owners"
          },
          keyPrefix: "owners/",
          keySuffix: "/USER.md",
          valueEncoding: "uri_component"
        },
        {
          collection: "memories",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
          },
          keyPrefix: "character:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "memories",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/stores.preferences.json"
          },
          keyPrefix: "shared:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "links",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
          },
          keyPrefix: "character:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "links",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/stores.preferences.json"
          },
          keyPrefix: "shared:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "chunks",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
          },
          keyPrefix: "character:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "chunks",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/stores.preferences.json"
          },
          keyPrefix: "shared:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "candidates",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
          },
          keyPrefix: "character:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "candidates",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/stores.preferences.json"
          },
          keyPrefix: "shared:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "embeddings",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/cards.preferences.json"
          },
          keyPrefix: "character:",
          keySuffix: "",
          valueEncoding: "direct"
        },
        {
          collection: "embeddings",
          column: "ownerKey",
          target: {
            kind: "preference",
            path: "runtime/plugin_data/space/com.operit.character_cards/stores.preferences.json"
          },
          keyPrefix: "shared:",
          keySuffix: "",
          valueEncoding: "direct"
        }
      ]
    }
  ]
};

// src/storage/memory.ts
var characterMerge = memory_merge_default;
var CharacterMemoryDatabase = class _CharacterMemoryDatabase {
  /** Retains one authenticated object handle without declaring business SQL tables. */
  constructor(database2) {
    this.database = database2;
  }
  /** Opens the sole synchronized character namespace independently of plugin installation scope. */
  static open() {
    return __async(this, null, function* () {
      const directory = ToolPkg.getSpaceDataDir();
      if (typeof directory !== "string" || directory.trim() === "")
        throw new Error("Plugin data directory is unavailable");
      const database2 = new _CharacterMemoryDatabase(yield Tools.Storage.objects.open({ path: directory + "/memory.sqlite", merge: characterMerge }));
      return database2;
    });
  }
  /** Closes the retained memory engine handle. */
  close() {
    return this.database.close();
  }
  /** Reads complete JSON values in primary-key order using bounded host pages. */
  read(collection) {
    return __async(this, null, function* () {
      const result = [];
      const source = this.database.collection(collection);
      let after = null;
      for (; ; ) {
        const page = yield source.list(after, 1e3);
        result.push(...page);
        if (page.length < 1e3) return result;
        after = page[page.length - 1].key;
      }
    });
  }
  /** Reads one exact document and its host-issued concurrency version. */
  get(collection, key) {
    return this.database.collection(collection).get(key);
  }
  /** Reads selected identities in one host snapshot without scanning their collections. */
  getMany(collection, keys) {
    return this.database.collection(collection).getMany([...keys]);
  }
  /** Publishes complete changed JSON documents and memory objects in one guarded transaction. */
  commit(mutations) {
    return this.database.commit(mutations);
  }
};

// src/storage/preferences.ts
var merge = merge_default;
var configurationNames = ["cards", "groups", "tags", "stores", "conversationGroups"];
var recordPrefix = "record_";
var CharacterStorage = class _CharacterStorage {
  /** Retains explicit storage owners without emulating a cross-engine transaction. */
  constructor(configuration, metadata, chats, migration, memory) {
    this.configuration = configuration;
    this.metadata = metadata;
    this.chats = chats;
    this.migration = migration;
    this.memory = memory;
  }
  /** Opens JSON configuration owners and upgrades the plugin schema before business reads. */
  static open() {
    return __async(this, null, function* () {
      const directory = ToolPkg.getSpaceDataDir();
      if (typeof directory !== "string" || directory.trim() === "") throw new Error("Plugin data directory is unavailable");
      const handles = [];
      let memory;
      try {
        function open(name) {
          return __async(this, null, function* () {
            const store = yield Tools.Storage.dataStore.open({ path: directory + "/" + name + ".preferences.json", merge: merge[name] });
            handles.push(store);
            return store;
          });
        }
        const configuration = {};
        for (const name of configurationNames) configuration[name] = yield open(name);
        const metadata = yield open("meta"), chats = yield open("chats");
        const migration = yield Tools.Storage.dataStore.open({ path: directory + "/migration.preferences.json" });
        handles.push(migration);
        memory = yield CharacterMemoryDatabase.open();
        const storage = new _CharacterStorage(configuration, metadata, chats, migration, memory);
        metadata.withSchema(1, (version, preferences) => __async(null, null, function* () {
          switch (version) {
            case 0:
              yield migrateCharacterSchema(storage, preferences, directory);
              break;
            default:
              throw new Error("Missing character schema migration: " + version);
          }
        }));
        const current = yield metadata.data();
        const state = current.get("state");
        if (state !== void 0 && state.legacyImportPending === true) yield metadata.edit((preferences) => migrateCharacterSchema(storage, preferences, directory));
        if ((yield migration.data()).contains("plan")) yield migration.edit((preferences) => {
          preferences.remove("plan");
        });
        return storage;
      } catch (error) {
        const closed = yield Promise.allSettled([...handles.map((handle) => handle.close()), ...memory === void 0 ? [] : [memory.close()]]);
        const failures = closed.filter((result) => result.status === "rejected").map((result) => result.reason);
        if (failures.length !== 0) throw Object.assign(new Error("Character storage open and handle cleanup failed"), { cause: error, cleanupErrors: failures });
        throw error;
      }
    });
  }
  /** Reads each configuration owner's immutable snapshot without loading memory objects. */
  data() {
    return __async(this, null, function* () {
      const result = {};
      for (const name of configurationNames) result[name] = yield this.configuration[name].data();
      return result;
    });
  }
};

// src/chat-storage.ts
var database = null;
function chatDatabase() {
  if (database === null) database = CharacterStorage.open();
  return database;
}
function findChatBinding(chatId) {
  return __async(this, null, function* () {
    requireId(chatId, "chat id");
    const value = (yield (yield chatDatabase()).chats.data()).get("binding_" + chatId);
    return value === void 0 ? null : { chatId, selection: decodeChatMarker(value).selection };
  });
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

// src/ui-selector.ts
function selectorSession(presentation) {
  if (presentation === null || presentation.input.mode !== "select") throw new Error("The selection route requires an explicit select presentation");
  const { chatId } = presentation.input;
  if (chatId !== null) chatIdentity(chatId, "selector input.chatId");
  const session = createUiScreenSession(presentation), current = session.currentScreen();
  if (current.requestId === null || current.input.mode !== "select") throw new Error("The selection route requires a real presentation request");
  return { input: { ...current.input, chatId }, session };
}
function readSelectorData(input) {
  return __async(this, null, function* () {
    const [cards, groups] = yield Promise.all([callMainDomain("character.list", {}), callMainDomain("group.list", {})]);
    let selected;
    if (input.chatId === null) selected = encodeSelection(yield callMainDomain("activePrompt.get", {}));
    else {
      const binding = yield findChatBinding(input.chatId);
      selected = binding === null ? "model:chat" : binding.selection;
    }
    if (selected !== null) requireChatSelection(selected, cards, groups);
    const options = [];
    if (input.kind === "card" || input.kind === "all") options.push({ key: "model:chat", token: "model:chat", kind: "model", id: "chat", title: "\u4EC5\u4F7F\u7528\u6A21\u578B", description: "\u4E0D\u4F7F\u7528\u89D2\u8272\u5361\u63D0\u793A\u8BCD\u548C\u89D2\u8272\u8BB0\u5FC6", selection: { Model: { id: "chat" } }, avatar: { type: "model" } });
    if (input.kind === "card" || input.kind === "all") {
      for (const card of cards) {
        let avatar;
        if (card.avatarUri !== null) avatar = { type: "uri", uri: card.avatarUri };
        else avatar = { type: "resource", path: null };
        options.push({
          key: "card:" + card.id,
          token: "card:" + card.id,
          kind: "card",
          id: card.id,
          title: card.name,
          description: card.description,
          selection: { CharacterCard: { id: card.id } },
          avatar
        });
      }
    }
    if (input.kind === "group" || input.kind === "all") for (const group of groups) options.push({
      key: "group:" + group.id,
      token: "group:" + group.id,
      kind: "group",
      id: group.id,
      title: group.name,
      description: group.description,
      selection: { CharacterGroup: { id: group.id } },
      avatar: { type: "group" }
    });
    const keys = /* @__PURE__ */ new Set();
    for (const option of options) {
      if (keys.has(option.key)) throw new Error("Duplicate selector row identity: " + option.key);
      keys.add(option.key);
    }
    return { options, selected };
  });
}
function loadSelectorAvatars(data) {
  return __async(this, null, function* () {
    if (!data.options.some((option) => option.avatar.type === "resource" && option.avatar.path === null)) return data;
    const path = yield ToolPkg.readResource("character_default_avatar", "operit-avatar.png");
    if (path.trim() === "") throw new Error("Declared character default-avatar resource did not resolve");
    return { ...data, options: data.options.map((option) => option.avatar.type === "resource" && option.avatar.path === null ? { ...option, avatar: { type: "resource", path } } : option) };
  });
}
function createSelectorController(input, session, publish, assertOwner) {
  let state = { data: null, loading: true, switchingKey: null, error: "", finished: false }, loading = null;
  function update(changes) {
    state = { ...state, ...changes };
    publish(state);
  }
  function idle() {
    assertOwner();
    if (state.finished) throw new Error("This selector presentation has already finished");
    if (state.switchingKey !== null) throw new Error("A selector binding commit is already running");
  }
  return {
    /** Supplies the authoritative current local state to the renderer. */
    current() {
      return state;
    },
    /** Retains the first real load result or rejection; node rerenders do not initiate implicit source retries. */
    load() {
      assertOwner();
      if (loading === null) loading = readSelectorData(input).then(
        /** Installs genuine persisted records only while this request remains open. */
        (data) => {
          assertOwner();
          if (state.finished) return;
          update({ data, loading: false, error: "" });
          void loadSelectorAvatars(data).then((resolved) => {
            assertOwner();
            if (!state.finished && state.data === data) update({ data: resolved });
          }).catch(() => {
          });
        },
        /** Keeps a real source failure visible and propagates the same original error to the host. */
        (failure) => {
          update({ loading: false, error: String(failure) });
          throw failure;
        }
      );
      return loading;
    },
    /** Matches the original popup: one row click awaits the real switch, then returns an explicit completion. */
    select(key) {
      return __async(this, null, function* () {
        idle();
        if (state.loading || state.data === null) throw new Error("Selector records have not been loaded successfully");
        const options = state.data.options.filter(
          /** Resolves exactly one genuine allowed row rather than a caller-supplied role identity. */
          (option) => option.key === key
        );
        if (options.length !== 1) throw new Error("Selector row is not one actual available choice: " + key);
        update({ switchingKey: key, error: "" });
        try {
          const complete = yield session.completeScreen({ mode: "select", selection: options[0].selection });
          assertOwner();
          update({ finished: true });
          return complete;
        } catch (failure) {
          update({ error: String(failure) });
          throw failure;
        } finally {
          update({ switchingKey: null });
        }
      });
    },
    /** Closes only this request and never commits a staged choice or modifies another selector. */
    cancel() {
      idle();
      const cancel = session.cancelScreen();
      update({ finished: true });
      return cancel;
    }
  };
}
function selectorResultJson(result) {
  switch (result.type) {
    case "toolpkg.presentation.complete":
      return { type: result.type, requestId: result.requestId, value: result.value };
    case "toolpkg.presentation.cancel":
      return { type: result.type, requestId: result.requestId };
  }
}
function selectorAvatar(ctx, option) {
  const props = { width: 28, height: 28, contentScale: "crop", contentDescription: option.title, modifier: ctx.Modifier.clip({ type: "circle" }) };
  switch (option.avatar.type) {
    case "uri":
      return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:105704",[{ ...props, uri: option.avatar.uri }],__operitUiTemplate_105704);
    case "resource":
      return option.avatar.path === null ? OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:105820",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:105886",[option.title],__operitUiTemplate_105886)],__operitUiTemplate_105820) : OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:105991",[{ ...props, path: option.avatar.path }],__operitUiTemplate_105991);
    case "model":
      return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:106076",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:106142",[option.title],__operitUiTemplate_106142)],__operitUiTemplate_106076);
    case "group":
      return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:106279",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:106345",[option.title],__operitUiTemplate_106345)],__operitUiTemplate_106279);
  }
}
function selectorRow(ctx, option, state, controller) {
  if (state.data === null) throw new Error("A selector row requires its actual loaded catalog");
  const active = option.token === state.data.selected, switching = state.switchingKey === option.key;
  const enabled = state.switchingKey === null && !state.finished, colors = ctx.MaterialTheme.colorScheme;
  const titleColor = active ? colors.primary : enabled ? colors.onSurface : colors.onSurfaceVariant.copy({ alpha: 0.65 });
  const descriptionColor = enabled ? colors.onSurfaceVariant : colors.onSurfaceVariant.copy({ alpha: 0.5 });
  const props = { key: option.key, fillMaxWidth: true, paddingStart: 10, paddingTop: 7, paddingEnd: 8, paddingBottom: 7, verticalAlignment: "center", spacing: 8 };
  const contents = [
    selectorAvatar(ctx, option),
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:107269",[[
      OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:107336",[option.title,titleColor,active ? "700" : "600"],__operitUiTemplate_107336),
      ...option.description === "" ? [] : [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:107526",[option.description,descriptionColor],__operitUiTemplate_107526)]
    ]],__operitUiTemplate_107269),
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:107662",[switching ? OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:107740",null,__operitUiTemplate_107740) : OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:107818",[active ? "Check" : "CircleOutlined",active ? 18 : 16,active ? colors.primary : colors.onSurfaceVariant.copy({ alpha: 0.45 }),active ? "\u5F53\u524D\u9009\u4E2D" : "\u672A\u9009\u4E2D"],__operitUiTemplate_107818)],__operitUiTemplate_107662)
  ];
  if (!enabled) return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:108089",[props,contents],__operitUiTemplate_108089);
  return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:108127",[{
    ...props,
    /** Returns the real commit result to the existing generic Compose action channel without a synthetic receiver. */
    onClick: () => __async(null, null, function* () {
      return selectorResultJson(yield controller.select(option.key));
    })
  },contents],__operitUiTemplate_108127);
}
function selectorView(ctx, input, state, controller) {
  const title = input.kind === "card" ? "\u5207\u6362\u89D2\u8272\u5361" : input.kind === "group" ? "\u5207\u6362\u7FA4\u7EC4" : "\u5207\u6362\u89D2\u8272\u5361\u6216\u7FA4\u7EC4";
  const colors = ctx.MaterialTheme.colorScheme;
  const header = OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:108723",[[
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:108859",[title],__operitUiTemplate_108859),
    ...state.data === null ? [] : [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:108975",[state.data.options.length + " \u4E2A",colors.onSurfaceVariant],__operitUiTemplate_108975), OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:109090",null,__operitUiTemplate_109090)],
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:109124",[state.switchingKey === null && !state.finished,() => selectorResultJson(controller.cancel()),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:109449",null,__operitUiTemplate_109449)],__operitUiTemplate_109124)
  ]],__operitUiTemplate_108723);
  let body;
  if (state.loading) body = OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:109573",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:109647",null,__operitUiTemplate_109647)],__operitUiTemplate_109573);
  else if (state.data === null) body = OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:109764",[state.error,colors.error],__operitUiTemplate_109764);
  else if (state.data.options.length === 0) body = OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:109955",[input.kind === "group" ? "\u6682\u65E0\u7FA4\u7EC4" : "\u6682\u65E0\u89D2\u8272\u5361",colors.onSurfaceVariant],__operitUiTemplate_109955);
  else {
    const options = state.data.options;
    const items = ctx.lazyItems(
      { key: "selector-records", itemCount: options.length, itemExtent: 56, initialItemCount: 24 },
      /** Builds one keyed row only when it enters the materialized viewport window. */
      (index) => OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:110485",["selector-item:" + options[index].key,[
        selectorRow(ctx, options[index], state, controller),
        ...index + 1 === options.length ? [] : [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:110678",[colors.outlineVariant.copy({ alpha: 0.45 })],__operitUiTemplate_110678)]
      ]],__operitUiTemplate_110485)
    );
    body = OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:110801",[{ key: "selector-records", weight: 1, fillMaxWidth: true, paddingStart: 8, paddingTop: 4, paddingEnd: 8, paddingBottom: 8, ...items }],__operitUiTemplate_110801);
  }
  return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:110968",[state.switchingKey === null,state.switchingKey === null,() => controller.load(),() => selectorResultJson(controller.cancel()),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:111619",[ctx.Modifier.widthIn({ maxWidth: 360 }).heightIn({ minHeight: 420, maxHeight: 420 }),[
    header,
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:111784",null,__operitUiTemplate_111784),
    body,
    ...state.error === "" || state.data === null ? [] : [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/selection/index.ui.js:111895",[state.error,colors.error],__operitUiTemplate_111895)]
  ]],__operitUiTemplate_111619)],__operitUiTemplate_110968);
}
function renderSelectionScreen(ctx) {
  const [presentation] = ctx.useState("presentation", null);
  const [state, setState] = ctx.useState("native-selector-state", { data: null, loading: true, switchingKey: null, error: "", finished: false });
  const stored = ctx.useRef("native-selector-controller", null);
  const identity2 = ctx.useRef("native-selector-request", JSON.stringify(presentation));
  function assertOwner() {
    const [current] = ctx.useState("presentation", null);
    if (identity2.current !== JSON.stringify(current)) throw new Error("A native selector cannot change its owning presentation request");
  }
  assertOwner();
  const parsed = selectorSession(presentation);
  if (stored.current === null) stored.current = createSelectorController(parsed.input, parsed.session, setState, assertOwner);
  return selectorView(ctx, parsed.input, state, stored.current);
}

// src/ui/selection/index.ui.ts
function Screen(ctx) {
  return renderSelectionScreen(ctx);
}

function __operitUiTemplate_105704(__ctx,__values){return __ctx.UI.Image(__values[0]); }
function __operitUiTemplate_105886(__ctx,__values){return __ctx.UI.Icon({name:"Person",size:22,tint:"onSurfaceVariant",contentDescription:__values[0]}); }
function __operitUiTemplate_105820(__ctx,__values){return __ctx.UI.Box({width:28,height:28,contentAlignment:"center"},__values[0]); }
function __operitUiTemplate_105991(__ctx,__values){return __ctx.UI.Image(__values[0]); }
function __operitUiTemplate_106142(__ctx,__values){return __ctx.UI.Icon({name:"SmartToy",size:22,tint:"onSurfaceVariant",contentDescription:__values[0]}); }
function __operitUiTemplate_106076(__ctx,__values){return __ctx.UI.Box({width:28,height:28,contentAlignment:"center"},__values[0]); }
function __operitUiTemplate_106345(__ctx,__values){return __ctx.UI.Icon({name:"Groups",size:22,tint:"onSurfaceVariant",contentDescription:__values[0]}); }
function __operitUiTemplate_106279(__ctx,__values){return __ctx.UI.Box({width:28,height:28,contentAlignment:"center"},__values[0]); }
function __operitUiTemplate_107336(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"bodySmall",maxLines:1,overflow:"ellipsis",color:__values[1],fontWeight:__values[2]}); }
function __operitUiTemplate_107526(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"labelSmall",maxLines:1,overflow:"ellipsis",color:__values[1]}); }
function __operitUiTemplate_107269(__ctx,__values){return __ctx.UI.Column({weight:1,horizontalAlignment:"start"},__values[0]); }
function __operitUiTemplate_107740(__ctx,__values){return __ctx.UI.CircularProgressIndicator({width:16,height:16,strokeWidth:2}); }
function __operitUiTemplate_107818(__ctx,__values){return __ctx.UI.Icon({name:__values[0],size:__values[1],tint:__values[2],contentDescription:__values[3]}); }
function __operitUiTemplate_107662(__ctx,__values){return __ctx.UI.Box({width:20,height:20,contentAlignment:"center"},__values[0]); }
function __operitUiTemplate_108089(__ctx,__values){return __ctx.UI.Row(__values[0],__values[1]); }
function __operitUiTemplate_108127(__ctx,__values){return __ctx.UI.Row(__values[0],__values[1]); }
function __operitUiTemplate_108859(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"titleSmall",fontWeight:"700",weight:1}); }
function __operitUiTemplate_108975(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"labelSmall",color:__values[1]}); }
function __operitUiTemplate_109090(__ctx,__values){return __ctx.UI.Spacer({width:2}); }
function __operitUiTemplate_109449(__ctx,__values){return __ctx.UI.Icon({name:"Close",size:18,contentDescription:"\u5173\u95ED"}); }
function __operitUiTemplate_109124(__ctx,__values){return __ctx.UI.IconButton({key:"selector-close",enabled:__values[0],width:32,height:32,onClick:__values[1]},__values[2]); }
function __operitUiTemplate_108723(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true,paddingStart:16,paddingTop:8,paddingEnd:8,paddingBottom:4,verticalAlignment:"center"},__values[0]); }
function __operitUiTemplate_109647(__ctx,__values){return __ctx.UI.CircularProgressIndicator({width:20,height:20,strokeWidth:2}); }
function __operitUiTemplate_109573(__ctx,__values){return __ctx.UI.Box({weight:1,fillMaxWidth:true,contentAlignment:"center"},__values[0]); }
function __operitUiTemplate_109764(__ctx,__values){return __ctx.UI.Text({key:"selector-load-error",text:__values[0],color:__values[1],paddingHorizontal:16,paddingVertical:18,weight:1}); }
function __operitUiTemplate_109955(__ctx,__values){return __ctx.UI.Text({text:__values[0],style:"bodySmall",color:__values[1],paddingStart:16,paddingTop:18,paddingEnd:16,paddingBottom:20,weight:1}); }
function __operitUiTemplate_110678(__ctx,__values){return __ctx.UI.HorizontalDivider({thickness:1,color:__values[0]}); }
function __operitUiTemplate_110485(__ctx,__values){return __ctx.UI.Column({key:__values[0],fillMaxWidth:true},__values[1]); }
function __operitUiTemplate_110801(__ctx,__values){return __ctx.UI.LazyColumn(__values[0]); }
function __operitUiTemplate_111784(__ctx,__values){return __ctx.UI.HorizontalDivider({thickness:1}); }
function __operitUiTemplate_111895(__ctx,__values){return __ctx.UI.Text({key:"selector-commit-error",text:__values[0],color:__values[1],style:"bodySmall",paddingHorizontal:16,paddingVertical:8}); }
function __operitUiTemplate_111619(__ctx,__values){return __ctx.UI.Column({fillMaxWidth:true,height:420,modifier:__values[0]},__values[1]); }
function __operitUiTemplate_110968(__ctx,__values){return __ctx.UI.Dialog({key:"character-selection",containerColor:"surfaceContainerHigh",shape:{cornerRadius:28},closeOnDismissRequest:false,properties:{usePlatformDefaultWidth:false,dismissOnBackPress:__values[0],dismissOnClickOutside:__values[1]},onLoad:__values[2],onDismissRequest:__values[3]},__values[4]); }