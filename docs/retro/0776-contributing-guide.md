---
issue: 776
issue_title: "Add CONTRIBUTING.md establishing an issues-first contribution path"
---

# Retro: #776 — Add CONTRIBUTING.md establishing an issues-first contribution path

## Stage: Planning (2026-08-19T17:34:17Z)

### Session summary

Planned a root `CONTRIBUTING.md` establishing an issues-first path, plus two pointers to it (a root README `## Contributing` section and a `contact_links` entry on the issue chooser) and one resolved forward reference in `pi-subagents`' architecture doc.
One clarification gate settled size, candor, README overlap, and wiring together.
Plan committed as `docs/plans/0776-contributing-guide.md` in `141cbd8d`; follow-ups [#781] (pull request template) and [#782] (`CODE_OF_CONDUCT.md`) filed for the two items the issue named as out of scope.

### Observations

- The gate was built directly against [#775]'s two failure modes, both of which apply to this change.
  Size was asked **with** a worked draft at the target length rather than as an abstract preference, and the answer (compact, ~80 lines) is now pinned by a per-section budget table and a `wc -l` ceiling of 95 in the verification steps.
- The operator amended the candor wording at the gate: "may land as a reimplementation" rather than "often lands as".
  The modal form is the whole difference between setting an expectation and warning someone off, and it was worth more than the option label it was attached to.
- Agent disclosure was offered as a candor variant and declined.
  The guide states the reason for rework as "conventions it could not have known about" without describing the maintainer's toolchain.
- The README answers look contradictory and are not: `## Development` is untouched (no setup content moves into the guide, no duplication), while a new three-line `## Contributing` section is added above it.
  Called out explicitly in Non-Goals, since the plan template warns about Module-Level Changes contradicting Non-Goals.
- `.pi/prompts/pr-review.md` turned out to be the internal counterpart of this guide — it already states the reimplement-don't-merge outcome and mandates `Co-authored-by:` plus an `@login` close comment.
  The guide describes the *outcome and the credit*; the prompt owns the *decision procedure*.
  Keeping that split is what lets the two evolve without a sync obligation, which is why cross-linking them was left as a deferred Open Question.
- One live forward reference exists in the repo: `packages/pi-subagents/docs/architecture/architecture.md:60` says the pattern "belongs in `CONTRIBUTING.md`".
  It becomes a pointer in build step 3 — and because that directory **is** in `pi-subagents`' `files` allowlist, the link must be an absolute GitHub URL per [#647].
  The reverse direction is unconstrained: root `CONTRIBUTING.md` ships in no tarball, so its own links stay repo-relative.
- Release framing is unusual and worth recording: every touched path is either root-level or in `exclude-paths`, so this change cuts **no release at all**.
  "Ship independently" here means land and close, with no release-please PR to wait on.
- Deliberately avoided nine `#scope-and-non-goals` anchor links, one per package.
  Linking the README package table once is the [#775] manufactured-link lesson applied preemptively — and it removes nine links that would go stale if a package were ever renamed or retired.
- The issue's measured merge-rate statistics are motivation, not content.
  Recorded as a Non-Goal so the build session does not reach for them when the `## Pull requests` section feels thin.

## Stage: Implementation — Build (2026-08-19T19:35:18Z)

### Session summary

Executed all three build steps: the 42-line `CONTRIBUTING.md`, the two pointers to it (a root README `## Contributing` section and a `contact_links` entry on the issue chooser), and the resolved forward reference in `pi-subagents`' architecture doc.
Commits `f114989d`, `2f7328c9`, `54e21b0a`.
Pre-completion reviewer: PASS.

### Observations

- The shipped guide is **byte-identical to the plan's worked draft** — the reviewer confirmed this with a `diff` returning zero.
  That is the [#775] size lesson working exactly as intended: settling the size at the gate with a real draft left the build step nothing to negotiate, and no section drifted longer under the pressure of writing it.
- Reviewer WARN (non-blocking, planning-artifact only): the plan's per-section line-budget table sums to "~74, hard ceiling 95", while its own worked draft — labeled "the target, not a placeholder" — was already 42 lines.
  The two were never reconciled against each other at planning time.
  Nothing was dropped to reach 42; the arithmetic simply over-counted blank lines and per-section sentences.
  Left the plan uncorrected as a historical record and recorded the discrepancy here instead.
  The transferable lesson is narrow but real: when a plan carries **both** a budget table and a worked example, the example is the binding artifact and the table should be derived from it (`wc -l`), not estimated alongside it.
- The `contact_links` YAML was verified by parsing it with the repo's own `yaml` package rather than by eye.
  Worth doing: the `about:` value contains an em-dash and an apostrophe, and the `url:` value contains an unquoted `https://`, all of which are valid plain scalars but none of which are obvious by inspection.
  The rendered chooser page remains a post-push check.
- The `pi-subagents` pointer is the one link in this change where the form is load-bearing.
  The reviewer independently confirmed `docs/architecture` is in that package's `files` array, which is what makes the absolute URL required rather than stylistic ([#647]).
- `README.md` verification was framed as a scoping assertion and checked as one: `git diff` reports 4 insertions and **0 deletions**, so the Non-Goals claim that `## Development` is untouched is pinned by a number rather than by reading.
- Deliberately did not load the `package-pi-subagents` skill for the one-line prose pointer in that package's architecture doc.
  The edit changes no module, symbol, or boundary — only a forward reference to a file that now exists.
- No `src/`/`test/` files were touched, so Tidy First was skipped per its applicability gate, and `pnpm run test` was not required — the reviewer ran the full suite anyway and it was green.

[#647]: https://github.com/gotgenes/pi-packages/issues/647
[#775]: https://github.com/gotgenes/pi-packages/issues/775
[#781]: https://github.com/gotgenes/pi-packages/issues/781
[#782]: https://github.com/gotgenes/pi-packages/issues/782
