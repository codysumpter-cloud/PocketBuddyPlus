import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import sharp from "sharp";

import { importPixelLabExport, inspectPixelLabExport, normalizePetId, validateSafeZipPath } from "./index.js";

const fixtureRoot = await mkdtemp(join(tmpdir(), "openpets-pixellab-fixtures-"));
const fixture = join(fixtureRoot, "pixellab-3.1.zip");
const unsafe = join(fixtureRoot, "unsafe-traversal.zip");
await createFixtureArchive(fixture);
await writeStoredZip(unsafe, [{ name: "../escape.png", data: Buffer.from("escape") }]);
const inspection = await inspectPixelLabExport(fixture);
assert.equal(inspection.exportVersion, "3.1");
assert.equal(inspection.frameWidth, 8);
assert.equal(inspection.frameHeight, 8);
assert.ok(inspection.animations.some((animation) => animation.originalName === "Variable_Sixteen" && animation.frameCounts.south === 16));
assert.ok(inspection.animations.some((animation) => animation.originalName === "Bark" && animation.missingDirections.length === 5));
assert.ok(inspection.animations.some((animation) => animation.originalName === "Cat_Partial" && animation.missingDirections.length === 7));
assert.deepEqual(inspection.animations.find((animation) => animation.originalName === "ani_walk")?.missingIndices.south, [4]);
assert.equal(normalizePetId("Balinese Cat 2"), "balinese-cat-2");
assert.equal(inspection.animations.find((animation) => animation.originalName === "Variable_Sixteen")?.id, "variable-sixteen");
assert.throws(() => validateSafeZipPath("../escape.png"));
assert.throws(() => validateSafeZipPath("C:/escape.png"));
assert.throws(() => validateSafeZipPath("folder\\escape.png"));
await assert.rejects(() => inspectPixelLabExport(unsafe), /Unsafe ZIP path|invalid relative path/);

const output = await mkdtemp(join(tmpdir(), "openpets-pixellab-"));
try {
  const result = await importPixelLabExport(fixture, join(output, "pet"), {
    package: {
      petId: "fixture-pet",
      expectedArchiveName: "pixellab-3.1.zip",
      displayName: "Fixture Pet",
      description: "Synthetic PixelLab importer fixture.",
      semanticDefaults: { idle: "Idle", running: "Variable_Sixteen", waving: "Bark" },
      motionMappings: { "running-left": "Variable_Sixteen", "running-right": "Variable_Sixteen" },
      blockedGenerationSemantics: ["waving", "jumping"],
    },
    repairMissingIndexedFrames: true,
  });
  assert.equal(result.manifest.version, "pocket-buddy-animation-manifest-v1");
  await assert.rejects(() => importPixelLabExport(fixture, join(output, "wrong-hash"), { package: { petId: "wrong-hash", expectedArchiveSha256: "0".repeat(64), displayName: "Wrong", description: "Wrong" } }), /archive hash mismatch/);
  assert.equal(result.manifest.frameWidth, 8);
  assert.equal(result.manifest.animations.find((animation) => animation.id === "variable-sixteen")?.frameCount, 16);
  assert.equal(result.manifest.animations.find((animation) => animation.id === "bark")?.complete, false);
  assert.equal(result.manifest.semanticDefaults.waving, result.manifest.semanticDefaults.idle, "incomplete semantic mapping must not be selected");
  const walk = result.manifest.animations.find((animation) => animation.id === "ani-walk");
  assert.equal(walk?.frames.south?.length, 8);
  assert.equal(walk?.frames.south?.[4]?.repairedFrom?.endsWith("frame_003.png"), true);
  assert.equal(result.repairs.length, 1);
  assert.equal(result.repairs[0]?.missingIndex, 4);
  assert.equal((await readFile(join(output, "pet", "animations/ani-walk/south/frame_004.png"))).equals(await readFile(join(output, "pet", "animations/ani-walk/south/frame_003.png"))), true);
  assert.ok(result.files.some((file) => file.path === "animation-manifest.json"));
  assert.ok(result.files.some((file) => file.path === "contact-sheet.png"));
  assert.ok(result.files.some((file) => file.path === "spritesheet.webp"));
  assert.ok(result.manifest.animations.every((animation) => animation.originalName.length > 0));
} finally {
  await rm(output, { recursive: true, force: true });
}
await rm(fixtureRoot, { recursive: true, force: true });
console.log("PixelLab export 3.1 importer contract passed.");


async function createFixtureArchive(path: string): Promise<void> {
  const directions = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"] as const;
  const entries: Array<{ name: string; data: Buffer }> = [];
  const makePng = async (seed: number): Promise<Buffer> => {
    const data = Buffer.alloc(8 * 8 * 4);
    for (let y = 2; y <= 5; y += 1) for (let x = 2; x <= 5; x += 1) {
      const offset = (y * 8 + x) * 4;
      data[offset] = (40 + seed * 7) % 255;
      data[offset + 1] = (120 + seed * 11) % 255;
      data[offset + 2] = (200 + seed * 13) % 255;
      data[offset + 3] = 255;
    }
    return sharp(data, { raw: { width: 8, height: 8, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  };
  const framePath = (animation: string, direction: string, index: number) => `Main/animations/${animation}/${direction}/frame_${String(index).padStart(3, "0")}.png`;
  const animations: Record<string, Record<string, string[]>> = {};
  const addAnimation = async (name: string, selected: readonly string[], countFor: (direction: string) => number, missing?: (direction: string, index: number) => boolean) => {
    const byDirection: Record<string, string[]> = {};
    for (const direction of selected) {
      const paths: string[] = [];
      const count = countFor(direction);
      for (let index = 0; index < count; index += 1) {
        if (missing?.(direction, index)) continue;
        const sourceIndex = missing && direction === "south" && index > 4 ? index : index;
        const namePath = framePath(name, direction, sourceIndex);
        paths.push(namePath);
        entries.push({ name: namePath, data: await makePng(index + selected.indexOf(direction) * 17) });
      }
      byDirection[direction] = paths;
    }
    animations[name] = byDirection;
  };
  const rotations: Record<string, string> = {};
  for (const [index, direction] of directions.entries()) {
    const source = `Main/rotations/${direction}.png`;
    rotations[direction] = source;
    entries.push({ name: source, data: await makePng(index) });
  }
  await addAnimation("Idle", directions, () => 2);
  await addAnimation("Variable_Sixteen", directions, (direction) => direction === "south" ? 16 : 8);
  await addAnimation("Bark", ["south", "south-east", "south-west"], () => 4);
  await addAnimation("Cat_Partial", ["south"], () => 4);
  await addAnimation("ani_walk", directions, () => 8, (direction, index) => direction === "south" && index === 4);
  const metadata = {
    export_version: "3.1",
    group_id: "fixture",
    states: [{
      character: { id: "fixture", name: "Fixture Pet", size: { width: 8, height: 8 }, directions: 8, created_at: "2026-08-05T00:00:00.000Z" },
      folder: "Main",
      frames: { rotations, animations },
    }],
  };
  entries.unshift({ name: "metadata.json", data: Buffer.from(JSON.stringify(metadata, null, 2)) });
  await writeStoredZip(path, entries);
}

async function writeStoredZip(path: string, entries: readonly { name: string; data: Buffer }[]): Promise<void> {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  await writeFile(path, Buffer.concat([...localParts, ...centralParts, end]));
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
