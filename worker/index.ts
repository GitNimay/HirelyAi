import { createClerkClient } from "@clerk/backend";
import { DurableObject } from "cloudflare:workers";
import app from "vinext/server/app-router-entry";
import { GATED, hasPass, passCookie, safeNext, verifyTurnstile } from "../lib/human";
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
};

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
    const { 0: client, 1: server } = new WebSocketPair();
    // Tagged with the user id so private network events can target just that user's sockets
    this.ctx.acceptWebSocket(server, [request.headers.get("X-User-Id")!]);
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

  webSocketMessage() {
    // Server → client only
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
      if (!same(request.headers.get("Authorization") ?? "", `Bearer ${env.INTERVIEW_AGENT_SECRET}`)) return new Response(null, { status: 401 });
      const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown; transcript?: unknown };
      const sessionId = String(body.sessionId);
      if (!(await acceptTranscript(sessionId, cleanTranscript(body.transcript)))) return new Response(null, { status: 409 });
      // Grading takes up to a minute or two: the queue gives it retries and a 15 minute budget (waitUntil only gets 30 s)
      await enqueue({ t: "evaluate", sessionId });
      return new Response(null, { status: 204 });
    }
    // "Verify you are human" (lib/human.ts): the widget posts its token here; a pass cookie lets the visitor into the auth pages
    if (url.pathname === "/api/human" && request.method === "POST") {
      if (request.headers.get("Origin") !== url.origin) return new Response("Forbidden", { status: 403 });
      const body = (await request.json().catch(() => ({}))) as { token?: unknown };
      if (!(await verifyTurnstile(body.token, request.headers.get("CF-Connecting-IP")))) return Response.json({ ok: false }, { status: 403 });
      return Response.json({ ok: true }, { headers: { "Set-Cookie": await passCookie(url), "Cache-Control": "no-store" } });
    }
    if (GATED.test(url.pathname) && !(await hasPass(request, url))) {
      return Response.redirect(`${url.origin}/verify?next=${encodeURIComponent(safeNext(url.pathname + url.search))}`, 302);
    }
    const res = await app.fetch(request, env, ctx);
    if (res.webSocket) return res;
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
    return out;
  },

  async queue(batch) {
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
