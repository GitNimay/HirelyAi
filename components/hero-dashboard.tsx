"use client";

import { AnimatePresence, LayoutGroup, motion, MotionConfig, useInView } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { spring } from "@/lib/fluid-hover";
import { playLike, playPost } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { Logo } from "./auth";
import { Icon, icons, navItems } from "./ui";

/*
 * The landing hero's product shot: the Home dashboard (designed in Paper) as live markup, drawn at desktop size
 * (1440×900) and scaled to fit. It plays along: likes, follows, reposts and tabs work, a notification arrives
 * once it's on screen, the composer types a draft when clicked, and a post's reactions burst when you poke them.
 * Decorative for assistive tech (the hero copy says it all); nothing in it is a tab stop.
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

type Post = { id: string; who: keyof typeof face; name: string; sub: string; ago: string; body: string; likes: number; comments: number; reposts: number; following?: boolean };
const seed: Post[] = [
  { id: "p1", who: "priya", name: "Priya Sharma", sub: "Senior Product Designer at Razorpay", ago: "2h", likes: 48, comments: 12, reposts: 3, body: "We're hiring two product designers in Bengaluru to work on payments for small businesses. Hybrid, mid to senior level. If you love untangling messy flows into something calm, my DMs are open." },
  { id: "p2", who: "kavya", name: "Kavya Rao", sub: "Talent Partner at Freshworks", ago: "3h", likes: 73, comments: 8, reposts: 2, body: "Reminder for anyone interviewing this month: a short, specific story beats a long list of tools every single time." },
  { id: "p3", who: "arjun", name: "Arjun Mehta", sub: "Engineering Manager at Zerodha", ago: "5h", likes: 126, comments: 24, reposts: 9, following: true, body: "Six months into running our platform team. The biggest lesson so far: write the decision down before the meeting, not after. It cut our review cycles in half." },
];
const draft = "Just wrapped my first AI-screened interview round. Shortlist in a day, not a month.";

type Notif = { id: string; who: keyof typeof face; actor: string; verb: string; ago: string; icon: string; unread: boolean };
const seedNotifs: Notif[] = [
  { id: "n1", who: "priya", actor: "Priya Sharma and 4 others", verb: "reacted to your post", ago: "12m", icon: icons.like, unread: true },
  { id: "n2", who: "arjun", actor: "Arjun Mehta", verb: "commented on your post", ago: "1h", icon: icons.comment, unread: true },
  { id: "n3", who: "kavya", actor: "Kavya Rao", verb: "started following you", ago: "3h", icon: icons.plus, unread: false },
];
const arriving: Notif = { id: "n0", who: "meera", actor: "Meera Joshi", verb: "viewed your profile", ago: "now", icon: icons.search, unread: true };

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
  const seen = useInView(box, { once: true, amount: 0.4 });
  const [posts, setPosts] = useState(seed);
  const [tab, setTab] = useState<"for-you" | "following">("for-you");
  const [notifs, setNotifs] = useState(seedNotifs);

  // A notification lands a moment after the shot scrolls into view (once)
  useEffect(() => {
    if (!seen) return;
    const t = setTimeout(() => setNotifs((l) => [arriving, ...l].slice(0, 3)), 2600);
    return () => clearTimeout(t);
  }, [seen]);
  const unseen = notifs.filter((n) => n.unread).length + 1; // +1: one more unread than the panel shows, like the real badge

  const shown = tab === "following" ? posts.filter((p) => p.following) : posts;

  return (
    <div className="relative mt-12 flex aspect-[16/10] w-full items-center justify-center overflow-hidden border border-border bg-[url(/landing/hero-sky.webp)] bg-cover bg-center sm:mt-16 sm:aspect-[2/1]">
      <span className="sr-only">The Hire Excellence home feed: posts from your network, your profile, and your latest notifications.</span>
      <div ref={box} aria-hidden className="relative aspect-[16/10] w-[92%] select-none overflow-hidden border border-white/40 shadow-[0_24px_60px_rgb(0_0_0/0.35)] sm:w-[70%]">
        <MotionConfig reducedMotion="user">
          <motion.div
            className="absolute left-0 top-0 flex origin-top-left justify-center bg-background text-left text-foreground"
            style={{ width: W, height: H, scale: s }}
            initial={false}
            animate={{ opacity: s ? 1 : 0, y: s ? 0 : 12 }}
            transition={spring.slow}
          >
            <Sidebar unseen={unseen} />
            <main className="flex h-full w-[640px] shrink-0 flex-col overflow-hidden border-r border-border">
              <Tabs tab={tab} onTab={setTab} />
              <Composer onPost={(body) => setPosts((l) => [{ id: `me-${l.length}`, who: "me", name: "Nimesh Kulkarni", sub: "Full-stack engineer building hiring tools", ago: "now", body, likes: 0, comments: 0, reposts: 0, following: true }, ...l])} />
              <LayoutGroup>
                <AnimatePresence initial={false} mode="popLayout">
                  {shown.map((p) => (
                    <PostCard key={p.id} post={p} onFollow={() => setPosts((l) => l.map((q) => (q.id === p.id ? { ...q, following: true } : q)))} />
                  ))}
                </AnimatePresence>
              </LayoutGroup>
            </main>
            <RightRail notifs={notifs} onOpen={(id) => setNotifs((l) => l.map((n) => (n.id === id ? { ...n, unread: false } : n)))} />
          </motion.div>
        </MotionConfig>
      </div>
    </div>
  );
}

function Sidebar({ unseen }: { unseen: number }) {
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
                <motion.span key={unseen} initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={spring.slow} className="absolute -right-2.5 -top-2 h-[18px] min-w-[18px] rounded-full bg-danger px-1 text-center text-xs font-medium leading-[18px] tabular-nums text-background">
                  {unseen}
                </motion.span>
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
            <span className="block truncate text-sm font-medium">Nimesh Kulkarni</span>
            <span className="block truncate text-xs text-muted">ni•••••@gmail.com</span>
          </span>
          <Icon d="m18 15-6-6-6 6" size={16} className="text-muted" />
        </span>
      </div>
    </aside>
  );
}

function Tabs({ tab, onTab }: { tab: string; onTab: (t: "for-you" | "following") => void }) {
  return (
    <div className="flex h-14 shrink-0 border-b border-border">
      {(["for-you", "following"] as const).map((t) => (
        <button key={t} type="button" tabIndex={-1} onClick={() => onTab(t)} className={cn("flex flex-1 justify-center text-sm transition-colors hover:bg-surface", tab === t ? "font-medium text-foreground" : "text-muted")}>
          <span className="relative flex h-full items-center">
            {t === "for-you" ? "For you" : "Following"}
            {tab === t && <motion.span layoutId="hero-tab" transition={spring.moderate} className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-link" />}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Click the box: it types a draft. Post it and it lands at the top of the feed. */
