/**
 * Cross-runtime wall parity: real Godot InteriorWallModel vs @open-pets/buddy-domain.
 * Runs the Godot emitter headlessly, then diffs with compareParityTraces.
 * Skips loudly (never silently) when Godot or the donor is unavailable.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runWallParityScenario, wallSchemaFacts } from "../../packages/buddy-domain/dist/home/wall-parity.js";
import { compareParityTraces } from "../../packages/buddy-domain/dist/parity/index.js";

const GODOT = process.env.PBP_GODOT_BIN || "/opt/homebrew/bin/godot";
const PROJECT = process.env.PBP_BUDDIES_GODOT_DIR
  || "/Users/prismtek/Prismtek/active/prismtek-apps/apps/prismtek-buddies-godot";
const available = existsSync(GODOT) && existsSync(join(PROJECT, "project.godot"));
if (!available) console.warn(`\n!! WALL PARITY NOT VERIFIED: godot=${existsSync(GODOT)} project=${PROJECT}\n`);

function godotTrace() {
  const out = join(mkdtempSync(join(tmpdir(), "pbp-wall-")), "trace.json");
  execFileSync(GODOT, ["--headless", "--path", PROJECT, "--script", "tools/emit_wall_parity_trace.gd"], {
    env: { ...process.env, PBP_TRACE_OUT: out }, stdio: "pipe", encoding: "utf8",
  });
  return JSON.parse(readFileSync(out, "utf8"));
}

// Every donor step is now ported and compared. Kept as an explicit empty set so
// that re-introducing a gap is a visible edit rather than a silent omission.
const UNPORTED_OPS = new Set([]);

test("Godot and TypeScript agree on canonical camera-corner wall facts", { skip: !available }, () => {
  const godot = godotTrace();
  const ts = runWallParityScenario();

  const comparable = { ...godot, steps: godot.steps.filter((s) => !UNPORTED_OPS.has(s.input?.op)) };
  assert.equal(comparable.steps.length, ts.steps.length,
    `step count differs: godot ${comparable.steps.length} vs ts ${ts.steps.length}`);

  const mismatches = compareParityTraces(comparable, ts, { ignoredPathPrefixes: ["$.implementation", "$.donor"] });
  assert.deepEqual(mismatches, [],
    `cross-runtime wall differences:\n  ${mismatches.slice(0, 15).map((m) => `${m.path}: godot=${JSON.stringify(m.expected)} ts=${JSON.stringify(m.actual)}`).join("\n  ")}`);
  console.log(`  wall parity OK across ${ts.steps.length} wall-model steps`);
});

test("cutaway mode vocabulary matches the donor", { skip: !available }, () => {
  const godot = godotTrace();
  const cutawayStep = godot.steps.find((s) => s.input?.op === "cutawayPresentation");
  assert.ok(cutawayStep, "emitter must publish cutaway modes");
  const godotModes = Object.keys(cutawayStep.snapshot).filter((k) => !k.startsWith("__")).sort();
  assert.deepEqual(wallSchemaFacts().cutawayModes, godotModes,
    "a save written by one runtime would be rejected by the other");
});

test("wall save keys match the donor's save_key()", { skip: !available }, () => {
  const godot = godotTrace();
  const godotSaveKeys = Object.values(godot.steps[0].snapshot.saveKeys).sort();
  assert.deepEqual(wallSchemaFacts().wallSaveKeys, godotSaveKeys);
});
