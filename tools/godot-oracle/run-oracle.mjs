#!/usr/bin/env node
/**
 * Golden cross-runtime parity: real Godot donor vs the TypeScript port.
 *
 * This executes BOTH runtimes. Tests that only assert constants read out of the
 * donor source are not parity -- they cannot catch a translation error. This can.
 *
 * 1. copy the donor package into an isolated temp Godot project
 * 2. run the donor headlessly, emitting canonical JSON fixtures
 * 3. replay the identical fixtures against packages/buddy-life-lgpl
 * 4. deep-compare every one of the 256 chemical slots and half-lives
 *
 * The donor is LGPL-2.1-or-later. Running it as an oracle is *use*, not
 * distribution of a derivative, so no licence obligation attaches to this script.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const GODOT = process.env.PBP_GODOT_BIN || "/opt/homebrew/bin/godot";
const DONOR =
  process.env.PBP_BUDDY_CORE_DIR ||
  "/Users/prismtek/Prismtek/prismtek-apps/packages/godot/prismtek-buddy-core";

/** Float32 storage means the donor's values are single precision. */
const TOLERANCE = 1e-6;

export function generateOracle() {
  if (!existsSync(GODOT)) throw new Error(`Godot not found at ${GODOT} (set PBP_GODOT_BIN)`);
  if (!existsSync(DONOR)) throw new Error(`donor package not found at ${DONOR} (set PBP_BUDDY_CORE_DIR)`);

  const project = mkdtempSync(join(tmpdir(), "pbp-oracle-"));
  cpSync(join(DONOR, "addons"), join(project, "addons"), { recursive: true });
  cpSync(join(DONOR, "project.godot"), join(project, "project.godot"));
  cpSync(join(here, "chemical_pool_oracle.gd"), join(project, "chemical_pool_oracle.gd"));

  const out = join(project, "oracle.json");
  execFileSync(GODOT, ["--headless", "--path", project, "--script", "chemical_pool_oracle.gd"], {
    env: { ...process.env, PBP_ORACLE_OUT: out },
    stdio: "pipe",
    encoding: "utf8",
  });
  if (!existsSync(out)) throw new Error("oracle produced no output");
  return JSON.parse(readFileSync(out, "utf8"));
}

/** Replays a donor fixture against the TypeScript port and returns its state. */
export function replayFixture(Pool, fixture) {
  const name = fixture.fixture;
  const pool = new Pool();

  if (name === "named_loci_set") {
    for (const [id, value] of [[35, 0.9], [36, 0.4], [78, 0.7], [79, 0.3], [127, 0.55], [0, 1.0]]) {
      pool.setConcentration(id, value);
    }
  } else if (name === "clamping") {
    pool.setConcentration(35, 5);
    pool.setConcentration(36, -5);
    pool.setHalfLife(35, 9999);
    pool.setHalfLife(36, -20);
  } else if (name.startsWith("halflife_encoded_")) {
    const encoded = Number(fixture.inputs.encoded);
    for (let id = 1; id < 256; id += 1) {
      pool.setHalfLife(id, encoded);
      pool.setConcentration(id, 1);
    }
    pool.setConcentration(0, 1);
    pool.tickHalfLives(1);
  } else if (name.startsWith("multi_step_")) {
    pool.setHalfLife(35, 10);
    pool.setConcentration(35, 1);
    pool.tickHalfLives(Number(fixture.inputs.steps));
  } else if (name === "negative_steps") {
    pool.setHalfLife(35, 10);
    pool.setConcentration(35, 0.5);
    pool.tickHalfLives(-99);
  } else if (name === "save_load_roundtrip") {
    const source = new Pool();
    source.setConcentration(35, 0.75);
    source.setHalfLife(127, 12);
    const restored = Pool.fromData(source.toData());
    return { concentrations: restored.toData().concentrations, half_lives: restored.toData().half_lives };
  } else if (name === "replay_batched") {
    pool.setHalfLife(35, 33);
    pool.setConcentration(35, 1);
    pool.tickHalfLives(9);
  } else if (name === "replay_iterated") {
    pool.setHalfLife(35, 33);
    pool.setConcentration(35, 1);
    for (let i = 0; i < 9; i += 1) pool.tickHalfLives(1);
  } else if (name !== "defaults") {
    throw new Error(`no replay defined for fixture "${name}"`);
  }

  const data = pool.toData();
  return { concentrations: data.concentrations, half_lives: data.half_lives };
}

/** Deep-compares one fixture. Returns an array of human-readable differences. */
export function diffFixture(fixture, actual) {
  const diffs = [];
  for (let id = 0; id < 256; id += 1) {
    const want = Number(fixture.concentrations[id]);
    const got = Number(actual.concentrations[id]);
    if (Math.abs(want - got) > TOLERANCE) {
      diffs.push(`${fixture.fixture}: concentration[${id}] godot=${want} ts=${got} (delta ${Math.abs(want - got)})`);
    }
    const wantHl = Number(fixture.half_lives[id]);
    const gotHl = Number(actual.half_lives[id]);
    if (wantHl !== gotHl) {
      diffs.push(`${fixture.fixture}: half_life[${id}] godot=${wantHl} ts=${gotHl}`);
    }
  }
  return diffs;
}

if (process.argv[1] && process.argv[1].endsWith("run-oracle.mjs")) {
  const oracle = generateOracle();
  console.log(JSON.stringify(oracle, null, 2));
}
