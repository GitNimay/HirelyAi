# AI interview: how it works end to end (Phonic + harness)

Traced from the code on `feat/interview-room-v2`. Main files:

| Piece                                                         | File                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Routes (`/interview/<slug>/room\|warm\|rec\|enter`)           | `worker/index.ts`                                                           |
| The room (Durable Object `InterviewRoom`)                     | `worker/ai-interview-room.ts`                                               |
| Harness: phases, clock, gates, tools, wakes, prompts          | `lib/ai-interview/harness.ts`                                               |
| Plan, room context, bookkeeping, text fallback, evaluator I/O | `lib/ai-interview/session.ts`                                               |
| Evaluator (pure scoring)                                      | `lib/ai-interview/evaluator.ts`                                             |
| Coding problems / sandbox                                     | `lib/ai-interview/problem-gen.ts`, `problem-bank.ts`, `sandbox.ts` (Judge0) |
| Candidate UI (steps, audio worklets, proctoring, recording)   | `components/ai-interview/candidate.tsx`, `workspace.tsx`                    |

The core idea: **Phonic is only the voice and the conversational model.** Everything that decides anything (which phase, which tools exist, whether a move is allowed, when to speak unprompted, what gets scored) lives in the harness inside the Durable Object. The browser never talks to Phonic and never sees a tool call, so it can't forge one.

---

## 1. The whole lifecycle

```mermaid
flowchart TD
    A[Candidate applies to a job with an AI screening] --> B["createAiSession<br/>INSERT interview_sessions"]
    B --> C[["Queue task: plan"]]
    C --> D["planSession (parallel)"]
    D --> D1["buildPlan: gpt-oss-20b<br/>resume → verifiable claims"]
    D --> D2["planProblems: gpt-oss-120b<br/>writes problems + solve() + make_large()"]
    D2 --> D3["Judge0 runs reference solution<br/>computes hidden outputs, must match examples<br/>1 repair round, spare candidate"]
    D1 --> E[("D1: interview_sessions.plan")]
    D3 --> E
    B --> F[["Queue task: sendInvite<br/>issueCredentials: ID + SHA-256 pass"]]
    F --> G["Email: link + candidate ID + password"]
    G --> H["Gate page: sign in with ID + password<br/>→ path cookie iv=sessionId"]
    H --> I["Onboarding: details → system check → consent → overview"]
    I -->|"Overview open: POST /warm every 40 s"| W["DO.warm(): pre-opens Phonic WS<br/>no config yet = nothing billed, 45 s TTL"]
    I -->|Start| R["Room: WS /interview/slug/room<br/>→ InterviewRoom DO (getByName sessionId)"]
    W -.reused.-> R
    R --> L["Live interview<br/>(sections 2–8)"]
    L --> X{"How it ended"}
    X -->|"end_interview tool"| Z
    X -->|"clock ran out in wrap-up"| Z
    X -->|"candidate pressed End"| Z
    X -->|"no rejoin within 5 min (alarm)"| Z
    Z["finish() → close()<br/>last bookkeeping, final hidden-test run,<br/>flush events, final.json, finishAi"] --> Q[["Queue task: evaluate"]]
    Q --> EV["evaluateAi: gpt-oss-120b EVALUATOR<br/>+ pure cleanAiReport"]
    EV --> REP[("D1: report, score, status=done")]
    REP --> P["Poster sees /report/job/applicant<br/>(share link /r/token, PDF)"]
```

If the plan task hasn't finished when the candidate joins, `roomContext` builds claims on the spot and uses three built-in problems from `problem-bank.ts` instead of generated ones.

### Coding tracks and environments

The coding round is about one or more **tracks**: general code (any of six languages, the candidate picks) or a DevOps / data environment with a fixed file: Bash, SQL (SQLite), YAML (Kubernetes, CI/CD, Compose), Dockerfile, Terraform, JSON (IAM policies). The recruiter can pin up to three in the post form; otherwise `pickTracks()` reads them from the job description (weighted double) and the resume. An infrastructure or data role leads with its environments and never gets algorithms only.

