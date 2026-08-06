import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decorateInventorySdk,
  disposeInventorySdkSubscriptions,
} from "../src/inventory/buddy-inventory-sdk-api.js";
import { BUDDY_INVENTORY_FILENAME, BuddyInventoryStore } from "../src/inventory/buddy-inventory-store.js";
import type { OpenPetsJavascriptPluginManifest } from "../src/plugin-manifest.js";
import type { PluginSdkApi } from "../src/plugin-sdk-bridge.js";
import type { PluginStateRecord } from "../src/plugin-state.js";

const root = mkdtempSync(join(tmpdir(), "pocket-buddy-inventory-"));
let now = 1_000;

try {
  const store = new BuddyInventoryStore(root, { clock: () => now });
  const starter = store.initialize();
  assert.equal(starter.quantities["consumable.apple"], 3);
  assert.equal(starter.quantities["home.toy.ball"], 1);
  assert.ok(existsSync(join(root, BUDDY_INVENTORY_FILENAME)));

  now += 1;
  const granted = store.mutate("test.plugin", {
    operation: "grant",
    transactionId: "reward:00000001",
    itemId: "wardrobe.blue-scarf",
    quantity: 1,
    reason: "Starter reward",
  });
  assert.equal(granted.quantities["wardrobe.blue-scarf"], 1);
  assert.equal(granted.revision, 1);
  assert.equal(store.mutate("test.plugin", {
    operation: "grant",
    transactionId: "reward:00000001",
    itemId: "wardrobe.blue-scarf",
    quantity: 1,
    reason: "Starter reward",
  }).revision, 1, "identical transaction retries must be idempotent");
  assert.throws(() => store.mutate("other.plugin", {
    operation: "grant",
    transactionId: "reward:00000001",
    itemId: "consumable.apple",
    quantity: 1,
    reason: "Conflicting retry",
  }), /already used/i);
  assert.throws(() => store.mutate("test.plugin", {
    operation: "grant",
    transactionId: "reward:00000001",
    itemId: "consumable.apple",
    quantity: 1,
    reason: "Starter reward",
  }), /already used/i, "the same source cannot reuse a transaction id for a different item");

  now += 1;
  const equipped = store.mutate("test.plugin", {
    operation: "equip",
    transactionId: "equip:00000001",
    itemId: "wardrobe.blue-scarf",
    reason: "Put on scarf",
  });
  assert.equal(equipped.equipped.neck, "wardrobe.blue-scarf");
  assert.throws(() => store.mutate("test.plugin", {
    operation: "equip",
    transactionId: "equip:00000002",
    itemId: "wardrobe.blue-scarf",
    slot: "head",
    reason: "Wrong slot",
  }), /cannot be equipped/i);

  now += 1;
  const consumed = store.mutate("test.plugin", {
    operation: "consume",
    transactionId: "consume:00000001",
    itemId: "wardrobe.blue-scarf",
    quantity: 1,
    reason: "Transferred away",
  });
  assert.equal(consumed.quantities["wardrobe.blue-scarf"], undefined);
  assert.equal(consumed.equipped.neck, undefined, "consuming the last equipped copy must unequip it atomically");
  assert.throws(() => store.mutate("test.plugin", {
    operation: "consume",
    transactionId: "consume:00000002",
    itemId: "wardrobe.blue-scarf",
    quantity: 1,
    reason: "No stock",
  }), /not enough/i);
  assert.throws(() => store.mutate("test.plugin", {
    operation: "grant",
    transactionId: "reward:00000002",
    itemId: "unknown.item",
    quantity: 1,
    reason: "Unknown item",
  }), /unknown Buddy item/i);

  const reloaded = new BuddyInventoryStore(root, { clock: () => now }).initialize();
  assert.equal(reloaded.revision, consumed.revision);
  assert.equal(reloaded.quantities["consumable.apple"], 3);

  const record = {
    id: "battle.plugin",
    approvedPermissions: ["pets:read", "pets:manage"],
  } as unknown as PluginStateRecord;
  const manifest = {
    manifestVersion: 3,
    id: "battle.plugin",
    name: "Battle Plugin",
    version: "1.0.0",
    runtime: "javascript",
    sdkVersion: "3.3.0",
    entry: "index.js",
    permissions: ["pets:read", "pets:manage"],
  } as unknown as OpenPetsJavascriptPluginManifest;
  const subscriptions = new Map<string, () => void>();
  let nextSubscription = 0;
  const sdk = decorateInventorySdk({
    sdk: {} as PluginSdkApi,
    record,
    manifest,
    store,
    subscriptions,
    nextSubscriptionId: () => `inventory-test-${++nextSubscription}`,
  });
  assert.equal(sdk.inventory.snapshot().quantities["consumable.apple"], 3);

  let observedRevision = -1;
  const subscription = sdk.inventory.onChange((snapshot) => { observedRevision = snapshot.revision; });
  now += 1;
  const reward = sdk.inventory.grant({
    transactionId: "battle.reward:00000001",
    itemId: "consumable.apple",
    quantity: 1,
    reason: "Won a battle",
  });
  assert.equal(reward.quantities["consumable.apple"], 4);
  await Promise.resolve();
  assert.equal(observedRevision, reward.revision);
  sdk.inventory.offChange(subscription.subscriptionId);
  assert.equal(subscriptions.size, 0);

  const readOnlySubscriptions = new Map<string, () => void>();
  const readOnlySdk = decorateInventorySdk({
    sdk: {} as PluginSdkApi,
    record: { ...record, id: "reader.plugin", approvedPermissions: ["pets:read"] } as unknown as PluginStateRecord,
    manifest: { ...manifest, id: "reader.plugin", permissions: ["pets:read"] } as OpenPetsJavascriptPluginManifest,
    store,
    subscriptions: readOnlySubscriptions,
    nextSubscriptionId: () => "inventory-reader-1",
  });
  assert.ok(readOnlySdk.inventory.snapshot());
  assert.throws(() => readOnlySdk.inventory.grant({
    transactionId: "reader.grant:00000001",
    itemId: "consumable.apple",
    quantity: 1,
    reason: "Denied",
  }), /pets:manage/i);

  const limitedSubscriptions = new Map<string, () => void>();
  const limitedSdk = decorateInventorySdk({
    sdk: {} as PluginSdkApi,
    record,
    manifest,
    store,
    subscriptions: limitedSubscriptions,
    nextSubscriptionId: () => `inventory-limit-${limitedSubscriptions.size + 1}`,
  });
  for (let index = 0; index < 16; index++) limitedSdk.inventory.onChange(() => undefined);
  assert.throws(() => limitedSdk.inventory.onChange(() => undefined), /quota exceeded/i);
  disposeInventorySdkSubscriptions(limitedSubscriptions);
  assert.equal(limitedSubscriptions.size, 0);

  console.error("Shared Buddy inventory and equipment contract passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
