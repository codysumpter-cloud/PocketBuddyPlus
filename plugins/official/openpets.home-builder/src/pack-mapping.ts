// Mapping from Home's own asset ids to sprite files in the TinyHouse pack.
//
// The pack is paid art. It is NOT redistributed with this plugin and nothing
// from it is committed: the user points at their own copy, the host reads the
// handful of files named here, and the bytes stay on their machine. That is the
// same boundary games/tinyhouse-local keeps.
//
// Matching is by bare filename because the file picker hands the plugin a name
// and a reader, not a path. Every name below was checked to be unique within
// the pack, so a match cannot pull the wrong sprite from another folder.
//
// The art lines up with Home's projection already: pack floor tiles are 64x64
// with a 2:1 isometric diamond, and Home draws on a 72x36 diamond - the same
// ratio, so sprites scale by TILE_WIDTH / 64 with no reprojection.

/** Source tile width the pack is authored at. */
export const PACK_TILE_SIZE = 64;

/** Floor material id → pack file. */
export const PACK_FLOORS: Readonly<Record<string, string>> = {
  "floor.wood": "Floor_64_WoodHard.png",
  "floor.stone": "Floor_64_Concrete.png",
  "floor.grass": "Floor_64_Green.png",
  "floor.water": "Floor_64_Sea.png",
};

/**
 * Home asset id → pack file.
 *
 * `home.toy.ball` has no counterpart in the pack, so it is deliberately absent
 * and keeps its drawn circle. A missing entry is a supported state, not a gap
 * to paper over with a wrong-looking sprite.
 */
export const PACK_ITEMS: Readonly<Record<string, string>> = {
  "home.bed.basic": "Bed_A_4.png",
  "home.tv.basic": "BigTV_3_Off_Tile.png",
  "home.chair.basic": "Chair_2_A_Tile.png",
  "home.table.basic": "Table_10.png",
  "home.plant.basic": "Plant_1.png",
  "home.food-bowl.basic": "Dish.png",
};

/** Every file the plugin will read, keyed by the id the scene draws it for. */
export const PACK_SPRITES: Readonly<Record<string, string>> = { ...PACK_FLOORS, ...PACK_ITEMS };

/** Reverse index so the host can filter a large multi-selection cheaply. */
const KEY_BY_FILENAME = new Map(Object.entries(PACK_SPRITES).map(([key, file]) => [file.toLowerCase(), key]));

/**
 * The sprite key a picked file provides, or null if Home has no use for it.
 * The picker returns bare names, and the user may well select the whole pack,
 * so this is what keeps the plugin from reading 1,097 files it does not want.
 */
export function packSpriteKeyForFile(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return KEY_BY_FILENAME.get(base.trim().toLowerCase()) ?? null;
}

/** How many of Home's sprites a selection covers, for user-facing feedback. */
export function packCoverage(fileNames: readonly string[]): { readonly found: number; readonly total: number } {
  const keys = new Set<string>();
  for (const name of fileNames) {
    const key = packSpriteKeyForFile(name);
    if (key) keys.add(key);
  }
  return { found: keys.size, total: Object.keys(PACK_SPRITES).length };
}
