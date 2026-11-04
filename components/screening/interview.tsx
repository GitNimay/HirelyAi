"use client";

import type { RemoteParticipant, Room } from "livekit-client";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";
import { beginTest, onboard, start, verify, warm } from "@/app/interview/actions";
import type { CandidateView } from "@/lib/screening/interview";
import { cleanProfile, INTERVIEW, KINDS, NOTICE, screeningFacts, type Profile } from "@/lib/screening/fields";
import { JOB_TYPES, LEVELS, WORKPLACES } from "@/lib/job-fields";
import { TurnstileField } from "../human-check";
import { Alert, Head, primary, StepFrame, ThemeToggle } from "../onboarding";
import { F, input } from "../resume-editor";
import { ask, Select } from "../kit";
import { btnGhost, Icon, icons } from "../ui";
import { McqTest } from "./mcq";
import { CAPTURE, Live, MicCheck, type AgentState } from "./voice";

type Step = "gate" | "details" | "mic" | "brief" | "live" | "ready" | "test" | "done" | "closed";
const STEPS = {
  voice: ["Sign in", "Your details", "Mic check", "Overview", "Interview"],
  mcq: ["Sign in", "Your details", "Instructions", "Test"],
};
const INDEX: Record<Step, number> = {
  gate: 0,
  details: 1,
  mic: 2,
  brief: 3,
  live: 4,
  ready: 2,
  test: 3,
  done: 5,
  closed: 0,
};
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
 * The candidate's side, no account needed: their own candidate ID + password from the invite → a few details → then either
 * a mic check and a live voice call with the AI interviewer (LiveKit, capped at five minutes; the agent reports the
 * transcript), or instructions and a timed MCQ test whose picks save as they're made.
 */
