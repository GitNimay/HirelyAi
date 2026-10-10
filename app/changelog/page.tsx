import Link from "next/link";
import { InfoHeader } from "@/components/public-shell";
import { publishedReleases } from "@/lib/changelog";
import type { ChangeType } from "@/lib/changelog-fields";

export const metadata = {
  title: "Changelog | Hire Excellence",
  description: "New features, improvements and fixes in Hire Excellence.",
  alternates: { canonical: "/changelog" },
};

const TYPES: [ChangeType, string, string][] = [
  ["new", "New", "text-success"],
  ["improved", "Improved", "text-link"],
  ["fixed", "Fixed", "text-amber-600"],
];
const META = Object.fromEntries(TYPES.map(([t, label, color]) => [t, { label, color }])) as Record<ChangeType, { label: string; color: string }>;
const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const anchor = (v: string) => `v${v.replaceAll(".", "-")}`;

export default async function ChangelogPage({ searchParams }: PageProps<"/changelog">) {
  const q = (await searchParams).type;
  const type = TYPES.find(([t]) => t === q)?.[0];
  // A filter keeps only that kind of change, and drops releases left with none
  const releases = (await publishedReleases()).map((r) => ({ ...r, changes: type ? r.changes.filter(([t]) => t === type) : r.changes })).filter((r) => r.changes.length);

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <InfoHeader />
      <main id="main" className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-10 pb-24 sm:pt-16">
        <h1 className="font-display text-3xl font-normal">Changelog</h1>
        <p className="mt-2 text-sm text-muted">New features, improvements and fixes in Hire Excellence.</p>

        <nav aria-label="Filter changes" className="mt-8 flex gap-5 text-sm">
          {([[undefined, "All"], ...TYPES] as const).map(([t, label]) => (
            <Link
              key={label}
              href={t ? `/changelog?type=${t}` : "/changelog"}
              scroll={false}
              aria-current={t === type ? "page" : undefined}
              className="text-muted transition-colors hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>

        <ol className="mt-12">
          {releases.map((r, i) => (
            <li key={r.version}>
              <article id={anchor(r.version)} className="grid scroll-mt-6 gap-x-10 sm:grid-cols-[112px_1fr]">
                <div className="flex gap-3 text-sm text-muted sm:flex-col sm:gap-1 sm:pt-1">
                  <time dateTime={r.releasedAt}>{fmt(r.releasedAt)}</time>
                  <span className="font-mono text-xs leading-5">v{r.version}</span>
                </div>
                {/* Rail and dot are decoration: the date and heading carry the meaning */}
                <div className={`relative pt-2 pb-14 sm:border-l sm:border-border sm:pt-0 sm:pl-8 ${i === releases.length - 1 ? "sm:border-transparent" : ""}`}>
                  <span aria-hidden className={`absolute top-2 -left-[4.5px] hidden size-2 rounded-full ring-4 ring-background sm:block ${i === 0 ? "bg-foreground" : "bg-muted/50"}`} />
                  <h2 className="font-display text-xl font-normal text-balance">
                    <a href={`#${anchor(r.version)}`} className="hover:underline underline-offset-4">{r.title}</a>
                  </h2>
                  <ul className="mt-4 space-y-2.5 text-sm">
                    {r.changes.map(([t, text]) => (
                      <li key={text} className="flex gap-3">
                        <span className={`w-16 shrink-0 text-xs leading-5 font-medium ${META[t].color}`}>{META[t].label}</span>
                        <span className="text-pretty">{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
