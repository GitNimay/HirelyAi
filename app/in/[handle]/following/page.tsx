import { FollowsTab } from "../tab";

export default function FollowingPage({ params }: { params: Promise<{ handle: string }> }) {
  return <FollowsTab params={params} dir="following" />;
}