export function Interview({
  view,
  turnstile,
}: {
  view: CandidateView;
  turnstile: { sitekey: string; action: string };
}) {
  const router = useRouter();
  const [local, setLocal] = useState<Step | null>(null);
  const step = local ?? stepOf(view);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [agent, setAgent] = useState<AgentState>("connecting");
  const [caption, setCaption] = useState({ agent: "", you: "" });
  const [endsAt, setEndsAt] = useState(0); // 0 until the interviewer is in the call
  const [muted, setMuted] = useState(false); // the browser blocked autoplay (Safari, mostly)
  const [agreed, setAgreed] = useState(false); // read the overview
  const room = useRef<Room | null>(null);
  const go = (s: Step | null) => (setError(""), setLocal(s), window.scrollTo({ top: 0 }));
  // Just finished (not a revisit of the done screen): the browser event a PostHog survey can be triggered by
  const finished = () => (posthog.capture("interview finished", { kind: view.kind }), go("done"));

  useEffect(() => () => void room.current?.disconnect(), []);
  // Get the interviewer into the room while the candidate checks their mic (hides the agent's cold start)
  // and fetch the call library now rather than on the Start click
  useEffect(() => {
    if (step === "mic" && view.kind === "voice") void (warm(view.slug), import("livekit-client")); // waits through the overview too
  }, [step, view.kind, view.slug]);

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
      const rm = new Room({ audioCaptureDefaults: { deviceId: deviceId || undefined, ...CAPTURE } });
      rm.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach());
      });
      // The clock starts once the interviewer is ready, not on the click: dispatch can take a while
      const sync = (p: RemoteParticipant) => {
        if (!p.isAgent) return;
        const s = (p.attributes["lk.agent.state"] as AgentState | undefined) ?? "initializing";
        setAgent(s);
        if (s === "listening" || s === "thinking" || s === "speaking")
          setEndsAt((e) => e || Date.now() + r.seconds * 1000);
      };
      rm.on(RoomEvent.ParticipantConnected, sync);
      rm.on(RoomEvent.ParticipantAttributesChanged, (_, p) => p instanceof RemoteParticipant && sync(p));
      rm.on(RoomEvent.AudioPlaybackStatusChanged, () => setMuted(!rm.canPlaybackAudio));
      rm.on(RoomEvent.Disconnected, (reason) => {
        room.current = null;
        audioSession("auto");
        // We hung up, or the agent ended the call (it deletes the room). Anything else is a dropped connection.
        if (reason === DisconnectReason.CLIENT_INITIATED || reason === DisconnectReason.ROOM_DELETED) return finished();
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

  // A dropped call skips the overview: they've read it and the clock is running
  const rejoin = view.session?.status === "live" || error.startsWith("The connection dropped");
  const j = view.job;

  const card: Record<Step, React.ReactNode> = {
    gate: <Gate view={view} turnstile={turnstile} onDone={() => (go(null), router.refresh())} />,
    details: (
      <Details
        initial={view.session?.prefill ?? {}}
        onDone={() => go(view.kind === "mcq" ? "ready" : "mic")}
        slug={view.slug}
      />
    ),
    mic: (
      <div className="space-y-6">
        <Head title="Mic check" sub="Say something to test your microphone." />
        <MicCheck deviceId={deviceId} onDevice={setDeviceId} onError={setError}>
          {(heard) => (
            <>
              <p className="text-sm text-muted">
                {view.questions} question{view.questions === 1 ? "" : "s"} · {INTERVIEW.seconds / 60} min · one attempt,
                keep this tab open
              </p>
              {error && <Alert>{error}</Alert>}
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                {!heard && <span className="text-xs text-muted">Waiting to hear you…</span>}
                {rejoin ? (
                  <button aria-busy={busy} type="button" className={primary} disabled={!heard || busy} onClick={begin}>
                    Rejoin interview
                  </button>
                ) : (
                  <button type="button" className={primary} disabled={!heard} onClick={() => go("brief")}>
                    Continue
                    <Icon d={chevron} size={16} />
                  </button>
                )}
              </div>
            </>
          )}
        </MicCheck>
      </div>
    ),
    brief: (
      <div className="space-y-6 text-sm leading-relaxed">
        <Head title="Before you start" sub={`${view.title} at ${view.company}`} />
        <section className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">The role</h3>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted">
            <li>
              <strong className="font-medium">{view.title}</strong> at{" "}
              <strong className="font-medium">{view.company}</strong>
            </li>
            <li>
              <strong className="font-medium">Pay:</strong>{" "}
              {j.salary || <span className="text-muted">Not disclosed</span>}
            </li>
            <li>
              <strong className="font-medium">Location:</strong>{" "}
              {j.location || (j.workplace === "remote" ? "Anywhere" : "Not specified")} · {WORKPLACES[j.workplace]}
            </li>
            <li>
              <strong className="font-medium">Level:</strong> {LEVELS[j.level]} · {JOB_TYPES[j.type]}
            </li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">How it works</h3>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted">
            <li>
              An <strong className="font-medium">AI interviewer</strong> asks{" "}
              <strong className="font-medium">
                {view.questions} question{view.questions === 1 ? "" : "s"}
              </strong>
              , one at a time. Answer out loud, like a phone call.
            </li>
            <li>
              The call lasts <strong className="font-medium">{INTERVIEW.seconds / 60} minutes</strong>. The timer starts
              when the interviewer joins.
            </li>
            <li>
              <strong className="font-medium">One attempt only.</strong> If your connection drops, you can rejoin.
            </li>
            <li>{view.company}&apos;s hiring team reviews your answers.</li>
          </ul>
        </section>
        <p className="rounded-md border-l-2 border-link bg-surface px-3 py-2">
          Find a <strong className="font-medium">quiet spot</strong> and{" "}
          <strong className="font-medium">keep this tab open</strong> until the call ends.
        </p>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-foreground"
          />
          <span>I&apos;ve read this and I&apos;m ready to start.</span>
        </label>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <button type="button" className={btnGhost} onClick={() => go("mic")}>
            Back
          </button>
          <button aria-busy={busy} type="button" className={primary} disabled={!agreed || busy} onClick={begin}>
            Start interview
          </button>
        </div>
      </div>
    ),
    live: (
      <Live
        agent={agent}
        caption={caption}
        endsAt={endsAt}
        muted={muted}
        onUnmute={() => void room.current?.startAudio().then(() => setMuted(false))}
        onEnd={async () =>
          (await ask({
            title: "End the interview now?",
            body: "You can't restart it.",
            confirm: "End interview",
            danger: true,
          })) && room.current?.disconnect()
        }
        onTimeUp={() => room.current?.disconnect()}
      />
    ),
    ready: (
      <div className="space-y-6">
        <Head title="Before you start" sub={`${view.title} at ${view.company}`} />
        <ul className="space-y-3 text-sm">
          {[
            [icons.file, screeningFacts("mcq", view.questions), "One correct answer per question."],
            [
              icons.clock,
              "Timed, one attempt",
              "The clock starts when you press Start and keeps running if you leave.",
            ],
            [
              icons.check,
              "Answers save as you go",
              "Move between questions freely. The test submits itself when time runs out.",
            ],
          ].map(([d, title, sub]) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted">
                <Icon d={d} size={16} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{title}</span>
                <span className="text-muted">{sub}</span>
              </span>
            </li>
          ))}
        </ul>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end border-t border-border pt-5">
          <button aria-busy={busy} type="button" className={primary} disabled={busy} onClick={startTest}>
            Start test
            <Icon d={chevron} size={16} />
          </button>
        </div>
      </div>
    ),
    test: view.session?.test ? <McqTest slug={view.slug} test={view.session.test} onDone={finished} /> : null,
    done: (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
          <Icon d={icons.check} size={24} />
        </span>
        <h2 className="mt-5 font-display text-xl font-normal">
          {view.kind === "mcq" ? "Test submitted" : "Interview submitted"}
        </h2>
        <p className="mt-1 text-sm text-muted">Thanks. {view.company} will be in touch. You can close this tab.</p>
      </div>
    ),
    closed: (
      <div className="py-8 text-center">
        <h2 className="font-display text-xl font-normal">This interview has closed</h2>
        <p className="mt-1 text-sm text-muted" suppressHydrationWarning>
          It closed on {date(view.deadline)}.
        </p>
      </div>
    ),
  };

  return (
    <StepFrame
      title={KINDS[view.kind]}
      steps={STEPS[view.kind as keyof typeof STEPS]}
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

export function Details({ slug, initial, onDone }: { slug: string; initial: Partial<Profile>; onDone: () => void }) {
  const [p, setP] = useState<Record<string, string>>({
    years: "0",
    notice: "30d",
    ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v ?? "")])),
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { missing } = cleanProfile(p);
  const bad = (k: string) => show && missing.includes(k);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setP({ ...p, [k]: e.target.value });

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
        <input
          value={p.name ?? ""}
          onChange={set("name")}
          maxLength={60}
          autoComplete="name"
          className={field(bad("name"))}
        />
      </F>
      <div className="grid gap-5 sm:grid-cols-2">
        <F label="Phone number" bad={bad("phone")}>
          <input
            value={p.phone ?? ""}
            onChange={set("phone")}
            type="tel"
            maxLength={30}
            autoComplete="tel"
            placeholder="+91 98765 43210"
            className={field(bad("phone"))}
          />
        </F>
        <F label="Current city" bad={bad("city")}>
          <input
            value={p.city ?? ""}
            onChange={set("city")}
            maxLength={60}
            autoComplete="address-level2"
            placeholder="Pune"
            className={field(bad("city"))}
          />
        </F>
      </div>
      <F label="Current or most recent role" bad={bad("role")}>
        <input
          value={p.role ?? ""}
          onChange={set("role")}
          maxLength={80}
          placeholder="Frontend Engineer at Acme, or Final-year B.Tech student"
          className={field(bad("role"))}
        />
      </F>
      <div className="grid gap-5 sm:grid-cols-2">
        <F label="Years of experience">
          <input
            value={p.years}
            onChange={set("years")}
            type="number"
            min={0}
            max={50}
            inputMode="numeric"
            className={field(false)}
          />
        </F>
        <F label="Notice period">
          <Select
            value={p.notice}
            onChange={(notice) => setP({ ...p, notice })}
            className={`${field(false)} bg-surface`}
            options={Object.entries(NOTICE).map(([value, label]) => ({ value, label }))}
          />
        </F>
      </div>
      <F label="LinkedIn or portfolio" hint="optional">
        <input
          value={p.link ?? ""}
          onChange={set("link")}
          type="url"
          maxLength={200}
          placeholder="https://"
          className={field(false)}
        />
      </F>
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end border-t border-border pt-5">
        <button aria-busy={busy} type="submit" className={primary} disabled={busy}>
          Continue
          <Icon d={chevron} size={16} />
        </button>
      </div>
    </form>
  );
}

