import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canPlaceRoomItem,
  createHomeRoomDocument,
  isNearWall,
  nearWalls,
  parseHomeRoomDocument,
  presentedRoomSize,
  projectCanonicalCell,
  removeRoomItem,
  rotateCanonicalCell,
  rotateCameraCorner,
  upsertRoomItem,
  type HomeRoomItem,
} from "../src/home/index.js";

function item(id: string, x: number, y: number, width = 1, height = 1, supportItemId: string | null = null): HomeRoomItem {
  return {
    id,
    assetId: `asset:${id}`,
    placement: {
      surface: "floor",
      anchor: { x, y },
      offset: { x: 0, y: 0 },
      rotationQuarter: 0,
      scale: 1,
      footprint: { width, height },
      supportItemId,
    },
    state: {},
  };
}

test("room documents use canonical physical surfaces rather than camera labels", () => {
  const room = createHomeRoomDocument({ roomId: "home", width: 4, height: 3 });
  assert.deepEqual(Object.keys(room.surfaces), [
    "floor", "wall_north", "wall_east", "wall_south", "wall_west",
  ]);
  assert.equal(room.cameraCorner, "SE");
  assert.equal(room.revision, 0);
});

test("a full orbit returns every canonical cell and cameraCorner exactly", () => {
  const size = { width: 4, height: 3 };
  const canonical = { x: 2, y: 1 };
  let cameraCorner: "SE" | "SW" | "NW" | "NE" = "SE";
  for (let index = 0; index < 4; index += 1) cameraCorner = rotateCameraCorner(cameraCorner, 1);
  assert.equal(cameraCorner, "SE");
  assert.deepEqual(rotateCanonicalCell(canonical, size, cameraCorner), canonical);
  assert.deepEqual(presentedRoomSize(size, "SW"), { width: 3, height: 4 });
  assert.deepEqual(presentedRoomSize(size, "NW"), size);
});

test("isometric projection is deterministic and camera-corner-aware", () => {
  const size = { width: 4, height: 3 };
  assert.deepEqual(projectCanonicalCell({ x: 0, y: 0 }, size, "SE"), { x: 0, y: 0 });
  assert.deepEqual(projectCanonicalCell({ x: 0, y: 0 }, size, "SW"), { x: 64, y: 32 });
  assert.deepEqual(projectCanonicalCell({ x: 0, y: 0 }, size, "NW"), { x: 32, y: 80 });
});

test("the two near physical walls rotate around the room", () => {
  assert.deepEqual(nearWalls("SE"), ["east", "south"]);
  assert.deepEqual(nearWalls("SW"), ["south", "west"]);
  assert.deepEqual(nearWalls("NW"), ["west", "north"]);
  assert.deepEqual(nearWalls("NE"), ["north", "east"]);
  assert.equal(isNearWall("north", "SE"), false);
  assert.equal(isNearWall("north", "NE"), true);
});

test("floor placement rejects overlap and out-of-room footprints", () => {
  let room = createHomeRoomDocument({ roomId: "home", width: 4, height: 3 });
  room = upsertRoomItem(room, item("table", 1, 1, 2, 1));
  assert.deepEqual(canPlaceRoomItem(room, item("lamp", 0, 0)), {
    ok: true, reason: "ok", blockingItemId: null,
  });
  assert.deepEqual(canPlaceRoomItem(room, item("chair", 2, 1)), {
    ok: false, reason: "occupied", blockingItemId: "table",
  });
  assert.deepEqual(canPlaceRoomItem(room, item("sofa", 3, 2, 2, 1)), {
    ok: false, reason: "outside-room", blockingItemId: null,
  });
});

test("support references are validated and cascade when their support is removed", () => {
  let room = createHomeRoomDocument({ roomId: "home", width: 4, height: 3 });
  room = upsertRoomItem(room, item("table", 1, 1));
  const monitor = item("monitor", 1, 1, 1, 1, "table");
  const onSupport = {
    ...monitor,
    placement: { ...monitor.placement, surface: "wall_north" as const },
  };
  room = upsertRoomItem(room, onSupport);
  assert.deepEqual(room.items.map((entry) => entry.id), ["table", "monitor"]);
  room = removeRoomItem(room, "table");
  assert.deepEqual(room.items, []);
});

test("saved room documents are strictly checked at the boundary", () => {
  const room = createHomeRoomDocument({ roomId: "home" });
  assert.deepEqual(parseHomeRoomDocument(JSON.parse(JSON.stringify(room))), room);
  assert.throws(
    () => parseHomeRoomDocument({ ...room, surfaces: { ...room.surfaces, wall_left: { materialId: null } } }),
    /non-canonical keys: wall_left/,
  );
  const duplicate = { ...room, items: [item("same", 0, 0), item("same", 1, 0)] };
  assert.throws(() => parseHomeRoomDocument(duplicate), /duplicate item id/);
});
