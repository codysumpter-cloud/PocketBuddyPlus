// SPDX-License-Identifier: LGPL-2.1-or-later
//
// Parity tests for the openc2e-derived chemical pool port. Expectations are
// transcribed from the donor GDScript (buddy_biology_chemical_pool.gd) and from
// the C2e half-life equation openc2e documents, NOT from this TypeScript
// implementation, so a behavioural drift fails rather than being blessed.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ADP_ID,
  ATP_ID,
  BuddyBiologyChemicalPool,
  CHEMICAL_COUNT,
  INJURY_ID,
  PUNISHMENT_ID,
  REWARD_ID,
} from "../src/chemical-pool.js";

test("C2e loci match openc2e's hard-coded ids", () => {
  assert.equal(CHEMICAL_COUNT, 256);
  assert.equal(ATP_ID, 35);
  assert.equal(ADP_ID, 36);
  assert.equal(INJURY_ID, 127);
  assert.equal(REWARD_ID, 78);
  assert.equal(PUNISHMENT_ID, 79);
});

test("fresh pool is empty with long-lived (255) half-lives", () => {
  const pool = new BuddyBiologyChemicalPool();
  for (let id = 0; id < CHEMICAL_COUNT; id += 1) {
    assert.equal(pool.concentration(id), 0, `concentration ${id}`);
    assert.equal(pool.halfLife(id), 255, `half-life ${id}`);
  }
});

test("concentrations clamp to [0,1]; out-of-range ids are inert", () => {
  const pool = new BuddyBiologyChemicalPool();
  pool.setConcentration(ATP_ID, 5);
  assert.equal(pool.concentration(ATP_ID), 1);
  pool.setConcentration(ATP_ID, -5);
  assert.equal(pool.concentration(ATP_ID), 0);
  for (const bad of [-1, CHEMICAL_COUNT, 999, 1.5]) {
    pool.setConcentration(bad, 1);
    assert.equal(pool.concentration(bad), 0, `id ${bad} must be rejected`);
  }
});

test("decay follows the C2e half-life equation used by openc2e", () => {
  // rate = 1 - 0.5 ** (1 / 2.2 ** (encoded * 32 / 255))
  // Encoded rate is INVERSE to speed: 255 is long-lived, small values decay fast.
  // 128 decays by ~2e-6 per tick, which would make this assertion vacuous, so a
  // fast value is used to actually exercise the equation.
  const encoded = 10;
  const pool = new BuddyBiologyChemicalPool();
  pool.setHalfLife(ATP_ID, encoded);
  pool.setConcentration(ATP_ID, 1);
  pool.tickHalfLives(1);

  const exponent = (encoded * 32) / 255;
  const rate = 1 - Math.pow(0.5, 1 / Math.pow(2.2, exponent));
  const expected = Math.fround(1 - 1 * rate);
  assert.ok(Math.abs(pool.concentration(ATP_ID) - expected) < 1e-6, `got ${pool.concentration(ATP_ID)} want ${expected}`);
});

test("a zero half-life clears the chemical rather than decaying it", () => {
  const pool = new BuddyBiologyChemicalPool();
  pool.setConcentration(ATP_ID, 1);
  pool.setHalfLife(ATP_ID, 0);
  pool.tickHalfLives(1);
  assert.equal(pool.concentration(ATP_ID), 0);
});

test("chemical 0 is a sentinel and never decays", () => {
  const pool = new BuddyBiologyChemicalPool();
  pool.setConcentration(0, 1);
  pool.setHalfLife(0, 1);
  pool.tickHalfLives(50);
  assert.equal(pool.concentration(0), 1, "donor loop starts at id 1");
});

test("encoded half-life is inverse to decay speed (255 long-lived, low = fast)", () => {
  const fast = new BuddyBiologyChemicalPool();
  const slow = new BuddyBiologyChemicalPool();
  fast.setHalfLife(ATP_ID, 10);
  slow.setHalfLife(ATP_ID, 255);
  fast.setConcentration(ATP_ID, 1);
  slow.setConcentration(ATP_ID, 1);
  fast.tickHalfLives(1);
  slow.tickHalfLives(1);
  assert.ok(fast.concentration(ATP_ID) < slow.concentration(ATP_ID), "low encoding must decay faster");
  assert.equal(slow.concentration(ATP_ID), 1, "255 is effectively non-decaying per tick");
});

test("half-life encoding clamps to 0..255", () => {
  const pool = new BuddyBiologyChemicalPool();
  pool.setHalfLife(ATP_ID, 9999);
  assert.equal(pool.halfLife(ATP_ID), 255);
  pool.setHalfLife(ATP_ID, -20);
  assert.equal(pool.halfLife(ATP_ID), 0);
});

test("stepping is iterative: N steps equals N single steps", () => {
  const a = new BuddyBiologyChemicalPool();
  const b = new BuddyBiologyChemicalPool();
  for (const pool of [a, b]) {
    pool.setHalfLife(ATP_ID, 100);
    pool.setConcentration(ATP_ID, 1);
  }
  a.tickHalfLives(7);
  for (let i = 0; i < 7; i += 1) b.tickHalfLives(1);
  assert.equal(a.concentration(ATP_ID), b.concentration(ATP_ID));
});

test("non-positive step counts are a no-op (donor max(steps,0))", () => {
  const pool = new BuddyBiologyChemicalPool();
  pool.setHalfLife(ATP_ID, 100);
  pool.setConcentration(ATP_ID, 0.5);
  const before = pool.concentration(ATP_ID);
  pool.tickHalfLives(0);
  pool.tickHalfLives(-99);
  assert.equal(pool.concentration(ATP_ID), before);
});

test("reward and punishment linger and decay like any other chemical", () => {
  // The donor's rationale: they are chemicals, not arguments, so credit reaches
  // wiring that fired shortly BEFORE the outcome.
  const pool = new BuddyBiologyChemicalPool();
  pool.setHalfLife(REWARD_ID, 10); // fast-decaying, so lingering is observable
  pool.setConcentration(REWARD_ID, 1);
  pool.tickHalfLives(1);
  const after = pool.concentration(REWARD_ID);
  assert.ok(after > 0 && after < 1, `reward must persist but decay, got ${after}`);
  // ...and still be present several ticks later, which is what lets credit reach
  // wiring that fired before the outcome.
  pool.tickHalfLives(3);
  assert.ok(pool.concentration(REWARD_ID) > 0, "reward must not vanish in one step");
});

test("round-trips through the serialized form", () => {
  const pool = new BuddyBiologyChemicalPool();
  pool.setConcentration(ATP_ID, 0.75);
  pool.setHalfLife(INJURY_ID, 12);
  const restored = BuddyBiologyChemicalPool.fromData(pool.toData());
  assert.ok(Math.abs(restored.concentration(ATP_ID) - 0.75) < 1e-6);
  assert.equal(restored.halfLife(INJURY_ID), 12);
});

test("malformed payloads degrade to a fresh pool rather than throwing", () => {
  for (const bad of [null, undefined, 42, "x", [], { concentrations: "nope" }]) {
    const restored = BuddyBiologyChemicalPool.fromData(bad);
    assert.equal(restored.concentration(ATP_ID), 0);
    assert.equal(restored.halfLife(ATP_ID), 255);
  }
});
