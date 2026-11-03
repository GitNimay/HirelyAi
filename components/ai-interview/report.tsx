"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { decideInterview, removeRecordings, retryInterview, reviewFlag } from "@/app/dashboard/actions";
import type { AiReportData } from "@/lib/ai-interview/session";
import { RECOMMENDATIONS, type Evidence } from "@/lib/ai-interview/evaluator";
import { phaseLabel, type IvEvent, type PhaseId } from "@/lib/ai-interview/harness";
import type { Language, RunResult } from "@/lib/ai-interview/workspace";
import { ask } from "../kit";
import { Avatar, btnGhost, btnOutline, btnPrimary, Icon, icons } from "../ui";

const CodeView = dynamic(() => import("./workspace").then((m) => m.CodeView), { ssr: false });
const BoardView = dynamic(() => import("./workspace").then((m) => m.BoardView), { ssr: false });

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const scoreTone = (s: number | null) =>
  s === null ? "text-muted" : s >= 4 ? "text-success" : s >= 3 ? "text-foreground" : "text-danger";
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
};
const CLAIM_TONE = {
  verified: "text-success",
  vague: "text-foreground",
  contradicted: "text-danger",
  not_reached: "text-muted",
} as const;
const CLAIM_LABEL = {
  verified: "Verified",
  vague: "Vague",
  contradicted: "Contradicted",
  not_reached: "Not reached",
} as const;
const DECISIONS = { advance: "Advance", hold: "Hold", reject: "Reject" } as const;

