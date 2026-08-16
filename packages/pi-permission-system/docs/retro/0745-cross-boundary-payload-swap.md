---
issue: 745
issue_title: "pi-permission-system: replace the forwarded-request and ui_prompt message with the structured payload"
---

# Retro: #745 — replace the forwarded-request and ui_prompt message with the structured payload

## Stage: Planning (2026-08-15T16:41:25Z)

### Session summary

Planned Phase 13 Step 3: the payload replaces `message` on the forwarded-request wire and the `permissions:ui_prompt` broadcast, and the two tool-preview caps are soft-deprecated.
The plan lives at `packages/pi-permission-system/docs/plans/0745-cross-boundary-payload-swap.md` and lays out six steps — three additive/lift-and-shift, two breaking removals, one docs — plus a re-pinned quantitative invariant from [#710].
Filed [#751] for the `select`/`input` fallback's complete-view capability, which [#710]'s plan had parked here without this step actually resolving it.

### Observations

- **Three design choices went to the operator, all decided.**
  The broadcast nests the payload's `request` group verbatim (over flat core facts or a bare `message` removal), so a fact added to `PromptRequestFacts` reaches the bus without a second hand-maintained declaration — the same "cannot drift" argument that made `PromptPermissionDetails.payload` required in [#744].
  Version skew is a **clean drop**: the wire type loses `message` entirely and the reader stops reconstructing it, so a skewed ask renders from `surface` / `value` / provenance.
  The preview caps stop honoring configured values but keep their built-in constants, deferring the un-cap to [#746].
- **— mattered.**
  **The operator's follow-up question — "does the `request` object itself have an `id`?"**
  It does not; `PromptRequestFacts` carries no id, so `requestId` stays top-level as the correlation key with no overlap.
  Worth confirming again at implementation time if the guard's shape changes.
- **The serving-node render needed no new code**, which was not obvious from the issue text.
  `LocalUserAuthorizer` already hands `details.payload` to `requestPermissionDecision`, so "the parent renders under its own budget" follows from carrying the payload.
  What was missing was facts, not a renderer.
- **A forced-atomicity trap was avoided by lift-and-shift.**
  `buildForwardedAskPayload` reads `request.message` today, so removing the field and switching the serving node in one commit would have been unavoidable.
  Adding `payload` alongside first splits it into three tractable steps.
- **The tolerant `asX` reader is the silent-drop hazard** (the #558 class).
  `readForwardedPermissionRequest` reconstructs an allowlist, so an added `payload` is dropped unless taught — and its required-core gate currently demands `typeof parsed.message === "string"`, which must relax or a current child's request is rejected outright.
  `asPromptPayload` goes beside its type in `prompt-payload.ts`, following `isPermissionDecisionState`'s precedent, not in the distant reader.
- **The asymmetric skew direction is unavoidable and was made explicit.**
  An *old* parent rejects a *new* child's request and deletes it; the child abandons at the 10-minute timeout with `confirmationUnavailable`.
  Safe direction, slow — so the migration note says upgrade the parent first.
  Only reachable for an out-of-process child (`source: "env"`).
- **The [#710] row-budget invariant is quantitative and its existing test does not cover the new shape.**
  The pin renders a hand-built `kind: "forwarded"` payload; after this change the same ask arrives as `kind: "bash"` with real evidence — different input to the same budget.
  Step 2 asserts the new shape *before* the old case is edited, so the number is measured rather than argued.
- **Release is deliberately deferred.**
  Batch "presentation-contract" tail is [#746], which lands the review-log renderer that bounds what an un-capped payload would otherwise persist.
  Releasing at Step 3 would publish a major bump whose migration note is only half true.
- **Scope decision worth revisiting if [#746] slips:** the payload's tool-input evidence is still truncated at the built-in 200 characters, so it is not yet "complete by contract" for a non-bash tool ask.
  That residual is knowingly carried and ships in the same release.

### Addendum — request-id observability (same session)

An operator question after the plan commit — "should every request have an ID when it gets created?"
— opened a gap the phase sweep had missed, and reshaped part of this plan.

- **Traced and measured before answering.**
  There is no permission request id: three conventions (borrowed `toolCallId` at `runner.ts:162`, minted `skill-input-…` at `skill-input-gate-pipeline.ts:86`, a third minted at `approval-escalator.ts:253` that discards the one it was handed), and the id attaches inside `promptForApproval`, so no non-prompting resolution carries one.
  `PermissionDecisionEvent` carries none ever.
  Review-log measurement (7.3 MB, 9 417 entries; last 14 days = 766): 452 entries carry `toolCallId` but never `requestId`, and 53 of 57 `forwarded_permission.request_created` ids appear on no `permission_request.*` entry.
- **The first cost estimate was wrong and the operator's follow-up corrected it.**
  I initially framed the mint as the risky, identity-dependent part and the wire join as nearly free.
  Once the operator committed to "our own id, keep passing `toolCallId`", re-measuring showed the mint is the *cheapest* piece — the two-field shape already exists on `PromptPermissionDetails`, `GateRunner.run` already takes `toolCallId` separately, and the change is largely one line plus a net deletion of `createSkillInputRequestId`.
  Lesson: measure the change's real footprint before ranking options by cost, not after.
- **Two `ask_user` answers came back in tension** ("mint slice before this issue" vs "[#610] at Step 9, after Step 4").
  Surfacing the contradiction rather than reconciling it silently was right — the resolution was a third deliverable needing its own home, which no option had offered.
- **A third-party issue was mishandled and then corrected.**
  I retitled [#610] (filed by `hcrosse`) to cover mint-at-creation, then split the mint into [#752] and restored the original title, which described the narrowed scope accurately all along.
  Retitling someone else's issue ahead of a settled decomposition was premature; the body was correctly left untouched throughout.
- **Net roadmap change:** Phase 13 gains Step 9 ([#752], the minted id) and Step 10 ([#610], cross-session correlation), plus a Track E sequencing note — step numbers are discovery order, and Step 9 runs before Step 3.
  This plan gained a second TDD step for `requesterRequestId` and a `Sequencing` subsection.
- **[#610]'s original sweep disposition was wrong**, and the roadmap now records why: it was swept out as a feature issue on its symptom without the cause being traced.
  Worth carrying into the next `/plan-improvements` sweep as a check — a user-reported observability gap may be a structural finding wearing a feature label.

### Addendum — the `requesterRequestId` step was retired by [#752] (2026-08-15)

[#752] has landed and released, and it closed the correlation gap at the source rather than on the wire: `ParentAuthorizer` stopped minting a third id and now writes `details.requestId` as the forwarded request's `id` (`forwardableRequestId`, `3f8d3fd6`).
So `ForwardedPermissionRequest.id` **is** the child's request id, and the `requesterRequestId` field this plan had gained would have named the same value twice.

- **The stale instructions were the real hazard, not the stale design note.**
  A "superseded by [#752]" paragraph had been added to the design section, but the Module-Level Changes rows, the test-expectations row, and TDD step 2 still instructed adding the field.
  A plan that says "do not do this" in one section and "do this" in three others resolves, for an implementation session reading top to bottom, as "do this".
  Excised the instructions and renumbered the TDD order 1–6; the historical rationale stays in one clearly-labelled paragraph.
- **Predicting a dependency's shape is what went wrong.**
  The field was designed while [#752] was still unplanned, on the assumption that it would mint an id and leave the wire's own id alone.
  It did something better that this plan could not have specified.
  The cheaper move would have been to name the correlation gap and defer the mechanism to whichever issue landed first.
- **One residual is now recorded rather than absorbed.**
  `forwardableRequestId` falls back to a fresh mint when an inbound id could not safely name a file, and in that case the join breaks for that exchange.
  It is [#752]'s residual, needs no contract change (log both ids on `forwarded_permission.request_created`), and sits in this plan's Open Questions for Step 10 ([#610]) to decide.
- **Anchors re-verified against the post-[#752] tree** before handing off: both `message: string` metric baselines still `1`, `architecture.md` line 388 unmoved, the [#710] here-string pin present, `forwarded-ask-payload.ts:42` still reading `request.message`, and `requesterRequestId` absent from `src/` and `test/`.
- **The reconciliation took two passes, and the second one is the transferable lesson.**
  The first swept for the symbol `requesterRequestId` and cleaned six sites.
  A full re-read then found a seventh in Goals — "the forwarded request carries the child's originating `requestId`, and the child's `forwarded_permission.*` review entries name it" — which describes the same retired work in prose without ever naming the field, so no symbol grep could match it.
  When retiring planned work, sweep for the *concept* (`requestId`, `correlation`, `join`, `shared key`) as well as the identifier, and re-read the sections a grep does not lead you to.
  This is the doc-side twin of AGENTS.md's "a step that reworks documented behavior carries no removed symbol to match".

### Handoff state (verified 2026-08-15)

The plan is self-consistent and authoritative for `/tdd-plan`: six TDD steps, no identity work, all anchors verified against the current tree.
Nothing is in flight — working tree clean, [#752] landed and released, [#721] (the other `approval-escalator.ts` editor) not started.
The green baseline has **not** been run this session; `/tdd-plan` owns that gate.

[#610]: https://github.com/gotgenes/pi-packages/issues/610
[#710]: https://github.com/gotgenes/pi-packages/issues/710
[#744]: https://github.com/gotgenes/pi-packages/issues/744
[#746]: https://github.com/gotgenes/pi-packages/issues/746
[#751]: https://github.com/gotgenes/pi-packages/issues/751
[#752]: https://github.com/gotgenes/pi-packages/issues/752
