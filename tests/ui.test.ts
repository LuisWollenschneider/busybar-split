import assert from "node:assert/strict";
import { test } from "node:test";
import { addEntry, balances, emptyLedger, type Ledger } from "../src/ledger.ts";
import { homePages, menuItems, press, type Ctx, type Key, type Step, type Ui } from "../src/ui.ts";
import { frame } from "../src/view.ts";

const PEOPLE = ["ANNA", "BEN", "CLARA"];
const ctxOf = (ledger: Ledger = emptyLedger(), lastPayer = ""): Ctx => ({ people: PEOPLE, ledger, now: 1000, lastPayer });

/** Presses `keys` from `ui`, carrying the ledger along. */
function run(keys: Key[], ui: Ui = { mode: "home", page: 0 }, ledger = emptyLedger(), speed = 0): Step & { ledger: Ledger } {
  let step: Step = { ui };
  let current = ledger;
  for (const key of keys) {
    step = press(step.ui, key, ctxOf(current), speed);
    if (step.ledger) current = step.ledger;
    // Every screen must draw without throwing, back display included.
    frame(step.ui, { ctx: ctxOf(current), currency: "eur" }, true);
  }
  return { ...step, ledger: current };
}

const up = (n: number): Key[] => Array<Key>(n).fill("up");

test("START never skips a field: whole units, cents, payer, who shares, then it saves", () => {
  const field = (step: Step) => step.ui.mode === "wizard" && step.ui.draft.fields[step.ui.draft.field];
  assert.equal(field(run(["start", ...up(5), "start"])), "cents");
  const afterAmount = run(["start", ...up(5), "start", "start"]);
  assert.equal(field(afterAmount), "by");
  assert.equal(afterAmount.ledger.entries.length, 0);
  const step = run(["start", ...up(5), "start", ...up(3), "start", "start", "start"]);
  assert.equal(step.ui.mode, "toast");
  assert.deepEqual(step.ledger.entries, [{ kind: "expense", at: 1000, by: "ANNA", amount: 503, for: PEOPLE }]);
  assert.equal(step.sound, "add");
});

test("no amount, no going on: the header asks for one; cents alone are fine", () => {
  const step = run(["start", "start", "start"]);
  assert.ok(step.ui.mode === "wizard" && step.ui.draft.field === 1 && step.ui.draft.warn);
  const turned = run(["up"], step.ui);
  assert.ok(turned.ui.mode === "wizard" && !turned.ui.draft.warn && turned.ui.draft.amount === 1);
  const fifty = run(["start", "start", ...up(50), "start"]);
  assert.ok(fifty.ui.mode === "wizard" && fifty.ui.draft.amount === 50 && fifty.ui.draft.fields[fifty.ui.draft.field] === "by");
});

test("the wheel turns the whole part and the cents apart", () => {
  const ui = (amount: number, field: number): Ui => ({
    mode: "wizard", page: 0,
    draft: { kind: "expense", fields: ["amount", "cents", "by", "for"], field, first: 0, amount, by: "ANNA", to: "", shared: [true, true, true], cursor: 0, warn: false },
  });
  const amountOf = (step: Step) => (step.ui.mode === "wizard" ? step.ui.draft.amount : -1);
  assert.equal(amountOf(run(["up"], ui(1237, 0))), 1337);
  assert.equal(amountOf(run(["down", "down"], ui(137, 0))), 37);
  assert.equal(amountOf(run(["up"], ui(1299, 1))), 1299);
  assert.equal(amountOf(run(["down"], ui(1237, 1))), 1236);
  // Fast: tens of units, tens of cents, landing on round ones.
  assert.equal(amountOf(run(["up"], ui(1237, 0), emptyLedger(), 1)), 1537);
  assert.equal(amountOf(run(["up"], ui(1237, 1), emptyLedger(), 1)), 1240);
});

test("the full wizard: payer, then who shares", () => {
  // 1.00, OK, OK, BEN, OK; in FOR the wheel starts on ALL: up to ANNA, OK takes her out, START saves.
  const step = run(["start", "up", "ok", "ok", "up", "ok", "up", "ok", "start"]);
  assert.deepEqual(step.ledger.entries[0], { kind: "expense", at: 1000, by: "BEN", amount: 100, for: ["BEN", "CLARA"] });
});

