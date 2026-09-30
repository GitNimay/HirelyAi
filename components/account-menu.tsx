"use client";

import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { Menu } from "./kit";
import { Avatar, Icon, icons, menuItem } from "./ui";

export const gear = "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z";

type Theme = "light" | "dark" | "system";
const themes: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light mode", icon: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" },
  { value: "dark", label: "Dark mode", icon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9" },
  { value: "system", label: "System", icon: "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 21h8M12 17v4" },
];

// Remembered in a cookie so the server renders <html data-theme> right away, with no flash of the other theme
function applyTheme(t: Theme) {
  document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
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
            ? "flex size-8 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            : "flex w-full items-center justify-center gap-3 rounded-md p-2 text-left transition-colors outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring xl:justify-start"
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
              <Icon d={icons.more} size={16} className="hidden text-muted xl:block" />
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
