---
issue: 694
issue_title: "pi-permission-system: Bash path gates miss three variable-expanded external path forms"
---

# Retro: #694 — Bash path gates miss three variable-expanded external path forms

## Stage: Planning (2026-08-11T04:07:00Z)

### Session summary

Planned the response to a third-party bug report (`ThreeIce`) claiming three variable-expansion gaps in the bash path gates.
Reproduced all three against `main` at `2073c0af` with a throwaway spike test before designing anything, and mined the local permission review log for blast-radius numbers, so every option put to the operator carried a measured figure rather than an estimate.
The operator chose home-parity only (defects 1 and 2) with `HOME` + `PWD` as the resolvable variable set; the assignment-dataflow defect is declined and recorded as an ADR 0009 residual.
Plan committed at `packages/pi-permission-system/docs/plans/0694-bash-shell-expansion-parity.md`.

### Observations

- **The measurement changed the design.**
  The spike showed that `$HOME/x` already reaches the `path` surface with the *expanded* value while `external_directory` sees nothing — so this is not "computed paths are unsupported" but an internal inconsistency between the two projections of the same walk.
  That reframing is what made defects 1–2 arguably outside ADR 0009's accepted-residual list, and it is the whole argument for fixing them.
  Reading the issue alone would have suggested a classifier patch.
- **Resolving at collection makes the classifiers untouched.**
  The first design instinct was to teach `classifyTokenAsPathCandidate` the `$HOME` shape.
  Spiking the AST showed a better seam: resolve the `simple_expansion` / `expansion` node in `resolveNodeText`, upstream of classification.
  Then `token-classification.ts` needs no edit at all, its "pure shape function, policy-free" contract stays intact, and the home-prefix vocabulary is not encoded in a third place — which is exactly the drift that caused the bug (`expandHomePath` knew `$HOME`, the classifier did not).
- **`$PWD` → `"."` is the trick that avoids threading a base.**
  `$PWD` is the shell's cwd at that point, which is precisely what `EffectiveBase` already models.
  Rewriting to the base-relative marker lets the existing `forBashToken(token, { resolveBase })` machinery do the work, keeps the new module a pure function of the node, and inherits `#393` unknown-base conservatism for free.
- **Measured blast radii from the real review log** (2767 unique bash commands): 15 (0.5%) touch `$HOME`/`${HOME}` — the upgrade cost of the chosen scope; 45 (1.6%) have a statically-resolvable assign-then-use — the reach of the declined dataflow option; 194 (7.0%) contain any `$VAR` — the reach of the declined floor-to-ask option.
  These numbers are what let the operator decline two options confidently instead of arguing from principle.
- **False-green hazard recorded in the plan.**
  `node-text.test.ts`'s `makeNode` defaults to zero children, so the existing `resolveNodeText(makeNode("simple_expansion", "$HOME")) === "$HOME"` assertion would keep passing after the change (a childless node fails the plain-reference test and falls back to `node.text`).
  The plan requires rebuilding those cases with realistic children as an explicit red step.
- **`fallow dead-code` forced a step merge.**
  The new module cannot land as its own commit ahead of its wiring, so the module + `node-text.ts` delegation + all tests are one `fix!:` commit.
- **Doc-shipping constraint.**
  `docs/decisions/` and `docs/architecture/` are absent from the package `files` allowlist, so any ADR 0009 citation added to the shipped `docs/configuration.md` must be an absolute GitHub URL.
- **`docs/configuration.md` line 592 is doubly stale** — it still claims relative paths inside subshells are not resolved against a per-subshell working directory, which `cd` folding (`#454`, `#393`) already handles.
  The plan folds that correction into the same docs step.
- Scope was deliberately held back from `cd "$HOME"` folding: `literalTextOf` also rejects `cd ~`, so leaving both unknown is parity, and an unknown base is the fail-closed direction.

## Stage: Implementation — TDD (2026-08-11T05:12:00Z)

### Session summary

