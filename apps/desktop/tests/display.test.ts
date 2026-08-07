/**
 * Unit tests for selected-monitor geometry in display.ts.
 *
 * The selected monitor is a hard outer boundary: pets and normal app windows
 * must stay inside its workArea (not full bounds), so Windows taskbars and
 * macOS dock/menu reservations can never be covered accidentally.
 */

import assert from "node:assert/strict";

import {
  _setScreenForTesting,
  centerWindowBoundsOnSelectedWorkArea,
  clampToNearestDisplayIfOffscreen,
  clampToVisibleWorkArea,
  clampWindowBoundsToSelectedWorkArea,
  getEffectiveSelectedDisplayKey,
  getSelectedWorkArea,
  invalidateDisplayCache,
  isOnAnyDisplay,
  setSelectedDisplay,
} from "../src/display.js";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function makeScreen(entries: Array<{ bounds: Rect; workArea?: Rect }>, primaryIndex = 0) {
  const displays = entries.map(({ bounds, workArea }) => ({ bounds, workArea: workArea ?? bounds }));
  function getDisplayNearestPoint(pt: { x: number; y: number }) {
    let best = displays[0];
    let bestDist = Infinity;
    for (const display of displays) {
      const cx = display.bounds.x + display.bounds.width / 2;
      const cy = display.bounds.y + display.bounds.height / 2;
      const dist = Math.hypot(pt.x - cx, pt.y - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = display;
      }
    }
    return best;
  }
  return {
    getAllDisplays: () => displays,
    getPrimaryDisplay: () => displays[primaryIndex],
    getDisplayNearestPoint,
  };
}

const PW = 340;
const PH = 420;
const primaryBounds = { x: 0, y: 0, width: 1920, height: 1080 };
const primaryWorkArea = { x: 0, y: 0, width: 1920, height: 1040 }; // 40 px bottom taskbar
const secondaryBounds = { x: 1920, y: 0, width: 2560, height: 1440 };
const secondaryWorkArea = { x: 1920, y: 0, width: 2560, height: 1392 }; // 48 px bottom taskbar
const DUAL = makeScreen([
  { bounds: primaryBounds, workArea: primaryWorkArea },
  { bounds: secondaryBounds, workArea: secondaryWorkArea },
]);

// Primary is the safe default.
{
  _setScreenForTesting(DUAL);
  setSelectedDisplay("primary");
  invalidateDisplayCache();
  assert.deepEqual(getSelectedWorkArea(), primaryWorkArea);
  assert.equal(getEffectiveSelectedDisplayKey(), "0,0,1920x1080");
}

// Historical cross-display clamp entry point is now selected-monitor locked.
{
  _setScreenForTesting(DUAL);
  setSelectedDisplay("primary");
  invalidateDisplayCache();
  const result = clampToNearestDisplayIfOffscreen({ x: 1800, y: 900 }, { width: PW, height: PH });
  assert.deepEqual(result, { x: 1580, y: 620 }, "pet is clamped before crossing seam or taskbar");
}

// Selecting monitor 2 moves/clamps pet positions into monitor 2's usable area.
{
  _setScreenForTesting(DUAL);
  setSelectedDisplay("1920,0,2560x1440");
  invalidateDisplayCache();
  const result = clampToVisibleWorkArea({ x: 100, y: 100 }, { width: PW, height: PH });
  assert.deepEqual(result, { x: 1920, y: 100 }, "position on monitor 1 is moved into selected monitor 2");
  const bottomRight = clampToVisibleWorkArea({ x: 9999, y: 9999 }, { width: PW, height: PH });
  assert.deepEqual(bottomRight, { x: 4140, y: 972 }, "pet remains above monitor 2 taskbar");
}

// A disconnected explicit selection falls back to primary without changing the preference.
{
  _setScreenForTesting(DUAL);
  setSelectedDisplay("9000,0,1920x1080");
  invalidateDisplayCache();
  assert.equal(getEffectiveSelectedDisplayKey(), "0,0,1920x1080");
  assert.deepEqual(clampToVisibleWorkArea({ x: 9000, y: 0 }, { width: PW, height: PH }), { x: 1580, y: 0 });
}

