import { auth } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";
import { MAX_RESUME_BYTES, RESUME_TYPE } from "@/lib/job-fields";
import { maxBytes, MEDIA_TYPES } from "@/lib/media";

/**
 * PUT raw file bytes, get back an R2 key to attach to a post (media) or a job application (PDF resume).
 * ponytail: objects uploaded but never attached to a post stay in R2. Add an R2 lifecycle rule or a cron sweep if that adds up.
 */
export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await env.WRITE_LIMIT.limit({ key: userId })).success) return Response.json({ error: "Too many uploads" }, { status: 429 });

  const type = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() ?? "";
  const size = Number(request.headers.get("Content-Length"));
  const ext = type === RESUME_TYPE ? "pdf" : MEDIA_TYPES[type];
  if (!ext) return Response.json({ error: "Only JPEG, PNG, WebP, GIF, MP4, WebM and PDF are supported" }, { status: 415 });
  const max = type === RESUME_TYPE ? MAX_RESUME_BYTES : maxBytes(type);
  if (!size || size > max) return Response.json({ error: `File too large (max ${max / 1024 / 1024} MB)` }, { status: 413 });
  if (!request.body) return Response.json({ error: "Empty body" }, { status: 400 });

  const key = `${userId}/${crypto.randomUUID()}.${ext}`;
  // Stream straight into R2. The runtime rejects bodies longer than the declared Content-Length.
  await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type }, customMetadata: { owner: userId } });
  return Response.json({ key, type });
}
