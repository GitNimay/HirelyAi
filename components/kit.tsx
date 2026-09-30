"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { backBtn, btnDanger, btnGhost, btnPrimary, Icon, icons } from "./ui";

/** Shared client pieces: dialog, confirm, toasts, menu, tabs, back button, clamped text. */

/** Native <dialog>: focus trap, Escape and inert background for free. Focuses `[data-autofocus]` when present. */
export function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={`m-auto w-[calc(100%-2rem)] rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 light:backdrop:bg-black/30 ${wide ? "max-w-4xl" : "max-w-lg"}`}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className={`${btnGhost} px-2`}>
          <Icon d={icons.close} size={16} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

type Toast = { id: number; text: string };
type Ask = { title: string; body?: string; confirm: string; danger?: boolean; resolve: (ok: boolean) => void };

let pushToast: ((t: Toast) => void) | null = null;
let openAsk: ((a: Ask) => void) | null = null;

/** A short message at the bottom of the screen, announced to screen readers. */
export function toast(text: string) {
  pushToast?.({ id: Date.now() + Math.random(), text });
}

/** Styled replacement for window.confirm. Resolves true when the action is confirmed. */
export function ask(o: Omit<Ask, "resolve">): Promise<boolean> {
  return new Promise((resolve) => (openAsk ? openAsk({ ...o, resolve }) : resolve(window.confirm(o.title))));
}

/** Renders toasts and confirm dialogs; mounted once in the root layout. */
export function Feedback() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [q, setQ] = useState<Ask | null>(null);

  useEffect(() => {
    pushToast = (t) => {
      setToasts((ts) => [...ts.slice(-2), t]);
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), 4000);
    };
    openAsk = setQ;
    return () => {
      pushToast = openAsk = null;
    };
  }, []);

  const answer = (ok: boolean) => {
    q?.resolve(ok);
    setQ(null);
  };

  return (
    <>
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <p key={t.id} className="pointer-events-auto rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg">
            {t.text}
          </p>
        ))}
      </div>
      {q && (
        <Modal title={q.title} onClose={() => answer(false)}>
          <div className="space-y-4 p-5">
            {q.body && <p className="text-sm text-muted">{q.body}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" data-autofocus className={btnGhost} onClick={() => answer(false)}>Cancel</button>
              <button type="button" className={q.danger ? btnDanger : btnPrimary} onClick={() => answer(true)}>{q.confirm}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Menu button (WAI-ARIA APG): opening focuses the first item, arrows / Home / End move, Escape returns to the button.
 * Children are the items, each with role="menuitem" (closes on click) or "menuitemradio" (stays open).
 */
export function Menu({ label, button, className, panelClassName, onOpen, children }: {
  label: string;
  button: ReactNode;
  className: string;
  panelClassName: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = () => Array.from(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const to = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 } as Record<string, number>)[e.key];
    if (to !== undefined) {
      e.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  }

  return (
    <div
      ref={box}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      onClick={(e) => (e.target as HTMLElement).closest('[role="menuitem"]') && setOpen(false)}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        className={className}
      >
        {button}
      </button>
      {open && (
        <div role="menu" aria-label={label} className={cn("absolute z-20 overflow-hidden rounded-lg border border-border bg-surface py-1 text-sm shadow-xl", panelClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Tab strip (WAI-ARIA tabs): ←/→/Home/End move between tabs, the selected one is underlined.
 * `fill` spreads tabs across the width (feed header); otherwise they sit left, compact.
 */
export function Tabs<T extends string>({ label, tabs, value, onChange, fill }: {
  label: string;
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  fill?: boolean;
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === value);
    const to = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const t = tabs[(to + tabs.length) % tabs.length];
    onChange(t.id);
    e.currentTarget.querySelector<HTMLElement>(`[data-tab="${t.id}"]`)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={fill ? "flex h-14" : "flex h-10 px-2"}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`flex items-center justify-center text-sm transition-colors outline-none hover:text-foreground focus-visible:bg-surface ${fill ? "flex-1 hover:bg-surface" : "px-3"} ${on ? "font-medium text-foreground" : "text-muted"}`}
          >
            <TabLabel on={on}>
              {t.label}
              {t.count !== undefined && <span className="rounded-full bg-surface-hover px-1.5 text-xs tabular-nums text-muted">{t.count}</span>}
            </TabLabel>
          </button>
        );
      })}
    </div>
  );
}

/** The label and its underline, shared by button tabs and link tabs (profile) so they look the same. */
export function TabLabel({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="relative flex h-full items-center gap-1.5">
      {children}
      {on && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-link" />}
    </span>
  );
}

/** Keep a view's state in the address bar without adding history entries (Back still leaves the page). */
export function setParam(key: string, value: string | null) {
  const u = new URL(location.href);
  if (value) u.searchParams.set(key, value);
  else u.searchParams.delete(key);
  history.replaceState(history.state, "", u.pathname + u.search);
}

/** Back through history when there is some, otherwise to `fallback` (a shared link opened in a new tab). */
export function BackButton({ fallback = "/dashboard", label = "Back", beforeLeave }: { fallback?: string; label?: string; beforeLeave?: () => Promise<boolean> }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        if (beforeLeave && !(await beforeLeave())) return;
        if (history.length > 1) router.back();
        else router.push(fallback);
      }}
      className={backBtn}
    >
      <Icon d={icons.back} size={18} />
    </button>
  );
}

/** Text clamped to `lines` with a "…more" toggle, shown only when it actually overflows (LinkedIn "see more"). */
export function Clamp({ lines = 5, className, children }: { lines?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Line-box rounding makes scrollHeight a few px taller even when nothing is hidden: count only half a line or more
    if (el && !open) setOver(el.scrollHeight - el.clientHeight > parseFloat(getComputedStyle(el).lineHeight) / 2);
  }, [children, open]);

  const clamp: CSSProperties | undefined = open ? undefined : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" };
  return (
    <>
      <div ref={ref} className={className} style={clamp}>{children}</div>
      {over && !open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-0.5 text-sm font-medium text-muted hover:text-foreground hover:underline">
          …more
        </button>
      )}
    </>
  );
}

/** Warn before a full page unload (refresh, close tab) while a form has unsaved changes. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/** Ask before leaving a dirty form through an in-app link or button. */
export const leaveIfClean = (dirty: boolean) => (dirty ? ask({ title: "Discard changes?", body: "Your edits haven't been saved.", confirm: "Discard", danger: true }) : Promise.resolve(true));

const noSubscribe = () => () => {};
/** A value only the browser knows (time zone, storage): `server` during SSR and hydration, then `get()`. */
export function useClientValue<T>(get: () => T, server: T) {
  return useSyncExternalStore(noSubscribe, get, () => server);
}

/** Scroll to top, instantly when the visitor prefers reduced motion. */
export function scrollToTop(top = 0) {
  window.scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
