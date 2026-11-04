import { createClerkClient } from "@clerk/backend";
import { DurableObject } from "cloudflare:workers";
import app from "vinext/server/app-router-entry";
import { capture } from "../lib/analytics";
import { writePendingReleases } from "../lib/changelog";
import { hasPass, needsCheck, passCookie, safeNext, verifyTurnstile } from "../lib/human";
import { aiSessionFor, enterLegacy, planSession, sweepRecordings } from "../lib/ai-interview/session";
import { acceptTranscript, closeExpired, evaluate, same, sendInvite } from "../lib/screening/interview";
import { cleanTranscript } from "../lib/screening/fields";
import { syncDirectory } from "../lib/network";
import { checkAll } from "../lib/status";
import { deliverNotifications } from "../lib/notifications";
import { hubFor } from "../lib/realtime";
import { enqueue, type Task } from "../lib/tasks";

// Baseline for every app response; a route's own value (e.g. the media route's CSP) wins.
// Microphone, camera, screen capture and full screen stay allowed (same origin) for the interview pages.
const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(self), geolocation=(), payment=(), microphone=(self), display-capture=(self), fullscreen=(self)",
  // Enforced: directives no feature needs, so they can't break anything
  "Content-Security-Policy": "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  // Full policy in report-only first: violations show in the browser console. Promote to the enforced header once a week
  // of normal use (sign-in with each provider, Turnstile, uploads, the voice interview) shows none.
  "Content-Security-Policy-Report-Only": [
    "default-src 'self'",
    // jsdelivr: the AI interview's code editor (Monaco) loads from it
    "script-src 'self' 'unsafe-inline' https://clerk.n1m35h.in https://challenges.cloudflare.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https://img.clerk.com https://clerk.n1m35h.in",
    "font-src 'self' data: https://cdn.jsdelivr.net https://esm.sh https://unpkg.com",
    // jsdelivr + storage.googleapis.com: the AI interview's editor and in-browser face detector (MediaPipe model)
    "connect-src 'self' https://clerk.n1m35h.in https://challenges.cloudflare.com https://*.livekit.cloud wss://*.livekit.cloud https://cdn.jsdelivr.net https://storage.googleapis.com",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "media-src 'self' blob:",
    "form-action 'self'",
  ].join("; "),
};

// The landing page for a first visit (no cookies at all, so signed out, default theme) is the same HTML for everyone.
// Cached per data center for 5 minutes, keyed by deployment so cached HTML never points at a previous build's chunks.
const LANDING_TTL = 300;
const landingKey = (url: URL, env: Env) => `${url.origin}/?__landing=${env.CF_VERSION_METADATA.id}`;

/** Retries only transient failures; `attempts` starts at 1. The last tries of a grading store "failed" instead of throwing. */
async function runTask(task: Task, attempts: number) {
  switch (task.t) {
    case "evaluate":
      return evaluate(task.sessionId, attempts >= 4);
    case "plan":
      return planSession(task.sessionId, attempts >= 4);
    case "invite":
      return sendInvite(task.jobId, task.to, task.applicantId);
    case "notify":
      return deliverNotifications(task.to, task.spec);
  }
}

/** Holds feed WebSockets (hibernatable, so idle sockets cost nothing) and fans out FeedEvents. */
export { InterviewRoom } from "./ai-interview-room";

const ivCookie = (request: Request) => /(?:^|;\s*)iv=([^;]+)/.exec(request.headers.get("Cookie") ?? "")?.[1];
const REC_MAX = 5 * 1024 * 1024; // one recording chunk (10 s at the 250-300 kbps the room records is ~0.4 MB)
const REC_SEQ_MAX = 720; // chunks per segment: two hours of 10 s chunks
const REC_WINDOW_MS = 24 * 3600_000; // segment ids are the browser clock: within a day of ours (skewed clocks still pass)

/**
 * AI interview routes, all under /interview/<slug>/ so the candidate's `iv` cookie (path-scoped) comes along:
 * enter  — old personal links (invites before per-candidate sign-in): sets the cookie for those sessions, then the page
 * room   — the interview WebSocket, handed to the session's InterviewRoom Durable Object
 * rec    — recording chunks (camera and screen) into R2
 * warm   — pre-opens the voice connection during the overview, so the interviewer joins right after Start
 */
