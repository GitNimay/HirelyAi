import { DurableObject } from "cloudflare:workers";
import { capture } from "../lib/analytics";
import {
  checkpoint,
  describeBoard,
  finishAi,
  markLive,
  roomContext,
  summarize,
  textTurn,
  type RoomContext,
} from "../lib/ai-interview";
import {
  advance,
  applyTool,
  canWake,
  enumsFor,
  heard,
  initState,
  isOver,
  pause,
  PHASES,
  phaseBrief,
  phaseOf,
  phonicTool,
  run,
  systemPrompt,
  tick,
  timeLeft,
  toolsFor,
  untrusted,
  validateCall,
  WORKSPACE_TOOLS,
  type HarnessState,
  type IvEvent,
  type PhaseId,
  type ToolName,
  type Wake,
} from "../lib/harness";
import type { Line } from "../lib/interview-fields";
import { runSuite } from "../lib/sandbox";
import { starters } from "../lib/starters";
import {
  diffLines,
  LANGUAGES,
  publicProblem,
  sceneChange,
  sceneOf,
  type BoardElement,
  type Language,
  type Problem,
  type RunResult,
  type Scene,
} from "../lib/workspace";

const PHONIC = "https://api.phonic.ai/v1/sts/ws";
const VOICE = "nolan"; // male, "confident, direct, professional" per Phonic: suits an interviewer
const GRACE_MS = 5 * 60_000; // a dropped candidate can rejoin within this, with the clock paused
const IDLE_MS = 60_000; // coding/design: no speech and no edits for this long wakes the agent
const FLUSH_MS = 15_000; // event log → R2
const SUMMARY_EVERY = 16; // transcript lines between rolling-summary refreshes
const MAX_PHONIC_FAILURES = 3; // then the room falls back to text chat
const WARM_MS = 45_000; // a pre-opened Phonic socket is used within this, else dropped
// Voice standby (cost): Phonic bills per open minute, and coding/design are mostly silent work. After this long with
// nobody speaking, the conversation closes and the room listens for speech itself; it reconnects (pre-warmed) the
// moment the candidate talks, replaying the buffered audio so their first words aren't lost.
const STANDBY_MS = 90_000;
const PREROLL_FRAMES = 75; // 1.5 s of 20 ms frames kept while in standby
const SPEECH_RMS = 900; // PCM16 RMS that counts as speech (the mic has noise suppression on)
const SPEECH_FRAMES = 5; // consecutive loud frames (100 ms) before waking

type Saved = {
  sessionId: string;
  state: HarnessState;
  transcript: Line[];
  summary: string;
  summarized: number;
  code: { language: Language; code: string } | null;
  board: { elements: BoardElement[]; raw: unknown[] } | null;
  whiteboard: { topic: string; requirements: string[]; open: boolean } | null; // the design question on screen
  fallback: boolean;
};

/**
 * One AI interview session. The candidate's browser holds one WebSocket here (mic PCM in, interviewer PCM and
 * room events out); this object holds the Phonic speech-to-speech socket and runs the harness (lib/harness.ts):
 * phase clock, phase-scoped tools, wake triggers, memory, checkpoints and the event log. Tool calls never pass
 * through the browser, so the candidate can't forge them.
 *
 * ponytail: not hibernatable (the outbound Phonic socket keeps the object awake for the call). Fine at Phonic's 10
 * concurrent conversations; that's also the free Durable Object duration budget's natural ceiling.
 */
export class InterviewRoom extends DurableObject<Env> {
  room: RoomContext | null = null;
  s: Saved | null = null;
  client: WebSocket | null = null;
  phonic: WebSocket | null = null;
  phonicFailures = 0;
  ready = false; // Phonic accepted the config
  timer: ReturnType<typeof setInterval> | null = null;
  events: IvEvent[] = [];
  flushedAt = 0;
  flushSeq = 0;
  agentText = "";
  agentSpeaking = false;
  candidateSpeaking = false;
  lastActivity = 0; // speech or edits, for the idle wake
  lastCodeRead = "";
  scene: Scene = { elements: [], connections: [] };
  paused: string | null = null; // proctoring pause reason
  ending = false;
  snapshots = new Map<string, (png: string | null) => void>();
  silence = new Uint8Array(640); // 20 ms of 16 kHz PCM16, sent while proctoring has the room paused

  // ── Connection ────────────────────────────────────────────────────────────────────────────────────────────────────

  async fetch(request: Request) {
    const sessionId = request.headers.get("X-Session-Id")!;
    this.room ??= await roomContext(sessionId);
    const room = this.room;
    if (!room || !["onboarded", "live"].includes(room.status) || this.ending)
      return new Response("This interview can't be joined", { status: 409 });
    const { 0: browser, 1: server } = new WebSocketPair();
    server.accept();
    // One tab at a time: a second tab takes over, the first is told why
    if (this.client) {
      this.send({ t: "error", message: "The interview was opened in another tab." });
      this.client.close(4000, "replaced");
    }
    this.client = server;
    server.addEventListener("message", (e) => void this.onClient(e.data).catch((err) => this.fail("client", err)));
    server.addEventListener("close", () => this.client === server && void this.onDisconnect());
    server.addEventListener("error", () => this.client === server && void this.onDisconnect());
    void this.onConnect().catch((err) => this.fail("connect", err));
    return new Response(null, { status: 101, webSocket: browser });
  }

