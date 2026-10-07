import type { ReactNode } from "react";
import { Line, Loading, Skeleton, times } from "@/components/skeleton";

const block = (title: string, children: ReactNode) => (
  <section className="space-y-3 border-t border-border pt-5 first:border-0">
    <Line className="text-sm" w={title} />
    {children}
  </section>
);
const item = (i: number) => (
  <div key={i} className="flex gap-3">
    <Skeleton className="mt-0.5 size-9 shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="flex justify-between gap-3"><Line className="flex-1 text-sm" w={["45%", "38%"][i % 2]} /><Line className="w-20 text-xs" w="100%" /></div>
      <Line className="text-sm" w={["35%", "50%"][i % 2]} />
      <div className="mt-1.5 text-sm"><Line w="92%" /><Line w="70%" /></div>
    </div>
  </div>
);

/** app/in/[handle]/resume/page.tsx: contact grid, experience, education, skills. */
export default function ResumeLoading() {
  return (
    <Loading label="Loading resume…" className="space-y-6 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Line className="text-xs" w="260px" />
        <div className="flex gap-2"><Skeleton className="h-8 w-32 rounded-lg" /><Skeleton className="h-8 w-28 rounded-lg" /></div>
      </div>
      {block("12%", (
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {times(4, (i) => <div key={i}><Line className="text-xs" w="15%" /><Line className="text-sm" w={["70%", "45%", "35%", "50%"][i]} /></div>)}
        </div>
      ))}
      {block("16%", times(2, item))}
      {block("14%", item(1))}
      {block("10%", (
        <div className="flex flex-wrap gap-1.5">{[64, 88, 52, 76, 96, 60].map((w, i) => <Skeleton key={i} className="h-[22px] rounded-full" style={{ width: w }} />)}</div>
      ))}
    </Loading>
  );
}
