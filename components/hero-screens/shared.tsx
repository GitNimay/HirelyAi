"use client";

import { useReducedMotion } from "motion/react";
import { LogoMark } from "../hero-logo";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import s from "./screens.module.css";

/* Bits shared by the hero screens: icons, the interview room header and tiles, the candidate flow frame */

export type ScreenProps = { active: boolean };

export const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Check({ size = 12, width = 2.5 }: { size?: number; width?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--success)"
      strokeWidth={width}
      strokeLinecap="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function Cross({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--danger)"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function Mic({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--foreground)"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </svg>
  );
}

/** The brand mark, still: the landing illustrations don't animate it */
export const Logo = ({ size = 20 }: { size?: number }) => <LogoMark size={size} padded={false} still />;

/** The app's interviewer orb. Paused until its slide's story starts; stories set its state with an "orb" event
    (see stories.ts), so only the orb re-renders. Follows the page theme, like the real interview room */
export function Orb({ state, className, scale }: { state: OrbState; className: string; scale: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [orb, setOrb] = useState({ state, paused: true });
  useEffect(() => {
    const el = ref.current;
    const on = (e: Event) => setOrb((o) => ({ ...o, ...(e as CustomEvent<Partial<typeof o>>).detail }));
    el?.addEventListener("orb", on);
    return () => el?.removeEventListener("orb", on);
  }, []);
  return (
    <div ref={ref} data-anim="orb" className={className} aria-hidden>
      <ThinkingOrb state={orb.state} paused={orb.paused} size={64} className={scale} />
    </div>
  );
}

const ROUNDS = ["Intro", "Deep dive", "Technical", "Coding", "Wrap-up"];

/** The interview room's top bar: company, the five rounds (done ones ticked), recording and timers */
export function RoomHeader({ round, timer, total }: { round: number; timer: string; total: string }) {
  return (
    <header className={s.roomHeader}>
      <div className={s.side}>
        <Logo />
        <span className={s.medium}>Northwind Labs</span>
      </div>
      <ol className={s.rounds}>
        {ROUNDS.map((r, i) => (
          <Fragment key={r}>
            {i > 0 && <li className={s.line} aria-hidden />}
            <li data-anim="round" className={cx(s.round, i === round && s.roundOn, i < round && s.roundDone)}>
              <span className={s.mark}>
                <span className={s.dot} />
                <Check />
              </span>
              {r}
            </li>
          </Fragment>
        ))}
      </ol>
      <div className={cx(s.side, s.sideR)}>
        <span data-anim="rec" className={s.rec}>
          <span className={s.recDot} />
          REC
        </span>
        <span data-anim="timer" className={s.mute}>
          {ROUNDS[round]} {timer}
        </span>
        <span className={s.mute}>Total {total}</span>
        <span className={s.endBtn}>End interview</span>
      </div>
    </header>
  );
}

/** Looping stock clip of the candidate. Fetched only once its slide is shown, and played only while it is */
export function CamVideo({ name, position, active }: { name: string; position: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const play = active && reduced === false;
  // src is set here rather than as a prop: the server renders none, and hydration wouldn't patch one in
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!play) return v.pause();
    if (!v.getAttribute("src")) v.src = `/landing/hero-cam-${name}.mp4`;
    v.play().catch(() => {});
  }, [play, name]);
  return (
    <video
      ref={ref}
      data-anim="camera"
      poster={`/landing/hero-cam-${name}.webp`}
      muted
      loop
      playsInline
      preload="none"
      className={s.video}
      style={{ objectPosition: position }}
    />
  );
}

type Tiles = { ai: string; aiDot: string; speaking?: boolean; cam: ReactNode };

/** The interviewer tile and the candidate's camera tile; `big` for the intro stage, small in the side dock */
export function AiTile({
  big,
  label,
  dot,
  speaking,
}: {
  big?: boolean;
  label: string;
  dot: string;
  speaking?: boolean;
}) {
  return (
    <div className={cx(s.tile, s.aiTile, big ? s.bigTile : s.smallTile)}>
      <Orb
        state={speaking ? "composing" : "listening"}
        className="absolute inset-0 flex items-center justify-center pb-[12%]"
        scale={big ? "scale-[1.75]" : "scale-[0.62]"}
      />
      <span data-anim="ai-status" className={s.pill}>
        <span className={s.pillDot} style={{ background: dot }} />
        <span>{label}</span>
      </span>
    </div>
  );
}

export function CamTile({ big, children }: { big?: boolean; children: ReactNode }) {
  return (
    <div className={cx(s.tile, s.cam, big ? s.bigTile : s.smallTile)}>
      {children}
      <span className={cx(s.pill, s.you)}>You</span>
      <span className={s.mic}>
        <Mic size={big ? 15 : 13} />
      </span>
    </div>
  );
}

/** Left dock of the whiteboard and coding rounds: tiles, the live captions, then a round-specific section */
export function Dock({
  ai,
  aiDot,
  speaking,
  cam,
  interviewer,
  you,
  children,
}: Tiles & { interviewer: string; you: string; children: ReactNode }) {
  return (
    <aside className={s.dock}>
      <div className={s.dockTiles}>
        <AiTile label={ai} dot={aiDot} speaking={speaking} />
        <CamTile>{cam}</CamTile>
      </div>
      <div className={s.dockCaps}>
        <div data-anim="caption">
          <span className={s.capLabel}>Interviewer</span>
          <p>{interviewer}</p>
        </div>
        <div data-anim="caption">
          <span className={s.capLabel}>You</span>
          <p>{you}</p>
        </div>
      </div>
      {children}
    </aside>
  );
}

/** The candidate flow's page: brand bar, then title / card / steps columns between dashed rules */
export function StepFrame({ title, steps, children }: { title: string; steps: string[]; children: ReactNode }) {
  return (
    <>
      <header className={s.appHeader}>
        <div className={s.brand}>
          <Logo />
          Hire Excellence
        </div>
        <div className={s.headerActs}>
          <span className={s.mute}>Northwind Labs</span>
          <span className={s.toggle}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9" />
            </svg>
          </span>
        </div>
      </header>
      <div className={s.frame}>
        <div className={s.frameTitle}>{title}</div>
        <div className={s.frameMain}>{children}</div>
        <ol className={s.steps}>
          {steps.map((step, i) => {
            const on = i === steps.length - 1;
            return (
              <li key={step} data-anim="step" className={cx(on && s.stepOn)}>
                {on ? <span className={s.stepDot} /> : <Check size={14} width={2} />}
                {step}
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
/** The stories' fake pointer: a macOS-style arrow plus a click ripple, in the slide's 1440x900 design space */
export function Cursor() {
  return (
    <div className={s.layer} aria-hidden>
      <div data-cursor className={s.cursor}>
        <span data-ripple className={s.ripple} />
        <svg width="30" height="40" viewBox="0 0 24 32">
          <path
            d="M2 2v22l5.5-5.5 4 9 3.5-1.5-4-9h7.5z"
            fill="#0A0A0A"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
