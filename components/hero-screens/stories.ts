import { animate } from "motion/mini";
import type { OrbState } from "thinking-orbs";
import s from "./screens.module.css";

/* The hero's product walkthrough: one scripted story per slide, run against the slide's DOM (the data-anim hooks).
   Every story starts by setting each property it animates, so loops and pager jumps always replay the same way.
   Timings are in seconds; copy and timings live in the stories below. */

type El = HTMLElement | SVGElement;
type Els = El | El[] | null | undefined;
type Keyframes = Record<string, string | number | (string | number)[]>;
type Opts = { duration?: number; delay?: number; ease?: string | number[] };
type Live = { pause(): void; play(): void; stop(): void };

const MOVE: number[] = [0.65, 0, 0.35, 1];
const GREEN = "var(--success)";
const GREY = "#8E8E87";
const INK = "var(--foreground)";
const MUTE = "var(--muted)";
const RED = "var(--danger)";
const CURSOR_HOME = { x: 1240, y: 820 };

const never = () => new Promise<void>(() => {});
const list = (t: Els) => (t ? (Array.isArray(t) ? t : [t]) : []);

export type Ctx = ReturnType<typeof createCtx>;

/** Runs one story on a slide. `instant` (reduced motion) jumps every step to its end: no movement, final state.
    After cancel() nothing resolves any more, so the story just stops where it is. */
export function createCtx(slide: HTMLElement, instant: boolean) {
  const live = new Set<Live>();
  let alive = true;
  let paused = false;

  const track = (a: Live, done: (end: () => void) => void) =>
    new Promise<void>((res) => {
      live.add(a);
      if (paused) a.pause();
      done(() => {
        live.delete(a);
        if (alive) res();
      });
    });

  const set = (t: Els, style: Record<string, string>) => list(t).forEach((el) => Object.assign(el.style, style));

  const to = (t: Els, kf: Keyframes, o: Opts = {}): Promise<void> => {
    const els = list(t);
    if (!alive) return never();
    if (instant || !els.length) {
      const end: Record<string, string> = {};
      for (const k in kf) end[k] = String([kf[k]].flat().at(-1));
      set(els, end);
      return Promise.resolve();
    }
    // ponytail: motion/mini's ease typing wants a tuple or a name; plain arrays work at runtime
    const a = animate(els, kf, { duration: 0.3, ease: "easeOut", ...o } as Parameters<typeof animate>[2]);
    return track(a, (end) => a.then(end));
  };

  /** A pausable timer */
  const wait = (sec: number): Promise<void> => {
    if (!alive) return never();
    if (instant) return Promise.resolve();
    let left = sec * 1000;
    let start = 0;
    let id: number | undefined;
    let fire = () => {};
    const t: Live = {
      play() {
        if (id !== undefined) return;
        start = performance.now();
        id = window.setTimeout(fire, left);
      },
      pause() {
        if (id === undefined) return;
        clearTimeout(id);
        id = undefined;
        left -= performance.now() - start;
      },
      stop: () => clearTimeout(id),
    };
    return track(t, (end) => {
      fire = end;
      if (!paused) t.play();
    });
  };

  const text = (el: Element | null | undefined, str: string) => {
    if (el) el.textContent = str;
  };
  /** Types a line word by word */
  const type = async (el: Element | null | undefined, str: string, perWord = 0.1) => {
    const words = str.split(" ");
    if (instant) return text(el, str);
    for (let i = 1; i <= words.length; i++) {
      text(el, words.slice(0, i).join(" "));
      await wait(perWord);
    }
  };

  const orbs = () => slide.querySelectorAll('[data-anim="orb"]');
  const orbSay = (detail: { state?: OrbState; paused?: boolean }) =>
    orbs().forEach((el) => el.dispatchEvent(new CustomEvent("orb", { detail })));

  // The fake cursor, positioned in the 1440x900 design space of the layer it sits in
  const cursor = slide.querySelector<HTMLElement>("[data-cursor]");
  const arrow = cursor?.querySelector("svg") ?? null;
  const ripple = cursor?.querySelector<HTMLElement>("[data-ripple]") ?? null;
  let at = { ...CURSOR_HOME };
  const place = (p: { x: number; y: number }) => `translate(${p.x}px, ${p.y}px)`;
  const point = (el: Element, [fx, fy]: number[]) => {
    const layer = cursor!.parentElement!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const k = layer.width / 1440 || 1;
    return { x: (r.left - layer.left + r.width * fx) / k, y: (r.top - layer.top + r.height * fy) / k };
  };
  const pointer = {
    show: () => (instant ? Promise.resolve() : to(cursor, { opacity: [0, 1] }, { duration: 0.2 })),
    hide: () => to(cursor, { opacity: 0 }, { duration: 0.2 }),
    /** Glides to a spot on `el`, given as fractions of its box (centre by default) */
    move: (el: Element | null | undefined, { pos = [0.5, 0.5], duration = 0.6 } = {}) => {
      if (instant || !el || !cursor) return Promise.resolve();
      const from = at;
      at = point(el, pos);
      return to(cursor, { transform: [place(from), place(at)] }, { duration, ease: MOVE });
    },
    click: async () => {
      if (instant) return;
      void to(arrow, { transform: ["scale(1)", "scale(0.85)", "scale(1)"] }, { duration: 0.25 });
      void to(ripple, { transform: ["scale(0.3)", "scale(1.4)"], opacity: [0.6, 0] }, { duration: 0.3 });
      await wait(0.12);
    },
  };

  // Clean slate: cursor home and hidden, orb running
  set(cursor, { opacity: "0", transform: place(at) });
  set(arrow, { transform: "" });
  set(ripple, { opacity: "0" });
  orbSay({ paused: false });

  return {
    q: (name: string) => [...slide.querySelectorAll<HTMLElement>(`[data-anim="${name}"]`)],
    set,
    to,
    wait,
    text,
    type,
    cursor: pointer,
    orb: (state: OrbState) => orbSay({ state }),
    get alive() {
      return alive;
    },
    pause() {
      paused = true;
      live.forEach((a) => a.pause());
      orbSay({ paused: true });
    },
    resume() {
      paused = false;
      live.forEach((a) => a.play());
      orbSay({ paused: false });
    },
    cancel() {
      alive = false;
      live.forEach((a) => a.stop());
      live.clear();
      orbSay({ paused: true });
    },
  };
}

