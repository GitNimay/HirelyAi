// LinkedIn's six reactions. Order = order in the picker. Must match the CHECK in migrations/0016_reactions.sql.
// Images: Microsoft Fluent Emoji 3D (MIT), 96px webp in public/reactions/.
export const REACTIONS = [
  { kind: "like", label: "Like", color: "text-sky-500" },
  { kind: "celebrate", label: "Celebrate", color: "text-emerald-500" },
  { kind: "support", label: "Support", color: "text-violet-400" },
  { kind: "love", label: "Love", color: "text-rose-500" },
  { kind: "insightful", label: "Insightful", color: "text-amber-500" },
  { kind: "funny", label: "Funny", color: "text-teal-500" },
] as const;

export type Reaction = (typeof REACTIONS)[number]["kind"];
/** Per-kind counts; kinds with no reactions are absent. */
export type ReactionCounts = Partial<Record<Reaction, number>>;

export const reactionSrc = (k: Reaction) => `/reactions/${k}.webp`;
export const reactionOf = (k: Reaction) => REACTIONS.find((r) => r.kind === k)!;
export const isReaction = (v: unknown): v is Reaction => REACTIONS.some((r) => r.kind === v);

/** The viewer's reaction moves from `from` to `to` (either may be null): new per-kind counts. */
export function moveReaction(counts: ReactionCounts, from: Reaction | null, to: Reaction | null): ReactionCounts {
  const next = { ...counts };
  if (from && next[from]) next[from] -= 1;
  if (from && !next[from]) delete next[from];
  if (to) next[to] = (next[to] ?? 0) + 1;
  return next;
}

/** Most used first, at most `n`: the little stack of icons beside the count. */
export const topReactions = (counts: ReactionCounts, n = 3) =>
  (Object.entries(counts) as [Reaction, number][]).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
