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
