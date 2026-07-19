---
issue: 617
issue_title: "Subagent cleanup happens too often"
---

# Retro: #617 — Subagent cleanup happens too often

## Stage: Planning (2026-07-19T23:53:28Z)

### Session summary

Planned the fix for the third-party report (`dzervas`) of results lost to the 10-minute cleanup sweep.
The plan replaces record eviction with consumption-aware session retention: `consumedAt` becomes domain state on `SubagentState`, the sweep releases the heavy `AgentSession` but never removes records, consumed agents release 10 minutes after `max(completedAt, consumedAt)`, unconsumed agents hold until a configurable cap (default 12 h), and the `EvictedSubagent` side table dissolves.
Plan committed as `packages/pi-subagents/docs/plans/0617-consumption-aware-session-retention.md`; next step is `/tdd-plan`.

### Observations

- Third-party issue, so the direction ran through the `ask-user` gate: the operator chose consumption-aware release over the issue's literal asks (longer window, insta-cleanup on retrieval), and "timer only" — consumption never accelerates release, preserving read-then-resume.
- Key codebase facts that shaped the design: the result string already lives on `SubagentState` (not the session), so the light/heavy split needed for release-not-evict already exists; the consumed fact already exists as shadow state in `NotificationManager.consumed`, fed through a `GetResultTool` → notifications dependency; the architecture doc's Phase 17 prose had already named the "homeless `notification.resultConsumed` field".
- Rejected alternatives, with reasons recorded in the plan: serving results from disk (the stored result includes a workspace-disposal suffix absent from the transcript — a disk re-derivation provably diverges); widening `EvictedSubagent` (enshrines the side table); longer window alone (widens the race without closing it).
- **Design reversal mid-planning**: an earlier draft made the completion notification a consumption edge (auto-mark when the preview fit untruncated).
  The operator rejected it — a lifecycle fact decided by result length is ambiguous.
  Final contract: consumption is recorded only in responses to parent-initiated calls (`get_subagent_result`, foreground return, resume return); the nudge always instructs retrieval and never consumes.
  The memory cost (never-pulled agents pin sessions until the cap) is accepted and bounded.
- Verified non-breaking: `EvictedSubagent`/`listEvicted` are absent from the public `SubagentsService` surface; the widget needs no changes (its display policy is turn-age based, independent of eviction).
- Release recommendation: ship independently (not in any roadmap phase; `fix:` commits cut a release).
- Warning for the TDD session: step 6 is deliberately the large commit (the `EvictedSubagent` export removal forces manager + navigation + navigator + `index.ts` + tests together); steps 1–5 land every prerequisite first.
  Sweep tests must use `vi.advanceTimersByTimeAsync`, never `runAllTimersAsync` (`setInterval`).
