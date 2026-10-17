"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPlanStarted = isPlanStarted;
exports.claimPlanStart = claimPlanStart;
exports.forgetPlanStart = forgetPlanStart;
exports.watchPlanStarted = watchPlanStarted;
const plan_mode_plan_file_js_1 = require("./plan_mode_plan_file.js");
/** Encodes a chat and a normalized plan without ambiguous separator collisions. */
function handoffKey(chatId, content) {
    return chatId.length + ":" + chatId + (0, plan_mode_plan_file_js_1.normalizePlanText)(content);
}
/** Reads the durable handoff marker shared by all devices and UI runtimes. */
async function isPlanStarted(chatId, content) {
    return (await (await (0, plan_mode_plan_file_js_1.openPlanDatabase)()).collection("startedPlans").get(handoffKey(chatId, content))) !== null;
}
/** Claims a plan handoff with an absence precondition rather than a runtime-local flag. */
async function claimPlanStart(chatId, content) {
    const plan = (0, plan_mode_plan_file_js_1.normalizePlanText)(content);
    if (!plan)
        return false;
    const collection = (await (0, plan_mode_plan_file_js_1.openPlanDatabase)()).collection("startedPlans");
    const key = handoffKey(chatId, plan);
    if (await collection.get(key) !== null)
        return false;
    await collection.put(key, { chatId, content: plan }, { expectedVersion: null });
    return true;
}
/** Removes a handoff marker when starting implementation fails. */
async function forgetPlanStart(chatId, content) {
    await (await (0, plan_mode_plan_file_js_1.openPlanDatabase)()).collection("startedPlans").remove(handoffKey(chatId, content));
}
/** Streams synchronized handoff changes for one exact chat and plan identity. */
async function* watchPlanStarted(chatId, content, signal) {
    const key = handoffKey(chatId, content);
    const database = await (0, plan_mode_plan_file_js_1.openPlanDatabase)();
    for await (const entry of database.collection("startedPlans").watch(key, { signal })) {
        yield entry !== null;
    }
}
