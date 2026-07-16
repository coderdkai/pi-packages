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
