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
 * Review one candidate path with the model and return its verdict.
 *
 * The call is aborted after `config.timeoutMs`; an abort, a rejection, or any
 * non-`deny` reply yields `defer`.
 */
export async function reviewPath(
  inputs: ReviewPathInputs,
): Promise<AuthorizerVerdict> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, inputs.config.timeoutMs);
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
    return parseVerdict(reply);
  } catch {
    return { kind: "defer" };
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

/** Map the assistant reply to a verdict; anything but a clean `deny` defers. */
function parseVerdict(reply: AssistantMessage): AuthorizerVerdict {
  const text = extractText(reply).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "defer" };
  }
  if (!isRecord(parsed) || parsed.verdict !== "deny") {
    return { kind: "defer" };
  }
  const reason =
    typeof parsed.reason === "string" && parsed.reason.length > 0
      ? parsed.reason
      : GENERIC_TEACHING_REASON;
  return { kind: "deny", reason };
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
