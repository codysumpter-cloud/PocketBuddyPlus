import {
  parseHomeRoomDocument,
  type GridCell,
  type HomeRoomDocument,
  type HomeRoomItem,
} from "./room-document.js";

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer`);
  return value;
}

export function footprintCells(item: HomeRoomItem): GridCell[] {
  const width = integer(item.placement.footprint.width, "footprint width");
  const height = integer(item.placement.footprint.height, "footprint height");
  const cells: GridCell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({
        x: item.placement.anchor.x + x,
        y: item.placement.anchor.y + y,
      });
    }
  }
  return cells;
}

export function isCellInsideRoom(document: HomeRoomDocument, cell: GridCell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < document.width && cell.y < document.height;
}

function key(cell: GridCell): string {
  return `${cell.x},${cell.y}`;
}

export interface PlacementVerdict {
  readonly ok: boolean;
  readonly reason: "ok" | "outside-room" | "occupied" | "duplicate-id" | "missing-support";
  readonly blockingItemId: string | null;
}

/**
 * Deterministic, renderer-independent floor placement check. Pixel settling and
 * collision hulls belong to the renderer/host; this protects canonical cell
 * occupancy and support references.
 */
export function canPlaceRoomItem(
  document: HomeRoomDocument,
  candidate: HomeRoomItem,
  ignoreItemId: string | null = null,
): PlacementVerdict {
  if (document.items.some((item) => item.id === candidate.id && item.id !== ignoreItemId)) {
    return { ok: false, reason: "duplicate-id", blockingItemId: candidate.id };
  }
  const supportId = candidate.placement.supportItemId;
  if (supportId !== null && !document.items.some((item) => item.id === supportId)) {
    return { ok: false, reason: "missing-support", blockingItemId: supportId };
  }
  if (candidate.placement.surface !== "floor") {
    return { ok: true, reason: "ok", blockingItemId: null };
  }
  const candidateCells = footprintCells(candidate);
  if (candidateCells.some((cell) => !isCellInsideRoom(document, cell))) {
    return { ok: false, reason: "outside-room", blockingItemId: null };
  }
  const occupied = new Map<string, string>();
  for (const item of document.items) {
    if (item.id === ignoreItemId || item.placement.surface !== "floor") continue;
    for (const cell of footprintCells(item)) occupied.set(key(cell), item.id);
  }
  for (const cell of candidateCells) {
    const blocker = occupied.get(key(cell));
    if (blocker !== undefined) {
      return { ok: false, reason: "occupied", blockingItemId: blocker };
    }
  }
  return { ok: true, reason: "ok", blockingItemId: null };
}

export function upsertRoomItem(
  document: HomeRoomDocument,
  candidate: HomeRoomItem,
): HomeRoomDocument {
  const existing = document.items.find((item) => item.id === candidate.id) ?? null;
  const verdict = canPlaceRoomItem(document, candidate, existing?.id ?? null);
  if (!verdict.ok) {
    throw new Error(`cannot place ${candidate.id}: ${verdict.reason}${verdict.blockingItemId ? ` (${verdict.blockingItemId})` : ""}`);
  }
  const nextItems = existing === null
    ? [...document.items, candidate]
    : document.items.map((item) => (item.id === candidate.id ? candidate : item));
  return parseHomeRoomDocument({
    ...document,
    revision: document.revision + 1,
    items: nextItems,
  });
}

export function removeRoomItem(document: HomeRoomDocument, itemId: string): HomeRoomDocument {
  const removed = new Set<string>([itemId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of document.items) {
      if (item.placement.supportItemId !== null && removed.has(item.placement.supportItemId) && !removed.has(item.id)) {
        removed.add(item.id);
        changed = true;
      }
    }
  }
  if (!document.items.some((item) => removed.has(item.id))) return document;
  return parseHomeRoomDocument({
    ...document,
    revision: document.revision + 1,
    items: document.items.filter((item) => !removed.has(item.id)),
  });
}
