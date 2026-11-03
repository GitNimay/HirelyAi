import { env } from "cloudflare:workers";
import { gradeOutput, LANGUAGES, suiteInput, type Language, type RunResult, type Test } from "./workspace";

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
const unb64 = (s: string | null) => (s ? new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))) : "");

/** One sandboxed run. `id` is Judge0's status: 3 accepted (ran cleanly), 6 compile error, 0 unavailable. */
export type RawRun = { id: number; status: string; stdout: string; error: string; time: number | null; memory: number | null };

export async function runRaw(language: Language, code: string, stdin: string): Promise<RawRun> {
  const base = env.JUDGE0_URL || "https://ce.judge0.com";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.JUDGE0_KEY) {
    headers["X-RapidAPI-Key"] = env.JUDGE0_KEY;
    headers["X-RapidAPI-Host"] = new URL(base).host;
  }
  const res = await fetch(`${base}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({ language_id: LANGUAGES[language].judge0, source_code: b64(code.slice(0, 100_000)), stdin: b64(stdin), ...LIMITS }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => (console.error("judge0 fetch", String(e)), null));
  if (!res?.ok) {
    console.error("judge0", res?.status, await res?.text().catch(() => ""));
    return { id: 0, status: "unavailable", stdout: "", error: "Code execution is unavailable right now.", time: null, memory: null };
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

/** Runs a test suite in one submission (multi-case stdin) and grades it line by line. */
export async function runSuite(language: Language, code: string, tests: Test[], suite: "visible" | "hidden"): Promise<RunResult> {
  const r = await runRaw(language, code, suiteInput(tests));
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
  const cases = gradeOutput(tests, r.stdout, suite === "visible");
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
