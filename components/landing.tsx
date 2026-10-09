import Link from "next/link";
import { ThemeToggle } from "./account-menu";
import { Logo } from "./auth";
import { HeroDashboard } from "./hero-dashboard";
import { HowItWorks } from "./landing-steps";
import { Wordmark } from "./landing-wordmark";
import { CompanyVisual, McqVisual, PipelineVisual, ResumeVisual, ScoreVisual, VoiceVisual } from "./landing-features";
import { Icon, btnLg, btnOutline, btnPrimary, icons } from "./ui";

/* Landing page. Type scale is three sizes (display, text-sm, text-xs) in two weights (normal, medium). */

const chevron = "m9 18 6-6-6-6";
const github =
  "M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3";

const footerCols = (signedIn: boolean): [string, [string, string][]][] => [
  ["Product", [["Features", "#features"], ["How it works", "#how-it-works"], ["FAQ", "#faq"]]],
  ["Account", signedIn ? [["Dashboard", "/dashboard"]] : [["Sign up", "/sign-up"], ["Log in", "/sign-in"]]],
];

const display = "text-[clamp(2rem,5vw,3.25rem)] leading-[1.1] font-display font-normal tracking-[-0.01em] text-balance";
const eyebrow = "inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted";

const features: { tag: string; title: string; body: string; Visual: () => React.ReactNode }[] = [
  { tag: "Voice", Visual: VoiceVisual, title: "Structured voice interviews", body: "A five-minute spoken first round, conducted by an LLM and completed at the candidate's convenience before the closing date." },
  { tag: "Screening", Visual: McqVisual, title: "Timed assessments", body: "Recruiters may replace the spoken interview with a timed multiple-choice assessment." },
  { tag: "Grading", Visual: ScoreVisual, title: "Evaluation against the role", body: "Each response is assessed against the job description, producing a score, a fit rating, and documented strengths and concerns." },
  { tag: "Profile", Visual: ResumeVisual, title: "Profiles from resumes", body: "An uploaded resume populates the profile automatically, and the profile can be exported as an ATS-compatible PDF." },
  { tag: "Pipeline", Visual: PipelineVisual, title: "Unified applicant pipeline", body: "Track each application from submission to shortlist, with interview results attached at every stage." },
  { tag: "Trust", Visual: CompanyVisual, title: "Verified company pages", body: "Each company page is bound to a single domain and verified through a work email address." },
];

const sides = (signedIn: boolean) => [
  {
    tag: "For candidates", icon: icons.network, title: "Be assessed on your experience.",
    body: "A structured first-round interview for every applicant, evaluated on substance rather than keywords.",
    points: [
      "An authentic professional network",
      "A fair hearing for every application",
      "Interview on your own schedule",
      "A complete profile in one step",
      "Visibility at every stage",
    ],
    cta: signedIn ? { href: "/dashboard/jobs", label: "Browse jobs" } : { href: "/sign-up", label: "Explore positions" },
  },
  {
    tag: "For recruiters", icon: icons.company, title: "Focus on qualified candidates.",
    body: "Replace preliminary phone screens with a ranked shortlist, supported by the rationale behind each score.",
    points: [
      "A first round without scheduling",
      "Evidence-based rankings",
      "A credible employer presence",
      "A single applicant pipeline",
      "Reporting your team can use",
    ],
    cta: signedIn ? { href: "/dashboard/jobs/post", label: "Post a position" } : { href: "/sign-up", label: "Begin hiring" },
  },
];

