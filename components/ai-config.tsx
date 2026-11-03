"use client";

import { useState } from "react";
import {
  BARS,
  capMinutes,
  DEFAULT_RUBRIC,
  defaultConfig,
  difficultyOf,
  LEVELS,
  LIMITS,
  PHASES,
  PHASE_ORDER,
  weightOf,
  type Bar,
  type Competency,
  type Level,
  type PhaseId,
  type RoleConfig,
  type Timing,
} from "@/lib/harness";
import { btnGhost, Icon, icons } from "./ui";

const field =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring sm:h-9";
const area =
  "w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring";
// Minutes: its own compact control (the shared field style is full width and would push the row out of the column)
const minutesField =
  "h-10 w-16 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring sm:h-9";
const WEIGHTS = [
  [0, "Off"],
  [1, "Normal"],
  [2, "High"],
  [3, "Critical"],
] as const;

const toLines = (s: string) => s.split("\n");
/** Problems are separated by a blank line (a problem itself can span lines). */
const toProblems = (s: string) =>
  s
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** A row of mutually exclusive choices, styled like the screening picker. */
function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-8 rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === v ? "border-foreground bg-surface font-medium" : "border-border text-muted hover:bg-surface-hover"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * The post form's AI interview setup. The interview adapts live; the recruiter only says who it's for (level),
 * what to cover (rounds, optional design sketch, optional own coding problems), what to ask at each stage, and how
 * to judge (bar, competency weights). Posts as `aiConfig` (JSON).
 */