`planProblems` writes three problems: the primary (main track, role level), a like-for-like backup (next track), and an easier one (main track, one level down). A slot whose problem is rejected after three tries is filled in place from the bank, so the order always holds.

| Environment           | How it's graded                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| code                  | Judge0, multi-case stdin, line by line (unchanged)                                                                                    |
| Bash, SQL             | Judge0's Bash image (it has sqlite3), one submission: a driver splits stdin per case and runs the file on each; whole output per case |
| YAML, JSON            | `lib/ai-interview/checks.ts` in the Worker: parsed, then path assertions (`spec.template.spec.containers[*].resources.limits.memory`) |
| Dockerfile, Terraform | `checks.ts`: regex assertions on the text (no parser or binary on the free tier)                                                      |

Generated environment problems are proven like code ones: script references run on Judge0 to produce every hidden output and must reproduce the examples; config references must pass every check and the starter must fail at least two. `npm run eval` includes `tests/evals/env-problems.eval.ts`, which generates a DevOps and an SRE round on the real models.

---

## 2. Who talks to whom

```mermaid
flowchart LR
    subgraph Browser["Candidate browser"]
        CAP["AudioWorklet 'cap'<br/>mic → PCM16 16 kHz, 40 ms frames"]
        PLAY["AudioWorklet 'play'<br/>interviewer PCM → speakers"]
        UI["Room UI: tiles, captions, clock,<br/>Monaco editor, Excalidraw board, chat"]
        PROC["Proctoring: full screen, screen share,<br/>face detector, tab focus, paste"]
        REC["MediaRecorder: cam + screen<br/>10 s WebM chunks"]
    end
    subgraph CF["Cloudflare Worker"]
        RT["/interview/slug/room · warm · rec<br/>same-origin + iv cookie + not-a-phone"]
        DO["InterviewRoom DO<br/>(harness runs here)"]
    end
    PH["Phonic STS WebSocket<br/>api.phonic.ai/v1/sts/ws<br/>voice 'eleanor'"]
    BR["AWS Bedrock<br/>gpt-oss-20b · gpt-oss-120b · gemma-3-12b"]
    J0["Judge0 sandbox"]
    D1[("D1")]
    R2[("R2 MEDIA<br/>iv/sid/…")]

    CAP -- "binary frames" --> RT --> DO
    DO -- "binary PCM" --> PLAY
    UI <-- "JSON {t: ...}" --> DO
    PROC -- "{t:'integrity'}" --> DO
    REC -- "POST /rec" --> RT --> R2
    DO <-- "JSON: audio_chunk base64, events, tool calls" --> PH
    DO -- "bookkeeping, text fallback, whiteboard vision" --> BR
    DO -- "run_tests / Run button" --> J0
    DO -- "checkpoint state + transcript every ≤3 s" --> D1
    DO -- "event log every 15 s, final.json" --> R2
```

---

## 3. Joining: browser → DO → Phonic

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant W as Worker route
    participant DO as InterviewRoom DO
    participant P as Phonic STS
    participant D1 as D1

    Note over B,DO: While the candidate reads the overview
    B->>W: POST /interview/slug/warm
    W->>DO: warm()
    DO->>P: fetch(Upgrade: websocket, Bearer PHONIC_API_KEY)
    P-->>DO: 101 (socket kept as "warmed", 45 s)

    Note over B,DO: Start pressed
    B->>W: WS /interview/slug/room (iv cookie)
    W->>W: Origin check, mobile check, aiSessionFor(slug, cookie)
    W->>DO: fetch + X-Session-Id
    DO->>D1: roomContext(sessionId): job, candidate, config, plan, FAQ, saved state
    DO-->>B: 101 WebSocket (a 2nd tab replaces the 1st, code 4000)
    DO->>D1: markLive (status=live, started_at)
    DO->>DO: load Saved from DO storage or initState(config)
    DO->>DO: prepare(phase), restoreWorkspace(), start 1 s tick
    DO-->>B: {t:"stage", stage:"joining"}
    DO->>P: use warmed socket (else open a new one)
    DO->>P: config {system_prompt, voice_id eleanor, pcm_16000 in/out,<br/>generate_welcome_message, tools (phase subset),<br/>vad_min_silence 1200 ms, min_words_to_interrupt 3,<br/>no_input_poke null, boosted_keywords skills+company, external_id}
    P-->>DO: conversation_created {conversation_id}
    P-->>DO: ready_to_start_conversation
    DO->>DO: onReady: ready=true, syncClock() → clock starts NOW
    DO-->>B: {t:"stage", stage:"ready"}, {t:"state", agent:"listening"}
    P-->>DO: audio_chunk (welcome greeting by name)
    DO-->>B: binary PCM + {t:"cap", who:"agent"}
