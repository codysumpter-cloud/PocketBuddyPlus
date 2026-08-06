import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("./", import.meta.url);
const coreSource = readFileSync(new URL("house-grid-core.js", root), "utf8");
const runtimeSource = readFileSync(new URL("house-grid.js", root), "utf8")
  + readFileSync(new URL("house-grid-render.js", root), "utf8")
  + readFileSync(new URL("house-grid-editor.js", root), "utf8");
const css = readFileSync(new URL("house-grid.css", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

const context = { window: {} };
vm.createContext(context);
vm.runInContext(coreSource, context);
const { HouseGrid, cellCenter, edgeBetween } = context.window.TinyHouseGridCore;

const grid = HouseGrid.createDefault({
  columns: 5,
  rows: 5,
  floorAssetId: "floor",
  leftWallAssetId: "wall-left",
  rightWallAssetId: "wall-right",
  doorAssetId: "door",
});
assert.equal(grid.floors.size, 25, "the original room is represented by 25 real floor cells");
assert.equal(grid.edges.size, 10, "the original cutaway walls are represented by addressable edges");
assert.equal(grid.rooms().length, 1);

const extension = grid.addConnectedRoom("east", 3, 3);
assert.equal(grid.floors.size, 34, "adding a room extends the same grid rather than drawing a separate mock room");
assert.equal(extension.door.kind, "door");
assert.equal(extension.door.open, false);
assert.equal(grid.rooms().length, 2, "a closed connecting door separates the two walkable zones");

const [insideNewRoom, insideOldRoom] = context.window.TinyHouseGridCore.adjacentCellsForEdge(
  extension.door.axis,
  extension.door.column,
  extension.door.row,
);
assert.equal(grid.canTraverse(insideNewRoom, insideOldRoom), false);
grid.toggleDoor(extension.door.axis, extension.door.column, extension.door.row);
assert.equal(grid.canTraverse(insideNewRoom, insideOldRoom), true);
assert.equal(grid.rooms().length, 1, "opening the door connects the rooms into one traversable house");

assert.equal(grid.removeFloor(0, 4), true);
assert.equal(grid.hasFloor(0, 4), false, "individual floor tiles can be removed");
grid.addFloor(-1, 0, "floor");
assert.equal(grid.hasFloor(-1, 0), true, "the house can expand beyond the original 5×5 bounds");
assert.deepEqual({ ...edgeBetween({ column: 1, row: 2 }, { column: 0, row: 2 }) }, { axis: "left", column: 1, row: 2 });
assert.deepEqual({ ...edgeBetween({ column: 2, row: 3 }, { column: 2, row: 2 }) }, { axis: "right", column: 2, row: 3 });
assert.deepEqual({ ...cellCenter(7, -2) }, { x: 1226, y: 382 }, "expanded cells retain the exact 128×64 isometric projection");

const snapshot = grid.toJSON();
const restored = new HouseGrid(snapshot);
assert.deepEqual(restored.toJSON(), snapshot, "floor cells, walls, doors, and door states persist losslessly");

assert.match(runtimeSource, /HOUSE_SAVE_KEY/);
assert.match(runtimeSource, /worldToNearestFloorCell/);
assert.match(runtimeSource, /addConnectedRoom/);
assert.match(runtimeSource, /Move the furniture off this tile first/);
assert.match(runtimeSource, /Door opened · passage connected/);
assert.match(runtimeSource, /stopImmediatePropagation/);
assert.match(runtimeSource, /exportHouse = async/);
assert.match(runtimeSource, /tinyhouse-structure\.png/);
assert.match(runtimeSource, /Rendering the full house structure/);
assert.match(css, /structure-floor-hit/);
assert.match(css, /structure-edge-hit/);
assert.match(css, /structure-door/);
assert.match(html, /house-grid\.css/);
assert.match(html, /house-grid-core\.js/);
assert.match(html, /house-grid\.js/);
assert.match(html, /house-grid-render\.js/);
assert.match(html, /house-grid-editor\.js/);
assert.ok(html.indexOf('<script src="house-grid-core.js"></script>') < html.indexOf('<script src="house-grid.js"></script>'));
assert.ok(html.indexOf('<script src="house-grid.js"></script>') < html.indexOf('<script src="house-grid-render.js"></script>'));
assert.ok(html.indexOf('<script src="house-grid-render.js"></script>') < html.indexOf('<script src="house-grid-editor.js"></script>'));
assert.match(packageJson.scripts["test:tinyhouse-local"], /test-house-grid-contract\.mjs/);

console.log("TinyHouse editable house-grid contract passed: cells, edges, connected rooms, working doors, persistence, and full-house export.");
