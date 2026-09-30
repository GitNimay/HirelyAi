import { Icon, icons } from "@/components/ui";
import { Line, Loading, PageHeader, PersonRowSkeleton, Skeleton, times } from "@/components/skeleton";

const heading = (w: string) => <div className="flex h-12 items-center px-4"><Line className="text-sm" w={w} /></div>;

/** components/network.tsx, Grow tab: counts, search, invitations, people you may know. */
export default function NetworkLoading() {
  return (
    <>
      <PageHeader title="My Network" tabs={["Grow", "Connections", "Sent"]} action={<Skeleton className="h-3 w-56 max-w-[50%]" />} />
      <div className="border-b border-border px-4 py-3">
        <div className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted">
          <Icon d={icons.search} size={16} />
          Search people by name or headline
        </div>
      </div>
      <Loading label="Loading your network…">
        <section className="border-b border-border">
          {heading("22%")}
          {times(2, (i) => <PersonRowSkeleton key={i} i={i} />)}
        </section>
        <section>
          {heading("36%")}
          <div className="divide-y divide-border">{times(6, (i) => <PersonRowSkeleton key={i} i={i + 2} />)}</div>
        </section>
      </Loading>
    </>
  );
}
