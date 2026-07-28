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

## Stage: Planning (2026-07-28T00:03:50Z)

### Session summary

Wrote `packages/pi-subagents/docs/plans/0674-emit-terminal-lifecycle-for-stopped-while-queued-agents.md` — seven steps (six red→green→commit cycles plus a docs commit) implementing the PR-review stage's adopt-with-simplified-design decision.
The PR-review retro settled the direction, so planning only had to resolve three open design parameters: the shape of the never-started notification, where the never-started fact is stored, and the mechanism for suppressing shutdown-time nudges.
Baseline measured on `b1722630`: 64 test files, 1095 tests green, `pnpm fallow audit --base origin/main` clean.

### Observations

- **Notification shape — trimmed block.**
  The operator chose omitting `<result>` and `<usage>` entirely for a never-started agent over keeping the full block with honest wording: a zeroed `<usage>` is itself a lie of shape.
  Cost accepted: `formatTaskNotification` gains a second block layout.
- **State placement.**
  The operator's uncertainty was whether a pre-start fact could live in `SubagentState`.
  It can — `SubagentState` is constructed at spawn with `status: "queued"`, so there is no upstream gap.
  Chose `stoppedWhileQueued`, written only by a new `stopQueued()` transition (one writer, no init-seeding subtlety), over an `everRan` bit maintained by `markRunning()`.
  A new `SubagentStatus` union member was rejected as wire-visible with no new presentation to justify it.
- **Shutdown — reorder plus latch, deliberately broad.**
  Named three disadvantages before the operator confirmed: `dispose()` becomes one-shot; a documented, test-pinned cleanup order changes; and it also suppresses the nudges *running* agents currently leak asynchronously at shutdown.
  The operator chose to treat the third as intended and have the plan test it, so this fix is not scoped purely to queued agents.
- **ESC path needs no work.** `InterruptHandler` fires inside the parent's run, so `parentRunActive` is true and the new nudges are withheld and flushed on `agent_settled` per #661 — the leak is specific to `session_shutdown`, where no run is active.
- **Scope grew by one surface.**
  `get_subagent_result` would have returned the same `"No output."` lie, so `renderReportBody` gets a never-started branch (TDD 6).
  Kept as its own step so it can be dropped without disturbing the rest.
- **Rejected widening the wire payload.**
  `subagents:failed` / `subagents:record` do not carry the never-started fact: two tests pin the record entry's exact eight fields, and no consumer has asked.
  Recorded as an Open Question rather than filed as an issue.
- **Pre-existing doc bug found.**
  The architecture doc's agent-lifecycle state diagram has `running --> aborted : abort() called` and `running --> stopped : max turns reached` — swapped relative to the code (`abort()` → `markStopped()`; turn limit → `markAborted()`).
  The README status table is correct.
  Folded the correction into the docs step since that diagram is being edited anyway to add the `queued --> stopped` edge.
- **No follow-up issues filed.**
  Both Open Questions are watch-items, not concrete deferred work.
- **Attribution is a live constraint.**
  Every implementation and docs commit carries `Co-authored-by: daoguademeng <whumaple@gmail.com>`, and #665 is referenced as `Refs #665`, never `Closes`.

## Stage: Implementation — TDD (2026-07-28T00:24:05Z)

### Session summary

Executed all seven plan steps plus two tidy-first preparatory commits — nine commits total, every one carrying the `Co-authored-by` trailer.
The change adds `SubagentState.stopQueued()` and a `stoppedWhileQueued` marker, funnels both `SubagentManager` queued-abort sites through a new `Subagent.stopQueued()`, emits a trimmed never-started `<task-notification>`, makes `NotificationManager.dispose()` a terminal latch with the shutdown handler reordered ahead of the aborts, and gives `get_subagent_result` an honest never-started body. pi-subagents tests went 1095 → 1114 (+19); `check`, root `lint`, `fallow dead-code`, and `fallow audit --base origin/main` all clean.

### Observations

- **The tidy-first assessor earned its keep.**
  It proposed two extractions in `notification.ts` (`joinNotificationLines`, `buildPointerLines`) that the plan's own Design Overview snippets had already implied but not scheduled.
  Landing them as `refactor:` commits first kept TDD 4's diff to the actual behavior change.
  It correctly rejected four other candidates as scope creep, including consolidating `SubagentState`'s four guarded `mark*` transitions — a wrong-abstraction trap.
- **The shutdown leak reproduced exactly as the issue predicted.**
  The red test (`sendCompletion` after `dispose()`, no parent run active) failed on the pre-change code, confirming empirically what the PR-review stage had derived only from reading `NotificationManager`.
  Scope item 3 of the issue asked for that confirmation and got it.
- **The running-agent shutdown suppression is pinned by the record the test uses.**
  The disposal test drives a default `createTestSubagent()` (a normally-completed record), not a never-started one — so it pins the broader suppression the operator asked to treat as intended, not just the queued case.
- **One plan prediction was pessimistic.**
  The plan expected 6 `AgentReport` literals in `get-result-report.test.ts` to need the new required field; the file builds every report through a single `makeReport` factory, so one edit covered them all.
  The reviewer independently grepped to confirm no literal exists outside the factory.
- **`arrangeQueuedPair` needed one optional parameter**, not the harness rework the assessor considered and rejected — adding an `observer?: Partial<SubagentManagerObserver>` passthrough was enough for all three carried-over tests.
- **Found and fixed a pre-existing architecture-doc bug.**
  The agent-lifecycle state diagram had `running --> aborted : abort() called` and `running --> stopped : max turns reached` — swapped relative to the code.
  Verified against `subagent.ts` and corrected in the docs commit alongside the new `queued --> stopped` edge; `mmdc` renders all five diagrams in the file cleanly.
- **Baseline flake worth remembering.**
  The first root `pnpm run test` failed in `pi-autoformat` on an integration test that spawns a `pi rpc` session and timed out; it passed on rerun and on every subsequent full-suite run.
  Unrelated to this change, but it briefly looked like a red baseline.
- **Pre-completion reviewer: PASS** — no warnings.
  It independently verified the attribution trailers on all nine commits, the fixture simplification, the shutdown-suppression test, the Mermaid edits against source, and both cross-step invariants (#542 full-value init, #563 exactly-once guard).
