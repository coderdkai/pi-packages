---
issue: 746
issue_title: "pi-permission-system: agent-facing and review-log renderers over the prompt payload"
---

# Retro: #746 — pi-permission-system: agent-facing and review-log renderers over the prompt payload

## Stage: Planning (2026-08-16T16:44:39Z)

### Session summary

Planned Phase 13 Step 4 — the last two `message` consumers become renderers over the `PromptPayload`.
Three design decisions were put to the operator and settled: the agent-facing denial text names the flagged element but never the command; the review log records structured request facts with a uniform width bound applied at the `writeLine` choke point; and `DenialContext` dissolves into `PromptPayload`.
The plan landed as `docs/plans/0746-agent-and-review-log-renderers.md` with eight TDD steps, two of them breaking.

### Observations

- The first `ask_user` on the agent-text question was bounced: the operator asked for the agent's correlation need to be addressed before choosing.
  Answering it took a source trace rather than an argument — an `Explore` subagent on the sibling Pi checkout (`9d2ec7ffa`) established that a block reason becomes an error tool result stamped with `toolCallId` (`packages/agent/src/agent-loop.ts:637-641, 779`), pairs correctly under parallel tool calls (`489-532`), and travels alongside the assistant message's retained arguments (`195, 219-221, 295`).
  Correlation is structural, so the renderer never needed to echo input for identification.
  The residual — *which operand* of a multi-token bash call tripped the gate — is below tool-call granularity, and that is what option B (flagged element, never the command) buys.
- The second `ask_user` was also bounced: options carrying worked examples in their `preview` panes were not enough.
  What landed was seven scenarios in a plain message, each showing the originating tool call above the current text and the three candidate renders.
  The lesson generalizes the `AGENTS.md` clarification-gate rule: for a wording change, the substance is the before/after *paired with its input*, not the option list.
- Log numbers were measured, not estimated, from the operator's live 7.07 MB review log: `message` is 21.5%, `command` 20.2% (largest single value 72 KB), `toolInputPreview` 0.1%.
  Removing `message` and capping at the existing 1000-character bound saves 28.7% and shortens 4.3% of command entries.
  The measurement is what showed that dropping `message` alone leaves half the growth unconfigured — `command` would still be unbounded — which is why the cap went to the writer rather than the renderer.
- `DenialContext` dissolves cleanly because every field it holds that the payload lacks is a field ADR 0011 §7 forbids rendering (`bash_path.command`, `tool.input`, the latter already unread).
  The one real gap was `check.reason`, the operator's `deny`-with-reason string, which `GateRunner` holds at message-construction time — passing it as an argument both closes the gap and generalizes it beyond the tool/bash arm, which is a small behavior fix riding step 3.
- The default `reviewLogFieldMaxWidth` (1000) is not a new number: it is today's `TOOL_INPUT_LOG_PREVIEW_MAX_LENGTH`, whose own doc comment says it holds "until [#746] lands the log's own renderer".
  Moving it to the writer lets `ToolPreviewFormatterOptions.toolInputLogPreviewMaxLength` go, so the log has one bound instead of one bound plus an unbounded remainder.
- Largest identified risk: deleting `test/presentation/legacy-message.test.ts` removes the standing proof that the payload is complete (Step 1's `Landed:` note calls that suite the proof).
  The plan makes migrating the three payload-builder suites to per-field assertions the gating deliverable of the deletion step rather than a follow-up.
- The flagged-element decision is a documented departure from a literal reading of §7's "needs no separate size bound".
  Recorded at the module declaration and in the roadmap `Landed:` note, following the precedent Step 2 set for §3 against §5, rather than amending an accepted ADR.
  Left in Open Questions for a later ADR pass.

[#746]: https://github.com/gotgenes/pi-packages/issues/746
