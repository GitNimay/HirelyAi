"use client";

import { useState } from "react";
import { defaultConfig, DEFAULT_RUBRIC, LIMITS, PHASES, PHASE_ORDER, type Competency, type PhaseId, type RoleConfig } from "@/lib/harness";
import { DESIGN_META, PROBLEM_META } from "@/lib/workspace";
import { btnGhost, Icon, icons } from "./ui";

const field =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring sm:h-9";
// Minutes: its own compact control (the shared field style is full width and would push the row out of the column)
const minutesField =
  "h-10 w-16 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring sm:h-9";
const TONE = { easy: "text-success", medium: "text-muted", hard: "text-danger" } as const;
const OPTIONAL: PhaseId[] = ["resume", "coding", "design"]; // intro and wrap-up always run

/**
 * The post form's AI interview setup: which rounds run and for how long, the coding and design pools the plan
 * picks from (by seniority), the rubric, and the recruiter's own questions. Posts as `aiConfig` (JSON) + `questions`.
 */
export function AiConfigEditor({ initial, questions, locked }: { initial: RoleConfig | null; questions: string[]; locked: boolean }) {
  const [c, setC] = useState<RoleConfig>(initial ?? defaultConfig());
  const [showRubric, setShowRubric] = useState(false);
  const on = (id: PhaseId) => c.phases.some((p) => p.id === id);
  const minutes = c.phases.reduce((s, p) => s + p.minutes, 0);

  function toggle(id: PhaseId) {
    const ids = new Set(c.phases.map((p) => p.id));
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setC({ ...c, phases: PHASE_ORDER.filter((x) => ids.has(x)).map((x) => c.phases.find((p) => p.id === x) ?? { id: x, minutes: PHASES[x].minutes }) });
  }
  const setMinutes = (id: PhaseId, m: number) => setC({ ...c, phases: c.phases.map((p) => (p.id === id ? { ...p, minutes: m } : p)) });
  const pick = (key: "problems" | "designs", id: string) =>
    setC({ ...c, [key]: c[key].includes(id) ? c[key].filter((x) => x !== id) : [...c[key], id] });
  const setRubric = (rubric: Competency[]) => setC({ ...c, rubric });

  return (
    <div className="space-y-5">
      <input type="hidden" name="aiConfig" value={JSON.stringify(c)} />
      {locked && <p className="rounded-md border border-border px-3 py-2 text-xs text-muted">A candidate has started, so rounds, pools and the rubric are locked. You can still change the deadline.</p>}
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-60">
        <div>
          <p className="mb-2 text-sm font-medium">
            Rounds <span className="font-normal text-muted">· {minutes} min in total (max {LIMITS.maxTotalMinutes})</span>
          </p>
          <ol className="divide-y divide-border rounded-lg border border-border">
            {PHASE_ORDER.map((id) => {
              const optional = OPTIONAL.includes(id);
              const p = c.phases.find((x) => x.id === id);
              return (
                <li key={id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Include ${PHASES[id].label}`}
                    checked={!!p}
                    disabled={!optional}
                    onChange={() => toggle(id)}
                    className="size-4 shrink-0 accent-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{PHASES[id].label}</span>
                    <span className="block truncate text-xs text-muted">{optional ? PHASES[id].goal : `Always on · ${PHASES[id].goal}`}</span>
                  </span>
                  {p && (
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                      <input
                        type="number"
                        min={LIMITS.minMinutes}
                        max={LIMITS.maxMinutes}
                        value={p.minutes}
                        onChange={(e) => setMinutes(id, Math.round(Number(e.target.value) || 1))}
                        aria-label={`${PHASES[id].label} minutes`}
                        className={minutesField}
                      />
                      min
                    </label>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {on("coding") && (
          <Pool
            title="Coding problems"
            hint="The interview picks one matching the role's seniority from these."
            items={PROBLEM_META}
            chosen={c.problems}
            onPick={(id) => pick("problems", id)}
          />
        )}
        {on("design") && (
          <Pool
            title="System design prompts"
            hint="One is picked by seniority. Candidates draw on a whiteboard."
            items={DESIGN_META}
            chosen={c.designs}
            onPick={(id) => pick("designs", id)}
          />
        )}

        <div>
          <label htmlFor="ai-questions" className="mb-1.5 block text-sm font-medium">
            Your questions <span className="font-normal text-muted">· optional, one per line, up to {LIMITS.questions}</span>
          </label>
          <textarea
            id="ai-questions"
            name="questions"
            rows={3}
            defaultValue={questions.join("\n")}
            maxLength={LIMITS.questions * (LIMITS.questionChars + 1)}
            placeholder={"Tell me about a time you disagreed with a technical decision.\nWhy this role?"}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="mt-1 text-xs text-muted">Asked after the resume deep-dive. The interviewer also verifies each applicant&apos;s resume claims automatically.</p>
        </div>

        <div>
          <button type="button" className={`${btnGhost} -ml-2`} onClick={() => setShowRubric(!showRubric)} aria-expanded={showRubric}>
            <Icon d={showRubric ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} size={14} />
            Rubric · {c.rubric.length} competencies scored 1-5
          </button>
          {showRubric && <RubricEditor rubric={c.rubric} onChange={setRubric} />}
        </div>
      </fieldset>
    </div>
  );
}

function Pool({
  title,
  hint,
  items,
  chosen,
  onPick,
}: {
  title: string;
  hint: string;
  items: readonly { id: string; title: string; difficulty: keyof typeof TONE }[];
  chosen: string[];
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const sel = chosen.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              aria-pressed={sel}
              onClick={() => onPick(it.id)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${sel ? "border-foreground bg-surface" : "border-border text-muted hover:bg-surface-hover"}`}
            >
              {sel && <Icon d={icons.check} size={12} />}
              {it.title}
              <span className={`capitalize ${TONE[it.difficulty]}`}>· {it.difficulty}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RubricEditor({ rubric, onChange }: { rubric: Competency[]; onChange: (r: Competency[]) => void }) {
  const set = (i: number, patch: Partial<Competency>) => onChange(rubric.map((c, k) => (k === i ? { ...c, ...patch } : c)));
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
              onClick={(e) => (e.preventDefault(), onChange(rubric.filter((_, k) => k !== i)))}
              disabled={rubric.length <= 1}
            >
              <Icon d={icons.trash} size={14} />
            </button>
          </summary>
          <div className="space-y-2 border-t border-border p-3">
            <input value={c.name} onChange={(e) => set(i, { name: e.target.value, ...(c.id ? {} : { id: e.target.value }) })} maxLength={60} placeholder="Name" aria-label="Competency name" className={field} />
            <input value={c.description} onChange={(e) => set(i, { description: e.target.value })} maxLength={300} placeholder="What it measures" aria-label="Competency description" className={field} />
            {c.levels.map((l, k) => (
              <label key={k} className="flex items-center gap-2 text-xs text-muted">
                <span className="w-4 tabular-nums">{k + 1}</span>
                <input
                  value={l}
                  onChange={(e) => set(i, { levels: c.levels.map((x, j) => (j === k ? e.target.value : x)) as Competency["levels"] })}
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
            onClick={() => onChange([...rubric, { id: `custom_${rubric.length + 1}`, name: "", description: "", levels: ["", "", "", "", ""] }])}
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
