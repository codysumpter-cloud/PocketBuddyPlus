/**
 * Both electron-builder targets package the same main process. These tests pin
 * the rule that keeps them apart: identity comes from the packaged executable
 * name, which each config already sets, never from a compile-time constant.
 *
 * Regression 1: the inherited OpenPets build presented itself as Pocket Buddy
 * Plus and shared its Electron userData directory ("@open-pets/desktop") with
 * the Plus build, so reaction counts written by one build appeared in the other.
 *
 * Regression 2: the first fix used electron-builder's `extraMetadata`, which in
 * this pnpm workspace rewrites the workspace-root package.json in place. Hence
 * the executable-name rule below -- it requires no build-time file rewriting.
 */
import assert from "node:assert/strict";

import {
  PLUS_EXECUTABLE_NAME,
  PRODUCT_NAME,
  UPSTREAM_PROJECT_NAME,
  isPocketBuddyPlusBuildFor,
  resolveProductNameFor,
} from "../src/product.js";

// The Plus target's executableName, across platform path shapes.
for (const execPath of [
  `/Applications/Pocket Buddy Plus.app/Contents/MacOS/${PLUS_EXECUTABLE_NAME}`,
  `/opt/pocketbuddyplus/${PLUS_EXECUTABLE_NAME}`,
  `C:\\Program Files\\Pocket Buddy Plus\\${PLUS_EXECUTABLE_NAME}.exe`,
]) {
  assert.equal(resolveProductNameFor(execPath, true), PRODUCT_NAME, execPath);
  assert.equal(isPocketBuddyPlusBuildFor(execPath, true), true, execPath);
}

// The inherited OpenPets target must keep its own identity and userData path.
for (const execPath of [
  "/Applications/OpenPets.app/Contents/MacOS/openpets",
  "/opt/openpets/openpets",
  "C:\\Program Files\\OpenPets\\openpets.exe",
]) {
  assert.equal(resolveProductNameFor(execPath, true), UPSTREAM_PROJECT_NAME, execPath);
  assert.equal(isPocketBuddyPlusBuildFor(execPath, true), false, execPath);
}

// Anything unrecognized falls back to the upstream identity rather than
// silently claiming to be Pocket Buddy Plus.
for (const execPath of ["", "/usr/bin/electron", "/tmp/something-else", "/x/pocket-buddy", "/x/pocket-buddy-plus-extra"]) {
  assert.equal(isPocketBuddyPlusBuildFor(execPath, true), false, execPath);
  assert.equal(resolveProductNameFor(execPath, true), UPSTREAM_PROJECT_NAME, execPath);
}

// Unpackaged runs are development runs of this repository, which is Plus.
assert.equal(resolveProductNameFor("/usr/local/bin/electron", false), PRODUCT_NAME);
assert.equal(isPocketBuddyPlusBuildFor("/usr/local/bin/electron", false), true);

// The two identities must never collide, or the userData directories collide too.
assert.notEqual(PRODUCT_NAME, UPSTREAM_PROJECT_NAME);

console.log("Product identity validation passed.");
