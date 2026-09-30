import { createClerkClient } from "@clerk/backend";
import { DurableObject } from "cloudflare:workers";
import app from "vinext/server/app-router-entry";
import { hubFor } from "../lib/realtime";

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
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