async function interviewRoute(request: Request, env: Env, url: URL, slug: string, action: string) {
  if (action === "enter" && request.method === "GET") {
    const id = await enterLegacy(slug, url.searchParams.get("t") ?? "");
    const headers = new Headers({
      Location: `/interview/${slug}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    if (id)
      headers.append(
        "Set-Cookie",
        `iv=${id}; Path=/interview/${slug}; Max-Age=${30 * 86_400}; HttpOnly; Secure; SameSite=Lax`,
      );
    return new Response(null, { status: 302, headers });
  }
  // Same-origin only: browsers don't apply CORS to WebSockets, and uploads carry the session cookie
  if (request.headers.get("Origin") !== url.origin) return new Response("Forbidden", { status: 403 });
  const s = await aiSessionFor(slug, ivCookie(request)).catch(() => null);
  if (!s) return new Response("Unauthorized", { status: 401 });
  if (action === "room") {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const forward = new Request(request);
    forward.headers.set("X-Session-Id", s.id);
    return env.INTERVIEW_ROOM.getByName(s.id).fetch(forward);
  }
  if (action === "warm" && request.method === "POST") {
    // Best effort: the room pre-opens the voice connection while the candidate reads the overview
    if (s.status === "onboarded" || s.status === "live")
      await env.INTERVIEW_ROOM.getByName(s.id)
        .warm()
        .catch(() => {});
    return new Response(null, { status: 204 });
  }
  if (action === "rec" && request.method === "POST") {
    if (s.status !== "live" && s.status !== "processing") return new Response(null, { status: 409 });
    const track = url.searchParams.get("track");
    const segment = url.searchParams.get("segment") ?? "";
    const seq = Number(url.searchParams.get("seq"));
    if (
      (track !== "cam" && track !== "screen") ||
      !/^\d{10,15}$/.test(segment) ||
      Math.abs(Date.now() - Number(segment)) > REC_WINDOW_MS ||
      !Number.isInteger(seq) ||
      seq < 0 ||
      seq > REC_SEQ_MAX
    )
      return new Response("Bad chunk", { status: 400 });
    // Two tracks at one chunk per 10 s is ~12 a minute; the shared write limit (60/min per session) bounds what a
    // forged client can push into R2
    if (!(await env.WRITE_LIMIT.limit({ key: `rec:${s.id}` })).success)
      return new Response("Slow down", { status: 429 });
    if (Number(request.headers.get("Content-Length") ?? 0) > REC_MAX) return new Response("Too large", { status: 413 });
    const body = await request.arrayBuffer(); // R2 needs a known length
    if (!body.byteLength || body.byteLength > REC_MAX) return new Response("Bad chunk", { status: 400 });
    await env.MEDIA.put(`iv/${s.id}/rec/${track}/${segment}/${String(seq).padStart(6, "0")}.webm`, body, {
      httpMetadata: {
        contentType: request.headers.get("Content-Type")?.startsWith("video/")
          ? request.headers.get("Content-Type")!
          : "video/webm",
      },
    });
    return new Response(null, { status: 204 });
  }
  return new Response("Not found", { status: 404 });
}

export class FeedHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Heartbeats are answered by the runtime without waking the object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request) {
    const userId = request.headers.get("X-User-Id")!;
    // Every tab holds one socket; more than this is a loop or abuse, and each socket multiplies broadcast cost
    if (this.ctx.getWebSockets(userId).length >= 10) return new Response("Too many connections", { status: 429 });
    const { 0: client, 1: server } = new WebSocketPair();
    // Tagged with the user id so private network events can target just that user's sockets
    this.ctx.acceptWebSocket(server, [userId]);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** To everyone on this shard, or only to `userId`'s sockets. */
  broadcast(msg: string, userId?: string) {
    for (const ws of this.ctx.getWebSockets(userId)) {
      try {
        ws.send(msg);
      } catch {
        // socket already closing
      }
    }
  }

  /** Each message to its own user's sockets: lib/realtime.ts sendEach batches a fan-out into one call per shard. */
  deliver(items: [userId: string, msg: string][]) {
    for (const [userId, msg] of items) this.broadcast(msg, userId);
  }

  webSocketMessage(ws: WebSocket) {
    // Server → client only ("ping" is answered by the auto-response without waking us): anything else is a misbehaving client
    ws.close(1008, "server to client only");
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Uptime monitors and the post-deploy smoke test (.github/workflows/ci.yml): Worker up, D1 reachable, which version
    if (url.pathname === "/api/health") {
      const db = await env.DB.prepare("SELECT 1")
        .first()
        .then(
          () => true,
          () => false,
        );
      return Response.json(
        { ok: db, version: env.CF_VERSION_METADATA.id },
        { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (url.pathname === "/api/realtime") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      // Browsers don't apply CORS to WebSockets, so block cross-site hijacking by origin
      if (request.headers.get("Origin") !== url.origin) return new Response("Forbidden", { status: 403 });
      const clerk = createClerkClient({
        secretKey: env.CLERK_SECRET_KEY,
        publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      });
      const state = await clerk.authenticateRequest(request, { authorizedParties: [url.origin] });
      if (!state.isAuthenticated) return new Response("Unauthorized", { status: 401 });
      const { userId } = state.toAuth();
      const forward = new Request(request);
      forward.headers.set("X-User-Id", userId);
      return env.FEED_HUB.getByName(hubFor(userId)).fetch(forward);
    }
    const iv = /^\/interview\/([a-z0-9]{6,20})\/(enter|room|rec|warm)$/.exec(url.pathname);
    if (iv) return interviewRoute(request, env, url, iv[1], iv[2]);
    // The interview agent (LiveKit Cloud) posts the transcript here when a call ends; grading runs after we answer
    if (url.pathname === "/api/interview/complete" && request.method === "POST") {
      if (
        !env.INTERVIEW_AGENT_SECRET ||
        !same(request.headers.get("Authorization") ?? "", `Bearer ${env.INTERVIEW_AGENT_SECRET}`)
      )
        return new Response(null, { status: 401 });
      const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown; transcript?: unknown };
      const sessionId = String(body.sessionId);
      if (!(await acceptTranscript(sessionId, cleanTranscript(body.transcript))))
        return new Response(null, { status: 409 });
      capture(sessionId, "interview completed", { kind: "voice", $process_person_profile: false });
      // Grading takes up to a minute or two: the queue gives it retries and a 15 minute budget (waitUntil only gets 30 s)
      await enqueue({ t: "evaluate", sessionId });
      return new Response(null, { status: 204 });
    }
    // "Verify you are human" (lib/human.ts): the widget posts its token here; a pass cookie lets the visitor into the gated pages
    if (url.pathname === "/api/human" && request.method === "POST") {
      if (request.headers.get("Origin") !== url.origin) return new Response("Forbidden", { status: 403 });
      const body = (await request.json().catch(() => ({}))) as { token?: unknown };
      if (!(await verifyTurnstile(body.token, request.headers.get("CF-Connecting-IP"))))
        return Response.json({ ok: false }, { status: 403 });
      return Response.json(
        { ok: true },
        { headers: { "Set-Cookie": await passCookie(url), "Cache-Control": "no-store" } },
      );
    }
    // PostHog through our own origin (components/analytics.tsx): ad blockers drop *.posthog.com, and the CSP stays 'self'
    if (url.pathname.startsWith("/relay/")) {
      const path = url.pathname.slice("/relay".length);
      const host = /^\/(static|array)\//.test(path) ? "us-assets.i.posthog.com" : "us.i.posthog.com";
      const headers = new Headers(request.headers);
      headers.delete("Cookie"); // our Clerk session cookies never leave this origin
      headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") ?? ""); // GeoIP for the visitor, not for us
      return fetch(`https://${host}${path}${url.search}`, { method: request.method, headers, body: request.body });
    }
    if (needsCheck(url.pathname, request.headers.get("User-Agent")) && !(await hasPass(request, url))) {
      return Response.redirect(
        `${url.origin}/verify?next=${encodeURIComponent(safeNext(url.pathname + url.search))}`,
        302,
      );
    }
    const landing =
      request.method === "GET" &&
      url.pathname === "/" &&
      !url.search &&
      !request.headers.has("Cookie") &&
      !request.headers.has("RSC");
    if (landing) {
      const hit = await (await caches.open("landing")).match(landingKey(url, env));
      if (hit) return hit;
    }
    const res = await app.fetch(request, env, ctx);
    if (res.webSocket) return res;
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
    if (landing && out.status === 200 && !out.headers.has("Set-Cookie")) {
      // Browsers still revalidate (max-age=0); only the edge keeps it
      out.headers.set("Cache-Control", `public, max-age=0, s-maxage=${LANDING_TTL}`);
      const copy = out.clone(); // before returning: once the body streams it can no longer be cloned
      ctx.waitUntil(caches.open("landing").then((c) => c.put(landingKey(url, env), copy)));
    }
    return out;
  },

  async queue(batch) {
    // Messages that failed every retry. Logged as errors (alert on "task dead-lettered" in Workers Logs), ids only, no
    // emails or content; acked so the DLQ doesn't silently drop them after 4 days with nobody having seen them.
    if (batch.queue.endsWith("-dlq")) {
      for (const msg of batch.messages) {
        const t = msg.body;
        const ref =
          t.t === "evaluate" || t.t === "plan"
            ? { sessionId: t.sessionId }
            : t.t === "invite"
              ? { jobId: t.jobId }
              : { type: t.spec.type, ref: t.spec.ref, recipients: t.to.length };
        console.error(JSON.stringify({ msg: "task dead-lettered", task: t.t, ...ref }));
        msg.ack();
      }
      return;
    }
    await Promise.all(
      batch.messages.map(async (msg) => {
        try {
          await runTask(msg.body, msg.attempts);
          msg.ack();
        } catch (e) {
          console.error(
            JSON.stringify({ msg: "task failed", task: msg.body.t, attempts: msg.attempts, error: String(e) }),
          );
          msg.retry({ delaySeconds: Math.min(30 * 2 ** (msg.attempts - 1), 900) });
        }
      }),
    );
  },

  // Every 15 minutes: close expired interviews, fail stuck gradings, copy new Clerk members into D1, record /status checks
  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(syncDirectory());
    ctx.waitUntil(checkAll()); // the status page's history
    ctx.waitUntil(writePendingReleases()); // /changelog entries for new deploys
    ctx.waitUntil(sweepRecordings()); // AI interview recordings past the retention window
    await closeExpired();
  },
} satisfies ExportedHandler<Env, Task>;
