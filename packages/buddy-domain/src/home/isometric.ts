import {
  ROOM_ORIENTATIONS,
  type GridCell,
  type RoomOrientation,
  type WorldWall,
} from "./room-document.js";

export interface RoomSize {
  readonly width: number;
  readonly height: number;
}

export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
}

const NEAR_WALLS: Readonly<Record<RoomOrientation, readonly WorldWall[]>> = Object.freeze({
  SE: ["east", "south"],
  SW: ["south", "west"],
  NW: ["west", "north"],
  NE: ["north", "east"],
});

export function orientationQuarter(orientation: RoomOrientation): 0 | 1 | 2 | 3 {
  return ROOM_ORIENTATIONS.indexOf(orientation) as 0 | 1 | 2 | 3;
}

export function rotateOrientation(
  orientation: RoomOrientation,
  deltaQuarter: number,
): RoomOrientation {
  const current = orientationQuarter(orientation);
  const normalized = ((current + Math.trunc(deltaQuarter)) % 4 + 4) % 4;
  return ROOM_ORIENTATIONS[normalized] as RoomOrientation;
}

export function presentedRoomSize(size: RoomSize, orientation: RoomOrientation): RoomSize {
  const quarter = orientationQuarter(orientation);
  return quarter % 2 === 0
    ? { width: size.width, height: size.height }
    : { width: size.height, height: size.width };
}

/**
 * Rotates a canonical room cell into the current presentation grid without
 * mutating canonical world state. Four quarter-turns return the exact cell.
 */
export function rotateCanonicalCell(
  cell: GridCell,
  size: RoomSize,
  orientation: RoomOrientation,
): GridCell {
  switch (orientationQuarter(orientation)) {
    case 0:
      return { x: cell.x, y: cell.y };
    case 1:
      return { x: size.height - 1 - cell.y, y: cell.x };
    case 2:
      return { x: size.width - 1 - cell.x, y: size.height - 1 - cell.y };
    case 3:
      return { x: cell.y, y: size.width - 1 - cell.x };
  }
}

export function projectPresentedCell(
  cell: GridCell,
  tileWidth = 64,
  tileHeight = 32,
): ProjectedPoint {
  if (!(tileWidth > 0) || !(tileHeight > 0)) {
    throw new RangeError("tile dimensions must be positive");
  }
  return {
    x: (cell.x - cell.y) * (tileWidth / 2),
    y: (cell.x + cell.y) * (tileHeight / 2),
  };
}

export function projectCanonicalCell(
  cell: GridCell,
  size: RoomSize,
  orientation: RoomOrientation,
  tileWidth = 64,
  tileHeight = 32,
): ProjectedPoint {
  return projectPresentedCell(
    rotateCanonicalCell(cell, size, orientation),
    tileWidth,
    tileHeight,
  );
}

export function nearWalls(orientation: RoomOrientation): readonly WorldWall[] {
  return NEAR_WALLS[orientation];
}

export function isNearWall(wall: WorldWall, orientation: RoomOrientation): boolean {
  return nearWalls(orientation).includes(wall);
}

export function wallDepthBand(
  wall: WorldWall,
  orientation: RoomOrientation,
): "near" | "rear" {
  return isNearWall(wall, orientation) ? "near" : "rear";
}
