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

## Stage: Implementation — TDD (2026-07-18T11:20:00Z)

### Session summary

Executed the type-threading refactor across the snapshot and session-assembly boundary: four commits (two preparatory `test:` fixture migrations recommended by the tidy-first assessor, one atomic `refactor:` for the entangled type thread, one `docs:` marking Phase 21 Step 3 ✅).
The recompute metric landed at 0 (7 → 0 `unknown` sites), the `runtime.ts` cast and `parent-snapshot.ts` `!` are gone, and the full suite stayed at 1073 tests passing with no delta (a pure type-only change — the compiler plus the existing suite were the safety net).

### Observations

- **Tidy-first paid off exactly as the assessor predicted.**
  The two prep commits (`session-config.test.ts` partials → `makeModel(...)` + `getAll`; `runtime.test.ts` default `modelRegistry` stub + `getModelInfo` literal → `makeModel`) landed green against the still-`unknown` types, leaving the `refactor:` commit's diff in those files to nothing.
  The assessor's scope boundary held — every Recommended item was inside the target-file list, and it correctly rejected a premature shared stub-registry helper.
- **One unplanned fixture surfaced:** `test/session/context.test.ts`'s `makeCtx` set `modelRegistry: undefined`, which broke once `SessionContext.modelRegistry` went non-optional.
  Caught immediately by `pnpm run check`, fixed in the `refactor:` commit with the same `{ find: () => undefined, getAll: () => [] }` stub used elsewhere.
  The plan's "no change needed" list had enumerated the SessionContext/ParentSnapshot constructors but missed this one (a `buildParentContext` test fixture).
  A `grep -rn "modelRegistry: undefined"` at plan time would have caught it.
- **Design decision validated:** making `SessionContext.modelRegistry` non-optional (matching the SDK's `ExtensionContext`) was the clean lever to drop the `!` — no cascade of `registry?.` guards into `resolveDefaultModel`, and only three fixtures needed a stub-registry default. `getModelInfo`/`service-adapter` keep their `ModelRegistry | undefined` results via `currentCtx?.` (optional from `currentCtx`, not the field), so no consumer regressed.
- **Pre-completion reviewer: PASS** — all deterministic checks green (check/lint/test/fallow), recompute metric verified at 0, 6/6 Mermaid diagrams parse with the new `✅` `S3` node, code design clean (mechanical type substitutions, no control-flow change), cross-step invariants preserved (model-resolution priority + `getModelInfo` pass-through pinned by still-passing tests, now with a stronger `toBe(model)` identity assertion).
  No warnings.
