import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CompanyHeader } from "@/components/company";
import { companyFor, slugOf } from "../data";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { userId } = await auth();
  const c = userId ? await companyFor(userId, await slugOf(params)) : null;
  return { title: c ? `${c.name} | Hire Excellence` : "Hire Excellence" };
}

export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { userId } = await auth.protect();
  const ref = await slugOf(params);
  const company = await companyFor(userId, ref);
  if (!company) notFound();
  if (ref !== company.slug) redirect(`/company/${company.slug}`); // id links

  return (
    <>
      <CompanyHeader company={company} />
      {children}
    </>
  );
}
