import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertParityTraces,
  compareParityTraces,
  createParityTrace,
} from "../src/parity/index.js";

function trace(implementation: string, hunger = 0.5, events: readonly string[] = ["eat", "sleep"]) {
  return createParityTrace({
    scenarioId: "first-playable-day",
    donor: "prismtek-apps@godot",
    implementation,
    seed: 90210,
    steps: [
      {
        atMs: 0,
        input: { action: "tick", elapsed: 1 },
        snapshot: { drives: { hunger }, room: { revision: 3 } },
        events,
      },
    ],
  });
}

test("trace comparison ignores implementation identity and tolerates numeric noise", () => {
  const mismatches = compareParityTraces(trace("godot", 0.5), trace("typescript", 0.5000000001), {
    numberEpsilon: 1e-8,
  });
  assert.deepEqual(mismatches, []);
});

test("trace comparison names the exact divergent state path", () => {
  const mismatches = compareParityTraces(trace("godot", 0.5), trace("typescript", 0.7));
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.path, "$.steps[0].snapshot.drives.hunger");
  assert.equal(mismatches[0]?.reason, "value");
});

test("event ordering is observable behavior and therefore part of parity", () => {
  const mismatches = compareParityTraces(
    trace("godot", 0.5, ["eat", "sleep"]),
    trace("typescript", 0.5, ["sleep", "eat"]),
  );
  assert.deepEqual(mismatches.map((entry) => entry.path), [
    "$.steps[0].events[0]",
    "$.steps[0].events[1]",
  ]);
});

test("assertParityTraces gives a compact actionable failure", () => {
  assert.throws(
    () => assertParityTraces(trace("godot", 0.5), trace("typescript", 0.7)),
    /snapshot\.drives\.hunger/,
  );
});

test("trace construction rejects non-monotonic time", () => {
  assert.throws(
    () => createParityTrace({
      scenarioId: "bad",
      donor: "godot",
      implementation: "typescript",
      seed: 1,
      steps: [
        { atMs: 10, input: null, snapshot: null, events: [] },
        { atMs: 9, input: null, snapshot: null, events: [] },
      ],
    }),
    /monotonic/,
  );
});
