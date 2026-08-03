/**
 * TypeScript half of the canonical four-wall parity trace.
 *
 * Pairs with the Godot emitter at
 * `prismtek-apps/apps/prismtek-buddies-godot/tools/emit_wall_parity_trace.gd`,
 * which reads the real `InteriorWallModel`. Both sides produce
 * `prismtek-parity-trace-v1` so `compareParityTraces` can diff them.
 *
 * Vocabulary mapping, deliberately in one place on each side:
 *   TypeScript names the CAMERA CORNER      SE / SW / NW / NE
 *   Godot counts CAMERA quarter turns      0  / 1  / 2  / 3
 * Camera at south-east (quarter 0) is "SE", then clockwise.
 */
import {
  CUTAWAY_MODES,
  CAMERA_CORNERS,
  SURFACE_IDS,
  WORLD_WALLS,
  type CameraCorner,
  type WorldWall,
} from "./room-document.js";
import { isNearWall, nearWalls, rotateCameraCorner } from "./isometric.js";
import { createParityTrace, type JsonValue, type ParityTrace, type ParityTraceStep } from "../parity/index.js";

export const WALL_PARITY_SCENARIO_ID = "home.walls.canonical";

/** Quarter turns are the Godot-side name for the same four camera corners. */
export function cornerForQuarter(quarter: number): CameraCorner {
  const normalized = ((quarter % 4) + 4) % 4;
  return CAMERA_CORNERS[normalized];
}

/** `wall_north` etc. -- the persisted surface id for a world wall. */
export function wallSaveKey(wall: WorldWall): string {
  return `wall_${wall}`;
}

function cornerSnapshot(cameraCorner: CameraCorner): JsonValue {
  const near = [...nearWalls(cameraCorner)].sort();
  const rear = WORLD_WALLS.filter((wall) => !isNearWall(wall, cameraCorner)).sort();

  return {
    cameraCorner,
    quarterTurns: CAMERA_CORNERS.indexOf(cameraCorner),
    nearWalls: near,
    rearWalls: rear,
    wallNearness: Object.fromEntries(WORLD_WALLS.map((wall) => [wall, isNearWall(wall, cameraCorner)])),
    saveKeys: Object.fromEntries(WORLD_WALLS.map((wall) => [wall, wallSaveKey(wall)])),
  } as unknown as JsonValue;
}

/**
 * The comparable subset of the wall model.
 *
 * Steps the TypeScript domain has no equivalent for -- boundary cells and
 * cutaway presentation (visible/alpha) -- are deliberately NOT synthesised here.
 * Inventing them would manufacture agreement; the comparison ignores those
 * scenario steps explicitly instead, and they are tracked as porting work.
 */
export function runWallParityScenario(): ParityTrace {
  const steps: ParityTraceStep[] = [];
  let atMs = 0;

  for (const cameraCorner of CAMERA_CORNERS) {
    steps.push({
      atMs,
      input: { op: "setCameraCorner", cameraCorner } as unknown as JsonValue,
      snapshot: cornerSnapshot(cameraCorner),
      events: [{ type: "room.rotated", cameraCorner } as unknown as JsonValue],
    });
    atMs += 100;
  }

  let rotated: CameraCorner = CAMERA_CORNERS[0];
  for (let i = 0; i < 4; i += 1) {
    rotated = rotateCameraCorner(rotated, 1);
    steps.push({
      atMs,
      input: { op: "rotate", steps: 1 } as unknown as JsonValue,
      snapshot: cornerSnapshot(rotated),
      events: [{ type: "room.rotated", cameraCorner: rotated } as unknown as JsonValue],
    });
    atMs += 100;
  }

  return createParityTrace({
    scenarioId: WALL_PARITY_SCENARIO_ID,
    donor: "prismtek-apps/apps/prismtek-buddies-godot/scripts/interior/InteriorWallModel.gd",
    implementation: "@open-pets/buddy-domain",
    seed: 1,
    steps,
  });
}

/** Facts a save written by one runtime must satisfy to load in the other. */
export function wallSchemaFacts(): {
  readonly cutawayModes: readonly string[];
  readonly surfaceIds: readonly string[];
  readonly wallSaveKeys: readonly string[];
} {
  return {
    cutawayModes: [...CUTAWAY_MODES].sort(),
    surfaceIds: [...SURFACE_IDS].sort(),
    wallSaveKeys: WORLD_WALLS.map(wallSaveKey).sort(),
  };
}
