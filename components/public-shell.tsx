import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./auth";
import { btnGhost, btnLg, btnPrimary } from "./ui";

/** Frame for pages people open from a shared link without an account: brand bar, the centred column, a join prompt. */
export function PublicShell({ cta, children }: { cta: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between px-4">
          <Link href="/sign-in" className="flex items-center gap-2">
            <Logo size={24} faint={false} />
            <span className="text-sm font-semibold tracking-tight">Hire Excellence</span>
          </Link>
          <div className="flex gap-2">
            <Link href="/sign-in" className={btnGhost}>Log in</Link>
            <Link href="/sign-up" className={btnPrimary}>Join</Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[640px] flex-1 pb-24 sm:border-x sm:border-border">
        {children}
        <section className="border-t border-border px-4 py-8 text-center">
          <p className="text-sm font-medium">{cta}</p>
          <p className="mt-1 text-sm text-muted">Hire Excellence is where people connect, hire and grow.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/sign-up" className={`${btnPrimary} ${btnLg}`}>Create an account</Link>
            <Link href="/sign-in" className={`${btnGhost} ${btnLg}`}>Log in</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

/** Uploaded avatars are served to members only; show initials instead of a broken image on public pages. */
export const publicAvatar = (src: string | null) => (src && !src.startsWith("/api/") ? src : undefined);

export const publicDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
