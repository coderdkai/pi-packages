import { getMarkdownTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { Container, visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

function allRows(content: TranscriptContent, width = WIDTH): string[] {
  return content.slice(width, 0, content.lineCount(width));
}

function rendered(content: TranscriptContent, width = WIDTH): string {
  return allRows(content, width).join("\n");
}

function manyMessages(count: number): SessionMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: "user",
    content: `message ${i}\n\nA paragraph long enough to wrap at the test width and produce several rows.`,
  })) as unknown as SessionMessage[];
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
      expect(makeContent().lineCount(0)).toBe(0);
      expect(makeContent().slice(0, 0, 10)).toEqual([]);
    });

    it("truncates every row to the requested width", () => {
      const messages = [
        { role: "user", content: "x".repeat(500) },
      ] as unknown as SessionMessage[];

      const lines = allRows(contentFrom(messages), 40);

      expect(lines.every((line) => visibleWidth(line) <= 40)).toBe(true);
    });
  });

  describe("viewport slicing", () => {
    it("returns only the requested window", () => {
      const content = contentFrom(manyMessages(20));
      const all = allRows(content);

      expect(content.slice(WIDTH, 4, 3)).toEqual(all.slice(4, 7));
    });

    it("clamps a window that runs past the last row", () => {
      const content = contentFrom(manyMessages(3));
      const total = content.lineCount(WIDTH);

      expect(content.slice(WIDTH, total - 1, 10)).toEqual(allRows(content).slice(total - 1));
    });

    it("includes the live activity row in the last window", () => {
      const source = fakeSource({
        getMessages: () => manyMessages(3),
        streaming: () => ({ activeTools: new Map([["k", "read"]]), responseText: "" }),
      });
      const content = makeContent(source);
      const total = content.lineCount(WIDTH);

      expect(content.slice(WIDTH, total - 2, 2).join("\n")).toContain("◍");
    });
  });

  // White-box pins: these are the only assertions that catch a silent return to
  // re-rendering the whole transcript on every paint and keypress.
  describe("render accounting", () => {
    afterEach(() => vi.restoreAllMocks());

    it("renders the component tree once across repeated paints and scrolls", () => {
      const content = contentFrom(manyMessages(20));
      const render = vi.spyOn(Container.prototype, "render");

      content.slice(WIDTH, 0, 10);
      const afterFirstPaint = render.mock.calls.length;
      content.slice(WIDTH, 0, 10);
      content.slice(WIDTH, 5, 10);
      content.lineCount(WIDTH);

      expect(afterFirstPaint).toBeGreaterThan(0);
      expect(render.mock.calls.length).toBe(afterFirstPaint);
    });

    it("does not consult the source's message history while painting", () => {
      const messages = manyMessages(5);
      const getMessages = vi.fn(() => messages);
      const content = makeContent(fakeSource({ getMessages }));
      getMessages.mockClear();

      content.lineCount(WIDTH);
      content.slice(WIDTH, 0, 10);
      content.slice(WIDTH, 3, 10);

      expect(getMessages).not.toHaveBeenCalled();
    });

    it("re-renders at a new width, then caches that width too", () => {
      const content = contentFrom(manyMessages(20));
      content.slice(WIDTH, 0, 10);
      const render = vi.spyOn(Container.prototype, "render");

      content.slice(WIDTH + 20, 0, 10);
      const afterWidthChange = render.mock.calls.length;
      content.slice(WIDTH + 20, 0, 10);

      expect(afterWidthChange).toBeGreaterThan(0);
      expect(render.mock.calls.length).toBe(afterWidthChange);
    });

    it("re-renders after the source changes", () => {
      let messages = manyMessages(5);
      const content = makeContent(fakeSource({ getMessages: () => messages }));
      content.slice(WIDTH, 0, 10);
      const render = vi.spyOn(Container.prototype, "render");

      messages = manyMessages(6);
      content.apply();
      content.slice(WIDTH, 0, 10);

      expect(render.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
