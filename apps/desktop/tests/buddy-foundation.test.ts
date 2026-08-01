import assert from "node:assert/strict";

import {
  advanceBuddyState,
  applyBuddyCare,
  createBuddySnapshot,
  createBuddyState,
  selectDominantNeed,
} from "../src/buddy/buddy-core.js";
import { getBuddyMenuItems } from "../src/buddy/buddy-menu.js";

const initial = createBuddyState({
  id: "pip-001",
  displayName: "Pip",
  nowMs: 1_000,
  affection: 0.4,
  needs: {
    hunger: 0.72,
    energy: 0.18,
    social: 0.2,
    play: 0.15,
    comfort: 0.1,
    cleanliness: 0.08,
  },
});

assert.equal(initial.id, "pip-001");
assert.equal(initial.displayName, "Pip");
assert.equal(initial.mood, "hungry");
assert.equal(selectDominantNeed(initial.needs), "hunger");

const oneHourLater = advanceBuddyState(initial, 3_600_000);
assert.equal(oneHourLater.ageMs, 3_600_000);
assert.equal(oneHourLater.updatedAtMs, 3_601_000);
assert.ok(oneHourLater.needs.hunger > initial.needs.hunger);
assert.ok(oneHourLater.needs.energy > initial.needs.energy);
assert.equal(initial.ageMs, 0, "advancing must not mutate the previous state");

const sleeping = advanceBuddyState(oneHourLater, 3_600_000, "sleeping");
assert.ok(sleeping.needs.energy < oneHourLater.needs.energy, "sleeping should relieve rest pressure");
assert.equal(sleeping.activity, "sleeping");

const fed = applyBuddyCare(oneHourLater, "feed", oneHourLater.updatedAtMs + 500);
assert.ok(fed.needs.hunger < oneHourLater.needs.hunger);
assert.ok(fed.affection > oneHourLater.affection);
assert.equal(fed.activity, "eating");
assert.equal(fed.lastCareAction, "feed");

const petted = applyBuddyCare(oneHourLater, "pet");
assert.ok(petted.needs.social < oneHourLater.needs.social);
assert.ok(petted.needs.comfort < oneHourLater.needs.comfort);
assert.equal(petted.activity, "socializing");

const snapshot = createBuddySnapshot(fed);
assert.equal(snapshot.id, "pip-001");
assert.equal(snapshot.name, "Pip");
assert.deepEqual(snapshot.drives.map((drive) => drive.id), [
  "hunger",
  "energy",
  "social",
  "play",
  "comfort",
  "cleanliness",
]);
assert.deepEqual(snapshot.drives.map((drive) => drive.label), [
  "Hunger",
  "Rest",
  "Company",
  "Play",
  "Comfort",
  "Cleanliness",
]);

assert.throws(() => createBuddyState({ id: "   ", nowMs: 0 }), /id must not be empty/);
assert.throws(() => advanceBuddyState(initial, -1), /elapsedMs must be a finite non-negative number/);
assert.throws(() => applyBuddyCare(initial, "pet", 999), /nowMs must not move backwards/);

const expectedMenuLabels = [
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
assert.deepEqual(
  getBuddyMenuItems({ supportsProcessExit: false }).map((item) => item.label),
  expectedMenuLabels,
  "the Pocket Buddy click menu is a product contract, not a redesign opportunity",
);
assert.deepEqual(
  getBuddyMenuItems({ supportsProcessExit: true }).map((item) => item.label),
  [...expectedMenuLabels, "Quit"],
);

console.error("Pocket Buddy Plus foundation validation passed.");
