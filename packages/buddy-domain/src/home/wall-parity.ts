/**
 * TypeScript half of the canonical four-wall parity trace.
 *
 * Pairs with the Godot emitter at
 * `prismtek-apps/apps/prismtek-buddies-godot/tools/emit_wall_parity_trace.gd`,
 * which reads the real `InteriorWallModel`. Both sides produce
 * `prismtek-parity-trace-v1` so `compareParityTraces` can diff them.
 *
 * Vocabulary mapping, deliberately in one place on each side:
 *   TypeScript names the ROOM orientation  SE / SW / NW / NE
 *   Godot counts CAMERA quarter turns      0  / 1  / 2  / 3
 * Camera at south-east (quarter 0) is "SE", then clockwise.
 */
import {
  CUTAWAY_MODES,
  ROOM_ORIENTATIONS,
  SURFACE_IDS,
  WORLD_WALLS,
  type RoomOrientation,
  type WorldWall,
} from "./room-document.js";
import { isNearWall, nearWalls, rotateOrientation } from "./isometric.js";
import { createParityTrace, type JsonValue, type ParityTrace, type ParityTraceStep } from "../parity/index.js";

export const WALL_PARITY_SCENARIO_ID = "home.walls.canonical";

/** Quarter turns are the Godot-side name for the same four room orientations. */
export function orientationForQuarter(quarter: number): RoomOrientation {
  const normalized = ((quarter % 4) + 4) % 4;
  return ROOM_ORIENTATIONS[normalized];
}

/** `wall_north` etc. -- the persisted surface id for a world wall. */
export function wallSaveKey(wall: WorldWall): string {
  return `wall_${wall}`;
}

function orientationSnapshot(orientation: RoomOrientation): JsonValue {
  const near = [...nearWalls(orientation)].sort();
  const rear = WORLD_WALLS.filter((wall) => !isNearWall(wall, orientation)).sort();

  return {
    orientation,
    quarterTurns: ROOM_ORIENTATIONS.indexOf(orientation),
    nearWalls: near,
    rearWalls: rear,
    wallNearness: Object.fromEntries(WORLD_WALLS.map((wall) => [wall, isNearWall(wall, orientation)])),
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

  for (const orientation of ROOM_ORIENTATIONS) {
    steps.push({
      atMs,
      input: { op: "setOrientation", orientation } as unknown as JsonValue,
      snapshot: orientationSnapshot(orientation),
      events: [{ type: "room.rotated", orientation } as unknown as JsonValue],
    });
    atMs += 100;
  }

  let rotated: RoomOrientation = ROOM_ORIENTATIONS[0];
  for (let i = 0; i < 4; i += 1) {
    rotated = rotateOrientation(rotated, 1);
    steps.push({
      atMs,
      input: { op: "rotate", steps: 1 } as unknown as JsonValue,
      snapshot: orientationSnapshot(rotated),
      events: [{ type: "room.rotated", orientation: rotated } as unknown as JsonValue],
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
