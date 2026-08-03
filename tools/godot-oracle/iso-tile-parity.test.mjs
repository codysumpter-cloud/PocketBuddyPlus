/**
 * Cross-runtime isometric tile parity: real Godot TileMapLayer vs the port.
 *
 * The Godot side configures a TileMapLayer exactly like the TinyHouse tilesets
 * and records the ENGINE's own map_to_local output, so this diffs the port
 * against Godot's isometric math rather than against a second derivation of it.
 *
 * Skips loudly (never silently) when Godot or the donor is unavailable.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runIsoTileParityScenario } from "../../packages/buddy-domain/dist/home/iso-tiles.js";
import { compareParityTraces } from "../../packages/buddy-domain/dist/parity/index.js";

const GODOT = process.env.PBP_GODOT_BIN || "/opt/homebrew/bin/godot";
const PROJECT = process.env.PBP_BUDDIES_GODOT_DIR
  || "/Users/prismtek/Prismtek/active/prismtek-apps/apps/prismtek-buddies-godot";
const available = existsSync(GODOT) && existsSync(join(PROJECT, "project.godot"));
if (!available) console.warn(`\n!! ISO TILE PARITY NOT VERIFIED: godot=${existsSync(GODOT)} project=${PROJECT}\n`);

function godotTrace() {
  const out = join(mkdtempSync(join(tmpdir(), "pbp-iso-")), "trace.json");
  execFileSync(GODOT, ["--headless", "--path", PROJECT, "--script", "tools/emit_iso_tile_trace.gd"], {
    env: { ...process.env, PBP_TRACE_OUT: out }, stdio: "pipe", encoding: "utf8",
  });
  return JSON.parse(readFileSync(out, "utf8"));
}

test("Godot and TypeScript agree on isometric tile mapping", { skip: !available }, () => {
  const godot = godotTrace();
  const ts = runIsoTileParityScenario(5, 3);

  assert.equal(godot.scenarioId, ts.scenarioId, "scenario ids must match");
  assert.equal(godot.steps.length, ts.steps.length, "every donor step must be ported");

  const mismatches = compareParityTraces(
    { ...godot, schema: "prismtek-parity-trace-v1" },
    { ...ts, schema: "prismtek-parity-trace-v1", donor: godot.donor, implementation: "@open-pets/buddy-domain", seed: 1 },
    { ignoredPathPrefixes: ["$.implementation", "$.donor"] },
  );

  assert.deepEqual(
    mismatches.map((entry) => `${entry.path}: godot=${JSON.stringify(entry.expected)} ts=${JSON.stringify(entry.actual)}`),
    [],
  );
  console.log(`  iso tile parity OK across ${ts.steps.length} steps (${godot.implementation})`);
});
