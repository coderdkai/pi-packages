---
issue: 767
issue_title: "Evaluate spun-off issues for roadmap fit at filing time"
---

# Retro: #767 — Evaluate spun-off issues for roadmap fit at filing time

## Stage: Planning (2026-08-19T23:10:00Z)

### Session summary

Planned the filing-time roadmap-fit gate as a new `roadmap-fit` skill loaded lazily by the four templates that file issues (`/plan-issue`, `/tdd-plan`, `/build-plan`, `/retro`), with the disposition settled by an `ask_user` gate and a `/finish-phase` reconciliation as the backstop.
The issue left its main design question open — shared skill vs. duplicated step vs. `improvement-discovery` — so the plan was written only after an `ask_user` gate settled all three axes (home, decider, backstop).
Plan committed as `docs/plans/0767-roadmap-fit-at-filing-time.md`; the change is docs-only, so the next stage is `/build-plan`.

### Observations

- The operator chose all three recommended options: shared skill, always-ask, `/finish-phase`-only backstop.
  The decisive argument for always-ask was the defer bias: an agent allowed to self-record a "defer" disposition dodges the gate exactly the way that lost [#753].
- Measured rather than estimated two things the plan rests on.
  The detection grep (`^## Improvement roadmap — Phase` across all `packages/*/docs/architecture/architecture.md`) returns nothing today — no package has an open phase, so there is no live roadmap to migrate and the gate ships as a verified no-op at rest.
  The reconciliation query against Phase 13's window (`created:>=2026-08-15`) returns 15 issues, 7 already stepped or dispositioned, leaving 8 residual — enough to justify the grouped-bullet allowance rather than an issue-by-issue interrogation.
- Found a third spelling of the dispositions heading while checking the append target: pi-permission-system Phase 10 used `### Open-issue sweep dispositions`, Phase 13 flattened it to a bold prose lead-in, and pi-subagents Phase 21 used `## Deferred work (explicit dispositions, …)`.
  Standardizing the heading was not in the issue's proposal; it became a goal because the gate's append and the backstop's grep both need a deterministic target.
- Rejected extending `pre-completion-reviewer` §2i: it fires early enough to still fold work in, but it only sees follow-ups a **plan** names, and [#751] — the motivating case — was filed by an implementation step with no plan mention.
- Checked `/finish-phase`'s cross-references before choosing a placement: every reference to it (`AGENTS.md`, `plan-improvements.md`, `retro.md`, `ship-issue.md`, `improvement-discovery/SKILL.md`) names it without a step number, but the file has internal `per Step 4` / `Step 5.2` self-references.
  The reconciliation therefore lands as a subsection inside Step 2 rather than as a new numbered step.
- Release framing: the touched files (`.pi/`, `AGENTS.md`) lie outside every release-please component path, so the change cuts no release at all — "ship independently" means land and close.

## Stage: Implementation — Build (2026-08-20T01:32:46Z)

### Session summary

Executed all five Build Order steps as five `docs:` commits: the new `.pi/skills/roadmap-fit/SKILL.md`, the four filing-site directives (`/plan-issue`, `/tdd-plan`, `/build-plan`, `/retro`), the `#### Open-issue sweep dispositions` heading standardization in `/plan-improvements` and `improvement-discovery`, the `/finish-phase` reconciliation subsection, and the `AGENTS.md` entry.
No deviations from the plan: every file in its Module-Level Changes table landed as described and nothing else was touched.
Pre-completion reviewer: PASS.

### Observations

- Tidy First was skipped per the skill's applicability gate — the plan touches no `src/`/`test/` files.
- Both dry-runs the plan promised reproduced their planning-time measurements: the detection grep (`^## Improvement roadmap — Phase`) matches nothing across all `packages/*/docs/architecture/architecture.md`, so the gate ships as a verified no-op at rest, and the reconciliation query against Phase 13's window still returns the same 15 issues.
- The `improvement-discovery` Output format gained a trailing item 6 rather than absorbing the rule into item 1, because the dispositions list is its own artifact and not part of the health-metrics table; `/plan-improvements`'s own Output item 1 did take the rule in place, since its item 1 is the findings summary the list lives inside.
- One sloppy `Edit` call included a no-op entry (identical `oldText`/`newText`), which still reported as a replaced block.
  Harmless here, but it is the same class of miscount `AGENTS.md` warns about when counting reported blocks against intended edits.
- The reviewer independently confirmed the two structural claims the plan flagged as invariants at risk: `/finish-phase`'s four step self-references (`Step 1`, `per Step 4`, `Step 5.2`, `Step 5.3`) all still resolve, and `/plan-improvements`'s Output items 1–5 were not renumbered.
- Per the `AGENTS.md` stale-prompt rule, none of the edited templates were re-invoked to check the change — this session runs the pre-edit copies.

[#751]: https://github.com/gotgenes/pi-packages/issues/751
[#753]: https://github.com/gotgenes/pi-packages/issues/753
