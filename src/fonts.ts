/**
 * Bitmap font metrics, for fitting and centring text. A compact copy of busy-lib's font maps (which cost ~9 KiB of
 * heap per font); tests/fonts.test.ts checks them against busy-lib.
 */

export type Font = "tiny" | "small" | "condensed" | "large" | "extra_large";

/** Advance widths for printable ASCII (32..126), encoded as chr(32 + advance). */
const ADVANCES: Record<Font, string> = {
  tiny: "#\"$&$%%\"##$$\"$\"%$$$$$$$$$$\"\"$$$$$$$$$$$$$$$%$&%%$%$$$%&&$&%#%#$$#$$$$$##$\"\"$\"&$$$$#$$$$&$$$$\"$%",
  small: "\"\"$&$%%\"##$$\"#\"#$#$$$$$$$$\"#$$$$%%%%%%%%%\"$%$&%%%%%%$%$&$$$###$$$$$$$$#$$\"#$\"&$$$$#$#$$&$$$$\"$%",
  condensed: "%#$&&('\"##$&#$$%%%%%%%%%%%\"#$&$&(&&&&&&&&$%&%(&&&&&&&&&(&&&#%#&%%%%%%%%%%$$%$&%%%%$%%%&&&%%$#$&",
  large: "&#$)(*)\"$$&&#$$&'%''''''''\"#%&%&*(''(''(($'''*(('(''(((*(('#&#&&&&&&&&%&&$$&$(&&&&%&%&&*&&&$\"$(",
  extra_large: "$#&*)+*#%%''#$#&(%((((((((##%'%',((((''((%'(')(((((('())(('$&$(%%((((''((%'(')(((((('())(('&#&(",
};

/** busy-lib's `capBox`: text is anchored by its font box, so `y = row - inkTop(font)` puts ink on `row`. */
const CAP_BOX: Record<Font, { top: number; height: number }> = {
  tiny: { top: 1, height: 4 },
  small: { top: 2, height: 5 },
  condensed: { top: 2, height: 7 },
  large: { top: 2, height: 9 },
  extra_large: { top: 2, height: 10 },
};

export const inkTop = (font: Font): number => CAP_BOX[font].top;

/** Lit height of capitals and digits; descenders go a row or two lower. */
export const inkHeight = (font: Font): number => CAP_BOX[font].height;

/** Width in px, spacing included; non-ASCII counts as 4. */
export function textWidth(text: string, font: Font): number {
  const table = ADVANCES[font];
  let total = 0;
  for (let i = 0; i < text.length; i += 1) {
    const index = text.charCodeAt(i) - 32;
    total += index >= 0 && index < table.length ? table.charCodeAt(index) - 32 : 4;
  }
  return total;
}
