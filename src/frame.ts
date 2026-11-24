/** Display element primitives; no device calls here. */

import { inkTop, textWidth, type Font } from "./fonts.ts";

/** One element as /api/display/draw takes it. */
export type Element = Record<string, unknown> & { id: string };

export const FRONT_W = 72;
export const FRONT_H = 16;
/** The back display's width left of the firmware's status bar. */
export const BACK_W = 148;

/**
 * Ids carry their element's type as a prefix ("t:", "r:", "i:", "a:", "x:"): the bar refuses to draw an id again as
 * another type, and screens reuse short names.
 */

/** Placed by its font box: `y = row - inkTop(font)` puts the capitals on `row`. */
export function text(id: string, value: string, x: number, row: number, font: Font, color: string, extra: object = {}): Element {
  return { id: `t:${id}`, type: "text", text: value, x, y: row - inkTop(font), font, color, align: "top_left", ...extra };
}

export const centred = (id: string, value: string, x: number, row: number, font: Font, color: string, extra: object = {}) =>
  text(id, value, x - Math.floor(textWidth(value, font) / 2), row, font, color, extra);

export const rightAligned = (id: string, value: string, right: number, row: number, font: Font, color: string, extra: object = {}) =>
  text(id, value, right - textWidth(value, font), row, font, color, extra);

/** border_width 0: the default 1 paints a white outline. */
export function rect(id: string, x: number, y: number, w: number, h: number, color: string, extra: object = {}): Element {
  return { id: `r:${id}`, type: "rectangle", x, y, width: Math.max(1, w), height: Math.max(1, h), fill: "solid", fill_colors: [color], border_width: 0, ...extra };
}

/** `value` cut to `width` px, ending in "..". */
export function fit(value: string, width: number, font: Font): string {
  if (textWidth(value, font) <= width) return value;
  let cut = value;
  while (cut.length > 0 && textWidth(`${cut}..`, font) > width) cut = cut.slice(0, -1);
  return `${cut}..`;
}

/** Centred, or handed to the firmware's scroller when too wide. */
export function line(id: string, value: string, x: number, row: number, width: number, font: Font, color: string, extra: object = {}): Element {
  if (textWidth(value, font) <= width) return centred(id, value, x + Math.floor(width / 2), row, font, color, extra);
  return text(id, value, x, row, font, color, { width, scroll_rate: 900, scroll_start_delay: 1500, scroll_repeat_delay: 2200, ...extra });
}

/** A PNG of src/images. */
export const image = (id: string, name: string, x: number, y: number, extra: object = {}): Element =>
  ({ id: `i:${id}`, type: "image", path: `images/${name}.png`, x, y, align: "top_left", ...extra });

/** An .anim of src/animations. */
export const anim = (id: string, name: string, x: number, y: number, loop: boolean, extra: object = {}): Element =>
  ({ id: `a:${id}`, type: "animation", path: `animations/${name}.anim`, x, y, align: "top_left", loop, ...extra });

export const xpm = (id: string, data: string, x: number, y: number, extra: object = {}): Element =>
  ({ id: `x:${id}`, type: "xpmbitmap", data, x, y, align: "top_left", ...extra });
