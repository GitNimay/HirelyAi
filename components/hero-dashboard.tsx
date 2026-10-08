"use client";

import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { spring } from "@/lib/fluid-hover";
import { cn } from "@/lib/utils";
import { Logo } from "./auth";
import { Icon, icons, navItems } from "./ui";

/*
 * The landing hero's product shot: the Home dashboard (designed in Paper) as live markup, drawn at desktop size
 * (1440×900) and scaled to fit. Once on screen it plays one short story, once: a post in the feed gets a like,
 * the composer types and publishes a photo post, then a text post, and notifications arrive alongside.
 * Decorative for assistive tech (the hero copy says it all) and not interactive.
 */

const W = 1440;
const H = 900;

// Hand-drawn faces cropped out of the email art (public/email): sheet, then background size / position of a square crop
type Face = { src: string; size: string; pos: string };
const face = {
  me: { src: "reset", size: "281.5%", pos: "6.4% 13.9%" },
  priya: { src: "voice", size: "272.3%", pos: "94.6% 16.1%" },
  arjun: { src: "voice", size: "272.3%", pos: "8.9% 16.1%" },
  kavya: { src: "verify", size: "278.5%", pos: "8.6% 25.6%" },
  meera: { src: "mcq", size: "262.9%", pos: "87.7% 18.5%" },
} satisfies Record<string, Face>;

function Face({ f, size, className }: { f: Face; size: number; className?: string }) {
  const style: CSSProperties = { width: size, height: size, backgroundImage: `url(/email/${f.src}.png)`, backgroundSize: f.size, backgroundPosition: f.pos };
  return <span className={cn("block shrink-0 rounded-full bg-[#f0a0a8] bg-no-repeat", className)} style={style} />;
}

type Post = { id: string; who: keyof typeof face; name: string; sub: string; ago: string; body: string; likes: number; comments: number; reposts: number; following?: boolean; image?: string };
const seed: Post[] = [
  { id: "p1", who: "priya", name: "Priya Sharma", sub: "Senior Product Designer at Razorpay", ago: "2h", likes: 48, comments: 12, reposts: 3, body: "We're hiring two product designers in Bengaluru to work on payments for small businesses. Hybrid, mid to senior level. If you love untangling messy flows into something calm, my DMs are open." },
  { id: "p2", who: "kavya", name: "Kavya Rao", sub: "Talent Partner at Freshworks", ago: "3h", likes: 73, comments: 8, reposts: 2, body: "Reminder for anyone interviewing this month: a short, specific story beats a long list of tools every single time." },
  { id: "p3", who: "arjun", name: "Arjun Mehta", sub: "Engineering Manager at Zerodha", ago: "5h", likes: 126, comments: 24, reposts: 9, following: true, body: "Six months into running our platform team. The biggest lesson so far: write the decision down before the meeting, not after. It cut our review cycles in half." },
];
const me = { who: "me", name: "James Carter", sub: "Full-stack engineer building hiring tools", ago: "now", likes: 0, comments: 0, reposts: 0 } as const;
const textPost: Post = { ...me, id: "me-text", body: "Just wrapped our first structured interview round. Shortlist in a day, not a month." };
const photoPost: Post = { ...me, id: "me-photo", body: "Hiring day at our London office. Twelve offers extended, each one after a structured first round.", image: "/landing/tile-grading.webp" };

