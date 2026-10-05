"use client";

import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import type { OAuthStrategy, SetActiveNavigate } from "@clerk/nextjs/types";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { CodeField } from "./input-otp";
import { useClientValue } from "./kit";
import { Loading, Skeleton, times } from "./skeleton";

type Result = Promise<{ error: unknown }>;

export function errorText(e: unknown) {
  const err = e as { errors?: { longMessage?: string; message?: string }[]; longMessage?: string; message?: string };
  return err.errors?.[0]?.longMessage ?? err.errors?.[0]?.message ?? err.longMessage ?? err.message ?? "Something went wrong";
}

// Full page load, not router.push: Clerk's Next.js integration runs router.refresh() right after setActive, and in
// vinext that refresh supersedes a pending push, leaving a signed-in user on /sign-in. A document navigation can't be
// cancelled that way (and /sign-in itself redirects signed-in users, as a second net).
const navigate: SetActiveNavigate = ({ decorateUrl }) => window.location.assign(decorateUrl("/dashboard"));

/** Small centered window for the provider's login page; null if the browser blocked it (we fall back to a full redirect). */
function openPopup() {
  const w = 500, h = 640;
  const left = window.screenX + (window.outerWidth - w) / 2;
  const top = window.screenY + (window.outerHeight - h) / 2;
  return window.open("about:blank", "clerk-sso", `popup,width=${w},height=${h},left=${left},top=${top}`);
}

/* ---------- Shared UI ---------- */

const btn =
  "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[box-shadow,transform] duration-150 motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
// Texture look, same tx-* utilities as the app's buttons (globals.css)
const btnSecondary = `${btn} relative tx-secondary`;
const btnPrimary = `${btn} tx-primary`;
const input =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted outline-none transition-shadow focus:border-ring focus:ring-1 focus:ring-ring";

// White mark on dark, black mark on light
// `faint` is the quiet watermark look of the auth screens; the app shell shows the mark at full strength
export function Logo({ size = 48, faint = true }: { size?: number; faint?: boolean }) {
  const o = faint ? "opacity-25" : "";
  return (
    <>
      <img src="/logo-dark.png" width={size} height={size} alt="" aria-hidden className={`${o} light:hidden`} />
      <img src="/logo-light.png" width={size} height={size} alt="" aria-hidden className={`hidden ${o} light:block`} />
    </>
  );
}

/** Under the sign-in / sign-up footers: back to the landing page. */
const homeLink = <Link href="/" className="mt-3 block text-xs text-muted hover:text-foreground">Go to home</Link>;

/** The auth card. Until Clerk has loaded in the browser the form is placeholders; with `busy` (a status label) it stays so, above `children`. */
export function Shell({ title, subtitle, children, footer, busy }: { title: string; subtitle: ReactNode; children?: ReactNode; footer?: ReactNode; busy?: string }) {
  const { isLoaded } = useAuth();
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
        </div>
        {isLoaded && !busy ? (
          children
        ) : (
          <Loading label={busy}>
            <div className="space-y-3">{times(3, (i) => <Skeleton key={i} className="h-10" />)}</div>
            <div className="my-6 flex items-center gap-3 text-xs uppercase text-muted">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          </Loading>
        )}
        {busy && children}
        {footer && <p className="mt-8 text-center text-sm text-muted">{footer}</p>}
      </div>
    </main>
  );
}

export const providerIcons: Record<string, ReactNode> = {
  oauth_github: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.2-3.1-.1-.4-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.1 4.7 18 5 18 5c.7 1.6.3 2.8.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  ),
  oauth_google: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4" />
    </svg>
  ),
  oauth_x: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5L9 13 0 1.2h7.6l5.2 6.9zm-1.3 19.4h2L6.5 3.2H4.3z" />
    </svg>
  ),
};

export const providers: { strategy: OAuthStrategy; label: string }[] = [
  { strategy: "oauth_github", label: "GitHub" },
  { strategy: "oauth_google", label: "Google" },
  { strategy: "oauth_x", label: "X" },
];

