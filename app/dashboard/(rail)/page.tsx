import { redirect } from "next/navigation";
import { Feed } from "@/components/feed";
import { RecentActivity } from "@/components/notifications";
import { getFeed, getFollowingIds } from "@/lib/feed";
import { listNotifications } from "@/lib/notifications";
import { signedIn } from "@/lib/profile";

export const metadata = { title: "Home | Hire Excellence" };

export default async function HomePage({ searchParams }: PageProps<"/dashboard">) {
  const session = await signedIn();
  if (!session) redirect("/sign-in");
  const { me: viewer } = session;
  const tab = (await searchParams).tab === "following" ? "following" : "for-you";
  const [initial, followingIds, activity] = await Promise.all([getFeed(viewer.id, tab), getFollowingIds(viewer.id), listNotifications(viewer.id)]);

  return <Feed viewer={viewer} initial={initial} initialTab={tab} followingIds={followingIds} top={<RecentActivity items={activity.items} />} />;
}
