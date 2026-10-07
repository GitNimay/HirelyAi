import { env, waitUntil } from "cloudflare:workers";
import { cookies } from "next/headers";

/** Set by Settings → Account → Usage analytics; the browser SDK reads the same cookie (components/analytics.tsx). */
export const OPT_OUT_COOKIE = "analytics";

/** Raw PostHog capture, fire-and-forget: never blocks or fails the request. */
export function capture(distinctId: string, event: string, properties: Record<string, unknown> = {}) {
  if (!env.POSTHOG_KEY) return;
  waitUntil(
    fetch(`${env.POSTHOG_HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: env.POSTHOG_KEY, event, distinct_id: distinctId, properties: { $lib: "worker", ...properties } }),
    }).then((r) => void (r.ok || console.error("posthog", r.status)), (e) => console.error("posthog", e)),
  );
}

/**
 * A product event for the signed-in member (`userId` is their Clerk id, the same distinct id the browser uses).
 * Ids and counts only: never emails, names, resume text or transcripts. Skipped when they opted out.
 */
export async function track(userId: string, event: string, properties: Record<string, unknown> = {}) {
  // Outside a request (queue, cron) there are no cookies; those callers don't track people
  const off = await cookies().then((c) => c.get(OPT_OUT_COOKIE)?.value === "off", () => false);
  if (!off) capture(userId, event, properties);
}
