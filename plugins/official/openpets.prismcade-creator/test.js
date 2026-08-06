import assert from "node:assert/strict";
import {
  createTransferHandler,
  decodeBase64,
  register,
  sanitizeSuggestedName,
} from "./index.js";

assert.equal(sanitizeSuggestedName("  wizard/outfit?.json  "), "wizard-outfit-.json");
assert.deepEqual([...decodeBase64("SGk=")], [72, 105]);

let definition;
register({ register(value) { definition = value; } });
const commands = new Map();
await definition.start({
  commands: {
    async register(meta, handler) { commands.set(meta.id, { meta, handler }); },
  },
});
assert.ok(commands.has("open-creator"));

const savedFiles = [];
const panelMessages = [];
const ctx = { files: { async save(file) { savedFiles.push(file); } } };
const panel = { async postMessage(message) { panelMessages.push(message); } };
const handle = createTransferHandler(ctx, panel);

await handle({ type: "save-begin", transferId: "one", suggestedName: "item.json", encoding: "utf8", totalChunks: 2 });
await handle({ type: "save-chunk", transferId: "one", index: 0, data: "{\"ok\":" });
await handle({ type: "save-chunk", transferId: "one", index: 1, data: "true}" });
await handle({ type: "save-end", transferId: "one" });
assert.equal(savedFiles[0].suggestedName, "item.json");
assert.equal(savedFiles[0].data, "{\"ok\":true}");
assert.equal(panelMessages.at(-1).type, "save-complete");

await handle({ type: "save-begin", transferId: "two", suggestedName: "tiny.png", encoding: "base64", totalChunks: 1 });
await handle({ type: "save-chunk", transferId: "two", index: 0, data: "SGk=" });
await handle({ type: "save-end", transferId: "two" });
assert.deepEqual([...savedFiles[1].data], [72, 105]);

console.log("openpets.prismcade-creator: all checks passed.");
