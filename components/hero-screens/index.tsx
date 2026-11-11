"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CodingScreen } from "./coding";
import { DashboardScreen } from "./dashboard";
import { IntroScreen } from "./intro";
import { McqScreen } from "./mcq";
import { Cursor } from "./shared";
import s from "./screens.module.css";
import { STORIES, type Ctx, createCtx } from "./stories";
import { advance } from "./advance";
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

/* One Safari toolbar glyph: `box` is its [x, y, w, h] in the 1203×52 toolbar, drawn at half size */
const glyph = (box: [number, number, number, number], d: string) => (
  <svg
    viewBox={box.join(" ")}
    width={box[2] / 2}
    height={box[3] / 2}
    fill="#A3A3A3"
    aria-hidden
    className="block shrink-0"
  >
    <path d={d} />
  </svg>
);
const SIDEBAR = glyph(
  [96, 17, 21, 18],
  "M99.5703 33.6016H112.938C114.633 33.6016 115.516 32.7266 115.516 31.0547V21.5469C115.516 19.875 114.633 19 112.938 19H99.5703C97.8828 19 97 19.8672 97 21.5469V31.0547C97 32.7266 97.8828 33.6016 99.5703 33.6016ZM99.6719 32.0469C98.9531 32.0469 98.5547 31.6719 98.5547 30.9141V21.6875C98.5547 20.9297 98.9531 20.5547 99.6719 20.5547H103.234V32.0469H99.6719ZM112.836 20.5547C113.555 20.5547 113.953 20.9297 113.953 21.6875V30.9141C113.953 31.6719 113.555 32.0469 112.836 32.0469H104.711V20.5547H112.836Z",
);
const BACK = glyph(
  [136, 18, 11, 16],
  "M143.914 32.5938C144.094 32.7656 144.312 32.8594 144.562 32.8594C145.086 32.8594 145.492 32.4531 145.492 31.9375C145.492 31.6797 145.391 31.4453 145.211 31.2656L139.742 25.9219L145.211 20.5938C145.391 20.4141 145.492 20.1719 145.492 19.9219C145.492 19.4062 145.086 19 144.562 19C144.312 19 144.094 19.0938 143.922 19.2656L137.844 25.2031C137.625 25.4062 137.516 25.6562 137.516 25.9297C137.516 26.2031 137.625 26.4375 137.836 26.6484L143.914 32.5938Z",
);
const FORWARD = glyph(
  [166, 18, 11, 16],
  "M168.422 32.8594C168.68 32.8594 168.891 32.7656 169.07 32.5938L175.148 26.6562C175.359 26.4375 175.469 26.2109 175.469 25.9297C175.469 25.6562 175.367 25.4141 175.148 25.2109L169.07 19.2656C168.891 19.0938 168.68 19 168.422 19C167.898 19 167.492 19.4062 167.492 19.9219C167.492 20.1719 167.602 20.4141 167.773 20.5938L173.25 25.9375L167.773 31.2656C167.594 31.4531 167.492 31.6797 167.492 31.9375C167.492 32.4531 167.898 32.8594 168.422 32.8594Z",
);
const SHIELD = glyph(
  [258, 17, 15, 18],
  "M265.5 33.8984C265.641 33.8984 265.852 33.8516 266.047 33.7422C270.547 31.2969 272.109 30.1641 272.109 27.3203V21.4219C272.109 20.4844 271.742 20.1484 270.961 19.8125C270.094 19.4453 267.18 18.4297 266.328 18.1406C266.07 18.0547 265.766 18 265.5 18C265.234 18 264.93 18.0703 264.672 18.1406C263.82 18.3828 260.906 19.4531 260.039 19.8125C259.258 20.1406 258.891 20.4844 258.891 21.4219V27.3203C258.891 30.1641 260.461 31.2812 264.945 33.7422C265.148 33.8516 265.359 33.8984 265.5 33.8984ZM265.922 19.5781C266.945 19.9766 269.172 20.7656 270.344 21.1875C270.562 21.2656 270.617 21.3828 270.617 21.6641V27.0234C270.617 29.3125 269.469 29.9375 265.945 32.0625C265.727 32.1875 265.617 32.2344 265.508 32.2344V19.4844C265.617 19.4844 265.734 19.5156 265.922 19.5781Z",
);
const LOCK = glyph(
  [564, 18, 11, 15],
  "M566.269 32.0852H572.426C573.277 32.0852 573.696 31.6663 573.696 30.7395V25.9851C573.696 25.1472 573.353 24.7219 572.642 24.6521V23.0842C572.642 20.6721 571.036 19.5105 569.348 19.5105C567.659 19.5105 566.053 20.6721 566.053 23.0842V24.6711C565.393 24.7727 565 25.1917 565 25.9851V30.7395C565 31.6663 565.418 32.0852 566.269 32.0852ZM567.272 22.97C567.272 21.491 568.211 20.6785 569.348 20.6785C570.478 20.6785 571.423 21.491 571.423 22.97V24.6394L567.272 24.6458V22.97Z",
);
const REFRESH = glyph(
  [929, 16, 15, 19],
  "M936.273 24.9766C936.5 24.9766 936.68 24.9062 936.82 24.7578L940.023 21.5312C940.195 21.3594 940.273 21.1719 940.273 20.9531C940.273 20.7422 940.188 20.5391 940.023 20.3828L936.82 17.125C936.68 16.9688 936.5 16.8906 936.273 16.8906C935.852 16.8906 935.516 17.2422 935.516 17.6719C935.516 17.8828 935.594 18.0547 935.727 18.2031L937.594 20.0312C937.227 19.9766 936.852 19.9453 936.477 19.9453C932.609 19.9453 929.516 23.0391 929.516 26.9141C929.516 30.7891 932.633 33.9062 936.5 33.9062C940.375 33.9062 943.484 30.7891 943.484 26.9141C943.484 26.4453 943.156 26.1094 942.688 26.1094C942.234 26.1094 941.93 26.4453 941.93 26.9141C941.93 29.9297 939.516 32.3516 936.5 32.3516C933.492 32.3516 931.07 29.9297 931.07 26.9141C931.07 23.875 933.469 21.4688 936.477 21.4688C936.984 21.4688 937.453 21.5078 937.867 21.5781L935.734 23.6875C935.594 23.8281 935.516 24 935.516 24.2109C935.516 24.6406 935.852 24.9766 936.273 24.9766Z",
);
const SHARE = glyph(
  [1091, 16, 17, 19],
  "M1099.51 28.4141C1099.91 28.4141 1100.24 28.0859 1100.24 27.6953V19.8359L1100.18 18.6797L1100.66 19.25L1101.75 20.4141C1101.88 20.5547 1102.06 20.625 1102.24 20.625C1102.6 20.625 1102.9 20.3672 1102.9 20C1102.9 19.8047 1102.82 19.6641 1102.69 19.5312L1100.06 17.0078C1099.88 16.8203 1099.7 16.7578 1099.51 16.7578C1099.32 16.7578 1099.14 16.8203 1098.95 17.0078L1096.33 19.5312C1096.2 19.6641 1096.12 19.8047 1096.12 20C1096.12 20.3672 1096.41 20.625 1096.77 20.625C1096.95 20.625 1097.14 20.5547 1097.27 20.4141L1098.35 19.25L1098.84 18.6719L1098.78 19.8359V27.6953C1098.78 28.0859 1099.11 28.4141 1099.51 28.4141ZM1095 34.6562H1104C1105.7 34.6562 1106.57 33.7812 1106.57 32.1094V24.4297C1106.57 22.7578 1105.7 21.8828 1104 21.8828H1101.89V23.4375H1103.9C1104.61 23.4375 1105.02 23.8125 1105.02 24.5625V31.9688C1105.02 32.7188 1104.61 33.0938 1103.9 33.0938H1095.1C1094.38 33.0938 1093.98 32.7188 1093.98 31.9688V24.5625C1093.98 23.8125 1094.38 23.4375 1095.1 23.4375H1097.13V21.8828H1095C1093.31 21.8828 1092.43 22.75 1092.43 24.4297V32.1094C1092.43 33.7812 1093.31 34.6562 1095 34.6562Z",
);
const PLUS = glyph(
  [1126, 18, 16, 16],
  "M1134 33.0156C1134.49 33.0156 1134.89 32.6094 1134.89 32.1484V27.2578H1139.66C1140.13 27.2578 1140.54 26.8594 1140.54 26.3672C1140.54 25.8828 1140.13 25.4766 1139.66 25.4766H1134.89V20.5859C1134.89 20.1172 1134.49 19.7188 1134 19.7188C1133.52 19.7188 1133.11 20.1172 1133.11 20.5859V25.4766H1128.34C1127.88 25.4766 1127.46 25.8828 1127.46 26.3672C1127.46 26.8594 1127.88 27.2578 1128.34 27.2578H1133.11V32.1484C1133.11 32.6094 1133.52 33.0156 1134 33.0156Z",
);
const TABS = glyph(
  [1158, 17, 20, 19],
  "M1161.8 31.0703H1163.23V32.375C1163.23 34.0547 1164.12 34.9219 1165.81 34.9219H1174.2C1175.89 34.9219 1176.77 34.0547 1176.77 32.3828V24.0469C1176.77 22.375 1175.89 21.5 1174.2 21.5H1172.77V20.2578C1172.77 18.5859 1171.88 17.7109 1170.19 17.7109H1161.8C1160.1 17.7109 1159.23 18.5781 1159.23 20.2578V28.5234C1159.23 30.1953 1160.1 31.0703 1161.8 31.0703ZM1161.9 29.5078C1161.18 29.5078 1160.78 29.1328 1160.78 28.3828V20.3984C1160.78 19.6406 1161.18 19.2656 1161.9 19.2656H1170.09C1170.8 19.2656 1171.2 19.6406 1171.2 20.3984V21.5H1165.81C1164.12 21.5 1163.23 22.375 1163.23 24.0469V29.5078H1161.9ZM1165.91 33.3672C1165.19 33.3672 1164.8 32.9922 1164.8 32.2422V24.1875C1164.8 23.4297 1165.19 23.0625 1165.91 23.0625H1174.1C1174.81 23.0625 1175.21 23.4297 1175.21 24.1875V32.2422C1175.21 32.9922 1174.81 33.3672 1174.1 33.3672H1165.91Z",
);