/** Live input level from the chosen mic, plus a device picker. `children` gets whether they may start: we heard them, or a quiet mic had 10 s. */

/** Sign-in for every screening kind: the candidate ID and password from the applicant's own invite email. */
export function Gate({
  view,
  turnstile,
  onDone,
}: {
  view: CandidateView;
  turnstile: { sitekey: string; action: string };
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [human, setHuman] = useState(""); // Turnstile token
  const [resetHuman, setResetHuman] = useState(0);
  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    const r = await verify(view.slug, { ...fd, token: human }).catch(() => ({
      error: "Couldn't reach the server. Check your connection.",
    }));
    setBusy(false);
    if ("error" in r) return (setError(r.error), setHuman(""), setResetHuman((n) => n + 1)); // the token is spent either way
    onDone(); // the refreshed view knows the session
  }
  return (
    <form onSubmit={signIn} className="space-y-5">
      <Head title={`${KINDS[view.kind]} for ${view.title}`} sub="Use the details from your invitation email." />
      {/* Voice/MCQ invites from before candidate IDs used the application email (see legacySignIn); AI ones had a link */}
      <F
        label="Candidate ID"
        hint={view.kind === "ai" ? undefined : "invited before 4 Nov? the email you applied with"}
      >
        <input
          name="login"
          required
          maxLength={254}
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          placeholder="XXXXXXXX"
          className={`${field(false)} font-mono uppercase`}
        />
      </F>
      <F label="Password">
        <input
          name="password"
          required
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          placeholder="xxxx-xxxx"
          className={`${field(false)} font-mono`}
        />
      </F>
      <TurnstileField {...turnstile} onToken={setHuman} reset={resetHuman} />
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-xs text-muted" suppressHydrationWarning>
          Open until {date(view.deadline)}
        </p>
        <button aria-busy={busy} type="submit" className={primary} disabled={busy || !human}>
          Continue
          <Icon d={chevron} size={16} />
        </button>
      </div>
    </form>
  );
}
