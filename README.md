<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="/public/logo-dark.png">
    <img alt="Hire Excellence" src="/public/logo-light.png" width="120">
  </picture>
</p>

<h1 align="center">Hire Excellence</h1>

<p align="center">
  <strong>Connect, hire and grow.</strong><br>
  A professional network where AI runs the first interview, voice or written, so people find work faster and recruiters spend their time on humans instead of on screening.
</p>

<p align="center">
  <a href="https://hire-excellence.n1m35h.in"><img alt="Live demo" src="https://img.shields.io/badge/live%20demo-hire%20excellence-3b82f6?style=flat-square"></a>
  <a href="#installation"><img alt="Install" src="https://img.shields.io/badge/install-npm%20i-ff69c4?style=flat-square"></a>
  <img alt="CI" src="https://github.com/GitNimay/hire-excellence/actions/workflows/ci.yml/badge.svg">
  <img alt="Deploy" src="https://github.com/GitNimay/hire-excellence/actions/workflows/ci.yml/badge.svg?branch=main&label=deploy">
</p>

<p align="center">
  <a href="#why-this-platform-is-useful">Why it's useful</a> &nbsp;|&nbsp;
  <a href="#features">Features</a> &nbsp;|&nbsp;
  <a href="#architecture">Architecture</a> &nbsp;|&nbsp;
  <a href="#tech-stack">Tech stack</a> &nbsp;|&nbsp;
  <a href="#installation">Installation</a> &nbsp;|&nbsp;
  <a href="#deployment">Deploy</a>
</p>

***

## Why this platform is useful

Most hiring breaks down in the same place: **first-round screening doesn't scale.** A recruiter posts a role, gets 200 resumes, and then spends three days asking the same ten questions of people who will never be hired. Meanwhile a good candidate applies, hears nothing for two weeks, and gives up.

Hire Excellence moves that first round off the recruiter's plate and onto an AI that is available 24/7, asks the same questions every time, and is judged against the *actual job description* rather than a keyword match.

**For candidates**

- **Apply once, get screened immediately.** No scheduling ping-pong, no "are you free Tuesday?". Every application includes an invite link that works any time before the deadline.
- **No account needed to be interviewed.** Candidates unlock the interview with a shared link, a shared password, and the email address they applied with. No signup wall between a person and a job they already applied to.
- **A fair, repeatable interview.** Same questions, same time limit of 5 minutes, same grading rubric for everyone. A voice AI is arguably less nervous-inducing than a human interviewer, and it never lets a 20-minute answer slide while the next person waits.
- **A real profile, not a PDF.** Upload a resume and the profile is filled in for you. Export an ATS-clean PDF whenever you want.
- **You choose how you're screened.** Some people talk better than they type, and some people type better than they talk. Hire Excellence offers both, and never both at once.

**For recruiters**

- **Screen 200 people without reading 200 transcripts.** Each candidate arrives with a score out of 100, a fit verdict, a short summary, and specific strengths and concerns, all written against your job description.
- **One pipeline, not five tools.** `Submitted` to `Viewed` to `Shortlisted` to `Rejected`, with the interview result attached to the application.
- **Company pages verified by work email.** One page per domain, enforced in the database, so a look-alike `acme.com.evil.io` page can't impersonate the real company to harvest your employees.
- **Filtering that doesn't cost you candidates.** Structured screening runs *after* someone applies, so nobody is rejected by an algorithm before a human ever sees them.

**For the platform itself**

It runs almost entirely on Cloudflare's edge (Workers, D1, R2, Durable Objects, Queues, KV, Cron, Turnstile) with Next.js in the middle. There is no always-on server to babysit, and the expensive, bursty work of AI grading, invite emails and notification fan-out is pushed to a queue instead of holding a request open.

And because it is a *network* and not a job board, candidates and recruiters live in the same feed. The professional graph is the moat, not the listings.

***

## Features

### AI voice interviews

The centrepiece. A candidate applies, receives an invite, opens a link, passes a mic check, and speaks to an AI interviewer for up to **5 minutes** across **5 questions**.