function Composer({ onPost }: { onPost: (body: string) => void }) {
  const [typed, setTyped] = useState(-1); // -1: placeholder; then characters typed so far
  useEffect(() => {
    if (typed < 0 || typed >= draft.length) return;
    const t = setTimeout(() => setTyped((n) => n + 1), 28);
    return () => clearTimeout(t);
  }, [typed]);
  const ready = typed >= draft.length;

  return (
    <section className="flex shrink-0 gap-3 border-b border-border p-4">
      <Face f={face.me} size={40} />
      <div className="min-w-0 flex-1">
        <button type="button" tabIndex={-1} onClick={() => typed < 0 && setTyped(0)} className="block h-[54px] w-full cursor-text pt-2 text-left text-sm leading-relaxed">
          {typed < 0 ? (
            <span className="text-muted">Share an update or opportunity</span>
          ) : (
            <>
              {draft.slice(0, typed)}
              <span className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-foreground" />
            </>
          )}
        </button>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1 text-sm text-muted">
            {([[icons.photo, "Photo"], [icons.video, "Video"]] as const).map(([d, l]) => (
              <span key={l} className="flex h-8 items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-surface hover:text-foreground">
                <Icon d={d} size={16} /> {l}
              </span>
            ))}
          </div>
          <button
            type="button"
            tabIndex={-1}
            disabled={!ready}
            onClick={() => {
              playPost();
              onPost(draft);
              setTyped(-1);
            }}
            className="tx-primary flex h-8 items-center rounded-lg px-4 text-sm font-medium transition-[opacity,scale] active:scale-[0.97] disabled:opacity-50"
          >
            Post
          </button>
        </div>
      </div>
    </section>
  );
}

const reactionKinds = ["like", "celebrate", "love", "insightful", "support", "funny"];

