"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import * as actions from "@/app/dashboard/actions";
import { JOB_TYPES, LEVELS, LIMITS, MAX_RESUME_BYTES, POSTED, RESUME_TYPE, STATUSES, WORKPLACES, type AppStatus, type JobFilters, type MyJobsTab } from "@/lib/job-fields";
import type { InterviewResult, SessionStatus } from "@/lib/interview";
import { FITS, INTERVIEW, NOTICE, type Fit } from "@/lib/interview-fields";
import type { Applicant, Job, JobPage, PublicJob } from "@/lib/jobs";
import { parseInline, parseProse } from "@/lib/prose";
import { ask, Clamp, leaveIfClean, Modal, Select, Tabs, toast, useUnsavedGuard } from "./kit";
import { JobRowsSkeleton, Line, Loading, Skeleton, times } from "./skeleton";
import { ago, Avatar, backBtn, btn, btnGhost, btnLg, btnOutline, btnPrimary, CompanyLogo, Icon, icons } from "./ui";
import { useRealtime } from "./use-realtime";

type Tab = "search" | MyJobsTab;
type Contact = { email: string; phone: string; resumeKey: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "search", label: "Search" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "posted", label: "Posted" },
];
const EMPTY: Record<Tab, string> = {
  search: "No open jobs yet. Be the first to post one.",
  saved: "Jobs you save show up here.",
  applied: "Jobs you apply to show up here.",
  posted: "Jobs you post show up here.",
};
export const field = "h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-ring";
const select = `${field} bg-surface`;
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong");

function posted(ms: number) {
  const a = ago(ms);
  return a === "now" ? "Just now" : /^\d/.test(a) ? `${a} ago` : a;
}
const where = (j: Job) => (j.location ? `${j.location} (${WORKPLACES[j.workplace]})` : WORKPLACES[j.workplace]);
const applicantsText = (n: number) => (n === 0 ? "Be an early applicant" : `${n} applicant${n === 1 ? "" : "s"}`);

/**
 * Jobs, in the feed column: search with LinkedIn's core filters, saved/applied/posted lists, and a job's
 * details opening under the search in place of the list. Live via /api/realtime.
 */
