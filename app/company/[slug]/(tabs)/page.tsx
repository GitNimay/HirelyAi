import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { companyFor, slugOf } from "../data";

/** Overview and the details LinkedIn shows on a page's About tab. */
export default async function AboutTab({ params }: { params: Promise<{ slug: string }> }) {
  const { userId } = await auth.protect();
  const c = await companyFor(userId, await slugOf(params));
  if (!c) notFound();
  const details: [string, ReactNode][] = [
    ["Website", c.website && <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="text-link hover:underline">{c.website}</a>],
    ["Industry", c.industry],
    ["Company size", c.size && `${c.size} employees`],
    ["Headquarters", c.hq],
    ["Type", c.type],
    ["Founded", c.founded],
    ["Specialties", c.specialties.join(", ")],
  ];

  return (
    <div className="space-y-5 px-4 py-5">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Overview</h2>
        <p className="whitespace-pre-line text-sm text-muted">{c.about || (c.me.role ? "Add an overview so members know what the company does." : "No overview yet.")}</p>
      </section>
      <dl className="space-y-3 border-t border-border pt-5 text-sm">
        {details.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt className="font-medium">{k}</dt>
            <dd className="break-words text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
