import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanAiReport, evalInput, EVALUATOR, integrityOf } from "@/lib/ai-interview/evaluator";
import { advance, defaultConfig, initState, run, type IvEvent, type Plan } from "@/lib/ai-interview/harness";

/**
 * Coding-round replays (npm run eval, never CI): hint use and a big editor paste, through the real evaluator model.
 * The clamps and integrity level are deterministic; the "Coding <= 3" expectation after a paste is the model's call.
 */
const creds = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.trim().match(/^([A-Z_]+)=(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1], m[2]]),
);

async function evaluate(user: string) {
  const res = await fetch(`${creds.BEDROCK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.BEDROCK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: creds.BEDROCK_MODEL,
      messages: [
        { role: "system", content: EVALUATOR },
        { role: "user", content: user },
      ],
      max_tokens: 8000,
      temperature: 0,
    }),
  });
  const out = ((await res.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content;
  return JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
}

type NoAt = IvEvent extends infer E ? (E extends unknown ? Omit<E, "at"> : never) : never;
const T0 = 1_700_000_000_000;
const config = {
  ...defaultConfig(),
  phases: [
    { id: "intro" as const, minutes: 2 },
    { id: "coding" as const, minutes: 12 },
    { id: "wrapup" as const, minutes: 2 },
  ],
};
const plan: Plan = { claims: [] };
const SOLUTION = [
  "def solve(nums, target):",
  "    seen = {}",
  "    for i, x in enumerate(nums):",
  "        if target - x in seen:",
  "            return f'{seen[target - x]} {i}'",
  "        seen[x] = i",
].join("\n");

const suite = (suiteName: "visible" | "hidden", passed: number, total: number): IvEvent => ({
  at: 0,
  type: "run",
  by: "candidate",
  language: "python",
  result: {
    suite: suiteName,
    passed,
    total,
    cases: Array.from({ length: total }, (_, i) => ({
      name: i === total - 1 ? "large input" : `t${i}`,
      passed: i < passed,
    })),
    status: passed === total ? "Accepted" : "Wrong Answer",
    error: "",
    time: 0.1,
    memory: 1,
  },
});

/** A coding round as a script: [seconds after the round starts, event]. */
function coding(script: [number, NoAt][], hints: number) {
  const base = T0 + 30_000;
  let state = advance(run(initState(config, T0), T0), base, []);
  state = {
    ...state,
    hints: Array.from({ length: hints }, (_, i) => ({
      level: i + 1,
      phase: "coding" as const,
      at: base + i,
    })) as typeof state.hints,
  };
  const events: IvEvent[] = [
    { at: T0, type: "session", what: "connected" },
    { at: base, type: "assign", what: "problem", id: "pair-sum" },
    ...script.map(([s, e]) => ({ ...e, at: base + s * 1000 }) as IvEvent),
  ];
  return { state, events };
}

const talk = (role: "agent" | "candidate", text: string): NoAt => ({ type: "utterance", role, text });

const FIXTURES = [
  {
    name: "strong solve after two hints: all hidden tests pass, Coding at least 3, nothing flagged",
    ...coding(
      [
        [
          10,
          talk("candidate", "I'll keep a hash map from value to index and look up target minus the current number."),
        ],
        [60, talk("agent", "Hint: what do you need to remember about the numbers you've already seen?")],
        [90, talk("agent", "Hint two: a map from value to its index lets you answer in one pass.")],
        [150, { type: "code", language: "python", code: SOLUTION }],
        [160, suite("visible", 2, 2)],
        [170, suite("hidden", 4, 4)],
        [200, talk("candidate", "It's O(n) time and O(n) space because of the map.")],
      ],
      2,
    ),
    expect: (r: ReturnType<typeof cleanAiReport>) => {
      expect(r.ai.integrity.level).toBe("none");
      expect(r.ai.competencies.find((c) => c.id === "coding")!.score ?? 0).toBeGreaterThanOrEqual(3);
    },
  },
  {
    name: "large editor paste then a perfect run: integrity high, Coding no better than 3",
    ...coding(
      [
        [20, talk("candidate", "Let me just write it.")],
        [40, { type: "paste", chars: 900, lines: 30, into: "editor" } as unknown as NoAt],
        [41, { type: "code", language: "python", code: `${SOLUTION}\n${"# helper\n".repeat(90)}` }],
        [60, suite("hidden", 4, 4)],
        [90, talk("agent", "Can you walk me through the loop?")],
        [100, talk("candidate", "It goes through the numbers and checks the dictionary, I think.")],
      ],
      0,
    ),
    expect: (r: ReturnType<typeof cleanAiReport>) => {
      expect(r.ai.integrity.level).toBe("high");
      expect(r.ai.competencies.find((c) => c.id === "coding")!.score ?? 3).toBeLessThanOrEqual(3);
    },
  },
];

describe("coding replays", () => {
  it.each(FIXTURES)("$name", async (f) => {
    const { text, refs, startedAt } = evalInput({
      job: { title: "Backend Engineer", level: "Mid-Senior level", description: "Go, Postgres, Redis services" },
      config,
      plan,
      state: f.state,
      events: f.events,
      final: null,
    });
    const report = cleanAiReport(await evaluate(text), {
      rubric: config.rubric,
      refs,
      phases: ["intro", "coding", "wrapup"],
      plan,
      state: f.state,
      integrity: integrityOf(f.events),
      startedAt,
    });
    console.log(f.name, "→", report.ai.competencies.map((c) => `${c.id}:${c.score ?? "-"}`).join(" "));
    f.expect(report);
  });
});
