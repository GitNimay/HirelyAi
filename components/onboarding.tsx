"use client";

import { SignOutButton } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { extractFromPdf, saveMyResume } from "@/app/onboarding/actions";
import { emptyResume, MAX_RESUME_PDF_BYTES, mergeResume, missingFields, validPhone, type Resume } from "@/lib/resume-fields";
import { Logo } from "./auth";
import { F, input, ResumeEditor, StatusPicker } from "./resume-editor";
import { btnGhost, Icon, icons } from "./ui";

type Step = "details" | "method" | "reading" | "review" | "done";
const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Your details" },
  { id: "method", label: "Choose a method" },
  { id: "review", label: "Review profile" },
  { id: "done", label: "All set" },
];
const order = (s: Step) => (s === "reading" ? 1 : STEPS.findIndex((x) => x.id === s));

export const primary = "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const upload = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12";
const chevron = "m9 18 6-6-6-6";

/**
 * First sign-in: contact details → resume upload (AI fills the form) or manual entry → review, with anything
 * missing highlighted → saved, then the dashboard. Layout follows the reference: title left, card centre, steps right.
 */
export function Onboarding({ initial }: { initial: { name: string; email: string; phone: string } }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>("details");
  const [r, setR] = useState<Resume>({ ...emptyResume(), ...initial });
  const [show, setShow] = useState(false);
  const [fromPdf, setFromPdf] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const missing = missingFields(r);
  const go = (s: Step) => (setError(""), setStep(s), window.scrollTo({ top: 0 }));

  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => router.replace("/dashboard"), 2500);
    return () => clearTimeout(t);
  }, [step, router]);

  const detailsBad = { name: !r.name.trim(), phone: !validPhone(r.phone), city: !r.city.trim() };
  function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    setShow(true);
    if (Object.values(detailsBad).some(Boolean)) return;
    setShow(false);
    go("method");
  }

  async function read(f: File | undefined) {
    if (!f) return;
    if (f.type !== "application/pdf") return setError("Upload your resume as a PDF");
    if (f.size > MAX_RESUME_PDF_BYTES) return setError("Resume must be 5 MB or smaller");
    go("reading");
    const fd = new FormData();
    fd.set("file", f);
    const res = await extractFromPdf(fd).catch(() => ({ error: "Upload failed. Check your connection and try again." }));
    if ("error" in res) {
      setStep("method");
      return setError(res.error);
    }
    const next = mergeResume(r, res.resume);
    setR(next);
    setFromPdf(true);
    setShow(true); // point out what the resume didn't have straight away
    go("review");
  }

  async function save() {
    setShow(true);
    if (missing.length) {
      setError("Fill in the highlighted fields to continue.");
      document.querySelector(".border-danger, .text-danger")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    setError("");
    const res = await saveMyResume(r).catch(() => ({ error: "Couldn't save. Try again." }));
    setBusy(false);
    if ("error" in res) return setError(res.error);
    go("done");
  }

  const current = order(step);
  const card: Record<Step, ReactNode> = {
    details: (
      <form onSubmit={submitDetails} noValidate className="space-y-5">
        <Head title="Tell us about yourself" sub="Recruiters use these to reach you. Only people you apply to see your phone number." />
        <F label="Full name" bad={show && detailsBad.name}>
          <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} maxLength={50} autoComplete="name" autoFocus placeholder="Ada Lovelace" className={`${input} h-10 ${show && detailsBad.name ? "border-danger" : "border-border"}`} />
        </F>
        <div className="grid gap-5 sm:grid-cols-2">
          <F label="Phone number" bad={show && detailsBad.phone}>
            <input value={r.phone} onChange={(e) => setR({ ...r, phone: e.target.value })} type="tel" maxLength={30} autoComplete="tel" placeholder="+91 98765 43210" className={`${input} h-10 ${show && detailsBad.phone ? "border-danger" : "border-border"}`} />
          </F>
          <F label="Current city" bad={show && detailsBad.city}>
            <input value={r.city} onChange={(e) => setR({ ...r, city: e.target.value })} maxLength={60} autoComplete="address-level2" placeholder="Pune" className={`${input} h-10 ${show && detailsBad.city ? "border-danger" : "border-border"}`} />
          </F>
        </div>
        <F label="Which describes you best?">
          <StatusPicker value={r.status} onChange={(status) => setR({ ...r, status })} />
        </F>
        <div className="flex justify-end pt-1">
          <button type="submit" className={primary}>Continue<Icon d={chevron} size={16} /></button>
        </div>
      </form>
    ),
    method: (
      <div className="space-y-5">
        <Head title="Build your profile" sub="Start from your resume, or add your details yourself. You can edit everything later." />
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => file.current?.click()}
            onDragOver={(e) => (e.preventDefault(), setDrag(true))}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => (e.preventDefault(), setDrag(false), read(e.dataTransfer.files[0]))}
            className={`${option} ${drag ? "border-foreground bg-surface-hover" : ""}`}
          >
            <Badge tone="text-link"><Icon d={upload} size={16} /></Badge>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">Upload your resume</span>
              <span className="block text-[13px] text-muted">PDF up to 5 MB. We&apos;ll fill in your profile for you.</span>
            </span>
            <span className="hidden rounded-full border border-border px-2 py-0.5 text-[11px] text-muted sm:inline">Recommended</span>
            <Icon d={chevron} size={16} className="text-muted" />
          </button>
          <input ref={file} type="file" accept="application/pdf" hidden onChange={(e) => (read(e.target.files?.[0]), (e.target.value = ""))} />
          <button type="button" onClick={() => (setFromPdf(false), setShow(false), go("review"))} className={option}>
            <Badge tone="text-success"><Icon d={icons.edit} size={16} /></Badge>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">Fill in manually</span>
              <span className="block text-[13px] text-muted">Add your experience, education, projects and skills.</span>
            </span>
            <Icon d={chevron} size={16} className="text-muted" />
          </button>
        </div>
        {error && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="button" onClick={() => go("details")} className={btnGhost}><Icon d={icons.back} size={14} />Back</button>
      </div>
    ),
    reading: (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <span className="size-10 animate-spin rounded-full border-2 border-border border-t-foreground" />
        <h2 className="mt-6 text-lg font-semibold tracking-tight">Reading your resume…</h2>
        <p className="mt-1 max-w-xs text-sm text-muted">Pulling out your experience, education and skills. This takes about 10–20 seconds.</p>
      </div>
    ),
    review: (
      <div className="space-y-6">
        <Head
          title="Review your profile"
          sub={fromPdf ? "We filled this in from your resume. Check it over and complete anything highlighted." : "Add what you have. Fields marked Required are needed to continue."}
        />
        {fromPdf && missing.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] text-muted">
            <Icon d={icons.notifications} size={16} className="mt-px shrink-0 text-foreground" />
            <span>
              Your resume didn&apos;t include {missing.length === 1 ? "one detail" : `${missing.length} details`} we need. They&apos;re marked <span className="text-danger">Required</span> below.
            </span>
          </p>
        )}
        <ResumeEditor value={r} onChange={setR} missing={missing} show={show} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="sticky bottom-0 -mx-6 flex items-center justify-between gap-3 border-t border-border bg-surface px-6 py-4 sm:-mx-8 sm:px-8">
          <button type="button" onClick={() => go("method")} className={btnGhost} disabled={busy}><Icon d={icons.back} size={14} />Back</button>
          <button type="button" onClick={save} className={primary} disabled={busy}>{busy ? "Creating…" : "Create profile"}</button>
        </div>
      </div>
    ),
    done: (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <motion.span
          initial={reduce ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"
        >
          <Icon d={icons.check} size={28} />
        </motion.span>
        <h2 className="mt-6 text-xl font-semibold tracking-tight">Your profile has been created</h2>
        <p className="mt-1 text-sm text-muted">Welcome aboard, {r.name.split(" ")[0]}. Taking you to your dashboard…</p>
        <button type="button" onClick={() => router.replace("/dashboard")} className={`${primary} mt-8`}>Go to dashboard</button>
      </div>
    ),
  };

  return (
    <StepFrame
      title="Set up your profile"
      steps={STEPS.map((s) => s.label)}
      current={current}
      stepKey={step}
      action={<SignOutButton><button type="button" className={btnGhost}>Sign out</button></SignOutButton>}
    >
      {card[step]}
    </StepFrame>
  );
}

