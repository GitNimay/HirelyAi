import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Feed } from "@/components/feed";
import { FollowList, MediaGrid, ReplyList } from "@/components/profile";
import { getUserPosts, type ProfileTab } from "@/lib/feed";
import { listFollows, type FollowDir } from "@/lib/network";
import { getReplies } from "@/lib/profile";
import { profileFor, refOf } from "./data";

type Props = { params: Promise<{ handle: string }> };

async function context(params: Props["params"], tab: ProfileTab | "replies") {
  const { userId } = await auth.protect();
  const profile = await profileFor(userId, await refOf(params));
  if (!profile || (tab === "likes" && profile.id !== userId)) notFound(); // likes are private to their owner
  return { userId, profile, own: profile.id === userId };
}

export async function TimelineTab({ params, tab }: Props & { tab: ProfileTab }) {
  const { userId, profile, own } = await context(params, tab);
  const initial = await getUserPosts(userId, profile.id, tab);

  if (tab === "media") return <MediaGrid userId={profile.id} initial={initial} own={own} />;
  const first = profile.name.split(" ")[0];
  const empty = tab === "likes" ? "Posts you like will show up here. Only you can see them." : own ? "You haven't posted yet." : `${first} hasn't posted yet.`;
  return <Feed viewer={{ id: userId, name: "" }} initial={initial} list={{ userId: profile.id, tab, empty }} />;
}

export async function RepliesTab({ params }: Props) {
  const { profile, own } = await context(params, "replies");
  return <ReplyList author={{ id: profile.id, name: profile.name, handle: profile.handle, imageUrl: profile.imageUrl }} initial={await getReplies(profile.id)} own={own} />;
}

export async function FollowsTab({ params, dir }: Props & { dir: FollowDir }) {
  const { userId, profile, own } = await context(params, "posts");
  const first = profile.name.split(" ")[0];
  const empty =
    dir === "followers" ? (own ? "No one follows you yet." : `No one follows ${first} yet.`)
    : own ? "You don't follow anyone yet." : `${first} doesn't follow anyone yet.`;
  return <FollowList userId={profile.id} viewerId={userId} dir={dir} initial={await listFollows(userId, profile.id, dir)} empty={empty} />;
}
