---
issue: 611
issue_title: "Finish typing the model boundary in the snapshot and session-assembly thread"
---

# Retro: #611 — Finish typing the model boundary in the snapshot and session-assembly thread

## Stage: Planning (2026-07-18T00:00:00Z)

### Session summary

Produced the numbered plan for Phase 21 Step 3 — a pure Category C type-threading refactor typing `model` / `parentModel` against `Model<any>` and `modelRegistry` against the `model-resolver` `ModelRegistry` across the snapshot and session-assembly thread, dropping the `runtime.ts` cast and the `parent-snapshot.ts` `!`.
Issue is the operator's own and unambiguous (`Release: independent`), so the `ask-user` gate was skipped.
Confirmed the 7-site recompute baseline, verified the SDK surface (`ExtensionContext.modelRegistry` is non-optional), and enumerated the full test-fixture blast radius.

### Observations

- **Key design decision:** make `SessionContext.modelRegistry` non-optional (matching the SDK) so the `parent-snapshot.ts` `!` drops cleanly, rather than making the snapshot field optional and cascading `registry?.` guards into `resolveDefaultModel` (a subtle throw→fallback behavior shift for no gain).
- The type thread is entangled — `resolveDefaultModel`'s return type depends on `registry.find`'s return type — so it cannot be split into "model typing" and "registry typing" commits; it lands as one atomic `refactor:` commit plus a `docs:` commit for the roadmap step-mark.
- Adopting the shared `ModelRegistry` interface also collapses a duplicated inline structural type (`{ find(...): unknown; getAvailable?() }`) present in both `parent-snapshot.ts` and `session-config.ts`.
- Three test fixtures pass partial `Model` literals or registries missing `getAll` **uncast** and will break under tightening: `test/helpers/stub-ctx.ts`, `test/session/session-config.test.ts`, `test/runtime.test.ts` — the plan enumerates each edit (switch partials to `makeModel(...)`, add `getAll`, widen `getAvailable` returns to `Model<any>[]`).
  Fixtures that cast via `as unknown` / `as any` (`parent-snapshot.test.ts`, `print-mode.test.ts`) need no change.
- `CreateSessionOptions.model` / `.modelRegistry` (`create-subagent-session.ts`) are typed too even though only `model` is counted by the metric — they are the same thread and `index.ts` casts `as any` at the SDK-creation seam, so no compat issue.
- Lands as `refactor:` (hidden changelog type) → no dedicated release; auto-batches into the next unhidden release.
  Next stage is `/tdd-plan` (treated as a compiler-guarded refactor: no new behavioral red→green cycle).
