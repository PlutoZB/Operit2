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

// src/ui/group-execution/index.ui.ts
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
function requireId(value, label) {
  assertString(value, label);
  if (value.trim() === "" || value !== value.trim()) throw new Error(`${label} \u65E0\u6548`);
  return value;
}

// src/group-execution/control.ts
function controlInput(value) {
  assertObject(value, "group control presentation");
  const requestId = requireId(value.requestId, "group control requestId");
  assertObject(value.input, "group control input");
  if (value.input.mode !== "group-execution" || Object.keys(value.input).length !== 2) throw new Error("Group control requires mode and chatId");
  return { requestId, chatId: requireId(value.input.chatId, "group control chatId") };
}
function checkedStatus(value, chatId, submissionId) {
  if (value === null) {
    if (submissionId !== null) throw new Error("Exact group submission returned no status");
    return null;
  }
  assertObject(value, "group execution status");
  requireId(value.submissionId, "group status submissionId");
  if (value.chatId !== chatId || submissionId !== null && value.submissionId !== submissionId) throw new Error("Group status changed its requested identity");
  if (value.status !== "running" && value.status !== "settled" && value.status !== "failed") throw new Error("Unknown group execution status");
  if (value.status === "settled" !== (value.outcome !== null)) throw new Error("Group status and settlement disagree");
  if (value.status === "failed" ? typeof value.error !== "string" : value.error !== null) throw new Error("Group failure status is malformed");
  if (value.outcome !== null && (value.outcome.chatId !== chatId || value.outcome.submissionId !== value.submissionId)) throw new Error("Group outcome changed its submission identity");
  return value;
}
function createGroupControl(requestId, chatId, publish, assertOwner) {
  let state = { value: null, busy: false, loaded: false, error: "", finished: false }, loading = null;
  function update(change) {
    state = { ...state, ...change };
    publish(state);
  }
  function idle() {
    assertOwner();
    if (state.finished || state.busy) throw new Error("Group control is closed or already processing an action");
  }
  function request(action, submissionId) {
    return __async(this, null, function* () {
      idle();
      update({ busy: true, error: "" });
      try {
        const payload = action === "current" ? { action, chatId } : { action, chatId, submissionId };
        const value = yield ToolPkg.ipc.call("character-memory.group-execution", payload, { targetRuntime: "main" });
        assertOwner();
        update({ value: checkedStatus(value, chatId, submissionId), loaded: true });
      } catch (failure) {
        update({ error: String(failure) });
        throw failure;
      } finally {
        update({ busy: false });
      }
    });
  }
  return {
    /** Retains the initial load Promise including its original rejection. */
    load() {
      if (loading === null) loading = request("current", null);
      return loading;
    },
    /** Reads current state only when the user explicitly asks to refresh. */
    refresh() {
      return request("current", null);
    },
    /** Requires the precise displayed state before issuing cancellation or resumption. */
    act(action) {
      idle();
      const value = state.value;
      if (state.error !== "" || value === null) throw new Error("Group controls require a successful status read");
      if (action === "cancel" && value.status !== "running") throw new Error("Only a running submission can be cancelled");
      if (action === "resume" && (value.status !== "settled" || value.outcome === null || value.outcome.status !== "cancelled")) throw new Error("Only a settled cancelled submission can resume");
      return request(action, value.submissionId);
    },
    /** Emits cancellation of the modal only, not cancellation of the group submission. */
    close() {
      idle();
      update({ finished: true });
      return { type: "toolpkg.presentation.cancel", requestId };
    }
  };
}
function renderGroupExecutionScreen(ctx) {
  const [presentation] = ctx.useState("presentation", null), input = controlInput(presentation);
  const [state, publish] = ctx.useState("group-control-state", { value: null, busy: false, loaded: false, error: "", finished: false });
  const owner = ctx.useRef("group-control-owner", JSON.stringify(presentation));
  const controller = ctx.useRef("group-control-controller", null);
  function assertOwner() {
    const [current] = ctx.useState("presentation", null);
    if (JSON.stringify(current) !== owner.current) throw new Error("Group control presentation owner changed");
  }
  assertOwner();
  if (controller.current === null) controller.current = createGroupControl(input.requestId, input.chatId, publish, assertOwner);
  const control = controller.current, value = state.value;
  const labels = { running: "\u6B63\u5728\u6267\u884C", settled: "\u5DF2\u7ED3\u675F", failed: "\u6267\u884C\u5931\u8D25" };
  const outcomes = { completed: "\u5DF2\u5B8C\u6210", cancelled: "\u5DF2\u53D6\u6D88\uFF0C\u53EF\u7EE7\u7EED", blocked: "\u53D1\u9001\u88AB\u963B\u6B62", consumed: "\u53D1\u9001\u88AB\u5176\u4ED6\u5904\u7406\u5668\u63A5\u7BA1", not_persisted: "\u6D88\u606F\u672A\u4FDD\u5B58" };
  const enabled = state.loaded && !state.busy && !state.finished && state.error === "";
  return OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:7203",[!state.busy,!state.busy,() => control.load(),() => control.close(),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:7605",[[
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:7693",null,__operitUiTemplate_7693),
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:7770",[!state.loaded ? "\u6B63\u5728\u8BFB\u53D6\u6267\u884C\u72B6\u6001\u2026" : value === null ? "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u5DF2\u63D0\u4EA4\u7684\u7FA4\u7EC4\u4EFB\u52A1" : labels[value.status]],__operitUiTemplate_7770),
    ...value === null ? [] : [
      OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:8085",["\u63D0\u4EA4\uFF1A" + value.submissionId],__operitUiTemplate_8085),
      ...value.outcome === null ? [] : [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:8191",[outcomes[value.outcome.status] + " \xB7 " + value.outcome.cursor + "/" + value.outcome.plannedTurns],__operitUiTemplate_8191)],
      ...value.error === null ? [] : [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:8354",[value.error,ctx.MaterialTheme.colorScheme.error],__operitUiTemplate_8354)]
    ],
    ...state.error === "" ? [] : [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:8475",[state.error,ctx.MaterialTheme.colorScheme.error],__operitUiTemplate_8475)],
    ...state.busy ? [OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:8607",null,__operitUiTemplate_8607)] : [],
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:8678",[OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:8721",[!state.busy && !state.finished,() => control.refresh(),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:8964",null,__operitUiTemplate_8964)],__operitUiTemplate_8721),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:9010",[enabled && value !== null && value.status === "running",() => control.act("cancel"),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:9275",null,__operitUiTemplate_9275)],__operitUiTemplate_9010),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:9333",[enabled && value !== null && value.status === "settled" && value.outcome !== null && value.outcome.status === "cancelled",() => control.act("resume"),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:9679",null,__operitUiTemplate_9679)],__operitUiTemplate_9333)],__operitUiTemplate_8678),
    OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:9742",[!state.busy && !state.finished,() => control.close(),OperitComposeGeneration.template(ctx,"com.operit.character_cards:dist/ui/group-execution/index.ui.js:9962",null,__operitUiTemplate_9962)],__operitUiTemplate_9742)
  ]],__operitUiTemplate_7605)],__operitUiTemplate_7203);
}

// src/ui/group-execution/index.ui.ts
function Screen(ctx) {
  return renderGroupExecutionScreen(ctx);
}

function __operitUiTemplate_7693(__ctx,__values){return __ctx.UI.Text({text:"\u7FA4\u7EC4\u6267\u884C",style:"titleMedium"}); }
function __operitUiTemplate_7770(__ctx,__values){return __ctx.UI.Text({key:"group-execution-status",text:__values[0],paddingVertical:12}); }
function __operitUiTemplate_8085(__ctx,__values){return __ctx.UI.Text({text:__values[0]}); }
function __operitUiTemplate_8191(__ctx,__values){return __ctx.UI.Text({text:__values[0]}); }
function __operitUiTemplate_8354(__ctx,__values){return __ctx.UI.Text({text:__values[0],color:__values[1]}); }
function __operitUiTemplate_8475(__ctx,__values){return __ctx.UI.Text({key:"group-execution-error",text:__values[0],color:__values[1]}); }
function __operitUiTemplate_8607(__ctx,__values){return __ctx.UI.CircularProgressIndicator({width:20,height:20}); }
function __operitUiTemplate_8964(__ctx,__values){return __ctx.UI.Text({text:"\u5237\u65B0"}); }
function __operitUiTemplate_8721(__ctx,__values){return __ctx.UI.TextButton({key:"group-execution-refresh",enabled:__values[0],onClick:__values[1]},__values[2]); }
function __operitUiTemplate_9275(__ctx,__values){return __ctx.UI.Text({text:"\u53D6\u6D88\u6267\u884C"}); }
function __operitUiTemplate_9010(__ctx,__values){return __ctx.UI.TextButton({key:"group-execution-cancel",enabled:__values[0],onClick:__values[1]},__values[2]); }
function __operitUiTemplate_9679(__ctx,__values){return __ctx.UI.Text({text:"\u7EE7\u7EED\u6267\u884C"}); }
function __operitUiTemplate_9333(__ctx,__values){return __ctx.UI.TextButton({key:"group-execution-resume",enabled:__values[0],onClick:__values[1]},__values[2]); }
function __operitUiTemplate_8678(__ctx,__values){return __ctx.UI.Row({fillMaxWidth:true},[__values[0],__values[1],__values[2]]); }
function __operitUiTemplate_9962(__ctx,__values){return __ctx.UI.Icon({name:"Close",contentDescription:"\u5173\u95ED"}); }
function __operitUiTemplate_9742(__ctx,__values){return __ctx.UI.IconButton({key:"group-execution-close",enabled:__values[0],onClick:__values[1]},__values[2]); }
function __operitUiTemplate_7605(__ctx,__values){return __ctx.UI.Column({fillMaxWidth:true,paddingHorizontal:20,paddingVertical:16},__values[0]); }
function __operitUiTemplate_7203(__ctx,__values){return __ctx.UI.Dialog({key:"group-execution-dialog",closeOnDismissRequest:false,properties:{dismissOnBackPress:__values[0],dismissOnClickOutside:__values[1]},onLoad:__values[2],onDismissRequest:__values[3]},__values[4]); }