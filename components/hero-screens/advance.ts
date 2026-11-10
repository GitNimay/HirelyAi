/** The slideshow's advance decision, extracted for tests: after a story ends, move to the next screen
    (wrapping around) — but never when the story was cancelled (the visitor already moved on) or under
    reduced motion, where the slideshow waits for the pager instead of advancing on its own. */
export function advance(
  at: number,
  count: number,
  { alive, reduced }: { alive: boolean; reduced: boolean },
): number | null {
  if (!alive || reduced) return null;
  return (at + 1) % count;
}
