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

export const DAYS = 90;
export type Day = { day: string; total: number; failed: number };

/** Bar tone for one day. More than ~1 in 10 checks failing is an outage. */
export const tone = (d: Day | undefined) => (!d?.total ? "none" : !d.failed ? "up" : d.failed / d.total <= 0.1 ? "degraded" : "down");

/** Uptime over the days that have checks, rounded down so 99.996% never shows as 100%. */
export function uptime(days: Day[]) {
  const total = days.reduce((n, d) => n + d.total, 0);
  if (!total) return null;
  const pct = Math.floor((1 - days.reduce((n, d) => n + d.failed, 0) / total) * 10000) / 100;
  return `${pct}%`;
}

/** The last `DAYS` UTC dates, oldest first, ending today. */
export const lastDays = (now = Date.now()) => Array.from({ length: DAYS }, (_, i) => new Date(now - (DAYS - 1 - i) * 864e5).toISOString().slice(0, 10));
