import type { AssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelJudgeConfig } from "#src/config-schema";
import {
  type CompleteFn,
  GENERIC_TEACHING_REASON,
  reviewPath,
} from "#src/model-review";
import { assistantText } from "#test/fixtures/assistant-message";

const CONFIG: ModelJudgeConfig = {
  provider: "anthropic",
  model: "claude-haiku",
  instructions: "Flag doubled path segments; explain the correct location.",
  typoPatterns: [".*"],
  timeoutMs: 5000,
};

// A minimal model stand-in — reviewPath only forwards it to `complete`.
const MODEL = { provider: "anthropic", id: "claude-haiku" } as never;

function completeReturning(text: string): CompleteFn {
  return vi.fn(async () => assistantText(text));
}

describe("reviewPath", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("denies with the model's reason on a deny verdict", async () => {
    const reply = JSON.stringify({
      verdict: "deny",
      reason: "Wrong path; use pi-packages.",
    });
    const complete = completeReturning(reply);
    const outcome = await reviewPath({
      path: "/x/pi-permission-system/packages/pi-permission-system/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(outcome.verdict).toEqual({
      kind: "deny",
      reason: "Wrong path; use pi-packages.",
    });
    // A deny carries no defer reason, but does record the raw reply + latency.
    expect(outcome.deferReason).toBeUndefined();
    expect(outcome.rawReply).toBe(reply);
    expect(typeof outcome.latencyMs).toBe("number");
  });

  it("substitutes a generic reason when a deny omits its reason", async () => {
    const complete = completeReturning(JSON.stringify({ verdict: "deny" }));
    const outcome = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(outcome.verdict).toEqual({
      kind: "deny",
      reason: GENERIC_TEACHING_REASON,
    });
  });

  it("defers with reason non-deny-verdict on a defer reply", async () => {
    const reply = JSON.stringify({ verdict: "defer" });
    const complete = completeReturning(reply);
    const outcome = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(outcome.verdict).toEqual({ kind: "defer" });
    expect(outcome.deferReason).toBe("non-deny-verdict");
    expect(outcome.rawReply).toBe(reply);
  });

  it("defers with reason parse-failed when the reply is not parseable JSON", async () => {
    const reply = "I think this path is fine, honestly.";
    const complete = completeReturning(reply);
    const outcome = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(outcome.verdict).toEqual({ kind: "defer" });
    expect(outcome.deferReason).toBe("parse-failed");
    // The raw reply is retained for debug-level inspection.
    expect(outcome.rawReply).toBe(reply);
  });

  it("defers with reason non-deny-verdict when the verdict value is unrecognized", async () => {
    const complete = completeReturning(JSON.stringify({ verdict: "maybe" }));
    const outcome = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(outcome.verdict).toEqual({ kind: "defer" });
    expect(outcome.deferReason).toBe("non-deny-verdict");
  });

  it("defers with reason call-failed when complete rejects", async () => {
    const complete: CompleteFn = vi.fn(async () => {
      throw new Error("model unavailable");
    });
    const outcome = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(outcome.verdict).toEqual({ kind: "defer" });
    expect(outcome.deferReason).toBe("call-failed");
    // No reply arrived, so there is no raw text to record.
    expect(outcome.rawReply).toBeUndefined();
  });

  it("passes the instructions as the system prompt and the path in the message", async () => {
    const complete = completeReturning(JSON.stringify({ verdict: "defer" }));
    await reviewPath({
      path: "/x/doubled/doubled/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(complete).toHaveBeenCalledTimes(1);
    const [model, context] = (complete as ReturnType<typeof vi.fn>).mock
      .calls[0] as [unknown, { systemPrompt?: string; messages: unknown[] }];
    expect(model).toBe(MODEL);
    expect(context.systemPrompt).toBe(CONFIG.instructions);
    const firstMessage = context.messages[0] as { content: string };
    expect(firstMessage.content).toContain("/x/doubled/doubled/a.ts");
  });

  it("forwards the resolved apiKey and headers into the completion", async () => {
    const complete = completeReturning(JSON.stringify({ verdict: "defer" }));
    await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
      apiKey: "sk-test-123",
      headers: { "x-custom": "1" },
    });
    expect(complete).toHaveBeenCalledTimes(1);
    const [, , options] = (complete as ReturnType<typeof vi.fn>).mock
      .calls[0] as [
      unknown,
      unknown,
      {
        signal?: AbortSignal;
        apiKey?: string;
        headers?: Record<string, string>;
      },
    ];
    expect(options.apiKey).toBe("sk-test-123");
    expect(options.headers).toEqual({ "x-custom": "1" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts the model call after timeoutMs and defers", async () => {
    vi.useFakeTimers();
    const complete: CompleteFn = vi.fn(
      (_model, _context, options) =>
        new Promise<AssistantMessage>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    const promise = reviewPath({
      path: "/x/a.ts",
      config: { ...CONFIG, timeoutMs: 1000 },
      model: MODEL,
      complete,
    });
    await vi.advanceTimersByTimeAsync(1000);
    const outcome = await promise;
    expect(outcome.verdict).toEqual({ kind: "defer" });
    expect(outcome.deferReason).toBe("timeout");
  });
});
