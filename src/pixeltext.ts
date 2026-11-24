/**
 * Text in the bar's extra_large glyphs, outlined like the lettering of the BUSY Bar's status themes: one XPM bitmap per
 * character. Copied from Rally, with € and £ added.
 *
 * The bar's JavaScript is slow per operation: rendering a whole string pixel by pixel took over 100 ms, enough for a
 * fast wheel spin to starve the display. Each character is rendered once and reused.
 */

import { textWidth } from "./fonts.ts";
import { GLYPHS } from "./glyphs.ts";

/** Glyph rows used: capitals and digits fill rows 2-11 of the 16. */
const FIRST_ROW = 2;
const CAP_ROWS = 10;

/** One character's bitmap, `dx` pixels right of the text's left edge. */
type Piece = { dx: number; data: string };
type PixelText = { width: number; pieces: Piece[] };

/** One character: its advance, its ink's width, and the lit pixels as (row, column) pairs. */
type Glyph = { advance: number; inkWidth: number; lit: number[] };
const glyphs = new Map<string, Glyph>();

/** € and £, which the font lacks, drawn to match its bold capitals: 10 rows, "#" lit. */
const EXTRA: Record<string, string[]> = {
  "€": ["..#####", ".######", "##.....", "######.", "##.....", "######.", "##.....", "##.....", ".######", "..#####"],
  "£": ["..####.", ".##..##", ".##....", ".##....", "#####..", ".##....", ".##....", ".##....", "#######", "#######"],
};

function extraGlyph(rows: string[]): Glyph {
  const lit: number[] = [];
  rows.forEach((row, r) => {
    for (let x = 0; x < row.length; x += 1) if (row[x] === "#") lit.push(r, x);
  });
  return { advance: rows[0].length + 1, inkWidth: rows[0].length, lit };
}

function glyph(ch: string): Glyph {
  const cached = glyphs.get(ch);
  if (cached) return cached;
  if (ch in EXTRA) {
    const g = extraGlyph(EXTRA[ch]);
    glyphs.set(ch, g);
    return g;
  }
  const hex = GLYPHS[ch] ?? GLYPHS[" "];
  const advance = textWidth(ch, "extra_large");
  const lit: number[] = [];
  let inkWidth = 0;
  for (let r = 0; r < CAP_ROWS; r += 1) {
    const mask = parseInt(hex.slice((FIRST_ROW + r) * 4, (FIRST_ROW + r) * 4 + 4), 16);
    for (let x = 0; x < advance; x += 1) {
      if (!((mask >> x) & 1)) continue;
      lit.push(r, x);
      inkWidth = Math.max(inkWidth, x + 1);
    }
  }
  const g = { advance, inkWidth, lit };
  glyphs.set(ch, g);
  return g;
}

/** Rendered characters by character and colours. */
const rendered = new Map<string, string>();
const MAX_RENDERED = 16;

/** One character as XPM2 source: its ink plus the outline round it (none: `outline` null), transparent around. */
function render(g: Glyph, fill: string, outline: string | null): string {
  const pad = outline ? 1 : 0;
  const w = g.inkWidth + 2 * pad;
  const h = CAP_ROWS + 2 * pad;
  // 0 transparent, 1 outline, 2 letter.
  const px: number[] = new Array(w * h).fill(0);
  for (let i = 0; i < g.lit.length; i += 2) px[(g.lit[i] + pad) * w + g.lit[i + 1] + pad] = 2;
  if (outline) {
    // The 8 neighbours of every letter pixel: as thick at the corners as on the sides. The pad keeps them inside.
    const around = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
    for (let i = 0; i < g.lit.length; i += 2) {
      const at = (g.lit[i] + pad) * w + g.lit[i + 1] + pad;
      for (const d of around) if (px[at + d] === 0) px[at + d] = 1;
    }
  }
  const codes = [".", "o", "#"];
  const lines = ["! XPM2", `${w} ${h} ${outline ? 3 : 2} 1`, ". c none", `# c ${fill}`];
  if (outline) lines.push(`o c ${outline}`);
  for (let y = 0; y < h; y += 1) {
    let row = "";
    for (let x = 0; x < w; x += 1) row += codes[px[y * w + x]];
    lines.push(row);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * `text` in `fill` ("#RRGGBB") with an `outline` round it (null: none): a bitmap per inked character, and the width of
 * the whole. The letters' spacing keeps one outline off the next letter's ink.
 */
export function pixelText(text: string, fill: string, outline: string | null): PixelText {
  const pad = outline ? 1 : 0;
  const pieces: Piece[] = [];
  let x0 = 0;
  let inkWidth = 0;
  for (const ch of text) {
    const g = glyph(ch);
    if (g.inkWidth > 0) {
      const key = `${ch}|${fill}|${outline}`;
      let data = rendered.get(key);
      if (data === undefined) {
        if (rendered.size >= MAX_RENDERED) rendered.clear();
        data = render(g, fill, outline);
        rendered.set(key, data);
      }
      pieces.push({ dx: x0, data });
      inkWidth = x0 + g.inkWidth;
    }
    x0 += g.advance;
  }
  return { width: inkWidth + 2 * pad, pieces };
}
