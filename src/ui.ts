/** What each key does in each screen. Pure: main.ts sends the frames, stores the ledger and plays the sounds. */

import {
  MAX_AMOUNT, addEntry, balances, emptyLedger, isEmpty, removeEntry, settleUp, type Entry, type Ledger, type Transfer,
} from "./ledger.ts";
import { stepCents, stepWhole } from "./money.ts";

/** "hold" is a long OK. */
export type Key = "up" | "down" | "ok" | "start" | "back" | "hold";

/** "amount" turns whole units, "cents" the cents of the same amount. */
export type Field = "amount" | "cents" | "by" | "to" | "for";

export type Draft = {
  kind: "expense" | "payment";
  fields: Field[];
  /** Index into `fields`. */
  field: number;
  /** Back from this field cancels. */
  first: number;
  amount: number;
  by: string;
  /** Payments only. */
  to: string;
  /** Expenses only: who shares it, by index into the people. */
  shared: boolean[];
  /** Where the wheel is in the FOR field: 0 the ALL chip, then 1 + the person's index. */
  cursor: number;
  /** Tried to go on without an amount: the header asks for one. */
  warn: boolean;
};

export type MenuItem = "settle" | "history" | "payment" | "undo" | "clear";

export type Toast = {
  head: string;
  amount: number;
  line: string;
  tone: "add" | "pay" | "undo";
  /** Who paid, and to whom: their avatars. */
  by?: string;
  to?: string;
};

export type Ui =
  | { mode: "home"; page: number }
  | { mode: "menu"; page: number; cursor: number }
  | { mode: "wizard"; page: number; draft: Draft }
  /** `cursor` 0 is the newest entry. */
  | { mode: "history"; page: number; cursor: number }
  /** `index` into the ledger's entries; `cursor` where Back returns to. */
  | { mode: "confirm"; page: number; action: "undo" | "clear" | "delete"; index: number; from: "menu" | "history"; cursor: number }
  | ({ mode: "toast"; page: number } & Toast);

export type Ctx = {
  /** From the settings, in their order; at least two. */
  people: string[];
  ledger: Ledger;
  /** Unix seconds. */
  now: number;
  /** The default PAID BY when nobody owes anything. */
  lastPayer: string;
};

export type Sound = "add" | "pay" | "undo";

export type Step = { ui: Ui; ledger?: Ledger; sound?: Sound; lastPayer?: string; quit?: boolean };

export type Balance = { name: string; cents: number };

export type Page =
  /** `most`: the largest balance on any board page, the one that fills a card. */
  | { kind: "board"; balances: Balance[]; most: number; index: number; of: number }
  | { kind: "transfer"; transfer: Transfer; index: number; of: number }
  | { kind: "settled" };

/** The board shows at most this many people at a time; more take more pages, shared out evenly. */
export const BOARD_MAX = 6;

/** Home: everyone's balance on the board, then each payment that settles the tab; one page when all is square. */
export function homePages(ledger: Ledger, people: string[]): Page[] {
  const balance = balances(ledger);
  const transfers = settleUp(balance, people);
  if (transfers.length === 0) return [{ kind: "settled" }];
  // People from the settings, then anyone taken out of them who still has a balance.
  const names = [...people, ...Object.keys(balance).filter((n) => !people.includes(n) && balance[n] !== 0)];
  const all = names.map((name) => ({ name, cents: balance[name] ?? 0 }));
  const of = Math.ceil(all.length / BOARD_MAX);
  const per = Math.ceil(all.length / of);
  const most = Math.max(1, ...all.map((b) => Math.abs(b.cents)));
  return [
    ...Array.from({ length: of }, (_, index): Page =>
      ({ kind: "board", balances: all.slice(index * per, (index + 1) * per), most, index, of })),
    ...transfers.map((transfer, index): Page => ({ kind: "transfer", transfer, index, of: transfers.length })),
  ];
}

