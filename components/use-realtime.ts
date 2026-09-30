"use client";

import { useEffect, useEffectEvent } from "react";
import type { RealtimeEvent } from "@/lib/realtime";

/** One socket to /api/realtime while mounted: exponential reconnect, heartbeat answered by the Durable Object without waking it. */
export function useRealtime(handler: (e: RealtimeEvent) => void) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    let ws: WebSocket | undefined;
    let stopped = false;
    let retry = 0;
    let ping = 0;
    let timer = 0;
    const connect = () => {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime`);
      ws.onopen = () => {
        retry = 0;
        ping = window.setInterval(() => ws?.send("ping"), 25_000);
      };
      ws.onmessage = (m) => {
        if (m.data !== "pong") onEvent(JSON.parse(m.data));
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (!stopped) timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      ws?.close();
    };
  }, []);
}
