---
issue: 737
issue_title: "pi-permission-system: decide the prompt-presentation contract — invariant core, elision rules, size bounds (ADR)"
---

# Retro: #737 — decide the prompt-presentation contract

## Stage: Planning (2026-08-14T17:14:32Z)

### Session summary

Planned ADR 0011, the prompt-presentation contract keystone (K3 from the 2026-08-12 backlog triage), which decides what a permission ask prompt must always show, what may be elided, and what bounds its size.
Read the six dependants ([#710], [#713], [#648], [#654], and PRs [#656], [#716]), traced the five prompt-assembly sites and the four consumers of the flat `message` string, and ran an `ask_user` gate that widened the ADR's scope on three axes.
The plan is documentation-only, follows the [#639]/ADR-0009 posture (survey → verify → `ask_user` gates → prose), and is committed at `packages/pi-permission-system/docs/plans/0737-prompt-presentation-contract-adr.md`.

### Observations

Operator decisions at the `ask_user` gate, all widening scope relative to the issue body:

- Deliverable is **ADR only** — no code, all six dependants stay open.
- The contract governs **four** consumers, not one: the TUI dialog, the review log, the `permissions:ui_prompt` broadcast, and the agent-facing `denial-messages.ts` text.
- A **structured payload** replacing the flat `message: string` is a live option, with its breaking implications (forwarded wire, `ui_prompt` payload) priced into the ADR rather than excluded.
- The ADR ends with a **per-item staging verdict** for all six dependants, so the follow-up `/pr-review` sessions apply a recorded decision.

Measured findings that shaped the plan (all verified against `main` this session):

- The bash branch of `formatAskPrompt` interpolates the raw command with **no cap at all**; the two configurable caps govern only the non-bash JSON/search previews.
  So [#710]'s unbounded prompt was never a misconfiguration — nothing bounded it.
- A forwarded ask is assembled **twice under two configs** (child assembles, parent prefixes), so "consistent across local and forwarded asks" is structurally unattainable while the payload is a pre-assembled string.
  This is the strongest argument in the option space for the structured payload (O4).
- `message` rides into the review log **unredacted** — `redactedJsonStringify` masks by key name and `message` is not a sensitive key.
  Today that caps at ~200 characters of tool input; PR [#716], which removes that truncation for pretty-printed JSON, would make the review log persist unbounded unredacted input.
  Neither the PR nor [ADR 0010] anticipated this interaction, and it is now a named finding the ADR must rule on.

Two facts deliberately left unverified and pushed to Build Order step 1 (with an `Explore` subagent on `sonnet-5`): whether Pi renders a pending tool call in the transcript at gate time, and whether `app.tools.expand` ([#642]) can reach anything for a forwarded ask.
The plan marks both as inferences from the wiring, not measurements, because parameter 3 (how the user reaches the full text) depends on the answer and an assumed answer would silently pick an option.

Risks carried: the [#581] transcription failure (mitigated by survey-then-gates-then-prose ordering and marking every leaning reopened), and the risk of an unenforceable-prose contract (mitigated by requiring each rule to name its conformance mechanism).
Option O6 — "no bound; the TUI's wrapping is the bug" — was added deliberately as the counter-hypothesis to [#710], so the ADR cannot ratify a content contract without first rejecting the viewport fix.

No follow-up issues filed: every deferred item already has an issue, and the plan names no new concrete work.

## Stage: Implementation — Build (2026-08-14T19:01:55Z)

### Session summary

Executed the docs-only Build Order in four commits: verified the two open facts against the sibling Pi checkout, surveyed prior art, ran three `ask_user` deliberation rounds settling all eight open parameters, authored ADR 0011, and reconciled `docs/architecture/architecture.md`.
The ADR decides a single rule — the payload is complete and elision is a property of a render, never of the payload — with an invariant `request` fact group, a row-plus-width render budget, five renderers, and a per-item staging verdict for all six dependants.
Pre-completion review returned WARN on one real gap, which was fixed, and PASS on re-review.

### Observations

Fact verification changed the design before the gates ran, which is why the plan put it first.
The host already renders the pending tool call above our dialog (`ToolExecutionComponent` is added on `message_update`, before `beforeToolCall`), it renders `$ <full command>` unbounded for `bash`, and it computes a real diff for a pending `edit` — so [#648] is partly host-provided already.
`ToolRenderContext.expanded` reaches the *call* renderer, not just the result renderer, so [#642]'s Ctrl+O genuinely expands a pending `write`/`read` and does nothing for `bash`/`edit`.
Both plan inferences about the forwarded case were confirmed: no host block exists, so the prompt is the sole evidence carrier there.

The operator's round-1 note reframed the whole ADR: rather than choosing among content rules, carry a complete payload and make elision a rendering concern.
That single move dissolved the forwarded double-assembly problem, turned [#716] into a renderer rather than a formatter edit, and made [#656]'s post-assembly truncation the wrong layer rather than the wrong number.
[#713] was promoted from enhancement to conformance requirement, corroborated by a Codex user report of an approval dialog showing only the text before `&&`.

Prior art was unusually decisive.
Codex merged "tui: fix approval dialog for large commands", moving the command preview out of the dialog into history.
Claude Code carries both "render multi-line bash args in full" and "a subagent's large inline payload froze the terminal" as open reports — the two directions of [#716] and [#710] in one product, which is the empirical case that content rules alone cannot satisfy both.
Its `Ctrl+E` explanation (on-demand, risk-labelled, disableable) is [#654]'s shape already shipped elsewhere.

Two deviations from the plan's two-commit Build Order, both recorded in commit bodies.
First, reconciling the architecture doc surfaced a contradiction the ADR had just introduced: it gave the `permissions:ui_prompt` broadcast the complete payload while the doc's own rule gives the bus the minimum needed to stay correlatable.
That was surfaced to the operator rather than papered over, narrowed to request facts, and committed separately.
The same exchange found the "Fidelity up, disclosure down" maxim genuinely ambiguous — it reads as one tradeoff dial but means two imperatives for two audiences — and replaced it.
Second, the pre-completion WARN required a fourth commit.

The WARN was worth the round.
The invariant core named only the requesting agent, so an implementer narrowing the broadcast literally would have dropped `requesterSessionId` — the correlation field [#292] added, [#610] builds on, `docs/cross-extension-api.md` documents, and `permission-events.ts` guarantees against removal without a semver-major bump.
The ADR now states that requester identity is a request fact rather than evidence, so narrowing evidence never narrows correlation.

One naming decision worth carrying forward: the never-elided group is `request`, not `core`, because it should be named for what it holds rather than for its contract.
No follow-up issues filed — all six dependants already have numbers, and the ADR's staging table records what each becomes.
The seam itself has no issue yet: following the ADR 0007 precedent, the staging section defers its decomposition to the next `/plan-improvements pi-permission-system` pass, which files the concrete issues and sequences this work against the [#639] and [#686] keystones.

[#686]: https://github.com/gotgenes/pi-packages/issues/686

[#292]: https://github.com/gotgenes/pi-packages/issues/292
[#581]: https://github.com/gotgenes/pi-packages/issues/581
[#610]: https://github.com/gotgenes/pi-packages/issues/610
[#639]: https://github.com/gotgenes/pi-packages/issues/639
[#642]: https://github.com/gotgenes/pi-packages/issues/642
[#648]: https://github.com/gotgenes/pi-packages/issues/648
[#654]: https://github.com/gotgenes/pi-packages/issues/654
[#656]: https://github.com/gotgenes/pi-packages/pull/656
[#710]: https://github.com/gotgenes/pi-packages/issues/710
[#713]: https://github.com/gotgenes/pi-packages/issues/713
[#716]: https://github.com/gotgenes/pi-packages/pull/716
[ADR 0010]: ../decisions/0010-permission-log-secret-exposure.md