test("PAID BY starts on whoever owes the most", () => {
  let ledger = addEntry(emptyLedger(), { kind: "expense", at: 1, by: "ANNA", amount: 900, for: PEOPLE });
  ledger = addEntry(ledger, { kind: "payment", at: 2, by: "BEN", amount: 100, to: "ANNA" });
  // BEN owes 2.00, CLARA 3.00.
  const step = run(["start"], { mode: "home", page: 0 }, ledger);
  assert.ok(step.ui.mode === "wizard" && step.ui.draft.by === "CLARA");
  // Nobody owes: the last payer.
  const fresh = press({ mode: "home", page: 0 }, "start", ctxOf(emptyLedger(), "BEN"));
  assert.ok(fresh.ui.mode === "wizard" && fresh.ui.draft.by === "BEN");
});

test("nobody sharing sends you back to FOR", () => {
  let step = run(["start", "up", "ok", "ok", "ok", "ok"]);
  // OK on ALL takes everyone out.
  assert.equal(step.ui.mode, "wizard");
  step = run(["start"], step.ui, step.ledger);
  assert.equal(step.ui.mode, "wizard");
  assert.equal(step.ledger.entries.length, 0);
});

test("home shows everyone on a board, then what to settle; START or hold OK pays the shown debt back", () => {
  const ledger = addEntry(emptyLedger(), { kind: "expense", at: 1, by: "ANNA", amount: 900, for: PEOPLE });
  const pages = homePages(ledger, PEOPLE);
  assert.deepEqual(pages.map((p) => p.kind), ["board", "transfer", "transfer"]);
  assert.equal(run(["hold"], { mode: "home", page: 0 }, ledger).ui.mode, "home");
  const settle = run(["start"], { mode: "home", page: 1 }, ledger);
  assert.ok(settle.ui.mode === "wizard");
  if (settle.ui.mode === "wizard") {
    const { kind, by, to, amount } = settle.ui.draft;
    assert.deepEqual({ kind, by, to, amount }, { kind: "payment", by: "BEN", to: "ANNA", amount: 300 });
    assert.equal(settle.ui.draft.fields[settle.ui.draft.field], "amount");
  }
  const step = run(["hold", "start", "start"], { mode: "home", page: 1 }, ledger);
  assert.equal(step.sound, "pay");
  const b = balances(step.ledger);
  assert.equal(b.BEN, 0);
  assert.equal(b.ANNA, 300);
});

test("menu: settle only on a debt; undo and clear only with something to undo", () => {
  assert.deepEqual(menuItems({ page: 0 }, ctxOf()), ["history", "payment"]);
  const ledger = addEntry(emptyLedger(), { kind: "expense", at: 1, by: "ANNA", amount: 900, for: PEOPLE });
  assert.deepEqual(menuItems({ page: 1 }, ctxOf(ledger)), ["settle", "history", "payment", "undo", "clear"]);
  assert.deepEqual(menuItems({ page: 0 }, ctxOf(ledger)), ["history", "payment", "undo", "clear"]);
});

test("undo takes the last entry out; clear needs a hold", () => {
  let ledger = addEntry(emptyLedger(), { kind: "expense", at: 1, by: "ANNA", amount: 900, for: PEOPLE });
  ledger = addEntry(ledger, { kind: "expense", at: 2, by: "BEN", amount: 300, for: PEOPLE });
  // Menu on the board: history, payment, undo, clear.
  const undo = run(["ok", "up", "up", "ok", "ok"], { mode: "home", page: 0 }, ledger);
  assert.equal(undo.ledger.entries.length, 1);
  const notYet = run(["ok", "down", "ok", "ok"], { mode: "home", page: 0 }, ledger);
  assert.equal(notYet.ledger.entries.length, 2);
  const cleared = run(["ok", "down", "ok", "hold"], { mode: "home", page: 0 }, ledger);
  assert.deepEqual(cleared.ledger, emptyLedger());
});

test("payments never go to oneself", () => {
  // Menu on the settled tab: history, payment.
  const step = run(["ok", "up", "ok", "down", "ok", "down", "ok", "up", "start", "start"]);
  const entry = step.ledger.entries[0];
  assert.equal(entry?.kind, "payment");
  if (entry?.kind === "payment") assert.notEqual(entry.by, entry.to);
});

test("history deletes the entry under the wheel", () => {
  let ledger = addEntry(emptyLedger(), { kind: "expense", at: 1, by: "ANNA", amount: 900, for: PEOPLE });
  ledger = addEntry(ledger, { kind: "expense", at: 2, by: "BEN", amount: 300, for: PEOPLE });
  const step = run(["up", "ok"], { mode: "history", page: 0, cursor: 0 }, ledger);
  assert.equal(step.ui.mode, "confirm");
  const done = run(["ok"], step.ui, ledger);
  assert.deepEqual(done.ledger.entries.map((e) => e.by), ["BEN"]);
  assert.equal(done.ui.mode, "history");
});

test("back on home quits", () => {
  assert.equal(run(["back"]).quit, true);
});

