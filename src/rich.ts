/**
 * Text with € and £, which the bar's ASCII fonts lack: those two are drawn as small bitmaps sized to the font's
 * capitals, the rest stays plain text. Placed by the row the capitals start on, like frame.ts does.
 */

import { inkTop, textWidth } from "./fonts.ts";
import type { Element } from "./frame.ts";

/** Fonts with € and £ drawn. */
export type RichFont = "small" | "condensed" | "large";

/** Rows top to bottom, "#" lit; as tall as the font's capitals. */
const GLYPHS: Record<string, Record<RichFont, string[]>> = {
  "€": {
    small: ["..##", ".#..", "###.", ".#..", "..##"],
    condensed: ["..###", ".#...", "####.", ".#...", "####.", ".#...", "..###"],
    large: ["...###", "..#...", ".#....", "#####.", ".#....", "#####.", ".#....", "..#...", "...###"],
  },
  "£": {
    small: [".##.", ".#..", "###.", ".#..", "####"],
    condensed: ["..##.", ".#..#", ".#...", "####.", ".#...", ".#...", "#####"],
    large: ["..###.", ".#...#", ".#....", ".#....", "####..", ".#....", ".#....", ".#....", "######"],
  },
};

const glyphAdvance = (ch: string, font: RichFont) => GLYPHS[ch][font][0].length + 1;

/** Width in px, letter spacing included. */
export function richWidth(value: string, font: RichFont): number {
  let total = 0;
  for (const ch of value) total += ch in GLYPHS ? glyphAdvance(ch, font) : textWidth(ch, font);
  return total;
}

function xpm(rows: string[], rgb: string): string {
  return ["! XPM2", `${rows[0].length} ${rows.length} 2 1`, ". c none", `# c ${rgb}`, ...rows, ""].join("\n");
}

/**
 * `value` from `x`, capitals starting on `row`. Ids: `t:<id>` for the first run of text, `t:<id>_<n>` for later runs,
 * `x:<id>_<n>` for the drawn glyphs.
 */
export function rich(id: string, value: string, x: number, row: number, font: RichFont, color: string, extra: object = {}): Element[] {
  const out: Element[] = [];
  let run = "";
  let runX = x;
  let left = x;
  let n = 0;
  const flush = () => {
    if (run) {
      const runId = out.some((e) => e.type === "text") ? `t:${id}_${n}` : `t:${id}`;
      out.push({ id: runId, type: "text", text: run, x: runX, y: row - inkTop(font), font, color, align: "top_left", ...extra });
      n += 1;
    }
    run = "";
  };
  for (const ch of value) {
    if (ch in GLYPHS) {
      flush();
      out.push({ id: `x:${id}_${n}`, type: "xpmbitmap", data: xpm(GLYPHS[ch][font], color.slice(0, 7)), x: left, y: row, align: "top_left", ...extra });
      n += 1;
      left += glyphAdvance(ch, font);
      runX = left;
    } else {
      if (!run) runX = left;
      run += ch;
      left += textWidth(ch, font);
    }
  }
  flush();
  return out;
}

/** Centred on `x`. */
export const richCentred = (id: string, value: string, x: number, row: number, font: RichFont, color: string, extra: object = {}) =>
  rich(id, value, x - Math.floor(richWidth(value, font) / 2), row, font, color, extra);

/** Ending on `right`. */
export const richRight = (id: string, value: string, right: number, row: number, font: RichFont, color: string, extra: object = {}) =>
  rich(id, value, right - richWidth(value, font), row, font, color, extra);
