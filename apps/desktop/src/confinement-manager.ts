/**
 * Confinement Manager
 *
 * Tracks which agent pets should be confined to their terminal window and
 * provides the clamping logic used by the motion systems.
 *
 * Terminal confinement may narrow the allowed area, but the selected monitor
 * work area is always the outer boundary. This prevents a terminal on another
 * monitor from pulling a Buddy across the user's selected-monitor boundary.
 */

import type { WindowBounds } from "./window-tracker.js";
import type { Point, WindowSize } from "./display.js";

export interface ConfinementState {
  readonly terminalBounds: WindowBounds | null;
  readonly terminalMinimized: boolean;
  readonly terminalOccluded: boolean;
  readonly terminalOwnerPid: number;
  readonly appName: string;
}

const confinementStates = new Map<string, ConfinementState>();
let confinementEnabled = true;
let outerMonitorBounds: WindowBounds | null = null;

export function setConfinementEnabled(enabled: boolean): void {
  confinementEnabled = enabled;
}

export function isConfinementEnabled(): boolean {
  return confinementEnabled;
}

/**
 * Set the selected monitor's usable work area as the absolute outer boundary.
 * Pass null only in tests/early startup before monitor selection is initialized.
 */
export function setConfinementOuterBounds(bounds: WindowBounds | null): void {
  outerMonitorBounds = bounds ? normalizeBounds(bounds) : null;
}

export function setConfinementState(petId: string, state: ConfinementState): void {
  confinementStates.set(petId, state);
}

export function clearConfinementState(petId: string): void {
  confinementStates.delete(petId);
}

export function getConfinementState(petId: string): ConfinementState | null {
  return confinementStates.get(petId) ?? null;
}

export function hasActiveConfinement(): boolean {
  for (const state of confinementStates.values()) {
    if (state.terminalBounds !== null) return true;
  }
  return false;
}

function clampInRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Clamp a pet window to terminal bounds. When a selected-monitor outer bound is
 * active, terminal confinement is intersected with that work area first.
 */
export function clampToTerminalBounds(position: Point, petSize: WindowSize, bounds: WindowBounds): Point {
  const effectiveBounds = outerMonitorBounds ? intersectBounds(normalizeBounds(bounds), outerMonitorBounds) ?? outerMonitorBounds : normalizeBounds(bounds);
  const minX = effectiveBounds.x;
  const maxX = effectiveBounds.x + Math.max(0, effectiveBounds.width - petSize.width);
  const minY = effectiveBounds.y;
  const maxY = effectiveBounds.y + Math.max(0, effectiveBounds.height - petSize.height);

  return {
    x: Math.round(clampInRange(Math.round(position.x), minX, maxX)),
    y: Math.round(clampInRange(Math.round(position.y), minY, maxY)),
  };
}

/**
 * Return effective terminal confinement. The returned bounds can never extend
 * outside the selected monitor's work area. If the terminal is entirely on a
 * different monitor, the selected monitor work area wins rather than allowing
 * the pet to leave the selected screen.
 */
export function getEffectiveConfinementBounds(petId: string): WindowBounds | null {
  if (!confinementEnabled) return null;
  const state = confinementStates.get(petId);
  if (!state) return null;
  if (state.terminalMinimized || state.terminalOccluded) return null;
  if (!state.terminalBounds) return null;

  const terminal = normalizeBounds(state.terminalBounds);
  if (!outerMonitorBounds) return terminal;
  return intersectBounds(terminal, outerMonitorBounds) ?? outerMonitorBounds;
}

function normalizeBounds(bounds: WindowBounds): WindowBounds {
  const left = Math.ceil(bounds.x);
  const top = Math.ceil(bounds.y);
  const right = Math.max(left + 1, Math.floor(bounds.x + bounds.width));
  const bottom = Math.max(top + 1, Math.floor(bounds.y + bounds.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function intersectBounds(a: WindowBounds, b: WindowBounds): WindowBounds | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
