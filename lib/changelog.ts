import { env } from "cloudflare:workers";
import { bedrockJson } from "./bedrock";
import { cleanRelease, LIMITS, parseNote, type Change, type Release } from "./changelog-fields";

export async function publishedReleases(): Promise<Release[]> {
  const { results } = await env.DB.prepare("SELECT version, released_at, title, changes FROM releases WHERE state = 'published' ORDER BY released_at DESC")
    .all<{ version: string; released_at: string; title: string; changes: string }>();
  return results.map((r) => ({ version: r.version, releasedAt: r.released_at, title: r.title, changes: JSON.parse(r.changes) as Change[] }));
}

const SYSTEM = `You write the public changelog for Hire Excellence, a professional networking and hiring web app (feed, profiles, network, jobs, company pages, screening with voice interviews and tests).
Input: a merged pull request's title and description, written by developers.
Write for members, not developers: what they can now do or will notice. Plain, short sentences.
Never mention technologies, vendors, libraries, frameworks, hosting, databases, code, files, tests, CI, analytics or tracking tools, or internal processes.
Skip when a member would notice nothing: docs, refactors, tooling, deploys, infrastructure, monitoring, dependency updates.
Reply with JSON only, either {"skip": true} or {"title": "...", "changes": [{"type": "new" | "improved" | "fixed", "text": "..."}]}.
Title: a short sentence-case phrase of 2 to 6 words naming the headline change, no version numbers.
Changes: 1 to 3 for most releases, at most ${LIMITS.changes}. Merge related details and keep only what members notice most. Each is one plain sentence under 120 characters, with no timings, settings or implementation details.
Example: {"title": "Reactions", "changes": [{"type": "new", "text": "React to posts with more than a like."}]}`;

// Cost caps for the AI writer: the PR text is trimmed, the answer is bounded, and only a few calls happen per day.
// A release over the daily cap waits for tomorrow; one that fails twice is marked failed and never retried.
const AI = { perDay: 5, perRun: 1, tries: 2, sourceChars: 3000, maxTokens: 1500 };

/**
 * Cron step: turns pending releases (added by the deploy workflow) into member-facing entries, or skips them.
 * The author's ```release-note block is used as written, without AI; only releases without one go to the model.
 */
export async function writePendingReleases() {
  const { results } = await env.DB.prepare(`SELECT version, source FROM releases WHERE state = 'pending' AND attempts < ${AI.tries} ORDER BY released_at LIMIT 10`)
    .all<{ version: string; source: string | null }>();
  const today = new Date().toISOString().slice(0, 10);
  const used = (await env.DB.prepare("SELECT COALESCE(SUM(attempts), 0) AS n FROM releases WHERE ai_day = ?").bind(today).first<number>("n")) ?? 0;
  let budget = Math.min(AI.perRun, AI.perDay - used);

  for (const r of results) {
    const source = r.source ?? "";
    let out = parseNote(source);
    if (!out) {
      if (budget <= 0) continue;
      budget--;
      // Counted before the call, so a crash mid-call still uses up budget and a try
      await env.DB.prepare("UPDATE releases SET attempts = attempts + 1, ai_day = ? WHERE version = ?").bind(today, r.version).run();
      const res = await bedrockJson("changelog", SYSTEM, source.slice(0, AI.sourceChars), AI.maxTokens);
      out = res.ok ? cleanRelease(res.value) : null;
    }
    const stmt = !out
      ? env.DB.prepare(`UPDATE releases SET state = 'failed' WHERE version = ? AND attempts >= ${AI.tries}`).bind(r.version)
      : out.skip
        ? env.DB.prepare("UPDATE releases SET state = 'skipped' WHERE version = ?").bind(r.version)
        : env.DB.prepare("UPDATE releases SET state = 'published', title = ?, changes = ? WHERE version = ?").bind(out.title, JSON.stringify(out.changes), r.version);
    await stmt.run();
    if (!out) console.error(JSON.stringify({ msg: "changelog entry not written", version: r.version }));
  }
}
