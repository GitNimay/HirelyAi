/**
 * Coding and system-design content plus the pure helpers around it: the problem bank (HackerRank-style stdin/stdout,
 * so one generic starter per language works for every problem), design prompts, editor diffs and whiteboard scenes.
 * Shared by the room (server), the candidate workspace and the report.
 */

import type { Check } from "./checks";
import type { Signature } from "./starters";

export type Difficulty = "easy" | "medium" | "hard";
export type Ladder = [hint: string, constraint: string, scale: string]; // follow-up ladder, levels 1-3

/**
 * Tests use a multi-case format: stdin is T, then T cases; stdout is one line per case. A suite runs in ONE sandbox
 * submission and is diffed line by line. ponytail: a crash mid-run fails every later case; per-case submissions if
 * that ever matters more than the free tier's request budget.
 */
export type Test = { name: string; input: string; output: string; check?: Check };
export type Problem = {
  id: string;
  title: string;
  difficulty: Difficulty;
  statement: string;
  input: string; // format of ONE case (after the T line)
  output: string;
  constraints: string;
  /** Code problems: how one case's input is parsed, which drives the generated starter code (lib/starters.ts). */
  signature?: Signature;
  /**
   * DevOps / data problems: the environment is fixed and the candidate edits one file, starting from `starter`.
   * Script environments run every test's stdin through the file; config environments grade it with `check`s.
   */
  env?: Env;
  starter?: string;
  visible: Test[];
  hidden: Test[];
  ladder: Ladder;
  /** One sentence: the intended approach and its time/space complexity. Server and report only (publicProblem omits it). */
  approach?: string;
};
/** What the candidate's browser may see: never the hidden tests or the ladder. */
export type PublicProblem = Omit<Problem, "hidden" | "ladder">;
/** An allowlist, so a field added to Problem later never reaches the browser by accident. */
export const publicProblem = (p: Problem): PublicProblem => ({
  id: p.id,
  title: p.title,
  difficulty: p.difficulty,
  statement: p.statement,
  input: p.input,
  output: p.output,
  constraints: p.constraints,
  ...(p.signature && { signature: p.signature }),
  ...(p.env && { env: p.env, starter: p.starter ?? "" }),
  visible: p.visible,
});

/** General-purpose languages: any code problem can be solved in any of them (the candidate picks). */
export const CODE_LANGUAGES = {
  python: { label: "Python 3.12", judge0: 100, monaco: "python" },
  javascript: { label: "JavaScript (Node.js 22)", judge0: 102, monaco: "javascript" },
  typescript: { label: "TypeScript 5.6", judge0: 101, monaco: "typescript" },
  java: { label: "Java 17", judge0: 91, monaco: "java" },
  cpp: { label: "C++ (GCC 14)", judge0: 105, monaco: "cpp" },
  go: { label: "Go 1.23", judge0: 107, monaco: "go" },
} as const;
export type CodeLanguage = keyof typeof CODE_LANGUAGES;

/**
 * DevOps, cloud and data environments. The problem fixes the environment. script: the file runs in the sandbox on each
 * test's stdin (Bash; SQL through sqlite3 after the test's setup statements). checks: nothing runs (no Terraform,
 * Docker or cluster on the free sandbox); the file is parsed and graded by structural checks (lib/ai-interview/checks.ts).
 */
export const ENVS = {
  bash: { label: "Bash", monaco: "shell", grade: "script", file: "solution.sh" },
  sql: { label: "SQL (SQLite)", monaco: "sql", grade: "script", file: "query.sql" },
  yaml: { label: "YAML", monaco: "yaml", grade: "checks", file: "config.yaml" },
  dockerfile: { label: "Dockerfile", monaco: "dockerfile", grade: "checks", file: "Dockerfile" },
  terraform: { label: "Terraform (HCL)", monaco: "hcl", grade: "checks", file: "main.tf" },
  json: { label: "JSON", monaco: "json", grade: "checks", file: "policy.json" },
} as const;
export type Env = keyof typeof ENVS;

