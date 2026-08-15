import { describe, expect, it } from "vitest";
import {
  type CommandWord,
  classifyWrapperWords,
} from "#src/access-intent/bash/wrapper-analysis";

/**
 * Split a command unit into words the way the AST walk does — whitespace
 * separated, each carrying its offset into the unit text.
 *
 * Adequate here because every case is unquoted or single-quoted-as-one-word;
 * the real adapter reads named children, and `program.test.ts` pins that path.
 */
function words(unitText: string): CommandWord[] {
  const out: CommandWord[] = [];
  const pattern = /\S+/g;
  let match = pattern.exec(unitText);
  while (match !== null) {
    out.push({ text: match[0], offset: match.index });
    match = pattern.exec(unitText);
  }
  return out;
}

describe("classifyWrapperWords", () => {
  describe("opaque payloads", () => {
    it.each([
      "eval rm",
      "bash -c rm",
      "sh -c rm",
      "dash -c rm",
      "zsh -c rm",
      "ksh -c rm",
      "bash -ec rm",
      "bash -xc rm",
      "/bin/bash -c rm",
    ])("flags %s", (unit) => {
      expect(classifyWrapperWords(words(unit))).toBe("opaque-payload");
    });

    it("does not flag a shell running a script file", () => {
      expect(classifyWrapperWords(words("bash script.sh"))).toBeUndefined();
    });

    it("does not flag a -c cluster after the end-of-options marker", () => {
      expect(classifyWrapperWords(words("bash -- -c"))).toBeUndefined();
    });
  });

  describe("indirection wrappers", () => {
    it.each([
      "sudo aws s3 ls",
      "env FOO=bar aws",
      "xargs grep foo",
      "timeout 10 grep foo",
      "nice -n 5 make",
      "doas ls",
      "flock /tmp/lock ls",
    ])("flags %s", (unit) => {
      expect(classifyWrapperWords(words(unit))).toBe("indirection");
    });

    it.each([
      "find . -exec grep foo {} ;",
      "find . -execdir rm {} ;",
      "fd -x rm",
      "fd --exec-batch rm",
    ])("flags the exec-conditional %s", (unit) => {
      expect(classifyWrapperWords(words(unit))).toBe("indirection");
    });

    it("does not flag a bare search", () => {
      expect(classifyWrapperWords(words("find . -name x"))).toBeUndefined();
    });
  });

  describe("ordinary commands", () => {
    it.each([
      "ls -la",
      "grep -c foo file",
      "git status",
    ])("does not flag %s", (unit) => {
      expect(classifyWrapperWords(words(unit))).toBeUndefined();
    });

    it("does not flag an empty word list", () => {
      expect(classifyWrapperWords([])).toBeUndefined();
    });
  });
});
