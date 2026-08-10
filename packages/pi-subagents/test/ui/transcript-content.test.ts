import { getMarkdownTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";
import type { SessionMessage } from "#src/types";
import type { TranscriptSource } from "#src/ui/session-navigation";
import { TranscriptContent } from "#src/ui/transcript-content";
import { fakeSource, mockTui } from "#test/helpers/transcript-fixtures";

// Pi's per-entry components read the global interactive theme; Pi initializes it
// at startup before any command runs. Tests must initialize it explicitly.
beforeAll(() => initTheme(undefined, false));

const WIDTH = 76;

function makeContent(source: TranscriptSource = fakeSource()): TranscriptContent {
  return new TranscriptContent({
    tui: mockTui(),
    cwd: "/test/cwd",
    markdownTheme: getMarkdownTheme(),
    source,
  });
}

function contentFrom(messages: SessionMessage[]): TranscriptContent {
  return makeContent(fakeSource({ getMessages: () => messages }));
}

function rendered(content: TranscriptContent, width = WIDTH): string {
  return content.lines(width).join("\n");
}

describe("TranscriptContent", () => {
  describe("message mapping", () => {
    it("renders a user message", () => {
      expect(rendered(makeContent())).toContain("Hello world");
    });

    it("renders a tool call and its result through Pi's tool-execution component", () => {
      const messages = [
        {
          role: "assistant",
          content: [{ type: "toolCall", id: "tc-1", name: "read", arguments: { path: "/x.ts" } }],
          stopReason: "toolUse",
        },
        {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "read",
          content: [{ type: "text", text: "file body" }],
          isError: false,
        },
      ] as unknown as SessionMessage[];

      const out = rendered(contentFrom(messages));

      expect(out).toContain("read");
      expect(out).toContain("file body");
    });

    it("renders a skill invocation and the user message that follows it", () => {
      const messages = [
        {
          role: "user",
          content: '<skill name="testing" location="/skills/testing">\nskill body\n</skill>\n\nrun the suite',
        },
      ] as unknown as SessionMessage[];

      const out = rendered(contentFrom(messages));

      expect(out).toContain("testing");
      expect(out).toContain("run the suite");
    });

    it("renders a bash execution with its output", () => {
      const messages = [
        { role: "bashExecution", command: "ls -la", output: "total 0", exitCode: 0 },
      ] as unknown as SessionMessage[];

      expect(rendered(contentFrom(messages))).toContain("ls -la");
    });

    it("skips custom-role messages, which need the child session's renderer registry", () => {
      const messages = [
        { role: "custom", customType: "task-notification", content: "invisible payload" },
        { role: "user", content: "visible" },
      ] as unknown as SessionMessage[];

      const out = rendered(contentFrom(messages));

      expect(out).not.toContain("invisible payload");
      expect(out).toContain("visible");
    });
  });

  describe("live tail", () => {
    it("appends the streaming-activity row while the agent is running", () => {
      const source = fakeSource({
        streaming: () => ({ activeTools: new Map([["k", "read"]]), responseText: "" }),
      });

      expect(rendered(makeContent(source))).toContain("◍");
    });

    it("omits the streaming-activity row when the agent is not running", () => {
      expect(rendered(makeContent())).not.toContain("◍");
    });
  });

  describe("source changes", () => {
    it("picks up new messages on apply", () => {
      let messages = [{ role: "user", content: "first" }] as unknown as SessionMessage[];
      const content = makeContent(fakeSource({ getMessages: () => messages }));
      expect(rendered(content)).toContain("first");

      messages = [{ role: "user", content: "second" }] as unknown as SessionMessage[];
      content.apply();

      expect(rendered(content)).toContain("second");
    });
  });

  describe("width handling", () => {
    it("returns no rows at a non-positive width", () => {
      expect(makeContent().lines(0)).toEqual([]);
    });

    it("truncates every row to the requested width", () => {
      const messages = [
        { role: "user", content: "x".repeat(500) },
      ] as unknown as SessionMessage[];

      const lines = contentFrom(messages).lines(40);

      expect(lines.every((line) => visibleWidth(line) <= 40)).toBe(true);
    });
  });
});
