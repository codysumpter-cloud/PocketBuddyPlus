import assert from "node:assert/strict";
import test from "node:test";

import {
  createHomeFloorTileLayer,
  createHomeRoomDocument,
  floorMaterialAt,
  paintHomeFloorTile,
  parseHomeFloorTileLayer,
  resetHomeFloorTile,
} from "../src/index.js";

const room = createHomeRoomDocument({ roomId: "tile-test", width: 4, height: 3 });

test("painting one floor cell is immutable and leaves other cells on the default material", () => {
  const original = createHomeFloorTileLayer("floor.wood");
  const painted = paintHomeFloorTile(room, original, { x: 2, y: 1 }, "floor.stone");

  assert.equal(floorMaterialAt(original, { x: 2, y: 1 }), "floor.wood");
  assert.equal(floorMaterialAt(painted, { x: 2, y: 1 }), "floor.stone");
  assert.equal(floorMaterialAt(painted, { x: 1, y: 1 }), "floor.wood");
});

test("painting the default material removes an unnecessary override", () => {
  const painted = paintHomeFloorTile(
    room,
    createHomeFloorTileLayer("floor.wood"),
    { x: 0, y: 0 },
    "floor.grass",
  );
  const restored = paintHomeFloorTile(room, painted, { x: 0, y: 0 }, "floor.wood");

  assert.deepEqual(restored.overrides, {});
});

test("resetting a floor cell restores the default without changing the source layer", () => {
  const painted = paintHomeFloorTile(
    room,
    createHomeFloorTileLayer("floor.wood"),
    { x: 3, y: 2 },
    "floor.water",
  );
  const reset = resetHomeFloorTile(room, painted, { x: 3, y: 2 });

  assert.equal(floorMaterialAt(painted, { x: 3, y: 2 }), "floor.water");
  assert.equal(floorMaterialAt(reset, { x: 3, y: 2 }), "floor.wood");
});

test("untrusted saves reject malformed and out-of-room tile keys", () => {
  assert.throws(
    () => parseHomeFloorTileLayer({
      schema: "pocket-buddy-home-floor-v1",
      defaultMaterialId: "floor.wood",
      overrides: { "4,0": "floor.stone" },
    }, room),
    /outside the room/,
  );

  assert.throws(
    () => parseHomeFloorTileLayer({
      schema: "pocket-buddy-home-floor-v1",
      defaultMaterialId: "floor.wood",
      overrides: { nope: "floor.stone" },
    }, room),
    /invalid tile key/,
  );
});

test("save parsing returns a detached normalized layer", () => {
  const source = {
    schema: "pocket-buddy-home-floor-v1",
    defaultMaterialId: " floor.wood ",
    overrides: { "1,1": " floor.stone ", "2,1": "floor.wood" },
  };
  const parsed = parseHomeFloorTileLayer(source, room);

  assert.equal(parsed.defaultMaterialId, "floor.wood");
  assert.deepEqual(parsed.overrides, { "1,1": "floor.stone" });
  source.overrides["1,1"] = "floor.water";
  assert.equal(parsed.overrides["1,1"], "floor.stone");
});
