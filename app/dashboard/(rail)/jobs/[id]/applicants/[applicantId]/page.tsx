import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicantInterview, FormSection } from "@/components/jobs";
import { BackButton } from "@/components/kit";
import { ResumeSections } from "@/components/resume-view";
import { Avatar, Icon, icons } from "@/components/ui";
import { companiesByIds } from "@/lib/companies";
import { interviewResult } from "@/lib/interview";
import { KINDS } from "@/lib/interview-fields";
import { STATUSES } from "@/lib/job-fields";
import { applicationProfile, getApplicants, getJob } from "@/lib/jobs";
import { STATUSES as CAREER } from "@/lib/resume-fields";

export const metadata = { title: "Applicant | Hire Excellence" };

/** One applicant's full application for the job's poster: contact, the profile they sent, note, optional PDF, interview verdict and transcript. */
export default async function ApplicantPage({ params }: PageProps<"/dashboard/jobs/[id]/applicants/[applicantId]">) {
  const { userId } = await auth.protect();
  const { id, applicantId } = await params;
  // getApplicants, applicationProfile and interviewResult all check the viewer posted this job
  const [job, [a], profile, result] = await Promise.all([
    getJob(userId, id), getApplicants(userId, id, applicantId), applicationProfile(userId, id, applicantId), interviewResult(userId, id, applicantId),
  ]);
  if (!job || !a) notFound();
  const companies = profile ? await companiesByIds(profile.experience.flatMap((e) => e.companyId ?? [])) : {};

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
        <BackButton fallback={`/dashboard/jobs?tab=posted&id=${id}`} />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium">{a.name}</h1>
          <p className="truncate text-xs text-muted">{job.title} · {job.company}</p>
        </div>
      </header>

      <section className="flex items-start gap-4 border-b border-border px-4 py-5">
        <Avatar name={a.name} src={a.imageUrl ?? undefined} size={56} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/in/${a.id}`} className="block truncate font-display text-xl font-normal hover:underline underline-offset-2">{a.name}</Link>
              {a.headline && <p className="truncate text-sm text-muted">{a.headline}</p>}
            </div>
            <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-border px-2.5 text-xs font-medium">{a.status === "submitted" ? "Under review" : STATUSES[a.status]}</span>
          </div>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted" suppressHydrationWarning>
            <a href={`mailto:${a.email}`} className="text-link hover:underline underline-offset-2">{a.email}</a>
            {a.phone && <a href={`tel:${a.phone}`} className="hover:text-foreground">{a.phone}</a>}
            {profile?.city && <span>{profile.city}</span>}
            {profile && <span>{CAREER[profile.status]}</span>}
            <span>Applied {new Date(a.at).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
          </p>
          {a.resumeKey && (
            <a href={`/api/media/${a.resumeKey}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-link hover:underline underline-offset-2">
              <Icon d={icons.file} size={14} />
              View attached resume (PDF)
            </a>
          )}
        </div>
      </section>

      {profile && (
        <div className="space-y-6 border-b border-border px-4 py-5">
          <ResumeSections r={profile} companies={companies} />
          {profile.preferredLocations.length > 0 && (
            <p className="border-t border-border pt-5 text-sm"><span className="font-medium">Preferred locations</span> <span className="text-muted">· {profile.preferredLocations.join(", ")}</span></p>
          )}
        </div>
      )}

      {a.note && (
        <FormSection title="Why they're a fit">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{a.note}</p>
        </FormSection>
      )}

      {result ? (
        <ApplicantInterview jobId={id} applicantId={applicantId} initial={result} />
      ) : (
        job.interview && (
          <FormSection title={KINDS[job.interview.kind]}>
            <p className="text-sm text-muted">Not taken yet.</p>
          </FormSection>
        )
      )}
    </>
  );
}
