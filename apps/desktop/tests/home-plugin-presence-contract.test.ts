import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..");
const launcher = readFileSync(join(root, "src/renderer/src/home-ui.ts"), "utf8");
const bridge = readFileSync(join(root, "src/plugin-sdk-bridge.ts"), "utf8");
const preload = readFileSync(join(root, "plugin-sdk-preload.cjs"), "utf8");
const homePanel = readFileSync(join(root, "../../plugins/official/openpets.home-builder/src/home.ts"), "utf8");
const homeScene = readFileSync(join(root, "../../plugins/official/openpets.home-builder/src/home-scene.ts"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "../../plugins/official/openpets.home-builder/openpets.plugin.json"), "utf8"));

describe("Home presence plugin contract", () => {
  it("routes the Control Center Home nav to the official plugin", () => {
    assert.match(launcher, /openpets\.home-builder/);
    assert.match(launcher, /executePluginCommand\(HOME_PLUGIN_ID, "open-home"\)/);
    assert.doesNotMatch(launcher, /mountPhaserHome/);
  });

  it("keeps presentation choice separate from household simulation", () => {
    assert.match(homePanel, /data-home-presentation=\"panel\"/);
    assert.match(homePanel, /data-home-presentation=\"home\"/);
    assert.match(homePanel, /data-home-presentation=\"buddy\"/);
    assert.match(homePanel, /data-home-simulation=\"play\"/);
    assert.match(homePanel, /data-home-simulation=\"idle\"/);
    assert.match(homeScene, /advanceHomePresenceSession/);
    assert.match(homeScene, /autonomousPlayer:\s*this\.simulationMode === \"idle\"/);
  });

  it("gates active Buddy appearance and visibility through declared permissions", () => {
    assert.ok(manifest.permissions.includes("pets:read"));
    assert.ok(manifest.permissions.includes("pets:manage"));
    assert.ok(manifest.permissions.includes("pet:reaction"));
    assert.match(bridge, /getAppearance: async \(\) => \{ requirePermission\("pets:read"\)/);
    assert.match(bridge, /state\.hiddenPets\.add\(id\)/);
    assert.match(bridge, /for \(const petHandleId of state\.hiddenPets\)/);
    assert.match(preload, /pet\.getAppearance/);
  });
});