```

`systemPrompt(phase, ctx, state)` goes in **once**, in `config`. Phonic refuses `update_system_prompt` after the first, so every later phase change is done with `update_tools_subset` + `add_system_message` (section 5).

The prompt contains: the role and company, the candidate's name/skills, the plan's resume claims, the FAQ (location, pay, next steps…), the current phase brief, and memory (rolling summary + last 8 lines) when it's a fresh conversation after a drop.

---

## 4. One conversational turn (the hot path)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant DO as InterviewRoom DO
    participant P as Phonic
    participant BR as Bedrock (FAST)

    loop every 40 ms
        B->>DO: mic frame (binary, ≤1280 bytes)
        DO->>P: audio_chunk {audio: base64}<br/>(silence frame if proctoring paused, skipped if blank)
    end
    P-->>DO: user_started_speaking
    DO->>DO: drop queued wake, lastActivity=now
    DO->>P: add_system_message: code diff / whiteboard text<br/>(pushWorkspace, wrapped in untrusted tags)
    DO-->>B: {t:"you", speaking:true}
    P-->>DO: user_finished_speaking
    DO-->>B: {t:"state", agent:"thinking"}
    P-->>DO: input_text {text}
    DO->>DO: heard++, onCandidateLine(): skip/switch detection (section 7)
    DO->>DO: utter("candidate") → transcript, event log, persistSoon()
    DO-->>B: {t:"cap", who:"you"}
    P-->>DO: assistant_started_speaking
    DO-->>B: {t:"state", agent:"speaking"}
    P-->>DO: audio_chunk {audio, text} ×N
    DO-->>B: binary PCM + growing caption
    alt candidate barges in
        P-->>DO: interrupted_response {text actually said}
        DO-->>B: {t:"flush"} (drop queued audio)
    else finishes
        P-->>DO: assistant_finished_speaking
        DO->>DO: flushReply() (a waiting wake can go now)
    end
    DO->>DO: utter("agent")
    opt every 6 new transcript lines
        DO->>BR: bookkeep(): gpt-oss-20b, BOOKKEEPER prompt
        BR-->>DO: summary, notes per competency, claim results, hints, concerns,<br/>current topic + questions on it, uncorrected wrong facts
        DO->>DO: applyBookkeeping (ids validated against plan/rubric)
        DO->>DO: steer(): topic out of questions or a wrong fact?
        DO->>P: add_system_message "move to claim c2" / "set X straight in a sentence"
    end
```

**Why bookkeeping is a background model, not tools:** when the voice agent had `add_note` / `record_claim_result` / `flag_concern` tools it kept saying "let me note that down". Now the agent has nothing to write; a separate fast model reads the transcript every 6 lines in parallel and produces the evidence the evaluator later cites.

### Keeping the conversation moving (issue #130)

Candidates found the interviewer boring and robotic: it drilled into the first project it heard about, repeated each answer back before the next question, and kept asking around wrong answers. Two layers fix it:

