import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installBuddyProfilePluginCapability, type ProfiledPluginPetInfo } from "../src/buddy-profile-plugin-capability.js";
import {
  buddyProfilesMateriallyEqual,
  createDefaultBuddyProfile,
  parseBuddyProfileCandidate,
  profileFromBuddyState,
} from "../src/buddy/buddy-profile-contract.js";
import { BUDDY_PROFILE_FILENAME, BuddyProfileStore } from "../src/buddy/buddy-profile-store.js";
import { applyBuddyCare, createBuddyState } from "../src/buddy/buddy-core.js";
import type { ElectronPluginHostCapabilities } from "../src/plugin-host-capabilities.js";
import type { PluginPetInfo } from "../src/plugin-sdk-bridge.js";

const root = mkdtempSync(join(tmpdir(), "pocket-buddy-profile-"));
let now = 10_000;

try {
  const legacyBuddy = applyBuddyCare(createBuddyState({
    id: "primary-buddy",
    displayName: "Pixel",
    nowMs: 1_000,
    affection: 0.42,
    needs: { hunger: 0.5, play: 0.1 },
  }), "pet", 9_000);
  const legacyCandidate = { buddy: legacyBuddy, wardrobe: "blue-scarf" };

  const store = new BuddyProfileStore(root, () => now);
  const migrated = store.initialize(legacyCandidate);
  assert.equal(migrated.displayName, "Pixel");
  assert.equal(migrated.wardrobe, "blue-scarf");
  assert.equal(migrated.lastCareAction, "pet");
  assert.ok(existsSync(join(root, BUDDY_PROFILE_FILENAME)));

  const persistedDocument = JSON.parse(readFileSync(join(root, BUDDY_PROFILE_FILENAME), "utf8")) as { origin?: string; profile?: unknown };
  assert.equal(persistedDocument.origin, "migrated");
  assert.equal(parseBuddyProfileCandidate(persistedDocument.profile).displayName, "Pixel");

  now += 3_600_000;
  const advanced = store.getProfile();
  assert.ok(advanced.ageMs > migrated.ageMs);
  assert.ok(advanced.needs.hunger > migrated.needs.hunger);

  const reloaded = new BuddyProfileStore(root, () => now).initialize();
  assert.equal(reloaded.displayName, "Pixel");
  assert.equal(reloaded.wardrobe, "blue-scarf");
  assert.ok(buddyProfilesMateriallyEqual(reloaded, advanced));

  const stale = profileFromBuddyState({ ...legacyBuddy, updatedAtMs: 2_000 }, "classic");
  assert.equal(store.sync(stale).displayName, "Pixel", "stale renderer state must not roll the host profile backwards");

  const renamedBuddy = { ...legacyBuddy, displayName: "Nova", updatedAtMs: now + 1, ageMs: advanced.ageMs + 1 };
  const synced = store.sync({ buddy: renamedBuddy, wardrobe: "gold-star" });
  assert.equal(synced.displayName, "Nova");
  assert.equal(synced.wardrobe, "gold-star");

  let registryListener: ((pets: PluginPetInfo[]) => void) | null = null;
  const capabilities = {
    pets: {
      list: () => [{ id: "default", name: "Balinese Cat", kind: "default", visible: true } satisfies PluginPetInfo],
      onChange: (listener: (pets: PluginPetInfo[]) => void) => { registryListener = listener; return () => { registryListener = null; }; },
    },
  } as unknown as ElectronPluginHostCapabilities;

  installBuddyProfilePluginCapability(capabilities, store);
  const pets = capabilities.pets.list() as ProfiledPluginPetInfo[];
  assert.equal(pets[0]?.buddyProfile?.displayName, "Nova");
  assert.equal(pets[0]?.buddyProfile?.wardrobe, "gold-star");
  assert.equal("messages" in (pets[0]?.buddyProfile ?? {}), false);
  assert.equal("notes" in (pets[0]?.buddyProfile ?? {}), false);
  assert.equal("tasks" in (pets[0]?.buddyProfile ?? {}), false);

  const changes: ProfiledPluginPetInfo[][] = [];
  const dispose = capabilities.pets.onChange((value) => changes.push(value as ProfiledPluginPetInfo[]));
  const cared = applyBuddyCare(renamedBuddy, "feed", now + 2);
  store.sync({ buddy: cared, wardrobe: "gold-star" });
  assert.equal(changes.at(-1)?.[0]?.buddyProfile?.lastCareAction, "feed", "profile changes must reach pets.onChange subscribers");
  registryListener?.([{ id: "default", name: "Balinese Cat", kind: "default", visible: false }]);
  assert.equal(changes.at(-1)?.[0]?.visible, false, "pet registry changes must retain the public profile decoration");
  dispose();

  const fallbackRoot = mkdtempSync(join(tmpdir(), "pocket-buddy-profile-default-"));
  try {
    const defaultStore = new BuddyProfileStore(fallbackRoot, () => 50_000);
    const defaultProfile = defaultStore.initialize();
    assert.ok(buddyProfilesMateriallyEqual(defaultProfile, createDefaultBuddyProfile(50_000)));
    const lateMigration = defaultStore.initialize(legacyCandidate);
    assert.equal(lateMigration.displayName, "Pixel", "a default created before Control Center opens must remain migratable");
  } finally {
    rmSync(fallbackRoot, { recursive: true, force: true });
  }

  assert.throws(() => parseBuddyProfileCandidate({ buddy: { ...legacyBuddy, displayName: "" } }), /display name/i);
  assert.throws(() => parseBuddyProfileCandidate({ buddy: { ...legacyBuddy, needs: { ...legacyBuddy.needs, hunger: 2 } } }), /hunger/i);

  console.error("Host-owned Buddy profile contract passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
