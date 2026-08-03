import {
  CAMERA_CORNERS,
  type GridCell,
  type CameraCorner,
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

const NEAR_WALLS: Readonly<Record<CameraCorner, readonly WorldWall[]>> = Object.freeze({
  SE: ["east", "south"],
  SW: ["south", "west"],
  NW: ["west", "north"],
  NE: ["north", "east"],
});

export function cornerQuarter(cameraCorner: CameraCorner): 0 | 1 | 2 | 3 {
  return CAMERA_CORNERS.indexOf(cameraCorner) as 0 | 1 | 2 | 3;
}

export function rotateCameraCorner(
  cameraCorner: CameraCorner,
  deltaQuarter: number,
): CameraCorner {
  const current = cornerQuarter(cameraCorner);
  const normalized = ((current + Math.trunc(deltaQuarter)) % 4 + 4) % 4;
  return CAMERA_CORNERS[normalized] as CameraCorner;
}

export function presentedRoomSize(size: RoomSize, cameraCorner: CameraCorner): RoomSize {
  const quarter = cornerQuarter(cameraCorner);
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
  cameraCorner: CameraCorner,
): GridCell {
  switch (cornerQuarter(cameraCorner)) {
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
  cameraCorner: CameraCorner,
  tileWidth = 64,
  tileHeight = 32,
): ProjectedPoint {
  return projectPresentedCell(
    rotateCanonicalCell(cell, size, cameraCorner),
    tileWidth,
    tileHeight,
  );
}

export function nearWalls(cameraCorner: CameraCorner): readonly WorldWall[] {
  return NEAR_WALLS[cameraCorner];
}

export function isNearWall(wall: WorldWall, cameraCorner: CameraCorner): boolean {
  return nearWalls(cameraCorner).includes(wall);
}

export function wallDepthBand(
  wall: WorldWall,
  cameraCorner: CameraCorner,
): "near" | "rear" {
  return isNearWall(wall, cameraCorner) ? "near" : "rear";
}
