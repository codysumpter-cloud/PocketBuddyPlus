import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { app, BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from "electron";

import { setConfinementOuterBounds } from "./confinement-manager.js";
import {
  clampWindowBoundsToSelectedWorkArea,
  getDisplayChoices,
  getDisplayKey,
  getEffectiveSelectedDisplayKey,
  getSelectedDisplayPreference,
  getSelectedWorkArea,
  invalidateDisplayCache,
  isDisplaySelection,
  setSelectedDisplay,
  type DisplayChoice,
  type DisplaySelection,
} from "./display.js";
import { debug, info, warn } from "./logger.js";

const monitorStateFileName = "monitor-selection.json";
const monitorStateVersion = 1;

let statePath: string | null = null;
let handlersInstalled = false;
let windowGuardInstalled = false;
const guardInProgress = new WeakSet<BrowserWindow>();
const originalMinimumSizes = new WeakMap<BrowserWindow, readonly number[]>();

type MonitorStateFile = {
  readonly version: 1;
  readonly selected: DisplaySelection;
};

export type MonitorSelectionSnapshot = {
  readonly selected: DisplaySelection;
  readonly effective: string;
  readonly monitors: ReadonlyArray<DisplayChoice>;
};

/**
 * Load the monitor preference before any user-facing BrowserWindow is shown.
 * An explicitly selected but currently disconnected monitor stays persisted;
 * display.ts safely uses the primary monitor until the selected monitor returns.
 */
export function initializeMonitorSelection(userDataPath: string): void {
  statePath = join(userDataPath, monitorStateFileName);
  let selected: DisplaySelection = "primary";
  try {
    if (existsSync(statePath)) {
      const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<MonitorStateFile>;
      if (parsed.version === monitorStateVersion && isDisplaySelection(parsed.selected)) selected = parsed.selected;
    }
  } catch (error) {
    warn("ui", "monitor preference could not be read; using primary monitor", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  setSelectedDisplay(selected);
  syncOuterConfinementBounds();
  writeState(selected);
  info("ui", "monitor selection initialized", { selected, effective: getEffectiveSelectedDisplayKey() });
}

export function getMonitorSelectionSnapshot(): MonitorSelectionSnapshot {
  return {
    selected: getSelectedDisplayPreference(),
    effective: getEffectiveSelectedDisplayKey(),
    monitors: getDisplayChoices(),
  };
}

export function setMonitorSelection(selection: unknown): MonitorSelectionSnapshot {
  if (!isDisplaySelection(selection)) throw new Error("Invalid monitor selection.");
  if (selection !== "primary" && !getDisplayChoices().some((display) => display.key === selection)) {
    throw new Error("The selected monitor is not currently connected.");
  }

  setSelectedDisplay(selection);
  syncOuterConfinementBounds();
  writeState(selection);
  reclampVisibleWindows("monitor-selection-changed");
  const snapshot = getMonitorSelectionSnapshot();
  info("ui", "monitor selection changed", { selected: snapshot.selected, effective: snapshot.effective });
  return snapshot;
}

export function installMonitorSelectionIpc(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  ipcMain.handle("openpets:get-monitor-selection", (event) => {
    assertControlCenterSender(event);
    return getMonitorSelectionSnapshot();
  });
  ipcMain.handle("openpets:set-monitor-selection", (event, selection: unknown) => {
    assertControlCenterSender(event);
    return setMonitorSelection(selection);
  });
}

/**
 * Enforce the selected monitor for every user-facing BrowserWindow, regardless
 * of whether the executable came from an installed or portable Windows build.
 * Hidden plugin hosts are not touched because they never emit `show`.
 */
export function installMonitorWindowGuard(): void {
  if (windowGuardInstalled) return;
  windowGuardInstalled = true;

  app.on("browser-window-created", (_event, window) => attachWindowGuard(window));
  for (const window of BrowserWindow.getAllWindows()) attachWindowGuard(window);

  const topologyChanged = (reason: string) => (): void => {
    invalidateDisplayCache();
    syncOuterConfinementBounds();
    debug("ui", "display topology changed", { reason, selected: getSelectedDisplayPreference() });
    setTimeout(() => reclampVisibleWindows(reason), 120).unref?.();
  };
  screen.on("display-added", topologyChanged("display-added"));
  screen.on("display-removed", topologyChanged("display-removed"));
  screen.on("display-metrics-changed", topologyChanged("display-metrics-changed"));
}

export function reclampVisibleWindows(reason = "manual"): void {
  invalidateDisplayCache();
  syncOuterConfinementBounds();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && window.isVisible()) clampWindowToSelectedMonitor(window, reason);
  }
}

function attachWindowGuard(window: BrowserWindow): void {
  if (window.isDestroyed() || originalMinimumSizes.has(window)) return;
  originalMinimumSizes.set(window, window.getMinimumSize());

  const clamp = (reason: string): void => clampWindowToSelectedMonitor(window, reason);
  window.on("show", () => clamp("show"));
  window.on("restore", () => clamp("restore"));
  window.on("move", () => clamp("move"));
  window.on("resize", () => clamp("resize"));
  window.on("maximize", () => clamp("maximize"));
}

function clampWindowToSelectedMonitor(window: BrowserWindow, reason: string): void {
  if (window.isDestroyed() || guardInProgress.has(window)) return;

  guardInProgress.add(window);
  try {
    const area = getSelectedWorkArea();
    const originalMin = originalMinimumSizes.get(window) ?? window.getMinimumSize();
    const minWidth = Math.max(1, Math.min(originalMin[0] ?? 1, Math.floor(area.width)));
    const minHeight = Math.max(1, Math.min(originalMin[1] ?? 1, Math.floor(area.height)));
    const currentMinimum = window.getMinimumSize();
    if (currentMinimum[0] !== minWidth || currentMinimum[1] !== minHeight) {
      window.setMinimumSize(minWidth, minHeight);
    }

    const current = window.getBounds();
    const effectiveDisplayKey = getEffectiveSelectedDisplayKey();
    const currentDisplayKey = getDisplayKey(screen.getDisplayMatching(current).bounds);

    // Windows can move a maximized window between monitors with Win+Shift+Arrow.
    // setBounds() is not reliable while maximized, so if that move escapes the
    // selected monitor we restore the normal bounds, relocate them safely, and
    // maximize again on the selected monitor. The operation is guarded against
    // recursive move/resize/maximize events above.
    if (window.isMaximized() && currentDisplayKey !== effectiveDisplayKey) {
      const normal = window.getNormalBounds();
      const safeNormal = clampWindowBoundsToSelectedWorkArea(normal);
      debug("ui", "maximized window returned to selected monitor", {
        reason,
        windowId: window.id,
        currentDisplayKey,
        selectedDisplayKey: effectiveDisplayKey,
        normal,
        safeNormal,
      });
      window.unmaximize();
      window.setBounds(safeNormal, false);
      window.maximize();
      return;
    }

    const safe = clampWindowBoundsToSelectedWorkArea(current);
    if (
      safe.x !== current.x || safe.y !== current.y ||
      safe.width !== current.width || safe.height !== current.height
    ) {
      debug("ui", "window clamped to selected monitor", {
        reason,
        windowId: window.id,
        from: current,
        to: safe,
        selected: getSelectedDisplayPreference(),
        effective: effectiveDisplayKey,
      });
      window.setBounds(safe, false);
    }
  } finally {
    guardInProgress.delete(window);
  }
}

function syncOuterConfinementBounds(): void {
  const area = getSelectedWorkArea();
  setConfinementOuterBounds({ x: area.x, y: area.y, width: area.width, height: area.height });
}

function writeState(selected: DisplaySelection): void {
  if (!statePath) return;
  const next: MonitorStateFile = { version: monitorStateVersion, selected };
  mkdirSync(dirname(statePath), { recursive: true });
  const temp = `${statePath}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temp, statePath);
}

function assertControlCenterSender(event: IpcMainInvokeEvent): void {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner || owner.isDestroyed()) throw new Error("Monitor settings request came from an unexpected window.");

  const rawUrl = event.sender.getURL();
  try {
    const url = new URL(rawUrl);
    const devRenderer = !app.isPackaged && (url.protocol === "http:" || url.protocol === "https:") && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    const packagedRenderer = url.protocol === "file:" && decodeURIComponent(url.pathname).replace(/\\/g, "/").endsWith("/dist/renderer/index.html");
    if (devRenderer || packagedRenderer) return;
  } catch {
    // Fall through to the hard failure below.
  }
  throw new Error("Monitor settings request came from an unexpected renderer.");
}