type Notif = { id: string; who: keyof typeof face; actor: string; verb: string; ago: string; icon: string; unread: boolean };
const seedNotifs: Notif[] = [
  { id: "n3", who: "kavya", actor: "Kavya Rao", verb: "started following you", ago: "3h", icon: icons.plus, unread: false },
  { id: "n2", who: "arjun", actor: "Arjun Mehta", verb: "commented on your post", ago: "1h", icon: icons.comment, unread: false },
  { id: "n1", who: "priya", actor: "Priya Sharma and 4 others", verb: "reacted to your post", ago: "12m", icon: icons.like, unread: true },
];
// One arrives with each beat of the loop (after the like, the text post and the photo post)
const arrivals: Omit<Notif, "id">[] = [
  { who: "meera", actor: "Meera Joshi", verb: "viewed your profile", ago: "now", icon: icons.search, unread: true },
  { who: "arjun", actor: "Arjun Mehta", verb: "commented on your photo", ago: "now", icon: icons.comment, unread: true },
  { who: "kavya", actor: "Kavya Rao and 6 others", verb: "reacted to your post", ago: "now", icon: icons.like, unread: true },
];

// The story: idle, like, type photo, photo posted, type text, text posted (and it stays there). Milliseconds per phase.
const TYPE_MS = 30;
const PHASES = [1200, 1600, photoPost.body.length * TYPE_MS + 400, 1800, textPost.body.length * TYPE_MS + 400, 3200];

/** Newest first, three at a time: the seeds, then the first `count` arrivals. */
function notifsAt(count: number) {
  const all = (k: number): Notif => (k < seedNotifs.length ? seedNotifs[k] : { id: `a${k}`, ...arrivals[k - seedNotifs.length] });
  const last = seedNotifs.length + count;
  return [last - 1, last - 2, last - 3].map(all);
}

/** Scale the 1440px frame to its box. Hidden until measured, then it settles in. */
function useFit() {
  const box = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setS(e.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { box, s };
}

export function HeroDashboard() {
  const { box, s } = useFit();
  const inView = useInView(box, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const last = PHASES.length - 1;
  const phase = reduce ? last : step; // reduced motion shows the finished frame

  // Advances only while on screen, and stops on the last phase
  useEffect(() => {
    if (!inView || reduce || step >= last) return;
    const t = setTimeout(() => setStep((n) => n + 1), PHASES[step]);
    return () => clearTimeout(t);
  }, [inView, reduce, step, last]);

  const posts = [...(phase >= 5 ? [textPost] : []), ...(phase >= 3 ? [photoPost] : []), ...seed];
  const typing = phase === 2 ? photoPost : phase === 4 ? textPost : null;
  const notifs = notifsAt((phase >= 1 ? 1 : 0) + (phase >= 3 ? 1 : 0) + (phase >= 5 ? 1 : 0));

  return (
    <div className="relative mt-12 flex aspect-[16/10] w-full items-center justify-center overflow-hidden border border-border bg-[url(/landing/hero-sky.webp)] bg-cover bg-center sm:mt-16 sm:aspect-[2/1]">
      <span className="sr-only">The Hire Excellence home feed: posts from your network, your profile, and your latest notifications.</span>
      <div ref={box} aria-hidden className="relative aspect-[16/10] w-[92%] select-none overflow-hidden border border-white/40 shadow-[0_24px_60px_rgb(0_0_0/0.35)] sm:w-[70%]">
        <div
          className="pointer-events-none absolute left-0 top-0 flex origin-top-left justify-center bg-background text-left text-foreground"
          style={{ width: W, height: H, transform: `scale(${s})`, opacity: s ? 1 : 0 }}
        >
          <Sidebar />
          <main className="flex h-full w-[640px] shrink-0 flex-col overflow-hidden border-r border-border">
            <Tabs />
            <Composer key={typing ? phase : "idle"} post={typing} />
            <LayoutGroup>
              <AnimatePresence initial={false} mode="popLayout">
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} liked={p.id === "p1" && phase >= 1} />
                ))}
              </AnimatePresence>
            </LayoutGroup>
          </main>
          <RightRail notifs={notifs} />
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border px-3 py-4">
      <div className="mb-6 flex h-10 items-center gap-2 px-3">
        <Logo size={28} faint={false} />
        <span className="text-sm font-medium tracking-tight">Hire Excellence</span>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map(({ slug, label, icon }) => (
          <span key={slug} className={cn("flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors", slug ? "text-muted hover:bg-surface hover:text-foreground light:hover:bg-surface-hover" : "bg-surface font-medium light:bg-surface-hover")}>
            <span className="relative flex">
              <Icon d={icon} />
              {slug === "notifications" && (
                <span className="absolute -right-2.5 -top-2 h-[18px] min-w-[18px] rounded-full bg-danger px-1 text-center text-xs font-medium leading-[18px] tabular-nums text-background">3</span>
              )}
            </span>
            {label}
          </span>
        ))}
      </nav>
      <div className="mt-auto space-y-4 border-t border-border pt-4">
        <span className="tx-secondary flex h-10 items-center justify-center rounded-full text-sm font-medium">Post</span>
        <span className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface light:hover:bg-surface-hover">
          <Face f={face.me} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">James Carter</span>
            <span className="block truncate text-xs text-muted">james.carter@example.com</span>
          </span>
          <Icon d="m18 15-6-6-6 6" size={16} className="text-muted" />
        </span>
      </div>
    </aside>
  );
}

