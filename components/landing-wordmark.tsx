"use client";

import gsap from "gsap";
import { Tiny5 } from "next/font/google";
import { useEffect, useRef } from "react";

/* Outlined pixel wordmark under the footer. A short blue dash loops around each letter: a blue copy of
   the text on top, dashed as one patch per glyph outline, its offset looped by GSAP. */

const pixel = Tiny5({ subsets: ["latin"], weight: "400" });

const PATCH = 40;
const LOOP = 700; // longer than any glyph outline, so each letter carries a single patch

export function Wordmark() {
  const blue = useRef<SVGTextElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.to(blue.current, { attr: { "stroke-dashoffset": -LOOP }, duration: 8, ease: "none", repeat: -1 });
    return () => { tween.kill(); };
  }, []);
  const text = { x: 0, y: 96, textLength: 1000, lengthAdjust: "spacingAndGlyphs", fontSize: 120, fill: "none", strokeWidth: 1.5 } as const;
  return (
    <svg viewBox="0 0 1000 120" className={`${pixel.className} w-full text-border`}>
      <text {...text} stroke="currentColor">Hire Excellence</text>
      <text ref={blue} {...text} stroke="#3b82f6" strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${PATCH} ${LOOP - PATCH}`}>
        Hire Excellence
      </text>
    </svg>
  );
}
