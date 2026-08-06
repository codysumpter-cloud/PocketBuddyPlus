// Prismcade Creator — PocketBuddy+ panel integration.

export const MAX_TRANSFER_CHUNKS = 1024;
export const MAX_TRANSFER_CHARS = 32 * 1024 * 1024;
export const PANEL_NAME = "creator";

export function sanitizeSuggestedName(value, fallback = "prismpixel-export.json") {
  const text = typeof value === "string" ? value.trim() : "";
  const name = (text || fallback)
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 160)
    .trim();
  return name || fallback;
}

export function decodeBase64(value) {
  if (typeof value !== "string") throw new Error("Base64 payload must be a string.");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function createTransferHandler(ctx, panel) {
  const transfers = new Map();

  return async function handlePanelMessage(message) {
    if (!message || typeof message !== "object") return;
    const type = message.type;
    const transferId = typeof message.transferId === "string" ? message.transferId : "";

    if (type === "save-begin") {
      const totalChunks = Number(message.totalChunks);
      const encoding = message.encoding === "base64" ? "base64" : "utf8";
      if (!transferId || !Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_TRANSFER_CHUNKS) {
        await panel.postMessage({ type: "save-error", transferId, error: "Invalid transfer metadata." });
        return;
      }
      transfers.set(transferId, {
        suggestedName: sanitizeSuggestedName(message.suggestedName),
        encoding,
        totalChunks,
        chunks: new Array(totalChunks),
        charCount: 0,
      });
      return;
    }

    if (type === "save-chunk") {
      const transfer = transfers.get(transferId);
      const index = Number(message.index);
      const data = typeof message.data === "string" ? message.data : "";
      if (!transfer || !Number.isInteger(index) || index < 0 || index >= transfer.totalChunks || data.length > 48_000) {
        await panel.postMessage({ type: "save-error", transferId, error: "Invalid transfer chunk." });
        return;
      }
      const previous = transfer.chunks[index];
      transfer.charCount += data.length - (typeof previous === "string" ? previous.length : 0);
      if (transfer.charCount > MAX_TRANSFER_CHARS) {
        transfers.delete(transferId);
        await panel.postMessage({ type: "save-error", transferId, error: "Export is too large." });
        return;
      }
      transfer.chunks[index] = data;
      return;
    }

    if (type === "save-end") {
      const transfer = transfers.get(transferId);
      if (!transfer || transfer.chunks.some((chunk) => typeof chunk !== "string")) {
        await panel.postMessage({ type: "save-error", transferId, error: "Export transfer is incomplete." });
        return;
      }
      transfers.delete(transferId);
      try {
        const joined = transfer.chunks.join("");
        const data = transfer.encoding === "base64" ? decodeBase64(joined) : joined;
        await ctx.files.save({ suggestedName: transfer.suggestedName, data });
        await panel.postMessage({ type: "save-complete", transferId, suggestedName: transfer.suggestedName });
      } catch (error) {
        await panel.postMessage({
          type: "save-error",
          transferId,
          error: error instanceof Error ? error.message : "Could not save export.",
        });
      }
    }
  };
}

export async function openCreator(ctx) {
  const panel = await ctx.ui.panel({
    panel: PANEL_NAME,
    title: "Prismcade Creator",
    width: 1120,
    height: 780,
  });
  panel.onMessage(createTransferHandler(ctx, panel));
  return panel;
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await ctx.commands.register(
        {
          id: "open-creator",
          title: "$t:command.open.title",
          description: "$t:command.open.description",
          icon: "sparkles",
        },
        () => openCreator(ctx),
      );
    },
  });
}
