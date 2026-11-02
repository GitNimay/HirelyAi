import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/status/route";
import { checkAll, history } from "@/lib/status";
import { COMPONENTS } from "@/lib/status-fields";
import { row } from "./factories";

// The voice probe needs a LiveKit token; the real one lives in the interview module (Clerk, Bedrock, ...)
vi.mock("@/lib/interview", () => ({ livekitToken: vi.fn().mockResolvedValue("test-token") }));

const today = () => new Date().toISOString().slice(0, 10);

/** Answers the external probes (Clerk, Bedrock, LiveKit) with the given status, and records what was called. */
const external = (status: number) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status }));

describe("checkAll", () => {
  it("probes every component and adds the round to today's counters", async () => {
    const fetch = external(200);
    const before = await row<{ total: number }>(
      "SELECT total FROM status_checks WHERE component = 'web' AND day = ?",
      today(),
    );

    const live = await checkAll();

    expect(Object.keys(live.up).sort()).toEqual(COMPONENTS.map((c) => c.id).sort());
    expect(live.up).toMatchObject({ web: true, media: true, auth: true, ai: true, voice: true });
    // No Durable Object in the test Worker: that probe fails, and must count as down, not throw
    expect(live.up.live).toBe(false);
    expect(live.ms.live).toBeNull();
    expect(live.ms.web).toEqual(expect.any(Number));
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal);

    const after = await row<{ total: number; failed: number }>(
      "SELECT total, failed FROM status_checks WHERE component = 'web' AND day = ?",
      today(),
    );
    expect(after!.total).toBe((before?.total ?? 0) + 1);
    expect(after!.failed).toBe(0);
  });

  it("counts an error response or a thrown request as a failure without latency", async () => {
    external(503);
    const live = await checkAll();
    expect(live.up).toMatchObject({ auth: false, ai: false, voice: false });
    expect(live.ms.auth).toBeNull();

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
    expect((await checkAll()).up.auth).toBe(false);
  });
});

describe("history", () => {
  it("returns 90 days for every component, filling days without checks with zeros", async () => {
    external(200);
    await checkAll();

    const h = await history();
    for (const { id } of COMPONENTS) expect(h[id]).toHaveLength(90);
    expect(h.web.at(-1)).toMatchObject({ day: today(), total: expect.any(Number) });
    expect(h.web.at(-1)!.total).toBeGreaterThan(0);
    expect(h.web[0]).toEqual({ day: h.web[0].day, total: 0, failed: 0, ms: 0, ms_count: 0 });
  });
});

describe("GET /api/status", () => {
  it("answers with the public status as JSON", async () => {
    external(200);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toBeTypeOf("object");
  });
});
