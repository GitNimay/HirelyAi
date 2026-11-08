import { Buffer } from "node:buffer";
import { DurableObject } from "cloudflare:workers";
import { capture } from "../lib/analytics";
import {
  bookkeep,
  checkpoint,
  describeBoard,
  finishAi,
  markLive,
  roomContext,
  textTurn,
  type RoomContext,
} from "../lib/ai-interview/session";
import {
  advance,
  applyBookkeeping,
  applyTool,
  canWake,
  enumsFor,
  heard,
  initState,
  isOver,
  confirmAnswer,
  CONFIRM_MS,
  openConfirm,
  pause,
  PHASES,
  phaseBrief,
  phaseOf,
  phonicTool,
  run,
  skipIntent,
  steer,
  systemPrompt,
  tick,
  timeLeft,
  toolsFor,
  untrusted,
  validateCall,
  WORKSPACE_TOOLS,
  nextProblem,
  type HarnessState,
  type IvEvent,
  type PhaseId,
  type ToolName,
  type Wake,
} from "../lib/ai-interview/harness";
import type { Line } from "../lib/screening/fields";
import { runSuite } from "../lib/ai-interview/sandbox";
import { startersFor } from "../lib/ai-interview/starters";
import {
  diffLines,
  LANGUAGES,
  publicProblem,
  sceneChange,
  sceneOf,
  sceneText,
  type BoardElement,
  type Language,
  type Problem,
  type RunResult,
  type Scene,
} from "../lib/ai-interview/workspace";

/** What the agent learns from a run: which kinds of cases fail (names), never hidden inputs or expected outputs. */
const runSummary = (r: RunResult) => ({
  passed: r.passed,
  total: r.total,
  status: r.status,
  failing: r.cases.filter((c) => !c.passed).map((c) => c.name),
  runtime_s: r.time,
  memory_kb: r.memory,
  error: r.error ? untrusted("error", r.error.slice(0, 800)) : "",
});

