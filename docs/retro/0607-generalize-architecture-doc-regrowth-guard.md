---
issue: 607
issue_title: "Generalize the architecture-doc module-tree regrowth guard into a shared convention"
---

# Retro: #607 — Generalize the architecture-doc module-tree regrowth guard into a shared convention

## Stage: Planning (2025-07-16T00:00:00Z)

### Session summary

Produced a build-oriented plan (`docs/plans/0607-generalize-architecture-doc-regrowth-guard.md`) for the operator-authored docs/tooling-only follow-up that lifts [#601]'s per-package module-tree regrowth guard into one repo-wide home.
The change is three coordinated edits in repo-root tooling — add a canonical `### Architecture-doc conventions` subsection to `AGENTS.md`, remove the redundant copy from `package-pi-permission-system/SKILL.md`, and repoint `/finish-phase` Step 4's provenance-strip directive at the shared convention — landing as a single `docs:` commit that cuts no release.

### Observations

- The issue's proposed change was ambiguous on "and/or mirror it into each `package-<PKG>` skill."
  Surfaced this via `ask_user`; operator chose the DRY branch: `AGENTS.md` canonical, remove per-package copies with **no** pointer, repoint `/finish-phase` at the shared convention.
- `AGENTS.md` was chosen over the `improvement-discovery` skill as canonical home because it is always loaded from the repo-root CWD — present during the per-change doc-update commits where regrowth actually happens, whereas the skill loads only during `/plan-improvements`.
- Confirmed only two live reference sites need editing (`.pi/skills/package-pi-permission-system/SKILL.md` lines 24–25 and `.pi/prompts/finish-phase.md` Step 4 directive 2); every other hit is in point-in-time plan/retro archives (`0601-*`, `0605-*`), deliberately left untouched.
- `.pi/skills/package-pi-subagents/SKILL.md` never carried the guard and gets no mirror — the plan flags this as intentional so the build step does not "helpfully" add one.
- Sibling context: [#601]/[#605] are the bulk paydowns, [#606] added the `/finish-phase` hygiene step (its Step 4 directive-2 sentence is the reference this plan repoints); all three are closed.
  This issue is the last of that quartet.
- Next stage is `/build-plan` (docs/tooling, no test cycles).

[#601]: https://github.com/gotgenes/pi-packages/issues/601
[#605]: https://github.com/gotgenes/pi-packages/issues/605
[#606]: https://github.com/gotgenes/pi-packages/issues/606
