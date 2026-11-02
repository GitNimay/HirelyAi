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

export async function runSuite(language: Language, code: string, tests: Test[], suite: "visible" | "hidden"): Promise<RunResult> {
  const base = env.JUDGE0_URL || "https://ce.judge0.com";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.JUDGE0_KEY) {
    headers["X-RapidAPI-Key"] = env.JUDGE0_KEY;
    headers["X-RapidAPI-Host"] = new URL(base).host;
  }
  const empty = (status: string, error = ""): RunResult => ({
    suite,
    passed: 0,
    total: tests.length,
    cases: tests.map((t) => ({ name: t.name, passed: false })),
    status,
    error,
    time: null,
    memory: null,
  });
  const res = await fetch(`${base}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      language_id: LANGUAGES[language].judge0,
      source_code: b64(code.slice(0, 100_000)),
      stdin: b64(suiteInput(tests)),
      ...LIMITS,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => (console.error("judge0 fetch", String(e)), null));
  if (!res?.ok) {
    console.error("judge0", res?.status, await res?.text().catch(() => ""));
    return empty("unavailable", "Code execution is unavailable right now.");
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
  const status = r.status?.description ?? "Unknown";
  const error = (unb64(r.compile_output) || unb64(r.stderr) || unb64(r.message)).slice(0, 2000);
  if (r.status?.id === 6) return empty("Compilation Error", error); // compile error: nothing ran
  const cases = gradeOutput(tests, unb64(r.stdout), suite === "visible");
  const passed = cases.filter((c) => c.passed).length;
  return {
    suite,
    passed,
    total: tests.length,
    cases,
    status: passed === tests.length && r.status?.id === 3 ? "Accepted" : r.status?.id === 3 ? "Wrong Answer" : status,
    error,
    time: r.time ? Number(r.time) : null,
    memory: r.memory,
  };
}
