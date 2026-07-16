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

## Stage: Implementation — TDD (2025-02-14T10:00:00Z)

### Session summary

Executed the 3 planned TDD steps plus one unplanned cleanup commit (4 total).
Extended `SubagentStateInit` with six optional value fields seeded in the constructor, collapsed `createTestSubagent`'s mutation loops into direct init, and landed the architecture-doc `✅` Step 8 mark.
Test count went from 991 → 996 in `pi-subagents` (5 new `subagent-state.test.ts` cases: full-value stats seeding, `lifetimeUsage` copy semantics, live-activity seeding, `activeTools` by-name removability, and a live-activity defaults case).

### Observations

- Tidy-First assessor reported no preparatory commits warranted; folded its two Optional notes into the impl commits (refreshed stale `TestSubagentOptions` JSDoc in Step 2; had the constructor own the defaults — dropped the now-redundant field-initializer literals — in Step 1 to avoid a double source of truth).
- Deviation from the plan: collapsing `createTestSubagent` removed the sole callers of three `Subagent` delegation wrappers (`incrementToolUses`, `addUsage`, `incrementCompactions`), which `fallow dead-code` then flagged.
  `record-observer` calls the `SubagentState` methods directly, so the `Subagent`-level wrappers were genuinely dead — removed them in a 4th `refactor:` commit rather than suppressing.
  The plan's Non-Goals covered the `SubagentState` accumulation methods (which stay); the delegation wrappers were a distinct, now-orphaned surface.
- Behavior-preservation check: `createTestSubagent` callers pass `toolUses: 0` and `turnCount: 1`/higher; the `??` seeding preserves both (`0 ?? 3` = 0; `1 ?? 1` = 1), and no caller passes `turnCount: 0`, so no drift from the old `turnCount > 1` loop guard.
- Verified the quantitative target via `fallow health --format json`: `createTestSubagent` dropped off both the `targets` and `large_functions` lists (was 19 cyclomatic, the workspace's most complex function).
- Pre-completion reviewer: PASS — all deterministic checks green (996 tests), Mermaid validated, cross-step invariants (#373 defaults) preserved, no stale doc references.
