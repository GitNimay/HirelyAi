"use client";

import { useClerk, useReverification, useSession, useUser } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import type { EmailAddressResource, OAuthStrategy, SessionWithActivitiesResource } from "@clerk/nextjs/types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { deleteAccount, refreshMember } from "@/app/settings/actions";
import { validPhone } from "@/lib/resume-fields";
import { analyticsOn, setAnalytics } from "./analytics";
import { errorText, providerIcons, providers } from "./auth";
import { field, Field } from "./jobs";
import { Modal } from "./kit";
import { CodeField } from "./input-otp";
import { Line, Loading, Skeleton, times } from "./skeleton";
import { ago, btnDanger, btnGhost, btnOutline, btnPrimary } from "./ui";

type NeedsReverification = { level?: "first_factor" | "second_factor" | "multi_factor"; complete: () => void; cancel: () => void };
const badge = "rounded-full border border-border px-2 py-0.5 text-xs text-muted";
const lastActive = (d: Date) => {
  const a = ago(d.getTime());
  return a === "now" ? "Active now" : /^\d/.test(a) ? `Active ${a} ago` : `Active ${a}`;
};

/**
 * Account settings, all read from and written to Clerk directly (it owns sign-in identities and sessions).
 * Sections follow what LinkedIn ("Sign in & security") and X ("Your account", "Security and account access") put first.
 */
export function AccountSettings() {
  const { user } = useUser();
  const [verify, setVerify] = useState<NeedsReverification | null>(null);
  // Sensitive Clerk calls may need a fresh sign-in; this retries `fn` once our own code dialog completes
  const run = useReverification((fn: () => Promise<unknown>) => fn(), { onNeedsReverification: setVerify });

  return (
    <div className="pb-16">
      <AccountHeader loading={!user} />
      {user && (
        <>
          <Emails run={run} />
          <Phones />
          <Connected run={run} />
          <Sessions run={run} />
          <UsageAnalytics />
          <DeleteAccount run={run} />
        </>
      )}
      {verify && <Reverify {...verify} onDone={() => setVerify(null)} />}
    </div>
  );
}

/** The page header, plus placeholder sections while `loading` (Clerk loads the user in the browser). */
export function AccountHeader({ loading }: { loading?: boolean }) {
  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center border-b border-border bg-background/80 px-4 backdrop-blur sm:top-0 sm:px-5">
        <h1 className="text-sm font-medium">Account settings</h1>
      </header>
      {loading && (
        <Loading label="Loading account…">
          {times(4, (i) => (
            <section key={i} className="border-b border-border px-4 py-6 sm:px-5">
              <Line className="text-sm" w={["28%", "24%", "34%", "38%"][i]} />
              <Line className="mt-1 text-sm" w={["80%", "70%", "50%", "45%"][i]} />
              <div className="mt-4">{times(i === 1 ? 1 : 2, (j) => <SessionRowSkeleton key={j} />)}</div>
            </section>
          ))}
        </Loading>
      )}
    </>
  );
}

const SessionRowSkeleton = () => (
  <div className="flex min-h-12 items-center gap-3 border-t border-border py-2 first:border-t-0">
    <div className="min-w-0 flex-1"><Line className="text-sm" w="40%" /><Line className="text-xs" w="55%" /></div>
    <Skeleton className="h-8 w-20" />
  </div>
);

type Run = (fn: () => Promise<unknown>) => Promise<unknown>;

/** Busy flag + error message for one section. Refreshes server-rendered parts (sidebar email, job contact prefill) after a change. */
function useTask() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refreshMember().catch(() => {});
      router.refresh();
      return true;
    } catch (e) {
      if (!isReverificationCancelledError(e)) setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, go };
}

