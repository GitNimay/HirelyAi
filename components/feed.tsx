"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import * as actions from "@/app/dashboard/actions";
import { loadUserPosts } from "@/app/in/actions";
import type { Comment, MediaInput } from "@/app/dashboard/actions";
import type { FeedPost, FeedTab, ProfileTab } from "@/lib/feed";
import { isVideo, MAX_ALT_CHARS, MAX_COMMENT_CHARS, MAX_IMAGES, MAX_POST_CHARS, maxBytes, MEDIA_TYPES } from "@/lib/media";
import { profileHref } from "@/lib/profile-fields";
import { ask, Clamp, Menu, Modal, scrollToTop, setParam, Tabs, toast } from "./kit";
import { CommentsSkeleton, PostsSkeleton } from "./skeleton";
import { ago, Avatar, btnGhost, btnLg, btnPrimary, CompanyLogo, Icon, icons, menuItem } from "./ui";
import { useRealtime } from "./use-realtime";

type Viewer = { id: string; name: string; imageUrl?: string };
type Page = { posts: FeedPost[]; next: string | null };

const iconBtn = "flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong");

/**
 * Home timeline, a single post when `single` (share links), or one member's posts / likes when `list` (profile tabs:
 * no header or composer, same cards and live updates). Live via /api/realtime.
 */
/** `list.compose`: a company page's Posts tab for its admins: a composer that posts as the company. */
type AsCompany = { id: string; name: string; logoUrl: string | null };

