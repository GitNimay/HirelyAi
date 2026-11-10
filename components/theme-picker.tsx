"use client";

import { useState } from "react";
import { applyTheme, themeOptions, type Theme } from "./account-menu";
import { Menu } from "./kit";
import { Icon, icons, menuItem } from "./ui";

/** The saved theme, read off <html data-theme> ("system" = no attribute, it follows the OS). */
const currentTheme = () => (document.documentElement.dataset.theme as Theme | undefined) ?? "system";

/** Light / Dark / System dropdown for the landing footer, remembered in the same theme cookie as the app. */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("system");

  return (
    <Menu
      label="Theme"
      onOpen={() => setTheme(currentTheme())}
      className="flex items-center gap-1.5 outline-none transition-colors hover:text-foreground"
      panelClassName="bottom-full left-0 mb-2 w-36"
      button={
        <>
          {/* Icons swap via CSS, so the trigger is right in every theme with no state and no hydration mismatch */}
          <Icon d={icons.sun} size={14} className="light:hidden" />
          <Icon d={icons.moon} size={14} className="hidden light:block" />
          <span>Theme</span>
          <svg
            viewBox="0 0 24 24"
            width={10}
            height={10}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="opacity-70"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </>
      }
    >
      {themeOptions.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          role="menuitemradio"
          aria-checked={theme === value}
          onClick={() => (applyTheme(value), setTheme(value))}
          className={menuItem}
        >
          <Icon d={icon} size={16} className="text-muted" />
          {label}
          {theme === value && <Icon d={icons.check} size={14} className="ml-auto" />}
        </button>
      ))}
    </Menu>
  );
}
