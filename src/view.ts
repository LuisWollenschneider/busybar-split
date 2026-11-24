/**
 * Every screen as elements, listed bottom to top: screen.ts gives each its place in the list as z_index.
 * Front: a 16 px icon or avatar on the left, badges with outlined digits for confirmations. Back: the tab and the keys.
 */

import { textWidth, type Font } from "./fonts.ts";
import { BACK_W, FRONT_H, FRONT_W, anim, centred, fit, image, line, rect, text, xpm, type Element } from "./frame.ts";
import { shares, type Entry } from "./ledger.ts";
import { money, number, type Currency } from "./money.ts";
import { pixelText } from "./pixeltext.ts";
import { rich, richCentred, richRight, richWidth, type RichFont } from "./rich.ts";
import {
  forLabel, historyAt, homePages, menuItems, pageAt, type Ctx, type Draft, type MenuItem, type Page, type Ui,
} from "./ui.ts";

const WHITE = "#FFFFFFFF";
const DIM = "#7A7A7AFF";
const FAINT = "#2A2A2AFF";
/** Text on a chip that is off: faint, a step above FAINT. */
const OFF_TEXT = "#4A4A4AFF";
const AMBER = "#FFB020FF";
const GREEN = "#4CD964FF";
const RED = "#FF5A4AFF";
const ARROW = "#5A5A5AFF";
const BLACK = "#000000FF";

/** One colour per person, by their place in the settings; tools/art.py draws the avatars in the same order. */
const PERSON = [
  "#FF7A5CFF", "#4FC3F7FF", "#FFD54FFF", "#81E07FFF", "#C38BFFFF", "#FF8FC8FF", "#4DD8C4FF", "#FFA94DFF",
  "#FF4D6DFF", "#6E8BFFFF", "#C8EB5AFF", "#E46BFFFF", "#D4A373FF", "#FFE7A8FF", "#A0E8FFFF", "#7FD9A0FF",
];
/** The board's fill behind a balance. */
const GETS_FILL = "#1C4A28FF";
const OWES_FILL = "#5A1E1AFF";

/** Right of a 16 px icon: x 18 to the edge. */
const SIDE_X = 18;
const SIDE_W = FRONT_W - SIDE_X;
/** A `large` value's capitals on rows 6-14 under a `tiny` header on rows 1-4. */
const VALUE_ROW = 6;

const BACK = { display: "back" };
const BACK_TEXT = "#FFFFFFFF";
const BACK_DIM = "#FFFFFF80";
/** Lines the back display has room for above its key hint. */
const BACK_ROWS = 4;

export type View = { ctx: Ctx; currency: Currency };

const colorOf = (people: string[], name: string) => {
  const i = people.indexOf(name);
  return i < 0 ? DIM : PERSON[i % PERSON.length];
};
/** `color` (#RRGGBBAA) at `f` of its brightness. */
const darker = (color: string, f: number) =>
  `#${[1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("")}FF`;
const commaOf = (c: Currency) => c === "eur_after" || c === "kr";

/** A round 14x14 avatar in the person's colour with their initials, top left at `x`, `y`. */
function avatar(id: string, people: string[], name: string, x: number, y: number): Element[] {
  const i = people.indexOf(name);
  const initials = textWidth(name.slice(0, 2), "small") <= 11 ? name.slice(0, 2) : name.slice(0, 1);
  return [
    image(id, i < 0 ? "avatar_x" : `avatar_${i % PERSON.length}`, x, y),
    centred(`${id}n`, initials, x + 7, y + 5, "small", BLACK),
  ];
}

/** Tiny label left, tiny note right, from `x` on rows 1-4. */
function tinyHeader(label: string, labelColor: string, note: string, x = SIDE_X): Element[] {
  const noteW = textWidth(note, "tiny");
  return [
    text("hl", fit(label, FRONT_W - x - noteW - 3, "tiny"), x, 1, "tiny", labelColor),
    text("hr", note, FRONT_W - noteW, 1, "tiny", DIM),
  ];
}