export function Feed({ viewer, initial, initialTab = "for-you", followingIds, single, list }: { viewer: Viewer; initial: Page; initialTab?: FeedTab; followingIds: string[]; single?: boolean; list?: { userId: string; tab: ProfileTab; empty: string; compose?: AsCompany } }) {
  const [tab, setTab] = useState<FeedTab>(initialTab);
  const [page, setPage] = useState(initial);
  const [fresh, setFresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(() => new Set(followingIds));
  const sentinel = useRef<HTMLDivElement>(null);

  const patch = (id: string, fn: (p: FeedPost) => Partial<FeedPost>) =>
    setPage((pg) => ({ ...pg, posts: pg.posts.map((p) => (p.id === id ? { ...p, ...fn(p) } : p)) }));

  async function load(t: FeedTab, append = false) {
    setLoading(true);
    try {
      const cursor = append ? (page.next ?? undefined) : undefined;
      const res = list ? await loadUserPosts(list.userId, list.tab, cursor) : await actions.loadFeed(t, cursor);
      setPage((pg) => (append ? { posts: [...pg.posts, ...res.posts.filter((p) => !pg.posts.some((q) => q.entryId === p.entryId))], next: res.next } : res));
      if (!append) setFresh(0);
    } finally {
      setLoading(false);
    }
  }

  useRealtime((e) => {
    if (e.t === "stats") patch(e.id, () => ({ likes: e.likes, comments: e.comments, reposts: e.reposts }));
    else if (e.t === "edit") patch(e.id, () => ({ body: e.body, media: e.media, editedAt: e.editedAt }));
    else if (e.t === "delete") setPage((pg) => ({ ...pg, posts: pg.posts.filter((p) => p.entryId !== e.id && p.id !== e.id) }));
    else if (e.t === "profile")
      setPage((pg) => ({
        ...pg,
        posts: pg.posts.map((p) => ({
          ...p,
          author: p.author.id === e.id ? { ...p.author, name: e.name, handle: e.handle, headline: e.headline, imageUrl: e.imageUrl } : p.author,
          repostedBy: p.repostedBy?.id === e.id ? { id: e.id, name: e.name } : p.repostedBy,
        })),
      }));
    else if (e.t === "post" && !single && !list && e.authorId !== viewer.id && (tab === "for-you" || following.has(e.authorId))) setFresh((n) => n + 1);
  });

  const loadMore = useEffectEvent(() => {
    if (page.next && !loading) load(tab, true);
  });
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, []);

  const handlers = {
    async like(p: FeedPost) {
      patch(p.id, (q) => ({ liked: !q.liked, likes: q.likes + (q.liked ? -1 : 1) }));
      try {
        await actions.toggleLike(p.id);
      } catch {
        patch(p.id, (q) => ({ liked: !q.liked, likes: q.likes + (q.liked ? -1 : 1) }));
        toast("Couldn't update the like. Try again.");
      }
    },
    async repost(p: FeedPost) {
      patch(p.id, (q) => ({ reposted: !q.reposted, reposts: q.reposts + (q.reposted ? -1 : 1) }));
      try {
        await actions.toggleRepost(p.id);
      } catch {
        patch(p.id, (q) => ({ reposted: !q.reposted, reposts: q.reposts + (q.reposted ? -1 : 1) }));
        toast("Couldn't update the repost. Try again.");
      }
    },
    async follow(authorId: string) {
      const res = await actions.toggleFollow(authorId).catch(() => null);
      if (!res) return toast("Couldn't update. Try again.");
      const now = res.following;
      setFollowing((s) => {
        const n = new Set(s);
        if (now) n.add(authorId);
        else n.delete(authorId);
        return n;
      });
      setPage((pg) => ({ ...pg, posts: pg.posts.map((p) => (p.author.id === authorId ? { ...p, following: now } : p)) }));
    },
    async edit(p: FeedPost, body: string, media: MediaInput[]) {
      const res = await actions.editPost(p.id, { body, media });
      if ("error" in res) return res.error;
      patch(p.id, () => ({ body: res.body, media: res.media, editedAt: res.editedAt }));
      return null;
    },
    async remove(p: FeedPost) {
      if (!(await ask({ title: "Delete post?", body: "It will be removed from your profile and everyone's feed. This can't be undone.", confirm: "Delete", danger: true }))) return;
      try {
        await actions.deletePost(p.entryId);
      } catch {
        return toast("Couldn't delete the post. Try again.");
      }
      setPage((pg) => ({ ...pg, posts: pg.posts.filter((q) => q.entryId !== p.entryId && q.id !== p.entryId) }));
      toast("Post deleted");
    },
  };

  return (
    <>
      {!single && !list && (
        <>
          <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
            <Tabs
              label="Feed"
              fill
              tabs={[{ id: "for-you", label: "For you" }, { id: "following", label: "Following" }]}
              value={tab}
              onChange={(t) => {
                if (t === tab) return;
                setTab(t);
                setParam("tab", t === "for-you" ? null : t);
                setPage({ posts: [], next: null }); // placeholders, not the other tab's posts, until it loads
                load(t);
              }}
            />
          </header>
          <Composer viewer={viewer} onPosted={(p) => setPage((pg) => ({ ...pg, posts: [p, ...pg.posts] }))} />
        </>
      )}

      {list?.compose && <Composer viewer={viewer} company={list.compose} onPosted={(p) => setPage((pg) => ({ ...pg, posts: [p, ...pg.posts] }))} />}

      {fresh > 0 && (
        <div className="sticky top-16 z-10 flex justify-center" aria-live="polite">
          <button
            type="button"
            onClick={() => {
              load(tab);
              scrollToTop();
            }}
            className="mt-2 h-8 rounded-full bg-link px-4 text-sm font-medium text-background shadow-lg"
          >
            Show {fresh} new {fresh === 1 ? "post" : "posts"}
          </button>
        </div>
      )}

      {page.posts.map((p) => (
        <PostCard key={p.entryId} post={p} viewerId={viewer.id} openComments={single} {...handlers} />
      ))}

      {!single && (
        <div ref={sentinel}>
          {loading ? (
            <PostsSkeleton n={page.posts.length ? 2 : 3} />
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              {page.posts.length === 0 ? (list ? list.empty : tab === "following" ? "Follow people to see their posts here." : "No posts yet. Be the first to share something.") : page.next ? "" : "You're all caught up."}
            </p>
          )}
        </div>
      )}
    </>
  );
}

