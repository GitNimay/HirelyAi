<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <img alt="Hirely AI" src="public/logo-light.png" width="80">
  </picture>
</p>

<h1 align="center">Hirely AI</h1>

<p align="center">
  A professional network where AI runs the first interview.<br>
  <a href="https://hire-excellence.n1m35h.in">hire-excellence.n1m35h.in</a>
</p>

---

## Features

- **AI voice interviews:** a 5-minute LiveKit interview, graded against the job description
- **MCQ screening:** AI-generated or hand-written, with a server-side timer and grading
- **Jobs:** post, apply, and track applicants through a simple pipeline
- **Network & feed:** connections, follows, posts, realtime updates
- **Resume:** upload a PDF and your profile fills itself in
- **Company pages:** verified by work email, one page per domain

## Architecture

```mermaid
flowchart TB
    B["Browser"]
    W["Worker · SSR, API, realtime"]

    subgraph cf["Cloudflare"]
        DB[("D1 · data")]
        R2[("R2 · media")]
        KV[("KV · cache")]
        DO["Durable Objects · realtime"]
        Q["Queues · background work"]
    end

    AI["Bedrock · LLM"]
    RE["Resend · email"]
    CL["Clerk · auth"]
    LK["LiveKit · voice interviews"]

    B <--> W
    W --> DB & R2 & KV & DO & Q
    W --> AI & RE & CL & LK
    Q --> AI & RE
```

