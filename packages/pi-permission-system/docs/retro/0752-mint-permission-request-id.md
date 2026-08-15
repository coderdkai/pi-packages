---
issue: 752
issue_title: "pi-permission-system: mint a permission request id at creation and carry it on every decision"
---

# Retro: #752 — mint a permission request id at creation and carry it on every decision

## Stage: Planning (2026-08-15T22:09:34Z)

### Session summary

Planned Phase 13 Step 9: one minted `perm-<randomUUID()>` per permission request, created in `GateRunner.run`, carried on all four of the runner's review-log write paths and added to `PermissionDecisionEvent`.
The plan lives at `packages/pi-permission-system/docs/plans/0752-mint-permission-request-id.md` and lays out five steps — four `feat:` cycles and one docs commit.
Filed [#753] for the gate-error path's missing `permissions:decision`, which surfaced while settling the boundary question.

### Observations

- **Three of the issue's own claims did not survive reading the code, and the plan corrects each.**
  There are **four** non-prompting review-log writes, not three — `policy_denied` is written by `applyPermissionGate` from the `logContext` the runner hands it.
  There is **one** `GateBypass.decision` literal, not three; the other two bypasses carry only a `log`, and the `decision: { surface, value }` on a descriptor is an unrelated two-field shape.
  And `GateRunner.run`'s third parameter is **deleted**, not narrowed to `string | null`: `requestId: toolCallId` at `runner.ts:162` is its only reader, so once the runner mints its own id the parameter has nothing left to do.
- **Four decisions went to the operator; two produced follow-up questions that changed the answer.**
  Format, the forwarding edge's third mint, the transcript join, and the gate-error boundary.
  The operator's "what about UUIDv7?"
  was worth chasing: `crypto.randomUUID({ version: 7 })` does **not** throw, it silently ignores the option and returns a v4 — verified by reading the version nibble of the returned id on Node v26.7.0.
  Node has no v7 at any version this package supports (`engines: >=22`).
- **found a real gap the issue had not named.**
  **"We don't emit any events for blocked requests yet?"**
  Policy denials and user denials both emit `permissions:decision`; the gate-error path writes a review entry and emits nothing, and its `tracer.debug` call sits inside the `try` so it is skipped too.
  That became [#753] rather than scope creep here.
- **The roadmap's own health-metric row is unreachable as written.**
  `Ad-hoc request-id mint sites: 2 → 1` recomputes as `grep "Math.random().toString(36)"`, which goes 2 → **0** under this design since both ad-hoc mints are deleted and the replacement uses `randomUUID`.
  The row's intent survives; the command is corrected in the plan's doc step.
  Measuring the baseline at planning time is what caught it.
- **The adoption decision has a cross-plan consequence that needed recording, not just noting.**
  With the forwarding edge adopting `details.requestId` as the wire `id`, [#745]'s planned `requesterRequestId` field is redundant.
  The plan lists an amending note to that committed plan as a deliverable, rather than leaving a superseded TDD step in a document a later session will follow.
- **Adoption newly exposes an inbound id as an outbound filename**, at a relay hop, where `forwarding-io.ts` validates only `typeof parsed.id === "string"`.
  A filename-safety guard with a mint fallback is in the design; the exposure on the response-write side is pre-existing and left alone.
- **Minting inside the fail-closed `catch` needed care.**
  The `catch` in `tool-call-boundary.ts` must not throw — the SDK's `emitToolCall` does not catch a throwing handler, so a throw there means the command runs ungated.
  Today the block is unprotected but throw-free by construction (the logger swallows its own IO errors); adding a mint changes that, so the recording work gets a nested swallowing `try` and the `{ block: true }` return stays unconditional.
- **Not breaking, but one value changes.**
  `permissions:ui_prompt.requestId` stops equalling the SDK `toolCallId`.
  The documented contract ("Unique ID for the permission request being prompted") is preserved and the old value was not even unique per request — one tool call raises up to six.
  `feat:` with a changelog note, not `feat!:`.

## Stage: Implementation — TDD (2026-08-15T22:47:48Z)

### Session summary

Four TDD cycles plus one tidy-first prep commit and one docs commit, all five plan steps landed as written.
Test count went 2978 → 2994 (+16: eight new runner request-identity cases, two `createPermissionRequestId` cases, three boundary cases, two forwarding-adoption cases, one decision-event case, minus the two deleted `createSkillInputRequestId` cases).
Pre-completion reviewer: **PASS** — no warnings.

### Observations

- **The plan's three corrections to the issue all held up in code**, and the roadmap `Target:` text was corrected to match.
  Four non-prompting write paths, not three; one `GateBypass.decision` literal, not three; and `run`'s third parameter deleted rather than narrowed.
  Writing those into the plan before implementing meant the TDD steps had nothing to renegotiate.
- **The tidy-first assessor's second recommendation was declined, and the reason generalizes.**
  It proposed routing `runner.test.ts`'s 33 `runner.run` call sites through a `runGate` fixture wrapper to absorb the parameter deletion.
  But the wrapper becomes a zero-value pass-through the moment the parameter is gone, and it hides the act under test — which the `testing` skill explicitly warns against.
  Counting first showed the migration was 30 single-line substitutions plus 3 hand edits, well short of the scripted-regex trap the assessor invoked.
  Measure the churn before accepting a permanent indirection to absorb it.
- **The first recommendation was worth taking** and did exactly what Tidy First promises: extracting `runDescriptor`'s three `logContext` spreads into one declaration turned the feature commit's injection into a single added property.
- **`DecisionEventFacts` is load-bearing, not cosmetic.**
  Because `Omit<PermissionDecisionEvent, "requestId">` is not assignable to the full event, the compiler forces every emit through the runner's one stamping helper.
  A future gate cannot add an emit path that forgets the id.
- **The predicted compile error landed exactly where the plan said**, and only there: `test/decision-reporter.test.ts`'s full-literal factory.
  `test/permission-events.test.ts`'s factory was pre-emptively fixed in the red step, and the two other files the plan listed (`external-directory.test.ts`, `helpers.test.ts`) needed no edit at all — the gate's bypass literal never carried a `requestId`, and `buildDecisionEvent`'s runtime output is unchanged by a return-type narrowing.
  Both deviations were put to the reviewer explicitly rather than left to be rediscovered; it confirmed them.
- **Minting inside the fail-closed `catch` was the one place this change could have done harm.**
  The recording work moved into `recordGateError`, which swallows, so the `{ block: true }` return is unconditional — stronger than the pre-change code, where the same block was merely throw-free by construction.
  A new test pins it with a throwing reporter.
- **The metric row's recompute command was unreachable as written** and is now corrected to `grep -rnE "Math\.random\(\)\.toString\(36\)|randomUUID\(\)"`, verified to read 2 at the plan commit and 1 on `HEAD`.
  Note the first attempt (`|randomUUID` without parens) read 2, because the import line matches too — a line-count metric over a symbol needs the call form.
- **[#745]'s plan gained an amending note rather than an issue comment.**
  Its `requesterRequestId` field is superseded: the forwarded request's `id` now *is* the child's request id.
  A committed plan is what the next session follows, so that is where the correction belongs.

[#745]: https://github.com/gotgenes/pi-packages/issues/745
[#753]: https://github.com/gotgenes/pi-packages/issues/753