/** Social buttons + divider + email/OTP form, shared by sign-in and sign-up. */
function AuthBody({
  cta,
  busy,
  sso,
  sendCode,
  verifyCode,
}: {
  cta: string;
  busy: boolean;
  sso: (strategy: OAuthStrategy, popup?: Window) => Result;
  sendCode: (email: string) => Result;
  verifyCode: (code: string) => Promise<void | { error: unknown }>;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const clerk = useClerk();
  // "Last used" hint on the method this browser signed in with before (storage can throw: no hint then)
  const last = useClientValue(() => {
    try {
      return localStorage.getItem("last-auth");
    } catch {
      return null;
    }
  }, null);
  const remember = (method: string) => {
    try {
      localStorage.setItem("last-auth", method);
    } catch {}
  };

  const run = async (key: string, fn: () => Promise<void | { error: unknown }>) => {
    setError("");
    setPending(key);
    // A throw must never leave the button spinning
    const res = await fn().catch((error: unknown) => ({ error }));
    setPending(null);
    if (res?.error) {
      setError(errorText(res.error));
      return false;
    }
    return true;
  };

  const onEmail = async (e: FormEvent) => {
    e.preventDefault();
    remember("email");
    if (await run("email", () => sendCode(email.trim()))) setStep("code");
  };
  const onCode = (e: FormEvent) => {
    e.preventDefault();
    run("code", () => verifyCode(code));
  };
  // The popup is opened synchronously inside the click so browsers don't block it.
  // Clerk's popup-callback posts the session back and closes the popup; instead of trusting the sign-in resource
  // afterwards (reload/status/finalize can each fail and strand the user on this page), we ask Clerk's client,
  // the source of truth, whether a session now exists, and activate it. Runs when the flow ends AND when the popup
  // closes, whichever first; a late success after a "close" still signs the user in.
  const onSso = (strategy: OAuthStrategy) => {
    remember(strategy);
    const popup = openPopup();
    if (!popup) return run(strategy, () => sso(strategy));
    let done = false;
    let queue: Promise<unknown> = Promise.resolve();
    const check = async (ended: boolean, error: unknown) => {
      if (done) return { error: null };
      await clerk.client?.reload().catch(() => {});
      const session = clerk.client?.signedInSessions[0];
      if (session) {
        done = true;
        await clerk.setActive({ session: session.id, navigate });
        return { error: null };
      }
      if (!ended) return { error: null }; // popup closed with no session: cancelled (or still finishing)
      done = true;
      // No session but the provider step finished: account transfer or missing fields, the callback page handles it
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load on purpose, see `navigate`
      if (!error) window.location.assign("/sso-callback");
      return { error };
    };
    // One check at a time, so a close and a finish landing together can't activate the session twice
    const settle = (ended: boolean, error: unknown) =>
      (queue = queue.then(() => check(ended, error)).catch((e: unknown) => ({ error: e }))) as Promise<{ error: unknown }>;
    run(strategy, () => new Promise((resolve) => {
      const timer = setInterval(() => {
        if (!popup.closed) return;
        clearInterval(timer);
        settle(false, null).then(resolve);
      }, 500);
      sso(strategy, popup)
        .then((r) => r.error, (e: unknown) => e)
        .then((error) => (clearInterval(timer), settle(true, error)))
        .then(resolve);
    }));
  };
  const disabled = busy || pending !== null;

  if (step === "code") {
    return (
      <form onSubmit={onCode} className="space-y-3">
        <p className="text-center text-sm text-muted">
          We sent a 6-digit code to <span className="text-foreground">{email}</span>
        </p>
        <CodeField value={code} onChange={setCode} processing={pending === "code"} invalid={!!error} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button aria-busy={pending === "code"} type="submit" className={btnPrimary} disabled={disabled || code.length !== 6}>
          Verify
        </button>
        <div className="flex justify-between text-sm">
          <button type="button" className="text-muted hover:text-foreground" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
            Use a different email
          </button>
          <button aria-busy={pending === "resend"} type="button" className="text-link hover:underline disabled:opacity-60" disabled={disabled} onClick={() => run("resend", () => sendCode(email.trim()))}>
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {providers.map(({ strategy, label }) => (
          <button aria-busy={pending === strategy} key={strategy} type="button" className={btnSecondary} disabled={disabled} onClick={() => onSso(strategy)}>
            <span className="absolute left-4">{providerIcons[strategy]}</span>
            {`Continue with ${label}`}
            {last === strategy && <LastUsed />}
          </button>
        ))}
      </div>

      <div className="my-6 flex items-center gap-3 text-xs uppercase text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onEmail} className="space-y-3">
        <input
          className={input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          aria-label="Email address"
          autoComplete="email"
          autoFocus
          required
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button aria-busy={pending === "email"} type="submit" className={`${btnPrimary} relative`} disabled={disabled}>
          {cta}
          {last === "email" && <LastUsed />}
        </button>
      </form>
    </>
  );
}

const LastUsed = () => <span className="absolute right-3 rounded-full border border-current/20 px-2 py-0.5 text-xs font-normal opacity-70">Last used</span>;

/* ---------- Flows ---------- */

export function SignInForm() {
  const { signIn, fetchStatus } = useSignIn();

  return (
    <Shell
      title="Welcome back"
      subtitle="Log in to your account"
      footer={<>Don&apos;t have an account? <Link href="/sign-up" className="text-link hover:underline">Sign up</Link>{homeLink}</>}
    >
      <AuthBody
        cta="Log in"
        busy={fetchStatus === "fetching"}
        // Absolute callback: Clerk's popup mode wraps it with `new URL`
        sso={(strategy, popup) => signIn.sso({ strategy, popup, redirectUrl: "/dashboard", redirectCallbackUrl: `${location.origin}/sso-callback` })}
        sendCode={(emailAddress) => signIn.emailCode.sendCode({ emailAddress })}
        verifyCode={async (code) => {
          const res = await signIn.emailCode.verifyCode({ code });
          if (res.error) return res;
          if (signIn.status === "complete") return signIn.finalize({ navigate });
          return { error: new Error(`Additional step required (${signIn.status}).`) };
        }}
      />
    </Shell>
  );
}

export function SignUpForm() {
  const { signUp, fetchStatus } = useSignUp();

  return (
    <Shell
      title="Create your account"
      subtitle="Join Hire Excellence to connect and grow"
      footer={<>Already have an account? <Link href="/sign-in" className="text-link hover:underline">Log in</Link>{homeLink}</>}
    >
      <AuthBody
        cta="Sign up"
        busy={fetchStatus === "fetching"}
        sso={(strategy, popup) => signUp.sso({ strategy, popup, redirectUrl: "/dashboard", redirectCallbackUrl: `${location.origin}/sso-callback` })}
        sendCode={async (emailAddress) => {
          const res = await signUp.create({ emailAddress });
          return res.error ? res : signUp.verifications.sendEmailCode();
        }}
        verifyCode={async (code) => {
          const res = await signUp.verifications.verifyEmailCode({ code });
          if (res.error) return res;
          if (signUp.status === "complete") return signUp.finalize({ navigate });
          return { error: new Error(`Missing: ${signUp.missingFields.join(", ") || signUp.status}`) };
        }}
      />
      {/* Clerk bot protection renders its CAPTCHA here */}
      <div id="clerk-captcha" className="mt-3" />
    </Shell>
  );
}
