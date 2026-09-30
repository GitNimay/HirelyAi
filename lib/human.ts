import { env } from "cloudflare:workers";

/**
 * "Verify you are human" gate in front of sign-in / sign-up (worker/index.ts). Turnstile proves it once, server-side
 * (siteverify), then a signed httpOnly cookie remembers the pass so the visitor isn't challenged on every auth page.
 * Clerk's own bot protection still runs on sign-up; this keeps scripted traffic away from the auth pages altogether.
 */
export const ACTION = "auth";
const PASS_SECONDS = 12 * 3600;

/** Only paths behind the gate, so `next` can never send someone off-site. */
export const GATED = /^\/(sign-in|sign-up)([/?]|$)/;
export const safeNext = (next: string | null) => (next && GATED.test(next) && !next.includes("\\") ? next : "/sign-in");

/** Canonical siteverify: fail closed on anything but a fresh token for this action from one of our hostnames. */
export async function verifyTurnstile(token: unknown, ip: string | null) {
  const hostnames = new Set(env.TURNSTILE_HOSTNAMES.split(",").map((h) => h.trim()).filter(Boolean));
  if (typeof token !== "string" || !token || token.length > 2048 || !hostnames.size) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    const r = (await res.json()) as { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] };
    if (r.success === true && r.action === ACTION && hostnames.has(r.hostname ?? "")) return true;
    console.warn(JSON.stringify({ msg: "turnstile rejected", codes: r["error-codes"], action: r.action, hostname: r.hostname }));
  } catch (e) {
    console.error("turnstile siteverify failed", e);
  }
  return false;
}

// Cookie value: "<expiry ms>.<HMAC-SHA256(expiry)>", keyed by the Turnstile secret (server-only, rotates with the widget)
const key = () =>
  crypto.subtle.importKey("raw", new TextEncoder().encode(`human-pass:${env.TURNSTILE_SECRET}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

// __Host- (Secure, whole site, no Domain) in production. Plain http is local dev only, where some browsers refuse Secure cookies.
const cookieName = (url: URL) => (url.protocol === "https:" ? "__Host-human" : "human");

export async function passCookie(url: URL) {
  const exp = String(Date.now() + PASS_SECONDS * 1000);
  const sig = hex(await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(exp)));
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${cookieName(url)}=${exp}.${sig}; Max-Age=${PASS_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export async function hasPass(request: Request, url: URL) {
  const raw = request.headers.get("Cookie")?.match(new RegExp(String.raw`(?:^|;\s*)${cookieName(url)}=(\d+)\.([0-9a-f]{64})`));
  if (!raw || Number(raw[1]) < Date.now()) return false;
  const sig = Uint8Array.from(raw[2].match(/../g)!, (h) => parseInt(h, 16));
  // verify() compares in constant time
  return crypto.subtle.verify("HMAC", await key(), sig, new TextEncoder().encode(raw[1]));
}