export const LANGUAGES: Record<CodeLanguage | Env, { label: string; monaco: string }> = { ...CODE_LANGUAGES, ...ENVS };
export type Language = CodeLanguage | Env;
export const isEnv = (l: string): l is Env => Object.hasOwn(ENVS, l);

/**
 * What a coding round can be about: general code (any of CODE_LANGUAGES) or one environment. The recruiter can pin
 * tracks; otherwise pickTracks() reads them from the job and the resume.
 */
export type Track = "code" | Env;
export const TRACKS: Record<Track, string> = {
  code: "Algorithms in code (Python, JS, Java…)",
  bash: "Bash scripting",
  sql: "SQL queries",
  yaml: "YAML (Kubernetes, CI/CD, Compose)",
  dockerfile: "Dockerfile",
  terraform: "Terraform",
  json: "JSON (IAM policies, configs)",
};
export const isTrack = (t: unknown): t is Track => typeof t === "string" && Object.hasOwn(TRACKS, t);

/** What signals each environment in a job description or resume (word-boundary, case-insensitive). */
const SIGNALS: Record<Env, RegExp> = {
  yaml: /\b(kubernetes|k8s|helm|kustomize|openshift|eks|aks|gke|argo ?cd|github actions|gitlab ci|ci\/cd|docker[- ]compose|ansible|yaml)\b/gi,
  terraform: /\b(terraform|opentofu|hcl|infrastructure as code|iac|pulumi|cloudformation)\b/gi,
  dockerfile: /\b(docker|dockerfile|containers?|containeri[sz]ation|podman)\b/gi,
  bash: /\b(bash|shell scripting|shell scripts?|linux|unix|sre|site reliability|sysadmin|system administration|scripting)\b/gi,
  sql: /\b(sql|postgres(ql)?|mysql|sqlite|oracle db|t-sql|pl\/sql|data analyst|analytics engineer|dbt|bigquery|snowflake|redshift)\b/gi,
  json: /\b(iam|aws|azure|gcp|cloud security|least privilege|policies)\b/gi,
};
/** Roles whose daily work is algorithms in a general-purpose language, as opposed to infrastructure or data work. */
const CODE_ROLE =
  /\b(software (engineer|developer)|backend|back-end|frontend|front-end|full[- ]?stack|developer|programmer|sde|mobile|android|ios|machine learning|ml engineer)\b/i;
const INFRA_ROLE =
  /\b(devops|dev ops|sre|site reliability|platform|infrastructure|cloud|devsecops|kubernetes|systems? (engineer|administrator)|data (analyst|engineer)|analytics|database|dba)\b/i;

/**
 * The coding round's tracks for this job and candidate, most relevant first. The job counts double (it's what the role
 * needs), the resume once (so the task is something they've touched). A developer role always keeps general code; an
 * infrastructure or data role leads with its environments, and never gets only algorithms.
 * ponytail: keyword counts, not a classifier; good enough to choose between seven tracks, revisit if roles get mixed up.
 */
export function pickTracks(job: { title: string; description: string }, resume: string): Track[] {
  const jobText = `${job.title}\n${job.title}\n${job.description}`;
  const count = (text: string, e: Env) => text.match(SIGNALS[e])?.length ?? 0;
  const envs = (Object.keys(SIGNALS) as Env[])
    .map((e) => ({ e, job: count(jobText, e), resume: Math.min(3, count(resume, e)) }))
    // An environment only the resume mentions doesn't make a task for this job
    .filter((x) => x.job > 0)
    .sort((a, b) => 2 * b.job + b.resume - (2 * a.job + a.resume))
    .map((x) => x.e)
    .slice(0, 3);
  const infra = INFRA_ROLE.test(job.title) || (!CODE_ROLE.test(job.title) && INFRA_ROLE.test(job.description));
  if (infra && envs.length) return envs;
  return ["code", ...envs.slice(0, 2)];
}

// ── Execution results ───────────────────────────────────────────────────────────────────────────────────────────────

