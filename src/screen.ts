import { displayClear, displayDraw } from "./api.ts";
import type { Element } from "./frame.ts";

/** Field by field; arrays (a rectangle's colours) as JSON. */
function same(a: Element | undefined, b: Element): boolean {
  if (!a) return false;
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return false;
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    if (typeof x !== "object" || typeof y !== "object" || JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}

const isBack = (e: Element) => e.display === "back";

/** The back display updates once frames have stopped for this long. */
const BACK_REST_MS = 150;

/** Builds a frame; `back` false: front display only. */
type Build = (back: boolean) => Element[];

/**
 * Sends only the elements that changed, and clears ids that are gone; after a failed request it starts over.
 *
 * So a fast wheel keeps up:
 * - One request in flight. A newer frame replaces the waiting one and is built only when sent.
 * - The back display, whose bitmaps are slow to build, waits until frames stop for BACK_REST_MS.
 */
export function createScreen(app: string, report: (err: unknown) => void) {
  /** Element id → element as last sent, per display; null when unknown. */
  let front: Map<string, Element> | null = null;
  let back: Map<string, Element> | null = null;
  let cleared = false;
  let busy = false;
  let pending: Build | null = null;
  /** The newest frame, for the back display's catch-up. */
  let latest: Build | null = null;
  let askedAt = 0;
  let backTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  /** Brings one display from `before` (null: just cleared) to `elements`; throws when a request fails. */
  async function update(before: Map<string, Element> | null, frame: Element[]): Promise<Map<string, Element>> {
    // Stacking follows z_index; among equal ones (every element at 0 when it is left out) a redrawn or new element
    // can land under the others. So each element's z_index is its place in the frame, bottom to top, and a changed
    // element is simply drawn again: no clear and draw, which shows a blank screen in between.
    const elements = frame.map((e, i): Element => ({ ...e, z_index: i }));
    const ids = new Set(elements.map((e) => e.id));
    // Ids that are gone go first, in one request, so two screens never show mixed.
    const gone = before ? [...before.keys()].filter((id) => !ids.has(id)) : [];
    if (gone.length > 0) await displayClear(app, gone);
    const changed = before ? elements.filter((e) => !same(before.get(e.id), e)) : elements;
    if (changed.length > 0) await displayDraw(app, changed);
    return new Map(elements.map((e): [string, Element] => [e.id, e]));
  }

  /** `fresh` restarts the rest; false for the back display's catch-up. */
  function ask(build: Build, fresh: boolean): void {
    if (stopped) return;
    latest = build;
    if (fresh) askedAt = Date.now();
    pending = build;
    if (busy) return;
    busy = true;
    void (async () => {
      while (pending) {
        const next = pending;
        pending = null;
        await send(next).catch((err) => {
          // Display state unknown: start over.
          front = back = null;
          cleared = false;
          report(err);
        });
      }
      busy = false;
    })();
  }

  async function send(build: Build): Promise<void> {
    if (!cleared) {
      await displayClear(app);
      front = back = null;
      cleared = true;
    }
    front = await update(front, build(false).filter((e) => !isBack(e)));
    const resting = Date.now() - askedAt;
    if (pending || resting < BACK_REST_MS) {
      // Still moving: update the back display once it rests.
      if (backTimer !== undefined) clearTimeout(backTimer);
      backTimer = setTimeout(() => {
        backTimer = undefined;
        if (latest && !stopped) ask(latest, false);
      }, BACK_REST_MS - Math.min(resting, BACK_REST_MS) + 5);
      return;
    }
    // Built again with the back display: its bitmaps are only made when sent.
    back = await update(back, build(true).filter(isBack));
  }

  return {
    /** Shows the elements `build` gives, called when sent (maybe never if superseded). Errors go to `report`. */
    draw(build: Build): void {
      ask(build, true);
    },
    /** Clears the back display's timer, so it doesn't keep the app alive. */
    stop(): void {
      stopped = true;
      if (backTimer !== undefined) clearTimeout(backTimer);
      backTimer = undefined;
    },
  };
}
