"use client";

import type { RemoteParticipant, Room } from "livekit-client";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { answer, beginTest, finishTest, onboard, start, verify, warm } from "@/app/interview/actions";
import type { CandidateView } from "@/lib/interview";
import { cleanProfile, INTERVIEW, KINDS, NOTICE, screeningFacts, type McqPublic, type Profile } from "@/lib/interview-fields";
import { Alert, Head, primary, StepFrame, ThemeToggle } from "./onboarding";
import { F, input } from "./resume-editor";
import { ask, Select } from "./kit";
import { btnGhost, Icon, icons } from "./ui";

type Step = "gate" | "details" | "mic" | "live" | "ready" | "test" | "done" | "closed";
type AgentState = "connecting" | "initializing" | "listening" | "thinking" | "speaking";
const STEPS = { voice: ["Sign in", "Your details", "Mic check", "Interview"], mcq: ["Sign in", "Your details", "Instructions", "Test"] };
const INDEX: Record<Step, number> = { gate: 0, details: 1, mic: 2, live: 3, ready: 2, test: 3, done: 4, closed: 0 };
// The orb's tuned animation for each interviewer state
const ORB = { connecting: "connecting", initializing: "connecting", listening: "listening", thinking: "solving", speaking: "composing" } as const;
const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Connecting…", initializing: "Your interviewer is joining…", listening: "Listening", thinking: "Thinking…", speaking: "Speaking",
};
const mic = icons.mic;
const chevron = "m9 18 6-6-6-6";
const field = (bad: boolean) => `${input} h-10 ${bad ? "border-danger" : "border-border"}`;
const date = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
// iOS Safari (17+) otherwise drops a call with the mic open to the earpiece; "play-and-record" defaults to the loudspeaker
const audioSession = (type: "play-and-record" | "auto") => {
  const s = (navigator as { audioSession?: { type: string } }).audioSession;
  if (s) s.type = type;
};

function stepOf(v: CandidateView): Step {
  const s = v.session?.status;
  if (s === "processing" || s === "done" || s === "failed") return "done";
  if (s === "live") return v.kind === "mcq" ? "test" : "mic"; // dropped mid-call: rejoin
  if (!v.open) return "closed";
  return s === "onboarded" ? (v.kind === "mcq" ? "ready" : "mic") : s === "verified" ? "details" : "gate";
}

/**
 * The candidate's side, no account needed: shared password + application email → a few details → then either
 * a mic check and a live voice call with the AI interviewer (LiveKit, capped at five minutes; the agent reports the
 * transcript), or instructions and a timed MCQ test whose picks save as they're made.
 */
