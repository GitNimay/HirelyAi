"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/* "How it works": six isometric figures zigzag down the page, each with its text beside it, joined by
   connectors routed from the figures' measured positions. Each row and each connector owns a scrubbed
   ScrollTrigger. Only the SVG parts and the text lines animate. Plain SVG in true 30° isometric. */

const NODES = [
  { title: "You have a role to fill", body: "Here is what happens next." },
  { title: "Verify your company", body: "One page per domain, confirmed by work email." },
  { title: "Post a job", body: "Pick the first round: a voice interview or an MCQ test." },
  { title: "Candidates apply", body: "One resume upload becomes a full profile." },
  { title: "AI interviews everyone", body: "Five spoken minutes, any time before the deadline." },
  { title: "Get a ranked shortlist", body: "Score, fit, strengths and concerns for every applicant." },
];
const SIDE = ["L", "L", "R", "R", "L", "L"] as const;

const C = Math.cos(Math.PI / 6);
const pt = (x: number, y: number, z: number) => `${((x - y) * C).toFixed(1)},${((x + y) / 2 - z).toFixed(1)}`;
const poly = (...p: [number, number, number][]) => p.map((q) => pt(...q)).join(" ");
const line = (x1: number, y1: number, x2: number, y2: number, z: number) => {
  const [a, b] = pt(x1, y1, z).split(","), [c, d] = pt(x2, y2, z).split(",");
  return { x1: a, y1: b, x2: c, y2: d };
};
const H = 12; // platform height
const ink = "var(--iso-ink)";
const isoVars = {
  "--iso-ink": "light-dark(#3d2fd8, #8f88ff)",
  "--iso-top": "var(--background)",
  "--iso-left": "light-dark(#ececE6, #1f1f1f)",
  "--iso-right": "light-dark(#dfdfd8, #121212)",
} as React.CSSProperties;

// The figure viewBox, and where the platform's back and front tips sit in it (the connectors plug in there).
const VB = { x: -72, y: -84, w: 144, h: 126 };
const TIP_TOP = (-40 - H - VB.y) / VB.h; // back tip (-40,-40,H)
const TIP_BOTTOM = (40 - VB.y) / VB.h; // front tip (40,40,0)

/** An axis-aligned iso box: the two faces toward the viewer, then the top. */
function Box({ x, y, z, w, d, h, top = "var(--iso-top)" }: { x: number; y: number; z: number; w: number; d: number; h: number; top?: string }) {
  const X = x + w, Y = y + d, Z = z + h;
  return (
    <g>
      <polygon points={poly([X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z])} fill="var(--iso-right)" />
      <polygon points={poly([x, Y, z], [X, Y, z], [X, Y, Z], [x, Y, Z])} fill="var(--iso-left)" />
      <polygon points={poly([x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z])} fill={top} />
    </g>
  );
}

/** Pops in at `at` (0–1 along its row's timeline), dropping from `from` px. */
function Pop({ at, from = -24, children }: { at: number; from?: number; children: ReactNode }) {
  return <g data-pop={at} data-from={from}>{children}</g>;
}

const shadow = (w: number, d: number) => (
  <polygon points={poly([-w / 2, -d / 2, H], [w / 2, -d / 2, H], [w / 2, d / 2, H], [-w / 2, d / 2, H])} fill={ink} fillOpacity={0.12} stroke="none" />
);

const FIGURES: ReactNode[] = [
  // Start: a single block
  <Pop key="s" at={0.2}>
    <Box x={-12} y={-12} z={H} w={24} d={24} h={24} top={ink} />
  </Pop>,
  // Verify: a block with a check on top
  <Pop key="v" at={0.2}>
    <Box x={-18} y={-18} z={H} w={36} d={36} h={36} top={ink} />
    {[8, 14, 20, 26, 32].map((z) => <line key={z} {...line(18, -14, 18, 14, H + z)} strokeOpacity={0.5} />)}
    <polyline points={poly([-8, 5, H + 36], [4, 9, H + 36], [-2, -17, H + 36])} fill="none" stroke="var(--iso-top)" strokeWidth={2.5} />
  </Pop>,
  // Post: a floating job card
  <Pop key="p" at={0.2}>
    {shadow(60, 44)}
    <Box x={-30} y={-22} z={H + 24} w={60} d={44} h={4} />
    <line {...line(-22, -12, 6, -12, H + 28)} strokeWidth={2.5} />
    <line {...line(-22, -2, 20, -2, H + 28)} strokeOpacity={0.5} />
    <line {...line(-22, 7, 10, 7, H + 28)} strokeOpacity={0.5} />
  </Pop>,
  // Apply: candidates arriving
  [[-28, -10], [2, -26], [-8, 10], [14, 8]].map(([dx, dy], k) => (
    <Pop key={k} at={0.18 + k * 0.06}>
      <Box x={dx} y={dy} z={H} w={18} d={18} h={18} top={k === 2 ? ink : undefined} />
    </Pop>
  )),
  // Interview: a voice waveform
  [8, 18, 30, 40, 26, 14, 6].map((h, k) => (
    <Pop key={k} at={0.18 + k * 0.03} from={12}>
      <Box x={-30 + k * 9} y={-3} z={H} w={6} d={6} h={h} top={ink} />
    </Pop>
  )),
  // Shortlist: ranked plates, the best on top
  [0, 1, 2].map((k) => (
    <Pop key={k} at={0.18 + k * 0.08}>
      {k === 0 && shadow(52, 52)}
      <Box x={-26} y={-26} z={H + 8 + k * 14} w={52} d={52} h={4} top={k === 2 ? ink : undefined} />
    </Pop>
  )),
];

