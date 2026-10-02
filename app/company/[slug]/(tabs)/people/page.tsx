import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui";
import { listPeople } from "@/lib/companies";
import { profileHref } from "@/lib/profile-fields";
import { companyFor, slugOf } from "../../data";

/** Members who list the company in their experience (and show their experience on their profile). */
export default async function PeopleTab({ params }: { params: Promise<{ slug: string }> }) {
  const { userId } = await auth.protect();
  const c = await companyFor(userId, await slugOf(params));
  if (!c) notFound();
  const people = await listPeople(userId, c.id);

  return (
    <section aria-label="People">
      <p className="border-b border-border px-4 py-3 text-xs text-muted">
        Members who added {c.name} to their experience. Add it on your profile&apos;s About tab to appear here.
      </p>
      {people.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted">No one has linked this company yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {people.map((p) => (
            <li key={p.id}>
              <Link href={profileHref(p)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface">
                <Avatar name={p.name} src={p.imageUrl ?? undefined} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted">{p.current ? p.title : `Former ${p.title}`}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