export function Interview({ view }: { view: CandidateView }) {
  const router = useRouter();
  const [local, setLocal] = useState<Step | null>(null);
  const step = local ?? stepOf(view);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [agent, setAgent] = useState<AgentState>("connecting");
  const [caption, setCaption] = useState({ agent: "", you: "" });
  const [endsAt, setEndsAt] = useState(0); // 0 until the interviewer is in the call
  const [muted, setMuted] = useState(false); // the browser blocked autoplay (Safari, mostly)
  const room = useRef<Room | null>(null);
  const go = (s: Step | null) => (setError(""), setLocal(s), window.scrollTo({ top: 0 }));

  useEffect(() => () => void room.current?.disconnect(), []);
  // Get the interviewer into the room while the candidate checks their mic (hides the agent's cold start)
  useEffect(() => {
    if (step === "mic" && view.kind === "voice") void warm(view.slug);
  }, [step, view.kind, view.slug]);

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    const r = await verify(view.slug, fd).catch(() => ({ error: "Couldn't reach the server. Check your connection." }));
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setName(String(fd.name ?? "").trim());
    go(null); // the refreshed view knows the session
    router.refresh();
  }

  async function startTest() {
    setBusy(true);
    setError("");
    const r = await beginTest(view.slug).catch(() => ({ error: "Couldn't reach the server. Check your connection." }));
    if ("error" in r) return (setBusy(false), setError(r.error));
    go(null); // the refreshed view carries the questions
    router.refresh();
  }

  /** Runs on the Start click, so the browser lets the interviewer's audio play. */
  async function begin() {
    setBusy(true);
    setError("");
    audioSession("play-and-record");
    try {
      const r = await start(view.slug);
      if ("error" in r) throw new Error(r.error);
      const { DisconnectReason, RemoteParticipant, Room, RoomEvent, Track } = await import("livekit-client");
      const rm = new Room({ audioCaptureDefaults: { deviceId: deviceId || undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      rm.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach());
      });
      // The clock starts once the interviewer is ready, not on the click: dispatch can take a while
      const sync = (p: RemoteParticipant) => {
        if (!p.isAgent) return;
        const s = (p.attributes["lk.agent.state"] as AgentState | undefined) ?? "initializing";
        setAgent(s);
        if (s === "listening" || s === "thinking" || s === "speaking") setEndsAt((e) => e || Date.now() + r.seconds * 1000);
      };
      rm.on(RoomEvent.ParticipantConnected, sync);
      rm.on(RoomEvent.ParticipantAttributesChanged, (_, p) => p instanceof RemoteParticipant && sync(p));
      rm.on(RoomEvent.AudioPlaybackStatusChanged, () => setMuted(!rm.canPlaybackAudio));
      rm.on(RoomEvent.Disconnected, (reason) => {
        room.current = null;
        audioSession("auto");
        // We hung up, or the agent ended the call (it deletes the room). Anything else is a dropped connection.
        if (reason === DisconnectReason.CLIENT_INITIATED || reason === DisconnectReason.ROOM_DELETED) return go("done");
        go("mic");
        setError("The connection dropped. Rejoin to continue where you left off.");
      });
      // Live captions: the agent publishes both sides; a transcribed track of ours means it's what we said
      rm.registerTextStreamHandler("lk.transcription", async (reader) => {
        const tid = reader.info.attributes?.["lk.transcribed_track_id"];
        const who = tid && rm.localParticipant.trackPublications.has(tid) ? "you" : "agent";
        let t = "";
        for await (const chunk of reader) {
          t += chunk;
          setCaption((c) => ({ ...c, [who]: t }));
        }
      });
      await rm.connect(r.url, r.token);
      await rm.localParticipant.setMicrophoneEnabled(true);
      // Pre-warmed: the interviewer may already be in the room
      rm.remoteParticipants.forEach(sync);
      await rm.startAudio().catch(() => {});
      setMuted(!rm.canPlaybackAudio);
      room.current = rm;
      go("live");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't start the interview. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const card: Record<Step, React.ReactNode> = {
    gate: (
      <form onSubmit={signIn} className="space-y-5">
        <Head title={`${KINDS[view.kind]} for ${view.title}`} sub="Use the details from your invitation email." />
        <F label="Full name">
          <input name="name" required maxLength={60} autoComplete="name" autoFocus placeholder="Ada Lovelace" className={field(false)} />
        </F>
        <F label="Email" hint="the one you applied with">
          <input name="email" type="email" required maxLength={254} autoComplete="email" className={field(false)} />
        </F>
        <F label="Interview password">
          <input name="password" required maxLength={40} autoComplete="off" spellCheck={false} placeholder="xxxx-xxxx" className={`${field(false)} font-mono`} />
        </F>
        {error && <Alert>{error}</Alert>}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-xs text-muted" suppressHydrationWarning>Open until {date(view.deadline)}</p>
          <button aria-busy={busy} type="submit" className={primary} disabled={busy}>Continue<Icon d={chevron} size={16} /></button>
        </div>
      </form>
    ),
    details: <Details initial={{ ...view.session?.prefill, ...(name ? { name } : {}) }} onDone={() => go(view.kind === "mcq" ? "ready" : "mic")} slug={view.slug} />,
    mic: (
      <div className="space-y-6">
        <Head title="Mic check" sub="Say something to test your microphone." />
        <MicCheck deviceId={deviceId} onDevice={setDeviceId} onError={setError}>
          {(heard) => (
            <>
              <p className="text-sm text-muted">
                {view.questions} question{view.questions === 1 ? "" : "s"} · {INTERVIEW.seconds / 60} min · one attempt, keep this tab open
              </p>
              {error && <Alert>{error}</Alert>}
              <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
                {!heard && <span className="text-xs text-muted">Waiting to hear you…</span>}
                <button aria-busy={busy} type="button" className={primary} disabled={!heard || busy} onClick={begin}>
                  {view.session?.status === "live" || error.startsWith("The connection dropped") ? "Rejoin interview" : "Start interview"}
                </button>
              </div>
            </>
          )}
        </MicCheck>
      </div>
    ),
    live: (
      <Live
        agent={agent}
        caption={caption}
        endsAt={endsAt}
        muted={muted}
        onUnmute={() => void room.current?.startAudio().then(() => setMuted(false))}
        onEnd={async () => (await ask({ title: "End the interview now?", body: "You can't restart it.", confirm: "End interview", danger: true })) && room.current?.disconnect()}
        onTimeUp={() => room.current?.disconnect()}
      />
    ),
    ready: (
      <div className="space-y-6">
        <Head title="Before you start" sub={`${view.title} at ${view.company}`} />
        <ul className="space-y-3 text-sm">
          {[
            [icons.file, screeningFacts("mcq", view.questions), "One correct answer per question."],
            [icons.clock, "Timed, one attempt", "The clock starts when you press Start and keeps running if you leave."],
            [icons.check, "Answers save as you go", "Move between questions freely. The test submits itself when time runs out."],
          ].map(([d, title, sub]) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted"><Icon d={d} size={16} /></span>
              <span><span className="block font-medium">{title}</span><span className="text-muted">{sub}</span></span>
            </li>
          ))}
        </ul>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end border-t border-border pt-5">
          <button aria-busy={busy} type="button" className={primary} disabled={busy} onClick={startTest}>Start test<Icon d={chevron} size={16} /></button>
        </div>
      </div>
    ),
    test: view.session?.test ? <McqTest slug={view.slug} test={view.session.test} onDone={() => go("done")} /> : null,
    done: (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success"><Icon d={icons.check} size={24} /></span>
        <h2 className="mt-5 font-display text-xl font-normal">{view.kind === "mcq" ? "Test submitted" : "Interview submitted"}</h2>
        <p className="mt-1 text-sm text-muted">Thanks. {view.company} will be in touch. You can close this tab.</p>
      </div>
    ),
    closed: (
      <div className="py-8 text-center">
        <h2 className="font-display text-xl font-normal">This interview has closed</h2>
        <p className="mt-1 text-sm text-muted" suppressHydrationWarning>It closed on {date(view.deadline)}.</p>
      </div>
    ),
  };

  return (
    <StepFrame
      title={KINDS[view.kind]}
      steps={STEPS[view.kind]}
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

function Details({ slug, initial, onDone }: { slug: string; initial: Partial<Profile>; onDone: () => void }) {
  const [p, setP] = useState<Record<string, string>>({ years: "0", notice: "30d", ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v ?? "")])) });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { missing } = cleanProfile(p);
  const bad = (k: string) => show && missing.includes(k);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setShow(true);
    if (missing.length) return;
    setBusy(true);
    const r = await onboard(slug, p).catch(() => ({ error: "Couldn't save. Try again." }));
    setBusy(false);
    if ("error" in r) return setError(r.error);
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Head title="Your details" sub="Shared with the hiring team." />
      <F label="Full name" bad={bad("name")}>
        <input value={p.name ?? ""} onChange={set("name")} maxLength={60} autoComplete="name" className={field(bad("name"))} />
      </F>
      <div className="grid gap-5 sm:grid-cols-2">
        <F label="Phone number" bad={bad("phone")}>
          <input value={p.phone ?? ""} onChange={set("phone")} type="tel" maxLength={30} autoComplete="tel" placeholder="+91 98765 43210" className={field(bad("phone"))} />
        </F>
        <F label="Current city" bad={bad("city")}>
          <input value={p.city ?? ""} onChange={set("city")} maxLength={60} autoComplete="address-level2" placeholder="Pune" className={field(bad("city"))} />
        </F>
      </div>
      <F label="Current or most recent role" bad={bad("role")}>
        <input value={p.role ?? ""} onChange={set("role")} maxLength={80} placeholder="Frontend Engineer at Acme, or Final-year B.Tech student" className={field(bad("role"))} />
      </F>
      <div className="grid gap-5 sm:grid-cols-2">
        <F label="Years of experience">
          <input value={p.years} onChange={set("years")} type="number" min={0} max={50} inputMode="numeric" className={field(false)} />
        </F>
        <F label="Notice period">
          <Select value={p.notice} onChange={(notice) => setP({ ...p, notice })} className={`${field(false)} bg-surface`} options={Object.entries(NOTICE).map(([value, label]) => ({ value, label }))} />
        </F>
      </div>
      <F label="LinkedIn or portfolio" hint="optional">
        <input value={p.link ?? ""} onChange={set("link")} type="url" maxLength={200} placeholder="https://" className={field(false)} />
      </F>
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end border-t border-border pt-5">
        <button aria-busy={busy} type="submit" className={primary} disabled={busy}>Continue<Icon d={chevron} size={16} /></button>
      </div>
    </form>
  );
}

