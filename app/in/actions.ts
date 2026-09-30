"use server";

import { env } from "cloudflare:workers";
import { getUserPosts, type ProfileTab } from "@/lib/feed";
import { failed, Fail, text, viewer, writer } from "@/lib/guard";
import { inFolder } from "@/lib/media";
import { listFollows, type FollowDir } from "@/lib/network";
import { getReplies } from "@/lib/profile";
import { cleanHandle, LIMITS, normalizeWebsite, PROFILE_IMAGE_TYPES, validHandle } from "@/lib/profile-fields";
import { broadcast } from "@/lib/realtime";

export async function loadUserPosts(userId: string, tab: ProfileTab, cursor?: string) {
  const me = await viewer();
  const t: ProfileTab = tab === "media" || tab === "likes" ? tab : "posts";
  // Likes are private, like on X: only their owner may list them
  if (t === "likes" && String(userId) !== me) return { posts: [], next: null };
  return getUserPosts(me, String(userId), t, cursor ? String(cursor) : undefined);
}

export async function loadReplies(userId: string, cursor?: string) {
  await viewer();
  return getReplies(String(userId), cursor ? String(cursor) : undefined);
}

export async function loadFollows(userId: string, dir: FollowDir, cursor?: string) {
  const me = await viewer();
  return listFollows(me, String(userId), dir === "following" ? "following" : "followers", cursor ? String(cursor) : undefined);
}

/** Who can see what on your own profile: the resume sections, and the "Open to work" badge. */
export async function setProfileVisibility(input: { resumePublic: boolean; openToWork: boolean }) {
  const me = await writer();
  await env.DB.prepare("UPDATE users SET resume_public = ?2, open_to_work = ?3, updated_at = ?4 WHERE id = ?1")
    .bind(me, input?.resumePublic === true ? 1 : 0, input?.openToWork === true ? 1 : 0, Date.now()).run();
}

export type ProfileInput = {
  name: string; handle: string; headline: string; bio: string; location: string; website: string;
  avatarKey?: string; coverKey?: string; removeCover?: boolean;
};

/** Save the caller's own profile. `avatarKey` / `coverKey` are keys just uploaded via /api/uploads?for=profile. */
export async function saveProfile(input: ProfileInput) {
  return save(input ?? ({} as ProfileInput)).then((r) => r, failed);
}

/** Only this member's own, freshly uploaded profile images qualify. */
async function checkImage(me: string, key: unknown) {
  const k = typeof key === "string" ? key : "";
  const obj = inFolder(k, "profiles", me) ? await env.MEDIA.head(k) : null;
  if (!obj || obj.customMetadata?.owner !== me || !PROFILE_IMAGE_TYPES.includes(obj.httpMetadata?.contentType ?? "")) throw new Fail("Image upload failed. Try again.");
  return k;
}

async function save(input: ProfileInput) {
  const me = await writer();
  const name = text(input.name, LIMITS.name);
  const handle = cleanHandle(String(input.handle ?? ""));
  const headline = text(input.headline, LIMITS.headline) || null;
  const bio = text(input.bio, LIMITS.bio).replace(/\n{3,}/g, "\n\n") || null;
  const location = text(input.location, LIMITS.location) || null;
  const website = normalizeWebsite(text(input.website, LIMITS.website));
  if (!name) throw new Fail("Name can't be empty");
  if (!validHandle(handle)) throw new Fail("Handle must be 3-30 letters, numbers or hyphens");
  if (website === undefined) throw new Fail("Enter a valid website, like example.com");

  const old = await env.DB.prepare("SELECT image_url, cover_key FROM users WHERE id = ?").bind(me).first<{ image_url: string | null; cover_key: string | null }>();
  if (!old) throw new Fail("Profile not found");
  const avatar = input.avatarKey ? await checkImage(me, input.avatarKey) : null;
  const cover = input.coverKey ? await checkImage(me, input.coverKey) : null;
  const imageUrl = avatar ? `/api/media/${avatar}` : old.image_url;
  const coverKey = input.removeCover ? null : (cover ?? old.cover_key);

  try {
    await env.DB.prepare(
      `UPDATE users SET name = ?2, handle = ?3, headline = ?4, bio = ?5, location = ?6, website = ?7, image_url = ?8, cover_key = ?9, custom = 1, updated_at = ?10
       WHERE id = ?1`,
    ).bind(me, name, handle, headline, bio, location, website, imageUrl, coverKey, Date.now()).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new Fail("That handle is taken");
    throw e;
  }

  // Replaced images are referenced nowhere else (profiles/ folder), so free them
  const stale = [
    avatar && old.image_url?.startsWith(`/api/media/profiles/${me}/`) ? old.image_url.slice("/api/media/".length) : null,
    coverKey !== old.cover_key && old.cover_key && inFolder(old.cover_key, "profiles", me) ? old.cover_key : null,
  ].filter((k): k is string => !!k);
  if (stale.length) await env.MEDIA.delete(stale);

  broadcast({ t: "profile", id: me, name, handle, headline, bio: bio && bio.slice(0, 120), imageUrl });
  return { handle };
}
