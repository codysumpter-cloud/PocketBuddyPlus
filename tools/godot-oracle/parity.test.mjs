/**
 * Cross-runtime parity: real Godot donor vs the TypeScript port.
 * Skips (does not fail) when Godot or the donor package is unavailable, so the
 * suite still runs on machines without them -- but reports loudly that parity
 * was NOT verified, so a skip can never be mistaken for a pass.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";

import { generateOracle, replayFixture, diffFixture } from "./run-oracle.mjs";
import { BuddyBiologyChemicalPool } from "../../packages/buddy-life-lgpl/dist/chemical-pool.js";

const GODOT = process.env.PBP_GODOT_BIN || "/opt/homebrew/bin/godot";
const DONOR = process.env.PBP_BUDDY_CORE_DIR || "/Users/prismtek/Prismtek/prismtek-apps/packages/godot/prismtek-buddy-core";
const available = existsSync(GODOT) && existsSync(DONOR);

if (!available) {
  console.warn(`\n!! CROSS-RUNTIME PARITY NOT VERIFIED: godot=${existsSync(GODOT)} donor=${existsSync(DONOR)}\n`);
}

test("Godot donor and TypeScript port agree on every chemical slot", { skip: !available }, () => {
  const oracle = generateOracle();
  assert.equal(oracle.schema, "pbp-chemical-pool-oracle-v1");
  assert.ok(oracle.fixtures.length >= 20, `expected >=20 fixtures, got ${oracle.fixtures.length}`);

  const allDiffs = [];
  for (const fixture of oracle.fixtures) {
    const actual = replayFixture(BuddyBiologyChemicalPool, fixture);
    allDiffs.push(...diffFixture(fixture, actual));
  }
  assert.deepEqual(allDiffs, [], `cross-runtime differences:\n  ${allDiffs.slice(0, 20).join("\n  ")}`);
  console.log(`  cross-runtime parity OK across ${oracle.fixtures.length} fixtures x 256 slots (Godot ${oracle.godot_version.string})`);
});

test("batched and iterated advancement agree in BOTH runtimes", { skip: !available }, () => {
  const oracle = generateOracle();
  const batched = oracle.fixtures.find((f) => f.fixture === "replay_batched");
  const iterated = oracle.fixtures.find((f) => f.fixture === "replay_iterated");
  assert.ok(batched && iterated);
  assert.deepEqual(batched.concentrations, iterated.concentrations, "donor tick size must not matter");
  const tsBatched = replayFixture(BuddyBiologyChemicalPool, batched);
  const tsIterated = replayFixture(BuddyBiologyChemicalPool, iterated);
  assert.deepEqual(tsBatched.concentrations, tsIterated.concentrations, "port tick size must not matter");
});
