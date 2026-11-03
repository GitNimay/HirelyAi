/**
 * Coding and system-design content plus the pure helpers around it: the problem bank (HackerRank-style stdin/stdout,
 * so one generic starter per language works for every problem), design prompts, editor diffs and whiteboard scenes.
 * Shared by the room (server), the candidate workspace and the report.
 */

import type { Signature } from "./starters";

export type Difficulty = "easy" | "medium" | "hard";
export type Ladder = [hint: string, constraint: string, scale: string]; // follow-up ladder, levels 1-3

/**
 * Tests use a multi-case format: stdin is T, then T cases; stdout is one line per case. A suite runs in ONE sandbox
 * submission and is diffed line by line. ponytail: a crash mid-run fails every later case; per-case submissions if
 * that ever matters more than the free tier's request budget.
 */
export type Test = { name: string; input: string; output: string };
export type Problem = {
  id: string;
  title: string;
  difficulty: Difficulty;
  statement: string;
  input: string; // format of ONE case (after the T line)
  output: string;
  constraints: string;
  /** How one case's input is parsed: drives the generated starter code (lib/starters.ts). */
  signature: Signature;
  visible: Test[];
  hidden: Test[];
  ladder: Ladder;
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
  signature: p.signature,
  visible: p.visible,
});

export const LANGUAGES = {
  python: { label: "Python 3.12", judge0: 100, monaco: "python" },
  javascript: { label: "JavaScript (Node.js 22)", judge0: 102, monaco: "javascript" },
  typescript: { label: "TypeScript 5.6", judge0: 101, monaco: "typescript" },
  java: { label: "Java 17", judge0: 91, monaco: "java" },
  cpp: { label: "C++ (GCC 14)", judge0: 105, monaco: "cpp" },
  go: { label: "Go 1.23", judge0: 107, monaco: "go" },
} as const;
export type Language = keyof typeof LANGUAGES;

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
    ...els.filter((e) => e.type !== "text" && e.type !== "arrow" && e.type !== "line").map((e) => ({ id: e.id, type: e.type, label: label(e.id) })),
    ...loose.map((e) => ({ id: e.id, type: "note", label: (e.text ?? "").trim().slice(0, 120) })).filter((e) => e.label),
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
    ...linked.map((c) => `connected "${name(after, c.from)}" → "${name(after, c.to)}"${c.label ? ` (${c.label})` : ""}`),
    ...unlinked.map((c) => `removed connection "${name(before, c.from)}" → "${name(before, c.to)}"`),
  ]
    .join("; ")
    .slice(0, 1000);
}
