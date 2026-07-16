---
issue: 540
issue_title: "pi-subagents Phase 20 Step 6: table-driven settings handler"
---

# Retro: #540 — pi-subagents Phase 20 Step 6: table-driven settings handler

## Stage: Planning (2025-06-13T00:00:00Z)

### Session summary

Produced a numbered plan to rewrite `SubagentsSettingsHandler.handle` as a table-driven loop over a module-private `NumericSettingDescriptor` array, collapsing three copy-pasted select→input→parse→validate→apply→notify branches into one pass.
The change is refactor-only with no behavior change; the operator authored the issue and its proposal was unambiguous, so the `ask-user` gate was skipped.
Release is `ship independently` (roadmap tag), noting a `refactor:` commit is a hidden changelog type and batches into the next release rather than cutting one.

### Observations

- The key correctness risk is the validation comparison direction: `parseInt("abc", 10)` is `NaN`, and `NaN >= minimum` is `false`, so the original `if (n >= 1)` warns on non-numeric input.
  Inverting to `if (n < minimum)` would silently apply `NaN`.
  The plan keeps `n >= descriptor.minimum` and lands a non-numeric-input regression test first (step 1) to pin it before the refactor.
- Only default max turns has display irregularities (`?? "unlimited"` in the select, `?? 0` in the input default); captured as descriptor callbacks so the loop stays uniform.
- The three label prefixes (`Max concurrency`, `Default max turns`, `Grace turns`) are mutually non-overlapping, so `find(d => choice.startsWith(d.label))` reproduces the original `if/else if` dispatch exactly.
- Existing tests already cover all three settings comprehensively and stay unchanged — this is a refactor-under-green, so TDD is: `test:` (pin NaN rejection, green against current code) then `refactor:` (rewrite, suite stays green).
- Design-review checklist found nothing to act on: no shared-interface, layer-wiring, or dependency-width change; descriptor callbacks read a single accessor each with no LoD/output-argument smell.

## Stage: Implementation — TDD (2025-06-13T00:20:00Z)

### Session summary

Executed both TDD Order steps: a non-numeric-input regression test (green against the pre-refactor code), then the table-driven rewrite of `SubagentsSettingsHandler.handle` behind a module-private `NumericSettingDescriptor` array.
Added a third `docs:` commit marking Phase 20 Step 6 `✅` in `architecture.md` (heading and Mermaid node) with a `Landed:` paragraph, per the `/tdd-plan` template's roadmap-completion step.
Test count: `pi-subagents` 974 → 975 (net +1, the regression test); full monorepo suite, `tsc --noEmit`, root `lint`, and `fallow dead-code` all green.

### Observations

- The `tidy-first-assessor` found no preparatory refactoring warranted — both target files were already shaped for the change, and the plan's own step ordering (pin-test-first, then rewrite) already embodied the Tidy First move.
- The plan's Non-Goals said the architecture doc's Step 6 `Outcome:` bullet was "outside this plan's scope," but the `/tdd-plan` template's post-implementation step explicitly requires marking a completed numbered roadmap step with `✅` on both the heading and its Mermaid node.
  Reconciled by treating the template as authoritative (per AGENTS.md's stale-prompt-expansion guidance) and adding the doc update as a fourth commit, following the exact `Landed:`-paragraph pattern used by Steps 2–5.
- Verified the plan's quantitative target via `fallow inspect --file` and `fallow health --format json` (file-level `total_cyclomatic: 19` / `total_cognitive: 7` across 13 small functions, `crap_above_threshold: 0`) plus an empty `fallow health --targets --format json` match — `subagents-settings.ts` no longer appears in fallow's hotspot or refactoring-targets list, confirming "off the fallow high-complexity list" without relying on the human-readable output.
- No deviations from the plan's design: the `n >= descriptor.minimum` comparison direction was preserved exactly as specified, and the regression test added in step 1 caught nothing (it passed immediately, as predicted) — it exists purely as a forward guard.
- Pre-completion reviewer verdict: **PASS**.
  All deterministic checks, doc updates (forward and reverse), code design, test artifacts, Mermaid diagrams, dead-code, and cross-step invariants (Phase 19 Step 3 / #447's settings-surface contract) came back clean; no follow-up issues named.