/** Money as large as fits `width`, centred on `cx`, capitals on `row` (large) or one lower. */
function amount(id: string, value: string, cx: number, row: number, width: number, color: string): Element[] {
  const font: RichFont = richWidth(value, "large") <= width ? "large" : "condensed";
  return richCentred(id, value, cx, font === "large" ? row : row + 1, font, color);
}

/** An amount being set: the part the wheel turns (whole units or cents) in `color` and underlined, the rest dim. */
function amountChoice(value: string, onCents: boolean, color: string): Element[] {
  const room = SIDE_W - 10;
  const cx = SIDE_X + Math.floor(SIDE_W / 2);
  const font: RichFont = richWidth(value, "large") <= room ? "large" : "condensed";
  const row = font === "large" ? VALUE_ROW : VALUE_ROW + 1;
  // The cents start at the decimal mark: "€12" | ".40", "12" | ",40 KR".
  const cut = Math.max(value.lastIndexOf("."), value.lastIndexOf(","));
  const whole = value.slice(0, cut);
  const cents = value.slice(cut);
  const left = cx - Math.floor(richWidth(value, font) / 2);
  const split = left + richWidth(whole, font);
  const [ux, uw] = onCents ? [split + richWidth(cents.slice(0, 1), font), richWidth(cents.slice(1, 3), font) - 1]
    : [left + richWidth(whole.replace(/[0-9]+$/, ""), font), richWidth(whole.match(/[0-9]+$/)?.[0] ?? whole, font) - 1];
  return [
    ...rich("v", whole, left, row, font, onCents ? DIM : color),
    ...rich("w", cents, split, row, font, onCents ? color : DIM),
    rect("u", ux, 15, uw, 1, color),
    text("al", "<", SIDE_X, 8, "small", ARROW),
    text("ar", ">", FRONT_W - 3, 8, "small", ARROW),
  ];
}

/** A name or label right of the icon, between "<" and ">". */
function choice(value: string, color: string): Element[] {
  const room = SIDE_W - 10;
  const arrows = [text("al", "<", SIDE_X, 8, "small", ARROW), text("ar", ">", FRONT_W - 3, 8, "small", ARROW)];
  const font: Font = textWidth(value, "large") <= room ? "large" : textWidth(value, "condensed") <= room ? "condensed" : "small";
  const row = font === "large" ? VALUE_ROW : font === "condensed" ? VALUE_ROW + 1 : VALUE_ROW + 3;
  return [line("v", value, SIDE_X + 5, row, room, font, color), ...arrows];
}

/** "NOW", "5M", "3H", "2D", "6W". */
export function ago(at: number, now: number): string {
  const s = Math.max(0, now - at);
  if (s < 60) return "NOW";
  if (s < 3600) return `${Math.floor(s / 60)}M`;
  if (s < 86400) return `${Math.floor(s / 3600)}H`;
  if (s < 14 * 86400) return `${Math.floor(s / 86400)}D`;
  return `${Math.floor(s / (7 * 86400))}W`;
}

function entryLine(entry: Entry, people: string[]): string {
  return entry.kind === "payment" ? `${entry.by} > ${entry.to}` : `${entry.by} FOR ${forLabel(entry.for, people)}`;
}

/** As short as fits `width` in `small`: 4.45, then whole units (49), then thousands (2K), then nothing. */
export function compact(cents: number, width: number, comma: boolean): string {
  const abs = Math.abs(cents);
  const options = abs < 1000 ? [number(abs, comma)] : [];
  options.push(String(Math.round(abs / 100)));
  if (abs >= 100000) options.push(`${Math.round(abs / 100000)}K`);
  return options.find((o) => textWidth(o, "small") <= width) ?? "";
}

// Front display ----------------------------------------------------------------------------------------------------

/**
 * Up to BOARD_MAX people: a card per person, their colour and initials on top, below how much they get back (green)
 * or owe (red), the card filling up with it, the largest balance on any page full. More pages: a dot each on row 15.
 */