Implemented the plan in three TDD cycles plus one Tidy-First preparatory commit and one lint-hygiene commit, all from a verified-green baseline.
The behavior change landed exactly at the planned seam: `resolveNodeText` delegates expansion nodes to a new pure `shell-variable-expansion.ts`, and `token-classification.ts` / `bash-path-resolver.ts` were never edited.
Test count for `pi-permission-system` went 2672 → 2721 (+49); full repo suite, `check`, root `lint`, and `fallow dead-code` all green.

### Observations

- **The planned false-green hazard was real and was caught.**
  Rebuilding `node-text.test.ts`'s childless `simple_expansion` fakes with realistic `$`/`variable_name` children was the difference between a test that exercises the new structural discriminator and one that silently passes through the `node.text` fallback.
  The new `shell-variable-expansion.test.ts` additionally carries a parser-backed `describe` ("fidelity to the shapes tree-sitter-bash actually produces") that pins the hand-built fixtures against the real AST — cheap insurance against the fakes drifting from tree-sitter.
- **Two red assertions were my error, not the code's, and both were instructive.**
  `cd /etc && ls "$PWD/passwd"` yields `["/etc", "/etc/passwd"]`, not just the latter — the `cd` argument token is itself an external path, which is correct pre-existing behavior.
  Asserting the full array (per the testing skill's preference for `toEqual` over `toContain`) is what surfaced it; a `toContain` would have hidden the second entry.
- **Deviation: `test/handlers/gates/bash-path.test.ts` was touched but not listed in the plan.**
  Its assertion on the displayed `pathValue` for `cat $HOME/.ssh/config` flipped from `$HOME/.ssh/config` to `/mock/home/.ssh/config`.
  The plan predicted this display change in Risks and Mitigations but did not trace it to a specific test file — a plan-completeness miss.
  The reviewer independently traced the data flow and confirmed the flip is correct, not a masked regression.
- **A `~` vs `$HOME` display asymmetry is now baked in and deliberate.**
  A `~` token is a plain `word` node, shape-classified directly, and expanded only later inside `AccessPath`; a `$HOME` token is an expansion node resolved at collection.
  So `~/x` still displays raw while `$HOME/x` displays expanded.
  Decisions are identical for both — only display differs — and the expanded display is the improvement, since `deriveApprovalPattern` already derived the session rule from the expanded `AccessPath.value()`.
  Prompt and rule now agree.
  Documented in `SKILL.md` so a future agent does not read it as a bug.
- **Deviation: one unplanned `build:` commit for lint hygiene.**
  Implementing braced-expansion support made every `"${HOME}"` literal trip Biome's `noTemplateCurlyInString` — 20 new warnings across the four files that own that vocabulary.
  Twenty inline suppressions would have restated one judgement twenty times (the scattered-decision smell), so it became one narrow `biome.json` override scoped to `expand-home` plus the bash access-intent tree, with the two hits in the neighbouring gate test left as inline suppressions rather than widening the override.
  Warnings are exit-0, so this was optional; leaving 20 lines of noise in a security-sensitive area was the worse outcome.
- **`expandHomePath` got a small unplanned refactor.**
  Adding `${HOME}` to three near-identical prefix clauses would have made five; folding them into one bounded `HOME_PREFIXES` table means a fourth spelling could never again be added to one branch and forgotten in another — the same drift class as the defect being fixed.
- **The declined scope is pinned, not dropped.**
  `CURRENT="$HOME"; ls "$CURRENT"` has an explicit assertion at both the projection layer (`program.test.ts`) and the gate layer (`bash-external-directory.test.ts`), each commented as an ADR 0009 residual, so a future change to it is deliberate rather than accidental.
- **Pre-completion reviewer: PASS.**
  No WARN findings after the lint-hygiene commit (the reviewer's only non-blocking observation was the 20 `noTemplateCurlyInString` warnings, which that commit cleared).
  It independently confirmed the `bash-path.test.ts` flip, the ADR 0009 / ADR 0003 consistency, and that no stale "variable expansion is not parsed" claim survives anywhere in the package.