const noop = () => () => {};

export function HeroScreens() {
  const [at, setAt] = useState(0);
  // Bumped by pager clicks, so clicking the current dash replays its story
  const [replay, setReplay] = useState(0);
  // The story's one-liner, announced only when the visitor picks a slide
  const [said, setSaid] = useState("");
  // Reduced motion: each slide jumps to its story's end state, and the slideshow waits for the pager
  const reduced = useReducedMotion();
  // False on the server and during hydration, true after. The pager fill waits for it: the server can't know the
  // motion preference, and hydration keeps the server's className, so the first slide's dash would stay full.
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const [away, setAway] = useState(false);
  const paused = away;
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
      const next = advance(at, SCREENS.length, { alive: c.alive, reduced: !!reduced });
      if (next !== null) setAt(next);
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
        {/* Glass frame: a faint smoked pane on the dark clouds, the frosted white one on the light clouds */}
        <div className="w-[89.7%] rounded-[17px] border border-white/15 bg-white/[0.06] p-[7px] shadow-[0_24px_60px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.18)] backdrop-blur-[14px] light:border-white/65 light:bg-white/28 light:shadow-[0_24px_60px_rgba(20,60,80,.28),inset_0_1px_0_rgba(255,255,255,.7)]">
          <div className="overflow-hidden rounded-[10px] border border-[#404040] bg-background shadow-[0_1px_2px_rgba(0,0,0,.08)] light:border-[#E5E5E5]">
            {/* Safari-style toolbar (after Magic UI's Safari mockup, MIT): icons are its paths at half scale */}
            <div className="flex h-[26px] items-center border-b border-[#404040] bg-[#262626] px-2.5 light:border-[#E5E5E5] light:bg-white">
              <div className="flex flex-1 items-center gap-[4px]">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-[6px] shrink-0 rounded-full bg-[#404040] light:bg-[#E5E5E5]" />
                ))}
                <span className="ml-3 flex items-center gap-2.5 max-sm:hidden">
                  {SIDEBAR}
                  {BACK}
                  {FORWARD}
                </span>
              </div>
              <div className="flex w-[55%] items-center gap-1.5">
                <span className="max-sm:hidden">{SHIELD}</span>
                <span className="flex h-[15px] min-w-0 flex-1 items-center justify-center gap-1 rounded-[3px] bg-[#404040] px-2 light:bg-[#E5E5E5]">
                  {LOCK}
                  <span className="truncate text-[8px] leading-none text-[#A3A3A3]">
                    hire-excellence.n1m35h.in/{SCREENS[at].path}
                  </span>
                </span>
                <span className="max-sm:hidden">{REFRESH}</span>
              </div>
              <div className="flex flex-1 items-center justify-end gap-3 max-sm:hidden">
                {SHARE}
                {PLUS}
                {TABS}
              </div>
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
                    <div data-camera className="absolute inset-0 origin-top-left will-change-transform">
                      <Screen active={i === at} />
                      <Cursor />
                    </div>
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
                  key={`${at}-${replay}-${hydrated}`}
                  className={`absolute inset-y-0 left-0 bg-foreground ${hydrated && reduced === false ? "animate-[hero-fill_4s_linear_forwards]" : "w-full"}`}
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