- **LiveKit voice agent.** A real-time audio room: speech-to-text, an LLM interviewer, text-to-speech, and an audio **turn detector** that decides when the candidate has finished speaking, so interruptions feel natural.
- **Live captions** stream into the page as the conversation happens.
- **Warm start.** The agent is dispatched while the candidate is still on the mic-check screen, which hides agent cold-start latency before the call begins.
- **An interviewer that stays in role.** It is given the job, the candidate's context, and the numbered questions, and is instructed never to score, judge, or hint at an outcome. All judging happens after the call, offline.
- **Time budget enforced twice.** The agent nudges before the limit and cuts regardless, and the server closes anything still running.
- **After the call** the agent posts the transcript back to the app, which grades it with an LLM: a **0 to 100 score**, a **fit** verdict (`Strong fit` / `Possible fit` / `Not a fit`), a **summary**, and up to **5 strengths** and **5 concerns** per candidate.
- **Nothing invented.** The grading prompt explicitly forbids making up answers, and a candidate who says nothing scores zero rather than being flattered.
- **Retries, not dead ends.** Grading runs in a background queue with exponential backoff. If it ultimately fails, the transcript is kept and the recruiter gets a one-click **Retry evaluation**.

### MCQ screening tests

The written alternative. A job's screening is either the voice interview or an MCQ test, never both.

- **Up to 20 questions**, **2 to 6 options** each, **60 seconds per question** with a 15-second grace window and auto-submit at zero.
- **Generate with AI.** Give it a topic and a difficulty of `easy`, `medium` or `hard`, and it writes the test. Or write your own.
- **The answer key never leaves the server.** The candidate's browser receives the questions and options only. Grading is deterministic and instant: `round(correct / total x 100)`, with fit thresholds at 75 and 50.
- **Server-authoritative clock.** The remaining time is computed server-side, so editing the client clock changes nothing.
- **Partial credit for honesty.** Skipped questions are tracked and reported separately from wrong ones.
- **Questions lock** once a candidate starts, so the test can't change under them.

### Jobs and hiring

- **Post and edit roles.** Title, company, workplace (`onsite`, `hybrid` or `remote`), type, level, salary, a description up to 8,000 characters, and a live description preview.
- **Easy Apply.** Email, optional phone, an optional PDF resume of up to 5 MB, and a short "Why you're a fit" note. Prefilled from your last application.
- **A profile snapshot is stored on every application**, so a recruiter always sees the profile that was actually submitted, not whatever the candidate's profile looks like today.
- **Applicant pipeline.** `Submitted`, `Viewed`, `Shortlisted`, `Not selected`, with stage counts, an optional **sort by interview score**, per-applicant status changes, and direct contact links.
- **Closing a job** hides it from search and notifies applicants.
- **Filtering** by keyword, location, workplace, type, level, and date posted, across four tabs: Search, Saved, Applied, Posted.
- **Public share pages** at `/job/<id>` with Open Graph metadata for links pasted into chat apps.
- **Only verified members can post for a company.** Posting rights come from verifying a work email on that company's page.

### Network

- **Connections** with invitations, and accept, ignore, withdraw or remove. Accepting a connection makes both sides follow each other. Ignoring is silent: the sender isn't told, exactly like LinkedIn.
- **Follow** as a separate one-directional edge, with follower and following lists.
- **"People you may know"** scored in a single pass: friends-of-friends score highest at 10, then people who follow you at 5 and people you follow at 3, then authors you commented on at 2 or liked at 1. Anyone else fills the cold-start gap. Dismissals are permanent.
- **Member search** across the directory, which is synced from the auth provider every 15 minutes, so people who have never opened the app are still discoverable.

### Feed

- **Text posts** up to 3,000 characters, or **up to 4 images or 1 video** with per-image alt text.
- **Likes, comments, reposts**, and **editing** with an "edited" marker.
- **Two tabs**: *Following* for strict reverse-chronological, and *For you* for ranked.
- **Company posts.** Verified company pages publish to their followers.
- **Realtime.** Likes, comments, reposts, edits, and deletes propagate to every open tab over WebSockets, with no refresh.

