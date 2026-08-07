import { createRequire } from "node:module";
import type { Rectangle } from "electron";

import { deriveDisplayKey } from "./app-state-core.js";

// `electron` is loaded lazily (via createRequire, inside getScreen()) rather
// than imported at module scope: this module is pulled into the plugin runtime
// graph and the unit-test suite, which run under plain Node where the
// `electron` shim has no named `screen` export. createRequire restores a
// working `require` in this ESM module so the lazy load succeeds at runtime.
const require = createRequire(import.meta.url);

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

export interface DisplayChoice {
  readonly key: string;
  readonly primary: boolean;
  readonly bounds: Rectangle;
  readonly workArea: Rectangle;
}

export type DisplaySelection = "primary" | string;

/**
 * Derive a stable string key for a display from its bounds.
 * Display IDs can change across reboots on some platforms, so we key on
 * physical geometry instead: `"${x},${y},${width}x${height}"`.
 */
export function getDisplayKey(bounds: Rectangle): string {
  return deriveDisplayKey(bounds);
}

/**
 * Return the display key for the display that the centre of a window position
 * falls on (using Electron's nearest-point logic).
 */
export function getDisplayKeyForPosition(position: Point, size: WindowSize = defaultPetWindowSize): string {
  const centre = { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  const display = getScreen().getDisplayNearestPoint(centre);
  return getDisplayKey(display.bounds);
}

/**
 * Return display keys for all currently connected displays, mapped to their
 * work-area rectangles so callers can choose a position on a given display.
 */
export function getAllDisplayKeys(): string[] {
  return getScreen().getAllDisplays().map((display) => getDisplayKey(display.bounds));
}

export const defaultPetWindowSize: WindowSize = {
  width: 340,
  height: 420,
};

export const defaultPetWindowMargin = 24;

/**
 * Minimum overlap (in pixels) along each axis for a pet to be considered
 * "on" a display. Rejects hair-thin slivers without requiring full coverage.
 */
const MIN_VISIBLE_PX = 100;

// ---------------------------------------------------------------------------
// Testability seam — allows unit tests to inject a mock screen implementation
// without requiring a running Electron process.
// ---------------------------------------------------------------------------

/** Minimal subset of Electron's screen interface used by this module. */
export interface ScreenImpl {
  getAllDisplays(): DisplayInfo[];
  getPrimaryDisplay(): DisplayInfo;
  getDisplayNearestPoint(point: { x: number; y: number }): DisplayInfo;
}

export interface DisplayInfo {
  bounds: Rectangle;
  workArea: Rectangle;
}

// Lazily loaded — avoids a hard electron import at module-load time so that
// unit tests can call _setScreenForTesting() without requiring Electron.
let _screen: ScreenImpl | null = null;

function getScreen(): ScreenImpl {
  if (!_screen) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { screen } = require("electron") as { screen: ScreenImpl };
    _screen = screen;
  }
  return _screen;
}

/** Replace the screen implementation used by this module. Tests only. */
export function _setScreenForTesting(impl: ScreenImpl | null): void {
  _screen = impl;
  _cachedDisplays = null;
}

/**
 * Cached list of displays. Invalidated whenever Electron reports a topology or
 * work-area change so a moved taskbar/dock is reflected immediately.
 */
let _cachedDisplays: DisplayInfo[] | null = null;

/** Called by display-topology event handlers to bust the cache. */
export function invalidateDisplayCache(): void {
  _cachedDisplays = null;
}

function getAllDisplaysCached(): DisplayInfo[] {
  if (!_cachedDisplays) {
    _cachedDisplays = getScreen().getAllDisplays();
  }
  return _cachedDisplays;
}

// ---------------------------------------------------------------------------
// Selected-monitor policy
// ---------------------------------------------------------------------------

let _selectedDisplay: DisplaySelection = "primary";

export function isDisplaySelection(value: unknown): value is DisplaySelection {
  return value === "primary" || (typeof value === "string" && /^-?\d+,-?\d+,\d+x\d+$/.test(value));
}

/** Apply the persisted monitor preference. Invalid values fail safely to primary. */
export function setSelectedDisplay(selection: unknown): void {
  _selectedDisplay = isDisplaySelection(selection) ? selection : "primary";
}

export function getSelectedDisplayPreference(): DisplaySelection {
  return _selectedDisplay;
}

/**
 * Resolve the selected monitor. If an explicitly selected monitor is detached,
 * keep the preference but use the current primary monitor until it returns.
 */
export function getSelectedDisplayInfo(): DisplayInfo {
  if (_selectedDisplay !== "primary") {
    const selected = getAllDisplaysCached().find((display) => getDisplayKey(display.bounds) === _selectedDisplay);
    if (selected) return selected;
  }
  return getScreen().getPrimaryDisplay();
}

export function getEffectiveSelectedDisplayKey(): string {
  return getDisplayKey(getSelectedDisplayInfo().bounds);
}

export function getDisplayChoices(): DisplayChoice[] {
  const primaryKey = getDisplayKey(getScreen().getPrimaryDisplay().bounds);
  return getAllDisplaysCached().map((display) => ({
    key: getDisplayKey(display.bounds),
    primary: getDisplayKey(display.bounds) === primaryKey,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
  }));
}

export function getSelectedWorkArea(): Rectangle {
  return { ...getSelectedDisplayInfo().workArea };
}

