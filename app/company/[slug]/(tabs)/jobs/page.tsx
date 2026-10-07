import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { btnOutline, CompanyLogo, Icon, icons } from "@/components/ui";
import { WORKPLACES } from "@/lib/job-fields";
import { companyJobs } from "@/lib/jobs";
import { companyFor, slugOf } from "../../data";

/** Open jobs at the company. Verified employees post them from here. */
export default async function JobsTab({ params }: { params: Promise<{ slug: string }> }) {
  const { userId } = await auth.protect();
  const c = await companyFor(userId, await slugOf(params));
  if (!c) notFound();
  const jobs = await companyJobs(userId, c.id);

  return (
    <>
      {c.me.verified && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm text-muted">You verified you work here, so you can post jobs for {c.name}.</p>
          <Link href={`/dashboard/jobs/post?company=${c.id}`} className={btnOutline}><Icon d={icons.plus} size={14} />Post a job</Link>
        </div>
      )}
      {jobs.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted">No open jobs right now.</p>
      ) : (
        <ul className="divide-y divide-border">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/dashboard/jobs?id=${j.id}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
                <CompanyLogo name={c.name} src={c.logoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-link">{j.title}</p>
                  <p className="truncate text-xs text-muted">{[j.location, WORKPLACES[j.workplace]].filter(Boolean).join(" · ")}</p>
                  {j.page?.verified && <p className="mt-1 flex items-center gap-1 text-xs text-success"><Icon d={icons.verified} size={12} />Verified poster</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
