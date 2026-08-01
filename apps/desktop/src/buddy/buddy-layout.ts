/**
 * Pure geometry for the Pocket Buddy Plus surfaces.
 *
 * Kept free of Electron so the clamping rules -- which are the difference
 * between a menu that lands beside the Buddy and one that opens half off-screen
 * -- can be tested directly.
 */
import type { DockEdge } from "./buddy-store.js";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Gap between the Buddy and its attached menu. */
export const attachedMenuGap = 12;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Place the attached menu beside the Buddy, preferring the right side, flipping
 * to the left when it would overflow, and always finishing inside the work area.
 * The menu is vertically centred on the Buddy and then clamped.
 */
export function computeAttachedMenuBounds(pet: Rect, menu: Size, workArea: Rect): Rect {
  const width = Math.max(1, Math.round(menu.width));
  const height = Math.max(1, Math.round(menu.height));

  const rightX = pet.x + pet.width + attachedMenuGap;
  const leftX = pet.x - attachedMenuGap - width;
  const fitsRight = rightX + width <= workArea.x + workArea.width;
  const fitsLeft = leftX >= workArea.x;

  // Prefer the right side; flip only when the right overflows and the left fits.
  const preferredX = fitsRight || !fitsLeft ? rightX : leftX;
  const centeredY = pet.y + Math.round(pet.height / 2) - Math.round(height / 2);

  return {
    x: Math.round(clamp(preferredX, workArea.x, workArea.x + workArea.width - width)),
    y: Math.round(clamp(centeredY, workArea.y, workArea.y + workArea.height - height)),
    width,
    height,
  };
}

export const dockThickness = 76;
export const dockCollapsedThickness = 16;
export const dockLongEdgeInset = 120;

/**
 * Dock geometry for the selected edge. Collapsing keeps the dock on the same
 * edge but shrinks it to a slim handle so it stops covering the Buddy.
 */
export function computeDockBounds(edge: DockEdge, collapsed: boolean, workArea: Rect): Rect {
  const thickness = collapsed ? dockCollapsedThickness : dockThickness;

  if (edge === "bottom") {
    const width = Math.max(320, workArea.width - dockLongEdgeInset * 2);
    return {
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + workArea.height - thickness),
      width: Math.round(width),
      height: thickness,
    };
  }

  const height = Math.max(320, workArea.height - dockLongEdgeInset * 2);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);
  const x = edge === "left" ? workArea.x : workArea.x + workArea.width - thickness;
  return { x: Math.round(x), y, width: thickness, height: Math.round(height) };
}