export type CaseResult = { name: string; passed: boolean; expected?: string; got?: string };
export type RunResult = {
  suite: "visible" | "hidden";
  passed: number;
  total: number;
  cases: CaseResult[];
  status: string; // Accepted, Wrong Answer, Time Limit Exceeded, Compilation Error, Runtime Error, unavailable…
  error: string; // compiler output or stderr, trimmed
  time: number | null; // seconds
  memory: number | null; // KB
};

export const suiteInput = (tests: Test[]) => `${tests.length}\n${tests.map((t) => t.input).join("\n")}\n`;

/** Line-by-line comparison of the program's stdout with each case's expected line (trailing spaces ignored). */
export function gradeOutput(tests: Test[], stdout: string, showValues: boolean): CaseResult[] {
  const lines = stdout.replace(/\r/g, "").split("\n");
  return tests.map((t, i) => {
    const got = (lines[i] ?? "").trimEnd();
    const passed = got === t.output.trimEnd();
    return showValues ? { name: t.name, passed, expected: t.output, got: got.slice(0, 200) } : { name: t.name, passed };
  });
}

/** Script environments: the sandbox driver ends every case's output with this line (lib/ai-interview/sandbox.ts). */
export const CASE_END = "<<<HX_CASE_END>>>";
/** Trailing spaces and trailing blank lines never decide a test. */
export const normOut = (s: string) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n+$/, "");

/** Script environments: each case's whole output (any number of lines) against its expected block. */
export function gradeBlocks(tests: Test[], stdout: string, showValues: boolean): CaseResult[] {
  const blocks = stdout.replace(/\r/g, "").split(`\n${CASE_END}\n`);
  return tests.map((t, i) => {
    const got = normOut(blocks[i] ?? "");
    const passed = i < blocks.length - 1 && got === normOut(t.output);
    return showValues ? { name: t.name, passed, expected: t.output, got: got.slice(0, 400) } : { name: t.name, passed };
  });
}

// ── Editor ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The changed hunk between two versions (common prefix and suffix lines trimmed): enough for "what did they just change". */
export function diffLines(before: string, after: string) {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  if (start === endA && start === endB) return "";
  return [
    `@@ line ${start + 1}`,
    ...a.slice(start, endA).map((l) => `- ${l}`),
    ...b.slice(start, endB).map((l) => `+ ${l}`),
  ]
    .join("\n")
    .slice(0, 4000);
}

// ── Whiteboard ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The few Excalidraw element fields we keep (the client strips the rest). */
export type BoardElement = {
  id: string;
  type: string; // rectangle, ellipse, diamond, arrow, line, text, freedraw…
  text?: string; // text elements; bound labels are folded into their container
  containerId?: string | null;
  start?: string | null; // arrow startBinding.elementId
  end?: string | null;
  p1?: [number, number]; // arrow endpoints (scene coordinates), for arrows not bound to a shape
  p2?: [number, number];
  x: number;
  y: number;
  w: number;
  h: number;
};
export type Scene = {
  elements: { id: string; type: string; label: string }[];
  connections: { from: string; to: string; label: string }[];
};

const SHAPES = new Set(["rectangle", "ellipse", "diamond", "frame", "image", "embeddable"]);
const NEAR = 40; // px: an arrow end this close to a box is attached to it

/**
 * Excalidraw elements → the structured scene the agent reads: labelled components and labelled connections.
 * People rarely bind things properly, so positions fill the gaps: text typed on top of a box labels that box, and
 * an arrow end near a box connects to it.
 */
