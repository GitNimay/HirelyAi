/**
 * Grading for config environments (YAML, JSON, Dockerfile, Terraform), where nothing can run on the free sandbox:
 * the candidate's file is parsed and checked against structural assertions the problem carries (written by the
 * problem generator and proven against its reference file and its starter before the interview). Pure, so it runs
 * in the room and in tests.
 */
import { parseAllDocuments } from "yaml";
import type { CaseResult, Env, RunResult, Test } from "./workspace";

/**
 * One assertion. With `path` (YAML / JSON only) it applies to the values found there; without one, to the raw text.
 * Paths: dot keys and brackets, e.g. `spec.template.spec.containers[*].resources.limits.memory`,
 * `[kind=Service].spec.ports[0].port`, `Statement[*].Action`. `[*]` = every element, `[n]` = index,
 * `[key=value]` = elements whose key (may be dotted) equals value. A YAML file is a list of documents: a path that
 * doesn't start with `[` reads the first document.
 * Ops on values: exists (every match is present), absent (nothing there), eq / neq (every match, compared as text),
 * includes (some match equals value), match (some match fits a regex: "a step runs docker push"), no_match (none
 * does), gte / lte (every match, numbers),
 * count_gte / count_lte (how many values are present, value = the number). On raw text (value = a regex,
 * multiline and case-insensitive): match / no_match, and count_gte / count_lte with `n` (how many matches).
 */
export type Check = {
  path?: string;
  op: Op;
  value?: string | number | boolean;
  n?: number;
};
export const OPS = [
  "exists",
  "absent",
  "eq",
  "neq",
  "includes",
  "match",
  "no_match",
  "gte",
  "lte",
  "count_gte",
  "count_lte",
] as const;
export type Op = (typeof OPS)[number];
const TEXT_OPS: Op[] = ["match", "no_match", "count_gte", "count_lte"];
const MAX_TEXT = 30_000; // ponytail: model-written regexes on candidate text; size cap instead of a regex sandbox

/** A model-written check → one we can run, or null. */
export function cleanCheck(v: unknown, env: Env): Check | null {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const op = OPS.find((o) => o === r.op);
  if (!op) return null;
  const path = typeof r.path === "string" && r.path.trim() ? r.path.trim().slice(0, 200) : undefined;
  if (path && env !== "yaml" && env !== "json") return null; // only parsed formats have paths
  if (!path && !TEXT_OPS.includes(op)) return null;
  const value = ["string", "number", "boolean"].includes(typeof r.value)
    ? (r.value as string | number | boolean)
    : undefined;
  if (op !== "exists" && op !== "absent" && value === undefined) return null;
  if ((op === "match" || op === "no_match" || !path) && !regex(String(value))) return null;
  if (path && (op === "gte" || op === "lte" || op.startsWith("count")) && !Number.isFinite(Number(value))) return null;
  const n = Number(r.n);
  if (!path && op.startsWith("count") && !Number.isInteger(n)) return null;
  return {
    ...(path && { path }),
    op,
    ...(value !== undefined && { value }),
    ...(!path && op.startsWith("count") && { n }),
  };
}

function regex(src: string) {
  if (src.length > 200) return null;
  try {
    return new RegExp(src, "gim");
  } catch {
    return null;
  }
}

const MISSING = Symbol("missing");
type Val = unknown;

