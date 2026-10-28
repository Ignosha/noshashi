/**
 * Draws a Ledger Evidence Report (the ReportModel built in
 * ./evidenceReport.ts) as a PDF in noshashi.app's own look: the dark
 * green ground (or, for print, the light theme on white), the lime brand rule, Space Grotesk for text, IBM Plex
 * Mono for labels and figures, and the flower mark. US Letter, numbered
 * sections, tables on raised panels, and a footer with the report
 * reference and page numbers on every page.
 *
 * The brand fonts and mark are passed in (the edge function loads them
 * from the site). Without them it falls back to Helvetica and Courier, so
 * a report is never held back by a missing asset.
 */

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import type { Block, ReportModel, Tone } from "./evidenceReport.ts";

export type PdfAssets = { sans?: Uint8Array; sansBold?: Uint8Array; mono?: Uint8Array; monoBold?: Uint8Array; mark?: Uint8Array };

const W = 612;
const H = 792;
const M = 54;
const INNER = W - 2 * M;
const BOTTOM = 70;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
/* The site's tokens (site/assets/core.css). "light" is the site's light
   theme on a white ground, for printing. */
const PALETTES = {
  dark: { ground: "#08100B", surface: "#0E1911", elevated: "#15251A", ink: "#E9F5E7", muted: "#A7B8A8", faint: "#718473", rule: "#263B2A", brand: "#9BE15D", hold: "#E7C766", nogo: "#FF7B7B" },
  light: { ground: "#FFFFFF", surface: "#F2F8F0", elevated: "#E5F0E2", ink: "#0B160D", muted: "#3F5843", faint: "#55705A", rule: "#C4D7C5", brand: "#247A3B", hold: "#8B6500", nogo: "#B42332" },
};
export type PdfTheme = keyof typeof PALETTES;

type Fonts = { sans: PDFFont; bold: PDFFont; mono: PDFFont; monoBold: PDFFont; custom: boolean };

/** The standard fonts' encoding (WinAnsi) lacks some glyphs; say them another way. */
function clean(text: string, custom: boolean): string {
  const t = text.replace(/→/g, "->").replace(/≤/g, "<=").replace(/≥/g, ">=");
  return custom
    ? t
    : t.replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…€™]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
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

async function loadFonts(doc: PDFDocument, a: PdfAssets): Promise<Fonts> {
  if (a.sans && a.sansBold && a.mono) {
    try {
      doc.registerFontkit(fontkit);
      const sans = await doc.embedFont(a.sans, { subset: true });
      const bold = await doc.embedFont(a.sansBold, { subset: true });
      const mono = await doc.embedFont(a.mono, { subset: true });
      const monoBold = a.monoBold ? await doc.embedFont(a.monoBold, { subset: true }) : mono;
      return { sans, bold, mono, monoBold, custom: true };
    } catch {
      // Fall through to the standard fonts.
    }
  }
  const mono = await doc.embedFont(StandardFonts.Courier);
  return {
    sans: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono,
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
    custom: false,
  };
}

