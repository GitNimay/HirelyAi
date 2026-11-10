import Link from "next/link";
import { DemoButton } from "./demo-button";
import { HeroLogo } from "./hero-logo";
import { HeroScreens } from "./hero-screens";
import { LEGAL_EMAIL } from "./public-shell";
import { ThemePicker } from "./theme-picker";

/* Landing page: a single hero (Doop canvas P3ODZaq3jh, frames "Landing — Hero (final, desktop light)", mobile and dark variants). Everything follows the app theme
   (see ThemePicker in the footer), the product window in the hero included. */

/* Highlighter marks in the lede. Text stays dark on every theme: the swatches are light in both. */
const mark = "-mx-[.04em] px-[.12em] text-[#1c1c19] [text-shadow:none]";

/* Hand-drawn sticker row under the lede: candidates, voice interviews, resume, posts, agents, evaluation, shortlist.
   Each is a 40×40 doodle on a coloured disc; ink is fixed dark so they read on both themes. */
const ink = "#1c1c19";
const pip = (cx: number, cy: number, r = 1.4) => <circle cx={cx} cy={cy} r={r} fill={ink} stroke="none" />;
const crew = [
  [
    "#93c5fd",
    <>
      {pip(15, 17, 1.6)}
      {pip(25, 17, 1.6)}
      <path d="M13.5 23.5c3.5 4 9.5 4 13 0M11 12c2-2 4-2.5 6-2" />
    </>,
  ],
  [
    "#fde68a",
    <>
      <rect x="16" y="9" width="8" height="13" rx="4" fill="#fff" />
      <path d="M12.5 19a7.5 7.5 0 0 0 15 0M20 26.5V31M16.5 31h7" />
    </>,
  ],
  [
    "#fff",
    <>
      <path d="M13 9.5h10l4.5 4.5v16.5H13z" fill="#f7f7f4" />
      <path d="M23 9.5V14h4.5M16.5 19h7.5M16.5 23h7.5M16.5 27h4.5" />
    </>,
  ],
  [
    "#fdba74",
    <>
      <path
        d="M10.5 13.5c0-1.7 1.3-3 3-3h13c1.7 0 3 1.3 3 3v9c0 1.7-1.3 3-3 3H18l-5 4v-4c-1.4 0-2.5-1.3-2.5-3z"
        fill="#fff"
      />
      {pip(15.5, 18)}
      {pip(20, 18)}
      {pip(24.5, 18)}
    </>,
  ],
  [
    "#ddd6fe",
    <>
      <rect x="11.5" y="15" width="17" height="13" rx="3.5" fill="#fff" />
      <path d="M20 15v-4M17.5 25h5M11.5 21H9M28.5 21H31" />
      <circle cx="20" cy="9.5" r="1.8" fill="#fde047" />
      {pip(16.5, 21, 1.5)}
      {pip(23.5, 21, 1.5)}
    </>,
  ],
  [
    "#a7f3d0",
    <>
      <circle cx="18" cy="18" r="6.5" fill="#fff" />
      <path d="M22.8 22.8 29 29M15.5 16.5c.8-1.3 2-2 3.3-2" />
    </>,
  ],
  [
    "#fbcfe8",
    <>
      <rect x="11" y="11" width="18" height="18" rx="4" fill="#fff" />
      <path d="m15 20.5 3.5 3.5 7-8" />
    </>,
  ],
] as const;

// Schema.org facts for search engines and AI assistants (ChatGPT search, Perplexity, Google). Keep in step with public/llms.txt
const site = "https://hire-excellence.n1m35h.in";
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${site}/#org`,
      name: "Hirely AI",
      url: site,
      logo: `${site}/logo-light.png`,
      sameAs: [
        "https://github.com/GitNimay/hire-excellence",
        "https://x.com/kulkarni_nimesh",
        "https://www.linkedin.com/in/nimesh-kulkarni-526401266/",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${site}/#website`,
      name: "Hirely AI",
      url: site,
      publisher: { "@id": `${site}/#org` },
    },
    {
      "@type": "WebApplication",
      name: "Hirely AI",
      url: site,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "AI-first hiring network. An AI runs a five-minute voice interview for every applicant and gives recruiters a ranked shortlist scored against the job description.",
      featureList: [
        "Structured AI voice interviews",
        "Timed multiple-choice assessments",
        "Evaluation against the job description",
        "Profiles from resumes with ATS PDF export",
        "Unified applicant pipeline",
        "Verified company pages",
        "Professional network feed",
      ],
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${site}/#org` },
    },
  ],
}).replaceAll("<", "\\u003c");

const X_URL = "https://x.com/kulkarni_nimesh";
const LINKEDIN_URL = "https://www.linkedin.com/in/nimesh-kulkarni-526401266/";
const social = [
  {
    label: "X (Twitter)",
    href: X_URL,
    // Brand colours: X is plain black/white (follows the theme), LinkedIn is its blue tile with a white "in"
    color: "text-foreground",
    d: "M18.9 2H22l-7.6 8.7L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8.1-9.3L1.5 2h6.9l4.8 6.3L18.9 2Zm-1.2 18h1.7L7.4 3.9H5.6L17.7 20Z",
  },
  {
    label: "LinkedIn",
    href: LINKEDIN_URL,
    color: "text-[#0A66C2]",
    d: "M20.4 2H3.6C2.7 2 2 2.7 2 3.6v16.8c0 .9.7 1.6 1.6 1.6h16.8c.9 0 1.6-.7 1.6-1.6V3.6c0-.9-.7-1.6-1.6-1.6ZM8 19H5V9.5h3V19ZM6.5 8.2a1.7 1.7 0 1 1 0-3.5 1.7 1.7 0 0 1 0 3.5ZM19 19h-3v-4.6c0-1.1 0-2.5-1.5-2.5S12.7 13 12.7 14.3V19h-3V9.5h2.8v1.3c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.6 2 3.6 4.6V19Z",
  },
];

