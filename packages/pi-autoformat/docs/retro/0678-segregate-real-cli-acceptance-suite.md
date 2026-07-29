---
issue: 678
issue_title: "pi-autoformat: real-CLI acceptance tests still flake at the 30 s RPC timeout"
---

# Retro: #678 — Segregate the real-CLI acceptance suite

## Stage: Planning (2026-07-28T23:31:13Z)

### Session summary

Planned the fix for the recurring real-`pi`-CLI acceptance flake that [#618]'s 30 s timeout raise failed to remove.
Measured the baseline before asking anything, which reframed the issue: the two acceptance files are 97% of the package's suite time and the long pole of the entire root run, and the 30 s budget gives the slower test only 2.5× headroom over its 12.1 s idle baseline.
The operator chose direction B (take the real-CLI tests off the default root path) implemented via Vitest `projects`, with a dedicated CI step and the root `test` script left as a full-workspace run.

### Observations

- Planning-time measurement changed the framing twice.
  First, excluding the two files drops the package suite from 20.3 s to 0.59 s and the root suite from 21.6 s to ~12 s — so segregation makes the root run *faster*, not merely more reliable, which was not obvious from the issue.
  Second, 12 CPU spinners slowed the acceptance tests by only ~15%, so the trigger is the concurrent module-import storm (`pi-permission-system` reports `import 40.55s` across 130 files), not CPU contention.
  An in-package fix therefore could not have worked.
- A measurement refuted something I had put in the `ask_user` preview as a benefit.
  I claimed `fileParallelism: false` would buy meaningful headroom on the acceptance project; measured back-to-back it costs ~6.5 s wall and buys ~1 s per test on a 10-core box.
  Kept it anyway for the 2–4 vCPU CI runner case, but recorded the local numbers in the plan so it is not mistaken for an unmeasured assumption.
- The operator bounced the first answer with two good questions ("when *would* we run them, and how do we avoid CI timeouts?") plus a new idea (targeted per-package suites).
  Grounding that idea was decisive: `pnpm --filter '...[origin/main]'` correctly selects one package on a dirty tree, but reports `No projects matched the filters` on a clean tree synced with `origin/main` — exactly the state at `/tdd-plan`'s green-baseline step, where it would pass vacuously.
  That verified trap is why the root `test` script stays a full-workspace run.
- Spiked both load-bearing mechanics against `vitest@4.1.8` and reverted them: inline `projects` inherit the root `resolve.alias` (the `#src`/`#test` imports pass under `--project unit`), and `vitest.config.ts` can import a sibling TS module, which lets one exported `ACCEPTANCE_FILES` constant feed both the config and a test.
- Found that Vitest 4.1.8's `retry` accepts `{ count, delay, condition: RegExp }`, which dissolves [#618]'s stated reason for rejecting retry-once ("adds control flow").
  Offered it as a real option; not chosen, but worth remembering as a lever that no longer costs what it used to.
- The design's one genuine hazard is a future real-CLI test file not added to `ACCEPTANCE_FILES`, silently rejoining the default path.
  Pinned with `test/project-partition.test.ts`, which derives the expected set by scanning for `runRpcSession(` rather than maintaining a second list.
  Verified the predicate is exact today: only the two acceptance files match, and `test/helpers/rpc.test.ts` imports just the two timeout resolvers.
- Rejected a config-shape assertion (reading `vitest.config.ts` back to check its globs) as coupling a test to Vite's config union types for a lower-value failure mode.
- Deliberately kept `test/fallback-acceptance.test.ts` in the unit project despite its name — it spawns no CLI.
  This is why the file list is explicit rather than a glob: `test/*acceptance*.test.ts` would have captured it.
- [#618]'s budget-ordering invariant lives in `test/helpers/rpc.test.ts`, which lands in the unit project and keeps running by default.
  Flagged in Invariants at risk because a careless partition would have moved the timeout tests into the segregated project alongside the code they describe.
- Scope stayed single-package despite the issue carrying both `pkg:pi-autoformat` and `pkg:pi-subagents` labels.
  Verified `pi-subagents` spawns no real CLI (only an `execSync` in `test/session/env.test.ts`); the label reflects where the flake was *observed*, not what changes.
- Release: ship independently — no `docs/architecture/` roadmap exists for this package.
  The `test:` and `ci:` commits are hidden changelog types; the `docs(pi-autoformat):` commit carries the release.

## Stage: Implementation — TDD (2026-07-29T00:07:57Z)

### Session summary

Landed all four planned TDD steps plus one follow-up correction: the `ACCEPTANCE_FILES` source of truth and its partition guard, the `unit`/`acceptance` Vitest project split, the dedicated CI step, and the docs.
Test count went from 19 files / 306 tests to 20 files / 308 tests under `test:all`, split 18 / 306 for the default `unit` project and 2 / 2 for `acceptance`.
Root `pnpm run test` dropped from 21.6 s to 16.2 s, and `pi-autoformat` is no longer the long pole.

### Observations

- The red step caught a real defect in the plan's sketched predicate: `test/project-partition.test.ts` matched *itself*, because the guard names the marker string `runRpcSession(` in a constant.
  Fixed by exempting the guard file explicitly rather than switching to an import-shaped regex — a call-site substring cannot be broken by reformatting, whereas a regex that under-matches would leave a real-CLI file in the `unit` project with the guard still green (a false green is the one failure mode a guard must not have).
- The plan predicted root `pnpm run test` would fall to ~12 s; the measured result is 16.2 s.
  The prediction assumed `pi-permission-system`'s 11.6 s would simply become the long pole, but it takes 12.8 s once it is no longer competing with `pi-autoformat`, and pnpm's per-package startup across nine packages adds the rest.
  Treated as a prediction refinement rather than a missed target: the Goals are about determinism by construction, not a speed number, and no design decision hung on the figure.
  Recording it here because the plan's predicted-effect table still reads "~12 s".
- Verified the guard is not vacuous by adding a throwaway test file that calls `runRpcSession(...)` and confirming the guard fails and names it.
  The first attempt at this probe was a false negative of my own making — I wrote `void runRpcSession;`, which contains no call and correctly did not trip the predicate.
  Worth remembering: when probing a guard, make the probe match the guard's actual contract, or you "verify" nothing.
- The `tidy-first-assessor` returned "no preparatory tidying warranted" and was right — every modified file was either brand new or under 20 lines.
  It also independently confirmed the grep predicate was safe against the current import layout, which is the question I had flagged for it.
- Pre-completion reviewer: **PASS**, with two WARNs.
  The first (the plan's stale "~12 s") is addressed by this retro entry.
  The second was a genuine catch: my code comment claimed the call-site predicate "cannot silently under-match," which is false for an aliased import (`runRpcSession as run`).
  Landed `7a570dd6` to state the gap and its remedy instead of promising a guarantee the code does not provide.
- The docs commit also corrected two pre-existing stale claims in the sections it was already rewriting: `pnpm run typecheck` (no such script — it is `pnpm run check`) and a "no workflow changes needed" bullet that the new CI step supersedes.
- The CI step's real verification is deferred to ship time by design.
  It is the one part of this change that cannot be confirmed locally, and a mistake there would silently drop real-CLI coverage entirely — confirm at `/ship-issue` that the `Real-CLI acceptance tests (pi-autoformat)` step appears and reports 2 passing tests.

[#618]: https://github.com/gotgenes/pi-packages/issues/618
