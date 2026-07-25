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
