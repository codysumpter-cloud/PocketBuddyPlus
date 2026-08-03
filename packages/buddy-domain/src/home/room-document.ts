/**
 * Canonical Electron-native Home room document.
 *
 * This is intentionally renderer-independent. Godot, Pixi, React and future
 * renderers may present the room differently, but none of them own the room's
 * identity, item placement, surface names or revision history.
 */

export const HOME_ROOM_SCHEMA = "pocket-buddy-home-room-v1" as const;

export const WORLD_WALLS = ["north", "east", "south", "west"] as const;
export type WorldWall = (typeof WORLD_WALLS)[number];

export const SURFACE_IDS = [
  "floor",
  "wall_north",
  "wall_east",
  "wall_south",
  "wall_west",
] as const;
export type SurfaceId = (typeof SURFACE_IDS)[number];

export const ROOM_ORIENTATIONS = ["SE", "SW", "NW", "NE"] as const;
export type RoomOrientation = (typeof ROOM_ORIENTATIONS)[number];

/**
 * Cutaway modes, aligned to the donor `InteriorWallModel.CUTAWAY_MODES` in
 * prismtek-apps. This originally read "show"; cross-runtime parity found the
 * donor uses "always_show", which means a room saved by one runtime would have
 * been rejected by the other. The donor already has shipped v4 saves and this
 * schema is unreleased, so the TypeScript side moved.
 */
export const CUTAWAY_MODES = ["auto", "fade", "hide", "always_show"] as const;
export type CutawayMode = (typeof CUTAWAY_MODES)[number];

export interface GridCell {
  readonly x: number;
  readonly y: number;
}

export interface RoomOffset {
  readonly x: number;
  readonly y: number;
}

export interface RoomSurfaceState {
  readonly materialId: string | null;
}

export interface RoomItemPlacement {
  readonly surface: SurfaceId;
  readonly anchor: GridCell;
  readonly offset: RoomOffset;
  readonly rotationQuarter: 0 | 1 | 2 | 3;
  readonly scale: number;
  readonly footprint: {
    readonly width: number;
    readonly height: number;
  };
  readonly supportItemId: string | null;
}

export interface HomeRoomItem {
  readonly id: string;
  readonly assetId: string;
  readonly placement: RoomItemPlacement;
  readonly state: Readonly<Record<string, unknown>>;
}

export interface HomeRoomDocument {
  readonly schema: typeof HOME_ROOM_SCHEMA;
  readonly roomId: string;
  readonly revision: number;
  readonly width: number;
  readonly height: number;
  readonly orientation: RoomOrientation;
  readonly cutaway: CutawayMode;
  readonly surfaces: Readonly<Record<SurfaceId, RoomSurfaceState>>;
  readonly items: readonly HomeRoomItem[];
}

