import type { CSSProperties } from "react";
import s from "./screens.module.css";
import { CamVideo, Check, Dock, RoomHeader, cx, type ScreenProps } from "./shared";

/* AI interview, technical round: a system design sketch on the whiteboard (Doop frame vO2EeMuMhf) */

const BLUE = "#1971C2";

// Hand-drawn boxes and arrows, one path each so they can be stroke-drawn in order
const SKETCH: { d: string; stroke?: string; fill?: string; dash?: string }[] = [
  {
    d: "M142 302 C190 300 250 301 298 303 C300 330 299 352 297 381 C250 383 190 382 141 380 C139 352 140 330 142 302Z",
  },
  {
    d: "M402 302 C450 299 510 301 562 302 C564 330 563 355 561 381 C510 383 450 382 401 380 C400 350 401 330 402 302Z",
  },
  {
    d: "M672 182 C720 180 790 181 842 183 C843 210 842 235 841 261 C790 263 720 262 671 260 C670 235 671 210 672 182Z",
  },
  {
    d: "M672 422 C720 420 790 421 842 423 C843 450 842 475 841 501 C790 503 720 502 671 500 C670 475 671 450 672 422Z",
  },
  {
    d: "M902 177 C930 174 960 175 980 178 C1000 190 1004 250 980 266 C955 270 925 269 902 266 C880 250 880 190 902 177Z",
    stroke: BLUE,
  },
  {
    d: "M902 602 C940 600 990 601 1010 603 C1012 630 1011 655 1009 681 C990 683 940 682 901 680 C899 655 900 630 902 602Z",
  },
  {
    d: "M672 602 C720 600 790 601 842 603 C843 630 842 655 841 681 C790 683 720 682 671 680 C670 655 671 630 672 602Z",
    fill: "light-dark(#FFF3BF, #4A4224)",
  },
  { d: "M300 342 C330 340 370 343 398 341 M386 333 L399 341 L386 350" },
  { d: "M564 330 C600 300 630 240 668 224 M655 218 L669 223 L661 236" },
  { d: "M564 354 C600 380 630 440 668 460 M655 465 L669 461 L662 448" },
  { d: "M844 222 C860 221 880 222 898 222 M886 214 L899 222 L886 230" },
  { d: "M756 503 C757 540 756 570 757 598 M749 586 L757 599 L765 586" },
  { d: "M844 640 C860 641 880 640 898 641 M886 633 L899 641 L886 649" },
  { d: "M1012 640 C1050 600 1046 330 984 268 M992 281 L984 267 L978 282", stroke: BLUE, dash: "8 8" },
];

const LABELS: { text: string; style: CSSProperties }[] = [
  { text: "App", style: { left: 142, top: 324, width: 156 } },
  { text: "Load balancer", style: { left: 402, top: 324, width: 160 } },
  { text: "Feed service", style: { left: 672, top: 204, width: 170 } },
  { text: "Post service", style: { left: 672, top: 444, width: 170 } },
  { text: "Redis", style: { left: 890, top: 204, width: 100, color: BLUE } },
  { text: "Queue", style: { left: 672, top: 624, width: 170 } },
  { text: "Fan-out", style: { left: 902, top: 624, width: 108, fontSize: 24 } },
  {
    text: "push to timelines (skip celebs)",
    style: {
      left: 880,
      top: 420,
      width: 150,
      fontSize: 22,
      lineHeight: "26px",
      color: BLUE,
      textAlign: "left",
      transform: "rotate(-4deg)",
    },
  },
  {
    text: "celebs: pull on read and merge",
    style: {
      left: 150,
      top: 450,
      width: 300,
      fontSize: 24,
      lineHeight: "28px",
      textAlign: "left",
      transform: "rotate(-2deg)",
    },
  },
];

