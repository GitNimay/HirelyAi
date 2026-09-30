import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { btnOutline, btnPrimary, Icon, icons } from "@/components/ui";
import { getResume } from "@/lib/resume";
import { fmtRange, STATUSES } from "@/lib/resume-fields";
import { profileFor, refOf } from "../data";

const cap = "M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5";
const download = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3";

/** Your resume as recruiters get it: private to you (they receive a PDF snapshot when you apply). */
export default async function ResumeTab({ params }: { params: Promise<{ handle: string }> }) {
  const { userId } = await auth.protect();
  const [profile, r] = await Promise.all([profileFor(userId, await refOf(params)), getResume(userId)]);
  if (!profile || profile.id !== userId || !r) notFound();

  return (
    <div className="space-y-6 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Only you can see this. Jobs you apply to get it as a PDF.</p>
        <div className="flex gap-2">
          <a href="/api/resume" download className={btnOutline}><Icon d={download} size={14} />Download PDF</a>
          <Link href="/settings/resume" className={btnPrimary}><Icon d={icons.edit} size={14} />Edit resume</Link>
        </div>
      </div>

      <Block title="Contact">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[["Email", r.email], ["Phone", r.phone], ["City", r.city], ["Status", STATUSES[r.status]]].map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="truncate">{v || "—"}</dd></div>
          ))}
        </dl>
      </Block>
      {r.summary && <Block title="About"><p className="whitespace-pre-line text-sm text-muted">{r.summary}</p></Block>}
      <Block title="Experience" empty={!r.experience.length}>
        {r.experience.map((e, i) => (
          <Item key={i} title={e.title} sub={[e.company, e.location].filter(Boolean).join(" · ")} when={fmtRange(e.start, e.end, e.current)} body={e.description} />
        ))}
      </Block>
      <Block title="Education" empty={!r.education.length}>
        {r.education.map((e, i) => (
          <Item key={i} title={e.school} sub={[[e.degree, e.field].filter(Boolean).join(", "), e.grade].filter(Boolean).join(" · ")} when={fmtRange(e.start, e.end)} icon={cap} />
        ))}
      </Block>
      <Block title="Projects" empty={!r.projects.length}>
        {r.projects.map((p, i) => <Item key={i} title={p.name} sub={p.link} body={p.description} icon={icons.file} />)}
      </Block>
      <Block title="Skills"><Chips items={r.skills} /></Block>
      <Block title="Preferred locations"><Chips items={r.preferredLocations} /></Block>
    </div>
  );
}

function Block({ title, empty, children }: { title: string; empty?: boolean; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-5 first:border-0">
      <h2 className="text-sm font-semibold">{title}</h2>
      {empty ? <p className="text-sm text-muted">Nothing added yet.</p> : children}
    </section>
  );
}

function Item({ title, sub, when, body, icon = icons.jobs }: { title: string; sub?: string; when?: string; body?: string; icon?: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted"><Icon d={icon} size={16} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-sm font-medium">{title}</h3>
          {when && <span className="text-xs text-muted">{when}</span>}
        </div>
        {sub && <p className="text-[13px] text-muted">{sub}</p>}
        {body && <p className="mt-1.5 whitespace-pre-line text-[13px] text-muted">{body}</p>}
      </div>
    </div>
  );
}

const Chips = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((t) => <span key={t} className="rounded-full border border-border px-2.5 py-0.5 text-xs">{t}</span>)}
  </div>
);
