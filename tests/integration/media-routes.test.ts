import { env } from "cloudflare:workers";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { GET as getJobExport } from "@/app/api/jobs/[id]/export/route";
import { GET as getMedia } from "@/app/api/media/[...key]/route";
import { GET as getResumePdf } from "@/app/api/resume/route";
import { PUT as upload } from "@/app/api/uploads/route";
import { newKey } from "@/lib/media";
import { job, uid, user } from "./factories";
import { putMedia, rateLimit, signIn } from "./helpers";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

const ORIGIN = "https://test.hire-excellence.local";

/** Calls the media route the way the router does: the path after /api/media/ split into segments. */
const media = (key: string, headers: HeadersInit = {}) =>
  getMedia(new Request(`${ORIGIN}/api/media/${key}`, { headers }), {
    params: Promise.resolve({ key: key.split("/") }),
  });

const put = (body: Uint8Array, type: string, query = "", length = body.byteLength) =>
  upload(
    new Request(`${ORIGIN}/api/uploads${query}`, {
      method: "PUT",
      body,
      headers: { "Content-Type": type, "Content-Length": String(length) },
      duplex: "half",
    } as RequestInit),
  );

/**
 * In workerd a request body carries its Content-Length, which R2 needs to stream it. Node's bodies don't, so for
 * upload tests the bytes are buffered before they reach the real local R2. Restored after the test.
 */
function bufferUploads() {
  const real = env.MEDIA;
  env.MEDIA = new Proxy(real, {
    get: (target, prop) =>
      prop === "put"
        ? async (key: string, body: ReadableStream, opts: R2PutOptions) =>
            target.put(key, await new Response(body).arrayBuffer(), opts)
        : Reflect.get(target, prop),
  });
  onTestFinished(() => {
    env.MEDIA = real;
  });
}

describe("PUT /api/uploads", () => {
  it("refuses signed-out and rate-limited members", async () => {
    signIn(null);
    expect((await put(new Uint8Array(4), "image/png")).status).toBe(401);

    signIn(uid("user"));
    rateLimit("WRITE_LIMIT", false);
    expect((await put(new Uint8Array(4), "image/png")).status).toBe(429);
  });

  it.each([
    ["an unsupported type", "text/html", "", 415],
    ["a GIF as a profile picture", "image/gif", "?for=profile", 415],
    ["a missing size", "image/png", "", 413],
  ])("rejects %s", async (_, type, query, status) => {
    signIn(uid("user"));
    rateLimit("WRITE_LIMIT");
    const body = new Uint8Array(status === 413 ? 0 : 4);
    expect((await put(body, type, query)).status).toBe(status);
  });

  it("rejects a file over the size limit before reading it", async () => {
    signIn(uid("user"));
    rateLimit("WRITE_LIMIT");
    const res = await put(new Uint8Array(4), "application/pdf", "", 6 * 1024 * 1024);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "File too large (max 5 MB)" });
  });

  it.each([
    ["post media", "image/png", "", "posts"],
    ["a resume", "application/pdf", "", "resumes"],
    ["a profile picture", "image/webp", "?for=profile", "profiles"],
    ["a company logo", "image/jpeg", "?for=company", "companies"],
  ])("stores %s in its own folder, owned by the uploader", async (_, type, query, folder) => {
    const me = uid("user");
    signIn(me);
    rateLimit("WRITE_LIMIT");
    bufferUploads();
    const res = await put(new TextEncoder().encode("hello"), `${type}; charset=binary`, query);

    expect(res.status).toBe(200);
    const { key } = (await res.json()) as { key: string };
    expect(key.startsWith(`${folder}/${me}/`)).toBe(true);
    const stored = await env.MEDIA.get(key);
    expect(stored?.customMetadata).toEqual({ owner: me });
    expect(stored?.httpMetadata?.contentType).toBe(type);
    expect(await stored?.text()).toBe("hello");
  });
});

