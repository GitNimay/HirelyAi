import Link from "next/link";
import { ThemeToggle } from "./account-menu";
import { Logo } from "./auth";
import { HeroDashboard } from "./hero-dashboard";
import { HowItWorks } from "./landing-steps";
import { Wordmark } from "./landing-wordmark";
import { Reveal, RevealWords } from "./reveal";
import { CompanyVisual, McqVisual, PipelineVisual, ResumeVisual, ScoreVisual, VoiceVisual } from "./landing-features";
import { Icon, btnLg, btnOutline, btnPrimary, icons } from "./ui";

/* Landing page. Type scale is three sizes (display, text-sm, text-xs) in two weights (normal, medium). */

const chevron = "m9 18 6-6-6-6";
const github =
  "M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3";

const footerCols = (signedIn: boolean): [string, [string, string][]][] => [
  ["Product", [["Features", "#features"], ["How it works", "#how-it-works"], ["FAQ", "#faq"]]],
  ["Account", signedIn ? [["Dashboard", "/dashboard"]] : [["Sign up", "/sign-up"], ["Log in", "/sign-in"]]],
  ["Resources", [["llms.txt", "/llms.txt"], ["robots.txt", "/robots.txt"], ["Sitemap", "/sitemap.xml"]]],
  ["Legal", [["Privacy", "/privacy"], ["Terms", "/terms"]]],
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

// Schema.org facts for search engines and AI assistants (ChatGPT search, Perplexity, Google). Keep in step with public/llms.txt
const site = "https://hire-excellence.n1m35h.in";
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${site}/#org`, name: "Hire Excellence", url: site, logo: `${site}/logo-light.png`, sameAs: ["https://github.com/GitNimay/hire-excellence"] },
    { "@type": "WebSite", "@id": `${site}/#website`, name: "Hire Excellence", url: site, publisher: { "@id": `${site}/#org` } },
    {
      "@type": "WebApplication",
      name: "Hire Excellence",
      url: site,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "AI-first hiring network. An AI runs a five-minute voice interview for every applicant and gives recruiters a ranked shortlist scored against the job description.",
      featureList: ["Structured AI voice interviews", "Timed multiple-choice assessments", "Evaluation against the job description", "Profiles from resumes with ATS PDF export", "Unified applicant pipeline", "Verified company pages", "Professional network feed"],
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${site}/#org` },
    },
    { "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ],
}).replaceAll("<", "\\u003c");

// "Ask AI" opens each assistant with a question about the site already typed. Marks from simple-icons / lobehub
const askPrompt = encodeURIComponent(`Read ${site}/llms.txt and tell me what Hire Excellence is and how it works.`);
const assistants: [name: string, href: string, color: string, d: string][] = [
  ["Claude", `https://claude.ai/new?q=${askPrompt}`, "#D97757", "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"],
  ["ChatGPT", `https://chatgpt.com/?q=${askPrompt}`, "currentColor", "M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z"],
  ["Grok", `https://grok.com/?q=${askPrompt}`, "currentColor", "M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"],
];

