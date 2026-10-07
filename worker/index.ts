import { createClerkClient } from "@clerk/backend";
import { DurableObject } from "cloudflare:workers";
import app from "vinext/server/app-router-entry";
import { capture } from "../lib/analytics";
import { hasPass, needsCheck, passCookie, safeNext, verifyTurnstile } from "../lib/human";
import { acceptTranscript, closeExpired, evaluate, same, sendInvite } from "../lib/interview";
import { cleanTranscript } from "../lib/interview-fields";
import { syncDirectory } from "../lib/network";
import { deliverNotifications } from "../lib/notifications";
import { hubFor } from "../lib/realtime";
import { enqueue, type Task } from "../lib/tasks";

// Baseline for every app response; a route's own value (e.g. the media route's CSP) wins.
// Microphone stays allowed for the voice interview page.
const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), payment=(), microphone=(self)",
  // Enforced: directives no feature needs, so they can't break anything
  "Content-Security-Policy": "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  // Full policy in report-only first: violations show in the browser console. Promote to the enforced header once a week
  // of normal use (sign-in with each provider, Turnstile, uploads, the voice interview) shows none.
  "Content-Security-Policy-Report-Only": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://clerk.n1m35h.in https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://img.clerk.com https://clerk.n1m35h.in",
    "font-src 'self'",
    "connect-src 'self' https://clerk.n1m35h.in https://challenges.cloudflare.com https://*.livekit.cloud wss://*.livekit.cloud",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
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
    case "evaluate": return evaluate(task.sessionId, attempts >= 4);
    case "invite": return sendInvite(task.jobId, task.to);
    case "notify": return deliverNotifications(task.to, task.spec);
  }
}

/** Holds feed WebSockets (hibernatable, so idle sockets cost nothing) and fans out FeedEvents. */
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
      const db = await env.DB.prepare("SELECT 1").first().then(() => true, () => false);
      return Response.json({ ok: db, version: env.CF_VERSION_METADATA.id }, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/api/realtime") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      // Browsers don't apply CORS to WebSockets, so block cross-site hijacking by origin
      if (request.headers.get("Origin") !== url.origin) return new Response("Forbidden", { status: 403 });
      const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY });
      const state = await clerk.authenticateRequest(request, { authorizedParties: [url.origin] });
      if (!state.isAuthenticated) return new Response("Unauthorized", { status: 401 });
      const { userId } = state.toAuth();
      const forward = new Request(request);
      forward.headers.set("X-User-Id", userId);
      return env.FEED_HUB.getByName(hubFor(userId)).fetch(forward);
    }
    // The interview agent (LiveKit Cloud) posts the transcript here when a call ends; grading runs after we answer
    if (url.pathname === "/api/interview/complete" && request.method === "POST") {
      if (!env.INTERVIEW_AGENT_SECRET || !same(request.headers.get("Authorization") ?? "", `Bearer ${env.INTERVIEW_AGENT_SECRET}`)) return new Response(null, { status: 401 });
      const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown; transcript?: unknown };
      const sessionId = String(body.sessionId);
      if (!(await acceptTranscript(sessionId, cleanTranscript(body.transcript)))) return new Response(null, { status: 409 });
      capture(sessionId, "interview completed", { kind: "voice", $process_person_profile: false });
      // Grading takes up to a minute or two: the queue gives it retries and a 15 minute budget (waitUntil only gets 30 s)
      await enqueue({ t: "evaluate", sessionId });
      return new Response(null, { status: 204 });
    }
    // "Verify you are human" (lib/human.ts): the widget posts its token here; a pass cookie lets the visitor into the gated pages
    if (url.pathname === "/api/human" && request.method === "POST") {
      if (request.headers.get("Origin") !== url.origin) return new Response("Forbidden", { status: 403 });
      const body = (await request.json().catch(() => ({}))) as { token?: unknown };
      if (!(await verifyTurnstile(body.token, request.headers.get("CF-Connecting-IP")))) return Response.json({ ok: false }, { status: 403 });
      return Response.json({ ok: true }, { headers: { "Set-Cookie": await passCookie(url), "Cache-Control": "no-store" } });
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
      return Response.redirect(`${url.origin}/verify?next=${encodeURIComponent(safeNext(url.pathname + url.search))}`, 302);
    }
    const landing = request.method === "GET" && url.pathname === "/" && !url.search && !request.headers.has("Cookie") && !request.headers.has("RSC");
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
        const ref = t.t === "evaluate" ? { sessionId: t.sessionId } : t.t === "invite" ? { jobId: t.jobId } : { type: t.spec.type, ref: t.spec.ref, recipients: t.to.length };
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
          console.error(JSON.stringify({ msg: "task failed", task: msg.body.t, attempts: msg.attempts, error: String(e) }));
          msg.retry({ delaySeconds: Math.min(30 * 2 ** (msg.attempts - 1), 900) });
        }
      }),
    );
  },

  // Every 15 minutes: close expired interviews, fail stuck gradings, copy new Clerk members into D1
  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(syncDirectory());
    await closeExpired();
  },
} satisfies ExportedHandler<Env, Task>;
