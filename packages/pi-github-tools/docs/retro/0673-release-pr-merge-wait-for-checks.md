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
