import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createInventoryAwarePluginJsHost } from "../src/inventory/buddy-inventory-plugin-sdk.js";
import { BUDDY_INVENTORY_FILENAME, BuddyInventoryStore } from "../src/inventory/buddy-inventory-store.js";
import type { PluginJsHost, PluginJsHostStartOptions } from "../src/plugin-js-host.js";
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

  let capturedSdk: (PluginSdkApi & { inventory?: Record<string, (...args: unknown[]) => unknown> }) | undefined;
  let stopped = false;
  const inner: PluginJsHost = {
    async startPlugin(options: PluginJsHostStartOptions) {
      capturedSdk = options.sdk as typeof capturedSdk;
      return { stop: () => { stopped = true; } };
    },
  };
  const host = createInventoryAwarePluginJsHost(inner, store);
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
  const instance = await host.startPlugin({ record, manifest, entryPath: "/tmp/index.js", sdk: {} as PluginSdkApi, onBroken: () => undefined });
  assert.ok(capturedSdk?.inventory);
  const inventory = capturedSdk!.inventory!;
  assert.equal((inventory.snapshot() as ReturnType<BuddyInventoryStore["snapshot"]>).quantities["consumable.apple"], 3);

  let observedRevision = -1;
  const subscription = inventory.onChange((snapshot: unknown) => { observedRevision = (snapshot as { revision: number }).revision; }) as { subscriptionId: string };
  now += 1;
  const reward = inventory.grant({ transactionId: "battle.reward:00000001", itemId: "consumable.apple", quantity: 1, reason: "Won a battle" }) as ReturnType<BuddyInventoryStore["snapshot"]>;
  assert.equal(reward.quantities["consumable.apple"], 4);
  await Promise.resolve();
  assert.equal(observedRevision, reward.revision);
  inventory.offChange(subscription.subscriptionId);
  instance.stop();
  assert.equal(stopped, true);

  let readOnlySdk: typeof capturedSdk;
  const readOnlyHost = createInventoryAwarePluginJsHost({
    async startPlugin(options) { readOnlySdk = options.sdk as typeof readOnlySdk; return { stop() {} }; },
  }, store);
  await readOnlyHost.startPlugin({
    record: { ...record, id: "reader.plugin", approvedPermissions: ["pets:read"] } as unknown as PluginStateRecord,
    manifest: { ...manifest, id: "reader.plugin", permissions: ["pets:read"] } as OpenPetsJavascriptPluginManifest,
    entryPath: "/tmp/index.js",
    sdk: {} as PluginSdkApi,
    onBroken: () => undefined,
  });
  assert.ok(readOnlySdk!.inventory!.snapshot());
  assert.throws(() => readOnlySdk!.inventory!.grant({ transactionId: "reader.grant:00000001", itemId: "consumable.apple", quantity: 1, reason: "Denied" }), /pets:manage/i);

  console.error("Shared Buddy inventory and equipment contract passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
