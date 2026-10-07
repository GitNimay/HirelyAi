/* Loading placeholders, built from the real components' markup so nothing moves when data arrives.
   No "use client": loading.tsx files (server) and client components both use them. */
import type { CSSProperties, ReactNode } from "react";
import { Icon, icons } from "./ui";

/** A pulsing block. Size and shape come from `className`. */
export const Skeleton = ({ className = "", style }: { className?: string; style?: CSSProperties }) => <span aria-hidden className={`skeleton ${className}`} style={style} />;

/** One line of text: takes the line box of the font size in `className`, so its height matches the real copy. */
export const Line = ({ w, className = "" }: { w: string; className?: string }) => (
  <span aria-hidden className={`flex h-[1lh] items-center ${className}`}>
    <span className="skeleton h-[0.65em]" style={{ width: w }} />
  </span>
);

/** Wraps a loading region: busy for assistive tech, announced once, faded in late so fast loads don't flash. */
export function Loading({ label = "Loading…", className = "", children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div aria-busy="true" className={`skeleton-in ${className}`}>
      {children}
      {/* Last, so first:/space-y/divide-y on the region see the real rows first */}
      <span role="status" className="sr-only">{label}</span>
    </div>
  );
}

/** `n` items, each told its index (for varied widths). */
export const times = (n: number, fn: (i: number) => ReactNode) => Array.from({ length: n }, (_, i) => fn(i));
const pick = <T,>(xs: T[], i: number) => xs[i % xs.length];

/** The sticky page header, with its real title and (inactive) tab labels. */
export function PageHeader({ title, back, tabs, action, className = "gap-3 px-4" }: { title?: string; back?: boolean; tabs?: string[]; action?: ReactNode; className?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className={`flex h-14 items-center ${className}`}>
        {back && <span className="rounded-md p-1 text-muted"><Icon d={icons.back} size={18} /></span>}
        <h1 className="flex-1 text-sm font-medium">{title}</h1>
        {action}
      </div>
      {tabs && (
        <div className="flex px-2">
          {tabs.map((t) => <span key={t} className="flex h-10 items-center px-3 text-sm text-muted">{t}</span>)}
        </div>
      )}
    </header>
  );
}

/** components/feed.tsx PostCard. `children` go under the action bar, like its open comments. */
export function PostSkeleton({ i = 0, children }: { i?: number; children?: ReactNode }) {
  const body = pick([["100%", "92%", "64%"], ["100%", "78%"], ["96%", "100%", "88%", "40%"], ["70%"]], i);
  return (
    <div className="border-b border-border p-4">
      <div className="flex gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Line className="text-sm" w={pick(["38%", "30%", "46%"], i)} />
          <Line className="text-xs" w={pick(["58%", "44%", "66%"], i)} />
          <div className="mt-2 text-sm leading-relaxed">{body.map((w, j) => <Line key={j} w={w} />)}</div>
          {i % 3 === 1 && <Skeleton className="mt-3 aspect-video rounded-xl" />}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 border-t border-border">
        {times(4, (j) => <span key={j} className="flex h-11 items-center justify-center"><Skeleton className="h-4 w-8" /></span>)}
      </div>
      {children}
    </div>
  );
}

export const PostsSkeleton = ({ n = 3, label }: { n?: number; label?: string }) => <Loading label={label}>{times(n, (i) => <PostSkeleton key={i} i={i} />)}</Loading>;

/** feed.tsx Comments list */
export const CommentsSkeleton = ({ n = 2 }: { n?: number }) => (
  <Loading label="Loading comments…" className="space-y-3">
    {times(n, (i) => (
      <div key={i} className="flex gap-2">
        <Skeleton className="size-7 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2">
          <Line className="text-xs" w={pick(["30%", "22%"], i)} />
          <Line className="mt-0.5 text-sm" w={pick(["80%", "55%"], i)} />
        </div>
      </div>
    ))}
  </Loading>
);

/** network.tsx Row */
export const PersonRowSkeleton = ({ i = 0 }: { i?: number }) => (
  <div className="flex items-center gap-3 px-4 py-3">
    <Skeleton className="size-12 shrink-0 rounded-full" />
    <div className="min-w-0 flex-1">
      <Line className="text-sm" w={pick(["40%", "32%", "48%"], i)} />
      <Line className="text-xs" w={pick(["65%", "52%", "72%"], i)} />
      <Line className="text-xs" w={pick(["30%", "38%", "26%"], i)} />
    </div>
    <Skeleton className="h-8 w-24 rounded-lg" />
  </div>
);

/** jobs.tsx JobRow */
export const JobRowSkeleton = ({ i = 0 }: { i?: number }) => (
  <div className="flex gap-3 px-4 py-3">
    <Skeleton className="size-12 shrink-0 rounded-md" />
    <div className="min-w-0 flex-1">
      <Line className="text-sm" w={pick(["55%", "42%", "62%"], i)} />
      <Line className="text-sm" w={pick(["30%", "24%", "36%"], i)} />
      <Line className="text-xs" w={pick(["40%", "34%", "46%"], i)} />
      <Line className="mt-1 text-xs" w={pick(["28%", "35%", "22%"], i)} />
    </div>
  </div>
);