1. **The prompt** (`BASE`, phase briefs): never restate or paraphrase the candidate's answer (react in a few words or not at all, varied, never praise); a topic gets its opening question and at most two follow-ups (a third only if the answers stayed vague), then a short bridge to a new one; the deep dive covers two or three projects or claims (about two minutes each) and the technical round two or three areas; a clearly wrong technical fact is set straight in one kind sentence (or the candidate is asked once if they're sure), then the interviewer moves on. That clarification is not performance feedback, and coding still uses the hint ladder.
2. **The harness backstop** (`steer` in `harness.ts`): the bookkeeper also names the topic of the newest lines (continued or new, and how many questions it got) and lists wrong facts the interviewer let pass. The harness keeps `state.topic` (reset every phase). In the deep dive and technical rounds, once a topic reaches `TOPIC_QUESTIONS` (3) it sends one private note to move on, pointing at a resume claim nobody has covered yet (not while the whiteboard is open: the design discussion is one topic by design). A flagged wrong fact gets a note to set it straight briefly. Notes are context only (`add_system_message`), so the agent applies them at its next turn and never speaks unprompted; in text fallback they ride along with the next typed reply. Each one is logged as a `session` / `steer` event.

The bookkeeper is told that a brief correction is not a hint (the wrong answer is a note), and the evaluator counts a corrected wrong answer as a miss, not as a hint. `npm run eval` includes `tests/evals/interviewer.eval.ts`, which replays scripted conversations through the interviewer prompt on the real model and checks the reply for echoing, topic changes and corrections.

---

## 5. Tool calls

### 5a. Which tools exist in which phase

`toolsFor(phase, {design})` decides; the DO sends that subset in `config` and again with `update_tools_subset` on every phase change. Every tool is a Phonic `custom_websocket` tool, `execution_mode: sync`, strict OpenAI function schema.

| Tool                       | Phases                   | Params                                               | Run by                  | Timeout | What it does                                                                                                              |
| -------------------------- | ------------------------ | ---------------------------------------------------- | ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `request_phase_transition` | all                      | `initiated_by` goal_met \| candidate_asked, `reason` | harness (`applyTool`)   | 10 s    | Ask to move on. Gated (5c). If approved the move happens **inside** the call.                                             |
| `switch_problem`           | coding                   | `level` similar \| easier, `reason`                  | harness + room          | 10 s    | Swap to a backup (similar) or the easier problem. Needs the candidate's confirmation (two-step). At most two swaps.       |
| `read_editor`              | coding                   | —                                                    | room                    | 10 s    | Current code (≤8 000 chars), diff since last look, idle seconds.                                                          |
| `run_tests`                | coding                   | `suite` visible \| hidden                            | room → Judge0           | 60 s    | Runs code. Agent gets pass counts + **names** of failing cases, never hidden inputs/outputs.                              |
| `open_whiteboard`          | technical (if design on) | `topic`, `requirements` (`;`-separated)              | room                    | 10 s    | Opens Excalidraw with the question; new topic = clean board.                                                              |
| `read_whiteboard`          | technical (if design on) | —                                                    | room (+ Bedrock vision) | 30 s    | Board as components + connections; if freehand strokes exist, asks the browser for a PNG and has gemma-3-12b describe it. |
| `close_whiteboard`         | technical (if design on) | —                                                    | room                    | 10 s    | Closes the board (also auto-closed when leaving Technical).                                                               |
| `end_interview`            | wrap-up                  | —                                                    | harness                 | 10 s    | Ends after the goodbye finishes playing.                                                                                  |

### 5b. The path of every tool call

```mermaid
flowchart TD
    T["Phonic → tool_call {tool_call_id, tool_name, parameters}"] --> IF["toolsInFlight++<br/>(blocks wakes, standby, forced moves)"]
    IF --> LOG1["log tool_call"]
    LOG1 --> V{"validateCall<br/>known tool? allowed in this phase?<br/>params typed, trimmed, enum-checked"}
    V -->|no| ERR["result = {error: '... isn't available in the X phase'}"]
    V -->|"workspace tool"| WS["workspaceTool()<br/>read_editor · run_tests · open/read/close_whiteboard"]
    V -->|"harness tool"| AT["applyTool(state) → {state, result, effect}"]
    AT -->|"effect: advance"| TR["transition('approved')<br/>update_tools_subset + add_system_message(phaseBrief)<br/>sent BEFORE the tool result"]
    TR --> R1["result = {approved, now_in_phase,<br/>next: 'one transition sentence, then follow the brief'}"]
    AT -->|"effect: switch"| SW["switchProblem(): next untried backup<br/>→ browser {t:'problem'} + coding brief"]
    AT -->|"effect: end"| EN["setTimeout → endAfterGoodbye()<br/>waits ≤15 s for speech to end, +0.8 s"]
    AT -->|"denied"| DN["result = {approved:false, reason: what to do instead}"]
    ERR --> OUT
    WS --> OUT
    R1 --> OUT
    SW --> OUT
    EN --> OUT
    DN --> OUT
    OUT["log tool_result, persistSoon()"] --> SEND["Phonic ← tool_call_output {tool_call_id, output}"]
    SEND --> DEC["toolsInFlight--"]
```

