import { redirect } from "next/navigation";
import { Feed } from "@/components/feed";
import { getFeed, getFollowingIds } from "@/lib/feed";
import { signedIn } from "@/lib/profile";

export default async function HomePage() {
  const session = await signedIn();
  if (!session) redirect("/sign-in");
  const { me: viewer } = session;
  const [initial, followingIds] = await Promise.all([getFeed(viewer.id, "for-you"), getFollowingIds(viewer.id)]);

  return <Feed viewer={viewer} initial={initial} followingIds={followingIds} />;
}
