---
issue: 628
issue_title: "pi-permission-model-judge reaches the model but defers on parse-failed — force a structured tool call"
---

# Retro: #628 — pi-permission-model-judge reaches the model but defers on parse-failed — force a structured tool call

## Stage: Planning (2026-02-14T00:00:00Z)

### Session summary

Produced a numbered TDD plan for replacing `reviewPath`'s free-text `JSON.parse` (`src/model-review.ts`) with a forced structured tool call.
The design hands the model one `report_verdict` tool, forces it with `toolChoice: "any"`, and reads the first `toolCall` content part by position — eliminating the `parse-failed` defer reason by construction.
Verified every SDK claim in the issue against the installed `@earendil-works/pi-ai` before committing to the design.

### Observations

- **SDK verification confirmed the issue's claims.** `providers/anthropic.js` `convertTools` reads only `parameters.properties` / `parameters.required` (plain JSON-Schema object works); `toolChoice` string → `{ type: <string> }`, so `"any"` forces a tool unnamed; `ToolCall.arguments` is `Record<string, any>`; under OAuth both tool defs and reply blocks are name-rewritten via `toClaudeCodeName`, so reading the reply's tool call **by position** (not name) is load-bearing, not incidental.
- **`toolChoice` is not on `StreamOptions`** — it rides through `ProviderStreamOptions = StreamOptions & Record<string, unknown>`.
  The injected `CompleteFn` seam is narrower, so the plan adds `toolChoice?: string` to its options bag.
- **The `Tool` cast is the one type friction.** `Tool.parameters` is `TSchema` (typebox-branded), which a plain object does not structurally satisfy; planned `as unknown as Tool` and flagged `pnpm run check` as the gate (the issue's `as Tool` may not typecheck).
- **Classified non-breaking.**
  `deferReason` (`parse-failed` → `no-tool-call`) lives only in a diagnostic review-log line, not config or a public API; the `config.example.json` strict-JSON directive becomes moot (not broken) under the forced tool, so no operator edit is needed on upgrade.
  Commit as `fix:`.
- **Cross-file fixture coupling drove the TDD order.**
  Flipping `reviewPath` to read tool calls breaks the text-JSON fixtures in `typo-reviewer.test.ts` and `extension.test.ts` at runtime in the same commit, so the plan folds all three test files' fixture updates into the single green commit and calls for the full package suite (not just `model-review.test.ts`) before committing.
- **Invariants at risk pinned to named tests** — #625 auth forwarding, #626 decision trail, ADR 0007 defer-always — each mapped to an existing test that survives with only a fixture-shape change.
- No `ask_user` gate: operator's own issue, unambiguous proposal, SDK facts verified.
  No follow-ups deferred.
