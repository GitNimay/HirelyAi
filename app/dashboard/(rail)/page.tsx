import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Feed } from "@/components/feed";
import { getFeed, getFollowingIds } from "@/lib/feed";
import { viewerOf } from "@/lib/profile";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const [initial, followingIds, viewer] = await Promise.all([getFeed(user.id, "for-you"), getFollowingIds(user.id), viewerOf(user)]);

  return <Feed viewer={viewer} initial={initial} followingIds={followingIds} />;
}
