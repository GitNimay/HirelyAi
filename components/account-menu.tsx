"use client";

import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { Menu } from "./kit";
import { Avatar, Icon, icons, menuItem, type IconDef } from "./ui";

export const gear = icons.gear;

type Theme = "light" | "dark" | "system";
const themes: { value: Theme; label: string; icon: IconDef }[] = [
  { value: "light", label: "Light mode", icon: icons.sun },
  { value: "dark", label: "Dark mode", icon: icons.moon },
  { value: "system", label: "System", icon: icons.laptop },
];

// Remembered in a cookie so the server renders <html data-theme> right away, with no flash of the other theme
export function applyTheme(t: Theme) {
  document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

/** One-click light/dark flip for public pages. Icons swap via CSS, so no state and no hydration mismatch. */
export function ThemeToggle() {
  const flip = () => {
    const cur = document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    applyTheme(cur === "light" ? "dark" : "light");
  };
  return (
    <button type="button" onClick={flip} aria-label="Toggle light and dark mode" className="flex items-center px-4 text-muted transition-colors hover:text-foreground">
      <Icon d={icons.sun} size={16} className="light:hidden" />
      <Icon d={icons.moon} size={16} className="hidden light:block" />
    </button>
  );
}

/**
 * Account settings, theme and log out. In the sidebar it's a drop-up under your name; `compact` is a gear
 * button that drops down, for phones (where the sidebar is hidden) in your profile's header.
 */
export function AccountMenu({ name, email, imageUrl, compact }: { name: string; email?: string; imageUrl?: string; compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");
  const pickTheme = (t: Theme) => (applyTheme(t), setTheme(t));

  return (
    <div className={compact ? "" : "mt-auto"}>
      <Menu
        label="Account"
        onOpen={() => setTheme((document.documentElement.dataset.theme as Theme | undefined) ?? "system")}
        className={
          compact
            ? "flex size-8 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-surface light:hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            : "flex w-full items-center justify-center gap-3 rounded-md p-2 text-left transition-colors outline-none hover:bg-surface light:hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring xl:justify-start"
        }
        panelClassName={compact ? "right-0 top-full mt-2 w-60" : "bottom-full left-0 mb-2 w-60"}
        button={
          compact ? (
            <Icon d={gear} size={18} />
          ) : (
            <>
              <Avatar name={name} src={imageUrl} size={32} />
              <span className="hidden min-w-0 flex-1 xl:block">
                <span className="block truncate text-sm font-medium">{name}</span>
                <span className="block truncate text-xs text-muted">{email}</span>
              </span>
              <Icon d="m18 15-6-6-6 6" size={16} className="menu-chevron hidden text-muted xl:block" />
            </>
          )
        }
      >
        <Link href="/settings/account" role="menuitem" className={menuItem}>
          <Icon d={gear} size={16} className="text-muted" />
          Account settings
        </Link>
        <div className="my-1 h-px bg-border" />
        {themes.map(({ value, label, icon }) => (
          <button key={value} type="button" role="menuitemradio" aria-checked={theme === value} onClick={() => pickTheme(value)} className={menuItem}>
            <Icon d={icon} size={16} className="text-muted" />
            {label}
            {theme === value && <Icon d={icons.check} size={14} className="ml-auto" />}
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <SignOutButton>
          <button type="button" role="menuitem" className={menuItem}>
            <Icon d={icons.logout} size={16} className="text-muted" />
            Log out
          </button>
        </SignOutButton>
      </Menu>
    </div>
  );
}