export function Jobs({ viewerId, initialTab, initial, initialFilters, initialSelected, contact: initialContact }: {
  viewerId: string;
  initialTab: Tab;
  initial: JobPage;
  initialFilters: JobFilters;
  initialSelected: Job | null;
  contact: Contact;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [filters, setFilters] = useState(initialFilters);
  const [byId, setById] = useState<Record<string, Job>>(() => Object.fromEntries([...initial.jobs, ...(initialSelected ? [initialSelected] : [])].map((j) => [j.id, j])));
  const [list, setList] = useState({ ids: initial.jobs.map((j) => j.id), next: initial.next });
  const [selectedId, setSelectedId] = useState(initialSelected?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [applying, setApplying] = useState(false);
  const [contact, setContact] = useState(initialContact);
  const [applicants, setApplicants] = useState<Record<string, Applicant[]>>({});
  const sentinel = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const listScroll = useRef(0);

  const merge = (jobs: Job[]) => setById((m) => ({ ...m, ...Object.fromEntries(jobs.map((j) => [j.id, j])) }));
  const patch = (id: string, fn: (j: Job) => Partial<Job>) => setById((m) => (m[id] ? { ...m, [id]: { ...m[id], ...fn(m[id]) } } : m));

  /** Shareable URL for what's on screen; replaceState keeps Back meaning "leave Jobs". */
  function syncUrl(t: Tab, f: JobFilters, id: string | null) {
    const entries = Object.entries({ tab: t === "search" ? null : t, ...(t === "search" ? f : {}), id });
    const qs = new URLSearchParams(entries.filter((e): e is [string, string] => !!e[1]));
    history.replaceState(null, "", qs.size ? `?${qs}` : location.pathname);
  }

  /** Newest request wins, so fast filter changes never show stale results. */
  async function load(t: Tab, f: JobFilters, append = false) {
    const n = ++request.current;
    setLoading(true);
    try {
      const res = t === "search" ? await actions.loadJobs(f, append ? (list.next ?? undefined) : undefined) : { jobs: await actions.loadMyJobs(t), next: null };
      if (n !== request.current) return;
      merge(res.jobs);
      setList((l) => ({ ids: append ? [...l.ids, ...res.jobs.map((j) => j.id).filter((id) => !l.ids.includes(id))] : res.jobs.map((j) => j.id), next: res.next }));
      if (!append && t === "search") setFresh(0);
    } catch {
      // keep what's on screen; the next visibility resync retries
    } finally {
      if (n === request.current) setLoading(false);
    }
  }

  function switchTab(t: Tab) {
    setTab(t);
    setSelectedId(null);
    setList({ ids: [], next: null });
    syncUrl(t, filters, null);
    load(t, filters);
  }

  function applyFilters(f: JobFilters) {
    setFilters(f);
    setSelectedId(null);
    syncUrl("search", f, null);
    load("search", f);
  }

  /** Open a job in place of the list, and come back to the same scroll position. */
  function choose(id: string | null) {
    if (id) listScroll.current = window.scrollY;
    setSelectedId(id);
    syncUrl(tab, filters, id);
    requestAnimationFrame(() => window.scrollTo({ top: id ? 0 : listScroll.current }));
  }

  async function refreshApplicants(jobId: string) {
    const list = await actions.loadApplicants(jobId);
    setApplicants((a) => ({ ...a, [jobId]: list }));
  }

  useRealtime((e) => {
    if (e.t === "job" && e.posterId !== viewerId) setFresh((n) => n + 1);
    else if (e.t === "jobstat") patch(e.id, (j) => ({ applicants: e.applicants, closedAt: e.closed ? (j.closedAt ?? Date.now()) : null }));
    else if (e.t === "app" && e.applicantId === viewerId) patch(e.jobId, (j) => ({ application: { status: e.status, at: j.application?.at ?? Date.now() } }));
    else if (e.t === "app" && applicants[e.jobId]) refreshApplicants(e.jobId).catch(() => {});
  });

  // Events sent while the socket was down are gone, so resync whenever the tab comes back
  const resync = useEffectEvent(() => load(tab, filters));
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && resync();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  const loadMore = useEffectEvent(() => {
    if (list.next && !loading && !selectedId) load(tab, filters, true);
  });
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && loadMore(), { rootMargin: "400px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, []);

  async function toggleSave(j: Job) {
    patch(j.id, () => ({ saved: !j.saved }));
    try {
      const { saved } = await actions.toggleSaveJob(j.id);
      patch(j.id, () => ({ saved }));
    } catch {
      patch(j.id, () => ({ saved: j.saved }));
    }
  }

  async function setClosed(j: Job, closed: boolean) {
    if (closed && !(await ask({ title: "Close this job?", body: "It stops accepting applications and leaves search. You can reopen it later.", confirm: "Close job" }))) return;
    patch(j.id, () => ({ closedAt: closed ? Date.now() : null }));
    await actions.setJobClosed(j.id, closed).catch(() => patch(j.id, () => ({ closedAt: j.closedAt })));
  }

  const ids = list.ids.filter((id) => byId[id]);
  const shown = selectedId ? byId[selectedId] : undefined;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-sm font-semibold">Jobs</h1>
          <Link href="/dashboard/jobs/post" className={btnOutline}>
            <Icon d={icons.plus} size={14} />
            Post a job
          </Link>
        </div>
        <Tabs label="Job lists" tabs={TABS} value={tab} onChange={(t) => (tab !== t ? switchTab(t) : shown && choose(null))} />
      </header>

      {tab === "search" && <SearchForm filters={filters} onChange={applyFilters} hasFilters={hasFilters} />}

      {shown && (
        <>
          <button type="button" onClick={() => choose(null)} className="flex h-10 w-full items-center gap-1.5 border-b border-border px-3 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground">
            <Icon d={icons.back} size={16} />
            Back to results
          </button>
          <JobDetail
            key={shown.id}
            job={shown}
            mine={shown.poster.id === viewerId}
            applicants={applicants[shown.id]}
            onApply={() => setApplying(true)}
            onSave={() => toggleSave(shown)}
            onClose={(c) => setClosed(shown, c)}
            onLoadApplicants={() => refreshApplicants(shown.id)}
            onStatus={async (a, status) => {
              setApplicants((m) => ({ ...m, [shown.id]: m[shown.id].map((x) => (x.id === a.id ? { ...x, status } : x)) }));
              await actions.setApplicationStatus(shown.id, a.id, status).catch(() => refreshApplicants(shown.id));
            }}
          />
        </>
      )}

      {/* Stays mounted while a job is open so infinite scroll and the list position survive */}
      <div className={shown ? "hidden" : undefined}>
        {tab === "search" && fresh > 0 && (
          <button type="button" onClick={() => load("search", filters)} className="h-10 w-full border-b border-border text-sm text-link transition-colors hover:bg-surface">
            Show {fresh} new job{fresh === 1 ? "" : "s"}
          </button>
        )}
        {ids.length === 0 ? (
          loading ? <JobRowsSkeleton /> : <p className="px-4 py-10 text-center text-sm text-muted">{tab === "search" && hasFilters ? "No jobs match these filters." : EMPTY[tab]}</p>
        ) : (
          <ul className="divide-y divide-border border-b border-border">
            {ids.map((id) => (
              <JobRow key={id} job={byId[id]} mine={byId[id].poster.id === viewerId} onOpen={() => choose(id)} onSave={() => toggleSave(byId[id])} />
            ))}
          </ul>
        )}
        <div ref={sentinel} className="h-px" />
        {loading && ids.length > 0 && <JobRowsSkeleton n={2} />}
      </div>

      {applying && shown && (
        <ApplyDialog
          job={shown}
          contact={contact}
          onClose={() => setApplying(false)}
          onApplied={(job, c) => {
            merge([job]);
            setContact(c);
            setApplying(false);
            toast(`Application sent to ${job.company}`);
          }}
        />
      )}
    </>
  );
}

function SearchForm({ filters, onChange, hasFilters }: { filters: JobFilters; onChange: (f: JobFilters) => void; hasFilters: boolean }) {
  const [q, setQ] = useState(filters.q ?? "");
  const [loc, setLoc] = useState(filters.loc ?? "");
  const selects = [
    { key: "posted", label: "Date posted", opts: POSTED },
    { key: "workplace", label: "Workplace", opts: WORKPLACES },
    { key: "type", label: "Job type", opts: JOB_TYPES },
    { key: "level", label: "Experience", opts: LEVELS },
  ] as const;

  return (
    <form
      className="space-y-2 border-b border-border px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ ...filters, q: q.trim() || undefined, loc: loc.trim() || undefined });
      }}
    >
      <div className="flex gap-2">
        <label className="flex h-10 min-w-0 flex-[3] items-center gap-2 rounded-md border border-border px-3 text-muted focus-within:border-ring">
          <Icon d={icons.search} size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, skill or company" aria-label="Keyword" className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none" />
        </label>
        <label className="flex h-10 min-w-0 flex-[2] items-center gap-2 rounded-md border border-border px-3 text-muted focus-within:border-ring">
          <Icon d={icons.pin} size={16} />
          <input type="search" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Location" aria-label="Location" className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none" />
        </label>
        <button type="submit" className={`${btnPrimary} ${btnLg}`}>Search</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {selects.map(({ key, label, opts }) => (
          <Select
            key={key}
            aria-label={label}
            value={filters[key] ?? ""}
            onChange={(v) => onChange({ ...filters, [key]: v || undefined })}
            options={[{ value: "", label }, ...Object.entries(opts).map(([value, l]) => ({ value, label: l }))]}
            className={`h-8 rounded-full border px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${filters[key] ? "border-link bg-link/10 text-foreground" : "border-border bg-background text-muted hover:text-foreground"}`}
          />
        ))}
        {hasFilters && (
          <button
            type="button"
            className="h-8 px-2 text-xs text-muted hover:text-foreground"
            onClick={() => {
              setQ("");
              setLoc("");
              onChange({});
            }}
          >
            Reset
          </button>
        )}
      </div>
    </form>
  );
}

