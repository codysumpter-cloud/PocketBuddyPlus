import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { PACK_SPRITES, packSpriteKeyForFile } from "@open-pets/buddy-domain";

/** A pack tile is a few KB; anything near this is not a tile. */
export const maxHomePackSpriteBytes = 512 * 1024;

/** Bounds on the pack walk, so pointing at a huge folder cannot hang the app. */
export const maxHomePackScanEntries = 20_000;
export const maxHomePackScanDepth = 4;

/** Where a purchased pack usually lands, checked before asking the user. */
export function homePackSearchRootsFrom(home: string, desktop: string): string[] {
  return [
    join(home, "Documents", "PAID PACKS"),
    join(home, "Documents"),
    join(home, "Downloads"),
    desktop,
  ];
}

/** A TinyHouse pack directory directly inside `root`, if there is one. */
export async function findHomePackDir(root: string): Promise<string | null> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (/tinyhouse/i.test(entry.name)) return join(root, entry.name);
    }
  } catch {
    // A missing or unreadable folder simply is not where the pack lives.
  }
  return null;
}

/**
 * Read the sprites Home uses out of a pack folder.
 *
 * The pack is paid art the user owns: nothing is copied into the app or the
 * repo, this only reads the handful of files Home maps. Names are matched
 * before any file is opened, so walking a 1,097-file pack still reads ~10.
 */
export async function readHomePackSprites(packDir: string): Promise<Record<string, string>> {
  const sprites: Record<string, string> = {};
  const wanted = Object.keys(PACK_SPRITES).length;
  let scanned = 0;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxHomePackScanDepth || scanned > maxHomePackScanEntries || Object.keys(sprites).length === wanted) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (scanned > maxHomePackScanEntries) return;
      scanned += 1;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full, depth + 1); continue; }
      if (!entry.isFile()) continue;
      const key = packSpriteKeyForFile(entry.name);
      if (!key || sprites[key]) continue;
      try {
        const info = await stat(full);
        if (!info.isFile() || info.size > maxHomePackSpriteBytes) continue;
        sprites[key] = `data:image/png;base64,${(await readFile(full)).toString("base64")}`;
      } catch {
        // One unreadable file must not fail the whole pack.
      }
    }
  };

  await walk(packDir, 0);
  return sprites;
}
