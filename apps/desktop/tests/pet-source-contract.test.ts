/**
 * Regression guard for the Pets route crash:
 *
 *   TypeError: Cannot use 'in' operator to search for 'preview' in builtin
 *
 * The Pets route resolves a thumbnail with
 *   `p.source && "preview" in p.source ? p.source.preview : undefined`
 * The `in` operator throws on primitives, so this is only safe because
 * InstalledPetState.source is an optional discriminated union of OBJECTS:
 *   { kind?: "catalog"; catalogVersion: 2; zip: string; preview: string }
 *   | { kind: "codex"; path: string }
 *
 * The crash came from a harness fixture that set `source` to a string. These
 * assertions pin the contract at runtime and prove the expression is safe for
 * every shape the contract permits, including the absent case.
 */
import assert from "node:assert/strict";

import type { InstalledPetState } from "../src/app-state.js";
import { petsState } from "./verify-ui-fixtures.js";

/** Mirrors the renderer expression in src/renderer/src/main.tsx. */
function readSourcePreview(pet: InstalledPetState): string | undefined {
  return pet.source && "preview" in pet.source ? (pet.source as { preview?: string }).preview : undefined;
}

// --- The contract itself -----------------------------------------------------

const catalogPet: InstalledPetState = {
  id: "catalog", displayName: "Catalog", builtIn: false, protected: false, installed: true,
  source: { kind: "catalog", catalogVersion: 2, zip: "z.zip", preview: "preview.png" },
};
const codexPet: InstalledPetState = {
  id: "codex", displayName: "Codex", builtIn: false, protected: false, installed: true,
  source: { kind: "codex", path: "/tmp/codex" },
};
const bundledPet: InstalledPetState = {
  id: "builtin", displayName: "Built in", builtIn: true, protected: true, installed: true,
};

// Every permitted shape must be safe, and only the catalog variant has a preview.
assert.equal(readSourcePreview(catalogPet), "preview.png");
assert.equal(readSourcePreview(codexPet), undefined, "codex source has no preview member");
assert.equal(readSourcePreview(bundledPet), undefined, "absent source must short-circuit");

// --- The fixture the headless harness serves ---------------------------------

assert.ok(petsState.pets.installed.length > 0, "pets fixture must not be empty");
for (const pet of petsState.pets.installed) {
  assert.notEqual(
    typeof pet.source,
    "string",
    `pet "${pet.id}" has a string source; the 'in' operator throws on primitives`,
  );
  if (pet.source !== undefined) {
    assert.equal(typeof pet.source, "object", `pet "${pet.id}" source must be an object`);
    assert.notEqual(pet.source, null, `pet "${pet.id}" source must not be null`);
  }
  // The renderer expression must not throw for any fixture pet.
  assert.doesNotThrow(() => readSourcePreview(pet), `pet "${pet.id}" breaks the Pets thumbnail lookup`);
}

// The fixture must exercise all three shapes, or it would not catch a regression
// in the variants it omits.
const kinds = petsState.pets.installed.map((pet) => (pet.source === undefined ? "none" : pet.source.kind ?? "catalog"));
for (const expected of ["none", "catalog", "codex"] as const) {
  assert.ok(kinds.includes(expected), `pets fixture must cover a "${expected}" source variant`);
}

console.log("Pet source contract validation passed.");