function Tabs() {
  return (
    <div className="flex h-14 shrink-0 border-b border-border">
      {["For you", "Following"].map((t, i) => (
        <span key={t} className={cn("flex flex-1 justify-center text-sm", i ? "text-muted" : "font-medium text-foreground")}>
          <span className="relative flex h-full items-center">
            {t}
            {!i && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-link" />}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Given a `post`, types its text out (and attaches its photo); the parent remounts it (keyed) to clear it once posted. */
function Composer({ post }: { post: Post | null }) {
  const text = post?.body ?? "";
  const [typed, setTyped] = useState(post ? 0 : -1); // -1: placeholder; then characters typed so far
  useEffect(() => {
    if (typed < 0 || typed >= text.length) return;
    const t = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => clearTimeout(t);
  }, [typed, text]);
  const ready = typed >= text.length;

  return (
    <section className="flex shrink-0 gap-3 border-b border-border p-4">
      <Face f={face.me} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex h-[54px] gap-3">
          <p className="min-w-0 flex-1 pt-2 text-sm leading-relaxed">
            {typed < 0 ? (
              <span className="text-muted">Share an update or opportunity</span>
            ) : (
              <>
                {text.slice(0, typed)}
                <span className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-foreground" />
              </>
            )}
          </p>
          {post?.image && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring.slow}
              className="block w-24 shrink-0 rounded-md border border-border bg-cover bg-center"
              style={{ backgroundImage: `url(${post.image})` }}
            />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1 text-sm text-muted">
            {([[icons.photo, "Photo"], [icons.video, "Video"]] as const).map(([d, l]) => (
              <span key={l} className="flex h-8 items-center gap-1.5 rounded-md px-2">
                <Icon d={d} size={16} /> {l}
              </span>
            ))}
          </div>
          <span className={cn("tx-primary flex h-8 items-center rounded-lg px-4 text-sm font-medium transition-opacity", !ready && "opacity-50")}>Post</span>
        </div>
      </div>
    </section>
  );
}

function PostCard({ post: p, liked }: { post: Post; liked: boolean }) {
  const likes = p.likes + (liked ? 1 : 0);
  const action = "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-sm text-muted transition-colors";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: spring.moderate.exit }}
      transition={spring.slow}
      className="shrink-0 border-b border-border p-4"
    >
      <div className="flex gap-3">
        <Face f={face[p.who]} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex gap-1 text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted">· {p.ago}</span>
              </p>
              <p className="truncate text-xs text-muted">{p.sub}</p>
            </div>
            {p.who === "me" ? null : p.following ? (
              <span className="-mt-1 flex size-8 items-center justify-center rounded-md text-muted">
                <Icon d={icons.more} size={18} />
              </span>
            ) : (
              <span className="-mt-1 flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-link">
                <Icon d={icons.plus} size={14} /> Follow
              </span>
            )}
          </div>
          <p className="mt-2 text-pretty text-sm leading-relaxed">{p.body}</p>
          {p.image && <div className="mt-3 aspect-[2/1] rounded-md border border-border bg-cover bg-center" style={{ backgroundImage: `url(${p.image})` }} />}
        </div>
      </div>

      {likes > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <span className="flex">
            {["like", "celebrate"].map((k, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- tiny static sticker, same as ReactionSummary
              <img key={k} src={`/reactions/${k}.webp`} alt="" width={18} height={18} className={cn("rounded-full bg-background ring-2 ring-background", i > 0 && "-ml-1.5")} />
            ))}
          </span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={likes} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={spring.moderate} className="tabular-nums">
              {likes}
            </motion.span>
          </AnimatePresence>
        </div>
      )}

      <div className="mt-3 flex border-t border-border">
        <span className={cn(action, liked && "font-medium text-link")}>
          {liked ? (
            <motion.img src="/reactions/like.webp" alt="" width={18} height={18} initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring.slow} />
          ) : (
            <Icon d={icons.like} size={16} />
          )}
          Like
        </span>
        <span className={action}>
          <Icon d={icons.comment} size={16} /> Comment {p.comments > 0 && <span className="tabular-nums">{p.comments}</span>}
        </span>
        <span className={action}>
          <Icon d={icons.repost} size={16} /> Repost {p.reposts > 0 && <span className="tabular-nums">{p.reposts}</span>}
        </span>
        <span className={action}>
          <Icon d={icons.share} size={16} /> Share
        </span>
      </div>
    </motion.article>
  );
}

function RightRail({ notifs }: { notifs: Notif[] }) {
  return (
    <aside className="h-full w-[320px] shrink-0 space-y-4 px-5 py-4">
      <section className="overflow-hidden border border-border bg-background">
        <div className="aspect-[4/1] border-b border-border bg-[url(/landing/tile-profile.webp)] bg-cover bg-[50%_40%]" />
        <div className="px-4 pb-4">
          <div className="-mt-9 w-fit rounded-full border-4 border-background bg-background">
            <Face f={face.me} size={64} />
          </div>
          <h2 className="mt-2 text-sm font-medium leading-tight">James Carter</h2>
          <p className="mt-1 text-sm text-foreground/90">Full-stack engineer building hiring tools</p>
          <p className="mt-1 text-xs text-muted">London, United Kingdom</p>
        </div>
        <p className="flex items-center gap-3 border-t border-border px-4 py-3 text-sm font-medium">
          <span className="flex size-6 items-center justify-center rounded-md border border-border bg-background">
            <Logo size={16} faint={false} />
          </span>
          Hire Excellence
        </p>
        <ul className="border-t border-border py-2 text-sm">
          {([["Connections", "214"], ["Followers", "1,038"]] as const).map(([l, n]) => (
            <li key={l} className="flex items-center justify-between px-4 py-1.5">
              <span className="text-muted">{l}</span>
              <span className="font-medium tabular-nums text-link">{n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden border border-border bg-background">
        <div className="flex h-11 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-medium">Notifications</h2>
          <span className="text-xs text-link">See all</span>
        </div>
        <ul className="relative">
          <AnimatePresence initial={false} mode="popLayout">
            {notifs.map((n) => (
              <motion.li
                key={n.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={spring.slow}
                className="flex gap-2.5 border-b border-border bg-background px-4 py-3 last:border-b-0"
              >
                <span className="relative shrink-0 self-start">
                  <Face f={face[n.who]} size={32} />
                  <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border-2 border-background bg-surface-hover">
                    <Icon d={n.icon} size={8} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-xs leading-snug">
                    <span className="font-medium">{n.actor}</span> <span className="text-muted">{n.verb}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-muted">
                    {n.ago}
                    {n.unread && <span className="size-1.5 rounded-full bg-link" />}
                  </span>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>
    </aside>
  );
}
