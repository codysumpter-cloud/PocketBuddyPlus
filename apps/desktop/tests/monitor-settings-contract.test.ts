import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "src/renderer/index.html"), "utf8");
const ui = readFileSync(join(root, "src/renderer/src/monitor-settings-ui.ts"), "utf8");
const preload = readFileSync(join(root, "control-center-preload.cjs"), "utf8");

assert.match(html, /monitor-settings-ui\.ts/, "renderer must load monitor settings module");
assert.match(preload, /openpets:get-monitor-selection/, "preload must expose monitor read IPC");
assert.match(preload, /openpets:set-monitor-selection/, "preload must expose monitor write IPC");
assert.match(ui, /data-testid="setting-pet-cross-display-toggle"/, "monitor UI must retire the contradictory cross-display toggle");
assert.match(ui, /taskbar\/dock is a hard edge/i, "Settings copy must state taskbar/dock containment");

console.error("monitor-settings-contract.test.ts: monitor settings contract passed.");
