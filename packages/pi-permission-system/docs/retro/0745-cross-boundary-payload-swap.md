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

[#710]: https://github.com/gotgenes/pi-packages/issues/710
[#744]: https://github.com/gotgenes/pi-packages/issues/744
[#746]: https://github.com/gotgenes/pi-packages/issues/746
[#751]: https://github.com/gotgenes/pi-packages/issues/751