<details>
<summary><b>How the "For you" ranking works</b></summary>

A deliberately small, inspectable ranker in the spirit of EdgeRank and Twitter's heavy ranker, minus the ML:

```
affinity(id)  = ln(1 + affinity[author])            # diminishing returns
engagement   = sqrt(1 + likes + 3*comments + 4*reposts)
a            = 1 + max(affinity[entryAuthor], affinity[targetAuthor])
score        = (a * engagement) / (ageHours + 2) ^ 1.5
```

Affinity is computed in SQL over a 30-day window: **follow 8.0, repost 3.0, comment 2.0, like 1.0.** A repost and its original then collapse into one entry, repeat authors are damped by `score * 0.6 ^ n` so one prolific person can't crowd out everyone else, and your own post from the last hour is pinned to the top.

</details>

### Resume

- **Upload and it's filled in for you.** Drag in a PDF and the experience, education, projects, and skills are extracted and structured, which takes 10 to 20 seconds. Anything the PDF didn't include is flagged as **Required** so nothing slips through.
- **Or build it by hand.** A full editor with chips for skills and locations, plus a Student, Fresher or Working professional status.
- **Typed always wins** over what the AI found, and blank fields are filled from the extracted data rather than overwritten.
- **Download a clean one-column PDF.** The layout ATS parsers read best, generated server-side.
- **Linked to your history.** Experience entries attach to company pages, which is what populates those pages' *People* tab.

### Company pages

- **Create a page, become its owner**, add admins, publish posts, and post jobs.
- **Verify a work email** to prove you belong. Verification requires a *server-verified* email on the page's domain, and **26 free-mail providers never count**.
- **One page per domain**, enforced by a unique index, so look-alike pages can't verify the real company's employees.
- **A People tab** derived automatically from resumes: current employees first, and only from people who have chosen to show their experience publicly.
- Changing a page's website **invalidates everyone's verifications**.

### Notifications

- **14 event types:** likes, reposts, comments, replies, follows, invitations, connection acceptances, new applicants, applications viewed, shortlisted or rejected, jobs posted and jobs closed.
- **Aggregated like a real inbox**: "Ada, Bo and 3 others liked your post".
- **Delivered in-app and pushed live** to every open tab and device.
- **Idempotent and self-cleaning.** Duplicate rows are impossible, and notifications older than 90 days are deleted when you open the page.
- **Grouped** into Posts, Network and Jobs, and into Today and Earlier, with the unread count in the tab title.

### Onboarding and account

- **Six-step onboarding**: details, choose a method, AI reads your resume, review profile, verify email, done.
- **Email verification even for social logins.** If you signed in with Google or GitHub, you still confirm the address, because a recruiter's first email to you has to land.
- **Privacy controls that default to private**: your phone number is only visible to people you apply to, your resume PDFs are served only to you and to recruiters you applied to, your likes are private, and your experience appears on your public profile only if you turn it on.
- **Account settings** for emails, phone numbers, connected providers, and active sessions, with strict re-verification for sensitive actions.
- **Account deletion** removes your D1 rows and R2 objects, including interview transcripts, because those are personal data.

***

## Architecture

```
Browser   ->  Cloudflare Worker   (workerd, vinext on Next.js App Router)
Browser   <-  Durable Object FeedHub   (hibernatable WebSockets, 4 shards)

Worker    ->  D1   hire-excellence-db        all application data
Worker    ->  R2   hire-excellence-media     post media, avatars, resume PDFs
Worker    ->  KV   CACHE                     read-mostly auth cache
Worker    ->  Turnstile  /api/human         human check on shared pages

Worker    ->  Queue hire-excellence-tasks   AI grading, invite emails, notifications
Queue     ->  Queue hire-excellence-tasks-dlq   parked after 5 retries with backoff
Cron      ->  Worker  (every 15 min)         close interviews, fail stuck grading, sync directory

LiveKit voice agent  ->  Worker /api/interview/complete   transcript after the call
Worker    ->  AWS Bedrock    interview grading, MCQ generation, resume parsing
Worker    ->  Resend         interview invite emails
```

