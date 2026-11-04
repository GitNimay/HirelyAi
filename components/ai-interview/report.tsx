"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decideInterview, removeRecordings, retryInterview, reviewFlag, shareInterview } from "@/app/dashboard/actions";
import type { AiReportData } from "@/lib/ai-interview/session";
import { RECOMMENDATIONS, type Evidence } from "@/lib/ai-interview/evaluator";
import { phaseLabel, type PhaseId } from "@/lib/ai-interview/harness";
import { ENVS, LANGUAGES, type Language, type RunResult } from "@/lib/ai-interview/workspace";
import { ThemeToggle } from "../account-menu";
import { Logo } from "../auth";
import { ask, Modal, toast } from "../kit";
import { Avatar, btnGhost, btnOutline, btnPrimary, Icon, icons } from "../ui";

const BoardSnapshot = dynamic(() => import("./workspace").then((m) => m.BoardSnapshot), {
  ssr: false,
  loading: () => <div className="aspect-[16/9] w-full bg-white" />,
});

// Glyphs the shared icon set doesn't have (same 24-unit stroke style)
const glyph = {
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z",
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  cross: "M18 6 6 18M6 6l12 12",
  minus: "M5 12h14",
};

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`;
const tone = (s: number | null) =>
  s === null ? "text-muted" : s >= 4 ? "text-success" : s >= 3 ? "text-foreground" : "text-danger";
const REC_TONE = {
  strong_hire: "text-success",
  hire: "text-success",
  lean_no: "text-foreground",
  no_hire: "text-danger",
};
const SIGNALS: Record<string, string> = {
  tab_switch: "Tab switches",
  focus_lost: "Window lost focus",
  fullscreen_exit: "Full-screen exits",
  extra_monitor: "Extra monitor",
  face_absent: "Face not visible",
  multiple_faces: "Multiple faces",
  camera_off: "Camera off",
  screen_share_stopped: "Screen share stopped",
  paste: "Large pastes",
  editor_paste: "Pasted into the code editor",
};
const ENDED = { completed: "Completed", candidate: "Ended by candidate", abandoned: "Abandoned" };
const CLAIM = {
  verified: { label: "Verified", tone: "text-success", d: icons.check },
  vague: { label: "Vague", tone: "text-foreground", d: glyph.minus },
  contradicted: { label: "Contradicted", tone: "text-danger", d: glyph.cross },
  not_reached: { label: "Not reached", tone: "text-muted", d: glyph.minus },
} as const;
const DIFFICULTY: Record<string, string> = { easy: "text-success", medium: "text-foreground", hard: "text-danger" };
const DECISIONS = { advance: "Advance", hold: "Hold", reject: "Reject" } as const;
const KIND_LABEL = {
  transcript: "Said",
  code: "Code",
  run: "Test run",
  whiteboard: "Whiteboard",
  note: "Interviewer note",
} as const;

type Run = AiReportData["runs"][number];
const resultOf = (r: Run) => r.result as RunResult & { final?: boolean };

/** A titled block of the report. Space separates sections; a hairline sits under each heading. */
function Section({
  id,
  title,
  meta,
  action,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 ${className}`}>
      <div className="mb-4 flex min-h-8 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="text-base font-medium">
          {title}
          {meta && <span className="ml-2 text-sm font-normal text-muted">{meta}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Overall score as a ring: the arc is the 1-5 score's share, the number sits inside. */
function ScoreRing({ score }: { score: number | null }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const share = score === null ? 0 : Math.min(1, Math.max(0, (score - 1) / 4));
  return (
    <div className={`relative size-24 shrink-0 ${tone(score)}`}>
      <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${share * c} ${c}`}
        />
      </svg>
      <p className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-2xl font-medium tabular-nums">{score?.toFixed(1) ?? "–"}</span>
        <span className="mt-1 text-xs text-muted">of 5</span>
      </p>
    </div>
  );
}

/** A 1-5 score as five steps: reads at a glance and prints in plain ink. */
function Meter({ score, label }: { score: number | null; label: string }) {
  return (
    <span className={`flex gap-1 ${tone(score)}`} role="img" aria-label={`${label}: ${score ?? "not assessed"} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-5 rounded-full ${score !== null && i <= score ? "bg-current" : "bg-border"}`}
        />
      ))}
    </span>
  );
}

/**
 * The AI interview report, modelled on HackerRank Chakra's: the verdict first (score, recommendation, summary), then
 * the numbers that back it (telemetry, competencies with evidence), then each round's work (resume claims, the final
 * whiteboard, the problem, code and tests), then integrity. Opens full screen, outside the app shell, like the room.
 *
 * Access: the poster sees everything and decides; a share link shows scores and work to anyone, and the recording
 * and transcript to signed-in members only. Download prints a light A4 layout (globals.css) the browser saves as PDF.
 */
export function AiReportView({ data, shareKey }: { data: AiReportData; shareKey?: string }) {
  const rep = data.report;
  const ai = rep?.ai;
  const owner = data.access === "owner";
  const full = data.access !== "public";
  const start = ai?.startedAt ?? data.startedAt ?? data.flags[0]?.at ?? 0;
  const end = data.endedAt ?? data.phases.at(-1)?.end ?? start;
  const [t, setT] = useState(start);
  const [track, setTrack] = useState<"cam" | "screen">("cam");
  const [transcript, setTranscript] = useState(false);
  const player = useRef<HTMLVideoElement>(null);

  const segments = data.segments.filter((s) => s.track === track);
  const segment = segments.findLast((s) => s.start <= t) ?? segments[0];
  const canPlay = full && data.segments.length > 0 && !data.mediaDeleted;
  const signIn = shareKey ? `/sign-in?next=${encodeURIComponent(`/r/${shareKey}`)}` : "/sign-in";

  /** Jumps the recording (and the transcript highlight) to an absolute time. */
  function seek(ms: number) {
    setT(ms);
    const seg = segments.findLast((s) => s.start <= ms);
    const v = player.current;
    document.getElementById("recording")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!seg || !v) return;
    if (seg !== segment)
      v.addEventListener(
        "loadedmetadata",
        () => ((v.currentTime = (ms - seg.start) / 1000), void v.play().catch(() => {})),
        { once: true },
      );
    else {
      v.currentTime = (ms - seg.start) / 1000;
      void v.play().catch(() => {});
    }
  }

  // Print opens the details marked for it (problem statements), then puts them back
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>("details[data-print-open]:not([open])")];
      opened.forEach((d) => (d.open = true));
    };
    const after = () => opened.forEach((d) => (d.open = false));
    addEventListener("beforeprint", before);
    addEventListener("afterprint", after);
    return () => (removeEventListener("beforeprint", before), removeEventListener("afterprint", after));
  }, []);

  const finalHidden = data.runs.map(resultOf).findLast((r) => r.suite === "hidden");
  const finalVisible = data.runs.map(resultOf).findLast((r) => r.suite === "visible");
  const tests = finalHidden ?? finalVisible;
  const claims = ai?.claims ?? [];
  const verified = claims.filter((c) => c.status === "verified").length;
  const facts = ai?.integrity.facts;
  const openSignals = ai?.integrity.signals.filter((s) => !data.dismissed.includes(s.signal)) ?? [];
  const integrity = !ai ? null : openSignals.length ? ai.integrity.level : "none";
  // The whiteboard sits under the round it was drawn in (Technical now; older interviews drew in Design or Experience)
  const boardPhase = (["technical", "design", "resume"] as const).find((p) => ai?.sections.some((s) => s.phase === p));
  const date = data.startedAt
    ? new Date(data.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  const recording = (
    <Recording
      data={data}
      full={full}
      signIn={signIn}
      shareKey={shareKey}
      track={track}
      setTrack={setTrack}
      segment={segment}
      player={player}
      onTime={setT}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground print:block print:min-h-0">
      <TopBar
        data={data}
        full={full}
        signIn={signIn}
        onTranscript={() => setTranscript(true)}
        title={`${data.candidate.name} – AI interview report`}
      />

      <main
        id="main"
        className="mx-auto w-full max-w-5xl space-y-12 px-4 py-8 sm:px-8 sm:py-12 print:max-w-none print:space-y-8 print:p-0"
      >
        {/* Print-only masthead: the top bar is hidden on paper */}
        <div className="hidden items-center justify-between border-b border-border pb-3 text-xs text-muted print:flex">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <img src="/logo-light.png" width={18} height={18} alt="" />
            Hire Excellence
          </span>
          <span>AI interview report</span>
        </div>

        {/* Verdict */}
        <section className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center print:grid-cols-[1fr_auto] print:items-center">
          <div className="min-w-0 space-y-5">
            <div className="flex items-center gap-4">
              <Avatar name={data.candidate.name} src={data.candidate.imageUrl ?? undefined} size={56} />
              <div className="min-w-0">
                <h1 className="truncate font-display text-3xl font-normal tracking-tight">{data.candidate.name}</h1>
                <p className="truncate text-sm text-muted">
                  {data.job.title} · {data.job.company}
                </p>
              </div>
            </div>
            {rep?.summary && (
              <p className="max-w-[62ch] text-[15px] leading-relaxed text-foreground/90">{rep.summary}</p>
            )}
            <p className="text-xs text-muted" suppressHydrationWarning>
              AI interview{date ? ` · ${date}` : ""}
              {end > start ? ` · ${minutes(end - start)}` : ""}
              {facts && ` · ${ENDED[facts.ended]}${facts.fallback ? ", switched to text chat after voice failed" : ""}`}
              {facts?.reconnects ? ` · ${facts.reconnects} reconnect${facts.reconnects > 1 ? "s" : ""}` : ""}
            </p>
          </div>
          {ai && (
            <div className="flex items-center gap-5 md:flex-col md:items-center md:gap-3 print:flex-col print:items-center print:gap-3">
              <ScoreRing score={ai.overall} />
              {ai.recommendation && (
                <p
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium ${REC_TONE[ai.recommendation]}`}
                >
                  <Icon
                    d={ai.recommendation === "strong_hire" || ai.recommendation === "hire" ? icons.check : glyph.cross}
                    size={14}
                  />
                  {RECOMMENDATIONS[ai.recommendation]}
                </p>
              )}
              <p className="text-xs text-muted">AI-generated: you decide</p>
              {!!ai.incomplete?.length && (
                <p className="max-w-[18rem] text-center text-xs text-danger">
                  Incomplete assessment: {ai.incomplete.join(", ")} not assessed
                </p>
              )}
            </div>
          )}
        </section>

        {!rep ? (
          <Section title="Evaluation">
            <Pending status={data.status} owner={owner} jobId={data.jobId} applicantId={data.applicantId} />
          </Section>
        ) : null}
        {!rep && recording}
        {rep && (
          <>
            {/* Telemetry: one strip, the numbers that back the verdict */}
            <section aria-label="Interview at a glance" className="space-y-3">
              <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-border sm:grid-cols-4 print:grid-cols-4">
                {(
                  [
                    ["Duration", end > start ? mmss(end - start) : "–", `${data.phases.length} rounds`, null],
                    [
                      "Tests passed",
                      tests ? `${tests.passed}/${tests.total}` : "–",
                      tests ? (tests.suite === "hidden" ? "Hidden tests" : "Sample tests") : "No code run",
                      tests ? (tests.passed === tests.total ? "text-success" : "text-danger") : null,
                    ],
                    [
                      "Resume claims",
                      claims.length ? `${verified}/${claims.length}` : "–",
                      claims.length ? "Verified" : "None probed",
                      null,
                    ],
                    [
                      "Integrity",
                      integrity === "none" ? "None flagged" : integrity === "high" ? "High concern" : "Some flags",
                      `${openSignals.reduce((n, s) => n + s.count, 0)} signals`,
                      integrity === "high" ? "text-danger" : integrity === "none" ? "text-success" : null,
                    ],
                  ] as const
                ).map(([label, value, sub, cls], i) => (
                  <div
                    key={label}
                    className={`space-y-0.5 border-border px-4 py-3.5 ${i % 2 ? "border-l" : ""} ${i > 1 ? "max-sm:border-t sm:border-l print:border-l" : ""}`}
                  >
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className={`text-xl font-medium tabular-nums ${cls ?? ""}`}>{value}</dd>
                    <dd className="text-xs text-muted">{sub}</dd>
                  </div>
                ))}
              </dl>
              <Timeline
                phases={data.phases}
                flags={data.flags}
                start={start}
                end={end}
                t={canPlay ? t : null}
                onSeek={canPlay ? seek : undefined}
              />
            </section>

            {/* The recording sits right under the timeline that seeks it; strengths and gaps beside it */}
            <div className="grid gap-8 md:grid-cols-[minmax(0,26rem)_1fr] print:block">
              {recording}
              <div
                className="space-y-8 print:grid print:grid-cols-2 print:gap-8 print:space-y-0"
                aria-label="Strengths and gaps"
              >
                {(
                  [
                    ["Strengths", rep.strengths, icons.check, "text-success"],
                    ["Gaps", rep.concerns, glyph.alert, "text-danger"],
                  ] as const
                ).map(([title, list, d, cls]) => (
                  <div key={title}>
                    <h2 className="mb-3 border-b border-border pb-2 text-base font-medium">{title}</h2>
                    {list.length ? (
                      <ul className="space-y-2.5 text-sm leading-relaxed">
                        {list.map((x) => (
                          <li key={x} className="flex gap-2.5">
                            <Icon d={d} size={16} className={`mt-0.5 shrink-0 ${cls}`} />
                            <span>{x}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted">None noted.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Section title="Competencies" meta="Scored 1 to 5 against the role's rubric">
              <ul className="divide-y divide-border">
                {ai!.competencies.map((c) => {
                  const def = data.rubric.find((r) => r.id === c.id);
                  return (
                    <li key={c.id} className="py-4 first:pt-0 last:pb-0 print:break-inside-avoid">
                      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
                        <p className="text-sm font-medium">{c.name}</p>
                        <span className="text-right text-sm font-medium tabular-nums sm:order-last">
                          <span className={tone(c.score)}>{c.score ?? "–"}</span>
                          <span className="text-muted">/5</span>
                        </span>
                        <span className="col-span-2 sm:col-span-1">
                          <Meter score={c.score} label={c.name} />
                        </span>
                      </div>
                      <p className="mt-2 max-w-[75ch] text-sm leading-relaxed text-muted">{c.rationale}</p>
                      {(c.evidence.length > 0 || def) && (
                        <details className="group mt-2 text-sm print:hidden">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs text-link outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            Why this score
                            {c.evidence.length
                              ? ` · ${c.evidence.length} moment${c.evidence.length === 1 ? "" : "s"}`
                              : ""}
                          </summary>
                          <div className="mt-3 space-y-3">
                            {c.evidence.length > 0 && (
                              <EvidenceList items={c.evidence} start={start} onSeek={canPlay ? seek : undefined} />
                            )}
                            {def && (
                              <ol className="space-y-0.5 text-xs">
                                {def.levels.map((l, i) => (
                                  <li
                                    key={i}
                                    className={`flex gap-2 rounded-md px-2 py-1 ${c.score === i + 1 ? "bg-surface font-medium text-foreground" : "text-muted"}`}
                                  >
                                    <span className="w-3 shrink-0 tabular-nums">{i + 1}</span>
                                    <span>{l}</span>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          </>
        )}

        {ai && (
          <Section title="Rounds">
            <ol className="space-y-10">
              {ai.sections.map((s) => (
                <Round
                  key={s.phase}
                  phase={s.phase}
                  score={s.score}
                  feedback={s.feedback}
                  ms={data.phases
                    .filter((p) => p.phase === s.phase)
                    .reduce((n, p) => n + ((p.end ?? end) - p.start), 0)}
                >
                  {s.phase === "resume" && claims.length > 0 && <Claims claims={claims} />}
                  {s.phase === boardPhase && data.board && <Whiteboard topic={data.design} elements={data.board} />}
                  {s.phase === "coding" && <Coding data={data} start={start} />}
                </Round>
              ))}
            </ol>
          </Section>
        )}

        {ai && <Integrity data={data} start={start} owner={owner} onSeek={canPlay ? seek : undefined} />}

        {owner && <Decision data={data} />}

        <footer className="border-t border-border pt-4 text-xs text-muted">
          Scores come from an AI evaluator reading the full record; the hiring decision stays with the team.
        </footer>
      </main>

      {transcript && full && (
        <Transcript
          lines={data.lines}
          start={start}
          phases={data.phases}
          onClose={() => setTranscript(false)}
          onSeek={canPlay ? (ms) => (setTranscript(false), seek(ms)) : undefined}
        />
      )}
    </div>
  );
}

function TopBar({
  data,
  full,
  signIn,
  onTranscript,
  title,
}: {
  data: AiReportData;
  full: boolean;
  signIn: string;
  onTranscript: () => void;
  title: string;
}) {
  const [sharing, setSharing] = useState(false);
  const [token, setToken] = useState(data.shareToken);

  /** The browser's "Save as PDF" names the file after the page title. */
  function download() {
    const was = document.title;
    document.title = title;
    addEventListener("afterprint", () => (document.title = was), { once: true });
    window.print();
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6 print:hidden">
      <Link
        href={data.access === "owner" ? `/dashboard/jobs/${data.jobId}/applicants/${data.applicantId}` : "/"}
        className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={data.access === "owner" ? "Back to the application" : "Hire Excellence"}
      >
        <Logo size={24} faint={false} />
        <span className="hidden text-sm font-medium sm:inline">Hire Excellence</span>
      </Link>
      <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
      <span className="min-w-0 truncate text-sm text-muted">Interview report</span>
      <div className="ml-auto flex items-center gap-1.5">
        {full ? (
          <button
            type="button"
            className={`${btnGhost} max-sm:w-10 max-sm:px-0`}
            onClick={onTranscript}
            disabled={!data.lines.length}
          >
            <Icon d={icons.comment} size={16} />
            <span className="max-sm:sr-only">Transcript</span>
          </button>
        ) : (
          <Link href={signIn} className={`${btnGhost} max-sm:w-10 max-sm:px-0`} title="Sign in to read the transcript">
            <Icon d={glyph.lock} size={16} />
            <span className="max-sm:sr-only">Transcript</span>
          </Link>
        )}
        {data.access === "owner" && (
          <button type="button" className={`${btnOutline} max-sm:w-10 max-sm:px-0`} onClick={() => setSharing(true)}>
            <Icon d={icons.link} size={16} />
            <span className="max-sm:sr-only">Share</span>
          </button>
        )}
        <button type="button" className={`${btnPrimary} max-sm:w-10 max-sm:px-0`} onClick={download}>
          <Icon d={icons.download} size={16} />
          <span className="max-sm:sr-only">Download PDF</span>
        </button>
        <ThemeToggle className={`${btnGhost} w-8 px-0 max-sm:w-10`} />
      </div>
      {sharing && <ShareDialog data={data} token={token} setToken={setToken} onClose={() => setSharing(false)} />}
    </header>
  );
}

function ShareDialog({
  data,
  token,
  setToken,
  onClose,
}: {
  data: AiReportData;
  token: string | null;
  setToken: (t: string | null) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const url = token ? `${location.origin}/r/${token}` : "";
  async function set(on: boolean) {
    setBusy(true);
    const r = await shareInterview(data.jobId, data.applicantId, on);
    setBusy(false);
    if ("error" in r) return toast(r.error, "error");
    setToken(r.token);
  }
  return (
    <Modal title="Share report" onClose={onClose}>
      <div className="space-y-4 p-5 text-sm">
        <p className="text-muted">
          Anyone with the link sees the scores, feedback and work. The recording and transcript ask them to sign in.
          Your decision and notes stay private.
        </p>
        {token ? (
          <>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                data-autofocus
                className={`${btnPrimary} h-10`}
                onClick={() => void navigator.clipboard.writeText(url).then(() => toast("Link copied"))}
              >
                Copy link
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              className={`${btnGhost} -ml-3 text-danger hover:text-danger`}
              onClick={() => void set(false)}
            >
              Stop sharing
            </button>
          </>
        ) : (
          <button
            type="button"
            data-autofocus
            disabled={busy}
            aria-busy={busy}
            className={`${btnPrimary} h-10`}
            onClick={() => void set(true)}
          >
            <Icon d={icons.link} size={16} />
            Create link
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Rounds as bands across the interview, integrity flags as red ticks; seeks the recording when there is one. */
function Timeline({
  phases,
  flags,
  start,
  end,
  t,
  onSeek,
}: {
  phases: AiReportData["phases"];
  flags: AiReportData["flags"];
  start: number;
  end: number;
  t: number | null;
  onSeek?: (ms: number) => void;
}) {
  if (!phases.length || end <= start) return null;
  const pct = (ms: number) => `${Math.min(100, Math.max(0, ((ms - start) / (end - start)) * 100))}%`;
  return (
    <div
      className={`relative h-9 overflow-hidden rounded-lg border border-border ${onSeek ? "cursor-pointer" : ""}`}
      role={onSeek ? "slider" : "img"}
      aria-label="Interview timeline"
      {...(onSeek && {
        tabIndex: 0,
        "aria-valuemin": 0,
        "aria-valuemax": Math.round((end - start) / 1000),
        "aria-valuenow": Math.round(((t ?? start) - start) / 1000),
        onKeyDown: (e: React.KeyboardEvent) =>
          e.key === "ArrowRight"
            ? onSeek((t ?? start) + 10_000)
            : e.key === "ArrowLeft"
              ? onSeek((t ?? start) - 10_000)
              : null,
        onClick: (e: React.MouseEvent<HTMLDivElement>) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(start + ((e.clientX - r.left) / r.width) * (end - start));
        },
      })}
    >
      {phases.map((p, i) => (
        <span
          key={i}
          title={`${phaseLabel(p.phase)} · ${mmss((p.end ?? end) - p.start)}`}
          className={`absolute inset-y-0 flex items-center border-r border-border px-2 text-xs text-muted last:border-r-0 ${i % 2 ? "bg-surface" : ""}`}
          style={{ left: pct(p.start), width: `calc(${pct(p.end ?? end)} - ${pct(p.start)})` }}
        >
          <span className="truncate">{phaseLabel(p.phase)}</span>
        </span>
      ))}
      {flags.map((f, i) => (
        <span
          key={i}
          title={`${SIGNALS[f.signal] ?? f.signal} at ${mmss(f.at - start)}`}
          className="absolute inset-y-0 w-px bg-danger/80"
          style={{ left: pct(f.at) }}
        />
      ))}
      {t !== null && <span className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: pct(t) }} />}
    </div>
  );
}

function Recording({
  data,
  full,
  signIn,
  shareKey,
  track,
  setTrack,
  segment,
  player,
  onTime,
}: {
  data: AiReportData;
  full: boolean;
  signIn: string;
  shareKey?: string;
  track: "cam" | "screen";
  setTrack: (t: "cam" | "screen") => void;
  segment: AiReportData["segments"][number] | undefined;
  player: React.RefObject<HTMLVideoElement | null>;
  onTime: (ms: number) => void;
}) {
  const owner = data.access === "owner";
  const empty = (text: React.ReactNode) => (
    <div className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface px-6 py-10 text-center text-sm text-muted">
      {text}
    </div>
  );
  return (
    <Section
      id="recording"
      title="Recording"
      className="print:hidden"
      action={
        full &&
        data.segments.length > 0 && (
          <div className="flex items-center gap-1">
            <div className="flex rounded-full border border-border p-0.5" role="tablist" aria-label="Recording">
              {(["cam", "screen"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={track === k}
                  className={`h-7 rounded-full px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${track === k ? "bg-surface font-medium text-foreground" : "text-muted hover:text-foreground"}`}
                  onClick={() => setTrack(k)}
                >
                  {k === "cam" ? "Camera" : "Screen"}
                </button>
              ))}
            </div>
            {owner && !data.mediaDeleted && <DeleteRecordings jobId={data.jobId} applicantId={data.applicantId} />}
          </div>
        )
      }
    >
      {!full ? (
        empty(
          <>
            <Icon d={glyph.lock} size={20} />
            <p>Sign in to watch the recording and read the transcript.</p>
            <Link href={signIn} className={btnOutline}>
              Sign in
            </Link>
          </>,
        )
      ) : data.mediaDeleted ? (
        empty("The recordings were deleted.")
      ) : segment ? (
        <video
          key={`${track}-${segment.start}`}
          ref={player}
          src={`/api/iv/${data.jobId}/${data.applicantId}/${track}/${segment.start}${data.access === "member" && shareKey ? `?k=${shareKey}` : ""}`}
          controls
          preload="metadata"
          className="aspect-video w-full rounded-xl bg-black"
          onTimeUpdate={(e) => onTime(segment.start + e.currentTarget.currentTime * 1000)}
        />
      ) : (
        empty(`No ${track === "cam" ? "camera" : "screen"} recording.`)
      )}
    </Section>
  );
}

function Round({
  phase,
  score,
  feedback,
  ms,
  children,
}: {
  phase: PhaseId;
  score: number | null;
  feedback: string;
  ms: number;
  children?: React.ReactNode;
}) {
  return (
    <li className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 print:break-after-avoid">
        <h3 className="font-display text-xl font-normal">{phaseLabel(phase)}</h3>
        <p className="flex items-center gap-3 text-sm">
          {ms > 0 && <span className="text-muted tabular-nums">{minutes(ms)}</span>}
          <span className="font-medium tabular-nums">
            {score === null ? (
              <span className="text-muted">Not assessed</span>
            ) : (
              <>
                <span className={tone(score)}>{score}</span>
                <span className="text-muted">/5</span>
              </>
            )}
          </span>
        </p>
      </div>
      {feedback && <p className="max-w-[75ch] text-sm leading-relaxed text-foreground/90">{feedback}</p>}
      {children}
    </li>
  );
}

function Claims({ claims }: { claims: NonNullable<AiReportData["report"]>["ai"]["claims"] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border print:overflow-visible">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="bg-surface text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-normal">Resume claim</th>
            <th className="px-4 py-2 font-normal">Result</th>
            <th className="px-4 py-2 font-normal">What they said</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {claims.map((c) => {
            const k = CLAIM[c.status];
            return (
              <tr key={c.id} className="align-top print:break-inside-avoid">
                <td className="w-2/5 px-4 py-3">{c.text}</td>
                <td className={`px-4 py-3 font-medium whitespace-nowrap ${k.tone}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon d={k.d} size={14} />
                    {k.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{c.evidence || "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Whiteboard({ topic, elements }: { topic: string | null; elements: unknown[] }) {
  return (
    <figure className="max-w-3xl space-y-2 print:break-inside-avoid">
      <figcaption className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{topic ? `System design: ${topic}` : "System design"}</span>
        <span className="text-xs text-muted">Final whiteboard</span>
      </figcaption>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <BoardSnapshot elements={elements} />
      </div>
    </figure>
  );
}

/** Each problem as the candidate saw it, the code they ended with, and how it did against the tests. */
function Coding({ data, start }: { data: AiReportData; start: number }) {
  if (!data.problems.length && !data.code) return <p className="text-sm text-muted">No coding work recorded.</p>;
  const last = data.problems.length - 1;
  return (
    <div className="space-y-8">
      {data.problems.map((p, i) => {
        const next = data.problems[i + 1]?.at ?? Infinity;
        const runs = data.runs.filter((r) => r.at >= (p.at ?? 0) && r.at < next);
        const vis = runs.map(resultOf).findLast((r) => r.suite === "visible");
        const hid = runs.map(resultOf).findLast((r) => r.suite === "hidden");
        return (
          <article key={p.id} className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h4 className="text-sm font-medium">
                {data.problems.length > 1 && <span className="text-muted">Problem {i + 1} · </span>}
                {p.title}
              </h4>
              <span className={`text-xs font-medium capitalize ${DIFFICULTY[p.difficulty] ?? "text-muted"}`}>
                {p.difficulty}
                {p.env && <span className="font-normal text-muted normal-case"> · {ENVS[p.env].label}</span>}
              </span>
              {i < last && p.at !== null && data.problems[i + 1].at !== null && (
                <span className="text-xs text-muted">Switched after {mmss(data.problems[i + 1].at! - p.at)}</span>
              )}
            </div>
            <details data-print-open className="group rounded-xl border border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="line-clamp-1 text-muted group-open:hidden">{p.statement}</span>
                <span className="hidden font-medium group-open:inline">Problem statement</span>
                <Icon
                  d={icons.plus}
                  size={14}
                  className="shrink-0 text-muted transition-transform group-open:rotate-45 print:hidden"
                />
              </summary>
              <div className="space-y-4 border-t border-border px-4 py-4 text-sm leading-relaxed">
                <p className="whitespace-pre-line">{p.statement}</p>
                <dl className="grid gap-3 sm:grid-cols-3 print:grid-cols-3">
                  {(
                    [
                      ["Input", p.input],
                      ["Output", p.output],
                      ["Constraints", p.constraints],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt className="mb-1 text-xs text-muted">{k}</dt>
                        <dd className="whitespace-pre-line">{v}</dd>
                      </div>
                    ))}
                </dl>
                {p.visible.length > 0 && p.env && ENVS[p.env].grade === "checks" && (
                  <div>
                    <p className="mb-1 text-xs text-muted">Requirements</p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {p.visible.map((x) => (
                        <li key={x.name}>{x.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {p.visible.length > 0 && !(p.env && ENVS[p.env].grade === "checks") && (
                  <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
                    {p.visible.slice(0, 2).map((x, j) => (
                      <div key={j} className="rounded-lg bg-surface p-3">
                        <p className="mb-1 text-xs text-muted">Example {j + 1}</p>
                        <pre className="font-mono text-xs whitespace-pre-wrap">{x.input}</pre>
                        <p className="mt-2 mb-1 text-xs text-muted">Expected</p>
                        <pre className="font-mono text-xs whitespace-pre-wrap">{x.output}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>

            {i === last && data.code && <CodeBlock code={data.code.code} language={data.code.language} />}

            {(vis || hid) && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {[vis, hid].map(
                    (r) =>
                      r && (
                        <p
                          key={r.suite}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-3 text-xs ${r.passed === r.total ? "text-success" : "text-danger"}`}
                        >
                          <Icon d={r.passed === r.total ? icons.check : glyph.cross} size={13} />
                          <span className="font-medium tabular-nums">
                            {r.passed}/{r.total}
                          </span>
                          <span className="text-muted">
                            {r.suite === "hidden" ? "hidden tests" : "sample tests"}
                            {r.status && r.status !== "Accepted" ? ` · ${r.status}` : ""}
                            {r.time !== null ? ` · ${r.time.toFixed(2)} s` : ""}
                            {r.memory ? ` · ${Math.round(r.memory / 1024)} MB` : ""}
                          </span>
                        </p>
                      ),
                  )}
                </div>
                {vis && vis.cases.length > 0 && (
                  <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                    {vis.cases.map((c) => (
                      <li key={c.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                        <span
                          className={`inline-flex w-16 items-center gap-1.5 text-xs font-medium ${c.passed ? "text-success" : "text-danger"}`}
                        >
                          <Icon d={c.passed ? icons.check : glyph.cross} size={13} />
                          {c.passed ? "Passed" : "Failed"}
                        </span>
                        <span>{c.name}</span>
                        {!c.passed && c.expected !== undefined && (
                          <span className="ml-auto font-mono text-xs text-muted">
                            expected {c.expected} · got {c.got || "nothing"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {(vis?.error || hid?.error) && (
                  <pre className="max-h-40 overflow-auto rounded-lg bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-danger">
                    {(hid?.error || vis?.error)!.slice(0, 1200)}
                  </pre>
                )}
                <p className="text-xs text-muted">
                  {runs.length} run{runs.length === 1 ? "" : "s"}
                  {runs.length ? `, last at ${mmss(runs.at(-1)!.at - start)}` : ""}
                </p>
              </div>
            )}
          </article>
        );
      })}
      {!data.problems.length && data.code && <CodeBlock code={data.code.code} language={data.code.language} />}
    </div>
  );
}

/** Final code, numbered, in Geist Mono. Static text so it copies, wraps on paper and prints in full. */
function CodeBlock({ code, language }: { code: string; language: Language }) {
  const lines = code.replace(/\s+$/, "").split("\n");
  return (
    <figure className="overflow-hidden rounded-xl border border-border">
      <figcaption className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 text-xs text-muted">
        <span>Final code · {LANGUAGES[language]?.label ?? language}</span>
        <button
          type="button"
          className="rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring print:hidden"
          onClick={() => void navigator.clipboard.writeText(code).then(() => toast("Code copied"))}
        >
          Copy
        </button>
      </figcaption>
      <pre className="max-h-[32rem] overflow-auto py-3 font-mono text-[12.5px] leading-6 print:max-h-none print:overflow-visible print:text-[10px] print:leading-5">
        {lines.map((l, i) => (
          <div key={i} className="flex">
            <span className="w-12 shrink-0 pr-4 text-right text-muted/60 select-none tabular-nums">{i + 1}</span>
            <code className="pr-4 whitespace-pre print:whitespace-pre-wrap">{l || " "}</code>
          </div>
        ))}
      </pre>
    </figure>
  );
}

function Integrity({
  data,
  start,
  owner,
  onSeek,
}: {
  data: AiReportData;
  start: number;
  owner: boolean;
  onSeek?: (ms: number) => void;
}) {
  const [dismissed, setDismissed] = useState(new Set(data.dismissed));
  const signals = data.report!.ai.integrity.signals;
  return (
    <Section
      id="integrity"
      title="Integrity"
      meta={signals.length ? "Check the moment before acting on a flag" : undefined}
    >
      {signals.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {signals.map((s) => {
            const off = dismissed.has(s.signal);
            const label = (
              <>
                <span className="font-medium">{SIGNALS[s.signal] ?? s.signal}</span>
                <span className="text-muted tabular-nums">
                  {" "}
                  · {s.count}× · first at {mmss(s.first - start)}
                </span>
                {s.hard && <span className="text-danger"> · paused the interview</span>}
              </>
            );
            return (
              <li
                key={s.signal}
                className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${off ? "opacity-50" : ""}`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon d={glyph.alert} size={15} className={s.hard && !off ? "text-danger" : "text-muted"} />
                  {onSeek ? (
                    <button type="button" className="text-left hover:underline" onClick={() => onSeek(s.first)}>
                      {label}
                    </button>
                  ) : (
                    <span>{label}</span>
                  )}
                </span>
                {owner && (
                  <button
                    type="button"
                    className={`${btnGhost} h-8 text-xs print:hidden`}
                    onClick={async () => {
                      const next = new Set(dismissed);
                      if (off) next.delete(s.signal);
                      else next.add(s.signal);
                      setDismissed(next);
                      await reviewFlag(data.jobId, data.applicantId, s.signal, !off);
                    }}
                  >
                    {off ? "Restore flag" : "Remove flag"}
                  </button>
                )}
                {off && !owner && <span className="text-xs text-muted">Reviewed</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-success">
          <Icon d={icons.check} size={16} />
          No issues flagged by the automated checks.
        </p>
      )}
    </Section>
  );
}

function Transcript({
  lines,
  start,
  phases,
  onClose,
  onSeek,
}: {
  lines: AiReportData["lines"];
  start: number;
  phases: AiReportData["phases"];
  onClose: () => void;
  onSeek?: (ms: number) => void;
}) {
  // Each line knows its round, so a heading goes in where the round changes
  const rows = useMemo(
    () =>
      lines.map((l, i) => {
        const round = phases.findLast((p) => p.start <= l.at)?.phase ?? null;
        const prev = i ? (phases.findLast((p) => p.start <= lines[i - 1].at)?.phase ?? null) : undefined;
        return { ...l, heading: round !== prev ? round : undefined };
      }),
    [lines, phases],
  );
  return (
    <Modal title="Transcript" onClose={onClose} wide>
      <ol className="max-h-[70dvh] space-y-1 overflow-y-auto p-3 text-sm">
        {rows.map((l, i) => {
          const body = (
            <>
              <span className="mb-0.5 flex justify-between gap-3 text-xs text-muted">
                <span className="font-medium">{l.role === "agent" ? "Interviewer" : "Candidate"}</span>
                <span className="tabular-nums">{mmss(l.at - start)}</span>
              </span>
              <span className={l.role === "candidate" ? "text-foreground" : "text-foreground/75"}>{l.text}</span>
            </>
          );
          return (
            <li key={i}>
              {l.heading && (
                <p className="sticky top-0 z-10 bg-background px-2 pt-3 pb-1 text-xs font-medium text-muted">
                  {phaseLabel(l.heading)}
                </p>
              )}
              {onSeek ? (
                <button
                  type="button"
                  onClick={() => onSeek(l.at)}
                  className="block w-full rounded-lg px-2 py-2 text-left hover:bg-surface-hover"
                >
                  {body}
                </button>
              ) : (
                <div className="px-2 py-2">{body}</div>
              )}
            </li>
          );
        })}
        {!rows.length && <li className="p-2 text-muted">No transcript.</li>}
      </ol>
    </Modal>
  );
}

function EvidenceList({ items, start, onSeek }: { items: Evidence[]; start: number; onSeek?: (ms: number) => void }) {
  return (
    <ul className="space-y-1.5">
      {items.map((e) => {
        const body = (
          <>
            <span className="flex justify-between gap-2 text-xs text-muted">
              <span>{KIND_LABEL[e.kind]}</span>
              <span className="tabular-nums">
                {onSeek && "▶ "}
                {mmss(e.at - start)}
              </span>
            </span>
            <span className="line-clamp-2">“{e.quote}”</span>
            {e.note && <span className="block text-xs text-muted">{e.note}</span>}
          </>
        );
        return (
          <li key={e.ref}>
            {onSeek ? (
              <button
                type="button"
                onClick={() => onSeek(e.at)}
                className="w-full rounded-lg border border-border px-3 py-2 text-left hover:bg-surface-hover"
              >
                {body}
              </button>
            ) : (
              <div className="rounded-lg border border-border px-3 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Pending({
  status,
  owner,
  jobId,
  applicantId,
}: {
  status: string;
  owner: boolean;
  jobId: string;
  applicantId: string;
}) {
  const [busy, setBusy] = useState(false);
  if (status === "failed")
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">The AI evaluation didn&apos;t finish. The recording and transcript are saved.</p>
        {owner && (
          <button
            type="button"
            aria-busy={busy}
            disabled={busy}
            className={btnOutline}
            onClick={async () => {
              setBusy(true);
              try {
                await retryInterview(jobId, applicantId);
                location.reload();
              } catch {
                setBusy(false);
                toast("Something went wrong. Try again in a moment.", "error");
              }
            }}
          >
            Retry evaluation
          </button>
        )}
      </div>
    );
  return (
    <p className="text-sm text-muted">
      {status === "live"
        ? "The interview is in progress."
        : status === "processing"
          ? "Evaluating. This takes a minute or two."
          : "Not taken yet."}
    </p>
  );
}

/** Kept away from Save decision (it's permanent), and always asks first. */
function DeleteRecordings({ jobId, applicantId }: { jobId: string; applicantId: string }) {
  return (
    <button
      type="button"
      className={`${btnGhost} h-8 text-xs hover:text-danger`}
      onClick={async () => {
        if (
          !(await ask({
            title: "Delete the recordings?",
            body: "The video and screen recordings are removed for good. The report and transcript stay.",
            confirm: "Delete",
            danger: true,
          }))
        )
          return;
        try {
          await removeRecordings(jobId, applicantId);
          location.reload();
        } catch {
          toast("Something went wrong. Try again in a moment.", "error");
        }
      }}
    >
      <Icon d={icons.trash} size={14} />
      <span className="max-sm:sr-only">Delete recordings</span>
    </button>
  );
}

function Decision({ data }: { data: AiReportData }) {
  const [value, setValue] = useState(data.decision?.value ?? "");
  const [note, setNote] = useState(data.decision?.note ?? "");
  const [state, setState] = useState<"" | "saving" | "saved" | string>("");
  return (
    <Section title="Your decision" meta="The AI recommends; you decide" className="print:hidden">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("saving");
          const r = await decideInterview(data.jobId, data.applicantId, value, note).catch(() => ({
            error: "Something went wrong. Try again.",
          }));
          setState("error" in r ? r.error : "saved");
        }}
      >
        <div role="radiogroup" aria-label="Decision" className="flex flex-wrap gap-2">
          {Object.entries(DECISIONS).map(([k, label]) => (
            <label
              key={k}
              className={`flex h-9 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring ${value === k ? "border-foreground bg-surface font-medium" : "border-border"}`}
            >
              <input
                type="radio"
                name="decision"
                value={k}
                checked={value === k}
                onChange={() => setValue(k)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Notes for your team (optional)"
          aria-label="Decision notes"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="mr-auto text-xs text-muted">Advance and Reject also move the application.</p>
          {state && state !== "saving" && (
            <span className={`text-xs ${state === "saved" ? "text-success" : "text-danger"}`}>
              {state === "saved" ? "Saved" : state}
            </span>
          )}
          <button
            type="submit"
            aria-busy={state === "saving"}
            disabled={!value || state === "saving"}
            className={`${btnPrimary} h-9`}
          >
            Save decision
          </button>
        </div>
      </form>
    </Section>
  );
}
