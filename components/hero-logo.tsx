"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* The brand mark, inline so fill-current tracks the theme. It morphs once when it first appears; hovering it — or the link/button/[data-logo-hover] row it
   sits in — plays the morph once (.logo-morph in globals.css); the class drops when the last bar lands, so leaving
   mid-way never snaps it back. `padded` adds the breathing room the old PNG marks had, so swapped-in sizes match. */
export function LogoMark({
  size,
  padded = true,
  className = "",
  label,
}: {
  size?: number;
  padded?: boolean;
  className?: string;
  label?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [playing, setPlaying] = useState(true); // plays once on every page load, then again on hover
  const pathname = usePathname();
  const first = useRef(true);
  // Replay on client-side navigation too (the logo in a shared layout is not remounted)
  useEffect(() => {
    if (first.current) first.current = false;
    else setPlaying(true);
  }, [pathname]);
  useEffect(() => {
    const svg = ref.current;
    const target = svg?.closest("a, button, [data-logo-hover]") ?? svg;
    if (!target) return;
    const play = () => setPlaying(true);
    target.addEventListener("mouseenter", play);
    return () => target.removeEventListener("mouseenter", play);
  }, []);
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={padded ? "-41 -41 410 411" : "0 0 328 329"}
      fill="currentColor"
      fillRule="nonzero"
      className={`logo-morph shrink-0 overflow-visible ${playing ? "is-playing" : ""} ${className}`}
      onAnimationEnd={(e) => e.animationName === "logo-bar-bottom" && setPlaying(false)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path d="M58 0H328V15L270 73H88L51 110H0V59L58 0Z" />
      <path d="M276 92H328V143L270 201H88L51 238H0V187L58 128H240L276 92Z" />
      <path d="M276 220H328V271L270 329H0V315L58 256H240L276 220Z" />
    </svg>
  );
}

/* Hero logo + heading row: hovering anywhere on the row plays the morph */
export function HeroLogo({ children }: { children: ReactNode }) {
  return (
    <div data-logo-hover className="flex items-center gap-[0.32em]">
      <LogoMark padded={false} label="Hirely AI" className="size-[0.8em]" />
      {children}
    </div>
  );
}
