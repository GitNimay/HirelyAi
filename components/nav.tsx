"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import * as actions from "@/app/dashboard/actions";
import { HookSidebar } from "./hook-sidebar";
import { Icon, navItems } from "./ui";
import { useRealtime } from "./use-realtime";

// Sub-pages under a section, shown beneath it in the rail while you're in that section
const subNav: Record<string, { label: string; href: string }[]> = {
  jobs: [
    { label: "Find jobs", href: "/dashboard/jobs" },
    { label: "Post a job", href: "/dashboard/jobs/post" },
  ],
};

/** Vertical rail on sm+, bottom tab bar on phones. Labels show from xl. `me` is your profile handle. `unseen` is the server-rendered notification badge, kept live after that. */
export function Nav({ unseen, me }: { unseen: number; me: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState(unseen);

  useRealtime((e) => {
    if (e.t === "notif") setCount(e.unseen);
    else if (e.t === "notif-seen") setCount(0);
  });

  // Events sent while the socket was down are gone, so recount when the tab comes back
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && actions.loadUnseen().then(setCount, () => {});
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border bg-background sm:static sm:flex-col sm:justify-start sm:gap-1 sm:border-0">
      {navItems.map(({ slug, label, icon }) => {
        const href = slug === "me" ? `/in/${me}` : slug ? `/dashboard/${slug}` : "/dashboard";
        const active = pathname === href || (!!slug && pathname.startsWith(`${href}/`)) || (slug === "me" && (pathname === "/settings/profile" || pathname === "/settings/resume"));
        const badge = slug === "notifications" && !active ? count : 0;
        return (
          <Fragment key={slug}>
            <Link
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              title={label}
              className={`flex h-12 flex-1 items-center justify-center gap-3 rounded-md text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:flex-none sm:px-3 xl:justify-start ${
                active ? "font-medium text-foreground sm:bg-surface" : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              <span className="relative">
                <Icon d={icon} />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 h-4 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-background">
                    {badge > 99 ? "99+" : badge}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </span>
              <span className="hidden xl:inline">{label}</span>
            </Link>
            {active && subNav[slug] && <HookSidebar items={subNav[slug]} aria-label={label} color="var(--link)" className="ml-[21px] hidden xl:flex" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
