"use client";

/** The multiple-choice screening test: timed questions, saved answers, submit. */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { answer, finishTest } from "@/app/interview/actions";
import type { McqPublic } from "@/lib/screening/fields";
import { Alert, primary } from "../onboarding";
import { ask } from "../kit";
import { btnGhost, Icon, icons } from "../ui";

const chevron = "m9 18 6-6-6-6";

const LETTERS = "ABCDEF";
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * One question at a time with a jump grid, like most online assessments. Each pick is saved right away (a reload
 * resumes here); at zero the test submits itself. The server holds the clock and the key, this only mirrors them.
 */
export function McqTest({
  slug,
  test,
  onDone,
}: {
  slug: string;
  test: { questions: McqPublic[]; answers: number[]; left: number };
  onDone: () => void;
}) {
  const qs = test.questions;
  const [answers, setAnswers] = useState(test.answers);
  const [at, setAt] = useState(() =>
    Math.max(
      0,
      test.answers.findIndex((a) => a < 0),
    ),
  );
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
    const r = await finishTest(slug).catch(() => ({
      error: "Couldn't reach the server. Check your connection and try again.",
    }));
    if ("error" in r) return ((done.current = false), setBusy(false), setError(r.error));
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
    const r = await answer(slug, at, v).catch(() => ({
      error: "That answer didn't save. Check your connection and pick it again.",
    }));
    if (!("error" in r)) return;
    if (r.error.startsWith("Time's up") || r.error.includes("submitted")) return onDone();
    setError(r.error);
  }

  async function confirmSubmit() {
    const open = qs.length - answered;
    const ok = await ask({
      title: "Submit your test?",
      body: open
        ? `${open} question${open === 1 ? " is" : "s are"} unanswered. You can't change answers after submitting.`
        : "You can't change answers after submitting.",
      confirm: "Submit",
    });
    if (ok) void submit();
  }

  const low = left <= 60_000;
  return (
    <div className="space-y-6">
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Question <span className="font-medium text-foreground tabular-nums">{at + 1}</span> of {qs.length}
          </span>
          <span
            className={`flex items-center gap-1.5 tabular-nums ${low ? "font-medium text-danger" : ""}`}
            suppressHydrationWarning
          >
            <Icon d={icons.clock} size={14} />
            {clock(left)}
          </span>
          <span className="sr-only" aria-live="assertive">
            {low && left > 0 ? "One minute left" : ""}
          </span>
        </div>
        <div
          className="h-1 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="Answered"
          aria-valuemin={0}
          aria-valuemax={qs.length}
          aria-valuenow={answered}
        >
          <div
            className="h-full bg-foreground transition-[width]"
            style={{ width: `${(answered / qs.length) * 100}%` }}
          />
        </div>
      </div>

      <fieldset key={at} className="space-y-4">
        <legend className="mb-4 text-sm leading-relaxed font-medium whitespace-pre-wrap break-words">{q.q}</legend>
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
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-medium ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted"}`}
                >
                  {LETTERS[i]}
                </span>
                <span className="min-w-0 pt-0.5 break-words">{o}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && <Alert>{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <button type="button" className={btnGhost} disabled={at === 0} onClick={() => setAt(at - 1)}>
          Previous
        </button>
        {at < qs.length - 1 ? (
          <button type="button" className={primary} onClick={() => setAt(at + 1)}>
            Next
            <Icon d={chevron} size={16} />
          </button>
        ) : (
          <button aria-busy={busy} type="button" className={primary} disabled={busy} onClick={confirmSubmit}>
            Submit test
          </button>
        )}
      </div>

      <nav aria-label="All questions" className="border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span>
            {answered} of {qs.length} answered
          </span>
          {at < qs.length - 1 && (
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              disabled={busy}
              onClick={confirmSubmit}
            >
              Submit early
            </button>
          )}
        </div>
        <ol className="flex flex-wrap gap-1.5">
          {qs.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                aria-label={`Question ${i + 1}${answers[i] >= 0 ? ", answered" : ""}`}
                aria-current={i === at ? "step" : undefined}
                onClick={() => setAt(i)}
                className={`size-10 rounded-md border text-xs tabular-nums sm:size-9 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${i === at ? "border-foreground font-medium" : "border-border"} ${answers[i] >= 0 ? "bg-foreground/10 text-foreground" : "text-muted hover:bg-surface-hover"}`}
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
