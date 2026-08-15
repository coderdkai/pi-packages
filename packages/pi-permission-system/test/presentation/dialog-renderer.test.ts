import { describe, expect, it } from "vitest";
import {
  completeViewBudget,
  renderPromptDialog,
} from "#src/presentation/dialog-renderer";
import { makePromptPayload } from "#test/helpers/prompt-details-fixtures";

const WIDE = completeViewBudget(200);

/** The rendered lines for a payload built from the shared structural fixture. */
function render(
  overrides: Parameters<typeof makePromptPayload>[0],
): readonly string[] {
  return renderPromptDialog(makePromptPayload(overrides), WIDE).lines;
}

/** A payload whose request facts override the fixture's defaults. */
function requestFacts(
  overrides: Partial<ReturnType<typeof makePromptPayload>["request"]>,
) {
  return { ...makePromptPayload().request, ...overrides };
}

describe("renderPromptDialog", () => {
  describe("the invariant core", () => {
    it("renders a bash ask as one aligned fact per line", () => {
      expect(
        render({
          kind: "bash",
          request: requestFacts({
            requester: {
              agentName: "scout",
              forwarded: false,
              sessionId: null,
            },
            surface: "bash",
            toolName: "bash",
            value: "cat /etc/hosts",
            matchedPattern: "*",
          }),
        }),
      ).toEqual([
        "agent   : scout",
        "tool    : bash",
        "rule    : *",
        "command : cat /etc/hosts",
      ]);
    });

    it("names the gate surface when it differs from the tool", () => {
      expect(
        render({
          kind: "external_directory",
          request: requestFacts({
            surface: "external_directory",
            toolName: "write",
            value: "/etc/hosts",
            matchedPattern: "*",
          }),
        }),
      ).toEqual([
        "tool    : write",
        "surface : external_directory",
        "rule    : *",
        "path    : /etc/hosts",
      ]);
    });

    it("omits an agent line for an unnamed local requester, and a surface the value label already names", () => {
      expect(
        render({
          kind: "path",
          request: requestFacts({
            surface: "path",
            toolName: "read",
            value: "/tmp/x",
            matchedPattern: null,
          }),
        }),
      ).toEqual(["tool : read", "path : /tmp/x"]);
    });

    it("omits the value line when the tool line already carries it", () => {
      expect(
        render({
          kind: "tool",
          request: requestFacts({
            surface: "fetch",
            toolName: "fetch",
            value: "fetch",
            matchedPattern: "*",
          }),
        }),
      ).toEqual(["tool : fetch", "rule : *"]);
    });

    it("labels an MCP ask's value as the target", () => {
      expect(
        render({
          kind: "mcp",
          request: requestFacts({
            surface: "mcp__github__create_issue",
            toolName: "mcp__github__create_issue",
            value: "github:create_issue",
            matchedPattern: "mcp__github__*",
          }),
        }),
      ).toEqual([
        "tool   : mcp__github__create_issue",
        "rule   : mcp__github__*",
        "target : github:create_issue",
      ]);
    });

    it("renders a skill ask without repeating the surface", () => {
      expect(
        render({
          kind: "skill",
          request: requestFacts({
            surface: "skill",
            toolName: null,
            value: "deploy",
            matchedPattern: null,
          }),
        }),
      ).toEqual(["skill : deploy"]);
    });

    it("renders the executed unit of an unstrippable wrapper", () => {
      expect(
        render({
          kind: "bash",
          request: requestFacts({
            surface: "bash",
            toolName: "bash",
            value: "xargs grep foo",
            matchedPattern: "<indirection-bash-wrapper>",
            executedUnit: "grep foo",
          }),
        }),
      ).toEqual([
        "tool    : bash",
        "rule    : <indirection-bash-wrapper>",
        "command : xargs grep foo",
        "runs    : grep foo",
      ]);
    });

    it("names the nested context the offending unit ran in", () => {
      expect(
        render({
          kind: "bash",
          request: requestFacts({
            surface: "bash",
            toolName: "bash",
            value: "rm -rf /tmp/x",
            matchedPattern: "rm *",
            commandContext: "command_substitution",
          }),
        }),
      ).toEqual([
        "tool    : bash",
        "rule    : rm *",
        "command : rm -rf /tmp/x",
        "context : command substitution",
      ]);
    });

    it("names the invoked tool when a shell alias re-exposes bash", () => {
      expect(
        render({
          kind: "bash",
          request: requestFacts({
            surface: "bash",
            toolName: "bash",
            invokedToolName: "exec_command",
            value: "ls",
            matchedPattern: "*",
          }),
        }),
      ).toEqual([
        "tool    : bash (invoked as exec_command)",
        "rule    : *",
        "command : ls",
      ]);
    });
  });

  describe("a forwarded ask", () => {
    it("names the requesting subagent and its session", () => {
      expect(
        render({
          kind: "forwarded",
          request: requestFacts({
            requester: {
              agentName: "scout",
              forwarded: true,
              sessionId: "abc123",
            },
            surface: "bash",
            toolName: null,
            value: "cat /etc/hosts",
            matchedPattern: null,
          }),
        }),
      ).toEqual([
        "subagent : scout · session abc123",
        "surface  : bash",
        "command  : cat /etc/hosts",
      ]);
    });

    it("renders a version-skewed request that names neither agent nor session", () => {
      expect(
        render({
          kind: "forwarded",
          request: requestFacts({
            requester: { agentName: "", forwarded: true, sessionId: "" },
            surface: "read",
            toolName: null,
            value: "/tmp/x",
            matchedPattern: null,
          }),
        }),
      ).toEqual(["subagent : unknown", "surface  : read", "value    : /tmp/x"]);
    });
  });
});
