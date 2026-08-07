import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHUNK_CHARS,
  HOME_STATE_KEYS,
  MAX_HOME_STATE_CHARS,
  MAX_SPRITE_BYTES,
  PACK_CACHE_KEY,
  chunkDataUrl,
  collectPackSprites,
  createHomeStateHandler,
  isHomeStateKey,
} from "./index.js";

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
// Pack loading. The TinyHouse pack is paid art the user owns: nothing from it
// is committed here, so these tests use synthetic files and only check the
// selection, filtering and transfer rules.
// ---------------------------------------------------------------------------

function fakePicked(name, bytes = new Uint8Array([1, 2, 3]), sizeBytes = bytes.byteLength) {
  let reads = 0;
  return { name, sizeBytes, reads: () => reads, readBytes: async () => { reads += 1; return bytes; } };
}

{
  // The user is expected to select the whole pack, so unwanted files must be
  // rejected on name alone - reading 1,097 files would be the bug.
  const wanted = fakePicked("Bed_A_4.png");
  const unwanted = fakePicked("Cactus_2.png");
  const sprites = await collectPackSprites([wanted, unwanted]);

  assert.deepEqual(Object.keys(sprites), ["home.bed.basic"], "only files Home maps are used");
  assert.ok(sprites["home.bed.basic"].startsWith("data:image/png;base64,"), "sprites are handed over as data URLs");
  assert.equal(unwanted.reads(), 0, "an unmapped file must never be read");
  assert.equal(wanted.reads(), 1);

  // Same sprite in two folders: take one, do not read the other.
  const first = fakePicked("Floor_64_Sea.png");
  const duplicate = fakePicked("Floor_64_Sea.png");
  await collectPackSprites([first, duplicate]);
  assert.equal(duplicate.reads(), 0, "a duplicate name is skipped without reading");

  // A file far too large to be a tile is refused before it is read.
  const huge = fakePicked("Table_10.png", new Uint8Array([1]), MAX_SPRITE_BYTES + 1);
  assert.deepEqual(await collectPackSprites([huge]), {});
  assert.equal(huge.reads(), 0, "an oversized file is rejected on its reported size");

  // Path-ish names still resolve, and unrelated files never match.
  assert.deepEqual(Object.keys(await collectPackSprites([fakePicked("Bedroom/Bed_A_4.png")])), ["home.bed.basic"]);
  assert.deepEqual(await collectPackSprites([fakePicked("notes.txt")]), {});
}

{
  // Panel messages are capped at 64 KiB by the host, so every chunk must fit.
  const chunks = chunkDataUrl("x".repeat(CHUNK_CHARS * 2 + 7));
  assert.equal(chunks.length, 3);
  assert.equal(chunks.join(""), "x".repeat(CHUNK_CHARS * 2 + 7), "chunking is lossless");
  for (const chunk of chunks) assert.ok(chunk.length <= CHUNK_CHARS, "a chunk must fit in one panel message");
}

{
  // A pack loaded once must come back on reopen without picking files again.
  const storage = fakeStorage({ [PACK_CACHE_KEY]: JSON.stringify({ "home.bed.basic": "data:image/png;base64,AAA" }) });
  const sent = [];
  const handle = createHomeStateHandler(storage, { postMessage: (msg) => sent.push(msg) });
  await handle({ type: "home-state-request" });

  const types = sent.map((msg) => msg.type);
  assert.ok(types.includes("home-pack-begin") && types.includes("home-pack-chunk") && types.includes("home-pack-end"),
    `a cached pack replays on open; got ${types.join(", ")}`);
}