  async onConnect() {
    const room = this.room!;
    const now = Date.now();
    await this.ctx.storage.deleteAlarm();
    this.s ??= (await this.ctx.storage.get<Saved>("saved")) ?? {
      sessionId: room.id,
      state: room.state ?? initState(room.config, now),
      transcript: [],
      summary: "",
      summarized: 0,
      code: null,
      board: null,
      whiteboard: null,
      fallback: false,
    };
    const fresh = this.s.state.log.length === 0;
    await markLive(room.id, now);
    this.log({ at: now, type: "session", what: fresh ? "connected" : "resumed" });
    if (fresh) this.log({ at: now, type: "phase", from: null, to: phaseOf(this.s.state), reason: "start" });
    // PostHog (ids only): funnel, drop-offs, reconnects, voice fallbacks, why interviews end
    capture(room.id, fresh ? "interview started" : "interview rejoined", { kind: "ai", $process_person_profile: false });
    this.lastActivity = now;
    await this.prepare(phaseOf(this.s.state));
    this.restoreWorkspace();
    this.timer ??= setInterval(() => void this.onTick().catch((e) => this.fail("tick", e)), 1000);
    if (this.s.fallback) return this.send({ t: "fallback" }), this.syncClock();
    // The clock waits for the interviewer: it starts (or resumes) when Phonic is ready, not when the browser connects
    this.syncClock();
    this.send({ t: "stage", stage: "joining" });
    await this.connectPhonic(fresh ? "start" : "reconnect");
  }

  async onDisconnect() {
    this.client = null;
    if (this.ending || !this.s) return;
    const now = Date.now();
    this.syncClock();
    this.log({ at: now, type: "session", what: "disconnected" });
    this.closePhonic();
    this.stopTimer();
    await this.save();
    await this.flush();
    // Hold the session for the grace period; the alarm ends it if they don't come back
    await this.ctx.storage.setAlarm(now + GRACE_MS);
  }

  async alarm() {
    if (this.client) return; // they came back
    this.s ??= (await this.ctx.storage.get<Saved>("saved")) ?? null;
    if (!this.s) return;
    this.room ??= await roomContext(this.s.sessionId);
    if (!this.room) return;
    this.log({ at: Date.now(), type: "session", what: "ended", detail: "abandoned: didn't rejoin within the grace period" });
    await this.finish("abandoned");
  }

  // ── Phonic ────────────────────────────────────────────────────────────────────────────────────────────────────────

  async connectPhonic(why: "start" | "reconnect" | "retry" | "resume") {
    const room = this.room!;
    const s = this.s!;
    const phase = phaseOf(s.state);
    if (!phase) return;
    this.ready = false;
    this.connectStarted = Date.now();
    // A socket pre-opened while the candidate read the overview (warm()) skips the slow handshake
    const warm = this.warmed;
    this.warmed = null;
    const ws = warm && Date.now() - warm.at < WARM_MS ? warm.ws : await this.openPhonic();
    if (!ws) return this.onPhonicFailure("upgrade failed");
    if (ws !== warm?.ws) warm?.ws.close(1000, "stale");
    this.phonic = ws;
    ws.addEventListener("message", (e) => void this.onPhonic(ws, e.data).catch((err) => this.fail("phonic", err)));
    ws.addEventListener("close", (e) => this.phonic === ws && this.onPhonicClosed(e.code, e.reason));
    ws.addEventListener("error", () => this.phonic === ws && this.onPhonicClosed(1006, "error"));
    ws.send(
      JSON.stringify({
        type: "config",
        system_prompt: this.prompt(phase),
        voice_id: VOICE,
        input_format: "pcm_16000",
        output_format: "pcm_16000",
        generate_welcome_message: why === "start",
        welcome_message: null,
        tools: this.phaseTools(phase),
        // Thinking pauses shouldn't end the candidate's turn; "yeah", "okay" or "so..." shouldn't cut the interviewer off
        vad_min_silence_duration_ms: 1200,
        min_words_to_interrupt: 3,
        no_input_poke_sec: null, // the harness decides when to nudge (idle wake), not a silence timer
        no_input_end_conversation_sec: 600,
        websocket_timeout_sec: 300,
        boosted_keywords: [...room.candidate.skills, room.job.company].map((k) => k.slice(0, 50)).slice(0, 50),
        external_id: room.id,
      }),
    );
    if (why === "reconnect" || why === "retry")
      this.pendingWake = { why: "reconnect", text: "Harness: the connection was restored. Welcome them back in one sentence and continue where you left off." };
  }
  pendingWake: { why: Wake; text: string } | null = null;
  connectStarted = 0;
  warmed: { ws: WebSocket; at: number } | null = null;

  /** The WebSocket handshake with Phonic (no config yet: nothing is billed or said until config is sent). */
  async openPhonic() {
    const t0 = Date.now();
    const res = await fetch(PHONIC, {
      headers: { Upgrade: "websocket", Authorization: `Bearer ${this.env.PHONIC_API_KEY}` },
    }).catch((e) => (console.error("phonic connect", String(e)), null));
    const ws = res?.webSocket;
    if (!ws) {
      console.error("phonic upgrade failed", res?.status, await res?.text().catch(() => ""));
      return null;
    }
    ws.accept();
    console.log(JSON.stringify({ msg: "phonic connected", ms: Date.now() - t0 }));
    return ws;
  }

