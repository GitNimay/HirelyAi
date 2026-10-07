import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { AboutCompany, JobFacts, Prose } from "@/components/jobs";
import { PublicShell, publicDate } from "@/components/public-shell";
import { btnLg, btnPrimary } from "@/components/ui";
import { JOB_TYPES, WORKPLACES } from "@/lib/job-fields";
import { getPublicJob } from "@/lib/jobs";

type Props = { params: Promise<{ id: string }> };
const load = cache(async (id: string) => getPublicJob(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const j = await load((await params).id);
  if (!j) return { title: "Job not found | Hire Excellence" };
  const title = `${j.title} at ${j.company}`;
  const description = [j.location, WORKPLACES[j.workplace], JOB_TYPES[j.type], j.salary].filter(Boolean).join(" · ");
  return { title: `${title} | Hire Excellence`, description, openGraph: { title, description, type: "website" } };
}

/** The shared-link view of a job for people without an account. Members go straight to it in the app. */
export default async function PublicJobPage({ params }: Props) {
  const { id } = await params;
  if ((await auth()).userId) redirect(`/dashboard/jobs?id=${encodeURIComponent(id)}`);
  const j = await load(id);
  if (!j) notFound();

  const where = j.location ? `${j.location} (${WORKPLACES[j.workplace]})` : WORKPLACES[j.workplace];
  return (
    <PublicShell cta={j.closedAt ? "Find more jobs like this" : "Join to apply with your profile"}>
      <article>
        <div className="space-y-4 border-b border-border p-4">
          <p className="text-sm font-medium break-words">{j.company}</p>
          <div>
            <h1 className="font-display text-xl font-normal text-balance break-words">{j.title}</h1>
            <p className="mt-1 text-sm text-muted">{where} · Posted {publicDate(j.createdAt)}</p>
          </div>
          {j.closedAt ? (
            <p className="text-sm text-muted">No longer accepting applications</p>
          ) : (
            <Link href="/sign-up" className={`${btnPrimary} ${btnLg} w-full sm:w-auto`}>Sign up to apply</Link>
          )}
        </div>
        <JobFacts job={j} h="h2" />
        <section className="border-b border-border p-4">
          <h2 className="mb-3 text-sm font-medium">Posted by</h2>
          <p className="text-sm">{j.poster.name}</p>
          {j.poster.headline && <p className="text-xs text-muted">{j.poster.headline}</p>}
        </section>
        <section className={`p-4 ${j.page ? "border-b border-border" : ""}`}>
          <h2 className="mb-3 text-sm font-medium">About the job</h2>
          <div className="space-y-3 break-words text-sm leading-relaxed text-foreground/90">
            <Prose text={j.description} h="h3" />
          </div>
        </section>
        {j.page && <AboutCompany name={j.company} page={j.page} h="h2" linked={false} />}
      </article>
    </PublicShell>
  );
}
