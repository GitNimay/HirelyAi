"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CodingScreen } from "./coding";
import { DashboardScreen } from "./dashboard";
import { IntroScreen } from "./intro";
import { McqScreen } from "./mcq";
import { Cursor } from "./shared";
import s from "./screens.module.css";
import { STORIES, type Ctx, createCtx } from "./stories";
import { VoiceScreen } from "./voice";
import { WhiteboardScreen } from "./whiteboard";

/* The hero's product window: the six app screens (Doop canvas P3ODZaq3jh) sliding past every few seconds.
   Real components rather than screenshots, so their parts (data-anim) can be animated. */

const SCREENS = [
  {
    id: "intro",
    path: "interview",
    Screen: IntroScreen,
    alt: "AI interview, intro round: the interviewer and the candidate's camera side by side",
  },
  {
    id: "whiteboard",
    path: "interview",
    Screen: WhiteboardScreen,
    alt: "AI interview, technical round: a system design sketch on the whiteboard",
  },
  {
    id: "coding",
    path: "interview",
    Screen: CodingScreen,
    alt: "AI interview, coding round: the problem, a code editor and test results",
  },
  {
    id: "voice",
    path: "interview",
    Screen: VoiceScreen,
    alt: "Voice interview: the live call with the interviewer's question",
  },
  { id: "mcq", path: "interview", Screen: McqScreen, alt: "MCQ test: question 4 of 15 with an answer selected" },
  {
    id: "dashboard",
    path: "dashboard",
    Screen: DashboardScreen,
    alt: "Dashboard: the feed, your profile and notifications",
  },
];

export function HeroScreens() {
  const [at, setAt] = useState(0);
  // Bumped by pager clicks, so clicking the current dash replays its story
  const [replay, setReplay] = useState(0);
  // The story's one-liner, announced only when the visitor picks a slide
  const [said, setSaid] = useState("");
  // Reduced motion: each slide jumps to its story's end state, and the slideshow waits for the pager
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [away, setAway] = useState(false);
  const paused = hover || away;
  const pausedRef = useRef(paused);
  const story = STORIES[SCREENS[at].id];

  // Screens are laid out at 1440x900 and scaled to the slide width. CSS does this itself where it can divide
  // lengths (see screens.module.css); --s covers the other browsers.
  const view = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => el.style.setProperty("--s", String(e.contentRect.width / 1440)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Paused while scrolled off-screen or in a background tab
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let off = false;
    const sync = () => setAway(off || document.hidden);
    const io = new IntersectionObserver(([e]) => {
      off = !e.isIntersecting;
      sync();
    });
    if (root.current) io.observe(root.current);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // Play the active slide's story (after mount, so first paint is the server's), then move on when it ends
  const ctx = useRef<Ctx | null>(null);
  useEffect(() => {
    const slide = view.current?.querySelector<HTMLElement>(`[data-screen="${SCREENS[at].id}"]`);
    if (reduced === null || !slide) return;
    const c = createCtx(slide, reduced);
    ctx.current = c;
    if (pausedRef.current) c.pause();
    const { run, duration } = STORIES[SCREENS[at].id];
    void Promise.all([run(c), c.wait(duration)]).then(() => {
      if (c.alive && !reduced) setAt((i) => (i + 1) % SCREENS.length);
    });
    return () => c.cancel();
  }, [at, replay, reduced]);
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) ctx.current?.pause();
    else ctx.current?.resume();
  }, [paused]);

  return (
    <div
      ref={root}
      className="flex w-full flex-col items-end gap-[clamp(18px,1.8vw,30px)] lg:max-w-[clamp(520px,46vw,880px)]"
    >
      {/* Dark clouds by default; the light image returns under the same conditions as the light: variant in globals.css */}
      <div className="flex aspect-[660/480] w-full items-center justify-center overflow-hidden bg-[url(/landing/hero-clouds-dark.webp)] bg-cover bg-center light:bg-[url(/landing/hero-clouds.webp)]">
        <div
          onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
          onPointerLeave={() => setHover(false)}
          className="w-[89.7%] border border-white/65 bg-white/28 p-[7px] shadow-[0_24px_60px_rgba(20,60,80,.28),inset_0_1px_0_rgba(255,255,255,.7)] backdrop-blur-[14px]"
        >
          <div className="overflow-hidden bg-[#F7F7F4] shadow-[0_1px_2px_rgba(0,0,0,.08)]">
            <div className="flex h-[26px] items-center gap-1.5 border-b border-[#E4E4DE] bg-white px-2.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2 shrink-0 rounded-full bg-[#E4E4DE]" />
              ))}
              <span className="mx-auto min-w-0 truncate rounded-none bg-[#F2F2EE] px-3 text-[10px] leading-[14px] text-[#65655F] sm:px-10">
                hire-excellence.n1m35h.in/{SCREENS[at].path}
              </span>
            </div>
            <div ref={view} className="overflow-hidden">
              <div
                className="flex transition-transform duration-700 ease-[cubic-bezier(.65,0,.35,1)] motion-reduce:transition-none"
                style={{ transform: `translateX(-${at * 100}%)` }}
              >
                {SCREENS.map(({ id, Screen, alt }, i) => (
                  // Decorative previews: announced as one image each, nothing inside is focusable
                  <div
                    key={id}
                    data-screen={id}
                    role="img"
                    aria-label={alt}
                    aria-hidden={i !== at}
                    inert
                    className={`${s.fit} w-full shrink-0 ${i === at ? "motion-reduce:animate-[hero-fade_.4s_ease-out]" : ""}`}
                  >
                    <Screen active={i === at} />
                    <Cursor />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2" role="tablist" aria-label="App screens" data-anim="pager">
        {SCREENS.map((sc, i) => (
          <button
            key={sc.id}
            type="button"
            role="tab"
            aria-selected={i === at}
            aria-label={sc.alt}
            onClick={() => {
              setAt(i);
              setReplay((n) => n + 1);
              setSaid(STORIES[sc.id].say);
            }}
            className="group flex h-4 items-center"
          >
            <span
              className={`relative block h-[3px] overflow-hidden rounded-sm bg-foreground/15 transition-[width] duration-500 group-hover:bg-foreground/30 ${i === at ? "w-[84px]" : "w-[30px]"}`}
            >
              {i === at && (
                <span
                  key={`${at}-${replay}`}
                  className={`absolute inset-y-0 left-0 bg-foreground ${reduced === false ? "animate-[hero-fill_4s_linear_forwards]" : "w-full"}`}
                  style={{ animationDuration: `${story.duration}s`, animationPlayState: paused ? "paused" : "running" }}
                />
              )}
            </span>
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
