"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { memo, useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ThinkingOrb } from "thinking-orbs";
import type { CandidateView } from "@/lib/screening/interview";
import { LIMITS, PHASES, phaseLabel, type PhaseId } from "@/lib/ai-interview/harness";
import { JOB_TYPES, LEVELS, WORKPLACES } from "@/lib/job-fields";
import { mobileBrowser, type PublicProblem, type RunResult, type Language } from "@/lib/ai-interview/workspace";
import { Details, Gate } from "../screening/interview";
import { MicCheck } from "../screening/voice";
import { ask } from "../kit";
import { Alert, Head, primary, StepFrame, ThemeToggle } from "../onboarding";
import { Logo } from "../auth";
import { btnGhost, Icon, icons } from "../ui";

// Heavy and only needed in their rounds: loaded when the round starts
// memo: captions and agent state update the room many times a second; the workspaces' props rarely change
const CodeWorkspace = dynamic(() => import("./workspace").then((m) => memo(m.CodeWorkspace)), {
  ssr: false,
  loading: () => <Loading what="editor" />,
});
const Whiteboard = dynamic(() => import("./workspace").then((m) => memo(m.Whiteboard)), {
  ssr: false,
  loading: () => <Loading what="whiteboard" />,
});

type Step = "phone" | "gate" | "details" | "check" | "consent" | "brief" | "room" | "done" | "closed";
const STEPS = ["Sign in", "Your details", "System check", "Consent", "Overview", "Interview"];
const INDEX: Record<Step, number> = {
  phone: 0,
  gate: 0,
  details: 1,
  check: 2,
  consent: 3,
  brief: 4,
  room: 5,
  done: 6,
  closed: 0,
};
type AgentState = "connecting" | "listening" | "thinking" | "speaking";
const ORB = { connecting: "connecting", listening: "listening", thinking: "solving", speaking: "composing" } as const;
const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};
const CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const chevron = "m9 18 6-6-6-6";
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

function stepOf(v: CandidateView): Step {
  const s = v.session?.status;
  if (s === "processing" || s === "done" || s === "failed") return "done";
  if (s === "live") return "check"; // dropped mid-interview: re-check devices (screen share needs a click), then rejoin
  if (!v.open) return "closed";
  return s === "onboarded" ? "check" : s === "verified" ? "details" : "gate";
}

/**
 * Media the system check acquired and the room keeps using (a screen share can only start from a click). One
 * interview per page, so a module-level holder: it outlives step changes without living in React state.
 */
type Media = { mic: string; camera: MediaStream | null; screen: MediaStream | null };
const media: Media = { mic: "", camera: null, screen: null };
/** Automatic rejoins in a row after a dropped room connection (reset once a connection opens). */
const rejoins = { n: 0 };

/**
 * The candidate's side of the AI interview: details → system check (browser, mic, camera, screen, monitors, network)
 * → consent and recording notice → overview → the interview room. Signed in with the candidate ID + password from the invite.
 */