function Section({ title, desc, danger, children }: { title: string; desc: string; danger?: boolean; children: ReactNode }) {
  const body = (
    <>
      <h2 className={danger ? "text-sm font-medium text-danger" : "text-sm font-medium"}>{title}</h2>
      <p className="mt-1 text-sm text-muted">{desc}</p>
      <div className="mt-4">{children}</div>
    </>
  );
  // The danger zone gets a red-bordered card, as in Vercel's settings
  return danger ? (
    <section className="px-4 py-6 sm:px-5">
      <div className="rounded-lg border border-danger/40 p-4">{body}</div>
    </section>
  ) : (
    <section className="border-b border-border px-4 py-6 sm:px-5">{body}</section>
  );
}

function Row({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex min-h-12 flex-col items-start gap-2 border-t border-border py-2 first:border-t-0 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-sm sm:flex-1">{children}</div>
      <div className="empty:hidden flex shrink-0 gap-1 [&_button]:min-h-10 sm:[&_button]:min-h-0">{actions}</div>
    </li>
  );
}

const Alert = ({ text }: { text: string }) => (text ? <p role="alert" className="mt-3 text-sm text-danger">{text}</p> : null);

function Emails({ run }: { run: Run }) {
  const { user } = useUser();
  const { busy, error, go } = useTask();
  if (!user) return null;
  return (
    <Section title="Email addresses" desc="You sign in with these. Your primary address gets account and job emails.">
      <ul>
        {user.emailAddresses.map((e) => {
          const primary = e.id === user.primaryEmailAddressId;
          const verified = e.verification?.status === "verified";
          return (
            <Row
              key={e.id}
              actions={!primary && (
                <>
                  {verified && (
                    <button type="button" className={btnGhost} disabled={busy} onClick={() => go(() => run(() => user.update({ primaryEmailAddressId: e.id })))}>
                      Make primary
                    </button>
                  )}
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => go(() => run(() => e.destroy()).then(() => user.reload()))}>
                    Remove
                  </button>
                </>
              )}
            >
              <span className="break-all sm:truncate">{e.emailAddress}</span>
              {primary && <span className={badge}>Primary</span>}
              {!verified && <span className={badge}>Unverified</span>}
            </Row>
          );
        })}
      </ul>
      <Alert text={error} />
      <AddContact
        run={run}
        // Changing your email = verify the new one, which then becomes primary. The old one stays until removed.
        onVerified={(r) => user.update({ primaryEmailAddressId: r.id })}
      />
    </Section>
  );
}

/** Saved straight to Clerk metadata: no OTP, so it's a contact detail, not a sign-in identity. */
function Phones() {
  const { user } = useUser();
  const { busy, error, go } = useTask();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  if (!user) return null;
  const phone = typeof user.unsafeMetadata.phone === "string" ? user.unsafeMetadata.phone : "";
  const save = (next: string) => go(() => user.update({ unsafeMetadata: { ...user.unsafeMetadata, phone: next } }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (!validPhone(next)) return void (await go(() => Promise.reject(new Error("Enter a valid phone number"))));
    if (await save(next)) setEditing(false);
  }

  return (
    <Section title="Phone number" desc="Only you can see it. Used to prefill job applications.">
      {phone && !editing && (
        <ul>
          <Row
            actions={
              <>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => (setValue(phone), setEditing(true))}>Edit</button>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => save("")}>Remove</button>
              </>
            }
          >
            <span>{phone}</span>
          </Row>
        </ul>
      )}
      {editing ? (
        <form onSubmit={submit} className="mt-4 max-w-sm space-y-3">
          <Field label="Phone number" hint="include country code">
            <input type="tel" value={value} onChange={(e) => setValue(e.target.value)} placeholder="+91 98765 43210" autoComplete="tel" autoFocus required className={field} />
          </Field>
          <Alert text={error} />
          <div className="flex gap-2 [&_button]:min-h-10 sm:[&_button]:min-h-0">
            <button aria-busy={busy} type="submit" className={btnPrimary} disabled={busy}>Save</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <Alert text={error} />
          {!phone && <button type="button" className={`${btnOutline} mt-3 min-h-10 sm:min-h-0`} onClick={() => (setValue(""), setEditing(true))}>Add phone number</button>}
        </>
      )}
    </Section>
  );
}

