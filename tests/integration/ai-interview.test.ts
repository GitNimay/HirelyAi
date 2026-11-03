import { env } from "cloudflare:workers";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import {
  aiReport,
  aiSessionFor,
  checkpoint,
  createAiSession,
  decide,
  deleteRecordings,
  dismissFlag,
  enterAi,
  finishAi,
  markLive,
  readEvents,
  recordingSegments,
  roomContext,
} from "@/lib/ai-interview";
import { advance, defaultConfig, initState, run } from "@/lib/harness";
import { candidateView, insertInterview, interviewResult, parseInterview } from "@/lib/interview";
import { getJob } from "@/lib/jobs";
import { job, row, user } from "./factories";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ sendEach: vi.fn(), sendTo: vi.fn(), broadcast: vi.fn() }));

const DAY = 86_400_000;

/** Swaps the queue for a recorder (proxy bindings can't be spied on). */
function fakeQueue() {
  const sent: unknown[] = [];
  const real = env.TASKS;
  env.TASKS = { send: async (m: unknown) => void sent.push(m) } as unknown as typeof env.TASKS;
  onTestFinished(() => void (env.TASKS = real));
  return sent;
}

/** A job with an AI interview, one applicant who applied with a resume, and their session (as applying creates it). */
async function setup() {
  const sent = fakeQueue();
  const poster = await user();
  const applicant = await user({ name: "Asha Rao" });
  const j = await job(poster);
  const iv = parseInterview({
    screening: "ai",
    aiConfig: JSON.stringify({
      level: "senior",
      phases: [
        { id: "resume", minutes: 8 },
        { id: "coding", minutes: 20 },
      ],
      questions: {
        intro: ["Tell me about yourself"],
        main: ["Why this role?", "", "Tell me about a conflict."],
        wrapup: [],
      },
      coding: { problems: [] },
    }),
    deadline: String(Date.now() + 2 * DAY),
  })!;
  await insertInterview(j, iv).run();
  const resume = {
    name: "Asha Rao",
    experience: [
      {
        title: "SDE II",
        company: "Acme",
        start: "2021-01",
        end: "",
        current: true,
        description: "Cut p99 latency 40% with Redis",
      },
    ],
    skills: ["Go", "Redis"],
  };
  await env.DB.prepare(
    "INSERT INTO applications (job_id, applicant_id, email, profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(j, applicant, `${applicant}@mail.test`, JSON.stringify(resume), Date.now(), Date.now())
    .run();
  await createAiSession(j, applicant);
  const { id: sessionId, slug } = (await row<{ id: string; slug: string }>(
    "SELECT s.id, i.slug FROM interview_sessions s JOIN interviews i ON i.job_id = s.job_id WHERE s.job_id = ?",
    j,
  ))!;
  // The planner normally runs from the queue (Bedrock); give the session a plan directly
  await env.DB.prepare("UPDATE interview_sessions SET plan = ? WHERE id = ?")
    .bind(
      JSON.stringify({
        claims: [
          {
            id: "c1",
            text: "Cut p99 latency 40% with Redis",
            section: "experience",
            tech: ["Redis"],
            metrics: ["40%"],
            depth: "deep",
          },
        ],
        problems: [],
      }),
      sessionId,
    )
    .run();
  return { poster, applicant, j, sessionId, slug, sent };
}

describe("AI interview setup", () => {
  it("stores the role config and recruiter questions, and queues the plan on apply", async () => {
    const { j, sessionId, sent } = await setup();
    const r = await row<{ kind: string; questions: string; config: string }>(
      "SELECT kind, questions, config FROM interviews WHERE job_id = ?",
      j,
    );
    expect(r?.kind).toBe("ai");
    expect(JSON.parse(r!.questions)).toEqual(["Why this role?", "Tell me about a conflict."]);
    expect(JSON.parse(r!.config).phases.map((p: { id: string }) => p.id)).toEqual([
      "intro",
      "resume",
      "technical",
      "coding",
      "wrapup",
    ]);
    expect(JSON.parse(r!.config)).toMatchObject({
      level: "senior",
      bar: "balanced",
      design: { enabled: true },
      questions: { intro: ["Tell me about yourself"] },
    });
    expect(sent).toEqual([{ t: "plan", sessionId }]);
  });

  it("is idempotent: applying twice doesn't make a second session or plan", async () => {
    const { j, applicant, sent } = await setup();
    await createAiSession(j, applicant);
    expect(sent).toHaveLength(1);
    expect((await row<{ n: number }>("SELECT COUNT(*) AS n FROM interview_sessions WHERE job_id = ?", j))?.n).toBe(1);
  });
});

describe("personal links", () => {
  it("lets in only the right token for the right interview, until the deadline", async () => {
    const { sessionId, slug, j } = await setup();
    expect(await enterAi(slug, sessionId)).toBe(sessionId);
    expect(await enterAi(slug, crypto.randomUUID())).toBeNull();
    expect(await enterAi("otherslug123", sessionId)).toBeNull();
    await env.DB.prepare("UPDATE interviews SET deadline = ? WHERE job_id = ?")
      .bind(Date.now() - 1, j)
      .run();
    expect(await enterAi(slug, sessionId)).toBeNull();
  });

  it("shows the token only to that applicant, never to the poster, strangers or the share page", async () => {
    const { poster, applicant, j, sessionId } = await setup();
    expect((await getJob(applicant, j))?.interview).toMatchObject({ kind: "ai", password: sessionId, minutes: 25 }); // 2 + 8 + 5 + 20 + 3 asked for, shrunk to the 25-minute cap
    expect((await getJob(poster, j))?.interview?.password).toBeNull();
    expect((await getJob(await user(), j))?.interview).toMatchObject({ slug: null, password: null });
  });

  it("refuses the shared-password gate and foreign cookies", async () => {
    const { slug, sessionId } = await setup();
    await expect(aiSessionFor(slug, crypto.randomUUID())).rejects.toThrow("expired");
    await expect(aiSessionFor(slug, undefined)).rejects.toThrow("expired");
    expect((await aiSessionFor(slug, sessionId)).id).toBe(sessionId);
    const view = await candidateView(slug, sessionId);
    expect(view?.kind).toBe("ai");
    expect(view?.phases.map((p) => p.id)).toEqual(["intro", "resume", "technical", "coding", "wrapup"]);
  });
});

describe("live session", () => {
  it("loads the room context, checkpoints and finishes into the evaluator queue", async () => {
    const { sessionId, sent } = await setup();
    await env.DB.prepare("UPDATE interview_sessions SET status = 'onboarded', profile = ? WHERE id = ?")
      .bind(
        JSON.stringify({
          name: "Asha Rao",
          phone: "",
          city: "Pune",
          role: "SDE II at Acme",
          years: 4,
          notice: "30d",
          link: "",
        }),
        sessionId,
      )
      .run();
    const room = await roomContext(sessionId);
    expect(room).toMatchObject({
      status: "onboarded",
      candidate: { name: "Asha Rao", years: 4, skills: ["Go", "Redis"] },
      plan: { claims: [{ id: "c1" }] },
      config: { level: "senior" },
    });
    expect(room?.faq.next_steps).toContain("hiring team");

    await markLive(sessionId, 1000);
    await markLive(sessionId, 2000); // a rejoin keeps the first start time
    expect(
      await row<{ status: string; started_at: number }>(
        "SELECT status, started_at FROM interview_sessions WHERE id = ?",
        sessionId,
      ),
    ).toEqual({ status: "live", started_at: 1000 });

    let state = run(initState(defaultConfig(), 1000), 1000);
    await checkpoint(sessionId, state, [{ role: "agent", text: "Hi" }]);
    expect((await roomContext(sessionId))?.state?.index).toBe(0);

    state = advance(state, 5000, ["c1"]);
    expect(
      await finishAi(
        sessionId,
        [
          { role: "agent", text: "Hi" },
          { role: "candidate", text: "Hello" },
        ],
        state,
      ),
    ).toBe(true);
    expect(await finishAi(sessionId, [], state)).toBe(false); // ended once
    expect(sent).toContainEqual({ t: "evaluate", sessionId });
    expect(
      (await row<{ status: string }>("SELECT status FROM interview_sessions WHERE id = ?", sessionId))?.status,
    ).toBe("processing");
  });
});

describe("report, decisions and retention", () => {
  it("reads the event log and recordings, records the decision and flag reviews, deletes recordings", async () => {
    const { poster, applicant, j, sessionId } = await setup();
    await env.MEDIA.put(
      `iv/${sessionId}/events/000000000000002-1.jsonl`,
      `${JSON.stringify({ at: 2, type: "utterance", role: "candidate", text: "b" })}\n`,
    );
    await env.MEDIA.put(
      `iv/${sessionId}/events/000000000000001-0.jsonl`,
      `${JSON.stringify({ at: 1, type: "utterance", role: "agent", text: "a" })}\n${JSON.stringify({ at: 1, type: "tool_call", id: "x", name: "add_note", args: {} })}\n`,
    );
    for (const seq of ["000000", "000001"])
      await env.MEDIA.put(`iv/${sessionId}/rec/cam/1700000000000/${seq}.webm`, new Uint8Array(10));
    expect((await readEvents(sessionId)).map((e) => e.at)).toEqual([1, 1, 2]);
    expect(await recordingSegments(sessionId)).toEqual([{ track: "cam", start: 1700000000000, bytes: 20 }]);

    const data = await aiReport(poster, j, applicant);
    expect(data?.events.map((e) => e.type)).toEqual(["utterance", "utterance"]); // tool chatter isn't replayed
    expect(await aiReport(await user(), j, applicant)).toBeNull(); // only the poster

    await decide(poster, j, applicant, "advance", "Strong system design");
    expect(
      (
        await row<{ status: string }>(
          "SELECT status FROM applications WHERE job_id = ? AND applicant_id = ?",
          j,
          applicant,
        )
      )?.status,
    ).toBe("shortlisted");
    await dismissFlag(poster, j, applicant, "tab_switch", true);
    const after = await aiReport(poster, j, applicant);
    expect(after?.decision).toMatchObject({ value: "advance", note: "Strong system design" });
    expect(after?.dismissed).toEqual(["tab_switch"]);
    await expect(decide(await user(), j, applicant, "reject", "")).rejects.toThrow("Not found");

    await deleteRecordings(sessionId);
    expect(await recordingSegments(sessionId)).toEqual([]);
    expect((await aiReport(poster, j, applicant))?.mediaDeleted).toBe(true);
    expect(await readEvents(sessionId)).toHaveLength(3); // the log stays

    const result = await interviewResult(poster, j, applicant);
    expect(result?.ai?.plan?.claims).toHaveLength(1);
  });
});
