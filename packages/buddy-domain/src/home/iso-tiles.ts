/**
 * Isometric tile mapping, ported from the Godot Home runtime.
 *
 * Donor: `prismtek-apps/apps/prismtek-buddies-godot/scripts/IsoTileRoom.gd`,
 * whose layers are real `TileMapLayer`s using `TILE_SHAPE_ISOMETRIC` with
 * `TILE_LAYOUT_DIAMOND_DOWN` at a 128x64 tile.
 *
 * This is a parity port. The projection is not re-derived from first
 * principles: the oracle records Godot's own `map_to_local` output and the
 * numbers here are diffed against it, because an isometric renderer that is
 * subtly off does not fail, it just looks wrong in a way nobody can name.
 */
import { CAMERA_CORNERS, WORLD_WALLS, type CameraCorner, type WorldWall } from "./room-document.js";
import { isNearWall } from "./isometric.js";

/** Donor `TinyHouseTileSetFactory.TILE_SIZE`. */
export const TILE_WIDTH = 128;
export const TILE_HEIGHT = 64;

/**
 * Where furniture feet belong on a floor cell, relative to its map_to_local.
 *
 * Measured in the donor, not guessed: the floor atlas is 128x128 while the tile
 * is 128x64 with texture_origin (0, 0), so Godot centres the texture and frame
 * point (64, 64) lands on the cell centre. The kit's walkable top face is
 * centred at (64, 67.5), putting the standing plane 3.5px below.
 */
export const FLOOR_GROUND_OFFSET = Object.freeze({ x: 0, y: 3.5 });

/** Donor `IsoTileRoom.ITEM_SNAP`. */
export const ITEM_SNAP = 16;

/**
 * Depth bands, all in front of the background at -4000.
 *
 * A wall's band depends on which side of the room it is on: "behind the floor"
 * is only right for walls the camera looks AT. A single constant band made
 * walls vanish under the floor as the room turned.
 */
export const FLOOR_Z = -2400;
export const WALL_REAR_Z = -2600;
export const WALL_NEAR_Z = -1200;

export interface TileCell {
  readonly x: number;
  readonly y: number;
}

export interface LocalPoint {
  readonly x: number;
  readonly y: number;
}

const HALF_WIDTH = TILE_WIDTH / 2;
const HALF_HEIGHT = TILE_HEIGHT / 2;

/**
 * Cell centre in room-local pixels, matching Godot `map_to_local`.
 *
 * DIAMOND_DOWN places cell (0,0) at half a tile in from the origin, which is
 * why both terms carry a half-tile offset -- dropping it shifts the whole room
 * by half a tile and every hit test with it.
 */
export function mapToLocal(cell: TileCell): LocalPoint {
  return {
    x: (cell.x - cell.y) * HALF_WIDTH + HALF_WIDTH,
    y: (cell.x + cell.y) * HALF_HEIGHT + HALF_HEIGHT,
  };
}

/** Inverse of {@link mapToLocal}, matching Godot `local_to_map`. */
export function localToMap(point: LocalPoint): TileCell {
  const dx = (point.x - HALF_WIDTH) / HALF_WIDTH;
  const dy = (point.y - HALF_HEIGHT) / HALF_HEIGHT;
  return {
    x: Math.floor((dx + dy) / 2 + 0.5),
    y: Math.floor((dy - dx) / 2 + 0.5),
  };
}

/** The standing plane for anything placed on a floor cell. */
export function floorGroundPosition(cell: TileCell): LocalPoint {
  const local = mapToLocal(cell);
  return { x: local.x + FLOOR_GROUND_OFFSET.x, y: local.y + FLOOR_GROUND_OFFSET.y };
}

/**
 * Canonical wall cells for a room.
 *
 * The TinyHouse kit's left/right wall art is a PRESENTATION axis, not an
 * identity: left art is laid down the west column, right art across the north
 * row. Camera orbit re-selects which art faces the viewer; it never renames a
 * player-owned wall.
 */
export function wallCells(width: number, height: number): { left: TileCell[]; right: TileCell[] } {
  const left: TileCell[] = [];
  for (let y = 0; y < height; y += 1) left.push({ x: 0, y });
  const right: TileCell[] = [];
  for (let x = 0; x < width; x += 1) right.push({ x, y: 0 });
  return { left, right };
}

/** World wall each presentation axis belongs to. Inverting this mirrors rooms. */
export const LEFT_WORLD_WALL: WorldWall = "west";
export const RIGHT_WORLD_WALL: WorldWall = "north";

export interface WallDepth {
  readonly cameraFacing: boolean;
  readonly z: number;
}

/** Per-wall depth band for a camera corner, plus the floor's fixed band. */
export function wallDepthBands(cameraCorner: CameraCorner): Record<string, WallDepth | { z: number }> {
  const out: Record<string, WallDepth | { z: number }> = {};
  for (const wall of WORLD_WALLS) {
    const cameraFacing = isNearWall(wall, cameraCorner);
    out[wall] = { cameraFacing, z: cameraFacing ? WALL_NEAR_Z : WALL_REAR_Z };
  }
  out.floor = { z: FLOOR_Z };
  return out;
}

/** Snap a free position to the donor's furniture grid. */
export function snapToItemGrid(point: LocalPoint): LocalPoint {
  return {
    x: Math.round(point.x / ITEM_SNAP) * ITEM_SNAP,
    y: Math.round(point.y / ITEM_SNAP) * ITEM_SNAP,
  };
}

export { CAMERA_CORNERS };

/** TypeScript half of the `home.iso.tiles` parity trace. */
export function runIsoTileParityScenario(width = 5, height = 3): {
  scenarioId: string;
  steps: Array<{ atMs: number; input: unknown; snapshot: unknown; events: unknown[] }>;
} {
  const key = (c: TileCell) => `${c.x},${c.y}`;
  const grid = <T,>(fn: (cell: TileCell) => T) => {
    const out: Record<string, T> = {};
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) out[key({ x, y })] = fn({ x, y });
    return out;
  };

  const steps: Array<{ atMs: number; input: unknown; snapshot: unknown; events: unknown[] }> = [];
  let atMs = 0;
  const push = (input: unknown, snapshot: unknown) => {
    steps.push({ atMs, input, snapshot, events: [] });
    atMs += 100;
  };

  push({ op: "tileGeometry" }, {
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    shape: "isometric",
    layout: "diamond_down",
    floorGroundOffsetX: FLOOR_GROUND_OFFSET.x,
    floorGroundOffsetY: FLOOR_GROUND_OFFSET.y,
    itemSnap: ITEM_SNAP,
    floorZ: FLOOR_Z,
    wallRearZ: WALL_REAR_Z,
    wallNearZ: WALL_NEAR_Z,
  });
  push({ op: "mapToLocal", width, height }, grid(mapToLocal));
  push({ op: "localToMapRoundTrip", width, height }, grid((cell) => localToMap(mapToLocal(cell))));
  push({ op: "floorGroundPositions", width, height }, grid(floorGroundPosition));

  const walls = wallCells(width, height);
  push({ op: "wallCells", width, height }, {
    left: walls.left,
    right: walls.right,
    leftWorldWall: LEFT_WORLD_WALL,
    rightWorldWall: RIGHT_WORLD_WALL,
  });

  for (const corner of CAMERA_CORNERS) {
    push({ op: "wallDepthBands", cameraCorner: corner }, wallDepthBands(corner));
  }

  return { scenarioId: "home.iso.tiles", steps };
}
