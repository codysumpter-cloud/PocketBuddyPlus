import type { OpenPetsJavascriptPluginManifest } from "../plugin-manifest.js";
import type { PluginSdkApi } from "../plugin-sdk-bridge.js";
import type { PluginStateRecord } from "../plugin-state.js";
import type { BuddyInventoryMutation, BuddyInventorySnapshot } from "./buddy-inventory-contract.js";
import type { BuddyInventoryStore } from "./buddy-inventory-store.js";

export type InventorySdkNamespace = {
  snapshot(): BuddyInventorySnapshot;
  grant(spec: Omit<Extract<BuddyInventoryMutation, { operation: "grant" }>, "operation">): BuddyInventorySnapshot;
  consume(spec: Omit<Extract<BuddyInventoryMutation, { operation: "consume" }>, "operation">): BuddyInventorySnapshot;
  equip(spec: Omit<Extract<BuddyInventoryMutation, { operation: "equip" }>, "operation">): BuddyInventorySnapshot;
  unequip(spec: Omit<Extract<BuddyInventoryMutation, { operation: "unequip" }>, "operation">): BuddyInventorySnapshot;
  onChange(handler: (snapshot: BuddyInventorySnapshot) => unknown): { subscriptionId: string };
  offChange(subscriptionId: string): void;
};

export type InventorySdkApi = PluginSdkApi & { inventory: InventorySdkNamespace };

export type InventorySdkDecorationOptions = {
  readonly sdk: PluginSdkApi;
  readonly record: PluginStateRecord;
  readonly manifest: OpenPetsJavascriptPluginManifest;
  readonly store: BuddyInventoryStore;
  readonly subscriptions: Map<string, () => void>;
  readonly nextSubscriptionId: () => string;
};

/**
 * Pure SDK decoration used by both the Electron host adapter and Node tests.
 * This module deliberately imports no Electron runtime values.
 */
export function decorateInventorySdk(options: InventorySdkDecorationOptions): InventorySdkApi {
  const { sdk, record, manifest, store, subscriptions, nextSubscriptionId } = options;
  const declared = new Set<string>(manifest.permissions);
  const approved = new Set<string>(record.approvedPermissions.filter((permission) => declared.has(permission)));

  const requirePermission = (permission: "pets:read" | "pets:manage") => {
    if (!approved.has(permission)) throw new Error(`Plugin permission is not approved: ${permission}`);
  };

  const mutate = (operation: BuddyInventoryMutation["operation"], spec: unknown): BuddyInventorySnapshot => {
    requirePermission("pets:manage");
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Inventory mutation spec is invalid.");
    return store.mutate(record.id, { ...(spec as Record<string, unknown>), operation });
  };

  const inventory: InventorySdkNamespace = {
    snapshot: () => {
      requirePermission("pets:read");
      return store.snapshot();
    },
    grant: (spec) => mutate("grant", spec),
    consume: (spec) => mutate("consume", spec),
    equip: (spec) => mutate("equip", spec),
    unequip: (spec) => mutate("unequip", spec),
    onChange: (handler) => {
      requirePermission("pets:read");
      if (typeof handler !== "function") throw new Error("Inventory change handler is invalid.");
      if (subscriptions.size >= 16) throw new Error("Inventory subscription quota exceeded.");
      const subscriptionId = nextSubscriptionId();
      subscriptions.set(subscriptionId, store.onChange((snapshot) => {
        void Promise.resolve(handler(snapshot)).catch(() => undefined);
      }));
      return { subscriptionId };
    },
    offChange: (subscriptionId) => {
      const dispose = subscriptions.get(subscriptionId);
      if (!dispose) return;
      subscriptions.delete(subscriptionId);
      dispose();
    },
  };

  return Object.assign(sdk, { inventory }) as InventorySdkApi;
}

export function disposeInventorySdkSubscriptions(subscriptions: Map<string, () => void>): void {
  for (const dispose of subscriptions.values()) dispose();
  subscriptions.clear();
}
