import Link from "next/link";
import { DemoButton } from "./demo-button";
import { FooterNav } from "./footer-nav";
import { HeroScreens } from "./hero-screens";
import { LEGAL_EMAIL } from "./public-shell";
import { ThemePicker } from "./theme-picker";

/* Landing page: a single hero (Doop canvas P3ODZaq3jh, frame "Landing — Hero"). Page chrome follows the app theme
   (see ThemePicker in the footer); the product window inside the hero stays light, like a screenshot of the light app. */

const points = [
  "Structured interviews for every applicant",
  "Fair, consistent evaluation at any scale",
  "A shortlist you can trust, with the reasoning",
  "Built for candidates and recruiters alike",
];

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
    d: "M18.9 2H22l-7.6 8.7L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8.1-9.3L1.5 2h6.9l4.8 6.3L18.9 2Zm-1.2 18h1.7L7.4 3.9H5.6L17.7 20Z",
  },
  {
    label: "LinkedIn",
    href: LINKEDIN_URL,
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
    <div className="flex min-h-dvh flex-1 flex-col justify-between bg-background px-[clamp(16px,6vw,120px)] pb-[clamp(20px,2.5vw,40px)] font-sans text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <main
        id="main"
        className="flex flex-1 flex-col gap-12 pt-12 pb-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:pt-6"
      >
        {/* Fluid type: phone 30px → 1440px wide 41px → capped at 48px on big screens; the rest scales with it */}
        <div className="flex flex-col gap-[clamp(32px,3vw,48px)] lg:w-[46%] lg:max-w-[640px] lg:shrink-0">
          <div className="flex flex-col gap-[0.5em] text-[clamp(28px,1.8vw+9px,40px)] leading-[1.2] font-[380] tracking-[-0.02em] text-balance">
            <div className="flex items-center gap-[0.32em]">
              {/* Inline so fill-current tracks the theme (as an <img> the SVG can't inherit the page colour) */}
              <svg
                viewBox="0 0 328 329"
                fill="currentColor"
                fillRule="nonzero"
                aria-label="Hirely AI"
                className="size-[0.8em] shrink-0"
                role="img"
              >
                <path d="M58 0H328V15L270 73H88L51 110H0V59L58 0Z" />
                <path d="M276 92H328V143L270 201H88L51 238H0V187L58 128H240L276 92Z" />
                <path d="M276 220H328V271L270 329H0V315L58 256H240L276 220Z" />
              </svg>
              <h1>Hire on signal.</h1>
            </div>
            <p>Meet the right people, faster.</p>
          </div>
          <ul className="flex flex-col gap-[0.75em] text-[clamp(16px,0.35vw+13px,19px)] leading-[1.45] text-muted">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={cta.href} className={`tx-accent self-start ${btn}`}>
              {cta.label}
            </Link>
            <DemoButton className={`tx-secondary ${btn}`} />
          </div>
        </div>

        <HeroScreens />
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 text-[clamp(13px,0.2vw+11px,14px)] leading-[20px] text-muted">
        <FooterNav label="Product" className="flex items-center gap-2 px-1.5">
          <Link href="/changelog" className={link}>
            Changelog
          </Link>
          {dot}
          <Link href="/status" className={link}>
            Status
          </Link>
          {dot}
          <ThemePicker />
        </FooterNav>
        <FooterNav label="Contact and legal" className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5">
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
              className={`${link} -m-1.5 p-1.5`}
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
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
        </FooterNav>
      </footer>
    </div>
  );
}
