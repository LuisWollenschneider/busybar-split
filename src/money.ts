/** Amounts as text, in the currency style the settings pick. € and £ are drawn by rich.ts: the fonts are ASCII. */

export type Currency = "eur" | "eur_after" | "usd" | "gbp" | "chf" | "kr" | "none";

const STYLES: Record<Currency, { before: string; after: string; comma: boolean }> = {
  eur: { before: "€", after: "", comma: false },
  eur_after: { before: "", after: " €", comma: true },
  usd: { before: "$", after: "", comma: false },
  gbp: { before: "£", after: "", comma: false },
  chf: { before: "CHF ", after: "", comma: false },
  kr: { before: "", after: " KR", comma: true },
  none: { before: "", after: "", comma: false },
};

export const isCurrency = (v: unknown): v is Currency => typeof v === "string" && v in STYLES;

/** 1240 → "12.40" (or "12,40"); no grouping, the bar is narrow. */
export function number(cents: number, comma: boolean): string {
  const abs = Math.abs(Math.round(cents));
  const text = `${Math.floor(abs / 100)}${comma ? "," : "."}${String(abs % 100).padStart(2, "0")}`;
  return cents < 0 ? `-${text}` : text;
}

/** "€12.40", "12,40 €", "-$3.00". */
export function money(cents: number, currency: Currency): string {
  const style = STYLES[currency];
  return `${cents < 0 ? "-" : ""}${style.before}${number(Math.abs(cents), style.comma)}${style.after}`;
}

/** Cents per wheel click, by wheel speed: on the whole part 1, 5, 10, 100 units; on the cents 1, 5, 10. */
const WHOLE_UNITS = [100, 500, 1000, 10000];
const CENT_UNITS = [1, 5, 10];

/**
 * One wheel click by `unit`: off the unit's grid it first snaps to it, so a fast turn lands on round amounts.
 * Clamped to 0..max.
 */
export function stepAmount(amount: number, dir: 1 | -1, unit: number, max: number): number {
  const off = amount % unit;
  let next: number;
  if (off === 0) next = amount + dir * unit;
  else next = dir > 0 ? amount - off + unit : amount - off;
  return Math.max(0, Math.min(max, next));
}

const unitAt = (units: number[], speed: number) => units[Math.max(0, Math.min(speed, units.length - 1))];

/** The whole part up or down a click, the cents kept. */
export function stepWhole(amount: number, dir: 1 | -1, speed: number, max: number): number {
  const cents = amount % 100;
  const whole = stepAmount(amount - cents, dir, unitAt(WHOLE_UNITS, speed), max);
  return Math.min(max, whole + cents);
}

/** The cents up or down a click, 0 to 99, the whole part kept. */
export function stepCents(amount: number, dir: 1 | -1, speed: number, max: number): number {
  const cents = amount % 100;
  return Math.min(max, amount - cents + stepAmount(cents, dir, unitAt(CENT_UNITS, speed), 99));
}