/** Every value at `path` (MISSING where a branch ends early, so "every container has X" can fail). */
export function resolve(root: Val, path: string): Val[] {
  const tokens = path.match(/\[[^\]]*\]|[^.[\]]+/g) ?? [];
  let cur: Val[] = [root];
  for (const t of tokens) {
    const next: Val[] = [];
    for (const v of cur) {
      if (v === MISSING) {
        next.push(MISSING);
        continue;
      }
      if (t.startsWith("[")) {
        const inner = t.slice(1, -1).trim();
        if (!Array.isArray(v)) {
          next.push(MISSING);
          continue;
        }
        if (inner === "*") next.push(...(v.length ? v : [MISSING]));
        else if (/^-?\d+$/.test(inner)) next.push(v.at(Number(inner)) ?? MISSING);
        else {
          const eq = inner.indexOf("=");
          const [key, want] = [
            inner.slice(0, eq).trim(),
            inner
              .slice(eq + 1)
              .trim()
              .replace(/^["']|["']$/g, ""),
          ];
          const hits = v.filter((x) => {
            const got = resolve(x, key)[0];
            return got !== MISSING && String(got) === want;
          });
          next.push(...(hits.length ? hits : [MISSING]));
        }
      } else if (v && typeof v === "object" && !Array.isArray(v) && Object.hasOwn(v, t))
        next.push((v as Record<string, Val>)[t]);
      else next.push(MISSING);
    }
    cur = next;
  }
  return cur;
}

const present = (v: Val) => v !== MISSING && v !== null && v !== undefined;
const text = (v: Val) => (typeof v === "object" ? JSON.stringify(v) : String(v));

/** Runs one check against the parsed document(s) (null for text formats) and the raw text. */
export function runCheck(c: Check, doc: Val, raw: string): boolean {
  if (!c.path) {
    const re = regex(String(c.value))!;
    const n = raw.slice(0, MAX_TEXT).match(re)?.length ?? 0;
    if (c.op === "match") return n > 0;
    if (c.op === "no_match") return n === 0;
    return c.op === "count_gte" ? n >= (c.n ?? 1) : n <= (c.n ?? 0);
  }
  const path = c.path.startsWith("[") ? c.path : `[0].${c.path}`;
  const vals = resolve(doc, path);
  const got = vals.filter(present);
  const all = (f: (v: Val) => boolean) => vals.length > 0 && vals.every((v) => present(v) && f(v));
  switch (c.op) {
    case "exists":
      return all(() => true);
    case "absent":
      return got.length === 0;
    case "eq":
      return all((v) => text(v) === String(c.value));
    case "neq":
      return got.every((v) => text(v) !== String(c.value));
    case "includes":
      return got.some((v) => text(v) === String(c.value));
    case "match":
    case "no_match": {
      const re = regex(String(c.value));
      if (!re) return false;
      const hit = (v: Val) => ((re.lastIndex = 0), re.test(text(v)));
      return c.op === "match" ? got.some(hit) : !got.some(hit);
    }
    case "gte":
      return all((v) => Number(v) >= Number(c.value));
    case "lte":
      return all((v) => Number(v) <= Number(c.value));
    case "count_gte":
      return got.length >= Number(c.value);
    case "count_lte":
      return got.length <= Number(c.value);
  }
}

/** What a check actually saw, for the generator's repair round: the values at its path, or how often its regex hit. */
export function seen(c: Check, doc: Val, raw: string) {
  if (!c.path) return `the regex matched ${raw.slice(0, MAX_TEXT).match(regex(String(c.value))!)?.length ?? 0} time(s)`;
  const vals = resolve(doc, c.path.startsWith("[") ? c.path : `[0].${c.path}`);
  return `found ${vals.length ? vals.map((v) => (present(v) ? JSON.stringify(v).slice(0, 80) : "nothing")).join(", ") : "nothing"} at that path`;
}

/** The file as a list of documents (YAML: every `---` document; JSON: one), or the reason it doesn't parse. */
export function parseConfig(env: Env, raw: string): { doc: Val } | { error: string } {
  if (env === "json")
    try {
      return { doc: [JSON.parse(raw)] };
    } catch (e) {
      return { error: `Invalid JSON: ${String((e as Error).message).slice(0, 200)}` };
    }
  if (env !== "yaml") return { doc: null };
  const docs = parseAllDocuments(raw.slice(0, 100_000));
  const list = Array.isArray(docs) ? docs : [docs];
  const err = list.flatMap((d) => d.errors)[0];
  if (err) return { error: `Invalid YAML: ${err.message.split("\n")[0].slice(0, 200)}` };
  try {
    return { doc: list.map((d) => d.toJS({ maxAliasCount: 100 })).filter((d) => d !== null && d !== undefined) };
  } catch (e) {
    return { error: `Invalid YAML: ${String((e as Error).message).slice(0, 200)}` };
  }
}

/** Grades a config file against a suite of checks, in the same shape as a sandbox run. */
export function gradeChecks(env: Env, raw: string, tests: Test[], suite: "visible" | "hidden"): RunResult {
  const parsed = parseConfig(env, raw);
  const cases: CaseResult[] = tests.map((t) => ({
    name: t.name,
    passed: "doc" in parsed && !!t.check && runCheck(t.check, parsed.doc, raw),
  }));
  const passed = cases.filter((c) => c.passed).length;
  return {
    suite,
    passed,
    total: tests.length,
    cases,
    status: "error" in parsed ? "Invalid file" : passed === tests.length ? "Accepted" : "Wrong Answer",
    error: "error" in parsed ? parsed.error : "",
    time: null,
    memory: null,
  };
}
