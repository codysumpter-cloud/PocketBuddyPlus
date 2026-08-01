/**
 * Behavior tests for the Pocket Buddy Plus vertical slice: attached-menu
 * ordering, care actions routed through the authoritative host, status snapshot
 * accuracy, durable persistence (round-trip, malformed recovery), dock
 * preference normalization, and attached-menu display clamping.
 *
 * Electron is deliberately not imported: every module under test takes its
 * directory or geometry explicitly.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyBuddyCare,
  buddyNeedOrder,
  createBuddySnapshot,
  createBuddyState,
  selectDominantNeed,
} from "../src/buddy/buddy-core.js";
import { getBuddyMenuItems } from "../src/buddy/buddy-menu.js";
import {
  attachedMenuGap,
  computeAttachedMenuBounds,
  computeDockBounds,
  dockCollapsedThickness,
  dockThickness,
} from "../src/buddy/buddy-layout.js";
import {
  createDefaultBuddyStore,
  getBuddyStoreDir,
  getBuddyStorePath,
  loadBuddyStore,
  normalizeDockPreferences,
  parseBuddyState,
  saveBuddyStore,
} from "../src/buddy/buddy-store.js";

function tempUserData(): string {
  return mkdtempSync(join(tmpdir(), "pbp-store-"));
}

// --- Attached menu ordering contract -----------------------------------------

const expectedOrder = [
  "Pet the bird",
  "Talk to Buddy",
  "Name your Buddy",
  "Buddies",
  "Status",
  "Collection",
  "Notes & Tasks",
  "How Buddy works",
  "Field Guide",
  "Wardrobe",
  "Settings",
];

const withoutQuit = getBuddyMenuItems({ supportsProcessExit: false });
assert.deepEqual(withoutQuit.map((item) => item.label), expectedOrder);

const withQuit = getBuddyMenuItems({ supportsProcessExit: true });
assert.deepEqual(withQuit.map((item) => item.label), [...expectedOrder, "Quit"]);
// Quit must be last and must only appear where process exit is appropriate.
assert.equal(withQuit[withQuit.length - 1].action, "quit");
assert.equal(withoutQuit.some((item) => item.action === "quit"), false);

// --- Pet the bird mutates only the selected Buddy -----------------------------

const selected = createBuddyState({ id: "buddy-a", displayName: "Pip", nowMs: 10_000, affection: 0.4 });
const other = createBuddyState({ id: "buddy-b", displayName: "Nix", nowMs: 10_000, affection: 0.4 });

const petted = applyBuddyCare(selected, "pet", 20_000);
assert.ok(petted.affection > selected.affection, "petting must raise affection");
assert.ok(petted.needs.social < selected.needs.social, "petting must relieve social pressure");
assert.ok(petted.needs.comfort < selected.needs.comfort, "petting must relieve comfort pressure");
assert.equal(petted.activity, "socializing");
assert.equal(petted.lastCareAction, "pet");
assert.equal(petted.id, "buddy-a");
// The other Buddy is untouched: applyBuddyCare is pure and returns a new value.
assert.equal(other.affection, 0.4);
assert.equal(other.activity, "idle");
assert.equal(other.lastCareAction, undefined);

// Affection is clamped, so repeated petting cannot exceed the unit interval.
let saturated = createBuddyState({ id: "buddy-c", nowMs: 0, affection: 0.99 });
for (let i = 0; i < 20; i += 1) saturated = applyBuddyCare(saturated, "pet", 1_000 * (i + 1));
assert.ok(saturated.affection <= 1, "affection must stay within [0,1]");

// --- Status snapshot accuracy -------------------------------------------------

const snapshot = createBuddySnapshot(petted);
assert.equal(snapshot.name, "Pip");
assert.equal(snapshot.mood, petted.mood);
assert.equal(snapshot.activity, petted.activity);
assert.equal(snapshot.affection, petted.affection);
assert.equal(snapshot.dominantNeed, selectDominantNeed(petted.needs));
// Status shows all six need pressures, in the canonical order.
assert.equal(snapshot.drives.length, 6);
assert.deepEqual(snapshot.drives.map((drive) => drive.id), [...buddyNeedOrder]);
for (const drive of snapshot.drives) {
  assert.equal(drive.value, petted.needs[drive.id]);
  assert.ok(drive.label.length > 0, `drive ${drive.id} must have a label`);
  assert.ok(drive.value >= 0 && drive.value <= 1);
}

// --- Persistence round-trip ---------------------------------------------------

{
  const dir = tempUserData();
  const original = createDefaultBuddyStore(50_000);
  const mutated = { ...original, buddy: applyBuddyCare(original.buddy, "pet", 60_000) };
  saveBuddyStore(dir, mutated);

  const reloaded = loadBuddyStore(dir, 70_000, "stamp");
  assert.equal(reloaded.recovered, false);
  assert.equal(reloaded.quarantinePath, null);
  assert.deepEqual(reloaded.store, mutated, "store must round-trip exactly");
  assert.equal(reloaded.store.buddy.lastCareAction, "pet");

  // The atomic write must not leave its temp file behind.
  const leftovers = readdirSync(getBuddyStoreDir(dir)).filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(leftovers, [], "atomic write must clean up its temp file");
}

// --- Invalid save handling: quarantine, never silent data loss ----------------

for (const [label, contents] of [
  ["not json", "{{{not json"],
  ["wrong schema version", JSON.stringify({ schemaVersion: 99, buddy: {}, dock: {} })],
  ["missing needs", JSON.stringify({ schemaVersion: 1, buddy: { schemaVersion: 1, id: "x", displayName: "x", createdAtMs: 0, updatedAtMs: 0, ageMs: 0, affection: 0.5, mood: "content", activity: "idle" }, dock: {} })],
  ["out-of-range affection", JSON.stringify({ ...createDefaultBuddyStore(0), buddy: { ...createDefaultBuddyStore(0).buddy, affection: 4 } })],
] as const) {
  const dir = tempUserData();
  mkdirSync(getBuddyStoreDir(dir), { recursive: true });
  writeFileSync(getBuddyStorePath(dir), contents, "utf8");

  const result = loadBuddyStore(dir, 80_000, "abc");
  assert.equal(result.recovered, true, `${label} must be treated as unreadable`);
  assert.ok(result.quarantinePath, `${label} must be quarantined`);
  // The original bytes must survive under the quarantine name.
  assert.equal(readFileSync(result.quarantinePath as string, "utf8"), contents, `${label} must be preserved, not discarded`);
  // And a usable Buddy must still come back.
  assert.equal(result.store.schemaVersion, 1);
  assert.ok(result.store.buddy.displayName.length > 0);
}

// A missing store is a first run, not a recovery.
{
  const dir = tempUserData();
  const result = loadBuddyStore(dir, 90_000, "stamp");
  assert.equal(result.recovered, false);
  assert.equal(result.quarantinePath, null);
  assert.equal(result.store.buddy.createdAtMs, 90_000);
}

// parseBuddyState rejects hostile shapes outright.
for (const bad of [null, undefined, 42, "x", [], {}, { schemaVersion: 1 }]) {
  assert.equal(parseBuddyState(bad), null, `parseBuddyState must reject ${JSON.stringify(bad)}`);
}

// --- Dock preference normalization -------------------------------------------

assert.deepEqual(normalizeDockPreferences(undefined), { edge: "bottom", collapsed: false });
assert.deepEqual(normalizeDockPreferences({}), { edge: "bottom", collapsed: false });
assert.deepEqual(normalizeDockPreferences({ edge: "left", collapsed: true }), { edge: "left", collapsed: true });
assert.deepEqual(normalizeDockPreferences({ edge: "right", collapsed: false }), { edge: "right", collapsed: false });
// Unknown or hostile values fall back rather than reaching window code.
assert.deepEqual(normalizeDockPreferences({ edge: "top", collapsed: "yes" }), { edge: "bottom", collapsed: false });
assert.deepEqual(normalizeDockPreferences({ edge: 7, collapsed: null }), { edge: "bottom", collapsed: false });
assert.deepEqual(normalizeDockPreferences("left"), { edge: "bottom", collapsed: false });

// --- Attached menu display clamping ------------------------------------------

const workArea = { x: 0, y: 0, width: 1440, height: 900 };
const menu = { width: 236, height: 372 };

// Comfortably in the middle: menu sits to the right of the pet, vertically centred.
{
  const pet = { x: 600, y: 400, width: 120, height: 120 };
  const bounds = computeAttachedMenuBounds(pet, menu, workArea);
  assert.equal(bounds.x, pet.x + pet.width + attachedMenuGap);
  assert.equal(bounds.y, pet.y + 60 - 186);
  assert.equal(bounds.width, menu.width);
  assert.equal(bounds.height, menu.height);
}

// Hard against the right edge: the menu flips to the pet's left instead of
// hanging off-screen.
{
  const pet = { x: 1300, y: 400, width: 120, height: 120 };
  const bounds = computeAttachedMenuBounds(pet, menu, workArea);
  assert.equal(bounds.x, pet.x - attachedMenuGap - menu.width);
  assert.ok(bounds.x >= workArea.x);
  assert.ok(bounds.x + bounds.width <= workArea.x + workArea.width);
}

// Corners and off-screen pets must always yield fully on-screen menus.
const petCandidates = [
  { x: 0, y: 0, width: 120, height: 120 },
  { x: 1420, y: 0, width: 120, height: 120 },
  { x: 0, y: 880, width: 120, height: 120 },
  { x: 1420, y: 880, width: 120, height: 120 },
  { x: -400, y: -400, width: 120, height: 120 },
  { x: 5000, y: 5000, width: 120, height: 120 },
];
for (const pet of petCandidates) {
  const bounds = computeAttachedMenuBounds(pet, menu, workArea);
  assert.ok(bounds.x >= workArea.x, `menu left edge escaped for pet at ${pet.x},${pet.y}`);
  assert.ok(bounds.y >= workArea.y, `menu top edge escaped for pet at ${pet.x},${pet.y}`);
  assert.ok(bounds.x + bounds.width <= workArea.x + workArea.width, `menu right edge escaped for pet at ${pet.x},${pet.y}`);
  assert.ok(bounds.y + bounds.height <= workArea.y + workArea.height, `menu bottom edge escaped for pet at ${pet.x},${pet.y}`);
  assert.ok(Number.isInteger(bounds.x) && Number.isInteger(bounds.y), "bounds must be integral");
}

// A non-zero-origin display (second monitor) must be respected, not assumed to
// start at 0,0.
{
  const secondary = { x: 1440, y: -200, width: 1280, height: 1024 };
  const pet = { x: 2680, y: 700, width: 120, height: 120 };
  const bounds = computeAttachedMenuBounds(pet, menu, secondary);
  assert.ok(bounds.x >= secondary.x);
  assert.ok(bounds.x + bounds.width <= secondary.x + secondary.width);
  assert.ok(bounds.y >= secondary.y);
  assert.ok(bounds.y + bounds.height <= secondary.y + secondary.height);
}

// --- Dock geometry ------------------------------------------------------------

for (const edge of ["bottom", "left", "right"] as const) {
  const expanded = computeDockBounds(edge, false, workArea);
  const collapsed = computeDockBounds(edge, true, workArea);

  for (const bounds of [expanded, collapsed]) {
    assert.ok(bounds.x >= workArea.x, `${edge} dock escaped left`);
    assert.ok(bounds.y >= workArea.y, `${edge} dock escaped top`);
    assert.ok(bounds.x + bounds.width <= workArea.x + workArea.width, `${edge} dock escaped right`);
    assert.ok(bounds.y + bounds.height <= workArea.y + workArea.height, `${edge} dock escaped bottom`);
  }

  // Collapsing must actually shrink the dock so it stops covering the Buddy.
  const expandedThickness = edge === "bottom" ? expanded.height : expanded.width;
  const collapsedThickness = edge === "bottom" ? collapsed.height : collapsed.width;
  assert.equal(expandedThickness, dockThickness);
  assert.equal(collapsedThickness, dockCollapsedThickness);
  assert.ok(collapsedThickness < expandedThickness, `${edge} dock must shrink when collapsed`);
}

// Each edge must actually sit on its edge.
assert.equal(computeDockBounds("left", false, workArea).x, workArea.x);
assert.equal(computeDockBounds("right", false, workArea).x + dockThickness, workArea.x + workArea.width);
assert.equal(computeDockBounds("bottom", false, workArea).y + dockThickness, workArea.y + workArea.height);

console.log("Buddy menu/dock validation passed.");
