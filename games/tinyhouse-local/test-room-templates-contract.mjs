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
vm.runInContext(templateSource, context);

const core = context.window.TinyHouseRoomTemplatesCore;
assert.equal(core.templates.length, 4, "the gallery ships four editable showcase recipes");
assert.deepEqual([...core.templates.map((template) => template.id)], ["bathroom", "kitchen", "office", "japanese"]);
for (const template of core.templates) {
  assert.ok(template.structure.columns >= 4 && template.structure.columns <= 6);
  assert.ok(template.structure.rows >= 4 && template.structure.rows <= 6);
  assert.ok(template.placements.length >= 13, `${template.name} should be meaningfully furnished`);
  assert.equal(core.missingAssetIds(template, [{ id: "nope" }]).length > 0, true);
}
assert.equal(core.matchPreviewFile("Animated Bathroom Showcase.gif"), "bathroom");
assert.equal(core.matchPreviewFile("office_loop.GIF"), "office");
assert.equal(core.matchPreviewFile("mystery.png"), null);

assert.match(runtimeSource, /one-step backup/i);
assert.match(runtimeSource, /PLAY ROOM ANIMATIONS/);
assert.match(runtimeSource, /TinyHouseWallCore/);
assert.match(runtimeSource, /localStorage\.setItem\(BACKUP_KEY/);
assert.match(runtimeSource, /never uploaded or committed/i);
assert.match(css, /room-template-grid/);
assert.match(css, /image-rendering:pixelated/);
assert.match(html, /room-templates\.css/);
assert.match(html, /room-templates-core\.js/);
assert.match(html, /room-templates\.js/);
assert.ok(html.indexOf('<script src="room-templates-core.js"></script>') < html.indexOf('<script src="room-templates.js"></script>'));
assert.match(manifestSource, /ani-bath/);
assert.match(manifestSource, /state-washing-machine/);
assert.match(manifestSource, /state-office-normal-table/);
assert.match(manifestSource, /ani-japanese-door/);

console.log("TinyHouse room-template contract passed: editable recipes, local GIF previews, restore backup, and whole-room animation controls.");