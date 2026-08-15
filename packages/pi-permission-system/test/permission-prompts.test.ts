import { describe, expect, test } from "vitest";
import {
  formatMissingToolNameReason,
  formatSkillAskPrompt,
  formatSkillPathAskPrompt,
  formatUnknownToolReason,
} from "#src/permission-prompts";
import type { SkillPromptEntry } from "#src/skill-prompt-sanitizer";

function skillEntry(name: string): SkillPromptEntry {
  return {
    name,
    description: "A skill",
    location: `/skills/${name}/SKILL.md`,
    state: "ask",
    normalizedLocation: `/skills/${name}/SKILL.md`,
    normalizedBaseDir: `/skills/${name}`,
  };
}

describe("formatMissingToolNameReason", () => {
  test("mentions missing tool name and pi.getAllTools()", () => {
    const result = formatMissingToolNameReason();
    expect(result).toContain("no tool name");
    expect(result).toContain("pi.getAllTools()");
  });
});

describe("formatUnknownToolReason", () => {
  test("mentions the unknown tool name and lists available tools", () => {
    const result = formatUnknownToolReason("phantom", ["read", "write"]);
    expect(result).toContain("phantom");
    expect(result).toContain("read");
    expect(result).toContain("write");
  });

  test("includes MCP hint for non-mcp tool names", () => {
    const result = formatUnknownToolReason("my-server:tool", ["mcp"]);
    expect(result).toContain("mcp");
  });

  test("omits MCP hint when tool name is 'mcp'", () => {
    const result = formatUnknownToolReason("mcp", []);
    expect(result).not.toContain("call the registered 'mcp' tool");
  });

  test("shows 'none' when no tools are registered", () => {
    const result = formatUnknownToolReason("ghost", []);
    expect(result).toContain("none");
  });

  test("caps preview at 10 tools and appends ellipsis for longer lists", () => {
    const tools = Array.from({ length: 15 }, (_, i) => `tool${i}`);
    const result = formatUnknownToolReason("ghost", tools);
    expect(result).toContain("...");
  });
});

describe("formatSkillAskPrompt", () => {
  test("includes skill name and agent name", () => {
    const result = formatSkillAskPrompt("librarian", "my-agent");
    expect(result).toContain("librarian");
    expect(result).toContain("Agent 'my-agent'");
  });

  test("uses 'Current agent' without agent name", () => {
    const result = formatSkillAskPrompt("librarian");
    expect(result).toContain("Current agent");
    expect(result).toContain("librarian");
  });
});

describe("formatSkillPathAskPrompt", () => {
  test("includes skill name, read path, and agent name", () => {
    const result = formatSkillPathAskPrompt(
      skillEntry("librarian"),
      "/skills/librarian/SKILL.md",
      "my-agent",
    );
    expect(result).toContain("librarian");
    expect(result).toContain("/skills/librarian/SKILL.md");
    expect(result).toContain("Agent 'my-agent'");
  });

  test("uses 'Current agent' without agent name", () => {
    const result = formatSkillPathAskPrompt(
      skillEntry("librarian"),
      "/skills/librarian/SKILL.md",
    );
    expect(result).toContain("Current agent");
  });
});

// formatSkillPathDenyReason has moved to denial-messages.ts.
// Its behavior is tested in denial-messages.test.ts.