/** Add an email: enter it, get a 6-digit code, verify. */
function AddContact({ run, onVerified }: { run: Run; onVerified: (r: EmailAddressResource) => Promise<unknown> }) {
  const { user } = useUser();
  const { busy, error, go } = useTask();
  const [step, setStep] = useState<"idle" | "value" | "code">("idle");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const pending = useRef<EmailAddressResource | null>(null);
  const reset = () => (setStep("idle"), setValue(""), setCode(""), (pending.current = null));

  async function send(e: FormEvent) {
    e.preventDefault();
    const ok = await go(async () => {
      const r = (await run(() => user!.createEmailAddress({ email: value.trim() }))) as EmailAddressResource;
      pending.current = r;
      await r.prepareVerification({ strategy: "email_code" });
    });
    if (ok) setStep("code");
  }

  async function check(e: FormEvent) {
    e.preventDefault();
    const r = pending.current!;
    const ok = await go(async () => {
      const v = await r.attemptVerification({ code });
      if (v.verification.status !== "verified") throw new Error("That code didn't work. Try again.");
      await run(() => onVerified(v));
    });
    if (ok) reset();
  }

  if (step === "idle") {
    return (
      <button type="button" className={`${btnOutline} mt-3 min-h-10 sm:min-h-0`} onClick={() => setStep("value")}>
        Change email
      </button>
    );
  }
  return (
    <form onSubmit={step === "value" ? send : check} className="mt-4 max-w-sm space-y-3">
      {step === "value" ? (
        <Field label="New email address" hint="becomes your primary">
          <input
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            required
            className={field}
          />
        </Field>
      ) : (
        <Field label="Verification code" hint={`sent to ${value.trim()}`}>
          <CodeField value={code} onChange={setCode} processing={busy} invalid={!!error} />
        </Field>
      )}
      <Alert text={error} />
      <div className="flex gap-2 [&_button]:min-h-10 sm:[&_button]:min-h-0">
        <button aria-busy={busy} type="submit" className={btnPrimary} disabled={busy || (step === "code" && code.length !== 6)}>
          {step === "value" ? "Send code" : "Verify"}
        </button>
        <button type="button" className={btnGhost} disabled={busy} onClick={() => (pending.current?.destroy().catch(() => {}), reset())}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Connected({ run }: { run: Run }) {
  const { user } = useUser();
  const { busy, error, go } = useTask();
  if (!user) return null;
  return (
    <Section title="Connected accounts" desc="Sign in with these instead of an email code.">
      <ul>
        {providers.map(({ strategy, label }) => {
          const acct = user.externalAccounts.find((a) => `oauth_${a.provider}` === strategy);
          const linked = acct?.verification?.status === "verified";
          return (
            <Row
              key={strategy}
              actions={
                acct ? (
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => go(() => run(() => acct.destroy()).then(() => user.reload()))}>
                    {linked ? "Disconnect" : "Remove"}
                  </button>
                ) : (
                  <button type="button" className={btnOutline} disabled={busy} onClick={() => go(() => connect(strategy))}>
                    Connect
                  </button>
                )
              }
            >
              <span className="flex w-5 justify-center">{providerIcons[strategy]}</span>
              <span>{label}</span>
              {acct && <span className="break-all text-muted sm:truncate">{linked ? acct.emailAddress || acct.username : "Couldn't connect"}</span>}
            </Row>
          );
        })}
      </ul>
      <Alert text={error} />
    </Section>
  );

  async function connect(strategy: OAuthStrategy) {
    const acct = (await run(() => user!.createExternalAccount({ strategy, redirectUrl: location.href }))) as { verification: { externalVerificationRedirectURL: URL | null } | null };
    const to = acct.verification?.externalVerificationRedirectURL;
    if (!to) throw new Error("Couldn't start the connection. Try again.");
    location.assign(to.href);
  }
}

function Sessions({ run }: { run: Run }) {
  const { user } = useUser();
  const { session } = useSession();
  const { busy, error, go } = useTask();
  const [list, setList] = useState<SessionWithActivitiesResource[] | null>(null);
  const load = () => user?.getSessions().then((s) => setList(s.filter((x) => x.status === "active")));

  useEffect(() => {
    load();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per member

  const others = list?.filter((s) => s.id !== session?.id) ?? [];
  const where = (s: SessionWithActivitiesResource) => {
    const a = s.latestActivity;
    const device = [a.browserName, a.deviceType || (a.isMobile ? "Mobile" : "")].filter(Boolean).join(" on ") || "Unknown device";
    const place = [a.city, a.country].filter(Boolean).join(", ");
    return { device, detail: [place, a.ipAddress].filter(Boolean).join(" · ") };
  };

  return (
    <Section title="Where you're signed in" desc="Sign out of any device you don't recognize.">
      {!list ? (
        <Loading label="Loading devices…">{times(2, (i) => <SessionRowSkeleton key={i} />)}</Loading>
      ) : (
        <ul>
          {list.map((s) => {
            const { device, detail } = where(s);
            const current = s.id === session?.id;
            return (
              <Row
                key={s.id}
                actions={!current && (
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => go(() => run(() => s.revoke()).then(load))}>
                    Sign out
                  </button>
                )}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 break-words">
                    {device}
                    {current && <span className={badge}>This device</span>}
                  </p>
                  <p className="break-words text-xs text-muted sm:truncate">
                    {detail}
                    {detail && " · "}
                    {current ? "Active now" : lastActive(s.lastActiveAt)}
                  </p>
                </div>
              </Row>
            );
          })}
        </ul>
      )}
      {others.length > 1 && (
        <button type="button" className={`${btnOutline} mt-3 min-h-10 sm:min-h-0`} disabled={busy} onClick={() => go(() => run(() => Promise.all(others.map((s) => s.revoke()))).then(load))}>
          Sign out of all other devices
        </button>
      )}
      <Alert text={error} />
    </Section>
  );
}

/** Per browser (a cookie), like the theme: PostHog stops in the browser and server events for them are skipped. */
function UsageAnalytics() {
  // Only rendered once Clerk has the user, which is in the browser, so the cookie is readable here
  const [on, setOn] = useState(analyticsOn);
  const flip = () => (setAnalytics(!on), setOn(!on));
  return (
    <section className="border-b border-border px-4 py-6 sm:px-5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 id="analytics-title" className="text-sm font-medium">Usage analytics</h2>
          <p id="analytics-desc" className="mt-1 max-w-prose text-sm text-muted">
            Share which pages you visit and features you use, linked to your account ID, to help us improve Hire Excellence. Your email, resume and messages are never sent.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="analytics-title"
          aria-describedby="analytics-desc"
          onClick={flip}
          // The visible track is small; the ::after area makes the tap target 40px for touch
          className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors outline-none after:absolute after:-inset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none ${on ? "border-foreground bg-foreground" : "border-border bg-surface-hover hover:border-muted"}`}
        >
          <span className={`size-[18px] rounded-full shadow-sm transition-transform motion-reduce:transition-none ${on ? "translate-x-[18px] bg-background" : "translate-x-0.5 bg-muted"}`} />
        </button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted" aria-live="polite">
        <span className={`size-1.5 rounded-full ${on ? "bg-success" : "bg-muted/60"}`} aria-hidden />
        {on ? "On for this browser" : "Off for this browser. Nothing is sent."}
      </p>
    </section>
  );
}

function DeleteAccount({ run }: { run: Run }) {
  const { signOut } = useClerk();
  const { busy, error, go } = useTask();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  async function confirm(e: FormEvent) {
    e.preventDefault();
    const ok = await go(() => run(deleteAccount));
    // The Clerk user (and its sessions) are gone; clear the local session and leave
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload drops the dead session
    if (ok) await signOut({ redirectUrl: "/" }).catch(() => location.assign("/"));
  }

  return (
    <Section title="Delete account" desc="Permanently delete your account and everything in it. This can't be undone." danger>
      <button type="button" className={`${btnOutline} min-h-10 text-danger sm:min-h-0`} onClick={() => setOpen(true)}>
        Delete account
      </button>
      {open && (
        <Modal title="Delete account" onClose={() => !busy && (setOpen(false), setTyped(""))}>
          <form onSubmit={confirm} className="space-y-4 p-5">
            <p className="text-sm text-muted">
              Your profile, posts, comments, connections, job posts and applications will be deleted for good, and you&apos;ll be signed out everywhere.
            </p>
            <Field label="Type DELETE to confirm">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" className={field} />
            </Field>
            <Alert text={error} />
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end [&_button]:min-h-10 sm:[&_button]:min-h-0">
              <button type="button" className={btnGhost} disabled={busy} onClick={() => (setOpen(false), setTyped(""))}>
                Cancel
              </button>
              <button aria-busy={busy} type="submit" className={btnDanger} disabled={busy || typed !== "DELETE"}>
                Delete my account
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Section>
  );
}

/** "Confirm it's you": our own UI for Clerk's reverification, a code to the email (or phone) you sign in with. */
function Reverify({ level, complete, cancel, onDone }: NeedsReverification & { onDone: () => void }) {
  const { session } = useSession();
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const factor = useRef<{ strategy: "email_code"; emailAddressId: string } | { strategy: "phone_code"; phoneNumberId: string } | null>(null);
  const started = useRef(false);

  async function start() {
    if (!session) return;
    setError("");
    try {
      const v = await session.startVerification({ level: level ?? "first_factor" });
      const f = v.supportedFirstFactors?.find((x) => x.strategy === "email_code") ?? v.supportedFirstFactors?.find((x) => x.strategy === "phone_code");
      if (!f || !("safeIdentifier" in f)) throw new Error("No email or phone to verify with.");
      factor.current = f.strategy === "email_code" ? { strategy: "email_code", emailAddressId: f.emailAddressId } : { strategy: "phone_code", phoneNumberId: (f as { phoneNumberId: string }).phoneNumberId };
      await session.prepareFirstFactorVerification(factor.current);
      setSentTo(f.safeIdentifier);
    } catch (e) {
      setError(errorText(e));
    }
  }

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice: send one code
    started.current = true;
    start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- send the code once on open

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!session || !factor.current) return;
    setBusy(true);
    setError("");
    try {
      const v = await session.attemptFirstFactorVerification({ strategy: factor.current.strategy, code });
      if (v.status !== "complete") throw new Error("Additional verification is required.");
      onDone();
      complete();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const close = () => (onDone(), cancel());
  return (
    <Modal title="Confirm it's you" onClose={close}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <p className="text-sm text-muted">
          {sentTo ? <>For your security, enter the 6-digit code we sent to <span className="text-foreground">{sentTo}</span>.</> : "Sending a verification code…"}
        </p>
        <CodeField value={code} onChange={setCode} processing={busy} invalid={!!error} />
        <Alert text={error} />
        <div className="flex flex-wrap items-center justify-between gap-3 [&_button]:min-h-10 sm:[&_button]:min-h-0">
          <button type="button" className="text-sm text-link hover:underline disabled:opacity-60" disabled={busy} onClick={start}>
            Resend code
          </button>
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={close}>Cancel</button>
            <button aria-busy={busy} type="submit" className={btnPrimary} disabled={busy || code.length !== 6}>Continue</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
