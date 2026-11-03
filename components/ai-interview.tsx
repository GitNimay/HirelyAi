"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { memo, useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { ThinkingOrb } from "thinking-orbs";
import type { CandidateView } from "@/lib/interview";
import { PHASES, phaseLabel, type PhaseId } from "@/lib/harness";
import { JOB_TYPES, LEVELS, WORKPLACES } from "@/lib/job-fields";
import type { PublicProblem, RunResult, Language } from "@/lib/workspace";
import { Details, MicCheck } from "./interview";
import { ask } from "./kit";
import { Alert, Head, primary, StepFrame, ThemeToggle } from "./onboarding";
import { Logo } from "./auth";
import { btnGhost, Icon, icons } from "./ui";

// Heavy and only needed in their rounds: loaded when the round starts
// memo: captions and agent state update the room many times a second; the workspaces' props rarely change
const CodeWorkspace = dynamic(() => import("./ai-workspace").then((m) => memo(m.CodeWorkspace)), { ssr: false, loading: () => <Loading what="editor" /> });
const Whiteboard = dynamic(() => import("./ai-workspace").then((m) => memo(m.Whiteboard)), { ssr: false, loading: () => <Loading what="whiteboard" /> });

type Step = "nolink" | "details" | "check" | "consent" | "brief" | "room" | "done" | "closed";
const STEPS = ["Your details", "System check", "Consent", "Overview", "Interview"];
const INDEX: Record<Step, number> = { nolink: 0, details: 0, check: 1, consent: 2, brief: 3, room: 4, done: 5, closed: 0 };
type AgentState = "connecting" | "listening" | "thinking" | "speaking";
const ORB = { connecting: "connecting", listening: "listening", thinking: "solving", speaking: "composing" } as const;
const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Connecting to your interviewer…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
};
const CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const chevron = "m9 18 6-6-6-6";
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

function stepOf(v: CandidateView): Step {
  const s = v.session?.status;
  if (!v.session) return "nolink";
  if (s === "processing" || s === "done" || s === "failed") return "done";
  if (s === "live") return "check"; // dropped mid-interview: re-check devices (screen share needs a click), then rejoin
  if (!v.open) return "closed";
  return s === "onboarded" ? "check" : "details";
}

/**
 * Media the system check acquired and the room keeps using (a screen share can only start from a click). One
 * interview per page, so a module-level holder: it outlives step changes without living in React state.
 */
type Media = { mic: string; camera: MediaStream | null; screen: MediaStream | null };
const media: Media = { mic: "", camera: null, screen: null };

/**
 * The candidate's side of the AI interview: details → system check (browser, mic, camera, screen, monitors, network)
 * → consent and recording notice → overview → the interview room. Reached from the personal link in the invite email.
 */
