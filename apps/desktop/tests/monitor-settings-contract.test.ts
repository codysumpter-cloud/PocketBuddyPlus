import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "src/renderer/index.html"), "utf8");
const ui = readFileSync(join(root, "src/renderer/src/monitor-settings-ui.ts"), "utf8");
const preload = readFileSync(join(root, "control-center-preload.cjs"), "utf8");
const manager = readFileSync(join(root, "src/monitor-manager.ts"), "utf8");

assert.match(html, /monitor-settings-ui\.ts/, "renderer must load monitor settings module");
assert.match(preload, /openpets:get-monitor-selection/, "preload must expose monitor read IPC");
assert.match(preload, /openpets:set-monitor-selection/, "preload must expose monitor write IPC");
assert.match(ui, /data-testid="setting-pet-cross-display-toggle"/, "monitor UI must retire the contradictory cross-display toggle");
assert.match(ui, /taskbar\/dock is a hard edge/i, "Settings copy must state taskbar/dock containment");

assert.match(manager, /screen\.getDisplayMatching\(current\)/, "window guard must detect which monitor currently owns a visible window");
assert.match(manager, /window\.isMaximized\(\)/, "window guard must handle maximized windows explicitly");
assert.match(manager, /window\.unmaximize\(\)/, "wrong-monitor maximized windows must be restored before relocation");
assert.match(manager, /window\.maximize\(\)/, "relocated maximized windows must regain maximized state on selected monitor");
assert.match(manager, /display-metrics-changed/, "taskbar, scaling, and resolution changes must trigger re-clamping");
assert.match(manager, /clampWindowBoundsToSelectedWorkArea/, "visible windows must use selected work-area geometry");

console.error("monitor-settings-contract.test.ts: monitor settings contract passed.");
