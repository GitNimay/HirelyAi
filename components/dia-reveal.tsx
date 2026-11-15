"use client";

import { useState, type ReactNode } from "react";

/* Dia text reveal (after magicui dia-text-reveal): a colour band sweeps across every text glyph inside on page load,
   then settles on each element's own colour. Pure CSS (.dia in globals.css); this only drops the class when the sweep
   ends so text-halo and normal painting come back. Server-rendered with the class, so there's no flash before hydration. */
export function DiaReveal({
  as: Tag = "div",
  className = "",
  children,
}: {
  as?: "div" | "footer";
  className?: string;
  children: ReactNode;
}) {
  const [on, setOn] = useState(true);
  return (
    <Tag
      className={`${on ? "dia" : ""} ${className}`}
      onAnimationEnd={on ? (e) => e.animationName === "dia-sweep" && setOn(false) : undefined}
    >
      {children}
    </Tag>
  );
}