// Excalidraw-style toolbar; the rectangle tool is selected
const TOOLS = [
  "M7 11V5a2 2 0 0 1 4 0v5M11 10V4a2 2 0 0 1 4 0v6M15 10V6a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-3-5a2 2 0 0 1 3-2l1 1",
  "M5 3l14 8-6 2-2 6z",
  "rect",
  "M12 3l9 9-9 9-9-9z",
  "circle",
  "M4 20 20 4M20 4h-8M20 4v8",
  "M4 20 20 4",
  "M4 18c3-8 6 1 9-5s5-4 7-6",
  "M5 6h14M12 6v13",
  "M19 20H8l-4-4 10-10 7 7-6 7",
];

export function WhiteboardScreen({ active }: ScreenProps) {
  return (
    <div className={s.screen}>
      <RoomHeader round={2} timer="3:18" total="16:05" />
      <div className={s.room}>
        <Dock
          ai="Listening"
          aiDot="#8E8E87"
          cam={<CamVideo name="whiteboard" position="45% 40%" active={active} />}
          interviewer="Good. Now, what happens when someone with a million followers posts? Sketch it on the board."
          you="Fanning out to every follower is too expensive there, so for those accounts I'd merge their posts in at read time…"
        >
          <section className={cx(s.dockSection, s.brief)}>
            <h2>Design a news feed</h2>
            <p className={s.mute} style={{ lineHeight: "22px" }}>
              Users follow each other and see a reverse-chronological feed of posts from people they follow.
            </p>
            <ul className={s.briefList}>
              {["10M daily active users", "Feed loads in under 200 ms", "New posts appear within seconds"].map((r) => (
                <li key={r}>
                  <Check size={13} />
                  {r}
                </li>
              ))}
            </ul>
          </section>
        </Dock>
        <div className={s.board}>
          <svg
            className={s.sketch}
            width="1080"
            height="840"
            viewBox="0 0 1080 840"
            fill="none"
            stroke="light-dark(#1E1E1E, #E3E3E8)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* pathLength 1 so the story can draw any path with a 0..1 dash offset. The dashed arrow can't use its own
                dashes for that, so it's revealed through a solid copy in a mask */}
            <mask id="hero-fanout" maskUnits="userSpaceOnUse">
              <path
                data-anim="sketch-mask"
                d={SKETCH[SKETCH.length - 1].d}
                stroke="#fff"
                strokeWidth="6"
                pathLength={1}
              />
            </mask>
            {SKETCH.map((p, i) => (
              <path
                key={i}
                data-anim="sketch-path"
                d={p.d}
                stroke={p.stroke}
                fill={p.fill}
                pathLength={p.dash ? undefined : 1}
                strokeDasharray={p.dash}
                mask={p.dash ? "url(#hero-fanout)" : undefined}
              />
            ))}
          </svg>
          {LABELS.map((l) => (
            <div key={l.text} data-anim="sketch-label" className={s.lbl} style={l.style}>
              {l.text}
            </div>
          ))}
          <div className={s.ib} style={{ left: 16, top: 16, width: 36 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="light-dark(#1B1B1F, #E3E3E8)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </div>
          <div className={s.toolbar}>
            {TOOLS.map((t, i) => (
              <span key={i} data-anim="tool" className={cx(t === "rect" && s.toolOn)}>
                <svg viewBox="0 0 24 24">
                  {t === "rect" ? (
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  ) : t === "circle" ? (
                    <circle cx="12" cy="12" r="8" />
                  ) : (
                    <path d={t} />
                  )}
                </svg>
              </span>
            ))}
          </div>
          <div
            className={s.ib}
            style={{ left: 16, bottom: 16, width: 116, justifyContent: "space-around", fontSize: 13 }}
          >
            −<span>100%</span>+
          </div>
          <div className={s.ib} style={{ left: 144, bottom: 16, width: 72, justifyContent: "space-around" }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="light-dark(#1B1B1F, #E3E3E8)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
            </svg>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#B0B0B8"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
