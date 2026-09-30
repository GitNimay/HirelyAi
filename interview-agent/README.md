# Interview agent

LiveKit Agents (Node) voice interviewer for Hire Excellence. The app issues the candidate a LiveKit token whose room
config dispatches this agent with the job, candidate and questions as job metadata (`lib/interview.ts` in the app).
The agent runs the call (5 min hard limit), then POSTs the transcript to `APP_URL/api/interview/complete`, where the
app stores it and grades it with Bedrock.

Models (LiveKit Inference, no extra keys): AssemblyAI Universal-Streaming STT, Gemma 4 31B LLM, Inworld TTS 1.5 Mini,
LiveKit audio turn detector.

## Run locally

```bash
pnpm install
node src/main.ts dev
```

`.env.local` needs `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `APP_URL=http://localhost:3000`,
`INTERVIEW_AGENT_SECRET` (same value as the app) and `AGENT_NAME=interview-agent-dev` (the app's
`LIVEKIT_AGENT_NAME` must match, so a local agent never takes production calls).

## Deploy to LiveKit Cloud

```bash
lk agent create --secrets APP_URL=https://hire-excellence.n1m35h.in --secrets INTERVIEW_AGENT_SECRET=...
lk agent deploy   # later releases
lk agent logs
```

Production registers as `interview-agent` (no `AGENT_NAME` set).
