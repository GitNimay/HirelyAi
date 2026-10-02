import Link from "next/link";
import type { ReactNode } from "react";
import type { CompanyCard } from "@/lib/companies";
import { fmtRange, STATUSES, type Experience, type Resume } from "@/lib/resume-fields";
import { CompanyLogo, Icon, icons, type IconDef } from "./ui";

const cap = "M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5";

/**
 * A resume as read-only sections. `own` is the private Resume tab (contact details, preferences, empty sections
 * say so); otherwise it's the public About tab: no contact details, and empty sections are left out.
 * `companies`: pages linked from experience, for logos and links. `experience` replaces that section (your own About tab edits it).
 */
export function ResumeSections({ r, own, companies = {}, experience }: { r: Resume; own?: boolean; companies?: Record<string, CompanyCard>; experience?: ReactNode }) {
  const show = (has: boolean) => own || has;
  return (
    <>
      {own && (
        <Block title="Contact">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[["Email", r.email], ["Phone", r.phone], ["City", r.city], ["Status", STATUSES[r.status]]].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="truncate">{v || "—"}</dd></div>
            ))}
          </dl>
        </Block>
      )}
      {r.summary && <Block title="About"><p className="whitespace-pre-line text-sm text-muted">{r.summary}</p></Block>}
      {experience ?? (show(r.experience.length > 0) && (
        <Block title="Experience" empty={!r.experience.length}>
          {r.experience.map((e, i) => <ExperienceItem key={i} e={e} page={e.companyId ? companies[e.companyId] : undefined} />)}
        </Block>
      ))}
      {show(r.education.length > 0) && (
        <Block title="Education" empty={!r.education.length}>
          {r.education.map((e, i) => (
            <Item key={i} title={e.school} sub={[[e.degree, e.field].filter(Boolean).join(", "), e.grade].filter(Boolean).join(" · ")} when={fmtRange(e.start, e.end)} icon={cap} />
          ))}
        </Block>
      )}
      {show(r.projects.length > 0) && (
        <Block title="Projects" empty={!r.projects.length}>
          {r.projects.map((p, i) => <Item key={i} title={p.name} sub={p.link} body={p.description} icon={icons.file} />)}
        </Block>
      )}
      {show(r.skills.length > 0) && <Block title="Skills"><Chips items={r.skills} /></Block>}
      {own && <Block title="Preferred locations"><Chips items={r.preferredLocations} /></Block>}
    </>
  );
}

/** One job: the company page's logo (linked) when it has one, LinkedIn's grey placeholder otherwise. */
export function ExperienceItem({ e, page, action }: { e: Experience; page?: CompanyCard; action?: ReactNode }) {
  const company = page ? <Link href={`/company/${page.slug}`} className="hover:underline">{e.company}</Link> : e.company;
  const logo = <CompanyLogo name={e.company} src={page?.logoUrl} size={36} />;
  return (
    <Item
      title={e.title}
      sub={<>{company}{e.location && ` · ${e.location}`}</>}
      when={fmtRange(e.start, e.end, e.current)}
      body={e.description}
      lead={page ? <Link href={`/company/${page.slug}`} aria-label={e.company} className="mt-0.5 shrink-0">{logo}</Link> : <span className="mt-0.5">{logo}</span>}
      action={action}
    />
  );
}

export function Block({ title, empty, action, children }: { title: string; empty?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-5 first:border-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {empty ? <p className="text-sm text-muted">Nothing added yet.</p> : children}
    </section>
  );
}

function Item({ title, sub, when, body, icon = icons.jobs, lead, action }: { title: string; sub?: ReactNode; when?: string; body?: string; icon?: IconDef; lead?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex gap-3">
      {lead ?? <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted"><Icon d={icon} size={16} /></span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-sm font-medium">{title}</h3>
          <span className="flex items-center gap-1">
            {when && <span className="text-xs text-muted">{when}</span>}
            {action}
          </span>
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