const mediaUrl = (key: string) => `/api/media/${key}`;

/** A post's media while composing or editing: already-stored files (key) plus new local files (file), each with alt text. */
type DraftItem = { key?: string; file?: File; type: string; url: string; alt: string };

function useMediaDraft(initial: FeedPost["media"] = []) {
  const [items, setItems] = useState<DraftItem[]>(() => initial.map((m) => ({ ...m, alt: m.alt ?? "", url: mediaUrl(m.key) })));
  const [error, setError] = useState("");

  function add(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const types = [...items.map((i) => i.type), ...picked.map((f) => f.type)];
    const videos = types.filter(isVideo).length;
    const bad = picked.find((f) => !MEDIA_TYPES[f.type]);
    const big = picked.find((f) => f.size > maxBytes(f.type));
    if (bad) setError("Only JPEG, PNG, WebP, GIF, MP4 and WebM are supported");
    else if (big) setError(`${big.name} is too large (max ${maxBytes(big.type) / 1024 / 1024} MB)`);
    else if (videos > 1 || (videos && types.length > 1) || types.length > MAX_IMAGES) setError(`Add up to ${MAX_IMAGES} images or 1 video`);
    else {
      setError("");
      setItems((xs) => [...xs, ...picked.map((file) => ({ file, type: file.type, url: URL.createObjectURL(file), alt: "" }))]);
    }
  }

  function remove(i: number) {
    if (items[i].file) URL.revokeObjectURL(items[i].url);
    setItems((xs) => xs.filter((_, j) => j !== i));
  }

  const setAlt = (i: number, alt: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, alt } : x)));

  /** Upload new files (in order) and return the post's media: keys plus descriptions. */
  async function upload(): Promise<MediaInput[]> {
    const out: MediaInput[] = [];
    for (const it of items) {
      if (it.key) {
        out.push({ key: it.key, alt: it.alt });
        continue;
      }
      const res = await fetch("/api/uploads", { method: "PUT", headers: { "Content-Type": it.type }, body: it.file });
      const json = (await res.json()) as { key?: string; error?: string };
      if (!res.ok || !json.key) throw new Error(json.error || "Upload failed");
      out.push({ key: json.key, alt: it.alt });
    }
    return out;
  }

  function clear() {
    items.forEach((i) => i.file && URL.revokeObjectURL(i.url));
    setItems([]);
  }

  return { items, error, setError, add, remove, setAlt, upload, clear, hasNew: items.some((i) => i.file) };
}

type MediaDraft = ReturnType<typeof useMediaDraft>;

function MediaPreviews({ draft, disabled }: { draft: MediaDraft; disabled: boolean }) {
  const { items } = draft;
  const [describing, setDescribing] = useState<number | null>(null);
  if (items.length === 0) return null;
  return (
    <div className={`mt-2 grid gap-2 ${items.length > 1 ? "grid-cols-2" : ""}`}>
      {items.map((it, i) => (
        <div key={it.url} className="relative overflow-hidden rounded-xl border border-border bg-surface">
          {isVideo(it.type) ? (
            <video src={it.url} controls preload="metadata" className="max-h-[360px] w-full bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- blob preview or auth-gated R2 media
            <img src={it.url} alt={it.alt} className={`w-full object-cover ${items.length > 1 ? "aspect-square" : "max-h-[360px]"}`} />
          )}
          <button type="button" aria-label="Remove" onClick={() => draft.remove(i)} disabled={disabled} className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black">
            <Icon d={icons.close} size={14} />
          </button>
          {!isVideo(it.type) && (
            // X-style "ALT" chip: describes the image for people using screen readers
            <button
              type="button"
              disabled={disabled}
              onClick={() => setDescribing(i)}
              aria-label={it.alt ? `Edit image description: ${it.alt}` : "Add image description"}
              className="absolute bottom-2 left-2 inline-flex h-6 items-center gap-1 rounded-md bg-black/70 px-2 text-xs font-semibold text-white hover:bg-black"
            >
              {it.alt && <Icon d={icons.check} size={12} />}
              ALT
            </button>
          )}
        </div>
      ))}
      {describing !== null && items[describing] && (
        <AltDialog url={items[describing].url} initial={items[describing].alt} onSave={(alt) => draft.setAlt(describing, alt)} onClose={() => setDescribing(null)} />
      )}
    </div>
  );
}