{
  // A corrupt cache must degrade to no art, not break opening Home.
  const storage = fakeStorage({ [PACK_CACHE_KEY]: "{not json" });
  const sent = [];
  const handle = createHomeStateHandler(storage, { postMessage: (msg) => sent.push(msg) });
  await handle({ type: "home-state-request" });
  assert.deepEqual(sent.map((msg) => msg.type), ["home-state"], "a corrupt pack cache is ignored");
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
  fill(path) { draws.push(["fill", this.fillStyle, path.ops.length, path.ops.find((op) => op[0] === "arc")]); },
  stroke(path) { draws.push(["stroke", this.strokeStyle, path.ops.length]); },
  drawImage(image, x, y, w, h) { draws.push(["drawImage", image.src, x, y, w, h]); },
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
// Stand-in decoder: the pack is the user's paid art and is not in this repo, so
// the test proves the draw path with a synthetic sprite rather than real tiles.
globalThis.Image = class {
  constructor() { this.width = 64; this.height = 64; this.onload = null; this.onerror = null; }
  set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
  get src() { return this._src; }
};
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
    if (msg?.type === "home-state-request") queueMicrotask(() => {
      panelHandler?.({ type: "home-state", values: {} });
      panelHandler?.({ type: "home-presentation", mode: "panel" });
      panelHandler?.({ type: "home-buddy-presence", buddy: { id: "default", name: "Pixel Buddy", profile: { displayName: "Pixel Buddy", mood: "happy", activity: "exploring", dominantNeed: "play", affection: 0.8, needs: { play: 0.7 } } } });
      panelHandler?.({ type: "home-buddy-frame-begin", count: 1, metadata: { width: 64, height: 64 } });
      panelHandler?.({ type: "home-buddy-frame-chunk", index: 0, count: 1, data: "data:image/png;base64,BBBB" });
      panelHandler?.({ type: "home-buddy-frame-end" });
    });
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
assert.ok(root.innerHTML.includes('data-home-presentation="home"'), "Home presentation control renders");
assert.ok(root.innerHTML.includes('data-home-presentation="buddy"'), "Buddy-only presentation control renders");
assert.ok(root.innerHTML.includes('data-home-simulation="idle"'), "Idle household control renders");
assert.ok(root.innerHTML.includes('data-home-brush="floor.wood"'), "floor brushes render");
assert.ok(!root.innerHTML.includes("pb-home-nav"), "the app nav tab must not come along into the panel");

assert.deepEqual(posted[0], { type: "home-state-request" }, "the panel asks the host for the save before mounting");

assert.ok(draws.length > 50, `the room should draw; got ${draws.length} operations`);
assert.ok(draws.some(([op]) => op === "fill"), "floor tiles are filled");
assert.ok(draws.some(([op]) => op === "stroke"), "walls and outlines are stroked");
assert.ok(draws.some(([op, src]) => op === "drawImage" && src === "data:image/png;base64,BBBB"), "the active host Buddy frame is drawn inside Home");

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

// The whole point of the port was to get real art in. Feed sprites through the
// exact message protocol the host uses and assert the room switches from drawn
// shapes to blitted tiles.
const beforeSprites = draws.length;
const packed = "data:image/png;base64,AAAA";
panelHandler({ type: "home-pack-begin", keys: ["floor.wood", "home.bed.basic"], total: 10 });
for (const key of ["floor.wood", "home.bed.basic"]) {
  panelHandler({ type: "home-pack-chunk", key, index: 0, count: 1, data: packed });
}
await new Promise((resolve) => setTimeout(resolve, 20));
panelHandler({ type: "home-pack-end" });
await new Promise((resolve) => setTimeout(resolve, 20));

const afterSprites = draws.slice(beforeSprites);
const blits = afterSprites.filter(([op]) => op === "drawImage");
const packBlits = blits.filter(([, src]) => src === packed);
assert.ok(packBlits.length > 0, "loading a pack must repaint the room with TinyHouse sprites");
assert.ok(blits.some(([, src]) => src === "data:image/png;base64,BBBB"), "Buddy remains independently rendered while pack art repaints");

// Floor tiles are 64px in the pack and Home draws on a 72px diamond, so the
// pack blits must be scaled, not pasted 1:1. Buddy has its own authored size.
assert.ok(packBlits.every(([, , , , w]) => w === 72), `every pack tile scales to the 72px tile; widths were ${[...new Set(packBlits.map((b) => b[4]))].join(", ")}`);

// The bug this pins: furniture was anchored on its bottom edge and floated
// clear of the floor. Pack art centres the isometric diamond in the image, so
// every pack sprite - floor or furniture - must land on the floor lattice. The
// room is 8x6, so the first 48 pack blits are tiles and anything after is furniture.
const floorBlits = packBlits.slice(0, 48);
const itemBlits = packBlits.slice(48);
assert.equal(floorBlits.length, 48, "every floor tile should blit once");
assert.ok(itemBlits.length > 0, "the starter room's furniture should blit too");

const centre = ([, , x, y, w, h]) => ({ x: x + w / 2, y: y + h / 2 });
const floorCentres = floorBlits.map(centre);
for (const blit of itemBlits) {
  const { x, y } = centre(blit);
  // Nearest tile: a 1x1 piece sits on one, a 2x1 sits on the midpoint of two,
  // so half a tile of slack is the honest bound.
  const near = floorCentres.some((f) => Math.abs(f.x - x) <= 36 && Math.abs(f.y - y) <= 18);
  assert.ok(near, `furniture must sit on the floor lattice, not float above it; blit centre (${x}, ${y})`);
}

// "Near some tile" is weak on its own - the lattice is only 18px apart
// vertically, so a piece shifted a couple of rows still lands near one. This is
// the exact invariant instead: each sprite is drawn immediately after its own
// contact shadow, and the two are placed from the same footprint centre, so
// they must coincide. Anchoring the sprite anywhere else separates them.
for (let index = beforeSprites; index < draws.length; index += 1) {
  if (draws[index][0] !== "drawImage" || draws[index][1] !== packed) continue;
  const blitCentreY = draws[index][3] + draws[index][5] / 2;
  const shadow = draws[index - 1];
  if (shadow?.[0] !== "fill" || !shadow[3]) continue;  // floor tiles have no shadow
  const shadowY = shadow[3][2];
  assert.ok(Math.abs(blitCentreY - shadowY) <= 12,
    `a sprite must sit on its own contact shadow; sprite centre y ${blitCentreY} vs shadow y ${shadowY}`);
}

// home.toy.ball has no counterpart in the pack and must keep its drawn circle.
assert.ok(afterSprites.some(([op]) => op === "fill"), "items with no pack sprite still draw their fallback shape");

console.log("Home Builder plugin contract passed.");
process.exit(0);
