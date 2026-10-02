"use client";

import type { Room } from "livekit-client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { onboard, start, verify } from "@/app/interview/actions";
import type { CandidateView } from "@/lib/interview";
import { cleanProfile, INTERVIEW, NOTICE, type Profile } from "@/lib/interview-fields";
import { Head, primary, StepFrame } from "./onboarding";
import { F, input } from "./resume-editor";
import { ask, Select } from "./kit";
import { btnGhost, Icon, icons } from "./ui";

type Step = "gate" | "details" | "mic" | "live" | "done" | "closed";
type AgentState = "connecting" | "initializing" | "listening" | "thinking" | "speaking";
const STEPS = ["Sign in", "Your details", "Mic check", "Interview"];
const INDEX: Record<Step, number> = { gate: 0, details: 1, mic: 2, live: 3, done: 4, closed: 0 };
const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Connecting…", initializing: "Your interviewer is joining…", listening: "Listening", thinking: "Thinking…", speaking: "Speaking",
};
const mic = icons.mic;
const chevron = "m9 18 6-6-6-6";
const field = (bad: boolean) => `${input} h-10 ${bad ? "border-danger" : "border-border"}`;
const date = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function stepOf(v: CandidateView): Step {
  const s = v.session?.status;
  if (s === "processing" || s === "done" || s === "failed") return "done";
  if (s === "live") return "mic"; // dropped mid-call: rejoin
  if (!v.open) return "closed";
  return s === "onboarded" ? "mic" : s === "verified" ? "details" : "gate";
}