function Card({
  id,
  title,
  hint,
  action,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-4 border border-border p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The recruiter's AI interview report (modelled on HackerRank Chakra's): overall and section scores, strengths and
 * gaps, a synced replay (video, transcript, code and whiteboard follow one clock), integrity signals on the timeline,
 * per-competency scores whose evidence seeks the replay, resume claim results, and the recruiter's own decision.
 */
export function AiReportView({ data }: { data: AiReportData }) {
  const rep = data.report;
  const ai = rep?.ai;
  const start = ai?.startedAt ?? data.startedAt ?? data.events[0]?.at ?? 0;
  const end = data.endedAt ?? data.events.at(-1)?.at ?? start;
  const [t, setT] = useState(start);
  const [track, setTrack] = useState<"cam" | "screen">("cam");
  const [dismissed, setDismissed] = useState(new Set(data.dismissed));
  const player = useRef<HTMLVideoElement>(null);

  const utterances = useMemo(
    () =>
      data.events.filter(
        (e): e is Extract<IvEvent, { type: "utterance" | "chat" }> => e.type === "utterance" || e.type === "chat",
      ),
    [data.events],
  );
  const codes = useMemo(
    () => data.events.filter((e): e is Extract<IvEvent, { type: "code" }> => e.type === "code"),
    [data.events],
  );
  const boards = useMemo(
    () => data.events.filter((e): e is Extract<IvEvent, { type: "board" }> => e.type === "board"),
    [data.events],
  );
  const runs = useMemo(
    () => data.events.filter((e): e is Extract<IvEvent, { type: "run" }> => e.type === "run"),
    [data.events],
  );
  const flags = useMemo(
    () =>
      data.events.filter(
        (e): e is Extract<IvEvent, { type: "integrity" }> => e.type === "integrity" && !e.signal.endsWith(" cleared"),
      ),
    [data.events],
  );
  const phases = data.state?.log ?? [];
  const segments = data.segments.filter((s) => s.track === track);
  const segment = segments.findLast((s) => s.start <= t) ?? segments[0];
  const at = <T extends { at: number }>(list: T[]) => list.findLast((e) => e.at <= t) ?? null;
  const code = at(codes) ?? codes[0] ?? null;
  const board = at(boards);
  const lineNow = at(utterances);

  /** Jumps every panel (and the video, if there's a recording then) to an absolute time. */
  function seek(ms: number) {
    setT(ms);
    const seg = segments.findLast((s) => s.start <= ms);
    const v = player.current;
    if (!seg || !v) return;
    if (seg !== segment) {
      // The new segment's video loads first; seek once it has metadata
      v.addEventListener(
        "loadedmetadata",
        () => ((v.currentTime = (ms - seg.start) / 1000), void v.play().catch(() => {})),
        { once: true },
      );
    } else {
      v.currentTime = (ms - seg.start) / 1000;
      void v.play().catch(() => {});
    }
    document.getElementById("replay")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const pct = (ms: number) => `${Math.min(100, Math.max(0, ((ms - start) / Math.max(1, end - start)) * 100))}%`;
  const integrity = ai?.integrity;
  const openSignals = integrity?.signals.filter((s) => !dismissed.has(s.signal)) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start gap-4">
        <Avatar name={data.candidate.name} src={data.candidate.imageUrl ?? undefined} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            <Link
              href={`/dashboard/jobs/${data.jobId}/applicants/${data.applicantId}`}
              className="hover:underline print:hidden"
            >
              ← Application
            </Link>{" "}
            · {data.job.title} · {data.job.company}
          </p>
          <h1 className="truncate font-display text-2xl font-normal">{data.candidate.name}</h1>
          <p className="text-xs text-muted" suppressHydrationWarning>
            AI interview ·{" "}
            {data.startedAt
              ? new Date(data.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
              : "not started"}{" "}
            · {mmss(end - start)}
          </p>
        </div>
        <button type="button" className={`${btnOutline} h-9 print:hidden`} onClick={() => window.print()}>
          <Icon d={icons.download} size={14} />
          Download report
        </button>
      </header>

      {!rep ? (
        <Card title="AI evaluation">
          <Pending status={data.status} jobId={data.jobId} applicantId={data.applicantId} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card title="Overall score">
            <p className={`text-5xl font-medium tabular-nums ${scoreTone(ai!.overall)}`}>
              {ai!.overall?.toFixed(1) ?? "–"}
              <span className="text-base font-normal text-muted">/5</span>
            </p>
            {ai!.recommendation && (
              <p className="mt-2 inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs font-medium">
                {RECOMMENDATIONS[ai!.recommendation]}
              </p>
            )}
            <ul className="mt-5 space-y-1.5 text-sm">
              {ai!.sections.map((s) => (
                <li key={s.phase}>
                  <a
                    href={`#section-${s.phase}`}
                    className="flex items-center justify-between gap-2 rounded px-1 hover:bg-surface-hover"
                  >
                    <span>{phaseLabel(s.phase)}</span>
                    <span className={`tabular-nums ${scoreTone(s.score)}`}>{s.score ?? "–"}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Summary">
            {rep.summary && <p className="mb-4 text-sm leading-relaxed">{rep.summary}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Strengths", rep.strengths, "text-success"],
                  ["Gaps", rep.concerns, "text-danger"],
                ] as const
              ).map(([title, list, tone]) => (
                <div key={title}>
                  <p className={`mb-1 text-xs font-medium ${tone}`}>{title}</p>
                  {list.length ? (
                    <ul className="list-disc space-y-1 pl-4 text-sm">
                      {list.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">None noted.</p>
                  )}
                </div>
              ))}
            </div>
            {integrity && (
              <div
                className={`mt-4 rounded-md border px-3 py-2 text-sm ${openSignals.length && integrity.level === "high" ? "border-danger/40 bg-danger/10" : "border-border"}`}
              >
                <a href="#integrity" className="font-medium hover:underline">
                  {openSignals.length
                    ? `Integrity: ${integrity.level === "high" ? "high" : "medium"} concern · ${openSignals.reduce((n, s) => n + s.count, 0)} signals`
                    : "No integrity issues detected"}
                </a>
              </div>
            )}
          </Card>
        </div>
      )}

      <Card
        id="replay"
        title="Interview playback"
        hint="Click any line or evidence to jump there."
        className="print:hidden"
        action={
          !data.mediaDeleted &&
          data.segments.length > 0 && <DeleteRecordings jobId={data.jobId} applicantId={data.applicantId} />
        }
      >
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-2">
            {data.mediaDeleted ? (
              <p className="flex aspect-video items-center justify-center rounded-md bg-surface text-sm text-muted">
                Recordings were deleted.
              </p>
            ) : segment ? (
              <video
                key={`${track}-${segment.start}`}
                ref={player}
                src={`/api/iv/${data.jobId}/${data.applicantId}/${track}/${segment.start}`}
                controls
                preload="metadata"
                className="aspect-video w-full rounded-md bg-black"
                onTimeUpdate={(e) => setT(segment.start + e.currentTarget.currentTime * 1000)}
              />
            ) : (
              <p className="flex aspect-video items-center justify-center rounded-md bg-surface text-sm text-muted">
                No {track === "cam" ? "camera" : "screen"} recording.
              </p>
            )}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex gap-1" role="tablist" aria-label="Recording">
                {(["cam", "screen"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={track === k}
                    className={`h-7 rounded-md px-2.5 ${track === k ? "bg-surface font-medium" : "text-muted hover:text-foreground"}`}
                    onClick={() => setTrack(k)}
                  >
                    {k === "cam" ? "Camera" : "Screen"}
                  </button>
                ))}
              </div>
              <span className="text-muted tabular-nums">
                {mmss(t - start)} / {mmss(end - start)}
              </span>
            </div>
            {/* Timeline: phases as bands, integrity events as red ticks; click to seek */}
            <div
              className="relative h-8 cursor-pointer overflow-hidden rounded-md border border-border"
              role="slider"
              aria-label="Interview timeline"
              aria-valuemin={0}
              aria-valuemax={Math.round((end - start) / 1000)}
              aria-valuenow={Math.round((t - start) / 1000)}
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "ArrowRight" ? seek(t + 10_000) : e.key === "ArrowLeft" ? seek(t - 10_000) : null
              }
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seek(start + ((e.clientX - r.left) / r.width) * (end - start));
              }}
            >
              {phases.map((p, i) => (
                <span
                  key={i}
                  title={phaseLabel(p.phase)}
                  className={`absolute inset-y-0 border-r border-border text-[10px] leading-8 text-muted ${i % 2 ? "bg-surface" : ""}`}
                  style={{ left: pct(p.start), width: `calc(${pct(p.end ?? end)} - ${pct(p.start)})` }}
                >
                  <span className="truncate px-1">{phaseLabel(p.phase)}</span>
                </span>
              ))}
              {flags.map((f, i) => (
                <span
                  key={i}
                  title={`${SIGNALS[f.signal] ?? f.signal} at ${mmss(f.at - start)}`}
                  className="absolute inset-y-0 w-0.5 bg-danger"
                  style={{ left: pct(f.at) }}
                />
              ))}
              <span className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: pct(t) }} />
            </div>
          </div>
          <Transcript lines={utterances} start={start} now={lineNow} phases={phases} onSeek={seek} />
        </div>

        {(codes.length > 0 || runs.length > 0) && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="h-80 overflow-hidden rounded-md border border-border">
              {code ? (
                <CodeView code={code.code} language={code.language as Language} />
              ) : (
                <p className="p-4 text-sm text-muted">No code yet at this point.</p>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-xs font-medium text-muted">
                Code timeline · {codes.length} snapshots{code ? ` · showing ${mmss(code.at - start)}` : ""}
              </p>
              <input
                type="range"
                min={0}
                max={Math.max(0, codes.length - 1)}
                value={code ? codes.indexOf(code) : 0}
                onChange={(e) => seek(codes[Number(e.target.value)].at)}
                className="w-full accent-foreground"
                aria-label="Code timeline"
              />
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {runs.map((r, i) => {
                  const res = r.result as RunResult & { final?: boolean };
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded px-1 text-left hover:bg-surface-hover"
                        onClick={() => seek(r.at)}
                      >
                        <span>
                          {res.final ? "Final " : ""}
                          {res.suite} tests ({r.by}) ·{" "}
                          <span className={res.passed === res.total ? "text-success" : "text-danger"}>
                            {res.passed}/{res.total}
                          </span>{" "}
                          {res.status}
                        </span>
                        <span className="text-xs text-muted tabular-nums">{mmss(r.at - start)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {boards.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                Whiteboard timeline · {boards.length} snapshots{board ? ` · showing ${mmss(board.at - start)}` : ""}
              </span>
              {board?.change && <span className="truncate pl-4">{board.change}</span>}
            </div>
            <input
              type="range"
              min={0}
              max={boards.length - 1}
              value={board ? boards.indexOf(board) : 0}
              onChange={(e) => seek(boards[Number(e.target.value)].at)}
              className="w-full accent-foreground"
              aria-label="Whiteboard timeline"
            />
            <div className="h-96 overflow-hidden rounded-md border border-border">
              {board ? (
                <BoardView elements={board.elements} />
              ) : (
                <p className="p-4 text-sm text-muted">Nothing drawn yet at this point.</p>
              )}
            </div>
          </div>
        )}
      </Card>

      {ai && (
        <>
          {ai.sections.map((s) => (
            <Card
              key={s.phase}
              id={`section-${s.phase}`}
              title={`${phaseLabel(s.phase)} · ${s.score ?? "Not assessed"}${s.score ? "/5" : ""}`}
            >
              <p className="text-sm leading-relaxed">{s.feedback || "No feedback for this section."}</p>
              {s.phase === "resume" && ai.claims.length > 0 && (
                <table className="mt-4 w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 pr-3 font-normal">Resume claim</th>
                      <th className="py-1 pr-3 font-normal">Result</th>
                      <th className="py-1 font-normal">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ai.claims.map((c) => (
                      <tr key={c.id} className="align-top">
                        <td className="py-2 pr-3">{c.text}</td>
                        <td className={`py-2 pr-3 font-medium whitespace-nowrap ${CLAIM_TONE[c.status]}`}>
                          {CLAIM_LABEL[c.status]}
                        </td>
                        <td className="py-2 text-muted">
                          <span className="line-clamp-2" title={c.evidence}>
                            {c.evidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          ))}

          <Card title="Competencies" hint="Scored 1-5 against the role's rubric.">
            <ul className="divide-y divide-border">
              {ai.competencies.map((c) => {
                const def = data.rubric.find((r) => r.id === c.id);
                return (
                  <li key={c.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        {def && <p className="text-xs text-muted">{def.description}</p>}
                      </div>
                      <span className={`shrink-0 text-lg font-medium tabular-nums ${scoreTone(c.score)}`}>
                        {c.score ? `${c.score}/5` : "Not assessed"}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{c.rationale}</p>
                    {def && (c.evidence.length > 0 || c.score) && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs text-link">
                          Why this score
                          {c.evidence.length
                            ? ` · ${c.evidence.length} moment${c.evidence.length === 1 ? "" : "s"}`
                            : ""}
                        </summary>
                        {c.evidence.length > 0 && (
                          <div className="mt-2">
                            <EvidenceList items={c.evidence} start={start} onSeek={seek} />
                          </div>
                        )}
                        <ol className="mt-2 space-y-1">
                          {def.levels.map((l, i) => (
                            <li
                              key={i}
                              className={`flex gap-2 rounded px-2 py-1 ${c.score === i + 1 ? "bg-surface font-medium" : "text-muted"}`}
                            >
                              <span className="w-4 shrink-0 tabular-nums">{i + 1}</span>
                              <span className="flex-1">{l}</span>
                              {c.score === i + 1 && <span className="shrink-0 text-xs text-success">Landed</span>}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card id="integrity" title="Integrity signals" hint="Check the moment before acting on a flag.">
            {integrity!.signals.length ? (
              <ul className="divide-y divide-border text-sm">
                {integrity!.signals.map((s) => {
                  const off = dismissed.has(s.signal);
                  return (
                    <li
                      key={s.signal}
                      className={`flex flex-wrap items-center justify-between gap-2 py-2 ${off ? "opacity-50" : ""}`}
                    >
                      <button type="button" className="text-left hover:underline" onClick={() => seek(s.first)}>
                        <span className="font-medium">{SIGNALS[s.signal] ?? s.signal}</span> · {s.count}×{" "}
                        {s.hard && <span className="text-danger">(paused the interview)</span>}
                        <span className="ml-2 text-xs text-muted tabular-nums">first at {mmss(s.first - start)}</span>
                      </button>
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
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">No integrity issues detected.</p>
            )}
          </Card>
        </>
      )}

      <Decision data={data} />
    </div>
  );
}

function Transcript({
  lines,
  start,
  now,
  phases,
  onSeek,
}: {
  lines: { at: number; role: "agent" | "candidate"; text: string }[];
  start: number;
  now: { at: number } | null;
  phases: { phase: PhaseId; start: number }[];
  onSeek: (ms: number) => void;
}) {
  return (
    <div className="flex max-h-[28rem] min-h-0 flex-col rounded-md border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="font-medium">Transcript</span>
        <select
          aria-label="Go to section"
          className="h-7 rounded border border-border bg-surface px-1"
          defaultValue=""
          onChange={(e) => e.target.value && onSeek(Number(e.target.value))}
        >
          <option value="">Go to…</option>
          {phases.map((p, i) => (
            <option key={i} value={p.start}>
              {phaseLabel(p.phase)}
            </option>
          ))}
        </select>
      </div>
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 text-sm">
        {lines.map((l, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onSeek(l.at)}
              className={`w-full rounded px-2 py-1.5 text-left hover:bg-surface-hover ${now === l ? "bg-surface" : ""}`}
              ref={(el) => void (now === l && el?.scrollIntoView({ block: "nearest" }))}
            >
              <span className="mb-0.5 flex justify-between text-xs text-muted">
                <span className="font-medium">{l.role === "agent" ? "Interviewer" : "Candidate"}</span>
                <span className="tabular-nums">{mmss(l.at - start)}</span>
              </span>
              <span className={l.role === "candidate" ? "text-foreground" : "text-foreground/80"}>{l.text}</span>
            </button>
          </li>
        ))}
        {!lines.length && <li className="p-2 text-muted">No transcript.</li>}
      </ol>
    </div>
  );
}

const KIND_LABEL = {
  transcript: "Transcript",
  code: "Code",
  run: "Test run",
  whiteboard: "Whiteboard",
  note: "Interviewer note",
} as const;

function EvidenceList({ items, start, onSeek }: { items: Evidence[]; start: number; onSeek: (ms: number) => void }) {
  return (
    <ul className="space-y-1.5">
      {items.map((e) => (
        <li key={e.ref}>
          <button
            type="button"
            onClick={() => onSeek(e.at)}
            className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-surface-hover"
          >
            <span className="flex justify-between gap-2 text-xs text-muted">
              <span>{KIND_LABEL[e.kind]}</span>
              <span className="tabular-nums">▶ {mmss(e.at - start)}</span>
            </span>
            <span className="line-clamp-2">“{e.quote}”</span>
            {e.note && <span className="block text-xs text-muted">{e.note}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Pending({ status, jobId, applicantId }: { status: string; jobId: string; applicantId: string }) {
  const [busy, setBusy] = useState(false);
  if (status === "failed")
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">The AI evaluation didn&apos;t finish. The recording and transcript are saved.</p>
        <button
          type="button"
          aria-busy={busy}
          disabled={busy}
          className={`${btnOutline} h-9`}
          onClick={async () => (setBusy(true), await retryInterview(jobId, applicantId), location.reload())}
        >
          Retry evaluation
        </button>
      </div>
    );
  return (
    <p className="text-sm text-muted">
      {status === "live"
        ? "The interview is in progress."
        : status === "processing"
          ? "Evaluating… this takes a minute or two."
          : "Not taken yet."}
    </p>
  );
}

/** Kept away from Save decision (it's permanent): lives on the playback card, and always asks first. */
function DeleteRecordings({ jobId, applicantId }: { jobId: string; applicantId: string }) {
  return (
    <button
      type="button"
      className={`${btnGhost} h-8 text-xs text-muted hover:text-danger`}
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
        await removeRecordings(jobId, applicantId);
        location.reload();
      }}
    >
      <Icon d={icons.trash} size={14} />
      Delete recordings
    </button>
  );
}

function Decision({ data }: { data: AiReportData }) {
  const [value, setValue] = useState(data.decision?.value ?? "");
  const [note, setNote] = useState(data.decision?.note ?? "");
  const [state, setState] = useState<"" | "saving" | "saved" | string>("");
  return (
    <Card title="Your decision" hint="The AI recommends; you decide. Advance and Reject also move the application.">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("saving");
          const r = await decideInterview(data.jobId, data.applicantId, value, note);
          setState("error" in r ? r.error : "saved");
        }}
      >
        <div role="radiogroup" aria-label="Decision" className="flex flex-wrap gap-2">
          {Object.entries(DECISIONS).map(([k, label]) => (
            <label
              key={k}
              className={`flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${value === k ? "border-foreground bg-surface" : "border-border"}`}
            >
              <input
                type="radio"
                name="decision"
                value={k}
                checked={value === k}
                onChange={() => setValue(k)}
                className="accent-foreground"
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
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <span />
          <span className="flex items-center gap-3">
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
          </span>
        </div>
      </form>
    </Card>
  );
}