/**
 * Clamp a normal application window to the selected monitor's usable work
 * area. The usable work area excludes the Windows taskbar and macOS dock/menu
 * reservations. Windows larger than the work area are shrunk to fit.
 */
export function clampWindowBoundsToSelectedWorkArea(bounds: Rectangle): Rectangle {
  const area = toIntegerWorkArea(getSelectedDisplayInfo().workArea);
  const width = Math.max(1, Math.min(Math.round(bounds.width), area.width));
  const height = Math.max(1, Math.min(Math.round(bounds.height), area.height));
  const maxX = area.x + area.width - width;
  const maxY = area.y + area.height - height;
  return {
    x: clamp(Math.round(bounds.x), area.x, maxX),
    y: clamp(Math.round(bounds.y), area.y, maxY),
    width,
    height,
  };
}

export function centerWindowBoundsOnSelectedWorkArea(size: WindowSize): Rectangle {
  const area = toIntegerWorkArea(getSelectedDisplayInfo().workArea);
  const width = Math.max(1, Math.min(Math.round(size.width), area.width));
  const height = Math.max(1, Math.min(Math.round(size.height), area.height));
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  };
}

export function getDefaultPetInitialPosition(size: WindowSize = defaultPetWindowSize): Point {
  const workArea = toIntegerWorkArea(getSelectedDisplayInfo().workArea);

  return {
    x: Math.round(workArea.x + workArea.width - size.width - defaultPetWindowMargin),
    y: Math.round(workArea.y + workArea.height - size.height - defaultPetWindowMargin),
  };
}

/**
 * Returns true when the pet rect overlaps at least one display work area by
 * at least `minOverlap` pixels on BOTH axes. Retained for diagnostics and old
 * tests; production placement is now always selected-monitor constrained.
 */
export function isOnAnyDisplay(
  position: Point,
  width: number,
  height: number,
  minOverlap: number = MIN_VISIBLE_PX,
): boolean {
  const anchorX = position.x + width / 2;
  const anchorY = position.y + height;

  for (const display of getAllDisplaysCached()) {
    const wa = display.workArea;
    if (
      anchorX >= wa.x &&
      anchorX <= wa.x + wa.width &&
      anchorY >= wa.y &&
      anchorY <= wa.y + wa.height
    ) {
      return true;
    }
    const overlapX = Math.min(position.x + width, wa.x + wa.width) - Math.max(position.x, wa.x);
    const overlapY = Math.min(position.y + height, wa.y + wa.height) - Math.max(position.y, wa.y);
    if (overlapX >= minOverlap && overlapY >= minOverlap) {
      return true;
    }
  }
  return false;
}

/**
 * Compatibility entry point for older cross-display callers. Pocket Buddy+
 * now has a hard selected-monitor boundary, so even callers that request the
 * historical permissive roaming policy are clamped to the selected work area.
 */
export function clampToNearestDisplayIfOffscreen(
  position: Point,
  size: WindowSize = defaultPetWindowSize,
): Point {
  return clampIntoWorkArea(position, size, getSelectedDisplayInfo().workArea);
}

/**
 * Electron's window coordinate setters take a C++ `int`. Anything else aborts
 * the call with "Error processing argument at index 0, conversion failure".
 */
export function toWindowCoordinate(value: number): number | null {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || Math.abs(rounded) > 2147483647) return null;
  return rounded === 0 ? 0 : rounded;
}

function clampIntoWorkArea(
  position: Point,
  size: WindowSize,
  workArea: { x: number; y: number; width: number; height: number },
): Point {
  const area = toIntegerWorkArea(workArea);
  const width = Math.min(Math.max(1, Math.round(size.width)), area.width);
  const height = Math.min(Math.max(1, Math.round(size.height)), area.height);
  const maxX = area.x + area.width - width;
  const maxY = area.y + area.height - height;

  return {
    x: clamp(Math.round(position.x), area.x, maxX),
    y: clamp(Math.round(position.y), area.y, maxY),
  };
}

/**
 * Legacy name retained for callers, but the policy is no longer "nearest
 * display": every pet/window is constrained to the monitor selected in
 * Settings, and the selected monitor's work area excludes the taskbar/dock.
 */
export function clampToVisibleWorkArea(position: Point, size: WindowSize = defaultPetWindowSize): Point {
  return clampIntoWorkArea(position, size, getSelectedDisplayInfo().workArea);
}

// ---------------------------------------------------------------------------
// Legacy cross-display preference
// ---------------------------------------------------------------------------

let _crossDisplayRoamingEnabled = false;

/**
 * Kept so old persisted state and plugin code remain readable. The selected
 * monitor boundary is authoritative, so enabling this no longer permits a
 * window to leave that monitor.
 */
export function setCrossDisplayRoamingEnabled(enabled: boolean): void {
  _crossDisplayRoamingEnabled = enabled;
}

export function isCrossDisplayRoamingEnabled(): boolean {
  return _crossDisplayRoamingEnabled;
}

function toIntegerWorkArea(workArea: { x: number; y: number; width: number; height: number }): Rectangle {
  const left = Math.ceil(workArea.x);
  const top = Math.ceil(workArea.y);
  const right = Math.max(left + 1, Math.floor(workArea.x + workArea.width));
  const bottom = Math.max(top + 1, Math.floor(workArea.y + workArea.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
