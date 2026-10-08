/* Shared dashboard primitives. No "use client" so server pages can import navItems. */

export type IconDef = string;

export const icons = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  network: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  jobs: "M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 13h18",
  notifications: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  settings: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  like: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z",
  comment: "M7.9 20A9 9 0 1 0 4 16.1L2 22z",
  repost: "m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3",
  share: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  photo: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M21 15l-5-5L5 21",
  video: "m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  article: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
  connect: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  close: "M18 6 6 18M6 6l12 12",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
  check: "M20 6 9 17l-5-5",
  bookmark: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  pin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  back: "m15 18-6-6 6-6",
  plus: "M12 5v14M5 12h14",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  company: "M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h4a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2",
  verified: "M12 2 15 5h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3V5h4zM8.5 12l2.5 2.5 4.5-5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9",
  laptop: "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 21h8M12 17v4",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  pay: "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 12h.01M18 12h.01",
  level: "M3 3v18h18M8 17v-3M13 17V9M18 17V5",
};

// A quick ease-out, a press that sinks, icons thicken on hover. Focus uses the global :focus-visible outline.
// On phones the 32px height grows to a 40px tap target (max-sm: is phone-only, so desktop is unchanged).
export const btn =
  "inline-flex h-8 max-sm:h-10 shrink-0 select-none items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-[background-color,color,box-shadow,transform,scale,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:duration-75 motion-safe:active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:transition-[stroke-width] [&_svg]:duration-100 hover:[&_svg]:stroke-[2.25]";
// Texture look (cult-ui texture-button), see tx-* in globals.css. Ghost stays flat for toolbar/icon actions.
export const btnPrimary = `${btn} tx-primary`;
export const btnOutline = `${btn} tx-secondary`;
export const btnGhost = `${btn} text-muted hover:bg-surface-hover hover:text-foreground active:bg-surface`;
export const btnDanger = `${btn} tx-danger`;
/** Form controls are 40px (Geist medium); toolbar and inline buttons stay 32px on desktop (`btn`, 40px on phones). */
export const btnLg = "h-10 px-4";
/** Icon-only back button in sticky page headers: 32px target, optically aligned to the header's padding. */
export const backBtn = "-ml-1.5 max-sm:-ml-2.5 flex size-8 max-sm:size-10 shrink-0 items-center justify-center rounded-md text-muted outline-none transition-[background-color,color,transform,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-surface hover:text-foreground motion-safe:active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-ring [&_svg]:transition-[stroke-width] hover:[&_svg]:stroke-[2.25]";
/** One row in a dropdown menu (see Menu in kit.tsx). */
// No hover fill: Menu's fluid highlight slides under the rows (hence `relative`, to paint above it)
export const menuItem = "dd-item relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 max-sm:py-2.5 text-left outline-none";

/** Compact relative time: now, 5m, 3h, 2d, then a date. */
export function ago(ms: number) {
  const m = (Date.now() - ms) / 60_000;
  if (m < 1) return "now";
  if (m < 60) return `${Math.floor(m)}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  if (m < 10080) return `${Math.floor(m / 1440)}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Icon({ d, size = 20, className }: { d: IconDef; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={d} />
    </svg>
  );
}

export const navItems = [
  { slug: "", label: "Home", icon: icons.home },
  { slug: "network", label: "My Network", icon: icons.network },
  { slug: "jobs", label: "Jobs", icon: icons.jobs },
  { slug: "companies", label: "Companies", icon: icons.company },
  { slug: "notifications", label: "Notifications", icon: icons.notifications },
  { slug: "me", label: "Me", icon: icons.settings }, // links to /in/<your handle>, see Nav
];

/** Image when we have one (Clerk avatar), initials otherwise. */
export function Avatar({ name, src, size = 40 }: { name: string; src?: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote Clerk avatar, no loader config needed
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-surface-hover text-xs font-medium text-muted" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

/** A company's square logo, or its initial on a grey tile when it has no page or no logo (LinkedIn's placeholder). */
export function CompanyLogo({ name, src, size = 48 }: { name: string; src?: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- auth-gated R2 media, served by /api/media
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-md border border-border bg-background object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-md border border-border bg-surface font-medium text-muted" style={{ width: size, height: size, fontSize: size / 2.6 }}>
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
