import Link from "next/link";
import { Logo } from "@/components/auth";
import { btnLg, btnPrimary } from "@/components/ui";

export const metadata = { title: "Page not found | Hire Excellence" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[360px] flex-col items-center text-center">
        <Logo />
        <h1 className="mt-6 font-display text-2xl font-normal">Page not found</h1>
        <p className="mt-1.5 text-sm text-muted">The link may be broken, or the page may have been removed.</p>
        <Link href="/dashboard" className={`${btnPrimary} ${btnLg} mt-8`}>Go to home</Link>
      </div>
    </main>
  );
}
