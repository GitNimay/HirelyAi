"use client";

import gsap from "gsap";
import { Tiny5 } from "next/font/google";

/* Outlined pixel wordmark under the footer. Hovering a word sends a short blue dash around each of its
   letters: a blue copy of the text on top, dashed as one patch per glyph outline, its offset looped by GSAP. */

const pixel = Tiny5({ subsets: ["latin"], weight: "400" });

const PATCH = 40;
const LOOP = 700; // longer than any glyph outline, so each letter carries a single patch

function enter(e: React.MouseEvent<SVGTSpanElement>) {
  const el = e.currentTarget;
  gsap.killTweensOf(el);
  gsap.set(el, { opacity: 1, attr: { "stroke-dashoffset": 0 } });
  gsap.to(el, { attr: { "stroke-dashoffset": -LOOP }, duration: 8, ease: "none", repeat: -1 });
}

function leave(e: React.MouseEvent<SVGTSpanElement>) {
  const el = e.currentTarget;
  gsap.killTweensOf(el);
  gsap.to(el, { opacity: 0, duration: 0.3 });
}

export function Wordmark() {
  const text = { x: 0, y: 96, textLength: 1000, lengthAdjust: "spacingAndGlyphs", fontSize: 120, fill: "none", strokeWidth: 1.5 } as const;
  return (
    <svg viewBox="0 0 1000 120" className={`${pixel.className} w-full text-border`}>
      <text {...text} stroke="currentColor">Hire Excellence</text>
      <text {...text} stroke="#3b82f6" strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${PATCH} ${LOOP - PATCH}`}>
        {["Hire ", "Excellence"].map((w) => (
          <tspan key={w} opacity={0} onMouseEnter={enter} onMouseLeave={leave}>{w}</tspan>
        ))}
      </text>
    </svg>
  );
}