No `generate_reply` is sent after an approved transition: the agent is already mid-turn, and a second prompt made it talk twice. The new brief simply lands in its context before the tool result does.

### 5c. Transition gates (`requestTransition`)

```mermaid
flowchart TD
    Q["request_phase_transition"] --> M{"spent in phase < 20 s<br/>(MIN_PHASE_MS)?"}
    M -->|yes| N0["denied: it just started, continue"]
    M -->|no| CA{"initiated_by = candidate_asked?"}
    CA -->|yes| CS["confirmStep('skip'):<br/>1st call → denied + 'ask them to confirm'<br/>2nd call after they spoke (≤2 min) → approved"]
    CA -->|"no (goal_met)"| PH{"phase"}
    PH -->|intro| I1{"heard ≥ 2 lines and ≥ 40 s?"}
    PH -->|"resume (Deep dive)"| R1{"≥ 50% of budget?"}
    PH -->|technical| T1{"design enabled, no whiteboard yet,<br/>and < 70% of budget?"}
    PH -->|coding| C1{"no run yet and<br/>< min(3 min, 50% budget)?"}
    PH -->|wrapup| W1["denied: say goodbye, call end_interview"]
    I1 -->|yes| OK["approved → effect advance"]
    I1 -->|no| N1["denied: confirm name, let them introduce themselves"]
    R1 -->|yes| OK
    R1 -->|no| N2["denied: move to a claim not yet covered"]
    T1 -->|yes| N3["denied: call open_whiteboard first"]
    T1 -->|no| OK
    C1 -->|yes| N4["denied: give a real attempt, next hint"]
    C1 -->|no| OK
```

---

## 6. Phases and the clock

```mermaid
stateDiagram-v2
    [*] --> intro: room connects, Phonic ready → clock runs
    intro --> resume: approved / forced
    resume --> technical: approved / forced
    technical --> coding: approved / forced
    coding --> wrapup: approved / forced
    wrapup --> [*]: end_interview / time up → finish("completed")

    note right of intro
        Intro 2 min: greet, confirm name, format, self-intro
    end note
    note right of resume
        Deep dive 6 min: 2-3 projects or claims, a few questions each,
        verify plan.claims
    end note
    note right of technical
        Technical 5 min: questions from resume + role,
        whiteboard tools live here (if design enabled)
    end note
    note right of coding
        Coding 9 min: harness puts plan.problems[0] on screen itself
        (prepare). Editor, Run, read_editor, run_tests, switch_problem
    end note
    note right of wrapup
        Wrap-up 3 min: recruiter's closing questions,
        candidate's questions (FAQ), goodbye
    end note
```

Defaults sum to 25 min (`LIMITS.maxTotalMinutes`); the poster can drop coding or technical, and `cleanConfig` shrinks longer configs proportionally.

**The clock** (`syncClock`) runs only when _all_ hold: candidate connected, interviewer ready (or standby / resuming / text fallback), no proctoring pause. So reconnects and pauses never eat the candidate's time.

**Every 1 s `onTick`:**