export function AiInterview({
  view,
  turnstile,
  phone: phoneOnServer,
}: {
  view: CandidateView;
  turnstile: { sitekey: string; action: string };
  /** The server's guess from the request headers; the browser refines it (iPadOS sends a desktop User-Agent). */
  phone: boolean;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<Step | null>(null);
  const phone = useSyncExternalStore(noop, onPhone, () => phoneOnServer);
  // A finished or closed interview still says so; everything else needs a laptop or desktop
  const step = local ?? (phone && !["done", "closed"].includes(stepOf(view)) ? "phone" : stepOf(view));
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
    phone: <UseComputer live={rejoin} />,
    gate: <Gate view={view} turnstile={turnstile} onDone={() => (setLocal(null), router.refresh())} />,
    details: <Details initial={view.session?.prefill ?? {}} slug={view.slug} onDone={() => go("check")} />,
    check: <SystemCheck rejoin={rejoin} onDone={() => go(rejoin ? "room" : "consent")} />,
    consent: <Consent company={view.company} onDone={() => go("brief")} onBack={() => go("check")} />,
    brief: (
      <div className="space-y-7 text-sm leading-relaxed">
        <Head title="Before you start" sub={`${view.title} at ${view.company}`} />
        <section className="space-y-2.5">
          <h3 className="text-[13px] font-medium text-muted">The role</h3>
          <ul className="list-disc space-y-1.5 pl-5 marker:text-muted">
            <li>
              <strong className="font-medium">{view.title}</strong> at{" "}
              <strong className="font-medium">{view.company}</strong>
            </li>
            <li className="text-muted">
              {LEVELS[view.job.level]} · {JOB_TYPES[view.job.type]} · {WORKPLACES[view.job.workplace]}
              {view.job.location && ` · ${view.job.location}`}
            </li>
          </ul>
        </section>
        <section className="space-y-2.5">
          <h3 className="text-[13px] font-medium text-muted">
            The interview · {view.flexible ? `flexible, up to ${LIMITS.flexibleMinutes} min` : `${minutes} min`}
          </h3>
          <ol className="divide-y divide-border border-y border-border">
            {view.phases.map((p, i) => (
              <li key={p.id} className="flex items-start gap-3.5 py-3.5">
                <span className="mt-px w-4 shrink-0 text-[13px] text-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{phaseLabel(p.id)}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-pretty text-muted">
                    {(PHASES as Record<string, { goal: string }>)[p.id]?.goal}
                  </span>
                </span>
                <span className="mt-px shrink-0 text-[13px] text-muted tabular-nums">
                  {view.flexible ? "~" : ""}
                  {p.minutes} min
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="space-y-2.5">
          <h3 className="text-[13px] font-medium text-muted">Rules</h3>
          <ul className="list-disc space-y-2 pl-5 text-pretty marker:text-muted">
            <li>Talk out loud, like a real interview. You can interrupt the interviewer at any time.</li>
            <li>
              Stay in <strong className="font-medium">full screen</strong> with your screen shared and your face
              visible. Leaving full screen, a second monitor or stepping away pauses the interview until it&apos;s
              fixed.
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
        <p className="mt-1 text-sm text-muted">
          Thanks. {view.company}&apos;s hiring team will review it and be in touch. You can close this tab.
        </p>
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
function Row({
  state,
  title,
  sub,
  children,
}: {
  state: CheckState;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${state === "ok" ? "bg-success/15 text-success" : state === "fail" ? "bg-danger/15 text-danger" : "border border-border text-muted"}`}
        aria-label={state === "ok" ? "Passed" : state === "fail" ? "Failed" : "Not checked yet"}
      >
        {state === "ok" ? (
          <Icon d={icons.check} size={12} />
        ) : state === "fail" ? (
          <Icon d={icons.close} size={12} />
        ) : null}
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
  const browser = useSyncExternalStore<CheckState>(
    noop,
    () => (supported() ? "ok" : "fail"),
    () => "pending",
  );
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
        const s = media.camera?.active
          ? media.camera
          : await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, frameRate: 15 } });
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
        const ok = await fetch("/api/health", { cache: "no-store" }).then(
          (r) => r.ok,
          () => false,
        );
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
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: 5 },
        audio: false,
      });
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
          <Row
            state={browser}
            title="Browser"
            sub={browser === "fail" ? "Use the latest Chrome or Edge on a laptop or desktop." : "Supported browser."}
          />
          <Row
            state={cam}
            title="Camera"
            sub={
              cam === "fail"
                ? "Allow camera access from the icon in the address bar, then reload."
                : "Your face should be clearly visible."
            }
          />
          <Row
            state={screen}
            title="Screen sharing"
            sub={
              screenErr ||
              (screen === "ok" ? "Sharing your entire screen." : "Share your entire screen for the whole interview.")
            }
          >
            {screen !== "ok" && (
              <button type="button" className={`${btnGhost} mt-2 border border-border`} onClick={share}>
                Share screen
              </button>
            )}
          </Row>
          <Row
            state={monitors}
            title="One monitor"
            sub={
              monitors === "fail"
                ? "Disconnect extra monitors (or set displays to mirror)."
                : "No extra displays detected."
            }
          />
          <Row
            state={net.state}
            title="Network"
            sub={
              net.state === "pending"
                ? "Checking…"
                : net.state === "ok"
                  ? `Good connection (${net.ms} ms).`
                  : "Your connection is slow or offline. Move closer to your router or switch networks."
            }
          />
        </ul>
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full -scale-x-100 rounded-lg border border-border bg-surface object-cover sm:aspect-[3/4]"
          aria-label="Camera preview"
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Microphone</p>
        <MicCheck deviceId={mic} onDevice={(d) => ((media.mic = d), setMic(d))} onError={onMicError}>
          {(heard) => {
            const ready = heard && [browser, cam, screen, monitors, net.state].every((s) => s === "ok");
            return (
              <>
                {micErr && <Alert>{micErr}</Alert>}
                <p className="text-xs text-muted">
                  Headphones help: the interviewer won&apos;t hear itself through your speakers.
                </p>
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

/** Client Hints where supported (Chromium), else the UA; iPadOS claims to be a Mac, so a touch Mac is an iPad. */
const onPhone = () => mobileBrowser(navigator);

/** Shown instead of the steps on a phone or tablet, with the link one tap from being sent to their computer. */
function UseComputer({ live }: { live: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-6">
      <Head
        title="Open this on a laptop or desktop"
        sub="The AI interview needs a full-size screen, a webcam and whole-screen sharing, which phones and tablets don't support."
      />
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed marker:text-muted">
        <li>Use the latest Chrome or Edge on a laptop or desktop.</li>
        <li>Open the link from your invitation email there and sign in with the same candidate ID and password.</li>
        <li>
          {live
            ? "Your interview is in progress and the clock is paused: rejoin from a laptop or desktop within 5 minutes."
            : "Nothing has started yet: your attempt is still unused."}
        </li>
      </ul>
      <div className="flex justify-end border-t border-border pt-5">
        <button
          type="button"
          className={primary}
          onClick={() =>
            void navigator.clipboard?.writeText(location.href.split("?")[0]).then(
              () => setCopied(true),
              () => {},
            )
          }
        >
          <Icon d={copied ? icons.check : COPY} size={16} />
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
const COPY = "M8 8h12v12H8zM16 8V4H4v12h4";

function supported() {
  const ua = navigator.userAgent;
  return (
    !onPhone() &&
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
      <ul className="divide-y divide-border border-y border-border">
        {[
          [
            "AI interviewer",
            `The interview is run by an AI interviewer on behalf of ${company}. It asks questions and follow-ups; it doesn't decide whether you're hired.`,
          ],
          [
            "Recording",
            "Your camera, microphone, screen, code and whiteboard are recorded for the whole session, with a live transcript.",
          ],
          [
            "How it's used",
            `An AI evaluator summarizes the interview against the role's rubric for ${company}'s hiring team, who review the recording and make the decision.`,
          ],
          [
            "Integrity",
            "Leaving full screen, switching tabs, pasting text, extra monitors and your face leaving the camera are logged.",
          ],
          ["Your data", `It's shared only with ${company}'s hiring team and kept according to their retention policy.`],
        ].map(([t, d]) => (
          <li key={t} className="py-3.5">
            <span className="block font-medium">{t}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-pretty text-muted">{d}</span>
          </li>
        ))}
      </ul>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={a}
          onChange={(e) => setA(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-foreground"
        />
        <span>I agree to be interviewed by an AI interviewer and to the recording described above.</span>
      </label>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={b}
          onChange={(e) => setB(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-foreground"
        />
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
  // 40 ms frames (Phonic's maximum): half the WebSocket messages of 20 ms, which halves billed requests and room CPU wake-ups
  constructor() { super(); this.buf = new Int16Array(640); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      const v = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === 640) { this.port.postMessage(this.buf.buffer.slice(0)); this.n = 0; }
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
  const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  )!;
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
        }).then(
          (r) => r.ok || r.status === 409,
          () => false,
        );
        if (ok) return;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
      }
    });
  };
  rec.start(10_000);
  return {
    stop: () =>
      new Promise<void>(
        (r) => ((rec.onstop = () => void chain.then(() => r())), rec.state !== "inactive" ? rec.stop() : r()),
      ),
  };
}

// ── Room ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** flexible: phase times are only a guide, so only the overall time left is shown. */
type Clock = {
  index: number;
  phases: { id: PhaseId; label: string; seconds: number }[];
  phaseLeft: number;
  totalLeft: number;
  running: boolean;
  flexible?: boolean;
  at: number;
};
export type RoomSocket = { send: (msg: object) => void };
type Workspace =
  | {
      kind: "code";
      problem: PublicProblem;
      starter: Record<Language, string>;
      code: { language: Language; code: string } | null;
    }
  | {
      kind: "board";
      design: { id: string; title: string; prompt: string; requirements: string[] };
      elements: unknown[];
    }
  | null;

/** Where the room is on its way to a live interviewer. "ready" once Phonic said it's ready; "reconnecting" mid-interview. */
type Stage = "audio" | "room" | "joining" | "reconnecting" | "ready" | "failed";

function Room({
  view,
  onDone,
  onDropped,
  onRetry,
}: {
  view: CandidateView;
  onDone: () => void;
  onDropped: () => void;
  onRetry: () => void;
}) {
  const [agent, setAgent] = useState<AgentState>("connecting");
  const [stage, setStage] = useState<Stage>("audio");
  const [started, setStarted] = useState(() => Date.now()); // when the current stage wait began, for "taking longer"
  const [everReady, setEverReady] = useState(false);
  const [caption, setCaption] = useState({ agent: "", you: "" });
  const [question, setQuestion] = useState("");
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
  const [socket] = useState<RoomSocket>(() => ({
    send: (m) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(m)),
  }));
  const onSnapshot = useCallback((fn: (id: string) => void) => void (snapshot.current = fn), []);

  const dropped = useEffectEvent(() => onDropped());
  const rejoin = useEffectEvent(() => onRetry());
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
      case "cap": {
        const text = String(m.text);
        // Pin the interviewer's latest question beside the editor, so it stays readable after the caption moves on
        const asked =
          m.who === "agent"
            ? text
                .match(/[^.?!]*\?/g)
                ?.at(-1)
                ?.trim()
            : "";
        if (asked) setQuestion(asked);
        return setCaption((c) => ({ ...c, [m.who as string]: text }));
      }
      case "you":
        return setYouSpeaking(!!m.speaking);
      case "flush":
        return play.current?.port.postMessage("flush");
      case "clock":
        return setClock({ ...(m as unknown as Clock), at: Date.now() });
      case "problem":
        return setCode({
          kind: "code",
          problem: m.problem as PublicProblem,
          starter: m.starter as Record<Language, string>,
          code: m.code as never,
        });
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
      case "voice": // voice came back after a text-chat stretch
        return setFallback(false);
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
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { ...CAPTURE, ...(media.mic && { deviceId: { exact: media.mic } }) },
        });
        // Unmounted while the mic prompt was open: cleanup already ran, so release the device here
        if (closed) return void mic.getTracks().forEach((t) => t.stop());
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
        const sock = new WebSocket(
          `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/interview/${view.slug}/room`,
        );
        sock.binaryType = "arraybuffer";
        let opened = false;
        ws.current = sock;
        cap.port.onmessage = (e) => sock.readyState === 1 && sock.send(e.data as ArrayBuffer);
        sock.onmessage = (e) => {
          if (typeof e.data === "string") return onMessage(JSON.parse(e.data));
          player.port.postMessage(e.data, [e.data as ArrayBuffer]);
        };
        sock.onopen = () => ((opened = true), (rejoins.n = 0), setStage((s) => (s === "room" ? "joining" : s)));
        sock.onclose = (e) => {
          if (closed || ended.current) return;
          if (!opened) return void setStage("failed"); // never reached the room: show Try again, not the device check
          // A blip: rejoin on our own (the room keeps the conversation open briefly), with backoff, before asking
          // the candidate to re-check their devices
          const live = !media.screen || media.screen.getVideoTracks()[0]?.readyState === "live";
          if (e.code !== 4000 && live && rejoins.n < 3) {
            rejoins.n++;
            setStage("reconnecting");
            return void setTimeout(rejoin, 500 * 2 ** rejoins.n);
          }
          setError(
            e.code === 4000
              ? "The interview was opened in another tab."
              : "The connection dropped. Rejoin within 5 minutes to continue where you left off.",
          );
          dropped();
        };
        cleanup.push(() => sock.close(1000));

        // Recordings: camera + both voices, and the shared screen
        if (media.camera) {
          const r = record(
            view.slug,
            "cam",
            new MediaStream([...media.camera.getVideoTracks(), ...mix.stream.getAudioTracks()]),
            250_000,
          );
          cleanup.push(() => void r.stop());
        }
        const recordScreen = (s: MediaStream) => {
          const r = record(view.slug, "screen", s, 300_000);
          cleanup.push(() => void r.stop());
        };
        if (media.screen) recordScreen(media.screen);
        // A re-shared screen (after the share was stopped) starts a new recording segment
        const reshared = (e: Event) => recordScreen((e as CustomEvent<MediaStream>).detail);
        window.addEventListener("screen-shared", reshared);
        cleanup.push(() => window.removeEventListener("screen-shared", reshared));
      } catch (e) {
        setStage("failed");
        setError(
          e instanceof Error && e.message ? e.message : "Couldn't start the interview. Check your mic and try again.",
        );
      }
    })();
    return () => {
      closed = true;
      cleanup.reverse().forEach((f) => f());
    };
  }, [view.slug]);

  // Once the interviewer is live, warm the code editor and whiteboard in the background (the workspace chunk with
  // Excalidraw, and Monaco from its CDN) so they open instantly when the technical or coding round starts
  useEffect(() => {
    if (!everReady) return;
    const warm = () => {
      void import("./workspace").catch(() => {});
      void import("@monaco-editor/react").then((m) => m.loader.init()).catch(() => {});
    };
    const t = setTimeout(
      () => (typeof requestIdleCallback === "function" ? requestIdleCallback(warm, { timeout: 10_000 }) : warm()),
      5_000,
    );
    return () => clearTimeout(t);
  }, [everReady]);

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
  // The whiteboard opens when the interviewer asks for a design sketch (the technical round)
  const workspace = fallback ? "chat" : phase === "coding" && code ? "code" : board ? "board" : "talk";
  // Talk rounds put both tiles centre stage; a workspace docks them into a side panel
  const dock = workspace !== "talk";
  // The editor and whiteboard are heavy to mount: wait until the tiles have finished moving so the move never drops frames
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(dock);
  useEffect(() => {
    const t = setTimeout(() => setSettled(dock), dock && !reduce ? DOCK_MS : 0);
    return () => clearTimeout(t);
  }, [dock, reduce]);
  // Measure layout only when the arrangement changes: captions re-render the room many times a second
  const tile = { layout: true, layoutDependency: dock } as const;
  const index = clock?.index ?? 0;

  return (
    <MotionConfig reducedMotion="user" transition={{ layout: MOVE }}>
      <div className="flex h-dvh flex-col bg-background">
        <header className="grid h-15 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-6 border-b border-border px-6">
          <span className="flex min-w-0 items-center gap-2.5">
            <Logo size={24} />
            <span className="truncate text-sm font-medium">{view.company}</span>
          </span>
          <ol className="flex items-center gap-2.5 text-[13px]" aria-label="Interview rounds">
            {clock?.phases.map((p, i) => (
              <li
                key={p.id}
                aria-current={i === index ? "step" : undefined}
                className={`flex items-center gap-2.5 ${i === index ? "font-medium text-foreground" : "text-muted"}`}
              >
                {i > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
                {i < index ? (
                  <Icon d={icons.check} size={12} className="text-success" />
                ) : (
                  <span className={`size-1.5 rounded-full ${i === index ? "bg-foreground" : "bg-border"}`} />
                )}
                {p.label}
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-end gap-4 text-[13px]">
            <span
              className="flex items-center gap-1.5 text-xs font-medium text-danger"
              title="This session is recorded"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />
              REC
            </span>
            {everReady && clock ? (
              <Timer clock={clock} />
            ) : (
              <span className="text-muted">Waiting for your interviewer</span>
            )}
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-lg border border-danger/40 px-3.5 font-medium text-danger transition-colors outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={async () =>
                (await ask({
                  title: "End the interview now?",
                  body: "You can't restart it.",
                  confirm: "End interview",
                  danger: true,
                })) && socket.send({ t: "end" })
              }
            >
              End interview
            </button>
          </div>
        </header>

        {!everReady ? (
          <Joining stage={stage} since={started} error={error} onRetry={onRetry} />
        ) : (
          <div className="relative flex min-h-0 flex-1">
            {stage === "reconnecting" && !fallback && (
              <p
                role="status"
                className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 border-b border-border bg-surface px-4 py-2 text-xs"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-foreground motion-reduce:animate-none" />
                Reconnecting to your interviewer… The clock is paused.
              </p>
            )}
            <aside
              className={
                dock
                  ? "flex w-[360px] shrink-0 flex-col overflow-y-auto border-r border-border"
                  : "flex flex-1 flex-col items-center justify-center overflow-y-auto p-8 pb-16"
              }
            >
              {/* The same two tile elements in both arrangements, so the camera never remounts; Motion animates the
                  move with transforms (FLIP) */}
              <div className={dock ? "grid grid-cols-2 gap-3 px-5 pt-5" : "flex items-center gap-12"}>
                <motion.div
                  key="interviewer"
                  {...tile}
                  style={{ borderRadius: dock ? 12 : 16 }}
                  className={`relative aspect-[4/3] overflow-hidden border border-border bg-surface ${dock ? "w-full" : STAGE_W}`}
                >
                  <div className="absolute inset-0 flex items-center justify-center pb-[12%]" aria-hidden>
                    {/* A fixed share of the tile, so the tile's own scale carries it smoothly */}
                    <ThinkingOrb state={ORB[agent]} size={64} className={dock ? "scale-[0.62]" : "scale-[1.75]"} />
                  </div>
                  <motion.span
                    {...tile}
                    className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium"
                  >
                    <span
                      className={`size-1.5 rounded-full ${agent === "speaking" ? "bg-success" : "bg-muted"}`}
                      aria-hidden
                    />
                    {dock ? STATE_LABEL[agent] : `Interviewer · ${STATE_LABEL[agent]}`}
                  </motion.span>
                </motion.div>
                {!dock && (
                  <motion.div
                    key="round"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: 0.2 } }}
                    className="w-48 shrink-0 text-center"
                  >
                    <p className="font-display text-3xl leading-tight font-normal">
                      {phase ? phaseLabel(phase) : "Getting ready"}
                    </p>
                    {clock && (
                      <p className="mt-2 text-[13px] text-muted">
                        Round {index + 1} of {clock.phases.length}
                        {phase === "coding" && " · the editor opens in a moment"}
                      </p>
                    )}
                  </motion.div>
                )}
                <motion.div
                  key="camera"
                  {...tile}
                  style={{ borderRadius: dock ? 12 : 16 }}
                  className={`relative aspect-[4/3] overflow-hidden border border-border bg-surface-hover ${dock ? "w-full" : STAGE_W}`}
                >
                  <video
                    ref={selfView}
                    autoPlay
                    muted
                    playsInline
                    className="size-full -scale-x-100 object-cover"
                    aria-label="Your camera"
                  />
                  <motion.span
                    {...tile}
                    className="absolute bottom-2.5 left-2.5 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-medium"
                  >
                    You
                  </motion.span>
                  <motion.button
                    {...tile}
                    type="button"
                    onClick={toggleMic}
                    aria-pressed={!micOn}
                    aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
                    title={micOn ? "Mute" : "Unmute: the interviewer can't hear you"}
                    className={`absolute right-2.5 bottom-2.5 flex size-8 items-center justify-center rounded-full shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${micOn ? "bg-surface text-foreground hover:bg-surface-hover" : "bg-danger text-white"}`}
                  >
                    <Icon d={micOn ? icons.mic : MIC_OFF} size={15} />
                  </motion.button>
                </motion.div>
              </div>

              {dock ? (
                <motion.div
                  key="panel"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.25 } }}
                  className="flex flex-1 flex-col"
                >
                  <div className="space-y-3.5 p-5" aria-live="polite">
                    <Line who="Interviewer" text={caption.agent} />
                    <Line who="You" text={caption.you} quiet={!youSpeaking} />
                  </div>
                  {workspace !== "chat" && (
                    <section className="flex-1 space-y-2.5 border-t border-border p-5">
                      {workspace === "board" && board ? (
                        <>
                          <h2 className="text-base leading-snug font-medium text-balance">{board.design.title}</h2>
                          {board.design.prompt && (
                            <p className="text-sm leading-relaxed text-muted">{board.design.prompt}</p>
                          )}
                          <ul className="space-y-2 pt-1.5 text-[13px]">
                            {board.design.requirements.map((r) => (
                              <li key={r} className="flex items-start gap-2">
                                <Icon d={icons.check} size={13} className="mt-0.5 shrink-0 text-success" />
                                {r}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <>
                          <h2 className="text-[13px] text-muted">Latest question</h2>
                          <p className="text-base leading-snug font-medium text-pretty">
                            {question || "Your interviewer's latest question stays pinned here."}
                          </p>
                        </>
                      )}
                    </section>
                  )}
                  <Notices muted={muted} error={error} onHear={() => void audioCtx.current?.resume()} />
                </motion.div>
              ) : (
                <div
                  className={`mt-6 grid grid-cols-[var(--stage-w)_12rem_var(--stage-w)] gap-x-12 [--stage-w:min(440px,34vw)]`}
                >
                  <Line who="Interviewer" text={caption.agent} center live />
                  <span />
                  <Line who="You" text={caption.you} quiet={!youSpeaking} center />
                  <div className="col-span-3 mx-auto mt-4 w-full max-w-sm empty:hidden">
                    <Notices muted={muted} error={error} onHear={() => void audioCtx.current?.resume()} />
                  </div>
                </div>
              )}
            </aside>

            {/* popLayout: the leaving workspace is taken out of the flow at once, so the tiles' move starts clean */}
            <AnimatePresence mode="popLayout">
              {dock && settled && (
                <motion.main
                  key={workspace}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.25 } }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  className="relative min-h-0 min-w-0 flex-1"
                >
                  {workspace === "chat" ? (
                    <TextChat
                      chat={chat}
                      onSend={(text) => (
                        setChat((c) => [...c, { role: "candidate", text }]),
                        socket.send({ t: "chat", text })
                      )}
                    />
                  ) : workspace === "code" && code ? (
                    <CodeWorkspace
                      socket={socket}
                      problem={code.problem}
                      starter={code.starter}
                      initial={code.code}
                      run={run}
                    />
                  ) : workspace === "board" && board ? (
                    <Whiteboard
                      key={board.design.id}
                      socket={socket}
                      design={board.design}
                      initial={board.elements}
                      onSnapshot={onSnapshot}
                      bare
                    />
                  ) : null}
                </motion.main>
              )}
            </AnimatePresence>
          </div>
        )}

        {paused && <PauseOverlay reason={paused} />}
      </div>
    </MotionConfig>
  );
}

/** Tiles move on a soft spring with no visible overshoot; the workspace mounts once the move has settled. */
const MOVE = { type: "spring", duration: 0.55, bounce: 0.12 } as const;
const DOCK_MS = 450;
const STAGE_W = "w-[min(440px,34vw)]";

/** One speaker's live caption: a fixed three-line box, so a growing caption never shifts the tiles. */
function Line({
  who,
  text,
  quiet,
  center,
  live,
}: {
  who: string;
  text: string;
  quiet?: boolean;
  center?: boolean;
  live?: boolean;
}) {
  return (
    <div className={center ? "text-center" : ""} aria-live={live ? "polite" : undefined}>
      <p className="text-xs font-medium text-muted">{who}</p>
      <p
        className={`mt-1 line-clamp-3 min-h-[4.5em] leading-normal break-words transition-colors ${quiet ? "text-muted" : "text-foreground"} ${center ? "text-[15px]" : "text-sm"}`}
      >
        {text}
      </p>
    </div>
  );
}

function Notices({ muted, error, onHear }: { muted: boolean; error: string; onHear: () => void }) {
  if (!muted && !error) return null;
  return (
    <div className="space-y-3 p-5">
      {muted && (
        <button type="button" className={`${primary} w-full`} onClick={onHear}>
          Tap to hear your interviewer
        </button>
      )}
      {error && <Alert>{error}</Alert>}
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
function Joining({
  stage,
  since,
  error,
  onRetry,
}: {
  stage: Stage;
  since: number;
  error: string;
  onRetry: () => void;
}) {
  const now = useNow(1000);
  const at =
    stage === "reconnecting"
      ? 2
      : Math.max(
          0,
          JOIN_STEPS.findIndex((s) => s.stage === stage),
        );
  const waited = now - since;
  const failed = stage === "failed" || waited > STUCK_MS;
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center" aria-live="polite">
        <div className="mx-auto flex size-28 items-center justify-center" aria-hidden>
          <ThinkingOrb state="connecting" size={64} className="scale-125" />
        </div>
        <div>
          <h2 className="font-display text-xl font-normal">
            {failed ? "Couldn't reach your interviewer" : "Getting your interview ready"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {failed
              ? "Your progress is saved and the clock hasn't started."
              : "The clock starts when your interviewer joins."}
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
          waited > SLOW_MS && (
            <p className="text-xs text-muted">This is taking longer than usual. Keep this tab open.</p>
          )
        )}
      </div>
    </div>
  );
}

const MIC_OFF =
  "M2 2l20 20M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3";

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
  if (clock.flexible) {
    const left = clock.totalLeft - elapsed;
    return (
      <span
        className={`tabular-nums ${left <= 300 ? "font-medium text-danger" : "text-muted"}`}
        title="Time left in the interview (flexible timing)"
      >
        {label} · {mmss(left)} left{clock.running ? "" : " · paused"}
      </span>
    );
  }
  return (
    <>
      <span
        className={`tabular-nums ${phaseLeft <= 60 ? "font-medium text-danger" : "text-muted"}`}
        title="Time left in this phase"
      >
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

function TextChat({
  chat,
  onSend,
}: {
  chat: { role: "agent" | "candidate"; text: string }[];
  onSend: (t: string) => void;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" }); // returns a Promise in newer Chrome: never hand it back as cleanup
  }, [chat.length]);
  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-border px-4 py-2 text-xs text-muted">
        Voice is unavailable, so the interview continues by text.
      </p>
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {chat.map((l, i) => (
          <li
            key={i}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${l.role === "agent" ? "bg-surface" : "ml-auto border border-border"}`}
          >
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
  extra_monitor: {
    title: "Extra monitor detected",
    body: "Disconnect other monitors (or mirror your displays) to continue.",
  },
  face_absent: { title: "We can't see you", body: "Make sure your face is visible to the camera to continue." },
  camera_off: { title: "Your camera is off", body: "Turn your camera back on to continue." },
  screen_share_stopped: { title: "Screen sharing stopped", body: "Share your entire screen again to continue." },
};

function PauseOverlay({ reason }: { reason: string }) {
  const t = PAUSE_TEXT[reason] ?? { title: "Interview paused", body: "Fix the issue to continue." };
  return (
    <div
      role="alertdialog"
      aria-modal
      aria-labelledby="pause-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur"
    >
      <div className="w-full max-w-sm space-y-4 border border-border bg-background p-6 text-center">
        <h2 id="pause-title" className="font-display text-xl font-normal">
          {t.title}
        </h2>
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
              const s = await navigator.mediaDevices
                .getDisplayMedia({ video: { displaySurface: "monitor", frameRate: 5 } })
                .catch(() => null);
              if (!s) return;
              // Same rule as the system check: the entire screen, never a window or tab
              if (s.getVideoTracks()[0]?.getSettings().displaySurface !== "monitor")
                return s.getTracks().forEach((t) => t.stop());
              media.screen = s;
              window.dispatchEvent(new CustomEvent("screen-shared", { detail: s }));
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

    const mon = setInterval(
      () => set("extra_monitor", !!(window.screen as Screen & { isExtended?: boolean }).isExtended),
      3000,
    );

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
  const Native = (
    window as unknown as { FaceDetector?: new (o: object) => { detect(s: CanvasImageSource): Promise<unknown[]> } }
  ).FaceDetector;
  if (Native) {
    const fd = new Native({ fastMode: true, maxDetectedFaces: 3 });
    return async (v) => (await fd.detect(v)).length;
  }
  try {
    const vision = await import(/* @vite-ignore */ `${MEDIAPIPE}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
    const fd = await vision.FaceDetector.createFromOptions(files, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
      },
      runningMode: "VIDEO",
    });
    return async (v) => fd.detectForVideo(v, performance.now()).detections.length;
  } catch {
    return null;
  }
}
