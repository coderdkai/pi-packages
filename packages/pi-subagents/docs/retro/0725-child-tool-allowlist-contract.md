---
issue: 725
issue_title: "child sessions: registerTool during bind is silently dropped. intended?"
---

# Retro: #725 — child sessions: registerTool during bind is silently dropped. intended?

## Stage: Planning (2026-08-13T22:38:00Z)

### Session summary

Traced the reported behavior to Pi's own `tools:` allowlist semantics: `createSubagentSession` passes `tools: cfg.toolNames` to `createAgentSession`, the SDK stores it as `_allowedToolNames`, and `_refreshToolRegistry` filters extension-registered tools out **before** building the child's registry.
An extension's `registerTool` in a child therefore succeeds and is then discarded — Pi's documented behavior, not a defect, and not a `pi-subagents` bug either.
Planned a docs-first response: document the allowlist contract and extension tool names as first-class `tools:` entries, make the YAML sequence form intentional, extract `docs/configuration.md` from the 487-line README, and harden the recursion guard into an SDK `excludeTools` denylist.

### Observations

- The issue is third-party (`krisdock`), so the `ask_user` gate ran on direction, not just design.
  The operator chose docs-only over inheriting extension tools into children; the deciding evidence was concrete rather than abstract — in this repo, default inheritance would hand a read-only `Explore` child `issue_close`, `release_pr_merge`, `ci_watch`, `web_search`, and `fetch_content`.
- Open [PR 612] (`wolfgangmeyers`) attacks the same symptom by unioning the parent's active tools into the child's allowlist.
  Reading the SDK source turned up two defects the PR body does not mention: the parent's active set includes built-ins (so a read-only agent would gain `bash`/`edit`/`write`), and admitting `subagent` into the allowlist makes the next refresh restore it after the post-bind guard strips it.
  `/ship-issue` closes the PR with thanks and that analysis.
- The second defect generalizes: with an allowlist set, **every** `_refreshToolRegistry()` re-adds every allowlisted registry tool to the active set, so the existing post-bind `applyRecursionGuard` is not durable.
  It only bites an agent whose frontmatter names `subagent`, but the fix is smaller than the bug report — pass `excludeTools`, delete the guard function.
  That turned a docs-only plan into a two-commit `feat:`/`fix:` plan, which also guarantees the docs ship in a release.
- Measured rather than assumed the frontmatter question the operator raised: frontmatter is YAML, and both sequence forms already work by accident through `String(val)` on an array.
  The plan makes it intentional instead of documenting a coincidence.
- Scope grew twice by operator request, each time deliberately: the `builtinToolNames` → `toolNames` rename (the field name became a lie once extension names are documented) and the `docs/configuration.md` extraction (mirroring `pi-permission-system`'s 178-line README plus configuration doc).
- The `as any` at `src/index.ts:114` came up during the guard design: it is the seam where narrow `*Like` test contracts meet the SDK's concrete classes.
  Planned a field-scoped downcast instead of generics, since parameterizing the IO would infect `ParentSnapshot`.
  Step 3 is independent and droppable if the narrowed assertion does not compile.
- An `Explore` subagent on `sonnet-5` did the SDK trace (68 tool calls, 85k tokens) and returned exact file/line evidence, keeping the hunt out of this session's context.
  Its one wrong conclusion — "no ordering/capping issue" — came from a Pi regression test where no allowlist was in play; reading `_refreshToolRegistry` in the installed `dist` directly settled it.
  Verify a subagent's negative finding against the code path your caller actually takes.

[PR 612]: https://github.com/gotgenes/pi-packages/pull/612