export async function renderPdf(model: ReportModel, assets: PdfAssets = {}, theme: PdfTheme = "dark"): Promise<Uint8Array> {
  const p = PALETTES[theme];
  const [GROUND, SURFACE, ELEVATED, INK, MUTED, FAINT, RULE, BRAND] = [p.ground, p.surface, p.elevated, p.ink, p.muted, p.faint, p.rule, p.brand].map(hex);
  const TONES: Record<Exclude<Tone, null>, ReturnType<typeof rgb>> = { good: BRAND, warn: hex(p.hold), bad: hex(p.nogo), muted: FAINT };
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.title} ${model.meta[0]?.[1] ?? ""}`.trim());
  doc.setAuthor("NOSHASHI");
  doc.setSubject(model.subtitle);
  doc.setCreator("NOSHASHI (noshashi.app)");
  const f = await loadFonts(doc, assets);
  let mark: PDFImage | null = null;
  if (assets.mark) mark = await doc.embedPng(assets.mark).catch(() => null);
  const c = (s: string) => clean(s, f.custom);

  let page!: PDFPage;
  let y = H;

  const text = (s: string, x: number, yy: number, size: number, font: PDFFont, color = INK) => page.drawText(c(s), { x, y: yy, size, font, color });
  /** Uppercase, letter-spaced mono label: the site's .eyebrow. */
  const eyebrow = (s: string, x: number, yy: number, size = 7.5, color = FAINT, tracking = 1.6) => {
    let xx = x;
    for (const ch of c(s.toUpperCase())) {
      page.drawText(ch, { x: xx, y: yy, size, font: f.mono, color });
      xx += f.mono.widthOfTextAtSize(ch, size) + tracking;
    }
  };
  const wordmark = (x: number, yy: number, size: number) => {
    let xx = x;
    for (const ch of "NOSHASHI") {
      page.drawText(ch, { x: xx, y: yy, size, font: f.bold, color: INK });
      xx += f.bold.widthOfTextAtSize(ch, size) + size * 0.2;
    }
  };

  const addPage = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: GROUND });
  };
  const newPage = () => {
    addPage();
    // Running header: the mark and wordmark, small, with a rule under it.
    if (mark) page.drawImage(mark, { x: M, y: H - 46, width: 16, height: 16 });
    wordmark(M + (mark ? 22 : 0), H - 42, 8.5);
    eyebrow(model.title, W - M - 150, H - 41, 7, FAINT, 1.2);
    page.drawLine({ start: { x: M, y: H - 56 }, end: { x: W - M, y: H - 56 }, thickness: 0.6, color: RULE });
    y = H - 84;
  };
  const room = (need: number) => {
    if (y - need < BOTTOM) newPage();
  };

  // ── Cover block ──
  addPage();
  if (mark) page.drawImage(mark, { x: M, y: H - 82, width: 30, height: 30 });
  wordmark(M + (mark ? 40 : 0), H - 72, 12);
  eyebrow("Read-only XRP Ledger intelligence", W - M - 236, H - 71, 7, FAINT, 1.4);
  y = H - 150;
  page.drawRectangle({ x: M, y, width: 40, height: 2, color: BRAND });
  y -= 40;
  text(model.title, M, y, 32, f.bold);
  y -= 26;
  for (const line of wrap(c(model.subtitle), f.sans, 13, INNER).slice(0, 2)) {
    text(line, M, y, 13, f.sans, MUTED);
    y -= 17;
  }
  y -= 22;

  // Meta panel: four facts on a raised surface, like the site's panels.
  const metaH = 58;
  page.drawRectangle({ x: M, y: y - metaH, width: INNER, height: metaH, color: SURFACE, borderColor: RULE, borderWidth: 0.6 });
  const colW = INNER / Math.max(1, model.meta.length);
  model.meta.forEach(([k, v], i) => {
    const x = M + 14 + i * colW;
    eyebrow(k, x, y - 20, 6.8, FAINT, 1.3);
    // One line per fact: a long value (the report reference) is set smaller rather than broken.
    let size = 10;
    while (size > 6.5 && f.sans.widthOfTextAtSize(c(v), size) > colW - 22) size -= 0.25;
    text(v, x, y - 36, size, f.sans, INK);
    if (i) page.drawLine({ start: { x: M + i * colW, y: y - 10 }, end: { x: M + i * colW, y: y - metaH + 10 }, thickness: 0.5, color: RULE });
  });
  y -= metaH + 30;

  const para = (s: string, small = false) => {
    const size = small ? 8.5 : 10.5;
    const lead = small ? 12 : 15.5;
    for (const line of wrap(c(s), f.sans, size, INNER)) {
      room(lead);
      text(line, M, y, size, f.sans, small ? FAINT : MUTED);
      y -= lead;
    }
    y -= small ? 6 : 8;
  };

  const draw = (b: Block) => {
    switch (b.type) {
      case "heading": {
        room(52);
        y -= 10;
        page.drawRectangle({ x: M, y: y + 18, width: 24, height: 2, color: BRAND });
        const [num, ...rest] = b.text.split(". ");
        if (rest.length) {
          eyebrow(num.padStart(2, "0"), M, y + 1, 8, BRAND, 1.2);
          text(rest.join(". "), M + 24, y, 16, f.bold);
        } else {
          text(b.text, M, y, 16, f.bold);
        }
        y -= 24;
        return;
      }
      case "subheading":
        room(30);
        text(b.text, M, y, 11, f.bold);
        y -= 17;
        return;
      case "para":
        return para(b.text, b.small);
      case "bullets":
        for (const item of b.items) {
          const lines = wrap(c(item), f.sans, 10.5, INNER - 18);
          room(15.5 * Math.min(lines.length, 3));
          page.drawRectangle({ x: M + 1, y: y + 2.5, width: 5, height: 5, color: BRAND });
          for (const line of lines) {
            room(15.5);
            text(line, M + 18, y, 10.5, f.sans, INK);
            y -= 15.5;
          }
          y -= 5;
        }
        y -= 6;
        return;
      case "facts":
        for (const [k, v] of b.rows) {
          const lines = wrap(c(v), f.mono, 9, INNER - 170);
          const h = 13 * lines.length + 16;
          room(h + 6);
          page.drawRectangle({ x: M, y: y - h + 12, width: INNER, height: h, color: SURFACE, borderColor: RULE, borderWidth: 0.6 });
          eyebrow(k, M + 12, y - 2, 6.8, FAINT, 1.2);
          lines.forEach((line, i) => text(line, M + 158, y - 2 - i * 13, 9, f.mono, BRAND));
          y -= h + 4;
        }
        y -= 8;
        return;
      case "table": {
        const widths = b.columns.map((col) => col.width * INNER);
        const pad = 8;
        const size = 9;
        const lead = 12.5;
        const isAddress = (s: string) => /^r[1-9A-HJ-NP-Za-km-z]{4,}/.test(s);
        const header = () => {
          const lines = b.columns.map((col, i) => wrap(c(col.label.toUpperCase()), f.mono, 6.8, widths[i] - 2 * pad));
          const h = Math.max(...lines.map((l) => l.length)) * 9 + 2 * pad;
          room(h + 2 * lead + 2 * pad);
          page.drawRectangle({ x: M, y: y - h + 10, width: INNER, height: h, color: ELEVATED });
          let x = M;
          b.columns.forEach((col, i) => {
            lines[i].forEach((line, j) => {
              const w = f.mono.widthOfTextAtSize(line, 6.8);
              text(line, col.align === "right" ? x + widths[i] - pad - w : x + pad, y - pad - j * 9 + 3, 6.8, f.mono, MUTED);
            });
            x += widths[i];
          });
          y -= h;
        };
        header();
        b.rows.forEach((row, r) => {
          const fontOf = (i: number) => {
            const tone = row.tones?.[i];
            if (tone && tone !== "muted") return f.bold;
            if (isAddress(row.cells[i] ?? "") || b.columns[i].align === "right") return f.mono;
            return f.sans;
          };
          const lines = row.cells.map((cell, i) => wrap(c(cell ?? ""), fontOf(i), size, widths[i] - 2 * pad));
          const h = Math.max(1, ...lines.map((l) => l.length)) * lead + 2 * pad - 3;
          if (y - h < BOTTOM) {
            newPage();
            header();
          }
          page.drawRectangle({ x: M, y: y - h + 10, width: INNER, height: h, color: r % 2 ? GROUND : SURFACE });
          let x = M;
          row.cells.forEach((_, i) => {
            const tone = row.tones?.[i];
            const font = fontOf(i);
            lines[i].forEach((line, j) => {
              const w = font.widthOfTextAtSize(line, size);
              const xx = b.columns[i].align === "right" ? x + widths[i] - pad - w : x + pad;
              text(line, xx, y - pad - j * lead + 1, size, font, tone ? TONES[tone] : INK);
            });
            x += widths[i];
          });
          y -= h;
        });
        page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.6, color: RULE });
        y -= 14;
        return;
      }
    }
  };

  for (const b of model.blocks) draw(b);

  // ── Footer on every page ──
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    page = pg;
    pg.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.6, color: RULE });
    const label = wrap(c(model.footer), f.sans, 7.5, INNER - 80)[0];
    pg.drawText(label, { x: M, y: 30, size: 7.5, font: f.sans, color: FAINT });
    const n = `${String(i + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    pg.drawText(n, { x: W - M - f.mono.widthOfTextAtSize(n, 7.5), y: 30, size: 7.5, font: f.mono, color: FAINT });
  });

  return await doc.save();
}
