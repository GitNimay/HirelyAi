import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { PostJobForm } from "@/components/jobs";
import { backBtn, btnPrimary, Icon, icons } from "@/components/ui";
import { myCompanies } from "@/lib/companies";

export const metadata = { title: "Post a job | Hire Excellence" };

/** Only members who verified a work email on a company page can post that company's jobs (LinkedIn's verified job posts). */
export default async function PostJobPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { userId } = await auth.protect();
  const companies = (await myCompanies(userId)).filter((c) => c.verified);
  if (companies.length) return <PostJobForm companies={companies} initialCompany={(await searchParams).company} />;
  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur sm:top-0">
        <Link href="/dashboard/jobs" aria-label="Back to jobs" className={backBtn}><Icon d={icons.back} size={18} /></Link>
        <h1 className="text-sm font-medium">Post a job</h1>
      </header>
      <div className="space-y-4 px-4 py-12 text-center">
        <Icon d={icons.verified} size={32} className="mx-auto text-muted" />
        <h2 className="font-display text-xl font-normal text-balance">Verify where you work first</h2>
        <p className="mx-auto max-w-sm text-sm text-muted">
          Jobs are posted on behalf of a company page. Open your company&apos;s page and choose <b>Verify work email</b>, or create the page if it doesn&apos;t exist yet.
        </p>
        <Link href="/dashboard/companies" className={btnPrimary}>Find your company</Link>
      </div>
    </>
  );
}
