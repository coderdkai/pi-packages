---
issue: 542
issue_title: "pi-subagents Phase 20 Step 8: full-value SubagentStateInit"
---

# Retro: #542 — pi-subagents Phase 20 Step 8: full-value SubagentStateInit

## Stage: Planning (2025-02-14T00:00:00Z)

### Session summary

Planned Phase 20 Step 8: extend `SubagentStateInit` to optionally seed the full value (`toolUses`, `lifetimeUsage`, `compactionCount`, `turnCount`, `activeTools`, `responseText`) so `SubagentState` is constructible anywhere in its value space, then collapse `createTestSubagent`'s post-construction mutation loops into direct init to drop its cyclomatic complexity from 19 to ≤ 8.
The change is purely additive and internal — no removed exports, no public-surface impact, no production behavior change.
Release recommendation: ship independently (Phase 20 Step 8 is tagged `Release: independent` and lands as a `refactor:`/`test:` commit).

### Observations

- Two design decisions worth flagging for implementation: `activeTools` is seeded by name (`string[]`) through `addActiveTool`, not by a full `Map`, to preserve the internal `_toolKeySeq` invariant (a caller-supplied map with hand-picked keys could collide with a later `addActiveTool` call).
  And `lifetimeUsage` must be spread-copied in the constructor, not aliased — `addUsage` mutates `_lifetimeUsage` in place, so a direct assignment would leak a mutable reference (output-argument smell).
  A dedicated test should mutate the source object after construction and assert the state is unchanged.
- The change is additive, so no existing `new SubagentState(...)` call site breaks at the type level — all current callers pass only transition fields.
  The default-construction tests in `test/lifecycle/subagent-state.test.ts` are the invariant guard for the `?? default` seeding branches; they must stay unchanged.
- Verified against `code-design` heuristics that this is legitimate design improvement, not procedure-splitting: the seeding moves onto the value object's own constructor which owns that state, widening a narrow init surface rather than relocating statements to lower a metric.
- Planned the architecture-doc `✅` step-mark (heading + Mermaid `S8` node + `Landed:` note) as a Step 3 TDD commit per the roadmap convention that `/tdd-plan` lands the mark at implementation completion.
