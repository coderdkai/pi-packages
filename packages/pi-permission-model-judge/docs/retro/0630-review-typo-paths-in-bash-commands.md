---
issue: 630
issue_title: "pi-permission-model-judge can't review typo paths inside bash commands (pathOf ignores accessIntent)"
---

# Retro: #630 — pi-permission-model-judge can't review typo paths inside bash commands

## Stage: Planning (2026-07-22T01:41:14Z)

### Session summary

Planned the fix widening the typo reviewer's candidate extraction to consult `details.accessIntent.matchValues`, so a typo path embedded in a `bash` external-directory command reaches the model instead of deferring at the `no-path` short-circuit.
The change is entirely inside `pi-permission-model-judge/src/typo-reviewer.ts` (single package, despite two `pkg:*` labels — no `pi-permission-system` code changes).
Filed the plan at `packages/pi-permission-model-judge/docs/plans/0630-review-typo-paths-in-bash-commands.md`; three TDD cycles (fix + edge characterization + docs), ship independently as a `fix:`.

### Observations

- **The issue's flagged ambiguity dissolves upstream.**
  The issue Notes asked how to pick a candidate when a bash command references multiple external paths ("review the worst/boundary path, or review each").
  Tracing `describeBashExternalDirectoryGate` (`pi-permission-system` `src/handlers/gates/bash-external-directory.ts`) shows the gate already selects the single **worst uncovered** path (`worstEntry.path`) and escalates one ask carrying that one path's alias set in `accessIntent.matchValues`.
  So the reviewer never sees multiple distinct paths — no multi-path loop is needed, and no `ask_user` gate was warranted (operator's own issue, and the design question was factual, not preference).
- **Candidate ordering matters for forwarded bash asks.**
  A forwarded bash ask's `details.value` is the *command string*, not a path, so the plan orders candidates `matchValues` → `path` → `value` (authoritative path aliases first), keeping `value` as a last-resort fallback to avoid recording a command where a path belongs.
- **Backward compatibility verified against fixtures.**
  All existing `typo-reviewer.test.ts` cases stay green under `candidatePathsOf`: `makeDetails` defaults `path: TYPO_PATH` (still a candidate), and the `accessIntent` test's `matchValues: [TYPO_PATH]` dedupes with `path` via the `Set`.
- **Single-path #626 trail preserved.**
  First-match-wins records exactly one matched alias as `path` + `matchedPattern`, so the decision-trail record shape is unchanged — a listed invariant-at-risk pinned by the existing `records the decision` test.
- **Predecessors closed.**
  #625 (auth), #626 (observability), #628 (structured verdict) are all merged/closed; #630 completes the dogfood sequence.

## Stage: Implementation — TDD (2026-07-22T01:48:00Z)

### Session summary

Implemented all three plan TDD cycles: (1) `fix:` replacing `pathOf` with `candidatePathsOf` + a first-match-wins loop in `authorize`, driven by a Red test for a `bash`-surfaced typo path carried only in `accessIntent.matchValues`; (2) `test:` characterizing the candidate-list edges (later-alias match, pattern-miss with `matchValues[0]`, empty-`matchValues` no-path); (3) `docs:` noting bash-command paths are reviewed in `README.md` and `docs/configuration.md`.
Test count went 43 → 47 in the package (+4); full workspace suite, `check`, `lint`, and `fallow dead-code` all green.

### Observations

- **No deviations from the plan.**
  Every step landed exactly as written; changed files match the Module-Level Changes list (`typo-reviewer.ts`, `typo-reviewer.test.ts`, `README.md`, `configuration.md`).
- **Tidy-First: nothing warranted.**
  The `tidy-first-assessor` reported no preparatory commits — `pathOf` was a 3-line pure helper with one caller, the `authorize` match section already sat in its own isolated slot, and the `makeDetails` fixture already generalized to the new cases.
  Scope boundary held (Rejected items were properly outside footprint).
- **Backward compatibility confirmed empirically.**
  All pre-existing tests stayed green unmodified — the `Set`-based dedupe means a file-tool ask carrying both `path` and an `accessIntent` with the same value collapses to one candidate, so the existing `reads the surface from accessIntent` test still records `path: TYPO_PATH`.
- **Pre-completion reviewer: PASS** — ready for `/ship-issue`.
  One non-blocking note: a Biome `info`-level `useTemplate` suggestion on the new test's `"cat " + TYPO_PATH` concatenation (line ~298); `pnpm run lint` still exits 0, so it is not a gate failure.
  Left as-is.
- **Release:** ship independently (`fix:` cuts a release; no batch membership).