```mermaid
flowchart TD
    TK["onTick (1 s)"] --> TI{"tick(state)"}
    TI -->|warn| WT["warnTime: add_system_message 'about N min left, say it at the next pause'<br/>+ wake('warning')"]
    TI -->|"force / wrap"| BUSY{"someone speaking, tool in flight,<br/>or drawing in last 8 s?"}
    BUSY -->|"no, or waited ≥ 30 s"| FT["transition('forced')<br/>(wrap = jump straight to wrap-up)<br/>+ wake('phase', 'time is up, transition')"]
    BUSY -->|yes| WAIT["wait; overrun comes out of the next phase"]
    TI --> FR["flushReply()"]
    FR --> BD{"whiteboard open, unseen change,<br/>no edits for 12 s, nobody talking?"}
    BD -->|yes| WB["pushBoard + wake('board', 'ask about what they drew, by name')"]
    FR --> ID{"coding or board open, silent and<br/>no edits for 60 s × 2^nudges?"}
    ID -->|yes| WI["wake('idle', 'check in briefly') → 1, 2, 4 min back-off"]
    FR --> SB{"coding/board, ready, nobody speaking,<br/>no tools, no queued reply, 90 s without speech?"}
    SB -->|yes| ST["enterStandby (section 8)"]
    FR --> FB{"in text fallback and 45 s since last try?"}
    FB -->|yes| RC["connectPhonic('recover')"]
    FR --> CL["every 5 s: {t:'clock'} to browser<br/>every 15 s: flush event log to R2"]
```

Flexible timing (`RoleConfig.timing = flexible`): phases are a guide, never forced; one warning 2 min before wrap-up must start, then `wrap` jumps to wrap-up; hard limit 60 min.

---

## 7. Wakes, and how the agent is made to speak unprompted

The agent normally only speaks after the candidate does. The harness makes it speak with a **wake**:

```mermaid
flowchart LR
    SRC["Wake sources<br/>phase · warning · integrity · reconnect (urgent)<br/>idle · run · board (rate-limited 20 s)"] --> CW{"canWake?<br/>and not proctoring-paused"}
    CW -->|no| DROP[dropped]
    CW -->|yes| FBK{"text fallback?"}
    FBK -->|yes| TXT["textReply(text) on Bedrock"]
    FBK -->|no| SBY{"standby?"}
    SBY -->|yes| RES["resume('wake') → reconnect Phonic"]
    SBY --> RDY{"Phonic ready?"}
    RES --> RDY
    RDY -->|no| PEND["pendingWake → sent in onReady"]
    RDY -->|yes| QR["queuedReply = text"]
    QR --> FL{"flushReply: agent speaking,<br/>candidate speaking, or tool in flight?"}
    FL -->|yes| HOLD["hold; retried on assistant_finished_speaking<br/>and every tick. Dropped if the candidate starts speaking"]
    FL -->|no| GR["Phonic ← generate_reply {system_message: text}"]
```

`add_system_message` = put a fact in the agent's context (it will use it on its next turn). `generate_reply` = make it talk now. The harness uses the first for briefs/code/board/time notes and the second only through this queue, so the interviewer never talks over itself.

### Skips and problem switches are the candidate's call

```mermaid
sequenceDiagram
    participant C as Candidate
    participant P as Phonic agent
    participant DO as Harness (DO)

    C->>P: "can we skip this / move on?"
    P-->>DO: input_text
    DO->>DO: skipIntent() regex → "skip" (or "switch" / "easier" in coding)
    DO->>DO: openConfirm: state.confirm = {action, heard, at}
    DO->>P: add_system_message "ask them to confirm in one sentence,<br/>don't call any tool, it moves on by itself"
    P->>C: "Just to confirm, you'd like to move on? We can't come back to it."
    C->>P: "yes" / "no, let me try"
    P-->>DO: input_text
    DO->>DO: confirmAnswer() within 2 min
    alt clear yes
        DO->>DO: transition('approved') or switchProblem()
        DO->>P: update_tools_subset + add_system_message(phase brief)
        DO->>P: generate_reply (wake 'phase'): "acknowledge, begin next phase"
    else clear no
        DO->>DO: confirm = null (carry on)
    else unclear
        Note over P,DO: the agent decides, it can call request_phase_transition<br/>with candidate_asked (two-step confirmStep)
    end
```

---

## 8. Voice resilience, standby and fallback