  /**
   * Called while the candidate reads the overview: opens the Phonic socket ahead of time so the interviewer joins
   * right after Start (the handshake is the slow part). Idempotent; an unused socket expires after WARM_MS.
   */
  async warm() {
    if (this.ending || this.phonic || (this.warmed && Date.now() - this.warmed.at < WARM_MS)) return;
    const ws = await this.openPhonic();
    if (!ws) return;
    const entry = { ws, at: Date.now() };
    this.warmed = entry;
    ws.addEventListener("close", () => void (this.warmed === entry && (this.warmed = null)));
    setTimeout(() => {
      if (this.warmed !== entry) return;
      this.warmed = null;
      ws.close(1000, "unused");
    }, WARM_MS);
  }

  phaseTools(phase: PhaseId) {
    const enums = enumsFor(this.room!.config, this.room!.plan);
    return toolsFor(phase, { design: this.room!.config.design.enabled }).map((n) => phonicTool(n, enums));
  }

  prompt(phase: PhaseId) {
    return systemPrompt(phase, this.promptCtx(), this.s!.state, Date.now());
  }

  /** What the prompts need: the plan, the job, and memory (rolling summary + the last few lines, for a fresh conversation). */
  promptCtx() {
    const r = this.room!;
    const s = this.s!;
    const recent = s.transcript.slice(-8).map((l) => `${l.role === "agent" ? "You" : "Candidate"}: ${l.text}`).join("\n");
    return {
      job: r.job,
      candidate: r.candidate,
      plan: r.plan,
      config: r.config,
      summary: [s.summary, recent && `Most recent lines:\n${recent}`].filter(Boolean).join("\n\n"),
      problem: this.problem(s.state.assigned.problem) ?? r.plan.problems?.[0],
    };
  }

  /** A problem from this candidate's plan (primary or a backup). */
  problem(id: string | undefined): Problem | undefined {
    return id ? this.room!.plan.problems?.find((p) => p.id === id) : undefined;
  }

  /** Puts a problem in the candidate's editor with fresh starter code. */
  showProblem(p: Problem) {
    const s = this.s!;
    s.state = { ...s.state, assigned: { ...s.state.assigned, problem: p.id, tried: [...(s.state.assigned.tried ?? []), p.id] } };
    s.code = { language: s.code?.language ?? "python", code: starters(p.signature)[s.code?.language ?? "python"] };
    this.lastCodeRead = "";
    this.log({ at: Date.now(), type: "assign", what: "problem", id: p.id });
    this.send({ t: "problem", problem: publicProblem(p), starter: starters(p.signature), code: s.code });
  }

  /** The harness puts the round's work on screen itself (deterministic, nothing for the agent to narrate). */
  async prepare(phase: PhaseId | null) {
    const first = this.room!.plan.problems?.[0];
    if (phase === "coding" && first && !this.s!.state.assigned.problem) this.showProblem(first);
    // Leaving the Experience round closes a whiteboard the agent left open
    if (phase !== "resume" && this.s!.whiteboard?.open) this.closeWhiteboard();
  }

  closeWhiteboard() {
    const s = this.s!;
    if (s.whiteboard) s.whiteboard = { ...s.whiteboard, open: false };
    this.send({ t: "board-close" });
  }

  /** Re-briefs the agent for a new phase: that phase's tools, then its private brief. */
  brief(phase: PhaseId) {
    this.sendPhonic({ type: "update_tools_subset", tools: this.phaseTools(phase) });
    this.sendPhonic({ type: "add_system_message", system_message: phaseBrief(phase, this.promptCtx(), this.s!.state, Date.now()) });
  }

  sendPhonic(msg: object) {
    try {
      this.phonic?.send(JSON.stringify(msg));
    } catch {
      // closing; the close handler reconnects
    }
  }

  closePhonic() {
    const ws = this.phonic;
    this.phonic = null;
    this.ready = false;
    try {
      ws?.close(1000, "done");
    } catch {}
  }

  onPhonicClosed(code: number, reason: string) {
    this.phonic = null;
    this.ready = false;
    this.syncClock(); // voice is down: the candidate isn't losing time while it reconnects
    if (this.ending || !this.client || this.s?.fallback) return;
    // Phonic ends a conversation on its own after long silences or errors: the interview isn't over, start a new one
    this.log({ at: Date.now(), type: "session", what: "error", detail: `phonic closed ${code} ${reason}`.slice(0, 200) });
    void this.onPhonicFailure(`closed ${code}`);
  }

  async onPhonicFailure(detail: string) {
    this.phonicFailures++;
    if (this.phonicFailures >= MAX_PHONIC_FAILURES) {
      // Speech provider failure: carry on as a text chat in the room
      this.s!.fallback = true;
      this.log({ at: Date.now(), type: "session", what: "fallback", detail });
      capture(this.room!.id, "interview voice fallback", { kind: "ai", detail, $process_person_profile: false });
      this.send({ t: "fallback" });
      this.syncClock();
      await this.textReply("The voice connection failed, so the interview continues by text. Tell the candidate in one sentence and continue.");
      return;
    }
    this.send({ t: "stage", stage: "reconnecting", attempt: this.phonicFailures });
    await new Promise((r) => setTimeout(r, 1000 * this.phonicFailures));
    if (this.client && !this.ending) await this.connectPhonic("retry");
  }