export const pageAt = (pages: Page[], page: number) => pages[Math.max(0, Math.min(page, pages.length - 1))];

export function menuItems(ui: { page: number }, ctx: Ctx): MenuItem[] {
  const page = pageAt(homePages(ctx.ledger, ctx.people), ui.page);
  const items: MenuItem[] = [];
  if (page.kind === "transfer") items.push("settle");
  items.push("history", "payment");
  if (ctx.ledger.entries.length > 0) items.push("undo");
  if (!isEmpty(ctx.ledger)) items.push("clear");
  return items;
}

/** Newest first. */
export const historyAt = (ledger: Ledger, cursor: number): { entry: Entry; index: number } | null => {
  const index = ledger.entries.length - 1 - cursor;
  return index >= 0 && index < ledger.entries.length ? { entry: ledger.entries[index], index } : null;
};

const wrap = (i: number, n: number) => ((i % n) + n) % n;

function cycle(people: string[], current: string, dir: 1 | -1, skip?: string): string {
  let i = people.indexOf(current);
  if (i < 0) i = dir > 0 ? -1 : 0;
  for (let n = 0; n < people.length; n += 1) {
    i = wrap(i + dir, people.length);
    if (people[i] !== skip) return people[i];
  }
  return current;
}

/** Who should pay next: whoever owes the most; with nobody owing, the last payer. */
export function nextPayer(ctx: Ctx): string {
  const balance = balances(ctx.ledger);
  let by = ctx.people.includes(ctx.lastPayer) ? ctx.lastPayer : ctx.people[0];
  let lowest = 0;
  for (const name of ctx.people) {
    if ((balance[name] ?? 0) < lowest) {
      lowest = balance[name];
      by = name;
    }
  }
  return by;
}

export function newExpense(ctx: Ctx): Draft {
  const by = nextPayer(ctx);
  return {
    kind: "expense", fields: ["amount", "cents", "by", "for"], field: 0, first: 0, amount: 0, by, to: "",
    shared: ctx.people.map(() => true), cursor: 0, warn: false,
  };
}

function newPayment(ctx: Ctx, transfer?: Transfer): Draft {
  const by = transfer?.from ?? (ctx.people.includes(ctx.lastPayer) ? ctx.lastPayer : ctx.people[0]);
  const to = transfer?.to ?? cycle(ctx.people, by, 1, by);
  // Settling a shown debt starts on the amount; its people are already right.
  const field = transfer ? 2 : 0;
  return {
    kind: "payment", fields: ["by", "to", "amount", "cents"], field, first: field, amount: transfer?.amount ?? 0, by, to,
    shared: [], cursor: 0, warn: false,
  };
}

const sharedNames = (draft: Draft, people: string[]) => people.filter((_, i) => draft.shared[i]);

/** "ALL", "BEN", "BEN, CLARA" or "3 PEOPLE". */
export function forLabel(names: string[], people: string[]): string {
  if (names.length === people.length && people.every((p) => names.includes(p))) return "ALL";
  if (names.length <= 2) return names.join(", ");
  return `${names.length} PEOPLE`;
}

/** Saves the draft, or moves to the field that keeps it from saving. */
function save(ui: Extract<Ui, { mode: "wizard" }>, ctx: Ctx): Step {
  const { draft } = ui;
  const goTo = (field: Field): Step =>
    ({ ui: { ...ui, draft: { ...draft, field: draft.fields.indexOf(field), warn: field === "cents" } } });
  if (draft.amount <= 0) return goTo("cents");
  let entry: Entry;
  let toast: Toast;
  if (draft.kind === "expense") {
    const names = sharedNames(draft, ctx.people);
    if (names.length === 0) return goTo("for");
    entry = { kind: "expense", at: ctx.now, by: draft.by, amount: draft.amount, for: names };
    toast = { head: `${draft.by} PAID`, amount: draft.amount, line: `FOR ${forLabel(names, ctx.people)}`, tone: "add", by: draft.by };
  } else {
    if (draft.by === draft.to) return goTo("to");
    entry = { kind: "payment", at: ctx.now, by: draft.by, amount: draft.amount, to: draft.to };
    toast = { head: `${draft.by} PAID`, amount: draft.amount, line: draft.to, tone: "pay", by: draft.by, to: draft.to };
  }
  return {
    ui: { mode: "toast", page: 0, ...toast },
    ledger: addEntry(ctx.ledger, entry),
    sound: draft.kind === "expense" ? "add" : "pay",
    lastPayer: draft.by,
  };
}

