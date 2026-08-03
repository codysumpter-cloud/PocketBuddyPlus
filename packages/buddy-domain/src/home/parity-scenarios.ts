/**
 * Canonical Home parity scenarios.
 *
 * This is the TypeScript half of the golden Godot -> TypeScript harness for
 * four-wall room geometry and placement. It emits `prismtek-parity-trace-v1`
 * traces from `@open-pets/buddy-domain` so a Godot emitter can produce the same
 * scenario ids and step inputs, and `compareParityTraces` can diff them.
 *
 * Two rules make these traces comparable across runtimes:
 *
 *  - scenarios are DECLARATIVE. Each step is an input the Godot side can replay
 *    verbatim, not a sequence of TypeScript calls, so neither runtime has to
 *    reimplement the other's control flow.
 *  - snapshots contain only OBSERVABLE canonical state. Nothing renderer-owned
 *    (pixel settling, sprite depth, animation) appears here, because those are
 *    legitimately allowed to differ.
 */
import {
  createHomeRoomDocument,
  ROOM_ORIENTATIONS,
  SURFACE_IDS,
  WORLD_WALLS,
  type GridCell,
  type HomeRoomDocument,
  type HomeRoomItem,
  type RoomOrientation,
} from "./room-document.js";
import {
  isNearWall,
  nearWalls,
  presentedRoomSize,
  projectCanonicalCell,
  rotateOrientation,
} from "./isometric.js";
import { canPlaceRoomItem, footprintCells, removeRoomItem, upsertRoomItem } from "./placement.js";
import {
  createParityTrace,
  type JsonValue,
  type ParityTrace,
  type ParityTraceStep,
} from "../parity/index.js";

export const HOME_PARITY_DONOR = "prismtek-buddy-core/home";
export const HOME_PARITY_IMPLEMENTATION = "@open-pets/buddy-domain";

/** A step input, expressed so a Godot emitter can replay it verbatim. */
export type HomeScenarioInput =
  | { readonly op: "create"; readonly roomId: string; readonly width: number; readonly height: number }
  | { readonly op: "rotate"; readonly steps: number }
  | { readonly op: "setOrientation"; readonly orientation: RoomOrientation }
  | { readonly op: "place"; readonly item: HomeRoomItem }
  | { readonly op: "remove"; readonly itemId: string }
  | { readonly op: "probeGeometry" };

export interface HomeScenario {
  readonly scenarioId: string;
  readonly seed: number;
  readonly inputs: readonly HomeScenarioInput[];
}

function cell(x: number, y: number): GridCell {
  return { x, y };
}

function item(
  id: string,
  anchor: GridCell,
  footprint = { width: 1, height: 1 },
  supportItemId: string | null = null,
): HomeRoomItem {
  return {
    id,
    assetId: `asset.${id}`,
    placement: {
      surface: "floor",
      anchor,
      offset: { x: 0, y: 0 },
      rotationQuarter: 0,
      scale: 1,
      footprint,
      supportItemId,
    },
    state: {},
  };
}

/**
 * Observable canonical snapshot.
 *
 * Geometry is derived rather than stored, so a runtime that rotates or projects
 * differently diverges here instead of silently rendering wrong.
 */
function snapshotOf(document: HomeRoomDocument): JsonValue {
  const presented = presentedRoomSize({ width: document.width, height: document.height }, document.orientation);
  const projected = footprintProbe(document);

  return {
    roomId: document.roomId,
    revision: document.revision,
    width: document.width,
    height: document.height,
    orientation: document.orientation,
    cutaway: document.cutaway,
    presented: { width: presented.width, height: presented.height },
    surfaces: Object.fromEntries(
      SURFACE_IDS.map((surface) => [surface, { materialId: document.surfaces[surface].materialId }]),
    ) as unknown as JsonValue,
    nearWalls: [...nearWalls(document.orientation)],
    wallNearness: Object.fromEntries(
      WORLD_WALLS.map((wall) => [wall, isNearWall(wall, document.orientation)]),
    ) as unknown as JsonValue,
    projectedCorners: projected,
    items: document.items.map((entry) => ({
      id: entry.id,
      assetId: entry.assetId,
      surface: entry.placement.surface,
      anchor: { x: entry.placement.anchor.x, y: entry.placement.anchor.y },
      rotationQuarter: entry.placement.rotationQuarter,
      footprint: { ...entry.placement.footprint },
      supportItemId: entry.placement.supportItemId,
      cells: footprintCells(entry).map((c) => ({ x: c.x, y: c.y })),
    })),
  } as unknown as JsonValue;
}

/** Projects the four room corners, which is where an orientation bug shows up. */
function footprintProbe(document: HomeRoomDocument): JsonValue {
  const size = { width: document.width, height: document.height };
  const corners: GridCell[] = [
    cell(0, 0),
    cell(document.width - 1, 0),
    cell(document.width - 1, document.height - 1),
    cell(0, document.height - 1),
  ];
  return corners.map((corner) => {
    const point = projectCanonicalCell(corner, size, document.orientation);
    return { cell: { x: corner.x, y: corner.y }, x: point.x, y: point.y };
  }) as unknown as JsonValue;
}

