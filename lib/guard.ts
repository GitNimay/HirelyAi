import { auth } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";
import { inFolder, type Folder } from "./media";
import { PROFILE_IMAGE_TYPES } from "./profile-fields";

/** A message safe to show the user. Other errors get redacted by the framework in production. */
export class Fail extends Error {}
export const failed = (e: unknown) => {
  if (e instanceof Fail) return { error: e.message };
  throw e;
};

// Every server action re-checks auth: they are public POST endpoints.
export async function viewer() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export async function writer() {
  const userId = await viewer();
  const { success } = await env.WRITE_LIMIT.limit({ key: userId });
  if (!success) throw new Fail("You're doing that too fast. Try again in a minute.");
  return userId;
}

/** Bedrock calls cost money and take seconds, so they get a much tighter per-user cap than other writes. */
export async function aiWriter() {
  const userId = await writer();
  if (!(await env.AI_LIMIT.limit({ key: userId })).success) throw new Fail("Too many AI requests. Try again in a minute.");
  return userId;
}

export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim() : "").slice(0, max);

/** A JPEG/PNG/WebP this member just uploaded to `folder` (avatars, covers, company logos). */
export async function ownImage(me: string, key: unknown, folder: Folder) {
  const k = typeof key === "string" ? key : "";
  const obj = inFolder(k, folder, me) ? await env.MEDIA.head(k) : null;
  if (!obj || obj.customMetadata?.owner !== me || !PROFILE_IMAGE_TYPES.includes(obj.httpMetadata?.contentType ?? "")) throw new Fail("Image upload failed. Try again.");
  return k;
}