### Cloudflare resources

| Resource | Name | What it does |
|---|---|---|
| **Worker** | `hire-excellence` | The vinext app, plus the realtime WebSocket route, the interview-agent callback, the queue consumer and the cron handler |
| **D1** | `hire-excellence-db` | All application data, migrated from `migrations/` |
| **R2** | `hire-excellence-media` | Post media, avatars, cover images, resume PDFs |
| **Durable Object** | `FeedHub` | Realtime fan-out over **hibernatable** WebSockets, sharded 4 ways so idle sockets cost nothing |
| **Queue** | `hire-excellence-tasks` | Background work of AI grading, invite emails and notification fan-out. Up to 5 retries with exponential backoff, then parked in `hire-excellence-tasks-dlq` |
| **KV** | `CACHE` | Read-mostly cache for the signed-in member's auth record, about one write per active member per day and never per request |
| **Rate limiting** | `WRITE_LIMIT` | Per-user write throttle: **60 writes per 60 s** for posts, uploads, likes and comments |
| **Cron** | `*/15 * * * *` | Closes expired interviews, fails stuck gradings, syncs the member directory |
| **Turnstile** | n/a | The "verify you are human" gate on shared pages |

### Realtime

One WebSocket per tab, shared by every subscriber, with exponential reconnect and a 25-second heartbeat. Sockets are tagged with the user id, so private events (notifications, network changes, application updates) go to exactly that person's shard, while public events (new posts, engagement counts) fan out to all four shards. Every surface resyncs when the tab becomes visible again, because events sent while the socket was down are gone.

### Project layout

```
app/                 Next.js App Router pages, layouts, route handlers
  api/               media, uploads, resume PDF, Clerk email webhook
  company/           company pages (About / Posts / Jobs / People)
  dashboard/         the signed-in app (feed, network, jobs, notifications, settings)
  in/[handle]/       public profiles
  interview/[slug]/  the candidate-facing interview (no account required)
components/          UI: feed, jobs, interview, network, profile, company, kit
lib/                 data access, validation, ranking, AI prompts
  *.test.ts          pure unit tests, no framework required
interview-agent/     the LiveKit voice agent (separate package, own toolchain)
migrations/          D1 SQL migrations
worker/index.ts      the Worker: routes, WebSocket, queue consumer, cron
```

***

## Tech stack

