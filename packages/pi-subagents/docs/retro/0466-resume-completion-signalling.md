---
issue: 466
issue_title: "Resuming a subagent skips completion lifecycle, notification, and history emission"
---

# Retro: #466 — Resuming a subagent skips completion lifecycle, notification, and history emission

## Stage: Planning (2026-07-18T00:00:00Z)

### Session summary

Planned Phase 21 Step 2: route `Subagent.resume()` termination through the completion observer so a resumed run emits a public event, re-appends `subagents:record`, and (when unconsumed) sends a notification.
The two design decisions the roadmap flagged as open were resolved with the operator via `ask_user`: a **distinct `subagents:resumed` channel** (single channel, payload discriminates completed/error) and a **silent child-lifecycle** (no `subagents:child:*` on resume).
Plan committed at `packages/pi-subagents/docs/plans/0466-resume-completion-signalling.md`; three cycles (observer channel → resume wiring → docs), all `fix:` / `docs:`, ship independently.

### Observations

- **Terminology correction mid-`ask_user`.**
  The operator asked "distinct event vs distinct channel?"
  — in this codebase each event *is* its own channel string (`SUBAGENT_EVENTS` already has six), so "distinct resumed event" and "a new `subagents:resumed` channel" are the same thing.
  Re-asked with that framing; operator chose the distinct channel.
- **Scope reduction from the roadmap.**
  The roadmap's tentative target-file list named `subagent-session.ts` (`resumeTurnLoop` result shape).
  The silent-child-lifecycle decision means `resumeTurnLoop` does **not** need `aborted`/`steered`, so it stays `Promise<string>` and `subagent-session.ts` is untouched.
  Documented as a deliberate deviation.
- **Notification nuance.**
  The current resume-via-tool path marks the record consumed right after `manager.resume()` returns, and `sendCompletion` is consumption-gated, so the notification stays suppressed today (correct — parent already has the result).
  The record re-append and `subagents:resumed` event fire unconditionally, fixing the stale-history and missing-event bugs.
  The notification path becomes correct for the future non-consuming #465 ask-back caller.
- **Registry bracket is safe.**
  pi-permission-system's `subagent-registry` subscribes only to `subagents:child:session-created` / `disposed`, not `completed` — so the once-per-session concern is about the child arc's readability, not a functional break.
  Leaving the child channel silent honors the roadmap invariant with zero risk to the bracket.
- **Interface widening is the main compile-time hazard.**
  Adding a required `onSubagentResumed` to `SubagentManagerObserver` breaks `CompositeSubagentObserver`, `AgentWidget`, and the full-object test mocks (`composite-subagent-observer.test.ts` `makeDelegate` + inline literals, `subagent-manager.test.ts` `createManager`); folded into the one cycle that adds the method.
- **Step-1 (#563) invariant checked.** `completeResume`/`failResume` and the `isBackground`-gated `onResumeFinished` arm add no `status === …` groupings, so the repeated-discriminator sweep stays at 2; named as a post-cycle check.
