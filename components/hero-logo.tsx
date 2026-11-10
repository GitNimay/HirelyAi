"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

/* The brand mark, inline so fill-current tracks the theme. It morphs once on page load and on navigation, and again
   when the mark itself is hovered (.logo-morph in globals.css); the class drops when the last bar lands, so leaving
   mid-way never snaps it back. `still` turns the morph off (auth screens, the landing illustrations). `padded` adds
   the breathing room the old PNG marks had, so swapped-in sizes match. */
export function LogoMark({
  size,
  padded = true,
  still = false,
  className = "",
  label,
}: {
  size?: number;
  padded?: boolean;
  still?: boolean;
  className?: string;
  label?: string;
}) {
  const [playing, setPlaying] = useState(!still);
  // Replay on client-side navigation too (the logo in a shared layout is not remounted)
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    if (!still) setPlaying(true);
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={padded ? "-41 -41 410 411" : "0 0 328 329"}
      fill="currentColor"
      fillRule="nonzero"
      className={`logo-morph shrink-0 overflow-visible ${playing ? "is-playing" : ""} ${className}`}
      onMouseEnter={still ? undefined : () => setPlaying(true)}
      onAnimationEnd={(e) => e.animationName === "logo-bar-bottom" && setPlaying(false)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path d="M58 0H328V15L270 73H88L51 110H0V59L58 0Z" />
      <path d="M276 92H328V143L270 201H88L51 238H0V187L58 128H240L276 92Z" />
      <path d="M276 220H328V271L270 329H0V315L58 256H240L276 220Z" />
    </svg>
  );
}

/* Hero logo + heading row */
export function HeroLogo({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-[0.32em]">
      <LogoMark padded={false} label="Hirely AI" className="size-[0.8em]" />
      {children}
    </div>
  );
}
