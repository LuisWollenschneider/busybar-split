/** The four API calls the app makes, over plain `fetch`: busy-lib's client costs tens of KiB of heap. */

import type { Element } from "./frame.ts";

const BASE = `${/^https?:\/\//.test(__BUSY_ADDR__) ? "" : "http://"}${__BUSY_ADDR__}/api`;

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  // The bar's fetch rejects `headers: undefined`, so leave the keys out.
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, init);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text().catch(() => "")}`);
  return res;
}

export async function displayDraw(app: string, elements: Element[]): Promise<void> {
  await call("POST", "/display/draw", { application_name: app, priority: 50, elements });
}

/** Without `ids`, every element of the app. */
export async function displayClear(app: string, ids?: string[]): Promise<void> {
  await call("DELETE", "/display/draw", ids ? { application_name: app, element_ids: ids } : { application_name: app });
}

/** `path` is inside the app's assets, e.g. "sounds/ding.snd". */
export async function audioPlay(app: string, path: string): Promise<void> {
  await call("POST", "/audio/play", { application_name: app, path });
}

/** Every settings field, saved or default; null when the bar did not answer. */
export async function loadSettings(app: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await call("GET", `/apps/settings?app_id=${encodeURIComponent(app)}`);
    const values = ((await res.json()) as { values?: unknown } | null)?.values;
    return values !== null && typeof values === "object" ? (values as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
