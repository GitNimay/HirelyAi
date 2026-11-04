import { auth } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";
import { recordingChunks, recordingSession } from "@/lib/ai-interview/session";

/**
 * One recording segment of an AI interview (camera or screen), for the job's poster (or a signed-in share link holder). The browser uploaded it as
 * 10 s WebM chunks; they're served as one continuous file with Range support, so the report's player can seek.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string; applicantId: string; track: string; segment: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { jobId, applicantId, track, segment } = await params;
  if ((track !== "cam" && track !== "screen") || !/^\d{10,15}$/.test(segment))
    return new Response("Not found", { status: 404 });
  // The poster, or a signed-in member holding the report's share link (?k=)
  const s = await recordingSession(userId, jobId, applicantId, new URL(request.url).searchParams.get("k"));
  if (!s) return new Response("Not found", { status: 404 });
  const chunks = await recordingChunks(s, track, segment);
  if (!chunks.length) return new Response("Not found", { status: 404 });
  const size = chunks.reduce((n, c) => n + c.size, 0);

  // One range (the only kind video players ask for); none = the whole file
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range") ?? "");
  let start = 0;
  let end = size - 1;
  if (m) {
    if (m[1]) ((start = Number(m[1])), (end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1));
    else start = Math.max(0, size - Number(m[2]));
    if (start > end || start >= size)
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  (async () => {
    let at = 0;
    for (const c of chunks) {
      const from = Math.max(start, at);
      const to = Math.min(end, at + c.size - 1);
      if (from <= to) {
        const obj = await env.MEDIA.get(c.key, { range: { offset: from - at, length: to - from + 1 } });
        if (obj) await obj.body.pipeTo(writable, { preventClose: true });
      }
      at += c.size;
      if (at > end) break;
    }
    await writable.close();
  })().catch((e) => writable.abort(e));
  return new Response(readable, {
    status: m ? 206 : 200,
    headers: {
      "Content-Type": "video/webm",
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      ...(m && { "Content-Range": `bytes ${start}-${end}/${size}` }),
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
