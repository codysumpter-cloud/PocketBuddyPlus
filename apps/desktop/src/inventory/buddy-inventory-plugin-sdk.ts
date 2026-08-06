import type { OpenPetsJavascriptPluginManifest } from "../plugin-manifest.js";
import { sdkCallHandlers } from "../plugin-js-host.js";
import type { PluginJsHost, PluginJsHostInstance, PluginJsHostStartOptions } from "../plugin-js-host.js";
import type { PluginSdkApi } from "../plugin-sdk-bridge.js";
import type { PluginStateRecord } from "../plugin-state.js";
import type { BuddyInventoryMutation, BuddyInventorySnapshot } from "./buddy-inventory-contract.js";
import type { BuddyInventoryStore } from "./buddy-inventory-store.js";

type InventorySdkNamespace = {
  snapshot(): BuddyInventorySnapshot;
  grant(spec: Omit<Extract<BuddyInventoryMutation, { operation: "grant" }>, "operation">): BuddyInventorySnapshot;
  consume(spec: Omit<Extract<BuddyInventoryMutation, { operation: "consume" }>, "operation">): BuddyInventorySnapshot;
  equip(spec: Omit<Extract<BuddyInventoryMutation, { operation: "equip" }>, "operation">): BuddyInventorySnapshot;
  unequip(spec: Omit<Extract<BuddyInventoryMutation, { operation: "unequip" }>, "operation">): BuddyInventorySnapshot;
  onChange(handler: (snapshot: BuddyInventorySnapshot) => unknown): { subscriptionId: string };
  offChange(subscriptionId: string): void;
};

type InventorySdkApi = PluginSdkApi & { inventory: InventorySdkNamespace };
type RunCallback = (id: unknown) => ((...callbackArgs: unknown[]) => Promise<unknown>) | undefined;
type InventoryRouteHandler = (sdk: InventorySdkApi, args: unknown[], runCallback: RunCallback) => unknown;

let handlersInstalled = false;

export function installBuddyInventorySdkCallHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  const handlers = sdkCallHandlers as unknown as Record<string, InventoryRouteHandler>;
  handlers["inventory.snapshot"] = (sdk) => sdk.inventory.snapshot();
  handlers["inventory.grant"] = (sdk, args) => sdk.inventory.grant(args[0] as never);
  handlers["inventory.consume"] = (sdk, args) => sdk.inventory.consume(args[0] as never);
  handlers["inventory.equip"] = (sdk, args) => sdk.inventory.equip(args[0] as never);
  handlers["inventory.unequip"] = (sdk, args) => sdk.inventory.unequip(args[0] as never);
  handlers["inventory.onChange"] = (sdk, args, runCallback) => {
    const callback = runCallback(args[0]);
    if (!callback) throw new Error("Inventory change callback is invalid.");
    return sdk.inventory.onChange((snapshot) => callback(snapshot));
  };
  handlers["inventory.offChange"] = (sdk, args) => sdk.inventory.offChange(String(args[0] ?? ""));
}

export function createInventoryAwarePluginJsHost(inner: PluginJsHost, store: BuddyInventoryStore): PluginJsHost {
  return {
    async startPlugin(options: PluginJsHostStartOptions): Promise<PluginJsHostInstance> {
      if (!options.sdk) return inner.startPlugin(options);
      const subscriptions = new Map<string, () => void>();
      let nextSubscription = 0;
      const sdk = decorateInventorySdk(options.sdk, options.record, options.manifest, store, subscriptions, () => `inventory-${++nextSubscription}`);
      let instance: PluginJsHostInstance;
      try {
        instance = await inner.startPlugin({ ...options, sdk });
      } catch (error) {
        for (const dispose of subscriptions.values()) dispose();
        subscriptions.clear();
        throw error;
      }
      return {
        stop() {
          for (const dispose of subscriptions.values()) dispose();
          subscriptions.clear();
          instance.stop();
        },
      };
    },
  };
}

function decorateInventorySdk(
  sdk: PluginSdkApi,
  record: PluginStateRecord,
  manifest: OpenPetsJavascriptPluginManifest,
  store: BuddyInventoryStore,
  subscriptions: Map<string, () => void>,
  nextSubscriptionId: () => string,
): InventorySdkApi {
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

  return Object.assign(sdk, {
    inventory: {
      snapshot: () => { requirePermission("pets:read"); return store.snapshot(); },
      grant: (spec: unknown) => mutate("grant", spec),
      consume: (spec: unknown) => mutate("consume", spec),
      equip: (spec: unknown) => mutate("equip", spec),
      unequip: (spec: unknown) => mutate("unequip", spec),
      onChange: (handler: (snapshot: BuddyInventorySnapshot) => unknown) => {
        requirePermission("pets:read");
        if (typeof handler !== "function") throw new Error("Inventory change handler is invalid.");
        if (subscriptions.size >= 16) throw new Error("Inventory subscription quota exceeded.");
        const subscriptionId = nextSubscriptionId();
        subscriptions.set(subscriptionId, store.onChange((snapshot) => { void Promise.resolve(handler(snapshot)).catch(() => undefined); }));
        return { subscriptionId };
      },
      offChange: (subscriptionId: string) => {
        const dispose = subscriptions.get(subscriptionId);
        if (!dispose) return;
        subscriptions.delete(subscriptionId);
        dispose();
      },
    } satisfies InventorySdkNamespace,
  }) as InventorySdkApi;
}
