---
issue: 778
issue_title: "System prompt showing tool names twice"
---

# Retro: #778 — System prompt showing tool names twice

## Stage: Planning (2026-08-19T21:15:16Z)

### Session summary

Confirmed the third-party bug report from `auipga`: Pi's `buildSystemPrompt` always renders `- ${name}: ${snippet}`, so every `promptSnippet` in this monorepo that spells its own tool name produces a doubled label in the `Available tools:` section.
Widened the scope from the labeled package to all three affected packages (11 tools: `pi-colgrep` 1, `pi-github-tools` 7, `pi-subagents` 3) and wrote the cross-package plan `docs/plans/0778-drop-redundant-tool-name-prefix-from-prompt-snippets.md`.

### Observations

- **Evidence, not inference.**
  The prefix was verified in three places before planning: Pi's `main` source (`core/system-prompt.ts:83`), both installed SDK builds in this workspace (`@earendil-works/pi-coding-agent@0.79.1` and `@0.80.5`), and the second render path (`server/create-harness.ts`, which keys snippets by `tool.name` and delegates to the same builder).
  A live session's own system prompt supplied the direct observation (`- subagent: subagent: …` next to a correct `- web_search: …`).
- **The remembered rationale was for a different field.**
  The operator recalled a Pi issue justifying the name prefix; the artifact is `earendil-works/pi#4879` ("Expose promptGuidelines on `ToolInfo`"), which is about `promptGuidelines` bullets being flattened into one *unattributed* `Guidelines:` list.
  That justifies naming the tool inside a guideline, and never applied to `promptSnippet`, which Pi labels itself.
  The distinction is now recorded in the plan's Non-Goals so the next reader does not "restore" the prefix.
- **Provenance of the convention.**
  It traces to `0ad2bbdc` (`pi-colgrep`, [#90]), was copied into `pi-github-tools`, and then into `pi-subagents` via [#152] explicitly as "matching the sibling convention" — no package doc, skill, or ADR ever recorded a reason for it.
- **Guard declined deliberately.**
  A cross-package convention test (assert no snippet starts with `<name>:`) and a `code-design` skill note were both offered and declined; the plan records the resulting coverage gap explicitly (`pi-colgrep` and `pi-github-tools` have no tool-definition tests, so 8 of the 11 edits are review-verified only) so it is not mistaken for an oversight later.
- **Invariants checked, both clear.**
  `pi-permission-system`'s [#437] narrowing parses Pi's rendered `- name:` bullet, never the snippet body; `pi-subagents`' [#640] parent/child prefix invariant is byte-*identity*, not length, and both sides shorten identically.
- **Release shape.**
  Not a roadmap step in any package, so ship independently — but three `fix:` commits, one per package, means three component releases at the next release-PR merge.

## Stage: Implementation — TDD (2026-08-19T21:27:18Z)

### Session summary

Executed all three plan steps: removed the redundant `"<tool_name>: "` prefix from 11 `promptSnippet` literals across `pi-subagents` (3), `pi-github-tools` (7), and `pi-colgrep` (1), landing one `fix:` commit per package.
Only step 1 had a real Red→Green cycle (three exact-string assertions in `pi-subagents`' tool tests went red, then green); steps 2 and 3 have no test surface and were verified by `check`/`lint` plus review against the plan's Design Overview table.
Test count is unchanged at 5218 — no tests were added or removed, three assertion strings were updated in place.

### Observations

- **No deviations from the plan.**
  Every file in Module-Level Changes was touched and nothing else; the predicted "no docs change" held, re-verified independently by the reviewer.
- **Tidy-First assessor: no preparatory tidying warranted.**
  It correctly read the change as 11 isolated string-literal edits with no surrounding friction, and declined a shared `stripToolPrefix`-style helper as new abstraction rather than preparation.
- **Biome reflow happened as the plan predicted.**
  Four github-tools snippets collapsed from a wrapped continuation onto one line (`issue-close.ts`, `release-pr-find.ts`, `release-watch.ts`, and the formatter also tidied `ci-list.ts`), which is why that commit shows 7 insertions against 10 deletions.
  Letting the formatter own the layout kept the diff honest.
- **Coverage gap is by design, not oversight.**
  8 of the 11 edits are in packages with no tool-definition tests (`pi-colgrep`, `pi-github-tools`), a direct consequence of the declined regression guard; the plan and the reviewer both record it explicitly.
- **Pre-completion reviewer: PASS** — all four deterministic checks green, all 11 resulting strings diffed byte-for-byte against the plan's table, and the "no user-facing doc quotes a snippet" claim independently re-verified (only `docs/plans/`, `docs/retro/`, and an unrelated release-please `CHANGELOG.md` entry mention `promptSnippet`).
  No warnings.
- **Release shape at ship time:** three `fix:` commits across three components, so the next release-please PR carries a patch release for each of `pi-subagents`, `pi-github-tools`, and `pi-colgrep`.

[#90]: https://github.com/gotgenes/pi-packages/issues/90
[#152]: https://github.com/gotgenes/pi-packages/issues/152
[#437]: https://github.com/gotgenes/pi-packages/issues/437
[#640]: https://github.com/gotgenes/pi-packages/issues/640
