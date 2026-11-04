import { describe, expect, it } from "vitest";
import { mobileRequest } from "./workspace";

describe("mobileRequest", () => {
  it("blocks phones and tablets by client hint or user agent", () => {
    expect(mobileRequest("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", "?1")).toBe(true);
    expect(mobileRequest("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148", null)).toBe(true);
    expect(mobileRequest("Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130.0 Safari/537.36", null)).toBe(true);
  });
  it("lets laptops and desktops through", () => {
    expect(mobileRequest("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", "?0")).toBe(false);
    expect(mobileRequest("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0", null)).toBe(false);
    expect(mobileRequest(null, null)).toBe(false);
  });
});
