type LogPayloadValue = string | number | boolean | null | undefined;

/** Writes one structured diagnostic for the plan plugin. */
export function logPlanModeDebug(message: string, payload?: Record<string, LogPayloadValue>): void {
  console.log("[plan_mode] " + message + (payload === undefined ? "" : " " + JSON.stringify(payload)));
}
