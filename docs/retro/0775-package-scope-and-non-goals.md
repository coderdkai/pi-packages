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

## Stage: Implementation — Build (2026-08-18T21:51:45Z)

### Session summary

Executed all seven Build Order steps: nine read-only mining subagents produced committed evidence briefs, then the nine `## Scope and non-goals` sections were drafted from those briefs and landed as per-package `docs(<pkg>):` commits across four operator review gates.
Thirteen commits total.
The cross-check pass found and fixed one real cross-package contradiction, and `pnpm pack` verification confirmed the per-package citation link-form rule was necessary and correct.

### Observations

- The evidence-mining phase was the right call and changed the output substantially.
  Total yield was 149 cited candidate non-goals across nine packages — far more than could ship — so drafting became selection rather than invention.
  `pi-permission-system` alone produced 31 candidates with 28 backed by an ADR or numbered design principle; `pi-nocd` produced 3.
- The briefs' most valuable output was **negative**, and it constrained the charter rather than feeding it.
  Three things had to be kept out: durable persistence of an approval in `pi-permission-system` (design principle 8 and the authority model anticipate it, so writing it as a non-goal would have contradicted the architecture), the whole policy-source channel question (undecided across several parked requests, tracked in #639), and Pi's client-server split in `pi-subagents` (a deferral pending an upstream capability, not a boundary).
  A drafting pass without the mining phase would plausibly have asserted at least the first as a non-goal.
- The `## Gaps`-versus-`## Candidate non-goals` split did the work it was designed for.
  Agents consistently refused to promote absence to boundary — `pi-github-tools`'s brief called the tool-surface question "the largest gap… the strongest signal is silence in `git log`, which is absence", and `pi-colgrep`'s flagged one plan Non-Goal as issue-scoped sequencing that a later commit had already violated, warning it must not be promoted to a charter line.
- Thirteen shipped boundaries came from `ask_user` gates rather than artifacts, because the evidence recorded only absence: `pi-nocd` instruction-not-enforcement; `pi-session-tools` transcript entries read-only; `pi-github-tools` surface closed to the ship/release flow, and release-please-only; `pi-autoformat` non-blocking is permanent; `pi-colgrep` wrapper with a single backend; `pi-permission-model-judge` typo paths only; `pi-subagents-worktrees` child sessions only, and ends at the branch; `pi-permission-system` no permissive defaults or presets, and no outbound event bridges; `pi-subagents` `tools:` as the sole widening mechanism, and no global run-mode default.
  Four further gate decisions resolved to omission: `pi-autoformat` lint-versus-format left unstated, `pi-permission-system` agent steering dropped for want of a durable basis, `pi-subagents` reimplement-don't-merge routed to `CONTRIBUTING.md` (#776), and `pi-permission-system` #639 named as an open decision rather than asserted as a boundary.
  Recording the list here answers the pre-completion reviewer's one caveat, which was that no artifact enumerated them.
- The cross-check step earned its place.
  `pi-session-tools` routed peer-worktree teardown to `@gotgenes/pi-subagents-worktrees`, whose charter — written two commits later — explicitly disclaims human-driven peer sessions.
  Neither package's brief could have caught it; only reading the nine finished charters together did.
  A charter set is a system, and the last step has to treat it as one.
- The distribution rule the plan derived held up under measurement.
  `pnpm pack` confirmed `pi-permission-system` ships `docs/*.md` but not `docs/architecture` or `docs/decisions`, so its ADR citations had to be absolute GitHub URLs, while `pi-subagents` ships both and keeps relative links.
  Had the plan not checked the `files` allowlists at planning time, roughly a dozen README links would have resolved to nothing in the npm tarball.
- One deviation from the plan's step sequence: the two Tier A mining agents were dispatched during step 1 rather than step 2, so they could claim concurrency slots (the runner caps at 4) as the Tier B agents finished.
  The commits stayed split as planned, using explicit pathspecs.
- Two boundaries were asserted knowingly without a durable citation, both operator calls: `pi-permission-system`'s conservative-defaults position (a closed-issue comment only) and its no-outbound-bridges rule (supported by analogy, since the architecture doc states the rule for the opposite direction).
  Both answer live requests, which is why they shipped.
- Pre-completion reviewer: PASS.
  No warnings requiring action; its single caveat about the unenumerated operator-decision list is addressed above.