function AltDialog({ url, initial, onSave, onClose }: { url: string; initial: string; onSave: (alt: string) => void; onClose: () => void }) {
  const [alt, setAlt] = useState(initial);
  return (
    <Modal title="Image description" onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(alt.trim());
          onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- blob preview or auth-gated R2 media */}
        <img src={url} alt="" className="max-h-56 w-full rounded-lg border border-border bg-surface object-contain" />
        <label className="block space-y-1.5">
          <span className="flex items-baseline justify-between text-sm font-medium">
            Description
            <span className="text-xs font-normal tabular-nums text-muted">{alt.length}/{MAX_ALT_CHARS}</span>
          </span>
          <textarea
            data-autofocus
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            maxLength={MAX_ALT_CHARS}
            rows={3}
            placeholder="What's in this image? For people using screen readers."
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted focus:border-ring"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

function MediaButtons({ draft, disabled }: { draft: MediaDraft; disabled: boolean }) {
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const { items } = draft;
  const hasVideo = items.some((i) => isVideo(i.type));
  return (
    <div className="flex gap-1">
      <input ref={imageInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => (draft.add(e.target.files), (e.target.value = ""))} />
      <input ref={videoInput} type="file" hidden accept="video/mp4,video/webm" onChange={(e) => (draft.add(e.target.files), (e.target.value = ""))} />
      <button type="button" className={iconBtn} disabled={disabled || hasVideo || items.length >= MAX_IMAGES} onClick={() => imageInput.current?.click()}>
        <Icon d={icons.photo} size={16} />
        <span className="hidden sm:inline">Photo</span>
      </button>
      <button type="button" className={iconBtn} disabled={disabled || items.length > 0} onClick={() => videoInput.current?.click()}>
        <Icon d={icons.video} size={16} />
        <span className="hidden sm:inline">Video</span>
      </button>
    </div>
  );
}

function Composer({ viewer, company, onPosted }: { viewer: Viewer; company?: AsCompany; onPosted: (p: FeedPost) => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const media = useMediaDraft();

  async function submit() {
    setBusy(true);
    media.setError("");
    try {
      const res = await actions.createPost({ body, media: await media.upload(), companyId: company?.id });
      if ("error" in res) throw new Error(res.error);
      media.clear();
      setBody("");
      onPosted(res.post);
      toast("Posted");
    } catch (e) {
      media.setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const canPost = !busy && (body.trim().length > 0 || media.items.length > 0);

  return (
    <section className="flex gap-3 border-b border-border p-4">
      {company ? <CompanyLogo name={company.name} src={company.logoUrl} size={40} /> : <Avatar name={viewer.name} src={viewer.imageUrl} />}
      <div className="min-w-0 flex-1">
        <textarea
          rows={Math.min(8, Math.max(2, body.split("\n").length))}
          value={body}
          maxLength={MAX_POST_CHARS}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && canPost && submit()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={company ? `Post as ${company.name}` : "Share an update or opportunity"}
          aria-label="Write a post"
          className="w-full resize-none bg-transparent pt-2 text-sm leading-relaxed placeholder:text-muted outline-none"
        />
        <MediaPreviews draft={media} disabled={busy} />
        {media.error && <p role="alert" className="mt-2 text-sm text-danger">{media.error}</p>}
        <div className="mt-2 flex items-center justify-between">
          <MediaButtons draft={media} disabled={busy} />
          <div className="flex items-center gap-3">
            {focused && canPost && <span className="hidden text-xs text-muted sm:inline">Ctrl / ⌘ + Enter to post</span>}
            {body.length > MAX_POST_CHARS - 200 && <span className="text-xs tabular-nums text-muted">{MAX_POST_CHARS - body.length}</span>}
            <button type="button" disabled={!canPost} onClick={submit} className={`${btnPrimary} px-4`}>
              {busy ? (media.hasNew ? "Uploading…" : "Posting…") : "Post"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Inline editor for an own post: text plus keep/remove/add photos or a video. */
function PostEditor({ post, save, onDone }: { post: FeedPost; save: Handlers["edit"]; onDone: () => void }) {
  const [body, setBody] = useState(post.body);
  const [busy, setBusy] = useState(false);
  const media = useMediaDraft(post.media);
  const sig = (m: { key?: string; alt?: string }[]) => JSON.stringify(m.map((x) => [x.key, x.alt ?? ""]));
  const changed = body.trim() !== post.body || media.hasNew || sig(media.items) !== sig(post.media);
  const canSave = !busy && changed && (body.trim().length > 0 || media.items.length > 0);

  function close() {
    media.clear();
    onDone();
  }

  async function submit() {
    setBusy(true);
    media.setError("");
    try {
      const err = await save(post, body, await media.upload());
      if (err) throw new Error(err);
      close();
    } catch (e) {
      media.setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <textarea
        autoFocus
        rows={Math.min(10, Math.max(3, body.split("\n").length))}
        value={body}
        maxLength={MAX_POST_CHARS}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) close();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSave) submit();
        }}
        aria-label="Edit post"
        className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-ring"
      />
      <MediaPreviews draft={media} disabled={busy} />
      {media.error && <p role="alert" className="mt-2 text-sm text-danger">{media.error}</p>}
      <div className="mt-2 flex items-center justify-between">
        <MediaButtons draft={media} disabled={busy} />
        <div className="flex gap-2">
          <button type="button" onClick={close} disabled={busy} className={btnGhost}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!canSave} className={`${btnPrimary} px-4`}>
            {busy ? (media.hasNew ? "Uploading…" : "Saving…") : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

type Handlers = {
  like: (p: FeedPost) => void;
  repost: (p: FeedPost) => void;
  follow: (authorId: string) => void;
  edit: (p: FeedPost, body: string, media: MediaInput[]) => Promise<string | null>;
  remove: (p: FeedPost) => void;
};

function PostCard({ post: p, viewerId, openComments, like, repost, follow, edit, remove }: { post: FeedPost; viewerId: string; openComments?: boolean } & Handlers) {
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(!!openComments);
  const mine = p.author.id === viewerId;
  const ownEntry = p.repostedBy ? p.repostedBy.id === viewerId : mine;
  // A company post shows as the page; its admin author stays behind the scenes
  const who = p.company
    ? { name: p.company.name, href: `/company/${p.company.slug}`, avatar: <CompanyLogo name={p.company.name} src={p.company.logoUrl} size={40} />, sub: "Company page" }
    : { name: p.author.name, href: profileHref(p.author), avatar: <Avatar name={p.author.name} src={p.author.imageUrl ?? undefined} />, sub: p.author.headline };

  async function share() {
    const url = `${location.origin}/post/${p.id}`; // public page; members are sent on to the app
    if (navigator.share) {
      await navigator.share({ url, title: `Post by ${who.name}` }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).then(() => toast("Link copied"), () => toast("Couldn't copy the link"));
    }
  }

  // X hides zero counts; the accessible name still carries the number when there is one
  const count = (n: number) => (n > 0 ? <span className="tabular-nums">{n}</span> : null);
  const named = (label: string, n: number) => (n > 0 ? `${label}, ${n}` : label);

  return (
    <article className="border-b border-border p-4">
      {p.repostedBy && (
        <p className="mb-2 ml-[52px] flex items-center gap-1.5 text-xs text-muted">
          <Icon d={icons.repost} size={12} />
          {p.repostedBy.id === viewerId ? "You" : <Link href={`/in/${p.repostedBy.id}`} className="hover:underline">{p.repostedBy.name}</Link>} reposted
        </p>
      )}
      <div className="flex gap-3">
        <Link href={who.href} aria-label={who.name} className="shrink-0 self-start rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {who.avatar}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate text-sm">
                <Link href={who.href} className="truncate font-medium hover:underline">{who.name}</Link>
                <Link href={`/dashboard/post/${p.id}`} className="shrink-0 text-muted hover:underline">
                  · <Time ms={p.createdAt} />
                </Link>
                {p.editedAt && <span className="shrink-0 text-muted" title={new Date(p.editedAt).toLocaleString()} suppressHydrationWarning>· Edited</span>}
              </p>
              {who.sub && <p className="truncate text-xs text-muted">{who.sub}</p>}
            </div>
            <div className="-mt-1 flex shrink-0 items-center gap-1">
              {!mine && !p.following && !p.company && (
                <button type="button" onClick={() => follow(p.author.id)} className={`${btnGhost} px-2 text-link hover:text-link`}>
                  <Icon d={icons.plus} size={14} />
                  Follow
                </button>
              )}
              {(ownEntry || (!mine && p.following && !p.company)) && (
                <Menu
                  label="More options"
                  button={<Icon d={icons.more} size={18} />}
                  className="flex size-8 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  panelClassName="right-0 top-9 w-52"
                >
                  {ownEntry && !p.repostedBy && (
                    <button type="button" role="menuitem" onClick={() => setEditing(true)} className={menuItem}>
                      <Icon d={icons.edit} size={14} /> Edit post
                    </button>
                  )}
                  {ownEntry && !p.repostedBy && (
                    <button type="button" role="menuitem" onClick={() => remove(p)} className={`${menuItem} text-danger`}>
                      <Icon d={icons.trash} size={14} /> Delete post
                    </button>
                  )}
                  {ownEntry && p.repostedBy && (
                    <button type="button" role="menuitem" onClick={() => repost(p)} className={menuItem}>
                      <Icon d={icons.repost} size={14} /> Undo repost
                    </button>
                  )}
                  {!mine && p.following && (
                    <button type="button" role="menuitem" onClick={() => follow(p.author.id)} className={menuItem}>
                      <Icon d={icons.connect} size={14} /> Unfollow {p.author.name.split(" ")[0]}
                    </button>
                  )}
                </Menu>
              )}
            </div>
          </div>

          {editing ? (
            <PostEditor post={p} save={edit} onDone={() => setEditing(false)} />
          ) : (
            <>
              {p.body &&
                (openComments ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{p.body}</p>
                ) : (
                  <Clamp className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{p.body}</Clamp>
                ))}
              <MediaGrid media={p.media} />
            </>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 border-t border-border [&>button]:h-11 [&>button]:justify-center">
        <button type="button" aria-label={named("Like", p.likes)} aria-pressed={p.liked} onClick={() => like(p)} className={`${iconBtn} ${p.liked ? "text-danger hover:text-danger" : ""}`}>
          <Icon d={icons.like} size={16} className={p.liked ? "fill-current" : ""} />
          <span className="hidden sm:inline">Like</span>
          {count(p.likes)}
        </button>
        <button type="button" aria-label={named("Comment", p.comments)} aria-expanded={showComments} onClick={() => setShowComments((s) => !s)} className={`${iconBtn} ${showComments ? "text-foreground" : ""}`}>
          <Icon d={icons.comment} size={16} />
          <span className="hidden sm:inline">Comment</span>
          {count(p.comments)}
        </button>
        <button
          type="button"
          aria-label={named("Repost", p.reposts)}
          aria-pressed={p.reposted}
          disabled={mine}
          title={mine ? "You can't repost your own post" : undefined}
          onClick={() => repost(p)}
          className={`${iconBtn} ${p.reposted ? "text-success hover:text-success" : ""}`}
        >
          <Icon d={icons.repost} size={16} />
          <span className="hidden sm:inline">Repost</span>
          {count(p.reposts)}
        </button>
        <button type="button" aria-label="Share" onClick={share} className={iconBtn}>
          <Icon d={icons.share} size={16} />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      {showComments && <Comments postId={p.id} count={p.comments} />}
    </article>
  );
}

/** Relative time ("3h"), with the full date on hover and for assistive tech. */
function Time({ ms }: { ms: number }) {
  return (
    <time dateTime={new Date(ms).toISOString()} title={new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} suppressHydrationWarning>
      {ago(ms)}
    </time>
  );
}

/** Photos open in a lightbox (Ctrl/⌘-click still opens the file in a new tab). Three photos: one tall, two stacked, like X. */
function MediaGrid({ media }: { media: FeedPost["media"] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (media.length === 0) return null;
  const src = mediaUrl;
  if (isVideo(media[0].type)) {
    return <video src={src(media[0].key)} controls playsInline preload="metadata" className="mt-3 max-h-[520px] w-full rounded-xl border border-border bg-black" />;
  }
  const n = media.length;
  return (
    <>
      <div className={`mt-3 grid gap-1 overflow-hidden rounded-xl border border-border ${n > 1 ? "grid-cols-2" : ""}`}>
        {media.map((m, i) => {
          const tall = n === 3 && i === 0;
          return (
            <a
              key={m.key}
              href={src(m.key)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open image${n > 1 ? ` ${i + 1} of ${n}` : ""}${m.alt ? `: ${m.alt}` : ""}`}
              className={`block ${tall ? "row-span-2" : ""}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                setOpen(i);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated R2 media, served by /api/media */}
              <img src={src(m.key)} alt={m.alt ?? ""} loading="lazy" decoding="async" className={`w-full bg-surface object-cover ${tall ? "h-full" : n > 1 ? "aspect-square" : "max-h-[520px]"}`} />
            </a>
          );
        })}
      </div>
      {open !== null && (
        <Modal title={n > 1 ? `Image ${open + 1} of ${n}` : "Image"} wide onClose={() => setOpen(null)}>
          <div className="flex items-center justify-center gap-2 bg-black/40 p-2">
            {n > 1 && (
              <button type="button" aria-label="Previous image" onClick={() => setOpen((open + n - 1) % n)} className={`${btnGhost} px-2`}>
                <Icon d={icons.back} size={18} />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated R2 media, served by /api/media */}
            <img src={src(media[open].key)} alt={media[open].alt ?? ""} className="max-h-[75vh] min-w-0 flex-1 object-contain" />
            {n > 1 && (
              <button type="button" aria-label="Next image" onClick={() => setOpen((open + 1) % n)} className={`${btnGhost} px-2`}>
                <Icon d={icons.back} size={18} className="rotate-180" />
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function Comments({ postId, count }: { postId: string; count: number }) {
  const [items, setItems] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // (Re)load when opened and whenever the live count changes, so others' comments appear in realtime
  useEffect(() => {
    let live = true;
    actions.loadComments(postId).then((c) => live && setItems(c), () => live && setError("Couldn't load comments"));
    return () => {
      live = false;
    };
  }, [postId, count]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await actions.addComment(postId, body);
      if ("error" in res) throw new Error(res.error);
      setItems(res.comments);
      setBody("");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_COMMENT_CHARS}
          placeholder="Add a comment"
          aria-label="Add a comment"
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm placeholder:text-muted outline-none focus:border-ring"
        />
        <button type="submit" disabled={busy || !body.trim()} className={`${btnPrimary} ${btnLg}`}>
          Reply
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {items === null ? (
        <CommentsSkeleton />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Link href={profileHref(c.author)} aria-label={c.author.name} className="shrink-0 self-start rounded-full">
                <Avatar name={c.author.name} src={c.author.imageUrl ?? undefined} size={28} />
              </Link>
              <div className="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2">
                <p className="text-xs">
                  <Link href={profileHref(c.author)} className="font-medium hover:underline">{c.author.name}</Link>{" "}
                  <span className="text-muted">· <Time ms={c.createdAt} /></span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
