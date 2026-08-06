import { sdkCallHandlers } from "../plugin-js-host.js";
import type { PluginJsHost, PluginJsHostInstance, PluginJsHostStartOptions } from "../plugin-js-host.js";
import type { BuddyInventoryStore } from "./buddy-inventory-store.js";
import {
  decorateInventorySdk,
  disposeInventorySdkSubscriptions,
  type InventorySdkApi,
} from "./buddy-inventory-sdk-api.js";

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
      const sdk = decorateInventorySdk({
        sdk: options.sdk,
        record: options.record,
        manifest: options.manifest,
        store,
        subscriptions,
        nextSubscriptionId: () => `inventory-${++nextSubscription}`,
      });
      let instance: PluginJsHostInstance;
      try {
        instance = await inner.startPlugin({ ...options, sdk });
      } catch (error) {
        disposeInventorySdkSubscriptions(subscriptions);
        throw error;
      }
      return {
        stop() {
          disposeInventorySdkSubscriptions(subscriptions);
          instance.stop();
        },
      };
    },
  };
}
