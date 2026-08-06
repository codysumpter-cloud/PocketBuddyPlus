import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const desktopRoot = process.env.OPENPETS_DESKTOP_ROOT ?? process.cwd();
const pluginUrl = pathToFileURL(resolve(desktopRoot, "..", "..", "plugins", "official", "openpets.buddy-trading-post", "index.js")).href;
const plugin = await import(pluginUrl) as {
  tradingOffers: readonly Record<string, unknown>[];
  cleanTradingState(value?: unknown): Record<string, unknown>;
  getTradingOffer(offerId: string): Record<string, unknown> | null;
  tradeTransactionId(profileId: string, tradeNumber: number, offerId: string): string;
  canAcceptOffer(snapshot: Record<string, unknown>, offer: Record<string, unknown>): { ok: boolean; reason?: string };
  settlePendingTrade(ctx: Record<string, unknown>, state: unknown, now?: number): Promise<{ state: Record<string, unknown>; settled: boolean; unavailable?: boolean }>;
  runTrade(ctx: Record<string, unknown>, offerId: string, now?: number): Promise<Record<string, unknown>>;
  register(registry: { register(definition: { start(ctx: Record<string, unknown>): Promise<void>; stop(): Promise<void> }): void }): void;
};

assert.deepEqual(plugin.cleanTradingState(), {
  version: 1,
  trades: 0,
  itemsReceived: 0,
  lastTradeAt: 0,
  lastOfferId: null,
  pendingTrade: null,
});
assert.equal(plugin.tradingOffers.length, 3);
assert.equal(plugin.getTradingOffer("gold-star")?.receivedItemId, "wardrobe.gold-star");
assert.equal(plugin.getTradingOffer("missing"), null);
assert.equal(plugin.tradeTransactionId("primary-buddy", 1, "gold-star"), "trade.exchange:primary-buddy:1:gold-star");
assert.equal(plugin.tradeTransactionId("bad id", 0, "bad offer"), "trade.exchange:primary-buddy:1:offer");

const definitions = [
  { id: "consumable.apple", displayName: "Apple", maxStack: 99, tradable: true },
  { id: "wardrobe.gold-star", displayName: "Gold Star", maxStack: 1, tradable: true },
  { id: "wardrobe.blue-scarf", displayName: "Blue Scarf", maxStack: 1, tradable: true },
  { id: "wardrobe.night-cap", displayName: "Night Cap", maxStack: 1, tradable: true },
];
const quantities: Record<string, number> = { "consumable.apple": 3 };
const transactions = new Map<string, { itemId: string; quantity: number; receivedItemId: string; receivedQuantity: number; reason: string }>();
let revision = 0;
const snapshot = () => ({ schemaVersion: 1, revision, updatedAtMs: revision, definitions, quantities: { ...quantities }, equipped: {}, recentLedger: [] });

const goldOffer = plugin.getTradingOffer("gold-star")!;
assert.deepEqual(plugin.canAcceptOffer(snapshot(), goldOffer), { ok: true });
assert.equal(plugin.canAcceptOffer({ ...snapshot(), quantities: {} }, goldOffer).reason, "insufficient-items");
assert.equal(plugin.canAcceptOffer({ ...snapshot(), quantities: { "consumable.apple": 3, "wardrobe.gold-star": 1 } }, goldOffer).reason, "stack-limit");

const storage = new Map<string, unknown>();
const registeredCommands = new Map<string, () => Promise<unknown>>();
const reactions: string[] = [];
const toasts: Array<{ text?: string; tone?: string }> = [];
const statuses: string[] = [];

const profile = {
  schemaVersion: 1,
  id: "primary-buddy",
  displayName: "Pixel",
  createdAtMs: 1,
  updatedAtMs: 1,
  ageMs: 0,
  affection: 0.8,
  needs: { hunger: 0, energy: 0, social: 0, play: 0, comfort: 0, cleanliness: 0 },
  mood: "content",
  activity: "idle",
  dominantNeed: "play",
  wardrobe: "classic",
};

