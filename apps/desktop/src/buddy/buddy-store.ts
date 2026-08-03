/**
 * Durable, Plus-only persistence for the native Buddy host.
 *
 * This store is deliberately independent of the stable Godot Pocket Buddy save
 * directory: it lives under the Pocket Buddy Plus Electron userData directory
 * (isolated from the inherited OpenPets build by product-runtime.ts, which
 * applies a Plus-only userData path) and never reads or writes the Godot
 * location.
 * There is no automatic import from the Godot saves yet, by design.
 *
 * Every function here takes its base directory explicitly so the whole module is
 * testable without Electron.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  BUDDY_STATE_SCHEMA_VERSION,
  type BuddyActivity,
  type BuddyCareAction,
  type BuddyMood,
  type BuddyNeedId,
  type BuddyState,
  buddyNeedOrder,
  createBuddyState,
} from "./buddy-core.js";

export const BUDDY_STORE_SCHEMA_VERSION = 1 as const;
export const BUDDY_STORE_DIR_NAME = "buddy";
export const BUDDY_STORE_FILE_NAME = "buddy-store.v1.json";

export const dockEdges = ["bottom", "left", "right"] as const;
export type DockEdge = typeof dockEdges[number];

export const buddyThemes = ["dark", "light"] as const;
export type BuddyTheme = typeof buddyThemes[number];

export interface DockPreferences {
  readonly edge: DockEdge;
  readonly collapsed: boolean;
  /** Shared by both Plus surfaces so the menu and dock always match. */
  readonly theme: BuddyTheme;
}

export interface BuddyStoreFile {
  readonly schemaVersion: typeof BUDDY_STORE_SCHEMA_VERSION;
  readonly buddy: BuddyState;
  readonly dock: DockPreferences;
}

export const defaultDockPreferences: DockPreferences = { edge: "bottom", collapsed: false, theme: "dark" };

const moods: readonly BuddyMood[] = ["content", "curious", "playful", "hungry", "tired", "lonely", "uncomfortable"];
const activities: readonly BuddyActivity[] = ["idle", "exploring", "sleeping", "eating", "playing", "socializing", "grooming"];
const careActions: readonly BuddyCareAction[] = ["pet", "feed", "play", "rest", "clean"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Dock preferences come from renderer-supplied values, so unknown edges and
 * non-boolean collapse flags are normalized rather than trusted.
 */
export function normalizeDockPreferences(input: unknown): DockPreferences {
  if (!isRecord(input)) return defaultDockPreferences;
  const edge = dockEdges.includes(input.edge as DockEdge) ? (input.edge as DockEdge) : defaultDockPreferences.edge;
  const collapsed = typeof input.collapsed === "boolean" ? input.collapsed : defaultDockPreferences.collapsed;
  const theme = buddyThemes.includes(input.theme as BuddyTheme) ? (input.theme as BuddyTheme) : defaultDockPreferences.theme;
  return { edge, collapsed, theme };
}

function parseNeeds(value: unknown): Readonly<Record<BuddyNeedId, number>> | null {
  if (!isRecord(value)) return null;
  const needs: Partial<Record<BuddyNeedId, number>> = {};
  for (const need of buddyNeedOrder) {
    const candidate = value[need];
    if (!isUnitInterval(candidate)) return null;
    needs[need] = candidate;
  }
  return needs as Record<BuddyNeedId, number>;
}

/** Strict validation: anything that does not round-trip cleanly is rejected. */
export function parseBuddyState(value: unknown): BuddyState | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== BUDDY_STATE_SCHEMA_VERSION) return null;
  if (typeof value.id !== "string" || value.id.trim() === "") return null;
  if (typeof value.displayName !== "string" || value.displayName.trim() === "") return null;
  if (!isTimestamp(value.createdAtMs) || !isTimestamp(value.updatedAtMs) || !isTimestamp(value.ageMs)) return null;
  if (!isUnitInterval(value.affection)) return null;
  if (!moods.includes(value.mood as BuddyMood)) return null;
  if (!activities.includes(value.activity as BuddyActivity)) return null;
  if (value.lastCareAction !== undefined && !careActions.includes(value.lastCareAction as BuddyCareAction)) return null;

  const needs = parseNeeds(value.needs);
  if (!needs) return null;

  return {
    schemaVersion: BUDDY_STATE_SCHEMA_VERSION,
    id: value.id,
    displayName: value.displayName,
    createdAtMs: value.createdAtMs,
    updatedAtMs: value.updatedAtMs,
    ageMs: value.ageMs,
    affection: value.affection,
    needs,
    mood: value.mood as BuddyMood,
    activity: value.activity as BuddyActivity,
    ...(value.lastCareAction === undefined ? {} : { lastCareAction: value.lastCareAction as BuddyCareAction }),
  };
}

export function parseBuddyStoreFile(value: unknown): BuddyStoreFile | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== BUDDY_STORE_SCHEMA_VERSION) return null;
  const buddy = parseBuddyState(value.buddy);
  if (!buddy) return null;
  return { schemaVersion: BUDDY_STORE_SCHEMA_VERSION, buddy, dock: normalizeDockPreferences(value.dock) };
}

export function getBuddyStoreDir(userDataPath: string): string {
  return join(userDataPath, BUDDY_STORE_DIR_NAME);
}

export function getBuddyStorePath(userDataPath: string): string {
  return join(getBuddyStoreDir(userDataPath), BUDDY_STORE_FILE_NAME);
}

/**
 * Move an unreadable save aside instead of overwriting it, so a corrupted file
 * is recoverable by hand rather than silently discarded. `stamp` is supplied by
 * the caller to keep this deterministic under test.
 */
export function quarantineBuddyStore(userDataPath: string, stamp: string): string | null {
  const path = getBuddyStorePath(userDataPath);
  if (!existsSync(path)) return null;
  const quarantinePath = join(getBuddyStoreDir(userDataPath), `${BUDDY_STORE_FILE_NAME}.corrupt-${stamp}`);
  try {
    renameSync(path, quarantinePath);
    return quarantinePath;
  } catch {
    return null;
  }
}

export interface LoadBuddyStoreResult {
  readonly store: BuddyStoreFile;
  /** True when a pre-existing file was unreadable and had to be quarantined. */
  readonly recovered: boolean;
  readonly quarantinePath: string | null;
}

export function createDefaultBuddyStore(nowMs: number): BuddyStoreFile {
  return {
    schemaVersion: BUDDY_STORE_SCHEMA_VERSION,
    buddy: createBuddyState({ id: "pocket-buddy-plus-primary", displayName: "Buddy", nowMs }),
    dock: defaultDockPreferences,
  };
}

export function loadBuddyStore(userDataPath: string, nowMs: number, stamp: string): LoadBuddyStoreResult {
  const path = getBuddyStorePath(userDataPath);
  if (!existsSync(path)) {
    return { store: createDefaultBuddyStore(nowMs), recovered: false, quarantinePath: null };
  }

  let parsed: BuddyStoreFile | null = null;
  try {
    parsed = parseBuddyStoreFile(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    parsed = null;
  }

  if (parsed) return { store: parsed, recovered: false, quarantinePath: null };

  const quarantinePath = quarantineBuddyStore(userDataPath, stamp);
  return { store: createDefaultBuddyStore(nowMs), recovered: true, quarantinePath };
}

/**
 * Atomic write: a full temp file is written and then renamed over the target, so
 * an interrupted save can never leave a half-written store behind.
 */
export function saveBuddyStore(userDataPath: string, store: BuddyStoreFile): void {
  const dir = getBuddyStoreDir(userDataPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = getBuddyStorePath(userDataPath);
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, path);
}
