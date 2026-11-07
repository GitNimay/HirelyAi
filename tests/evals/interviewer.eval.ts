import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advance,
  defaultConfig,
  initState,
  run,
  steer,
  systemPrompt,
  type HarnessState,
  type PhaseId,
  type Plan,
  type PromptCtx,
} from "@/lib/ai-interview/harness";

/**
 * Interviewer replays (npm run eval, never CI): the production interviewer prompt on a real model, one reply after a
 * scripted conversation, checked for the three things candidates called boring and robotic (issue #130):
 * 1. echoing the candidate's answer back before the next question,
 * 2. staying on the first topic and drilling deeper and deeper,
 * 3. building more questions on a wrong answer instead of setting it straight.
 * The live interviewer is Phonic; this runs the same system prompt the text fallback uses, on BEDROCK_MODEL, so it
 * catches prompt regressions, not Phonic-specific ones. Each reply is graded by a deterministic check and/or a
 * yes/no judge call.
 */
const creds = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.trim().match(/^([A-Z_]+)=(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1], m[2]]),
);

type Msg = { role: "system" | "user" | "assistant"; content: string };
async function chat(messages: Msg[], max_tokens = 1500) {
  const res = await fetch(`${creds.BEDROCK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.BEDROCK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: creds.BEDROCK_MODEL, messages, max_tokens, temperature: 0 }),
  });
  const body = (await res.json()) as { choices: { message: { content: string | null } }[] };
  return (body.choices[0].message.content ?? "").trim();
}

/** A yes/no judge on one interviewer reply, as a third party (judges are less sycophantic outside the conversation). */
async function judge(question: string, context: string, reply: string) {
  const out = await chat([
    {
      role: "system",
      content: `You grade one turn of a job interview. Answer with ONLY a JSON object: {"yes": true|false, "why": "under 15 words"}.`,
    },
    { role: "user", content: `${context}\n\nThe interviewer's reply:\n"${reply}"\n\nQuestion: ${question}` },
  ]);
  return JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { yes: boolean; why: string };
}

const T0 = 1_700_000_000_000;
const config = defaultConfig("mid");
const plan: Plan = {
  claims: [
    {
      id: "c1",
      text: "Cut checkout API p99 latency by 40% with a Redis cache",
      section: "experience",
      tech: ["Redis"],
      metrics: ["40%"],
      depth: "deep",
    },
    {
      id: "c2",
      text: "Led the migration of 3 Python services to Go",
      section: "experience",
      tech: ["Go"],
      metrics: ["3"],
      depth: "light",
    },
  ],
};
const ctx: PromptCtx = {
  job: { title: "Backend Engineer", company: "Acme", level: "Mid-Senior level", description: "Go, Postgres, Redis" },
  candidate: { name: "Asha Rao", role: "Backend engineer", years: 4 },
  plan,
  config,
  summary: "",
};
/** The state in a phase, three minutes in, with the clock running. */
function stateIn(phase: PhaseId): HarnessState {
  let s = run(initState(config, T0), T0);
  while (s.phases[s.index].id !== phase) s = advance(s, T0, ["c1", "c2"]);
  return s;
}
const NOW = T0 + 180_000;
/** One interviewer reply after a scripted conversation, with optional private notes from the harness at the end. */
async function reply(phase: PhaseId, lines: [role: "agent" | "candidate", text: string][], notes: string[] = []) {
  const out = await chat([
    { role: "system", content: systemPrompt(phase, ctx, stateIn(phase), NOW) },
    ...lines.map(([role, content]): Msg => ({ role: role === "agent" ? "assistant" : "user", content })),
    ...notes.map((content): Msg => ({ role: "system", content })),
  ]);
  console.log(phase, "→", out);
  return out;
}
const transcript = (lines: [role: "agent" | "candidate", text: string][]) =>
  lines.map(([r, t]) => `${r === "agent" ? "Interviewer" : "Candidate"}: ${t}`).join("\n");

/** 4-word sequences of the candidate's answer that the reply repeats: an echo repeats many, a question one or two. */
function echoed(answer: string, out: string) {
  const words = (t: string) => t.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
  const grams = (w: string[]) => new Set(w.slice(0, -3).map((_, i) => w.slice(i, i + 4).join(" ")));
  const a = grams(words(answer));
  return [...grams(words(out))].filter((g) => a.has(g)).length;
}

const REDIS: [role: "agent" | "candidate", text: string][] = [
  ["agent", "Tell me about the checkout latency work on your resume. What was the problem?"],
  [
    "candidate",
    "Checkout p99 was around 480 milliseconds. Profiling showed most of it was three Postgres reads per request for price rules, so I added a Redis read-through cache keyed by rule version.",
  ],
  ["agent", "How did you keep prices from going stale?"],
  [
    "candidate",
    "Publishing a rule bumps its version, so old keys are simply never read again, and a five minute TTL cleans them up.",
  ],
  ["agent", "And how did you measure the result?"],
  [
    "candidate",
    "We tracked p99 and cache hit rate in Grafana: p99 went from 480 to 290 milliseconds with about a 94 percent hit rate.",
  ],
];

describe("interviewer replays", () => {
  it("asks the next question without restating the candidate's answer", async () => {
    const lines = REDIS.slice(0, 2);
    const out = await reply("resume", lines);
    expect(echoed(lines[1][1], out)).toBeLessThanOrEqual(2);
    expect(out.split(/\s+/).length).toBeLessThan(45);
    expect((out.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
    const j = await judge(
      "Does the reply restate, paraphrase or summarize what the candidate just said before asking its question?",
      transcript(lines),
      out,
    );
    console.log("echo judge →", j);
    expect(j.yes).toBe(false);
  });

  it("moves to a new topic once the first one has had its opening question and two follow-ups", async () => {
    const out = await reply("resume", REDIS);
    const j = await judge(
      "Does the reply move to a different topic (another project, claim or subject) rather than asking yet another question about the checkout latency or Redis cache work?",
      transcript(REDIS),
      out,
    );
    console.log("topic judge →", j);
    expect(j.yes).toBe(true);
  });

  it("follows the harness's steering note to the resume claim nobody has covered", async () => {
    const s = { ...stateIn("resume"), topic: { label: "checkout latency Redis cache", questions: 3, steered: false } };
    const { notes } = steer(
      { ...s, claims: { c1: { status: "verified", evidence: "", at: T0 } } },
      {},
      {
        phase: "resume",
        plan,
        board: false,
      },
    );
    expect(notes).toHaveLength(1);
    const out = await reply("resume", REDIS, notes);
    expect(out.toLowerCase()).toMatch(/\bgo\b|migrat/);
    expect(out).not.toMatch(/harness/i);
  });

  it("sets a clearly wrong technical answer straight instead of building on it", async () => {
    const lines: [role: "agent" | "candidate", text: string][] = [
      ["agent", "You used a lot of maps in Go. How does a hash map lookup perform on average, and why?"],
      [
        "candidate",
        "On average a hash map lookup is O(n), because it has to scan through the keys until it finds the one you asked for.",
      ],
    ];
    const out = await reply("technical", lines);
    const j = await judge(
      "Does the reply correct the candidate's wrong claim (an average hash map lookup is O(1), not O(n)), or clearly ask them to reconsider it, rather than accepting it and asking a follow-up built on it?",
      transcript(lines),
      out,
    );
    console.log("correction judge →", j);
    expect(j.yes).toBe(true);
    expect(out).not.toMatch(/\b(great|perfect|exactly|excellent)\b/i);
  });
});
