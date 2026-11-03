import { describe, expect, it } from "vitest";
import { jsonObject } from "./bedrock";
import { cleanSignature, readReply, withSolution } from "./problem-gen";
import { starters } from "./starters";

const NL = "\n";
const FENCE = "`".repeat(3);

describe("generated problem checks", () => {
  it("accepts a well-formed signature", () => {
    expect(
      cleanSignature({ reads: [{ ints: ["n"] }, { rows: "n", fields: [["user", "str"], ["amount", "int"]] }], args: ["user", "amount"], returns: "the accounts" }),
    ).toEqual({ reads: [{ ints: ["n"] }, { rows: "n", fields: [["user", "str"], ["amount", "int"]] }], args: ["user", "amount"], returns: "the accounts" });
  });

  it("rejects signatures a starter couldn't be generated from", () => {
    expect(cleanSignature({ reads: [{ array: "list" }], args: ["list"] })).toBeNull(); // reserved word
    expect(cleanSignature({ reads: [{ rows: "q", fields: [["a", "int"]] }], args: ["a"] })).toBeNull(); // row count never read
    expect(cleanSignature({ reads: [{ ints: ["n"] }, { array: "n" }], args: ["n"] })).toBeNull(); // duplicate name
    expect(cleanSignature({ reads: [{ str: "s" }], args: ["t"] })).toBeNull(); // solve() takes nothing it read
    expect(cleanSignature({ reads: [{ weird: "x" }], args: ["x"] })).toBeNull();
    expect(cleanSignature(null)).toBeNull();
  });

  it("drops the reference solution into the generated Python starter", () => {
    const sig = cleanSignature({ reads: [{ str: "s" }], args: ["s"], returns: "x" })!;
    const code = withSolution(starters(sig).python, ["def solve(s):", "    return s[::-1]"].join(NL));
    expect(code).toContain(["def solve(s):", "    return s[::-1]"].join(NL));
    expect(code).toContain("def main():");
    expect(code).not.toContain('return ""');
    expect(withSolution(starters(sig).python, "print('hacked')")).toBeNull(); // no solve()
  });

  it("accepts helpers and imports around solve(), but nothing that runs at the top level", () => {
    const sig = cleanSignature({ reads: [{ str: "s" }], args: ["s"], returns: "x" })!;
    const helpers = ["from collections import Counter", "", "def helper(x):", "    return x", "", "def solve(s):", "    return helper(s)"].join(NL);
    expect(withSolution(starters(sig).python, helpers)).not.toBeNull();
    expect(withSolution(starters(sig).python, ["def solve(s):", "    return s", "print(solve('x'))"].join(NL))).toBeNull();
  });

  it("reads a reply: the JSON, the solve() block and the make_large() block", () => {
    const text = [
      "Here you go.",
      '{ "problem": { "title": "T", "examples": [] } }',
      `${FENCE}python`,
      "import heapq",
      "",
      "def solve(nums):",
      "    return str(sum(nums))",
      FENCE,
      `${FENCE}python`,
      "def make_large():",
      '    return " ".join(map(str, range(10)))',
      FENCE,
    ].join(NL);
    const r = readReply(text).problem as Record<string, string>;
    expect(r.title).toBe("T");
    expect(r.solution).toContain("def solve(nums):");
    expect(r.solution).toContain("import heapq");
    expect(r.generator).toContain("def make_large():");
    expect(() => readReply('{ "problem": {} }')).toThrow(); // no solution block
  });
});

describe("tolerant JSON", () => {
  it("repairs raw newlines and tabs inside strings, which models often emit", () => {
    const raw = `noise { "input": "1 2${NL}3 4", "tab": "a\tb", "ok": true } trailing`;
    expect(jsonObject(raw)).toEqual({ input: `1 2${NL}3 4`, tab: "a\tb", ok: true });
    expect(jsonObject('{ "a": [1, 2] }')).toEqual({ a: [1, 2] });
  });
});