  async onPhonic(ws: WebSocket, data: string | ArrayBuffer) {
    if (this.phonic !== ws || typeof data !== "string") return;
    const m = JSON.parse(data) as { type: string; [k: string]: unknown };
    const now = Date.now();
    switch (m.type) {
      case "ready_to_start_conversation":
        console.log(JSON.stringify({ msg: "interviewer ready", ms: Date.now() - this.connectStarted }));
        this.ready = true;
        this.phonicFailures = 0;
        this.syncClock();
        this.send({ t: "stage", stage: "ready" });
        this.send({ t: "state", agent: "listening" });
        for (const f of this.preroll.splice(0)) this.sendAudio(f); // what they said while the conversation resumed
        this.lastSpeech = now;
        if (this.pendingWake) {
          // Already counted against the wake budget when it was raised: deliver it straight away
          this.queuedReply = this.pendingWake.text;
          this.pendingWake = null;
          this.flushReply();
        }
        return;
      case "conversation_created":
        return this.log({ at: now, type: "session", what: "connected", detail: `phonic ${String(m.conversation_id)}` });
      case "audio_chunk": {
        if (m.audio && this.client && !this.paused) {
          const bin = atob(m.audio as string);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          this.client.send(bytes);
        }
        if (m.text) {
          this.agentText += m.text as string;
          this.send({ t: "cap", who: "agent", text: this.agentText });
        }
        return;
      }
      case "assistant_started_speaking":
        this.lastSpeech = now;
        this.agentSpeaking = true;
        this.agentText = "";
        return this.send({ t: "state", agent: "speaking" });
      case "assistant_finished_speaking":
        this.agentSpeaking = false;
        this.send({ t: "state", agent: "listening" });
        this.flushReply();
        return this.utter("agent", this.agentText, now);
      case "interrupted_response":
        // Barge-in: drop the audio the browser still has queued, keep only what was actually said
        this.agentSpeaking = false;
        this.send({ t: "flush" });
        this.send({ t: "state", agent: "listening" });
        return this.utter("agent", String(m.text ?? this.agentText), now, true);
      case "user_started_speaking":
        this.candidateSpeaking = true;
        this.queuedReply = null; // their turn gets its own reply; the harness note is already in context
        this.lastActivity = now;
        return this.send({ t: "you", speaking: true });
      case "user_finished_speaking":
        this.lastSpeech = now;
        this.nudges = 0;
        this.candidateSpeaking = false;
        this.lastActivity = now;
        this.send({ t: "you", speaking: false });
        return this.send({ t: "state", agent: "thinking" });
      case "input_text":
        this.send({ t: "cap", who: "you", text: String(m.text ?? "") });
        if (this.s && String(m.text ?? "").trim()) this.s.state = heard(this.s.state);
        return this.utter("candidate", String(m.text ?? ""), now);
      case "tool_call":
        return this.onToolCall(String(m.tool_call_id), String(m.tool_name), m.parameters);
      case "assistant_chose_not_to_respond":
        return this.send({ t: "state", agent: "listening" });
      case "assistant_ended_conversation":
        // Only end_interview (or the clock) ends the interview; Phonic ending its conversation just means reconnect
        if (!this.ending) this.onPhonicClosed(1000, "assistant ended conversation");
        return;
      case "error":
        console.error("phonic error", JSON.stringify(m).slice(0, 500));
        return this.log({ at: now, type: "session", what: "error", detail: JSON.stringify(m.error).slice(0, 300) });
      default:
        return;
    }
  }

  /** One finished utterance: transcript, event log, checkpoint, and a rolling summary refresh every so often. */
  async utter(role: Line["role"], text: string, at: number, interrupted = false) {
    const t = text.trim();
    if (!t) return;
    const s = this.s!;
    s.transcript.push({ role, text: t });
    this.log({ at, type: "utterance", role, text: t, ...(interrupted && { interrupted }) });
    await checkpoint(this.room!.id, s.state, s.transcript);
    if (s.transcript.length - s.summarized >= SUMMARY_EVERY) void this.refreshSummary();
  }

  async refreshSummary() {
    const s = this.s!;
    const upto = s.transcript.length;
    const next = await summarize(s.summary, s.transcript.slice(s.summarized, upto));
    s.summary = next;
    s.summarized = upto;
  }

  // ── Tools ─────────────────────────────────────────────────────────────────────────────────────────────────────────

  async onToolCall(id: string, name: string, params: unknown) {
    this.toolsInFlight++;
    try {
      const output = await this.runTool(id, name, params);
      this.sendPhonic({ type: "tool_call_output", tool_call_id: id, output });
    } finally {
      this.toolsInFlight--;
    }
  }
  toolsInFlight = 0;
  lastSpeech = 0;
  nudges = 0; // idle nudges since the candidate last spoke

  /** Validates (phase + schema), runs, logs. Shared by the voice agent and the text fallback. */
  async runTool(id: string, name: string, params: unknown): Promise<unknown> {
    const s = this.s!;
    const room = this.room!;
    const now = Date.now();
    this.log({ at: now, type: "tool_call", id, name, args: params });
    const v = validateCall(s.state, name, params, enumsFor(room.config, room.plan));
    let result: unknown;
    let effect: "advance" | "end" | undefined;
    if (!v.ok) result = { error: v.error };
    else if (WORKSPACE_TOOLS.includes(v.name)) result = await this.workspaceTool(v.name, v.args);
    else {
      const out = applyTool(
        s.state,
        v.name,
        v.args,
        {
          plan: room.plan,
          rubric: room.config.rubric,
          role: { title: room.job.title, company: room.job.company, level: room.job.level },
          profile: room.candidate,
          faq: room.faq,
        },
        now,
      );
      s.state = out.state;
      result = out.result;
      effect = out.effect;
    }
    // An approved move happens now, so the new phase's tools and brief reach the agent before it continues; the
    // tool result tells it to follow them (no extra generate_reply: it's already mid-turn and would talk twice)
    if (effect === "advance") {
      const to = await this.transition("approved");
      if (to) result = { approved: true, now_in_phase: PHASES[to].label, next: "Follow the Harness brief for this phase now." };
    }
    this.log({ at: Date.now(), type: "tool_result", id, name, result });
    await checkpoint(room.id, s.state, s.transcript);
    if (effect === "end") setTimeout(() => void this.endAfterGoodbye(), 0);
    return result;
  }

