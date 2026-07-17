---
package: pi-subagents
phase: 21
---

# Retro: pi-subagents — Phase 21 Planning (classification-resume-model-boundary)

## Stage: Improvement Planning (2026-07-17T16:00:00Z)

### Session summary

The cause hypothesis was that after 20 phases the declared target architecture is essentially reached, with the untyped SDK model boundary (`ParentSnapshot.model: unknown`, Phase 20 Step 4's explicit deferral) as the main first-principles residue.
Discovery corroborated that and surfaced two stronger already-filed causes — status classification re-derived outside `SubagentState` (#563) and the resume-bypasses-completion-channel bug (#466) — so the phase shape chosen is a lean three-step phase, not a deferral.

### Observations

- The phase spine is the tell-don't-ask pair: Step 1 (#563, predicates on the status owner) soft-feeds Step 2 (#466, unify the dual completion channels); Step 3 (model boundary typing) is a fully independent SDK-boundary track.
- Deferral-gate outcome: the gate did not fire — three cause-level Category C findings survived — but the nine-step ceiling was deliberately not filled; the craftsmanship scout's inventory (both fallow "giant test file" flags refuted; only scattered polish such as `mock.calls[N][idx]` indexing and the `settings.ts` `sanitize()` triplication) was handed to the `tidy-first` boy-scout path rather than manufactured into a step.
- Scout calibration checkpoint run 2 passed clean: spot-checks of the `mock.calls` concentrated cluster (`test/lifecycle/subagent.test.ts:524`) and the `createManager` adjudication (confirmed-but-minor `??`-inflation) matched my own read.
  Per the checkpoint's own terms, the calibration callout in the `/plan-improvements` template can now be removed.
- Feasibility probe reshaped Step 3's confidence, not its shape: `ExtensionContext.model: Model<any> | undefined` and `ModelRegistry` verified in the SDK `.d.ts`, and `model-resolver.ts` already imports `Model<any>` — the outcome (7 → 0 `unknown` sites) is deliverable.
- Doc/tracker drift found and fixed in the roadmap commit: the architecture doc claimed #22 was the only open issue; #22 is closed and 10 labeled issues were open.
- Explicit dispositions recorded for silently-skipped issues (second sweep): #451 deferred as repo-level CI tooling; #465/#482/#608/#519/#600/#610 deferred as feature/cross-package tracks, with #466 noted as the prerequisite for #465's ask-back design.
- Issue filing is pending: #563 and #466 exist; Step 3 needs a new issue plus doc back-links — deferred by the user to a later session/model.
- A background `craftsmanship-scout` dispatch lost its agent handle (`Agent not found` on result retrieval); a foreground re-dispatch worked.
  Worth watching whether background subagent cleanup is racing result retrieval.
