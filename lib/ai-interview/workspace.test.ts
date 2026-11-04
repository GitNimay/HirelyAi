import { describe, expect, it } from "vitest";
import { mobileBrowser, mobileRequest } from "./workspace";

const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0";

describe("mobileRequest", () => {
  it("blocks phones and tablets by client hint or user agent", () => {
    expect(mobileRequest(WIN, "?1")).toBe(true);
    expect(mobileRequest("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148", null)).toBe(true);
    expect(mobileRequest("Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130.0 Safari/537.36", null)).toBe(true);
  });
  it("lets laptops and desktops through", () => {
    expect(mobileRequest(WIN, "?0")).toBe(false);
    expect(mobileRequest(MAC, null)).toBe(false);
    expect(mobileRequest(null, null)).toBe(false);
  });
});

describe("mobileBrowser", () => {
  it("trusts the client hint", () => {
    expect(mobileBrowser({ userAgent: WIN, maxTouchPoints: 0, userAgentData: { mobile: true } })).toBe(true);
    expect(mobileBrowser({ userAgent: WIN, maxTouchPoints: 0, userAgentData: { mobile: false } })).toBe(false);
  });
  it("catches an iPad posing as a Mac, but not a desktop Mac", () => {
    expect(mobileBrowser({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
    expect(mobileBrowser({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
  });
  it("falls back to the user agent", () => {
    expect(mobileBrowser({ userAgent: "Mozilla/5.0 (iPhone) Mobile/15E148", maxTouchPoints: 5 })).toBe(true);
    expect(mobileBrowser({ userAgent: WIN, maxTouchPoints: 10 })).toBe(false); // touch-screen Windows laptop
  });
});
