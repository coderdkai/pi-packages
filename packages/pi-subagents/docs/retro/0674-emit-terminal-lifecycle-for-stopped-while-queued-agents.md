---
issue: 674
issue_title: "fix(pi-subagents): emit terminal lifecycle for stopped-while-queued agents"
pr: 665
---

# Retro: #674 — fix(pi-subagents): emit terminal lifecycle for stopped-while-queued agents

## Stage: PR Review (2026-07-27T18:25:55Z)

### Session summary

Third-party PR #665 from @daoguademeng reports that aborting a **queued** background agent emits no terminal lifecycle signal — no `subagents:completed` event, no `subagents:record` entry, no completion nudge — while a running agent's abort flows through `completeRun`/`failRun` → `onRunFinished` → `onSubagentCompleted`.
I reproduced the defect on current `main` (`e76d6919`), confirmed the PR's three tests are red-on-main and green-with-fix, and found the PR lands CI red on an unrelated-looking but genuine `fallow` finding.
The operator chose **adopt the capability with our own simplified design**; issue #674 tracks our implementation and #665 stays open as the reference until it lands.

### Verify gate

**Defect confirmed on current `main`.**
A scratch test (`packages/pi-subagents/test/lifecycle/scratch-pr665.test.ts`, deleted after use) exercised `SubagentManager` directly:

```text
✗ abort() on a queued agent notifies onSubagentCompleted
    expected "vi.fn()" to be called 1 times, but got 0 times
✗ abortAll() notifies for queued agents
    expected [] to have a length of 1 but got +0
✓ running-agent abort DOES notify (asymmetry probe)
```

The third case is the one that makes this a defect rather than a design choice: the identical user action produces a terminal event or not depending purely on whether the limiter had admitted the agent.

**Not already fixed.**
The failure is on `main` as of `e76d6919`; the PR branch is based on `104339af`, only a few docs commits behind.
No version/upgrade question applies.

**Boundary is correct.**
`SubagentManager.abort()` (queued branch, `subagent-manager.ts:256`) and `abortAll()` (`:313`) are exactly the two paths that shortcut to `record.markStopped()` and return.
`queued` status implies `isBackground && !bypassQueue`, since a foreground or bypass spawn calls `record.start()` synchronously — so these are the only two reachable sites.

**Regression risk in the other direction.**
`onSubagentCompleted` fans out in `SubagentEventsObserver.persistAndNotify` to three concerns: the `subagents:completed` event, the `subagents:record` session entry, and `NotificationManager.sendCompletion`.
The third is where the risk sits — see items 2 and 3 of the evaluation.

### Checks run

Fork PRs sit at `action_required`, but this run had already been approved.
CI's `check` job is **red**, and it reproduces locally on the PR branch:

```text
✗ 1 stale suppression
  packages/pi-subagents/src/lifecycle/subagent-manager.ts:328:0
  // fallow-ignore-next-line unused-class-member
  (no unused-class-member issue found on the next line)
```

Cause: the PR's `abortAll()` test is the first *direct* call to `SubagentManager.abortAll()` in the suite — existing tests only mock it through the narrow `LifecycleManager`/`InterruptManager` interfaces.
That resolves the `unused-class-member` finding and strands the suppression.
The two complexity findings in the same report are inherited and excluded from the gate.

Everything else on the PR branch is green:

| Check                      | Result                                               |
| -------------------------- | ---------------------------------------------------- |
| `pnpm run check`           | 9/9 packages clean                                   |
| `pnpm run lint`            | biome 566 files, eslint 915 files, rumdl — all clean |
| `pnpm --filter … run test` | 64 files, 1086/1086 passed                           |
| `pnpm fallow audit`        | ✗ 1 stale suppression (exit 1)                       |

### Evaluation

**Valuable — keep.**
The diagnosis, the boundary, and the three tests.
The middle test (`a stopped-while-queued agent notifies exactly once even after its slot frees`) is the sharp one: it pins that the limiter's dropped thunk cannot re-notify, because `guardedRun()` resolves without running for a non-active record.
That is the invariant a naive fix would break, and the contributor found it.

**What I would change.**

1. **Second dispatch site.**
   `notifyQueuedStopped()` calls `this.observer?.onSubagentCompleted(record)` directly, duplicating the `try`/`catch` + `debugLog` already in `buildObserver`'s `onRunFinished` handler (`subagent-manager.ts:143`) and dropping its `options.isBackground` guard.
   Unreachable divergence today, but it is the `code-design` "scattered decisions" smell — the "should this observer fire" decision gains a second home.
   Prefer `Subagent.stopQueued()` = `markStopped()` + `this.execution.observer?.onRunFinished?.(this)`, matching the existing `completeRun`/`failRun` funnel.
   Both manager sites collapse to `record.stopQueued()`: no new dispatch, guard preserved, and terminal-notification ownership stays on the object that already owns it.

2. **The nudge does not tell the truth.**
   A queued-stopped agent never ran, so it has no result — not an empty one.
   `formatTaskNotification` renders `<result>No output.</result>` and `emitIndividualNudge` appends `Call get_subagent_result("<id>") to collect the full result.`, pointing the parent at something that does not exist.
   Operator's call: keep full parity (event + record + nudge), but the message must state the truth — stopped while queued, never started.

3. **"Shutdown stays quiet" is inaccurate.**
   The PR body argues `handleSessionShutdown` aborts before `disposeNotifications()`, so shutdown-time nudges are cancelled.
   Reading `NotificationManager`, that holds only when a parent run is active: `sendCompletion` defers to `pendingNudges` **only** when `parentRunActive` is true, and at `session_shutdown` no run is active — so `emitIndividualNudge` fires `sendMessage(..., { deliverAs: "followUp", triggerTurn: true })` synchronously inside the shutdown handler, and `dispose()` (which only clears the pending map) cannot recall it.
   This is a source reading, not a live repro; confirm empirically during implementation.

**Behavior / breaking.**
Non-breaking in the upgrade sense — no config edit required — but it is an observable behavior change: new `subagents:completed` events, new `subagents:record` entries, and new nudges appear where none did.
`fix(pi-subagents):` is the right type.

**Test coverage.**
The PR does ship tests that fail without the fix, which I verified independently rather than taking on faith.

### Decision and attribution

**Direction: adopt the capability, plan a simplified design** (issue #674). #665 is reference, not merge target.

Scope for `/plan-issue #674`:

1. `Subagent.stopQueued()` funnel; both `SubagentManager` sites collapse to it.
2. Nudge copy tells the truth for a never-ran agent (full parity on event + record + nudge, honest wording).
3. Confirm and handle the synchronous shutdown-time nudge.
4. Delete the stale `fallow-ignore-next-line unused-class-member` above `abortAll()`.
5. Carry over the three tests from #665.

Non-goals: reworking the `NotificationManager` withholding model, and any change to running-agent abort behavior.

**Attribution — required.**
Every implementation and docs commit for #674 carries, after a blank line at the end of the body:

```text
Co-authored-by: daoguademeng <whumaple@gmail.com>
```

The close comment on #665 thanks @daoguademeng by name, links the implementing SHA(s), and credits the diagnosis and the exactly-once test.
Reference the PR as `Refs #665` — never `Closes #665`.
