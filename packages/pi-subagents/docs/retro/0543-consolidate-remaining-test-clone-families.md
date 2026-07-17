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
