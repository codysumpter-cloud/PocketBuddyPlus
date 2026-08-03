import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FRONT_FADE_ALPHA,
  parseWallKey,
  wallBoundaryCells,
  wallPresentation,
} from "../src/home/wall-model.js";

// The cross-runtime oracle in tools/godot-oracle proves these match the real
// InteriorWallModel, but it only runs where Godot is installed. These tests pin
// the same behaviour unconditionally so CI cannot go green on a silent skip.

test("legacy v4 wall keys map left to west and right to north", () => {
  // The whole point. "right" is not east; "left" is not south. Getting this
  // backwards mirrors an imported room and nothing else notices.
  assert.equal(parseWallKey("left"), "west");
  assert.equal(parseWallKey("right"), "north");
});

test("wall keys parse canonical names, abbreviations, prefixes, case and padding", () => {
  for (const wall of ["north", "east", "south", "west"] as const) {
    assert.equal(parseWallKey(wall), wall);
    assert.equal(parseWallKey(`wall_${wall}`), wall);
    assert.equal(parseWallKey(wall.toUpperCase()), wall);
    assert.equal(parseWallKey(`  ${wall}  `), wall);
    assert.equal(parseWallKey(wall[0]), wall);
  }
});

test("wall keys accept the donor's enum ordinals in NORTH/EAST/SOUTH/WEST order", () => {
  assert.deepEqual([0, 1, 2, 3].map(parseWallKey), ["north", "east", "south", "west"]);
  assert.equal(parseWallKey(4), null);
  assert.equal(parseWallKey(-1), null);
});

test("unparseable wall keys return null rather than defaulting to a wall", () => {
  // A silent default here would place an item against the wrong wall.
  for (const bad of ["bogus", "", "  ", "northeast", null, undefined, {}, 1.5]) {
    assert.equal(parseWallKey(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
  // The donor trims before stripping `wall_` and does not trim again, so an
  // interior space survives and the value does not parse.
  assert.equal(parseWallKey("wall_ north"), null);
});

test("boundary cells follow the room's real extent, not a square assumption", () => {
  // Non-square: a width/height transposition would be invisible on a square.
  assert.deepEqual(wallBoundaryCells(5, 3, "north"), [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 },
  ]);
  assert.deepEqual(wallBoundaryCells(5, 3, "south"), [
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
  ]);
  assert.deepEqual(wallBoundaryCells(5, 3, "west"), [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }]);
  assert.deepEqual(wallBoundaryCells(5, 3, "east"), [{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }]);
});

test("corners belong to two walls, and degenerate rooms yield nothing", () => {
  const north = wallBoundaryCells(4, 4, "north");
  const west = wallBoundaryCells(4, 4, "west");
  const shared = north.filter((c) => west.some((w) => w.x === c.x && w.y === c.y));
  assert.deepEqual(shared, [{ x: 0, y: 0 }], "the north-west corner is real geometry, not duplicate data");
  for (const [w, h] of [[0, 3], [3, 0], [-1, 5]]) assert.deepEqual(wallBoundaryCells(w, h, "north"), []);
});

test("rear walls stay solid and camera-facing walls cut away", () => {
  // Camera at SE: south and east are camera-facing, north and west are rear.
  assert.deepEqual(wallPresentation("north", "SE"), { visible: true, alpha: 1, cameraFacing: false });
  assert.deepEqual(wallPresentation("south", "SE"), { visible: false, alpha: 0, cameraFacing: true });
});

test("fade, always_show and build mode keep a camera-facing wall visible but faded", () => {
  const faded = { visible: true, alpha: FRONT_FADE_ALPHA, cameraFacing: true };
  assert.deepEqual(wallPresentation("south", "SE", "fade"), faded);
  assert.deepEqual(wallPresentation("south", "SE", "always_show"), faded);
  // Build mode overrides even a mode that would otherwise hide the wall.
  assert.deepEqual(wallPresentation("south", "SE", "hide", true), faded);
  assert.equal(FRONT_FADE_ALPHA, 0.18, "donor threshold; changing it changes what builders see");
});

test("auto and hide agree today but remain separately reachable", () => {
  const cut = { visible: false, alpha: 0, cameraFacing: true };
  assert.deepEqual(wallPresentation("east", "SE", "auto"), cut);
  assert.deepEqual(wallPresentation("east", "SE", "hide"), cut);
});

test("an unrecognised cutaway mode falls back to auto instead of throwing", () => {
  // This runs on save data. A room with a bad mode must still draw.
  assert.deepEqual(wallPresentation("east", "SE", "nonsense"), { visible: false, alpha: 0, cameraFacing: true });
  assert.deepEqual(wallPresentation("east", "SE", "ALWAYS_SHOW"), {
    visible: true, alpha: FRONT_FADE_ALPHA, cameraFacing: true,
  });
});