export class HomeRoomDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HomeRoomDocumentError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function integerInRange(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new HomeRoomDocumentError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function finiteInRange(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new HomeRoomDocumentError(`${label} must be a finite number from ${minimum} to ${maximum}`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HomeRoomDocumentError(`${label} must be a non-empty string`);
  }
  return value;
}

function parseCell(value: unknown, label: string, width: number, height: number): GridCell {
  if (!isRecord(value)) throw new HomeRoomDocumentError(`${label} must be an object`);
  return {
    x: integerInRange(value.x, `${label}.x`, 0, width - 1),
    y: integerInRange(value.y, `${label}.y`, 0, height - 1),
  };
}

function parseOffset(value: unknown, label: string): RoomOffset {
  if (!isRecord(value)) throw new HomeRoomDocumentError(`${label} must be an object`);
  return {
    x: finiteInRange(value.x, `${label}.x`, -4096, 4096),
    y: finiteInRange(value.y, `${label}.y`, -4096, 4096),
  };
}

function cloneJsonValue(value: unknown, label: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new HomeRoomDocumentError(`${label} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => cloneJsonValue(entry, `${label}[${index}]`));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry, `${label}.${key}`)]));
  }
  throw new HomeRoomDocumentError(`${label} must contain only JSON-safe values`);
}

function parseState(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new HomeRoomDocumentError(`${label} must be an object`);
  return cloneJsonValue(value, label) as Readonly<Record<string, unknown>>;
}

function parsePlacement(
  value: unknown,
  label: string,
  width: number,
  height: number,
): RoomItemPlacement {
  if (!isRecord(value)) throw new HomeRoomDocumentError(`${label} must be an object`);
  if (!isOneOf(value.surface, SURFACE_IDS)) {
    throw new HomeRoomDocumentError(`${label}.surface is not a canonical surface`);
  }
  const rotation = integerInRange(value.rotationQuarter, `${label}.rotationQuarter`, 0, 3);
  const footprint = value.footprint;
  if (!isRecord(footprint)) throw new HomeRoomDocumentError(`${label}.footprint must be an object`);
  const supportItemId = value.supportItemId;
  if (supportItemId !== null && typeof supportItemId !== "string") {
    throw new HomeRoomDocumentError(`${label}.supportItemId must be a string or null`);
  }
  return {
    surface: value.surface,
    anchor: parseCell(value.anchor, `${label}.anchor`, width, height),
    offset: parseOffset(value.offset, `${label}.offset`),
    rotationQuarter: rotation as 0 | 1 | 2 | 3,
    scale: finiteInRange(value.scale, `${label}.scale`, 0.1, 8),
    footprint: {
      width: integerInRange(footprint.width, `${label}.footprint.width`, 1, width),
      height: integerInRange(footprint.height, `${label}.footprint.height`, 1, height),
    },
    supportItemId,
  };
}

function parseItem(value: unknown, index: number, width: number, height: number): HomeRoomItem {
  const label = `items[${index}]`;
  if (!isRecord(value)) throw new HomeRoomDocumentError(`${label} must be an object`);
  return {
    id: nonEmptyString(value.id, `${label}.id`),
    assetId: nonEmptyString(value.assetId, `${label}.assetId`),
    placement: parsePlacement(value.placement, `${label}.placement`, width, height),
    state: parseState(value.state, `${label}.state`),
  };
}

function defaultSurfaces(): Record<SurfaceId, RoomSurfaceState> {
  return {
    floor: { materialId: null },
    wall_north: { materialId: null },
    wall_east: { materialId: null },
    wall_south: { materialId: null },
    wall_west: { materialId: null },
  };
}

export function createHomeRoomDocument(options: {
  readonly roomId: string;
  readonly width?: number;
  readonly height?: number;
}): HomeRoomDocument {
  const width = options.width ?? 4;
  const height = options.height ?? 3;
  integerInRange(width, "width", 1, 64);
  integerInRange(height, "height", 1, 64);
  return {
    schema: HOME_ROOM_SCHEMA,
    roomId: nonEmptyString(options.roomId, "roomId"),
    revision: 0,
    width,
    height,
    orientation: "SE",
    cutaway: "auto",
    surfaces: defaultSurfaces(),
    items: [],
  };
}

/** Strictly validates an untrusted saved document and returns a detached copy. */
export function parseHomeRoomDocument(value: unknown): HomeRoomDocument {
  if (!isRecord(value)) throw new HomeRoomDocumentError("room document must be an object");
  if (value.schema !== HOME_ROOM_SCHEMA) {
    throw new HomeRoomDocumentError(`unsupported room schema: ${String(value.schema)}`);
  }
  const width = integerInRange(value.width, "width", 1, 64);
  const height = integerInRange(value.height, "height", 1, 64);
  if (!isOneOf(value.orientation, ROOM_ORIENTATIONS)) {
    throw new HomeRoomDocumentError("orientation is invalid");
  }
  if (!isOneOf(value.cutaway, CUTAWAY_MODES)) {
    throw new HomeRoomDocumentError("cutaway is invalid");
  }
  if (!isRecord(value.surfaces)) throw new HomeRoomDocumentError("surfaces must be an object");
  const unknownSurfaces = Object.keys(value.surfaces).filter((key) => !(SURFACE_IDS as readonly string[]).includes(key));
  if (unknownSurfaces.length > 0) {
    throw new HomeRoomDocumentError(`surfaces contain non-canonical keys: ${unknownSurfaces.join(", ")}`);
  }
  const surfaces = defaultSurfaces();
  for (const surface of SURFACE_IDS) {
    const candidate = value.surfaces[surface];
    if (!isRecord(candidate)) throw new HomeRoomDocumentError(`surfaces.${surface} must be an object`);
    const materialId = candidate.materialId;
    if (materialId !== null && typeof materialId !== "string") {
      throw new HomeRoomDocumentError(`surfaces.${surface}.materialId must be a string or null`);
    }
    surfaces[surface] = { materialId };
  }
  if (!Array.isArray(value.items)) throw new HomeRoomDocumentError("items must be an array");
  const items = value.items.map((item, index) => parseItem(item, index, width, height));
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new HomeRoomDocumentError(`duplicate item id: ${item.id}`);
    ids.add(item.id);
  }
  for (const item of items) {
    const support = item.placement.supportItemId;
    if (support !== null && (!ids.has(support) || support === item.id)) {
      throw new HomeRoomDocumentError(`item ${item.id} has an invalid supportItemId`);
    }
  }
  return {
    schema: HOME_ROOM_SCHEMA,
    roomId: nonEmptyString(value.roomId, "roomId"),
    revision: integerInRange(value.revision, "revision", 0, Number.MAX_SAFE_INTEGER),
    width,
    height,
    orientation: value.orientation,
    cutaway: value.cutaway,
    surfaces,
    items,
  };
}

export function withRoomRevision(
  document: HomeRoomDocument,
  changes: Partial<Pick<HomeRoomDocument, "orientation" | "cutaway" | "surfaces" | "items">>,
): HomeRoomDocument {
  return parseHomeRoomDocument({
    ...document,
    ...changes,
    revision: document.revision + 1,
  });
}
