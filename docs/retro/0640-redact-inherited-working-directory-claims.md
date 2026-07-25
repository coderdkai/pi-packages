---
issue: 640
issue_title: "Child inherits parent's stale 'working directory' claim, defeats WorkspaceProvider/worktree isolation"
---

# Retro: #640 — Child inherits parent's stale 'working directory' claim, defeats WorkspaceProvider/worktree isolation

## Stage: Planning (2026-07-25T02:35:00Z)

### Session summary

Confirmed the third-party report's root cause empirically rather than by reading alone, then wrote a cross-package plan (`docs/plans/0640-redact-inherited-working-directory-claims.md`) covering `pi-subagents` and `pi-nocd`.
`pi-subagents` will strip the inherited `Current working directory: <parent cwd>` line from the parent prompt it embeds; `pi-nocd` will rewrite an inherited `# Working Directory` block to name the current session's cwd instead of deferring to it.
`pi-subagents-worktrees` gets no change — it is the trigger, not the defect site.

### Observations

- Two throwaway probes (`/tmp/probe640.mjs`, `/tmp/probe640c.mjs`) drove the whole design.
  They imported the installed SDK's `buildSystemPrompt` and reconstructed the child prompt end to end, proving that Pi appends a *correct* `Current working directory: <child cwd>` footer for free (from the child session's own cwd, nothing passed by us) and that the stale claim sits mid-prompt at the inherited tail.
  The operator asked "are we confident pi puts the correct footer?"
  — the probe answered it in a way that reading `agent-session.js` alone would not have.
- The operator asked to see examples of each redaction option "including overcorrections", and that request changed the outcome.
  Rendering the global `replaceAll(parentCwd, childCwd)` option against a realistic prompt exposed that it rewrites a valid `.pi/npm/node_modules/…/SKILL.md` skill location (gitignored, absent from a `git worktree add` checkout) into a 404, plus three prefix collisions (`issue-640-worktrees/issue-448`, `-archive`, `pi-packages2`).
  Strip won on that evidence.
- Decisions locked with the operator: strip rather than rewrite the footer (exactly one canonical claim, always); no precedence sentence in the child's `# Environment` block; include the pi-nocd fix, making this a cross-package plan.
- Design-review call: the parent's prompt and the cwd it claims travel as one `InheritedPrompt` parameter rather than two adjacent optional strings, since the cwd exists in that signature solely to redact the prompt.
- Considered and rejected: stripping at capture time in `buildParentSnapshot`, which would need no signature change anywhere.
  It conflates capturing the parent's prompt with sanitizing it for another session, and would leave `ParentSnapshot.systemPrompt` silently lossy for any future consumer.
- Upstream precedent noted but not followed: Pi's own `ssh` and `gondolin` example extensions *replace* the footer line in place.
  They need to, having no other way to state a remote cwd; we already get a correct footer from the child session, so replacing would only add a redundant third claim.
- `pkg:pi-nocd` already existed as a label; added it to the issue.
- Not filed as follow-ups (deliberately, as neither is concrete yet): sanitizing the inherited *conversation* under `inherit_context`, and asserting `# Environment` precedence over non-footer stale claims.

## Stage: Implementation — TDD (2026-07-25T02:45:00Z)

### Session summary

Executed all six planned TDD steps plus one adopted preparatory tidy, across `@gotgenes/pi-subagents` (footer strip) and `@gotgenes/pi-nocd` (inherited-block rewrite), in seven commits.
Test count went from 1073 to 1081 in pi-subagents (+8) and 7 to 11 in pi-nocd (+4).
The pre-completion reviewer returned PASS with no warnings.

### Observations

- No deviations from the plan's Module-Level Changes: every listed file was touched and nothing else, including the prediction that `packages/pi-subagents/src/index.ts` needs no edit because it passes `buildAgentPrompt` by reference and structural typing carries the new signature.
- Adopted one of the `tidy-first-assessor`'s two recommendations — extracting `SENTENCE_PREFIX` in pi-nocd before the rewrite branch, so the detector reads a constant the builder already uses rather than restating the sentence.
  Declined the other (a `withParent` passthrough fixture for `prompts.test.ts`'s nine positional call sites): as specified it was a no-op wrapper with an unused `cwd` parameter, and it would have hidden the parent cwd that the new footer tests exist to vary.
  The nine-site migration is compiler-enforced, which is the stronger backstop; it landed clean in one atomic `Edit` batch.
- The two guard tests in each `fix:` step's red phase passed before the implementation existed, by design — "leaves a footer naming a different directory alone" and "leaves a parent prompt without a footer unchanged" in pi-subagents, "foreign block untouched" and "stable under repeat application" in pi-nocd.
  They pin what must *not* change, so a trivially-green red phase is the correct signal for them; the behavioral cases (5 and 2 respectively) failed first as expected.
- `buildAgentPrompt`'s edge behavior was preserved exactly by writing `inherited?.systemPrompt ?? genericBase`: an empty-string parent prompt still yields an empty identity, matching the old `parentSystemPrompt ?? genericBase`, because `??` does not treat `""` as nullish.
- The pi-nocd rename commit was rejected once by the pre-commit hook — biome reordered the test file's named imports alphabetically after the `sed` rename.
  Re-staging and re-committing was enough; worth remembering that a `sed`-driven rename can leave import order dirty.
- The reviewer independently ran `verify:public-types` and confirmed `InheritedPrompt` stays internal, and grepped both packages to confirm neither references the other — the ADR-0002 inward-arrow constraint held, with each package repairing only the text it owns.
- The plan specified an **unconditional** strip; the shipped fix strips only when the child's cwd differs from the parent's.
  The operator asked for a before/after prompt comparison to check prompt caching, and measuring it changed the design after the pre-completion review had already passed.
  Against a realistic parent prompt (this repo's `AGENTS.md` plus 15 skills, ~8,599 tokens) the unconditional strip cost 342 characters (~86 tokens, 1.0%) of the byte-identical prefix a child shares with its parent — five times the 67-character footer, because the parent's trailing extension-appended blocks (pi-nocd's) shift offset and prefix matching cannot resume past the removed line.
  A same-cwd child now comes out byte-identical to pre-change output (verified by diffing against the pre-change function extracted from git).
  The plan's Design Overview records the amendment and the measurement.
- Worth carrying forward: Anthropic was never exposed to this class of regression, because its `cache_control` breakpoint covers the entire system block (`packages/ai/src/api/anthropic-messages.ts:975-989`) and a child's block never equaled its parent's — the child always appends the bridge, `<active_agent>` tag, and env block.
  The "identical byte prefix with the parent session" rationale in `buildAgentPrompt`'s docstring only pays off on implicit token-prefix caching (OpenAI, Gemini, OpenRouter).
  Any future change to the inherited prefix should be measured against those providers, not Anthropic.
- Method note: the comparison was run by extracting the pre-change `prompts.ts` from git into a scratch module and diffing both functions' real output, rather than reimplementing the old behavior.
  Pi's `buildSystemPrompt` is not in the SDK's `exports` map, so the realistic parent prompt was generated by a plain-node script importing the dist path directly and handed to the vitest scratch through a temp file.
