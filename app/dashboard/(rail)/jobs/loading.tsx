import Link from "next/link";
import { btnOutline, Icon, icons } from "@/components/ui";
import { JobRowsSkeleton, PageHeader, Skeleton } from "@/components/skeleton";

/** components/jobs.tsx: header, search and filters, then the results. */
export default function JobsLoading() {
  return (
    <>
      <PageHeader
        title="Jobs"
        tabs={["Search", "Saved", "Applied", "Posted"]}
        action={<Link href="/dashboard/jobs/post" className={`${btnOutline} h-10 sm:h-8`}><Icon d={icons.plus} size={14} />Post a job</Link>}
      />
      <div aria-hidden className="space-y-2 border-b border-border px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-10 sm:flex-[3]" />
          <Skeleton className="h-10 sm:flex-[2]" />
          <Skeleton className="h-10 w-full sm:w-[74px]" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[104, 96, 84, 96].map((w, i) => <Skeleton key={i} className="h-10 rounded-full sm:h-8" style={{ width: w }} />)}
        </div>
      </div>
      <JobRowsSkeleton />
    </>
  );
}
