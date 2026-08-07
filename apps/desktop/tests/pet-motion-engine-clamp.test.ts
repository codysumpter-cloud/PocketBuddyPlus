/**
 * Unit tests for pet-motion-engine's selected-monitor clamp policy.
 *
 * The historical petCrossDisplayEnabled preference remains readable for
 * backward compatibility, but it no longer weakens the selected-monitor hard
 * boundary. Confinement can narrow the allowed area; it can never expand it.
 */

import assert from "node:assert/strict";

import {
  _setScreenForTesting as setMotionScreen,
  _setIsPetWindowDraggingForTesting,
  _clampPositionForTesting,
} from "../src/pet-motion-engine.js";
import {
  _setScreenForTesting as setDisplayScreen,
  clampToNearestDisplayIfOffscreen,
  invalidateDisplayCache,
  isCrossDisplayRoamingEnabled,
  setCrossDisplayRoamingEnabled,
  setSelectedDisplay,
} from "../src/display.js";
import {
  clearConfinementState,
  setConfinementEnabled,
  setConfinementOuterBounds,
  setConfinementState,
} from "../src/confinement-manager.js";

const display1 = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};
const display2 = {
  bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
};

function nearestPoint(point: { x: number; y: number }) {
  const c1x = display1.bounds.x + display1.bounds.width / 2;
  const c2x = display2.bounds.x + display2.bounds.width / 2;
  return Math.abs(point.x - c1x) <= Math.abs(point.x - c2x) ? display1 : display2;
}

const mockScreen = {
  getAllDisplays: () => [display1, display2],
  getPrimaryDisplay: () => display1,
  getDisplayNearestPoint: nearestPoint,
};

setDisplayScreen(mockScreen as any);
invalidateDisplayCache();
setMotionScreen({ getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: nearestPoint } as any);
_setIsPetWindowDraggingForTesting(() => false);
setSelectedDisplay("primary");
setConfinementOuterBounds(display1.workArea);

const petSize = { width: 340, height: 420 };

// The old preference still round-trips for persisted-state compatibility.
assert.equal(isCrossDisplayRoamingEnabled(), false, "legacy cross-display flag defaults false");
setCrossDisplayRoamingEnabled(true);
assert.equal(isCrossDisplayRoamingEnabled(), true, "legacy flag remains readable");

// A pet may not straddle the seam. Its whole rect is pulled back into monitor 1.
{
  const result = clampToNearestDisplayIfOffscreen({ x: 1860, y: 100 }, petSize);
  assert.deepEqual(result, { x: 1580, y: 100 });
  assert.equal(result.x + petSize.width, display1.workArea.x + display1.workArea.width);
}

// A target deep on monitor 2 is still clamped to the selected primary monitor.
{
  const result = clampToNearestDisplayIfOffscreen({ x: 2500, y: 100 }, petSize);
  assert.deepEqual(result, { x: 1580, y: 100 });
}

// Bottom edge respects workArea, not full display bounds/taskbar pixels.
{
  const result = clampToNearestDisplayIfOffscreen({ x: 200, y: 1000 }, petSize);
  assert.deepEqual(result, { x: 200, y: 620 });
  assert.equal(result.y + petSize.height, display1.workArea.y + display1.workArea.height);
}

// A terminal/session confinement on the selected monitor remains the narrower
// highest-priority area, regardless of the obsolete cross-display flag value.
{
  const petId = "confined-regression-pet";
  const terminalBounds = { x: 100, y: 100, width: 800, height: 600 };
  setConfinementEnabled(true);
  setConfinementState(petId, {
    terminalBounds,
    terminalMinimized: false,
    terminalOccluded: false,
    terminalOwnerPid: 9999,
    appName: "TestTerminal",
  });

  const outside = { x: 2500, y: 900 };
  setCrossDisplayRoamingEnabled(true);
  const flagOn = _clampPositionForTesting(petId, outside);
  setCrossDisplayRoamingEnabled(false);
  const flagOff = _clampPositionForTesting(petId, outside);

  assert.deepEqual(flagOn, flagOff, "legacy roaming flag cannot weaken confinement");
  assert.ok(flagOn.x >= terminalBounds.x);
  assert.ok(flagOn.x + petSize.width <= terminalBounds.x + terminalBounds.width);
  assert.ok(flagOn.y >= terminalBounds.y);
  assert.ok(flagOn.y + petSize.height <= terminalBounds.y + terminalBounds.height);
  clearConfinementState(petId);
}

// Free-roam behavior is identical whether the legacy cross-display flag is on
// or off: selected-monitor containment is authoritative.
{
  const petId = "free-roam-pet";
  const target = { x: 2500, y: 900 };
  setConfinementEnabled(true);

  setCrossDisplayRoamingEnabled(true);
  const flagOn = _clampPositionForTesting(petId, target);
  setCrossDisplayRoamingEnabled(false);
  const flagOff = _clampPositionForTesting(petId, target);

  assert.deepEqual(flagOn, { x: 1580, y: 620 });
  assert.deepEqual(flagOff, flagOn);
}

// Explicitly choosing monitor 2 moves the same target into monitor 2 and keeps
// the whole pet above that monitor's taskbar.
{
  setSelectedDisplay("1920,0,1920x1080");
  setConfinementOuterBounds(display2.workArea);
  const result = _clampPositionForTesting("free-roam-secondary", { x: 200, y: 1000 });
  assert.deepEqual(result, { x: 1920, y: 620 });
  assert.ok(result.x >= display2.workArea.x);
  assert.ok(result.x + petSize.width <= display2.workArea.x + display2.workArea.width);
  assert.ok(result.y + petSize.height <= display2.workArea.y + display2.workArea.height);
}

// Cleanup test seams and compatibility state.
setSelectedDisplay("primary");
setConfinementOuterBounds(null);
setConfinementEnabled(true);
setCrossDisplayRoamingEnabled(false);
setDisplayScreen(null);
setMotionScreen(null);
_setIsPetWindowDraggingForTesting(null);

console.log("pet-motion-engine-clamp tests passed.");
