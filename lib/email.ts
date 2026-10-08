import { env } from "cloudflare:workers";

/** Shared email shell (designed in Paper): logo, white card with a pair of illustrated avatars, then who it was sent to. */

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Site fonts where the client loads web fonts (Apple Mail, iOS); Gmail and Outlook fall back
export const SANS = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
export const SERIF = "Newsreader,Georgia,'Times New Roman',serif";
export const MONO = "'Geist Mono',ui-monospace,Menlo,Consolas,monospace";
const INK = "#1c1c19";
export const MUTED = "#65655f";

/** Avatar pairs in public/email, exported 2x with the tilt baked in (mail clients drop CSS transforms). Sizes are 1x. */
const ART = {
  verify: [181, 104],
  reset: [183, 101],
  voice: [177, 96],
  mcq: [184, 97],
} as const;

/** A body paragraph; `mb` is the gap below it. */
export const p = (html: string, mb = 28, style = "") =>
  `<p style="margin:0 0 ${mb}px;font-family:${SANS};font-size:16px;line-height:26px;color:${INK};${style}">${html}</p>`;

export function layout(o: { art: keyof typeof ART; heading: string; body: string; to: string; reason: string }) {
  const url = env.APP_URL;
  const [w, h] = ART[o.art];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@500&family=Newsreader:opsz,wght@6..72,400&display=swap" rel="stylesheet">
<style>@media (max-width:520px){.card{padding:36px 24px 32px!important}}</style></head>
<body style="margin:0;background:#f7f7f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f4"><tr><td align="center" style="padding:48px 16px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 0 28px"><a href="${url}" style="text-decoration:none;color:${INK}"><img src="${url}/logo-light.png" width="26" height="26" alt="" style="vertical-align:middle;border:0">
<span style="vertical-align:middle;margin-left:10px;font-family:${SANS};font-size:16px;font-weight:600;letter-spacing:-0.01em">Hire Excellence</span></a></td></tr>
<tr><td class="card" style="background:#fff;border:1px solid #e4e4de;padding:52px 48px 48px">
<img src="${url}/email/${o.art}.png" width="${w}" height="${h}" alt="" style="display:block;border:0;margin:0 0 28px -4px">
<h1 style="margin:0 0 20px;font-family:${SERIF};font-size:34px;line-height:40px;font-weight:400;letter-spacing:-0.015em;color:${INK}">${o.heading}</h1>
${o.body}
${p("— The Hire Excellence team", 0, `color:${MUTED}`)}
</td></tr>
<tr><td style="padding:24px 24px 0;text-align:center;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED}">This email was sent to ${esc(o.to)}.<br><br>${o.reason}</td></tr>
</table></td></tr></table></body></html>`;
}
