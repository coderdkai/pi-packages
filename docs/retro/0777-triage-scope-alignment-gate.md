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
