---
issue: 655
issue_title: "deriveApprovalPattern reads node:path ambiently instead of the injected PathFlavor"
---

# Retro: #655 — `deriveApprovalPattern` reads `node:path` ambiently instead of the injected `PathFlavor`

## Stage: Planning (2026-08-18T04:09:10Z)

### Session summary

Traced all five production call sites of `deriveApprovalPattern` and found they all pass `AccessPath.value()`, and that every `AccessPath` in the package is constructed by `PathNormalizer` — which already holds the flavor.
Measured both the current and proposed derivation algorithms against `path.win32` / `path.posix` and found the issue understates its own consequence 2: the mixed-separator output is not merely incoherent, it silently widens a directory-token session approval to the parent directory on win32.
Wrote `docs/plans/0655-approval-pattern-flavor-injection.md` with seven lift-and-shift cycles.

### Observations

- Flavor injection alone does **not** fix the win32 output.
  `win32.dirname("/dev/null")` is `/dev` while `win32.sep` is `\`, so a win32-flavored version of today's algorithm still emits `/dev\*`.
  The separator has to come from the value, not the platform default — which the win32 flavor supports for free, since it counts both `/` and `\` as separators.
- Replacing the four branches with one rule ("value up to and including its last separator, plus `*`") is **measured byte-identical on POSIX** across all 10 values including every case the suite pins, and fixes four win32 rows.
- The widening is reachable, not theoretical: `PathNormalizer.forBashToken` routes a win32 non-mount POSIX absolute to `forLiteral`, which preserves a trailing `/` ([#533]), so `grep -r x /tmp/logs/` on a Git Bash host derives `/other/project\*`-shaped patterns.
  Under [#653]'s symmetric fold that pattern matches siblings of the approved directory.
  The `/foo` case fails the other way — `/\*` folds to `\\*` and matches nothing, so the grant is inert.
- Operator chose `PathNormalizer.approvalPatternFor(accessPath)` over `AccessPath.approvalPattern()`, and re-typed the migration commit from the roadmap's `refactor:` to `fix:` once the win32 widening was surfaced.
  Step 8's `Outcome:` and the `Release batches` line in `architecture.md` need that correction in the doc commit.
- The per-tool gate takes the **product**, not the collaborator: `ToolCallGatePipeline.resolvePerToolCheck` already holds both the normalizer and the `AccessPath`, so it derives the pattern once and hands `describeToolGate` a `ToolPathAccess` pair.
  This keeps `pattern-suggest.ts` free of path-domain imports and touches 2 of 17 `describeToolGate(` test call sites instead of all 17.
  The two bash gates take the normalizer itself, because entry selection happens inside them and the pipeline cannot pre-derive.
- `suggestSessionPattern`'s `"path"` / `"external_directory"` arms are unreachable in production (its one caller passes `"bash"` or a tool name), and its path-bearing arm becomes unreachable once `tool.ts` routes through the new entry point.
  Removing them was an explicit operator decision.
  `buildLabel`'s corresponding arms were already unreachable before this change and are left alone — folding that cleanup into [#604] is cheaper than a standalone issue.
- Sibling issue [#604] (`sessionApprovalScope` config knob) targets this same derivation; it lands more easily on a flavor-injected version, so no coordination is needed beyond noting it in Non-Goals.

## Stage: Implementation — TDD (2026-08-18T04:43:43Z)

### Session summary

Landed all seven planned TDD cycles plus one tidy-first prep commit and one post-review test cleanup — nine commits.
`deriveApprovalPattern` moved from `session-rules.ts` (ambient `node:path`) to a flavor-parameterized leaf `src/path/approval-pattern.ts`, reached through the new `PathNormalizer.approvalPatternFor`; `PathFlavor` gained `lastSeparatorIndex`; the five call sites migrated and `pattern-suggest.ts` split into a text and a path entry point.
Test count went 3136 → 3162 (+26) with all 145 pi-permission-system files green; the quantitative target (`grep -c "node:path" src/session-rules.ts`, 1 → 0) was met.

### Observations

- **The first red probes were false.**
  The four gate-level tests I wrote for the win32 defect (a `/tmp/logs/` Git Bash directory token) **passed before the fix**.
  The reason is the defect itself: the old code read `sep` off the *host*, so a `win32PathFlavor`-parameterized test on a POSIX CI exercised POSIX separators and could not see win32 behavior at all — exactly consequence 1 of the issue, met head-on.
  The discriminating input turned out to be a **native Windows path** (`c:\projects\app\src\foo.ts`), which the host's POSIX `dirname` collapses to `./*`.
  All five gate-level probes were rewritten around that and go genuinely red.
  The testing skill's rule — "a new test that passes during Red is either an invariant pin or a broken probe, decide which" — paid for itself here.
- **The widening is real, and was verified against the matcher, not argued.**
  A throwaway test approved the pre-fix pattern `/tmp\*` on `SessionRules` and evaluated `/tmp/other/secrets.env` under `win32PathFlavor`: `allow`.
  That measurement is what justified retyping the commit `fix:` rather than the roadmap's `refactor:`, and it is now pinned by the leaf suite's "bounds a win32 directory token to itself" round-trip.
- **Two plan deviations, both small.**
  `ToolPathAccess` was declared in `handlers/gates/tool.ts` rather than `tool-call-gate-pipeline.ts` — it is `describeToolGate`'s own parameter type and the pipeline already imports from `./tool`.
  And an unplanned file needed the new gate parameter: `test/handlers/external-directory-symlink-acceptance.test.ts`, a `describeBashExternalDirectoryGate` call site outside `test/handlers/gates/`.
  The plan's grep for gate call sites stopped at the gates' own test directory; `tsc` caught it immediately.
  Conversely, two files the plan listed as possible touch points needed nothing (`tool-call-gate-pipeline.test.ts`, `test/helpers/gate-fixtures.ts`).
- **The `pathAccess` pair paid off as predicted.**
  Replacing `describeToolGate`'s `accessPath?` parameter with the `{ path, approvalPattern }` pair (rather than adding a required `normalizer` parameter) touched 4 of 17 call sites in `tool.test.ts` instead of all 17, and kept `pattern-suggest.ts` free of path-domain imports.
- **The tidy-first assessor found exactly one thing and it was the right one:** `bash-external-directory.test.ts` had duplicated `describeGate` / `describeGateWin32` normalizer construction, so threading the new parameter would have hit two places.
  Consolidating first (mirroring `bash-path.test.ts`) made step 4 a one-line change there.
- **Pre-completion reviewer: WARN** (no FAILs), both findings addressed in a follow-up `test:` commit:
  a stale test title still naming the removed `deriveApprovalPattern` symbol (also upgraded from a `toBeDefined` placeholder to a real pattern assertion), and the one remaining non-differentiating win32 gate test, now labelled as the invariant pin it is — it guards against a *future* rewrite that scopes on `flavor.impl.sep`, not against the pre-fix code.
- **`buildLabel`'s `path` / `external_directory` arms remain unreachable**, as planned.
  They predate this change; folding their removal into [#604] stays the cheaper path.

[#533]: https://github.com/gotgenes/pi-packages/issues/533
[#604]: https://github.com/gotgenes/pi-packages/issues/604
[#653]: https://github.com/gotgenes/pi-packages/issues/653
