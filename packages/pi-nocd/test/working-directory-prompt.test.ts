import { describe, expect, it } from "vitest";
import {
  buildWorkingDirectoryPrompt,
  ensureWorkingDirectoryPrompt,
  WORKING_DIRECTORY_HEADING,
} from "#src/working-directory-prompt.js";

describe("buildWorkingDirectoryPrompt", () => {
  it("names the literal resolved working directory", () => {
    const cwd = "/Users/chris/development/pi/pi-packages";
    const block = buildWorkingDirectoryPrompt(cwd);
    expect(block).toContain(`\`${cwd}\``);
  });

  it("forbids cd-prefixing the literal cwd", () => {
    const cwd = "/srv/project";
    const block = buildWorkingDirectoryPrompt(cwd);
    expect(block).toContain(`cd ${cwd} &&`);
  });

  it("forbids the generic cd $(pwd) prefix", () => {
    const block = buildWorkingDirectoryPrompt("/srv/project");
    expect(block).toContain("cd $(pwd) &&");
  });

  it("starts with the heading marker", () => {
    const block = buildWorkingDirectoryPrompt("/srv/project");
    expect(block.startsWith(WORKING_DIRECTORY_HEADING)).toBe(true);
  });
});

describe("ensureWorkingDirectoryPrompt", () => {
  it("appends the block to an existing system prompt", () => {
    const result = ensureWorkingDirectoryPrompt(
      "You are a helpful assistant.",
      "/srv/project",
    );
    expect(result).toContain("You are a helpful assistant.");
    expect(result).toContain(WORKING_DIRECTORY_HEADING);
    expect(result).toContain("`/srv/project`");
  });

  it("separates the base prompt from the block with a blank line", () => {
    const result = ensureWorkingDirectoryPrompt("Base.", "/srv/project");
    expect(result).toContain(`Base.\n\n${WORKING_DIRECTORY_HEADING}`);
  });

  it("is idempotent when the block is already present", () => {
    const once = ensureWorkingDirectoryPrompt("Base.", "/srv/project");
    const twice = ensureWorkingDirectoryPrompt(once, "/srv/project");
    expect(twice).toBe(once);
  });
});
