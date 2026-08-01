/**
 * Both electron-builder targets package the same main process. These tests pin
 * the rule that keeps them apart: identity comes from the packaged executable
 * name, which each config already sets, never from a compile-time constant.
 *
 * The user-facing product contract is exact: `Pocket Buddy+`. Internal
 * `@open-pets/*` compatibility identifiers and upstream attribution may remain,
 * but inherited product wording must be normalized before it reaches UI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLUS_EXECUTABLE_NAME,
  PRODUCT_NAME,
  PRODUCT_SHORT_NAME,
  UPSTREAM_PROJECT_NAME,
  brandVisibleText,
  isPocketBuddyPlusBuildFor,
  resolveProductNameFor,
} from "../src/product.js";

assert.equal(PRODUCT_NAME, "Pocket Buddy+");
assert.equal(PRODUCT_SHORT_NAME, "Buddy+");
assert.equal(brandVisibleText("OpenPets Control Center"), "Pocket Buddy+ Control Center");
assert.equal(brandVisibleText("Open Pets plugin"), "Pocket Buddy+ plugin");
assert.equal(brandVisibleText("Pocket Buddy Plus Settings"), "Pocket Buddy+ Settings");
assert.equal(brandVisibleText("Buddy Plus status"), "Buddy+ status");

// The Plus target's executable identity across platform path shapes. macOS can
// use either the explicit executableName or productName inside the .app bundle.
for (const execPath of [
  `/Applications/Pocket Buddy+.app/Contents/MacOS/${PLUS_EXECUTABLE_NAME}`,
  `/Applications/Pocket Buddy+.app/Contents/MacOS/${PRODUCT_NAME}`,
  `/opt/pocketbuddyplus/${PLUS_EXECUTABLE_NAME}`,
  `C:\\Program Files\\Pocket Buddy+\\${PLUS_EXECUTABLE_NAME}.exe`,
]) {
  assert.equal(resolveProductNameFor(execPath, true), PRODUCT_NAME, execPath);
  assert.equal(isPocketBuddyPlusBuildFor(execPath, true), true, execPath);
}

// The inherited target must keep its own technical identity and userData path.
for (const execPath of [
  "/Applications/OpenPets.app/Contents/MacOS/openpets",
  "/opt/openpets/openpets",
  "C:\\Program Files\\OpenPets\\openpets.exe",
]) {
  assert.equal(resolveProductNameFor(execPath, true), UPSTREAM_PROJECT_NAME, execPath);
  assert.equal(isPocketBuddyPlusBuildFor(execPath, true), false, execPath);
}

// Anything unrecognized falls back to the upstream technical identity rather
// than silently claiming to be Pocket Buddy+.
for (const execPath of ["", "/usr/bin/electron", "/tmp/something-else", "/x/pocket-buddy", "/x/pocket-buddy-plus-extra"]) {
  assert.equal(isPocketBuddyPlusBuildFor(execPath, true), false, execPath);
  assert.equal(resolveProductNameFor(execPath, true), UPSTREAM_PROJECT_NAME, execPath);
}

// Unpackaged runs are development runs of this repository, which is Plus.
assert.equal(resolveProductNameFor("/usr/local/bin/electron", false), PRODUCT_NAME);
assert.equal(isPocketBuddyPlusBuildFor("/usr/local/bin/electron", false), true);

// The two identities must never collide, or the userData directories collide too.
assert.notEqual(PRODUCT_NAME, UPSTREAM_PROJECT_NAME);

// The actual release command must use the exact user-facing config. The inherited
// electron-builder.plus.yml stays as a regression fixture for the original fork
// contract; it is not the shipping identity.
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(readFileSync(resolve(desktopDir, "package.json"), "utf8")) as { scripts?: Record<string, string> };
const releaseConfig = readFileSync(resolve(desktopDir, "electron-builder.pocket-buddy-plus.yml"), "utf8");
assert.match(packageJson.scripts?.["package:plus"] ?? "", /electron-builder\.pocket-buddy-plus\.yml/);
assert.match(packageJson.scripts?.["package:plus:dir"] ?? "", /electron-builder\.pocket-buddy-plus\.yml/);
assert.match(releaseConfig, /^productName: Pocket Buddy\+$/m);
assert.match(releaseConfig, /mac:\s*\n\s*executableName: Pocket Buddy\+/);
assert.match(releaseConfig, /shortcutName: Pocket Buddy\+/);
assert.match(releaseConfig, /uninstallDisplayName: Pocket Buddy\+/);
assert.match(releaseConfig, /artifactName: Pocket-Buddy\+\-/);

console.log("Product identity validation passed.");
