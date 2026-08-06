import assert from "node:assert/strict";

import {
  pocketBuddyPlusBundledPluginIds,
  registerPocketBuddyPlusBundledPlugins,
} from "../src/product-bundled-plugins.js";

const ids = ["openpets.reminders"];
registerPocketBuddyPlusBundledPlugins(ids);
assert.deepEqual(ids, ["openpets.reminders", ...pocketBuddyPlusBundledPluginIds]);

registerPocketBuddyPlusBundledPlugins(ids);
assert.deepEqual(ids, ["openpets.reminders", ...pocketBuddyPlusBundledPluginIds], "registration must be idempotent");

console.log("PocketBuddy+ bundled creator plugin registration passed.");
