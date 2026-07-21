/**
 * The deny-first typo-path reviewer: the `Authorizer` chain link this package
 * registers as `"model-judge"`.
 *
 * The decision runs top to bottom, deferring at the first miss so the cheap
 * gates short-circuit before any model call:
 *   1. surface is `external_directory` (else defer, silently — not our surface),
 *   2. a candidate path is present (else defer),
 *   3. the path matches a configured typo pattern (else defer, no model call),
 *   4. the model confirms the typo (deny with a teaching reason) or defers.
 *
 * Every failure path defers — more prompting, never less (ADR 0007 invariant 2).
 * This slice never emits `allow`.
 *
 * Observability (issue #626): once an ask matches a typo pattern (the [#625]
 * class — a candidate typo that *should* reach the model), the reviewer writes a
 * positive `model_judge.decision` review entry recording the outcome and, on a
 * defer, its reason — so a silent 100%-defer regression cannot hide again. The
 * cheap short-circuits (`no-path`, `pattern-miss`) and the raw model reply go to
 * the debug log; a non-`external_directory` surface is not logged at all.
 */

import type {
  Authorizer,
  AuthorizerLog,
  AuthorizerVerdict,
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
  matchTypoPattern,
} from "./typo-patterns";

const REVIEWED_SURFACE = "external_directory";

/** Review-log event: one positive decision record per pattern-matched ask. */
const DECISION_EVENT = "model_judge.decision";
/** Debug-log event: a cheap short-circuit before the model stage. */
const SHORT_CIRCUIT_EVENT = "model_judge.short_circuit";
/** Debug-log event: the raw model reply, gated behind `debugLog`. */
const MODEL_REPLY_EVENT = "model_judge.model_reply";
/** Debug-log event: `typoPatterns` entries that failed to compile. */
const INVALID_PATTERNS_EVENT = "model_judge.invalid_patterns";

/** A defer decided before the model call, still recorded positively. */
type PreModelDeferReason = "model-unresolved" | "auth-failed";

/** The shared fields of a `model_judge.decision` record, before the outcome. */
interface DecisionBase {
  requestId: string;
  path: string;
  matchedPattern: string;
  modelId: string;
}

/** Collaborators for the reviewer, injected so the extension and tests wire them. */
export interface TypoReviewerDeps {
  /** The loaded config, read live (absent until session config loads). */
  getConfig: () => ModelJudgeConfig | undefined;
  /** The session model registry, read live (captured at `session_start`). */
  getRegistry: () => ModelRegistryLike | undefined;
  /** The model-completion seam (production: `complete` from `@earendil-works/pi-ai`). */
  complete: CompleteFn;
}

/**
 * Build the `authorize` callback registered on the chain. The `query` argument
 * is unused in this slice — the deny-first reviewer decides from the path
 * pattern and the model, not from an engine re-query (slice 2 consumes it). The
 * `log` argument is the injected review-log seam the decision trail records to.
 */
export function createTypoReviewer(
  deps: TypoReviewerDeps,
): Authorizer["authorize"] {
  const compiledFor = memoizeCompiledPatterns();

  return async (details, _query, log) => {
    const config = deps.getConfig();
    if (!config) {
      return { kind: "defer" };
    }
    if (surfaceOf(details) !== REVIEWED_SURFACE) {
      return { kind: "defer" };
    }
    const { requestId } = details;
    const path = pathOf(details);
    if (path === undefined) {
      log.debug(SHORT_CIRCUIT_EVENT, { requestId, reason: "no-path" });
      return { kind: "defer" };
    }
    const matchedPattern = matchTypoPattern(path, compiledFor(config, log));
    if (matchedPattern === undefined) {
      log.debug(SHORT_CIRCUIT_EVENT, {
        requestId,
        path,
        reason: "pattern-miss",
      });
      return { kind: "defer" };
    }

    const modelId = `${config.provider}/${config.model}`;
    const base: DecisionBase = { requestId, path, matchedPattern, modelId };
    const registry = deps.getRegistry();
    const model = registry?.find(config.provider, config.model);
    if (!registry || !model) {
      return deferWith(log, base, "model-unresolved");
    }
    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      return deferWith(log, base, "auth-failed");
    }

    const outcome = await reviewPath({
      path,
      config,
      model,
      complete: deps.complete,
      apiKey: auth.apiKey,
      headers: auth.headers,
    });
    if (outcome.rawReply !== undefined) {
      log.debug(MODEL_REPLY_EVENT, {
        requestId,
        modelId,
        rawReply: outcome.rawReply,
      });
    }
    log.review(DECISION_EVENT, {
      requestId,
      surface: REVIEWED_SURFACE,
      path,
      matchedPattern,
      modelCalled: true,
      modelId,
      latencyMs: outcome.latencyMs,
      verdict: outcome.verdict.kind,
      deferReason: outcome.deferReason ?? null,
    });
    return outcome.verdict;
  };
}

/**
 * Record a pre-model defer (`model-unresolved` / `auth-failed`) as a positive
 * `model_judge.decision` entry and return the defer verdict — so the two
 * model-resolution failures leave evidence on record, not a silent absence.
 */
function deferWith(
  log: AuthorizerLog,
  base: DecisionBase,
  deferReason: PreModelDeferReason,
): AuthorizerVerdict {
  log.review(DECISION_EVENT, {
    requestId: base.requestId,
    surface: REVIEWED_SURFACE,
    path: base.path,
    matchedPattern: base.matchedPattern,
    modelCalled: false,
    modelId: base.modelId,
    latencyMs: null,
    verdict: "defer",
    deferReason,
  });
  return { kind: "defer" };
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
function memoizeCompiledPatterns(): (
  config: ModelJudgeConfig,
  log: AuthorizerLog,
) => CompiledTypoPatterns {
  let cache:
    | { config: ModelJudgeConfig; compiled: CompiledTypoPatterns }
    | undefined;
  return (config, log) => {
    if (cache?.config === config) {
      return cache.compiled;
    }
    const compiled = compileTypoPatterns(config.typoPatterns);
    if (compiled.invalidPatterns.length > 0) {
      log.debug(INVALID_PATTERNS_EVENT, {
        invalidPatterns: compiled.invalidPatterns,
      });
    }
    cache = { config, compiled };
    return compiled;
  };
}
