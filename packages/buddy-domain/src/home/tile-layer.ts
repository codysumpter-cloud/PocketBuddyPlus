import type { GridCell, HomeRoomDocument } from "./room-document.js";

export const HOME_FLOOR_LAYER_SCHEMA = "pocket-buddy-home-floor-v1" as const;

export interface HomeFloorTileLayer {
  readonly schema: typeof HOME_FLOOR_LAYER_SCHEMA;
  readonly defaultMaterialId: string;
  readonly overrides: Readonly<Record<string, string>>;
}

export class HomeFloorTileLayerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HomeFloorTileLayerError";
  }
}

export function floorCellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`;
}

export function createHomeFloorTileLayer(defaultMaterialId = "floor.wood"): HomeFloorTileLayer {
  const material = normalizeMaterialId(defaultMaterialId, "defaultMaterialId");
  return {
    schema: HOME_FLOOR_LAYER_SCHEMA,
    defaultMaterialId: material,
    overrides: {},
  };
}

export function floorMaterialAt(layer: HomeFloorTileLayer, cell: GridCell): string {
  return layer.overrides[floorCellKey(cell)] ?? layer.defaultMaterialId;
}

export function paintHomeFloorTile(
  room: Pick<HomeRoomDocument, "width" | "height">,
  layer: HomeFloorTileLayer,
  cell: GridCell,
  materialId: string,
): HomeFloorTileLayer {
  assertCellInRoom(room, cell);
  const material = normalizeMaterialId(materialId, "materialId");
  const key = floorCellKey(cell);
  const next = { ...layer.overrides };
  if (material === layer.defaultMaterialId) delete next[key];
  else next[key] = material;
  return { ...layer, overrides: next };
}

export function resetHomeFloorTile(
  room: Pick<HomeRoomDocument, "width" | "height">,
  layer: HomeFloorTileLayer,
  cell: GridCell,
): HomeFloorTileLayer {
  assertCellInRoom(room, cell);
  const key = floorCellKey(cell);
  if (!(key in layer.overrides)) return layer;
  const next = { ...layer.overrides };
  delete next[key];
  return { ...layer, overrides: next };
}

export function parseHomeFloorTileLayer(
  value: unknown,
  room: Pick<HomeRoomDocument, "width" | "height">,
): HomeFloorTileLayer {
  if (!isRecord(value) || value.schema !== HOME_FLOOR_LAYER_SCHEMA) {
    throw new HomeFloorTileLayerError("floor layer schema is invalid");
  }
  const defaultMaterialId = normalizeMaterialId(value.defaultMaterialId, "defaultMaterialId");
  if (!isRecord(value.overrides)) {
    throw new HomeFloorTileLayerError("overrides must be an object");
  }

  const overrides: Record<string, string> = {};
  for (const [key, materialValue] of Object.entries(value.overrides)) {
    const cell = parseCellKey(key);
    assertCellInRoom(room, cell);
    const materialId = normalizeMaterialId(materialValue, `overrides.${key}`);
    if (materialId !== defaultMaterialId) overrides[key] = materialId;
  }

  return {
    schema: HOME_FLOOR_LAYER_SCHEMA,
    defaultMaterialId,
    overrides,
  };
}

function assertCellInRoom(
  room: Pick<HomeRoomDocument, "width" | "height">,
  cell: GridCell,
): void {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    throw new HomeFloorTileLayerError("tile coordinates must be integers");
  }
  if (cell.x < 0 || cell.y < 0 || cell.x >= room.width || cell.y >= room.height) {
    throw new HomeFloorTileLayerError(`tile ${floorCellKey(cell)} is outside the room`);
  }
}

function parseCellKey(key: string): GridCell {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) throw new HomeFloorTileLayerError(`invalid tile key: ${key}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function normalizeMaterialId(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new HomeFloorTileLayerError(`${label} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new HomeFloorTileLayerError(`${label} must contain 1 to 120 characters`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
