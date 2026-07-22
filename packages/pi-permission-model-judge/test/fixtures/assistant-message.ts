import type { AssistantMessage } from "@earendil-works/pi-ai";

/**
 * Wrap reply content in the common `AssistantMessage` envelope the tests share —
 * the metadata fields (`api`, `provider`, `usage`, …) are irrelevant to
 * `reviewPath`, which reads only `content`.
 */
export function assistantReply(
  content: AssistantMessage["content"],
): AssistantMessage {
  return {
    role: "assistant",
    content,
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

/** An assistant reply carrying a single text content part. */
export function assistantText(text: string): AssistantMessage {
  return assistantReply([{ type: "text", text }]);
}