function board(page: Extract<Page, { kind: "board" }>, v: View): Element[] {
  const { people } = v.ctx;
  const { balances, most } = page;
  const n = balances.length;
  const gap = 1;
  const w = Math.min(24, Math.floor((FRONT_W - gap * (n - 1)) / n));
  const left = Math.floor((FRONT_W - (w * n + gap * (n - 1))) / 2);
  const bottom = page.of > 1 ? FRONT_H - 1 : FRONT_H;
  const out: Element[] = [];
  balances.forEach((b, i) => {
    const x = left + i * (w + gap);
    const cx = x + Math.ceil(w / 2);
    const two = b.name.slice(0, 2);
    const initials = w >= 20 ? b.name.slice(0, 4) : textWidth(two, "small") <= w + 1 ? two : b.name.slice(0, 1);
    out.push(rect(`bh${i}`, x, 0, w, 7, colorOf(people, b.name)));
    out.push(centred(`bn${i}`, fit(initials, w, "small"), cx, 1, "small", BLACK));
    out.push(rect(`bb${i}`, x, 7, w, bottom - 7, "#141414FF"));
    if (b.cents !== 0) {
      const h = Math.max(1, Math.round((Math.abs(b.cents) / most) * (bottom - 7)));
      out.push(rect(`bf${i}`, x, bottom - h, w, h, b.cents > 0 ? GETS_FILL : OWES_FILL));
    }
    // w + 1: the last letter's spacing may hang over the edge.
    const label = b.cents === 0 ? "0" : compact(b.cents, w + 1, commaOf(v.currency));
    const color = b.cents > 0 ? GREEN : b.cents < 0 ? RED : DIM;
    if (label) out.push(centred(`ba${i}`, label, cx, 9, "small", color));
  });
  for (let i = 0; i < page.of && page.of > 1; i += 1) {
    out.push(rect(`pd${i}`, FRONT_W / 2 - page.of + i * 2, 15, 1, 1, i === page.index ? WHITE : ARROW));
  }
  return out;
}

/** One payment that settles the tab: who pays on the left, who gets it on the right, the money flowing between. */
function transfer(page: Extract<Page, { kind: "transfer" }>, v: View): Element[] {
  const { from, to, amount: cents } = page.transfer;
  const { people } = v.ctx;
  const dots = page.of > 1 ? page.of : 0;
  return [
    ...avatar("af", people, from, 0, 1),
    ...avatar("at", people, to, FRONT_W - 14, 1),
    ...amount("v", money(cents, v.currency), FRONT_W / 2, 1, 42, WHITE),
    anim("flow", "flow", 20, 10, true),
    // Which of the payments this is: a dot each under the flow.
    ...Array.from({ length: dots }, (_, i) =>
      rect(`pd${i}`, FRONT_W / 2 - dots + i * 2, 15, 1, 1, i === page.index ? WHITE : ARROW)),
  ];
}

function homeFront(page: Page, v: View): Element[] {
  switch (page.kind) {
    case "settled": {
      const label = "SETTLED";
      const left = Math.floor((FRONT_W - (16 + 4 + textWidth(label, "large"))) / 2);
      return [anim("settled", "settled", left, 0, true), text("v", label, left + 20, 4, "large", WHITE)];
    }
    case "board":
      return board(page, v);
    case "transfer":
      return transfer(page, v);
  }
}

const MENU_LABEL: Record<MenuItem, string> = {
  settle: "SETTLE", history: "HISTORY", payment: "PAYMENT", undo: "UNDO", clear: "CLEAR",
};
const MENU_ICON: Record<MenuItem, string> = {
  settle: "icon_settle", history: "icon_history", payment: "icon_payment", undo: "icon_undo", clear: "icon_trash",
};

