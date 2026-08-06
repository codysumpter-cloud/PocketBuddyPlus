import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { buildBuddyChatAiRequest, normalizeBuddyChatReply, parseBuddyChatRequest, sameDocumentUrl } from "./buddy-chat.js";
import { warn } from "./logger.js";
import type { PluginAiGateway } from "./plugin-ai-gateway.js";
import { getPluginPlatformSettings } from "./plugin-platform-settings.js";

export type BuddyChatIpcResponse =
  | { readonly ok: true; readonly text: string; readonly provider: string; readonly model: string }
  | { readonly ok: false; readonly reason: "unavailable" | "empty" | "provider-error" };

let installed = false;

export function installBuddyChatIpcHandler(aiGateway: PluginAiGateway): void {
  if (installed) return;
  installed = true;

  ipcMain.handle("openpets:buddy-chat-complete", async (event, value: unknown): Promise<BuddyChatIpcResponse> => {
    assertControlCenterSender(event);
    const request = parseBuddyChatRequest(value);
    const startedAt = Date.now();

    try {
      if (!(await aiGateway.available())) return { ok: false, reason: "unavailable" };
      const result = await aiGateway.complete(buildBuddyChatAiRequest(request));
      const text = normalizeBuddyChatReply(result.text);
      if (!text) return { ok: false, reason: "empty" };
      const settings = getPluginPlatformSettings().ai;
      return {
        ok: true,
        text,
        provider: settings.provider,
        model: settings.model,
      };
    } catch (error) {
      warn("buddy-chat", "provider completion failed", {
        durationMs: Date.now() - startedAt,
        historyMessages: request.history.length,
        messageLength: request.message.length,
        reason: error instanceof Error ? error.message : "unknown",
      });
      return { ok: false, reason: "provider-error" };
    }
  });
}

function assertControlCenterSender(event: IpcMainInvokeEvent): void {
  if (event.sender.getType() !== "window" || event.senderFrame !== event.sender.mainFrame) {
    throw new Error("Pocket Buddy+ chat request came from an unexpected frame.");
  }

  const expectedFileUrl = pathToFileURL(join(app.getAppPath(), "dist", "renderer", "index.html")).href;
  if (sameDocumentUrl(event.senderFrame.url, expectedFileUrl)) return;

  const devUrl = getSafeControlCenterDevUrl();
  if (devUrl && sameDocumentUrl(event.senderFrame.url, devUrl)) return;

  throw new Error("Pocket Buddy+ chat request came from an unexpected window.");
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
