---
issue: 662
issue_title: "fix(pi-subagents): honor wait:true for queued agents and in-flight resumes"
pr: 662
---

# Retro: #662 — honor `wait:true` for queued agents and in-flight resumes

## Stage: PR Review (2026-07-27T14:25:08Z)

### Session summary

Third-party PR #662 from `@daoguademeng` fixes `get_subagent_result`'s `wait` path, which only awaited `status === "running"` and therefore returned a stale report for a queued agent and for an agent whose `resume()` was still in flight.
Both defects were reproduced on current `main` before the diff was evaluated.
The operator chose to adopt the capability with our own simplified design: include both fixes, and close the ignored-`AbortSignal` gap in the same change rather than deferring it.

### Evaluation

Verify gate — both defects reproduce on current `main`.
The PR branch was checked out in a scratch worktree and the full gate ran green there (`pnpm run check`, `pnpm run lint`, 1085/1085 `pi-subagents` tests).
Reverting only `src/lifecycle/subagent.ts` and `src/tools/get-result-tool.ts` to `origin/main` and re-running the two touched test files fails both new tests: the queued case returns `Status: queued` with no result, and `agent.promise` settles immediately during an in-flight resume.
The PR base `104339af` is 28 commits behind `main`, but `git log 104339af..origin/main` over the four touched files is empty, so the branch result is representative of `main`.

Defect 1 — `src/tools/get-result-tool.ts:36` — is real, high-value, and the fix is this repo's own documented idiom.
`SubagentManager.pendingPromises()` (`src/lifecycle/subagent-manager.ts:344`) already selects awaitable records with `filter(r => r.isActive()).map(r => r.promise)`, and `GetResultTool.execute` was the lone remaining site hand-rolling `status === "running"` — the exact scattered-decision smell the `code-design` skill names, down to the literal example.
It also repairs a second-order bug: because the queued record stayed `isActive()`, the `markConsumed()` branch below never ran, so the completion nudge fired redundantly after the parent had already collected the outcome.

Defect 2 — `Subagent.resume()` in `src/lifecycle/subagent.ts` — is real but nearly unreachable today.
The only caller is `src/tools/agent-tool.ts:100`, which awaits the resume synchronously and returns the result inline, and `src/service/service.ts` exposes no resume on the cross-extension surface.
Reaching it requires the model to issue `Agent(resume=…)` and `get_subagent_result(wait=true)` against the same agent as parallel tool calls.
The PR's fix is nonetheless sound and structurally forced — `_promise` cannot be assigned from inside an `async` body, so extracting `runResume` is the only way to publish the live handle — and it mirrors the existing `start()` and `scheduleVia()` shape.

What we would change relative to the PR.
Widening the wait from "running" to "everything queued ahead of it" can block the parent for the full queue depth (`maxConcurrent` defaults to 4), and `GetResultTool.execute` ignores its own `_signal: AbortSignal`; today the only escape is ESC's global abort-all (Issue #664), which resolves queued promises via `ConcurrencyLimiter.clear()` but is a blunt instrument.
`resume()` should drop `async` and return the tracked promise directly rather than paying a redundant wrapper tick.
The new subagent test introduces `await new Promise((r) => setTimeout(r, 0))`, the first `setTimeout` in the package's 64 test files — asserting promise identity against the pre-resume handle, or awaiting a microtask, is deterministic and in-convention.
The change is a fix toward the tool's own documented `wait` contract, so it is `fix:`, not `fix!:`.

### Decision and attribution

Direction: adopt the capability, plan a simplified design.
The PR is reference material, not the merge target.

Scope: both defects are in scope — the queued-agent guard and the `resume()` promise-refresh invariant — plus honoring `GetResultTool.execute`'s `AbortSignal` so an interrupt returns a partial report instead of depending on ESC's abort-all.
Non-goals: no change to `ConcurrencyLimiter`, no new background-resume path, no change to the notification or nudge layer beyond what falls out of the queued record now reaching `markConsumed()`.

Attribution: every implementation and docs commit for this work carries the trailer below, and the PR close comment thanks `@daoguademeng` by name and links the implementing SHAs.
Reference the PR as `Refs #662` — never `Closes #662`.

```text
Co-authored-by: daoguademeng <whumaple@gmail.com>
```

## Stage: Planning (2026-07-27T14:42:30Z)

### Session summary

Wrote `docs/plans/0662-honor-wait-for-queued-and-resuming-agents.md`, a seven-cycle TDD plan covering the queued-agent wait, the ignored `AbortSignal`, and the stale `promise` getter across a resume.
The PR-review stage had already run the direction gate, so this session planned around the recorded decision rather than re-litigating it.
The plan ships independently — Issue #662 is not a step in the Phase 15–21 roadmap, so it carries no `Release: batch` tag.

### Observations

The central design call was where the wait decision lives.
The PR patched the guard in place (`record.status === "running"` → `record.isActive()`), which fixes the defect but leaves `GetResultTool` asking the record three questions before acting — the Law-of-Demeter case in the `design-review` checklist.
The plan instead adds `Subagent.waitUntilSettled(signal?)` so the record owns "am I still awaitable, and what is my handle", and the call site collapses to one tell.
This also lands the `code-design` OCP heuristic: the discriminator sweep drops `status === "running"` from 2 production sites to 1, and the survivor (`get-result-report.ts:45`) is per-status presentation dispatch that the Non-Goals deliberately keep.

Interrupt semantics were the other real decision.
Ending the wait must **not** abort the agent — `get_subagent_result` is a query, and the agent-killing reading of ESC already lives in `InterruptHandler` (Issue #664).
Today ESC ends a wait twice over (the signal race and `abortAll()`), so the race looks redundant; it stops being redundant the moment #664 makes abort-all opt-out, which is the argument for landing it here instead of deferring.
The listener-cleanup channel uses an inner `AbortController` with the `{ signal }` listener option rather than the returned-closure shape of `RunListeners.wireSignal` and `forwardAbortSignal`.

Two sequencing traps are pinned in the TDD order.
Making `resume()` non-`async` would convert its precondition rejection into a synchronous throw that escapes `.rejects.toThrow()`, so the plan lands a rejection test before the conversion and specifies `Promise.reject` over `throw`.
And the new tests must not copy the PR's `await new Promise((r) => setTimeout(r, 0))` — that would be the first `setTimeout` across the package's 64 test files; promise identity or a microtask tick is deterministic and in-convention.

No follow-up issues were filed.
Both Open Questions (signalling a cut-short wait in the report; a per-call `timeout`) are speculative and entangled with Issues #636 and #664, which already exist.
