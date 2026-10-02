import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { btnOutline, CompanyLogo, Icon, icons } from "@/components/ui";
import { myCompanies, searchCompanies, type CompanyCard } from "@/lib/companies";

export const metadata = { title: "Companies | Hire Excellence" };

/** Find company pages (a plain GET form, no client code), plus the pages you run or verified you work at. */
export default async function CompaniesPage({ searchParams }: PageProps<"/dashboard/companies">) {
  const { userId } = await auth.protect();
  const q = String((await searchParams).q ?? "").slice(0, 64);
  const [mine, found] = await Promise.all([q ? [] : myCompanies(userId), searchCompanies(q)]);

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
        <h1 className="text-sm font-semibold">Companies</h1>
        <Link href="/dashboard/companies/new" className={btnOutline}><Icon d={icons.plus} size={14} />Create a page</Link>
      </header>
      <form role="search" className="border-b border-border px-4 py-3">
        <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 focus-within:border-ring">
          <Icon d={icons.search} size={16} className="text-muted" />
          <input type="search" name="q" defaultValue={q} placeholder="Search companies" aria-label="Search companies" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
        </label>
      </form>
      {mine.length > 0 && <List title="Your pages" items={mine.map((c) => ({ ...c, note: c.role ? (c.role === "owner" ? "Owner" : "Admin") : "Verified employee" }))} />}
      <List title={q ? `Results for “${q}”` : "Popular pages"} items={found} empty={q ? "No company pages match. Create one?" : "No company pages yet. Create the first one."} />
    </>
  );
}

function List({ title, items, empty }: { title: string; items: (CompanyCard & { note?: string })[]; empty?: string }) {
  return (
    <section aria-label={title}>
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/company/${c.slug}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface">
                <CompanyLogo name={c.name} src={c.logoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {c.tagline && <p className="truncate text-xs">{c.tagline}</p>}
                  <p className="truncate text-xs text-muted">
                    {[c.industry, `${c.followers} ${c.followers === 1 ? "follower" : "followers"}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {c.note && <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-xs text-muted">{c.note}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
