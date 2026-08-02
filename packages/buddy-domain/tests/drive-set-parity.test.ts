/**
 * Parity tests for the BuddyDriveSet port.
 *
 * Every expectation is transcribed from the donor GDScript
 * (prismtek-buddy-core/addons/prismtek_buddy_core/creature/buddy_drive_set.gd),
 * not from the TypeScript implementation. If the port drifts from donor
 * behaviour these fail, which is the point: a similarly named class is not
 * parity.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BuddyDriveSet,
  DEFAULT_DRIFT_PER_SECOND,
  DEFAULT_PRESSURES,
  DRIVE_KEYS,
} from "../src/drive-set.js";

test("drive keys match the donor set exactly, in order", () => {
  assert.deepEqual([...DRIVE_KEYS], [
    "hunger", "energy", "comfort", "safety", "boredom", "curiosity",
    "affection", "social", "accomplishment", "cleanliness", "focus",
  ]);
});

test("default pressures are the donor values", () => {
  const drives = new BuddyDriveSet();
  const expected: Record<string, number> = {
    hunger: 0.15, energy: 0.10, comfort: 0.10, safety: 0.05, boredom: 0.20,
    curiosity: 0.25, affection: 0.15, social: 0.15, accomplishment: 0.20,
    cleanliness: 0.05, focus: 0.15,
  };
  for (const key of DRIVE_KEYS) {
    assert.equal(drives.pressure(key), expected[key], `pressure ${key}`);
    assert.equal(DEFAULT_PRESSURES[key], expected[key], `constant ${key}`);
  }
});

test("default drift rates are the donor values, and safety alone is negative", () => {
  const expected: Record<string, number> = {
    hunger: 0.0008, energy: 0.0006, comfort: 0.0002, safety: -0.0001,
    boredom: 0.0010, curiosity: 0.0005, affection: 0.0003, social: 0.0004,
    accomplishment: 0.0003, cleanliness: 0.0002, focus: 0.0004,
  };
  for (const key of DRIVE_KEYS) assert.equal(DEFAULT_DRIFT_PER_SECOND[key], expected[key], key);
  const negative = DRIVE_KEYS.filter((k) => DEFAULT_DRIFT_PER_SECOND[k] < 0);
  assert.deepEqual(negative, ["safety"], "only safety recovers on its own");
});

test("positive relief satisfies a need (donor sign convention)", () => {
  const drives = new BuddyDriveSet();
  drives.setPressure("hunger", 0.8);
  drives.applyRelief({ hunger: 0.3 });
  assert.ok(Math.abs(drives.pressure("hunger") - 0.5) < 1e-12);
  // Negative relief is an action cost and raises the pressure.
  drives.applyRelief({ hunger: -0.2 });
  assert.ok(Math.abs(drives.pressure("hunger") - 0.7) < 1e-12);
});

test("drift is deterministic and linear in elapsed seconds", () => {
  const a = new BuddyDriveSet();
  const b = new BuddyDriveSet();
  a.applyDrift(600);
  for (let i = 0; i < 600; i += 1) b.applyDrift(1);
  for (const key of DRIVE_KEYS) {
    assert.ok(Math.abs(a.pressure(key) - b.pressure(key)) < 1e-9, `${key} must not depend on tick size`);
  }
  // 600s of hunger drift at 0.0008/s on top of the 0.15 default.
  assert.ok(Math.abs(a.pressure("hunger") - (0.15 + 600 * 0.0008)) < 1e-9);
});

test("negative elapsed time cannot rewind the simulation", () => {
  const drives = new BuddyDriveSet();
  const before = drives.toData().pressures;
  drives.applyDrift(-3600);
  assert.deepEqual(drives.toData().pressures, before);
});

test("pressures clamp to [0,1] and unknown keys are ignored", () => {
  const drives = new BuddyDriveSet();
  drives.setPressure("hunger", 9);
  assert.equal(drives.pressure("hunger"), 1);
  drives.setPressure("hunger", -9);
  assert.equal(drives.pressure("hunger"), 0);
  drives.setPressure("not_a_drive", 0.5);
  assert.equal(drives.pressure("not_a_drive"), 0);
});

test("most_urgent sorts by pressure desc, ties by drive name asc", () => {
  const drives = new BuddyDriveSet();
  for (const key of DRIVE_KEYS) drives.setPressure(key, 0.5);
  drives.setPressure("focus", 0.9);
  const top = drives.mostUrgent(3);
  assert.equal(top[0].drive, "focus");
  // Remaining are all 0.5, so alphabetical: accomplishment, affection, ...
  assert.deepEqual(top.slice(1).map((r) => r.drive), ["accomplishment", "affection"]);
  assert.equal(drives.mostUrgent(0).length, 0);
  assert.equal(drives.mostUrgent(999).length, DRIVE_KEYS.length);
});

test("urgency average is the mean across all drives", () => {
  const drives = new BuddyDriveSet();
  for (const key of DRIVE_KEYS) drives.setPressure(key, 0.4);
  assert.ok(Math.abs(drives.urgencyAverage() - 0.4) < 1e-12);
});

test("round-trips through the donor dictionary shape", () => {
  const drives = new BuddyDriveSet();
  drives.setPressure("boredom", 0.77);
  const restored = BuddyDriveSet.fromData(drives.toData());
  assert.equal(restored.pressure("boredom"), 0.77);
  assert.equal(restored.drift("safety"), -0.0001);
});

test("legacy saves without a pressures member still load (donor fallback)", () => {
  // The donor does `data.get("pressures", data)`, so a bare pressure map loads.
  const restored = BuddyDriveSet.fromData({ hunger: 0.9, focus: 0.1 });
  assert.equal(restored.pressure("hunger"), 0.9);
  assert.equal(restored.pressure("focus"), 0.1);
  assert.equal(restored.pressure("boredom"), 0.2, "unspecified drives fall back to defaults");
});

test("malformed payloads degrade to defaults rather than throwing", () => {
  for (const bad of [null, undefined, 42, "x", []]) {
    const restored = BuddyDriveSet.fromData(bad);
    assert.equal(restored.pressure("hunger"), 0.15);
  }
});
