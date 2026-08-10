---
issue: 704
issue_title: "`cleanupWorktree` silently discards work when the fallback commit fails"
pr: 705
---

# Retro: #704 — `cleanupWorktree` silently discards work when the fallback commit fails

## Stage: PR Review (2026-08-10T17:30:07Z)

### Session summary

PR [#705] from @AndersBennedsgaard fixes a confirmed data-loss defect: `cleanupWorktree`'s `catch` block force-removes the worktree and returns `{ hasChanges: false }` whenever the safety-net commit throws, so an agent's work vanishes and the caller is told nothing changed.
The PR is small, idiomatic, fully green, and ships tests that genuinely fail without the fix — but it stops at "preserve on failure" and leaves the motivating case (a mutating formatter pre-commit hook) still failing on every run.
Operator direction: **adopt the capability with our own simplified design** via `/plan-issue #704`, adding a `--no-verify` retry and a discriminated-union result, using [#705] as reference rather than the merge target.

### Evaluation

Defect verification (against current `main`, base `4482a5db`):

- Reproduced with a scratch Vitest exercising `#src/worktree` directly.
  With a pre-commit hook that mutates a file and exits non-zero, `cleanupWorktree` returned `{"hasChanges":false}`, the worktree directory was force-removed, and no branch was created.
- Not already fixed.
  `git log --oneline -S "removeWorktree on cleanup error"` shows the destructive `catch` present since the package was scaffolded (`9a7dcfc5`) and inherited from the pi-subagents core before that (`049f4891`).
  The reporter is on `0.2.3`, which is the current version — there is no upgrade answer here.
- Real boundary confirmed: `src/worktree.ts` (the outer `catch` in `cleanupWorktree`) plus `src/workspace-provider.ts` (`WorktreeWorkspace.dispose` returning `undefined`, which is what makes the loss *silent*).
  The PR touches exactly this path.
- One correction to the report.
  The issue and the PR's plan both assert "no dangling commit, no dangling blob, `git fsck` finds nothing."
  That is inaccurate for the motivating case: our own `git add -A` succeeds and writes the tree and blobs into the shared object database before `git commit` fails, so `git fsck --lost-found` surfaces a dangling tree from which the agent's file is fully recoverable (verified by `git cat-file -p`).
  The work is forensically recoverable by an expert until the next `git gc --prune`.
  The user-visible symptom is identical, so the defect stands, but the severity framing in the issue is overstated.

Checks run in a scratch worktree (torn down afterwards): `pnpm run check` passed, `pnpm run lint` passed (biome, eslint, and `rumdl` all clean), and `pi-subagents-worktrees` passed 28/28.
Reverting only `src/` to `main` and re-running the PR's tests produced 2 failed / 26 passed, confirming the tests fail without the fix.

What is valuable:

- The diagnosis and the boundary choice are correct, and the fix is genuinely right-sized at roughly nine lines of source across two files.
- `error?: string` on `WorktreeCleanupResult` is actually consumed at its single call site in `src/workspace-provider.ts`, so it is not speculative generality, and `WorktreeCleanupResult` has exactly one consumer, so nothing is threaded over-wide.
- Convention fit is good: it reuses the existing result envelope, `debugLog`, and result-addendum shape instead of inventing a divergent one, and checks `error` before `hasChanges` so precedence is explicit.
- The contributor plainly ran our own `/plan-issue` and `/tdd-plan` templates; commit grammar and `Refs #704` usage match our standards.

What we would change:

- The motivating case is still broken, and this is the substantive finding.
  The PR's plan declares `--no-verify` an explicit non-goal, but with a mutating formatter hook cleanup now fails on *every* subagent run that produced changes, leaking both a `tmpdir` worktree and a registered `git worktree list` entry each time.
  `pruneWorktrees` (called from `src/index.ts` at startup) reclaims none of them — verified: `git worktree prune` only drops administrative entries whose directory is already gone.
  So the PR as written converts "silent loss, once" into "unbounded worktree accumulation, forever, plus an error addendum on every run."
  A `git commit --no-verify` retry was verified to succeed cleanly in exactly this scenario.
- `path` becomes triple-purposed: on the success path it names a worktree that was just removed (a pre-existing oddity on `main`), and on the failure path one that still exists.
  `{ hasChanges, branch?, path?, error? }` is drifting toward a shape better expressed as a discriminated union — `{ outcome: "clean" } | { outcome: "committed", branch } | { outcome: "failed", path, error }` — which is cheap to adopt given the single consumer.
- The new tests assert `existsSync(wt.path)` rather than the property that actually matters, namely that the agent's file content survived in the preserved worktree.
  Both also hand-roll the same failing-hook setup and place teardown inline in the `it` body, so a failed assertion leaks a worktree into the next test.
  A shared hook-installer helper plus `afterEach` teardown would fix both.

### Decision and attribution

Direction: **adopt the capability, plan a simplified design**.
[#705] is reference material, not the merge target; the work is planned fresh via `/plan-issue #704`.

Agreed scope:

- Preserve the worktree instead of force-removing it when the changes-exist path throws, and surface the failure through `dispose` so the agent sees it.
- Retry the safety-net commit with `--no-verify` after a hook rejection, and preserve the worktree only if that retry also fails.
  This makes the motivating formatter-hook case land the work on a branch and avoids the worktree-accumulation regression, while keeping preservation as the backstop for genuine errors.
- Model the result as a discriminated union rather than adding a fourth optional field to `WorktreeCleanupResult`.
- Tests must assert content survival in the preserved worktree, not merely directory existence, and should share a hook-installer helper with `afterEach` teardown.

Non-goals:

- No retry logic beyond the single `--no-verify` attempt.
- No change to `createWorktree` or `pruneWorktrees`.
- No automatic reclamation of preserved worktrees; recovery stays manual.
- We are not importing the contributor's `docs/plans/0704-*.md` or `docs/retro/0704-*.md`; our own `/plan-issue` run authors those, partly because the contributor's plan repeats the incorrect `git fsck` claim corrected above.

Attribution — required on every implementation and docs commit for this issue, as the last line of the body after a blank line:

```text
Co-authored-by: Anders Bjørnkjær Bennedsgaard <abbennedsgaard@gmail.com>
```

The ship-stage close comment on [#705] must thank @AndersBennedsgaard by name, link the implementing SHA(s), and note that the `--no-verify` retry was added on top of their diagnosis.
Reference the PR as `Refs #705`, never `Closes #705`.

[#705]: https://github.com/gotgenes/pi-packages/pull/705
