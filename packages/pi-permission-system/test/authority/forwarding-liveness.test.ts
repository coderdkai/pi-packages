import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SERVING_HEARTBEAT_REFRESH_MS,
  SERVING_HEARTBEAT_STALE_MS,
  type ServingHeartbeat,
  ServingHeartbeatStore,
  servingHeartbeatDir,
  servingHeartbeatPath,
} from "#src/authority/forwarding-liveness";
import { PERMISSION_FORWARDING_POLL_INTERVAL_MS } from "#src/authority/permission-forwarding";

let root: string;
let forwardingDir: string;
let clock: number;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "forwarding-liveness-"));
  forwardingDir = join(root, "forwarding");
  clock = 1_700_000_000_000;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeStore(
  overrides: Partial<
    ConstructorParameters<typeof ServingHeartbeatStore>[0]
  > = {},
) {
  const logger = { review: vi.fn(), debug: vi.fn() };
  const store = new ServingHeartbeatStore({
    forwardingDir,
    logger,
    now: () => clock,
    pid: 4242,
    ...overrides,
  });
  return { store, logger };
}

function readRecord(sessionId: string): ServingHeartbeat {
  return JSON.parse(
    readFileSync(servingHeartbeatPath(forwardingDir, sessionId), "utf-8"),
  ) as ServingHeartbeat;
}

describe("timing constants", () => {
  it("refreshes less often than the inbox is polled, so a per-tick call is cheap", () => {
    expect(SERVING_HEARTBEAT_REFRESH_MS).toBeGreaterThan(
      PERMISSION_FORWARDING_POLL_INTERVAL_MS,
    );
  });

  it("tolerates several missed refreshes before calling a record stale", () => {
    expect(SERVING_HEARTBEAT_STALE_MS).toBeGreaterThan(
      SERVING_HEARTBEAT_REFRESH_MS * 2,
    );
  });
});

describe("servingHeartbeatPath", () => {
  it("places the record beside the sessions tree, not inside it", () => {
    expect(servingHeartbeatDir(forwardingDir)).toBe(
      join(forwardingDir, "serving"),
    );
    expect(servingHeartbeatPath(forwardingDir, "sess-1")).toBe(
      join(forwardingDir, "serving", "sess-1.json"),
    );
  });

  it("encodes a session id that would otherwise escape the directory", () => {
    expect(servingHeartbeatPath(forwardingDir, "a/../b")).toBe(
      join(forwardingDir, "serving", "a%2F..%2Fb.json"),
    );
  });
});

describe("ServingHeartbeatStore.markServing", () => {
  it("publishes the session id, the serving process, and the write time", () => {
    const { store } = makeStore();
    store.markServing("sess-1");
    expect(readRecord("sess-1")).toEqual({
      sessionId: "sess-1",
      pid: 4242,
      updatedAt: clock,
    });
  });

  it("creates the record owner-only inside an owner-only directory", () => {
    const { store } = makeStore();
    store.markServing("sess-1");
    expect(
      statSync(servingHeartbeatPath(forwardingDir, "sess-1")).mode & 0o777,
    ).toBe(0o600);
    expect(statSync(servingHeartbeatDir(forwardingDir)).mode & 0o777).toBe(
      0o700,
    );
  });

  it("does not rewrite within the refresh window, so a per-tick caller is cheap", () => {
    const { store } = makeStore();
    store.markServing("sess-1");
    clock += SERVING_HEARTBEAT_REFRESH_MS - 1;
    store.markServing("sess-1");
    expect(readRecord("sess-1").updatedAt).toBe(
      clock - (SERVING_HEARTBEAT_REFRESH_MS - 1),
    );
  });

  it("rewrites once the refresh window has elapsed", () => {
    const { store } = makeStore();
    store.markServing("sess-1");
    clock += SERVING_HEARTBEAT_REFRESH_MS;
    store.markServing("sess-1");
    expect(readRecord("sess-1").updatedAt).toBe(clock);
  });

  it("rewrites immediately for a different session id", () => {
    const { store } = makeStore();
    store.markServing("sess-1");
    clock += 1;
    store.markServing("sess-2");
    expect(readRecord("sess-2").updatedAt).toBe(clock);
    expect(readRecord("sess-1").updatedAt).toBe(clock - 1);
  });

  it("republishes at the next refresh boundary when the record was removed underneath it", () => {
    // The gap is bounded by the refresh window, which is shorter than the
    // grace a forwarding child waits out — so a pruned or externally deleted
    // record cannot make a live session look unserved for long enough to
    // abandon a request.
    const { store } = makeStore();
    store.markServing("sess-1");
    rmSync(servingHeartbeatPath(forwardingDir, "sess-1"));
    clock += SERVING_HEARTBEAT_REFRESH_MS;
    store.markServing("sess-1");
    expect(readRecord("sess-1").updatedAt).toBe(clock);
  });

  it("reports an unusable directory instead of throwing out of the poll timer", () => {
    writeFileSync(join(root, "blocker"), "not a directory", "utf-8");
    const { store, logger } = makeStore({
      forwardingDir: join(root, "blocker", "forwarding"),
    });
    expect(() => {
      store.markServing("sess-1");
    }).not.toThrow();
    expect(logger.review).toHaveBeenCalledWith(
      "permission_forwarding.error",
      expect.objectContaining({ message: expect.stringContaining("serving") }),
    );
  });
});

describe("ServingHeartbeatStore.clearServing", () => {
  it("withdraws the record", () => {
    const { store } = makeStore();
    store.markServing("sess-1");
    store.clearServing("sess-1");
    expect(existsSync(servingHeartbeatPath(forwardingDir, "sess-1"))).toBe(
      false,
    );
  });

  it("leaves the directory in place, so a sibling session's write cannot race it", () => {
    const { store } = makeStore();
    store.markServing("sess-1");
    store.clearServing("sess-1");
    expect(existsSync(servingHeartbeatDir(forwardingDir))).toBe(true);
  });

  it("leaves a sibling session's record untouched", () => {
    const { store } = makeStore();
    store.markServing("sess-1");
    store.markServing("sess-2");
    store.clearServing("sess-1");
    expect(readRecord("sess-2").sessionId).toBe("sess-2");
  });

  it("is a no-op for a session that was never marked", () => {
    const { store, logger } = makeStore();
    expect(() => {
      store.clearServing("sess-1");
    }).not.toThrow();
    expect(logger.review).not.toHaveBeenCalled();
  });

  it("republishes after a withdrawal rather than staying throttled", () => {
    const { store } = makeStore();
    store.markServing("sess-1");
    store.clearServing("sess-1");
    clock += 1;
    store.markServing("sess-1");
    expect(readRecord("sess-1").updatedAt).toBe(clock);
  });
});
