---
issue: 661
issue_title: "fix(pi-subagents): hold completion nudges while the parent agent streams"
pr: 661
---

# Retro: #661 — Hold completion nudges while the parent agent streams

## Stage: PR Review (2026-07-27T01:02:42Z)

### Session summary

Third-party PR #661 (from `@daoguademeng`, references no issue) reports that a background agent's completion nudge can be delivered twice — once as the result the parent pulls mid-turn, and again verbatim when Pi drains its `followUp` queue at turn end.
The defect was confirmed real on current `main` by reproduction, and the PR's fix works, but it layers a second hold mechanism on top of the existing 200 ms debounce and gates on `agent_end`, which fires once per agent-run *segment* rather than once per run.
The operator chose to adopt the capability with our own simplified design: gate on `agent_settled` and collapse the two hold mechanisms into one.

### Evaluation

Verify gate — the defect is real and correctly diagnosed.
A scratch test driving `NotificationManager` through a double that mirrors Pi's verified `sendCustomMessage` semantics failed on current `main`: the `<task-notification>` was delivered even though `record.markConsumed()` ran before turn end.
The same test passes on the PR branch.
A control case (nudge fired while the parent is idle) delivers exactly once on both, so the patch does not degrade the path that is already correct.

The mechanism matches Pi's source rather than the PR's narrative alone.
`AgentSession.sendCustomMessage` routes to `this.agent.followUp(appMessage)` whenever `isStreaming` is true (`agent-session.ts:1443-1450`), and that queue is drained by the agent loop at turn end (`agent-session.ts:1100-1102`).
Once handed off, the extension cannot recall it — so the existing schedule-time and fire-time `record.consumed` guards in `emitIndividualNudge` cannot cover the fire→turn-end window.
The archaeology shows no earlier fix being re-added: `NUDGE_HOLD_MS` dates to `1a2e3220` and the consumption guard to `0cedaad5` (#617), and neither addresses this window.

Checks were run in a scratch worktree rather than trusted from the PR body: `pnpm run check`, `pnpm run lint`, and the `@gotgenes/pi-subagents` suite all exited `0`.
The diff does ship five tests.

Two findings constrain any re-implementation and should not be re-litigated during planning.
Flushing from inside an `agent_end` handler is safe by design — `_handlePostAgentRun` re-checks `this.agent.hasQueuedMessages()` after the awaited extension handlers and runs a continuation (`agent-session.ts:1100-1102`), so a flushed nudge is never lost.
And the PR's `parentStreaming` mirror flag is *justified*, not redundant state: `isIdle()` is exposed on `ExtensionContext` / `ExtensionContextActions`, **not** on `ExtensionAPI` (`extensions/types.ts:324`, `:1616`), so the extension cannot query streaming state from inside a `setTimeout`.
Per the `code-design` rule about confirming an SDK method on the exact type the code holds, `pi.isIdle()` is not an available simplification.

What to change, and why.
The boundary is wrong: `agent_end` fires once per agent-run segment, and a single `_runAgentPrompt` emits several across auto-retry, auto-compaction, and `followUp` continuations, so a held nudge can be flushed between a failed attempt and its retry.
`agent_settled` fires exactly once per run and sets `_isAgentRunActive = false` *before* emitting to extensions (`agent-session.ts:581-582`), so a flush there takes the clean idle `triggerTurn` → `_runAgentPrompt` path instead of re-entering the unrecallable queue.
The structure is also over-built: the PR adds `heldNudges` alongside the existing `pendingNudges` timer map plus a `parentStreaming` flag, leaving two queues and three `record.consumed` checks (schedule-time, fire-time, flush-time).
Once delivery is gated on the turn boundary, the 200 ms `NUDGE_HOLD_MS` debounce is largely vestigial — an idle parent cannot pull at all, since pulling requires a tool call, which requires a turn, which means streaming.

Test coverage is the weakest part of the diff.
The test named as the bug repro (`suppresses a held nudge when the record is consumed before agent end`) fails on `main` only because `onParentAgentStart` does not exist there — a `TypeError`, not an observed duplicate.
None of the five new tests model Pi's `followUp` queue, so none actually demonstrate the duplicate being fixed.
The re-implementation should pin the regression with a Pi-semantics test double at the real boundary, as the scratch repro did.

This is not a breaking change: it suppresses a redundant message and a redundant forced turn, with no change to output shape or defaults, so `fix:` is the correct type.

### Decision and attribution

Direction: adopt the capability, plan a simplified design — PR #661 is reference material, not the merge target.

Agreed scope:

1. Gate the flush on `agent_settled` (once per agent run), not `agent_end` (once per run segment).
2. Collapse the two hold mechanisms into a single pending-nudge collection flushed at the turn boundary, retiring the now-redundant `NUDGE_HOLD_MS` debounce and the third `consumed` check.
3. Cover the regression with a test double that models Pi's `followUp` queue semantics, so the test fails on `main` for the right reason.

Non-goals: no change to nudge content or rendering, no change to `deliverAs` for the idle path, and no rework of the consumption domain state landed in #617.

Attribution: every implementation and docs commit carries the trailer below, separated from the body by a blank line.

```text
Co-authored-by: daoguademeng <whumaple@gmail.com>
```

The close comment on PR #661 thanks `@daoguademeng` by name, links the implementing SHA(s), and credits the diagnosis — the fire→turn-end window was correctly identified and is a genuine defect.
Reference the PR as `Refs #661` in commits; never `Closes #661`.
