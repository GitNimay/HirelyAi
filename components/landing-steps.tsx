"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/* "How it works": six isometric scenes zigzag down the page, each drawing the step written beside it,
   joined by connectors routed from the figures' measured positions. Each row and each connector owns a
   scrubbed ScrollTrigger. Only the SVG parts and the text lines animate. Plain SVG in true 30° isometric:
   solids are Boxes, and flat drawings (icons, text lines) are painted onto their faces with <Face>. */

const NODES = [
  { title: "Identify the role", body: "Begin with a position your organization needs to fill." },
  { title: "Verify your organization", body: "Confirm ownership of your company domain with a work email address." },
  { title: "Publish the position", body: "Select the screening format: a voice interview or a timed assessment." },
  { title: "Receive applications", body: "Candidates apply with a resume, which is converted into a complete profile." },
  { title: "Interviews are conducted", body: "Each applicant completes a five-minute LLM-led interview before the closing date." },
  { title: "Review the shortlist", body: "Applicants are ranked by score, each with a fit rating and a written assessment." },
];
const SIDE = ["L", "L", "R", "R", "L", "L"] as const;

const C = Math.cos(Math.PI / 6);
const P = (x: number, y: number, z: number) => [+((x - y) * C).toFixed(1), +((x + y) / 2 - z).toFixed(1)] as const;
const pt = (x: number, y: number, z: number) => P(x, y, z).join(",");
const poly = (...p: [number, number, number][]) => p.map((q) => pt(...q)).join(" ");
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

// Affine maps from a face's flat frame (u right, v down, iso units) onto the screen:
// L is a face looking down +y, R one looking down +x, T a horizontal surface.
const PLANE = { L: `${C} 0.5 0 1`, R: `${C} -0.5 0 1`, T: `${C} 0.5 ${-C} 0.5` };

/** Paints flat 2D children onto an iso plane; `at` is the frame's top-left corner in 3D. */
function Face({ on, at, children }: { on: keyof typeof PLANE; at: [number, number, number]; children: ReactNode }) {
  const [X, Y] = P(...at);
  return <g transform={`matrix(${PLANE[on]} ${X} ${Y})`}>{children}</g>;
}

/** A screen-facing ink disc floating at a 3D point, for status marks. */
function Badge({ at, children }: { at: [number, number, number]; children: ReactNode }) {
  const [X, Y] = P(...at);
  return <g transform={`translate(${X} ${Y})`}><circle r={8} fill={ink} />{children}</g>;
}

/** A candidate: a cylinder body and a round head, standing at (x, y, z). */
function Person({ x, y, z }: { x: number; y: number; z: number }) {
  const rx = 8.6, ry = 5; // a radius-7 circle in iso
  const [cx, by] = P(x, y, z), ty = by - 17;
  return (
    <g>
      <path d={`M${cx - rx} ${ty}V${by}A${rx} ${ry} 0 0 0 ${cx + rx} ${by}V${ty}Z`} fill="var(--iso-left)" />
      <ellipse cx={cx} cy={ty} rx={rx} ry={ry} fill="var(--iso-top)" />
      <circle cx={cx} cy={ty - 10.5} r={6} fill={ink} />
    </g>
  );
}

const check = <path d="M-3.5 0l2.5 2.5 4.5-5" stroke="var(--iso-top)" strokeWidth={2} />;
const muted = { strokeOpacity: 0.45 };
const heading = { strokeWidth: 2.5 };
const windows = (
  <>
    {[5, 13, 21].flatMap((v) => [4, 11, 18].map((u) => <rect key={`${u}-${v}`} x={u} y={v} width={4} height={5} {...muted} />))}
    <path d="M10 36v-7h6v7" />
  </>
);
const sheetLines = (
  <>
    <path d="M4 5h9" strokeWidth={2} />
    <path d="M4 10h14M4 14h11M4 18h14M4 22h8" {...muted} />
  </>
);

