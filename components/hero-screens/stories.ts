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

  // The camera: pans and zooms the whole screen (cursor included) onto one part, so small UI reads at hero size.
  // Shots are % of the slide so a resize mid-shot doesn't drift. Off under reduced motion: the full view stays put.
  const cam = slide.querySelector<HTMLElement>("[data-camera]");
  const frame = (v: { x: number; y: number; z: number }) => `translate(${v.x}%, ${v.y}%) scale(${v.z})`;
  const camera = (el?: Element | null, { zoom = 1.6, pos = [0.5, 0.5], duration = 0.9 } = {}) => {
    if (instant || !cam) return Promise.resolve();
    // Start from where the camera actually is: a new shot can begin while the last one is still gliding
    const b = slide.getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(cam).transform);
    const now = { x: (m.e / b.width) * 100, y: (m.f / b.height) * 100, z: m.a };
    let next = { x: 0, y: 0, z: 1 };
    if (el) {
      const r = el.getBoundingClientRect();
      // The target's spot as a fraction of the slide, with the current shot undone
      const fx = ((r.left - b.left + r.width * pos[0]) / b.width - now.x / 100) / now.z;
      const fy = ((r.top - b.top + r.height * pos[1]) / b.height - now.y / 100) / now.z;
      const clamp = (v: number) => Math.min(0, Math.max((1 - zoom) * 100, v));
      next = { z: zoom, x: clamp((0.5 - zoom * fx) * 100), y: clamp((0.5 - zoom * fy) * 100) };
    }
    return to(cam, { transform: [frame(now), frame(next)] }, { duration, ease: MOVE });
  };

  // Clean slate: camera wide, cursor home and hidden, orb running
  set(cam, { transform: "" });
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
    /** Pans/zooms onto `el` (a spot on it given by `pos`, as fractions of its box); no `el` = back to the full view */
    camera,
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
    duration: 10.5,
    async run(c) {
      const say = status(c);
      const captions = c.q("caption");
      const [ai, you] = captions.map(cap);
      const [aiBox, youBox] = captions; // the caption blocks, as camera targets
      const rounds = c.q("round");
      const [timer] = c.q("timer");
      const roundAt = (n: number) =>
        rounds.forEach((li, i) => {
          li.classList.toggle(s.roundOn, i === n);
          li.classList.toggle(s.roundDone, i < n);
        });

      // Reset: the room wide, captions empty, round 1 current
      say(true, "Interviewer · Speaking");
      c.text(ai, "");
      c.text(you, "");
      c.set(you, { color: MUTE });
      roundAt(0);
      c.text(timer, "Intro 1:42");

      // The room, wide: the interviewer opens the round
      await c.wait(0.6);
      // Push in on the interviewer's tile and caption as it speaks
      void c.camera(aiBox, { zoom: 1.5, pos: [0.5, 0.2], duration: 0.9 });
      await c.type(
        ai,
        "Hi Aarav, thanks for joining. We'll go through five short rounds today. To start, tell me a little about yourself.",
        0.08,
      );
      await c.wait(0.5);
      say(false, "Interviewer · Listening");
      // Glide across to the candidate answering
      void c.camera(youBox, { zoom: 1.5, pos: [0.5, 0.2], duration: 0.9 });
      await c.type(you, "Sure. I'm a frontend engineer with four years…", 0.12);
      await c.to(you, { color: [MUTE, INK] }, { duration: 0.3 });
      await c.wait(0.5);
      // Zoom onto the header rounds: Deep dive takes over
      void c.camera(rounds[1], { zoom: 1.8, duration: 0.9 });
      await c.wait(0.3);
      roundAt(1);
      c.text(timer, "Deep dive 0:01");
      await c.wait(1.6);
      // Back to the full room
      await c.camera();
      await c.wait(0.8);
    },
  },

  whiteboard: {
    say: "It tests real thinking",
    duration: 12.5,
    async run(c) {
      const say = status(c);
      const paths = c.q("sketch-path");
      const labels = c.q("sketch-label");
      const tools = c.q("tool");
      const [mask] = c.q("sketch-mask");
      const [sketch] = c.q("sketch");
      const [question, answer] = c.q("caption");
      const [ai, you] = [question, answer].map(cap);
      const boxes = 7;
      const label = [0, 1, 2, 3, 4, 6, 5]; // sketch box -> its label (Queue and Fan-out swap)
      const pick = (n: number) => tools.forEach((t, i) => t.classList.toggle(s.toolOn, i === n));

      // Reset: listening, empty captions, select tool, nothing drawn
      say(false, "Listening");
      c.text(ai, "");
      c.text(you, "");
      c.set(you, { color: MUTE });
      pick(1);
      c.set(paths.slice(0, -1), { strokeDasharray: "1 1", strokeDashoffset: "1", opacity: "0", fillOpacity: "0" });
      c.set(paths.at(-1), { opacity: "0" });
      c.set(mask, { strokeDasharray: "1 1", strokeDashoffset: "1" });
      c.set(labels, { opacity: "0", translate: "0 6px" });

      // The question: wide, then in on its caption while it is typed
      await c.wait(0.2);
      void c.camera(question, { zoom: 1.7, duration: 0.9 });
      await c.type(
        ai,
        "Good. Now, what happens when someone with a million followers posts? Sketch it on the board.",
        0.06,
      );

      // The board: glide across it while the sketch draws, box by box, then the arrows
      void c.camera(sketch, { zoom: 1.5, pos: [0.446, 0.5], duration: 0.9 });
      pick(2);
      void c.cursor.show();
      for (let i = 0; i < boxes; i++) {
        const p = paths[i];
        if (i === 4) void c.camera(sketch, { zoom: 1.5, pos: [0.85, 0.5], duration: 0.9 });
        c.set(p, { opacity: "1" });
        void c.cursor.move(p, { duration: 0.35 });
        void c.to(p, { fillOpacity: [0, 1] }, { duration: 0.3 });
        void c.to(labels[label[i]], { opacity: [0, 1], translate: ["0 6px", "0 0"] }, { duration: 0.3 });
        await c.to(p, { strokeDashoffset: [1, 0] }, { duration: 0.35, ease: "easeInOut" });
      }
      void c.cursor.hide();
      for (const p of paths.slice(boxes, -1)) {
        c.set(p, { opacity: "1" });
        void c.to(p, { strokeDashoffset: [1, 0] }, { duration: 0.3, ease: "easeInOut" });
        await c.wait(0.2);
      }
      // The dashed fan-out last, with its two annotations
      c.set(paths.at(-1), { opacity: "1" });
      void c.to(labels.slice(7), { opacity: [0, 1], translate: ["0 6px", "0 0"] }, { duration: 0.4 });
      await c.to(mask, { strokeDashoffset: [1, 0] }, { duration: 0.7, ease: "easeInOut" });
      c.orb("solving");
      await c.wait(0.3);

      // The candidate explains the trade-off, camera on the answer
      void c.camera(answer, { zoom: 1.5, pos: [0.5, 0.2], duration: 0.9 });
      await c.type(
        you,
        "Fanning out to every follower is too expensive there, so for those accounts I'd merge their posts in at read time…",
        0.06,
      );
      await c.to(you, { color: [MUTE, INK] }, { duration: 0.3 });

      // The AI follows up with a harder question, camera back on its caption
      say(true, "Speaking");
      void c.camera(question, { zoom: 1.5, pos: [0.5, 0.2], duration: 0.9 });
      await c.type(
        ai,
        "Nice, pulling celebrity posts on read keeps writes cheap. How would you keep the feed under 200 ms?",
        0.07,
      );
      await c.wait(0.3);
      await c.camera();
      await c.wait(0.8);
    },
  },
  coding: {
    say: "Real code, real tests",
    duration: 13,
    async run(c) {
      const say = status(c);
      const lines = c.q("code-line");
      const [run] = c.q("run");
      const [play, spinner, runLabel] = [...(run?.children ?? [])] as HTMLElement[];
      const [results] = c.q("results");
      const tests = c.q("test");
      const [box] = c.q("question-box");
      const [question] = c.q("question");
      const caret = (n: number) => lines.forEach((l, i) => l.classList.toggle(s.caret, i === n));

      // Clean slate: everything this story animates goes back to its first frame
      say(false, "Listening");
      c.set(lines, { opacity: "0", clipPath: "inset(0 100% 0 0)" });
      caret(-1);
      c.set(run, { transform: "none" });
      c.set(play, { display: "" });
      c.set(spinner, { display: "none" });
      c.text(runLabel, "Run");
      c.set(results, { opacity: "0", transform: "translateY(16px)" });
      c.set(tests, { opacity: "0", translate: "0 4px" });
      c.set(box, { opacity: "0", translate: "0 6px" });
      c.text(question, "");

      // 1. The problem, zoomed in
      await c.wait(0.2);
      await c.wait(0.9);

      // 2. Zoom on the editor while the solution types out, a line at a time
      for (const [i, l] of lines.entries()) {
        c.set(l, { opacity: "1" });
        caret(i);
        // Longer lines take longer, so the typing pace stays even
        const len = l.textContent?.length ?? 0;
        const dur = Math.min(0.55, Math.max(0.35, len * 0.009));
        await c.to(l, { clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)"] }, { duration: dur, ease: "easeOut" });
      }
      caret(-1);

      // 3. The cursor glides to Run, and the code executes
      void c.cursor.show();
      await c.cursor.move(run, { duration: 0.7 });
      await c.cursor.click();
      void c.to(run, { transform: ["scale(1)", "scale(0.96)", "scale(1)"] }, { duration: 0.35, ease: "easeOut" });
      c.set(play, { display: "none" });
      c.set(spinner, { display: "" });
      c.text(runLabel, "Running…");
      await c.wait(0.7);
      c.set(play, { display: "" });
      c.set(spinner, { display: "none" });
      c.text(runLabel, "Run");
      void c.cursor.hide();

      // 4. Results, zoomed in: the first example passes, the second fails
      await c.to(
        results,
        { opacity: [0, 1], transform: ["translateY(16px)", "none"] },
        { duration: 0.45, ease: "easeOut" },
      );
      for (const t of tests) {
        await c.wait(0.2);
        await c.to(t, { opacity: [0, 1], translate: ["0 4px", "0 0"] }, { duration: 0.35, ease: "easeOut" });
      }
      await c.wait(0.3);

      // 5. The AI reacts to the failure: its question types into the dock
      await c.to(box, { opacity: [0, 1], translate: ["0 6px", "0 0"] }, { duration: 0.45, ease: "easeOut" });
      await c.wait(0.2);
      say(true, "Speaking");
      await c.type(question, "Example 2 missed a touching pair. Why, and what's the time complexity?", 0.07);
      await c.wait(0.4);

      // Back to the full view, so the slide change happens wide
      await c.wait(0.8);
    },
  },

  voice: {
    say: "Or a quick voice screen",
    duration: 9,
    async run(c) {
      const [label] = c.q("ai-status");
      const [question, reply] = c.q("caption");
      const [timer] = c.q("timer");
      const [halo] = c.q("halo");
      const [call] = c.q("call");

      // Clean slate: the AI is speaking, the candidate's reply is hidden
      c.orb("composing");
      c.text(label, "Speaking");
      c.text(question, "");
      c.text(reply, "");
      c.set(reply, { opacity: "0", translate: "0 4px" });
      halo?.classList.toggle(s.haloOn, true);

      // 1. The call card zooms in while the AI asks its question, the halo pulsing
      void c.camera(call, { zoom: 1.5, duration: 0.8 });
      void tick(c, timer, 222, 9, " left");
      await c.wait(0.6);
      await c.type(
        question,
        "Thanks, that's helpful. Tell me about a time you had to ship something with a hard deadline. What did you cut, and why?",
        0.08,
      );
      await c.wait(0.5);

      // 2. The AI stops speaking and listens
      halo?.classList.toggle(s.haloOn, false);
      c.orb("listening");
      c.text(label, "Listening");
      await c.wait(0.8);

      // 3. The candidate's reply fades in and fills the caption as it's spoken
      void c.to(reply, { opacity: [0, 1], translate: ["0 4px", "0 0"] }, { duration: 0.35, ease: "easeOut" });
      await c.type(reply, "You: Last quarter we had a launch tied to a partner event…", 0.08);
      await c.wait(2.1);

      // Back to the full view, so the slide change happens wide
      await c.camera();
      await c.wait(0.8);
    },
  },
  mcq: {
    say: "Or a timed test",
    duration: 10.5,
    async run(c) {
      const options = c.q("option");
      const cell = c.q("question-cell")[3];
      const [bar] = c.q("progress");
      const [answered] = c.q("answered");
      const [next] = c.q("next");
      const [question] = c.q("question");
      const [meter] = c.q("status-bar");
      const [grid] = c.q("grid");
      const timer = c.q("timer")[0]?.lastElementChild ?? undefined;
      const hover = "color-mix(in srgb, var(--foreground) 4%, transparent)";
      const clear = "color-mix(in srgb, var(--foreground) 0%, transparent)";

      // Clean slate: 3 of 15 answered, clock at 11:37, nothing picked
      options.forEach((o) => o.classList.remove(s.optionOn));
      c.set(options, { backgroundColor: "" });
      cell?.classList.remove(s.answered);
      c.set(bar, { transform: `scaleX(${20 / 27})` });
      c.text(answered, "3 of 15 answered");
      c.set(next, { transform: "none" });

      // Wide: the test, and the clock runs down through the whole story
      void tick(c, timer, 697, 7);
      await c.wait(1);

      // In on the question and its options
      await c.camera(question, { zoom: 1.7, duration: 0.8 });
      void c.cursor.show();
      await c.cursor.move(options[1], { pos: [0.3, 0.5], duration: 0.7 });
      void c.to(options[1], { backgroundColor: [clear, hover] }, { duration: 0.35 });
      await c.wait(0.45);

      // Hesitates: drifts up to A, then settles on C
      void c.to(options[1], { backgroundColor: [hover, clear] }, { duration: 0.3 });
      void c.to(options[0], { backgroundColor: [clear, hover] }, { duration: 0.3 });
      await c.cursor.move(options[0], { pos: [0.3, 0.5], duration: 0.45 });
      await c.wait(0.2);
      void c.to(options[0], { backgroundColor: [hover, clear] }, { duration: 0.3 });
      void c.to(options[2], { backgroundColor: [clear, hover] }, { duration: 0.3 });
      await c.cursor.move(options[2], { pos: [0.3, 0.5], duration: 0.55 });
      await c.cursor.click();

      // Picked: the option is selected, the cell and the count fill in, the bar slides on
      c.set(options, { backgroundColor: "" });
      options[2]?.classList.add(s.optionOn);
      cell?.classList.add(s.answered);
      c.text(answered, "4 of 15 answered");
      void c.to(bar, { transform: [`scaleX(${20 / 27})`, "scaleX(1)"] }, { duration: 0.6, ease: MOVE });
      await c.wait(0.25);

      // Progress and clock, then the question grid
      await c.camera(meter, { zoom: 1.8, duration: 0.8 });
      await c.wait(0.8);
      await c.camera(grid, { zoom: 1.7, duration: 0.7 });
      await c.wait(0.5);

      // On to Next
      void c.camera(next, { zoom: 1.8, duration: 0.7 });
      await c.cursor.move(next, { duration: 0.7 });
      await c.cursor.click();
      await c.to(next, { transform: ["scale(1)", "scale(0.96)", "scale(1)"] }, { duration: 0.15 });

      // Wide again, so the slide change happens on the full screen
      await c.camera();
      await c.wait(0.8);
    },
  },

  dashboard: {
    say: "Your shortlist lands here",
    duration: 10.3,
    async run(c) {
      const [badge] = c.q("badge");
      const [fresh] = c.q("notification");
      const row = { height: "", paddingTop: "", paddingBottom: "", borderBottomWidth: "" };
      const hover = "color-mix(in srgb, var(--foreground) 4%, transparent)";
      const clear = "color-mix(in srgb, var(--foreground) 0%, transparent)";

      // Clean slate: bell at 2, the result not in yet
      c.text(badge, "2");
      c.set(badge, { transform: "none" });
      c.set(fresh, { ...row, overflow: "hidden", backgroundColor: "" });
      const h = fresh?.offsetHeight ?? 0;
      c.set(fresh, { height: "0px", paddingTop: "0px", paddingBottom: "0px", borderBottomWidth: "0px", opacity: "0" });

      await c.wait(1.2);

      // The bell count goes up, then the camera follows the result into the notifications
      c.text(badge, "3");
      void c.to(badge, { transform: ["scale(1)", "scale(1.35)", "scale(1)"] }, { duration: 0.45 });
      await c.wait(0.7);
      await c.to(
        fresh,
        {
          height: ["0px", `${h}px`],
          paddingTop: ["0px", "12px"],
          paddingBottom: ["0px", "12px"],
          borderBottomWidth: ["0px", "1px"],
          opacity: [0, 1],
        },
        { duration: 0.7, ease: MOVE },
      );
      await c.wait(1.8);

      // Open it
      void c.cursor.show();
      await c.cursor.move(fresh, { pos: [0.35, 0.5], duration: 0.9 });
      await c.cursor.click();
      void c.to(fresh, { backgroundColor: [clear, hover] }, { duration: 0.3 });
      await c.wait(1.8);

      // Wide again, so the slide change happens on the full screen
      void c.cursor.hide();
      await c.wait(0.8);
    },
  },
};
