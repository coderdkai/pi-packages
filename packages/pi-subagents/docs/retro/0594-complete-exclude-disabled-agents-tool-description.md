---
issue: 594
issue_title: "fix(pi-subagents): complete exclude disabled agents from the subagent tool description"
---

# Retro: #594 — complete exclude disabled agents from the subagent tool description

## Stage: PR Review (2026-07-15T18:31:08Z)

### Session summary

Third-party PR #594 (`@whaoa`) completes the incomplete fix from #448 (`9a43414b`): disabled built-in agents (`Explore`, `Plan`, `general-purpose`) still leaked into the subagent tool's **static guideline text** even after #448 removed them from the type list.
The PR gates those guideline lines on `registry.isValidType(...)` and also drops the bare `Default agents:` header when no default agents remain enabled.
Operator direction: **adopt the capability with our own simplified design** (plan via `/plan-issue #594`), and source per-agent guideline copy from the agent config rather than keeping it hardcoded.

### Evaluation

**Problem — real.**
`9a43414b` (#448) filtered disabled agents out of `buildTypeListText` (`packages/pi-subagents/src/tools/helpers.ts`) but left three hardcoded guideline lines in `AgentTool.toToolDefinition` (`packages/pi-subagents/src/tools/agent-tool.ts`):

- `- Use Explore for codebase searches and code understanding.`
- `- Use Plan for architecture and implementation planning.`
- `- Use general-purpose for complex tasks that need file editing.`

When those built-ins are disabled, the model still receives guidance referencing agents it cannot spawn.
Secondary gap: `buildTypeListText` emits the bare `Default agents:` header even when zero defaults are enabled.

**Approach — sound, close to idiomatic, two things to change.**

- `helpers.ts` change (omit empty `Default agents:` header) mirrors the sibling `customDescs.length > 0` conditional directly below it.
  Keep as-is.
- `agent-tool.ts` change builds an `agentSpecificGuidelines` array gated by `registry.isValidType("Explore")` etc., filtered by a type guard.
  Works, but hardcodes the three agent names as magic-string literals **parallel to the `default-agents` config** — a second source of truth.
  Operator chose to **source the guideline copy from the agent config** (e.g. a `toolGuideline` field on the built-in `AgentConfig`) so descriptions and guidelines share one home and the registry drives both.
- **Test defect to fix:** the new `agent-tool.test.ts` case asserts `not.toContain(\`- ${name} :\`)` — with a **space before the colon**.
  The real type-list format is `- Explore:` (no space, see `helpers.ts:82,87`), so that assertion passes vacuously regardless of the fix.
  The meaningful assertion (`not.toContain(\`- Use ${name} for \`)`) is fine; drop or correct the tautological one.
- Minor: double space after `&&` in the gated expressions (Biome would normalize).

**Behavior — non-breaking.**
The default (all-enabled) description is unchanged; the text only shrinks when built-ins are disabled.
Correct `fix:` (no `!`).

### Decision and attribution

**Direction: adopt with simplified design.**
Re-implement cleanly via `/plan-issue #594`:

1. Keep the registry-gated approach and the `helpers.ts` empty-header fix.
2. **Source per-agent guideline copy from the agent config** (single source of truth) rather than the PR's hardcoded parallel list.
3. Fix the tautological test assertion (`- ${name} :` space-before-colon) and keep parametrized `it.for` coverage for disabled built-ins.

Agreed non-goals: no change to the all-enabled default description; no broader refactor of `buildTypeListText` beyond the empty-header guard.

Attribution — the contributor gets durable credit:

- Every implementation/docs commit carries, at the end of the body after a blank line:

  ```text
  Co-authored-by: whaoa <whaoa.w@outlook.com>
  ```

- The ship-stage PR close comment thanks `@whaoa` by name and links the implementing SHA(s).
- Reference the PR as `Refs #594` / `(#594)` — never `Closes #594`.
