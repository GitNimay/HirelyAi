import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ThemeToggle } from "./account-menu";
import { Logo } from "./auth";
import { btnGhost, btnLg, btnPrimary } from "./ui";

/** Frame for pages people open from a shared link without an account: brand bar, the centred column, a join prompt. */
export function PublicShell({ cta, children }: { cta: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Logo size={24} faint={false} />
            <span className="truncate text-sm font-medium tracking-tight">Hire Excellence</span>
          </Link>
          <div className="flex shrink-0 gap-2">
            {/* 40px tap targets on phones; the 32px desktop buttons are unchanged from sm up */}
            <Link href="/sign-in" className={`${btnGhost} min-h-10 sm:min-h-0`}>Log in</Link>
            <Link href="/sign-up" className={`${btnPrimary} min-h-10 sm:min-h-0`}>Join</Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[640px] flex-1 pb-40 sm:border-x sm:border-border">
        {children}
        <section className="border-t border-border px-4 py-8 text-center">
          <p className="text-balance text-sm font-medium">{cta}</p>
          <p className="mt-1 text-pretty text-sm text-muted">Hire Excellence is where people connect, hire and grow.</p>
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

/** Brand, the Changelog / Status pair and the theme toggle: the header of the open info pages. */
export function InfoHeader({ width = "max-w-[720px]" }: { width?: string }) {
  return (
    <header className={`mx-auto flex h-16 w-full ${width} items-center px-4`}>
      <Link href="/" className="mr-auto flex items-center gap-2">
        <Logo size={24} faint={false} />
        <span className="text-sm font-medium tracking-tight">Hire Excellence</span>
      </Link>
      <nav className="flex items-center gap-5 text-sm text-muted">
        <Link href="/changelog" className="transition-colors hover:text-foreground">Changelog</Link>
        <Link href="/status" className="transition-colors hover:text-foreground">Status</Link>
      </nav>
      {/* The toggle carries its own px-4: pulled out so the icon lines up with the content's right edge */}
      <div className="-mr-4 flex h-10">
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Where privacy and legal requests go. */
export const LEGAL_EMAIL = "hello@n1m35h.in";

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");

/**
 * Privacy / Terms: title, date, a lead, then the Clauses. Bold reads in the foreground colour.
 * `toc` adds a sticky contents list beside the text from lg up.
 */
export function LegalPage({ title, updated, lead, other, toc, children }: { title: string; updated: string; lead: ReactNode; other: [string, string]; toc?: boolean; children: ReactElement<{ title: string }>[] }) {
  const width = toc ? "max-w-[1040px]" : "max-w-[720px]";
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <InfoHeader width={width} />
      <div className={`mx-auto w-full ${width} flex-1 gap-16 px-4 pt-10 pb-24 sm:pt-16 ${toc ? "lg:grid lg:grid-cols-[200px_1fr]" : ""}`}>
        {toc && (
          <nav aria-label="Contents" className="hidden lg:block">
            <div className="sticky top-8">
              <p className="text-sm font-medium">Contents</p>
              <ul className="mt-4 space-y-2.5 border-l border-border text-sm">
                {children.map(({ props: { title } }) => (
                  <li key={title}><a href={`#${slug(title)}`} className="-ml-px block border-l border-transparent pl-4 text-muted transition-colors hover:border-foreground hover:text-foreground">{title}</a></li>
                ))}
              </ul>
            </div>
          </nav>
        )}
        <main id="main" className="max-w-[688px]">
          <p className="text-sm text-muted">Last updated {updated}</p>
          <h1 className="mt-3 font-display text-4xl font-normal">{title}</h1>
          <div className="mt-5 text-[15px] leading-7 text-pretty text-muted [&_strong]:font-medium [&_strong]:text-foreground">{lead}</div>
          <div className="mt-12 space-y-10 border-t border-border pt-12">{children}</div>
          <p className="mt-16 border-t border-border pt-6 text-sm text-muted">
            See also our <Link href={other[1]} className="text-foreground hover:underline underline-offset-4">{other[0]}</Link>.
          </p>
        </main>
      </div>
    </div>
  );
}

/** One section of a LegalPage; its title doubles as the anchor the contents list links to. */
export function Clause({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section id={slug(title)} className="scroll-mt-8">
      <h2 className="text-lg font-medium tracking-tight text-balance">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-pretty text-muted [&_a]:text-link [&_a:hover]:underline [&_a]:underline-offset-2 [&_li]:relative [&_li]:pl-4 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-muted/60 [&_li]:before:content-['–'] [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}
