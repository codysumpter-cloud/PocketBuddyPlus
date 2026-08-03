/**
 * Port of the donor `InteriorWallModel` behaviours that the Home parity harness
 * previously listed as unported: legacy wall-key parsing, boundary cells, and
 * cutaway presentation.
 *
 * Donor: `prismtek-apps/apps/prismtek-buddies-godot/scripts/interior/InteriorWallModel.gd`
 *
 * This is a parity port, not a redesign. Formulas, ordering, thresholds and
 * malformed-input behaviour follow the donor exactly; where the donor's result
 * looks redundant (AUTO and HIDE currently produce identical output) it is
 * reproduced rather than collapsed, because the donor keeps them distinct on
 * purpose and a future change there must show up as a parity failure here.
 *
 * `orientation` in this file means a WALL DIRECTION, matching the donor's
 * `Orientation` enum. It is never a camera position -- that is a `CameraCorner`.
 */
import { WORLD_WALLS, type CutawayMode, type CameraCorner, type WorldWall } from "./room-document.js";
import { isNearWall } from "./isometric.js";

/**
 * Alpha used for a camera-facing wall that must stay visible.
 *
 * Donor `FRONT_FADE_ALPHA`. A camera-facing wall draws in front of the floor,
 * so "show it" and "show it opaque" are not the same thing: drawn solid it
 * would cover the room the builder is editing.
 */
export const FRONT_FADE_ALPHA = 0.18;

export interface WallPresentation {
  readonly visible: boolean;
  readonly alpha: number;
  readonly cameraFacing: boolean;
}

export interface RoomCell {
  readonly x: number;
  readonly y: number;
}

/**
 * Parses canonical wall ids plus the legacy presentation names used by save
 * schema v4, returning `null` where the donor returns its -1 sentinel.
 *
 * The legacy mapping is the load-bearing part and is easy to get backwards:
 *
 *     legacy "left"  -> WEST   (the back-left wall)
 *     legacy "right" -> NORTH  (the back-right wall)
 *
 * "right" is NOT east. Getting this wrong mirrors an imported room silently,
 * which is precisely the kind of failure no test notices and every player does.
 *
 * Step order matters and mirrors the donor's expression exactly:
 * trim, then lowercase, then strip `wall_`. Because the trim happens first,
 * `" wall_ north"` does not parse -- the donor does not re-trim afterwards, so
 * neither does this.
 */
export function parseWallKey(value: unknown): WorldWall | null {
  // The donor accepts a raw enum ordinal before doing any string work.
  // WORLD_WALLS is index-aligned with `enum Orientation { NORTH, EAST, SOUTH, WEST }`.
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < WORLD_WALLS.length) {
    return WORLD_WALLS[value];
  }

  const normalized = stringify(value).trim().toLowerCase().replaceAll("wall_", "");
  switch (normalized) {
    case "north":
    case "n":
    case "right":
      return "north";
    case "east":
    case "e":
      return "east";
    case "south":
    case "s":
      return "south";
    case "west":
    case "w":
    case "left":
      return "west";
    default:
      return null;
  }
}

/** `wall_north` etc. -- the donor's `save_key()`. */
export function wallSaveKeyOf(wall: WorldWall): string {
  return `wall_${wall}`;
}

/**
 * Canonical boundary cells for a rectangular floor, in the donor's order.
 *
 * Corners deliberately belong to two walls: that is real geometry, not
 * duplicate data. Returns empty for a degenerate room, as the donor does.
 */
export function wallBoundaryCells(width: number, height: number, wall: WorldWall): readonly RoomCell[] {
  if (width <= 0 || height <= 0) return [];
  const cells: RoomCell[] = [];
  switch (wall) {
    case "north":
      for (let x = 0; x < width; x += 1) cells.push({ x, y: 0 });
      break;
    case "south":
      for (let x = 0; x < width; x += 1) cells.push({ x, y: height - 1 });
      break;
    case "west":
      for (let y = 0; y < height; y += 1) cells.push({ x: 0, y });
      break;
    case "east":
      for (let y = 0; y < height; y += 1) cells.push({ x: width - 1, y });
      break;
  }
  return cells;
}

/**
 * Rendering decision only.
 *
 * Collision, placement and persistence stay active even when a wall is hidden.
 * That is the rule that makes cutaway rooms reliable, and it is why this
 * returns a presentation rather than mutating anything.
 *
 * An unrecognised cutaway mode falls back to `auto`, matching the donor rather
 * than throwing: this runs on save data, and a room with a bad mode should
 * still draw.
 */
export function wallPresentation(
  wall: WorldWall,
  cameraCorner: CameraCorner,
  cutawayMode: string = "auto",
  buildMode = false,
): WallPresentation {
  const cutaway = normalizeCutaway(cutawayMode);
  const cameraFacing = isNearWall(wall, cameraCorner);

  // A rear wall is always solid: it is behind the floor and cannot hide anything.
  if (!cameraFacing) return { visible: true, alpha: 1, cameraFacing: false };

  // Build mode and always_show both mean "the builder wants to see it is there",
  // which at full opacity would cover the room being edited.
  if (buildMode || cutaway === "always_show" || cutaway === "fade") {
    return { visible: true, alpha: FRONT_FADE_ALPHA, cameraFacing: true };
  }

  // auto and hide currently agree. The donor keeps them distinct so a future
  // proximity-based occluder can refine auto without migrating settings.
  return { visible: false, alpha: 0, cameraFacing: true };
}

function normalizeCutaway(mode: string): CutawayMode {
  const lowered = stringify(mode).toLowerCase();
  return isCutawayMode(lowered) ? lowered : "auto";
}

function isCutawayMode(value: string): value is CutawayMode {
  return value === "auto" || value === "fade" || value === "hide" || value === "always_show";
}

/** Mirrors GDScript `str(value)` closely enough for every input the donor accepts. */
function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}