```mermaid
stateDiagram-v2
    [*] --> Connecting: connectPhonic
    Connecting --> Live: ready_to_start_conversation (≤20 s after config)
    Connecting --> Failing: handshake > 30 s / not ready in 20 s
    Live --> Resuming: Phonic closed 1006 / 1012 / 1001 restart
    Resuming --> Live: conversation_reconnected (reconnect_conv_id, ≤8 s)<br/>same conversation, no re-greeting
    Resuming --> Failing: resume timed out
    Live --> Failing: other close / assistant_ended_conversation
    Failing --> Connecting: backoff 0.5, 1, 2, 4, 5 s<br/>new conversation, prompt has summary + last 8 lines,<br/>wake "welcome back"
    Failing --> TextChat: > 5 failures or failing > 60 s
    TextChat --> Connecting: every 45 s try voice ("recover")
    TextChat --> Live: ready → voice message, UI back to voice

    Live --> Standby: coding/board, 90 s without speech
    Standby --> Live: RMS VAD: 3 loud frames (120 ms) or a wake<br/>pre-warmed socket, replay 1.5 s pre-roll
```

- **Text fallback** (`textTurn`): same system prompt and same phase tools, but on Bedrock gpt-oss-20b with tool calling; tools still go through `runTool`, so every gate applies.
- **Standby** saves cost: Phonic bills per open minute (~$0.07/min, ~99% of spend), and coding is mostly silent. The clock keeps running in standby.
- **Candidate drops:** Phonic is kept open 30 s (tab flip = no re-greeting); the browser auto-rejoins up to 3× before sending them to the device check; the DO alarm ends the interview as "abandoned" after 5 min.
- **Proctoring hard signal** (full-screen exit, extra monitor, face absent): clock paused, mic replaced by silence, interviewer audio flushed; on clear, `wake('integrity')` "continue, don't accuse".

---

## 9. Ending and evaluation

```mermaid
sequenceDiagram
    autonumber
    participant DO as InterviewRoom DO
    participant BR as Bedrock
    participant J0 as Judge0
    participant R2 as R2
    participant D1 as D1
    participant Q as Queue
    participant B as Browser

    DO->>DO: stopTimer, closePhonic
    DO->>BR: last bookkeeping pass (≤20 s)
    DO->>DO: advance through remaining phases (reason "end"), unprobed claims → not_reached
    opt problem assigned, code changed, no hidden run since last edit
        DO->>J0: final hidden-test run
    end
    DO->>R2: flush event log (3 retries) iv/sid/events/*.jsonl
    DO->>R2: iv/sid/final.json (code, board, scene, state, summary)
    DO->>D1: finishAi: status=processing, transcript, state
    DO->>Q: enqueue {t:"evaluate"}
    DO->>DO: storage.deleteAll()
    DO-->>B: {t:"ended"}, close
    Q->>R2: readEvents + readFinal
    Q->>BR: EVALUATOR (gpt-oss-120b) on evalInput: transcript, code, runs,<br/>whiteboard, notes, each with citable ids u#/r#/b#/n#
    BR-->>Q: per-competency scores + evidence refs
    Q->>Q: cleanAiReport: drop evidence ids that don't exist,<br/>compute weighted overall + recommendation (bar shifts thresholds),<br/>integrity level from events (never from the model)
    Q->>D1: report, score, status=done
```

---

## 10. Trust boundaries (why it's built this way)

- **Tool calls never cross the browser.** Phonic ⇄ DO only. The browser sends mic audio, code, board, Run, chat (fallback only), integrity, End.
- **Candidate-controlled text is wrapped** in `untrusted(label, …)` tags before it reaches any model (code, diffs, run errors, whiteboard, vision description).
- **Hidden tests stay server-side**: `problem-bank.ts` is server-only (a unit test greps client imports); `publicProblem()` strips hidden cases; `run_tests` returns only failing case names.
- **Validation before effects**: `validateCall` rejects unknown / out-of-phase tools and bad params; bookkeeping and evaluator output are cleaned against the real plan, rubric and evidence ids.
- **Scores are computed, not generated**: overall, recommendation and integrity level are code.
