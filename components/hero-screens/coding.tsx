import s from "./screens.module.css";
import { CamVideo, Check, Cross, Dock, RoomHeader, cx, type ScreenProps } from "./shared";

/* AI interview, coding round: the problem, the editor and a failing test run (Doop frame 0sRqDguQtf) */

// One entry per editor line: plain text, or [token class, text] for highlighted spans (VS Code light colors)
type Tok = "k" | "f" | "v" | "ty" | "c" | "cf" | "n";
type Seg = string | [Tok, string];
const LIST_INT: Seg[] = [["ty", "list"], "[", ["ty", "list"], "[", ["ty", "int"], "]]"];
const LAST_END: Seg[] = [["v", "out"], "[-", ["n", "1"], "][", ["n", "1"], "]"];
const CODE: Seg[][] = [
  [["k", "def"], " ", ["f", "merge"], "(", ["v", "meetings"], ": ", ...LIST_INT, ") -> ", ...LIST_INT, ":"],
  ["    ", ["c", "# sort by start, then sweep once"]],
  ["    ", ["v", "out"], " = []"],
  [
    "    ",
    ["cf", "for"],
    " ",
    ["v", "start"],
    ", ",
    ["v", "end"],
    " ",
    ["cf", "in"],
    " ",
    ["f", "sorted"],
    "(",
    ["v", "meetings"],
    "):",
  ],
  ["        ", ["cf", "if"], " ", ["v", "out"], " ", ["k", "and"], " ", ["v", "start"], " < ", ...LAST_END, ":"],
  ["            ", ...LAST_END, " = ", ["f", "max"], "(", ...LAST_END, ", ", ["v", "end"], ")"],
  ["        ", ["cf", "else"], ":"],
  ["            ", ["v", "out"], ".", ["f", "append"], "([", ["v", "start"], ", ", ["v", "end"], "])"],
  ["    ", ["cf", "return"], " ", ["v", "out"]],
  [],
];

const EXAMPLES = [
  ["[[1,3],[2,6],[8,10]]", "[[1,6],[8,10]]"],
  ["[[1,2],[2,3]]", "[[1,3]]"],
];

export function CodingScreen({ active }: ScreenProps) {
  return (
    <div className={s.screen}>
      <RoomHeader round={3} timer="6:24" total="9:10" />
      <div className={s.room}>
        <Dock
          ai="Speaking"
          aiDot="var(--success)"
          speaking
          cam={<CamVideo name="coding" position="75% 40%" active={active} />}
          interviewer="Sorting first makes sense. Before you run it, what's the time complexity of that loop?"
          you="The sort is n log n, and the sweep is linear, so overall n log n."
        >
          <section className={s.dockSection}>
            <p className={s.mute} style={{ fontSize: 13 }}>
              Latest question
            </p>
            <p data-anim="question" className={s.medium} style={{ fontSize: 16, lineHeight: "22px" }}>
              What&apos;s the time complexity of your solution, and can you do better on already-sorted input?
            </p>
          </section>
        </Dock>
        <section className={s.prob}>
          <div>
            <h2 className={s.serif}>Merge Meeting Times</h2>
            <p className={s.medium} style={{ fontSize: 12, lineHeight: "16px" }}>
              Medium
            </p>
          </div>
          <p style={{ lineHeight: "23px" }}>
            Given a list of meetings as [start, end] pairs, merge every pair that overlaps and return the busy blocks
            sorted by start time. Meetings that touch, like [1, 2] and [2, 3], count as overlapping.
          </p>
          <div className="flex flex-col gap-2">
            <span className={s.medium}>Examples</span>
            {EXAMPLES.map(([input, output]) => (
              <div key={input} className={s.ex}>
                <pre className={s.mono}>{input}</pre>
                <pre className={s.mono}>{output}</pre>
              </div>
            ))}
          </div>
          <p className={s.mute} style={{ fontSize: 12, lineHeight: "16px" }}>
            There are also hidden tests your interviewer may run.
          </p>
        </section>
        <section className={s.editor}>
          <div className={s.editorBar}>
            <span className={s.langSel}>
              Python
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--muted)"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
            <span data-anim="run" className={s.run}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--background)">
                <path d="M6 4l14 8-14 8z" />
              </svg>
              <span className={s.spinner} style={{ display: "none" }} />
              <span>Run</span>
            </span>
          </div>
          <div className={cx(s.code, s.mono)}>
            {CODE.map((line, i) => (
              <div key={i} data-anim="code-line" className={s.codeLine}>
                <span className={s.ln}>{i + 1}</span>
                <span>
                  {line.map((seg, j) =>
                    typeof seg === "string" ? (
                      seg
                    ) : (
                      <span key={j} className={s[seg[0]]}>
                        {seg[1]}
                      </span>
                    ),
                  )}
                </span>
              </div>
            ))}
          </div>
          <div data-anim="results" className={s.results}>
            <p className={s.medium} style={{ fontSize: 14, lineHeight: "20px", color: "var(--danger)" }}>
              Wrong Answer · 1/2 passed
              <span className={s.mute} style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
                0.02s · 9 MB
              </span>
            </p>
            <p data-anim="test" className={s.resRow} style={{ color: "var(--success)" }}>
              <Check />
              Example 1
            </p>
            <p data-anim="test" className={s.resRow}>
              <span className={s.resRow} style={{ color: "var(--danger)" }}>
                <Cross />
                Example 2
              </span>
              <span className={cx(s.mute, s.mono)} style={{ marginLeft: 12 }}>
                expected <span style={{ color: "var(--foreground)" }}>[[1,3]]</span> · got{" "}
                <span style={{ color: "var(--foreground)" }}>[[1,2],[2,3]]</span>
              </span>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
