"use client";

import Link from "next/link";
import { Logo } from "@/components/auth";
import { btnGhost, btnLg, btnPrimary } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[360px] flex-col items-center text-center">
        <Logo />
        <h1 className="mt-6 font-display text-2xl font-normal text-balance">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-muted">We couldn&apos;t load this page. Try again, or head back home.</p>
        <div className="mt-8 flex w-full flex-col gap-2">
          <button type="button" onClick={reset} className={`${btnPrimary} ${btnLg} w-full`}>Try again</button>
          <Link href="/dashboard" className={`${btnGhost} ${btnLg} w-full`}>Go to home</Link>
        </div>
      </div>
    </main>
  );
}
