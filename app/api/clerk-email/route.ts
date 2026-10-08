import { env } from "cloudflare:workers";
import { layout, MONO, p } from "@/lib/email";

/**
 * Clerk `email.created` webhook: sends Clerk's emails through Resend in our own template instead of Clerk's default.
 * Only emails whose template has "Delivered by Clerk" turned off reach us undelivered; the rest are skipped.
 */
export async function POST(req: Request) {
  // Public endpoint: drop unsigned or oversized requests before buffering the body
  if (!req.headers.get("svix-signature") || Number(req.headers.get("Content-Length") ?? 0) > 256_000) return new Response("Bad request", { status: 400 });
  const body = await req.text();
  if (!(await verified(req.headers, body))) return new Response("Bad signature", { status: 400 });
  const { type, data } = JSON.parse(body);
  if (type !== "email.created" || data.delivered_by_clerk) return new Response(null, { status: 204 });

  const code: string | undefined = data.data?.otp_code;
  const mail = code ? codeEmail(data.slug, code, data.to_email_address) : { subject: data.subject, html: data.body, text: data.body_plain };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [data.to_email_address], ...mail }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return new Response(null, { status: 204 });
  console.error("clerk-email resend", res.status, await res.text().catch(() => ""));
  // 5xx makes Svix retry; a rejected address won't get better
  return new Response(null, { status: res.status === 429 || res.status >= 500 ? 502 : 204 });
}

function codeEmail(slug: string, code: string, to: string) {
  const reset = slug === "reset_password_code";
  const subject = `${code} is your Hire Excellence ${reset ? "password reset" : "verification"} code`;
  const heading = reset ? "Reset your password" : "Confirm your email";
  const intro = reset ? "Enter this code to reset your password." : "Enter this code in the window where you're signing up.";
  const note = "It expires in 10 minutes. If you didn't ask for it, you can safely ignore this email.";
  const digits = code.replace(/\D/g, "");
  const html = layout({
    art: reset ? "reset" : "verify",
    heading,
    body: p(intro) + p(digits, 28, `font-family:${MONO};font-size:40px;line-height:48px;font-weight:500;letter-spacing:0.28em`) + p(note),
    to,
    reason: "You're receiving it because someone used this address on Hire Excellence.",
  });
  return { subject, html, text: `${heading}\n\n${intro}\n\n${digits}\n\n${note}` };
}

/** Svix signature check (what Clerk signs webhooks with), on WebCrypto instead of the svix package. */
async function verified(h: Headers, body: string) {
  const [id, ts, sigs] = ["svix-id", "svix-timestamp", "svix-signature"].map((k) => h.get(k));
  if (!id || !ts || !sigs || !(Math.abs(Date.now() / 1000 - Number(ts)) <= 300)) return false; // NaN fails too
  const secret = Uint8Array.from(atob(env.CLERK_WEBHOOK_SECRET.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return (await Promise.all(
    sigs.split(" ").map((s) => s.split(",")[1]).filter(Boolean).map((s) => {
      try { return crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), new TextEncoder().encode(`${id}.${ts}.${body}`)); }
      catch { return false; }
    }),
  )).some(Boolean);
}
