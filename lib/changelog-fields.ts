/** Shapes and the output check for the public changelog (/changelog). Pure, so it's testable without the runtime. */
export type ChangeType = "new" | "improved" | "fixed";
export type Change = [ChangeType, string];
export type Release = { version: string; releasedAt: string; title: string; changes: Change[] };

export const CHANGE_TYPES: ChangeType[] = ["new", "improved", "fixed"];
export const LIMITS = { title: 80, text: 220, changes: 4 };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "").slice(0, max);

/**
 * The AI's answer for one release: `skip` when nothing changed for members, the entry when it's well-formed,
 * null when it's malformed (try again later). Anything outside the three types is dropped, never guessed.
 */
export function cleanRelease(v: unknown): { skip: true } | { skip: false; title: string; changes: Change[] } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { skip?: unknown; title?: unknown; changes?: unknown };
  if (o.skip === true) return { skip: true };
  const title = str(o.title, LIMITS.title);
  const changes = (Array.isArray(o.changes) ? o.changes : [])
    .map((c): Change | null => {
      const type = (c as { type?: unknown })?.type;
      const text = str((c as { text?: unknown })?.text, LIMITS.text);
      return CHANGE_TYPES.includes(type as ChangeType) && text ? [type as ChangeType, text] : null;
    })
    .filter((c): c is Change => c !== null)
    .slice(0, LIMITS.changes);
  return title && changes.length ? { skip: false, title, changes } : null;
}

/**
 * The author's own wording, from a ```release-note block in the PR description (no AI needed):
 *   Title: Reactions            (optional; else the PR title)
 *   New: React to posts with more than a like.
 * `none` inside the block = internal change, skip. Returns null when there's no usable block.
 */
export function parseNote(source: string): { skip: true } | { skip: false; title: string; changes: Change[] } | null {
  const block = /```release-note\s*\n([\s\S]*?)```/i.exec(source)?.[1].trim();
  if (block === undefined) return null;
  if (/^none\.?$/i.test(block)) return { skip: true };
  const lines = block.split("\n").map((l) => /^\s*(title|new|improved|fixed)\s*:\s*(.+)$/i.exec(l)).filter((m) => m !== null);
  const title = lines.find((m) => m[1].toLowerCase() === "title")?.[2] ?? /^Title: (.*)$/m.exec(source)?.[1] ?? "";
  return cleanRelease({ title, changes: lines.filter((m) => m[1].toLowerCase() !== "title").map((m) => ({ type: m[1].toLowerCase(), text: m[2] })) });
}
