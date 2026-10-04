import { auth } from "@clerk/nextjs/server";
import { Jobs } from "@/components/jobs";
import { cleanFilters, type MyJobsTab } from "@/lib/job-fields";
import { getJob, lastApplication, myJobs, searchJobs } from "@/lib/jobs";
import { signedIn } from "@/lib/profile";
import { getResume } from "@/lib/resume";

export const metadata = { title: "Jobs | Hire Excellence" };

const MY_TABS: string[] = ["saved", "applied", "posted"] satisfies MyJobsTab[];

/** ?tab= picks the list, ?id= opens a job, the rest are search filters, so every view is a shareable link. */
export default async function JobsPage({ searchParams }: PageProps<"/dashboard/jobs">) {
  const { userId } = await auth.protect();
  const params = await searchParams;
  const filters = cleanFilters(params);
  const tab = typeof params.tab === "string" && MY_TABS.includes(params.tab) ? (params.tab as MyJobsTab) : "search";
  const id = typeof params.id === "string" ? params.id : undefined;
  const [page, selected, last, session, resume] = await Promise.all([
    tab === "search" ? searchJobs(userId, filters) : myJobs(userId, tab).then((jobs) => ({ jobs, next: null })),
    id ? getJob(userId, id) : null,
    lastApplication(userId),
    signedIn(),
    getResume(userId),
  ]);

  return (
    <Jobs
      viewerId={userId}
      initialTab={tab}
      initial={page}
      initialFilters={filters}
      initialSelected={selected ?? null}
      contact={{
        email: last?.email || resume?.email || session?.account.email || "",
        phone: last?.phone || resume?.phone || session?.account.phone || "",
      }}
      profile={resume && {
        name: resume.name, headline: resume.headline, imageUrl: session?.me.imageUrl ?? null, handle: session?.me.handle ?? userId,
        counts: { experience: resume.experience.length, education: resume.education.length, projects: resume.projects.length, skills: resume.skills.length },
      }}
    />
  );
}
