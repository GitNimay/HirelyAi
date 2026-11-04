import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptRun } from "./sandbox";
import { gradeBlocks, type Test } from "./workspace";

/**
 * The Bash / SQL driver, run for real with the local bash and sqlite3 (what Judge0's Bash image has), so a broken
 * driver fails CI instead of every candidate's run. Linux only (Windows' `bash` may be WSL); CI installs sqlite3.
 */
const has = (cmd: string) => {
  try {
    execFileSync("bash", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const linux = process.platform === "linux";
const run = (env: "bash" | "sql", file: string, tests: Test[]) => {
  const { code, stdin } = scriptRun(env, file, tests);
  const dir = mkdtempSync(join(tmpdir(), "hx-driver-"));
  try {
    return execFileSync("bash", ["-c", code], { cwd: dir, input: stdin, encoding: "utf8", timeout: 10_000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("script driver", () => {
  it.runIf(linux)("runs a Bash script once per case, on that case's stdin only", () => {
    const tests: Test[] = [
      { name: "two hits", input: "1.1.1.1 GET /\n2.2.2.2 GET /\n1.1.1.1 GET /a", output: "1.1.1.1 2\n2.2.2.2 1" },
      { name: "empty log", input: "", output: "0" }, // an empty file, not one blank line
      { name: "one", input: "9.9.9.9 x", output: "9.9.9.9 1" },
    ];
    const script = `#!/bin/bash
out=$(awk '{print $1}' | sort | uniq -c | sort -k1,1nr -k2 | awk '{print $2" "$1}')
[ -z "$out" ] && echo 0 || echo "$out"`;
    expect(gradeBlocks(tests, run("bash", script, tests), true).map((c) => c.passed)).toEqual([true, true, true]);
    // A script that cats its input proves the cases don't leak into each other
    const echo = gradeBlocks(tests, run("bash", "cat", tests), true);
    expect(echo.map((c) => c.got)).toEqual([tests[0].input, "", "9.9.9.9 x"]);
  });

  it.runIf(linux && has("sqlite3"))("runs a SQL query after each case's setup, in sqlite3's list format", () => {
    const setup = "CREATE TABLE o(c TEXT, amt INT);";
    const tests: Test[] = [
      { name: "two customers", input: `${setup}\nINSERT INTO o VALUES ('a',5),('b',7),('a',1);`, output: "a|6\nb|7" },
      { name: "no rows", input: setup, output: "" },
    ];
    const query = "SELECT c, SUM(amt) FROM o GROUP BY c ORDER BY c;";
    expect(gradeBlocks(tests, run("sql", query, tests), true).map((c) => c.passed)).toEqual([true, true]);
    expect(gradeBlocks(tests, run("sql", "SELEC broken;", tests), true)[0].passed).toBe(false);
  });

  it("can't be broken out of by a file that contains the heredoc end marker", () => {
    const { code } = scriptRun("bash", "echo HX_EOF_\nHX_EOF_", []);
    const marker = /<<'(HX_EOF_\w+)'/.exec(code)![1];
    expect(marker.length).toBeGreaterThan(20); // random per run
    expect(code.split("\n").filter((l) => l === marker)).toHaveLength(1);
  });
});
