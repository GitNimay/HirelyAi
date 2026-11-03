# Hire Excellence review rules

Read by the `ai-review` CI job. CI loads it from the base branch, so a PR can't relax the rules it is reviewed against.

Stack: vinext (Next.js 16 on Cloudflare Workers via `@cloudflare/vite-plugin`), Clerk v7, D1, R2, KV, Queues, Durable Objects and PostHog. The root uses npm and `voice-agent/` (the LiveKit voice screening agent) uses pnpm.

## BLOCK: the PR must not merge

- **Secrets in the diff:** Clerk `sk_` keys, Cloudflare tokens, `oc_sk_` keys, the Turnstile secret, or any `.env*` value. The dummy `pk_test_` key and `sk_test_ci_dummy` in `ci.yml` are allowed.
- **Destructive D1 migration:** dropping or renaming a table or column, or editing a migration that is already in `migrations/`. Migrations are append-only and additive (add the new shape first, drop the old one a release later).
- **Missing authorization:** a server action, API route or Worker handler that reads or changes member data without checking the signed-in user.
- **Company pages:** posting a company's jobs without a verified work email on the page's domain, or writing `company_members` directly (`saveResume` derives it from `resumes.data`).
- **Unsafe SQL:** SQL built by string concatenation or template literals from user input. Use D1 prepared statements with `.bind()`.
- **PII to analytics:** PostHog events (`track()` in `lib/analytics.ts`) carry ids only, never emails, names, resume content or prompt text. Don't add `posthog-node`.
- **Email links from request headers:** email links must use the `APP_URL` var.
- **Auth UI regressions:**
  - Clerk's prebuilt `<SignIn/>` or `<SignUp/>` components. The app uses its own UI.
  - The popup SSO flow.
  - Navigation after `setActive` that doesn't use `window.location.assign`.
- **GitHub Actions:**
  - A non-GitHub-owned action, or any action not pinned to a full commit SHA.
  - `pull_request_target` checking out PR code.
  - `${{ github.event.* }}` used directly inside `run:`.
  - Missing or broad `permissions`.
  - Changes to branch-protection or ruleset settings. A new CI job goes into `ci-ok.needs`.
- **Real bugs:** a crash, data loss, a broken user flow, or a security hole.

## FLAG: comment, but don't block

- Pages using `currentUser()` instead of `signedIn()` from `lib/profile.ts`.
- KV writes on every request (the free tier allows about 1k writes a day).
- Slow work inside a request that belongs in `enqueue()` (`lib/tasks.ts`), or `broadcast`/`sendTo` awaited instead of passed to `waitUntil`.
- Bindings read some other way than `import { env } from "cloudflare:workers"`.
- A new `NEXT_PUBLIC_*` variable that isn't added to the `deploy` job env in `ci.yml`.
- UI that ignores the theme tokens in `app/globals.css`: hard-coded colours, or sizes off the `h-10` controls / `text-sm` scale.
- New logic without a vitest test.
- Over-engineering: a new dependency for something a few lines can do, or abstractions with only one use.

## Don't report

Formatting, lint and type errors (CI checks these already), style nits, and guesses you can't point to a line for.
