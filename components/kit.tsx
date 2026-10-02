"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { FluidHoverHighlight, spring, useFluidHover } from "@/lib/fluid-hover";
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

type Toast = { id: number; text: string; tone?: "error" };
type Ask = { title: string; body?: string; confirm: string; danger?: boolean; resolve: (ok: boolean) => void };

let pushToast: ((t: Toast) => void) | null = null;
let openAsk: ((a: Ask) => void) | null = null;

/** A short message at the bottom-left of the screen, announced to screen readers. Pass "error" for failures. */
export function toast(text: string, tone?: "error") {
  pushToast?.({ id: Date.now() + Math.random(), text, tone });
}

/** Styled replacement for window.confirm. Resolves true when the action is confirmed. */
export function ask(o: Omit<Ask, "resolve">): Promise<boolean> {
  return new Promise((resolve) => (openAsk ? openAsk({ ...o, resolve }) : resolve(window.confirm(o.title))));
}

/** Renders toasts and confirm dialogs; mounted once in the root layout. */
export function Feedback() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [q, setQ] = useState<Ask | null>(null);
  const reduce = useReducedMotion();
  const dismiss = (id: number) => setToasts((ts) => ts.filter((x) => x.id !== id));

  useEffect(() => {
    pushToast = (t) => {
      setToasts((ts) => [...ts.slice(-2), t]);
      setTimeout(() => dismiss(t.id), 4000);
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
      {/* Bottom-left (above the phone tab bar); newest at the bottom, springs in from the left, older ones glide up */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-start gap-2 sm:inset-x-auto sm:bottom-6 sm:left-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: -16, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, ...(reduce ? {} : { x: -16, scale: 0.96 }), transition: spring.moderate.exit }}
              transition={reduce ? { duration: 0.12 } : spring.slow}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-surface py-2.5 pl-3 pr-1.5 text-sm text-foreground shadow-[0_8px_24px_rgb(0_0_0/0.35)] sm:w-auto sm:min-w-72"
            >
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-hover ${t.tone ? "text-danger" : "text-success"}`}>
                <Icon d={t.tone ? icons.close : icons.check} size={14} />
              </span>
              <p className="flex-1 font-medium">{t.text}</p>
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                <Icon d={icons.close} size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
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
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hover = useFluidHover(panel, { selector: '[role^="menuitem"]' });
  const items = () => Array.from(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

  // Items fade up one after another: each gets its index before first paint, the stagger itself is CSS (.dd / .dd-item)
  useLayoutEffect(() => {
    if (open) panel.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]').forEach((el, i) => el.style.setProperty("--i", String(i)));
  }, [open]);

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
      {/* Always mounted so it can grow open and shut; inert while closed keeps its items out of the tab order */}
      <div
        data-open={open || undefined}
        inert={!open}
        className={cn("dd absolute z-20 rounded-xl border border-border bg-surface text-sm shadow-[0_12px_32px_rgb(0_0_0/0.35)]", panelClassName)}
      >
        <div>
          <div
            ref={panel}
            role="menu"
            aria-label={label}
            {...hover.handlers}
            // the highlight follows keyboard focus too, so arrows glide like the pointer does
            onFocus={(e) => e.target.matches('[role^="menuitem"]') && hover.show(e.target)}
            className="relative p-1"
          >
            <FluidHoverHighlight hover={hover} className="rounded-lg" />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dropdown select (WAI-ARIA listbox) that opens like Menu. A hidden native <select> carries `name`/`required`/the
 * form value and fires a real change event, so FormData, validation and form-level onChange keep working.
 * Uncontrolled like a native select: no value/defaultValue means the first option.
 */
export function Select({ options, value, defaultValue, onChange, name, required, className, panelClassName, "aria-label": ariaLabel }: {
  options: { value: string; label: string }[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  className: string;
  panelClassName?: string;
  "aria-label"?: string;
}) {
  const [own, setOwn] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? own;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const at = Math.max(0, options.findIndex((o) => o.value === current));

  function show() {
    setActive(at);
    setOpen(true);
    requestAnimationFrame(() => list.current?.focus());
  }
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function pick(v: string) {
    const el = native.current;
    if (el && el.value !== v) {
      el.value = v;
      el.dispatchEvent(new Event("change", { bubbles: true })); // so a form-level onChange (dirty tracking) sees it
    }
    if (value === undefined) setOwn(v);
    onChange?.(v);
    close();
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const to = ({ ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: options.length - 1 } as Record<string, number>)[e.key];
    if (to !== undefined) setActive(Math.min(options.length - 1, Math.max(0, to)));
    else if (e.key === "Enter" || e.key === " ") {
      if (options[active]) pick(options[active].value);
    } else if (e.key === "Escape") close();
    else if (e.key === "Tab") return setOpen(false);
    else {
      // typeahead: the next option starting with the typed letter
      const k = e.key.toLowerCase();
      if (k.length !== 1) return;
      const after = options.findIndex((o, j) => j > active && o.label.toLowerCase().startsWith(k));
      const j = after >= 0 ? after : options.findIndex((o) => o.label.toLowerCase().startsWith(k));
      if (j < 0) return;
      setActive(j);
    }
    e.preventDefault();
  }

  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          show();
        }}
        className={cn("flex items-center justify-between gap-2 text-left", className)}
      >
        <span className="truncate">{options[at]?.label}</span>
        <Icon d="m6 9 6 6 6-6" size={16} className="menu-chevron shrink-0 text-muted" />
      </button>
      {/* after the button: a wrapping <label> names (and clicks) its first labelable child */}
      <select ref={native} name={name} required={required} value={current} onChange={() => {}} tabIndex={-1} aria-hidden className="sr-only">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div
        data-open={open || undefined}
        inert={!open}
        className={cn("dd absolute left-0 top-full z-30 mt-1 w-full min-w-max rounded-xl border border-border bg-surface text-sm text-foreground shadow-[0_12px_32px_rgb(0_0_0/0.35)]", panelClassName)}
      >
        <div>
          <ul
            ref={list}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={open ? `${id}-${active}` : undefined}
            onKeyDown={onKeyDown}
            className="max-h-72 overflow-y-auto p-1 outline-none"
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={o.value === current}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
                style={{ "--i": Math.min(i, 8) } as CSSProperties}
                className={cn("dd-item flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2", i === active && "bg-surface-hover")}
              >
                {o.label}
                {o.value === current && <Icon d={icons.check} size={14} className="shrink-0" />}
              </li>
            ))}
          </ul>
        </div>
      </div>
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

  const strip = useRef<HTMLDivElement>(null);
  const hover = useFluidHover(strip, { selector: '[role="tab"]', axis: "x", gapClick: false });
  const group = useId(); // scopes the sliding underline to this strip

  return (
    <LayoutGroup id={group}>
    <div ref={strip} role="tablist" aria-label={label} onKeyDown={onKeyDown} {...hover.handlers} className={fill ? "relative flex h-14" : "relative flex h-10 px-2"}>
      <FluidHoverHighlight hover={hover} className={fill ? "bg-surface" : "rounded-md bg-surface"} />
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
            className={`relative flex items-center justify-center text-sm transition-colors outline-none hover:text-foreground focus-visible:bg-surface ${fill ? "flex-1" : "px-3"} ${on ? "font-medium text-foreground" : "text-muted"}`}
          >
            <TabLabel on={on}>
              {t.label}
              {t.count !== undefined && <span className="rounded-full bg-surface-hover px-1.5 text-xs tabular-nums text-muted">{t.count}</span>}
            </TabLabel>
          </button>
        );
      })}
    </div>
    </LayoutGroup>
  );
}

/** The label and its underline, shared by button tabs and link tabs (profile) so they look the same. The underline slides between tabs of one strip. */
export function TabLabel({ on, children }: { on: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative flex h-full items-center gap-1.5">
      {children}
      {on && <motion.span layoutId="tab-underline" transition={reduce ? { duration: 0 } : spring.moderate} className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-link" />}
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
