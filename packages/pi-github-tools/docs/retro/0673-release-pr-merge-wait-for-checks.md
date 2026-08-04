---
issue: 673
issue_title: "release_pr_merge fails on a still-running check instead of waiting for it"
---

# Retro: #673 — release_pr_merge fails on a still-running check instead of waiting for it

## Stage: Planning (2026-08-04T20:26:58Z)

### Session summary

Planned `packages/pi-github-tools/docs/plans/0673-release-pr-merge-wait-for-checks.md`: turn `mergeReleasePR`'s single-shot merge-state read into a bounded poll loop that waits out in-progress checks, backed by a new pure `src/lib/merge-state.ts` classification module.
Measured the real check timings on the last six release PRs before framing the design, then used a four-question `ask_user` gate to settle mechanism, empty-rollup behavior, `UNKNOWN` handling, and doc-cleanup scope.
Four TDD steps, no follow-up issues filed.

### Observations

- **Measurement overturned a premise.**
  Every ship prompt in the repo asserts that release-please PRs get no CI runs because the default `GITHUB_TOKEN` does not trigger workflows.
  Measured against PRs 685, 682, 679, 677, 672, and 668: all six had a real `check` run, starting 5–11 s after PR creation and taking 1 m 49 s – 2 m 29 s.
  The "no checks" case is now the exception, not the norm — which is exactly why the `UNSTABLE` friction keeps recurring.
- **The `SKIPPED` trap.**
  The `release-please` and `publish` jobs conclude `SKIPPED` on every release PR.
  A naive "conclusion is not `SUCCESS` implies failure" classification would have hard-failed every merge the tool exists to perform.
  This was only visible because the rollup was read from live PRs rather than reasoned about abstractly.
- **The issue's follow-on-cleanup claim does not survive the operator's choice.**
  The issue predicted the `gh pr merge --rebase` fallback "can go away entirely".
  The operator chose to keep erroring on an empty rollup (with a new `reason:` line) rather than auto-merging, so the fallback stays; only the manual `gh pr checks --watch` wait runbook is removed.
  The plan states this divergence explicitly so the doc step is not written against the issue's prediction.
- **Rejected `gh pr checks --watch`** (the issue floated it as a one-subprocess shortcut): `runCommand` buffers stdout until exit, so nothing would stream to `onProgress`; there is no timeout flag; and exit code `1` conflates "a check failed" with "no checks reported" — the exact distinction the issue exists to draw.
- **`UNKNOWN` was added to scope** on the operator's call, conditioned on the timeout bound.
  `release_pr_find` returns the instant a PR appears, so `mergeable: UNKNOWN` is the same race as the check race, from the same cause.
- Related open issue [#564] (repeated run/job status derivation across the `ci` modules) is deliberately not folded in: this change adds a site with GitHub's upper-case GraphQL enum vocabulary, while [#564] covers six lower-case REST-vocabulary sites.
  Noted for [#564] to absorb later.
- The change gives `formatProgress`'s `prefix` parameter its first production caller; today only a test exercises it.

[#564]: https://github.com/gotgenes/pi-packages/issues/564

## Stage: Implementation — TDD (2026-08-04T20:50:16Z)

### Session summary

Implemented the plan in 4 TDD cycles plus a docs commit, preceded by 2 Tidy-First preparatory `refactor:` commits (`performMerge`/`blockedResult` extraction) recommended by the `tidy-first-assessor`.
`mergeReleasePR` is now a bounded 10 s-interval poll loop dispatching on a new pure `classifyMergeState` (in `src/lib/merge-state.ts`) that normalizes GitHub's `statusCheckRollup` into the existing `CIJob` vocabulary and reuses `formatProgress`.
Test count in `pi-github-tools` went from 82 to 112 (+30: 24 in the new `merge-state.test.ts`, 6 net new in `release.test.ts`); full monorepo suite stayed green throughout (2672 + 1135 + others, no regressions).

### Observations

- **Tidy-First paid off exactly as predicted.**
  The assessor's two recommended extractions (`performMerge`, `blockedResult`) landed as pure no-behavior-change moves verified by the *existing* tests, before the loop rewrite.
  The subsequent feature commit (`feat: wait out in-progress checks`) was then a clean diff: wrap in a loop, classify, switch — no subprocess-call relocation mixed in.
  This also retired the plan's own named risk (signal relay dropping during the `performMerge` move) *before* the riskier rewrite landed on top.
- **The `FAILING_STATUS_CONTEXT_STATES` false start.**
  First draft of `classifyMergeState` declared a separate `FAILING_STATUS_CONTEXT_STATES` set for `StatusContext`'s `FAILURE`/`ERROR` states, then discovered `toCIJob` already normalizes `StatusContext`'s `state` into the same lowercase `conclusion` vocabulary as `CheckRun` — so the separate set was dead weight requiring a `void` no-op to silence the unused-variable lint.
  Caught it before committing (the `void FAILING_STATUS_CONTEXT_STATES;` line was a smell in its own right) and merged "error" into the single `FAILING_CONCLUSIONS` set instead — five lines simpler, same coverage, no lint workaround needed.
  Worth naming: a hand-rolled unused-variable suppression during implementation is a signal to re-derive the normalization, not to silence the linter.
- **Pre-completion reviewer caught a real gap.**
  The plan's "Invariants at Risk" section explicitly committed to a test asserting `sleep` receives the `signal` during the new wait path.
  That assertion was never actually written — the abort test asserted the *aborted result*, not that `sleep` was called with the real signal.
  Reviewer returned WARN with this single finding; fixed by adding `expect(mockSleep).toHaveBeenCalledWith(10000, controller.signal)`, folded into the original feature commit via `git commit --fixup` + `git rebase -i --autosquash` (unpushed, so no history-cleanliness cost) rather than a `test:` commit.
  The gap was real but non-blocking: production code already threaded the signal correctly, so this was a coverage hole, not a behavior bug.
- **Docs step touched both passages in all three prompts as the plan anticipated.**
  `ship-issue.md`, `land-worktree.md`, and `ship-no-issue.md` each state their `UNSTABLE` handling twice (a numbered step + a Constraints bullet); both were updated together in each file, verified by grep afterward — no stale `UNSTABLE` references remain in any living doc (historical retro entries in other packages that describe the old manual runbook were left alone, correctly, as session logs).
- No deviations from the plan's TDD Order or Module-Level Changes list; every planned file was touched, nothing extra.
- Pre-completion reviewer: WARN → fixed → all deterministic checks (`pnpm run check`, `pnpm run lint`, `pnpm run test`, `pnpm fallow dead-code`) pass after the fix.