/** Bottom tip of figure a to back tip of figure b: straight when they line up, else a rounded S. */
function route(a: DOMRect, b: DOMRect, r = 28) {
  const sx = a.left + a.width / 2, sy = a.top + a.height * TIP_BOTTOM;
  const tx = b.left + b.width / 2, ty = b.top + b.height * TIP_TOP;
  const dx = tx - sx;
  if (Math.abs(dx) < 1) return `M${sx} ${sy} V${ty}`;
  const my = (sy + ty) / 2, dir = Math.sign(dx);
  const q = Math.min(r, Math.abs(dx) / 2, (ty - sy) / 4);
  return `M${sx} ${sy} V${my - q} A${q} ${q} 0 0 ${dir > 0 ? 0 : 1} ${sx + dir * q} ${my} H${tx - dir * q} A${q} ${q} 0 0 ${dir > 0 ? 1 : 0} ${tx} ${my + q} V${ty}`;
}

export function HowItWorks({ children }: { children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);

  // Measure the figures and route the connectors; again whenever the track resizes (fonts, breakpoints).
  useLayoutEffect(() => {
    const el = track.current!;
    const measure = () => {
      const o = el.getBoundingClientRect();
      const rects = [...el.querySelectorAll("[data-node]")].map((n) => {
        const r = n.getBoundingClientRect(); // figures themselves are never transformed, only their parts
        return new DOMRect(r.left - o.left, r.top - o.top, r.width, r.height);
      });
      setPaths(rects.slice(1).map((b, i) => route(rects[i], b)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!paths.length) return;
    gsap.registerPlugin(ScrollTrigger);
    // Phones and reduced motion get fades only; desktop adds the small drops.
    const simple = matchMedia("(prefers-reduced-motion: reduce), (max-width: 1023px)").matches;
    const ctx = gsap.context(() => {
      track.current!.querySelectorAll<SVGPathElement>("[data-seg]").forEach((el) => {
        gsap.fromTo(el, { attr: { "stroke-dashoffset": 1 } }, {
          attr: { "stroke-dashoffset": 0 }, ease: "none",
          scrollTrigger: { trigger: el, start: "top 75%", end: "bottom 75%", scrub: 0.5 },
        });
      });
      track.current!.querySelectorAll<HTMLElement>("[data-row]").forEach((row) => {
        const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: row, start: "top 85%", end: "top 45%", scrub: 0.5 } });
        row.querySelectorAll<SVGGElement>("[data-pop]").forEach((g) => {
          const at = +g.dataset.pop!;
          tl.fromTo(g, { opacity: 0 }, { opacity: 1, duration: 0.15 }, at);
          if (!simple) tl.fromTo(g, { y: +g.dataset.from! }, { y: 0, duration: 0.25, ease: "power3.out" }, at);
        });
        row.querySelectorAll("[data-line]").forEach((t, k) => {
          tl.fromTo(t, { opacity: 0, y: simple ? 0 : 10 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }, 0.45 + k * 0.15);
        });
        tl.set({}, {}, 1); // pad to 1 so `at` values are fractions of the row's scroll
      });
    }, track);
    return () => ctx.revert();
  }, [paths]);

  return (
    <section id="how-it-works" className="scroll-mt-14 border-t border-border px-4 pb-32 pt-24 sm:px-8">
      <div className="flex flex-col items-center text-center">{children}</div>
      <div ref={track} className="relative mx-auto mt-20 max-w-4xl">
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden style={isoVars}>
          {paths.map((d, i) => (
            <g key={i} fill="none">
              <path d={d} stroke="var(--muted)" strokeOpacity={0.45} strokeDasharray="3 5" />
              <path data-seg d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1} stroke={ink} strokeWidth={1.5} />
            </g>
          ))}
        </svg>
        <ol className="relative">
          {NODES.map((n, i) => {
            const right = SIDE[i] === "R";
            const turns = i < NODES.length - 1 && SIDE[i + 1] !== SIDE[i];
            return (
              <li
                key={n.title}
                data-row
                className={`flex items-center gap-4 sm:gap-8 ${right ? "flex-row-reverse text-right" : ""} ${i === NODES.length - 1 ? "" : turns ? "pb-[22svh]" : "pb-[10svh]"} lg:px-[8%]`}
              >
                <svg
                  data-node
                  viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
                  className="w-32 shrink-0 sm:w-40 lg:w-48 [&_*]:[vector-effect:non-scaling-stroke]"
                  style={isoVars}
                  aria-hidden
                >
                  <g stroke={ink} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round">
                    <Pop at={0} from={16}>
                      <Box x={-40} y={-40} z={0} w={80} d={80} h={H} />
                    </Pop>
                    {FIGURES[i]}
                  </g>
                </svg>
                <div className="min-w-0 max-w-64">
                  <h3 data-line className="text-sm font-medium">{n.title}</h3>
                  <p data-line className="mt-1 text-sm text-muted">{n.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
