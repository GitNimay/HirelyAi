import { Loading, PersonRowSkeleton, times } from "@/components/skeleton";

export default function FollowersLoading() {
  return <Loading label="Loading followers…" className="divide-y divide-border">{times(4, (i) => <PersonRowSkeleton key={i} i={i} />)}</Loading>;
}
