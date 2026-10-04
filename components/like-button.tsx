"use client";

// Adapted from Opensource UI "Like Toggle" (MIT, https://opensourceui.in/components/like-button):
// controlled (the feed owns liked/count) and themed to sit in the post action bar.
import { Heart } from "lucide-react";
import { useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

const PARTICLES = [
  { x: 0, y: -22 },
  { x: 18, y: -14 },
  { x: 22, y: 4 },
  { x: 13, y: 20 },
  { x: -13, y: 20 },
  { x: -22, y: 4 },
  { x: -18, y: -14 },
];

/** Particles fly outward once on mount via a rAF-triggered transition. */
function Burst() {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOut(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center motion-reduce:hidden">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute top-1/2 left-1/2 size-1.5 rounded-full bg-danger transition-all duration-500 ease-out"
          style={{
            opacity: out ? 0 : 1,
            transform: out ? `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px)) scale(0.2)` : "translate(-50%, -50%) scale(1)",
          }}
        />
      ))}
    </span>
  );
}

type Props = { liked: boolean; count: number } & Omit<ComponentPropsWithoutRef<"button">, "type">;

/** Heart pops and scatters particles when toggled on. */
export function LikeButton({ liked, count, onClick, className, ...props }: Props) {
  const [burst, setBurst] = useState(0);
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={count > 0 ? `Like, ${count}` : "Like"}
      onClick={(e) => {
        if (!liked) setBurst((b) => b + 1);
        onClick?.(e);
      }}
      className={cn(className, liked && "text-danger hover:text-danger")}
      {...props}
    >
      <span className="relative flex size-5 items-center justify-center">
        {liked && burst > 0 && <Burst key={burst} />}
        <Heart
          size={16}
          strokeWidth={2}
          aria-hidden
          className={cn(
            "relative z-10 transition-[transform,fill] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            liked ? "scale-110 fill-current" : "scale-100 fill-transparent",
          )}
        />
      </span>
      <span className="hidden sm:inline">Like</span>
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}