const FIGURES: ReactNode[] = [
  // Identify the role: an open requisition (a dashed, unfilled seat) beside an empty chair
  [
    <Pop key="card" at={0.15}>
      <Box x={-30} y={-26} z={H} w={40} d={3} h={36} />
      <Face on="L" at={[-30, -23, H + 36]}>
        <circle cx={20} cy={10} r={4} strokeDasharray="2 2" />
        <path d="M12 21.5a8 7 0 0 1 16 0" strokeDasharray="2 2" />
        <path d="M11 28h18" {...heading} />
        <path d="M14 32.5h12" {...muted} />
      </Face>
    </Pop>,
    <Pop key="plus" at={0.4} from={-12}>
      <Badge at={[12, -25, H + 40]}><path d="M0-3.5v7M-3.5 0h7" stroke="var(--iso-top)" strokeWidth={2} /></Badge>
    </Pop>,
    <Pop key="chair" at={0.28}>
      {[[-25, 8], [-25, 23], [-8, 8], [-8, 23]].map(([x, y]) => <Box key={x * y} x={x} y={y} z={H} w={3} d={3} h={10} />)}
      <Box x={-26} y={8} z={H + 10} w={3} d={18} h={18} />
      <Box x={-23} y={8} z={H + 10} w={18} d={18} h={3} top={ink} />
    </Pop>,
  ],
  // Verify your organization: the company's building, a work email, and the verified mark
  [
    <Pop key="bldg" at={0.15}>
      <Box x={-30} y={-30} z={H} w={26} d={26} h={36} />
      <Face on="L" at={[-30, -4, H + 36]}>{windows}</Face>
      <Face on="R" at={[-4, -4, H + 36]}>{windows}</Face>
    </Pop>,
    <Pop key="mail" at={0.28}>
      <Box x={6} y={4} z={H} w={28} d={20} h={2} />
      <Face on="T" at={[6, 4, H + 2]}><path d="M0 0l14 10 14-10" /></Face>
    </Pop>,
    <Pop key="ok" at={0.42} from={-12}>
      <Badge at={[-1, -33, H + 44]}>{check}</Badge>
    </Pop>,
  ],
  // Publish the position: the posting, and the two screening formats with voice selected
  [
    <Pop key="post" at={0.15}>
      <Box x={-34} y={-28} z={H} w={48} d={3} h={34} />
      <Face on="L" at={[-34, -25, H + 34]}>
        <path d="M6 8h22" {...heading} />
        <path d="M6 15h36M6 21h28" {...muted} />
        <rect x={6} y={25} width={16} height={5} rx={2.5} fill={ink} />
      </Face>
    </Pop>,
    <Pop key="voice" at={0.28}>
      <Box x={-20} y={6} z={H} w={18} d={18} h={14} top={ink} />
      <Face on="L" at={[-20, 24, H + 14]}>
        <g transform="translate(9 7.5)"><rect x={-2.25} y={-5} width={4.5} height={7} rx={2.25} /><path d="M-4.25 0a4.25 4.25 0 0 0 8.5 0M0 4.25v1.75" /></g>
      </Face>
    </Pop>,
    <Pop key="timed" at={0.36}>
      <Box x={4} y={6} z={H} w={18} d={18} h={14} />
      <Face on="L" at={[4, 24, H + 14]}>
        <g transform="translate(9 7)"><circle r={4.75} /><path d="M0-2.75V0l2 1.4" /></g>
      </Face>
    </Pop>,
  ],
  // Receive applications: a stack of resumes, parsed into a profile card
  [
    ...[0, 1, 2].map((k) => (
      <Pop key={k} at={0.12 + k * 0.07}>
        <Box x={-34 + k} y={6 - k * 2} z={H + k * 2.5} w={22} d={28} h={1.5} />
        {k === 2 && <Face on="T" at={[-32, 2, H + 6.5]}>{sheetLines}</Face>}
      </Pop>
    )),
    <Pop key="arrow" at={0.32} from={0}>
      <Face on="T" at={[-4, -6, H]}><path d="M-6 6 6-6M0-6h6v6" strokeWidth={1.75} /></Face>
    </Pop>,
    <Pop key="profile" at={0.38}>
      <Box x={-6} y={-28} z={H} w={34} d={3} h={36} />
      <Face on="L" at={[-6, -25, H + 36]}>
        <circle cx={9} cy={10} r={4.5} fill={ink} />
        <path d="M17 8.5h11" {...heading} />
        <path d="M17 13h8" {...muted} />
        <rect x={5} y={19} width={10} height={4.5} rx={2.25} />
        <rect x={17} y={19} width={12} height={4.5} rx={2.25} />
        <path d="M5 28.5h24M5 32h16" {...muted} />
      </Face>
    </Pop>,
  ],
  // Interviews are conducted: the candidate talks with the AI interviewer on a five-minute clock
  [
    <Pop key="screen" at={0.12}>
      <Box x={-16} y={-28} z={H} w={18} d={10} h={1.5} />
      <Box x={-10} y={-24} z={H + 1.5} w={6} d={3} h={7} />
      <Box x={-30} y={-23} z={H + 8} w={46} d={3} h={30} />
      <Face on="L" at={[-30, -20, H + 38]}>
        <circle cx={23} cy={13} r={5} fill={ink} />
        <path d="M13 24h20" {...muted} />
      </Face>
    </Pop>,
    <Pop key="wave" at={0.3} from={0}>
      <Face on="L" at={[-30, -20, H + 38]}>
        <path d={[[9, 4], [12.5, 8], [16, 5], [30, 6], [33.5, 9], [37, 4]].map(([u, h]) => `M${u} ${13 - h / 2}v${h}`).join("")} strokeWidth={2} />
      </Face>
    </Pop>,
    <Pop key="person" at={0.22}>
      <Person x={-4} y={22} z={H} />
    </Pop>,
    <Pop key="timer" at={0.4} from={-12}>
      <g transform={`translate(${P(18, -22, H + 44).join(" ")})`}>
        <rect x={-15} y={-5.5} width={30} height={11} rx={5.5} fill="var(--iso-top)" />
        <circle cx={-8.5} r={1.75} fill={ink} stroke="none" />
        <text x={3} y={2.4} textAnchor="middle" fontSize={7} fontWeight={600} fill={ink} stroke="none" className="tabular-nums">5:00</text>
      </g>
    </Pop>,
  ],
  // Review the shortlist: a ranked board, the top fit marked, with each candidate's written assessment
  [
    <Pop key="sheet" at={0.12}>
      <Box x={-28} y={4} z={H} w={22} d={28} h={1.5} />
      <Face on="T" at={[-28, 4, H + 1.5]}>{sheetLines}</Face>
    </Pop>,
    <Pop key="board" at={0.15}>
      <Box x={-30} y={-26} z={H} w={50} d={3} h={40} />
    </Pop>,
    ...["92", "84", "71"].map((score, k) => (
      <Pop key={score} at={0.24 + k * 0.06} from={-10}>
        <Face on="L" at={[-30, -23, H + 40 - 4 - k * 12]}>
          {k === 0 && <rect x={3} y={-1} width={44} height={10} rx={2} fill={ink} fillOpacity={0.12} stroke="none" />}
          <circle cx={9} cy={4} r={3} fill={k === 0 ? ink : "none"} strokeOpacity={k === 0 ? 1 : 0.6} />
          <path d="M15 4h15" {...(k === 0 ? heading : muted)} />
          <text x={44} y={6.4} textAnchor="end" fontSize={6.5} fontWeight={600} fill={ink} fillOpacity={k === 0 ? 1 : 0.5} stroke="none" className="tabular-nums">{score}</text>
        </Face>
      </Pop>
    )),
    <Pop key="star" at={0.44} from={-12}>
      <Badge at={[22, -24, H + 46]}>
        <polygon points="0,-4.5 1.3,-1.6 4.3,-1.4 2,0.7 2.7,3.7 0,2 -2.7,3.7 -2,0.7 -4.3,-1.4 -1.3,-1.6" fill="var(--iso-top)" stroke="none" />
      </Badge>
    </Pop>,
  ],
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
    <section id="how-it-works" className="scroll-mt-14 overflow-x-clip border-t border-border px-4 pb-20 pt-16 sm:px-8 sm:pb-32 sm:pt-24">
      <div className="flex flex-col items-center text-center">{children}</div>
      <div ref={track} className="relative mx-auto mt-12 max-w-4xl sm:mt-16">
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
                  className="w-32 shrink-0 sm:w-44 lg:w-56 [&_*]:[vector-effect:non-scaling-stroke]"
                  style={isoVars}
                  aria-hidden
                >
                  <g stroke={ink} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" fill="none">
                    <Pop at={0} from={16}>
                      <Box x={-40} y={-40} z={0} w={80} d={80} h={H} />
                    </Pop>
                    {FIGURES[i]}
                  </g>
                </svg>
                <div className="min-w-0 max-w-64">
                  <h3 data-line className="text-sm font-medium">{n.title}</h3>
                  <p data-line className="mt-1 text-pretty text-sm text-muted">{n.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
