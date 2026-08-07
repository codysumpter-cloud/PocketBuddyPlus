/**
 * The TinyHouse pack is paid art the user owns and is not in this repo, so
 * these tests cover the mapping rules rather than the files themselves.
 *
 * This mapping is shared: the in-app Home and the Home plugin both render from
 * it, so a mistake here shows up in both.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PACK_FLOORS, PACK_ITEMS, PACK_SPRITES, PACK_TILE_SIZE, packCoverage, packSpriteKeyForFile } from "../src/home/pack-mapping.js";
import { HOME_PUBLIC_ASSETS } from "../src/home/content-catalog.js";

describe("TinyHouse pack mapping", () => {
  it("maps only asset ids Home actually defines", () => {
    const known = new Set(HOME_PUBLIC_ASSETS.map((asset) => asset.assetId));
    for (const assetId of Object.keys(PACK_ITEMS)) {
      assert.ok(known.has(assetId), `${assetId} is mapped to a sprite but is not a Home asset`);
    }
  });

  it("keeps sprite filenames unique, since matching is by bare filename", () => {
    const files = Object.values(PACK_SPRITES);
    assert.equal(new Set(files).size, files.length, "two asset ids must not claim the same pack file");
  });

  it("resolves a picked file to its sprite, with or without a directory prefix", () => {
    assert.equal(packSpriteKeyForFile("Bed_A_4.png"), "home.bed.basic");
    assert.equal(packSpriteKeyForFile("Bedroom/Bed_A_4.png"), "home.bed.basic");
    assert.equal(packSpriteKeyForFile("  bed_a_4.PNG  "), "home.bed.basic", "matching tolerates case and stray whitespace");
    assert.equal(packSpriteKeyForFile("Floor_64_Sea.png"), "floor.water");
  });

  it("refuses files Home has no use for, so a whole-pack selection is not read", () => {
    // The expected gesture is selecting all 1,097 files; reading them all would
    // be the bug, so everything unmapped has to be rejected on name alone.
    for (const name of ["Cactus_2.png", "Poster_Medical.png", "notes.txt", "", "Bed_A_4.png.bak"]) {
      assert.equal(packSpriteKeyForFile(name), null, `${name} must not match a Home sprite`);
    }
  });

  it("reports coverage over distinct sprites, not file count", () => {
    const duplicated = ["Bed_A_4.png", "Bedroom/Bed_A_4.png", "Cactus_2.png"];
    assert.deepEqual(packCoverage(duplicated), { found: 1, total: Object.keys(PACK_SPRITES).length });
    assert.deepEqual(packCoverage([]), { found: 0, total: Object.keys(PACK_SPRITES).length });
  });

  it("covers every floor material the brush offers", () => {
    for (const material of ["floor.wood", "floor.stone", "floor.grass", "floor.water"]) {
      assert.ok(PACK_FLOORS[material], `${material} has no pack tile, so painting it would drop back to a flat colour`);
    }
  });

  it("declares the tile size the sprites are authored at", () => {
    // Home draws a 72x36 diamond; the pack is authored at 64x32. Both are 2:1,
    // which is why sprites scale without reprojection.
    assert.equal(PACK_TILE_SIZE, 64);
  });
});