/** Title left, card centre, steps right; the faint rules frame the card column, like the reference. Also used by the interview flow. */
export function StepFrame({ title, steps, current, stepKey, action, children }: { title: string; steps: string[]; current: number; stepKey: string; action?: ReactNode; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-sm font-semibold tracking-tight">Hire Excellence</span>
        </span>
        {action}
      </header>

      <div className="grid flex-1 border-t border-dashed border-border lg:grid-cols-[1fr_minmax(0,680px)_1fr]">
        <aside className="hidden justify-end px-8 pt-10 lg:flex">
          <p className="text-sm font-medium">{title}</p>
        </aside>

        <main className="border-dashed border-border px-4 py-8 sm:py-10 lg:border-x lg:px-6">
          <ol className="mb-6 flex items-center gap-2 lg:hidden" aria-label="Progress">
            {steps.map((label, i) => (
              <li key={label} className={`h-1 flex-1 rounded-full transition-colors ${i <= current ? "bg-foreground" : "bg-border"}`}><span className="sr-only">{label}</span></li>
            ))}
          </ol>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stepKey}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="rounded-xl border border-border bg-surface px-6 pt-6 pb-6 sm:px-8 sm:pt-8"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <aside className="hidden px-8 pt-10 lg:block">
          <ol className="space-y-3 text-sm" aria-label="Progress">
            {steps.map((label, i) => (
              <li key={label} aria-current={i === current ? "step" : undefined} className={`flex items-center gap-2.5 ${i === current ? "font-medium text-foreground" : "text-muted"}`}>
                {i < current ? (
                  <Icon d={icons.check} size={14} className="text-success" />
                ) : (
                  <span className={`mx-[4px] size-1.5 rounded-full ${i === current ? "bg-foreground" : "bg-border"}`} />
                )}
                {label}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

const option = "flex w-full items-center gap-4 rounded-lg border border-border bg-background px-4 py-4 text-left transition-colors outline-none hover:border-muted/50 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring";

export function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface ${tone}`}>{children}</span>;
}
