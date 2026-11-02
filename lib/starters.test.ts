import { describe, expect, it } from "vitest";
import { starters, type Signature } from "./starters";

const rateLimiter: Signature = {
  reads: [{ ints: ["limit", "window", "q"] }, { rows: "q", fields: [["users", "str"], ["times", "int"]] }],
  args: ["limit", "window", "users", "times"],
  returns: "Return ALLOW or DENY per request",
};

describe("generated starters", () => {
  const s = starters(rateLimiter);

  it("parse the input so the candidate only writes solve()", () => {
    expect(s.python).toContain("limit, window, q = map(int, lines[i].split()); i += 1");
    expect(s.python).toContain("def solve(limit, window, users, times):");
    expect(s.javascript).toContain("function solve(limit, window, users, times) {");
    expect(s.typescript).toContain("function solve(limit: number, window: number, users: string[], times: number[]): string {");
    expect(s.java).toContain("static String solve(int limit, int window, String[] users, int[] times)");
    expect(s.cpp).toContain("string solve(long long limit, long long window, const vector<string>& users, const vector<long long>& times)");
    expect(s.go).toContain("func solve(limit int, window int, users []string, times []int) string");
  });

  it("discards inputs Go would reject as unused, and avoids syntax old runtimes choke on", () => {
    expect(s.go).toContain("_ = q");
    expect(s.go).not.toContain("_ = users");
    expect(starters({ reads: [{ str: "s" }], args: ["s"], returns: "x" }).javascript).not.toContain("??");
  });
});
