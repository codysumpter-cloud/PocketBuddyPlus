import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("./", import.meta.url);
const templateSource = readFileSync(new URL("room-templates-core.js", root), "utf8");
const runtimeSource = readFileSync(new URL("room-templates.js", root), "utf8");
const css = readFileSync(new URL("room-templates.css", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");
const manifestSource = readFileSync(new URL("manifest.js", root), "utf8");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(manifestSource, context);
vm.runInContext(templateSource, context);

const core = context.window.TinyHouseRoomTemplatesCore;
assert.equal(core.templates.length, 4, "the gallery ships four editable showcase recipes");
assert.deepEqual([...core.templates.map((template) => template.id)], ["bathroom", "kitchen", "office", "japanese"]);
for (const template of core.templates) {
  assert.ok(template.structure.columns >= 4 && template.structure.columns <= 6);
  assert.ok(template.structure.rows >= 4 && template.structure.rows <= 6);
  assert.ok(template.placements.length >= 13, `${template.name} should be meaningfully furnished`);
  assert.equal(core.missingAssetIds(template, [{ id: "nope" }]).length > 0, true);
  assert.deepEqual([...core.missingAssetIds(template, context.window.TINYHOUSE_MANIFEST.assets)], [],
    `${template.name} must resolve every recipe ID in the shipped manifest`);
  for (const placement of template.placements.filter((candidate) => !candidate.wall && !candidate.supportKey)) {
    assert.ok(Math.round(placement.column) >= 0 && Math.round(placement.column) < template.structure.columns,
      `${template.name} ${placement.key} must anchor to an existing floor column`);
    assert.ok(Math.round(placement.row) >= 0 && Math.round(placement.row) < template.structure.rows,
      `${template.name} ${placement.key} must anchor to an existing floor row`);
  }
}
assert.equal(core.matchPreviewFile("Animated Bathroom Showcase.gif"), "bathroom");
assert.equal(core.matchPreviewFile("office_loop.GIF"), "office");
assert.equal(core.matchPreviewFile("mystery.png"), null);

assert.match(runtimeSource, /one-step backup/i);
assert.match(runtimeSource, /PLAY ROOM ANIMATIONS/);
assert.match(runtimeSource, /CHOOSE PREVIEW/);
assert.match(runtimeSource, /UUID-named files/i);
assert.match(runtimeSource, /setPreviewFile/);
assert.match(runtimeSource, /TinyHouseWallCore/);
assert.match(runtimeSource, /localStorage\.setItem\(BACKUP_KEY/);
assert.match(runtimeSource, /never uploaded or committed/i);
assert.doesNotMatch(runtimeSource, /unmatched\.slice\(0, available\.length\)/, "unnamed previews must not be assigned to arbitrary rooms");
assert.match(css, /room-template-grid/);
assert.match(css, /room-template-card-actions/);
assert.match(css, /image-rendering:pixelated/);
assert.match(html, /room-templates\.css/);
assert.match(html, /room-templates-core\.js/);
assert.match(html, /room-templates\.js/);
assert.ok(html.indexOf('<script src="room-templates-core.js"></script>') < html.indexOf('<script src="room-templates.js"></script>'));
assert.match(manifestSource, /ani-bath/);
assert.match(manifestSource, /state-washing-machine/);
assert.match(manifestSource, /state-office-normal-table/);
assert.match(manifestSource, /ani-japanese-door/);

console.log("TinyHouse room-template contract passed: editable recipes, explicit local GIF previews, valid floor anchors, complete manifest resolution, restore backup, and whole-room animation controls.");