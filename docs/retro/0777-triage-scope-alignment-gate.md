---
issue: 777
issue_title: "Add a scope-alignment gate to /triage-backlog before severity scoring"
---

# Retro: #777 — Add a scope-alignment gate to /triage-backlog before severity scoring

## Stage: Planning (2026-08-19T20:21:45Z)

### Session summary

Planned a scope-alignment gate for `.pi/prompts/triage-backlog.md`: a new Step 6 that classifies every backlog item against its package's `## Scope and non-goals` charter before the four scoring axes run, with Score/Keystone/Interleave renumbered to 7/8/9.
One `ask_user` gate settled three choices the issue left open — charterless items, verdict durability, and GitHub write-back.
Plan committed as `docs/plans/0777-triage-scope-alignment-gate.md` in `08f03f23`; the `/pr-review` follow-up the issue names was filed as #783 first.

### Observations

- The dependency is fully satisfied: #775 landed the `## Scope and non-goals` section in all nine package READMEs and #776 landed `CONTRIBUTING.md`, which already tells contributors to read it.
  Verified with `rg -l '^## Scope and non-goals' packages/*/README.md` — nine hits.
- Measured the case the issue does not address: of 52 open issues, 5 carry no `pkg:` label (repo tooling, prompt templates, install) and 7 carry more than one.
  That is ~10% with no charter and ~13% needing a per-package check, so both needed explicit rules rather than judgment.
  The operator chose a fourth verdict, `no charter`, scored normally — declining the alternative of treating `CONTRIBUTING.md` / `AGENTS.md` as a repo-level charter, since neither is written as a non-goal list and a decline resting on them would be exactly the invention the issue warns against.
- The renumbering ripple turned out to be trivial and worth confirming rather than assuming: every surviving step cross-reference in the template points at Step 1, Step 3, or "Steps 4 and 5", all above the insertion point.
  `rg -l 'triage-backlog'` across the repo matched only two `docs/plans/0775*` files, both of which name the command and not its step order, so no skill or `AGENTS.md` section goes stale.
- The load-bearing part of the plan is the dry-run validation (Build Order step 3), because a prompt-template change has no test surface.
  Two of its six cases are chosen to *fail* the gate: #692 and #675 must **not** classify as out of scope, since #775's retro records that the policy-source channel was deliberately left undecided under #639.
  A gate that declines them is over-firing, and the fix is the gate's wording, never a charter edit made to justify a verdict.
- Verdict durability landed on "settled unless the charter section or the item changed since the prior triage date", with `git log --since=<date> -- packages/<pkg>/README.md` as the concrete trigger.
  The alternatives — permanent settlement, or re-deriving with the prior verdict as a seed — respectively hide stale declines behind a revised charter, and reinstate the re-litigation the issue exists to stop.
- Kept a nuance the issue's own framing would have dropped: an out-of-scope third-party PR gets no severity rank but still needs a timely answer, so its recommended disposition carries a response urgency.
  Without that, removing it from the priority table would also remove the only signal that a contributor is waiting.
- Rejected an `out_of_scope:` count in the triage doc's frontmatter — the verdicts are what the next run inherits; a count is decoration.
- No release: `.pi/prompts/` is outside every `release-please-config.json` component path, so this cuts no release at all.
- Next step is `/build-plan` — the change is docs/prompt-only with no test cycles.

## Stage: Implementation — Build (2026-08-19T20:32:20Z)

### Session summary

Executed all four Build Order steps against `.pi/prompts/triage-backlog.md` in three commits: the new Step 6 gate plus the 6/7/8 → 7/8/9 renumber (`74f7221b`), the surrounding wiring into Step 1's carry-forward, Step 4's green-CI rule, the Mutations section and the Output section (`69c319f2`), and one dry-run-driven wording fix (`6577b790`).
The six-item dry run the plan specified as its only validation surface ran clean, with one wording gap found and fixed.
Pre-completion reviewer: PASS.

### Observations

- All six dry-run verdicts matched the plan's expected column:

  | Item | Verdict          | Basis                                                                                                                   |
  | ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
  | #740 | out of scope     | `pi-subagents` non-goal *A global run-mode default*                                                                     |
  | #613 | out of scope     | Same non-goal; second implementation of the same request                                                                |
  | #692 | aligned (parked) | Durable approval persistence is parked on #639, not declined                                                            |
  | #675 | aligned (parked) | Policy-source channel, same open decision                                                                               |
  | #519 | aligned          | Multi-package labels; the `pi-permission-system` charter admits the seam-documentation ask, so rule 2 stops any decline |
  | #777 | no charter       | No `pkg:` label; prompt-template work                                                                                   |

- The dry run earned its place, and the two deliberately-must-not-decline rows are what caught the gap.
  `pi-permission-system`'s charter carries a **One decision is still open** paragraph naming #639 and the widenings parked on it — a structure no other package's charter has, and one the gate's text never mentioned.
  Rule 1 ("cite the non-goal") would have prevented an outright decline anyway, but nothing told the reader what verdict *does* apply, so `adjacent` was a plausible wrong answer.
  Fixed with two sentences: an item landing on an open decision is `aligned` and parked, and the run must say which decision it waits on.
- The renumbering ripple was as small as planned.
  Every surviving cross-reference (Step 1, Step 3, "Steps 4 and 5") sits above the insertion point, and `git diff` on the renamed Step 7 shows only its heading line changed.
- Budgets held: Step 6 is 51 lines against a 55-line budget, and the file is 309 lines against 315.
  The third commit's two sentences consumed most of the remaining headroom, which is a fair sign the budget was set at about the right size rather than generously.
- The Output section's `Scope alignment` entry deliberately specifies a **Carried forward** subsection alongside the verdict table, so the inheritance rule has a place to land in the document rather than living only in the step's prose.
- No deviation from the plan beyond the anticipated one: Build Order step 3 explicitly told the implementation to fix gate wording (never a charter) on a mismatch, and that is what happened.
- Reviewer verdict: PASS with no warnings.
  Deterministic checks (`check`, `lint`, `test`, `fallow dead-code`) all pass; code-design, test-artifact, Mermaid, and cross-step-invariant lenses were skipped as inapplicable to a prompt-template change.
