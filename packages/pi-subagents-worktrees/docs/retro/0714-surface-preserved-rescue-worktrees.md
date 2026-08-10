---
issue: 714
issue_title: "Surface preserved rescue worktrees at session start"
---

# Retro: #714 — Surface preserved rescue worktrees at session start

## Stage: Planning (2026-08-10T19:02:40Z)

### Session summary

Produced `docs/plans/0714-surface-preserved-rescue-worktrees.md`, planning the visibility loop [#704] left open in six steps: a live-worktree registry, path-heuristic discovery, provider wiring, a `session_start` toast, a `/subagents-worktrees` command that lists and (after confirmation) removes a preserved worktree, and the README update.
The issue explicitly left the surface undecided, so the operator answered a three-part `ask_user` gate: toast-only notice, slash command with confirmed removal, path heuristic for detection.
Every non-obvious mechanism in the design was measured in this session rather than assumed.

### Observations

- **The realpath mismatch would have shipped a feature that finds nothing.**
  `git worktree list --porcelain` prints resolved paths (`/private/var/…` on macOS) while `os.tmpdir()` returns `/var/…`, so the obvious `startsWith(tmpdir())` filter matches zero worktrees on the reporter's own platform.
  Measured with a scratch repo; the plan pins it with an assertion on returned paths rather than a count, because a count assertion would pass against the wrong strings.
- **"Once per process" is not achievable, so the notice is once per session.**
  Pi's loader calls the extension factory per session and `jiti` runs with `moduleCache: false`, so neither closure nor module state survives across sessions.
  The issue's title already says "at session start", so this is a non-issue — but the first design sketch had a `let reported` flag that would silently have been per-session anyway.
- **Child sessions were a real noise risk with a free mitigation.**
  `session_start` fires for every subagent session and its `reason` is `"startup"`, so the reason cannot identify a child.
  Pi substitutes `noOpUIContext` when no UI is bound, so a child's toast goes nowhere; guarding on `ctx.hasUI` both suppresses the dead toast and keeps a pointless `git worktree list` out of every child.
- **The path heuristic needs two false-positive guards, not one.**
  A live child's worktree looks exactly like a preserved one, hence the `ActiveWorktrees` registry.
  Less obvious: a session launched *inside* a rescue worktree during recovery would otherwise offer to delete the ground it stands on.
- **Rejected alternatives, with the reason.**
  `git worktree lock --reason` was measured to work well — the reason shows in `--porcelain` and the lock defeats even `remove --force` — but it only marks worktrees preserved after this ships, and a tmp-reaped locked entry survives `prune` as permanent repo cruft.
  A marker file carries richer metadata but adds a write on the failure path.
  The operator chose the heuristic, which has the compensating virtue of finding worktrees preserved by the already-shipped v0.2.4.
- **An agent tool was rejected in favor of a slash command.**
  Both let the user act without leaving the session; only one puts a destructive `git worktree remove --force` within the model's reach.
- **The existing "no-ops without the subagents service" test is load-bearing.**
  It asserts `pi.on` is never called, so the new notice and command must register *after* the service check — recorded as invariant 1 rather than discovered during implementation.
- Session-start cost measured at ~9 ms for one `git worktree list --porcelain`, so no caching or debouncing is planned.

## Stage: Implementation — TDD (2026-08-10T19:51:35Z)

### Session summary

Landed the plan's six steps plus two `test:` commits — the tidy-first `makeProvider` extraction and one fallow fixup — for eight commits in all.
A session with a UI now warns at startup about rescue worktrees still on disk, and `/subagents-worktrees` lists them on demand and removes one behind an explicit confirmation.
Package test count went from 31 to 62; the pre-completion reviewer returned **PASS** with no warnings.

### Observations

- **The tidy-first assessor corrected the plan's own count.**
  The plan said six inline `new WorktreeWorkspaceProvider(...)` constructions would break when the constructor gained a registry argument; the assessor counted seven.
  Extracting `makeProvider` first meant step 3 changed one signature instead of seven.
- **fallow loses a reference through a destructured object-literal property.**
  `makeProvider` initially returned `{ provider, live }`, and `pnpm fallow dead-code` then reported `WorktreeWorkspaceProvider.prepare` as an unused class member — a finding bisected to that exact commit and absent at the pre-change baseline.
  Returning the instance directly and taking the registry as a parameter restored the reference.
  Worth remembering: a test helper that wraps a class instance in an object literal can manufacture a dead-code finding for a method that is plainly called.
- **Rule 3 ("under the resolved temp root") needed a test location outside `tmpdir()`.**
  Every fixture in this package lives under `tmpdir()`, so the exclusion half of that rule had nowhere to be exercised.
  The test creates its scratch worktree under `node_modules/.pi-wt-outside` — outside the temp root on every platform, and gitignored, so a leftover from a failed run never reaches the working tree.
- **The inclusion half of the realpath rule is pinned by an ordinary test.**
  "Reports the rescue worktrees left on disk" asserts the resolved paths; comparing against an unresolved `tmpdir()` makes it return `[]` on macOS, so the planning measurement is now a regression test rather than a note.
- **`formatPreservedNotice` was written in step 2 and immediately removed.**
  It arrived with the module but belonged to step 4, where its tests live; deleting it and re-adding it one step later kept every export consumed and tested in the commit that introduced it.
- **Deviations from the plan.**
  `AGENT_WORKTREE_PREFIX` is now exported from `src/worktree.ts` so `createWorktree` and the scan share one `pi-agent-` literal — the plan did not list it.
  `test/support/git-fixture.ts` was left untouched; the existing `initGitRepo`/`installPreCommitHook`/`lockGitIndex` helpers covered the new suites.
  Two `test:` commits were added beyond the plan's six steps.
- Pre-completion reviewer: **PASS**, no WARN findings.
  It independently verified all four Goals against the code, the commit grammar, and that the two Open Questions were deliberately-deferred alternatives rather than unfiled follow-ups.

[#704]: https://github.com/gotgenes/pi-packages/issues/704