/** Live input level from the chosen mic, plus a device picker. `children` gets whether we've heard the candidate yet. */
function MicCheck({ deviceId, onDevice, onError, children }: {
  deviceId: string;
  onDevice: (id: string) => void;
  onError: (e: string) => void;
  children: (heard: boolean) => React.ReactNode;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let ctx: AudioContext | undefined;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        setBlocked(false);
        onError("");
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId));
        ctx = new AudioContext();
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
        onError(e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it from the icon in your browser's address bar, then try again."
          : "We couldn't find a microphone. Connect one and try again.");
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, [deviceId, attempt, onError]);

  return (
    <>
      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-md border border-border ${heard ? "text-success" : "text-muted"}`}>
            <Icon d={mic} size={18} />
          </span>
          <div className="flex h-6 flex-1 items-end gap-1" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
            {Array.from({ length: 20 }, (_, i) => (
              <span key={i} className={`flex-1 rounded-sm transition-colors ${i < level * 20 ? "bg-success" : "bg-border"}`} style={{ height: `${30 + (i % 4) * 15}%` }} />
            ))}
          </div>
        </div>
        {devices.length > 1 && (
          <Select
            aria-label="Microphone"
            value={deviceId}
            onChange={onDevice}
            className={`${field(false)} bg-surface`}
            options={[{ value: "", label: "System default" }, ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))]}
          />
        )}
        {heard && <p className="text-sm text-success">We can hear you.</p>}
        {blocked && <button type="button" className={btnGhost} onClick={() => setAttempt((n) => n + 1)}>Try again</button>}
      </div>
      {children(heard)}
    </>
  );
}

function Live({ agent, caption, endsAt, muted, onUnmute, onEnd, onTimeUp }: {
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
      // The agent cuts the call at the limit too; this is the backstop
      if (l === 0) onTimeUp();
    }, 500);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => (clearInterval(t), removeEventListener("beforeunload", warn));
  }, [endsAt, onTimeUp]);

  const secs = Math.ceil(left / 1000);
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex w-full items-center justify-between border-b border-border pb-4 text-xs text-muted">
        <span className="flex items-center gap-2"><span className="size-2 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />Live</span>
        <span className={`tabular-nums ${endsAt && secs <= 30 ? "font-medium text-danger" : ""}`}>
          {endsAt ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} left` : "Starting…"}
        </span>
        {/* Screen readers hear the countdown once at each threshold, not every tick */}
        <span className="sr-only" aria-live="assertive">{secs <= 30 && secs > 0 ? "30 seconds left" : secs <= 60 && secs > 0 ? "One minute left" : ""}</span>
      </div>

      {/* Tuned at 64px and drawn at up to 2x density, so 1.5x stays sharp. It follows data-theme on its own. */}
      <div className="flex size-32 items-center justify-center" aria-hidden>
        <ThinkingOrb state={ORB[agent]} size={64} className="scale-150" />
      </div>

      <div className="min-h-24 w-full space-y-3" aria-live="polite">
        <p className="text-sm font-medium">{STATE_LABEL[agent]}</p>
        {caption.agent && <p className="text-base leading-relaxed text-balance">{caption.agent}</p>}
        {caption.you && <p className="text-sm text-muted">You: {caption.you}</p>}
      </div>

      {muted && (
        <button type="button" onClick={onUnmute} className={primary}>
          Tap to hear your interviewer
        </button>
      )}

      <button type="button" onClick={onEnd} className="inline-flex h-10 items-center gap-2 rounded-md border border-danger/50 px-4 text-sm font-medium text-danger transition-colors outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-ring">
        End interview
      </button>
    </div>
  );
}

