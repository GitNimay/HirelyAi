import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Feed } from "@/components/feed";
import { Icon } from "@/components/ui";
import { getPost } from "@/lib/feed";
import { viewerOf } from "@/lib/profile";

/** Permalink target for "Share". */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const [post, viewer] = await Promise.all([getPost(user.id, (await params).id), viewerOf(user)]);
  if (!post || post.repostedBy) notFound();

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
        <Link href="/dashboard" aria-label="Back" className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground">
          <Icon d="M19 12H5M12 19l-7-7 7-7" size={18} />
        </Link>
        <h1 className="text-sm font-semibold">Post</h1>
      </header>
      <Feed single viewer={viewer} initial={{ posts: [post], next: null }} followingIds={[]} />
    </>
  );
}
