"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logPlanModeDebug = logPlanModeDebug;
/** Writes one structured diagnostic for the plan plugin. */
function logPlanModeDebug(message, payload) {
    console.log("[plan_mode] " + message + (payload === undefined ? "" : " " + JSON.stringify(payload)));
}