export function AiInterview({ view }: { view: CandidateView }) {
  const router = useRouter();
  const [local, setLocal] = useState<Step | null>(null);
  const step = local ?? stepOf(view);
  const go = (s: Step) => (setLocal(s), window.scrollTo({ top: 0 }));
  const rejoin = view.session?.status === "live";
  const [attempt, setAttempt] = useState(0);

  // Open the voice connection while they read the overview (or re-check devices to rejoin), so the interviewer joins
  // right after Start. Re-warmed every 40 s: an unused connection expires on the server after 45 s.
  useEffect(() => {
    if (step !== "brief" && !(step === "check" && rejoin)) return;
    const warm = () => void fetch(`/interview/${view.slug}/warm`, { method: "POST" }).catch(() => {});
    warm();
    const t = setInterval(warm, 40_000);
    return () => clearInterval(t);
  }, [step, rejoin, view.slug]);

  if (step === "room")
    return (
      <Room
        key={attempt}
        onRetry={() => setAttempt((n) => n + 1)}
        view={view}
        onDone={() => (posthog.capture("interview finished", { kind: "ai" }), go("done"), router.refresh())}
        onDropped={() => go("check")}
      />
    );

  const minutes = view.phases.reduce((s, p) => s + p.minutes, 0);
  const card: Record<Exclude<Step, "room">, React.ReactNode> = {
    nolink: (
      <div className="space-y-3 py-6 text-center">
        <h2 className="font-display text-xl font-normal">Open your personal link</h2>
        <p className="text-sm text-muted">
          This interview starts from the link in your invitation email. Applied already? Find the email from Hire
          Excellence, or open the job page while signed in.
        </p>
      </div>
    ),
    details: <Details initial={view.session?.prefill ?? {}} slug={view.slug} onDone={() => go("check")} />,
    check: <SystemCheck rejoin={rejoin} onDone={() => go(rejoin ? "room" : "consent")} />,
    consent: <Consent company={view.company} onDone={() => go("brief")} onBack={() => go("check")} />,
    brief: (
      <div className="space-y-6 text-sm leading-relaxed">
        <Head title="Before you start" sub={`${view.title} at ${view.company}`} />
        <section className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">The role</h3>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted">
            <li>
              <strong className="font-medium">{view.title}</strong> at <strong className="font-medium">{view.company}</strong>
            </li>
            <li>
              {LEVELS[view.job.level]} · {JOB_TYPES[view.job.type]} · {WORKPLACES[view.job.workplace]}
              {view.job.location && ` · ${view.job.location}`}
            </li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">The interview · {minutes} min</h3>
          <ol className="divide-y divide-border rounded-lg border border-border">
            {view.phases.map((p, i) => (
              <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
                <span className="mt-0.5 w-4 shrink-0 text-xs text-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{phaseLabel(p.id)}</span>
                  <span className="block text-xs text-muted">{(PHASES as Record<string, { goal: string }>)[p.id]?.goal}</span>
                </span>
                <span className="shrink-0 text-xs text-muted tabular-nums">{p.minutes} min</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Rules</h3>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted">
            <li>Talk out loud, like a real interview. You can interrupt the interviewer at any time.</li>
            <li>
              Stay in <strong className="font-medium">full screen</strong> with your screen shared and your face visible.
              Leaving full screen, a second monitor or stepping away pauses the interview until it&apos;s fixed.
            </li>
            <li>Tab switches and pasted text are noted for the hiring team. Work on your own.</li>
            <li>
              <strong className="font-medium">One attempt.</strong> If your connection drops, rejoin within 5 minutes
              from the same link; the clock pauses meanwhile.
            </li>
          </ul>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <button type="button" className={btnGhost} onClick={() => go("consent")}>
            Back
          </button>
          <button
            type="button"
            className={primary}
            onClick={() => {
              void document.documentElement.requestFullscreen?.().catch(() => {});
              go("room");
            }}
          >
            Start interview
          </button>
        </div>
      </div>
    ),
    done: (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
          <Icon d={icons.check} size={24} />
        </span>
        <h2 className="mt-5 font-display text-xl font-normal">Interview submitted</h2>
        <p className="mt-1 text-sm text-muted">Thanks. {view.company}&apos;s hiring team will review it and be in touch. You can close this tab.</p>
      </div>
    ),
    closed: (
      <div className="py-8 text-center">
        <h2 className="font-display text-xl font-normal">This interview has closed</h2>
      </div>
    ),
  };

  return (
    <StepFrame
      title="AI interview"
      steps={STEPS}
      current={INDEX[step]}
      stepKey={step}
      action={
        <span className="flex min-w-0 items-center gap-3">
          <span className="truncate text-sm text-muted">{view.company}</span>
          <ThemeToggle />
        </span>
      }
    >
      {card[step]}
    </StepFrame>
  );
}

// ── System check ────────────────────────────────────────────────────────────────────────────────────────────────────

type CheckState = "pending" | "ok" | "fail";
function Row({ state, title, sub, children }: { state: CheckState; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${state === "ok" ? "bg-success/15 text-success" : state === "fail" ? "bg-danger/15 text-danger" : "border border-border text-muted"}`}
        aria-label={state === "ok" ? "Passed" : state === "fail" ? "Failed" : "Not checked yet"}
      >
        {state === "ok" ? <Icon d={icons.check} size={12} /> : state === "fail" ? <Icon d={icons.close} size={12} /> : null}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-medium">{title}</span>
        <span className="block text-muted">{sub}</span>
        {children}
      </span>
    </li>
  );
}

/** Everything the interview needs, checked up front, with a fix for each failure. */
function SystemCheck({ rejoin, onDone }: { rejoin: boolean; onDone: () => void }) {
  // Known only in the browser: "pending" on the server so hydration matches
  const browser = useSyncExternalStore<CheckState>(noop, () => (supported() ? "ok" : "fail"), () => "pending");
  const [mic, setMic] = useState(media.mic);
  const [micErr, setMicErr] = useState("");
  const [cam, setCam] = useState<CheckState>(media.camera?.active ? "ok" : "pending");
  const [screen, setScreen] = useState<CheckState>(media.screen?.active ? "ok" : "pending");
  const [screenErr, setScreenErr] = useState("");
  const [monitors, setMonitors] = useState<CheckState>("pending");
  const [net, setNet] = useState<{ state: CheckState; ms: number }>({ state: "pending", ms: 0 });
  const video = useRef<HTMLVideoElement>(null);
  const onMicError = useCallback((e: string) => setMicErr(e), []);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const s = media.camera?.active ? media.camera : await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, frameRate: 15 } });
        if (stop && s !== media.camera) return s.getTracks().forEach((t) => t.stop());
        media.camera = s;
        if (video.current) video.current.srcObject = s;
        setCam("ok");
      } catch {
        setCam("fail");
      }
    })();
    // Network: three round trips to our own health check
    (async () => {
      const times: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        const ok = await fetch("/api/health", { cache: "no-store" }).then((r) => r.ok, () => false);
        if (!ok) return setNet({ state: "fail", ms: 0 });
        times.push(performance.now() - t0);
      }
      const ms = Math.round(times.sort((a, b) => a - b)[1]);
      setNet({ state: ms < 800 ? "ok" : "fail", ms });
    })();
    const mon = () => setMonitors((window.screen as Screen & { isExtended?: boolean }).isExtended ? "fail" : "ok");
    mon();
    const t = setInterval(mon, 2000);
    return () => ((stop = true), clearInterval(t));
  }, []);

  async function share() {
    setScreenErr("");
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor", frameRate: 5 }, audio: false });
      const surface = s.getVideoTracks()[0]?.getSettings().displaySurface;
      if (surface && surface !== "monitor") {
        s.getTracks().forEach((t) => t.stop());
        setScreen("fail");
        return setScreenErr("Share your entire screen, not a window or tab.");
      }
      media.screen?.getTracks().forEach((t) => t.stop());
      media.screen = s;
      s.getVideoTracks()[0].addEventListener("ended", () => setScreen("fail"));
      setScreen("ok");
    } catch {
      setScreen("fail");
      setScreenErr("Screen sharing was blocked. Click Share screen and pick your entire screen.");
    }
  }

  return (
    <div className="space-y-6">
      <Head title="System check" sub="Make sure everything works before the interview starts." />
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <ul className="divide-y divide-border">
          <Row state={browser} title="Browser" sub={browser === "fail" ? "Use the latest Chrome or Edge on a laptop or desktop." : "Supported browser."} />
          <Row state={cam} title="Camera" sub={cam === "fail" ? "Allow camera access from the icon in the address bar, then reload." : "Your face should be clearly visible."} />
          <Row
            state={screen}
            title="Screen sharing"
            sub={screenErr || (screen === "ok" ? "Sharing your entire screen." : "Share your entire screen for the whole interview.")}
          >
            {screen !== "ok" && (
              <button type="button" className={`${btnGhost} mt-2 border border-border`} onClick={share}>
                Share screen
              </button>
            )}
          </Row>
          <Row state={monitors} title="One monitor" sub={monitors === "fail" ? "Disconnect extra monitors (or set displays to mirror)." : "No extra displays detected."} />
          <Row
            state={net.state}
            title="Network"
            sub={net.state === "pending" ? "Checking…" : net.state === "ok" ? `Good connection (${net.ms} ms).` : "Your connection is slow or offline. Move closer to your router or switch networks."}
          />
        </ul>
        <video ref={video} autoPlay muted playsInline className="aspect-video w-full -scale-x-100 rounded-lg border border-border bg-surface object-cover sm:aspect-[3/4]" aria-label="Camera preview" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Microphone</p>
        <MicCheck deviceId={mic} onDevice={(d) => ((media.mic = d), setMic(d))} onError={onMicError}>
          {(heard) => {
            const ready = heard && [browser, cam, screen, monitors, net.state].every((s) => s === "ok");
            return (
              <>
                {micErr && <Alert>{micErr}</Alert>}
                <p className="text-xs text-muted">Headphones help: the interviewer won&apos;t hear itself through your speakers.</p>
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                  {!ready && <span className="text-xs text-muted">Fix the items above to continue</span>}
                  <button type="button" className={primary} disabled={!ready} onClick={onDone}>
                    {rejoin ? "Rejoin interview" : "Continue"}
                    <Icon d={chevron} size={16} />
                  </button>
                </div>
              </>
            );
          }}
        </MicCheck>
      </div>
    </div>
  );
}

const noop = () => () => {};

function supported() {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  return (
    !mobile &&
    /Chrome\/|Edg\//.test(ua) &&
    "AudioWorkletNode" in window &&
    "MediaRecorder" in window &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    !!document.documentElement.requestFullscreen
  );
}

function Consent({ company, onDone, onBack }: { company: string; onDone: () => void; onBack: () => void }) {
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  return (
    <div className="space-y-6 text-sm leading-relaxed">
      <Head title="Consent and notice" sub="Please read this before you start." />
      <ul className="space-y-3">
        {[
          ["AI interviewer", `The interview is run by an AI interviewer on behalf of ${company}. It asks questions and follow-ups; it doesn't decide whether you're hired.`],
          ["Recording", "Your camera, microphone, screen, code and whiteboard are recorded for the whole session, with a live transcript."],
          ["How it's used", `An AI evaluator summarizes the interview against the role's rubric for ${company}'s hiring team, who review the recording and make the decision.`],
          ["Integrity", "Leaving full screen, switching tabs, pasting text, extra monitors and your face leaving the camera are logged."],
          ["Your data", `It's shared only with ${company}'s hiring team and kept according to their retention policy.`],
        ].map(([t, d]) => (
          <li key={t} className="rounded-lg border border-border px-3 py-2.5">
            <span className="block font-medium">{t}</span>
            <span className="text-muted">{d}</span>
          </li>
        ))}
      </ul>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-foreground" />
        <span>I agree to be interviewed by an AI interviewer and to the recording described above.</span>
      </label>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={b} onChange={(e) => setB(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-foreground" />
        <span>I&apos;ll take the interview myself, without help from other people or tools.</span>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <button type="button" className={btnGhost} onClick={onBack}>
          Back
        </button>
        <button type="button" className={primary} disabled={!a || !b} onClick={onDone}>
          I agree
          <Icon d={chevron} size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Audio ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Mic → 20 ms PCM16 frames (capture), and a queue that plays the interviewer's PCM16 (play). Runs at 16 kHz. */
const WORKLET = `
class Cap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(320); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      const v = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === 320) { this.port.postMessage(this.buf.buffer.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("cap", Cap);
class Play extends AudioWorkletProcessor {
  constructor() {
    super(); this.q = []; this.cur = null; this.i = 0;
    this.port.onmessage = (e) => { if (e.data === "flush") { this.q = []; this.cur = null; } else this.q.push(new Int16Array(e.data)); };
  }
  process(_, outputs) {
    const out = outputs[0][0];
    for (let k = 0; k < out.length; k++) {
      if (!this.cur || this.i >= this.cur.length) { this.cur = this.q.shift() || null; this.i = 0; }
      out[k] = this.cur ? this.cur[this.i++] / 0x8000 : 0;
    }
    return true;
  }
}
registerProcessor("play", Play);
`;

// ── Recording ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Records one track in 10 s chunks and uploads each to R2 in order (retrying), so a crash loses at most 10 s.
 * Each recorder start is a new segment (after a rejoin), so the replay can line segments up by start time.
 */
function record(slug: string, track: "cam" | "screen", stream: MediaStream, bits: number) {
  const segment = String(Date.now());
  const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t))!;
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bits, audioBitsPerSecond: 32_000 });
  let seq = 0;
  let chain = Promise.resolve();
  rec.ondataavailable = (e) => {
    if (!e.data.size) return;
    const n = seq++;
    chain = chain.then(async () => {
      for (let i = 0; i < 4; i++) {
        const ok = await fetch(`/interview/${slug}/rec?track=${track}&segment=${segment}&seq=${n}`, {
          method: "POST",
          headers: { "Content-Type": "video/webm" },
          body: e.data,
        }).then((r) => r.ok || r.status === 409, () => false);
        if (ok) return;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
      }
    });
  };
  rec.start(10_000);
  return { stop: () => new Promise<void>((r) => ((rec.onstop = () => void chain.then(() => r())), rec.state !== "inactive" ? rec.stop() : r())) };
}

// ── Room ────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Clock = { index: number; phases: { id: PhaseId; label: string; seconds: number }[]; phaseLeft: number; totalLeft: number; running: boolean; at: number };
export type RoomSocket = { send: (msg: object) => void };
type Workspace =
  | { kind: "code"; problem: PublicProblem; starter: Record<Language, string>; code: { language: Language; code: string } | null }
  | { kind: "board"; design: { id: string; title: string; prompt: string; requirements: string[] }; elements: unknown[] }
  | null;

/** Where the room is on its way to a live interviewer. "ready" once Phonic said it's ready; "reconnecting" mid-interview. */
type Stage = "audio" | "room" | "joining" | "reconnecting" | "ready" | "failed";

function Room({ view, onDone, onDropped, onRetry }: { view: CandidateView; onDone: () => void; onDropped: () => void; onRetry: () => void }) {
  const [agent, setAgent] = useState<AgentState>("connecting");
  const [stage, setStage] = useState<Stage>("audio");
  const [started, setStarted] = useState(() => Date.now()); // when the current stage wait began, for "taking longer"
  const [everReady, setEverReady] = useState(false);
  const [caption, setCaption] = useState({ agent: "", you: "" });
  const [youSpeaking, setYouSpeaking] = useState(false);
  const [clock, setClock] = useState<Clock | null>(null);
  const [micOn, setMicOn] = useState(true);
  const micTrack = useRef<MediaStreamTrack | null>(null);
  const [paused, setPaused] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [chat, setChat] = useState<{ role: "agent" | "candidate"; text: string }[]>([]);
  const [code, setCode] = useState<Extract<Workspace, { kind: "code" }> | null>(null);
  const [board, setBoard] = useState<Extract<Workspace, { kind: "board" }> | null>(null);
  const [run, setRun] = useState<{ running: boolean; result: RunResult | null }>({ running: false, result: null });
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const play = useRef<AudioWorkletNode | null>(null);
  const snapshot = useRef<((id: string) => void) | null>(null);
  const self = useRef<HTMLVideoElement | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  // The self-view mounts after the joining screen: attach the camera whenever the element appears
  const selfView = useCallback((v: HTMLVideoElement | null) => {
    self.current = v;
    if (v && media.camera && v.srcObject !== media.camera) v.srcObject = media.camera;
  }, []);
  const ended = useRef(false);
  const [socket] = useState<RoomSocket>(() => ({ send: (m) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(m)) }));
  const onSnapshot = useCallback((fn: (id: string) => void) => void (snapshot.current = fn), []);

  const dropped = useEffectEvent(() => onDropped());
  const onMessage = useEffectEvent((m: Record<string, unknown>) => {
    switch (m.t) {
      case "stage": {
        const s = m.stage as Stage;
        if (s === "ready") setEverReady(true);
        setStarted(Date.now());
        return setStage(s);
      }
      case "state":
        return setAgent(m.agent as AgentState);
      case "cap":
        return setCaption((c) => ({ ...c, [m.who as string]: String(m.text) }));
      case "you":
        return setYouSpeaking(!!m.speaking);
      case "flush":
        return play.current?.port.postMessage("flush");
      case "clock":
        return setClock({ ...(m as unknown as Clock), at: Date.now() });
      case "problem":
        return setCode({ kind: "code", problem: m.problem as PublicProblem, starter: m.starter as Record<Language, string>, code: m.code as never });
      case "design":
        return setBoard({ kind: "board", design: m.design as never, elements: (m.elements as unknown[]) ?? [] });
      case "board-close":
        return setBoard(null);
      case "running":
        return setRun((r) => ({ ...r, running: true }));
      case "run":
        return setRun({ running: false, result: m.result as RunResult });
      case "snapshot":
        return snapshot.current?.(String(m.id));
      case "paused":
        play.current?.port.postMessage("flush");
        return setPaused(String(m.reason));
      case "resumed":
        return setPaused(null);
      case "fallback":
        setEverReady(true);
        setStage("ready");
        return setFallback(true);
      case "chat":
        return setChat((c) => [...c, { role: m.role as "agent" | "candidate", text: String(m.text) }]);
      case "error":
        return setError(String(m.message));
      case "ended":
        ended.current = true;
        return onDone();
    }
  });

  // Connect: audio graph, room socket, recordings. Torn down on unmount.
  useEffect(() => {
    let closed = false;
    const cleanup: (() => void)[] = [];
    (async () => {
      try {
        const ctx = new AudioContext({ sampleRate: 16_000 });
        cleanup.push(() => void ctx.close());
        await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { ...CAPTURE, ...(media.mic && { deviceId: { exact: media.mic } }) } });
        cleanup.push(() => mic.getTracks().forEach((t) => t.stop()));
        micTrack.current = mic.getAudioTracks()[0] ?? null;
        const src = ctx.createMediaStreamSource(mic);
        const cap = new AudioWorkletNode(ctx, "cap");
        src.connect(cap);
        // Chrome only runs nodes that lead to a destination: route the capture through a silent gain
        const sink = ctx.createGain();
        sink.gain.value = 0;
        cap.connect(sink).connect(ctx.destination);
        // Interviewer audio straight to the speakers. Chrome's browser-wide echo cancellation keeps it out of the mic,
        // so the interviewer doesn't hear (and interrupt) itself; headphones still help most.
        const player = new AudioWorkletNode(ctx, "play");
        play.current = player;
        player.connect(ctx.destination);
        // The Start click allows audio, but the awaits above can outlive that permission: offer a tap if it's blocked
        const audible = () => setMuted(ctx.state !== "running");
        ctx.onstatechange = audible;
        await ctx.resume().catch(() => {});
        audible();
        audioCtx.current = ctx;
        const mix = ctx.createMediaStreamDestination();
        src.connect(mix);
        player.connect(mix);

        if (closed) return;
        setStage("room");
        const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/interview/${view.slug}/room`);
        sock.binaryType = "arraybuffer";
        let opened = false;
        sock.onopen = () => ((opened = true), setStage((s) => (s === "room" ? "joining" : s)));
        ws.current = sock;
        cap.port.onmessage = (e) => sock.readyState === 1 && sock.send(e.data as ArrayBuffer);
        sock.onmessage = (e) => {
          if (typeof e.data === "string") return onMessage(JSON.parse(e.data));
          player.port.postMessage(e.data, [e.data as ArrayBuffer]);
        };
        sock.onclose = (e) => {
          if (closed || ended.current) return;
          if (!opened) return void setStage("failed"); // never reached the room: show Try again, not the device check
          setError(e.code === 4000 ? "The interview was opened in another tab." : "The connection dropped. Rejoin within 5 minutes to continue where you left off.");
          dropped();
        };
        cleanup.push(() => sock.close(1000));

        // Recordings: camera + both voices, and the shared screen
        if (media.camera) {
          const r = record(view.slug, "cam", new MediaStream([...media.camera.getVideoTracks(), ...mix.stream.getAudioTracks()]), 250_000);
          cleanup.push(() => void r.stop());
        }
        if (media.screen) {
          const r = record(view.slug, "screen", media.screen, 300_000);
          cleanup.push(() => void r.stop());
        }
      } catch (e) {
        setStage("failed");
        setError(e instanceof Error && e.message ? e.message : "Couldn't start the interview. Check your mic and try again.");
      }
    })();
    return () => {
      closed = true;
      cleanup.reverse().forEach((f) => f());
    };
  }, [view.slug]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, []);

  /** Mute: the track sends silence (the room and the recording hear nothing), so noise can't trigger the interviewer. */
  const toggleMic = useCallback(() => {
    const track = micTrack.current;
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  useProctoring(socket, self);

  const phase = clock?.phases[clock.index]?.id;
  // The whiteboard opens whenever the interviewer asks for a design sketch (any time in the Experience round)
  const workspace = phase === "coding" && code ? "code" : board ? "board" : "talk";

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border px-4">
        <span className="flex items-center gap-2.5">
          <Logo size={24} />
          <span className="hidden text-sm font-medium sm:inline">{view.company}</span>
        </span>
        <ol className="hidden min-w-0 flex-1 items-center gap-1 md:flex" aria-label="Interview phases">
          {clock?.phases.map((p, i) => (
            <li
              key={p.id}
              aria-current={i === clock.index ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${i === clock.index ? "bg-surface font-medium text-foreground" : i < clock.index ? "text-muted" : "text-muted/60"}`}
            >
              {i < clock.index && <Icon d={icons.check} size={12} className="text-success" />}
              {p.label}
            </li>
          ))}
        </ol>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-danger" title="This session is recorded">
            <span className="size-2 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />
            REC
          </span>
          {everReady && clock ? <Timer clock={clock} /> : <span className="text-muted">Waiting for your interviewer</span>}
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-danger/50 px-3 font-medium text-danger transition-colors hover:bg-danger/10"
            onClick={async () =>
              (await ask({ title: "End the interview now?", body: "You can't restart it.", confirm: "End interview", danger: true })) && socket.send({ t: "end" })
            }
          >
            End
          </button>
        </div>
      </header>

      {!everReady ? (
        <Joining stage={stage} since={started} error={error} onRetry={onRetry} />
      ) : (
      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_1fr]">
        <aside className="flex min-h-0 flex-col gap-4 border-b border-border p-4 lg:border-r lg:border-b-0">
          <div className="flex items-center gap-3 lg:flex-col lg:items-stretch">
            <div className="flex size-20 shrink-0 items-center justify-center lg:size-auto lg:h-32" aria-hidden>
              <ThinkingOrb state={ORB[agent]} size={64} />
            </div>
            <div className="min-w-0 space-y-1.5 lg:text-center" aria-live="polite">
              <p className="text-sm font-medium">{STATE_LABEL[agent]}</p>
              {caption.agent && <p className="line-clamp-4 text-sm leading-relaxed break-words">{caption.agent}</p>}
              {caption.you && (
                <p className={`line-clamp-2 text-xs break-words ${youSpeaking ? "text-foreground" : "text-muted"}`}>You: {caption.you}</p>
              )}
            </div>
          </div>
          {muted && (
            <button type="button" className={primary} onClick={() => void audioCtx.current?.resume()}>
              Tap to hear your interviewer
            </button>
          )}
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={!micOn}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${micOn ? "border-border hover:bg-surface-hover" : "border-danger/50 bg-danger/10 text-danger"}`}
          >
            <Icon d={micOn ? icons.mic : MIC_OFF} size={16} />
            {micOn ? "Mute" : "Unmute: the interviewer can't hear you"}
          </button>
          <video ref={selfView} autoPlay muted playsInline className="mt-auto hidden aspect-video w-full -scale-x-100 rounded-lg border border-border bg-surface object-cover lg:block" aria-label="Your camera" />
          <p className="hidden text-xs text-muted lg:block">Camera, microphone and screen are being recorded.</p>
          {error && <Alert>{error}</Alert>}
        </aside>

        <main className="relative min-h-0 min-w-0">
          {stage === "reconnecting" && !fallback && (
            <p role="status" className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 border-b border-border bg-surface px-4 py-2 text-xs">
              <span className="size-1.5 animate-pulse rounded-full bg-foreground motion-reduce:animate-none" />
              Reconnecting to your interviewer… The clock is paused.
            </p>
          )}
          {fallback ? (
            <TextChat chat={chat} onSend={(text) => (setChat((c) => [...c, { role: "candidate", text }]), socket.send({ t: "chat", text }))} />
          ) : workspace === "code" && code ? (
            <CodeWorkspace socket={socket} problem={code.problem} starter={code.starter} initial={code.code} run={run} />
          ) : workspace === "board" && board ? (
            <Whiteboard key={board.design.id} socket={socket} design={board.design} initial={board.elements} onSnapshot={onSnapshot} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="font-display text-2xl font-normal">{phase ? phaseLabel(phase) : "Getting ready"}</p>
              <p className="max-w-md text-sm text-muted">
                {phase === "coding"
                  ? "Your interviewer will open the editor in a moment."
                  : "Answer out loud, like a normal conversation. Take your time to think; short pauses are fine."}
              </p>
            </div>
          )}
        </main>
      </div>
      )}

      {paused && <PauseOverlay reason={paused} />}
    </div>
  );
}

const JOIN_STEPS: { stage: Stage; label: string; sub: string }[] = [
  { stage: "audio", label: "Setting up your audio", sub: "Microphone, speakers and recording" },
  { stage: "room", label: "Connecting to the interview room", sub: "A secure connection for this session" },
  { stage: "joining", label: "Your interviewer is joining", sub: "They'll greet you as soon as they're ready" },
];
const SLOW_MS = 25_000; // then reassure
const STUCK_MS = 90_000; // then offer a retry

/**
 * Shown until the interviewer is actually live: the clock hasn't started and nothing is assessed yet. Each step ticks
 * off as it completes; a slow join reassures, a stuck one offers Try again (the room remounts and reconnects).
 */
function Joining({ stage, since, error, onRetry }: { stage: Stage; since: number; error: string; onRetry: () => void }) {
  const now = useNow(1000);
  const at = stage === "reconnecting" ? 2 : Math.max(0, JOIN_STEPS.findIndex((s) => s.stage === stage));
  const waited = now - since;
  const failed = stage === "failed" || waited > STUCK_MS;
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center" aria-live="polite">
        <div className="mx-auto flex size-28 items-center justify-center" aria-hidden>
          <ThinkingOrb state="connecting" size={64} className="scale-125" />
        </div>
        <div>
          <h2 className="font-display text-xl font-normal">{failed ? "Couldn't reach your interviewer" : "Getting your interview ready"}</h2>
          <p className="mt-1 text-sm text-muted">
            {failed ? "Your progress is saved and the clock hasn't started." : "The clock starts when your interviewer joins."}
          </p>
        </div>
        <ol className="space-y-3 text-left">
          {JOIN_STEPS.map((s, i) => {
            const done = i < at;
            const current = i === at && !failed;
            return (
              <li key={s.stage} className="flex items-start gap-3" aria-current={current ? "step" : undefined}>
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${done ? "bg-success/15 text-success" : current ? "border border-foreground" : "border border-border"}`}
                >
                  {done ? (
                    <Icon d={icons.check} size={12} />
                  ) : current ? (
                    <span className="size-2 animate-pulse rounded-full bg-foreground motion-reduce:animate-none" />
                  ) : null}
                </span>
                <span className="min-w-0 text-sm">
                  <span className={`block ${done || current ? "font-medium" : "text-muted"}`}>{s.label}</span>
                  <span className="block text-xs text-muted">{s.sub}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {error && <Alert>{error}</Alert>}
        {failed ? (
          <button type="button" className={primary} onClick={onRetry}>
            Try again
          </button>
        ) : (
          waited > SLOW_MS && <p className="text-xs text-muted">This is taking longer than usual. Keep this tab open.</p>
        )}
      </div>
    </div>
  );
}

const MIC_OFF = "M2 2l20 20M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3";

/** A clock that re-renders only itself (not the editor or whiteboard) every tick. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Phase and total time left, counted down locally from the room's last clock message. */
function Timer({ clock }: { clock: Clock }) {
  const now = useNow(500);
  const elapsed = clock.running ? Math.floor((now - clock.at) / 1000) : 0;
  const phaseLeft = clock.phaseLeft - elapsed;
  const label = phaseLabel(clock.phases[clock.index]?.id ?? "");
  return (
    <>
      <span className={`tabular-nums ${phaseLeft <= 60 ? "font-medium text-danger" : "text-muted"}`} title="Time left in this phase">
        {label} {mmss(phaseLeft)}
        {clock.running ? "" : " · paused"}
      </span>
      <span className="hidden text-muted tabular-nums sm:inline" title="Time left in total">
        Total {mmss(clock.totalLeft - elapsed)}
      </span>
    </>
  );
}

function Loading({ what }: { what: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted">Loading the {what}…</div>;
}

function TextChat({ chat, onSend }: { chat: { role: "agent" | "candidate"; text: string }[]; onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" }); // returns a Promise in newer Chrome: never hand it back as cleanup
  }, [chat.length]);
  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-border px-4 py-2 text-xs text-muted">Voice is unavailable, so the interview continues by text.</p>
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {chat.map((l, i) => (
          <li key={i} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${l.role === "agent" ? "bg-surface" : "ml-auto border border-border"}`}>
            {l.text}
          </li>
        ))}
        <li ref={end} />
      </ol>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(text.trim());
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Type your answer"
          aria-label="Your answer"
          className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="submit" className={primary}>
          Send
        </button>
      </form>
    </div>
  );
}