const PHONIC = "https://api.phonic.ai/v1/sts/ws";
const VOICE = "sabrina"; // female, "cheerful" per Phonic
const GRACE_MS = 5 * 60_000; // a dropped candidate can rejoin within this, with the clock paused
const KEEP_VOICE_MS = 30_000; // a brief drop (tab flip, network blip) keeps the conversation: no re-greeting on rejoin
const IDLE_MS = 150_000; // coding/design: no speech and no edits for this long wakes the agent (thinking takes a while)
const CS_TERMS = [
  "hashmap",
  "hash set",
  "memoization",
  "dynamic programming",
  "two pointers",
  "sliding window",
  "binary search",
  "deque",
  "heap",
  "trie",
  "BFS",
  "DFS",
  "O of n log n",
  "Kubernetes",
  "gRPC",
  "GraphQL",
  "PostgreSQL",
  "Redis",
  "Kafka",
  "idempotent",
];
const FLUSH_MS = 15_000; // event log → R2
const BOOKKEEP_EVERY = 6; // transcript lines between background bookkeeping passes (about three exchanges, so topic steering isn't late)
const PERSIST_MS = 3_000; // state checkpoints are batched to at most one per this
// Voice resilience: a dropped Phonic socket is first resumed (same conversation, Phonic holds it ~30 s), then
// replaced; text chat is the last resort, and the room keeps trying to bring voice back from there
const BACKOFF_MS = [500, 1000, 2000, 4000, 5000];
const MAX_PHONIC_FAILURES = BACKOFF_MS.length; // consecutive, without the interviewer ever getting ready
const HANDSHAKE_MS = 30_000; // a WebSocket upgrade slower than this counts as a failure
const READY_MS = 20_000; // config sent, but no ready_to_start_conversation within this
const RESUME_MS = 8_000; // reconnect_conv_id sent, but no conversation_reconnected within this
const FAILING_MS = 60_000; // ...or failing for longer than this
const RECOVER_MS = 45_000; // from text chat, try voice again this often
const OVERTIME_MS = 30_000; // a forced phase change waits up to this for the candidate to finish speaking or drawing
const BOARD_SETTLE_MS = 30_000; // whiteboard: ask about the sketch only after they stop drawing for this long (they see it when they speak anyway)
const WARM_MS = 45_000; // a pre-opened Phonic socket is used within this, else dropped
// Voice standby (cost): Phonic bills per open minute, and coding/design are mostly silent work. After this long with
// nobody speaking, the conversation closes and the room listens for speech itself; it reconnects (pre-warmed) the
// moment the candidate talks, replaying the buffered audio so their first words aren't lost.
const STANDBY_MS = 90_000;
const PREROLL_FRAMES = 38; // ~1.5 s of 40 ms mic frames kept while in standby
const SPEECH_RMS = 900; // PCM16 RMS that counts as speech (the mic has noise suppression on)
const SPEECH_FRAMES = 3; // consecutive loud 40 ms frames (120 ms) before waking

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
 * room events out); this object holds the Phonic speech-to-speech socket and runs the harness (lib/ai-interview/harness.ts):
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
  silence = new Uint8Array(1280); // 40 ms of 16 kHz PCM16, sent while proctoring has the room paused

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
    capture(room.id, fresh ? "interview started" : "interview rejoined", {
      kind: "ai",
      $process_person_profile: false,
    });
    this.lastActivity = now;
    clearTimeout(this.dropTimer);
    await this.prepare(phaseOf(this.s.state));
    this.restoreWorkspace();
    this.timer ??= setInterval(() => void this.onTick().catch((e) => this.fail("tick", e)), 1000);
    if (this.s.fallback) return (this.send({ t: "fallback" }), this.syncClock());
    // A brief drop: the conversation is still open, so carry on in it (no new greeting, nothing to re-brief)
    if (this.phonic && this.ready) {
      this.syncClock();
      this.send({ t: "stage", stage: "ready" });
      this.send({ t: "state", agent: "listening" });
      this.wake(
        "reconnect",
        "Harness: the candidate's connection dropped for a moment and they're back. Welcome them back in one short sentence and continue where you left off.",
      );
      return;
    }
    // Anything left over from before the drop (a standby, a half-open socket) starts clean
    this.standby = false;
    this.closePhonic();
    // The clock waits for the interviewer: it starts (or resumes) when Phonic is ready, not when the browser connects
    this.syncClock();
    this.send({ t: "stage", stage: "joining" });
    await this.connectPhonic(fresh ? "start" : "reconnect");
  }
  dropTimer: ReturnType<typeof setTimeout> | undefined;

  async onDisconnect() {
    this.client = null;
    if (this.ending || !this.s) return;
    const now = Date.now();
    this.syncClock();
    this.log({ at: now, type: "session", what: "disconnected" });
    capture(this.room!.id, "interview dropped", {
      kind: "ai",
      phase: phaseOf(this.s.state),
      $process_person_profile: false,
    });
    this.stopTimer();
    // Keep the voice conversation open briefly: most drops are a tab flip or a network blip and rejoin in seconds
    this.dropTimer = setTimeout(() => !this.client && this.closePhonic(), KEEP_VOICE_MS);
    await this.persist();
    await this.flush();
    // Hold the session for the grace period; the alarm ends it if they don't come back
    await this.ctx.storage.setAlarm(now + GRACE_MS);
  }

  async alarm() {
    if (this.retryFinish) return this.finish(this.retryFinish);
    if (this.client) return; // they came back
    this.s ??= (await this.ctx.storage.get<Saved>("saved")) ?? null;
    if (!this.s) return;
    this.room ??= await roomContext(this.s.sessionId);
    if (!this.room) return;
    capture(this.room.id, "interview abandoned", { kind: "ai", $process_person_profile: false });
    this.log({
      at: Date.now(),
      type: "session",
      what: "ended",
      detail: "abandoned: didn't rejoin within the grace period",
    });
    await this.finish("abandoned");
  }

  // ── Phonic ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Opens the voice conversation. After an abnormal drop it first resumes the same Phonic conversation
   * (reconnect_conv_id: no new greeting, its context intact); otherwise, or if that fails, it starts a new one primed
   * with the rolling summary. Every attempt has a deadline, so a hung handshake can't stall the interview.
   */
  async connectPhonic(why: "start" | "reconnect" | "retry" | "resume" | "recover") {
    const s = this.s!;
    const phase = phaseOf(s.state);
    if (!phase || this.connecting) return;
    this.connecting = true;
    try {
      this.ready = false;
      this.connectStarted = Date.now();
      const resumeId = this.resumeConv;
      this.resumeConv = null;
      if (resumeId) {
        const ws = await this.openPhonic(resumeId);
        if (ws && this.client && !this.ending) {
          this.attach(ws);
          this.log({ at: Date.now(), type: "session", what: "resumed", detail: "voice: same conversation" });
          this.deadline(ws, RESUME_MS, "resume timed out");
          return;
        }
        ws?.close(1000, "unused");
      }
      // A socket pre-opened while the candidate read the overview (warm()) skips the slow handshake
      const warm = this.warmed;
      this.warmed = null;
      const ws = warm && Date.now() - warm.at < WARM_MS ? warm.ws : await this.openPhonic();
      if (ws !== warm?.ws) warm?.ws.close(1000, "stale");
      if (!ws) return void this.onPhonicFailure("upgrade failed");
      if (!this.client || this.ending) return void ws.close(1000, "unused");
      this.attach(ws);
      this.sendConfig(ws, phase, this.everReady || why === "reconnect" ? why : "start");
      this.deadline(ws, READY_MS, "not ready in time");
    } finally {
      this.connecting = false;
    }
  }
  connecting = false;
  everReady = false; // the interviewer has been live at least once in this object's life
  resumeConv: string | null = null; // the Phonic conversation to resume after an abnormal close
  convId: string | null = null;

  attach(ws: WebSocket) {
    this.phonic = ws;
    ws.addEventListener("message", (e) => void this.onPhonic(ws, e.data).catch((err) => this.fail("phonic", err)));
    ws.addEventListener("close", (e) => this.phonic === ws && this.onPhonicClosed(e.code, e.reason));
    ws.addEventListener("error", () => this.phonic === ws && this.onPhonicClosed(1006, "error"));
  }

  /** The conversation must be ready within `ms`, or the attempt counts as a failure and the next one starts. */
  deadline(ws: WebSocket, ms: number, why: string) {
    setTimeout(() => {
      if (this.phonic !== ws || this.ready) return;
      this.phonic = null;
      try {
        ws.close(1000, why);
      } catch {}
      this.log({ at: Date.now(), type: "session", what: "error", detail: `phonic ${why}` });
      void this.onPhonicFailure(why);
    }, ms);
  }

  sendConfig(ws: WebSocket, phase: PhaseId, why: string) {
    const room = this.room!;
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
        // Thinking pauses are handled by choose_not_to_respond (the model hears "hmm, so..." and stays quiet), so the
        // endpoint itself can be short: every turn pays this silence. ponytail: tune from the logged first-audio latency
        turn_taking: "relaxed",
        vad_min_silence_duration_ms: 800,
        // Typing and fan noise with an open mic shouldn't start a turn; keep the first syllable
        vad_threshold: 0.55,
        vad_min_speech_duration_ms: 200,
        vad_prebuffer_duration_ms: 300,
        // "yeah", "okay" or "so..." shouldn't cut the interviewer off
        min_words_to_interrupt: 3,
        no_input_poke_sec: null, // the harness decides when to nudge (idle wake), not a silence timer
        no_input_end_conversation_sec: 600,
        websocket_timeout_sec: 300,
        boosted_keywords: this.keywords(),
        external_id: room.id,
      }),
    );
    const note =
      why === "reconnect" || why === "retry"
        ? "Harness: the connection was restored. Welcome them back in one sentence and continue where you left off."
        : why === "recover"
          ? "Harness: voice is working again after a text-chat stretch. Tell them in one sentence that you can continue by voice, then continue where you left off."
          : "";
    // A wake queued during the reconnect (phase change, time warning) still gets said, after the welcome back
    if (note)
      this.pendingWake = {
        why: this.pendingWake?.why ?? "reconnect",
        text: [note, this.pendingWake?.text].filter(Boolean).join("\n"),
      };
  }
  /** Speech recognition hints: the assigned problem's words, the candidate's skills, then common interview terms. */
  keywords() {
    const room = this.room!;
    const p = this.problem(this.s?.state.assigned.problem);
    return [
      ...new Set([
        ...(p ? [p.title, ...(p.signature?.args ?? []), ...(p.env ? [LANGUAGES[p.env].label] : [])] : []),
        ...room.candidate.skills,
        room.job.company,
        ...CS_TERMS,
      ]),
    ]
      .map((k) => k.slice(0, 50))
      .slice(0, 50);
  }
  pendingWake: { why: Wake; text: string } | null = null;
  turnEnded = 0; // when the candidate last finished speaking, until the reply's first audio (latency log)
  connectStarted = 0;
  warmed: { ws: WebSocket; at: number } | null = null;

  /**
   * The WebSocket handshake with Phonic (no config yet: nothing is billed or said until config is sent), or a resume
   * of an existing conversation. Null on failure or after HANDSHAKE_MS.
   */
  async openPhonic(resumeId?: string) {
    const t0 = Date.now();
    const url = resumeId ? `${PHONIC}?reconnect_conv_id=${encodeURIComponent(resumeId)}` : PHONIC;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const res = await Promise.race([
      fetch(url, { headers: { Upgrade: "websocket", Authorization: `Bearer ${this.env.PHONIC_API_KEY}` } }),
      new Promise<null>((r) => (timer = setTimeout(() => r(null), HANDSHAKE_MS))),
    ])
      .catch((e) => (console.error("phonic connect", String(e)), null))
      .finally(() => clearTimeout(timer));
    const ws = res?.webSocket;
    if (!ws) {
      console.error("phonic upgrade failed", res?.status ?? "timeout", await res?.text().catch(() => ""));
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
    return [
      ...toolsFor(phase, { design: this.room!.config.design.enabled }).map((n) => phonicTool(n, enums)),
      // Lets the model stay quiet when the candidate is thinking out loud (null: silent until they speak again)
      { type: "built_in", name: "choose_not_to_respond", tool_config: { respond_after_sec: null } },
    ];
  }

  prompt(phase: PhaseId) {
    return systemPrompt(phase, this.promptCtx(), this.s!.state, Date.now());
  }

  /** What the prompts need: the plan, the job, and memory (rolling summary + the last few lines, for a fresh conversation). */
  promptCtx() {
    const r = this.room!;
    const s = this.s!;
    const recent = s.transcript
      .slice(-8)
      .map((l) => `${l.role === "agent" ? "You" : "Candidate"}: ${l.text}`)
      .join("\n");
    return {
      job: r.job,
      candidate: r.candidate,
      plan: r.plan,
      config: r.config,
      summary: [s.summary, recent && `Most recent lines:\n${recent}`].filter(Boolean).join("\n\n"),
      problem: this.problem(s.state.assigned.problem) ?? r.plan.problems?.[0],
      faq: r.faq,
    };
  }

  /** A problem from this candidate's plan (primary or a backup). */
  problem(id: string | undefined): Problem | undefined {
    return id ? this.room!.plan.problems?.find((p) => p.id === id) : undefined;
  }

  /** Puts a problem in the candidate's editor with fresh starter code. */
  showProblem(p: Problem) {
    const s = this.s!;
    s.state = {
      ...s.state,
      assigned: { ...s.state.assigned, problem: p.id, tried: [...(s.state.assigned.tried ?? []), p.id] },
    };
    // Their language carries over between code problems; an environment problem fixes its own
    const files = startersFor(p);
    const language = (s.code && s.code.language in files ? s.code.language : Object.keys(files)[0]) as Language;
    s.code = { language, code: files[language] ?? "" };
    this.lastCodeRead = s.code.code; // the agent knows the starter: only the candidate's changes are news
    this.log({ at: Date.now(), type: "assign", what: "problem", id: p.id });
    this.send({ t: "problem", problem: publicProblem(p), starter: files, code: s.code });
  }

  /** The harness puts the round's work on screen itself (deterministic, nothing for the agent to narrate). */
  async prepare(phase: PhaseId | null) {
    const first = this.room!.plan.problems?.[0];
    if (phase === "coding" && first && !this.s!.state.assigned.problem) this.showProblem(first);
    // Leaving the technical round closes a whiteboard the agent left open
    if (phase !== "technical" && this.s!.whiteboard?.open) this.closeWhiteboard();
  }

  closeWhiteboard() {
    const s = this.s!;
    if (s.whiteboard) s.whiteboard = { ...s.whiteboard, open: false };
    this.send({ t: "board-close" });
  }

  /** Re-briefs the agent for a new phase: that phase's tools, then its private brief. */
  brief(phase: PhaseId) {
    this.sendPhonic({ type: "update_tools_subset", tools: this.phaseTools(phase) });
    this.sendPhonic({
      type: "add_system_message",
      system_message: phaseBrief(phase, this.promptCtx(), this.s!.state, Date.now()),
    });
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
    // Phonic ends a conversation on its own after long silences or errors: the interview isn't over. A network-level
    // drop can resume the same conversation; anything else starts a new one
    this.log({
      at: Date.now(),
      type: "session",
      what: "error",
      detail: `phonic closed ${code} ${reason}`.slice(0, 200),
    });
    if (this.convId && (code === 1006 || code === 1012 || (code === 1001 && /restart/i.test(reason))))
      this.resumeConv = this.convId;
    void this.onPhonicFailure(`closed ${code}`);
  }

  async onPhonicFailure(detail: string) {
    if (this.ending || !this.client) return;
    // Trying to bring voice back from text chat: stay in chat quietly and try again later
    if (this.s!.fallback) return;
    this.phonicFailures++;
    this.failingSince ||= Date.now();
    if (this.phonicFailures > MAX_PHONIC_FAILURES || Date.now() - this.failingSince > FAILING_MS) {
      // Voice has failed for a while: carry on as a text chat in the room, and keep trying to bring voice back
      this.s!.fallback = true;
      this.resuming = false;
      this.preroll = [];
      this.lastRecover = Date.now();
      this.log({ at: Date.now(), type: "session", what: "fallback", detail });
      capture(this.room!.id, "interview voice fallback", { kind: "ai", detail, $process_person_profile: false });
      this.send({ t: "fallback" });
      this.syncClock();
      await this.textReply(
        "The voice connection failed, so the interview continues by text for now. Tell the candidate in one sentence and continue.",
      );
      return;
    }
    this.send({ t: "stage", stage: "reconnecting", attempt: this.phonicFailures });
    await new Promise((r) => setTimeout(r, BACKOFF_MS[this.phonicFailures - 1]));
    if (this.client && !this.ending && !this.phonic) await this.connectPhonic("retry");
  }
  lastRecover = 0;
  failingSince = 0; // first failure since the interviewer was last ready

  async onPhonic(ws: WebSocket, data: string | ArrayBuffer) {
    if (this.phonic !== ws || typeof data !== "string") return;
    const m = JSON.parse(data) as { type: string; [k: string]: unknown };
    const now = Date.now();
    switch (m.type) {
      case "ready_to_start_conversation":
      case "conversation_reconnected":
        return this.onReady(m.type);
      case "conversation_created":
        this.convId = String(m.conversation_id);
        return this.log({ at: now, type: "session", what: "connected", detail: `phonic ${this.convId}` });
      case "audio_chunk": {
        if (this.turnEnded) {
          // First audio of a reply: the latency the candidate feels (end of their speech → interviewer's voice)
          console.log(JSON.stringify({ msg: "first audio", ms: now - this.turnEnded, timings: m.timings ?? null }));
          this.turnEnded = 0;
        }
        if (m.audio && this.client && !this.paused) {
          // Native base64 (nodejs_compat): ~50 frames/s each way, so the hot path stays well inside the CPU budget
          this.client.send(Buffer.from(m.audio as string, "base64"));
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
        this.pushWorkspace(); // so the reply to what they're saying sees their latest code or sketch
        return this.send({ t: "you", speaking: true });
      case "user_finished_speaking":
        this.lastSpeech = now;
        this.nudges = 0;
        this.candidateSpeaking = false;
        this.lastActivity = now;
        this.turnEnded = now;
        this.send({ t: "you", speaking: false });
        return this.send({ t: "state", agent: "thinking" });
      case "input_cancelled":
        // Noise, not speech: no user_finished_speaking follows, and a stuck flag would block every queued reply
        this.candidateSpeaking = false;
        this.send({ t: "you", speaking: false });
        this.send({ t: "state", agent: "listening" });
        return this.flushReply();
      case "input_text":
        this.send({ t: "cap", who: "you", text: String(m.text ?? "") });
        if (this.s && String(m.text ?? "").trim()) {
          this.s.state = heard(this.s.state);
          await this.onCandidateLine(String(m.text), now);
        }
        return this.utter("candidate", String(m.text ?? ""), now);
      case "tool_call":
        return this.onToolCall(String(m.tool_call_id), String(m.tool_name), m.parameters);
      case "assistant_chose_not_to_respond":
        this.turnEnded = 0;
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

  /** The interviewer is live: a new conversation accepted its config, or a dropped one resumed. */
  onReady(how: string) {
    const s = this.s!;
    const now = Date.now();
    console.log(JSON.stringify({ msg: "interviewer ready", how, ms: now - this.connectStarted }));
    this.ready = true;
    this.resuming = false;
    this.everReady = true;
    this.phonicFailures = 0;
    this.failingSince = 0;
    if (s.fallback) {
      // Voice is back after a text-chat stretch
      s.fallback = false;
      this.log({ at: now, type: "session", what: "resumed", detail: "voice restored" });
      this.send({ t: "voice" });
    }
    this.syncClock();
    if (how !== "conversation_reconnected") {
      // A new conversation has never seen the workspace: the next push sends it whole, not a diff against nothing
      this.lastCodeRead = "";
      this.lastBoardPush = "";
      this.pushWorkspace();
    }
    this.send({ t: "stage", stage: "ready" });
    this.send({ t: "state", agent: "listening" });
    for (const f of this.preroll.splice(0)) this.sendAudio(f); // what they said while the conversation resumed
    this.lastSpeech = now;
    // A resumed conversation already knows everything; a new one gets the reconnect note (raised before, counted then)
    if (this.pendingWake && how !== "conversation_reconnected") {
      this.queuedReply = this.pendingWake.text;
      this.flushReply();
    }
    this.pendingWake = null;
  }

  /**
   * Keeps the agent in sync with the candidate's workspace without tool calls: when they start speaking, the code or
   * whiteboard changes since the agent last saw them are added to its context, so its reply can refer to them.
   */
  pushWorkspace() {
    const s = this.s!;
    if (phaseOf(s.state) === "coding" && s.code && s.code.code !== this.lastCodeRead) {
      const diff = diffLines(this.lastCodeRead, s.code.code);
      this.lastCodeRead = s.code.code;
      const body =
        diff.length < 2500 ? `changes since you last saw it:\n${diff}` : `full code:\n${s.code.code.slice(0, 6000)}`;
      this.sendPhonic({
        type: "add_system_message",
        system_message: `Harness: the candidate's ${LANGUAGES[s.code.language].label} code now, ${untrusted("code", body)}`,
      });
    }
    if (s.whiteboard?.open) this.pushBoard();
  }

  pushBoard() {
    const scene = JSON.stringify(this.scene);
    if (scene === this.lastBoardPush) return;
    this.lastBoardPush = scene;
    this.boardPending = false;
    this.sendPhonic({
      type: "add_system_message",
      system_message: `Harness: the whiteboard now: ${this.scene.elements.length ? untrusted("whiteboard", sceneText(this.scene).slice(0, 3000)) : "empty"}`,
    });
  }
  lastBoardPush = "";
  boardPending = false; // the sketch changed and the agent hasn't seen it
  boardChangedAt = 0;

  /** One finished utterance: transcript, event log, a batched checkpoint, and background bookkeeping every few lines. */
  async utter(role: Line["role"], text: string, at: number, interrupted = false) {
    const t = text.trim();
    if (!t) return;
    const s = this.s!;
    s.transcript.push({ role, text: t });
    this.log({ at, type: "utterance", role, text: t, ...(interrupted && { interrupted }) });
    this.persistSoon();
    if (s.transcript.length - s.summarized >= BOOKKEEP_EVERY) void this.bookkeep();
  }

  /**
   * Runs the bookkeeper on the lines it hasn't seen: summary for the prompts, evidence for the evaluator. In parallel
   * with the conversation, one pass at a time (lines that arrive meanwhile go in the next pass).
   */
  bookkeep(): Promise<void> {
    if (this.bookkeeping) return this.bookkeeping;
    const s = this.s!;
    const room = this.room!;
    const from = s.summarized;
    const upto = s.transcript.length;
    const phase = phaseOf(s.state) ?? "wrapup";
    if (upto <= from) return Promise.resolve();
    this.bookkeeping = bookkeep({
      previous: s.summary,
      lines: s.transcript.slice(from, upto),
      claims: room.plan.claims,
      rubric: room.config.rubric,
      topic: s.state.topic,
    })
      .then((b) => {
        s.summary = b.summary;
        s.summarized = upto;
        s.state = applyBookkeeping(s.state, b, phase, Date.now());
        // Keep the conversation moving: a new topic once this one has had its questions, a wrong fact set straight.
        // Context only, applied at the agent's next turn; skipped when the phase moved on during the pass.
        if (!this.ending && !this.finishing) {
          const st = steer(s.state, b, { phase, plan: room.plan, board: !!s.whiteboard?.open });
          s.state = st.state;
          for (const note of st.notes) {
            this.log({ at: Date.now(), type: "session", what: "steer", detail: note.slice(9, 160) });
            if (s.fallback) this.steerNotes.push(note);
            else this.sendPhonic({ type: "add_system_message", system_message: note });
          }
        }
        this.persistSoon();
      })
      .catch((e) => this.fail("bookkeeping", e))
      .finally(() => (this.bookkeeping = null));
    return this.bookkeeping;
  }
  bookkeeping: Promise<void> | null = null;
  /** Text fallback: steering notes waiting for the next typed reply (there is no context to add them to between turns). */
  steerNotes: string[] = [];

  /** State checkpoints (D1 for the report, DO storage for a restart), batched so tool calls and lines never wait on them. */
  persistSoon() {
    this.persistTimer ??= setTimeout(() => void this.persist().catch((e) => this.fail("persist", e)), PERSIST_MS);
  }
  persistTimer: ReturnType<typeof setTimeout> | null = null;

  async persist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    const s = this.s;
    if (!s || this.ending) return;
    // allowUnconfirmed: a storage write would otherwise hold back every outgoing message (the interviewer's audio)
    // until it is durable; a checkpoint every few seconds isn't worth an audible hiccup
    await Promise.all([
      checkpoint(this.room!.id, s.state, s.transcript),
      this.ctx.storage.put("saved", s, { allowUnconfirmed: true }),
    ]);
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
    let effect: "advance" | "switch" | "easier" | "end" | undefined;
    if (!v.ok) result = { error: v.error };
    else if (WORKSPACE_TOOLS.includes(v.name)) result = await this.workspaceTool(v.name, v.args);
    else {
      const out = applyTool(s.state, v.name, v.args, { plan: room.plan }, now);
      s.state = out.state;
      result = out.result;
      effect = out.effect;
    }
    // An approved move happens now, so the new phase's tools and brief reach the agent before it continues; the
    // tool result tells it to follow them (no extra generate_reply: it's already mid-turn and would talk twice)
    if (effect === "advance") {
      const to = await this.transition("approved");
      if (to)
        result = {
          approved: true,
          now_in_phase: PHASES[to].label,
          next: "Say one short transition sentence, then follow the Harness brief for this phase.",
        };
    }
    if (effect === "switch" || effect === "easier")
      result = this.switchProblem(String(v.ok && v.args.reason), effect === "easier");
    this.log({ at: Date.now(), type: "tool_result", id, name, result });
    this.persistSoon();
    if (effect === "end") setTimeout(() => void this.endAfterGoodbye(), 0);
    return result;
  }

  /** Puts the next backup problem on screen (an easier one when asked) and re-briefs the agent with its hints. */
  switchProblem(reason: string, easier = false) {
    const s = this.s!;
    const current = this.problem(s.state.assigned.problem);
    const next = nextProblem(this.room!.plan.problems ?? [], s.state.assigned.tried ?? [], current, easier);
    if (!next) return { error: "No backup problem left. Simplify the current one with a hint instead." };
    this.showProblem(next);
    this.log({
      at: Date.now(),
      type: "session",
      what: "resumed",
      detail: `problem switched${easier ? " (easier)" : ""}: ${reason.slice(0, 120)}`,
    });
    this.sendPhonic({
      type: "add_system_message",
      system_message: phaseBrief("coding", this.promptCtx(), s.state, Date.now()),
    });
    return {
      ok: true,
      title: next.title,
      difficulty: next.difficulty,
      environment: next.env ? LANGUAGES[next.env].label : "code (any language)",
      statement: next.statement,
      note: `The new problem is on their screen with fresh starter code. Introduce it in one or two sentences.${easier && current && next.difficulty === current.difficulty ? " It's the simplest one left (same difficulty label, smaller scope)." : ""}`,
    };
  }

  /**
   * Skips and problem switches are the candidate's call, confirmed first, and never left to the agent noticing (or
   * arguing): a request opens a confirmation and the agent asks; a clear yes is carried out here, a clear no cancels it.
   * Anything less clear stays with the agent (its request_phase_transition / switch_problem is approved after an answer).
   */
  async onCandidateLine(text: string, now: number) {
    const s = this.s!;
    const c = s.state.confirm;
    if (c && now - c.at < CONFIRM_MS && s.state.heard > c.heard) {
      // heard > c.heard: a line after the request (the request itself was counted when the confirmation opened)
      const answer = confirmAnswer(text);
      if (answer === "no") {
        s.state = { ...s.state, confirm: null };
        this.log({ at: now, type: "session", what: "confirm", detail: `${c.action} declined` });
        return;
      }
      if (answer === "yes") {
        s.state = { ...s.state, confirm: null };
        this.log({ at: now, type: "session", what: "confirm", detail: `${c.action} confirmed` });
        if (c.action !== "skip") {
          const r = this.switchProblem(
            `the candidate asked for ${c.action === "easier" ? "an easier" : "a different"} problem`,
            c.action === "easier",
          );
          if ("ok" in r)
            this.wake(
              "phase",
              `Harness: the candidate confirmed, and a new problem, "${r.title}", is on their screen. Acknowledge in a few words and introduce it in one or two sentences.`,
            );
          return;
        }
        const to = await this.transition("approved");
        if (to)
          this.wake(
            "phase",
            `Harness: the candidate confirmed, so the interview has moved on to the ${PHASES[to].label} phase. Acknowledge in a few words, then begin it.`,
          );
        return;
      }
    }
    const intent = skipIntent(text, phaseOf(s.state));
    const open = intent && openConfirm(s.state, intent, now);
    if (!open) return;
    s.state = open.state;
    this.log({ at: now, type: "session", what: "confirm", detail: `${intent} requested` });
    this.sendPhonic({ type: "add_system_message", system_message: open.note });
  }

  async workspaceTool(name: ToolName, a: Record<string, string | number>): Promise<unknown> {
    const s = this.s!;
    const now = Date.now();
    switch (name) {
      case "run_tests": {
        // Examples and hidden tests in parallel: one wait, not two
        const [examples, hidden] = await Promise.all([
          this.execute("agent", "visible"),
          this.execute("agent", "hidden"),
        ]);
        if (typeof hidden === "string") return { error: hidden };
        return { examples: typeof examples === "string" ? examples : runSummary(examples), hidden: runSummary(hidden) };
      }
      case "open_whiteboard": {
        const topic = String(a.topic);
        const requirements = String(a.requirements)
          .split(/[;\n]/)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 5);
        s.state = { ...s.state, assigned: { ...s.state.assigned, design: topic } };
        // A new question starts on a clean board; reopening the same one keeps the sketch
        if (s.whiteboard?.topic !== topic) {
          s.board = null;
          this.scene = { elements: [], connections: [] };
        }
        s.whiteboard = { topic, requirements, open: true };
        this.log({ at: now, type: "assign", what: "design", id: topic });
        this.send({
          t: "design",
          design: { id: topic, title: topic, prompt: "", requirements },
          elements: s.board?.raw ?? [],
        });
        return { ok: true, note: "The whiteboard is open on their screen with this question." };
      }
      case "close_whiteboard":
        this.closeWhiteboard();
        return { ok: true };
      case "read_whiteboard": {
        if (!this.scene.elements.length && !s.board?.elements.length) return { scene: "The whiteboard is empty." };
        this.lastBoardPush = JSON.stringify(this.scene);
        this.boardPending = false;
        const scene = untrusted("whiteboard", sceneText(this.scene).slice(0, 3000));
        // Freehand strokes don't show up in the structure: describe the image as well
        const freehand = s.board?.elements.some((e) => e.type === "freedraw");
        if (!freehand) return { scene };
        const png = await this.requestSnapshot();
        const description = png ? await describeBoard(png) : "";
        return description ? { scene, drawing: untrusted("whiteboard_image", description) } : { scene };
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
    s.state = {
      ...s.state,
      runs: [...s.state.runs, { at, by, suite, passed: r.passed, total: r.total, status: r.status }].slice(-50),
    };
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
    if (due === "warn") this.warnTime(now);
    if (due === "force" || due === "wrap") {
      // Never cut the candidate off mid-sentence or mid-sketch: the move waits (up to OVERTIME_MS) for a pause, and
      // the overrun comes out of the next phase
      this.forceDue ??= now;
      const busy =
        this.candidateSpeaking ||
        this.agentSpeaking ||
        this.toolsInFlight > 0 ||
        (!!s.whiteboard?.open && now - this.boardChangedAt < 8_000);
      // "wrap" (flexible timing near its limit) goes straight to the wrap-up, whatever phase is running
      if (!busy || now - this.forceDue >= OVERTIME_MS) return void (await this.transition("forced", due === "wrap"));
    }
    this.flushReply();
    // Whiteboard: once they've stopped drawing for a moment, the agent sees the sketch and can ask about it
    if (
      s.whiteboard?.open &&
      this.boardPending &&
      now - this.boardChangedAt > BOARD_SETTLE_MS &&
      !this.candidateSpeaking &&
      !this.agentSpeaking
    ) {
      const change = this.boardChange;
      this.pushBoard();
      this.wake(
        "board",
        `Harness: the candidate paused drawing. Latest change: ${untrusted("whiteboard_change", change || "edits")}. Ask one specific question about what they drew, by name, or let them continue if they said they're still working.`,
      );
    }
    // From text chat, keep trying to bring voice back
    if (s.fallback && this.client && !this.phonic && !this.connecting && now - this.lastRecover > RECOVER_MS) {
      this.lastRecover = now;
      void this.connectPhonic("recover");
    }
    // Silent work: coding, or sketching on the whiteboard
    const working = phaseOf(s.state) === "coding" || !!s.whiteboard?.open;
    // Idle nudges back off (2.5, 5, 10 min…) so a thinking candidate isn't nagged; speaking resets the ladder. In voice
    // standby only the first one reopens the (billed) conversation
    if (
      working &&
      s.state.since !== null &&
      !this.agentSpeaking &&
      !this.candidateSpeaking &&
      (!this.standby || this.nudges === 0) &&
      now - this.lastActivity > IDLE_MS * 2 ** this.nudges
    ) {
      this.lastActivity = now;
      this.nudges++;
      this.wake(
        "idle",
        `Harness: the candidate hasn't spoken or changed anything for a few minutes. Check in gently in one sentence, e.g. "Take your time. Want to talk me through where you are?" Offer a hint (${s.state.hints.length ? `${s.state.hints.length} given so far` : "none given yet"}) only if they say they're stuck.`,
      );
    }
    const quiet = now - this.lastSpeech; // typing is silent work: only speech keeps the conversation open
    if (
      working &&
      this.ready &&
      !this.paused &&
      !this.agentSpeaking &&
      !this.candidateSpeaking &&
      !this.toolsInFlight &&
      !this.queuedReply &&
      quiet > STANDBY_MS
    )
      this.enterStandby();
    if (this.standby && !this.warmed) void this.warm();
    if (now % 5000 < 1000) this.sendClock();
    if (now - this.flushedAt > FLUSH_MS) await this.flush();
  }

  /** Moves to the next phase (approved by the harness, or forced by the clock) and re-briefs the agent. Returns the new phase. */
  async transition(reason: "approved" | "forced", toWrapup = false): Promise<PhaseId | null> {
    const s = this.s!;
    const room = this.room!;
    const from = phaseOf(s.state);
    if (!from) return null;
    const now = Date.now();
    this.forceDue = null;
    // One step, or (flexible timing out of time) every step to the last phase; each logged for the timeline
    do {
      const was = phaseOf(s.state);
      s.state = advance(
        s.state,
        now,
        room.plan.claims.map((c) => c.id),
      );
      this.log({ at: now, type: "phase", from: was, to: phaseOf(s.state), reason });
    } while (toWrapup && !isOver(s.state) && s.state.index < s.state.phases.length - 1);
    const to = phaseOf(s.state);
    this.sendClock();
    if (!to || isOver(s.state)) return (void (await this.finish("completed")), null);
    await this.prepare(to);
    this.persistSoon();
    void this.bookkeep();
    if (s.fallback) {
      void this.textReply(
        `${phaseBrief(to, this.promptCtx(), s.state, now)}\nSay one natural transition sentence and begin.`,
      );
      return to;
    }
    this.brief(to);
    if (reason === "forced")
      this.wake(
        "phase",
        `Harness: time is up for ${PHASES[from].label}. Say one short transition sentence and start ${PHASES[to].label}.`,
      );
    return to;
  }

  forceDue: number | null = null;
  boardChange = "";

  /**
   * Time is nearly up in this phase: the agent tells the candidate at the next natural pause. The note goes into its
   * context right away (so its next reply mentions it even if the candidate is mid-answer), and a wake makes it say
   * so if nobody is talking (silent coding or drawing).
   */
  warnTime(now: number) {
    const s = this.s!;
    const phase = phaseOf(s.state)!;
    this.log({ at: now, type: "warning", phase });
    if (s.state.limit) {
      // Flexible timing: one heads-up that the interview is nearly at its limit
      s.state = { ...s.state, capWarned: true };
      const note = `Harness: the interview is close to its time limit: wrap-up starts in about two minutes. At the next natural pause (never cut them off), tell the candidate in one short sentence that we have a couple of minutes left before we wrap up, and bring this part to a close.`;
      if (s.fallback) return void this.textReply(note);
      this.sendPhonic({ type: "add_system_message", system_message: note });
      return this.wake(
        "warning",
        "Harness: tell the candidate about the time now, in one short sentence, then continue.",
      );
    }
    s.state = { ...s.state, warned: true };
    const secs = timeLeft(s.state, now).phase;
    const left =
      secs >= 90 ? `about ${Math.round(secs / 60)} minutes` : secs > 50 ? "about a minute" : "less than a minute";
    const last = s.state.index === s.state.phases.length - 1;
    const note = `Harness: ${left} left in the ${PHASES[phase].label} phase${last ? ", the last one" : ""}. At the next natural pause (never cut them off), tell the candidate in one short sentence, e.g. "We have ${left} left for this part," and steer toward finishing it${phase === "coding" ? ": ask them to explain where they are and the complexity of their approach" : ""}.`;
    if (s.fallback) return void this.textReply(note);
    this.sendPhonic({ type: "add_system_message", system_message: note });
    this.wake("warning", "Harness: tell the candidate about the time now, in one short sentence, then continue.");
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
    this.pushWorkspace(); // a wake (idle, board, warning) replies about their latest code or sketch, not a stale one
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
      flexible: !!s.state.limit,
    });
  }

  // ── Browser messages ──────────────────────────────────────────────────────────────────────────────────────────────

  sendAudio(frame: Uint8Array) {
    this.sendPhonic({
      type: "audio_chunk",
      audio: Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength).toString("base64"),
    });
  }

  // ── Voice standby ─────────────────────────────────────────────────────────────────────────────────────────────────

  standby = false;
  resuming = false;
  preroll: Uint8Array[] = [];
  loud = 0;

  /** In standby: keep a short pre-roll and wake on sustained speech energy. */
  listen(frame: Uint8Array) {
    this.preroll.push(frame.slice());
    // While the conversation reopens, keep everything they say (up to 10 s) so it's replayed whole once ready
    if (this.preroll.length > (this.resuming ? 250 : PREROLL_FRAMES)) this.preroll.shift();
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
    void this.bookkeep(); // the conversation that resumes is primed with an up-to-date summary
  }

  /** Until the new conversation is ready (onReady), mic audio goes to the pre-roll and is replayed then. */
  async resume(why: "speech" | "wake") {
    if (!this.standby) return;
    this.standby = false;
    this.resuming = true;
    this.log({ at: Date.now(), type: "session", what: "resumed", detail: `voice: ${why}` });
    await this.connectPhonic("resume");
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
        // Only the languages this problem offers (an environment problem has exactly one)
        const offered = this.problem(s.state.assigned.problem);
        if (offered && !(String(m.language) in startersFor(offered))) return;
        const code = m.code.slice(0, 100_000);
        if (s.code?.code === code && s.code.language === m.language) return;
        s.code = { language: m.language as Language, code };
        this.lastActivity = now;
        this.persistSoon(); // a restart mustn't lose the last edits
        return this.log({ at: now, type: "code", language: s.code.language, code });
      }
      case "run": {
        this.lastActivity = now;
        const r = await this.execute("candidate", "visible");
        if (typeof r === "string") return;
        // Context, not a wake: they're debugging, and interrupting that is the worst moment. The agent knows the result
        // when they next speak (or the idle check-in fires)
        this.pushWorkspace();
        this.sendPhonic({
          type: "add_system_message",
          system_message: `Harness: the candidate ran the examples: ${r.passed}/${r.total} passed (${r.status})${
            r.passed < r.total
              ? `, failing ${r.cases
                  .filter((c) => !c.passed)
                  .map((c) => c.name)
                  .join(
                    ", ",
                  )}. If they ask for help, ask a question that helps them find the bug themselves; don't point at the fix`
              : ""
          }.`,
        });
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
        this.persistSoon();
        this.log({ at: now, type: "board", elements: s.board.raw, change });
        this.boardChangedAt = now;
        // Not a wake yet: interrupting someone mid-sketch is the worst moment. onTick asks once they've paused
        if (change) {
          this.boardPending = true;
          this.boardChange = change.slice(0, 600);
        }
        return;
      }
      case "snapshot":
        return this.snapshots.get(String(m.id))?.(typeof m.png === "string" && m.png.length < 2_000_000 ? m.png : null);
      case "paste":
        return this.log({
          at: now,
          type: "paste",
          chars: Math.max(0, Math.round(Number(m.chars) || 0)),
          // The editor reports its own pastes (size against the final code is the integrity signal)
          ...(m.into === "editor" && { into: "editor", lines: Math.max(0, Math.round(Number(m.lines) || 0)) }),
        });
      case "integrity":
        return this.onIntegrity(
          String(m.signal).slice(0, 40),
          m.detail ? String(m.detail).slice(0, 200) : undefined,
          !!m.hard,
          !!m.cleared,
        );
      case "chat":
        if (!s.fallback || typeof m.text !== "string" || !m.text.trim()) return;
        this.lastActivity = now;
        // Same as a spoken line: counts as heard, and can ask for (or confirm) a skip
        s.state = heard(s.state);
        await this.onCandidateLine(m.text.slice(0, 2000), now);
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
      capture(this.room!.id, "interview paused", { kind: "ai", reason: signal, $process_person_profile: false });
      this.send({ t: "paused", reason: signal });
      this.send({ t: "flush" });
      this.sendClock();
    } else if (cleared && this.paused === signal) {
      this.paused = null;
      this.syncClock();
      this.log({ at: now, type: "session", what: "resumed", detail: signal });
      this.send({ t: "resumed" });
      this.sendClock();
      this.wake(
        "integrity",
        "Harness: the interview was paused briefly by proctoring and has resumed. Say one short sentence to continue where you left off; don't accuse the candidate.",
      );
    }
  }

  // ── Text fallback ─────────────────────────────────────────────────────────────────────────────────────────────────

  async textReply(system?: string) {
    const s = this.s!;
    const phase = phaseOf(s.state);
    if (!phase || this.ending) return;
    this.send({ t: "state", agent: "thinking" });
    const notes = this.steerNotes.splice(0);
    const reply = await textTurn({
      prompt: this.prompt(phase),
      transcript: s.transcript.slice(-24),
      system: [...notes, system].filter(Boolean).join("\n\n") || undefined,
      tools: this.phaseTools(phase).flatMap((t) => ("tool_schema" in t ? [t.tool_schema] : [])),
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

  /** Ends the interview once. If anything throws, the flags reset so the alarm or the End button can try again. */
  async finish(reason: string) {
    if (this.ending || this.finishing || !this.s || !this.room) return;
    this.finishing = true; // ending is set once the last bookkeeping pass is in
    try {
      await this.close(reason);
    } catch (e) {
      this.fail("finish", e);
      this.finishing = false;
      this.ending = false;
      // The clock and voice are already stopped: retry on an alarm, even with the candidate still on the page
      this.retryFinish = reason;
      await this.ctx.storage.setAlarm(Date.now() + 30_000).catch(() => {});
    }
  }
  retryFinish: string | null = null;

  async close(reason: string) {
    const s = this.s!;
    const room = this.room!;
    this.stopTimer();
    this.closePhonic(); // nothing more is said; the goodbye has played
    // In parallel (the candidate is waiting on this): a last bookkeeping pass over the closing lines, so the evaluator
    // gets their evidence too (bounded: it's best effort), and a final hidden-test run on the last code
    const [, finalRun] = await Promise.all([
      Promise.race([this.bookkeep().then(() => this.bookkeep()), new Promise((r) => setTimeout(r, 20_000))]),
      this.finalRun(),
    ]);
    this.ending = true;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    const now = Date.now();
    // Close the clock on whatever phase was running, and mark unprobed claims
    while (!isOver(s.state) && phaseOf(s.state) !== null) {
      const from = phaseOf(s.state);
      s.state = advance(
        s.state,
        now,
        room.plan.claims.map((c) => c.id),
      );
      this.log({ at: now, type: "phase", from, to: phaseOf(s.state), reason: "end" });
    }
    if (finalRun) this.log(finalRun);
    this.log({ at: Date.now(), type: "session", what: "ended", detail: reason });
    this.closePhonic();
    // The tail of the event log must land before storage is wiped: retry a failed flush a few times
    for (let i = 0; i < 3; i++) {
      await this.flush();
      if (!this.events.length) break;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
    if (this.events.length) throw new Error("event log flush failed");
    await this.env.MEDIA.put(
      `iv/${room.id}/final.json`,
      JSON.stringify({
        code: s.code,
        board: s.board?.raw ?? null,
        scene: this.scene,
        state: s.state,
        summary: s.summary,
      }),
      { httpMetadata: { contentType: "application/json" } },
    );
    await finishAi(room.id, s.transcript, s.state, reason);
    capture(room.id, "interview completed", {
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
  finishing = false;

  /**
   * Final hidden-test run on the last code, so the evaluator has it even if the agent never ran them. Null when there's
   * nothing new to test, or the sandbox is down (an outage isn't a failing candidate).
   */
  async finalRun(): Promise<IvEvent | null> {
    const s = this.s!;
    if (!s.state.assigned.problem || !s.code) return null;
    if (s.state.runs.some((r) => r.suite === "hidden" && r.at > (this.lastCodeAt ?? 0))) return null;
    const p = this.problem(s.state.assigned.problem);
    // Untouched starter code has nothing to test
    if (!p || s.code.code.trim() === (startersFor(p)[s.code.language] ?? "").trim()) return null;
    const r = await runSuite(s.code.language, s.code.code, p.hidden, "hidden");
    if (r.status === "unavailable") return null;
    return { at: Date.now(), type: "run", by: "agent", language: s.code.language, result: { ...r, final: true } };
  }

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

  /** After a reconnect: put the problem, their code and the whiteboard back where they were. */
  restoreWorkspace() {
    const s = this.s!;
    const p = this.problem(s.state.assigned.problem);
    if (p) this.send({ t: "problem", problem: publicProblem(p), starter: startersFor(p), code: s.code });
    const w = s.whiteboard;
    if (w?.open)
      this.send({
        t: "design",
        design: { id: w.topic, title: w.topic, prompt: "", requirements: w.requirements },
        elements: s.board?.raw ?? [],
      });
    if (s.board) this.scene = sceneOf(s.board.elements);
    if (s.fallback) for (const l of s.transcript.slice(-30)) this.send({ t: "chat", role: l.role, text: l.text });
  }

  fail(where: string, err: unknown) {
    console.error(JSON.stringify({ msg: "interview room error", where, error: String(err) }));
    this.log({ at: Date.now(), type: "session", what: "error", detail: `${where}: ${String(err)}`.slice(0, 300) });
  }
}