function PostCard({ post: p, onFollow }: { post: Post; onFollow: () => void }) {
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [burst, setBurst] = useState(0); // easter egg: poke the reaction stack
  const likes = p.likes + (liked ? 1 : 0);
  const action = "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-sm text-muted transition-[background-color,color,scale] hover:bg-surface active:scale-[0.94]";

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
              <button type="button" tabIndex={-1} onClick={onFollow} className="-mt-1 flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-link transition-colors hover:bg-surface-hover">
                <Icon d={icons.plus} size={14} /> Follow
              </button>
            )}
          </div>
          <p className="mt-2 text-pretty text-sm leading-relaxed">{p.body}</p>
        </div>
      </div>

      {likes > 0 && (
        <button type="button" tabIndex={-1} onClick={() => setBurst((n) => n + 1)} className="relative mt-3 flex items-center gap-1.5 text-xs text-muted">
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
          {burst > 0 && <Burst key={burst} />}
        </button>
      )}

      <div className="mt-3 flex border-t border-border">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (!liked) playLike();
            setLiked(!liked);
          }}
          className={cn(action, liked ? "font-medium text-link" : "hover:text-foreground")}
        >
          {liked ? (
            <motion.img src="/reactions/like.webp" alt="" width={18} height={18} initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring.slow} />
          ) : (
            <Icon d={icons.like} size={16} />
          )}
          Like
        </button>
        <span className={cn(action, "hover:text-link")}>
          <Icon d={icons.comment} size={16} /> Comment {p.comments > 0 && <span className="tabular-nums">{p.comments}</span>}
        </span>
        <button type="button" tabIndex={-1} disabled={p.who === "me"} onClick={() => setReposted(!reposted)} className={cn(action, reposted ? "text-success" : "hover:text-success")}>
          <motion.span animate={{ rotate: reposted ? 180 : 0 }} transition={spring.slow} className="flex">
            <Icon d={icons.repost} size={16} />
          </motion.span>
          Repost {p.reposts + (reposted ? 1 : 0) > 0 && <span className="tabular-nums">{p.reposts + (reposted ? 1 : 0)}</span>}
        </button>
        <span className={cn(action, "hover:text-foreground")}>
          <Icon d={icons.share} size={16} /> Share
        </span>
      </div>
    </motion.article>
  );
}

/** A little fountain of reactions out of the stack. */
function Burst() {
  return (
    <span className="pointer-events-none absolute bottom-full left-2">
      {reactionKinds.map((k, i) => (
        <motion.img
          key={k}
          src={`/reactions/${k}.webp`}
          alt=""
          width={22}
          height={22}
          className="absolute left-0 top-0"
          initial={{ opacity: 1, x: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: 0, x: (i - 2.5) * 16, y: -70 - (i % 3) * 18, scale: 1.1, rotate: (i - 2.5) * 12 }}
          transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1], delay: i * 0.03 }}
        />
      ))}
    </span>
  );
}

function RightRail({ notifs, onOpen }: { notifs: Notif[]; onOpen: (id: string) => void }) {
  const [wave, setWave] = useState(0); // easter egg: say hi to yourself
  return (
    <aside className="h-full w-[320px] shrink-0 space-y-4 px-5 py-4">
      <section className="overflow-hidden border border-border bg-background">
        <div className="aspect-[4/1] border-b border-border bg-[url(/landing/tile-profile.webp)] bg-cover bg-[50%_40%]" />
        <div className="px-4 pb-4">
          <motion.button
            type="button"
            tabIndex={-1}
            onClick={() => setWave((n) => n + 1)}
            animate={wave ? { rotate: [0, -12, 10, -8, 6, 0] } : undefined}
            key={wave}
            transition={{ duration: 0.7 }}
            className="-mt-9 block w-fit origin-bottom rounded-full border-4 border-background bg-background"
          >
            <Face f={face.me} size={64} />
          </motion.button>
          <h2 className="mt-2 text-sm font-medium leading-tight">Nimesh Kulkarni</h2>
          <p className="mt-1 text-sm text-foreground/90">Full-stack engineer building hiring tools</p>
          <p className="mt-1 text-xs text-muted">Pune, Maharashtra, India</p>
        </div>
        <p className="flex items-center gap-3 border-t border-border px-4 py-3 text-sm font-medium">
          <span className="flex size-6 items-center justify-center rounded-md border border-border bg-background">
            <Logo size={16} faint={false} />
          </span>
          Hire Excellence
        </p>
        <ul className="border-t border-border py-2 text-sm">
          {([["Connections", "214"], ["Followers", "1,038"]] as const).map(([l, n]) => (
            <li key={l} className="flex items-center justify-between px-4 py-1.5 transition-colors hover:bg-surface">
              <span className="text-muted">{l}</span>
              <span className="font-medium tabular-nums text-link">{n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-border bg-background">
        <div className="flex h-11 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-medium">Notifications</h2>
          <span className="text-xs text-link">See all</span>
        </div>
        <ul>
          <AnimatePresence initial={false} mode="popLayout">
            {notifs.map((n) => (
              <motion.li
                key={n.id}
                layout
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: spring.moderate.exit }}
                transition={spring.slow}
                onClick={() => onOpen(n.id)}
                className="flex cursor-pointer gap-2.5 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-hover"
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
                    <AnimatePresence>{n.unread && <motion.span exit={{ scale: 0 }} transition={spring.moderate.exit} className="size-1.5 rounded-full bg-link" />}</AnimatePresence>
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
