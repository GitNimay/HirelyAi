"use client";

import { useEffect, useEffectEvent } from "react";
import type { RealtimeEvent } from "@/lib/realtime";

/**
 * Server pushes, plus "resync": the socket reconnected, so anything pushed while it was down is gone and subscribers
 * should refetch. That's the only time they need to; a live socket already delivered everything.
 */
export type ClientEvent = RealtimeEvent | { t: "resync" };
type Handler = (e: ClientEvent) => void;
const handlers = new Set<Handler>();
let close: (() => void) | undefined;

const emit = (event: ClientEvent) =>
  handlers.forEach((h) => {
    try {
      h(event);
    } catch (e) {
      console.error(e); // one broken subscriber must not starve the rest
    }
  });

/** The one socket per tab, shared by everyone who subscribes: exponential reconnect, heartbeat answered by the Durable Object without waking it. */
function open() {
  let ws: WebSocket | undefined;
  let stopped = false;
  let opened = false;
  let retry = 0;
  let ping = 0;
  let timer = 0;
  let heard = 0;
  const connect = () => {
    clearTimeout(timer);
    clearInterval(ping);
    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime`);
    ws = socket;
    // Handlers ignore a socket that was already replaced (probe() reconnects without waiting for the old one to close)
    socket.onopen = () => {
      if (socket !== ws) return;
      retry = 0;
      heard = Date.now();
      // Not on the first open: the server-rendered page is already fresh
      if (opened) emit({ t: "resync" });
      opened = true;
      ping = window.setInterval(() => {
        // After sleep or a network switch a socket can be dead without ever firing close: no pong in 60 s, reconnect
        if (Date.now() - heard > 60_000) socket.close();
        else socket.send("ping");
      }, 25_000);
    };
    socket.onmessage = (m) => {
      if (socket !== ws) return;
      heard = Date.now();
      if (m.data !== "pong") emit(JSON.parse(m.data));
    };
    socket.onclose = () => {
      if (socket !== ws) return;
      clearInterval(ping);
      // Jitter: after a deploy or outage, every tab shouldn't reconnect in the same instant
      if (!stopped) timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++) * (0.5 + Math.random() / 2));
    };
  };
  // Back on screen or back online: background tabs throttle timers, so a dead socket may not have been noticed yet.
  // Reconnect now if it's down; if it's quiet, ping and reconnect unless something comes back within 5 s.
  const probe = () => {
    if (document.visibilityState !== "visible" || stopped) return;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return connect();
    if (ws.readyState !== WebSocket.OPEN || Date.now() - heard < 30_000) return;
    const sent = Date.now();
    const socket = ws;
    socket.send("ping");
    window.setTimeout(() => heard < sent && socket === ws && socket.close(), 5_000);
  };
  document.addEventListener("visibilitychange", probe);
  window.addEventListener("online", probe);
  connect();
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", probe);
    window.removeEventListener("online", probe);
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
