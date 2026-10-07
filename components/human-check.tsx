"use client";

import Script from "next/script";
import { useRef, useState } from "react";
import { Logo } from "./auth";
import { btnOutline } from "./ui";

type Turnstile = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  reset: (id: string) => void;
};
declare global {
  interface Window { turnstile?: Turnstile }
}

/** sessionStorage get/set; it can throw (private mode, blocked storage) and the check must still work without it. */
function session(k: string, v?: string) {
  try {
    if (v === undefined) return sessionStorage.getItem(k);
    sessionStorage.setItem(k, v);
  } catch {}
  return null;
}

/** The Turnstile widget. Its token goes to /api/human (siteverify runs there), which sets the pass cookie. */
export function HumanCheck({ sitekey, action, next }: { sitekey: string; action: string; next: string }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [error, setError] = useState("");

  // Tokens are single use, so a retry needs a fresh one. It's the visitor's click: an automatic reset would re-solve
  // and resubmit in a loop whenever the server keeps rejecting.
  const retry = () => {
    setError("");
    session("human-at", "0");
    if (id.current) window.turnstile?.reset(id.current);
  };

  async function submit(token: string) {
    setError("");
    // Passed moments ago but got sent back here: the pass cookie isn't sticking, so don't loop re-verifying
    if (Date.now() - Number(session("human-at") ?? 0) < 30_000) return setError("Your browser seems to block cookies for this site. Allow them, then try again.");
    const res = await fetch("/api/human", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    if (!res?.ok) return setError("We couldn't verify you.");
    session("human-at", String(Date.now()));
    window.location.replace(next);
  }

  function render() {
    if (!box.current || id.current || !window.turnstile) return;
    id.current = window.turnstile.render(box.current, {
      sitekey,
      action,
      theme: "auto",
      callback: submit,
      "error-callback": (code: string) => setError(`Verification failed (error ${code}). Check your connection or try another browser.`),
      "expired-callback": () => setError("That took too long."),
    });
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4 py-12">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />
      <div className="flex w-full max-w-[360px] flex-col items-center text-center">
        <Logo />
        <h1 className="mt-6 font-display text-2xl font-normal">Verify you are human</h1>
        <p className="mt-1.5 text-sm text-muted">A quick check before you continue. This keeps bots away from Hire Excellence.</p>
        <div ref={box} className="mt-8 flex min-h-[65px] justify-center" />
        <p role="alert" className="mt-3 min-h-5 text-sm text-danger">{error}</p>
        {error && <button type="button" onClick={retry} className={`${btnOutline} mt-2`}>Try again</button>}
      </div>
    </main>
  );
}
