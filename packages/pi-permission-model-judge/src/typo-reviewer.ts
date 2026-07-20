/**
 * The deny-first typo-path reviewer: the `Authorizer` chain link this package
 * registers as `"model-judge"`.
 *
 * The decision runs top to bottom, deferring at the first miss so the cheap
 * gates short-circuit before any model call:
 *   1. surface is `external_directory` (else defer),
 *   2. a candidate path is present (else defer),
 *   3. the path matches a configured typo pattern (else defer, no model call),
 *   4. the model confirms the typo (deny with a teaching reason) or defers.
 *
 * Every failure path defers — more prompting, never less (ADR 0007 invariant 2).
 * This slice never emits `allow`.
 */

import type {
  Authorizer,
  PromptPermissionDetails,
} from "@gotgenes/pi-permission-system";

import type { ModelJudgeConfig } from "./config-schema";
import {
  type CompleteFn,
  type ModelRegistryLike,
  reviewPath,
} from "./model-review";
import {
  type CompiledTypoPatterns,
  compileTypoPatterns,
  matchesAnyTypoPattern,
} from "./typo-patterns";

const REVIEWED_SURFACE = "external_directory";

/** Collaborators for the reviewer, injected so the extension and tests wire them. */
export interface TypoReviewerDeps {
  /** The loaded config, read live (absent until session config loads). */
  getConfig: () => ModelJudgeConfig | undefined;
  /** The session model registry, read live (captured at `session_start`). */
  getRegistry: () => ModelRegistryLike | undefined;
  /** The model-completion seam (production: `complete` from `@earendil-works/pi-ai`). */
  complete: CompleteFn;
  /** Optional warn sink for operational notices (unresolved model, bad patterns). */
  warn?: (message: string) => void;
}

/**
 * Build the `authorize` callback registered on the chain. The `query` argument
 * is unused in this slice — the deny-first reviewer decides from the path
 * pattern and the model, not from an engine re-query (slice 2 consumes it).
 */
export function createTypoReviewer(
  deps: TypoReviewerDeps,
): Authorizer["authorize"] {
  const compiledFor = memoizeCompiledPatterns(deps.warn);

  return async (details) => {
    const config = deps.getConfig();
    if (!config) {
      return { kind: "defer" };
    }
    if (surfaceOf(details) !== REVIEWED_SURFACE) {
      return { kind: "defer" };
    }
    const path = pathOf(details);
    if (path === undefined) {
      return { kind: "defer" };
    }
    if (!matchesAnyTypoPattern(path, compiledFor(config))) {
      return { kind: "defer" };
    }
    const model = deps.getRegistry()?.find(config.provider, config.model);
    if (!model) {
      deps.warn?.(
        `model "${config.provider}/${config.model}" did not resolve; deferring`,
      );
      return { kind: "defer" };
    }
    return reviewPath({ path, config, model, complete: deps.complete });
  };
}

/** The gate-authoritative surface, falling back to the display surface. */
function surfaceOf(details: PromptPermissionDetails): string | undefined {
  return details.accessIntent?.surface ?? details.surface ?? undefined;
}

/** The candidate path — `path` for a local ask, `value` for a forwarded one. */
function pathOf(details: PromptPermissionDetails): string | undefined {
  return details.path ?? details.value ?? undefined;
}

/**
 * Compile a config's patterns once and reuse the result while the same config
 * object is in effect — the config is stable per session, so this avoids
 * recompiling the regexes on every ask.
 */
function memoizeCompiledPatterns(
  warn?: (message: string) => void,
): (config: ModelJudgeConfig) => CompiledTypoPatterns {
  let cache:
    | { config: ModelJudgeConfig; compiled: CompiledTypoPatterns }
    | undefined;
  return (config) => {
    if (cache?.config === config) {
      return cache.compiled;
    }
    const compiled = compileTypoPatterns(config.typoPatterns);
    if (compiled.invalidPatterns.length > 0) {
      warn?.(
        `ignoring invalid typoPatterns: ${compiled.invalidPatterns.join(", ")}`,
      );
    }
    cache = { config, compiled };
    return compiled;
  };
}