describe("GET /api/media", () => {
  it("is for signed-in members only", async () => {
    signIn(null);
    expect((await media("posts/u/a.png")).status).toBe(401);
  });

  it("serves post media with locked-down headers", async () => {
    const owner = uid("user");
    const key = newKey("posts", owner, "png");
    await putMedia(key, owner, "png-bytes");
    signIn(uid("user"));

    const res = await media(key);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("png-bytes");
    expect(Object.fromEntries(res.headers)).toMatchObject({
      "content-type": "image/png",
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "accept-ranges": "bytes",
    });
  });

  it("answers 404 for a missing object and a malformed escape", async () => {
    signIn(uid("user"));
    expect((await media("posts/u/missing.png")).status).toBe(404);
    expect((await media("posts/u/%E0%A4%A.png")).status).toBe(404);
  });

  it("supports range requests so videos can seek", async () => {
    const owner = uid("user");
    const key = newKey("posts", owner, "mp4");
    await putMedia(key, owner, "0123456789", "video/mp4");
    signIn(owner);

    const res = await media(key, { Range: "bytes=2-5" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await res.text()).toBe("2345");
  });

  it("answers 304 when the browser's copy is current", async () => {
    const owner = uid("user");
    const key = newKey("posts", owner, "png");
    await putMedia(key, owner);
    signIn(owner);
    const etag = (await media(key)).headers.get("etag")!;
    expect((await media(key, { "If-None-Match": etag })).status).toBe(304);
  });

  describe("resumes", () => {
    async function appliedWithResume() {
      const [applicant, poster] = [await user(), await user()];
      const key = newKey("resumes", applicant, "pdf");
      await putMedia(key, applicant, "%PDF-1.7", "application/pdf");
      const j = await job(poster);
      await env.DB.prepare(
        "INSERT INTO applications (job_id, applicant_id, email, resume_key, created_at, updated_at) VALUES (?, ?, 'a@b.test', ?, 0, 0)",
      )
        .bind(j, applicant, key)
        .run();
      return { applicant, poster, key };
    }

    it("lets the applicant and the poster of a job they applied to download it, as an attachment", async () => {
      const { applicant, poster, key } = await appliedWithResume();
      for (const who of [applicant, poster]) {
        signIn(who);
        const res = await media(key);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-disposition")).toBe('attachment; filename="resume.pdf"');
        expect(res.headers.get("cache-control")).toBe("private, no-cache");
      }
    });

    it("hides it from everyone else, as if it didn't exist", async () => {
      const { key } = await appliedWithResume();
      signIn(await user());
      expect((await media(key)).status).toBe(404);
    });

    it("treats any PDF as private, even outside resumes/", async () => {
      const owner = uid("user");
      const key = `${owner}/legacy.pdf`;
      await putMedia(key, owner, "%PDF", "application/pdf");
      signIn(uid("user"));
      expect((await media(key)).status).toBe(404);
    });
  });
});

describe("GET /api/resume", () => {
  it("needs a signed-in member with a resume", async () => {
    signIn(null);
    expect((await getResumePdf()).status).toBe(401);
    signIn(await user());
    expect((await getResumePdf()).status).toBe(404);
  });
});

describe("GET /api/jobs/:id/export", () => {
  const exportJob = (id: string, format: string) =>
    getJobExport(new Request(`${ORIGIN}/api/jobs/${id}/export?format=${format}`), {
      params: Promise.resolve({ id }),
    });

  it("is for signed-in members, in a known format", async () => {
    signIn(null);
    expect((await exportJob("j", "csv")).status).toBe(401);
    signIn(await user());
    expect((await exportJob("j", "xlsx")).status).toBe(400);
    expect((await exportJob("j", "toString")).status).toBe(400);
  });

  it("hides another poster's applicants", async () => {
    const j = await job(await user());
    signIn(await user());
    expect((await exportJob(j, "csv")).status).toBe(404);
  });
});
