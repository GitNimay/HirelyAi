"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import * as actions from "@/app/dashboard/actions";
import { FluidHoverHighlight, useFluidHover } from "@/lib/fluid-hover";
import { HookSidebar } from "./hook-sidebar";
import { Icon, navItems } from "./ui";
import { useRealtime } from "./use-realtime";

// Sub-pages under a section, shown beneath it in the rail while you're in that section
const subNav: Record<string, { label: string; href: string }[]> = {
  jobs: [
    { label: "Find jobs", href: "/dashboard/jobs" },
    { label: "Post a job", href: "/dashboard/jobs/post" },
  ],
  companies: [
    { label: "Browse pages", href: "/dashboard/companies" },
    { label: "Create a page", href: "/dashboard/companies/new" },
  ],
  me: [
    { label: "Edit profile", href: "/settings/profile" },
    { label: "Resume", href: "/settings/resume" },
    { label: "Account", href: "/settings/account" },
  ],
};

/** Vertical rail on sm+, icon-only bottom tab bar on phones. Labels show from xl. `me` is your profile handle. `unseen` is the server-rendered notification badge, kept live after that. */
export function Nav({ unseen, me }: { unseen: number; me: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState(unseen);
  const rail = useRef<HTMLElement>(null);
  const hover = useFluidHover(rail, { selector: "[data-rail]", gapClick: false });

  // Unread count in the tab title, like X and LinkedIn: "(3) Jobs | Hire Excellence"
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
  }, [count, pathname]);

  useRealtime((e) => {
    if (e.t === "notif" || e.t === "notif-del") setCount(e.unseen);
    else if (e.t === "notif-seen") setCount(0);
    // Pushes sent while the socket was down are gone: recount
    else if (e.t === "resync") actions.loadUnseen().then(setCount, () => {});
  });

  return (
    <nav
      ref={rail}
      aria-label="Main"
      {...hover.handlers}
      // the section's sub-nav (its own <nav>) has its own hook rail, so the fluid highlight steps aside there
      onMouseMove={(e) => ((e.target as Element).closest("nav") === e.currentTarget ? hover.handlers.onMouseMove(e) : hover.clear())}
      className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:relative sm:flex-col sm:justify-start sm:gap-1 sm:border-0 sm:pb-0"
    >
      <FluidHoverHighlight hover={hover} className="hidden rounded-md bg-surface light:bg-surface-hover sm:block" />
      {navItems.map(({ slug, label, icon }) => {
        const href = slug === "me" ? `/in/${me}` : slug ? `/dashboard/${slug}` : "/dashboard";
        const active = pathname === href || (!!slug && pathname.startsWith(`${href}/`)) || (slug === "me" && pathname.startsWith("/settings/")) || (slug === "companies" && pathname.startsWith("/company/"));
        const badge = slug === "notifications" && !active ? count : 0;
        return (
          <Fragment key={slug}>
            <Link
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              title={label}
              data-rail
              data-tour={slug || "home"}
              className={`relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:flex-none sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:text-sm xl:justify-start ${
                // light: a soft tinted fill, since white barely shows on the off-white page
                active ? "font-medium text-foreground sm:bg-surface sm:light:bg-surface-hover" : "text-muted hover:text-foreground"
              }`}
            >
              <span className="relative flex shrink-0">
                <Icon d={icon} />
                {badge > 0 && (
                  <span className="absolute -right-2.5 -top-2 h-[18px] min-w-[18px] rounded-full bg-danger px-1 text-center text-xs font-medium leading-[18px] tabular-nums text-background">
                    {badge > 99 ? "99+" : badge}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </span>
              <span className="hidden truncate xl:inline">{label}</span>
            </Link>
            {active && subNav[slug] && <HookSidebar items={subNav[slug]} aria-label={label} color="var(--link)" className="ml-5 hidden xl:flex" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