export function Landing({ signedIn }: { signedIn: boolean }) {
  const cta = signedIn ? { href: "/dashboard", label: "Dashboard" } : { href: "/sign-up", label: "Get started" };
  const links = signedIn ? [["Features", "#features"], ["How it works", "#how-it-works"], ["FAQ", "#faq"]] : [["Features", "#features"], ["How it works", "#how-it-works"], ["FAQ", "#faq"], ["Log in", "/sign-in"]];
  return (
    <div data-landing className="mx-auto flex w-full max-w-[75rem] flex-1 flex-col border-border sm:border-x">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
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
          <Reveal as="span" className={eyebrow}>AI-first hiring network</Reveal>
          <RevealWords text={"Hire on signal,\nnot on resumes."} i={1} className={`${display} mt-6 max-w-3xl`} />
          <Reveal as="p" i={2} className="mt-5 max-w-md text-pretty text-sm leading-relaxed text-muted">
            An AI runs the first interview for every applicant, so recruiters meet the right people and candidates hear back fast.
          </Reveal>
          <Reveal i={3} className="mt-8 flex flex-wrap justify-center gap-2">
            <Link href={cta.href} className={`${btnPrimary} ${btnLg}`}>
              {cta.label} <Icon d={chevron} size={14} />
            </Link>
            {!signedIn && <Link href="/sign-in" className={`${btnOutline} ${btnLg}`}>Log in</Link>}
          </Reveal>
          <Reveal i={4} className="w-full"><HeroDashboard /></Reveal>
        </section>

        <section id="features" className="scroll-mt-14 border-t border-border px-4 py-16 sm:px-8 sm:py-24">
          <div className="flex flex-col items-center text-center">
            <Reveal as="span" className={eyebrow}>Features</Reveal>
            <Reveal as="h2" i={1} className={`${display} mt-6 max-w-2xl`}>A consistent first round<br />for every applicant.</Reveal>
            <Reveal as="p" i={2} className="mt-5 max-w-md text-pretty text-sm text-muted">From application to shortlist, the entire screening stage is managed on a single platform.</Reveal>
          </div>
          <div className="mt-12 grid gap-x-6 gap-y-12 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal as="article" key={f.tag} i={i % 3}>
                <f.Visual />
                <h3 className="mt-5 text-sm font-medium">{f.title}</h3>
                <p className="mt-1.5 text-pretty text-sm text-muted">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <HowItWorks>
          <Reveal as="span" className={eyebrow}>How it works</Reveal>
          <Reveal as="h2" i={1} className={`${display} mt-6`}>From job posting<br />to shortlist.</Reveal>
        </HowItWorks>

        <section id="both-sides" className="scroll-mt-14 border-t border-border px-4 py-16 sm:px-8 sm:py-24">
          <div className="flex flex-col items-center text-center">
            <Reveal as="span" className={eyebrow}>Candidates and employers</Reveal>
            <Reveal as="h2" i={1} className={`${display} mt-6 max-w-2xl`}>One process, designed<br />for both parties.</Reveal>
          </div>
          <div className="mx-auto mt-12 grid max-w-4xl gap-x-16 gap-y-12 sm:mt-16 sm:grid-cols-2 sm:gap-y-16">
            {sides(signedIn).map((s, i) => (
              <Reveal as="article" key={s.tag} i={i} className="flex flex-col">
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
              </Reveal>
            ))}
          </div>
        </section>

        <section id="faq" className="scroll-mt-14 border-t border-border px-4 py-16 sm:px-8 sm:py-24">
          <div className="flex flex-col items-center text-center">
            <Reveal as="span" className={eyebrow}>FAQ</Reveal>
            <Reveal as="h2" i={1} className={`${display} mt-6`}>Frequently asked questions.</Reveal>
          </div>
          <Reveal i={2} className="mx-auto mt-12 max-w-2xl border-t border-border sm:mt-16">
            {faqs.map(([q, a]) => (
              <details key={q} className="group border-b border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-muted transition-colors group-hover:text-foreground motion-safe:transition-[color,rotate] group-open:rotate-90"><Icon d={chevron} size={14} /></span>
                </summary>
                <p className="-mt-1 pb-5 text-pretty text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </Reveal>
          <Reveal i={3} as="p" className="mt-8 flex items-center justify-center gap-2 text-sm text-muted">
            Having any doubts? <span className="font-medium text-foreground">Ask AI</span>
            {assistants.map(([name, href, color, d]) => (
              <a key={name} href={href} target="_blank" rel="noreferrer" aria-label={`Ask ${name}`} title={`Ask ${name}`} className="text-foreground transition-opacity hover:opacity-60">
                <svg width={20} height={20} viewBox="0 0 24 24" fill={color} aria-hidden><path d={d} /></svg>
              </a>
            ))}
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border px-4 pt-12 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <Link href="/" className="flex items-center gap-2 self-start">
            <Logo size={24} faint={false} />
            <span className="text-sm font-medium">Hire Excellence</span>
          </Link>
          <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:flex sm:gap-16">
            {footerCols(signedIn).map(([title, items]) => (
              <ul key={title} className="space-y-3 text-sm">
                <li className="text-xs text-muted">{title}</li>
                {items.map(([label, href]) => (
                  <li key={label}>
                    {/* Static files (llms.txt, sitemap.xml) aren't routes, so they get a plain link */}
                    {/\.\w+$/.test(href) ? <a href={href} className="transition-colors hover:text-muted">{label}</a> : <Link href={href} className="transition-colors hover:text-muted">{label}</Link>}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        <div className="-mx-4 mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border px-4 py-6 text-xs text-muted sm:-mx-8 sm:mt-16 sm:px-8">
          <p>© {new Date().getFullYear()} Hire Excellence</p>
          <Link href="/changelog" className="ml-auto transition-colors hover:text-foreground">Changelog</Link>
          <Link href="/status" className="transition-colors hover:text-foreground">Status</Link>
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