Next.js 16 on [vinext](https://github.com/cloudflare/vinext) deploys as one Cloudflare Worker, styled with Tailwind v4. D1 holds the data, R2 the media, KV a read-mostly cache, and a Durable Object pushes realtime feed updates over WebSockets. Slow work (AI grading, invite emails, notification fan-out) goes through Queues back into the same Worker, retried with backoff and parked in a dead-letter queue when it keeps failing.

## Voice interview

```mermaid
sequenceDiagram
    autonumber
    actor C as Candidate
    participant A as App (Worker)
    participant L as LiveKit
    participant G as interview-agent
    participant B as Bedrock

    C->>A: Apply to a job
    A-->>C: Invite email: link and password
    C->>A: Verify, confirm details
    A->>L: Mint token, dispatch agent with job metadata
    C->>L: Join the room
    L->>G: Dispatch the agent
    G->>G: Run the 5-minute call (STT, LLM, TTS)
    G->>A: Call ends, POST the transcript
    A->>B: Grade against the job description
    B-->>A: Report and score
```

The app mints a LiveKit token whose room config dispatches [the voice agent](voice-agent/README.md) (registered with LiveKit as `interview-agent`) with the job, candidate and questions as metadata. The agent runs the call (5-minute hard limit) on LiveKit Inference: AssemblyAI streaming STT, Gemma 4 31B, Inworld TTS, no extra keys. When the call ends it POSTs the transcript to `/api/interview/complete`, a queue grades it with Bedrock, and the poster gets the report.

## AI interview

```mermaid
flowchart TD
    subgraph before["1 · Before the call"]
        direction LR
        A["Candidate applies"] --> P["AI prepares a plan<br/>resume claims to check<br/>+ coding problems, proven in Judge0"]
        A --> E["Invite email<br/>link, ID, password"]
        E --> S["Sign in, device check,<br/>consent, overview"]
    end

    subgraph live["2 · The live interview (about 25 min, voice)"]
        direction LR
        I["Intro · 2 min<br/>greet, confirm name,<br/>self-introduction"]
        D["Deep dive · 6 min<br/>2-3 projects from the resume:<br/>what they did, trade-offs, outcome"]
        T["Technical · 5 min<br/>role questions<br/>+ system design on a whiteboard"]
        C["Coding · 9 min<br/>problem in the editor,<br/>runs hidden tests"]
        W["Wrap-up · 3 min<br/>recruiter's questions,<br/>candidate's questions"]
        I --> D --> T --> C --> W
    end

    subgraph after["3 · After the call"]
        direction LR
        R["Transcript, code, whiteboard,<br/>recordings saved"] --> G["AI grades each skill,<br/>citing evidence"]
        G --> O["Recruiter gets the report<br/>score, recommendation, integrity"]
    end

    P -.-> live
    S --> live
    live --> after
```

The candidate talks to a voice interviewer (Phonic speech-to-speech) while the `InterviewRoom` Durable Object runs a harness that decides everything else: which round it is, which tools exist (editor, tests, whiteboard), when to move on, and when the clock forces a round to end. The clock pauses on reconnects and proctoring pauses, skips need the candidate's "yes", and a flexible mode lets the call run up to 60 minutes. Scores come from a separate grader and the final numbers are computed in code, never written by the model. See [docs/ai-interview-flow.md](docs/ai-interview-flow.md) for the full flow, tool calls and harness, and [docs/](docs/README.md) for all docs.

### The harness

**Class diagram: who does what.** The room owns the state; the harness is pure functions that read it and return a new one. Phonic only talks and asks for tools; it never decides.

```mermaid
classDiagram
    direction LR
    class Browser {
        mic audio
        code and whiteboard
        Run and End buttons
    }
    class InterviewRoom {
        <<Durable Object>>
        onAudio()
        onToolCall()
        onTick() every 1 s
        finish()
    }
    class HarnessState {
        phase and clock
        answers heard
        claims checked
        test runs
        current topic
    }
    class Harness {
        <<pure functions>>
        toolsFor(phase)
        validateCall(tool)
        requestTransition()
        applyTool()
        tick()
        steer()
    }
    class Phonic {
        <<voice model>>
        speech to speech
        tool calls
    }
    class Bookkeeper {
        <<gpt-oss-20b>>
        notes per skill
        claim results
        topic tracking
    }
    class Judge0 {
        <<sandbox>>
        runs code
        hidden tests
    }
    class Evaluator {
        <<gpt-oss-120b + code>>
        scores with evidence
        recommendation
    }

    Browser "1" <--> "1" InterviewRoom : WebSocket
    InterviewRoom *-- HarnessState : owns
    InterviewRoom --> Harness : asks every decision
    Harness ..> HarnessState : reads, returns new
    InterviewRoom <--> Phonic : audio, briefs, tool results
    InterviewRoom --> Bookkeeper : every 6 lines
    InterviewRoom --> Judge0 : run_tests
    InterviewRoom ..> Evaluator : on finish, via queue
```

**State machine: how the interview moves.** Arrows read `event [guard] / action`. The agent can only _ask_ to move on (`request_phase_transition`); the harness approves it when the guard holds and otherwise tells the agent what to do instead.

```mermaid
stateDiagram-v2
    state "Joining" as Joining
    state "Live (clock running)" as Live {
        state "Intro · 2 min" as Intro
        state "Deep dive · 6 min" as DeepDive
        state "Technical · 5 min" as Technical
        state "Coding · 9 min" as Coding
        state "Wrap-up · 3 min" as WrapUp

        [*] --> Intro
        Intro --> DeepDive : goal_met [2 answers and 40 s]
        DeepDive --> Technical : goal_met [half its time used]
        Technical --> Coding : goal_met [whiteboard used or 70% of time]
        Coding --> WrapUp : goal_met [final code tested, or enough time spent]
        WrapUp --> [*] : end_interview [after goodbye]
    }
    state "Ended" as Ended

    [*] --> Joining : candidate presses Start
    Joining --> Live : Phonic ready / start clock
    Live --> Ended : done, End pressed, or no rejoin in 5 min / finish()
    Ended --> [*] : queue grades the report

    note right of Live
        Any round also moves on when
        - its time runs out (forced move)
        - the candidate asks to skip and says "yes"
        The clock stops while the candidate is
        disconnected or proctoring pauses the call.
    end note
```

| Round     | Tools the agent gets                                                    |
| --------- | ----------------------------------------------------------------------- |
| Every one | `request_phase_transition`                                              |
| Technical | `open_whiteboard`, `read_whiteboard`, `close_whiteboard` (if design on) |
| Coding    | `run_tests`, `switch_problem`                                           |
| Wrap-up   | `end_interview`                                                         |

## Getting started

```bash
git clone https://github.com/GitNimay/hire-excellence.git
cd hire-excellence
npm install
npm run db:migrate:local
npm run dev
```

Add your keys to `.env.local` (Clerk, Bedrock, Resend, LiveKit, Turnstile) and point `wrangler.jsonc` at your own D1 and KV IDs.

## Scripts

| Command                    |                                                 |
| -------------------------- | ----------------------------------------------- |
| `npm run dev`              | Dev server on :3000                             |
| `npm test`                 | All tests (unit + integration)                  |
| `npm run test:unit`        | Unit tests only (fast, no database)             |
| `npm run test:integration` | Integration tests against a local D1 and R2     |
| `npm run test:watch`       | Re-run affected tests on save                   |
| `npm run test:coverage`    | All tests with a coverage report in `coverage/` |
| `npm run typecheck`        | Type check                                      |
| `npm run deploy`           | Build, migrate, deploy                          |

## Tests

[Vitest](https://vitest.dev), in two projects (`vitest.config.ts`):

- **Unit**, next to the code (`lib/*.test.ts`, `app/**/*.test.ts`): pure logic, plus modules whose only outside calls (fetch, Clerk, analytics) are mocked. No database.
- **Integration** (`tests/integration/`): code that reads or writes D1 and R2 runs against a real local database. A global setup applies every file in `migrations/` with `wrangler d1 migrations apply`, and each test file gets its own copy, so files run in parallel. Tests build their own rows with the factories in `tests/integration/factories.ts` and never depend on each other. Only Clerk, the realtime Durable Object, Bedrock and other external HTTP calls are mocked.

The integration Worker config (`tests/integration/wrangler.jsonc`) has dummy values and no `.dev.vars`, so tests never see real secrets or touch remote resources. CI runs everything with coverage and fails below the floor set in `vitest.config.ts`. The CI `integration` job then smoke-tests the built Worker over HTTP.

---

<p align="center"><sub>Emoji reactions adapted from <a href="https://github.com/swamimalode07/rare-ui">rare-ui</a> · All rights reserved.</sub></p>
