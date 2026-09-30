"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import * as actions from "@/app/dashboard/actions";
import { loadFollows, loadReplies, loadUserPosts, saveProfile, setProfileVisibility } from "@/app/in/actions";
import { cropImage } from "@/lib/crop-image";
import type { FeedPost } from "@/lib/feed";
import type { FollowDir, FollowPerson } from "@/lib/network";
import { isVideo } from "@/lib/media";
import type { Connection, Profile, Reply } from "@/lib/profile";
import { AVATAR_PX, COVER_PX, LIMITS, MAX_PROFILE_IMAGE_BYTES, PROFILE_IMAGE_TYPES, profileHref, shortUrl } from "@/lib/profile-fields";
import { AccountMenu } from "./account-menu";
import { field, Field } from "./jobs";
import { ask, BackButton, leaveIfClean, TabLabel, toast, useUnsavedGuard } from "./kit";
import { PendingButton } from "./network";
import { MediaTilesSkeleton, RepliesSkeleton } from "./skeleton";
import { ago, Avatar, backBtn, btn, btnGhost, btnOutline, btnPrimary, Icon, icons } from "./ui";
import { useRealtime } from "./use-realtime";

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong");
const camera = "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8";
const link = "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71";
const calendar = "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";

/** Top bar, cover, identity, actions and tabs. The tab pages render below it. Live: another tab or member editing this profile refreshes it. */
export function ProfileHeader({ profile, own }: { profile: Profile; own: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [seen, setSeen] = useState(profile);
  const [rel, setRel] = useState(profile.rel);
  const [busy, setBusy] = useState(false);
  // Fresh server data (after router.refresh) replaces what our clicks changed locally
  if (seen !== profile) {
    setSeen(profile);
    setRel(profile.rel);
  }

  const base = profileHref(profile);
  const tabs = [
    { href: base, label: "Posts" },
    ...(!own && profile.resumePublic ? [{ href: `${base}/about`, label: "About" }] : []),
    { href: `${base}/replies`, label: "Replies" },
    { href: `${base}/media`, label: "Media" },
    ...(own ? [{ href: `${base}/likes`, label: "Likes" }, { href: `${base}/resume`, label: "Resume" }] : []),
  ];
  const followers = profile.counts.followers + Number(rel.following) - Number(profile.rel.following);
  const first = profile.name.split(" ")[0];

  useRealtime((e) => {
    if (e.t !== "profile" || e.id !== profile.id) return;
    if (e.handle !== profile.handle) location.replace(`/in/${e.handle}`);
    else router.refresh();
  });

  /** Optimistic: show the new state now, tell the server, and fall back to the truth if it fails. */
  async function run(next: Partial<typeof rel>, call: () => Promise<unknown>, reload = false) {
    setBusy(true);
    setRel((r) => ({ ...r, ...next }));
    try {
      await call();
    } catch {
      setRel(profile.rel);
      toast("Couldn't update. Try again.");
    } finally {
      setBusy(false);
      if (reload) router.refresh();
    }
  }

  const follow = () => run({ following: !rel.following }, () => actions.toggleFollow(profile.id));
  const connection: Record<Connection, React.ReactNode> = {
    none: (
      <button type="button" className={btnPrimary} disabled={busy} onClick={() => run({ connection: "sent" }, () => actions.connect(profile.id), true)}>
        <Icon d={icons.connect} size={14} />
        Connect
      </button>
    ),
    sent: <PendingButton disabled={busy} onClick={() => run({ connection: "none" }, () => actions.withdrawInvite(profile.id), true)} />,
    received: (
      <button type="button" className={btnPrimary} disabled={busy} onClick={() => run({ connection: "connected", following: true }, () => actions.acceptInvite(profile.id), true)}>
        Accept
      </button>
    ),
    connected: (
      <button
        type="button"
        title="Remove connection"
        className={btnOutline}
        disabled={busy}
        onClick={async () =>
          (await ask({ title: `Remove ${profile.name}?`, body: "They won't be notified. You can send a new invitation later.", confirm: "Remove connection", danger: true })) &&
          run({ connection: "none", following: false }, () => actions.removeConnection(profile.id), true)
        }
      >
        <Icon d={icons.check} size={14} />
        Connected
      </button>
    ),
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
        <BackButton />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold leading-tight">{profile.name}</h1>
          <p className="text-xs text-muted">{profile.counts.posts} {profile.counts.posts === 1 ? "post" : "posts"}</p>
        </div>
        {/* Phones have no sidebar: settings, theme and log out live here */}
        {own && (
          <div className="sm:hidden">
            <AccountMenu name={profile.name} compact />
          </div>
        )}
      </header>

      <section>
        <div className="aspect-[3/1] bg-gradient-to-br from-surface-hover to-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated R2 media, served by /api/media */}
          {profile.coverUrl && <img src={profile.coverUrl} alt="" className="size-full object-cover" />}
        </div>

        <div className="px-4">
          <div className="flex items-end justify-between">
            <div className="-mt-12 rounded-full border-4 border-background bg-background">
              <Avatar name={profile.name} src={profile.imageUrl ?? undefined} size={96} />
            </div>
            <div className="flex gap-2 pt-3">
              {own ? (
                <Link href="/settings/profile" className={btnOutline}>
                  <Icon d={icons.edit} size={14} />
                  Edit profile
                </Link>
              ) : (
                <>
                  {connection[rel.connection]}
                  <button type="button" aria-pressed={rel.following} className={btnOutline} disabled={busy} onClick={follow}>
                    {rel.following ? "Following" : "Follow"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3">
            <h2 className="text-xl font-semibold leading-tight">{profile.name}</h2>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
              <span>@{profile.handle ?? profile.id}</span>
              {!own && rel.followsYou && <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs">Follows you</span>}
              {profile.openToWork && <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Open to work</span>}
            </p>
          </div>
          {profile.headline && <p className="mt-2 text-sm">{profile.headline}</p>}
          {profile.bio && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{profile.bio}</p>}

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {profile.location && (
              <li className="flex items-center gap-1.5">
                <Icon d={icons.pin} size={15} />
                {profile.location}
              </li>
            )}
            {profile.website && (
              <li className="flex min-w-0 items-center gap-1.5">
                <Icon d={link} size={15} />
                <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-link hover:underline">
                  {shortUrl(profile.website)}
                </a>
              </li>
            )}
            {profile.joinedAt && (
              <li className="flex items-center gap-1.5">
                <Icon d={calendar} size={15} />
                Joined {new Date(profile.joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
              </li>
            )}
          </ul>

          <dl className="mt-3 flex gap-4 text-sm">
            {([
              ["connections", profile.counts.connections, own ? "/dashboard/network?tab=connections" : null],
              ["following", profile.counts.following, `${base}/following`],
              ["followers", followers, `${base}/followers`],
            ] as const).map(([k, n, href]) => (
              <div key={k}>
                <dt className="sr-only">{k}</dt>
                <dd>
                  {href ? (
                    <Link href={href} className="group flex gap-1 hover:underline">
                      <span className="font-semibold tabular-nums">{n}</span>
                      <span className="capitalize text-muted">{k}</span>
                    </Link>
                  ) : (
                    <span className="flex gap-1">
                      <span className="font-semibold tabular-nums">{n}</span>
                      <span className="capitalize text-muted">{k}</span>
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {!own && rel.mutual > 0 && (
            <p className="mt-2 text-xs text-muted">
              You and {first} have {rel.mutual} mutual {rel.mutual === 1 ? "connection" : "connections"}
            </p>
          )}
        </div>

        <nav aria-label="Profile sections" className="mt-3 flex border-b border-border">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-12 flex-1 items-center justify-center text-sm transition-colors outline-none hover:bg-surface hover:text-foreground focus-visible:bg-surface ${active ? "font-medium text-foreground" : "text-muted"}`}
              >
                <TabLabel on={active}>{t.label}</TabLabel>
              </Link>
            );
          })}
        </nav>
      </section>

    </>
  );
}

type Picked = { blob: Blob; url: string };

async function upload(blob: Blob) {
  const res = await fetch("/api/uploads?for=profile", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
  const json = (await res.json()) as { key?: string; error?: string };
  if (!res.ok || !json.key) throw new Error(json.error || "Upload failed");
  return json.key;
}

/**
 * The /settings/profile page: everything about the profile that members can change.
 * Images are cropped in the browser (1:1 avatar, 3:1 cover), uploaded, then the text fields are saved.
 */
export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const back = profileHref(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [avatar, setAvatar] = useState<Picked | null>(null);
  const [cover, setCover] = useState<Picked | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [dirty, setDirty] = useState(false);
  const unsaved = dirty || !!avatar || !!cover || coverRemoved;
  useUnsavedGuard(unsaved);
  /** Back / Cancel ask before dropping unsaved edits. */
  function leave(e: React.MouseEvent) {
    if (!unsaved) return;
    e.preventDefault();
    leaveIfClean(true).then((ok) => ok && router.push(back));
  }
  const coverInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined, size: { w: number; h: number }, set: (p: Picked) => void) {
    if (!file) return;
    setError("");
    if (!PROFILE_IMAGE_TYPES.includes(file.type)) return setError("Use a JPEG, PNG or WebP image");
    if (file.size > MAX_PROFILE_IMAGE_BYTES * 2) return setError("That image is too large (max 10 MB)");
    try {
      const blob = await cropImage(file, size.w, size.h);
      set({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => String(fd.get(k) ?? "");
    setBusy(true);
    setError("");
    try {
      const [avatarKey, coverKey] = await Promise.all([avatar && upload(avatar.blob), cover && upload(cover.blob)]);
      const res = await saveProfile({
        name: val("name"), handle: val("handle"), headline: val("headline"), bio, location: val("location"), website: val("website"),
        avatarKey: avatarKey || undefined, coverKey: coverKey || undefined, removeCover: coverRemoved && !cover,
      });
      if ("error" in res) throw new Error(res.error);
      setDirty(false);
      toast("Profile saved");
      // A new handle means a new URL, and the nav's Me link (in a shared layout) needs it too: one full load
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional hard navigation
      if (res.handle !== profile.handle) return location.assign(`/in/${res.handle}`);
      router.push(back);
      router.refresh();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  const coverSrc = cover?.url ?? (coverRemoved ? null : profile.coverUrl);
  const overlay = "absolute flex size-9 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-50";

  return (
    <form onSubmit={submit} onChange={() => setDirty(true)} className="space-y-4 pb-8">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
          <Link href={back} onClick={leave} aria-label="Back to profile" className={backBtn}>
            <Icon d={icons.back} size={18} />
          </Link>
          <h1 className="flex-1 text-sm font-semibold">Edit profile</h1>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </header>
        <div className="relative aspect-[3/1] bg-gradient-to-br from-surface-hover to-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob preview or auth-gated R2 media */}
          {coverSrc && <img src={coverSrc} alt="" className="size-full object-cover" />}
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <button type="button" aria-label="Change cover photo" disabled={busy} onClick={() => coverInput.current?.click()} className={`${overlay} static`}>
              <Icon d={camera} size={18} />
            </button>
            {coverSrc && (
              <button
                type="button"
                aria-label="Remove cover photo"
                disabled={busy}
                onClick={() => (setCover(null), setCoverRemoved(true))}
                className={`${overlay} static`}
              >
                <Icon d={icons.close} size={18} />
              </button>
            )}
          </div>
          <input ref={coverInput} type="file" hidden accept={PROFILE_IMAGE_TYPES.join()} onChange={(e) => (pick(e.target.files?.[0], COVER_PX, (p) => (setCover(p), setCoverRemoved(false))), (e.target.value = ""))} />
        </div>

        <div className="px-5">
          <div className="relative -mt-14 w-fit rounded-full border-4 border-background bg-background">
            <Avatar name={profile.name} src={avatar?.url ?? profile.imageUrl ?? undefined} size={88} />
            <button type="button" aria-label="Change profile photo" disabled={busy} onClick={() => avatarInput.current?.click()} className={`${overlay} inset-0 m-auto`}>
              <Icon d={camera} size={18} />
            </button>
            <input ref={avatarInput} type="file" hidden accept={PROFILE_IMAGE_TYPES.join()} onChange={(e) => (pick(e.target.files?.[0], AVATAR_PX, setAvatar), (e.target.value = ""))} />
          </div>
        </div>

        <div className="space-y-4 px-5">
          <Field label="Name">
            <input name="name" required maxLength={LIMITS.name} defaultValue={profile.name} autoComplete="name" className={field} />
          </Field>
          <Field label="Headline" hint="shown under your name across the app">
            <input name="headline" maxLength={LIMITS.headline} defaultValue={profile.headline ?? ""} placeholder="Product designer at Acme" className={field} />
          </Field>
          <Field label="Bio" hint={`${bio.length}/${LIMITS.bio}`}>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={LIMITS.bio} className={`${field} h-auto resize-none py-2`} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" hint="optional">
              <input name="location" maxLength={LIMITS.location} defaultValue={profile.location ?? ""} placeholder="Pune, India" className={field} />
            </Field>
            <Field label="Website" hint="optional">
              <input name="website" maxLength={LIMITS.website} defaultValue={profile.website ?? ""} placeholder="example.com" inputMode="url" className={field} />
            </Field>
          </div>
          <Field label="Profile URL" hint="3-30 letters, numbers, hyphens. Changing it breaks links to your old URL">
            <div className="flex h-10 items-center rounded-md border border-border pl-3 text-sm text-muted focus-within:border-ring">
              <span>/in/</span>
              <input
                name="handle"
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
                defaultValue={profile.handle ?? ""}
                autoCapitalize="none"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent px-1 text-foreground outline-none"
              />
            </div>
          </Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Link href={back} onClick={leave} className={btnGhost}>Cancel</Link>
            <button type="submit" className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
    </form>
  );
}

type Page = { posts: FeedPost[]; next: string | null };

/** The Media tab: a grid of the member's photo and video posts, each opening its post. */
export function MediaGrid({ userId, initial, own }: { userId: string; initial: Page; own: boolean }) {
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function more() {
    setLoading(true);
    try {
      const r = await loadUserPosts(userId, "media", page.next ?? undefined);
      setPage((pg) => ({ posts: [...pg.posts, ...r.posts.filter((p) => !pg.posts.some((q) => q.entryId === p.entryId))], next: r.next }));
    } finally {
      setLoading(false);
    }
  }

  if (page.posts.length === 0) return <p className="px-4 py-12 text-center text-sm text-muted">{own ? "Photos and videos you post will show up here." : "No photos or videos yet."}</p>;
  return (
    <>
      <ul className="grid grid-cols-3 gap-0.5 p-0.5">
        {page.posts.map((p) => (
          <li key={p.entryId} className="relative aspect-square bg-surface">
            <Link href={`/dashboard/post/${p.id}`} aria-label="Open post" className="block size-full">
              {isVideo(p.media[0].type) ? (
                <video src={`/api/media/${p.media[0].key}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- auth-gated R2 media, served by /api/media
                <img src={`/api/media/${p.media[0].key}`} alt={p.media[0].alt ?? ""} loading="lazy" decoding="async" className="size-full object-cover" />
              )}
              {(isVideo(p.media[0].type) || p.media.length > 1) && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white">
                  <Icon d={isVideo(p.media[0].type) ? icons.video : icons.photo} size={12} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {loading ? (
        <div className="-mt-0.5"><MediaTilesSkeleton n={3} /></div>
      ) : (
        page.next && (
          <button type="button" onClick={more} className="h-12 w-full text-sm text-muted transition-colors hover:bg-surface hover:text-foreground">
            Load more
          </button>
        )
      )}
    </>
  );
}

/** The Replies tab: the member's comments, each with the post it answers. */
export function ReplyList({ author, initial, own }: { author: { id: string; name: string; handle: string | null; imageUrl: string | null }; initial: { replies: Reply[]; next: string | null }; own: boolean }) {
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function more() {
    setLoading(true);
    try {
      const r = await loadReplies(author.id, page.next ?? undefined);
      setPage((pg) => ({ replies: [...pg.replies, ...r.replies.filter((x) => !pg.replies.some((y) => y.id === x.id))], next: r.next }));
    } finally {
      setLoading(false);
    }
  }

  if (page.replies.length === 0) return <p className="px-4 py-12 text-center text-sm text-muted">{own ? "Your replies to other posts show up here." : "No replies yet."}</p>;
  return (
    <>
      <ul>
        {page.replies.map((r) => (
          <li key={r.id} className="border-b border-border p-4">
            <p className="mb-2 ml-[52px] text-xs text-muted">
              Replying to <Link href={profileHref(r.post.author)} className="text-link hover:underline">{r.post.author.name}</Link>
            </p>
            <div className="flex gap-3">
              <Avatar name={author.name} src={author.imageUrl ?? undefined} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm">
                  <span className="truncate font-medium">{author.name}</span>
                  <span className="shrink-0 text-muted" suppressHydrationWarning>· {ago(r.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{r.body}</p>
                <Link href={`/dashboard/post/${r.post.id}`} className="mt-3 block rounded-lg border border-border p-3 text-sm transition-colors hover:bg-surface">
                  <span className="font-medium">{r.post.author.name}</span>
                  <p className="mt-0.5 line-clamp-2 text-muted">{r.post.body || (r.post.hasMedia ? "Photo or video" : "")}</p>
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {loading ? (
        <RepliesSkeleton n={2} />
      ) : (
        page.next && (
          <button type="button" onClick={more} className={`${btn} h-12 w-full rounded-none text-muted hover:bg-surface hover:text-foreground`}>
            Load more
          </button>
        )
      )}
    </>
  );
}

/** Followers / following of one member (X style): who they are, and a Follow toggle for everyone but you. */
export function FollowList({ userId, viewerId, dir, initial, empty }: {
  userId: string;
  viewerId: string;
  dir: FollowDir;
  initial: { people: FollowPerson[]; next: string | null };
  empty: string;
}) {
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function more() {
    setLoading(true);
    try {
      const r = await loadFollows(userId, dir, page.next ?? undefined);
      setPage((pg) => ({ people: [...pg.people, ...r.people.filter((p) => !pg.people.some((q) => q.id === p.id))], next: r.next }));
    } finally {
      setLoading(false);
    }
  }

  async function follow(p: FollowPerson) {
    setBusy(p.id);
    const flip = (on: boolean) => setPage((pg) => ({ ...pg, people: pg.people.map((q) => (q.id === p.id ? { ...q, iFollow: on } : q)) }));
    flip(!p.iFollow);
    try {
      const { following } = await actions.toggleFollow(p.id);
      flip(following);
    } catch {
      flip(p.iFollow);
      toast("Couldn't update. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label={dir === "followers" ? "Followers" : "Following"}>
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{dir === "followers" ? "Followers" : "Following"}</h2>
      {page.people.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {page.people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={profileHref(p)} aria-label={p.name} className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={p.name} src={p.imageUrl ?? undefined} size={40} />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <Link href={profileHref(p)} className="truncate text-sm font-medium hover:underline">{p.name}</Link>
                  {p.id !== viewerId && p.followsYou && <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-xs text-muted">Follows you</span>}
                </p>
                {p.headline && <p className="truncate text-xs text-muted">{p.headline}</p>}
              </div>
              {p.id !== viewerId && (
                <button type="button" aria-pressed={p.iFollow} disabled={busy === p.id} onClick={() => follow(p)} className={p.iFollow ? btnOutline : btnPrimary}>
                  {p.iFollow ? "Following" : "Follow"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {page.next && (
        <button type="button" onClick={more} disabled={loading} className={`${btn} h-12 w-full rounded-none border-t border-border text-muted hover:bg-surface hover:text-foreground`}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </section>
  );
}

/** On your Resume tab: opt in to showing your resume sections on your profile, and to the "Open to work" badge. Saves on change. */
export function ProfileVisibility({ resumePublic, openToWork }: { resumePublic: boolean; openToWork: boolean }) {
  const router = useRouter();
  const [v, setV] = useState({ resumePublic, openToWork });
  const [busy, setBusy] = useState(false);

  async function change(next: typeof v) {
    setV(next);
    setBusy(true);
    try {
      await setProfileVisibility(next);
      toast("Visibility saved");
      router.refresh();
    } catch {
      setV(v);
      toast("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { key: "resumePublic", label: "Show my experience on my profile", hint: "Members see your summary, experience, education, projects and skills in an About tab. Contact details stay private." },
    { key: "openToWork", label: "Open to work", hint: "Adds an \"Open to work\" badge next to your name so recruiters know you're looking." },
  ] as const;

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4" disabled={busy}>
      <legend className="px-1 text-sm font-semibold">Profile visibility</legend>
      {options.map((o) => (
        <label key={o.key} className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" role="switch" checked={v[o.key]} onChange={(e) => change({ ...v, [o.key]: e.target.checked })} className="mt-0.5 size-4 shrink-0 accent-foreground" />
          <span>
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-xs text-muted">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