export const JobRowsSkeleton = ({ n = 6 }: { n?: number }) => (
  <Loading label="Loading jobs…" className="divide-y divide-border border-b border-border">{times(n, (i) => <JobRowSkeleton key={i} i={i} />)}</Loading>
);

/** notifications.tsx Row */
export const NotificationRowsSkeleton = ({ n = 8 }: { n?: number }) => (
  <Loading label="Loading notifications…">
    {times(n, (i) => (
      <div key={i} className="flex gap-3 border-b border-border px-4 py-3 pr-12">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Line className="text-sm" w={pick(["70%", "56%", "82%", "48%"], i)} />
          <Line className="mt-1 text-xs" w="12%" />
        </div>
      </div>
    ))}
  </Loading>
);

/** profile.tsx ReplyList item */
export const RepliesSkeleton = ({ n = 3 }: { n?: number }) => (
  <Loading label="Loading replies…">
    {times(n, (i) => (
      <div key={i} className="border-b border-border p-4">
        <Line className="mb-2 ml-[52px] text-xs" w="30%" />
        <div className="flex gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Line className="text-sm" w={pick(["35%", "28%"], i)} />
            <div className="mt-1 text-sm leading-relaxed"><Line w={pick(["90%", "70%", "84%"], i)} /></div>
            <Skeleton className="mt-3 h-[66px] rounded-lg" />
          </div>
        </div>
      </div>
    ))}
  </Loading>
);

/** profile.tsx MediaGrid tiles */
export const MediaTilesSkeleton = ({ n = 9 }: { n?: number }) => (
  <Loading label="Loading media…" className="grid grid-cols-3 gap-0.5 p-0.5">
    {times(n, (i) => <Skeleton key={i} className="aspect-square rounded-none" />)}
  </Loading>
);

/** profile.tsx ProfileHeader: top bar, 3:1 cover, 96px avatar, identity, stats, tabs */
export const ProfileHeaderSkeleton = () => (
  <div aria-hidden>
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
      <span className="rounded-md p-1 text-muted"><Icon d={icons.back} size={18} /></span>
      <div className="min-w-0 flex-1">
        <Line className="text-sm leading-tight" w="30%" />
        <Line className="text-xs" w="14%" />
      </div>
    </header>
    <Skeleton className="aspect-[3/1] rounded-none" />
    <div className="px-4">
      <div className="flex items-end justify-between">
        <div className="-mt-12 rounded-full border-4 border-background bg-background">
          <Skeleton className="size-24 rounded-full" />
        </div>
        <div className="flex gap-2 pt-3"><Skeleton className="h-8 w-28 rounded-lg" /></div>
      </div>
      <div className="mt-3">
        <Line className="text-xl leading-tight" w="40%" />
        <Line className="mt-0.5 text-sm" w="22%" />
      </div>
      <Line className="mt-2 text-sm" w="60%" />
      <Line className="mt-3 text-sm" w="50%" />
      <Line className="mt-3 text-sm" w="48%" />
    </div>
    <div className="mt-3 flex border-b border-border">
      {times(3, (i) => <span key={i} className="flex h-12 flex-1 items-center justify-center"><Skeleton className="h-3 w-12" /></span>)}
    </div>
  </div>
);

/** A labelled form control (jobs.tsx Field / resume-editor F): label line, then a 36px input. */
export const FieldSkeleton = ({ w = "25%", label = "text-sm", h = "h-10", className = "" }: { w?: string; label?: string; h?: string; className?: string }) => (
  <div className={`space-y-1.5 ${className}`}>
    <Line className={label} w={w} />
    <Skeleton className={`${h} rounded-md`} />
  </div>
);

/** resume-editor.tsx ResumeEditor: basic details grid, status picker, then the list sections. */
export const ResumeEditorSkeleton = () => {
  const section = (title: string, children: ReactNode) => (
    <section key={title} className="space-y-3 border-t border-border pt-6 first:border-0 first:pt-0">
      <div className="flex h-8 items-center justify-between"><Line className="text-sm" w={title} /></div>
      {children}
    </section>
  );
  const f = (w: string, className?: string) => <FieldSkeleton w={w} label="text-sm" className={className} />;
  return (
    <Loading label="Loading your resume…" className="space-y-6">
      {section("24%", (
        <>
          <div className="grid gap-3 sm:grid-cols-2">{f("30%")}{f("25%")}{f("15%")}{f("18%")}{f("20%", "sm:col-span-2")}</div>
          {f("22%")}
        </>
      ))}
      {section("12%", <Skeleton className="h-[98px] rounded-md" />)}
      {["20%", "18%"].map((w) => section(w, (
        <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">{f("30%")}{f("35%")}{f("25%")}{f("25%")}</div>
      )))}
      {section("10%", <Skeleton className="h-10 rounded-md" />)}
    </Loading>
  );
};