const ctx = {
  pets: {
    async list() { return [{ id: "default", kind: "default", visible: true, buddyProfile: profile }]; },
  },
  inventory: {
    async snapshot() { return snapshot(); },
    async exchange(spec: { transactionId: string; itemId: string; quantity: number; receivedItemId: string; receivedQuantity: number; reason: string }) {
      const existing = transactions.get(spec.transactionId);
      if (existing) {
        assert.deepEqual(existing, {
          itemId: spec.itemId,
          quantity: spec.quantity,
          receivedItemId: spec.receivedItemId,
          receivedQuantity: spec.receivedQuantity,
          reason: spec.reason,
        });
        return snapshot();
      }
      const offered = quantities[spec.itemId] ?? 0;
      if (offered < spec.quantity) throw new Error("Not enough Apple in inventory.");
      const definition = definitions.find((item) => item.id === spec.receivedItemId);
      assert.ok(definition);
      const received = quantities[spec.receivedItemId] ?? 0;
      if (received + spec.receivedQuantity > definition!.maxStack) throw new Error("Inventory stack limit exceeded.");
      const offeredNext = offered - spec.quantity;
      if (offeredNext === 0) delete quantities[spec.itemId];
      else quantities[spec.itemId] = offeredNext;
      quantities[spec.receivedItemId] = received + spec.receivedQuantity;
      transactions.set(spec.transactionId, {
        itemId: spec.itemId,
        quantity: spec.quantity,
        receivedItemId: spec.receivedItemId,
        receivedQuantity: spec.receivedQuantity,
        reason: spec.reason,
      });
      revision += 1;
      return snapshot();
    },
  },
  storage: {
    async get(key: string) { return storage.get(key); },
    async set(key: string, value: unknown) { storage.set(key, structuredClone(value)); },
  },
  pet: {
    async react(reaction: string) { reactions.push(reaction); },
  },
  ui: {
    async toast(spec: { text?: string; tone?: string }) { toasts.push(spec); },
  },
  status: {
    async set(spec: { text: string }) { statuses.push(spec.text); },
  },
  commands: {
    async register(command: { id: string }, handler: () => Promise<unknown>) { registeredCommands.set(command.id, handler); },
  },
};

const first = await plugin.runTrade(ctx, "gold-star", 20_000);
assert.equal(first.ok, true);
assert.equal((first.state as { trades: number }).trades, 1);
assert.equal((first.state as { itemsReceived: number }).itemsReceived, 1);
assert.equal(quantities["consumable.apple"], 1);
assert.equal(quantities["wardrobe.gold-star"], 1);
assert.equal(transactions.size, 1);
assert.equal(transactions.has("trade.exchange:primary-buddy:1:gold-star"), true);
assert.equal((storage.get("state") as { pendingTrade: unknown }).pendingTrade, null);
assert.ok(reactions.includes("working"));
assert.ok(reactions.includes("celebrating"));
assert.ok(toasts.some((toast) => toast.text?.includes("2 apples for a Gold Star")));
assert.ok(statuses.some((status) => status.includes("1 completed trade")));

const duplicateItem = await plugin.runTrade(ctx, "gold-star", 30_000);
assert.equal(duplicateItem.ok, false);
assert.equal(duplicateItem.reason, "insufficient-items");
assert.equal(transactions.size, 1);

const pending = {
  version: 1,
  trades: 1,
  itemsReceived: 1,
  lastTradeAt: 20_000,
  lastOfferId: "gold-star",
  pendingTrade: {
    offerId: "night-cap",
    transactionId: "trade.exchange:primary-buddy:2:night-cap",
    itemId: "consumable.apple",
    quantity: 1,
    receivedItemId: "wardrobe.night-cap",
    receivedQuantity: 1,
    reason: "Buddy Trading Post: 1 apple for a Night Cap",
  },
};
const settledOnce = await plugin.settlePendingTrade(ctx, pending, 40_000);
const settledTwice = await plugin.settlePendingTrade(ctx, pending, 40_000);
assert.equal(settledOnce.settled, true);
assert.equal(settledTwice.settled, true, "replaying a pending trade must reuse the atomic exchange transaction");
assert.equal(quantities["consumable.apple"], undefined);
assert.equal(quantities["wardrobe.night-cap"], 1);
assert.equal(transactions.size, 2);

let registration: { start(ctx: Record<string, unknown>): Promise<void>; stop(): Promise<void> } | undefined;
plugin.register({ register(definition) { registration = definition; } });
assert.ok(registration);
await registration!.start(ctx);
assert.equal(registeredCommands.has("trade-gold-star"), true);
assert.equal(registeredCommands.has("trade-blue-scarf"), true);
assert.equal(registeredCommands.has("trade-night-cap"), true);
assert.equal(registeredCommands.has("trading-status"), true);
await registration!.stop();

const noExchangeCtx = {
  ...ctx,
  inventory: { async snapshot() { return snapshot(); } },
  storage: {
    async get() { return undefined; },
    async set() {},
  },
};
const unavailable = await plugin.runTrade(noExchangeCtx, "gold-star", 50_000);
assert.equal(unavailable.ok, false);
assert.equal(unavailable.reason, "exchange-unavailable");

const noProfileCtx = {
  ...ctx,
  pets: { async list() { return []; } },
  storage: {
    async get() { return undefined; },
    async set() {},
  },
};
const missingProfile = await plugin.runTrade(noProfileCtx, "gold-star", 60_000);
assert.equal(missingProfile.ok, false);
assert.equal(missingProfile.reason, "profile-unavailable");

console.error("Buddy Trading Post atomic barter and retry safety passed.");
