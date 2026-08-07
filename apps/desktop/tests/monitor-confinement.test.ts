import assert from "node:assert/strict";

import {
  clampToTerminalBounds,
  clearConfinementState,
  getEffectiveConfinementBounds,
  setConfinementEnabled,
  setConfinementOuterBounds,
  setConfinementState,
} from "../src/confinement-manager.js";

const petSize = { width: 340, height: 420 };
const selectedWorkArea = { x: 0, y: 0, width: 1920, height: 1040 };

setConfinementEnabled(true);
setConfinementOuterBounds(selectedWorkArea);

// A terminal entirely on another monitor cannot pull the pet there.
{
  const terminal = { x: 2200, y: 100, width: 900, height: 700 };
  const result = clampToTerminalBounds({ x: 2500, y: 300 }, petSize, terminal);
  assert.deepEqual(result, { x: 1580, y: 300 });
}

// A terminal partially overlapping the selected monitor still cannot leave
// even one pixel of the pet underneath the taskbar or across the monitor seam.
{
  const terminal = { x: 1750, y: 850, width: 500, height: 500 };
  const result = clampToTerminalBounds({ x: 1900, y: 1000 }, petSize, terminal);
  assert.equal(result.x, 1580);
  assert.equal(result.y, 620);
  assert.ok(result.x + petSize.width <= selectedWorkArea.x + selectedWorkArea.width);
  assert.ok(result.y + petSize.height <= selectedWorkArea.y + selectedWorkArea.height);
}

// Gravity/confinement consumers receive the monitor intersection rather than
// terminal geometry extending onto another monitor.
{
  setConfinementState("agent-1", {
    terminalBounds: { x: 1500, y: 500, width: 900, height: 800 },
    terminalMinimized: false,
    terminalOccluded: false,
    terminalOwnerPid: 123,
    appName: "Terminal",
  });
  assert.deepEqual(getEffectiveConfinementBounds("agent-1"), { x: 1500, y: 500, width: 420, height: 540 });
  clearConfinementState("agent-1");
}

// A terminal with no monitor overlap falls back to the selected work area.
{
  setConfinementState("agent-2", {
    terminalBounds: { x: -3000, y: 50, width: 1000, height: 800 },
    terminalMinimized: false,
    terminalOccluded: false,
    terminalOwnerPid: 456,
    appName: "Terminal",
  });
  assert.deepEqual(getEffectiveConfinementBounds("agent-2"), selectedWorkArea);
  clearConfinementState("agent-2");
}

setConfinementOuterBounds(null);
setConfinementEnabled(true);
console.error("monitor-confinement.test.ts: selected-monitor confinement tests passed.");
