import type { ReactNode } from "react";
import { FieldSkeleton, Loading, PageHeader, Line, Skeleton } from "@/components/skeleton";

/** components/jobs.tsx PostJobForm: four sections of fields. */
export default function EditJobLoading() {
  const section = (title: string, children: ReactNode) => (
    <section className="space-y-4 border-b border-border px-4 py-6">
      <Line className="text-sm" w={title} />
      {children}
    </section>
  );
  return (
    <>
      <PageHeader title="Edit job" back className="gap-2 px-3" />
      <Loading label="Loading form…">
        {section("12%", <><FieldSkeleton w="15%" /><FieldSkeleton w="18%" /></>)}
        {section("18%", <div className="grid gap-4 sm:grid-cols-2"><FieldSkeleton w="45%" /><FieldSkeleton w="30%" /></div>)}
        {section("14%", <><div className="grid gap-4 sm:grid-cols-2"><FieldSkeleton w="30%" /><FieldSkeleton w="45%" /></div><FieldSkeleton w="20%" /></>)}
        {section("22%", <><Skeleton className="h-[258px] rounded-md" /><Line className="justify-end text-xs" w="30%" /></>)}
      </Loading>
    </>
  );
}
