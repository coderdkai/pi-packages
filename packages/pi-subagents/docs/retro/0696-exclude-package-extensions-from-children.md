---
issue: 696
issue_title: "pi-subagents: allow children to exclude selected package extensions"
pr: 697
---

# Retro: #696 — allow children to exclude selected package extensions

## Stage: PR Review (2026-08-13T04:57:29Z)

### Session summary

Third-party PR [#697](https://github.com/gotgenes/pi-packages/pull/697) from `@beilo` (leipeng) adds an `excludedExtensionPackages` key to layered `subagents.json` so in-process child sessions skip selected Pi package extensions, motivated by a concrete OOM: four concurrent children each re-initialize `@cortexkit/pi-magic-context` and scan a ~1.1 GB Pi session store in the shared V8 heap, aborting near the ~4.1 GB limit (exit 134).
The underlying problem was confirmed real on current `main` — children inherit every parent package extension with no opt-out of any kind — and [ADR-0002] explicitly reserved a prevent-load seam for exactly this trigger condition.
The operator chose **adopt the capability, plan a simplified design**: keep the capability and its exact-source semantics, use the PR as reference rather than the merge target, and let `/plan-issue` weigh the two candidate mechanisms and the ADR-shape question with fuller context.

### Evaluation

#### Verify gate — defect confirmed on current `main`

A throwaway test (since deleted) against `main` asserted that `createSubagentSession` passes **no** filtering seam whatsoever to the child resource loader, and it passed:

- `packages/pi-subagents/src/lifecycle/create-subagent-session.ts:184` calls `deps.io.createResourceLoader({...})` with no `settingsManager`, no `extensionsOverride`, and no `noExtensions`.
- Pi's `DefaultResourceLoader` therefore falls back to `SettingsManager.create(this.cwd, this.agentDir)` (`resource-loader.js:119`), resolves every configured package via `packageManager.resolve()`, and binds every parent extension in the child.

Not already fixed in an earlier release: `git log --oneline -S "noExtensions" -- packages/pi-subagents/` surfaces `3cc682ec feat!: always inherit extensions; make the recursion guard unconditional (#264)`, which deliberately *removed* the seam.
Nothing re-added it since.

The real boundary is correct: the OOM originates in the child extension factory at `bindExtensions()`, and dropping the package's extension paths in the child loader means the factory never runs.

Regression risk in the other direction is low — an absent or empty setting preserves today's behavior exactly, so the change is additive (`feat:`), not breaking.

#### Checks run independently

Run from a scratch worktree on the PR head (`6237ceb4`), not trusted from the PR body:

| Check                                           | Result                      |
| ----------------------------------------------- | --------------------------- |
| `pnpm run check`                                | pass                        |
| `pnpm run lint` (Biome + ESLint + `rumdl`)      | pass, no findings           |
| `pnpm --filter @gotgenes/pi-subagents run test` | pass — 64 files, 1141 tests |

#### ADR context — this is the trigger, not a relapse

[ADR-0002] evicted per-agent extension policy but was explicit that prevent-load is different:

> Prevent-load (refusing to bind an extension because of load-time side effects, cost, or true sandboxing) is genuinely generative and cannot be reduced to observation, so it is left as a *latent* (un-built) provider seam, added only if a real consumer needs it.

Magic Context is that real consumer.
So admitting the capability honors the ADR's "no vacant hooks" rule rather than reversing Phase 14.

#### What is valuable

- The capability itself, and the decision to match **exact Pi package source strings** rather than inventing a glob dialect.
- Disabling only the matched package's extensions while its skills and other resources stay available.
- The `settingsManager` loader option is a **real** seam, not invented — `DefaultResourceLoaderOptions.settingsManager?: SettingsManager` is present in the pinned `@earendil-works/pi-coding-agent@0.80.5` types.
- The `extensions: []` disable idiom is semantically correct: `applyPackageFilter` in `package-manager.js` comments "Empty array explicitly disables all resources of this type", and it matches the convention this repo already documents in `AGENTS.md`.
- Sanitization in `settings.ts` (`sanitize`) is careful — type-filters, trims, drops empties, dedupes — and is well covered by `test/settings.test.ts`.

#### What I would change

1. **The `Proxy` is the wrong instrument.**
   `createChildSettingsManager` in `create-subagent-session.ts` hand-rolls a `get` trap that rebinds every function to the target.
   It silently forwards a growing SDK surface, would break on any future `SettingsManager` method that returns `this`, and is untypable in practice — it needs `target as unknown as Record<PropertyKey, unknown>` and `Reflect.apply(...) as unknown` within eight lines.
   Pi already exposes a first-class alternative: `DefaultResourceLoaderOptions.extensionsOverride?: (base: LoadExtensionsResult) => LoadExtensionsResult`, which is a pure function over the loaded extension set with no proxy and no settings mutation.

2. **Blast radius wider than the problem.**
   The PR passes the *same* proxied manager as the child **session's** `settingsManager` in `createSession({ settingsManager })`, not only the loader's.
   Every session-level settings read in the child — npm command, project trust, model config, and any future consumer — now observes a mutated `packages` array.
   Nothing in the stated problem requires that; the change should be scoped to the loader.

3. **Silent hole for `autoload: false` entries.**
   `disableExcludedPackageExtensions` sets `extensions: []` on the package entry, but `collectPackageResources` routes an entry with `autoload: false` to `applyPackageDeltaFilter`, which **returns early when the pattern array is empty**.
   For such a user the exclusion silently does nothing.
   No test covers this path.

4. **Shape versus [ADR-0002].**
   The ADR specifies prevent-load as a rationed **provider seam** (generative, registered by a consumer), not a config list the core reads.
   The PR instead adds a core-owned `subagents.json` key — structurally the `extensions: string[]` shape Phase 14 evicted, relocated from agent frontmatter to settings — and **amends the ADR to permit itself** rather than satisfying it as written.
   Choosing config-key ergonomics over the seam is a legitimate call, but it should be a deliberate decision with its own ADR reasoning.

5. **`snapshot()` return shape becomes non-uniform.**
   In `settings.ts`, `snapshot()` gains a conditionally-spread optional `excludedExtensionPackages?: string[]` while every other field is unconditional — apparently so existing `toEqual` assertions keep passing.
   Since the PR's own README text says the setting is not exposed in `/subagents:settings`, it likely does not belong in `snapshot()` at all.

6. **Integration test asserts the stub, not the behavior.**
   The new case in `test/lifecycle/create-subagent-session.test.ts` asserts against a stub `SettingsManager`, so it pins that the proxy wraps two methods — it does not pin the load-bearing assumption that Pi actually disables the extension for an `extensions: []` entry.
   A test at the seam would survive a mechanism swap; this one will not.

7. **Dependency-bag growth.**
   `getExcludedExtensionPackages: () => readonly string[]` becomes a fifth field on `SubagentSessionDeps`, whose doc comment describes it as "the IO boundary plus the two static domain deps".
   A policy getter threaded into the assembly factory is worth a second look under the `design-review` dependency-width check.

### Decision and attribution

**Direction: adopt the capability, plan a simplified design.**
The PR is reference material, not the merge target.
`/plan-issue #696` should plan around this recorded decision rather than re-litigate whether the capability is wanted — it is.

Two questions are deliberately deferred to planning, with both candidates recorded here:

- **Mechanism** — Pi's `extensionsOverride` loader option (pure filter, loader-scoped, no proxy) versus a plain filtered settings snapshot with no `Proxy`.
  Planning evaluates both; whichever wins must close the `autoload: false` hole and carry a test at the seam rather than at a stub.
- **Config shape** — an `excludedExtensionPackages` settings key (operator ergonomics, requires a deliberate [ADR-0002] amendment) versus the registerable provider seam the ADR specifies.
  Planning weighs ergonomics against the ADR and proposes either the amendment or the seam.

Agreed scope: exact Pi package-source matching, extensions only (skills and other package resources stay available), parent behavior unchanged, absent or empty setting preserves today's child behavior.

Non-goals: no restoration of per-agent `extensions:` / `isolated:` / `noSkills` frontmatter, no tool-permission semantics (that remains `@gotgenes/pi-permission-system`'s `permission:` frontmatter), and no glob or fuzzy package matching.

**Attribution.**
Every implementation and docs commit for this work carries, after a blank line at the end of the body:

```text
Co-authored-by: leipeng <leipeng950504@gmail.com>
```

The ship-stage close comment thanks `@beilo` by name and links the implementing SHA(s).
Reference the PR as `Refs #697` or `(#697)` — never `Closes #697`, which would pre-empt the curated close comment.

## Stage: Planning (2026-08-13T05:13:33Z)

### Session summary

Produced `docs/plans/0696-exclude-package-extensions-from-children.md` and resolved the three questions the PR-review stage deferred: settings key plus a deliberate [ADR-0002] amendment, `SettingsManager.fromStorage` over a read-only filtering storage, and loader-only scoping.
Deeper reading of Pi's `resource-loader.js` and `package-manager.js` **refuted two of the PR review's own critiques**, which materially changed the design.
The plan lands as five TDD steps and is a non-breaking, ship-independently feature.

### Observations

#### Two PR-review critiques were wrong, and planning caught both

- **`extensionsOverride` is unusable, not the better seam.**
  The review recommended replacing the `Proxy` with Pi's `extensionsOverride` loader option.
  Reading `resource-loader.js` showed it runs at line 279 — *after* `loadFinalExtensionSet` already called `loadExtensionsCached` (modules imported into the heap, so the OOM cost is already paid) and *before* `applyExtensionSourceInfo` at line 280 (so `extension.sourceInfo` is unpopulated and the callback cannot match by package source at all).
  The contributor's settings-level approach was right on the mechanism.
- **The claimed `autoload: false` "silent hole" does not exist.**
  The review asserted `applyPackageDeltaFilter`'s early return on an empty array meant the exclusion silently no-ops.
  In delta mode the filter starts from nothing and only *adds* matched patterns, so `extensions: []` yields "add none" — the desired outcome.
  `extensions: []` is correct in both modes.

The generalizable lesson: a PR review that reads the diff plus one layer of the dependency is not enough to judge a mechanism.
Both errors came from reading `DefaultResourceLoaderOptions`' type surface without tracing the call order in the compiled `.js`.

#### What survived from the review

The `Proxy` critique and the blast-radius critique both held.
`SettingsManager` has a `private constructor` (no subclassing) and `applyOverrides` only touches the private merged `settings` field, not the per-scope accessors the package manager reads — so `SettingsManager.fromStorage`, which is public and takes a one-method `SettingsStorage`, is the only clean seam.
It yields a real, fully typed manager with no proxy and no casts.

#### New finding: a data-loss path the PR only accidentally avoided

`saveAndNotify` persists `snapshot()` through a whole-file `writeFileSync`, so any key absent from `snapshot()` is destroyed on the next `/subagents:settings` edit.
A hand-edited project-scoped `excludedExtensionPackages` would be silently erased by an unrelated grace-turns change.
The review had dismissed the PR's conditional-spread in `snapshot()` as test-appeasement; it was actually preventing this.
The plan keeps the conditional field but gives it a named `SettingsSnapshot` type, the real rationale in a doc comment, and its own regression test (TDD step 2, committed as a `fix:` before the feature).

#### Design divergence from the PR: keep policy out of the factory

The PR threads `getExcludedExtensionPackages: () => readonly string[]` into `SubagentSessionDeps` and branches inside `createSubagentSession`.
Applying the `code-design` rule "thread decisions, not discriminators", the plan instead resolves the policy at the `index.ts` composition boundary and hands the factory the *product* via a new `SessionFactoryIO.createLoaderSettingsManager(parent)` member.
The factory gains no policy knowledge, no fifth dependency-bag field, and no conditional; the no-exclusions path is identity.

#### Adjacent issue reframes the feature

Issue [#709] (child disposal skips `session_shutdown`, leaking extension-owned processes) explicitly names #696/#697 a *workaround* with a different failure mode — excluding `pi-mcp-adapter` also removes the child's MCP tools.
The two are complementary, not substitutes, and the plan says so in Non-Goals and in the README cross-reference.
This did not surface from the issue body; it came from the open-issue sweep.

#### ADR reasoning inverted the expected answer

[ADR-0002] reserved prevent-load as a provider seam, which reads like an argument against the settings key.
But the same ADR's "no vacant hooks" rule — a seam with no consumer "is not extensibility — it is a speculative abstraction that taxes every reader, and `fallow` flags it as dead" — argues *against* building the seam here, since no external extension wants to supply a prevent-load policy.
The amendment records that reasoning rather than quietly rewriting the ADR to match the patch, which is what the PR did.

#### Risks carried forward

- The storage adapter must discard writes.
  Forwarding one would persist synthesized `extensions: []` into the user's real `settings.json`, disabling those packages for the parent and every future session.
  A dedicated test pins this.
- The new module may read as dead code between TDD steps 3 and 4; the plan names fold-forward as the remedy rather than a `fallow` suppression.

[#709]: https://github.com/gotgenes/pi-packages/issues/709
[ADR-0002]: https://github.com/gotgenes/pi-packages/blob/main/packages/pi-subagents/docs/decisions/0002-extensions-on-a-minimal-core.md
