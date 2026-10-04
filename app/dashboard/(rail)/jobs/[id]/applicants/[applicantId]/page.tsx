import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicantInterview, FormSection } from "@/components/jobs";
import { BackButton } from "@/components/kit";
import { Avatar, Icon, icons } from "@/components/ui";
import { interviewResult } from "@/lib/interview";
import { STATUSES } from "@/lib/job-fields";
import { getApplicants, getJob } from "@/lib/jobs";

export const metadata = { title: "Applicant | Hire Excellence" };

/** One applicant's full application for the job's poster: contact, resume, note, interview onboarding, AI verdict, transcript. */
export default async function ApplicantPage({ params }: PageProps<"/dashboard/jobs/[id]/applicants/[applicantId]">) {
  const { userId } = await auth.protect();
  const { id, applicantId } = await params;
  // getApplicants and interviewResult both check the viewer posted this job
  const [job, [a], result] = await Promise.all([getJob(userId, id), getApplicants(userId, id, applicantId), interviewResult(userId, id, applicantId)]);
  if (!job || !a) notFound();

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
        <BackButton fallback={`/dashboard/jobs?tab=posted&id=${id}`} />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{a.name}</h1>
          <p className="truncate text-xs text-muted">{job.title} · {job.company}</p>
        </div>
      </header>

      <section className="flex gap-4 border-b border-border px-4 py-5">
        <Avatar name={a.name} src={a.imageUrl ?? undefined} size={56} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/in/${a.id}`} className="block truncate text-base font-semibold hover:underline">{a.name}</Link>
              {a.headline && <p className="truncate text-sm text-muted">{a.headline}</p>}
            </div>
            <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs">{a.status === "submitted" ? "Under review" : STATUSES[a.status]}</span>
          </div>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted" suppressHydrationWarning>
            <a href={`mailto:${a.email}`} className="text-link hover:underline">{a.email}</a>
            {a.phone && <a href={`tel:${a.phone}`} className="hover:text-foreground">{a.phone}</a>}
            <span>Applied {new Date(a.at).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
          </p>
          <a href={`/api/media/${a.resumeKey}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-link hover:underline">
            <Icon d={icons.file} size={14} />
            Download resume
          </a>
        </div>
      </section>

      {a.note && (
        <FormSection title="Why they're a fit">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{a.note}</p>
        </FormSection>
      )}

      {result ? (
        <ApplicantInterview jobId={id} applicantId={applicantId} initial={result} />
      ) : (
        job.interview && (
          <FormSection title="Voice interview">
            <p className="text-sm text-muted">Not taken yet.</p>
          </FormSection>
        )
      )}
    </>
  );
}