function wizard(ui: Extract<Ui, { mode: "wizard" }>, key: Key, ctx: Ctx, speed: number): Step {
  const { draft } = ui;
  const field = draft.fields[draft.field];
  const set = (patch: Partial<Draft>): Step => ({ ui: { ...ui, draft: { ...draft, ...patch } } });
  const home: Step = { ui: { mode: "home", page: ui.page } };

  if (key === "back") return draft.field <= draft.first ? home : set({ field: draft.field - 1, warn: false });

  if (key === "up" || key === "down") {
    const dir = key === "up" ? 1 : -1;
    switch (field) {
      case "amount":
        return set({ amount: stepWhole(draft.amount, dir, speed, MAX_AMOUNT), warn: false });
      case "cents":
        return set({ amount: stepCents(draft.amount, dir, speed, MAX_AMOUNT), warn: false });
      case "by": {
        const by = cycle(ctx.people, draft.by, dir);
        // A payment to oneself means nothing: move TO on.
        return set({ by, to: draft.kind === "payment" && draft.to === by ? cycle(ctx.people, by, 1, by) : draft.to });
      }
      case "to":
        return set({ to: cycle(ctx.people, draft.to, dir, draft.by) });
      case "for":
        return set({ cursor: wrap(draft.cursor + dir, ctx.people.length + 1) });
    }
  }

  const all = draft.shared.every(Boolean);
  // OK on ALL: everyone out when everyone is in, else everyone in.
  if (field === "for" && (key === "ok" || key === "hold") && draft.cursor === 0) return set({ shared: draft.shared.map(() => !all) });
  if (field === "for" && key === "ok") {
    return set({ shared: draft.shared.map((on, i) => (i === draft.cursor - 1 ? !on : on)) });
  }
  if (field === "for" && key === "hold") {
    // Everyone, or when that is already so, only the one under the wheel.
    return set({ shared: draft.shared.map((_, i) => !all || i === draft.cursor - 1) });
  }
  // In FOR, OK takes people in and out, and START saves.
  if (field === "for" && key === "start") return save(ui, ctx);
  // Everywhere else OK and START both go on, one field at a time: no field is skipped.
  if (key === "ok" || key === "start") {
    // Nothing whole is fine (0.50); nothing at all is not.
    if (field === "cents" && draft.amount <= 0) return set({ warn: true });
    return draft.field + 1 < draft.fields.length ? set({ field: draft.field + 1 }) : save(ui, ctx);
  }
  return { ui };
}

