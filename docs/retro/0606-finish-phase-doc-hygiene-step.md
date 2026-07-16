---
issue: 606
issue_title: "/finish-phase: add a bounded architecture-doc hygiene step to prevent regrowth"
---

# Retro: #606 — /finish-phase: add a bounded architecture-doc hygiene step to prevent regrowth

## Stage: Planning (2025-06-13T00:00:00Z)

### Session summary

Planned a bounded, change-scoped doc-hygiene step for the `/finish-phase` prompt (`.pi/prompts/finish-phase.md`) that prevents the architecture-doc regrowth [#601]/[#605] paid down in bulk.
The plan inserts a new `## Step 4: Bounded doc hygiene` (renumbering Archive → 5, Verify → 6) covering three directives — no duplicate `### Phase N` prose on archive, strip provenance from touched module-tree entries, re-frame delivered `Target:` prose — and corrects Step 4's now-stale parenthetical that still tells the agent pi-permission-system uses `### Phase N (complete)` prose subsections (deleted by [#601]).
Scope is a single prompt file: docs/config, no code, no tests — so `/build-plan` is the next stage, not `/tdd-plan`.

### Observations

- Operator-authored, unambiguous issue → skipped the `ask-user` gate.
  The proposed change lists three concrete hygiene items and explicitly decided (with @gotgenes) that `/finish-phase` is the home, so the design fork was narrow.
- Design decision: implement the issue's three items as **one** bounded hygiene step (all three grouped) rather than distributing them into existing Steps 3/4, to match the issue's "add a bounded hygiene step" framing and keep it reviewable.
  Item 1 (no duplicate prose) is stated in the hygiene step but governs the *next* step's archive write; the Archive step gets a cross-reference plus the stale-parenthetical fix.
- Verified the stale parenthetical is a real bug: after [#601] pi-permission-system's `Refactoring history` is intro-plus-table with the `### Phase N (complete)` prose removed, yet Step 4 still instructs the agent to write that prose.
- Kept scope tight: package-skill / shared-convention generalization is [#607]'s job (filed separately, still open); this plan references the existing per-package skill rule and notes [#607] as the future shared-convention home.
- Confirmed no external references key on `/finish-phase`'s internal step numbers (`plan-improvements.md`, `retro.md`, `ship-issue.md`, `improvement-discovery` SKILL all name the *job*, not a step number), so the renumber is internal and safe.
- Release: ship independently — the prompt file is repo-root tooling, in no tarball and no roadmap; lands as a `docs:` commit with no release coordination.

[#601]: https://github.com/gotgenes/pi-packages/issues/601
[#605]: https://github.com/gotgenes/pi-packages/issues/605
[#607]: https://github.com/gotgenes/pi-packages/issues/607