function menuNote(item: MenuItem, ui: { page: number }, v: View): string {
  const { ledger, people } = v.ctx;
  switch (item) {
    case "settle": {
      const page = pageAt(homePages(ledger, people), ui.page);
      return page.kind === "transfer" ? `${page.transfer.from} PAYS ${page.transfer.to}` : "";
    }
    case "history": return ledger.entries.length === 1 ? "1 ENTRY" : `${ledger.entries.length} ENTRIES`;
    case "payment": return "PAID SOMEONE BACK";
    case "undo": {
      const last = ledger.entries[ledger.entries.length - 1];
      return last ? entryLine(last, people) : "";
    }
    case "clear": return "WIPE THE TAB";
  }
}

/** FOR chips shown at a time; more scroll with the wheel. */
const FOR_SLOTS = 5;

/**
 * Who shares an expense: an ALL chip, then a chip per person, filled when they are in, FOR_SLOTS at a time scrolled
 * so the wheel's one is in view, and underlined. Chip ids go by slot, so scrolling redraws them in place.
 */
function forField(draft: Draft, v: View): Element[] {
  const { people } = v.ctx;
  const total = people.length + 1;
  const k = Math.min(total, FOR_SLOTS);
  const gap = 2;
  const w = Math.min(16, Math.floor((FRONT_W - gap * (k - 1)) / k));
  const left = Math.floor((FRONT_W - (w * k + gap * (k - 1))) / 2);
  const first = Math.max(0, Math.min(draft.cursor - Math.floor(k / 2), total - k));
  const count = draft.shared.filter(Boolean).length;
  const all = count === people.length;
  const each = count ? shares(draft.amount, count)[0] : 0;
  // How many share and each one's share, in `small` (capitals on rows 0-4, ending with the tiny label's on row 4).
  const share = count === 0 ? "NOBODY" : `${count}X${money(each, v.currency)}`;
  const shareW = richWidth(share, "small");
  const name = draft.cursor === 0 ? "ALL" : people[draft.cursor - 1];
  const on = draft.cursor === 0 ? all : draft.shared[draft.cursor - 1];
  const labelColor = !on ? DIM : draft.cursor === 0 ? WHITE : colorOf(people, name);
  const out: Element[] = [
    text("hl", fit(`FOR ${name}`, FRONT_W - shareW - 3, "tiny"), 0, 1, "tiny", labelColor),
    ...rich("hr", share, FRONT_W - shareW, 0, "small", count === 0 ? RED : WHITE),
  ];
  for (let slot = 0; slot < k; slot += 1) {
    const item = first + slot;
    const x = left + slot * (w + gap);
    const cx = x + Math.ceil(w / 2);
    if (item === 0) {
      const font = textWidth("ALL", "small") <= w + 1 ? "small" : "tiny";
      out.push(rect(`cb${slot}`, x, 6, w, 9, all ? WHITE : FAINT));
      out.push(centred(`ct${slot}`, "ALL", cx, font === "small" ? 8 : 9, font, all ? BLACK : count > 0 ? WHITE : OFF_TEXT));
      continue;
    }
    const i = item - 1;
    const two = people[i].slice(0, 2);
    const initials = textWidth(two, "small") <= w + 1 ? two : people[i].slice(0, 1);
    out.push(rect(`cb${slot}`, x, 6, w, 9, draft.shared[i] ? colorOf(people, people[i]) : FAINT));
    out.push(centred(`ct${slot}`, initials, cx, 8, "small", draft.shared[i] ? BLACK : darker(colorOf(people, people[i]), 0.45)));
  }
  out.push(rect("cc", left + (draft.cursor - first) * (w + gap), 15, w, 1, WHITE));
  return out;
}

