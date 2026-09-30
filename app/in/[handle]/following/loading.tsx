import { Loading, PersonRowSkeleton, times } from "@/components/skeleton";

export default function FollowingLoading() {
  return <Loading label="Loading following…" className="divide-y divide-border">{times(4, (i) => <PersonRowSkeleton key={i} i={i} />)}</Loading>;
}
