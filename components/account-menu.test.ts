// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, themeOptions } from "./account-menu";

const savedTheme = () => document.cookie.split("; ").find((c) => c.startsWith("theme="));

afterEach(() => {
  document.cookie = "theme=; path=/; max-age=0";
  delete document.documentElement.dataset.theme;
});

describe("applyTheme", () => {
  it.each(["light", "dark"] as const)("writes the cookie and sets data-theme for %s", (t) => {
    applyTheme(t);
    expect(savedTheme()).toBe(`theme=${t}`);
    expect(document.documentElement.dataset.theme).toBe(t);
  });

  it("clears data-theme for system, so the page follows the OS", () => {
    document.documentElement.dataset.theme = "dark";
    applyTheme("system");
    expect(savedTheme()).toBe("theme=system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("keeps the choice across reloads", () => {
    applyTheme("dark");
    expect(savedTheme()).toBe("theme=dark"); // cookie survives: path=/, one-year max-age
  });
});

describe("themeOptions", () => {
  // Shared by the account menu and the landing picker: both must offer every theme
  it("covers every theme with an icon", () => {
    expect(themeOptions.map((o) => o.value)).toEqual(["light", "dark", "system"]);
    expect(themeOptions.every((o) => o.icon.startsWith("M"))).toBe(true); // SVG path data
  });
});
