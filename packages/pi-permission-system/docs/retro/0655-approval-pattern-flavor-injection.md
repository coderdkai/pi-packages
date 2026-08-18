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

[#533]: https://github.com/gotgenes/pi-packages/issues/533
[#604]: https://github.com/gotgenes/pi-packages/issues/604
[#653]: https://github.com/gotgenes/pi-packages/issues/653
