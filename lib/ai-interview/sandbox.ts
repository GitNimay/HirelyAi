import { env } from "cloudflare:workers";
import { gradeChecks } from "./checks";
import {
  CASE_END,
  CODE_LANGUAGES,
  ENVS,
  gradeBlocks,
  gradeOutput,
  suiteInput,
  type CodeLanguage,
  type Env,
  type Language,
  type RunResult,
  type Test,
} from "./workspace";

/**
 * Runs candidate code in Judge0 (isolate sandbox: no network, CPU / memory / wall-time limits, read-only base image),
 * entirely off our infrastructure, so candidate code never runs near D1, R2 or our secrets.
 * JUDGE0_URL defaults to Judge0's free public instance; point it at the RapidAPI free tier (with JUDGE0_KEY) or a
 * self-hosted Judge0 without code changes.
 */
const LIMITS = { cpu_time_limit: 5, wall_time_limit: 10, memory_limit: 256_000, enable_network: false };
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); // spread caps out on big inputs
  return btoa(bin);
};
const unb64 = (s: string | null) =>
  s ? new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))) : "";

/** One sandboxed run. `id` is Judge0's status: 3 accepted (ran cleanly), 6 compile error, 0 unavailable. */
export type RawRun = {
  id: number;
  status: string;
  stdout: string;
  error: string;
  time: number | null;
  memory: number | null;
};

const BASH = 46; // Judge0 CE "Bash (5.0.0)": its image also has sqlite3 3.27

export async function runRaw(language: CodeLanguage | "bash", code: string, stdin: string): Promise<RawRun> {
  const base = env.JUDGE0_URL || "https://ce.judge0.com";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.JUDGE0_KEY) {
    headers["X-RapidAPI-Key"] = env.JUDGE0_KEY;
    headers["X-RapidAPI-Host"] = new URL(base).host;
  }
  const res = await fetch(`${base}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      language_id: language === "bash" ? BASH : CODE_LANGUAGES[language].judge0,
      source_code: b64(code.slice(0, 100_000)),
      stdin: b64(stdin),
      ...LIMITS,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => (console.error("judge0 fetch", String(e)), null));
  if (!res?.ok) {
    console.error("judge0", res?.status, await res?.text().catch(() => ""));
    return {
      id: 0,
      status: "unavailable",
      stdout: "",
      error: "Code execution is unavailable right now.",
      time: null,
      memory: null,
    };
  }
  const r = (await res.json()) as {
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    message: string | null;
    status?: { id: number; description: string };
    time: string | null;
    memory: number | null;
  };
  return {
    id: r.status?.id ?? -1,
    status: r.status?.description ?? "Unknown",
    stdout: unb64(r.stdout),
    error: (unb64(r.compile_output) || unb64(r.stderr) || unb64(r.message)).slice(0, 2000),
    time: r.time ? Number(r.time) : null,
    memory: r.memory,
  };
}

const CASE = "<<<HX_CASE>>>";
/** How each case runs in the driver: Bash reads the case as stdin; SQL runs after the case's setup statements. */
const RUN: Record<"bash" | "sql", string> = {
  bash: 'bash ./solution < "case$i"',
  sql: 'cat "case$i" ./solution | sqlite3 -batch',
};

/**
 * Script environments in ONE submission: a Bash driver writes the candidate's file, splits stdin into one file per
 * case, runs each case and ends its output with CASE_END. stdin: T, then each case after a CASE line.
 */
export function scriptRun(env: "bash" | "sql", file: string, tests: Test[]) {
  const eof = `HX_EOF_${crypto.randomUUID().replaceAll("-", "")}`;
  const code = `cat > ./solution <<'${eof}'
${file}
${eof}
read -r T
for ((i = 1; i <= T; i++)); do : > "case$i"; done
awk -v s='${CASE}' '$0 == s { n++; next } n > 0 { print > ("case" n) }'
for ((i = 1; i <= T; i++)); do
  ${RUN[env]}
  printf '\\n%s\\n' '${CASE_END}'
done
`;
  // An empty input is an empty file, not one blank line
  const stdin = `${tests.length}\n${tests.map((t) => (t.input ? `${CASE}\n${t.input}` : CASE)).join("\n")}\n`;
  return { code, stdin };
}

/**
 * Runs a test suite and grades it: code in one submission (multi-case stdin, line by line), scripts through the
 * driver (whole output per case), config files by their checks (no sandbox).
 */
export async function runSuite(
  language: Language,
  code: string,
  tests: Test[],
  suite: "visible" | "hidden",
): Promise<RunResult> {
  if (language in ENVS && ENVS[language as Env].grade === "checks")
    return gradeChecks(language as Env, code, tests, suite);
  const script = language === "bash" || language === "sql" ? scriptRun(language, code, tests) : null;
  const r = script
    ? await runRaw("bash", script.code, script.stdin)
    : await runRaw(language as CodeLanguage, code, suiteInput(tests));
  const failed = (status: string): RunResult => ({
    suite,
    passed: 0,
    total: tests.length,
    cases: tests.map((t) => ({ name: t.name, passed: false })),
    status,
    error: r.error,
    time: null,
    memory: null,
  });
  if (r.id === 0) return failed("unavailable");
  if (r.id === 6) return failed("Compilation Error"); // nothing ran
  const cases = (script ? gradeBlocks : gradeOutput)(tests, r.stdout, suite === "visible");
  const passed = cases.filter((c) => c.passed).length;
  return {
    suite,
    passed,
    total: tests.length,
    cases,
    status: passed === tests.length && r.id === 3 ? "Accepted" : r.id === 3 ? "Wrong Answer" : r.status,
    error: r.error,
    time: r.time,
    memory: r.memory,
  };
}
