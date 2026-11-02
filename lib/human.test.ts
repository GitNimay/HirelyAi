import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION, hasPass, needsCheck, passCookie, safeNext, verifyTurnstile } from "./human";

const site = new URL("https://hire.test/sign-in");

beforeEach(() => {
  Object.assign(env, { TURNSTILE_SECRET: "test-secret", TURNSTILE_HOSTNAMES: "hire.test, www.hire.test" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("needsCheck", () => {
  it.each(["/sign-in", "/sign-up/verify", "/post", "/post/abc", "/job/1?x=1"])("gates %s", (path) => {
    expect(needsCheck(path, "Mozilla/5.0")).toBe(true);
  });

  it.each(["/", "/dashboard", "/signin", "/posts", "/jobs"])("lets %s through", (path) => {
    expect(needsCheck(path, null)).toBe(false);
  });

  it("lets link-preview crawlers read share pages, but never the sign-in page", () => {
    expect(needsCheck("/post/abc", "LinkedInBot/1.0")).toBe(false);
    expect(needsCheck("/job/1", "Slackbot-LinkExpanding 1.0")).toBe(false);
    expect(needsCheck("/sign-in", "Twitterbot/1.0")).toBe(true);
  });
});

describe("safeNext", () => {
  it("keeps a gated, same-site path", () => {
    expect(safeNext("/post/abc")).toBe("/post/abc");
    expect(safeNext("/sign-up")).toBe("/sign-up");
  });

  // Open redirect: `next` must never send someone to another site
  it.each([null, "", "https://evil.test/sign-in", "//evil.test/sign-in", "/\\evil.test/post", "/dashboard"])(
    "falls back to /sign-in for %j",
    (next) => {
      expect(safeNext(next)).toBe("/sign-in");
    },
  );
});

describe("pass cookie", () => {
  const request = (cookie: string) => new Request(site, { headers: { Cookie: cookie } });
  const value = (setCookie: string) => setCookie.split(";")[0];

  it("is a host-only, secure, http-only cookie on https", async () => {
    const c = await passCookie(site);
    expect(c).toMatch(/^__Host-human=\d+\.[0-9a-f]{64}; Max-Age=43200; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
  });

  it("drops Secure and the __Host- prefix on plain http (local dev)", async () => {
    const c = await passCookie(new URL("http://localhost:3000/"));
    expect(c).toMatch(/^human=/);
    expect(c).not.toContain("Secure");
  });

  it("is accepted back, among other cookies", async () => {
    const c = value(await passCookie(site));
    expect(await hasPass(request(`theme=dark; ${c}`), site)).toBe(true);
  });

  it("is rejected when tampered with, signed with another secret, or missing", async () => {
    const c = value(await passCookie(site));
    const [name, rest] = c.split("=");
    const [exp, sig] = rest.split(".");
    const flipped = sig.slice(0, -1) + (sig.at(-1) === "0" ? "1" : "0");

    expect(await hasPass(request(`${name}=${exp}.${flipped}`), site)).toBe(false);
    expect(await hasPass(request(`${name}=${Number(exp) + 1}.${sig}`), site)).toBe(false);
    expect(await hasPass(request(""), site)).toBe(false);

    env.TURNSTILE_SECRET = "rotated";
    expect(await hasPass(request(c), site)).toBe(false);
  });

  it("expires after 12 hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const c = value(await passCookie(site));

    vi.setSystemTime(new Date("2026-01-01T11:59:00Z"));
    expect(await hasPass(request(c), site)).toBe(true);
    vi.setSystemTime(new Date("2026-01-01T12:01:00Z"));
    expect(await hasPass(request(c), site)).toBe(false);
  });
});

describe("verifyTurnstile", () => {
  const siteverify = (body: object, status = 200) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status }));

  it("accepts a fresh token for our action and hostname, sending the secret and IP", async () => {
    const fetch = siteverify({ success: true, action: ACTION, hostname: "www.hire.test" });

    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(true);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const sent = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(sent)).toEqual({ secret: "test-secret", response: "tok", remoteip: "203.0.113.7" });
  });

  it.each([
    ["a failed check", { success: false, "error-codes": ["timeout-or-duplicate"] }],
    ["another action", { success: true, action: "login", hostname: "hire.test" }],
    ["a foreign hostname", { success: true, action: ACTION, hostname: "evil.test" }],
  ])("fails closed on %s", async (_, body) => {
    siteverify(body);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await verifyTurnstile("tok", null)).toBe(false);
  });

  it("fails closed when siteverify errors or is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    siteverify({}, 500);
    expect(await verifyTurnstile("tok", null)).toBe(false);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"));
    expect(await verifyTurnstile("tok", null)).toBe(false);
  });

  it.each([
    ["no token", undefined],
    ["a non-string token", 42],
    ["an oversized token", "x".repeat(2049)],
  ])("rejects %s without calling siteverify", async (_, token) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(await verifyTurnstile(token, null)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects everything when no hostname is configured", async () => {
    env.TURNSTILE_HOSTNAMES = " , ";
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(await verifyTurnstile("tok", null)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