export function AiConfigEditor({
  initial,
  locked,
  defaultLevel,
}: {
  initial: RoleConfig | null;
  locked: boolean;
  defaultLevel?: Level;
}) {
  const [c, setC] = useState<RoleConfig>(initial ?? defaultConfig(defaultLevel));
  const [ownProblems, setOwnProblems] = useState(c.coding.problems.length > 0);
  const [problemText, setProblemText] = useState(c.coding.problems.join("\n\n"));
  const [showRubric, setShowRubric] = useState(false);
  const coding = c.phases.some((p) => p.id === "coding");
  const minutes = c.phases.reduce((s, p) => s + p.minutes, 0);
  // What gets posted: own problems only while that option is on
  const posted: RoleConfig = {
    ...c,
    coding: { problems: ownProblems ? toProblems(problemText).slice(0, LIMITS.problems) : [] },
  };

  const setPhases = (ids: PhaseId[]) =>
    setC({
      ...c,
      phases: PHASE_ORDER.filter((x) => ids.includes(x)).map(
        (x) => c.phases.find((p) => p.id === x) ?? { id: x, minutes: PHASES[x].minutes },
      ),
    });
  const setMinutes = (id: PhaseId, m: number) =>
    setC({ ...c, phases: c.phases.map((p) => (p.id === id ? { ...p, minutes: m } : p)) });
  const setQuestions = (k: keyof RoleConfig["questions"], text: string) =>
    setC({ ...c, questions: { ...c.questions, [k]: toLines(text) } });
  const minutesOf = (id: PhaseId) => c.phases.find((p) => p.id === id)?.minutes ?? PHASES[id].minutes;
  const minutesInput = (id: PhaseId) => (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
      <input
        type="number"
        min={LIMITS.minMinutes}
        max={LIMITS.maxMinutes}
        value={minutesOf(id)}
        onChange={(e) => setMinutes(id, Math.round(Number(e.target.value) || 1))}
        aria-label={`${PHASES[id].label} minutes`}
        className={minutesField}
      />
      min
    </label>
  );

  return (
    <div className="space-y-6">
      <input type="hidden" name="aiConfig" value={JSON.stringify(posted)} />
      {locked && (
        <p className="rounded-md border border-border px-3 py-2 text-xs text-muted">
          A candidate has started, so the setup is locked to keep reports comparable. You can still change the deadline.
        </p>
      )}
      <fieldset disabled={locked} className="space-y-6 disabled:opacity-60">
        <Block
          title="Candidate level"
          hint={`Sets how hard and how deep the interview goes, and what a good score means: ${LEVELS[c.level].expect}.`}
        >
          <Choice
            label="Candidate level"
            value={c.level}
            options={Object.entries(LEVELS).map(([k, v]) => [k as Level, v.label] as const)}
            onChange={(level) => setC({ ...c, level })}
          />
        </Block>

        <Block
          title="Timing"
          hint={
            c.timing === "flexible"
              ? `No fixed time per section: the minutes below are a guide, and the interviewer moves on when each part is done. The interview can run up to ${LIMITS.flexibleMinutes} minutes.`
              : "Each section gets its minutes, and the interviewer moves on when they're up."
          }
        >
          <Choice<Timing>
            label="Timing"
            value={c.timing}
            options={[
              ["fixed", `Fixed (up to ${LIMITS.maxTotalMinutes} min)`],
              ["flexible", `Flexible (up to ${LIMITS.flexibleMinutes} min)`],
            ]}
            onChange={(timing) => setC({ ...c, timing })}
          />
        </Block>

        <Block
          title="Interview"
          hint={
            minutes > capMinutes(c)
              ? `${minutes} min is over the ${capMinutes(c)}-minute limit: each section will be shortened to fit.`
              : c.timing === "flexible"
                ? `About ${minutes} min as a guide (up to ${capMinutes(c)}). The interviewer adapts its questions to each candidate's answers and resume.`
                : `${minutes} min in total (max ${capMinutes(c)}). The interviewer adapts its questions to each candidate's answers and resume.`
          }
        >
          <ol className="divide-y divide-border rounded-lg border border-border">
            <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Intro</span>
                <span className="block text-xs text-muted">
                  Confirms their name, the format, their introduction, and your opening questions.
                </span>
              </span>
              {minutesInput("intro")}
            </li>
            <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{PHASES.resume.label}</span>
                <span className="block text-xs text-muted">
                  One or two of their own projects in depth, checking the claims on their resume.
                </span>
              </span>
              {minutesInput("resume")}
            </li>
            <li className="space-y-3 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{PHASES.technical.label}</span>
                  <span className="block text-xs text-muted">
                    Technical questions grounded in their resume and this role.
                  </span>
                </span>
                {minutesInput("technical")}
              </div>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={c.design.enabled}
                  onChange={(e) => setC({ ...c, design: { ...c.design, enabled: e.target.checked } })}
                  className="mt-0.5 size-4 shrink-0 accent-foreground"
                />
                <span>
                  <span className="block">Include a system design sketch</span>
                  <span className="block text-xs text-muted">
                    The interviewer opens a whiteboard in this section, usually about a system they built.
                  </span>
                </span>
              </label>
              {c.design.enabled && (
                <textarea
                  rows={2}
                  value={c.design.topics.join("\n")}
                  onChange={(e) => setC({ ...c, design: { ...c.design, topics: toLines(e.target.value) } })}
                  maxLength={LIMITS.topics * 201}
                  aria-label="Design topics"
                  placeholder={
                    "Optional design topics, one per line, e.g. Design a rate limiter for our public API.\nLeave empty and the interviewer picks one from their projects and switches if they don't know it."
                  }
                  className={area}
                />
              )}
            </li>
            <li className="space-y-3 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label="Include a coding round"
                  checked={coding}
                  onChange={(e) =>
                    setPhases([
                      ...c.phases.map((p): PhaseId => p.id).filter((id) => id !== "coding"),
                      ...(e.target.checked ? (["coding"] as const) : []),
                    ])
                  }
                  className="size-4 shrink-0 accent-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Coding</span>
                  <span className="block text-xs text-muted">
                    A live problem in a code editor, with tests. Six languages.
                  </span>
                </span>
                {coding && minutesInput("coding")}
              </div>
              {coding && (
                <div className="space-y-3 pl-6.5">
                  <Choice
                    label="Coding problems"
                    value={ownProblems ? "own" : "ai"}
                    options={[
                      ["ai", "Write problems for each candidate"],
                      ["own", "Use my problems"],
                    ]}
                    onChange={(v) => setOwnProblems(v === "own")}
                  />
                  {ownProblems ? (
                    <textarea
                      rows={5}
                      value={problemText}
                      onChange={(e) => setProblemText(e.target.value)}
                      maxLength={LIMITS.problems * (LIMITS.problemChars + 2)}
                      aria-label="Your coding problems"
                      placeholder={
                        "Paste up to 3 problems. Separate them with a blank line.\n\nGiven a list of transactions, return the accounts whose balance ever went negative."
                      }
                      className={area}
                    />
                  ) : (
                    <p className="text-xs text-muted">
                      A fresh problem and two backups are written for the role, level and the candidate&apos;s stack,
                      then checked against a reference solution. If a candidate doesn&apos;t know the problem type, the
                      interviewer switches to a backup.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted">Difficulty</p>
                    <Choice
                      label="Difficulty"
                      value={c.difficulty}
                      options={[
                        ["auto", `Match the level (${difficultyOf({ level: c.level, difficulty: "auto" })})`],
                        ["easy", "Easy"],
                        ["medium", "Medium"],
                        ["hard", "Hard"],
                      ]}
                      onChange={(difficulty) => setC({ ...c, difficulty })}
                    />
                  </div>
                </div>
              )}
            </li>
            <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Wrap-up</span>
                <span className="block text-xs text-muted">Your closing questions, then theirs about the role.</span>
              </span>
              {minutesInput("wrapup")}
            </li>
          </ol>
        </Block>

        <Block
          title="Your questions"
          hint={`Optional. One per line, up to ${LIMITS.questions} each. The interviewer asks them naturally and follows up.`}
        >
          {(
            [
              ["intro", "Opening", "Tell me about yourself and why this role."],
              ["main", "Technical", "How do you decide between SQL and NoSQL for a new service?"],
              ["wrapup", "Closing", "What's your notice period and expected salary?"],
            ] as const
          ).map(([k, label, eg]) => (
            <label key={k} className="block space-y-1">
              <span className="text-xs text-muted">{label}</span>
              <textarea
                rows={2}
                value={c.questions[k].join("\n")}
                onChange={(e) => setQuestions(k, e.target.value)}
                maxLength={LIMITS.questions * (LIMITS.questionChars + 1)}
                placeholder={eg}
                className={area}
              />
            </label>
          ))}
        </Block>

        <Block title="How to judge" hint={BARS[c.bar].hint}>
          <Choice
            label="Bar"
            value={c.bar}
            options={Object.entries(BARS).map(([k, v]) => [k as Bar, v.label] as const)}
            onChange={(bar) => setC({ ...c, bar })}
          />
          <ul className="divide-y divide-border rounded-lg border border-border">
            {c.rubric.map((comp, i) => (
              <li key={comp.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{comp.name}</span>
                  <span className="block text-xs text-muted">{comp.description}</span>
                </span>
                <Choice
                  label={`${comp.name} weight`}
                  value={weightOf(comp)}
                  options={WEIGHTS}
                  onChange={(weight) =>
                    setC({ ...c, rubric: c.rubric.map((x, k) => (k === i ? { ...x, weight } : x)) })
                  }
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${btnGhost} -ml-2`}
            onClick={() => setShowRubric(!showRubric)}
            aria-expanded={showRubric}
          >
            <Icon d={showRubric ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} size={14} />
            Edit the rubric (what each score from 1 to 5 means)
          </button>
          {showRubric && <RubricEditor rubric={c.rubric} onChange={(rubric) => setC({ ...c, rubric })} />}
        </Block>
      </fieldset>
    </div>
  );
}

function RubricEditor({ rubric, onChange }: { rubric: Competency[]; onChange: (r: Competency[]) => void }) {
  const set = (i: number, patch: Partial<Competency>) =>
    onChange(rubric.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  return (
    <div className="mt-3 space-y-3">
      {rubric.map((c, i) => (
        <details key={i} className="rounded-lg border border-border">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="font-medium">{c.name || "Untitled competency"}</span>
            <button
              type="button"
              aria-label={`Remove ${c.name}`}
              className="text-muted hover:text-danger"
              onClick={(e) => {
                e.preventDefault();
                onChange(rubric.filter((_, k) => k !== i));
              }}
              disabled={rubric.length <= 1}
            >
              <Icon d={icons.trash} size={14} />
            </button>
          </summary>
          <div className="space-y-2 border-t border-border p-3">
            <input
              value={c.name}
              onChange={(e) => set(i, { name: e.target.value })}
              maxLength={60}
              placeholder="Name"
              aria-label="Competency name"
              className={field}
            />
            <input
              value={c.description}
              onChange={(e) => set(i, { description: e.target.value })}
              maxLength={300}
              placeholder="What it measures"
              aria-label="Competency description"
              className={field}
            />
            {c.levels.map((l, k) => (
              <label key={k} className="flex items-center gap-2 text-xs text-muted">
                <span className="w-4 tabular-nums">{k + 1}</span>
                <input
                  value={l}
                  onChange={(e) =>
                    set(i, { levels: c.levels.map((x, j) => (j === k ? e.target.value : x)) as Competency["levels"] })
                  }
                  maxLength={300}
                  aria-label={`Level ${k + 1}`}
                  className={field}
                />
              </label>
            ))}
          </div>
        </details>
      ))}
      <div className="flex gap-2">
        {rubric.length < 8 && (
          <button
            type="button"
            className={`${btnGhost} border border-border`}
            onClick={() =>
              onChange([
                ...rubric,
                { id: `custom_${rubric.length + 1}`, name: "", description: "", levels: ["", "", "", "", ""] },
              ])
            }
          >
            <Icon d={icons.plus} size={14} />
            Add competency
          </button>
        )}
        <button type="button" className={btnGhost} onClick={() => onChange(DEFAULT_RUBRIC)}>
          Reset to default
        </button>
      </div>
    </div>
  );
}
