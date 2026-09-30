import { auth } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";

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

export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim() : "").slice(0, max);
