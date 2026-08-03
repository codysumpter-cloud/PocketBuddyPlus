/**
 * Stages the private Tiny House content pack for packaging.
 *
 * The pack is PURCHASED ART (Pixel Salvaje, TinyHouse 0.17). It lives outside
 * this repository and must never be committed here, because this repository is
 * public. This script copies it into a gitignored staging directory that
 * electron-builder then bundles via `extraResources`, so licensed art reaches
 * the built application without ever reaching git.
 *
 * The staging directory is always created, even when no pack is found. That
 * keeps `extraResources` valid on a machine without the licensed art, and Home
 * simply falls back to placeholder geometry at runtime.
 *
 * Override the source with POCKET_BUDDY_PLUS_TINYHOUSE_SRC.
 */
import { cp, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, "..");
const stageDir = join(desktopRoot, ".content-pack", "tinyhouse");

const sources = [
  process.env.POCKET_BUDDY_PLUS_TINYHOUSE_SRC,
  resolve(
    desktopRoot,
    "..",
    "..",
    "..",
    "prismtek-apps",
    "apps",
    "prismtek-buddies-desktop",
    "public",
    "tinyhouse",
  ),
].filter(Boolean);

const source = sources.find((candidate) => existsSync(join(candidate, "catalog.json")));

await rm(stageDir, { recursive: true, force: true });
await mkdir(stageDir, { recursive: true });

if (!source) {
  console.warn(
    "content pack: NOT FOUND — packaging without licensed Tiny House art.\n" +
      "  Home will fall back to placeholder geometry.\n" +
      `  Looked in:\n${sources.map((s) => `    ${s}`).join("\n")}\n` +
      "  Set POCKET_BUDDY_PLUS_TINYHOUSE_SRC to override.",
  );
  process.exit(0);
}

await cp(source, stageDir, { recursive: true });

const catalog = JSON.parse(
  await (await import("node:fs/promises")).readFile(join(stageDir, "catalog.json"), "utf8"),
);
const counts = ["items", "floors", "walls"].map((key) => `${Array.isArray(catalog[key]) ? catalog[key].length : 0} ${key}`);
const files = (await readdir(stageDir, { recursive: true })).filter((entry) => /\.(png|webp|gif)$/i.test(entry));

console.log(`content pack staged from ${source}`);
console.log(`  catalog: ${counts.join(", ")}`);
console.log(`  art: ${files.length} file(s) -> ${stageDir}`);
