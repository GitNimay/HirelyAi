"use server";

import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import { Fail, failed, text } from "@/lib/guard";
import { saveProfile, startInterview, verifyCandidate, warmInterview } from "@/lib/interview";
import { cleanProfile } from "@/lib/interview-fields";

// Candidates aren't signed in: the password gate issues a session cookie scoped to this interview's path.
const COOKIE = "iv";
const session = async () => (await cookies()).get(COOKIE)?.value;

export async function verify(slug: string, input: Record<string, unknown>) {
  try {
    const ip = (await headers()).get("cf-connecting-ip") ?? "local";
    const { success } = await env.WRITE_LIMIT.limit({ key: `iv:${ip}` });
    if (!success) throw new Fail("Too many attempts. Try again in a minute.");
    const id = await verifyCandidate(String(slug), text(input.email, 254), text(input.password, 40));
    (await cookies()).set(COOKIE, id, { httpOnly: true, secure: true, sameSite: "lax", path: `/interview/${slug}`, maxAge: 30 * 86_400 });
    return { ok: true as const };
  } catch (e) {
    return failed(e);
  }
}

export async function onboard(slug: string, input: Record<string, unknown>) {
  try {
    const { profile, missing } = cleanProfile(input ?? {});
    if (missing.length) throw new Fail("Fill in the highlighted fields.");
    await saveProfile(String(slug), await session(), profile);
    return { ok: true as const };
  } catch (e) {
    return failed(e);
  }
}

export async function start(slug: string) {
  return startInterview(String(slug), await session()).catch(failed);
}

/** Best effort: if it fails, Start dispatches the agent the usual (slower) way. */
export async function warm(slug: string) {
  await warmInterview(String(slug), await session()).catch((e) => console.error("interview warm-up", e));
}
