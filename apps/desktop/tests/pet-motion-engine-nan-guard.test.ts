/**
 * Regression tests for NaN/Infinity coordinate guards in pet-motion-engine.
 *
 * Bug #72: window.setPosition() was called with NaN coordinates, crashing Electron
 * with `TypeError: Error processing argument at index 0, conversion failure`.
 *
 * Root causes:
 * (a) screen.getDisplayNearestPoint().workArea returns NaN on multi-monitor disconnect
 *     → computeGravityFloor() returns NaN → rawY NaN → setPosition(NaN, NaN, false)
 * (b) window.getPosition() returns NaN mid-destroy/move
 *
 * These tests verify that a non-finite coordinate is never passed to setPosition
 * and that the engine does not throw in either scenario.
 */
import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";

import {
  _setScreenForTesting,
  _setIsPetWindowDraggingForTesting,
  _resetMotionStatesForTesting,
  registerPet,
  motionSetPhysics,
  motionMoveTo,
} from "../src/pet-motion-engine.js";
import { _setScreenForTesting as setDisplayScreen, invalidateDisplayCache, setCrossDisplayRoamingEnabled } from "../src/display.js";

// ---------------------------------------------------------------------------
// Helper: make a mock BrowserWindow with configurable getPosition return value
// ---------------------------------------------------------------------------

function makeWindowMock(posX: number, posY: number, setPositionSpy?: (x: number, y: number) => void) {
  return () => ({
    getPosition: (): [number, number] => [posX, posY],
    isDestroyed: () => false,
    isVisible: () => true,
    setPosition: (x: number, y: number, _animate: boolean) => {
      setPositionSpy?.(x, y);
    },
  } as any);
}

// Normal screen mock used for baseline
const normalScreen = {
  getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
  getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
};

// Screen mock with NaN workArea (simulates monitor disconnect / driver fault)
const nanWorkAreaScreen = {
  getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  getAllDisplays: () => [{ workArea: { x: NaN, y: NaN, width: NaN, height: NaN } }],
  getPrimaryDisplay: () => ({ workArea: { x: NaN, y: NaN, width: NaN, height: NaN } }),
  getDisplayNearestPoint: () => ({ workArea: { x: NaN, y: NaN, width: NaN, height: NaN } }),
};

// Screen whose workArea is fractional. Real displays do this: a monitor at a
// fractional scale factor (150%, 175%) reports a work area that is not on whole
// pixels, and terminal bounds read for confinement are fractional for the same
// reason.
const fractionalWorkAreaScreen = {
  getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  getAllDisplays: () => [{ workArea: { x: 0.5, y: 0.5, width: 1706.6667, height: 959.3333 } }],
  getPrimaryDisplay: () => ({ workArea: { x: 0.5, y: 0.5, width: 1706.6667, height: 959.3333 } }),
  getDisplayNearestPoint: () => ({ workArea: { x: 0.5, y: 0.5, width: 1706.6667, height: 959.3333 } }),
};

