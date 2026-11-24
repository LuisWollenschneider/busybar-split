import { audioPlay, loadSettings } from "./api.ts";
import { parseLedger, parsePeople, serializeLedger, type Ledger } from "./ledger.ts";
import { isCurrency, type Currency } from "./money.ts";
import { createScreen } from "./screen.ts";
import { press, type Ctx, type Key, type Sound, type Ui } from "./ui.ts";
import { frame } from "./view.ts";
import manifest from "./appmeta/manifest.json";

const APP = manifest.id;

const LEDGER_KEY = "ledger";
const PAYER_KEY = "payer";
/** How long the "ANNA PAID €12.40" confirmation stays. */
const TOAST_MS = 1600;
/** Idle time after which a menu or a half-made entry gives way to the tab again. */
const IDLE_MS = 60 * 1000;
/** Clicks closer than this, same direction, count as a fast turn. */
const FAST_CLICK_MS = 120;

type Options = { people: string[]; currency: Currency; invert: boolean };

const report = (err: unknown) => console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);

function readOptions(values: Record<string, unknown>): Options {
  const people = parsePeople(typeof values.people === "string" ? values.people : "ANNA, BEN, CLARA");
  return {
    people,
    currency: isCurrency(values.currency) ? values.currency : "eur",
    invert: values.invert_wheel === true,
  };
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    report(err);
  }
}

/** As in busybar-counter: 0 for a single click, 1 after 3 fast ones, 2 after 8, 3 after 20. A single flick stays at 0. */
function wheelSpeed() {
  let lastAt = 0;
  let lastDir = 0;
  let streak = 0;
  return {
    click(dir: number): number {
      const now = Date.now();
      streak = dir === lastDir && now - lastAt < FAST_CLICK_MS ? streak + 1 : 0;
      lastAt = now;
      lastDir = dir;
      return streak >= 20 ? 3 : streak >= 8 ? 2 : streak >= 3 ? 1 : 0;
    },
  };
}

const SOUNDS: Record<Sound, string> = { add: "sounds/add.snd", pay: "sounds/pay.snd", undo: "sounds/undo.snd" };

/**
 * Keys go through ui.ts's press(); this wires them, stores the tab and plays the sounds. The input listener keeps the
 * app alive; timers run only for the confirmation and the idle return.
 */
function main(): void {
  const screen = createScreen(APP, report);
  let options: Options | null = null;
  let ledger: Ledger = parseLedger(readStored(LEDGER_KEY));
  let lastPayer = readStored(PAYER_KEY) ?? "";
  let ui: Ui = { mode: "home", page: 0 };
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const clear = (t: ReturnType<typeof setTimeout> | undefined): undefined => {
    if (t !== undefined) clearTimeout(t);
    return undefined;
  };

  const ctx = (o: Options): Ctx => ({ people: o.people, ledger, now: Math.floor(Date.now() / 1000), lastPayer });

  function draw(): void {
    if (!options || stopped) return;
    const o = options;
    // Built when sent: a burst of wheel clicks costs one frame.
    screen.draw((withBack) => frame(ui, { ctx: ctx(o), currency: o.currency }, withBack));
  }

  function goHome(): void {
    toastTimer = clear(toastTimer);
    idleTimer = clear(idleTimer);
    ui = { mode: "home", page: ui.page };
    draw();
  }

  /** The timers the new screen needs: the confirmation's end, or the idle return. */
  function arm(): void {
    toastTimer = clear(toastTimer);
    idleTimer = clear(idleTimer);
    if (ui.mode === "toast") toastTimer = setTimeout(() => { toastTimer = undefined; goHome(); }, TOAST_MS);
    else if (ui.mode !== "home") idleTimer = setTimeout(() => { idleTimer = undefined; goHome(); }, IDLE_MS);
  }

  function quit(): void {
    stopped = true;
    screen.stop();
    toastTimer = clear(toastTimer);
    idleTimer = clear(idleTimer);
  }

  const wheel = wheelSpeed();

  const unbind = listen("input", (event) => {
    if (stopped || !options) return;
    let key: Key | null = null;
    let speed = 0;
    if (event.key === "encoder") {
      const clockwise = (event.delta > 0) !== options.invert;
      key = clockwise ? "up" : "down";
      speed = wheel.click(event.delta);
    } else if (event.action === "short") key = event.key;
    else if (event.action === "long" && event.key === "ok") key = "hold";
    if (!key) return;

    const step = press(ui, key, ctx(options), speed);
    if (step.quit) {
      quit();
      // Not detached inside the handler, or the app stops mid-callback.
      setTimeout(unbind, 0);
      return;
    }
    ui = step.ui;
    if (step.ledger) {
      ledger = step.ledger;
      writeStored(LEDGER_KEY, serializeLedger(ledger));
    }
    if (step.lastPayer !== undefined && step.lastPayer !== lastPayer) {
      lastPayer = step.lastPayer;
      writeStored(PAYER_KEY, lastPayer);
    }
    if (step.sound) void audioPlay(APP, SOUNDS[step.sound]).catch(report);
    arm();
    draw();
  });

  void loadSettings(APP)
    .then((values) => {
      if (stopped) return;
      options = readOptions(values ?? {});
      draw();
    })
    .catch(report);
}

main();
