# Hire Excellence

A LinkedIn-style network (feed, connections, jobs with Easy Apply, AI voice interviews) on Cloudflare Workers.
It uses Next.js via [vinext](https://github.com/cloudflare/vinext) and Clerk for auth.

| Piece | What it does |
|---|---|
| Worker (`worker/index.ts`) | vinext app, plus the realtime WebSocket route, the interview-agent callback, the queue consumer and the cron |
| D1 `hire-excellence-db` | All app data (`migrations/`) |
| R2 `hire-excellence-media` | Post media, profile images, resume PDFs |
| Durable Object `FeedHub` | Realtime fan-out over hibernatable WebSockets (4 shards) |
| Queue `hire-excellence-tasks` | Background work: AI grading, invite emails, notifications. Retries with backoff, then goes to `hire-excellence-tasks-dlq` |
| Cron (every 15 min) | Closes expired interviews, fails stuck gradings, syncs the Clerk directory |
| `interview-agent/` | LiveKit voice agent (separate package, deployed to LiveKit Cloud) |

## Develop

```bash
npm install
npm run db:migrate:local
npm run dev
```

Secrets go in `.env.local` (see the list at the bottom of `wrangler.jsonc`). Add `APP_URL=http://localhost:3000` there too, or invite emails will link to production.

Checks (CI runs them all): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## First deploy of a new resource

```bash
npx wrangler queues create hire-excellence-tasks
npx wrangler queues create hire-excellence-tasks-dlq
```

## Deploy

```bash
npm run deploy
```

This builds, applies pending D1 migrations to production, then deploys. Set secrets with `npx wrangler secret put NAME`.
