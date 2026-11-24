/**
 * The shared tab: who paid what for whom. Pure; main.ts keeps it in localStorage.
 *
 * Amounts are whole cents. A person's balance is what the others owe them: positive gets money back, negative owes.
 * Old entries are folded into `base`, so the store stays small however long the flat keeps using it.
 */

export type Expense = {
  kind: "expense";
  /** Unix seconds. */
  at: number;
  /** Who paid. */
  by: string;
  /** Cents, > 0. */
  amount: number;
  /** Who shares it, at least one; the payer may be left out. */
  for: string[];
};

export type Payment = {
  kind: "payment";
  at: number;
  /** Who handed the money over. */
  by: string;
  amount: number;
  /** Who got it. */
  to: string;
};

export type Entry = Expense | Payment;

export type Ledger = {
  /** Balances of the entries folded away. */
  base: Record<string, number>;
  /** Oldest first. */
  entries: Entry[];
};

export type Transfer = { from: string; to: string; amount: number };

/** Entries kept one by one, for the history and undo; older ones only count in `base`. */
export const MAX_ENTRIES = 40;
/** At most this many people share a tab: the board pages through them, the FOR chips scroll. */
export const MAX_PEOPLE = 30;
/** 99,999.99 in cents. */
export const MAX_AMOUNT = 9_999_999;

export const emptyLedger = (): Ledger => ({ base: {}, entries: [] });

/** Each person's part of an expense: equal, the odd cents to the first ones listed. */
export function shares(amount: number, people: number): number[] {
  if (people <= 0) return [];
  const each = Math.floor(amount / people);
  const odd = amount - each * people;
  return Array.from({ length: people }, (_, i) => each + (i < odd ? 1 : 0));
}

function apply(balances: Record<string, number>, entry: Entry): void {
  const add = (name: string, cents: number) => {
    balances[name] = (balances[name] ?? 0) + cents;
  };
  add(entry.by, entry.amount);
  if (entry.kind === "payment") {
    add(entry.to, -entry.amount);
    return;
  }
  const parts = shares(entry.amount, entry.for.length);
  entry.for.forEach((name, i) => add(name, -parts[i]));
}

/** Every name with a balance, zero ones included. */
export function balances(ledger: Ledger): Record<string, number> {
  const out: Record<string, number> = { ...ledger.base };
  for (const entry of ledger.entries) apply(out, entry);
  return out;
}

/**
 * The fewest-ish payments that settle every balance: the largest debt goes to the largest credit first.
 * `order` breaks ties, so the list stays put between launches.
 */
export function settleUp(balance: Record<string, number>, order: string[]): Transfer[] {
  const rank = (name: string) => {
    const i = order.indexOf(name);
    return i < 0 ? order.length : i;
  };
  const sorted = (sign: 1 | -1) =>
    Object.keys(balance)
      .filter((name) => sign * balance[name] > 0)
      .map((name) => ({ name, left: Math.abs(balance[name]) }));
  const debtors = sorted(-1);
  const creditors = sorted(1);
  const byLeft = (a: { name: string; left: number }, b: { name: string; left: number }) =>
    b.left - a.left || rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : 1);
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byLeft);
    creditors.sort(byLeft);
    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(d.left, c.left);
    out.push({ from: d.name, to: c.name, amount });
    d.left -= amount;
    c.left -= amount;
    if (d.left === 0) debtors.shift();
    if (c.left === 0) creditors.shift();
  }
  return out;
}

/** `entry` added, the oldest folded into `base` past MAX_ENTRIES. */
export function addEntry(ledger: Ledger, entry: Entry): Ledger {
  const entries = [...ledger.entries, entry];
  const base = { ...ledger.base };
  while (entries.length > MAX_ENTRIES) apply(base, entries.shift() as Entry);
  for (const name of Object.keys(base)) if (base[name] === 0) delete base[name];
  return { base, entries };
}

/** Entry `index` (into `entries`) taken out, as if it never happened. */
export function removeEntry(ledger: Ledger, index: number): Ledger {
  if (index < 0 || index >= ledger.entries.length) return ledger;
  return { base: ledger.base, entries: ledger.entries.filter((_, i) => i !== index) };
}

/** True when nobody owes anybody and there is no history. */
export const isEmpty = (ledger: Ledger) =>
  ledger.entries.length === 0 && Object.values(ledger.base).every((v) => v === 0);

const NAME = /^[\x20-\x7e]{1,24}$/;
const isName = (v: unknown): v is string => typeof v === "string" && NAME.test(v);
const isCents = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= MAX_AMOUNT;

function readEntry(raw: unknown): Entry | null {
  if (!Array.isArray(raw)) return null;
  const [kind, at, by, amount, rest] = raw as unknown[];
  if (typeof at !== "number" || !isName(by) || !isCents(amount)) return null;
  if (kind === "p" && isName(rest) && rest !== by) return { kind: "payment", at, by, amount, to: rest };
  if (kind === "e" && Array.isArray(rest) && rest.length > 0 && rest.length <= MAX_PEOPLE * 2 && rest.every(isName)) {
    return { kind: "expense", at, by, amount, for: rest as string[] };
  }
  return null;
}

/** Compact JSON: every setItem rewrites the store to flash. */
export function serializeLedger(ledger: Ledger): string {
  return JSON.stringify({
    v: 1,
    b: ledger.base,
    e: ledger.entries.map((e) =>
      e.kind === "payment" ? ["p", e.at, e.by, e.amount, e.to] : ["e", e.at, e.by, e.amount, e.for]),
  });
}

/** What serializeLedger wrote; anything unreadable is dropped, never thrown. */
export function parseLedger(stored: string | null): Ledger {
  if (!stored) return emptyLedger();
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return emptyLedger();
  }
  if (!raw || typeof raw !== "object") return emptyLedger();
  const { b, e } = raw as { b?: unknown; e?: unknown };
  const base: Record<string, number> = {};
  if (b && typeof b === "object") {
    for (const [name, cents] of Object.entries(b as Record<string, unknown>)) {
      if (isName(name) && typeof cents === "number" && Number.isInteger(cents) && cents !== 0) base[name] = cents;
    }
  }
  const entries = Array.isArray(e) ? e.map(readEntry).filter((x): x is Entry => x !== null).slice(-MAX_ENTRIES) : [];
  return { base, entries };
}

/** Upper-case printable ASCII names from the setting, unique, at most MAX_PEOPLE. */
export function parsePeople(setting: string): string[] {
  const out: string[] = [];
  for (const part of setting.split(",")) {
    const name = part.trim().toUpperCase().replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").slice(0, 12);
    if (name && !out.includes(name) && out.length < MAX_PEOPLE) out.push(name);
  }
  return out;
}
