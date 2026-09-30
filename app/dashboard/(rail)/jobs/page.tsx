import { auth, currentUser } from "@clerk/nextjs/server";
import { Jobs } from "@/components/jobs";
import { cleanFilters, type MyJobsTab } from "@/lib/job-fields";
import { getJob, lastApplication, myJobs, searchJobs } from "@/lib/jobs";

const MY_TABS: string[] = ["saved", "applied", "posted"] satisfies MyJobsTab[];

/** ?tab= picks the list, ?id= opens a job, the rest are search filters, so every view is a shareable link. */
export default async function JobsPage({ searchParams }: PageProps<"/dashboard/jobs">) {
  const { userId } = await auth.protect();
  const params = await searchParams;
  const filters = cleanFilters(params);
  const tab = typeof params.tab === "string" && MY_TABS.includes(params.tab) ? (params.tab as MyJobsTab) : "search";
  const id = typeof params.id === "string" ? params.id : undefined;
  const [page, selected, last, user] = await Promise.all([
    tab === "search" ? searchJobs(userId, filters) : myJobs(userId, tab).then((jobs) => ({ jobs, next: null })),
    id ? getJob(userId, id) : null,
    lastApplication(userId),
    currentUser(),
  ]);

  return (
    <Jobs
      viewerId={userId}
      initialTab={tab}
      initial={page}
      initialFilters={filters}
      initialSelected={selected ?? null}
      contact={{ email: last?.email ?? user?.primaryEmailAddress?.emailAddress ?? "", phone: last?.phone ?? user?.primaryPhoneNumber?.phoneNumber ?? "", resumeKey: last?.resumeKey ?? "" }}
    />
  );
}
