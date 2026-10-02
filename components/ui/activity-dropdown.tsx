"use client";

// Activity Dropdown, after @minhxthanh's 21st.dev component: a card whose header expands into a list that
// reveals row by row, with a turning chevron. Adapted to this app: items come in as props, colors are theme
// tokens (so it follows data-theme, not just the OS), Rune icons via <Icon> instead of lucide, the header is a
// real <button aria-expanded>, and the collapsed list is `inert` so its links can't be tabbed into.

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconDef } from "../ui";

export type Activity = {
  id: string;
  icon: IconDef;
  title: ReactNode;
  description?: ReactNode;
  time?: string;
  href?: string;
};

const ease = "duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none";

export function ActivityDropdown({ icon, title, subtitle, items, footer, defaultOpen = false, className }: {
  icon: IconDef;
  title: ReactNode;
  subtitle?: ReactNode;
  items: Activity[];
  /** Under the list, e.g. a "See all" link */
  footer?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const list = useId();

  return (
    <section
      className={cn(
        "overflow-hidden border border-border bg-surface shadow-[0_8px_24px_rgb(0_0_0/0.18)] transition-[border-radius]",
        ease,
        open ? "rounded-3xl" : "rounded-2xl",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={list}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 p-4 text-left outline-none focus-visible:bg-surface-hover"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
          <Icon d={icon} size={20} />
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block text-base font-semibold">{title}</span>
          {subtitle && (
            <span className={cn("block text-sm text-muted transition-all", ease, open ? "mt-0 max-h-0 opacity-0" : "mt-0.5 max-h-6 opacity-100")}>
              {subtitle}
            </span>
          )}
        </span>
        <Icon d="m18 15-6-6-6 6" size={20} className={cn("shrink-0 text-muted transition-transform", ease, open ? "rotate-0" : "rotate-180")} />
      </button>

      {/* 0fr -> 1fr animates the height to whatever the list needs */}
      <div id={list} inert={!open} className={cn("grid transition-all", ease, open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <ul className="space-y-1 px-2 pb-2">
            {items.map((a, i) => {
              const row = (
                <>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
                    <Icon d={a.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.title}</span>
                    {a.description && <span className="block truncate text-sm text-muted">{a.description}</span>}
                  </span>
                  {a.time && <span className="shrink-0 pt-0.5 text-xs text-muted">{a.time}</span>}
                </>
              );
              const rowClass = cn(
                "flex items-start gap-3 rounded-xl p-3 outline-none transition-all hover:bg-surface-hover focus-visible:bg-surface-hover",
                ease,
                open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
              );
              return (
                <li key={a.id} className="contents">
                  {a.href ? (
                    <Link href={a.href} className={rowClass} style={{ transitionDelay: open ? `${i * 75}ms` : "0ms" }}>{row}</Link>
                  ) : (
                    <div className={rowClass} style={{ transitionDelay: open ? `${i * 75}ms` : "0ms" }}>{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {footer && <div className="px-4 pb-4">{footer}</div>}
        </div>
      </div>
    </section>
  );
}
