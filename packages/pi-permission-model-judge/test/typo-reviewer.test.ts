import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { PromptPermissionDetails } from "@gotgenes/pi-permission-system";
import { describe, expect, it, vi } from "vitest";

import type { ModelJudgeConfig } from "#src/config-schema";
import type { CompleteFn, ModelRegistryLike } from "#src/model-review";
import { createTypoReviewer } from "#src/typo-reviewer";

const CONFIG: ModelJudgeConfig = {
  provider: "anthropic",
  model: "claude-haiku",
  instructions: "Flag doubled path segments.",
  typoPatterns: ["packages/pi-permission-system/packages/pi-permission-system"],
  timeoutMs: 5000,
};

const TYPO_PATH =
  "/x/packages/pi-permission-system/packages/pi-permission-system/src/a.ts";

const MODEL = { provider: "anthropic", id: "claude-haiku" } as Model<any>;

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

function makeDetails(
  overrides: Partial<PromptPermissionDetails> = {},
): PromptPermissionDetails {
  return {
    requestId: "req-1",
    source: "tool_call",
    agentName: null,
    message: "external directory access",
    surface: "external_directory",
    path: TYPO_PATH,
    ...overrides,
  };
}

function makeRegistry(model: Model<any> | undefined): ModelRegistryLike {
  return {
    find: vi.fn(() => model),
    getApiKeyAndHeaders: vi.fn(async () => ({
      ok: true as const,
      apiKey: "sk-test",
      headers: {},
    })),
  };
}

function denyingComplete(): CompleteFn {
  return vi.fn(async () =>
    assistantText(
      JSON.stringify({
        verdict: "deny",
        reason: "Doubled segment; use pi-packages.",
      }),
    ),
  );
}

/** A fake review-log seam: `review` + `debug` as `vi.fn()` stubs. */
function makeLog() {
  return { review: vi.fn(), debug: vi.fn() };
}

describe("createTypoReviewer", () => {
  it("defers a non-external_directory surface without a model or registry call", async () => {
    const complete = denyingComplete();
    const registry = makeRegistry(MODEL);
    const authorize = createTypoReviewer({
      getConfig: () => CONFIG,
      getRegistry: () => registry,
      complete,
    });
    const verdict = await authorize(
      makeDetails({ surface: "bash", path: undefined, command: "ls" }),
      {} as never,
      makeLog(),
    );
    expect(verdict).toEqual({ kind: "defer" });
    expect(complete).not.toHaveBeenCalled();
    expect(registry.find).not.toHaveBeenCalled();
  });

  it("defers when there is no config", async () => {
    const complete = denyingComplete();
    const authorize = createTypoReviewer({
      getConfig: () => undefined,
      getRegistry: () => makeRegistry(MODEL),
      complete,
    });
    const verdict = await authorize(makeDetails(), {} as never, makeLog());
    expect(verdict).toEqual({ kind: "defer" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("defers an external_directory ask with no path", async () => {
    const complete = denyingComplete();
    const authorize = createTypoReviewer({
      getConfig: () => CONFIG,
      getRegistry: () => makeRegistry(MODEL),
      complete,
    });
    const verdict = await authorize(
      makeDetails({ path: undefined, value: null }),
      {} as never,
      makeLog(),
    );
    expect(verdict).toEqual({ kind: "defer" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("defers without a model call when no pattern matches", async () => {
    const complete = denyingComplete();
    const registry = makeRegistry(MODEL);
    const authorize = createTypoReviewer({
      getConfig: () => CONFIG,
      getRegistry: () => registry,
      complete,
    });
    const verdict = await authorize(
      makeDetails({ path: "/x/pi-packages/src/a.ts" }),
      {} as never,
      makeLog(),
    );
    expect(verdict).toEqual({ kind: "defer" });
    expect(complete).not.toHaveBeenCalled();
    expect(registry.find).not.toHaveBeenCalled();
  });

  it("consults the model on a matched path and returns its verdict", async () => {
    const complete = denyingComplete();
    const authorize = createTypoReviewer({
      getConfig: () => CONFIG,
      getRegistry: () => makeRegistry(MODEL),
      complete,
    });
    const verdict = await authorize(makeDetails(), {} as never, makeLog());
    expect(verdict).toEqual({
      kind: "deny",
      reason: "Doubled segment; use pi-packages.",
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("resolves auth and forwards the credentials into the completion", async () => {
    const complete = denyingComplete();
    const registry: ModelRegistryLike = {
      find: vi.fn(() => MODEL),
      getApiKeyAndHeaders: vi.fn(async () => ({
        ok: true as const,
        apiKey: "sk-resolved",
        headers: { "anthropic-beta": "oauth-2025" },
      })),
    };
    const authorize = createTypoReviewer({
      getConfig: () => CONFIG,
      getRegistry: () => registry,
      complete,
    });
    const verdict = await authorize(makeDetails(), {} as never, makeLog());
    expect(verdict).toEqual({
      kind: "deny",
      reason: "Doubled segment; use pi-packages.",
    });
    expect(registry.getApiKeyAndHeaders).toHaveBeenCalledWith(MODEL);
    const [, , options] = (complete as ReturnType<typeof vi.fn>).mock
      .calls[0] as [
      unknown,
      unknown,
      { apiKey?: string; headers?: Record<string, string> },
    ];
    expect(options.apiKey).toBe("sk-resolved");
    expect(options.headers).toEqual({ "anthropic-beta": "oauth-2025" });
  });

  it("defers with a warning when auth does not resolve, without a model call", async () => {
    const complete = denyingComplete();
    const warn = vi.fn();
    const registry: ModelRegistryLike = {
      find: vi.fn(() => MODEL),
      getApiKeyAndHeaders: vi.fn(async () => ({
        ok: false as const,
        error: "no credentials configured",
      })),
    };
    const authorize = createTypoReviewer({
      getConfig: () => CONFIG,
      getRegistry: () => registry,
      complete,
      warn,
    });
    const verdict = await authorize(makeDetails(), {} as never, makeLog());
    expect(verdict).toEqual({ kind: "defer" });
    expect(complete).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("defers when the configured model does not resolve", async () => {
    const complete = denyingComplete();
    const warn = vi.fn();
    const authorize = createTypoReviewer({
      getConfig: () => CONFIG,
      getRegistry: () => makeRegistry(undefined),
      complete,
      warn,
    });
    const verdict = await authorize(makeDetails(), {} as never, makeLog());
    expect(verdict).toEqual({ kind: "defer" });
    expect(complete).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("reads the surface from accessIntent when the display surface is absent", async () => {
    const complete = denyingComplete();
    const authorize = createTypoReviewer({
      getConfig: () => CONFIG,
      getRegistry: () => makeRegistry(MODEL),
      complete,
    });
    const verdict = await authorize(
      makeDetails({
        surface: null,
        accessIntent: {
          surface: "external_directory",
          matchValues: [TYPO_PATH],
          boundaryValue: TYPO_PATH,
        },
      }),
      {} as never,
      makeLog(),
    );
    expect(verdict).toEqual({
      kind: "deny",
      reason: "Doubled segment; use pi-packages.",
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
