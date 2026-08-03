/**
 * Renderer-side view of the Tiny House content pack.
 *
 * The pack is licensed art that ships only in private builds. Everything here
 * tolerates its absence: when the pack is missing, `loadHomeContentPack()`
 * resolves to null and Home draws placeholder geometry instead. That fallback
 * is what keeps this repository publicly distributable.
 *
 * The renderer never sees a filesystem path. Main returns parsed catalog JSON,
 * and art is fetched over the `openpets-home-asset:` scheme.
 */

export interface PackItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /** Fraction of the sprite height that sits below the tile centre. */
  readonly anchor: number;
  readonly scale: number;
}

export interface PackSurface {
  readonly id: string;
  readonly name: string;
  readonly src: string;
}

/**
 * A wall dressing has two faces.
 *
 * The catalog names them `left` and `right`, which is the same legacy v4
 * presentation vocabulary the domain parses: **left is the west wall, right is
 * the north wall**. They are mapped once, here, so the rest of the renderer can
 * speak in world walls.
 */
export interface PackWall {
  readonly id: string;
  readonly name: string;
  readonly west: string;
  readonly north: string;
}

export interface HomeContentPack {
  readonly categories: readonly string[];
  readonly items: readonly PackItem[];
  readonly floors: readonly PackSurface[];
  readonly walls: readonly PackWall[];
}

const ASSET_SCHEME = "openpets-home-asset";

/** Renderer URL for a catalog `src` such as `/tinyhouse/items/x.png`. */
export function assetUrl(src: string): string {
  return `${ASSET_SCHEME}://asset/${src.replace(/^\/+/, "")}`;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseItem(raw: unknown): PackItem | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const id = str(entry.id);
  const src = str(entry.src);
  if (!id || !src) return null;
  return {
    id,
    name: str(entry.name) ?? id,
    category: str(entry.category) ?? "Other",
    src,
    width: num(entry.width, 64),
    height: num(entry.height, 64),
    anchor: num(entry.anchor, 0.5),
    scale: num(entry.scale, 1),
  };
}

function parseSurface(raw: unknown): PackSurface | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const id = str(entry.id);
  const src = str(entry.src);
  if (!id || !src) return null;
  return { id, name: str(entry.name) ?? id, src };
}

function parseWall(raw: unknown): PackWall | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const id = str(entry.id);
  // left -> west, right -> north. Inverting this mirrors every dressed room.
  const west = str(entry.left);
  const north = str(entry.right);
  if (!id || !west || !north) return null;
  return { id, name: str(entry.name) ?? id, west, north };
}

/**
 * Ask main for the catalog and normalise it.
 *
 * Returns null when there is no pack, when the bridge is unavailable, or when
 * the catalog yields no usable floors -- a pack that cannot dress a floor is
 * not usable, and silently half-applying it would look like a rendering bug.
 */
export async function loadHomeContentPack(): Promise<HomeContentPack | null> {
  const bridge = (globalThis as { openPetsControlCenter?: { getHomeCatalog?: () => Promise<unknown> } }).openPetsControlCenter;
  if (!bridge?.getHomeCatalog) return null;

  let raw: unknown;
  try {
    raw = await bridge.getHomeCatalog();
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;

  const catalog = raw as Record<string, unknown>;
  const items = Array.isArray(catalog.items) ? catalog.items.map(parseItem).filter((e): e is PackItem => e !== null) : [];
  const floors = Array.isArray(catalog.floors)
    ? catalog.floors.map(parseSurface).filter((e): e is PackSurface => e !== null)
    : [];
  const walls = Array.isArray(catalog.walls) ? catalog.walls.map(parseWall).filter((e): e is PackWall => e !== null) : [];
  if (floors.length === 0) return null;

  const categories = Array.isArray(catalog.categories)
    ? catalog.categories.filter((entry): entry is string => typeof entry === "string")
    : [...new Set(items.map((item) => item.category))].sort();

  return { categories, items, floors, walls };
}
