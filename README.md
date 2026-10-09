<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="/public/logo-dark.png">
    <img alt="Hire Excellence" src="/public/logo-light.png" width="80">
  </picture>
</p>

<h1 align="center">Hire Excellence</h1>

<p align="center">
  A professional network where AI runs the first interview.<br>
  <a href="https://hire-excellence.n1m35h.in">hire-excellence.n1m35h.in</a>
</p>

---

## Features

- **AI voice interviews** — 5-minute LiveKit interview, graded against the job description
- **MCQ screening** — AI-generated or hand-written, server-side timer and grading
- **Jobs** — post, apply, and track applicants through a simple pipeline
- **Network & feed** — connections, follows, posts, realtime updates
- **Resume** — upload a PDF and your profile fills itself in
- **Company pages** — verified by work email, one page per domain

## Stack

Next.js 16 on [vinext](https://github.com/cloudflare/vinext) · Cloudflare Workers, D1, R2, Durable Objects, Queues · Clerk · AWS Bedrock · LiveKit · Tailwind v4

## Getting started

```bash
git clone https://github.com/GitNimay/hire-excellence.git
cd hire-excellence
npm install
npm run db:migrate:local
npm run dev
```

Add your keys to `.env.local` (Clerk, Bedrock, Resend, LiveKit, Turnstile) and point `wrangler.jsonc` at your own D1 and KV IDs. The voice agent lives in [`interview-agent/`](interview-agent/README.md).

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm test` | Unit tests |
| `npm run typecheck` | Type check |
| `npm run deploy` | Build, migrate, deploy |

---

<p align="center"><sub>All rights reserved.</sub></p>
