/**
 * The model call: ask a light model whether a candidate path is a typo, bounded
 * by `timeoutMs`, and map its reply to a `deny | defer` verdict.
 *
 * Fail-safe throughout — an unparseable reply, an unrecognized verdict, a
 * thrown or timed-out `complete`, all resolve to `defer` (more prompting, never
 * less). This slice never emits `allow`.
 */

import type {
  AssistantMessage,
  Context,
  Model,
  TextContent,
} from "@earendil-works/pi-ai";
import type { AuthorizerVerdict } from "@gotgenes/pi-permission-system";

import type { ModelJudgeConfig } from "./config-schema";

/** The reason used for a deny when the model omits its own. */
export const GENERIC_TEACHING_REASON =
  "This looks like a mistyped path. Verify the correct location before retrying.";

/**
 * The injected model-completion seam — structurally the `complete` export of
 * `@earendil-works/pi-ai`. Injected so tests substitute a fake.
 */
export type CompleteFn = (
  model: Model<any>,
  context: Context,
  options?: {
    signal?: AbortSignal;
    apiKey?: string;
    headers?: Record<string, string>;
  },
) => Promise<AssistantMessage>;

/**
 * The auth resolved for a model call — structurally the `ResolvedRequestAuth`
 * of the core `ModelRegistry`, redeclared here because that type is not
 * re-exported from `@earendil-works/pi-coding-agent`.
 */
export type ResolvedRequestAuth =
  | { ok: true; apiKey?: string; headers?: Record<string, string> }
  | { ok: false; error: string };

/** The narrow model-registry projection the reviewer needs (ISP). */
export interface ModelRegistryLike {
  find(provider: string, modelId: string): Model<any> | undefined;
  getApiKeyAndHeaders(model: Model<any>): Promise<ResolvedRequestAuth>;
}

/** Inputs for a single path review. */
export interface ReviewPathInputs {
  path: string;
  config: ModelJudgeConfig;
  model: Model<any>;
  complete: CompleteFn;
  apiKey?: string;
  headers?: Record<string, string>;
}

/**
 * Why a model call defers, distinct enough to diagnose from the decision trail:
 * the reply parsed but was not JSON (`parse-failed`), was valid JSON but not a
 * `deny` (`non-deny-verdict`), the call was aborted at `timeoutMs` (`timeout`),
 * or `complete` threw for any other reason (`call-failed` — the honest superset
 * that catches, e.g., a 401 slipping past pre-call auth resolution).
 */
export type ModelCallDeferReason =
  | "parse-failed"
  | "non-deny-verdict"
  | "timeout"
  | "call-failed";

/**
 * The full result of a model review: the verdict plus the observability the
 * decision trail records. `deferReason` is set iff the verdict is `defer` and a
 * model call was made; `rawReply` carries the assistant text when a reply
 * arrived (absent on a timeout/throw before any reply).
 */
export interface ReviewOutcome {
  verdict: AuthorizerVerdict;
  deferReason?: ModelCallDeferReason;
  latencyMs: number;
  rawReply?: string;
}

/**
 * Review one candidate path with the model and return the structured outcome.
 *
 * The call is aborted after `config.timeoutMs`; an abort, a rejection, or any
 * non-`deny` reply yields `defer` (more prompting, never less) with the reason
 * annotated so the caller can record why.
 */
export async function reviewPath(
  inputs: ReviewPathInputs,
): Promise<ReviewOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, inputs.config.timeoutMs);
  const startedAt = Date.now();
  try {
    const context: Context = {
      systemPrompt: inputs.config.instructions,
      messages: [
        {
          role: "user",
          content: renderReviewPrompt(inputs.path),
          timestamp: Date.now(),
        },
      ],
    };
    const reply = await inputs.complete(inputs.model, context, {
      signal: controller.signal,
      apiKey: inputs.apiKey,
      headers: inputs.headers,
    });
    return parseOutcome(extractText(reply).trim(), Date.now() - startedAt);
  } catch {
    return {
      verdict: { kind: "defer" },
      deferReason: controller.signal.aborted ? "timeout" : "call-failed",
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The user-turn prompt: hand the model the path and the required reply shape. */
function renderReviewPrompt(path: string): string {
  return [
    "A tool is about to access this path outside the working directory:",
    "",
    path,
    "",
    'Reply with strict JSON. To reject a mistyped path: {"verdict":"deny","reason":"<why it is wrong and the correct location>"}.',
    'Otherwise: {"verdict":"defer"}.',
  ].join("\n");
}

/**
 * Map the assistant reply text to an outcome; anything but a clean `deny`
 * defers with the reason that distinguishes it.
 */
function parseOutcome(rawReply: string, latencyMs: number): ReviewOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawReply);
  } catch {
    return {
      verdict: { kind: "defer" },
      deferReason: "parse-failed",
      latencyMs,
      rawReply,
    };
  }
  if (!isRecord(parsed) || parsed.verdict !== "deny") {
    return {
      verdict: { kind: "defer" },
      deferReason: "non-deny-verdict",
      latencyMs,
      rawReply,
    };
  }
  const reason =
    typeof parsed.reason === "string" && parsed.reason.length > 0
      ? parsed.reason
      : GENERIC_TEACHING_REASON;
  return { verdict: { kind: "deny", reason }, latencyMs, rawReply };
}

/** Concatenate the text parts of an assistant reply. */
function extractText(reply: AssistantMessage): string {
  return reply.content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