const LETTERS = "ABCDEF";
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * One question at a time with a jump grid, like most online assessments. Each pick is saved right away (a reload
 * resumes here); at zero the test submits itself. The server holds the clock and the key, this only mirrors them.
 */
function McqTest({ slug, test, onDone }: { slug: string; test: { questions: McqPublic[]; answers: number[]; left: number }; onDone: () => void }) {
  const qs = test.questions;
  const [answers, setAnswers] = useState(test.answers);
  const [at, setAt] = useState(() => Math.max(0, test.answers.findIndex((a) => a < 0)));
  const [endsAt] = useState(() => Date.now() + test.left);
  const [left, setLeft] = useState(test.left);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const done = useRef(false);
  const q = qs[at];
  const answered = answers.filter((a) => a >= 0).length;

  async function submit() {
    if (done.current) return;
    done.current = true;
    setBusy(true);
    const r = await finishTest(slug).catch(() => ({ error: "Couldn't reach the server. Check your connection and try again." }));
    if ("error" in r) return (done.current = false, setBusy(false), setError(r.error));
    onDone();
  }

  const tick = useEffectEvent(() => {
    const l = endsAt - Date.now();
    setLeft(l);
    if (l <= 0) void submit();
  });
  useEffect(() => {
    const t = setInterval(tick, 500);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => (clearInterval(t), removeEventListener("beforeunload", warn));
  }, []);

  async function pick(i: number) {
    const v = answers[at] === i ? -1 : i; // clicking the chosen option again clears it
    setAnswers((a) => a.map((x, k) => (k === at ? v : x)));
    setError("");
    const r = await answer(slug, at, v).catch(() => ({ error: "That answer didn't save. Check your connection and pick it again." }));
    if (!("error" in r)) return;
    if (r.error.startsWith("Time's up") || r.error.includes("submitted")) return onDone();
    setError(r.error);
  }

  async function confirmSubmit() {
    const open = qs.length - answered;
    const ok = await ask({
      title: "Submit your test?",
      body: open ? `${open} question${open === 1 ? " is" : "s are"} unanswered. You can't change answers after submitting.` : "You can't change answers after submitting.",
      confirm: "Submit",
    });
    if (ok) void submit();
  }

  const low = left <= 60_000;
  return (
    <div className="space-y-6">
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Question <span className="font-medium text-foreground tabular-nums">{at + 1}</span> of {qs.length}</span>
          <span className={`flex items-center gap-1.5 tabular-nums ${low ? "font-medium text-danger" : ""}`} suppressHydrationWarning>
            <Icon d={icons.clock} size={14} />{clock(left)}
          </span>
          <span className="sr-only" aria-live="assertive">{low && left > 0 ? "One minute left" : ""}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Answered" aria-valuemin={0} aria-valuemax={qs.length} aria-valuenow={answered}>
          <div className="h-full bg-foreground transition-[width]" style={{ width: `${(answered / qs.length) * 100}%` }} />
        </div>
      </div>

      <fieldset key={at} className="space-y-4">
        <legend className="mb-4 text-base leading-relaxed font-medium whitespace-pre-wrap break-words">{q.q}</legend>
        <div className="space-y-2.5" role="radiogroup" aria-label={`Question ${at + 1} options`}>
          {q.options.map((o, i) => {
            const on = answers[at] === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => pick(i)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-foreground bg-surface" : "border-border hover:bg-surface-hover"}`}
              >
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-medium ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted"}`}>{LETTERS[i]}</span>
                <span className="min-w-0 pt-0.5 break-words">{o}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && <Alert>{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <button type="button" className={btnGhost} disabled={at === 0} onClick={() => setAt(at - 1)}>Previous</button>
        {at < qs.length - 1 ? (
          <button type="button" className={primary} onClick={() => setAt(at + 1)}>Next<Icon d={chevron} size={16} /></button>
        ) : (
          <button aria-busy={busy} type="button" className={primary} disabled={busy} onClick={confirmSubmit}>Submit test</button>
        )}
      </div>

      <nav aria-label="All questions" className="border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span>{answered} of {qs.length} answered</span>
          {at < qs.length - 1 && <button type="button" className="font-medium text-foreground hover:underline" disabled={busy} onClick={confirmSubmit}>Submit early</button>}
        </div>
        <ol className="flex flex-wrap gap-1.5">
          {qs.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                aria-label={`Question ${i + 1}${answers[i] >= 0 ? ", answered" : ""}`}
                aria-current={i === at ? "step" : undefined}
                onClick={() => setAt(i)}
                className={`size-9 rounded-md border text-xs tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${i === at ? "border-foreground font-medium" : "border-border"} ${answers[i] >= 0 ? "bg-foreground/10 text-foreground" : "text-muted hover:bg-surface-hover"}`}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
