import Link from "next/link";
import type { ReactNode } from "react";

/* Landing features: a 3×2 grid of coloured tiles, each a line illustration over its title. The tiles keep their
   colour in both themes, so their ink is fixed; only the last, outline-only tile follows the theme. */

const ink = "#1c1c19";

function Art({ children, stroke = ink }: { children: ReactNode; stroke?: string }) {
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-16 sm:size-[84px]">
      {children}
    </svg>
  );
}

const TILES = [
  {
    title: "Voice interviews", label: "Interview", bg: "bg-[#D9A3B4]",
    art: (
      <Art>
        <path d="M8 14h40a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H26l-9 8v-8h-9a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6z" fill="#fff" />
        <path d="M13 29h3M20 24v10M25 21v16M30 25v8M35 22v14M40 27v4M45 29h1" />
        <rect x="52" y="34" width="16" height="26" rx="8" fill="#fff" />
        <path d="M56 42h4M56 47h4M56 52h4" />
        <path d="M46 50a14 14 0 0 0 28 0" />
        <path d="M60 64v8M53 74h14" />
        <path d="M76 38c2 3 2 7 0 10M79 34c4 5 4 13 0 18" strokeWidth="1.3" />
      </Art>
    ),
  },
  {
    title: "Screening tests", label: "Assessment", bg: "bg-[#E06E3E]",
    art: (
      <Art>
        <rect x="10" y="10" width="46" height="62" rx="4" fill="#fff" />
        <path d="M24 10V6h18v4M24 6a9 4 0 0 1 18 0" />
        <circle cx="33" cy="5" r="2" fill="#fff" />
        <rect x="17" y="22" width="8" height="8" rx="1.5" />
        <path d="M18.5 26l2 2 4-5" strokeWidth="1.8" />
        <path d="M30 24h18M30 28h12" />
        <rect x="17" y="37" width="8" height="8" rx="1.5" fill={ink} />
        <path d="M30 39h18M30 43h9" />
        <rect x="17" y="52" width="8" height="8" rx="1.5" />
        <path d="M30 54h16M30 58h10" />
        <circle cx="64" cy="58" r="12" fill="#fff" />
        <path d="M64 50v8l5 4" />
        <path d="M61 44h6M64 44v2" />
      </Art>
    ),
  },
  {
    title: "Graded reports", label: "Evaluation", bg: "bg-[#EEEAE2]",
    art: (
      <Art>
        <path d="M14 8h36l12 12v54H14z" fill="#fff" />
        <path d="M50 8v12h12" />
        <path d="M21 18h20M21 23h14" />
        <path d="M21 58V48M29 58V40M37 58V44M45 58V34M53 58V38" strokeWidth="3" />
        <path d="M19 62h38" />
        <circle cx="64" cy="64" r="13" fill="#fff" />
        <path d="M59 70l5-12 5 12M61 66h6" />
        <path d="M52 76l-3 6 6-2M76 76l3 6-6-2" strokeWidth="1.3" />
      </Art>
    ),
  },
  {
    title: "Skill profiles", label: "Candidates", bg: "bg-[#E6E0D2]",
    art: (
      <Art>
        <rect x="6" y="18" width="62" height="44" rx="5" fill="#fff" />
        <path d="M30 18v-6h14v6" />
        <circle cx="24" cy="36" r="7" />
        <path d="M13 54c1.5-6 6-9 11-9s9.5 3 11 9" />
        <path d="M42 32h18M42 38h12" />
        <rect x="42" y="45" width="10" height="5" rx="2.5" />
        <rect x="55" y="45" width="8" height="5" rx="2.5" />
        <path d="M68 66l4-9 4 9-4 3z" fill="#fff" />
        <path d="M72 50l2 4 4 .6-3 2.9.7 4.2-3.7-2-3.7 2 .7-4.2-3-2.9 4-.6z" fill={ink} />
      </Art>
    ),
  },
  {
    title: "Hiring pipeline", label: "Jobs", bg: "bg-[#D9CDB7]",
    art: (
      <Art>
        <rect x="4" y="14" width="22" height="16" rx="3" fill="#fff" />
        <path d="M9 20h12M9 25h8" />
        <rect x="4" y="34" width="22" height="16" rx="3" fill="#fff" />
        <path d="M9 40h12M9 45h7" />
        <rect x="4" y="54" width="22" height="16" rx="3" fill="#fff" />
        <path d="M9 60h10M9 65h8" />
        <path d="M28 42h6M31 39l3 3-3 3" />
        <rect x="36" y="26" width="22" height="16" rx="3" fill="#fff" />
        <path d="M41 32h12M41 37h8" />
        <rect x="36" y="46" width="22" height="16" rx="3" fill="#fff" />
        <path d="M41 52h11M41 57h7" />
        <path d="M60 44h6M63 41l3 3-3 3" />
        <rect x="66" y="36" width="16" height="16" rx="8" fill={ink} />
        <path d="M70 44l3 3 5-6" stroke="#fff" strokeWidth="1.8" />
      </Art>
    ),
  },
];

const tile = "flex aspect-[7/8] flex-col p-4 sm:p-6";
const title = "text-base font-medium leading-snug tracking-[-0.03em] sm:text-xl";

export function FeatureGrid({ moreHref }: { moreHref: string }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5">
      {TILES.map((t) => (
        <li key={t.title} className={`${tile} ${t.bg} text-[#1c1c19]`}>
          <div className="flex-1">{t.art}</div>
          <h3 className={title}>{t.title}</h3>
          <p className="mt-1 text-[13px] opacity-70">{t.label}</p>
        </li>
      ))}
      <li className="flex">
        <Link href={moreHref} className={`${tile} w-full border border-muted text-foreground transition-colors hover:bg-surface-hover`}>
          <div className="flex-1">
            <Art stroke="currentColor">
              <path d="M42 8l26 10v20c0 18-12 29-26 36C28 67 16 56 16 38V18z" />
              <path d="M32 40l7 7 13-15" strokeWidth="2" />
              <path d="M8 14l2 4M4 24h4M74 12l-2 4M80 24h-4" strokeWidth="1.3" />
            </Art>
          </div>
          <span className={title}>And a lot more</span>
          <span aria-hidden className="mt-1 text-[15px] text-muted">→</span>
        </Link>
      </li>
    </ul>
  );
}
