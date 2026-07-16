---
issue: 605
issue_title: "pi-subagents: slim architecture.md to current state and open targets"
---

# Retro: #605 — Slim architecture.md to current state and open targets

## Stage: Planning (2026-07-17T00:00:00Z)

### Session summary

Produced a build-oriented plan (`docs/plans/0605-slim-architecture-doc.md`) applying the landed [#601] playbook to pi-subagents' 1265-line `architecture.md`, adapted to that package's conventions.
The plan is four `docs:` operations plus a bidirectional link sweep: rename `## Target architecture` → `## Architecture direction` and fold its shipped subsections, aggressively collapse `## Current structural analysis` (remove the 109-line shipped `### Proposed bag decompositions`, collapse the done inventory / resolved-encapsulation-debt tables), strip the one module-tree provenance sentence, and prune orphaned link definitions.
Two adaptation decisions were confirmed with the operator via `ask_user`; both follow the #601 precedent's aggressive/anchor-fixing branch.

### Observations

- **Asymmetric debt vs. #601.**
  pi-subagents does **not** carry the duplicated `### Phase N` prose #601 removed — it already uses the compact Phase/Title/Status + structural-issues table form #601 was *migrating pi-permission-system toward*, and `/finish-phase` (steps 97, 113) actively maintains those tables.
  So issue proposed-change 1 is a near-no-op here; the real bulk is concentrated in `## Target architecture` (shipped-narrated-as-target) and `## Current structural analysis` (shipped-narrated-as-proposed), neither of which has a pi-permission-system analog.
  This asymmetry drove the `ask_user` gate despite the operator-authored, unambiguous-looking spec.
- **Operator decisions (`ask_user`):** aggressive fold of `## Current structural analysis` (collapse the shipped/done material, keep live Health/Complexity/Churn snapshots); and rename `## Target architecture` fixing anchors like #601 (rather than keeping the heading).
- **Anchor blast radius mapped at plan time.**
  Renaming `## Target architecture` (`#target-architecture`) ripples to four live touch points: the in-file link (line 874), `history/phase-16-invert-dependencies.md` (MD051-gated even though "frozen"), the live `client-server-opportunities.md`, and the prose heading-name reference in `.pi/skills/package-pi-subagents/SKILL.md:77`.
  The `### First-principles refinement and the deeper target` sub-anchor (four `history/` citers) is deliberately **kept** to avoid touching those references — its name is not misleading and it is genuinely-open direction material.
- **Chosen new name `## Architecture direction`** to avoid collision with the existing `## Cross-extension architecture` heading.
- **Release posture:** ship independently, cuts no release — `docs/architecture` is a `release-please-config.json` `exclude-paths` entry and the one non-doc touch (`SKILL.md`) is in no package.
  Mirrors #601's "land on `main`; nothing to release."
- **Preserved gate structures:** the `## Phase 11–19 (complete)` chain, the active Phase 20 roadmap (Step 9 / [#543] still open), and the `/finish-phase`-maintained history tables are all explicit Non-Goals.
- **Link-def orphan pre-check:** removing `### Proposed bag decompositions` orphans `[166]`/`[167]`/`[168]`/`[169]` (used only there); `[#231]` is **not** orphaned (also cited in the Phase 15 summary, line 866).
- **Follow-ups already filed by #601:** [#606] (`/finish-phase` doc-hygiene) and [#607] (generalize the regrowth guard) — out of scope; #605 pays down the existing backlog only, so no skill regrowth guard is added here (unlike #601's op 5).
- **Self-caught lint slip:** the plan's own `[#277]:` definition tripped MD053 because both uses sit inside backtick code spans (a code-span `[#N]` is not a live reference) — removed the definition before commit.

[#543]: https://github.com/gotgenes/pi-packages/issues/543
[#601]: https://github.com/gotgenes/pi-packages/issues/601
[#606]: https://github.com/gotgenes/pi-packages/issues/606
[#607]: https://github.com/gotgenes/pi-packages/issues/607