/** The interviewer pill on a tile: its dot and its label */
function status(c: Ctx) {
  const [pill] = c.q("ai-status");
  const dot = pill?.firstElementChild as HTMLElement | null;
  const label = pill?.lastElementChild;
  return (speaking: boolean, str: string) => {
    c.orb(speaking ? "composing" : "listening");
    c.text(label, str);
    if (dot) void c.to(dot, { backgroundColor: speaking ? GREEN : GREY }, { duration: 0.25 });
  };
}

/** Counts a m:ss timer down once a second */
async function tick(c: Ctx, el: Element | undefined, from: number, steps: number, suffix = "") {
  const fmt = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}${suffix}`;
  c.text(el, fmt(from));
  for (let i = 1; i <= steps; i++) {
    await c.wait(1);
    c.text(el, fmt(from - i));
  }
}

const cap = (el: HTMLElement | undefined) => el?.querySelector("p") ?? el;

type Story = { say: string; duration: number; run: (c: Ctx) => Promise<void> };

export const STORIES: Record<string, Story> = {
  intro: {
    say: "An AI interviews every applicant",
    duration: 7,
    async run(c) {
      const say = status(c);
      const [ai, you] = c.q("caption").map(cap);
      const rounds = c.q("round");
      const [timer] = c.q("timer");
      const roundAt = (n: number) =>
        rounds.forEach((li, i) => {
          li.classList.toggle(s.roundOn, i === n);
          li.classList.toggle(s.roundDone, i < n);
        });

      say(true, "Interviewer · Speaking");
      c.text(ai, "");
      c.text(you, "");
      c.set(you, { color: MUTE });
      roundAt(0);
      c.text(timer, "Intro 1:42");

      await c.wait(0.4);
      await c.type(
        ai,
        "Hi Aarav, thanks for joining. We'll go through five short rounds today. To start, tell me a little about yourself.",
        0.1,
      );
      await c.wait(0.4);
      say(false, "Interviewer · Listening");
      await c.wait(0.3);
      await c.type(you, "Sure. I'm a frontend engineer with four years…", 0.14);
      await c.to(you, { color: [MUTE, INK] }, { duration: 0.3 });
      await c.wait(0.6);
      roundAt(1);
      c.text(timer, "Deep dive 0:01");
      await c.wait(1.2);
    },
  },

  whiteboard: {
    say: "It tests real thinking",
    duration: 8.5,
    async run(c) {
      const say = status(c);
      const paths = c.q("sketch-path");
      const labels = c.q("sketch-label");
      const tools = c.q("tool");
      const [mask] = c.q("sketch-mask");
      const [ai] = c.q("caption").map(cap);
      const boxes = 7;
      const label = [0, 1, 2, 3, 4, 6, 5]; // sketch box -> its label (Queue and Fan-out swap)
      const pick = (n: number) => tools.forEach((t, i) => t.classList.toggle(s.toolOn, i === n));

      say(false, "Listening");
      c.text(ai, "Good. Now, what happens when someone with a million followers posts? Sketch it on the board.");
      pick(1);
      c.set(paths.slice(0, -1), { strokeDasharray: "1 1", strokeDashoffset: "1", opacity: "0", fillOpacity: "0" });
      c.set(paths.at(-1), { opacity: "0" });
      c.set(mask, { strokeDasharray: "1 1", strokeDashoffset: "1" });
      c.set(labels, { opacity: "0", translate: "0 6px" });

      await c.wait(0.3);
      void c.cursor.show();
      await c.cursor.move(tools[2], { duration: 0.55 });
      await c.cursor.click();
      pick(2);
      await c.wait(0.15);
      // Boxes: the cursor drags each one out corner to corner
      for (let i = 0; i < boxes; i++) {
        const p = paths[i];
        await c.cursor.move(p, { pos: [0, 0], duration: 0.18 });
        c.set(p, { opacity: "1" });
        void c.cursor.move(p, { pos: [1, 1], duration: 0.26 });
        await c.to(p, { strokeDashoffset: [1, 0] }, { duration: 0.26, ease: "easeInOut" });
        void c.to(p, { fillOpacity: [0, 1] }, { duration: 0.2 });
        void c.to(labels[label[i]], { opacity: [0, 1], translate: ["0 6px", "0 0"] }, { duration: 0.25 });
      }
      void c.cursor.hide();
      // Arrows, then the dashed fan-out last
      for (const p of paths.slice(boxes, -1)) {
        c.set(p, { opacity: "1" });
        await c.to(p, { strokeDashoffset: [1, 0] }, { duration: 0.15, ease: "easeInOut" });
      }
      c.set(paths.at(-1), { opacity: "1" });
      await c.to(mask, { strokeDashoffset: [1, 0] }, { duration: 0.5, ease: "easeInOut" });
      void c.to(labels.slice(7), { opacity: [0, 1], translate: ["0 6px", "0 0"] }, { duration: 0.3 });
      await c.wait(0.3);
      c.orb("solving");
      await c.wait(0.6);
      say(true, "Speaking");
      await c.type(
        ai,
        "Nice, pulling celebrity posts on read keeps writes cheap. How would you keep the feed under 200 ms?",
        0.07,
      );
      await c.wait(0.8);
    },
  },

  coding: {
    say: "Real code, real tests",
    duration: 7.5,
    async run(c) {
      const say = status(c);
      const lines = c.q("code-line");
      const [run] = c.q("run");
      const [play, spinner, runLabel] = [...(run?.children ?? [])] as HTMLElement[];
      const [results] = c.q("results");
      const tests = c.q("test");
      const caret = (n: number) => lines.forEach((l, i) => l.classList.toggle(s.caret, i === n));

      say(false, "Listening");
      c.set(lines, { opacity: "0", clipPath: "inset(0 100% 0 0)" });
      caret(-1);
      c.set(run, { transform: "none" });
      c.set(play, { display: "" });
      c.set(spinner, { display: "none" });
      c.text(runLabel, "Run");
      c.set(results, { opacity: "0", transform: "translateY(16px)" });
      c.set(tests, { opacity: "0", translate: "0 4px" });

      await c.wait(0.3);
      // Typed a line at a time, caret riding the end of the latest
      for (const [i, l] of lines.entries()) {
        c.set(l, { opacity: "1" });
        caret(i);
        await c.to(l, { clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)"] }, { duration: 0.16, ease: "linear" });
        await c.wait(0.06);
      }
      void c.cursor.show();
      await c.cursor.move(run, { duration: 0.6 });
      await c.cursor.click();
      void c.to(run, { transform: ["scale(1)", "scale(0.96)", "scale(1)"] }, { duration: 0.15 });
      caret(-1);
      c.set(play, { display: "none" });
      c.set(spinner, { display: "" });
      c.text(runLabel, "Running…");
      await c.wait(0.7);
      c.set(play, { display: "" });
      c.set(spinner, { display: "none" });
      c.text(runLabel, "Run");
      void c.cursor.hide();
      await c.to(results, { opacity: [0, 1], transform: ["translateY(16px)", "none"] }, { duration: 0.3 });
      for (const t of tests) {
        await c.wait(0.2);
        await c.to(t, { opacity: [0, 1], translate: ["0 4px", "0 0"] }, { duration: 0.25 });
      }
      await c.wait(0.4);
      say(true, "Speaking");
      await c.wait(1.2);
    },
  },

  voice: {
    say: "Or a quick voice screen",
    duration: 6,
    async run(c) {
      const [label] = c.q("ai-status");
      const [question, reply] = c.q("caption");
      const [timer] = c.q("timer");
      const [halo] = c.q("halo");

      c.orb("composing");
      c.text(label, "Speaking");
      c.text(question, "");
      c.set(reply, { opacity: "0", translate: "0 4px" });
      halo?.classList.toggle(s.haloOn, true);

      void tick(c, timer, 222, 5, " left");
      await c.wait(0.3);
      await c.type(
        question,
        "Thanks, that's helpful. Tell me about a time you had to ship something with a hard deadline. What did you cut, and why?",
        0.1,
      );
      await c.wait(0.3);
      halo?.classList.toggle(s.haloOn, false);
      c.orb("listening");
      c.text(label, "Listening");
      await c.wait(0.4);
      await c.to(reply, { opacity: [0, 1], translate: ["0 4px", "0 0"] }, { duration: 0.35 });
      await c.wait(1.6);
    },
  },

  mcq: {
    say: "Or a timed test",
    duration: 6,
    async run(c) {
      const options = c.q("option");
      const cell = c.q("question-cell")[3];
      const [bar] = c.q("progress");
      const [answered] = c.q("answered");
      const [next] = c.q("next");
      const timer = c.q("timer")[0]?.lastElementChild ?? undefined;
      const hover = "color-mix(in srgb, var(--foreground) 4%, transparent)";
      const clear = "color-mix(in srgb, var(--foreground) 0%, transparent)";

      options.forEach((o) => o.classList.remove(s.optionOn));
      c.set(options, { backgroundColor: "" });
      cell?.classList.remove(s.answered);
      c.set(bar, { transform: `scaleX(${20 / 27})` });
      c.text(answered, "3 of 15 answered");
      c.set(next, { transform: "none" });

      void tick(c, timer, 697, 5);
      await c.wait(0.3);
      void c.cursor.show();
      await c.cursor.move(options[1], { pos: [0.3, 0.5], duration: 0.6 });
      void c.to(options[1], { backgroundColor: [clear, hover] }, { duration: 0.15 });
      await c.wait(0.5);
      void c.to(options[1], { backgroundColor: [hover, clear] }, { duration: 0.15 });
      await c.cursor.move(options[2], { pos: [0.32, 0.5], duration: 0.35 });
      await c.cursor.click();
      options[2]?.classList.add(s.optionOn);
      cell?.classList.add(s.answered);
      c.text(answered, "4 of 15 answered");
      await c.to(bar, { transform: [`scaleX(${20 / 27})`, "scaleX(1)"] }, { duration: 0.35 });
      await c.wait(0.5);
      await c.cursor.move(next, { duration: 0.6 });
      await c.cursor.click();
      await c.to(next, { transform: ["scale(1)", "scale(0.96)", "scale(1)"] }, { duration: 0.15 });
      await c.wait(1);
    },
  },

  dashboard: {
    say: "Your shortlist lands here",
    duration: 5.5,
    async run(c) {
      const [badge] = c.q("badge");
      const [fresh] = c.q("notification");
      const [like] = c.q("like");
      const heart = like?.querySelector("svg");
      const likes = like?.lastElementChild;
      const row = { height: "", paddingTop: "", paddingBottom: "", borderBottomWidth: "" };

      c.text(badge, "2");
      c.set(badge, { transform: "none" });
      c.set(fresh, { ...row, overflow: "hidden" });
      const h = fresh?.offsetHeight ?? 0;
      c.set(fresh, { height: "0px", paddingTop: "0px", paddingBottom: "0px", borderBottomWidth: "0px", opacity: "0" });
      c.set(like, { color: "" });
      c.set(heart, { fill: "", transform: "none" });
      c.text(likes, "Like 48");

      await c.wait(0.5);
      c.text(badge, "3");
      void c.to(badge, { transform: ["scale(1)", "scale(1.35)", "scale(1)"] }, { duration: 0.35 });
      await c.to(
        fresh,
        {
          height: ["0px", `${h}px`],
          paddingTop: ["0px", "12px"],
          paddingBottom: ["0px", "12px"],
          borderBottomWidth: ["0px", "1px"],
          opacity: [0, 1],
        },
        { duration: 0.35 },
      );
      await c.wait(0.7);
      void c.cursor.show();
      await c.cursor.move(like, { pos: [0.4, 0.5], duration: 0.7 });
      await c.cursor.click();
      c.set(like, { color: RED });
      c.set(heart, { fill: RED });
      c.text(likes, "Like 49");
      await c.to(heart, { transform: ["scale(1)", "scale(1.3)", "scale(1)"] }, { duration: 0.3 });
      await c.wait(1.4);
    },
  },
};
