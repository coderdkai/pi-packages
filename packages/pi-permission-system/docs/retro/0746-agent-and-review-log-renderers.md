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

## Stage: Implementation — TDD (2026-08-16T18:06:00Z)

### Session summary

Executed all eight planned TDD cycles plus two tidy-first preparatory commits and a post-review cleanup — twelve commits.
The agent-facing denial text and the review log became renderers over `PromptPayload`, `DenialContext` and `legacy-message.ts` were deleted, and `reviewLogFieldMaxWidth` now bounds every review-log value at the `writeLine` choke point.
Test count went 3009 → 3010 across a much larger churn than that suggests: 1072 lines of test deleted (`denial-messages.test.ts`, `legacy-message.test.ts`) against four new suites and three migrated ones.

### Observations

- Two deviations from the plan, both improvements the plan's own shape surfaced.
  The plan had each of the seven gates spread `renderReviewLogFacts(payload)` into its `logContext`; the `makeDescriptor` fixture that would have had to restate that spread is what showed it belongs in `GateRunner`, beside the `agentName`/`requestId` stamp — a gate cannot forget what it never supplies.
  Second, `flaggedElementLabel` had to split into `valueLabel` (labels `request.value`, for the dialog) and `flaggedElementLabel` (labels what `flaggedElements` returns, for the agent renderer); they differ only for `bash_external_directory`, whose value is the command while what it flags are paths.
  The extraction had silently conflated two functions that only look alike.
- The tidy-first assessor's two commits paid for themselves in step 7.
  Converging `gate-fixtures.ts` onto a shared `makeGatePromptDetails` meant removing the required `message` field touched one fixture line instead of two hand-rolled literals, and collapsing `makeDenialDescriptor` removed a factory whose only purpose was supplying the union being deleted.
  The assessor also correctly *rejected* extracting a shared gate-descriptor assembler — the seven builders' `denialContext` blocks were about to be deleted, and there is nothing to extract before a deletion.
- The `renderUnavailableDenial` wording forced a decision the plan had not anticipated: the boundary clause (`outside working directory '/repo'`) reads badly in the "requires approval" sentence.
  Resolved by omitting it — no retry shape changes the fact that no human is reachable — and pinned with an explicit test so the omission is a decision rather than an accident.
- One test-fixture bug of my own making: the first runner Red used a `kind: "tool"` payload carrying a path value, and the renderer dutifully produced `for tool '/etc/passwd'`.
  A payload literal can be internally incoherent in a way no production builder would produce; the fix was making the fixture coherent, not the renderer tolerant.
- Deleting `test/presentation/legacy-message.test.ts` removed the standing proof that the payload is complete, which the plan flagged as the largest risk.
  The three payload-builder suites migrated from `renderLegacyMessage(...).toContain(...)` to direct payload-field assertions — strictly stronger, since a builder test matching a downstream render can pass while a field it never reads is wrong.
- The `/dev/null`-style live demonstration: an early `Write` to a mistyped path outside the repo was denied by this very extension, and its denial text (`User denied external directory access for tool 'write' path '…'`) is exactly the shape this issue replaces.
- Pre-completion reviewer: **WARN** on the first pass, **PASS** on re-review.
  The WARN named four stale doc references and two dead test fields; grepping exhaustively per the AGENTS.md guidance found nine sites rather than four, all fixed in one commit (`53647b2b`).
  The reviewer also flagged two `composition-root.test.ts` timeouts under the parallel root run and correctly diagnosed them as contention flakiness, not a regression — both pass in isolation.
- Measured outcome: `renderLegacyMessage` in `src/` went 17 → 0, and the predicted 28.7% review-log reduction rests on the same live 7.07 MB log the plan measured.

[#746]: https://github.com/gotgenes/pi-packages/issues/746
