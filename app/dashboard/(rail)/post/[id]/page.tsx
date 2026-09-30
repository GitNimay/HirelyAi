import { notFound, redirect } from "next/navigation";
import { Feed } from "@/components/feed";
import { BackButton } from "@/components/kit";
import { getPost } from "@/lib/feed";
import { signedIn } from "@/lib/profile";

export const metadata = { title: "Post | Hire Excellence" };

/** Permalink target for "Share". */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await signedIn();
  if (!session) redirect("/sign-in");
  const viewer = session.me;
  const post = await getPost(viewer.id, (await params).id);
  if (!post || post.repostedBy) notFound();

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
        <BackButton />
        <h1 className="text-sm font-semibold">Post</h1>
      </header>
      <Feed single viewer={viewer} initial={{ posts: [post], next: null }} followingIds={[]} />
    </>
  );
}
