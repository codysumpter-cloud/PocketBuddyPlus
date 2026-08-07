import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { HOME_STATE_KEYS, MAX_HOME_STATE_CHARS, createHomeStateHandler, isHomeStateKey } from "./index.js";

const here = fileURLToPath(new URL("./", import.meta.url));

// ---------------------------------------------------------------------------
// Host side: the panel is sandboxed but is still untrusted input to this side.
// ---------------------------------------------------------------------------

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, get: async (key) => map.get(key), set: async (key, value) => { map.set(key, value); } };
}

{
  const storage = fakeStorage({ [HOME_STATE_KEYS[0]]: '{"version":2}' });
  const sent = [];
  const handle = createHomeStateHandler(storage, { postMessage: (msg) => sent.push(msg) });

  await handle({ type: "home-state-request" });
  assert.deepEqual(sent, [{ type: "home-state", values: { [HOME_STATE_KEYS[0]]: '{"version":2}' } }],
    "a state request answers with exactly the stored keys");

  await handle({ type: "home-state-write", key: HOME_STATE_KEYS[0], value: '{"version":2,"room":{}}' });
  assert.equal(storage.map.get(HOME_STATE_KEYS[0]), '{"version":2,"room":{}}', "a write reaches storage");

  // A panel that asks to write somewhere else must not be able to.
  await handle({ type: "home-state-write", key: "some.other.plugin:secret", value: "x" });
  assert.equal(storage.map.has("some.other.plugin:secret"), false, "writes are confined to the Home keys");
  assert.equal(isHomeStateKey("some.other.plugin:secret"), false);

  // An oversized save is a bug, not a room, and must not be persisted.
  const before = storage.map.get(HOME_STATE_KEYS[0]);
  await handle({ type: "home-state-write", key: HOME_STATE_KEYS[0], value: "z".repeat(MAX_HOME_STATE_CHARS + 1) });
  assert.equal(storage.map.get(HOME_STATE_KEYS[0]), before, "an oversized save is rejected");

  await handle({ type: "home-state-write", key: HOME_STATE_KEYS[0], value: 42 });
  assert.equal(storage.map.get(HOME_STATE_KEYS[0]), before, "a non-string save is rejected");

  await handle(null);
  await handle({ type: "unknown" });
}

// ---------------------------------------------------------------------------
// Panel side: run the bundle that actually ships.
//
// Home used to run on Phaser, which cannot fit in a panel. The drawing code was
// kept and only the engine under it was replaced, so the thing worth proving is
// that the shipped panel still builds a room and draws it - not that some
// source file compiles.
// ---------------------------------------------------------------------------

const html = readFileSync(join(here, "home.html"), "utf8");
const script = html.slice(html.indexOf('<script type="module">') + '<script type="module">'.length, html.lastIndexOf("</script>"));
assert.ok(script.length > 10_000, "home.html should carry the inlined panel bundle");
assert.ok(Buffer.byteLength(html) < 1024 * 1024, "home.html must stay under the 1 MiB panel cap");

const draws = [];

class FakePath2D {
  constructor() { this.ops = []; }
  moveTo(...args) { this.ops.push(["moveTo", ...args]); }
  lineTo(...args) { this.ops.push(["lineTo", ...args]); }
  arc(...args) { this.ops.push(["arc", ...args]); }
  closePath() { this.ops.push(["closePath"]); }
}

const ctx2d = {
  canvas: { width: 900, height: 700 },
  fillStyle: "", strokeStyle: "", lineWidth: 0, imageSmoothingEnabled: true,
  setTransform() {},
  clearRect() { draws.push(["clearRect"]); },
  fillRect(...a) { draws.push(["fillRect", this.fillStyle, ...a]); },
  strokeRect(...a) { draws.push(["strokeRect", this.strokeStyle, ...a]); },
  fill(path) { draws.push(["fill", this.fillStyle, path.ops.length]); },
  stroke(path) { draws.push(["stroke", this.strokeStyle, path.ops.length]); },
};

