/**
 * Both electron-builder targets package the same main process. These tests pin
 * the rule that keeps them apart: identity is resolved from the packaged
 * package.json "name" (which electron-builder.plus.yml overrides via
 * extraMetadata), never from a compile-time constant.
 *
 * Regression: the inherited OpenPets build presented itself as Pocket Buddy Plus
 * and shared its Electron userData directory ("@open-pets/desktop") with the Plus
 * build, so reaction counts written by one build appeared in the other.
 */
import assert from "node:assert/strict";

import {
  PRODUCT_NAME,
  UPSTREAM_PROJECT_NAME,
  isPocketBuddyPlusBuild,
  resolveProductName,
} from "../src/product.js";

// The Plus target sets extraMetadata.name to exactly PRODUCT_NAME.
assert.equal(resolveProductName(PRODUCT_NAME), PRODUCT_NAME);
assert.equal(isPocketBuddyPlusBuild(PRODUCT_NAME), true);

// The inherited target ships the unmodified workspace package name.
assert.equal(resolveProductName("@open-pets/desktop"), UPSTREAM_PROJECT_NAME);
assert.equal(isPocketBuddyPlusBuild("@open-pets/desktop"), false);

// Anything unrecognized must fall back to the upstream identity rather than
// silently claiming to be Pocket Buddy Plus.
for (const name of [undefined, "", "openpets", "OpenPets", "pocket-buddy-plus", "Pocket Buddy"]) {
  assert.equal(isPocketBuddyPlusBuild(name), false, `unexpected Plus identity for ${JSON.stringify(name)}`);
  assert.equal(resolveProductName(name), UPSTREAM_PROJECT_NAME);
}

// The two identities must never collide, or the userData directories collide too.
assert.notEqual(PRODUCT_NAME, UPSTREAM_PROJECT_NAME);

console.log("Product identity validation passed.");
