---
issue: 689
issue_title: "pi-subagents: /subagents:sessions becomes unresponsive on large live transcripts"
---

# Retro: #689 — Make the `/subagents:sessions` preview viewport-bound

## Stage: Planning (2026-08-10T21:09:23Z)

### Session summary

Planned the fix for the `/subagents:sessions` overlay becoming unresponsive on large live transcripts.
Issue #689 and PR [#690] are both third-party (`@daoguademeng`), and PR [#670] (`@aqua2k1`) independently reports the width-mismatch half — so the session began by verifying the diagnosis by measurement rather than trusting either PR body, then researched Pi's own event ordering at `../pi` before putting the depth decision to the operator.
The plan lands in five code steps plus a docs step: fix the input/render width mismatch, extract a `TranscriptContent` collaborator, make paint and scroll viewport-bound, stop rebuilding history per streaming delta, and settle messages incrementally.

### Observations

Measurement came before the `ask_user` gate, and it changed the question.
A scratch Vitest fixture (200 messages, width 144, `Container.render()` counted by prototype spy) put current `main` at 90.5 ms per scroll interaction and 44.7 ms per settle, scaling linearly (170 ms/settle at 800 messages).
Applying PR [#690]'s two commits to a scratch tree and re-running the same fixture produced the after-numbers directly, so every figure in the plan's table is measured on both sides rather than quoted from the PR.

The first `ask_user` bounced on depth — the operator asked whether Pi itself needed researching before choosing.
It did, and the answer flipped the risk assessment.
An `Explore` subagent on `../pi` (HEAD `98145a6c0`) confirmed three things that made the deeper option the safer one: `message_end` fires per message for **every** role including each tool result (so the ~45 ms settle is the dominant cost on a tool-heavy agent, projecting to ~225 ms on the reported session); the state-before-listeners ordering is real (`agent.ts:556` before `:588`); and Pi's own interactive mode already settles incrementally (`interactive-mode.ts:3120`–`3192`), so the design mirrors Pi rather than inventing a model.

Two findings simplify our version relative to PR [#690].
A partial assistant message lives in `state.streamingMessage` and is never in `state.messages` (`agent.ts:552`), so the PR's `isLiveMessage` / timestamp-matching guard defends a state that cannot occur and is dropped.
And an extension's in-place `message_end` replacement is applied *before* session listeners are notified (`agent-session.ts:634` before `:637`), so the overlay always consumes final content — a risk the PR body does not address at all.

One incidental discovery reframes the whole change: pi-tui's `Markdown` already caches rendered lines per width (`markdown.ts:248`), while `Container.render` does not cache.
So a rebuild is expensive chiefly because it *discards* pi-tui's own caches by constructing fresh components — incremental settling is "stop throwing pi-tui's cache away," not a new caching layer.

Decisions: adopt-and-reimplement (matching the [#661]/[#662]/[#674] precedent, and explicitly invited by the PR author); full depth; extract `src/ui/transcript-content.ts` rather than growing `TranscriptOverlay` to ~590 lines (also chosen with [#695]'s steering request in mind, since it would build on this substrate); and land the width fix as an independent first commit so [#670] is separately attributable and revertable.

Rejected: merging either PR directly, and the "viewport-bound only" option — the latter fixes the frozen-keys symptom but leaves a ~225 ms hitch at every tool completion on the reported session, which is the same complaint with a different trigger.

No follow-up issues filed.
Both Open Questions are deliberately unfiled: the streaming-activity row's ownership is a revisit-if-[#695]-needs-it note, and a width-keyed cache on pi-tui's `Container` is an upstream question worth raising only if a second consumer here needs it.

Note for the implementation session: the two performance pins (`vi.spyOn(Container.prototype, "render")` call counts, and a zero `getMessages` call count across paints and scrolls) are deliberately white-box.
They are the only assertions that can catch a silent return to per-frame rebuilding, and they should stay isolated in their own `describe`.

[#661]: https://github.com/gotgenes/pi-packages/issues/661
[#662]: https://github.com/gotgenes/pi-packages/issues/662
[#670]: https://github.com/gotgenes/pi-packages/issues/670
[#674]: https://github.com/gotgenes/pi-packages/issues/674
[#690]: https://github.com/gotgenes/pi-packages/issues/690
[#695]: https://github.com/gotgenes/pi-packages/issues/695
