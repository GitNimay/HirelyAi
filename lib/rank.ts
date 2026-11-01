/**
 * "For you" ranking. Same shape as Facebook's EdgeRank / Twitter's heavy ranker, minus the ML:
 *   score = affinity(viewer → author) × engagement quality × time decay, then author diversity.
 * Pure so it can be tested without Cloudflare (see rank.test.ts).
 */

export type Candidate = {
  entryId: string; // the row in the timeline (a post, or someone's repost of it)
  targetId: string; // the post actually shown
  entryAuthor: string; // who posted / reposted
  targetAuthor: string;
  entryAt: number; // ms
  likes: number;
  comments: number;
  reposts: number;
};

const HOUR = 3_600_000;

export function rank<T extends Candidate>(
  items: T[],
  viewerId: string,
  affinity: Map<string, number>,
  now = Date.now(),
): T[] {
  const aff = (id: string) => Math.log1p(affinity.get(id) ?? 0); // diminishing returns on interaction count

  const scored = items.map((c) => {
    const ageH = Math.max(0, now - c.entryAt) / HOUR;
    // Comments and reposts signal more intent than likes (LinkedIn/Twitter weight them higher too)
    const engagement = Math.sqrt(1 + c.likes + 3 * c.comments + 4 * c.reposts);
    let a = 1 + Math.max(aff(c.entryAuthor), aff(c.targetAuthor));
    if (c.entryAuthor === viewerId && ageH < 1) a *= 1000; // your fresh post stays on top for you
    return { c, score: (a * engagement) / Math.pow(ageH + 2, 1.5) }; // HN-style gravity
  });
  scored.sort((x, y) => y.score - x.score);

  // One entry per target post (original vs reposts), then damp repeat authors so one person can't flood the feed
  const seen = new Set<string>();
  const perAuthor = new Map<string, number>();
  const out: { c: T; score: number }[] = [];
  for (const s of scored) {
    if (seen.has(s.c.targetId)) continue;
    seen.add(s.c.targetId);
    const n = perAuthor.get(s.c.entryAuthor) ?? 0;
    perAuthor.set(s.c.entryAuthor, n + 1);
    out.push({ c: s.c, score: s.score * Math.pow(0.6, n) });
  }
  return out.sort((x, y) => y.score - x.score).map((s) => s.c);
}
