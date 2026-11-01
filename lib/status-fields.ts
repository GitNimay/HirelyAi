/** Public names only: the status page never says what runs underneath. */
export const COMPONENTS = [
  { id: "web", name: "Website" },
  { id: "auth", name: "Sign in" },
  { id: "live", name: "Live updates" },
  { id: "media", name: "Photos & uploads" },
  { id: "ai", name: "AI features" },
  { id: "voice", name: "Voice interviews" },
] as const;
export type ComponentId = (typeof COMPONENTS)[number]["id"];

/** What each component's check verifies, in visitor terms (hover on its row on the status page). */
export const MONITORS: Record<ComponentId, string> = {
  web: "The site loads and data reads work.",
  auth: "Signing in and staying signed in work.",
  live: "New posts and updates stream in real time.",
  media: "Photos, videos and documents upload and load.",
  ai: "AI features respond normally.",
  voice: "Voice interview rooms connect and run.",
};

export const DAYS = 90;
/** One UTC day of checks: total run, how many failed, plus response-time bookkeeping (sum + count, added like total/failed). */
export type Day = { day: string; total: number; failed: number; ms: number; ms_count: number };

/** Bar tone for one day. More than ~1 in 10 checks failing is an outage. */
export const tone = (d: Day | undefined) =>
  !d?.total ? "none" : !d.failed ? "up" : d.failed / d.total <= 0.1 ? "degraded" : "down";

/** Uptime over the days that have checks, rounded down so 99.996% never shows as 100%. */
export function uptime(days: Day[]) {
  const total = days.reduce((n, d) => n + d.total, 0);
  if (!total) return null;
  const pct = Math.floor((1 - days.reduce((n, d) => n + d.failed, 0) / total) * 10000) / 100;
  return `${pct}%`;
}

/** Current state of a component: the probe's result first, then any failure recorded today. */
export const state = (up: boolean | undefined, today?: Day) =>
  !up ? "down" : (today?.failed ?? 0) > 0 ? "degraded" : "up";

/** Sums a window of days (or several components' windows) — what uptime, failure counts and averages derive from. */
export function totals(days: Day[]) {
  return days.reduce(
    (t, d) => ({
      total: t.total + d.total,
      failed: t.failed + d.failed,
      ms: t.ms + d.ms,
      ms_count: t.ms_count + d.ms_count,
    }),
    { total: 0, failed: 0, ms: 0, ms_count: 0 },
  );
}

/** Average response time of a day's successful checks, whole ms; undefined when nothing was measured. */
export const avgMs = (d: Day | undefined) => (d && d.ms_count ? Math.round(d.ms / d.ms_count) : undefined);

/** The last `DAYS` UTC dates, oldest first, ending today. */
export const lastDays = (now = Date.now()) =>
  Array.from({ length: DAYS }, (_, i) => new Date(now - (DAYS - 1 - i) * 864e5).toISOString().slice(0, 10));