| Layer | Choice |
|---|---|
| **Framework** | Next.js 16 App Router on [vinext](https://github.com/cloudflare/vinext), which is Cloudflare's Next.js-on-Vite and workerd compatibility layer |
| **Runtime** | Cloudflare Workers (`workerd`) via `@cloudflare/vite-plugin`, with RSC enabled |
| **Language** | TypeScript 5, strict |
| **UI** | React 19, Tailwind CSS v4 with CSS-variable theming and no `tailwind.config.js`, hand-written primitives, `lucide-react` icons, Geist and Geist Mono |
| **Animation** | `motion`, which respects `prefers-reduced-motion` throughout, and `thinking-orbs` for the live interviewer orb |
| **Auth** | [Clerk](https://clerk.com) for sessions, OAuth, email OTP and bot protection |
| **Database** | Cloudflare D1 (SQLite) with 13 migrations |
| **Storage** | Cloudflare R2 for media and resumes, KV for cache |
| **Realtime** | Durable Objects with hibernatable WebSockets |
| **Background work** | Cloudflare Queues with retry, backoff and a dead-letter queue |
| **AI for grading, MCQ generation and resume parsing** | AWS Bedrock through its OpenAI-compatible `/chat/completions` endpoint, with the model supplied by `BEDROCK_MODEL` |
| **AI for voice** | LiveKit Agents, using LiveKit Inference for STT, LLM, TTS and the audio turn detector |
| **Voice client** | `livekit-client` |
| **PDF** | `pdf-lib` to generate and `unpdf` to parse, both pure JS so both run on Workers |
| **Email** | Resend REST API |
| **Bot defence** | Cloudflare Turnstile |
| **Testing** | `node --experimental-strip-types` with `node:assert/strict` for the app, and Vitest for the interview agent |

***

## Installation

### Prerequisites

- **Node.js 22 or later** for the app (CI uses 22, and 24 works), with **npm**
- **Node.js 24 or later** with **pnpm 10 or later**, only if you want to run the voice agent locally
- A **Cloudflare account** and `wrangler`, available through `npx wrangler` with no global install required
- Accounts for the services you want to switch on: **Clerk** (required), **AWS Bedrock**, **Resend**, **LiveKit Cloud** and **Cloudflare Turnstile**

### 1. Get the code

```bash
git clone https://github.com/GitNimay/hire-excellence.git
cd hire-excellence
npm install
```

### 2. Create your Cloudflare resources

The committed `wrangler.jsonc` points at the original author's D1 database and KV namespace, so **replace those IDs with your own** before migrating:

```bash
npx wrangler login

npx wrangler d1 create hire-excellence-db          # then copy database_id into wrangler.jsonc
npx wrangler r2 bucket create hire-excellence-media
npx wrangler kv namespace create CACHE             # then copy the id into wrangler.jsonc
npx wrangler queues create hire-excellence-tasks
npx wrangler queues create hire-excellence-tasks-dlq
```

Also set `"vars": { "APP_URL": "http://localhost:3000" }` and give Turnstile your own hostnames. `APP_URL` is what invite emails link to, so set it or your local invites will point at production.

### 3. Run the migrations

```bash
npm run db:migrate:local
```

### 4. Configure secrets

Secrets go in `.env.local`, which is git-ignored, for local work. In production they go on the Worker via `npx wrangler secret put NAME`.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth, from the Clerk dashboard |
| `CLERK_SECRET_KEY` | Auth |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `..._SIGN_UP_URL`, `..._FALLBACK_REDIRECT_URL` | Where Clerk's hosted pages send people back to |
| `CLERK_WEBHOOK_SECRET` | Verifying the `email.created` webhook |
| `BEDROCK_API_KEY`, `BEDROCK_MODEL`, `BEDROCK_BASE_URL` | Interview grading, MCQ generation, resume parsing |
| `RESEND_API_KEY`, `MAIL_FROM` | Interview invite emails |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME` | Voice interview rooms |
| `INTERVIEW_AGENT_SECRET` | Shared bearer token the agent authenticates with, which must match the agent's copy |
| `TURNSTILE_SITEKEY`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES` | The human-verification gate |
| `APP_URL` | Absolute links in emails, never read from request headers |

### 5. Run it

```bash
npm run dev
```

Open **http://localhost:3000**. Sign in, and onboarding will walk you through the rest.

### 6. Optionally run the voice agent locally

The interviewer is a **separate package** with its own toolchain, deployed to LiveKit Cloud. Read `interview-agent/README.md` for the full flow. In short:

```bash
cd interview-agent
pnpm install
pnpm dev            # or: node src/main.ts dev
```

Its `.env.local` needs the LiveKit keys plus `APP_URL`, a matching `INTERVIEW_AGENT_SECRET`, and an `AGENT_NAME=interview-agent-dev` that matches the app's `LIVEKIT_AGENT_NAME`, so a local agent never picks up production calls.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run deploy` | Build, apply D1 migrations, then deploy the Worker |
| `npm test` | Run the pure unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations |

***

## Testing

```bash
npm test        # pure logic: ranking, validation, notification wording, parsing
npm run lint
npm run typecheck
npm run build
```

There is no test framework. The suite runs on Node's built-in type stripping with `node:assert/strict`, so it needs neither a runner nor a Cloudflare runtime. Nine test files cover the parts worth protecting:

| File | Covers |
|---|---|
| `rank.test.ts` | the feed ranker: recency, affinity, engagement, repost dedupe, author diversity and self-pinning |
| `prose.test.ts` | the plain-text post formatter: headings, bullets, ordered lists, inline bold and links |
| `resume-fields.test.ts` | messy model output cleanup, date normalisation, merge precedence, and a real generated PDF |
| `interview-fields.test.ts` | question, MCQ and report cleaning and clamping, transcript cleaning, and deterministic MCQ grading |
| `media.test.ts` | R2 key shape, ownership and folder isolation, with no prefix-collision leaks |
| `profile-fields.test.ts` | slugify across accents and non-Latin scripts, handle rules and URL scheme rejection |
| `company-fields.test.ts` | domain extraction, subdomain matching, look-alike rejection and company-field allowlists |
| `job-fields.test.ts` | filter sanitisation, including prototype-key rejection |
| `notification-format.test.ts` | actor aggregation and every notification verb |

All four CI steps run on every pull request and push to `main`.

***

## Deployment

### Manual

```bash
npm run deploy                       # build, migrate, deploy
npx wrangler secret put SECRET_NAME  # add each secret
```

### Automatic

Push to `main` and CI does the rest:

1. `lint`, then `typecheck`, then `test`, then `build`
2. A version tag is computed from the last release, where `[minor]` or `[major]` in the PR title bumps it further
3. D1 migrations are applied and the Worker is deployed with the tag attached, so a rollback target is always obvious
4. A GitHub Release is created with the PRs merged since the last version

Deploys are serialized by a concurrency group, so a newer merge waits for the running deploy rather than racing its migrations.

### After deploying the voice agent

The agent lives on LiveKit Cloud, not in this repo:

```bash
lk agent create --secrets APP_URL=https://your-domain --secrets INTERVIEW_AGENT_SECRET=...
lk agent deploy     # for later releases
lk agent logs
```

***

## Security and abuse prevention

Defence in depth, applied by default rather than per-route:

- **Rate limiting** on every mutating action, at 60 writes per minute per user, with a separate bucket by IP for interview access attempts.
- **Turnstile** on shared pages: `/sign-in`, `/sign-up`, `/post/*`, `/job/*` and `/interview/*`. The check **fails closed**, requiring success *and* the expected action *and* a known hostname, and the pass cookie is HMAC-signed and verified in constant time. Link-preview bots are exempted only from public posts and jobs, never from interviews.
- **Security headers** on every response: HSTS, `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy, and a permissions policy that allows the microphone only where it's needed.
- **Private resumes.** A resume PDF is served only to its owner or to a recruiter the owner applied to with that exact file. Media is served with `default-src 'none'; sandbox` and range requests.
- **Constant-time secret comparison** for the interview password and the agent's bearer token, plus hand-rolled WebCrypto HMAC verification for Clerk webhooks.
- **Input sanitisation everywhere:** enum allowlists, prototype-key rejection, LIKE-wildcard escaping, rejection of `javascript:`, `ftp:` and `localhost` URLs, allowlisted handles, and cleaned and clamped model output.
- **Auth re-checked in every server action**, because server actions are public POST endpoints. Ownership is verified on every object read, not just at the route level.
- **Uploads** are checked for rate limit, content type, size, folder and recorded owner before anything is served.

***

## Acknowledgements

- [vinext](https://github.com/cloudflare/vinext) and the Cloudflare Workers platform
- [Clerk](https://clerk.com) for authentication
- [LiveKit](https://livekit.io) Agents and Inference for the voice interviewer
- [Tailwind CSS](https://tailwindcss.com) v4 and [shadcn/ui](https://ui.shadcn.com) conventions
- [pdf-lib](https://pdf-lib.js.org) and [unpdf](https://github.com/gnip/unpdf), pure JS so they work on Workers
- The heart-pop animation in `components/like-button.tsx`, adapted from [Opensource UI](https://github.com/opensourceui) (MIT)

***

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="/public/logo-dark.png">
    <img alt="Hire Excellence" src="/public/logo-light.png" width="64">
  </picture>
  <br>
  <sub>Connect, hire and grow.</sub>
</p>

<p align="center">
  <sub>Live at <a href="https://hire-excellence.n1m35h.in">hire-excellence.n1m35h.in</a> &nbsp;|&nbsp; No license has been granted yet. All rights reserved.</sub>
</p>