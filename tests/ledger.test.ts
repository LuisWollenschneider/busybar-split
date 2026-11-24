import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_ENTRIES, addEntry, balances, emptyLedger, parseLedger, parsePeople, removeEntry, serializeLedger, settleUp, shares,
  type Entry, type Ledger,
} from "../src/ledger.ts";
import { money, stepAmount, stepCents, stepWhole } from "../src/money.ts";

const PEOPLE = ["ANNA", "BEN", "CLARA"];
const expense = (by: string, amount: number, people = PEOPLE): Entry => ({ kind: "expense", at: 1, by, amount, for: people });
const sum = (b: Record<string, number>) => Object.values(b).reduce((s, v) => s + v, 0);

test("shares split evenly, odd cents to the first ones", () => {
  assert.deepEqual(shares(1000, 3), [334, 333, 333]);
  assert.deepEqual(shares(1001, 3), [334, 334, 333]);
  assert.deepEqual(shares(5, 1), [5]);
  assert.deepEqual(shares(5, 0), []);
});

test("balances always add up to zero", () => {
  let ledger: Ledger = emptyLedger();
  ledger = addEntry(ledger, expense("ANNA", 1240));
  ledger = addEntry(ledger, expense("BEN", 999, ["BEN", "CLARA"]));
  ledger = addEntry(ledger, { kind: "payment", at: 2, by: "CLARA", amount: 300, to: "ANNA" });
  const b = balances(ledger);
  assert.equal(sum(b), 0);
  // Anna paid 12.40 for three (her share 4.14) and got 3.00 back from Clara.
  assert.equal(b.ANNA, 1240 - 414 - 300);
});

test("settle up pays every balance off", () => {
  const b = { ANNA: 1500, BEN: -1000, CLARA: -700, DAN: 200 };
  const transfers = settleUp(b, ["ANNA", "BEN", "CLARA", "DAN"]);
  const left: Record<string, number> = { ...b };
  for (const t of transfers) {
    assert.ok(t.amount > 0);
    left[t.from] += t.amount;
    left[t.to] -= t.amount;
  }
  assert.ok(Object.values(left).every((v) => v === 0));
  assert.ok(transfers.length <= 3);
  assert.deepEqual(transfers[0], { from: "BEN", to: "ANNA", amount: 1000 });
});

test("nothing owed, nothing to settle", () => {
  assert.deepEqual(settleUp({ ANNA: 0, BEN: 0 }, PEOPLE), []);
});

test("old entries fold into the base without changing balances", () => {
  let ledger = emptyLedger();
  for (let i = 0; i < MAX_ENTRIES + 7; i += 1) ledger = addEntry(ledger, expense(PEOPLE[i % 3], 100 + i));
  assert.equal(ledger.entries.length, MAX_ENTRIES);
  let full = 0;
  for (let i = 0; i < MAX_ENTRIES + 7; i += 1) if (PEOPLE[i % 3] === "ANNA") full += 100 + i;
  const anna = [...Array(MAX_ENTRIES + 7).keys()].reduce((s, i) => s - shares(100 + i, 3)[0], full);
  assert.equal(balances(ledger).ANNA, anna);
  assert.equal(sum(balances(ledger)), 0);
});

test("removing an entry undoes it", () => {
  let ledger = addEntry(emptyLedger(), expense("ANNA", 900));
  ledger = addEntry(ledger, expense("BEN", 300));
  const without = removeEntry(ledger, 0);
  assert.deepEqual(balances(without), { BEN: 200, ANNA: -100, CLARA: -100 });
  assert.equal(removeEntry(ledger, 5), ledger);
});

test("the store round-trips and drops junk", () => {
  let ledger = addEntry(emptyLedger(), expense("ANNA", 1240));
  ledger = addEntry(ledger, { kind: "payment", at: 9, by: "BEN", amount: 413, to: "ANNA" });
  ledger = { ...ledger, base: { DAN: -50, ANNA: 50 } };
  assert.deepEqual(parseLedger(serializeLedger(ledger)), ledger);
  assert.deepEqual(parseLedger(null), emptyLedger());
  assert.deepEqual(parseLedger("{nope"), emptyLedger());
  const junk = JSON.stringify({ v: 1, b: { X: 1.5 }, e: [["e", 1, "A", -3, ["B"]], ["p", 1, "A", 5, "A"], ["e", 1, "A", 5, ["B"]]] });
  assert.deepEqual(parseLedger(junk), { base: {}, entries: [{ kind: "expense", at: 1, by: "A", amount: 5, for: ["B"] }] });
});

test("people from the setting: upper case, unique, at most eight", () => {
  assert.deepEqual(parsePeople(" anna, Ben ,,ANNA, clara "), ["ANNA", "BEN", "CLARA"]);
  assert.equal(parsePeople("a,b,c,d,e,f,g,h,i,j").length, 8);
  assert.deepEqual(parsePeople("Zoë"), ["ZO"]);
});

test("money in every style", () => {
  assert.equal(money(1240, "eur"), "€12.40");
  assert.equal(money(1240, "eur_after"), "12,40 €");
  assert.equal(money(-305, "usd"), "-$3.05");
  assert.equal(money(5, "gbp"), "£0.05");
  assert.equal(money(100000, "chf"), "CHF 1000.00");
  assert.equal(money(0, "none"), "0.00");
});

test("a fast wheel lands on round amounts", () => {
  assert.equal(stepWhole(1240, 1, 3, 99999), 10040);
  assert.equal(stepWhole(1240, 1, 1, 99999), 1540);
  assert.equal(stepWhole(1240, 1, 2, 99999), 2040);
  assert.equal(stepWhole(99940, 1, 0, 99999), 99999);
  assert.equal(stepCents(1299, 1, 0, 99999), 1299);
  assert.equal(stepCents(1200, -1, 0, 99999), 1200);
  assert.equal(stepAmount(1240, 1, 100, 99999), 1300);
  assert.equal(stepAmount(1240, -1, 100, 99999), 1200);
  assert.equal(stepAmount(1300, 1, 100, 99999), 1400);
  assert.equal(stepAmount(5, -1, 10, 99999), 0);
  assert.equal(stepAmount(0, -1, 10, 99999), 0);
  assert.equal(stepAmount(99990, 1, 100, 99999), 99999);
});

test("the board's amounts shrink to fit", async () => {
  const { compact } = await import("../src/view.ts");
  assert.equal(compact(445, 16, false), "4.45");
  assert.equal(compact(-4860, 16, false), "49");
  assert.equal(compact(445, 16, true), "4,45");
  assert.equal(compact(445, 10, false), "4");
  assert.equal(compact(123456, 12, false), "1K");
});
