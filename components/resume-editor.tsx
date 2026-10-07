"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { saveMyResume } from "@/app/onboarding/actions";
import type { CompanyCard } from "@/lib/companies";
import {
  emptyEducation, emptyExperience, emptyProject, LIMITS, missingFields, STATUSES,
  type Education, type Experience, type Project, type Resume, type Status,
} from "@/lib/resume-fields";
import { CompanyPicker } from "./company";
import { ask, leaveIfClean, Modal, toast, useUnsavedGuard } from "./kit";
import { Block, ExperienceItem } from "./resume-view";
import { backBtn, btnGhost, btnPrimary, Icon, icons } from "./ui";

export const input = "h-10 w-full rounded-md border bg-transparent px-3 text-sm text-foreground placeholder:text-muted outline-none transition-colors duration-150 focus:border-ring disabled:opacity-50";
const area = `${input} h-auto resize-y py-2`;
const ring = (bad: boolean) => (bad ? "border-danger" : "border-border");

/** One labelled control. `bad` outlines it and says why. */
export function F({ label, hint, bad, children, className = "" }: { label: string; hint?: string; bad?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {bad ? <span className="text-xs font-normal text-danger">Required</span> : hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** Student / Fresher / Working professional as a segmented control. */
export function StatusPicker({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <div role="radiogroup" aria-label="Current status" className="grid grid-cols-3 gap-1 rounded-lg border border-border p-1">
      {(Object.keys(STATUSES) as Status[]).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={`h-8 rounded-md text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === s ? "bg-foreground font-medium text-background" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}
        >
          {STATUSES[s]}
        </button>
      ))}
    </div>
  );
}

/** Chips you add with Enter or a comma, and remove with × or Backspace. */
export function Tags({ value, onChange, placeholder, bad, max, suggestions = [] }: {
  value: string[]; onChange: (v: string[]) => void; placeholder: string; bad?: boolean; max: number; suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const next = raw.split(",").map((t) => t.trim()).filter((t) => t && !value.some((v) => v.toLowerCase() === t.toLowerCase()));
    if (next.length) onChange([...value, ...next].slice(0, max));
    setDraft("");
  };
  const unused = suggestions.filter((s) => s && !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div>
      <div className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors duration-150 focus-within:border-ring ${ring(!!bad)}`}>
        {value.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-hover pl-2 pr-1 text-xs">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))} className="rounded p-0.5 text-muted hover:text-foreground">
              <Icon d={icons.close} size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : placeholder}
          disabled={value.length >= max}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unused.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border px-2 text-xs text-muted hover:border-foreground hover:text-foreground">
              <Icon d={icons.plus} size={11} />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, bad, onAdd, addLabel, children }: { title: string; hint?: string; bad?: boolean; onAdd?: () => void; addLabel?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border pt-6 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          {bad ? <p className="mt-1 text-sm text-danger">Add at least one</p> : hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
        </div>
        {onAdd && (
          <button type="button" onClick={onAdd} className={btnGhost}>
            <Icon d={icons.plus} size={14} />
            {addLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** A removable card for one list entry. */
function Entry({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  return (
    <div className="relative grid gap-3 rounded-lg border border-border bg-surface/50 p-4 pr-10 sm:grid-cols-2">
      <button type="button" aria-label={`Remove ${label}`} title="Remove" onClick={onRemove} className="absolute right-2 top-2 rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-danger">
        <Icon d={icons.trash} size={14} />
      </button>
      {children}
    </div>
  );
}

/**
 * The whole resume as a form. Controlled: the parent owns `value`.
 * `missing` holds paths from missingFields(); they're outlined once `show` is set (after a save attempt, or right after extraction).
 * `basics: false` hides name/phone/city/status when an earlier step already asked for them.
 */
export function ResumeEditor({ value: r, onChange, missing, show, basics = true }: {
  value: Resume; onChange: (r: Resume) => void; missing: string[]; show: boolean; basics?: boolean;
}) {
  const bad = (path: string) => show && missing.includes(path);
  const set = <K extends keyof Resume>(k: K, v: Resume[K]) => onChange({ ...r, [k]: v });
  const setAt = <K extends "experience" | "education" | "projects">(k: K, i: number, patch: Partial<Resume[K][number]>) =>
    set(k, r[k].map((e, j) => (j === i ? { ...e, ...patch } : e)) as Resume[K]);
  const drop = (k: "experience" | "education" | "projects", i: number) => set(k, r[k].filter((_, j) => j !== i) as never);
  const text = (k: "name" | "headline" | "email" | "phone" | "city" | "summary") => ({ value: r[k], onChange: (e: { target: { value: string } }) => set(k, e.target.value) });

  return (
    <div className="space-y-6">
      {basics && (
        <Section title="Basic details">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Full name" bad={bad("name")}><input {...text("name")} maxLength={50} autoComplete="name" className={`${input} ${ring(bad("name"))}`} /></F>
            <F label="Headline" hint="optional"><input {...text("headline")} maxLength={LIMITS.headline} placeholder="Frontend developer" className={`${input} ${ring(false)}`} /></F>
            <F label="Email" bad={bad("email")}><input {...text("email")} type="email" maxLength={254} autoComplete="email" className={`${input} ${ring(bad("email"))}`} /></F>
            <F label="Phone" bad={bad("phone")}><input {...text("phone")} type="tel" maxLength={30} autoComplete="tel" placeholder="+91 98765 43210" className={`${input} ${ring(bad("phone"))}`} /></F>
            <F label="Current city" bad={bad("city")} className="sm:col-span-2"><input {...text("city")} maxLength={60} autoComplete="address-level2" placeholder="Pune" className={`${input} ${ring(bad("city"))}`} /></F>
          </div>
          <F label="Current status"><StatusPicker value={r.status} onChange={(s) => set("status", s)} /></F>
        </Section>
      )}

      <Section title="About" hint="A short summary recruiters read first. Optional.">
        <textarea {...text("summary")} rows={3} maxLength={LIMITS.summary} placeholder="Frontend developer with 3 years building React apps…" className={`${area} ${ring(false)}`} />
      </Section>

      <Section
        title="Experience"
        hint={r.status === "working" ? "Jobs and internships, most recent first" : "Internships and jobs. Optional."}
        bad={bad("experience")}
        onAdd={() => set("experience", [...r.experience, { ...emptyExperience(), current: r.status === "working" && !r.experience.length }])}
        addLabel="Add"
      >
        {r.experience.map((e: Experience, i) => {
          const p = (f: string) => bad(`experience.${i}.${f}`);
          return (
            <Entry key={i} label="experience" onRemove={() => drop("experience", i)}>
              <F label="Title" bad={p("title")}><input value={e.title} onChange={(ev) => setAt("experience", i, { title: ev.target.value })} maxLength={LIMITS.short} placeholder="Software engineer" className={`${input} ${ring(p("title"))}`} /></F>
              <F label="Company" bad={p("company")}><input value={e.company} onChange={(ev) => setAt("experience", i, { company: ev.target.value, companyId: undefined })} maxLength={LIMITS.short} className={`${input} ${ring(p("company"))}`} /></F>
              <F label="Start" bad={p("start")}><input type="month" value={e.start} onChange={(ev) => setAt("experience", i, { start: ev.target.value })} className={`${input} ${ring(p("start"))}`} /></F>
              <F label="End" bad={p("end")} hint={e.current ? "present" : undefined}>
                <input type="month" value={e.current ? "" : e.end} disabled={e.current} onChange={(ev) => setAt("experience", i, { end: ev.target.value })} className={`${input} ${ring(p("end"))}`} />
              </F>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={e.current} onChange={(ev) => setAt("experience", i, { current: ev.target.checked, end: "" })} className="size-4 accent-[var(--foreground)]" />
                I currently work here
              </label>
              <F label="Location" hint="optional" className="sm:col-span-2"><input value={e.location} onChange={(ev) => setAt("experience", i, { location: ev.target.value })} maxLength={LIMITS.short} className={`${input} ${ring(false)}`} /></F>
              <F label="What you did" hint="one point per line" className="sm:col-span-2">
                <textarea value={e.description} onChange={(ev) => setAt("experience", i, { description: ev.target.value })} rows={3} maxLength={LIMITS.description} className={`${area} ${ring(false)}`} />
              </F>
            </Entry>
          );
        })}
      </Section>

      <Section title="Education" bad={bad("education")} onAdd={() => set("education", [...r.education, emptyEducation()])} addLabel="Add">
        {r.education.map((e: Education, i) => {
          const p = (f: string) => bad(`education.${i}.${f}`);
          return (
            <Entry key={i} label="education" onRemove={() => drop("education", i)}>
              <F label="School or college" bad={p("school")} className="sm:col-span-2"><input value={e.school} onChange={(ev) => setAt("education", i, { school: ev.target.value })} maxLength={LIMITS.short} className={`${input} ${ring(p("school"))}`} /></F>
              <F label="Degree" bad={p("degree")}><input value={e.degree} onChange={(ev) => setAt("education", i, { degree: ev.target.value })} maxLength={LIMITS.short} placeholder="B.Tech" className={`${input} ${ring(p("degree"))}`} /></F>
              <F label="Field of study" hint="optional"><input value={e.field} onChange={(ev) => setAt("education", i, { field: ev.target.value })} maxLength={LIMITS.short} placeholder="Computer Science" className={`${input} ${ring(false)}`} /></F>
              <F label="Start" hint="optional"><input type="month" value={e.start} onChange={(ev) => setAt("education", i, { start: ev.target.value })} className={`${input} ${ring(false)}`} /></F>
              <F label="End" hint="or expected"><input type="month" value={e.end} onChange={(ev) => setAt("education", i, { end: ev.target.value })} className={`${input} ${ring(false)}`} /></F>
              <F label="Grade" hint="optional"><input value={e.grade} onChange={(ev) => setAt("education", i, { grade: ev.target.value })} maxLength={30} placeholder="8.6 CGPA" className={`${input} ${ring(false)}`} /></F>
            </Entry>
          );
        })}
      </Section>

      <Section title="Projects" hint="Optional" onAdd={() => set("projects", [...r.projects, emptyProject()])} addLabel="Add">
        {r.projects.map((pr: Project, i) => {
          const p = (f: string) => bad(`projects.${i}.${f}`);
          return (
            <Entry key={i} label="project" onRemove={() => drop("projects", i)}>
              <F label="Name" bad={p("name")}><input value={pr.name} onChange={(ev) => setAt("projects", i, { name: ev.target.value })} maxLength={LIMITS.short} className={`${input} ${ring(p("name"))}`} /></F>
              <F label="Link" hint="optional"><input value={pr.link} onChange={(ev) => setAt("projects", i, { link: ev.target.value })} maxLength={LIMITS.link} inputMode="url" placeholder="github.com/you/project" className={`${input} ${ring(false)}`} /></F>
              <F label="Description" hint="optional" className="sm:col-span-2">
                <textarea value={pr.description} onChange={(ev) => setAt("projects", i, { description: ev.target.value })} rows={2} maxLength={LIMITS.description} className={`${area} ${ring(false)}`} />
              </F>
            </Entry>
          );
        })}
      </Section>

      <Section title="Skills" hint="Press Enter or comma after each" bad={bad("skills")}>
        <Tags value={r.skills} onChange={(v) => set("skills", v)} placeholder="React, SQL, Figma…" bad={bad("skills")} max={LIMITS.skills} />
      </Section>

      <Section title="Preferred job locations" hint="Where you'd like to work" bad={bad("preferredLocations")}>
        <Tags
          value={r.preferredLocations}
          onChange={(v) => set("preferredLocations", v)}
          placeholder="Bengaluru, Remote…"
          bad={bad("preferredLocations")}
          max={LIMITS.locations}
          suggestions={[r.city, "Remote", "Bengaluru", "Pune", "Mumbai", "Hyderabad", "Delhi NCR"].filter((s, i, a) => a.indexOf(s) === i)}
        />
      </Section>
    </div>
  );
}

/** /settings/resume: the editor with a sticky Save bar. Saving also updates the profile's name, city and headline. */
export function ResumeForm({ initial }: { initial: Resume }) {
  const router = useRouter();
  const [r, setR] = useState(initial);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = missingFields(r);
  const dirty = r !== initial;
  useUnsavedGuard(dirty && !busy);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setShow(true);
    if (missing.length) return setError("Fill in the highlighted fields to save.");
    setBusy(true);
    setError("");
    const res = await saveMyResume(r).catch(() => ({ error: "Couldn't save. Try again." }));
    setBusy(false);
    if ("error" in res) return setError(res.error);
    toast("Resume saved");
    router.back();
    router.refresh();
  }

  return (
    <form onSubmit={save} noValidate className="pb-8">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
        <button type="button" aria-label="Back" onClick={() => leaveIfClean(dirty).then((ok) => ok && router.back())} className={backBtn}>
          <Icon d={icons.back} size={18} />
        </button>
        <h1 className="flex-1 text-sm font-medium">Edit resume</h1>
        <button aria-busy={busy} type="submit" className={btnPrimary} disabled={busy}>Save</button>
      </header>
      <div className="space-y-4 px-4 pt-5">
        <ResumeEditor value={r} onChange={setR} missing={missing} show={show} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}

/**
 * Experience on your own About tab, edited in place (LinkedIn style). It's the same resume the Resume tab and PDF use,
 * so every save shows up there too. `companies`: pages already linked, for logos.
 */
export function ExperienceManager({ resume, companies }: { resume: Resume; companies: Record<string, CompanyCard> }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ i: number; e: Experience } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(experience: Experience[], done: string) {
    setBusy(true);
    const res = await saveMyResume({ ...resume, experience }).catch(() => ({ error: "Couldn't save. Try again." }));
    setBusy(false);
    if ("error" in res) return res.error;
    toast(done);
    setEditing(null);
    router.refresh();
    return null;
  }

  const edit = (i: number) => (
    <button type="button" aria-label="Edit experience" title="Edit" disabled={busy} onClick={() => setEditing({ i, e: resume.experience[i] })} className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground">
      <Icon d={icons.edit} size={14} />
    </button>
  );

  return (
    <Block
      title="Experience"
      empty={!resume.experience.length}
      action={
        <button type="button" disabled={busy} onClick={() => setEditing({ i: -1, e: { ...emptyExperience(), current: !resume.experience.length } })} className={btnGhost}>
          <Icon d={icons.plus} size={14} />Add
        </button>
      }
    >
      {resume.experience.map((e, i) => <ExperienceItem key={i} e={e} page={e.companyId ? companies[e.companyId] : undefined} action={edit(i)} />)}
      {editing && (
        <ExperienceDialog
          initial={editing.e}
          logoUrl={editing.e.companyId ? companies[editing.e.companyId]?.logoUrl : null}
          onClose={() => setEditing(null)}
          onSave={(e) => save(editing.i < 0 ? [e, ...resume.experience] : resume.experience.map((x, j) => (j === editing.i ? e : x)), "Experience saved")}
          onDelete={
            editing.i < 0 ? undefined
            : async () => (await ask({ title: "Delete this experience?", body: "It's removed from your profile and resume.", confirm: "Delete", danger: true }))
              ? save(resume.experience.filter((_, j) => j !== editing.i), "Experience deleted") : null
          }
        />
      )}
    </Block>
  );
}

function ExperienceDialog({ initial, logoUrl: initialLogo, onClose, onSave, onDelete }: {
  initial: Experience; logoUrl?: string | null; onClose: () => void; onSave: (e: Experience) => Promise<string | null>; onDelete?: () => Promise<string | null>;
}) {
  const [e, setE] = useState(initial);
  const [logoUrl, setLogoUrl] = useState(initialLogo);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Experience>) => setE((x) => ({ ...x, ...patch }));
  const bad = { title: !e.title.trim(), company: !e.company.trim(), start: !e.start, end: !!e.end && !!e.start && e.end < e.start };
  const p = (k: keyof typeof bad) => show && bad[k];

  async function run(call: () => Promise<string | null>) {
    setBusy(true);
    setError((await call()) ?? "");
    setBusy(false);
  }

  return (
    <Modal title={initial.title ? "Edit experience" : "Add experience"} onClose={onClose}>
      <form
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          setShow(true);
          if (!Object.values(bad).some(Boolean)) run(() => onSave(e));
        }}
        className="grid gap-3 p-5 sm:grid-cols-2"
      >
        <F label="Title" bad={p("title")} className="sm:col-span-2"><input data-autofocus value={e.title} onChange={(ev) => set({ title: ev.target.value })} maxLength={LIMITS.short} placeholder="Software engineer" className={`${input} ${ring(p("title"))}`} /></F>
        <div className="space-y-1.5 sm:col-span-2">
          <span className="flex items-baseline justify-between text-sm font-medium">
            Company
            {p("company") ? <span className="text-xs font-normal text-danger">Required</span> : <span className="text-xs font-normal text-muted">pick a page to show its logo</span>}
          </span>
          <CompanyPicker value={e.company} companyId={e.companyId} logoUrl={logoUrl} invalid={p("company")} onChange={(company, companyId, logo) => (set({ company, companyId }), setLogoUrl(logo))} />
        </div>
        <F label="Start" bad={p("start")}><input type="month" value={e.start} onChange={(ev) => set({ start: ev.target.value })} className={`${input} ${ring(p("start"))}`} /></F>
        <F label="End" bad={p("end")} hint={e.current ? "present" : undefined}>
          <input type="month" value={e.current ? "" : e.end} disabled={e.current} onChange={(ev) => set({ end: ev.target.value })} className={`${input} ${ring(p("end"))}`} />
        </F>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={e.current} onChange={(ev) => set({ current: ev.target.checked, end: "" })} className="size-4 accent-[var(--foreground)]" />
          I currently work here
        </label>
        <F label="Location" hint="optional" className="sm:col-span-2"><input value={e.location} onChange={(ev) => set({ location: ev.target.value })} maxLength={LIMITS.short} className={`${input} ${ring(false)}`} /></F>
        <F label="What you did" hint="one point per line" className="sm:col-span-2">
          <textarea value={e.description} onChange={(ev) => set({ description: ev.target.value })} rows={4} maxLength={LIMITS.description} className={`${area} ${ring(false)}`} />
        </F>
        {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="flex items-center gap-2 pt-1 sm:col-span-2">
          {onDelete && <button type="button" disabled={busy} onClick={() => run(onDelete)} className={`${btnGhost} text-danger hover:text-danger`}><Icon d={icons.trash} size={14} />Delete</button>}
          <span className="flex-1" />
          <button type="button" className={btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
          <button aria-busy={busy} type="submit" className={btnPrimary} disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
