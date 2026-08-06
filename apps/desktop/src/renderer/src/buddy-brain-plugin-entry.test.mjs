import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./buddy-brain-plugin-entry.ts", import.meta.url), "utf8");

assert.match(source, /openpets\.virtual-pet/);
assert.match(source, /pocket-buddy-plus:buddy-ui:v1/);
assert.match(source, /migrated-backup:v1/);
assert.match(source, /import-legacy-buddy-ui/);
assert.match(source, /result\.ok/);
assert.match(source, /removeItem\(LEGACY_STORAGE_KEY\)/);
assert.match(source, /pb-brain-plugin-nav/);
assert.match(source, /pb-brain-plugin-card/);

console.log("Buddy Brain migration adapter contract passed.");