/** A real link (Ctrl/⌘-click opens the job in a new tab); a plain click opens it in place. Save sits on the row, like LinkedIn. */
function JobRow({ job: j, mine, onOpen, onSave }: { job: Job; mine: boolean; onOpen: () => void; onSave: () => void }) {
  const tag = j.closedAt ? "Closed" : j.application ? (j.application.status === "submitted" ? "Applied" : STATUSES[j.application.status]) : mine ? "Your job" : j.saved ? "Saved" : null;
  return (
    <li className="relative">
      {!mine && (
        <button
          type="button"
          aria-label={j.saved ? `Unsave ${j.title}` : `Save ${j.title}`}
          title={j.saved ? "Unsave" : "Save"}
          aria-pressed={j.saved}
          onClick={onSave}
          className={`${btnGhost} absolute right-3 top-3 z-[1] px-2 ${j.saved ? "text-foreground" : ""}`}
        >
          <Icon d={icons.bookmark} size={16} className={j.saved ? "fill-current" : ""} />
        </button>
      )}
      <Link
        href={`/dashboard/jobs?id=${j.id}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onOpen();
        }}
        className={`flex w-full gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${mine ? "" : "pr-14"}`}
      >
        <CompanyLogo name={j.company} src={j.page?.logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-link">{j.title}</p>
          <p className="truncate text-sm">{j.company}</p>
          <p className="truncate text-xs text-muted">{where(j)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted" suppressHydrationWarning>
            {tag && <span className="font-medium text-foreground">{tag} ·</span>}
            {posted(j.createdAt)}
            {j.applicants > 0 && <span>· {applicantsText(j.applicants)}</span>}
          </p>
        </div>
      </Link>
    </li>
  );
}

function JobDetail({ job: j, mine, applicants, onApply, onSave, onClose, onLoadApplicants, onStatus }: {
  job: Job;
  mine: boolean;
  applicants?: Applicant[];
  onApply: () => void;
  onSave: () => void;
  onClose: (closed: boolean) => void;
  onLoadApplicants: () => Promise<void>;
  onStatus: (a: Applicant, s: AppStatus) => void;
}) {
  const [view, setView] = useState<"details" | "applicants">("details");
  // Phones: a sticky Apply / Save bar once the main buttons scroll out of view (LinkedIn mobile)
  const actionsRef = useRef<HTMLDivElement>(null);
  const [actionsGone, setActionsGone] = useState(false);
  const canApply = !mine && !j.application && !j.closedAt;

  useEffect(() => {
    const el = actionsRef.current;
    if (!el || !canApply) return;
    const io = new IntersectionObserver(([e]) => setActionsGone(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [canApply]);

  async function share() {
    const url = `${location.origin}/job/${j.id}`; // public page; members are sent on to the app
    if (navigator.share) await navigator.share({ url, title: `${j.title} at ${j.company}` }).catch(() => {});
    else {
      await navigator.clipboard.writeText(url).then(() => toast("Link copied"), () => toast("Couldn't copy the link", "error"));
    }
  }

  function showApplicants() {
    setView("applicants");
    if (!applicants) onLoadApplicants().catch(() => {});
  }

  return (
    <article className="border-b border-border">
      <div className="space-y-4 border-b border-border p-4">
        <div className="flex items-center gap-2 text-sm">
          <CompanyLogo name={j.company} src={j.page?.logoUrl} size={28} />
          {j.page ? <Link href={`/company/${j.page.slug}`} className="font-medium hover:underline">{j.company}</Link> : <span className="font-medium">{j.company}</span>}
          {j.page?.verified && (
            <span title="The poster verified they work here" className="flex items-center gap-1 text-xs text-success">
              <Icon d={icons.verified} size={14} />
              Verified
            </span>
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-balance">{j.title}</h2>
          <p className="mt-1 text-sm text-muted" suppressHydrationWarning>
            {where(j)} · {posted(j.createdAt)} · {applicantsText(j.applicants)}
          </p>
        </div>
        <div ref={actionsRef} className="flex flex-wrap items-center gap-2">
          {mine ? (
            <>
              <button type="button" className={j.closedAt ? btnPrimary : btnOutline} onClick={() => onClose(!j.closedAt)}>
                {j.closedAt ? "Reopen job" : "Close job"}
              </button>
              {j.closedAt && <span className="text-sm text-muted">No longer accepting applications</span>}
            </>
          ) : j.application ? (
            <span className={`${btn} border border-border text-muted`} suppressHydrationWarning>
              <Icon d={icons.check} size={14} />
              Applied {posted(j.application.at).toLowerCase()} · {STATUSES[j.application.status]}
            </span>
          ) : j.closedAt ? (
            <span className="text-sm text-muted">No longer accepting applications</span>
          ) : (
            <button type="button" className={btnPrimary} onClick={onApply}>Easy Apply</button>
          )}
          {!mine && (
            <button type="button" className={btnOutline} aria-pressed={j.saved} onClick={onSave}>
              <Icon d={icons.bookmark} size={14} className={j.saved ? "fill-current" : ""} />
              {j.saved ? "Saved" : "Save"}
            </button>
          )}
          <button type="button" className={btnGhost} onClick={share}>
            <Icon d={icons.share} size={14} />
            Share
          </button>
        </div>
        {j.interview && (mine || j.application) && <InterviewPanel interview={j.interview} mine={mine} />}
      </div>

      {view === "details" && <JobFacts job={j} />}

      {mine && (
        <div className="border-b border-border">
          <Tabs
            label="Job views"
            tabs={[{ id: "details", label: "Details" }, { id: "applicants", label: "Applicants", count: j.applicants }]}
            value={view}
            onChange={(v) => (v === "applicants" ? showApplicants() : setView(v))}
          />
        </div>
      )}

      {view === "applicants" ? (
        <Applicants jobId={j.id} list={applicants} onStatus={onStatus} />
      ) : (
        <>
          <section className="border-b border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Meet the hiring team</h3>
            <div className="flex items-center gap-3">
              <Avatar name={j.poster.name} src={j.poster.imageUrl ?? undefined} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{j.poster.name}{mine && <span className="font-normal text-muted"> · You</span>}</p>
                <p className="truncate text-xs text-muted">{j.poster.headline ?? "Job poster"}</p>
              </div>
            </div>
          </section>
          <section className={`p-4 ${j.page ? "border-b border-border" : ""}`}>
            <h3 className="mb-3 text-sm font-semibold">About the job</h3>
            <div className="space-y-3 break-words text-sm leading-relaxed text-foreground/90">
              <Prose text={j.description} />
            </div>
          </section>
          {j.page && <AboutCompany name={j.company} page={j.page} />}
        </>
      )}

      {canApply && actionsGone && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 flex gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:hidden">
          <button type="button" className={`${btnPrimary} ${btnLg} flex-1`} onClick={onApply}>Easy Apply</button>
          <button type="button" className={`${btnOutline} ${btnLg}`} aria-pressed={j.saved} onClick={onSave}>
            <Icon d={icons.bookmark} size={14} className={j.saved ? "fill-current" : ""} />
            {j.saved ? "Saved" : "Save"}
          </button>
        </div>
      )}
    </article>
  );
}

type Facts = Pick<PublicJob, "location" | "workplace" | "type" | "level" | "salary" | "interview">;

/** Everything the poster picked on the form, labeled (LinkedIn's job insights / Indeed's "Job details"). */
export function JobFacts({ job: j, h: H = "h3" }: { job: Facts; h?: "h2" | "h3" }) {
  const facts = [
    { icon: icons.pay, label: "Pay", value: j.salary ?? "Not disclosed", muted: !j.salary },
    { icon: icons.jobs, label: "Job type", value: JOB_TYPES[j.type] },
    { icon: icons.level, label: "Experience level", value: LEVELS[j.level] },
    { icon: icons.laptop, label: "Workplace", value: WORKPLACES[j.workplace] },
    { icon: icons.pin, label: "Location", value: j.location || (j.workplace === "remote" ? "Anywhere" : "Not specified") },
    j.interview && {
      icon: icons.mic,
      label: "Hiring process",
      value: `AI voice interview · ${j.interview.questions} question${j.interview.questions === 1 ? "" : "s"} · ${INTERVIEW.seconds / 60} min`,
      sub: `Applicants take it online before ${dateTime(j.interview.deadline)}. The link and password are emailed on applying.`,
    },
  ].filter((f) => !!f);
  return (
    <section className="border-b border-border p-4">
      <H className="mb-3 text-sm font-semibold">Job details</H>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.label} className={`flex gap-3 ${"sub" in f ? "sm:col-span-2" : ""}`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted"><Icon d={f.icon} size={16} /></span>
            <div className="min-w-0">
              <dt className="text-xs text-muted">{f.label}</dt>
              <dd className={`text-sm break-words ${"muted" in f && f.muted ? "text-muted" : "font-medium"}`}>{f.value}</dd>
              {"sub" in f && <dd className="mt-0.5 text-xs text-muted" suppressHydrationWarning>{f.sub}</dd>}
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The company page behind the listing, so candidates know who they'd work for without leaving the job. */
/** `linked`: false on the signed-out share page, where company pages need an account. */
export function AboutCompany({ name, page: p, h: H = "h3", linked = true }: { name: string; page: NonNullable<Job["page"]>; h?: "h2" | "h3"; linked?: boolean }) {
  const meta = [p.industry, p.size && `${p.size} employees`, p.hq].filter(Boolean).join(" · ");
  return (
    <section className="space-y-3 p-4">
      <H className="text-sm font-semibold">About the company</H>
      <div className="flex items-center gap-3">
        <CompanyLogo name={name} src={p.logoUrl} size={48} />
        <div className="min-w-0">
          {linked ? <Link href={`/company/${p.slug}`} className="block truncate text-sm font-medium hover:underline">{name}</Link> : <p className="truncate text-sm font-medium">{name}</p>}
          {p.tagline && <p className="truncate text-xs text-muted">{p.tagline}</p>}
          <p className="text-xs text-muted">{p.followers.toLocaleString()} follower{p.followers === 1 ? "" : "s"}</p>
        </div>
      </div>
      {meta && <p className="text-sm text-muted">{meta}</p>}
      {p.about && <Clamp lines={4} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{p.about}</Clamp>}
      {linked && <Link href={`/company/${p.slug}`} className={btnOutline}>View company page</Link>}
    </section>
  );
}

/** A recruiter's plain-text description with its headings, bullet and numbered lists, bold, links and emails. */
export function Prose({ text, h: H = "h4" }: { text: string; h?: "h3" | "h4" }) {
  return parseProse(text).map((b, i) =>
    b.t === "h" ? (
      <H key={i} className="pt-2 text-sm font-semibold text-foreground">{b.text}</H>
    ) : b.t === "p" ? (
      <p key={i} className="whitespace-pre-wrap"><Inline text={b.text} /></p>
    ) : (
      <b.t key={i} className={`space-y-1.5 pl-5 ${b.t === "ul" ? "list-disc" : "list-decimal"} marker:text-muted`}>
        {b.items.map((x, j) => <li key={j} className="pl-1"><Inline text={x} /></li>)}
      </b.t>
    ),
  );
}

function Inline({ text }: { text: string }) {
  return parseInline(text).map((s, i) =>
    s.t === "b" ? <strong key={i} className="font-semibold text-foreground">{s.text}</strong>
    : s.t === "url" ? <a key={i} href={s.text} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-link hover:underline">{s.text}</a>
    : s.t === "email" ? <a key={i} href={`mailto:${s.text}`} className="text-link hover:underline">{s.text}</a>
    : s.text,
  );
}

function Applicants({ jobId, list, onStatus }: { jobId: string; list?: Applicant[]; onStatus: (a: Applicant, s: AppStatus) => void }) {
  if (!list)
    return (
      <Loading label="Loading applicants…" className="divide-y divide-border">
        {times(3, (i) => (
          <div key={i} className="flex gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><Line className="text-sm" w={["40%", "32%", "46%"][i]} /><Line className="text-xs" w={["60%", "48%", "55%"][i]} /></div>
                <Skeleton className="h-8 w-28" />
              </div>
              <Line className="text-xs" w="50%" />
              <Line className="text-xs" w="24%" />
            </div>
          </div>
        ))}
      </Loading>
    );
  if (list.length === 0) return <p className="p-4 text-sm text-muted">No applicants yet. New ones show up here as they apply.</p>;
  return <ApplicantList jobId={jobId} list={list} onStatus={onStatus} />;
}

type Stage = "all" | "viewed" | "shortlisted" | "rejected";
const STAGES: { id: Stage; label: string }[] = [
  { id: "all", label: "All" },
  { id: "viewed", label: "Under review" },
  { id: "shortlisted", label: STATUSES.shortlisted },
  { id: "rejected", label: STATUSES.rejected },
];
const stageOf = (a: Applicant): Stage => (a.status === "submitted" ? "viewed" : (a.status as Stage));

/** Pipeline view (LinkedIn Recruiter / Greenhouse): filter by stage with counts, optionally rank by interview score. */
function ApplicantList({ jobId, list, onStatus }: { jobId: string; list: Applicant[]; onStatus: (a: Applicant, s: AppStatus) => void }) {
  const [stage, setStage] = useState<Stage>("all");
  const [byScore, setByScore] = useState(false);
  const scored = list.some((a) => a.interview?.score != null);
  const shown = list
    .filter((a) => stage === "all" || stageOf(a) === stage)
    .sort((a, b) => (byScore ? (b.interview?.score ?? -1) - (a.interview?.score ?? -1) : 0));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {STAGES.map((s) => {
          const n = s.id === "all" ? list.length : list.filter((a) => stageOf(a) === s.id).length;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={stage === s.id}
              onClick={() => setStage(s.id)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${stage === s.id ? "border-link bg-link/10 text-foreground" : "border-border text-muted hover:text-foreground"}`}
            >
              {s.label}
              <span className="tabular-nums">{n}</span>
            </button>
          );
        })}
        {scored && (
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={byScore} onChange={(e) => setByScore(e.target.checked)} className="size-4 accent-foreground" />
            Sort by interview score
          </label>
        )}
      </div>
      {shown.length === 0 && <p className="p-4 text-sm text-muted">No applicants in this stage.</p>}
      <ul className="divide-y divide-border">
      {shown.map((a) => (
        <li key={a.id} className="flex gap-3 p-4">
          <Avatar name={a.name} src={a.imageUrl ?? undefined} size={40} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={applicantHref(jobId, a.id)} className="block truncate text-sm font-medium hover:underline">{a.name}</Link>
                {a.headline && <p className="truncate text-xs text-muted">{a.headline}</p>}
              </div>
              <Select
                aria-label={`Status for ${a.name}`}
                value={a.status === "submitted" ? "viewed" : a.status}
                onChange={(v) => onStatus(a, v as AppStatus)}
                options={(["viewed", "shortlisted", "rejected"] as const).map((s) => ({ value: s, label: s === "viewed" ? "Under review" : STATUSES[s] }))}
                className="h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                panelClassName="left-auto right-0"
              />
            </div>
            <p className="flex flex-wrap gap-x-3 text-xs text-muted" suppressHydrationWarning>
              <a href={`mailto:${a.email}`} className="text-link hover:underline">{a.email}</a>
              {a.phone && <a href={`tel:${a.phone}`} className="hover:text-foreground">{a.phone}</a>}
              <span>Applied {posted(a.at).toLowerCase()}</span>
            </p>
            {a.note && <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{a.note}</p>}
            <a href={`/api/media/${a.resumeKey}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-link hover:underline">
              <Icon d={icons.file} size={14} />
              Download resume
            </a>
            <Link href={applicantHref(jobId, a.id)} className="flex items-center gap-1.5 pt-1 text-xs">
              {a.interview && (
                <>
                  <span className="font-medium">Voice interview:</span>
                  {a.interview.status === "done" && a.interview.score !== null ? (
                    <span>
                      <span className="font-medium tabular-nums">{a.interview.score}/100</span>
                      {a.interview.fit && <span className={FIT_TONE[a.interview.fit]}> · {FITS[a.interview.fit]}</span>}
                    </span>
                  ) : (
                    <span className="text-muted">{IV_STATUS[a.interview.status]}</span>
                  )}
                  <span className="text-muted">·</span>
                </>
              )}
              <span className="font-medium text-link hover:underline">View full application</span>
            </Link>
          </div>
        </li>
      ))}
      </ul>
    </>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}{hint && <span className="font-normal text-muted"> · {hint}</span>}</span>
      {children}
    </label>
  );
}

function ApplyDialog({ job, contact, onClose, onApplied }: { job: Job; contact: Contact; onClose: () => void; onApplied: (j: Job, c: Contact) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      let resumeKey = ""; // the server attaches your profile resume
      if (file) {
        const res = await fetch("/api/uploads", { method: "PUT", headers: { "Content-Type": RESUME_TYPE }, body: file });
        const data = (await res.json()) as { key?: string; error?: string };
        if (!res.ok || !data.key) throw new Error(data.error ?? "Upload failed");
        resumeKey = data.key;
      }
      const c = { email: String(fd.get("email")), phone: String(fd.get("phone")), resumeKey };
      const r = await actions.applyToJob(job.id, { ...c, note: fd.get("note") });
      if ("error" in r) throw new Error(r.error);
      onApplied(r.job, c);
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  function pick(f: File | undefined) {
    setError("");
    if (!f) return setFile(null);
    if (f.type !== RESUME_TYPE) return setError("Resume must be a PDF");
    if (f.size > MAX_RESUME_BYTES) return setError("Resume must be 5 MB or smaller");
    setFile(f);
  }

  return (
    <Modal title={`Apply to ${job.company}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <p className="text-sm text-muted">{job.title} · {where(job)}</p>
        <Field label="Email">
          <input name="email" type="email" required maxLength={LIMITS.email} defaultValue={contact.email} autoComplete="email" className={field} />
        </Field>
        <Field label="Phone" hint="optional">
          <input name="phone" type="tel" maxLength={LIMITS.phone} defaultValue={contact.phone} autoComplete="tel" className={field} />
        </Field>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Resume</span>
          <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
            <Icon d={icons.file} size={18} className="text-muted" />
            <span className="min-w-0 flex-1">
              {file ? (
                <span className="block truncate text-sm">{file.name}</span>
              ) : (
                <>
                  <span className="block text-sm">Your profile resume</span>
                  <a href="/api/resume" download className="text-xs text-link hover:underline">Preview PDF</a>
                </>
              )}
            </span>
            {file ? (
              <button type="button" className={btnGhost} onClick={() => setFile(null)}>Use profile resume</button>
            ) : (
              <label className={btnOutline}>
                Upload PDF
                <input type="file" accept={RESUME_TYPE} className="sr-only" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
              </label>
            )}
          </div>
          <p className="text-xs text-muted">Uploading a different PDF (up to 5 MB) is optional.</p>
        </div>
        <Field label="Why you're a fit" hint="optional">
          <textarea name="note" rows={4} maxLength={LIMITS.note} className={`${field} h-auto resize-none py-2`} />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
          <button aria-busy={busy} type="submit" className={btnPrimary} disabled={busy}>Submit application</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Dedicated Post a job page in the feed column: grouped sections, then straight to the new listing.
 * `companies`: pages the member verified they work at; only those can be posted for. `initialCompany` preselects one.
 */
export function PostJobForm({ companies, initialCompany }: { companies: { id: string; name: string }[]; initialCompany?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workplace, setWorkplace] = useState("onsite");
  const [desc, setDesc] = useState("");
  const [preview, setPreview] = useState(false);
  const [interview, setInterview] = useState(false);
  const [now] = useState(Date.now);
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty);

  /** In-app exits (Back, Cancel) ask before dropping a half-written job. */
  function leave(e: React.MouseEvent) {
    if (!dirty) return;
    e.preventDefault();
    leaveIfClean(true).then((ok) => ok && router.push("/dashboard/jobs"));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = Object.fromEntries(new FormData(e.currentTarget));
      // datetime-local is the poster's local time; the server gets an instant
      if (input.deadlineLocal) input.deadline = String(new Date(String(input.deadlineLocal)).getTime());
      const r = await actions.postJob(input);
      if ("error" in r) throw new Error(r.error);
      setDirty(false);
      toast("Job posted");
      router.push(`/dashboard/jobs?tab=posted&id=${r.job.id}`);
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  const options = (opts: Record<string, string>) => Object.entries(opts).map(([value, label]) => ({ value, label }));

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
        <Link href="/dashboard/jobs" onClick={leave} aria-label="Back to jobs" className={backBtn}>
          <Icon d={icons.back} size={18} />
        </Link>
        <h1 className="text-sm font-semibold">Post a job</h1>
      </header>

      <form onSubmit={submit} onChange={() => setDirty(true)}>
        <FormSection title="Role" hint="What candidates see first in search.">
          <Field label="Job title">
            <input name="title" required autoFocus maxLength={LIMITS.title} placeholder="Senior Frontend Engineer" className={field} />
          </Field>
          <Field label="Company" hint="pages where you verified your work email">
            <Select
              name="companyId"
              required
              defaultValue={companies.some((c) => c.id === initialCompany) ? initialCompany : undefined}
              className={select}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
        </FormSection>

        <FormSection title="Workplace">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workplace type">
              <Select name="workplace" value={workplace} onChange={setWorkplace} className={select} options={options(WORKPLACES)} />
            </Field>
            <Field label="Location" hint={workplace === "remote" ? "optional" : undefined}>
              <input name="location" required={workplace !== "remote"} maxLength={LIMITS.location} placeholder="City, country" className={field} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job type">
              <Select name="type" defaultValue="full-time" className={select} options={options(JOB_TYPES)} />
            </Field>
            <Field label="Experience level">
              <Select name="level" defaultValue="mid-senior" className={select} options={options(LEVELS)} />
            </Field>
          </div>
          <Field label="Salary" hint="optional">
            <input name="salary" maxLength={LIMITS.salary} placeholder="$120k–$150k / year" className={field} />
          </Field>
        </FormSection>

        <FormSection title="Description" hint="Responsibilities, requirements, skills and benefits. Short lines ending in “:” become headings; lines starting with “-” or “1.” become lists.">
          <Tabs label="Description view" tabs={[{ id: "write", label: "Write" }, { id: "preview", label: "Preview" }]} value={preview ? "preview" : "write"} onChange={(v) => setPreview(v === "preview")} />
          {/* Stays mounted while previewing so the form still submits it */}
          <textarea
            name="description"
            required
            minLength={50}
            maxLength={LIMITS.description}
            rows={14}
            aria-label="Description"
            placeholder={DESCRIPTION_TEMPLATE}
            onChange={(e) => setDesc(e.target.value)}
            onInvalid={() => setPreview(false)}
            className={`${field} h-auto resize-y py-2 leading-relaxed ${preview ? "hidden" : ""}`}
          />
          {preview && (
            <div className="min-h-40 space-y-3 break-words rounded-md border border-border p-4 text-sm leading-relaxed text-foreground/90">
              {desc.trim() ? <Prose text={desc} /> : <p className="text-muted">Nothing to preview yet.</p>}
            </div>
          )}
          <p className="text-right text-xs tabular-nums text-muted">{desc.length < 50 ? `${50 - desc.length} more characters needed` : `${desc.length} / ${LIMITS.description}`}</p>
        </FormSection>

        <FormSection title="Voice interview" hint={`Optional. Applicants get a link and password by email and take a ${INTERVIEW.seconds / 60}-minute AI voice interview before the deadline.`}>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" name="interview" checked={interview} onChange={(e) => setInterview(e.target.checked)} className="size-4 accent-foreground" />
            Add a voice interview
          </label>
          {interview && (
            <>
              <Field label="Questions" hint={`one per line, up to ${INTERVIEW.maxQuestions}`}>
                <textarea
                  name="questions"
                  required
                  rows={5}
                  maxLength={INTERVIEW.maxQuestions * (INTERVIEW.questionChars + 1)}
                  placeholder={"Walk me through a project you're proud of.\nHow do you debug a slow page?\nWhy are you interested in this role?"}
                  className={`${field} h-auto resize-y py-2 leading-relaxed`}
                />
              </Field>
              <Field label="Deadline" hint="the job closes after this">
                <input name="deadlineLocal" type="datetime-local" required min={localInput(now + 3_600_000)} max={localInput(now + 90 * 86_400_000)} className={`${field} sm:w-64`} />
              </Field>
            </>
          )}
        </FormSection>

        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] flex items-center justify-end gap-2 border-t border-border bg-background/80 px-4 py-3 backdrop-blur sm:bottom-0">
          {error && <p role="alert" className="mr-auto text-sm text-danger">{error}</p>}
          <Link href="/dashboard/jobs" onClick={leave} className={btnGhost}>Cancel</Link>
          <button aria-busy={busy} type="submit" className={btnPrimary} disabled={busy}>Post job</button>
        </div>
      </form>
    </>
  );
}

export function FormSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-b border-border px-4 py-6">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted" suppressHydrationWarning>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const DESCRIPTION_TEMPLATE = `About the role
What the team does and why this role matters.

Responsibilities:
- Build and ship …
- Work with …

Requirements:
- 3+ years of …
- Experience with …

Benefits:
- …`;

/** "YYYY-MM-DDTHH:mm" in local time, for datetime-local min/max. */
const localInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const dateTime = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Poster: the shared link and password to hand out (applicants also get them by email). Applicant: their way in. */
function InterviewPanel({ interview: iv, mine }: { interview: NonNullable<Job["interview"]>; mine: boolean }) {
  const [copied, setCopied] = useState("");
  const link = iv.slug ? `${typeof location === "undefined" ? "" : location.origin}/interview/${iv.slug}` : "";
  const [now] = useState(Date.now);
  const closed = iv.deadline <= now;
  const finished = iv.status === "processing" || iv.status === "done" || iv.status === "failed";
  const copy = async (what: string, v: string) => {
    await navigator.clipboard.writeText(v);
    setCopied(what);
    setTimeout(() => setCopied(""), 2000);
  };
  return (
    <section className="space-y-3 rounded-lg border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Voice interview</p>
          <p className="text-xs text-muted" suppressHydrationWarning>
            {iv.questions} question{iv.questions === 1 ? "" : "s"} · {INTERVIEW.seconds / 60} min · {closed ? "Closed" : "Open until"} {dateTime(iv.deadline)}
          </p>
        </div>
        {!mine && (finished ? (
          <span className="inline-flex items-center gap-1 text-xs text-success"><Icon d={icons.check} size={14} />Completed</span>
        ) : !closed && iv.slug && (
          <a href={`/interview/${iv.slug}`} target="_blank" rel="noopener" className={btnPrimary}>Start interview</a>
        ))}
      </div>
      {iv.slug && iv.password && (mine || (!finished && !closed)) && (
        <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
          {mine && (
            <>
              <dt className="text-muted">Link</dt>
              <dd className="truncate font-mono" suppressHydrationWarning>{link}</dd>
              <button type="button" className={`${btnGhost} h-7`} onClick={() => copy("link", link)}>{copied === "link" ? "Copied" : "Copy"}</button>
            </>
          )}
          <dt className="text-muted">Password</dt>
          <dd className="font-mono">{iv.password}</dd>
          <button type="button" className={`${btnGhost} h-7`} onClick={() => copy("password", iv.password!)}>{copied === "password" ? "Copied" : "Copy"}</button>
        </dl>
      )}
      {mine && <p className="text-xs text-muted">Every applicant is emailed the link and password when they apply. Results show under Applicants.</p>}
    </section>
  );
}

const IV_STATUS: Record<SessionStatus, string> = {
  verified: "Signed in, not started",
  onboarded: "Not started yet",
  live: "In progress",
  processing: "Evaluating…",
  done: "Completed",
  failed: "Evaluation failed",
};
const FIT_TONE: Record<Fit, string> = { strong: "text-success", moderate: "text-foreground", weak: "text-danger" };

export const applicantHref = (jobId: string, applicantId: string) => `/dashboard/jobs/${jobId}/applicants/${applicantId}`;

/** Applicant page: onboarding answers, the AI verdict and the full transcript. */
export function ApplicantInterview({ jobId, applicantId, initial }: { jobId: string; applicantId: string; initial: InterviewResult }) {
  const [r, setR] = useState(initial);
  const [retrying, setRetrying] = useState(false);
  const p = r.profile;
  const rep = r.report;

  async function retry() {
    setRetrying(true);
    setR((await actions.retryInterview(jobId, applicantId).catch(() => null)) ?? r);
    setRetrying(false);
  }

  return (
    <>
      {p && (
        <FormSection title="Interview onboarding" hint="What the candidate entered before the call.">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {([
              ["Name", p.name],
              ["Phone", p.phone && <a href={`tel:${p.phone}`} className="hover:underline">{p.phone}</a>],
              ["City", p.city],
              ["Current role", p.role],
              ["Experience", `${p.years} yr${p.years === 1 ? "" : "s"}`],
              ["Notice period", NOTICE[p.notice]],
              ["Profile link", p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="break-all text-link hover:underline">{p.link}</a>],
            ] as const).map(([k, v]) => v && (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
        </FormSection>
      )}

      <FormSection title="AI evaluation" hint={r.startedAt ? `Interview taken ${dateTime(r.startedAt)}` : undefined}>
        {rep ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-4">
              <p className="text-3xl font-semibold tabular-nums">{rep.score}<span className="text-sm font-normal text-muted">/100</span></p>
              <p className={`rounded-full border border-border px-2.5 py-1 text-xs font-medium ${FIT_TONE[rep.fit]}`}>{FITS[rep.fit]}</p>
            </div>
            {rep.summary && <p className="leading-relaxed text-foreground/90">{rep.summary}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              {([["Strengths", rep.strengths, "text-success"], ["Concerns", rep.concerns, "text-danger"]] as const).map(([title, list, tone]) => (
                <div key={title} className="rounded-lg border border-border p-3">
                  <p className={`mb-1.5 text-xs font-medium ${tone}`}>{title}</p>
                  {list.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-4 text-sm text-foreground/90">{list.map((x) => <li key={x}>{x}</li>)}</ul>
                  ) : (
                    <p className="text-sm text-muted">None noted.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : r.status === "failed" ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted">The AI evaluation didn&apos;t finish. The transcript is saved.</p>
            <button aria-busy={retrying} type="button" className={btnOutline} onClick={retry} disabled={retrying}>Retry evaluation</button>
          </div>
        ) : (
          <p className="text-sm text-muted">{IV_STATUS[r.status]}</p>
        )}
      </FormSection>

      <FormSection title="Full transcript">
        {r.transcript.length > 0 ? (
          <ol className="space-y-3 text-sm">
            {r.transcript.map((l, i) => (
              <li key={i} className={`max-w-[85%] rounded-lg px-3 py-2 ${l.role === "agent" ? "bg-surface" : "ml-auto border border-border"}`}>
                <p className="mb-0.5 text-xs font-medium text-muted">{l.role === "agent" ? "Interviewer" : "Candidate"}</p>
                <p className="whitespace-pre-wrap leading-relaxed">{l.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">No transcript yet.</p>
        )}
      </FormSection>
    </>
  );
}
