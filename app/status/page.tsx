import { InfoHeader } from "@/components/public-shell";
import { history, liveStatus } from "@/lib/status";
import {
  COMPONENTS,
  DAYS,
  MONITORS,
  avgMs,
  state,
  tone,
  totals,
  uptime,
  type ComponentId,
  type Day,
} from "@/lib/status-fields";
import { Refresh } from "./refresh";

export const metadata = {
  title: "Status | Hire Excellence",
  description: "Live component health, uptime history and recent issues for Hire Excellence",
};

const BAR = { up: "bg-success", degraded: "bg-amber-500", down: "bg-danger", none: "bg-foreground/[0.07]" } as const;
const LABEL = { up: "No issues", degraded: "Partial outage", down: "Outage", none: "No data" } as const;
const TONE = { up: "text-success", degraded: "text-amber-500", down: "text-danger", none: "text-muted" } as const;
const fmt = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Hover text for one bar: the date, that day's check counts, its severity and average response time. */
const dayTitle = (d: Day) => {
  const avg = avgMs(d);
  return [
    fmt(d.day),
    d.total ? (d.failed ? `${d.failed} of ${d.total} checks failed` : `${d.total} checks passed`) : "",
    LABEL[tone(d)],
    avg != null ? `avg ${avg} ms` : "",
  ]
    .filter(Boolean)
    .join(" · ");
};

/** UTC days in the window where any component failed a check, newest first, with what failed. */
const issueDays = (past: Record<ComponentId, Day[]>) =>
  past.web
    .map((_, i) => ({
      i,
      comps: COMPONENTS.filter(({ id }) => past[id][i].failed > 0).map(({ id, name }) => ({
        id,
        name,
        failed: past[id][i].failed,
        total: past[id][i].total,
      })),
    }))
    .filter(({ comps }) => comps.length > 0)
    .reverse();

function Bars({ days }: { days: Day[] }) {
  return (
    <div className="mt-2.5 flex h-7 gap-px sm:gap-[2px]">
      {days.map((d, i) => (
        // Phones show the last 30 days, wider screens all 90
        <span
          key={d.day}
          title={dayTitle(d)}
          className={`${BAR[tone(d)]} flex-1 rounded-[2px] ${i < days.length - 30 ? "max-sm:hidden" : ""}`}
        />
      ))}
    </div>
  );
}

export default async function StatusPage() {
  const live = await liveStatus(); // first: a fresh check lands in today's bar
  const past = await history();
  const down = COMPONENTS.filter(({ id }) => !live.up[id]);
  const issues = issueDays(past);
  const shown = issues.slice(0, 10);
  const pct = uptime(Object.values(past).flat());
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <InfoHeader />

      <main id="main" className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-10 pb-24 sm:pt-16">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className={`size-2 rounded-full ${down.length ? "bg-amber-500" : "bg-success"}`} />
          Status
        </div>
        <h1 className="mt-3 font-display text-3xl font-normal text-balance">
          {down.length ? "Some systems are having issues" : "All systems operational"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {down.length ? `${down.map((c) => c.name).join(", ")} ${down.length > 1 ? "are" : "is"} affected. ` : ""}
          {pct && `${pct} of checks passed over the last ${DAYS} days. `}
          <Refresh at={live.at} />
        </p>

        <section className="mt-14">
          <div className="flex items-baseline justify-between text-xs text-muted">
            <h2>Components</h2>
            <span>
              <span className="sm:hidden">Last 30 days</span>
              <span className="max-sm:hidden">Last 90 days</span>
            </span>
          </div>
          <ul className="mt-6 space-y-8">
            {COMPONENTS.map(({ id, name }) => {
              const today = past[id].at(-1);
              const badge = state(live.up[id], today);
              const msNow = live.ms?.[id];
              const sum = totals(past[id]);
              return (
                <li key={id}>
                  <div className="flex items-center gap-2 text-sm" title={MONITORS[id]}>
                    <span className="font-medium">{name}</span>
                    {badge === "down" && <span className="text-xs text-danger">Down</span>}
                    {badge === "degraded" && <span className="text-xs text-amber-500">Degraded</span>}
                    {badge === "up" && <span className="text-xs text-success">Operational</span>}
                    <span
                      className="ml-auto text-xs text-muted tabular-nums"
                      title={`Last ${DAYS} days: ${
                        sum.failed
                          ? `${sum.failed.toLocaleString("en-US")} of ${sum.total.toLocaleString("en-US")} checks failed`
                          : `${sum.total.toLocaleString("en-US")} checks, none failed`
                      }${msNow != null ? ` · the most recent check took ${msNow} ms` : ""}`}
                    >
                      {uptime(past[id]) ?? "—"}
                      {msNow != null ? ` · ${msNow} ms` : ""}
                    </span>
                  </div>
                  <Bars days={past[id]} />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-14">
          <div className="flex items-baseline justify-between text-xs text-muted">
            <h2>Recent issues</h2>
            <span>Last {DAYS} days</span>
          </div>
          {issues.length ? (
            <ul className="mt-6 space-y-6">
              {shown.map(({ i, comps }) => {
                const day: Day = {
                  day: past.web[i].day,
                  total: comps.reduce((n, c) => n + c.total, 0),
                  failed: comps.reduce((n, c) => n + c.failed, 0),
                  ms: 0,
                  ms_count: 0,
                };
                return (
                  <li key={day.day}>
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="font-medium">{fmt(day.day)}</span>
                      <span className={`ml-auto text-xs ${TONE[tone(day)]}`}>{LABEL[tone(day)]}</span>
                    </div>
                    <ul className="mt-1.5 space-y-1 text-xs text-muted tabular-nums">
                      {comps.map((c) => (
                        <li key={c.id}>
                          {c.name}: {c.failed} of {c.total} checks failed
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
              {issues.length > shown.length && (
                <li className="text-xs text-muted">Plus {issues.length - shown.length} more days in the last {DAYS}.</li>
              )}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-muted">No failed checks in the last {DAYS} days.</p>
          )}
        </section>

        <section className="mt-14">
          <div className="flex items-baseline justify-between text-xs text-muted">
            <h2>How this page works</h2>
            <span>Checked every 15 minutes</span>
          </div>
          <ul className="mt-6 space-y-2.5 text-sm text-muted">
            <li>Checks run on a schedule and whenever this page is opened — at most once a minute, from the nearest data center.</li>
            <li>
              A component whose latest check failed reads Down, one with failed checks earlier today reads Degraded, the rest read
              Operational. Hover a component row for what its check verifies.
            </li>
            <li>
              A day bar is green when every check passed, amber while at most one in ten failed, red beyond that, grey when nothing ran.
              Hover a bar for that day&apos;s counts.
            </li>
            <li>
              Uptime counts every check over the shown window. Response times appear beside each component (its most recent check) and
              inside a bar&apos;s hover (that day&apos;s average of successful checks).
            </li>
            <li>Dates and day boundaries are UTC; the &quot;Updated&quot; time by the heading is your local time.</li>
            <li>Machines can read the same data at /api/status, refreshed at most once a minute.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
