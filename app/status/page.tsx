import Link from "next/link";
import { ThemeToggle } from "@/components/account-menu";
import { Logo } from "@/components/auth";
import { history, liveStatus } from "@/lib/status";
import { COMPONENTS, tone, uptime, type Day } from "@/lib/status-fields";
import { Refresh } from "./refresh";

export const metadata = { title: "Status | Hire Excellence", description: "Live status of Hire Excellence" };

const BAR = { up: "bg-success", degraded: "bg-amber-500", down: "bg-danger", none: "bg-foreground/[0.07]" } as const;
const LABEL = { up: "No issues", degraded: "Partial outage", down: "Outage", none: "No data" } as const;
const fmt = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Bars({ days }: { days: Day[] }) {
  return (
    <div className="mt-2.5 flex h-7 gap-px sm:gap-[2px]">
      {days.map((d, i) => (
        // Phones show the last 30 days, wider screens all 90
        <span key={d.day} title={`${fmt(d.day)} · ${LABEL[tone(d)]}`} className={`${BAR[tone(d)]} flex-1 rounded-[2px] ${i < days.length - 30 ? "max-sm:hidden" : ""}`} />
      ))}
    </div>
  );
}

export default async function StatusPage() {
  const live = await liveStatus(); // first: a fresh check lands in today's bar
  const past = await history();
  const down = COMPONENTS.filter(({ id }) => !live.up[id]);
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[640px] items-center px-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} faint={false} />
          <span className="text-sm font-medium tracking-tight">Hire Excellence</span>
        </Link>
        {/* The toggle carries its own px-4: pulled out so the icon lines up with the right edge of the bars */}
        <div className="-mr-4 ml-auto flex h-10">
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[640px] flex-1 px-4 pt-10 pb-24 sm:pt-16">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className={`size-2 rounded-full ${down.length ? "bg-amber-500" : "bg-success"}`} />
          Status
        </div>
        <h1 className="mt-3 font-display text-3xl font-normal text-balance">
          {down.length ? "Some systems are having issues" : "All systems operational"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {down.length ? `${down.map((c) => c.name).join(", ")} ${down.length > 1 ? "are" : "is"} affected. ` : ""}
          <Refresh at={live.at} />
        </p>

        <section className="mt-14">
          <div className="flex items-baseline justify-between text-xs text-muted">
            <h2>Components</h2>
            <span><span className="sm:hidden">Last 30 days</span><span className="max-sm:hidden">Last 90 days</span></span>
          </div>
          <ul className="mt-6 space-y-8">
            {COMPONENTS.map(({ id, name }) => (
              <li key={id}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{name}</span>
                  {!live.up[id] && <span className="text-xs text-danger">Down</span>}
                  <span className="ml-auto text-xs text-muted tabular-nums">{uptime(past[id]) ?? "—"}</span>
                </div>
                <Bars days={past[id]} />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
