# Split

A shared tab on the BUSY Bar: who owes whom in your flat, office or on a trip, at a glance. Log "Anna paid €12.40 for everyone" in a few clicks, settle a debt with one press of START, and fix mistakes from the history.

A JavaScript app that runs on the bar itself. Everything is stored on the bar; the app makes no network requests.

## On the bar

The app opens on the board: a card per person in their colour, filled in green with what they get back or in red with what they owe, the largest balance full. Up to four people the cards show cents, more whole amounts; past six the board takes more pages (up to six each, shared out evenly), with a dot per page at the bottom. The wheel then goes through the payments that settle the tab, largest first: the payer's avatar, the amount and the payee's avatar, with the money flowing between them. When nobody owes anything a check coin says **SETTLED**. The back display lists the payments four at a time and scrolls with the front, the one shown there lit.

Saving shows a badge over the whole display, amber for an expense and green for a payment back, with the payer's avatar and the amount in big outlined digits.

| Key | On the tab | In a menu or list | While logging |
| --- | --- | --- | --- |
| START | On the board: logs an expense. On a payment page: logs it as paid back | Logs an expense | Next field; saves on the last |
| Wheel | Board, then each payment that settles | Chooses | Changes the field |
| OK | Opens the menu | Does it | Next field; in FOR: in or out |
| Hold OK | On a payment page: as START | Confirms CLEAR | In FOR: everyone, or only this one |
| Back | Quits | Back | Previous field; from the first, cancels |

### Logging an expense

Four fields: the amount's **whole units**, its **cents**, **PAID BY** and **FOR** (everyone at first). The part the wheel turns is lit and underlined. PAID BY starts on whoever owes the most, so the next shop evens the tab out; when nobody owes anything, on whoever paid last. START and OK both go on one field at a time, so none is skipped; leaving the cents with nothing at all, the header asks you to turn the wheel. In FOR the first chip is ALL, then each person is a coloured chip, five at a time, scrolling with the wheel: OK on ALL takes everyone out (or, when someone is out, everyone in), OK on a person takes them in or out, and the header shows how many share it and each part. START saves. Odd cents go to the first people in the list, so every expense adds up exactly.

One click is one unit, or one cent. Turning fast goes by tens (and then hundreds of units), landing on round amounts.

### Paying back

On a payment page START (or a hold of OK) opens it as a payment with who, to whom and the amount filled in, on the amount: turn the wheel for a part payment, then START twice saves it.

### The menu

- **SETTLE** (on a payment page): the payment that clears it, on its amount; turn the wheel for a part payment.
- **HISTORY**: the last 40 entries, newest first; OK deletes the one shown, after asking. The back display shows when it was logged.
- **PAYMENT**: someone paid someone back, any amount.
- **UNDO**: takes the last entry out, after asking.
- **CLEAR**: empties the tab; confirm with a hold of OK.

Menus and half-made entries go back to the tab after a minute without a key.

### Sounds

Each screen has a 16 px icon or the person's avatar on the left. The icons, avatars, badges and animations are made by `tools/art.py`.

A short bell when an expense is logged, a rising arpeggio when a debt is paid back, two falling notes on undo, delete or clear. Made by `tools/sounds.py`.

## Settings

Set on the bar (APPS, Split, Setup) or in its web page.

| Setting | |
| --- | --- |
| People | 2 to 8 names separated by commas. Short names fit best. A name taken out keeps its balance on the tab until it is settled. |
| Currency | €12.40, 12,40 €, $12.40, £12.40, CHF 12.40, 12,40 KR, or no symbol. |
| Invert the wheel | |

## How it keeps the tab

Amounts are whole cents. Each expense credits the payer and debits everyone who shares it; a payment credits the one who paid it back and debits the one who got it. The settle-up list pays the largest debt to the largest credit first, which needs at most one payment fewer than there are people.

The last 40 entries are kept one by one in `localStorage`; older ones are folded into a running balance, so the store stays small however long the tab runs. Renaming someone in the settings starts a new person: settle the old name first.

## Development

The project was made with BUSY Bar Emulator; see [AGENTS.md](./AGENTS.md) for the commands.

| | |
| --- | --- |
| `src/ledger.ts` | The tab: entries, balances, settle-up, the store |
| `src/money.ts` | Amounts as text, the wheel's steps |
| `src/ui.ts` | What each key does on each screen (pure) |
| `src/view.ts` | Each screen as display elements, front and back |
| `src/rich.ts` | € and £ as small bitmaps, as the fonts are ASCII |
| `src/pixeltext.ts`, `src/glyphs.ts` | Big outlined digits for the badges (the bar's bold font, OFL; from Rally) |
| `src/screen.ts` | Sends only changed elements, one request at a time, each with its place in the frame as `z_index`: among equal `z_index` values the bar stacks redrawn and new elements unpredictably, so without it a changed element can disappear under another |
| `src/api.ts` | The four API calls over `fetch` |
| `tests/` | `npm test` (`node --test`) |

