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

## Stage: Implementation — TDD (2026-07-20T00:51:05Z)

### Session summary

Executed all 8 TDD steps plus two follow-up commits (a `style:` unused-import drop and a `docs:` stale-comment refresh), landing consumption-aware session retention.
The `tsc`/lint/`fallow` gate is green; the full pi-subagents suite grew from 996 to 1036 tests (+40).
The pre-completion reviewer returned PASS.

### Observations

- The `tidy-first-assessor` recommended **no** preparatory commits — the target files already carried the conventions the change extends (delegating getters, rest-spread test fixtures, the `NUMERIC_SETTINGS` descriptor table, the pure notification/report helpers).
  Its Rejected list correctly declined the plan's own out-of-scope `status === "running" || "queued"` de-duplication.
- Step 3 (settings) was the widest test touch: adding retention to `snapshot()` broke six existing exact-shape assertions (`toEqual`), all updated in the same commit per the fold-test-updates rule.
- One TypeScript catch the `tidy-first` note foresaw only partially: `consumedAt` flows through `make-subagent.ts`'s `...stateOverrides` at runtime, but `TestSubagentOptions` is an explicit interface, so `tsc` rejected the unknown key until the field was declared there (caught by `pnpm run check`, not vitest).
- Deviation from the plan: `manager-stubs.ts` was listed as a touch point ("drop notification stubs from get-result wiring") but needed no change — it never wired the notification dependency.
  Non-material.
- The Bug-1 race tests migrated cleanly from `notifications.consume(id)` to `record.markConsumed()`: the schedule-time guard and the fire-time re-check both read `record.consumed`, preserving the pinned nudge-suppression invariant.
- Two flakes surfaced in the unrelated `pi-autoformat` package during `pnpm run test`; both passed on re-run.
  Not related to this change.
- Pre-completion reviewer: PASS.
  One non-blocking WARN (two stale `evicted`-terminology comments in `session-navigation.ts` / `session-navigator.ts`) fixed immediately as a `docs:` commit before finishing.
- No follow-up issues filed — the plan's Open Questions (`SubagentRecord.consumedAt` exposure, service-level `consumeResult`) are explicitly deferred until a real consumer surfaces.

## Stage: Final Retrospective (2026-07-19T23:59:00Z)

### Session summary

A single-session, design-heavy planning session for #617, conducted as an extended Socratic dialogue rather than a straight-through plan.
The operator repeatedly pushed on the design — first on the *why* of cleanup, then on solution options, then rejecting disk-read, and finally reversing an auto-consume notification design — before the plan and planning-stage retro landed (`8e7434b2`, `e3b9781a`).

### Observations

#### What went well

- **Disk-read rejected with a correctness argument, not just taste.**
  When the operator called disk-sourced results "two wrongs to make a right," I found the hard backing: `Subagent.completeRun` appends a workspace-disposal suffix to the result that never reaches the session JSONL, so a disk re-derivation would provably diverge (and re-implement `getLastAssistantText` as a second algorithm).
  That turned an intuition into a recorded non-goal with a concrete reason.
- **Consumption-as-domain-state synthesis connected three independent smells.**
  The shadow `consumed` `Set` in `NotificationManager`, the `EvictedSubagent` side table, and the architecture doc's already-named "homeless `notification.resultConsumed` field" (Phase 17 motivation prose) were cross-referenced into one fix — the design was promoting state the codebase had already diagnosed as misplaced.
- **The third-party `ask-user` gate did its job.**
  #617 was filed by `dzervas`; the gate surfaced the consumption-aware-vs-timer-only decision cleanly, and the operator engaged at the design level rather than rubber-stamping the issue's literal asks (longer window, insta-cleanup).

#### What caused friction (agent side)

- `premature-convergence` — I designed the completion notification as a *consumption edge*: auto-mark the result consumed when its preview fit untruncated in the nudge, presented in the plan draft as "load-bearing, not polish."
  The operator rejected it — a lifecycle fact decided by result length is ambiguous, and it has the runtime consume *on the caller's behalf*, contradicting the caller-consumes philosophy the operator had stated two turns earlier ("all function calls should return some result, and callers should consume the result").
  I had the contract in hand and optimized against it instead of surfacing the tension as an explicit choice.
  Impact: one full design-section draft (push edge, `ResultPreview`/`buildResultPreview`, four consumption edges) rewritten via a 12-block `Edit` down to three parent-initiated edges — caught pre-commit, so no git-history rework and no follow-up commits.

#### What caused friction (user side)

- The always-pull contract was latent in the operator's early caller-consumes remark but only became a hard constraint after the auto-consume draft existed.
  Opportunity, not criticism: naming "the parent must always pull" as a firm constraint at the first `ask-user` gate would have pre-empted the push-consume draft entirely.
  Low-stakes here because the reversal landed before any commit.

### Diagnostic details

- **Model-performance correlation** — no subagents were dispatched; all exploration was direct `Read`/`grep`/`colgrep` in the main session.
  Appropriate for a planning session — the tidy-first and pre-completion subagents belong to the later `/tdd-plan` stage.
- **Feedback-loop gap analysis** — `rumdl check` ran before each of the two markdown commits (plan, retro), the correct incremental verification for a docs-only session; no gap.
- **Escalation-delay / unused-tool** — no rabbit-holes or repeated-error sequences; nothing to flag.
