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
