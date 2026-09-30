"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { HookSidebar } from "./hook-sidebar";
import { Icon, navItems } from "./ui";

// Sub-pages under a section, shown beneath it in the rail while you're in that section
const subNav: Record<string, { label: string; href: string }[]> = {
  jobs: [
    { label: "Find jobs", href: "/dashboard/jobs" },
    { label: "Post a job", href: "/dashboard/jobs/post" },
  ],
};

/** Vertical rail on sm+, bottom tab bar on phones. Labels show from xl. */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border bg-background sm:static sm:flex-col sm:justify-start sm:gap-1 sm:border-0">
      {navItems.map(({ slug, label, icon }) => {
        const href = slug ? `/dashboard/${slug}` : "/dashboard";
        const active = pathname === href || (!!slug && pathname.startsWith(`${href}/`));
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
              <Icon d={icon} />
              <span className="hidden xl:inline">{label}</span>
            </Link>
            {active && subNav[slug] && <HookSidebar items={subNav[slug]} aria-label={label} color="var(--link)" className="ml-[21px] hidden xl:flex" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
