import Link from "next/link";
import type { Summary, Viewer } from "@/lib/profile";
import { Avatar, CompanyLogo } from "./ui";

/** LinkedIn's feed identity card, on the right: cover, photo, name, headline, current company, then network counts. */
export function ProfileCard({ me, summary: s }: { me: Viewer; summary: Summary }) {
  const href = `/in/${me.handle}`;
  return (
    <section aria-label="Your profile" className="overflow-hidden rounded-xl border border-border bg-background">
      <Link href={href} className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <div className={`aspect-[4/1] border-b border-border ${s.coverUrl ? "" : "cover-hatch"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated R2 media, served by /api/media */}
          {s.coverUrl && <img src={s.coverUrl} alt="" className="size-full object-cover" />}
        </div>
        <div className="px-4 pb-4">
          <div className="-mt-9 w-fit rounded-full border-4 border-background bg-background">
            <Avatar name={me.name} src={me.imageUrl} size={64} />
          </div>
          <h2 className="mt-2 truncate text-sm font-medium leading-tight hover:underline">{me.name}</h2>
          {s.headline && <p className="mt-1 line-clamp-2 text-sm text-foreground/90">{s.headline}</p>}
          {s.location && <p className="mt-1 truncate text-xs text-muted">{s.location}</p>}
        </div>
      </Link>

      {s.company && <CompanyRow company={s.company} />}

      <ul className="border-t border-border py-2 text-sm">
        {([
          ["Connections", s.connections, "/dashboard/network?tab=connections"],
          ["Followers", s.followers, `${href}/followers`],
        ] as const).map(([label, n, to]) => (
          <li key={label}>
            <Link href={to} className="flex items-center justify-between px-4 py-1.5 outline-none transition-colors hover:bg-surface focus-visible:bg-surface">
              <span className="text-muted">{label}</span>
              <span className="font-medium tabular-nums text-link">{n}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompanyRow({ company: c }: { company: NonNullable<Summary["company"]> }) {
  const body = (
    <>
      <CompanyLogo name={c.name} src={c.logoUrl} size={24} />
      <span className="min-w-0 truncate">{c.name}</span>
    </>
  );
  const cls = "flex items-center gap-3 border-t border-border px-4 py-3 text-sm font-medium";
  return c.slug ? (
    <Link href={`/company/${c.slug}`} className={`${cls} outline-none transition-colors hover:bg-surface focus-visible:bg-surface`}>{body}</Link>
  ) : (
    <p className={cls}>{body}</p>
  );
}
