"use client";

import "@excalidraw/excalidraw/index.css";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import Editor from "@monaco-editor/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LANGUAGES, type BoardElement, type Language, type PublicProblem, type RunResult } from "@/lib/workspace";
import type { RoomSocket } from "./ai-interview";
import { ask, Select } from "./kit";
import { primary } from "./onboarding";
import { Icon, icons } from "./ui";

// Follows the site theme (data-theme on <html>, else the OS)
const dark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
};
const onTheme = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
};
const useDark = () => useSyncExternalStore(onTheme, dark, () => true);

const TONE: Record<string, string> = { easy: "text-success", medium: "text-foreground", hard: "text-danger" };

/**
 * Coding round: problem statement on the left, a VS Code-like editor (Monaco) with a language picker on the right,
 * Run (visible tests) and the results under it. Code goes to the room debounced; the room keeps the latest version.
 */
export function CodeWorkspace({
  socket,
  problem,
  starter,
  initial,
  run,
}: {
  socket: RoomSocket;
  problem: PublicProblem;
  starter: Record<Language, string>;
  initial: { language: Language; code: string } | null;
  run: { running: boolean; result: RunResult | null };
}) {
  const isDark = useDark();
  const [language, setLanguage] = useState<Language>(initial?.language ?? "python");
  const [code, setCode] = useState(initial?.code ?? starter[initial?.language ?? "python"]);
  const timer = useRef(0);

  const push = (language: Language, code: string) => socket.send({ t: "code", language, code });
  useEffect(() => () => clearTimeout(timer.current), []);

  function edit(v: string) {
    setCode(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => push(language, v), 1500);
  }

  async function switchTo(next: Language) {
    // Untouched starter code just swaps; real work asks first
    if (code.trim() !== starter[language].trim() && !(await ask({ title: `Switch to ${LANGUAGES[next].label}?`, body: "Your current code will be replaced with the starter code.", confirm: "Switch" })))
      return;
    setLanguage(next);
    setCode(starter[next]);
    push(next, starter[next]);
  }

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[minmax(280px,2fr)_3fr]">
      <section className="min-h-0 space-y-4 overflow-y-auto border-b border-border p-4 text-sm leading-relaxed lg:border-r lg:border-b-0">
        <div>
          <h2 className="font-display text-xl font-normal">{problem.title}</h2>
          <p className={`text-xs font-medium capitalize ${TONE[problem.difficulty]}`}>{problem.difficulty}</p>
        </div>
        <p className="whitespace-pre-wrap">{problem.statement}</p>
        {[
          ["Input", `Line 1: T, the number of test cases. Then each case. ${problem.input}`],
          ["Output", `One line per test case. ${problem.output}`],
          ["Constraints", problem.constraints],
        ].map(([k, v]) => (
          <div key={k}>
            <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{k}</h3>
            <p className="whitespace-pre-wrap">{v}</p>
          </div>
        ))}
        <div className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Examples</h3>
          {problem.visible.map((t) => (
            <div key={t.name} className="grid grid-cols-2 gap-2 font-mono text-xs">
              <pre className="overflow-x-auto rounded-md bg-surface p-2 whitespace-pre">{`1\n${t.input}`}</pre>
              <pre className="overflow-x-auto rounded-md bg-surface p-2 whitespace-pre">{t.output}</pre>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">There are also hidden tests your interviewer may run.</p>
      </section>

      <section className="flex min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
          <Select
            aria-label="Language"
            value={language}
            onChange={(v) => void switchTo(v as Language)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
            options={Object.entries(LANGUAGES).map(([value, l]) => ({ value, label: l.label }))}
          />
          <button
            type="button"
            aria-busy={run.running}
            disabled={run.running}
            className={`${primary} h-8`}
            onClick={() => (clearTimeout(timer.current), push(language, code), socket.send({ t: "run" }))}
          >
            <Icon d="M6 4l14 8-14 8z" size={14} />
            {run.running ? "Running…" : "Run"}
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <Editor
            language={LANGUAGES[language].monaco}
            value={code}
            onChange={(v) => edit(v ?? "")}
            theme={isDark ? "vs-dark" : "light"}
            options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, tabSize: 4, automaticLayout: true }}
          />
        </div>
        <Results run={run} />
      </section>
    </div>
  );
}

function Results({ run }: { run: { running: boolean; result: RunResult | null } }) {
  const r = run.result;
  return (
    <div className="max-h-56 shrink-0 overflow-y-auto border-t border-border p-3 text-sm" aria-live="polite">
      {run.running ? (
        <p className="text-muted">Running your code…</p>
      ) : !r ? (
        <p className="text-muted">Run your code to test it against the examples.</p>
      ) : (
        <div className="space-y-2">
          <p className={`font-medium ${r.status === "Accepted" ? "text-success" : "text-danger"}`}>
            {r.status === "unavailable" ? "Code execution is unavailable right now" : `${r.status} · ${r.passed}/${r.total} passed`}
            {r.time != null && <span className="ml-2 text-xs font-normal text-muted">{r.time}s · {Math.round((r.memory ?? 0) / 1024)} MB</span>}
          </p>
          {r.error && <pre className="overflow-x-auto rounded-md bg-surface p-2 font-mono text-xs whitespace-pre-wrap text-danger">{r.error}</pre>}
          <ul className="space-y-1">
            {r.cases.map((c) => (
              <li key={c.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                <span className={c.passed ? "text-success" : "text-danger"}>
                  <Icon d={c.passed ? icons.check : icons.close} size={12} className="inline" /> {c.name}
                </span>
                {!c.passed && c.expected !== undefined && (
                  <span className="font-mono text-muted">
                    expected <span className="text-foreground">{c.expected}</span> · got <span className="text-foreground">{c.got || "(nothing)"}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type ExEl = {
  id: string;
  type: string;
  isDeleted?: boolean;
  text?: string;
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  points?: readonly (readonly [number, number])[];
  version?: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type ExApi = { getSceneElements(): readonly ExEl[]; getFiles(): Record<string, unknown> };

/** Excalidraw elements → the fields the room's scene parser needs. */
export const toBoard = (els: readonly ExEl[]): BoardElement[] =>
  els
    .filter((e) => !e.isDeleted)
    .map((e) => ({
      id: e.id,
      type: e.type,
      ...(e.text !== undefined && { text: e.text }),
      containerId: e.containerId ?? null,
      start: e.startBinding?.elementId ?? null,
      end: e.endBinding?.elementId ?? null,
      // Arrow endpoints in scene coordinates, so arrows that weren't snapped to a box still count as connections
      ...(e.points?.length && {
        p1: [Math.round(e.x + e.points[0][0]), Math.round(e.y + e.points[0][1])] as [number, number],
        p2: [Math.round(e.x + e.points.at(-1)![0]), Math.round(e.y + e.points.at(-1)![1])] as [number, number],
      }),
      x: Math.round(e.x),
      y: Math.round(e.y),
      w: Math.round(e.width),
      h: Math.round(e.height),
    }));

/**
 * System design round: the prompt and requirements on top, an infinite Excalidraw canvas below. Scene changes go to
 * the room debounced (structure for the agent, raw elements for the replay); the room can ask for a PNG snapshot.
 */
export function Whiteboard({
  socket,
  design,
  initial,
  onSnapshot,
}: {
  socket: RoomSocket;
  design: { title: string; prompt: string; requirements: string[] };
  initial: unknown[];
  onSnapshot: (fn: (id: string) => void) => void;
}) {
  const isDark = useDark();
  const api = useRef<ExApi | null>(null);
  const timer = useRef(0);
  const last = useRef("");

  useEffect(() => {
    onSnapshot(async (id) => {
      const a = api.current;
      if (!a) return socket.send({ t: "snapshot", id, png: null });
      const blob = await exportToBlob({
        elements: a.getSceneElements() as never,
        files: a.getFiles() as never,
        mimeType: "image/png",
        maxWidthOrHeight: 1600,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" } as never,
      }).catch(() => null);
      if (!blob) return socket.send({ t: "snapshot", id, png: null });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      socket.send({ t: "snapshot", id, png: btoa(bin) });
    });
    return () => clearTimeout(timer.current);
  }, [onSnapshot, socket]);

  /**
   * Excalidraw calls onChange on every render, selection and hover too. Only a real edit (an element's version
   * changes) restarts the debounce; otherwise constant re-renders would keep postponing the send forever.
   */
  function change(els: readonly ExEl[]) {
    const live = els.filter((e) => !e.isDeleted);
    const key = live.map((e) => `${e.id}:${e.version ?? 0}`).join(",");
    if (key === last.current) return;
    last.current = key;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => socket.send({ t: "board", elements: toBoard(live), raw: live }), 1200);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section className="shrink-0 space-y-1 border-b border-border px-4 py-3 text-sm">
        <h2 className="font-medium">{design.title}</h2>
        <p className="text-muted">{design.prompt}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {design.requirements.map((r) => (
            <li key={r} className="flex items-center gap-1">
              <Icon d={icons.check} size={12} />
              {r}
            </li>
          ))}
        </ul>
      </section>
      <div className="min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(a) => void (api.current = a as unknown as ExApi)}
          initialData={{ elements: initial as never, appState: { viewBackgroundColor: isDark ? "#121212" : "#ffffff" } }}
          theme={isDark ? "dark" : "light"}
          onChange={(els) => change(els as unknown as readonly ExEl[])}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
        />
      </div>
    </div>
  );
}

/** Read-only board for the report's whiteboard timeline. */
export function BoardView({ elements }: { elements: unknown[] }) {
  const isDark = useDark();
  const api = useRef<{ updateScene(o: object): void } | null>(null);
  useEffect(() => api.current?.updateScene({ elements }), [elements]);
  return (
    <Excalidraw
      excalidrawAPI={(a) => void (api.current = a as never)}
      initialData={{ elements: elements as never, scrollToContent: true }}
      viewModeEnabled
      zenModeEnabled
      theme={isDark ? "dark" : "light"}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, changeViewBackgroundColor: false, clearCanvas: false, toggleTheme: false } }}
    />
  );
}

/** Read-only code for the report's code timeline. */
export function CodeView({ code, language }: { code: string; language: Language }) {
  const isDark = useDark();
  return (
    <Editor
      language={LANGUAGES[language]?.monaco ?? "plaintext"}
      value={code}
      theme={isDark ? "vs-dark" : "light"}
      options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
    />
  );
}
