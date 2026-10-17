"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Screen;
const goal_mode_ipc_js_1 = require("../../shared/goal_mode_ipc.js");
/** Calculates active goal time from its persisted timing checkpoints. */
function calculateGoalElapsedMs(goal, now) {
    const end = goal.pausedAt ?? goal.completedAt ?? now;
    return Math.max(0, end - goal.startedAt - goal.pausedDurationMs);
}
/** Formats an elapsed duration as a fixed-width hours, minutes, and seconds value. */
function formatGoalDuration(durationMs) {
    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
}
/** Renders the current goal and its state controls above the chat composer. */
function Screen(ctx) {
    const [chatId] = ctx.useState("chatId", "");
    const [goal, setGoal] = ctx.useState("goal", null);
    const goalRef = ctx.useRef("currentGoal", goal);
    goalRef.current = goal;
    /** Owns the subscription and elapsed-time refresh for this exact chat context. */
    ctx.useEffect("goal", () => {
        setGoal(null);
        const iterator = goal_mode_ipc_js_1.GoalService.watch(chatId);
        let active = true;
        /** Consumes routed state until the composition releases this collector. */
        const observe = async () => {
            for await (const next of iterator) {
                if (!active)
                    return;
                setGoal(next);
            }
        };
        void observe().catch((error) => { if (active)
            ctx.reportError(error); });
        /** Releases the chat subscription and timer together. */
        return () => {
            active = false;
            void iterator.return(undefined).catch((error) => { ctx.reportError(error); });
        };
    }, [chatId]);
    /** Refreshes elapsed time only while the currently displayed goal is active. */
    ctx.useEffect("goal-clock", () => {
        if (goal?.status !== "active")
            return () => { };
        const timer = setInterval(() => {
            if (goalRef.current?.status === "active")
                setGoal({ ...goalRef.current });
        }, 1000);
        /** Releases this composition's elapsed-time timer. */
        return () => { clearInterval(timer); };
    }, [chatId, goal?.status]);
    /** Pauses the durable goal on its Binding owner. */
    const pause = async () => { await goal_mode_ipc_js_1.GoalService.status(chatId, "paused"); };
    /** Resumes the durable goal on its Binding owner. */
    const resume = async () => { await goal_mode_ipc_js_1.GoalService.status(chatId, "active"); };
    /** Removes the durable goal on its Binding owner. */
    const clear = async () => { await goal_mode_ipc_js_1.GoalService.clear(chatId); };
    const active = goal?.status === "active";
    // Keep the empty slot zero-height while the initial read is pending too.
    // Transient padding here resizes the transcript and nudges its bottom twice.
    if (goal === null) {
        return ctx.UI.Column({ fillMaxWidth: true }, []);
    }
    const paused = goal?.status === "paused";
    const title = active ? "Task goal" : paused ? "Task goal paused" : "Task goal completed";
    const elapsed = goal ? formatGoalDuration(calculateGoalElapsedMs(goal, Date.now())) : "00:00:00";
    return ctx.UI.Column({ fillMaxWidth: true, padding: { horizontal: 8, vertical: 2 } }, [
        ctx.UI.Card({
            fillMaxWidth: true,
            containerColor: ctx.MaterialTheme.colorScheme.surfaceVariant.copy({ alpha: 0.22 }),
            shape: { cornerRadius: 6 },
            elevation: 0,
        }, [
            ctx.UI.Row({ fillMaxWidth: true, padding: { horizontal: 8, vertical: 3 }, spacing: 6, verticalAlignment: "center" }, [
                ctx.UI.Box({ width: 32, height: 32, contentAlignment: "center" }, ctx.UI.Icon({ name: "flag", tint: "onSurfaceVariant", size: 16 })),
                ctx.UI.Text({ text: title, style: "labelMedium", maxLines: 1, overflow: "ellipsis", weight: 1 }),
                ctx.UI.Text({ text: elapsed, style: "labelSmall", color: "onSurfaceVariant", maxLines: 1 }),
                ctx.UI.Text({ text: goal.objective, style: "bodySmall", fontSize: 12, maxLines: 1, overflow: "ellipsis", weight: 2 }),
                active
                    ? ctx.UI.IconButton({ icon: "pause", width: 32, height: 32, onClick: pause })
                    : paused
                        ? ctx.UI.IconButton({ icon: "playArrow", width: 32, height: 32, onClick: resume })
                        : ctx.UI.Box({ width: 32, height: 32, contentAlignment: "center" }, ctx.UI.Icon({ name: "checkCircle", tint: "onSurfaceVariant", size: 16 })),
                ctx.UI.IconButton({
                    width: 32,
                    height: 32,
                    onClick: clear,
                    content: ctx.UI.Icon({ name: "delete", tint: "onSurfaceVariant", size: 16 }),
                }),
            ]),
        ]),
    ]);
}