const faqs: [string, string][] = [
  ["Is there a cost to use the platform?", "No. Creating a profile, posting positions and submitting applications are free of charge."],
  ["How long does the interview take?", "Approximately five minutes. It may be completed at any time before the position's closing date."],
  ["Who can view my interview?", "Only the recruiters responsible for the position you applied to."],
  ["Is the voice interview mandatory?", "Not necessarily. Where the recruiter permits it, you may complete a timed multiple-choice assessment instead."],
  ["How are companies verified?", "Each company page is associated with a single domain and verified through a work email address on that domain."],
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
        <div className="ml-auto flex items-center px-2.5 sm:px-3">
          <Link href={cta.href} className={`${btnPrimary} ${btnLg} max-sm:!h-9 max-sm:px-3 max-sm:text-[13px]`}>
            {cta.label} <Icon d={chevron} size={14} />
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="flex flex-col items-center px-4 pb-16 pt-14 text-center sm:px-8 sm:pb-24 sm:pt-28">
          <span className={eyebrow}>AI-first hiring network</span>
          <h1 className={`${display} mt-6 max-w-3xl`}>
            Hire on signal,
            <br />
            not on resumes.
          </h1>
          <p className="mt-5 max-w-md text-pretty text-sm leading-relaxed text-muted">
            An AI runs the first interview for every applicant, so recruiters meet the right people and candidates hear back fast.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Link href={cta.href} className={`${btnPrimary} ${btnLg}`}>
              {cta.label} <Icon d={chevron} size={14} />
            </Link>
            {!signedIn && <Link href="/sign-in" className={`${btnOutline} ${btnLg}`}>Log in</Link>}
          </div>
          <HeroDashboard />
        </section>

        <section id="features" className="scroll-mt-14 border-t border-border px-4 py-16 sm:px-8 sm:py-24">
          <div className="flex flex-col items-center text-center">
            <span className={eyebrow}>Features</span>
            <h2 className={`${display} mt-6 max-w-2xl`}>A consistent first round<br />for every applicant.</h2>
            <p className="mt-5 max-w-md text-pretty text-sm text-muted">From application to shortlist, the entire screening stage is managed on a single platform.</p>
          </div>
          <div className="mt-12 grid gap-x-6 gap-y-12 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.tag}>
                <f.Visual />
                <h3 className="mt-5 text-sm font-medium">{f.title}</h3>
                <p className="mt-1.5 text-pretty text-sm text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <HowItWorks>
          <span className={eyebrow}>How it works</span>
          <h2 className={`${display} mt-6`}>From job posting<br />to shortlist.</h2>
        </HowItWorks>

        <section id="both-sides" className="scroll-mt-14 border-t border-border px-4 py-16 sm:px-8 sm:py-24">
          <div className="flex flex-col items-center text-center">
            <span className={eyebrow}>Candidates and employers</span>
            <h2 className={`${display} mt-6 max-w-2xl`}>One process, designed<br />for both parties.</h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-4xl gap-x-16 gap-y-12 sm:mt-16 sm:grid-cols-2 sm:gap-y-16">
            {sides(signedIn).map((s, i) => (
              <article key={s.tag} className="flex flex-col">
                <div className="flex items-center gap-2 text-muted">
                  <Icon d={s.icon} size={14} className="shrink-0" />
                  <span className="font-mono text-xs uppercase tracking-wider text-muted">{s.tag}</span>
                </div>
                <h3 className="mt-8 text-sm font-medium">{s.title}</h3>
                <p className="mt-1.5 max-w-sm text-pretty text-sm leading-relaxed text-muted">{s.body}</p>
                <ul className="mt-8 flex-1 space-y-3 text-sm">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-center gap-3 font-medium">
                      <Icon d={icons.check} size={14} className="shrink-0 text-muted" />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link href={s.cta.href} className={`${i ? btnPrimary : btnOutline} ${btnLg} mt-10 self-start`}>
                  {s.cta.label} <Icon d={chevron} size={14} />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="scroll-mt-14 border-t border-border px-4 py-16 sm:px-8 sm:py-24">
          <div className="flex flex-col items-center text-center">
            <span className={eyebrow}>FAQ</span>
            <h2 className={`${display} mt-6`}>Frequently asked questions.</h2>
          </div>
          <div className="mx-auto mt-12 max-w-2xl border-t border-border sm:mt-16">
            {faqs.map(([q, a]) => (
              <details key={q} className="group border-b border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-muted transition-colors group-hover:text-foreground motion-safe:transition-[color,rotate] group-open:rotate-90"><Icon d={chevron} size={14} /></span>
                </summary>
                <p className="-mt-1 pb-5 text-pretty text-sm leading-relaxed text-muted">{a}</p>
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
          <div className="flex flex-wrap gap-x-12 gap-y-8 sm:gap-16">
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
        <div className="-mx-4 mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border px-4 py-6 text-xs text-muted sm:-mx-8 sm:mt-16 sm:px-8">
          <p>© {new Date().getFullYear()} Hire Excellence</p>
          <a href="https://github.com/GitNimay/hire-excellence" target="_blank" rel="noreferrer" className="flex items-center gap-2 transition-colors hover:text-foreground">
            View on GitHub
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-label="GitHub" className="text-foreground">
              <path d={github} />
            </svg>
          </a>
        </div>
        <div aria-hidden className="-mx-4 border-t border-border px-4 py-8 sm:-mx-8 sm:px-8 sm:py-12">
          <Wordmark />
        </div>
      </footer>
    </div>
  );
}
