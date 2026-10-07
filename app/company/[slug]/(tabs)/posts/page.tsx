import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Feed } from "@/components/feed";
import { getUserPosts } from "@/lib/feed";
import { companyFor, slugOf } from "../../data";

/** The page's posts. Admins get a composer that posts as the company; followers see these in their Following feed. */
export default async function PostsTab({ params }: { params: Promise<{ slug: string }> }) {
  const { userId } = await auth.protect();
  const c = await companyFor(userId, await slugOf(params));
  if (!c) notFound();
  const initial = await getUserPosts(userId, c.id, "company");
  return (
    <Feed
      viewer={{ id: userId, name: "" }}
      initial={initial}
      list={{ userId: c.id, tab: "company", empty: `${c.name} hasn't posted yet.`, compose: c.me.role ? { id: c.id, name: c.name, logoUrl: c.logoUrl } : undefined }}
    />
  );
}
