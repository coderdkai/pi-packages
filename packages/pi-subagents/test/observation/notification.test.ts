import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEventData,
  buildNotificationDetails,
  escapeXml,
  formatTaskNotification,
  getStatusLabel,
  NotificationManager,
} from "#src/observation/notification";
import { createTestSubagent } from "#test/helpers/make-subagent";

// ---- Pure helper tests ----

describe("escapeXml", () => {
  it("escapes &, <, >", () => {
    expect(escapeXml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("returns unchanged string with no special chars", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

describe("getStatusLabel", () => {
  it('returns error message for "error"', () => {
    expect(getStatusLabel("error", "timeout")).toBe("Error: timeout");
  });

  it('returns "unknown" when error is undefined', () => {
    expect(getStatusLabel("error")).toBe("Error: unknown");
  });

  it('returns label for "aborted"', () => {
    expect(getStatusLabel("aborted")).toBe("Aborted (max turns exceeded)");
  });

  it('returns label for "steered"', () => {
    expect(getStatusLabel("steered")).toBe("Wrapped up (turn limit)");
  });

  it('returns "Done" for completed', () => {
    expect(getStatusLabel("completed")).toBe("Done");
  });
});

describe("formatTaskNotification", () => {
  const baseRecord = createTestSubagent();

  it("produces valid XML structure", () => {
    const xml = formatTaskNotification(baseRecord, 500);
    expect(xml).toContain("<task-notification>");
    expect(xml).toContain("</task-notification>");
    expect(xml).toContain("<task-id>agent-1</task-id>");
    expect(xml).toContain("<status>Done</status>");
  });

  it("truncates long results", () => {
    const longResult = "x".repeat(600);
    const record = createTestSubagent({ result: longResult });
    const xml = formatTaskNotification(record, 100);
    expect(xml).toContain("truncated");
    expect(xml).not.toContain(longResult);
  });

  it("shows No output when result is undefined", () => {
    const record = createTestSubagent({ result: undefined });
    const xml = formatTaskNotification(record, 500);
    expect(xml).toContain("No output.");
  });

  it("includes toolCallId from record.toolCallId when present", () => {
    const record = createTestSubagent({ toolCallId: "tc-123" });
    const xml = formatTaskNotification(record, 500);
    expect(xml).toContain("<tool-use-id>tc-123</tool-use-id>");
  });

  it("excludes toolCallId when absent", () => {
    const xml = formatTaskNotification(baseRecord, 500);
    expect(xml).not.toContain("tool-use-id");
  });
});

describe("buildNotificationDetails", () => {
  const baseRecord = createTestSubagent({
    description: "Test",
    result: "Done.",
    toolUses: 2,
    completedAt: 3000,
    lifetimeUsage: { input: 100, output: 200, cacheWrite: 0 },
  });

  it("maps record fields to notification shape", () => {
    const details = buildNotificationDetails(baseRecord, 500);
    expect(details.id).toBe("agent-1");
    expect(details.description).toBe("Test");
    expect(details.status).toBe("completed");
    expect(details.toolUses).toBe(2);
    expect(details.durationMs).toBe(2000);
    expect(details.totalTokens).toBe(300);
    expect(details.resultPreview).toBe("Done.");
  });

  it("reads turnCount and maxTurns from the record", () => {
    const record = createTestSubagent({
      description: "Test", result: "Done.", toolUses: 2,
      completedAt: 3000, lifetimeUsage: { input: 100, output: 200, cacheWrite: 0 },
      turnCount: 7, maxTurns: 10,
    });
    const details = buildNotificationDetails(record, 500);
    expect(details.turnCount).toBe(7);
    expect(details.maxTurns).toBe(10);
  });

  it("truncates long result previews with ellipsis", () => {
    const record = createTestSubagent({ description: "Test", result: "x".repeat(600), toolUses: 2, completedAt: 3000, lifetimeUsage: { input: 100, output: 200, cacheWrite: 0 } });
    const details = buildNotificationDetails(record, 100);
    expect(details.resultPreview).toHaveLength(101); // 100 chars + "…"
    expect(details.resultPreview.endsWith("…")).toBe(true);
  });
});

describe("buildEventData", () => {
  const baseRecord = createTestSubagent({
    type: "Explore",
    description: "Search files",
    result: "Found 3 files",
    toolUses: 5,
    lifetimeUsage: { input: 1000, output: 500, cacheWrite: 0 },
  });

  it("includes all expected fields", () => {
    const data = buildEventData(baseRecord);
    expect(data).toEqual({
      id: "agent-1",
      type: "Explore",
      description: "Search files",
      result: "Found 3 files",
      error: undefined,
      status: "completed",
      toolUses: 5,
      durationMs: 1000,
      tokens: { input: 1000, output: 500, total: 1500 },
    });
  });

  it("omits tokens when total is zero", () => {
    const record = createTestSubagent({ type: "Explore", description: "Search files", result: "Found 3 files", toolUses: 5, lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 } });
    const data = buildEventData(record);
    expect(data.tokens).toBeUndefined();
  });

  it("uses Date.now() fallback when completedAt is undefined", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const record = createTestSubagent({ type: "Explore", description: "Search files", result: "Found 3 files", toolUses: 5, lifetimeUsage: { input: 1000, output: 500, cacheWrite: 0 }, completedAt: undefined });
    const data = buildEventData(record);
    expect(data.durationMs).toBe(4000); // 5000 - 1000
    vi.useRealTimers();
  });
});

// ---- Factory tests ----

describe("NotificationManager", () => {
  function makeArgs() {
    return {
      sendMessage: vi.fn(),
    };
  }

  function makeManager(args: ReturnType<typeof makeArgs>) {
    return new NotificationManager(args.sendMessage);
  }

  const baseRecord = createTestSubagent({
    description: "Test",
    result: "Done.",
    toolUses: 2,
    lifetimeUsage: { input: 100, output: 200, cacheWrite: 0 },
  });

  it("sendCompletion delivers the nudge immediately when the parent is idle", () => {
    const args = makeArgs();
    const system = makeManager(args);
    system.sendCompletion(baseRecord);
    expect(args.sendMessage).toHaveBeenCalledOnce();
  });

  it("every nudge carries the retrieval instruction", () => {
    const args = makeArgs();
    const system = makeManager(args);
    system.sendCompletion(baseRecord);
    const content = (args.sendMessage.mock.calls[0][0] as { content: string }).content;
    expect(content).toContain("get_subagent_result");
  });

  it("sendCompletion skips the nudge when the record is already consumed (enqueue-time guard)", () => {
    const args = makeArgs();
    const system = makeManager(args);
    const consumedRecord = createTestSubagent({ id: "consumed-1", consumedAt: 5000 });
    system.sendCompletion(consumedRecord);
    expect(args.sendMessage).not.toHaveBeenCalled();
  });

  describe("parent-turn boundary", () => {
    /**
     * Models Pi's delivery semantics. While the parent's agent run is active a
     * `followUp` is queued unrecallably and drained at turn end; once the run has
     * settled (`_isAgentRunActive` is already false when extensions are notified)
     * a `triggerTurn` message starts a fresh turn.
     * See `agent-session.ts:1443-1450` and `:581-582`.
     */
    function makePiParent() {
      const deliveredToLlm: string[] = [];
      let runActive = false;
      const manager = new NotificationManager((msg, opts) => {
        if (runActive && opts?.deliverAs === "followUp") {
          deliveredToLlm.push(msg.content); // handed to the unrecallable queue
        } else if (opts?.triggerTurn) {
          deliveredToLlm.push(msg.content);
        }
      });
      return {
        manager,
        deliveredToLlm,
        startRun() {
          runActive = true;
          manager.onParentAgentStart();
        },
        settleRun() {
          runActive = false;
          manager.onParentAgentSettled();
        },
      };
    }

    it("withholds a nudge that arrives while the parent's run is active", () => {
      const parent = makePiParent();
      parent.startRun();
      parent.manager.sendCompletion(createTestSubagent({ id: "held-1" }));
      expect(parent.deliveredToLlm).toHaveLength(0);
    });

    it("delivers the withheld nudge once the run settles when the parent never pulled", () => {
      const parent = makePiParent();
      parent.startRun();
      parent.manager.sendCompletion(createTestSubagent({ id: "kept-1" }));
      parent.settleRun();
      expect(parent.deliveredToLlm).toHaveLength(1);
    });

    it("suppresses the nudge when the parent pulls the result later in the same turn", () => {
      const parent = makePiParent();
      const record = createTestSubagent({ id: "race-1" });
      parent.startRun();
      parent.manager.sendCompletion(record);
      record.markConsumed(); // get_subagent_result, later in the same turn
      parent.settleRun();
      expect(parent.deliveredToLlm).toHaveLength(0);
    });

    it("collapses a re-completion during the same turn into a single delivery", () => {
      const parent = makePiParent();
      const record = createTestSubagent({ id: "recomplete-1" });
      parent.startRun();
      parent.manager.sendCompletion(record);
      parent.manager.sendCompletion(record); // e.g. a resumed run reaching terminal state again
      parent.settleRun();
      expect(parent.deliveredToLlm).toHaveLength(1);
    });

    it("delivers immediately when the parent is idle at completion", () => {
      const parent = makePiParent();
      parent.manager.sendCompletion(createTestSubagent({ id: "idle-1" }));
      expect(parent.deliveredToLlm).toHaveLength(1);
    });

    it("dispose drops nudges withheld for the current run", () => {
      const parent = makePiParent();
      parent.startRun();
      parent.manager.sendCompletion(createTestSubagent({ id: "disposed-1" }));
      parent.manager.dispose();
      parent.settleRun();
      expect(parent.deliveredToLlm).toHaveLength(0);
    });
  });
});
