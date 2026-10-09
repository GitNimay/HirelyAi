import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { PublicShell, publicAvatar, publicDate } from "@/components/public-shell";
import { Avatar, Icon, icons } from "@/components/ui";
import { getPublicPost } from "@/lib/feed";
import { isVideo } from "@/lib/media";

type Props = { params: Promise<{ id: string }> };
const load = cache(async (id: string) => getPublicPost(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).id);
  if (!p) return { title: "Post not found | Hire Excellence" };
  const text = p.body.replace(/\s+/g, " ").slice(0, 160);
  const title = `${p.author.name} on Hire Excellence`;
  return { title: `${title}${text ? `: "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"` : ""}`, description: text, openGraph: { title, description: text, type: "article", images: "/og.jpg" } };
}

/** The shared-link view of a post for people without an account. Members go straight to it in the app. */
export default async function PublicPostPage({ params }: Props) {
  const { id } = await params;
  if ((await auth()).userId) redirect(`/dashboard/post/${id}`);
  const p = await load(id);
  if (!p) notFound();

  const media = p.media.length === 0 ? null : isVideo(p.media[0].type) ? "a video" : p.media.length === 1 ? "a photo" : `${p.media.length} photos`;
  const stats = [
    [p.likes, "reaction"],
    [p.comments, "comment"],
    [p.reposts, "repost"],
  ].filter(([n]) => Number(n) > 0).map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`);

  return (
    <PublicShell cta="Join to like, comment and follow">
      <article className="p-4">
        <div className="flex gap-3">
          <Avatar name={p.author.name} src={publicAvatar(p.author.imageUrl)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.author.name}</p>
            {p.author.headline && <p className="truncate text-xs text-muted">{p.author.headline}</p>}
            <p className="text-xs text-muted">
              <time dateTime={new Date(p.createdAt).toISOString()}>{publicDate(p.createdAt)}</time>
              {p.editedAt && " · Edited"}
            </p>
          </div>
        </div>
        {p.body && <p className="mt-3 whitespace-pre-wrap break-words text-pretty text-sm leading-relaxed">{p.body}</p>}
        {media && (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-muted">
            <Icon d={isVideo(p.media[0].type) ? icons.video : icons.photo} size={16} />
            This post includes {media}. Log in to see it.
          </p>
        )}
        {stats.length > 0 && <p className="mt-3 border-t border-border pt-3 text-xs tabular-nums text-muted">{stats.join(" · ")}</p>}
      </article>
    </PublicShell>
  );
}
