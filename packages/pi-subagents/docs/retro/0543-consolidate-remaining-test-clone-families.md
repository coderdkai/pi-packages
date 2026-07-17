---
issue: 543
issue_title: "pi-subagents Phase 20 Step 9: consolidate remaining test clone families"
---

# Retro: #543 — pi-subagents Phase 20 Step 9: consolidate remaining test clone families

## Stage: Planning (2026-07-17T01:28:26Z)

### Session summary

Planned Phase 20 Step 9.
Discovery surfaced that the issue's premise has shifted: fallow 3.2.0 now excludes `**/*.test.*` from duplication detection by default, so `fallow dupes --workspace @gotgenes/pi-subagents` reports zero test clones and the "9 in-package clone groups / 81 lines" baseline is no longer measurable.
The residual duplication in the three named files is the repeated system-under-test *act* call, which the `testing` skill explicitly forbids wrapping.
The operator chose (planning `ask-user`) the **narrow arrange-only tidy + metric update** direction, so the plan retires the health metric and lands only the one genuine describe-scoped arrange hoist.

### Observations

- fallow 3.2.0's `duplicates.ignoreDefaults` is all-or-nothing: `duplicates.ignore` only *adds* patterns, so the only way to re-include test files is `ignoreDefaults: false`, which drops every built-in framework ignore repo-wide across all six packages.
  Rejected as out of scope — restoring one package's metric isn't worth repo-wide clone noise.
- The arrange for all three suites was already factored by prior steps (#378, #379 in Phase 17; Step 8 / #542 in Phase 20) — `createManager`, `arrangeQueuedPair`, `manager-stubs.ts`, `mock-session.ts`, `makeModel`, `exploreConfig`.
  The one un-hoisted arrange is the `lifecycle observer forwarding` describe in `subagent-manager.test.ts` (two tests sharing an identical 3-line setup) — the only concrete tidy in the plan.
- The plan is deliberately docs-forward: the substantive deliverable is correcting the architecture health-metrics table (retire the stale, now-unmeasurable row) and recording Step 9's real outcome, not manufacturing test churn to hit a number the tool no longer produces.
- No follow-up issue filed — nothing is deferred; the direction is confirmed and the scope is closed.

## Stage: Implementation — TDD (2026-07-17T01:37:00Z)

### Session summary

Executed the two-step plan: one behavior-preserving refactor commit (hoist the `lifecycle observer forwarding` describe's shared arrange into a describe-scoped `beforeEach`) and one docs commit (retire the Phase 20 test-clone health-metric row with a rationale note, rewrite the Step 9 `Outcome:`/`Landed:`, mark Step 9 ✅ in the heading and Mermaid `S9` node).
No red→green cycle — the change is a refactor plus doc reconciliation.
Test count unchanged (996 pass); the two observer-forwarding tests kept their explicit acts.

### Observations

- The `tidy-first-assessor` found no preparatory tidying warranted — the target describe was already small and isolated, with the file's standard `let manager` / `afterEach(dispose)` scaffolding in place.
  Its scope boundary held (its rejected list stayed within the change's touched code).
- Minor deviation from the plan sketch: kept `factory` as a local `const` inside `beforeEach` rather than a describe-level `let factory` binding, since `factory` is never referenced outside the arrange — a scope-narrowing simplification the reviewer confirmed as legitimate.
- All 9 Phase 20 steps are now ✅.
  Full phase closeout (archiving the roadmap to `docs/architecture/history/` and flipping the phase heading to complete) is a separate later editorial commit per the Phase 19 precedent, deliberately not bundled here.
- The dated 2026-07-03 discovery-findings list (finding #6, "9 in-package clone groups") was left untouched — it is a historical snapshot, not a current-behavior metric.
- Pre-completion reviewer: PASS.
  No warnings; deterministic checks all green (`check`, `lint`, full `test` suite, `fallow dead-code`); Mermaid diagrams parse; no earlier phase-step invariant regressed.
