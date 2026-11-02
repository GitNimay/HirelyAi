import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bedrockJson } from "@/lib/bedrock";
import { publishedReleases, writePendingReleases } from "@/lib/changelog";
import { row, uid } from "./factories";

vi.mock("@/lib/bedrock", () => ({ bedrockJson: vi.fn() }));

// The releases table is shared by the whole file, and writePendingReleases works on every pending row,
// so each test starts from an empty table.
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM releases").run();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const pending = async (source: string | null, over: { at?: string; attempts?: number; aiDay?: string } = {}) => {
  const version = uid("1.0").replace("_", ".");
  await env.DB.prepare("INSERT INTO releases (version, released_at, source, attempts, ai_day) VALUES (?, ?, ?, ?, ?)")
    .bind(version, over.at ?? new Date().toISOString(), source, over.attempts ?? 0, over.aiDay ?? null)
    .run();
  return version;
};

const release = (version: string) =>
  row<{ state: string; title: string | null; changes: string | null; attempts: number }>(
    "SELECT state, title, changes, attempts FROM releases WHERE version = ?",
    version,
  );

const today = () => new Date().toISOString().slice(0, 10);

describe("writePendingReleases", () => {
  it("publishes the author's release-note block as written, without calling the AI", async () => {
    const v = await pending("Title: Reactions (#59)\n\n```release-note\nNew: React to posts.\n```");
    await writePendingReleases();

    expect(await release(v)).toMatchObject({ state: "published", title: "Reactions (#59)", attempts: 0 });
    expect(JSON.parse((await release(v))!.changes!)).toEqual([["new", "React to posts."]]);
    expect(bedrockJson).not.toHaveBeenCalled();
  });

  it("skips a release whose note says NONE", async () => {
    const v = await pending("Title: Bump deps\n\n```release-note\nnone\n```");
    await writePendingReleases();
    expect((await release(v))?.state).toBe("skipped");
  });

  it("asks the AI when there is no note, and publishes its cleaned answer", async () => {
    vi.mocked(bedrockJson).mockResolvedValue({
      ok: true,
      value: { title: "Faster feed", changes: [{ type: "improved", text: "The feed loads faster." }] },
    });
    const v = await pending("Title: Cache feed ranking\n\nUses the Cache API.");

    await writePendingReleases();

    expect(bedrockJson).toHaveBeenCalledWith(
      "changelog",
      expect.any(String),
      expect.stringContaining("Cache feed"),
      1500,
    );
    expect(await release(v)).toMatchObject({ state: "published", title: "Faster feed", attempts: 1 });
  });

  it("sends at most 3000 characters of PR text", async () => {
    vi.mocked(bedrockJson).mockResolvedValue({ ok: true, value: { skip: true } });
    await pending("x".repeat(10_000));
    await writePendingReleases();
    expect(vi.mocked(bedrockJson).mock.calls[0][2]).toHaveLength(3000);
  });

  it("makes one AI call per run, oldest release first", async () => {
    vi.mocked(bedrockJson).mockResolvedValue({ ok: true, value: { skip: true } });
    const older = await pending("no note", { at: "2026-01-01T00:00:00Z" });
    const newer = await pending("no note", { at: "2026-01-02T00:00:00Z" });

    await writePendingReleases();

    expect(bedrockJson).toHaveBeenCalledTimes(1);
    expect((await release(older))?.state).toBe("skipped");
    expect((await release(newer))?.state).toBe("pending");
  });

  it("stops for the day once five AI tries were used", async () => {
    await pending(null, { attempts: 2, aiDay: today() });
    await pending(null, { attempts: 2, aiDay: today() });
    await env.DB.prepare("UPDATE releases SET state = 'failed'").run();
    await pending(null, { attempts: 1, aiDay: today() });
    const waiting = await pending("no note");

    await writePendingReleases();

    expect(bedrockJson).not.toHaveBeenCalled();
    expect((await release(waiting))?.state).toBe("pending");
  });

  it("retries a failed AI answer once, then marks the release failed for good", async () => {
    vi.mocked(bedrockJson).mockResolvedValue({ ok: false, reason: "busy" });
    const v = await pending("no note");

    await writePendingReleases();
    expect(await release(v)).toMatchObject({ state: "pending", attempts: 1 });

    await writePendingReleases();
    expect(await release(v)).toMatchObject({ state: "failed", attempts: 2 });

    await writePendingReleases();
    expect(bedrockJson).toHaveBeenCalledTimes(2);
  });
});

describe("publishedReleases", () => {
  it("lists only published releases, newest first", async () => {
    await pending("Title: A\n\n```release-note\nNew: First.\n```", { at: "2026-01-01T00:00:00Z" });
    await pending("Title: B\n\n```release-note\nFixed: Second.\n```", { at: "2026-02-01T00:00:00Z" });
    await pending("Title: C\n\n```release-note\nnone\n```");
    await writePendingReleases();

    expect((await publishedReleases()).map((r) => [r.title, r.changes])).toEqual([
      ["B", [["fixed", "Second."]]],
      ["A", [["new", "First."]]],
    ]);
  });
});
