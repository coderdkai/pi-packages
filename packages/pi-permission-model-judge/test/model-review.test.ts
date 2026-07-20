import type { AssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelJudgeConfig } from "#src/config-schema";
import {
  type CompleteFn,
  GENERIC_TEACHING_REASON,
  reviewPath,
} from "#src/model-review";

const CONFIG: ModelJudgeConfig = {
  provider: "anthropic",
  model: "claude-haiku",
  instructions: "Flag doubled path segments; explain the correct location.",
  typoPatterns: [".*"],
  timeoutMs: 5000,
};

// A minimal model stand-in — reviewPath only forwards it to `complete`.
const MODEL = { provider: "anthropic", id: "claude-haiku" } as never;

function assistantText(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-haiku",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function completeReturning(text: string): CompleteFn {
  return vi.fn(async () => assistantText(text));
}

describe("reviewPath", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("denies with the model's reason on a deny verdict", async () => {
    const complete = completeReturning(
      JSON.stringify({
        verdict: "deny",
        reason: "Wrong path; use pi-packages.",
      }),
    );
    const verdict = await reviewPath({
      path: "/x/pi-permission-system/packages/pi-permission-system/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(verdict).toEqual({
      kind: "deny",
      reason: "Wrong path; use pi-packages.",
    });
  });

  it("substitutes a generic reason when a deny omits its reason", async () => {
    const complete = completeReturning(JSON.stringify({ verdict: "deny" }));
    const verdict = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(verdict).toEqual({ kind: "deny", reason: GENERIC_TEACHING_REASON });
  });

  it("defers on a defer verdict", async () => {
    const complete = completeReturning(JSON.stringify({ verdict: "defer" }));
    const verdict = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(verdict).toEqual({ kind: "defer" });
  });

  it("defers when the reply is not parseable JSON", async () => {
    const complete = completeReturning("I think this path is fine, honestly.");
    const verdict = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(verdict).toEqual({ kind: "defer" });
  });

  it("defers when the verdict value is unrecognized", async () => {
    const complete = completeReturning(JSON.stringify({ verdict: "maybe" }));
    const verdict = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(verdict).toEqual({ kind: "defer" });
  });

  it("defers when complete rejects", async () => {
    const complete: CompleteFn = vi.fn(async () => {
      throw new Error("model unavailable");
    });
    const verdict = await reviewPath({
      path: "/x/a.ts",
      config: CONFIG,
      model: MODEL,
      complete,
    });
    expect(verdict).toEqual({ kind: "defer" });
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
    await expect(promise).resolves.toEqual({ kind: "defer" });
  });
});