function makeElement(tag) {
  const element = {
    tagName: tag.toUpperCase(),
    style: {}, dataset: {}, children: [], tabIndex: 0,
    width: 0, height: 0,
    clientWidth: 900, clientHeight: 700,
    classList: { toggle() {}, add() {}, remove() {} },
    set cssText(value) { this.style.cssText = value; },
    append(...nodes) { this.children.push(...nodes); },
    remove() {},
    focus() {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 700 }),
    getContext: () => ctx2d,
    querySelector: () => null,
    querySelectorAll: () => [],
    set innerHTML(value) { this._html = value; },
    get innerHTML() { return this._html ?? ""; },
  };
  return element;
}

const root = makeElement("div");
let stage = null;
const statusNode = makeElement("span");
const thoughtNode = makeElement("span");
root.querySelector = (selector) => {
  if (selector.includes("home-stage")) { stage ??= makeElement("div"); return stage; }
  if (selector.includes("home-status")) return statusNode;
  if (selector.includes("home-thought")) return thoughtNode;
  return null;
};

const posted = [];
let panelHandler = null;

globalThis.Path2D = FakePath2D;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.document = {
  body: makeElement("body"),
  documentElement: makeElement("html"),
  getElementById: (id) => (id === "home-root" ? root : null),
  createElement: makeElement,
  addEventListener() {},
};
globalThis.window = {
  devicePixelRatio: 2,
  addEventListener() {}, removeEventListener() {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.openPetsPanel = {
  postMessage: (msg) => {
    posted.push(msg);
    // Answer the state request the way the host would, with nothing saved.
    if (msg?.type === "home-state-request") queueMicrotask(() => panelHandler?.({ type: "home-state", values: {} }));
  },
  onMessage: (handler) => { panelHandler = handler; return () => { panelHandler = null; }; },
  close() {},
};

const temp = join(tmpdir(), `openpets-home-panel-${process.pid}.mjs`);
writeFileSync(temp, script);
try {
  await import(`file://${temp}`);
  // The panel awaits the host before mounting; let that round trip settle.
  await new Promise((resolve) => setTimeout(resolve, 50));
} finally {
  rmSync(temp, { force: true });
}

assert.ok(root.innerHTML.includes("data-home-stage"), "the panel renders its own shell (no app nav or modal)");
assert.ok(root.innerHTML.includes('data-home-mode="paint"'), "mode controls render");
assert.ok(root.innerHTML.includes('data-home-brush="floor.wood"'), "floor brushes render");
assert.ok(!root.innerHTML.includes("pb-home-nav"), "the app nav tab must not come along into the panel");

assert.deepEqual(posted[0], { type: "home-state-request" }, "the panel asks the host for the save before mounting");

assert.ok(draws.length > 50, `the room should draw; got ${draws.length} operations`);
assert.ok(draws.some(([op]) => op === "fill"), "floor tiles are filled");
assert.ok(draws.some(([op]) => op === "stroke"), "walls and outlines are stroked");

// Phaser takes 0xRRGGBB plus a separate alpha; the shim must convert, or the
// whole room would silently draw in the default black.
assert.ok(draws.some(([op, style]) => op === "fill" && /^rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(style ?? "")),
  "colours are converted from Phaser's numeric form to canvas rgba");
assert.ok(draws.some(([op, style]) => op === "fill" && style === "rgba(201, 153, 104, 1)"),
  "the starter wood floor keeps its colour (0xc99968)");

// drawDiamond fills a tile and then strokes the same path, which only works
// because fillPath/strokePath render without consuming it. Every floor tile
// depends on this, so assert a fill is immediately followed by a stroke of an
// equally long path.
const diamond = draws.findIndex(([op, , ops], index) =>
  op === "fill" && ops === 5 && draws[index + 1]?.[0] === "stroke" && draws[index + 1]?.[2] === 5);
assert.ok(diamond >= 0, "a filled tile is stroked from the same path (fillPath must not consume it)");

// A save must have been produced and offered to the host.
const write = posted.find((msg) => msg?.type === "home-state-write");
assert.ok(write, "mounting persists the room through the host");
assert.equal(write.key, HOME_STATE_KEYS[0]);
const saved = JSON.parse(write.value);
assert.equal(saved.version, 2);
assert.ok(saved.room.items.length >= 5, "the starter room ships with furniture");

console.log("Home Builder plugin contract passed.");
process.exit(0);