function wizardFront(draft: Draft, v: View): Element[] {
  const { people } = v.ctx;
  const field = draft.fields[draft.field];
  const corner = `${draft.field + 1}/${draft.fields.length}`;
  switch (field) {
    case "amount":
    case "cents": {
      const label = draft.warn ? "TURN THE WHEEL" : draft.kind === "payment" ? `TO ${draft.to}` : "AMOUNT";
      const icon = draft.kind === "payment" ? avatar("ic", people, draft.by, 1, 1) : [image("ic", "icon_receipt", 0, 0)];
      return [
        ...icon,
        ...tinyHeader(label, draft.warn ? AMBER : DIM, corner),
        ...amountChoice(money(draft.amount, v.currency), field === "cents", draft.amount > 0 || field === "amount" ? AMBER : DIM),
      ];
    }
    case "by":
      return [
        ...avatar("ic", people, draft.by, 1, 1),
        ...tinyHeader(draft.kind === "payment" ? "FROM" : "PAID BY", DIM, corner),
        ...choice(draft.by, colorOf(people, draft.by)),
      ];
    case "to":
      return [
        ...avatar("ic", people, draft.to, 1, 1),
        ...tinyHeader("TO", DIM, corner),
        ...choice(draft.to, colorOf(people, draft.to)),
      ];
    case "for":
      return forField(draft, v);
  }
}

/** Big outlined text on a badge, centred on `cx`; plain when it would not fit `width`. */
function badgeText(id: string, value: string, cx: number, width: number, outline: string): Element[] {
  const t = pixelText(value, "#FFFFFF", outline);
  if (t.width > width) return amount(id, value, cx, 4, width, WHITE);
  const left = cx - Math.floor(t.width / 2);
  return t.pieces.map((p, i) => xpm(`${id}${i}`, p.data, left + p.dx, 2));
}

/** The confirmation: a badge sweeping in, the payer's avatar and the amount in big outlined digits. */
function toastFront(ui: Extract<Ui, { mode: "toast" }>, v: View): Element[] {
  const { people } = v.ctx;
  const name = ui.tone === "add" ? "added" : ui.tone === "pay" ? "paid" : "undone";
  const outline = ui.tone === "add" ? "#3A1800" : ui.tone === "pay" ? "#04301A" : "#0A0C12";
  const out: Element[] = [anim("badge", name, 0, 0, false)];
  if (ui.amount === 0 || !ui.by) {
    out.push(...badgeText("bt", ui.head, FRONT_W / 2, FRONT_W - 6, outline));
    return out;
  }
  out.push(...avatar("tb", people, ui.by, 3, 1));
  if (ui.to) out.push(...avatar("tt", people, ui.to, FRONT_W - 17, 1));
  const right = ui.to ? FRONT_W - 18 : FRONT_W - 3;
  out.push(...badgeText("bt", money(ui.amount, v.currency), Math.floor((18 + right) / 2), right - 18, outline));
  return out;
}