const link = "relative transition-colors hover:text-foreground";
/* Shared hero-CTA frame: both the Get started link and the Demo button size and move the same way */
const btn =
  "inline-flex h-[clamp(40px,1vw+16px,46px)] select-none items-center rounded-lg px-[1.4em] text-[clamp(14px,0.15vw+12px,15px)] font-medium transition-[background-color,color,box-shadow,transform,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:duration-75 motion-safe:active:scale-[0.97]";
const dot = (
  <span aria-hidden className="select-none">
    ·
  </span>
);

export function Landing({ signedIn }: { signedIn: boolean }) {
  const cta = signedIn ? { href: "/dashboard", label: "Dashboard" } : { href: "/sign-up", label: "Get started" };
  return (
    <div className="flex min-h-dvh flex-1 flex-col justify-between px-[clamp(16px,6vw,120px)] pb-[clamp(20px,2.5vw,40px)] font-sans text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {/* Landing-only background: halftone dot clusters (after opensourceui.in halftone-pop-background, MIT). See .halftone */}
      <div aria-hidden="true" className="halftone pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden">
        <div />
        <div />
      </div>
      <main
        id="main"
        className="flex flex-1 flex-col gap-12 pt-12 pb-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:pt-6"
      >
        {/* Fluid type: phone 30px → 1440px wide 41px → capped at 48px on big screens; the rest scales with it */}
        {/* Fluid type: title 30px on phones → 40px at 1440 → capped at 44px; lede 18px → 21px → 22px */}
        <div className="flex flex-col gap-[clamp(24px,2.2vw,32px)] lg:w-[43%] lg:max-w-[600px] lg:shrink-0">
          <div className="text-halo text-[clamp(30px,1.8vw+14px,44px)] leading-[1.1] font-medium tracking-[-0.035em]">
            <HeroLogo>
              <h1>Hire on signal.</h1>
            </HeroLogo>
          </div>
          <p className="text-halo text-[clamp(18px,0.3vw+16.7px,22px)] leading-[1.65] tracking-[-0.01em] text-muted">
            <b className="font-medium text-foreground">
              The{" "}
              <span className="relative -my-[.2em] mx-[.05em] inline-block rounded-full border-[1.5px] border-foreground bg-background px-[.45em] font-display text-[1.2em] leading-[1.25] font-normal tracking-normal italic">
                AI-native
                {/* Chat-bubble sticker on the pill's top edge */}
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="absolute -top-[.62em] right-[.5em] size-[.9em] rotate-6"
                >
                  <path
                    d="M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5v11a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h-1A1.5 1.5 0 0 1 3 15.5z"
                    fill="#fde047"
                    stroke="#1c1c19"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <circle cx="8" cy="10" r="1.3" fill="#1c1c19" />
                  <circle cx="12" cy="10" r="1.3" fill="#1c1c19" />
                  <circle cx="16" cy="10" r="1.3" fill="#1c1c19" />
                </svg>
              </span>{" "}
              professional network.
            </b>{" "}
            Agents <span className={`${mark} bg-[#fde68a]`}>interview</span> every candidate the moment they apply,
            while candidates <span className={`${mark} bg-[#fdba74]`}>network, post</span> and build a{" "}
            <span className={`${mark} bg-[#93c5fd]`}>portfolio</span> that speaks for them.
          </p>
          {/* 28px on phones → 32px from ~1400px wide */}
          <div aria-hidden className="-my-2 flex">
            {crew.map(([fill, art], i) => (
              <svg
                key={fill}
                viewBox="0 0 40 40"
                fill="none"
                stroke={ink}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`size-[clamp(28px,1vw+18px,32px)] shrink-0 ${i ? "-ml-[5px]" : ""} ${i % 2 ? "rotate-[4deg]" : "-rotate-[5deg]"}`}
              >
                <circle cx="20" cy="20" r="18" fill={fill} strokeWidth={2.2} />
                {art}
              </svg>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Link href={cta.href} className={`tx-accent self-start ${btn}`}>
              {cta.label}
            </Link>
            <DemoButton className={`tx-secondary ${btn}`} />
          </div>
        </div>

        <HeroScreens />
      </main>

      <footer className="text-halo flex flex-wrap items-center justify-between gap-x-5 gap-y-3 text-[clamp(13px,0.2vw+11px,14px)] leading-[20px] text-muted">
        <nav aria-label="Product" className="flex items-center gap-2 px-1.5">
          <Link href="/changelog" className={link}>
            Changelog
          </Link>
          {dot}
          <Link href="/status" className={link}>
            Status
          </Link>
          {dot}
          <ThemePicker />
        </nav>
        <nav aria-label="Contact and legal" className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5">
          <a href={`mailto:${LEGAL_EMAIL}`} className={link}>
            {LEGAL_EMAIL}
          </a>
          {social.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              className={`${s.color} -m-1.5 p-1.5 transition-opacity hover:opacity-80`}
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
                {/* White behind LinkedIn's cut-out "in" */}
                {s.label === "LinkedIn" && <rect x="4" y="4" width="16" height="16" fill="#fff" />}
                <path d={s.d} />
              </svg>
            </a>
          ))}
          {dot}
          <Link href="/privacy" className={link}>
            Privacy
          </Link>
          {dot}
          <Link href="/terms" className={link}>
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}
