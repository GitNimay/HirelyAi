"use client";

/** The voice screening (LiveKit): mic check before the call and the live call view. The call itself runs in Interview. */

import { useEffect, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { INTERVIEW } from "@/lib/screening/fields";
import { primary } from "../onboarding";
import { input } from "../resume-editor";
import { Select } from "../kit";
import { btnGhost, Icon, icons } from "../ui";

export type AgentState = "connecting" | "initializing" | "listening" | "thinking" | "speaking";
// The orb's tuned animation for each interviewer state
const ORB = {
  connecting: "connecting",
  initializing: "connecting",
  listening: "listening",
  thinking: "solving",
  speaking: "composing",
} as const;
const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Connecting…",
  initializing: "Your interviewer is joining…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
};
// Same processing in the mic check as in the call, so the check hears what the interviewer will
export const CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const mic = icons.mic;
const field = (bad: boolean) => `${input} h-10 ${bad ? "border-danger" : "border-border"}`;

export function MicCheck({
  deviceId,
  onDevice,
  onError,
  children,
}: {
  deviceId: string;
  onDevice: (id: string) => void;
  onError: (e: string) => void;
  children: (heard: boolean) => React.ReactNode;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [waited, setWaited] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let ctx: AudioContext | undefined;
    let raf = 0;
    let wait = 0;
    let stopped = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { ...CAPTURE, ...(deviceId && { deviceId: { exact: deviceId } }) },
        });
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        wait = window.setTimeout(() => setWaited(true), 10_000);
        setBlocked(false);
        onError("");
        setDevices(
          (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId),
        );
        ctx = new AudioContext();
        void ctx.resume(); // some browsers start it suspended, which reads as silence
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          const l = Math.min(1, peak / 48);
          setLevel(l);
          if (l > 0.2) setHeard(true);
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setBlocked(true);
        onError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Microphone access is blocked. Allow it from the icon in your browser's address bar, then try again."
            : "We couldn't find a microphone. Connect one and try again.",
        );
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(wait);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, [deviceId, attempt, onError]);

  return (
    <>
      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-md border border-border ${heard ? "text-success" : "text-muted"}`}
          >
            <Icon d={mic} size={18} />
          </span>
          <div
            className="flex h-6 flex-1 items-end gap-1"
            role="meter"
            aria-label="Microphone level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
          >
            {Array.from({ length: 20 }, (_, i) => (
              <span
                key={i}
                className={`flex-1 rounded-sm transition-colors ${i < level * 20 ? "bg-success" : "bg-border"}`}
                style={{ height: `${30 + (i % 4) * 15}%` }}
              />
            ))}
          </div>
        </div>
        {devices.length > 1 && (
          <Select
            aria-label="Microphone"
            value={deviceId}
            onChange={onDevice}
            className={`${field(false)} bg-surface`}
            options={[
              { value: "", label: "System default" },
              ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
            ]}
          />
        )}
        {heard ? (
          <p className="text-sm text-success">We can hear you.</p>
        ) : (
          waited && (
            <p className="text-sm text-muted">Your mic sounds quiet. Pick another one above, or start anyway.</p>
          )
        )}
        {blocked && (
          <button type="button" className={btnGhost} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        )}
      </div>
      {children(heard || waited)}
    </>
  );
}

export function Live({
  agent,
  caption,
  endsAt,
  muted,
  onUnmute,
  onEnd,
  onTimeUp,
}: {
  agent: AgentState;
  caption: { agent: string; you: string };
  endsAt: number;
  muted: boolean;
  onUnmute: () => void;
  onEnd: () => void;
  onTimeUp: () => void;
}) {
  const [left, setLeft] = useState(INTERVIEW.seconds * 1000);
  useEffect(() => {
    const t = setInterval(() => {
      if (!endsAt) return; // not started yet
      const l = Math.max(0, endsAt - Date.now());
      setLeft(l);
      // The agent ends the call at the limit, finishing its sentence; this is the backstop if it doesn't
      if (Date.now() > endsAt + 12_000) onTimeUp();
    }, 500);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => (clearInterval(t), removeEventListener("beforeunload", warn));
  }, [endsAt, onTimeUp]);

  const secs = Math.ceil(left / 1000);
  return (
    <div className="flex flex-col items-center gap-6 pb-[env(safe-area-inset-bottom)] text-center sm:gap-8">
      <div className="flex w-full items-center justify-between border-b border-border pb-4 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />
          Live
        </span>
        <span className={`tabular-nums ${endsAt && secs <= 30 ? "font-medium text-danger" : ""}`}>
          {endsAt ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} left` : "Starting…"}
        </span>
        {/* Screen readers hear the countdown once at each threshold, not every tick */}
        <span className="sr-only" aria-live="assertive">
          {secs <= 30 && secs > 0 ? "30 seconds left" : secs <= 60 && secs > 0 ? "One minute left" : ""}
        </span>
      </div>

      {/* Tuned at 64px and drawn at up to 2x density, so 1.5x stays sharp. It follows data-theme on its own. */}
      <div className="flex size-32 items-center justify-center" aria-hidden>
        <ThinkingOrb state={ORB[agent]} size={64} className="scale-150" />
      </div>

      <div className="min-h-24 w-full space-y-3" aria-live="polite">
        <p className="text-sm font-medium">{STATE_LABEL[agent]}</p>
        {caption.agent && <p className="break-words text-base leading-relaxed text-balance">{caption.agent}</p>}
        {caption.you && <p className="break-words text-sm text-muted">You: {caption.you}</p>}
      </div>

      {muted && (
        <button type="button" onClick={onUnmute} className={primary}>
          Tap to hear your interviewer
        </button>
      )}

      <button
        type="button"
        onClick={onEnd}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-danger/50 px-4 text-sm font-medium text-danger transition-colors outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:w-auto"
      >
        End interview
      </button>
    </div>
  );
}
