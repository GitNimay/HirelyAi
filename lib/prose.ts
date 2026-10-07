/**
 * Plain-text job descriptions → blocks, the way recruiters actually write or paste them (Word, LinkedIn, Naukri):
 * "Responsibilities:" / "## Requirements" / "**Benefits**" headings, "-", "•", "✓" bullets and "1." / "2)" numbered lists.
 * Pure, so it also runs under `npm test`.
 */
export type Block = { t: "h"; text: string } | { t: "p"; text: string } | { t: "ul" | "ol"; items: string[] };
export type Span = { t: "text" | "b" | "url" | "email"; text: string };

const BULLET = /^\s*(?:[-*]\s+|[•●○◦▪■□‣–—·✓✔✅➤➢►→]\s*)(?=\S)/;
const NUMBER = /^\s*\d{1,2}[.)]\s+(?=\S)/;
const MD_HEADING = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;
const BOLD_LINE = /^\s*\*\*(.+?)\*\*:?\s*$/;
const SENTENCE_END = /[.!?;,]$/;

/** A short line that labels what follows: "Requirements:", "ABOUT US", or "About the role" before more content. */
function heading(s: string, next: string, nextIsList: boolean, blockStart: boolean): string | null {
  if (s.length > 60) return null;
  if (/^[^:]+:$/.test(s)) return s.slice(0, -1).trim();
  if (/[A-Z]/.test(s) && s === s.toUpperCase() && s.length >= 3 && !SENTENCE_END.test(s)) return s;
  // Bare short label (a few words, no punctuation): only at a block start, before a list, a blank line or a sentence
  const label = blockStart && s.split(/\s+/).length <= 6 && !SENTENCE_END.test(s);
  if (label && (nextIsList || next === "" || SENTENCE_END.test(next))) return s;
  return null;
}

export function parseProse(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", text: para.join("\n") });
    para = [];
  };
  const isList = (l: string | undefined) => !!l && (BULLET.test(l) || NUMBER.test(l));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }
    const kind = BULLET.test(line) ? "ul" : NUMBER.test(line) ? "ol" : null;
    if (kind) {
      flush();
      const item = line.replace(kind === "ul" ? BULLET : NUMBER, "").trim();
      const last = blocks.at(-1);
      // Items split by blank lines ("• a\n\n• b") are still one list
      if (last?.t === kind) last.items.push(item);
      else blocks.push({ t: kind, items: [item] });
      continue;
    }
    // MD_HEADING backtracks cubically on long whitespace runs; real headings are short
    const md = (line.length <= 200 ? MD_HEADING.exec(line) : null) ?? BOLD_LINE.exec(line);
    const next = lines[i + 1]?.trim() ?? "";
    const more = lines.slice(i + 1).some((l) => l.trim());
    const h = md ? md[1].replace(/:$/, "") : more ? heading(line.trim(), next, isList(next), para.length === 0) : null;
    if (h) {
      flush();
      blocks.push({ t: "h", text: h });
      continue;
    }
    para.push(line.trimEnd());
  }
  flush();
  return blocks;
}

const INLINE = /\*\*([^*\n]+)\*\*|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

/** **bold**, links and emails inside a line. */
export function parseInline(text: string): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) out.push({ t: "text", text: text.slice(at, m.index) });
    out.push(m[1] ? { t: "b", text: m[1] } : m[2] ? { t: "url", text: m[2] } : { t: "email", text: m[3] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ t: "text", text: text.slice(at) });
  return out;
}
