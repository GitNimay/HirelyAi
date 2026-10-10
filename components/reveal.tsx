"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

/* Scroll-triggered blur-in. Each element watches itself (a tall grid as one target might never hit 30%),
   so siblings stagger through `i`. Reduced motion is handled in CSS (.reveal in globals.css). */

const ease = [0.23, 1, 0.32, 1] as const;
const STAGGER = 0.12;
const hidden = { opacity: 0, filter: "blur(4px)", scale: 0.985, y: 20 };
const shown = { opacity: 1, filter: "blur(0px)", scale: 1, y: 0 };
const viewport = { once: true, amount: 0.3 };

type Tag = "div" | "article" | "span" | "p" | "h1" | "h2";

export function Reveal({ as = "div", i = 0, className, children }: { as?: Tag; i?: number; className?: string; children: ReactNode }) {
  const M = motion[as] as typeof motion.div;
  return (
    <M className={`reveal ${className ?? ""}`} initial={hidden} whileInView={shown} viewport={viewport} transition={{ duration: 0.7, ease, delay: i * STAGGER }}>
      {children}
    </M>
  );
}

const word: Variants = { hidden, shown: { ...shown, transition: { duration: 0.7, ease } } };

/** Headline split into words that blur in one after another. Lines split on "\n". */
export function RevealWords({ as = "h1", text, i = 0, className }: { as?: "h1" | "h2"; text: string; i?: number; className?: string }) {
  const M = motion[as];
  return (
    <M className={className} initial="hidden" whileInView="shown" viewport={viewport}
      variants={{ hidden: {}, shown: { transition: { delayChildren: i * STAGGER, staggerChildren: 0.08 } } }}>
      {text.split("\n").map((line, l) => (
        <span key={l}>
          {l > 0 && <br />}
          {line.split(" ").map((w, k) => (
            <span key={k}>
              {k > 0 && " "}
              <motion.span variants={word} className="reveal inline-block">{w}</motion.span>
            </span>
          ))}
        </span>
      ))}
    </M>
  );
}
