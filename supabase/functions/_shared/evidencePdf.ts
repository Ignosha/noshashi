/**
 * Draws a Ledger Evidence Report (the ReportModel built in
 * ./evidenceReport.ts) as a PDF: US Letter, a dark title band, numbered
 * sections, tables with shaded headers, and a footer with the report
 * reference and page numbers on every page. Helvetica throughout, so the
 * file opens identically everywhere and needs no embedded fonts.
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import type { Block, ReportModel, Tone } from "./evidenceReport.ts";

const W = 612;
const H = 792;
const M = 54;
const INNER = W - 2 * M;
const BOTTOM = 64;

const INK = rgb(0.1, 0.13, 0.19);
const MUTED = rgb(0.38, 0.42, 0.48);
const RULE = rgb(0.86, 0.88, 0.91);
const BAND = rgb(0.043, 0.102, 0.173);
const ACCENT = rgb(0.122, 0.373, 0.82);
const HEAD_FILL = rgb(0.95, 0.96, 0.975);
const TONES: Record<Exclude<Tone, null>, ReturnType<typeof rgb>> = {
  good: rgb(0.05, 0.47, 0.29),
  warn: rgb(0.62, 0.38, 0.0),
  bad: rgb(0.72, 0.14, 0.18),
  muted: MUTED,
};

/** Helvetica's encoding (WinAnsi) has no glyph for some characters; say them another way. */
function clean(text: string): string {
  return text
    .replace(/[→]/g, "->")
    .replace(/[≤]/g, "<=")
    .replace(/[≥]/g, ">=")
    .replace(/[✓✔]/g, "Yes")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…€™ŒœŠšŸŽžƒˆ˜†‡‰‹›]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      // A word wider than the line (a hash, an address) is broken by characters.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

export async function renderPdf(model: ReportModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.title} ${model.meta[0]?.[1] ?? ""}`.trim());
  doc.setAuthor("NOSHASHI");
  doc.setSubject(model.subtitle);
  doc.setCreator("NOSHASHI (noshashi.app)");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H;

  const text = (s: string, x: number, yy: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(clean(s), { x, y: yy, size, font, color });

  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: BAND });
    y = H - M;
  };
  const room = (need: number) => {
    if (y - need < BOTTOM) newPage();
  };

  // ── Title band ──
  page.drawRectangle({ x: 0, y: H - 168, width: W, height: 168, color: BAND });
  text("NOSHASHI", M, H - 50, 11, bold, rgb(1, 1, 1));
  page.drawRectangle({ x: M, y: H - 60, width: 28, height: 2, color: ACCENT });
  text(model.title, M, H - 98, 26, bold, rgb(1, 1, 1));
  for (const [i, line] of wrap(model.subtitle, regular, 12, INNER).slice(0, 2).entries()) text(line, M, H - 122 - i * 15, 12, regular, rgb(0.78, 0.83, 0.9));
  y = H - 168 - 26;

  // ── Meta row ──
  const colW = INNER / Math.max(1, model.meta.length);
  model.meta.forEach(([k, v], i) => {
    text(k.toUpperCase(), M + i * colW, y, 7.5, bold, MUTED);
    wrap(v, regular, 10, colW - 10).slice(0, 2).forEach((line, j) => text(line, M + i * colW, y - 14 - j * 12, 10, regular));
  });
  y -= 40;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: RULE });
  y -= 22;

  const para = (s: string, small = false) => {
    const size = small ? 8.5 : 10.5;
    const lead = small ? 11.5 : 15;
    for (const line of wrap(s, regular, size, INNER)) {
      room(lead);
      text(line, M, y, size, regular, small ? MUTED : INK);
      y -= lead;
    }
    y -= small ? 6 : 8;
  };

  const draw = (b: Block) => {
    switch (b.type) {
      case "heading":
        room(46);
        y -= 8;
        text(b.text, M, y, 15, bold);
        y -= 9;
        page.drawRectangle({ x: M, y, width: 22, height: 2, color: ACCENT });
        y -= 18;
        return;
      case "subheading":
        room(30);
        text(b.text, M, y, 11, bold);
        y -= 16;
        return;
      case "para":
        return para(b.text, b.small);
      case "bullets":
        for (const item of b.items) {
          const lines = wrap(item, regular, 10.5, INNER - 16);
          room(15 * Math.min(lines.length, 3));
          page.drawCircle({ x: M + 4, y: y + 3.5, size: 2, color: ACCENT });
          for (const line of lines) {
            room(15);
            text(line, M + 16, y, 10.5, regular);
            y -= 15;
          }
          y -= 4;
        }
        y -= 6;
        return;
      case "facts":
        for (const [k, v] of b.rows) {
          const lines = wrap(v, mono, 9, INNER - 150);
          room(14 * lines.length + 6);
          text(k, M, y, 9.5, bold, MUTED);
          lines.forEach((line, i) => text(line, M + 150, y - i * 13, 9, mono));
          y -= 13 * lines.length + 6;
        }
        y -= 8;
        return;
      case "table": {
        const widths = b.columns.map((c) => c.width * INNER);
        const pad = 6;
        const size = 9;
        const lead = 12;
        const header = () => {
          const lines = b.columns.map((c, i) => wrap(c.label, bold, 8, widths[i] - 2 * pad));
          const h = Math.max(...lines.map((l) => l.length)) * 10 + 2 * pad;
          room(h + 2 * lead + 2 * pad);
          page.drawRectangle({ x: M, y: y - h + 10, width: INNER, height: h, color: HEAD_FILL });
          let x = M;
          b.columns.forEach((c, i) => {
            lines[i].forEach((line, j) => {
              const w = bold.widthOfTextAtSize(line, 8);
              text(line, c.align === "right" ? x + widths[i] - pad - w : x + pad, y - pad - j * 10 + 2, 8, bold, MUTED);
            });
            x += widths[i];
          });
          y -= h;
        };
        header();
        for (const row of b.rows) {
          const lines = row.cells.map((cell, i) => wrap(cell ?? "", i === 0 && /^r[1-9A-HJ-NP-Za-km-z]/.test(cell ?? "") ? mono : regular, size, widths[i] - 2 * pad));
          const h = Math.max(1, ...lines.map((l) => l.length)) * lead + 2 * pad - 2;
          if (y - h < BOTTOM) {
            newPage();
            header();
          }
          let x = M;
          row.cells.forEach((_, i) => {
            const tone = row.tones?.[i];
            const font = tone && tone !== "muted" ? bold : i === 0 && /^r[1-9A-HJ-NP-Za-km-z]/.test(row.cells[0] ?? "") ? mono : regular;
            lines[i].forEach((line, j) => {
              const w = font.widthOfTextAtSize(line, size);
              const xx = b.columns[i].align === "right" ? x + widths[i] - pad - w : x + pad;
              text(line, xx, y - pad - j * lead, size, font, tone ? TONES[tone] : INK);
            });
            x += widths[i];
          });
          y -= h;
          page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.5, color: RULE });
        }
        y -= 12;
        return;
      }
    }
  };

  for (const b of model.blocks) draw(b);

  // ── Footer on every page ──
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: RULE });
    const label = clean(model.footer);
    const fit = wrap(label, regular, 7.5, INNER - 70)[0];
    p.drawText(fit, { x: M, y: 30, size: 7.5, font: regular, color: MUTED });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: W - M - regular.widthOfTextAtSize(n, 7.5), y: 30, size: 7.5, font: regular, color: MUTED });
  });

  return await doc.save();
}
