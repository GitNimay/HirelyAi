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
        action={<Link href="/dashboard/jobs/post" className={btnOutline}><Icon d={icons.plus} size={14} />Post a job</Link>}
      />
      <div aria-hidden className="space-y-2 border-b border-border px-4 py-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-[3]" />
          <Skeleton className="h-9 flex-[2]" />
          <Skeleton className="h-9 w-[74px]" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[104, 96, 84, 96].map((w, i) => <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />)}
        </div>
      </div>
      <JobRowsSkeleton />
    </>
  );
}
