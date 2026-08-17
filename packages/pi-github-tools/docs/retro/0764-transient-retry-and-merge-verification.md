---
issue: 764
issue_title: "pi-github-tools: release_pr_merge has no transient-error retry, and reports failure without checking whether the merge landed"
---

# Retro: #764 — Transient-error retry and merge-state verification

## Stage: Planning (2026-08-17T20:37:30Z)

### Session summary

Read the issue (filed by the operator out of the #732 ship incident), the `pi-github-tools` source, the #673 plan, and the #732 retro, then put three direction questions to the operator.
The answers set the scope: a shared retry helper across all read-only `gh` calls plus the `aborted: cancelled by user` misreport fix; a verified-merged outcome that completes the job; and report-only (no auto-retry) when verification says the PR did not merge.
Wrote `packages/pi-github-tools/docs/plans/0764-transient-retry-and-merge-verification.md` — five TDD steps, with the merge-state verification landing as early as its dependency on the retry helper allows.

### Observations

- Two facts were measured at planning time rather than inferred.
  `gh api 'repos/{owner}/{repo}/pulls/763'` expands the `{owner}`/`{repo}` placeholders from the local repo, so verification needs no `detectRepo()` call and no new tool argument, and it returns `merge_commit_sha` — so a verified-merged outcome reports a real SHA.
- The backoff curve is taken from `@octokit/plugin-retry` (3 retries, polynomial 1 s base → 1 s, 4 s, 9 s) rather than invented, and GitHub's "auto-retry idempotent operations only" guidance is the stated reason mutations stay opt-out.
  The package's existing `findRetryDelay` was deliberately **not** reused: it is a polling curve (5 s base, 30 s cap, unbounded attempts), which is the wrong shape for a bounded transient retry.
- Retry is composed as a separately named `ghJsonRetrying` rather than folded into `ghJson`, so the two mutation call sites (`gh pr merge`, `gh issue close`) cannot acquire retry by accident and the opt-in is greppable.
- Timeout accounting is a real hazard the design had to answer: retry backoff happens outside each loop's own `sleep`, so without folding `delayMs` into `elapsed` via `onRetry`, a sustained incident could add roughly seven unaccounted minutes at the 300 s default.
- Four existing abort tests pass only because of the bug being fixed — they never abort their controller and rely on the blanket `catch {}`.
  The plan spells out the rewrite (abort from inside the mocked `sleep` rejection), since aborting before the call would exercise the loop's top-of-cycle check instead.
- Verification runs on **any** merge-call failure, not just a transient-looking one: classification is a heuristic, the REST read is ground truth, and one path is simpler than two.
- Found while grepping doc touch points: `.pi/skills/package-pi-github-tools/SKILL.md`'s module tree never gained `merge-state.ts` from #673.
  Folded that correction into this plan's doc step.
- No follow-up issues filed.
  Git-side retry and a configurable pattern list are named in Open Questions as deliberately deferred, not as work to track.
