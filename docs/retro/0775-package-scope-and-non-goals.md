---
issue: 775
issue_title: "Document per-package scope and non-goals in each README"
---

# Retro: #775 — Document per-package scope and non-goals in each README

## Stage: Planning (2026-08-18T20:57:49Z)

### Session summary

Planned a cross-package charter: a `## Scope and non-goals` section in all nine `packages/<pkg>/README.md` files, covering purpose, in-scope changes, non-goals with rationale, and adjacent-request routing.
Two clarification gates settled the shape (authoring protocol, placement, routing, citation policy) and then the discovery mechanism (evidence-mining subagents, brief persistence, review cadence).
Plan committed as `docs/plans/0775-package-scope-and-non-goals.md` in `01b76dd3`.

### Observations

- The issue's referenced "issues" (#684, #692, #703, #675, #613, #740) are all **pull requests**, not issues.
  That sharpens the motivation — the charter is what live third-party PRs get answered against, not just backlog items.
- Measured the external-PR pressure: 38 declined-unmerged or open external PRs, 37 of them on `pi-permission-system` (9 closed + 11 open) and `pi-subagents` (10 closed + 7 open), 1 on `pi-subagents-worktrees`, and **zero** on the other six packages.
  The "answers by reference" benefit is almost entirely about the two big packages; the other seven charters are preventive.
- Artifact density is extremely uneven — `pi-permission-system` has 1635 commits / 155 plans / 225 retros / 11 ADRs, `pi-nocd` has 12 commits and one retro.
  A uniform mining pass was therefore rejected in favor of a three-tier prompt (Tier A: ADRs + design principles + `gh` PR sweep, bounded; Tier B: read all plans/retros/log; Tier C: read everything).
- The operator redirected mid-planning from "draft from README prose" to "send subagents to explore each package" for evidence.
  That materially improved the plan: the non-goals now have to be grounded in a committed, citable brief rather than asserted.
- Discovered a distribution conflict the citation decision created: `pi-permission-system` and `pi-colgrep` do **not** ship `docs/architecture` or `docs/decisions` in their `files` allowlists, so a relative ADR link would resolve to nothing in the tarball (Refs #647).
  `pi-subagents` does ship both and already relative-links its architecture doc.
  Resolved with a per-package link-form rule rather than by extending any allowlist.
- Discovered a placement conflict: the chosen "immediately before `## Install`" rule buries the charter at line 135 of 151 in `pi-session-tools`, whose `## Install` sits near the bottom.
  Generalized the rule to "before the setup block — the first `## Prerequisites` or `## Install`" with `pi-session-tools` as the one documented exception (before `## Tools`).
- `docs` is an unhidden changelog type and `packages/<pkg>/README.md` is not in `exclude-paths`, so this lands as nine patch releases in one release-please PR.
  Treated as the mechanism (the README ships in the tarball) rather than a problem, and it argues for nine scoped `docs(<pkg>):` commits over one omnibus commit.
- Evidence briefs go to `docs/plans/0775-evidence/<pkg>.md`; root `docs/plans` is in `exclude-paths`, so those commits cut no release.
- Mining agents must be `general-purpose`, not `Explore` — `Explore` is read-only and cannot write the brief files.
- Explicitly built in a `## Gaps` section for each brief, because a package with no ADR and no external PR pressure may genuinely have no recorded non-goals.
  Accepting a manufactured one is exactly the failure mode #777 warns about.
- Nothing filed as a follow-up: the plan's deferrals all land on the existing #776 and #777, and the one speculative item (a companion ADR for a Tier A boundary) is deliberately deferred until the evidence briefs exist.
