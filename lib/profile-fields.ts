/** Profile rules shared by the edit form (UX) and the server (enforcement). Pure, so it also runs under `npm test`. */
export const LIMITS = { name: 50, headline: 120, bio: 500, location: 60, website: 200 };
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Canvas sizes the client crops to: 1:1 avatar and 3:1 cover, the same as X. */
export const AVATAR_PX = { w: 400, h: 400 };
export const COVER_PX = { w: 1500, h: 500 };

/** Where a member lives. Falls back to the user id, which the profile page redirects to the handle. */
export const profileHref = (u: { id: string; handle: string | null }) => `/in/${u.handle ?? u.id}`;

/** "Ada Lovelace" → "ada-lovelace". Accents fold to ASCII; a name with no Latin letters becomes "member". */
export function slugify(name: string) {
  const s = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 25).replace(/-+$/, "");
  return s.length >= 3 ? s : s ? `${s}-member` : "member";
}

export const cleanHandle = (v: string) => v.trim().toLowerCase().replace(/^@/, "");
export const validHandle = (h: string) => h.length >= HANDLE_MIN && h.length <= HANDLE_MAX && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(h);

/** "example.com" → "https://example.com/". null when empty, undefined when it isn't a web address. */
export function normalizeWebsite(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".") ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Display form: no protocol, no trailing slash. */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
