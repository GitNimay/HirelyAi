import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

// A real Svix-style secret and signature, computed the way Clerk signs webhooks
const SECRET = btoa("test-webhook-secret-32-bytes-long!");

async function sign(id: string, ts: string, body: string, secret = SECRET) {
  const raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

async function webhook(payload: unknown, over: { ts?: number; signature?: string; length?: string } = {}) {
  const body = JSON.stringify(payload);
  const ts = String(over.ts ?? Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "svix-id": "msg_1",
    "svix-timestamp": ts,
    "svix-signature": over.signature ?? `v1,bogus ${await sign("msg_1", ts, body)}`,
  };
  if (over.length) headers["Content-Length"] = over.length;
  return POST(new Request("https://hire.test/api/clerk-email", { method: "POST", body, headers }));
}

const otp = (slug = "verification_code") => ({
  type: "email.created",
  data: {
    slug,
    to_email_address: "ada@mail.test",
    delivered_by_clerk: false,
    data: { otp_code: "123456" },
  },
});

const resend = (status = 200) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status }));

beforeEach(() => {
  Object.assign(env, {
    CLERK_WEBHOOK_SECRET: `whsec_${SECRET}`,
    RESEND_API_KEY: "re_test",
    MAIL_FROM: "Hire Excellence <hi@hire.test>",
    APP_URL: "https://hire.test",
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/clerk-email: signature", () => {
  it.each([
    ["no signature", { signature: "" }],
    ["a wrong signature", { signature: "v1,AAAA" }],
    ["a malformed signature", { signature: "v1,%%%" }],
    ["a timestamp older than 5 minutes", { ts: Math.floor(Date.now() / 1000) - 301 }],
    ["an oversized body", { length: "300000" }],
  ])("rejects %s without sending anything", async (_, over) => {
    const fetch = resend();
    expect((await webhook(otp(), over)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a body changed after signing", async () => {
    const fetch = resend();
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = await sign("msg_1", ts, JSON.stringify(otp()));
    const res = await POST(
      new Request("https://hire.test/api/clerk-email", {
        method: "POST",
        body: JSON.stringify({ ...otp(), data: { ...otp().data, to_email_address: "attacker@evil.test" } }),
        headers: { "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": signature },
      }),
    );
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/clerk-email: delivery", () => {
  it("skips events Clerk delivers itself, and other event types", async () => {
    const fetch = resend();
    expect((await webhook({ ...otp(), data: { ...otp().data, delivered_by_clerk: true } })).status).toBe(204);
    expect((await webhook({ type: "user.created", data: {} })).status).toBe(204);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a verification code in our template through Resend", async () => {
    const fetch = resend();
    expect((await webhook(otp())).status).toBe(204);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test");
    const mail = JSON.parse(String(init?.body));
    expect(mail).toMatchObject({
      from: "Hire Excellence <hi@hire.test>",
      to: ["ada@mail.test"],
      subject: "123456 is your Hire Excellence verification code",
    });
    expect(mail.html).toContain("Confirm your email");
    expect(mail.text).toContain("123456");
  });

  it("words a password reset as a reset", async () => {
    const fetch = resend();
    await webhook(otp("reset_password_code"));
    const mail = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(mail.subject).toBe("123456 is your Hire Excellence password reset code");
    expect(mail.html).toContain("Reset your password");
  });

  it("asks Svix to retry when Resend is down or rate-limited, but not for a rejected address", async () => {
    resend(503);
    expect((await webhook(otp())).status).toBe(502);
    resend(429);
    expect((await webhook(otp())).status).toBe(502);
    resend(422);
    expect((await webhook(otp())).status).toBe(204);
  });
});
