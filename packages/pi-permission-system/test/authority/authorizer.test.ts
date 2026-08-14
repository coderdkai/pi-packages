import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { ParentAuthorizer } from "#src/authority/approval-escalator";
import { selectAuthorizer } from "#src/authority/authorizer";
import { DenyingAuthorizer } from "#src/authority/denying-authorizer";
import { LocalUserAuthorizer } from "#src/authority/local-user-authorizer";
import {
  makeAuthorizerSelectionDeps as makeDeps,
  makeDetection,
} from "#test/helpers/authorizer-fixtures";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(hasUI: boolean): ExtensionContext {
  return {
    hasUI,
    mode: "tui",
    ui: { select: vi.fn(), input: vi.fn(), custom: vi.fn() },
    sessionManager: {
      getSessionId: vi.fn().mockReturnValue("session-1"),
      getSessionDir: vi.fn().mockReturnValue("/sessions/session-1"),
      getEntries: vi.fn().mockReturnValue([]),
    },
  } as unknown as ExtensionContext;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("selectAuthorizer", () => {
  it("selects LocalUserAuthorizer when the context has UI", () => {
    const authorizer = selectAuthorizer(makeCtx(true), makeDeps());
    expect(authorizer).toBeInstanceOf(LocalUserAuthorizer);
  });

  it("selects LocalUserAuthorizer even when the context is also a subagent", () => {
    const authorizer = selectAuthorizer(
      makeCtx(true),
      makeDeps({ detection: makeDetection(true) }),
    );
    expect(authorizer).toBeInstanceOf(LocalUserAuthorizer);
  });

  it("selects ParentAuthorizer when there is no UI but the context is a subagent", () => {
    const authorizer = selectAuthorizer(
      makeCtx(false),
      makeDeps({ detection: makeDetection(true) }),
    );
    expect(authorizer).toBeInstanceOf(ParentAuthorizer);
  });

  it("selects DenyingAuthorizer when there is no UI and no subagent", () => {
    const authorizer = selectAuthorizer(
      makeCtx(false),
      makeDeps({ detection: makeDetection(false) }),
    );
    expect(authorizer).toBeInstanceOf(DenyingAuthorizer);
  });
});
