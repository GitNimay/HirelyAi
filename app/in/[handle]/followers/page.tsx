import { FollowsTab } from "../tab";

export default function FollowersPage({ params }: { params: Promise<{ handle: string }> }) {
  return <FollowsTab params={params} dir="followers" />;
}