/**
 * The candidate's side, no account needed: shared password + application email → a few details → mic check →
 * a live voice call with the AI interviewer (LiveKit), capped at five minutes. The agent reports the transcript.
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
  const [startedAt, setStartedAt] = useState(0);
  const room = useRef<Room | null>(null);
  const go = (s: Step | null) => (setError(""), setLocal(s), window.scrollTo({ top: 0 }));

  useEffect(() => () => void room.current?.disconnect(), []);

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

  /** Runs on the Start click, so the browser lets the interviewer's audio play. */
  async function begin() {
    setBusy(true);
    setError("");
    try {
      const r = await start(view.slug);
      if ("error" in r) throw new Error(r.error);
      const { DisconnectReason, Room, RoomEvent, Track } = await import("livekit-client");
      const rm = new Room({ audioCaptureDefaults: { deviceId: deviceId || undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      rm.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach());
      });
      rm.on(RoomEvent.ParticipantConnected, (p) => p.isAgent && setAgent("initializing"));
      rm.on(RoomEvent.ParticipantAttributesChanged, (_, p) => {
        const s = p.attributes["lk.agent.state"] as AgentState | undefined;
        if (s) setAgent(s);
      });
      rm.on(RoomEvent.Disconnected, (reason) => {
        room.current = null;
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
      await rm.startAudio();
      room.current = rm;
      setStartedAt(r.startedAt);
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
        <Head title={`Voice interview for ${view.title}`} sub={`${view.company} invited you to a short AI voice interview. Sign in with the details from your invitation email.`} />
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
        <p className="text-[13px] text-muted" suppressHydrationWarning>Open until {date(view.deadline)}.</p>
        <div className="flex justify-end">
          <button aria-busy={busy} type="submit" className={primary} disabled={busy}>Continue<Icon d={chevron} size={16} /></button>
        </div>
      </form>
    ),
    details: <Details initial={{ ...view.session?.prefill, ...(name ? { name } : {}) }} onDone={() => go("mic")} slug={view.slug} />,
    mic: (
      <div className="space-y-6">
        <Head title="Check your microphone" sub="Say something. When the bar moves, you're good to go." />
        <MicCheck deviceId={deviceId} onDevice={setDeviceId} onError={setError}>
          {(heard) => (
            <>
              <ul className="space-y-2.5 text-sm">
                {[
                  `${view.questions} question${view.questions === 1 ? "" : "s"}, ${INTERVIEW.seconds / 60} minutes at most. The call ends on its own when time is up.`,
                  "Find a quiet place. Speak naturally, like on a phone call.",
                  "You can ask the interviewer to repeat or clarify a question.",
                  "You get one attempt, so keep this tab open until the end.",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5 text-muted"><Icon d={icons.check} size={16} className="mt-0.5 shrink-0 text-success" />{t}</li>
                ))}
              </ul>
              {error && <Alert>{error}</Alert>}
              <div className="flex items-center justify-end gap-3">
                {!heard && <span className="text-[13px] text-muted">Waiting to hear you…</span>}
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
        startedAt={startedAt}
        onEnd={async () => (await ask({ title: "End the interview now?", body: "You can't restart it.", confirm: "End interview", danger: true })) && room.current?.disconnect()}
        onTimeUp={() => room.current?.disconnect()}
      />
    ),
    done: (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><Icon d={icons.check} size={28} /></span>
        <h2 className="mt-6 text-xl font-semibold tracking-tight">Interview submitted</h2>
        <p className="mt-1 max-w-sm text-sm text-muted">Thanks for your time. The hiring team at {view.company} will review your interview and get back to you. You can close this tab.</p>
      </div>
    ),
    closed: (
      <div className="py-8 text-center">
        <h2 className="text-lg font-semibold tracking-tight">This interview has closed</h2>
        <p className="mt-1 text-sm text-muted" suppressHydrationWarning>
          The deadline for {view.title} at {view.company} was {date(view.deadline)}.
        </p>
      </div>
    ),
  };

  return (
    <StepFrame
      title="Voice interview"
      steps={STEPS}
      current={INDEX[step]}
      stepKey={step}
      action={<span className="max-w-[50%] truncate text-sm text-muted">{view.company}</span>}
    >
      {card[step]}
    </StepFrame>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{children}</p>;
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
      <Head title="A few details first" sub="Your interviewer uses these to tailor the conversation. The hiring team sees them with your interview." />
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
      <div className="flex justify-end pt-1">
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
      <div className="space-y-4 rounded-lg border border-border bg-background p-4">
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
        {heard && <p className="text-[13px] text-success">We can hear you.</p>}
        {blocked && <button type="button" className={btnGhost} onClick={() => setAttempt((n) => n + 1)}>Try again</button>}
      </div>
      {children(heard)}
    </>
  );
}

function Live({ agent, caption, startedAt, onEnd, onTimeUp }: {
  agent: AgentState;
  caption: { agent: string; you: string };
  startedAt: number;
  onEnd: () => void;
  onTimeUp: () => void;
}) {
  const end = startedAt + INTERVIEW.seconds * 1000;
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, end - Date.now());
      setLeft(l);
      // The agent cuts the call at the limit too; this is the backstop
      if (l === 0) onTimeUp();
    }, 500);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => (clearInterval(t), removeEventListener("beforeunload", warn));
  }, [end, onTimeUp]);

  const secs = Math.ceil(left / 1000);
  const speaking = agent === "speaking";
  return (
    <div className="flex flex-col items-center gap-8 py-4 text-center">
      <div className="flex w-full items-center justify-between text-[13px] text-muted">
        <span className="flex items-center gap-2"><span className="size-2 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />Live</span>
        <span className={`tabular-nums ${secs <= 30 ? "font-medium text-danger" : ""}`}>
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} left
        </span>
        {/* Screen readers hear the countdown once at each threshold, not every tick */}
        <span className="sr-only" aria-live="assertive">{secs <= 30 && secs > 0 ? "30 seconds left" : secs <= 60 && secs > 0 ? "One minute left" : ""}</span>
      </div>

      <div className="relative flex size-40 items-center justify-center" aria-hidden>
        {speaking && <span className="absolute inset-2 animate-ping rounded-full bg-foreground/10 motion-reduce:animate-none" />}
        <span
          className={`size-28 rounded-full transition-all duration-300 ${speaking ? "scale-110 bg-foreground" : agent === "thinking" ? "animate-pulse bg-foreground/50" : agent === "listening" ? "bg-foreground/80 ring-4 ring-success/40" : "bg-foreground/20"}`}
        />
      </div>

      <div className="min-h-24 w-full space-y-3" aria-live="polite">
        <p className="text-sm font-medium">{STATE_LABEL[agent]}</p>
        {caption.agent && <p className="text-base leading-relaxed text-balance">{caption.agent}</p>}
        {caption.you && <p className="text-[13px] text-muted">You: {caption.you}</p>}
      </div>

      <button type="button" onClick={onEnd} className="inline-flex h-10 items-center gap-2 rounded-md border border-danger/50 px-4 text-sm font-medium text-danger transition-colors outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-ring">
        End interview
      </button>
    </div>
  );
}