test("fewer than two people shows the setup hint", () => {
  const els = frame({ mode: "home", page: 0 }, { ctx: { ...ctxOf(), people: ["ANNA"] }, currency: "eur" }, true);
  assert.ok(els.some((e) => e.text === "WHO SHARES?"));
});

test("an id keeps its element type on every screen", () => {
  const ledger = addEntry(emptyLedger(), { kind: "expense", at: 1, by: "ANNA", amount: 900, for: PEOPLE });
  const types = new Map<string, unknown>();
  const keys: Key[] = ["up", "up", "up", "ok", "up", "ok", "back", "back", "start", "up", "start", "up", "start", "start", "ok", "start", "hold", "start", "start"];
  let ui: Ui = { mode: "home", page: 0 };
  let current = ledger;
  for (const key of keys) {
    const step = press(ui, key, ctxOf(current));
    ui = step.ui;
    if (step.ledger) current = step.ledger;
    for (const e of frame(ui, { ctx: ctxOf(current), currency: "eur" }, true)) {
      if (types.has(e.id)) assert.equal(types.get(e.id), e.type, e.id);
      types.set(e.id, e.type);
    }
  }
});

test("element ids are unique in every frame", () => {
  const ledger = addEntry(emptyLedger(), { kind: "expense", at: 1, by: "ANNA", amount: 900, for: PEOPLE });
  const uis: Ui[] = [
    { mode: "home", page: 0 }, { mode: "home", page: 3 }, { mode: "menu", page: 0, cursor: 0 },
    { mode: "history", page: 0, cursor: 0 }, { mode: "confirm", page: 0, action: "undo", index: 0, from: "menu", cursor: 3 },
    { mode: "home", page: 1 },
    { mode: "toast", page: 0, head: "ANNA PAID", amount: 900, line: "FOR ALL", tone: "add", by: "ANNA" },
    { mode: "toast", page: 0, head: "ANNA PAID", amount: 900, line: "BEN", tone: "pay", by: "ANNA", to: "BEN" },
    { mode: "toast", page: 0, head: "CLEARED", amount: 0, line: "", tone: "undo" },
  ];
  for (const ui of uis) {
    for (const currency of ["eur", "eur_after", "gbp"] as const) {
      const ids = frame(ui, { ctx: ctxOf(ledger), currency }, true).map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length, `${ui.mode} ${currency}: ${ids.join(" ")}`);
    }
  }
});

const MANY = Array.from({ length: 13 }, (_, i) => `P${i + 1}`);

test("more than six people: the board takes pages of six at most, shared out evenly", () => {
  const ledger = addEntry(emptyLedger(), { kind: "expense", at: 1, by: "P1", amount: 1300, for: MANY });
  const boards = homePages(ledger, MANY).filter((p) => p.kind === "board");
  assert.deepEqual(boards.map((p) => (p.kind === "board" ? p.balances.length : 0)), [5, 5, 3]);
  assert.deepEqual(boards.map((p) => (p.kind === "board" ? p.most : 0)), [1200, 1200, 1200]);
  const ctx: Ctx = { people: MANY, ledger, now: 1000, lastPayer: "" };
  for (let page = 0; page < 3; page += 1) {
    const ids = frame({ mode: "home", page }, { ctx, currency: "eur" }, true).map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("FOR starts on ALL, which takes everyone out and back in; the chips scroll with the wheel", () => {
  const ctx: Ctx = { people: MANY, ledger: emptyLedger(), now: 1000, lastPayer: "" };
  let ui: Ui = { mode: "home", page: 0 };
  for (const key of ["start", "up", "ok", "ok", "ok"] as Key[]) ui = press(ui, key, ctx).ui;
  assert.ok(ui.mode === "wizard" && ui.draft.cursor === 0 && ui.draft.shared.every(Boolean));
  ui = press(ui, "ok", ctx).ui;
  assert.ok(ui.mode === "wizard" && ui.draft.shared.every((on) => !on));
  ui = press(ui, "ok", ctx).ui;
  assert.ok(ui.mode === "wizard" && ui.draft.shared.every(Boolean));
  // Down from ALL to the last person: the last chip shown is theirs, underlined.
  ui = press(ui, "down", ctx).ui;
  assert.ok(ui.mode === "wizard" && ui.draft.cursor === MANY.length);
  ui = press(ui, "ok", ctx).ui;
  assert.ok(ui.mode === "wizard" && !ui.draft.shared[MANY.length - 1] && ui.draft.shared[0]);
  const els = frame(ui, { ctx, currency: "eur" }, true);
  assert.ok(els.some((e) => e.id === "t:ct4" && e.text === "P1"));
  assert.equal(new Set(els.map((e) => e.id)).size, els.length);
});