/** Applies one declarative input, returning the next document and its events. */
function applyInput(
  document: HomeRoomDocument,
  input: HomeScenarioInput,
): { readonly document: HomeRoomDocument; readonly events: readonly JsonValue[] } {
  switch (input.op) {
    case "create":
      return {
        document: createHomeRoomDocument({ roomId: input.roomId, width: input.width, height: input.height }),
        events: [{ type: "room.created", roomId: input.roomId } as unknown as JsonValue],
      };
    case "rotate": {
      const next = { ...document, orientation: rotateOrientation(document.orientation, input.steps) };
      return {
        document: next,
        events: [{ type: "room.rotated", orientation: next.orientation } as unknown as JsonValue],
      };
    }
    case "setOrientation":
      return {
        document: { ...document, orientation: input.orientation },
        events: [{ type: "room.rotated", orientation: input.orientation } as unknown as JsonValue],
      };
    case "place": {
      const verdict = canPlaceRoomItem(document, input.item);
      if (!verdict.ok) {
        return {
          document,
          events: [{
            type: "item.rejected",
            itemId: input.item.id,
            reason: verdict.reason,
            blockingItemId: verdict.blockingItemId,
          } as unknown as JsonValue],
        };
      }
      return {
        document: upsertRoomItem(document, input.item),
        events: [{ type: "item.placed", itemId: input.item.id } as unknown as JsonValue],
      };
    }
    case "remove": {
      const next = removeRoomItem(document, input.itemId);
      const removed = document.items.length - next.items.length;
      return {
        document: next,
        events: [{ type: "item.removed", itemId: input.itemId, removedCount: removed } as unknown as JsonValue],
      };
    }
    case "probeGeometry":
      return { document, events: [] };
    default:
      return { document, events: [] };
  }
}

/** Runs a scenario and produces a comparable trace. */
export function runHomeScenario(scenario: HomeScenario): ParityTrace {
  let document = createHomeRoomDocument({ roomId: "bootstrap", width: 4, height: 3 });
  const steps: ParityTraceStep[] = [];

  scenario.inputs.forEach((input, index) => {
    const applied = applyInput(document, input);
    document = applied.document;
    steps.push({
      // Deterministic synthetic clock: parity is about ordering, not wall time.
      atMs: index * 100,
      input: input as unknown as JsonValue,
      snapshot: snapshotOf(document),
      events: applied.events,
    });
  });

  return createParityTrace({
    scenarioId: scenario.scenarioId,
    donor: HOME_PARITY_DONOR,
    implementation: HOME_PARITY_IMPLEMENTATION,
    seed: scenario.seed,
    steps,
  });
}

/**
 * The canonical scenario set the Godot emitter must reproduce.
 *
 * Covers all four orientations, rotational closure, near/rear wall
 * classification, footprint occupancy, and every placement rejection reason.
 */
export const HOME_PARITY_SCENARIOS: readonly HomeScenario[] = [
  {
    scenarioId: "home.room.create",
    seed: 1,
    inputs: [{ op: "create", roomId: "room-a", width: 4, height: 3 }, { op: "probeGeometry" }],
  },
  {
    scenarioId: "home.room.orientations",
    seed: 2,
    inputs: [
      { op: "create", roomId: "room-a", width: 5, height: 3 },
      ...ROOM_ORIENTATIONS.map((orientation) => ({ op: "setOrientation", orientation }) as const),
    ],
  },
  {
    scenarioId: "home.room.rotation-closure",
    seed: 3,
    inputs: [
      { op: "create", roomId: "room-a", width: 5, height: 3 },
      { op: "rotate", steps: 1 },
      { op: "rotate", steps: 1 },
      { op: "rotate", steps: 1 },
      { op: "rotate", steps: 1 },
    ],
  },
  {
    scenarioId: "home.placement.basic",
    seed: 4,
    inputs: [
      { op: "create", roomId: "room-a", width: 4, height: 3 },
      { op: "place", item: item("rug", cell(0, 0), { width: 2, height: 2 }) },
      { op: "place", item: item("lamp", cell(3, 2)) },
      { op: "remove", itemId: "rug" },
    ],
  },
  {
    scenarioId: "home.placement.rejections",
    seed: 5,
    inputs: [
      { op: "create", roomId: "room-a", width: 3, height: 3 },
      { op: "place", item: item("table", cell(0, 0), { width: 2, height: 2 }) },
      // overlapping an occupied cell
      { op: "place", item: item("chair", cell(1, 1)) },
      // outside the room
      { op: "place", item: item("outside", cell(9, 9)) },
      // duplicate id
      { op: "place", item: item("table", cell(2, 2)) },
      // support that does not exist
      { op: "place", item: item("vase", cell(2, 2), { width: 1, height: 1 }, "ghost") },
    ],
  },
  {
    scenarioId: "home.placement.support-cascade",
    seed: 6,
    inputs: [
      { op: "create", roomId: "room-a", width: 4, height: 4 },
      { op: "place", item: item("table", cell(1, 1), { width: 2, height: 1 }) },
      { op: "place", item: item("plate", cell(1, 1), { width: 1, height: 1 }, "table") },
      // removing the support must cascade to the supported item
      { op: "remove", itemId: "table" },
    ],
  },
];

/** Runs every canonical scenario. */
export function runAllHomeScenarios(): readonly ParityTrace[] {
  return HOME_PARITY_SCENARIOS.map(runHomeScenario);
}
