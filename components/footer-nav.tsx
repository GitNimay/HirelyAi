"use client";

import { useRef, type ReactNode } from "react";
import { FluidHoverHighlight, useFluidHover } from "@/lib/fluid-hover";
import { cn } from "@/lib/utils";

/** Landing footer link group with the app's fluid hover: one highlight springs between the links, never blinking. */
export function FooterNav({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  // Direct links only (the theme dropdown has its own highlight); horizontal axis, since the links sit in a row
  const hover = useFluidHover(ref, { selector: ":scope > a", axis: "x", gapClick: false });
  return (
    <nav ref={ref} aria-label={label} className={cn("relative", className)} {...hover.handlers}>
      <FluidHoverHighlight hover={hover} className="rounded-md" />
      {children}
    </nav>
  );
}
