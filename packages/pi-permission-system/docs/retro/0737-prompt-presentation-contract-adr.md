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

[#581]: https://github.com/gotgenes/pi-packages/issues/581
[#639]: https://github.com/gotgenes/pi-packages/issues/639
[#642]: https://github.com/gotgenes/pi-packages/issues/642
[#648]: https://github.com/gotgenes/pi-packages/issues/648
[#654]: https://github.com/gotgenes/pi-packages/issues/654
[#656]: https://github.com/gotgenes/pi-packages/pull/656
[#710]: https://github.com/gotgenes/pi-packages/issues/710
[#713]: https://github.com/gotgenes/pi-packages/issues/713
[#716]: https://github.com/gotgenes/pi-packages/pull/716
[ADR 0010]: ../decisions/0010-permission-log-secret-exposure.md