// Normal app windows are clamped and shrunk to fit selected workArea.
{
  _setScreenForTesting(DUAL);
  setSelectedDisplay("primary");
  invalidateDisplayCache();
  const safe = clampWindowBoundsToSelectedWorkArea({ x: -500, y: 900, width: 2200, height: 1200 });
  assert.deepEqual(safe, { x: 0, y: 0, width: 1920, height: 1040 });
}

// A normal Control Center-sized window can sit at the bottom-right without touching taskbar.
{
  _setScreenForTesting(DUAL);
  setSelectedDisplay("primary");
  invalidateDisplayCache();
  const safe = clampWindowBoundsToSelectedWorkArea({ x: 1800, y: 900, width: 1180, height: 820 });
  assert.deepEqual(safe, { x: 740, y: 220, width: 1180, height: 820 });
  assert.equal(safe.y + safe.height, primaryWorkArea.y + primaryWorkArea.height);
}

// Top and left taskbars reserve positive x/y offsets; windows may not cover them.
{
  const topLeftTaskbars = makeScreen([{
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 48, y: 32, width: 1872, height: 1048 },
  }]);
  _setScreenForTesting(topLeftTaskbars);
  setSelectedDisplay("primary");
  invalidateDisplayCache();
  const safe = clampWindowBoundsToSelectedWorkArea({ x: 0, y: 0, width: 1180, height: 820 });
  assert.deepEqual(safe, { x: 48, y: 32, width: 1180, height: 820 });
}

// A right-edge taskbar reduces workArea width; pet and menus stop before it.
{
  const rightTaskbar = makeScreen([{
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1872, height: 1080 },
  }]);
  _setScreenForTesting(rightTaskbar);
  setSelectedDisplay("primary");
  invalidateDisplayCache();
  assert.deepEqual(clampToVisibleWorkArea({ x: 1800, y: 200 }, { width: PW, height: PH }), { x: 1532, y: 200 });
  const safeMenu = clampWindowBoundsToSelectedWorkArea({ x: 1700, y: 100, width: 400, height: 500 });
  assert.equal(safeMenu.x + safeMenu.width, 1872);
}

// Center helper uses selected monitor, not virtual-desktop/nearest-display geometry.
{
  _setScreenForTesting(DUAL);
  setSelectedDisplay("1920,0,2560x1440");
  invalidateDisplayCache();
  const centered = centerWindowBoundsOnSelectedWorkArea({ width: 1180, height: 820 });
  assert.deepEqual(centered, { x: 2610, y: 286, width: 1180, height: 820 });
}

// Fractional scaled work areas are converted to safe integer interiors.
{
  const scaled = makeScreen([{ bounds: { x: -1536, y: 0, width: 1536, height: 864 }, workArea: { x: -1535.5, y: 0.4, width: 1535.2, height: 823.2 } }]);
  _setScreenForTesting(scaled);
  setSelectedDisplay("primary");
  invalidateDisplayCache();
  const safe = clampWindowBoundsToSelectedWorkArea({ x: -9999, y: 9999, width: 1000, height: 700 });
  assert.ok(Number.isInteger(safe.x) && Number.isInteger(safe.y));
  assert.ok(Number.isInteger(safe.width) && Number.isInteger(safe.height));
  assert.ok(safe.x >= Math.ceil(-1535.5));
  assert.ok(safe.y >= Math.ceil(0.4));
  assert.ok(safe.x + safe.width <= Math.floor(-1535.5 + 1535.2));
  assert.ok(safe.y + safe.height <= Math.floor(0.4 + 823.2));
}

// isOnAnyDisplay remains available as a diagnostic helper.
{
  _setScreenForTesting(DUAL);
  invalidateDisplayCache();
  assert.equal(isOnAnyDisplay({ x: 2000, y: 100 }, PW, PH), true);
  assert.equal(isOnAnyDisplay({ x: 9000, y: 100 }, PW, PH), false);
}

_setSelectedDefaults();
console.error("display.test.ts: selected-monitor tests passed.");

function _setSelectedDefaults(): void {
  setSelectedDisplay("primary");
  _setScreenForTesting(null);
}
