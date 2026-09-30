"use client";

import { useClerk, useReverification, useSession, useUser } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import type { EmailAddressResource, OAuthStrategy, SessionWithActivitiesResource } from "@clerk/nextjs/types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { deleteAccount } from "@/app/settings/actions";
import { validPhone } from "@/lib/resume-fields";
import { errorText, providerIcons, providers } from "./auth";
import { field, Field } from "./jobs";
import { Modal } from "./kit";
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
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background/80 px-5 backdrop-blur">
        <h1 className="text-sm font-semibold">Account settings</h1>
      </header>
      {loading && (
        <Loading label="Loading account…">
          {times(4, (i) => (
            <section key={i} className="border-b border-border px-5 py-6">
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

/** Busy flag + error message for one section. Refreshes server-rendered parts (sidebar email) after a change. */
function useTask() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
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
      <h2 className={`text-sm font-semibold ${danger ? "text-danger" : ""}`}>{title}</h2>
      <p className="mt-1 text-sm text-muted">{desc}</p>
      <div className="mt-4">{children}</div>
    </>
  );
  // The danger zone gets a red-bordered card, as in Vercel's settings
  return danger ? (
    <section className="px-5 py-6">
      <div className="rounded-lg border border-danger/40 p-4">{body}</div>
    </section>
  ) : (
    <section className="border-b border-border px-5 py-6">{body}</section>
  );
}

function Row({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex min-h-12 items-center gap-3 border-t border-border py-2 first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">{children}</div>
      <div className="flex shrink-0 gap-1">{actions}</div>
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
              <span className="truncate">{e.emailAddress}</span>
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
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <Alert text={error} />
          {!phone && <button type="button" className={`${btnOutline} mt-3`} onClick={() => (setValue(""), setEditing(true))}>Add phone number</button>}
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
      <button type="button" className={`${btnOutline} mt-3`} onClick={() => setStep("value")}>
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
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            autoFocus
            required
            className={`${field} font-mono tracking-[0.4em]`}
          />
        </Field>
      )}
      <Alert text={error} />
      <div className="flex gap-2">
        <button type="submit" className={btnPrimary} disabled={busy || (step === "code" && code.length !== 6)}>
          {busy ? "Please wait…" : step === "value" ? "Send code" : "Verify"}
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
              {acct && <span className="truncate text-muted">{linked ? acct.emailAddress || acct.username : "Couldn't connect"}</span>}
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
                  <p className="flex items-center gap-2">
                    {device}
                    {current && <span className={badge}>This device</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
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
        <button type="button" className={`${btnOutline} mt-3`} disabled={busy} onClick={() => go(() => run(() => Promise.all(others.map((s) => s.revoke()))).then(load))}>
          Sign out of all other devices
        </button>
      )}
      <Alert text={error} />
    </Section>
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
      <button type="button" className={`${btnOutline} text-danger`} onClick={() => setOpen(true)}>
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
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} disabled={busy} onClick={() => (setOpen(false), setTyped(""))}>
                Cancel
              </button>
              <button type="submit" className={btnDanger} disabled={busy || typed !== "DELETE"}>
                {busy ? "Deleting…" : "Delete my account"}
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
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          aria-label="Verification code"
          autoFocus
          className={`${field} text-center font-mono tracking-[0.5em]`}
        />
        <Alert text={error} />
        <div className="flex items-center justify-between">
          <button type="button" className="text-sm text-link hover:underline disabled:opacity-60" disabled={busy} onClick={start}>
            Resend code
          </button>
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={close}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Continue"}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
