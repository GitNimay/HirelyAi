import { env } from "cloudflare:workers";

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
  const mail = code ? codeEmail(data.slug, code) : { subject: data.subject, html: data.body, text: data.body_plain };
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

function codeEmail(slug: string, code: string) {
  const reset = slug === "reset_password_code";
  const subject = `${code} is your Hire Excellence ${reset ? "password reset" : "verification"} code`;
  const title = reset ? "Reset your password" : "Confirm your email";
  const intro = reset ? "Enter this code to reset your password:" : "Enter this code in the window where you're signing up:";
  const note = "The code expires in 10 minutes. If you didn't request it, you can ignore this email.";
  const url = env.APP_URL;
  // Tables + inline styles: the only layout every mail client renders the same
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #e5e5e5;border-radius:12px">
<tr><td style="padding:28px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><a href="${url}" style="text-decoration:none;color:#171717"><img src="${url}/logo-light.png" width="32" height="32" alt="" style="vertical-align:middle;border:0">
<span style="vertical-align:middle;margin-left:8px;font-size:16px;font-weight:600">Hire Excellence</span></a></td>
<td align="right"><a href="${url}" style="display:inline-block;padding:8px 14px;border:1px solid #d4d4d4;border-radius:6px;font-size:13px;color:#171717;text-decoration:none">Open Hire Excellence</a></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px 32px">
<h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:700;color:#171717">${title}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#525252">${intro}</p>
<div style="margin:0 0 24px;padding:22px;background:#f4f4f5;border-radius:8px;text-align:center;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#171717">${code.replace(/\D/g, "")}</div>
<p style="margin:0;font-size:14px;line-height:1.5;color:#737373">${note}</p>
</td></tr></table>
<p style="max-width:480px;margin:20px auto 0;font-size:12px;line-height:1.5;color:#a3a3a3;text-align:center">You're receiving this because someone used this address on Hire Excellence.</p>
</td></tr></table>`;
  return { subject, html, text: `${title}\n\n${intro}\n\n${code}\n\n${note}` };
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
