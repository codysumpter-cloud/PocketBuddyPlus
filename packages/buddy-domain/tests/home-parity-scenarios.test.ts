/**
 * Home parity scenario runner.
 *
 * These prove the TypeScript half of the harness is usable as a reference: the
 * traces are schema-valid, deterministic, cover the behaviour a Godot emitter
 * must reproduce, and — critically — that `compareParityTraces` actually
 * DETECTS a divergence. A comparator that has only ever been shown agreeing with
 * itself is not evidence.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HOME_PARITY_SCENARIOS,
  runAllHomeScenarios,
  runHomeScenario,
} from "../src/home/parity-scenarios.js";
import { PARITY_TRACE_SCHEMA, compareParityTraces } from "../src/parity/index.js";
import { CAMERA_CORNERS } from "../src/home/room-document.js";

test("every scenario produces a schema-valid trace", () => {
  for (const trace of runAllHomeScenarios()) {
    assert.equal(trace.schema, PARITY_TRACE_SCHEMA);
    assert.ok(trace.scenarioId.startsWith("home."), trace.scenarioId);
    assert.ok(trace.steps.length > 0, `${trace.scenarioId} has no steps`);
    // Trace time must be monotonic or the comparator rejects it outright.
    for (let i = 1; i < trace.steps.length; i += 1) {
      assert.ok(trace.steps[i].atMs > trace.steps[i - 1].atMs, `${trace.scenarioId} step ${i} not monotonic`);
    }
  }
});

test("running the same scenario twice is byte-identical", () => {
  for (const scenario of HOME_PARITY_SCENARIOS) {
    const a = runHomeScenario(scenario);
    const b = runHomeScenario(scenario);
    assert.deepEqual(a, b, `${scenario.scenarioId} is not deterministic`);
    assert.equal(compareParityTraces(a, b).length, 0);
  }
});

test("all four camera corners are exercised and change presented geometry", () => {
  const trace = runHomeScenario(HOME_PARITY_SCENARIOS.find((s) => s.scenarioId === "home.room.cameraCorners")!);
  const seen = new Set<string>();
  for (const step of trace.steps) {
    const snapshot = step.snapshot as Record<string, unknown>;
    if (typeof snapshot.cameraCorner === "string") seen.add(snapshot.cameraCorner);
  }
  for (const cameraCorner of CAMERA_CORNERS) {
    assert.ok(seen.has(cameraCorner), `cameraCorner ${cameraCorner} never appears`);
  }
  // A 5x3 room must present as 3x5 when rotated a quarter turn, or the
  // projection is not camera-corner-aware.
  const presented = trace.steps.map((s) => {
    const p = (s.snapshot as Record<string, unknown>).presented as { width: number; height: number };
    return `${p.width}x${p.height}`;
  });
  assert.ok(new Set(presented).size > 1, "presented size never changed across cameraCorners");
});

test("rotating four quarter turns returns to the starting cameraCorner", () => {
  const trace = runHomeScenario(HOME_PARITY_SCENARIOS.find((s) => s.scenarioId === "home.room.rotation-closure")!);
  const first = (trace.steps[0].snapshot as Record<string, unknown>).cameraCorner;
  const last = (trace.steps[trace.steps.length - 1].snapshot as Record<string, unknown>).cameraCorner;
  assert.equal(last, first, "four rotations must close the loop");
});

test("every placement rejection reason is covered", () => {
  const trace = runHomeScenario(HOME_PARITY_SCENARIOS.find((s) => s.scenarioId === "home.placement.rejections")!);
  const reasons = new Set<string>();
  for (const step of trace.steps) {
    for (const event of step.events) {
      const e = event as Record<string, unknown>;
      if (e.type === "item.rejected" && typeof e.reason === "string") reasons.add(e.reason);
    }
  }
  for (const expected of ["occupied", "outside-room", "duplicate-id", "missing-support"]) {
    assert.ok(reasons.has(expected), `rejection reason "${expected}" is not exercised`);
  }
});

test("removing a support cascades to the supported item", () => {
  const trace = runHomeScenario(HOME_PARITY_SCENARIOS.find((s) => s.scenarioId === "home.placement.support-cascade")!);
  const final = trace.steps[trace.steps.length - 1].snapshot as Record<string, unknown>;
  const items = final.items as { id: string }[];
  assert.equal(items.length, 0, "support removal must cascade, leaving no orphan");
});

test("the comparator detects a real divergence, not just agreement", () => {
  // Negative control. Without this the suite would pass even if
  // compareParityTraces always returned an empty array.
  const trace = runHomeScenario(HOME_PARITY_SCENARIOS[3]);
  const tampered = structuredClone(trace) as unknown as {
    steps: { snapshot: Record<string, unknown> }[];
  };
  tampered.steps[1].snapshot.revision = 9999;

  const mismatches = compareParityTraces(trace, tampered as never);
  assert.ok(mismatches.length > 0, "a changed snapshot value must be reported");
  assert.ok(
    mismatches.some((m) => m.path.includes("revision")),
    `mismatch path should name the field, got ${mismatches.map((m) => m.path).join(", ")}`,
  );
});

test("the comparator detects divergent event ordering", () => {
  const trace = runHomeScenario(HOME_PARITY_SCENARIOS[4]);
  const stepWithEvent = trace.steps.findIndex((s) => s.events.length > 0);
  assert.ok(stepWithEvent >= 0);

  const tampered = structuredClone(trace) as unknown as {
    steps: { events: Record<string, unknown>[] }[];
  };
  tampered.steps[stepWithEvent].events[0].type = "item.somethingElse";

  const mismatches = compareParityTraces(trace, tampered as never);
  assert.ok(mismatches.length > 0, "a changed event must be reported");
});

test("scenario ids are unique so Godot emitters cannot collide", () => {
  const ids = HOME_PARITY_SCENARIOS.map((s) => s.scenarioId);
  assert.equal(new Set(ids).size, ids.length);
});