function front(ui: Ui, v: View): Element[] {
  const { ctx } = v;
  switch (ui.mode) {
    case "home":
      return homeFront(pageAt(homePages(ctx.ledger, ctx.people), ui.page), v);
    case "menu": {
      const items = menuItems(ui, ctx);
      const at = Math.min(ui.cursor, items.length - 1);
      const item = items[at];
      const color = item === "clear" ? RED : item === "undo" ? AMBER : item === "settle" ? GREEN : WHITE;
      return [
        image("ic", MENU_ICON[item], 0, 0),
        ...tinyHeader(menuNote(item, ui, v), DIM, `${at + 1}/${items.length}`),
        ...choice(MENU_LABEL[item], color),
      ];
    }
    case "wizard":
      return wizardFront(ui.draft, v);
    case "history": {
      const at = historyAt(ctx.ledger, ui.cursor);
      if (!at) {
        return [image("ic", "icon_history", 0, 0), text("v", "NO ENTRIES", SIDE_X, 2, "small", DIM),
          text("w", "START: ADD ONE", SIDE_X, 10, "small", DIM)];
      }
      const { entry } = at;
      const label = entry.kind === "payment" ? `PAID ${entry.to}` : `FOR ${forLabel(entry.for, ctx.people)}`;
      return [
        ...avatar("ic", ctx.people, entry.by, 1, 1),
        ...tinyHeader(label, DIM, ago(entry.at, ctx.now)),
        ...amount("v", money(entry.amount, v.currency), SIDE_X + Math.floor(SIDE_W / 2), VALUE_ROW, SIDE_W - 2,
          entry.kind === "payment" ? GREEN : AMBER),
      ];
    }
    case "confirm": {
      const head = ui.action === "clear" ? "CLEAR ALL?" : ui.action === "undo" ? "UNDO LAST?" : "DELETE IT?";
      const color = ui.action === "clear" ? RED : AMBER;
      const entry = ctx.ledger.entries[ui.index];
      const detail = ui.action === "clear" || !entry ? "HOLD OK" : `${entryLine(entry, ctx.people)} ${money(entry.amount, v.currency)}`;
      const detailEls = /[€£]/.test(detail) && richWidth(detail, "small") <= SIDE_W
        ? richCentred("w", detail, SIDE_X + Math.floor(SIDE_W / 2), 10, "small", WHITE)
        : [line("w", detail.replace(/[€£]/g, ""), SIDE_X, 10, SIDE_W, "small", ui.action === "clear" ? DIM : WHITE)];
      return [
        image("ic", ui.action === "undo" ? "icon_undo" : "icon_trash", 0, 0),
        centred("v", head, SIDE_X + Math.floor(SIDE_W / 2), 2, "small", color),
        ...detailEls,
      ];
    }
    case "toast":
      return toastFront(ui, v);
  }
}

// Back display -----------------------------------------------------------------------------------------------------

/** Key hints on the bottom line. */
const hint = (value: string): Element => line("bk", value, 0, 72, BACK_W, "small", BACK_DIM, BACK);

/** Up to four lines in `large`, a label left and a value ending on `right`. */
function rows(lines: Array<[string, string, boolean]>, right = BACK_W): Element[] {
  const out: Element[] = [];
  lines.slice(0, BACK_ROWS).forEach(([label, value, bright], i) => {
    const row = 4 + i * 17;
    const color = bright ? BACK_TEXT : BACK_DIM;
    const valueW = richWidth(value, "large");
    out.push(text(`bl${i}`, fit(label, right - valueW - 8, "large"), 0, row, "large", color, BACK));
    if (value) out.push(...richRight(`bv${i}`, value, right, row, "large", color, BACK));
  });
  return out;
}

/** `page`: the home page on the front; its payment stands out and START's hint follows it. */
function homeBack(v: View, page: number): Element[] {
  const { ctx, currency } = v;
  const pages = homePages(ctx.ledger, ctx.people);
  const transfers = pages.filter((p): p is Extract<Page, { kind: "transfer" }> => p.kind === "transfer");
  if (transfers.length === 0) {
    const empty = ctx.ledger.entries.length === 0;
    return [
      centred("bt", empty ? "NOTHING OWED" : "ALL SETTLED", BACK_W / 2, 18, "large", BACK_TEXT, BACK),
      centred("bs", "START: SOMEBODY PAID FOR SOMETHING", BACK_W / 2, 40, "small", BACK_DIM, BACK),
      hint("OK: MENU   BACK: QUIT"),
    ];
  }
  const front = pageAt(pages, page);
  const on = front.kind === "transfer" ? front.index : -1;
  // Four at a time, scrolled with the front so its payment is in view, one line before it where there is one.
  const n = transfers.length;
  const top = n <= BACK_ROWS ? 0 : Math.max(0, Math.min(on - 1, n - BACK_ROWS));
  const shown = transfers.slice(top, top + BACK_ROWS);
  const lines: Array<[string, string, boolean]> = shown.map((t) =>
    [`${t.transfer.from} > ${t.transfer.to}`, money(t.transfer.amount, currency), on < 0 || t.index === on]);
  const keys = hint(on < 0 ? "START: ADD   OK: MENU" : "START: PAID BACK   OK: MENU");
  if (n <= BACK_ROWS) return [...rows(lines), keys];
  // A scrollbar right of the values: its track, and the thumb over the lines shown.
  const track = BACK_ROWS * 17 - 4;
  const thumbH = Math.max(4, Math.round((track * BACK_ROWS) / n));
  const thumbY = 4 + Math.round(((track - thumbH) * top) / (n - BACK_ROWS));
  return [
    ...rows(lines, BACK_W - 4),
    rect("sb", BACK_W - 1, 4, 1, track, BACK_DIM, BACK),
    rect("st", BACK_W - 2, thumbY, 3, thumbH, BACK_TEXT, BACK),
    keys,
  ];
}