// Loop interval used by the shared ticker (mirrors production constant)
const loopIntervalMs = 16;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("pet-motion-engine NaN coordinate guards", () => {
  before(() => {
    _setIsPetWindowDraggingForTesting(() => false);
    setCrossDisplayRoamingEnabled(false);
  });

  after(() => {
    _resetMotionStatesForTesting();
    _setScreenForTesting(null);
    setDisplayScreen(null);
    _setIsPetWindowDraggingForTesting(null);
  });

  afterEach(() => {
    _resetMotionStatesForTesting();
  });

  it("tick does NOT call setPosition and does NOT throw when getPosition() returns [NaN, NaN]", async () => {
    // Arrange: normal screen, but window reports NaN position (mid-destroy race)
    _setScreenForTesting(normalScreen as any);
    setDisplayScreen(normalScreen as any);
    invalidateDisplayCache();

    const setPositionCalls: Array<[number, number]> = [];
    const accessor = makeWindowMock(NaN, NaN, (x, y) => setPositionCalls.push([x, y]));

    registerPet("nan-pos-test", accessor);
    motionSetPhysics("nan-pos-test", accessor, { gravity: true, bounce: 0.4 });

    // Let the shared ticker fire several ticks
    await new Promise<void>((resolve) => setTimeout(resolve, loopIntervalMs * 5));

    // No setPosition call should have occurred with non-finite args
    for (const [x, y] of setPositionCalls) {
      assert.ok(
        Number.isFinite(x) && Number.isFinite(y),
        `setPosition called with non-finite coords: (${x}, ${y})`,
      );
    }
    // Additionally, given the [NaN, NaN] guard at top of tickPet, we expect zero calls
    assert.equal(setPositionCalls.length, 0, "setPosition must not be called at all when getPosition returns NaN");
  });

  it("setPosition is never called with non-finite args when workArea has NaN dimensions (monitor disconnect)", async () => {
    // Arrange: workArea returns NaN on all fields — simulates monitor disconnect
    _setScreenForTesting(nanWorkAreaScreen as any);
    setDisplayScreen(nanWorkAreaScreen as any);
    invalidateDisplayCache();

    const setPositionCalls: Array<[number, number]> = [];
    // Window has a valid integer position — only workArea is NaN
    const accessor = makeWindowMock(400, 300, (x, y) => setPositionCalls.push([x, y]));

    registerPet("nan-workarea-test", accessor);
    motionSetPhysics("nan-workarea-test", accessor, { gravity: true, bounce: 0.4 });

    // Let the shared ticker fire several ticks
    await new Promise<void>((resolve) => setTimeout(resolve, loopIntervalMs * 5));

    // Every call that did happen must have finite coordinates
    for (const [x, y] of setPositionCalls) {
      assert.ok(
        Number.isFinite(x) && Number.isFinite(y),
        `setPosition called with non-finite coords: (${x}, ${y})`,
      );
    }
  });

  it("in-flight motionMoveTo settles (promise resolves) even when getPosition() returns [NaN, NaN]", async () => {
    // Regression for PR #74 review (Bug: NaN early-return stalled the motion loop,
    // leaving moveTarget.elapsed frozen so the motionMoveTo promise never resolved).
    _setScreenForTesting(normalScreen as any);
    setDisplayScreen(normalScreen as any);
    invalidateDisplayCache();

    const setPositionCalls: Array<[number, number]> = [];
    const accessor = makeWindowMock(NaN, NaN, (x, y) => setPositionCalls.push([x, y]));

    registerPet("nan-move-test", accessor);
    motionSetPhysics("nan-move-test", accessor, { gravity: true, bounce: 0.4 });

    const movePromise = motionMoveTo("nan-move-test", accessor, { x: 500, y: 500 }, { durationMs: 100 });

    const outcome = await Promise.race([
      movePromise.then(() => "resolved" as const),
      new Promise<"timeout">((resolve) => {
        const t = setTimeout(() => resolve("timeout"), 1000);
        t.unref?.();
      }),
    ]);

    assert.equal(
      outcome,
      "resolved",
      "motionMoveTo promise must resolve (loop must advance elapsed) even under NaN getPosition",
    );

    // And the NaN path must never have written a non-finite position
    for (const [x, y] of setPositionCalls) {
      assert.ok(
        Number.isFinite(x) && Number.isFinite(y),
        `setPosition called with non-finite coords: (${x}, ${y})`,
      );
    }
  });

  // Same crash as bug #72, different cause. The NaN guard uses Number.isFinite,
  // which 0.5 passes - but Electron's setPosition takes an int, so a fractional
  // coordinate still dies with "conversion failure". A pet clamped against a
  // fractional work area (or fractional terminal bounds) hits this on every tick
  // that pushes it against an edge.
  it("tick only ever passes integers to setPosition, even against a fractional work area", async () => {
    _setScreenForTesting(fractionalWorkAreaScreen as any);
    setDisplayScreen(fractionalWorkAreaScreen as any);
    invalidateDisplayCache();

    const setPositionCalls: Array<[number, number]> = [];
    // Start far off-screen so the clamp is forced to return a bound verbatim.
    const accessor = makeWindowMock(-5000, -5000, (x, y) => setPositionCalls.push([x, y]));

    registerPet("fractional-clamp-test", accessor);
    motionSetPhysics("fractional-clamp-test", accessor, { gravity: true, bounce: 0.4 });

    await new Promise<void>((resolve) => setTimeout(resolve, loopIntervalMs * 5));

    assert.ok(setPositionCalls.length > 0, "the pet should have moved at least once");
    for (const [x, y] of setPositionCalls) {
      assert.ok(
        Number.isInteger(x) && Number.isInteger(y),
        `setPosition must receive integers; Electron cannot convert ${x}, ${y}`,
      );
    }
  });
});