  async workspaceTool(name: ToolName, a: Record<string, string | number>): Promise<unknown> {
    const s = this.s!;
    const now = Date.now();
    switch (name) {
      case "switch_problem": {
        const tried = s.state.assigned.tried ?? [];
        const next = this.room!.plan.problems?.find((p) => !tried.includes(p.id));
        if (!next) return { error: "No backup problem left. Simplify the current one with a hint instead." };
        this.showProblem(next);
        this.log({ at: now, type: "session", what: "resumed", detail: `problem switched: ${String(a.reason).slice(0, 120)}` });
        return { ok: true, title: next.title, statement: next.statement, note: "The new problem is on their screen with fresh starter code. Introduce it in one sentence." };
      }
      case "read_editor": {
        if (!s.code) return { error: "No problem assigned yet." };
        const diff = diffLines(this.lastCodeRead, s.code.code);
        this.lastCodeRead = s.code.code;
        return {
          language: LANGUAGES[s.code.language].label,
          code: untrusted("code", s.code.code.slice(0, 8000)),
          diff_since_last_read: diff ? untrusted("diff", diff) : "no changes",
          idle_seconds: Math.round((now - this.lastActivity) / 1000),
        };
      }
      case "run_tests": {
        const suite = a.suite as "visible" | "hidden";
        const r = await this.execute("agent", suite);
        if (typeof r === "string") return { error: r };
        // The agent learns which kinds of hidden cases fail (names), never their inputs or expected outputs
        return { passed: r.passed, total: r.total, status: r.status, failing: r.cases.filter((c) => !c.passed).map((c) => c.name), runtime_s: r.time, memory_kb: r.memory, error: r.error ? untrusted("error", r.error.slice(0, 800)) : "" };
      }
      case "get_run_history":
        return { runs: s.state.runs.map((r) => ({ by: r.by, suite: r.suite, passed: r.passed, total: r.total, status: r.status, seconds_ago: Math.round((now - r.at) / 1000) })) };
      case "open_whiteboard": {
        const topic = String(a.topic);
        const requirements = String(a.requirements).split(/[;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
        s.state = { ...s.state, assigned: { ...s.state.assigned, design: topic } };
        // A new question starts on a clean board; reopening the same one keeps the sketch
        if (s.whiteboard?.topic !== topic) {
          s.board = null;
          this.scene = { elements: [], connections: [] };
        }
        s.whiteboard = { topic, requirements, open: true };
        this.log({ at: now, type: "assign", what: "design", id: topic });
        this.send({ t: "design", design: { id: topic, title: topic, prompt: "", requirements }, elements: s.board?.raw ?? [] });
        return { ok: true, note: "The whiteboard is open on their screen with this question." };
      }
      case "close_whiteboard":
        this.closeWhiteboard();
        return { ok: true };
      case "read_whiteboard":
        return this.scene.elements.length
          ? { scene: untrusted("whiteboard", JSON.stringify(this.scene)) }
          : { scene: "The whiteboard is empty." };
      case "snapshot_whiteboard": {
        if (!this.scene.elements.length) return { description: "The whiteboard is empty." };
        const png = await this.requestSnapshot();
        if (!png) return { error: "Couldn't capture the whiteboard. Use read_whiteboard instead." };
        const description = await describeBoard(png);
        return description ? { description: untrusted("whiteboard_image", description) } : { error: "Image description unavailable. Use read_whiteboard." };
      }
      default:
        return { error: `Unknown workspace tool ${name}` };
    }
  }

  /** Runs the current code in the sandbox (candidate: visible only; agent: either). Logged, shown, remembered. */
  /** A string result is an error message for the agent. */
  async execute(by: "candidate" | "agent", suite: "visible" | "hidden"): Promise<RunResult | string> {
    const s = this.s!;
    const p = this.problem(s.state.assigned.problem);
    if (!p || !s.code) return "No problem assigned yet.";
    const { language, code } = s.code;
    this.send({ t: "running", suite, by });
    const r = await runSuite(language, code, suite === "visible" ? p.visible : p.hidden, suite);
    if (r.status === "unavailable") {
      this.send({ t: "run", result: r });
      return "Execution unavailable right now: continue the discussion verbally.";
    }
    const at = Date.now();
    s.state = { ...s.state, runs: [...s.state.runs, { at, by, suite, passed: r.passed, total: r.total, status: r.status }].slice(-50) };
    this.log({ at, type: "run", by, language, result: r });
    this.send({ t: "run", result: r });
    return r;
  }

  requestSnapshot() {
    const id = crypto.randomUUID();
    this.send({ t: "snapshot", id });
    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => (this.snapshots.delete(id), resolve(null)), 8000);
      this.snapshots.set(id, (png) => (clearTimeout(timer), this.snapshots.delete(id), resolve(png)));
    });
  }

  // ── Phases, clock, wakes ──────────────────────────────────────────────────────────────────────────────────────────

  async onTick() {
    const s = this.s;
    if (!s || this.ending) return;
    const now = Date.now();
    const due = tick(s.state, now);
    if (due === "warn") {
      s.state = { ...s.state, warned: true };
      const phase = phaseOf(s.state)!;
      this.log({ at: now, type: "warning", phase });
      const left = Math.ceil(timeLeft(s.state, now).phase / 60);
      if (this.s?.fallback) return;
      this.sendPhonic({ type: "add_system_message", system_message: `Harness: about ${left} minute${left === 1 ? "" : "s"} left in the ${PHASES[phase].label} phase. Start wrapping it up.` });
    }
    if (due === "force") return void (await this.transition("forced"));
    this.flushReply();
    // Silent work: coding, or sketching on the whiteboard
    const working = phaseOf(s.state) === "coding" || !!s.whiteboard?.open;
    // Idle nudges back off (1, 2, 4 min…) so a thinking candidate isn't nagged; speaking resets the ladder
    if (working && s.state.since !== null && !this.agentSpeaking && !this.candidateSpeaking && now - this.lastActivity > IDLE_MS * 2 ** this.nudges) {
      this.lastActivity = now;
      this.nudges++;
      this.wake("idle", "Harness: the candidate hasn't spoken or changed anything for a minute. Check in briefly: ask what they're thinking. Offer the next hint level only if they say they're stuck.");
    }
    const quiet = now - this.lastSpeech; // typing is silent work: only speech keeps the conversation open
    if (working && this.ready && !this.paused && !this.agentSpeaking && !this.candidateSpeaking && !this.toolsInFlight && !this.queuedReply && quiet > STANDBY_MS)
      this.enterStandby();
    if (this.standby && !this.warmed) void this.warm();
    if (now % 5000 < 1000) this.sendClock();
    if (now - this.flushedAt > FLUSH_MS) await this.flush();
  }

  /** Moves to the next phase (approved by the harness, or forced by the clock) and re-briefs the agent. Returns the new phase. */
  async transition(reason: "approved" | "forced"): Promise<PhaseId | null> {
    const s = this.s!;
    const room = this.room!;
    const from = phaseOf(s.state);
    if (!from) return null;
    const now = Date.now();
    s.state = advance(s.state, now, room.plan.claims.map((c) => c.id));
    const to = phaseOf(s.state);
    this.log({ at: now, type: "phase", from, to, reason });
    this.sendClock();
    if (!to || isOver(s.state)) return void (await this.finish("completed")), null;
    await this.prepare(to);
    await checkpoint(room.id, s.state, s.transcript);
    void this.refreshSummary();
    if (s.fallback) {
      void this.textReply(`${phaseBrief(to, this.promptCtx(), s.state, now)}\nSay one natural transition sentence and begin.`);
      return to;
    }
    this.brief(to);
    if (reason === "forced")
      this.wake("phase", `Harness: time is up for ${PHASES[from].label}. Say one short transition sentence and start ${PHASES[to].label}.`);
    return to;
  }

  /**
   * Prompts the agent without candidate speech, rate-limited unless urgent. If the agent is talking, running a tool
   * or the candidate is speaking, the reply waits for a quiet moment (and is dropped if the candidate speaks first),
   * so the interviewer never talks over itself or answers twice.
   */
  wake(why: Wake, text: string) {
    const s = this.s!;
    const now = Date.now();
    if (!canWake(s.state, why, now) || this.paused) return;
    s.state = { ...s.state, lastWake: now };
    this.log({ at: now, type: "wake", why });
    if (s.fallback) return void this.textReply(text);
    if (this.standby) void this.resume("wake");
    if (!this.ready) return void (this.pendingWake = { why, text });
    this.queuedReply = text;
    this.flushReply();
  }
  queuedReply: string | null = null;

  flushReply() {
    if (!this.queuedReply || !this.ready || this.agentSpeaking || this.candidateSpeaking || this.toolsInFlight) return;
    const text = this.queuedReply;
    this.queuedReply = null;
    this.sendPhonic({ type: "generate_reply", system_message: text });
  }

  /**
   * The phase clock runs only while the interview can actually happen: candidate connected, interviewer ready (or
   * the text fallback is on), and no proctoring pause. Called whenever any of those change.
   */
  syncClock() {
    const s = this.s;
    if (!s || this.ending) return;
    const now = Date.now();
    const go = !!this.client && (this.ready || this.standby || this.resuming || s.fallback) && !this.paused;
    const was = s.state.since !== null;
    s.state = go ? run(s.state, now) : pause(s.state, now);
    if (go !== was) this.sendClock();
  }

  sendClock() {
    const s = this.s;
    if (!s) return;
    const t = timeLeft(s.state, Date.now());
    this.send({
      t: "clock",
      index: s.state.index,
      phases: s.state.phases.map((p) => ({ id: p.id, label: PHASES[p.id].label, seconds: p.seconds })),
      phaseLeft: t.phase,
      totalLeft: t.total,
      running: s.state.since !== null,
    });
  }

  // ── Browser messages ──────────────────────────────────────────────────────────────────────────────────────────────

  sendAudio(frame: Uint8Array) {
    let bin = "";
    for (let i = 0; i < frame.length; i++) bin += String.fromCharCode(frame[i]);
    this.sendPhonic({ type: "audio_chunk", audio: btoa(bin) });
  }

  // ── Voice standby ─────────────────────────────────────────────────────────────────────────────────────────────────

  standby = false;
  resuming = false;
  preroll: Uint8Array[] = [];
  loud = 0;

  /** In standby: keep a short pre-roll and wake on sustained speech energy. */
  listen(frame: Uint8Array) {
    this.preroll.push(frame.slice());
    if (this.preroll.length > PREROLL_FRAMES) this.preroll.shift();
    if (!this.standby) return; // already resuming: just buffering
    const pcm = new Int16Array(frame.buffer, frame.byteOffset, frame.byteLength >> 1);
    let sum = 0;
    for (const v of pcm) sum += v * v;
    this.loud = Math.sqrt(sum / Math.max(1, pcm.length)) > SPEECH_RMS ? this.loud + 1 : 0;
    if (this.loud >= SPEECH_FRAMES) void this.resume("speech");
  }

  /** Closes the (billed) conversation during silent work; the clock keeps running. */
  enterStandby() {
    this.standby = true;
    this.loud = 0;
    this.preroll = [];
    this.log({ at: Date.now(), type: "session", what: "standby" });
    this.closePhonic();
    void this.warm(); // a handshake ready for the moment they speak
  }

  async resume(why: "speech" | "wake") {
    if (!this.standby) return;
    this.standby = false;
    this.resuming = true;
    this.log({ at: Date.now(), type: "session", what: "resumed", detail: `voice: ${why}` });
    await this.connectPhonic("resume");
    this.resuming = false;
  }

  /** Mic frames in arrival order: local dev hands binary frames over as Blobs (async to read), production as ArrayBuffers. */
  audioChain: Promise<void> = Promise.resolve();

  async onClient(data: string | ArrayBuffer | Blob) {
    const s = this.s;
    if (!s) return;
    if (typeof data !== "string") {
      // Mic audio: 16 kHz PCM16, at most 40 ms per chunk (Phonic's limit). Silence while proctoring holds the room.
      this.audioChain = this.audioChain.then(async () => {
        if (s.fallback) return;
        const buf = data instanceof Blob ? await data.arrayBuffer() : data;
        if (!buf.byteLength) return; // Phonic rejects blank chunks
        const frame = this.paused ? this.silence : new Uint8Array(buf, 0, Math.min(buf.byteLength, 1280) & ~1);
        if (this.standby || (this.resuming && !this.ready)) return this.listen(frame);
        if (this.ready) this.sendAudio(frame);
      });
      return this.audioChain;
    }
    const m = JSON.parse(data) as Record<string, unknown>;
    const now = Date.now();
    switch (m.t) {
      case "code": {
        if (typeof m.code !== "string" || !Object.hasOwn(LANGUAGES, String(m.language))) return;
        const code = m.code.slice(0, 100_000);
        if (s.code?.code === code && s.code.language === m.language) return;
        s.code = { language: m.language as Language, code };
        this.lastActivity = now;
        return this.log({ at: now, type: "code", language: s.code.language, code });
      }
      case "run": {
        this.lastActivity = now;
        const r = await this.execute("candidate", "visible");
        if (typeof r !== "string" && r.passed < r.total)
          this.wake("run", `Harness: the candidate just ran the visible tests: ${r.passed}/${r.total} passed (${r.status}). Failing: ${r.cases.filter((c) => !c.passed).map((c) => c.name).join(", ")}. If they seem stuck, ask a question that helps them find the bug themselves; don't point at the fix.`);
        return;
      }
      case "board": {
        if (!Array.isArray(m.elements) || !Array.isArray(m.raw)) return;
        const elements = (m.elements as BoardElement[]).slice(0, 500);
        const next = sceneOf(elements);
        const change = sceneChange(this.scene, next);
        this.scene = next;
        s.board = { elements, raw: (m.raw as unknown[]).slice(0, 500) };
        this.lastActivity = now;
        this.log({ at: now, type: "board", elements: s.board.raw, change });
        if (change) this.wake("board", `Harness: the candidate changed the whiteboard: ${untrusted("whiteboard_change", change)}. If it's a good moment (they've paused), ask about it specifically; otherwise let them keep drawing.`);
        return;
      }
      case "snapshot":
        return this.snapshots.get(String(m.id))?.(typeof m.png === "string" && m.png.length < 2_000_000 ? m.png : null);
      case "paste":
        return this.log({ at: now, type: "paste", chars: Math.max(0, Math.round(Number(m.chars) || 0)) });
      case "integrity":
        return this.onIntegrity(String(m.signal).slice(0, 40), m.detail ? String(m.detail).slice(0, 200) : undefined, !!m.hard, !!m.cleared);
      case "chat":
        if (!s.fallback || typeof m.text !== "string" || !m.text.trim()) return;
        this.lastActivity = now;
        await this.utter("candidate", m.text.slice(0, 2000), now);
        this.log({ at: now, type: "chat", role: "candidate", text: m.text.slice(0, 2000) });
        return this.textReply();
      case "end":
        this.log({ at: now, type: "session", what: "ended", detail: "candidate ended the interview" });
        return this.finish("ended by candidate");
    }
  }

  /**
   * Proctoring signals. Hard violations (full-screen exit, extra monitor, face absent too long) pause the clock and
   * silence the mic until the browser reports them cleared; soft ones are only logged for the report.
   */
  onIntegrity(signal: string, detail: string | undefined, hard: boolean, cleared: boolean) {
    const now = Date.now();
    this.log({ at: now, type: "integrity", signal: cleared ? `${signal} cleared` : signal, detail, hard });
    if (!hard) return;
    if (!cleared && !this.paused) {
      this.paused = signal;
      this.syncClock();
      this.log({ at: now, type: "session", what: "paused", detail: signal });
      this.send({ t: "paused", reason: signal });
      this.send({ t: "flush" });
      this.sendClock();
    } else if (cleared && this.paused === signal) {
      this.paused = null;
      this.syncClock();
      this.log({ at: now, type: "session", what: "resumed", detail: signal });
      this.send({ t: "resumed" });
      this.sendClock();
      this.wake("integrity", "Harness: the interview was paused briefly by proctoring and has resumed. Say one short sentence to continue where you left off; don't accuse the candidate.");
    }
  }

  // ── Text fallback ─────────────────────────────────────────────────────────────────────────────────────────────────

  async textReply(system?: string) {
    const s = this.s!;
    const phase = phaseOf(s.state);
    if (!phase || this.ending) return;
    this.send({ t: "state", agent: "thinking" });
    const reply = await textTurn({
      prompt: this.prompt(phase),
      transcript: s.transcript.slice(-24),
      system,
      tools: this.phaseTools(phase).map((t) => t.tool_schema),
      runTool: (name, args) => this.runTool(crypto.randomUUID(), name, args),
    });
    this.send({ t: "state", agent: "listening" });
    const text = reply || "Sorry, I didn't catch that. Could you say it again?";
    const now = Date.now();
    this.log({ at: now, type: "chat", role: "agent", text });
    this.send({ t: "chat", role: "agent", text });
    await this.utter("agent", text, now);
  }

  // ── Ending ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** end_interview: let the goodbye finish playing before hanging up. */
  async endAfterGoodbye() {
    const started = Date.now();
    while (this.agentSpeaking && Date.now() - started < 15_000) await new Promise((r) => setTimeout(r, 300));
    await new Promise((r) => setTimeout(r, 800));
    await this.finish("completed");
  }

  async finish(reason: string) {
    if (this.ending || !this.s || !this.room) return;
    this.ending = true;
    const s = this.s;
    const now = Date.now();
    this.stopTimer();
    // Close the clock on whatever phase was running, and mark unprobed claims
    while (!isOver(s.state) && phaseOf(s.state) !== null) {
      const from = phaseOf(s.state);
      s.state = advance(s.state, now, this.room.plan.claims.map((c) => c.id));
      this.log({ at: now, type: "phase", from, to: phaseOf(s.state), reason: "end" });
    }
    // Final hidden-test run on the last code, so the evaluator has it even if the agent never ran them
    if (s.state.assigned.problem && s.code && !s.state.runs.some((r) => r.suite === "hidden" && r.at > (this.lastCodeAt ?? 0))) {
      const p = this.problem(s.state.assigned.problem);
      if (p) {
        const r = await runSuite(s.code.language, s.code.code, p.hidden, "hidden");
        this.log({ at: Date.now(), type: "run", by: "agent", language: s.code.language, result: { ...r, final: true } });
      }
    }
    this.log({ at: Date.now(), type: "session", what: "ended", detail: reason });
    this.closePhonic();
    await this.flush();
    await this.env.MEDIA.put(
      `iv/${this.room.id}/final.json`,
      JSON.stringify({ code: s.code, board: s.board?.raw ?? null, scene: this.scene, state: s.state, summary: s.summary }),
      { httpMetadata: { contentType: "application/json" } },
    );
    await finishAi(this.room.id, s.transcript, s.state);
    capture(this.room.id, "interview completed", {
      kind: "ai",
      reason,
      minutes: Math.round((now - s.state.startedAt) / 60_000),
      phases: s.state.log.length,
      hints: s.state.hints.length,
      runs: s.state.runs.length,
      $process_person_profile: false,
    });
    await this.ctx.storage.deleteAll();
    this.send({ t: "ended" });
    try {
      this.client?.close(1000, "ended");
    } catch {}
    this.client = null;
  }
  lastCodeAt: number | null = null;

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ── Plumbing ──────────────────────────────────────────────────────────────────────────────────────────────────────

  send(msg: object) {
    try {
      this.client?.send(JSON.stringify(msg));
    } catch {
      // closing
    }
  }

  log(e: IvEvent) {
    this.events.push(e);
    if (e.type === "code") this.lastCodeAt = e.at;
  }

  /** Appends the buffered events to the session's log in R2 (one object per flush, read back in order). */
  async flush() {
    this.flushedAt = Date.now();
    if (!this.events.length || !this.room) return;
    const batch = this.events;
    this.events = [];
    const key = `iv/${this.room.id}/events/${String(Date.now()).padStart(15, "0")}-${this.flushSeq++}.jsonl`;
    await this.env.MEDIA.put(key, batch.map((e) => JSON.stringify(e)).join("\n") + "\n", {
      httpMetadata: { contentType: "application/x-ndjson" },
    }).catch((e) => {
      console.error("event flush", String(e));
      this.events = [...batch, ...this.events]; // keep them for the next try
    });
  }

  async save() {
    if (this.s) await this.ctx.storage.put("saved", this.s);
  }

  /** After a reconnect: put the problem, their code and the whiteboard back where they were. */
  restoreWorkspace() {
    const s = this.s!;
    const p = this.problem(s.state.assigned.problem);
    if (p) this.send({ t: "problem", problem: publicProblem(p), starter: starters(p.signature), code: s.code });
    const w = s.whiteboard;
    if (w?.open) this.send({ t: "design", design: { id: w.topic, title: w.topic, prompt: "", requirements: w.requirements }, elements: s.board?.raw ?? [] });
    if (s.board) this.scene = sceneOf(s.board.elements);
    if (s.fallback) for (const l of s.transcript.slice(-30)) this.send({ t: "chat", role: l.role, text: l.text });
  }

  fail(where: string, err: unknown) {
    console.error(JSON.stringify({ msg: "interview room error", where, error: String(err) }));
    this.log({ at: Date.now(), type: "session", what: "error", detail: `${where}: ${String(err)}`.slice(0, 300) });
  }
}