function wizardBack(draft: Draft, v: View): Element[] {
  const { ctx, currency } = v;
  const field = draft.fields[draft.field];
  const amountText = money(draft.amount, currency);
  const lines: Array<[string, string, boolean]> = [];
  if (draft.kind === "expense") {
    const sharing = ctx.people.filter((_, i) => draft.shared[i]);
    const each = sharing.length ? `${money(shares(draft.amount, sharing.length)[0], currency)} EACH` : "NOBODY";
    lines.push(["AMOUNT", amountText, field === "amount" || field === "cents"], ["PAID BY", draft.by, field === "by"],
      ["FOR", forLabel(sharing, ctx.people) || "NOBODY", field === "for"], ["", sharing.length > 1 ? each : "", false]);
  } else {
    lines.push(["FROM", draft.by, field === "by"], ["TO", draft.to, field === "to"], ["AMOUNT", amountText, field === "amount" || field === "cents"]);
  }
  const last = draft.field === draft.fields.length - 1;
  const keys = field === "for"
    ? "OK: IN/OUT   START: SAVE"
    : `START/OK: ${last ? "SAVE" : "NEXT"}   BACK: ${draft.field > draft.first ? "PREV" : "CANCEL"}`;
  return [...rows(lines), hint(keys)];
}

function back(ui: Ui, v: View): Element[] {
  switch (ui.mode) {
    case "home":
    case "toast":
      return homeBack(v, ui.page);
    case "wizard":
      return wizardBack(ui.draft, v);
    case "menu":
      return rows([["WHEEL", "CHOOSE", true], ["OK", "DO IT", true], ["START", "NEW EXPENSE", true], ["BACK", "HOME", true]]);
    case "history": {
      const at = historyAt(v.ctx.ledger, ui.cursor);
      const lines: Array<[string, string, boolean]> = at
        ? [[`${ui.cursor + 1} OF ${v.ctx.ledger.entries.length}`,
          at.entry.at > v.ctx.now - 60 ? "JUST NOW" : `${ago(at.entry.at, v.ctx.now)} AGO`, true],
          [entryLine(at.entry, v.ctx.people), "", true]]
        : [["NO ENTRIES YET", "", true]];
      return [...rows(lines), hint("OK: DELETE IT   BACK: MENU")];
    }
    case "confirm":
      return rows([[ui.action === "clear" ? "HOLD OK" : "OK", "YES", true], ["BACK", "NO, KEEP IT", true]]);
  }
}

/** The frame for `ui`; `withBack` false skips the back display, which is slow to send. */
export function frame(ui: Ui, v: View, withBack: boolean): Element[] {
  if (v.ctx.people.length < 2) {
    const out = [centred("h", "WHO SHARES?", FRONT_W / 2, 1, "small", AMBER),
      line("v", "ADD 2+ NAMES IN THE APP SETTINGS", 0, 9, FRONT_W, "small", WHITE)];
    if (withBack) {
      out.push(centred("bt", "ADD NAMES", BACK_W / 2, 18, "large", BACK_TEXT, BACK),
        line("bs", "APPS > SPLIT > SETUP: PEOPLE", 0, 40, BACK_W, "small", BACK_DIM, BACK));
    }
    return out;
  }
  const out = front(ui, v);
  if (withBack) out.push(...back(ui, v));
  return out;
}