/** One key in the current screen; `speed` is how fast the wheel turns: 0 to 3. */
export function press(ui: Ui, key: Key, ctx: Ctx, speed = 0): Step {
  switch (ui.mode) {
    case "toast":
      return { ui: { mode: "home", page: ui.page } };

    case "home": {
      const pages = homePages(ctx.ledger, ctx.people);
      const page = Math.max(0, Math.min(ui.page, pages.length - 1));
      if (key === "back") return { ui, quit: true };
      if (key === "up" || key === "down") return { ui: { mode: "home", page: wrap(page + (key === "up" ? 1 : -1), pages.length) } };
      const shown = pages[page];
      // On a payment page START and hold OK pay it back; elsewhere START logs an expense.
      if ((key === "start" || key === "hold") && shown.kind === "transfer") {
        return { ui: { mode: "wizard", page, draft: newPayment(ctx, shown.transfer) } };
      }
      if (key === "start") return { ui: { mode: "wizard", page, draft: newExpense(ctx) } };
      if (key === "ok") return { ui: { mode: "menu", page, cursor: 0 } };
      return { ui };
    }

    case "menu": {
      const items = menuItems(ui, ctx);
      const home: Ui = { mode: "home", page: ui.page };
      if (key === "back") return { ui: home };
      if (key === "up" || key === "down") return { ui: { ...ui, cursor: wrap(ui.cursor + (key === "up" ? 1 : -1), items.length) } };
      if (key === "start") return { ui: { mode: "wizard", page: ui.page, draft: newExpense(ctx) } };
      if (key !== "ok") return { ui };
      const at = { page: ui.page, from: "menu" as const, cursor: ui.cursor };
      switch (items[Math.min(ui.cursor, items.length - 1)]) {
        case "settle": {
          const page = pageAt(homePages(ctx.ledger, ctx.people), ui.page);
          return page.kind === "transfer" ? { ui: { mode: "wizard", page: ui.page, draft: newPayment(ctx, page.transfer) } } : { ui: home };
        }
        case "history":
          return { ui: { mode: "history", page: ui.page, cursor: 0 } };
        case "payment":
          return { ui: { mode: "wizard", page: ui.page, draft: newPayment(ctx) } };
        case "undo":
          return { ui: { mode: "confirm", action: "undo", index: ctx.ledger.entries.length - 1, ...at } };
        case "clear":
          return { ui: { mode: "confirm", action: "clear", index: -1, ...at } };
      }
      return { ui: home };
    }

    case "wizard":
      return wizard(ui, key, ctx, speed);

    case "history": {
      const count = ctx.ledger.entries.length;
      if (key === "back") return { ui: { mode: "menu", page: ui.page, cursor: menuItems(ui, ctx).indexOf("history") } };
      if (count === 0) return { ui };
      if (key === "up" || key === "down") return { ui: { ...ui, cursor: wrap(ui.cursor + (key === "up" ? 1 : -1), count) } };
      const at = historyAt(ctx.ledger, ui.cursor);
      if (key === "ok" && at) {
        return { ui: { mode: "confirm", page: ui.page, action: "delete", index: at.index, from: "history", cursor: ui.cursor } };
      }
      return { ui };
    }

    case "confirm": {
      const back: Ui = ui.from === "history"
        ? { mode: "history", page: ui.page, cursor: ui.cursor }
        : { mode: "menu", page: ui.page, cursor: ui.cursor };
      if (key === "back") return { ui: back };
      // Clearing the whole tab takes a hold, so a stray double OK cannot do it.
      const confirmKey = ui.action === "clear" ? "hold" : "ok";
      if (key !== confirmKey) return { ui };
      if (ui.action === "clear") {
        return { ui: { mode: "toast", page: 0, head: "CLEARED", amount: 0, line: "A FRESH START", tone: "undo" }, ledger: emptyLedger(), sound: "undo" };
      }
      const entry = ctx.ledger.entries[ui.index];
      if (!entry) return { ui: back };
      const ledger = removeEntry(ctx.ledger, ui.index);
      const toast: Toast = {
        head: ui.action === "undo" ? "UNDONE" : "DELETED",
        amount: entry.amount,
        line: entry.kind === "payment" ? `${entry.by} > ${entry.to}` : `${entry.by} FOR ${forLabel(entry.for, ctx.people)}`,
        tone: "undo",
      };
      if (ui.action === "delete" && ledger.entries.length > 0) {
        // Stay in the history, on the entry that took this one's place.
        return { ui: { mode: "history", page: ui.page, cursor: Math.min(ui.cursor, ledger.entries.length - 1) }, ledger, sound: "undo" };
      }
      return { ui: { mode: "toast", page: 0, ...toast }, ledger, sound: "undo" };
    }
  }
}
