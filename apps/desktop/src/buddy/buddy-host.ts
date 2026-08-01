/**
 * The authoritative Buddy host.
 *
 * All Buddy mutation funnels through here. Plugins and UI surfaces may *request*
 * care actions; nothing outside this module is allowed to write affection or
 * need values directly, which is why the exported surface is a snapshot getter
 * plus a narrow command entry point.
 *
 * Time advancement is driven by wall-clock deltas from a coarse timer, never by
 * an animation frame, so simulation correctness does not depend on render rate
 * and a machine that slept for an hour advances by an hour on the next tick.
 */
import { app } from "electron";

import { debug, error as logError, info } from "../logger.js";
import {
  type BuddyCareAction,
  type BuddySnapshot,
  type BuddyState,
  advanceBuddyState,
  applyBuddyCare,
  createBuddySnapshot,
} from "./buddy-core.js";
import {
  type BuddyStoreFile,
  type DockPreferences,
  loadBuddyStore,
  normalizeDockPreferences,
  saveBuddyStore,
} from "./buddy-store.js";

const tickIntervalMs = 60_000;
/** Ignore absurd deltas (clock changes) but still credit real sleep time. */
const maxCreditedElapsedMs = 12 * 60 * 60 * 1000;

export type BuddyHostListener = (snapshot: BuddySnapshot) => void;

let store: BuddyStoreFile | null = null;
let userDataPath: string | null = null;
let lastTickMs = 0;
let ticker: NodeJS.Timeout | null = null;
let saveTimer: NodeJS.Timeout | null = null;
const listeners = new Set<BuddyHostListener>();

function requireStore(): BuddyStoreFile {
  if (!store) throw new Error("Buddy host is not initialized");
  return store;
}

function emit(): void {
  const snapshot = getBuddySnapshot();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      logError("buddy", "snapshot listener failed", error);
    }
  }
}

/** Coalesce rapid mutations into one atomic write. */
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushBuddyStore();
  }, 750);
  saveTimer.unref?.();
}

export function flushBuddyStore(): void {
  if (!store || !userDataPath) return;
  try {
    saveBuddyStore(userDataPath, store);
    debug("buddy", "store saved");
  } catch (error) {
    logError("buddy", "store save failed", error);
  }
}

function setBuddy(next: BuddyState): void {
  store = { ...requireStore(), buddy: next };
  scheduleSave();
  emit();
}

/** Advance by real elapsed wall-clock time since the last tick. */
export function advanceBuddyClock(nowMs: number): void {
  if (!store) return;
  const elapsed = nowMs - lastTickMs;
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    lastTickMs = nowMs;
    return;
  }
  lastTickMs = nowMs;
  const credited = Math.min(elapsed, maxCreditedElapsedMs);
  setBuddy(advanceBuddyState(store.buddy, credited));
}

export function initializeBuddyHost(nowMs = Date.now()): void {
  if (store) return;
  userDataPath = app.getPath("userData");
  const stamp = `${nowMs}`;
  const result = loadBuddyStore(userDataPath, nowMs, stamp);
  store = result.store;
  lastTickMs = nowMs;

  if (result.recovered) {
    logError("buddy", "unreadable buddy store quarantined; started a fresh Buddy", {
      quarantinePath: result.quarantinePath,
    });
  }

  // Credit time that passed while the app was closed.
  const offlineMs = nowMs - store.buddy.updatedAtMs;
  if (offlineMs > 0) {
    store = { ...store, buddy: advanceBuddyState(store.buddy, Math.min(offlineMs, maxCreditedElapsedMs)) };
  }

  ticker = setInterval(() => advanceBuddyClock(Date.now()), tickIntervalMs);
  ticker.unref?.();

  info("buddy", "host initialized", {
    id: store.buddy.id,
    name: store.buddy.displayName,
    recovered: result.recovered,
    offlineMs: Math.max(0, offlineMs),
  });
  flushBuddyStore();
}

export function shutdownBuddyHost(): void {
  if (ticker) { clearInterval(ticker); ticker = null; }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  flushBuddyStore();
}

export function getBuddySnapshot(): BuddySnapshot {
  return createBuddySnapshot(requireStore().buddy);
}

export function getBuddyState(): BuddyState {
  return requireStore().buddy;
}

/**
 * The only sanctioned mutation path for care actions. Returns the resulting
 * snapshot so a caller can render a reaction without reading state itself.
 */
export function requestBuddyCare(action: BuddyCareAction, nowMs = Date.now()): BuddySnapshot {
  const current = requireStore().buddy;
  // applyBuddyCare rejects backwards clocks; clamp rather than throw so a
  // user-initiated action never fails because of a system clock adjustment.
  const timestamp = Math.max(nowMs, current.updatedAtMs);
  setBuddy(applyBuddyCare(current, action, timestamp));
  info("buddy", "care action applied", { action });
  return getBuddySnapshot();
}

export function renameBuddy(displayName: string): BuddySnapshot {
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Buddy name must not be empty");
  setBuddy({ ...requireStore().buddy, displayName: trimmed.slice(0, 40) });
  return getBuddySnapshot();
}

export function getDockPreferences(): DockPreferences {
  return requireStore().dock;
}

export function setDockPreferences(input: unknown): DockPreferences {
  const dock = normalizeDockPreferences({ ...requireStore().dock, ...(input as object ?? {}) });
  store = { ...requireStore(), dock };
  scheduleSave();
  return dock;
}

export function subscribeToBuddy(listener: BuddyHostListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: reset module state between test cases. */
export function _resetBuddyHostForTesting(): void {
  if (ticker) { clearInterval(ticker); ticker = null; }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  store = null;
  userDataPath = null;
  lastTickMs = 0;
  listeners.clear();
}