export function sceneOf(els: BoardElement[]): Scene {
  const shapes = els.filter((e) => SHAPES.has(e.type));
  const inside = (x: number, y: number, pad = 0) =>
    shapes.find((s) => x >= s.x - pad && x <= s.x + s.w + pad && y >= s.y - pad && y <= s.y + s.h + pad);
  const labels = new Map<string, string[]>();
  const add = (id: string, text: string) => text && labels.set(id, [...(labels.get(id) ?? []), text]);
  const loose: BoardElement[] = [];
  for (const e of els) {
    if (e.type !== "text") continue;
    const text = (e.text ?? "").trim().replace(/\s+/g, " ");
    if (e.containerId) add(e.containerId, text);
    else {
      const box = inside(e.x + e.w / 2, e.y + e.h / 2);
      if (box) add(box.id, text);
      else loose.push(e);
    }
  }
  const label = (id: string) => (labels.get(id) ?? []).join(" / ").slice(0, 120);
  const elements = [
    ...els
      .filter((e) => e.type !== "text" && e.type !== "arrow" && e.type !== "line")
      .map((e) => ({ id: e.id, type: e.type, label: label(e.id) })),
    ...loose
      .map((e) => ({ id: e.id, type: "note", label: (e.text ?? "").trim().slice(0, 120) }))
      .filter((e) => e.label),
  ];
  const connections = els
    .filter((e) => e.type === "arrow" || e.type === "line")
    .map((e) => ({
      from: e.start ?? (e.p1 && inside(e.p1[0], e.p1[1], NEAR)?.id) ?? null,
      to: e.end ?? (e.p2 && inside(e.p2[0], e.p2[1], NEAR)?.id) ?? null,
      label: label(e.id),
    }))
    .filter((c): c is { from: string; to: string; label: string } => !!c.from && !!c.to && c.from !== c.to);
  return { elements: elements.slice(0, 200), connections: connections.slice(0, 300) };
}

/**
 * The scene as the agent reads it: components by label and connections as "A → B", so it can talk about what the
 * candidate drew by name instead of by element id. Unlabelled shapes show as "unlabelled <type>".
 */
export function sceneText(s: Scene) {
  const name = (id: string) => {
    const e = s.elements.find((x) => x.id === id);
    return e?.label || (e ? `unlabelled ${e.type}` : "?");
  };
  const comps = s.elements.map((e) => e.label || `unlabelled ${e.type}`);
  const conns = s.connections.map((c) => `${name(c.from)} → ${name(c.to)}${c.label ? ` (${c.label})` : ""}`);
  return `Components: ${comps.join("; ") || "none"}.
Connections: ${conns.join("; ") || "none"}.`;
}

/** What changed between two scenes, in words, or "" when nothing significant (moves and resizes don't count). */
export function sceneChange(before: Scene, after: Scene) {
  const name = (s: Scene, id: string) => s.elements.find((e) => e.id === id)?.label || id;
  const ids = (s: Scene) => new Set(s.elements.map((e) => e.id));
  const conns = (s: Scene) => new Set(s.connections.map((c) => `${c.from}>${c.to}`));
  const [ba, aa, bc, ac] = [ids(before), ids(after), conns(before), conns(after)];
  const added = after.elements.filter((e) => !ba.has(e.id) && e.label);
  const removed = before.elements.filter((e) => !aa.has(e.id) && e.label);
  const linked = after.connections.filter((c) => !bc.has(`${c.from}>${c.to}`));
  const unlinked = before.connections.filter((c) => !ac.has(`${c.from}>${c.to}`));
  return [
    ...added.map((e) => `added ${e.type} "${e.label}"`),
    ...removed.map((e) => `deleted "${e.label}"`),
    ...linked.map(
      (c) => `connected "${name(after, c.from)}" → "${name(after, c.to)}"${c.label ? ` (${c.label})` : ""}`,
    ),
    ...unlinked.map((c) => `removed connection "${name(before, c.from)}" → "${name(before, c.to)}"`),
  ]
    .join("; ")
    .slice(0, 1000);
}

/**
 * Phones and tablets can't take the AI interview: no whole-screen sharing, no reliable full screen or monitor check,
 * and too small for the editor and whiteboard. User-Agent Client Hints first (`Sec-CH-UA-Mobile: ?1`), the UA string
 * as the fallback. iPadOS reports a desktop UA, so the browser check adds a touch test (see onPhone in candidate.tsx).
 */
export const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i;
export const mobileRequest = (ua: string | null, chMobile: string | null) =>
  chMobile === "?1" || MOBILE_UA.test(ua ?? "");
