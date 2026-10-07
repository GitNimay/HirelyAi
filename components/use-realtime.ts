"use client";

import { useEffect, useEffectEvent } from "react";
import type { RealtimeEvent } from "@/lib/realtime";

type Handler = (e: RealtimeEvent) => void;
const handlers = new Set<Handler>();
let close: (() => void) | undefined;

/** The one socket per tab, shared by everyone who subscribes: exponential reconnect, heartbeat answered by the Durable Object without waking it. */
function open() {
  let ws: WebSocket | undefined;
  let stopped = false;
  let retry = 0;
  let ping = 0;
  let timer = 0;
  let heard = 0;
  const connect = () => {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime`);
    ws.onopen = () => {
      retry = 0;
      heard = Date.now();
      ping = window.setInterval(() => {
        // After sleep or a network switch a socket can be dead without ever firing close: no pong in 60 s, reconnect
        if (Date.now() - heard > 60_000) ws?.close();
        else ws?.send("ping");
      }, 25_000);
    };
    ws.onmessage = (m) => {
      heard = Date.now();
      if (m.data === "pong") return;
      const event = JSON.parse(m.data);
      handlers.forEach((h) => {
        try {
          h(event);
        } catch (e) {
          console.error(e); // one broken subscriber must not starve the rest
        }
      });
    };
    ws.onclose = () => {
      clearInterval(ping);
      // Jitter: after a deploy or outage, every tab shouldn't reconnect in the same instant
      if (!stopped) timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++) * (0.5 + Math.random() / 2));
    };
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(ping);
    ws?.close();
  };
}

/** Subscribe to pushed events while mounted. The socket opens with the first subscriber and closes after the last. */
export function useRealtime(handler: Handler) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    const h: Handler = (e) => onEvent(e);
    handlers.add(h);
    if (handlers.size === 1) close = open();
    return () => {
      handlers.delete(h);
      if (!handlers.size) {
        close?.();
        close = undefined;
      }
    };
  }, []);
}
