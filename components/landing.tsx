import Link from "next/link";
import { ThemeToggle } from "./account-menu";
import { Logo } from "./auth";
import { HeroVideo } from "./hero-video";
import { HowItWorks } from "./landing-steps";
import { Wordmark } from "./landing-wordmark";
import { CompanyVisual, McqVisual, PipelineVisual, ResumeVisual, ScoreVisual, VoiceVisual } from "./landing-features";
import { Icon, btnLg, btnOutline, btnPrimary } from "./ui";

/* Landing page. Type scale is three sizes (display, text-sm, text-xs) in two weights (normal, medium). */

const chevron = "m9 18 6-6-6-6";
const github =
  "M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3";

const footerCols = (signedIn: boolean): [string, [string, string][]][] => [
  ["Product", [["Features", "#features"], ["How it works", "#how-it-works"], ["FAQ", "#faq"]]],
  ["Account", signedIn ? [["Dashboard", "/dashboard"]] : [["Sign up", "/sign-up"], ["Log in", "/sign-in"]]],
];

const display = "text-[clamp(2rem,5vw,3.25rem)] leading-[1.1] font-normal tracking-tight";
const eyebrow = "inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted";

const features: { tag: string; title: string; body: string; Visual: () => React.ReactNode }[] = [
  { tag: "Voice", Visual: VoiceVisual, title: "AI voice interviews", body: "A five-minute spoken first round, any time before the deadline. No scheduling." },
  { tag: "Screening", Visual: McqVisual, title: "MCQ tests", body: "Prefer writing to talking? Run a timed multiple-choice screen instead." },
  { tag: "Grading", Visual: ScoreVisual, title: "Scored against the job", body: "Every candidate gets a score, a fit verdict, strengths and concerns." },
  { tag: "Profile", Visual: ResumeVisual, title: "Resume to profile", body: "Upload a resume and the profile fills itself. Export an ATS-clean PDF." },
  { tag: "Pipeline", Visual: PipelineVisual, title: "One hiring pipeline", body: "Submitted, viewed, shortlisted, rejected. The interview rides along." },
  { tag: "Trust", Visual: CompanyVisual, title: "Verified company pages", body: "One page per domain, verified by work email. No look-alikes." },
];

const faqs: [string, string][] = [
  ["Is it free to use?", "Yes. Creating a profile, posting jobs and applying are free."],
  ["How long is the AI interview?", "About five minutes, taken any time before the job's deadline."],
  ["Who sees my interview?", "Only the recruiters of the job you applied to."],
  ["Can I skip the voice interview?", "If the recruiter allows it, take a timed MCQ test instead."],
  ["How are companies verified?", "Each page is tied to one domain and verified by a work email."],
];

export function Landing({ signedIn }: { signedIn: boolean }) {
  const cta = signedIn ? { href: "/dashboard", label: "Dashboard" } : { href: "/sign-up", label: "Get started" };
  const links = signedIn ? [["Features", "#features"], ["How it works", "#how-it-works"], ["FAQ", "#faq"]] : [["Features", "#features"], ["How it works", "#how-it-works"], ["FAQ", "#faq"], ["Log in", "/sign-in"]];
  return (
    <div data-landing className="mx-auto flex w-full max-w-[75rem] flex-1 flex-col border-border sm:border-x">
      <header className="sticky top-0 z-10 flex h-14 items-stretch border-b border-border bg-background/80 backdrop-blur">
        <Link href="/" aria-label="Hire Excellence" className="flex w-14 items-center justify-center border-r border-border">
          <Logo size={24} faint={false} />
        </Link>
        <nav className="flex items-stretch border-r border-border">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="hidden items-center px-4 text-sm text-muted sm:flex transition-colors hover:text-foreground">
              {label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
        <div className="ml-auto flex items-center px-3">
          <Link href={cta.href} className={`${btnPrimary} ${btnLg}`}>
            {cta.label} <Icon d={chevron} size={14} />
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="flex flex-col items-center px-4 pt-20 text-center sm:pt-28">
          <span className={eyebrow}>AI-first hiring network</span>
          <h1 className={`${display} mt-6 max-w-3xl`}>
            Hire on signal,
            <br />
            not on resumes.
          </h1>
          <p className="mt-5 max-w-md text-sm text-muted">
            An AI runs the first interview for every applicant, so recruiters meet the right people and candidates hear back fast.
          </p>
          <div className="mt-8 flex gap-2">
            <Link href={cta.href} className={`${btnPrimary} ${btnLg}`}>
              {cta.label} <Icon d={chevron} size={14} />
            </Link>
            {!signedIn && <Link href="/sign-in" className={`${btnOutline} ${btnLg}`}>Log in</Link>}
          </div>
          <HeroVideo />
        </section>

        <section id="features" className="mt-24 scroll-mt-14 border-t border-border px-4 py-24 sm:px-8">
          <div className="flex flex-col items-center text-center">
            <span className={eyebrow}>Features</span>
            <h2 className={`${display} mt-6 max-w-2xl`}>Every first round, handled.</h2>
            <p className="mt-5 max-w-md text-sm text-muted">From the application to a ranked shortlist, inside one network.</p>
          </div>
          <div className="mt-16 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.tag}>
                <f.Visual />
                <h3 className="mt-5 text-sm font-medium">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <HowItWorks>
          <span className={eyebrow}>How it works</span>
          <h2 className={`${display} mt-6`}>From job post<br />to shortlist.</h2>
        </HowItWorks>

        <section id="faq" className="scroll-mt-14 border-t border-border px-4 py-24 sm:px-8">
          <div className="flex flex-col items-center text-center">
            <span className={eyebrow}>FAQ</span>
            <h2 className={`${display} mt-6`}>Questions, answered.</h2>
          </div>
          <div className="mx-auto mt-16 max-w-2xl border-t border-border">
            {faqs.map(([q, a]) => (
              <details key={q} className="group border-b border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-muted transition-transform group-open:rotate-90"><Icon d={chevron} size={14} /></span>
                </summary>
                <p className="-mt-1 pb-5 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 pt-12 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <Link href="/" className="flex items-center gap-2 self-start">
            <Logo size={24} faint={false} />
            <span className="text-sm font-medium">Hire Excellence</span>
          </Link>
          <div className="flex gap-16">
            {footerCols(signedIn).map(([title, items]) => (
              <ul key={title} className="space-y-3 text-sm">
                <li className="text-xs text-muted">{title}</li>
                {items.map(([label, href]) => (
                  <li key={label}><Link href={href} className="transition-colors hover:text-muted">{label}</Link></li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        <div className="-mx-4 mt-16 flex items-center justify-between border-t border-border px-4 py-6 text-xs text-muted sm:-mx-8 sm:px-8">
          <p>© {new Date().getFullYear()} Hire Excellence</p>
          <a href="https://github.com/GitNimay/hire-excellence" target="_blank" rel="noreferrer" className="flex items-center gap-2 transition-colors hover:text-foreground">
            Connect with us
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-label="GitHub" className="text-foreground">
              <path d={github} />
            </svg>
          </a>
        </div>
        <div aria-hidden className="-mx-4 border-t border-border px-4 py-12 sm:-mx-8 sm:px-8">
          <Wordmark />
        </div>
      </footer>
    </div>
  );
}