// ── Proctoring ──────────────────────────────────────────────────────────────────────────────────────────────────────

const PAUSE_TEXT: Record<string, { title: string; body: string }> = {
  fullscreen_exit: { title: "You left full screen", body: "Return to full screen to continue the interview." },
  extra_monitor: { title: "Extra monitor detected", body: "Disconnect other monitors (or mirror your displays) to continue." },
  face_absent: { title: "We can't see you", body: "Make sure your face is visible to the camera to continue." },
  camera_off: { title: "Your camera is off", body: "Turn your camera back on to continue." },
  screen_share_stopped: { title: "Screen sharing stopped", body: "Share your entire screen again to continue." },
};

function PauseOverlay({ reason }: { reason: string }) {
  const t = PAUSE_TEXT[reason] ?? { title: "Interview paused", body: "Fix the issue to continue." };
  return (
    <div role="alertdialog" aria-modal aria-labelledby="pause-title" className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur">
      <div className="w-full max-w-sm space-y-4 border border-border bg-background p-6 text-center">
        <h2 id="pause-title" className="font-display text-xl font-normal">{t.title}</h2>
        <p className="text-sm text-muted">{t.body} The clock is paused.</p>
        {reason === "fullscreen_exit" && (
          <button type="button" className={primary} onClick={() => void document.documentElement.requestFullscreen()}>
            Return to full screen
          </button>
        )}
        {reason === "screen_share_stopped" && (
          <button
            type="button"
            className={primary}
            onClick={async () => {
              const s = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor", frameRate: 5 } }).catch(() => null);
              if (s && s.getVideoTracks()[0]?.getSettings().displaySurface !== "browser") {
                media.screen = s;
                window.dispatchEvent(new CustomEvent("screen-shared", { detail: s }));
              }
            }}
          >
            Share screen again
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Browser-side integrity signals, each sent to the room as a timestamped event. Hard ones (full-screen exit, extra
 * monitor, face absent for 10 s, camera off, screen share stopped) pause the interview until cleared; tab switches,
 * paste and multiple faces are only logged.
 */
function useProctoring(socket: RoomSocket, self: React.RefObject<HTMLVideoElement | null>) {
  const send = useEffectEvent((signal: string, o: { hard?: boolean; cleared?: boolean; detail?: string } = {}) =>
    socket.send({ t: "integrity", signal, ...o }),
  );
  const paste = useEffectEvent((chars: number) => socket.send({ t: "paste", chars }));
  useEffect(() => {
    const hard = new Set<string>();
    const set = (signal: string, on: boolean, detail?: string) => {
      if (on === hard.has(signal)) return;
      if (on) hard.add(signal);
      else hard.delete(signal);
      send(signal, { hard: true, cleared: !on, detail });
    };
    const onVis = () => document.hidden && send("tab_switch");
    const onBlur = () => send("focus_lost");
    const onFs = () => set("fullscreen_exit", !document.fullscreenElement);
    const onPaste = (e: ClipboardEvent) => {
      const n = e.clipboardData?.getData("text").length ?? 0;
      paste(n);
      if (n > 40) send("paste", { detail: `${n} characters` });
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("paste", onPaste, true);
    onFs();

    const watch = (s: MediaStream | null, signal: string) => {
      const t = s?.getVideoTracks()[0];
      if (!t) return set(signal, true);
      set(signal, t.readyState === "ended" || !t.enabled);
      t.addEventListener("ended", () => set(signal, true));
    };
    watch(media.camera, "camera_off");
    watch(media.screen, "screen_share_stopped");
    const reshared = (e: Event) => watch((e as CustomEvent<MediaStream>).detail, "screen_share_stopped");
    window.addEventListener("screen-shared", reshared);

    const mon = setInterval(() => set("extra_monitor", !!(window.screen as Screen & { isExtended?: boolean }).isExtended), 3000);

    // Face presence: the native FaceDetector where available, else MediaPipe's face detector (free, in the browser)
    let faceTimer = 0;
    let missingSince = 0;
    let lastMulti = 0;
    let stop = false;
    (async () => {
      const detect = await faceDetector();
      if (!detect || stop) return;
      faceTimer = window.setInterval(async () => {
        const v = self.current;
        if (!v || v.readyState < 2) return;
        const n = await detect(v).catch(() => -1);
        if (n < 0) return;
        const now = Date.now();
        if (n === 0) {
          missingSince ||= now;
          if (now - missingSince > 10_000) set("face_absent", true);
        } else {
          missingSince = 0;
          set("face_absent", false);
        }
        if (n > 1 && now - lastMulti > 30_000) {
          lastMulti = now;
          send("multiple_faces", { detail: `${n} faces` });
        }
      }, 2000);
    })();

    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("paste", onPaste, true);
      window.removeEventListener("screen-shared", reshared);
      clearInterval(mon);
      clearInterval(faceTimer);
    };
  }, [self]);
}

const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

/** Returns a face counter for a video frame, or null when no detector can load (then face checks are skipped). */
async function faceDetector(): Promise<((v: HTMLVideoElement) => Promise<number>) | null> {
  const Native = (window as unknown as { FaceDetector?: new (o: object) => { detect(s: CanvasImageSource): Promise<unknown[]> } }).FaceDetector;
  if (Native) {
    const fd = new Native({ fastMode: true, maxDetectedFaces: 3 });
    return async (v) => (await fd.detect(v)).length;
  }
  try {
    const vision = await import(/* @vite-ignore */ `${MEDIAPIPE}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
    const fd = await vision.FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" },
      runningMode: "VIDEO",
    });
    return async (v) => fd.detectForVideo(v, performance.now()).detections.length;
  } catch {
    return null;
  }
}
