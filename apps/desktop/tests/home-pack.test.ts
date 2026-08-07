/**
 * The TinyHouse pack is paid art the user owns and is not in this repo, so
 * these build a fake pack on disk with the same shape: nested folders, many
 * files, only a few of which Home uses.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, before, after } from "node:test";

import { findHomePackDir, homePackSearchRootsFrom, maxHomePackSpriteBytes, readHomePackSprites } from "../src/home-pack.js";

let root = "";
let packDir = "";

describe("TinyHouse pack scanning", () => {
  before(async () => {
    root = await mkdtemp(join(tmpdir(), "openpets-pack-"));
    packDir = join(root, "TinyHouse_0.17(@Pixel_Salvaje)");
    await mkdir(join(packDir, "Bedroom"), { recursive: true });
    await mkdir(join(packDir, "Floor_Wall_Tiles_64"), { recursive: true });
    await mkdir(join(packDir, "Plants"), { recursive: true });

    await writeFile(join(packDir, "Bedroom", "Bed_A_4.png"), "bed-bytes");
    await writeFile(join(packDir, "Floor_Wall_Tiles_64", "Floor_64_WoodHard.png"), "floor-bytes");
    await writeFile(join(packDir, "Plants", "Plant_1.png"), "plant-bytes");
    // Files Home has no use for, which must never be read.
    for (let index = 0; index < 50; index += 1) {
      await writeFile(join(packDir, "Plants", `Cactus_${index}.png`), "x".repeat(1000));
    }
    // A file with the right name but far too large to be a tile.
    await mkdir(join(packDir, "Desks"), { recursive: true });
    await writeFile(join(packDir, "Desks", "Table_10.png"), "z".repeat(maxHomePackSpriteBytes + 1));
  });

  after(async () => { await rm(root, { recursive: true, force: true }); });

  it("finds the pack folder by name inside a parent directory", async () => {
    assert.equal(await findHomePackDir(root), packDir);
  });

  it("returns null when no pack is there, rather than guessing", async () => {
    assert.equal(await findHomePackDir(join(root, "nope")), null);
  });

  it("reads sprites out of the pack's nested folders", async () => {
    const sprites = await readHomePackSprites(packDir);
    assert.equal(sprites["home.bed.basic"], `data:image/png;base64,${Buffer.from("bed-bytes").toString("base64")}`);
    assert.ok(sprites["floor.wood"], "floor tiles are found in their own subfolder");
    assert.ok(sprites["home.plant.basic"], "plants are found alongside files Home ignores");
  });

  it("ignores files Home does not map, however many there are", async () => {
    const sprites = await readHomePackSprites(packDir);
    // The pack ships ~1,100 files; only Home's own sprites may come back.
    assert.equal(Object.keys(sprites).length, 3);
  });

  it("refuses a sprite that is too large to be a tile", async () => {
    const sprites = await readHomePackSprites(packDir);
    assert.equal(sprites["home.table.basic"], undefined, "an oversized file must not be loaded");
  });

  it("returns nothing for a folder that is not a pack, without throwing", async () => {
    assert.deepEqual(await readHomePackSprites(join(root, "missing")), {});
  });

  it("looks in the places a purchased pack actually lands", async () => {
    const roots = homePackSearchRootsFrom("/Users/someone", "/Users/someone/Desktop");
    assert.ok(roots.includes(join("/Users/someone", "Documents", "PAID PACKS")));
    assert.ok(roots.includes(join("/Users/someone", "Downloads")));
  });
});
