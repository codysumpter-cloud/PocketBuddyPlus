/**
 * Electron-aware wrapper over the pure identity rules in product.ts.
 *
 * Kept separate so product.ts stays importable from tests without Electron.
 */
import { app } from "electron";
import { join } from "node:path";

import { PRODUCT_NAME, isPocketBuddyPlusBuildFor, resolveProductNameFor } from "./product.js";

export function getRuntimeProductName(): string {
  return resolveProductNameFor(process.execPath, app.isPackaged);
}

export function isPlusRuntime(): boolean {
  return isPocketBuddyPlusBuildFor(process.execPath, app.isPackaged);
}

/**
 * Give the Plus build its own Electron user-data directory.
 *
 * Must run before anything reads a userData-derived path. The inherited OpenPets
 * target is deliberately left on Electron's default so existing installs keep
 * their current directory rather than silently migrating.
 */
export function applyPlusUserDataPath(): void {
  if (!isPlusRuntime()) return;
  app.setPath("userData", join(app.getPath("appData"), PRODUCT_NAME));
}
