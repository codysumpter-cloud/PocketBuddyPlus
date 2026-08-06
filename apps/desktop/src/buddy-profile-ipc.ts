import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { sameDocumentUrl } from "./buddy-chat.js";
import type { BuddyPublicProfile } from "./buddy/buddy-profile-contract.js";
import type { BuddyProfileStore } from "./buddy/buddy-profile-store.js";

let installed = false;

export function installBuddyProfileIpcHandlers(store: BuddyProfileStore): void {
  if (installed) return;
  installed = true;

  ipcMain.handle("openpets:buddy-profile-initialize", (event, candidate: unknown): BuddyPublicProfile => {
    assertControlCenterSender(event);
    return store.initialize(candidate);
  });

  ipcMain.handle("openpets:buddy-profile-get", (event): BuddyPublicProfile => {
    assertControlCenterSender(event);
    return store.getProfile();
  });

  ipcMain.handle("openpets:buddy-profile-sync", (event, candidate: unknown): BuddyPublicProfile => {
    assertControlCenterSender(event);
    return store.sync(candidate);
  });
}

function assertControlCenterSender(event: IpcMainInvokeEvent): void {
  if (event.sender.getType() !== "window" || event.senderFrame !== event.sender.mainFrame) {
    throw new Error("Pocket Buddy+ profile request came from an unexpected frame.");
  }

  const expectedFileUrl = pathToFileURL(join(app.getAppPath(), "dist", "renderer", "index.html")).href;
  if (sameDocumentUrl(event.senderFrame.url, expectedFileUrl)) return;

  const devUrl = getSafeControlCenterDevUrl();
  if (devUrl && sameDocumentUrl(event.senderFrame.url, devUrl)) return;
  throw new Error("Pocket Buddy+ profile request came from an unexpected window.");
}

function getSafeControlCenterDevUrl(): string | null {
  if (app.isPackaged) return null;
  const raw = process.env.OPENPETS_RENDERER_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol === "http:" || url.protocol === "https:") && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}
