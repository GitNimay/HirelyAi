import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { fmtRange, STATUSES, type Resume } from "./resume-fields.ts";

// A4 in points
const W = 595.28, H = 841.89, M = 48;
const INK = rgb(0.1, 0.1, 0.1), SOFT = rgb(0.38, 0.38, 0.38), RULE = rgb(0.82, 0.82, 0.82);

/**
 * The standard fonts only encode WinAnsi (Latin-1 plus a few typographic marks).
 * ponytail: other scripts become "?"; embed a Unicode TTF (pdf-lib + fontkit) if members write in them.
 */
const winAnsi = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\t/g, " ").replace(/[^\x20-\x7e\xa0-\xff•–—‘’“”…€™]/g, "?");

/** A clean one-column resume, the layout ATS parsers read best. */
export async function resumePdf(r: Resume): Promise<Uint8Array> {
  const w = await pdfWriter(`${r.name} – Resume`, r.name);
  drawResume(w, r);
  return w.doc.save();
}

export type PdfWriter = Awaited<ReturnType<typeof pdfWriter>>;

/** A4 text flow with wrapping and page breaks; shared by the resume and the applicant export. */
export async function pdfWriter(title: string, author: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(author);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const need = (h: number) => {
    if (y - h >= M) return;
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const para of winAnsi(text).split("\n")) {
      let cur = "";
      for (const word of para.split(" ")) {
        const next = cur ? `${cur} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) <= width || !cur) cur = next;
        else {
          lines.push(cur);
          cur = word;
        }
      }
      lines.push(cur);
    }
    return lines;
  };
  const write = (text: string, { f = font, size = 10, color = INK, x = M, width = W - 2 * M, gap = 3 } = {}) => {
    for (const l of wrap(text, f, size, width)) {
      need(size + gap);
      y -= size;
      page.drawText(l, { x, y, size, font: f, color });
      y -= gap;
    }
  };
  /** Bold left text with a grey right-aligned note (dates) on the same line. */
  const row = (left: string, right: string) => {
    const rw = right ? font.widthOfTextAtSize(winAnsi(right), 9.5) : 0;
    need(16);
    const top = y;
    write(left, { f: bold, size: 10.5, width: W - 2 * M - rw - 12 });
    if (right) page.drawText(winAnsi(right), { x: W - M - rw, y: top - 10.5, size: 9.5, font, color: SOFT });
  };
  const section = (title: string) => {
    need(40);
    y -= 12;
    page.drawText(title.toUpperCase(), { x: M, y: y - 10, size: 10, font: bold, color: INK });
    y -= 15;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: RULE });
    y -= 8;
  };
  const bullets = (text: string) => {
    for (const l of text.split("\n").map((s) => s.replace(/^[\s•*·-]+/, "").trim()).filter(Boolean)) write(`•  ${l}`, { size: 9.5, x: M + 6, width: W - 2 * M - 6, color: SOFT });
  };

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  return { doc, bold, write, row, section, bullets, newPage, SOFT };
}

export function drawResume({ bold, write, row, section, bullets, SOFT }: PdfWriter, r: Resume) {
  write(r.name, { f: bold, size: 22, gap: 6 });
  if (r.headline) write(r.headline, { size: 11, color: SOFT, gap: 4 });
  write([r.email, r.phone, r.city].filter(Boolean).join("   ·   "), { size: 9.5, color: SOFT });

  if (r.summary) {
    section("Summary");
    write(r.summary, { size: 10, color: SOFT });
  }
  if (r.experience.length) {
    section("Experience");
    r.experience.forEach((e, i) => {
      if (i) write("", { size: 3 });
      row(`${e.title} — ${e.company}`, fmtRange(e.start, e.end, e.current));
      if (e.location) write(e.location, { size: 9.5, color: SOFT });
      if (e.description) bullets(e.description);
    });
  }
  if (r.projects.length) {
    section("Projects");
    r.projects.forEach((p, i) => {
      if (i) write("", { size: 3 });
      row(p.name, "");
      if (p.link) write(p.link, { size: 9.5, color: SOFT });
      if (p.description) bullets(p.description);
    });
  }
  if (r.education.length) {
    section("Education");
    r.education.forEach((e, i) => {
      if (i) write("", { size: 3 });
      row(e.school, fmtRange(e.start, e.end));
      write([[e.degree, e.field].filter(Boolean).join(", "), e.grade].filter(Boolean).join("   ·   "), { size: 9.5, color: SOFT });
    });
  }
  if (r.skills.length) {
    section("Skills");
    write(r.skills.join(", "), { size: 10, color: SOFT });
  }
  section("Preferences");
  write([STATUSES[r.status], r.preferredLocations.length ? `Preferred locations: ${r.preferredLocations.join(", ")}` : ""].filter(Boolean).join("   ·   "), { size: 10, color: SOFT });
}
