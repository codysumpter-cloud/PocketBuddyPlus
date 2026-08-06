import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const desktopRoot = process.env.OPENPETS_DESKTOP_ROOT ?? process.cwd();
const pluginUrl = pathToFileURL(resolve(desktopRoot, "..", "..", "plugins", "official", "openpets.buddy-training", "index.js")).href;
const plugin = await import(pluginUrl) as {
  cleanTrainingState(value?: unknown): { sessions: number; rewardsEarned: number; lastSessionAt: number; pendingReward: null | { transactionId: string; itemId: string; quantity: number; reason: string } };
  chooseTrainingDrill(profile: Record<string, unknown>): { id: string; label: string; reaction: string };
  rewardTransactionId(profileId: string, sessionNumber: number): string;
  settlePendingReward(ctx: Record<string, unknown>, state: unknown): Promise<{ state: Record<string, unknown>; settled: boolean; unavailable?: boolean }>;
  runTraining(ctx: Record<string, unknown>, now?: number): Promise<Record<string, unknown>>;
  register(registry: { register(definition: { start(ctx: Record<string, unknown>): Promise<void>; stop(): Promise<void> }): void }): void;
};

assert.deepEqual(plugin.cleanTrainingState(), {
  version: 1,
  sessions: 0,
  rewardsEarned: 0,
  lastSessionAt: 0,
  pendingReward: null,
});
assert.equal(plugin.chooseTrainingDrill({ dominantNeed: "energy" }).id, "balance");
assert.equal(plugin.chooseTrainingDrill({ dominantNeed: "social" }).id, "teamwork");
assert.equal(plugin.chooseTrainingDrill({ mood: "playful" }).id, "agility");
assert.equal(plugin.rewardTransactionId("primary-buddy", 3), "training.reward:primary-buddy:3");
assert.equal(plugin.rewardTransactionId("bad id", 3), "training.reward:primary-buddy:3");

const storage = new Map<string, unknown>();
const registeredCommands = new Map<string, () => Promise<unknown>>();
const reactions: string[] = [];
const toasts: Array<{ text?: string; tone?: string }> = [];
const statuses: string[] = [];
const transactions = new Map<string, { itemId: string; quantity: number; reason: string }>();
let appleCount = 3;

const ctx = {
  pets: {
    async list() {
      return [{
        id: "default",
        name: "Balinese Cat",
        kind: "default",
        visible: true,
        buddyProfile: {
          schemaVersion: 1,
          id: "primary-buddy",
          displayName: "Pixel",
          createdAtMs: 1,
          updatedAtMs: 1,
          ageMs: 0,
          affection: 0.4,
          needs: { hunger: 0.2, energy: 0.3, social: 0.1, play: 0.8, comfort: 0.1, cleanliness: 0.1 },
          mood: "playful",
          activity: "idle",
          dominantNeed: "play",
          wardrobe: "classic",
        },
      }];
    },
  },
  inventory: {
    async grant(spec: { transactionId: string; itemId: string; quantity: number; reason: string }) {
      const existing = transactions.get(spec.transactionId);
      if (!existing) {
        transactions.set(spec.transactionId, { itemId: spec.itemId, quantity: spec.quantity, reason: spec.reason });
        appleCount += spec.quantity;
      } else {
        assert.deepEqual(existing, { itemId: spec.itemId, quantity: spec.quantity, reason: spec.reason });
      }
      return { quantities: { "consumable.apple": appleCount } };
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

const first = await plugin.runTraining(ctx, 20_000);
assert.equal(first.ok, true);
assert.equal((first.state as { sessions: number }).sessions, 1);
assert.equal(appleCount, 3);
const cooldown = await plugin.runTraining(ctx, 25_000);
assert.equal(cooldown.ok, false);
assert.equal(cooldown.reason, "cooldown");

await plugin.runTraining(ctx, 40_000);
const third = await plugin.runTraining(ctx, 60_000);
assert.equal(third.ok, true);
assert.equal((third.state as { sessions: number }).sessions, 3);
assert.equal(third.rewardDue, true);
assert.equal(third.rewardSettled, true);
assert.equal(appleCount, 4);
assert.equal(transactions.size, 1);
assert.equal(transactions.has("training.reward:primary-buddy:3"), true);
assert.equal((storage.get("state") as { pendingReward: unknown }).pendingReward, null);
assert.ok(reactions.includes("celebrating"));
assert.ok(toasts.some((toast) => toast.text?.includes("earned an apple")));
assert.ok(statuses.some((status) => status.includes("3 sessions")));

storage.set("state", {
  version: 1,
  sessions: 5,
  rewardsEarned: 1,
  lastSessionAt: 70_000,
  pendingReward: {
    transactionId: "training.reward:primary-buddy:6",
    itemId: "consumable.apple",
    quantity: 1,
    reason: "Completed Buddy Training session 6",
  },
});
const pendingState = storage.get("state");
const settledOnce = await plugin.settlePendingReward(ctx, pendingState);
const settledTwice = await plugin.settlePendingReward(ctx, pendingState);
assert.equal(settledOnce.settled, true);
assert.equal(settledTwice.settled, true, "replaying a pending reward must use the same idempotent transaction");
assert.equal(appleCount, 5);
assert.equal(transactions.size, 2);

let registration: { start(ctx: Record<string, unknown>): Promise<void>; stop(): Promise<void> } | undefined;
plugin.register({ register(definition) { registration = definition; } });
assert.ok(registration);
await registration!.start(ctx);
assert.equal(registeredCommands.has("train"), true);
assert.equal(registeredCommands.has("training-status"), true);
await registration!.stop();

const noInventoryStorage = new Map<string, unknown>();
const noInventoryCtx = {
  ...ctx,
  inventory: undefined,
  storage: {
    async get(key: string) { return noInventoryStorage.get(key); },
    async set(key: string, value: unknown) { noInventoryStorage.set(key, structuredClone(value)); },
  },
};
const unavailable = await plugin.settlePendingReward(noInventoryCtx, {
  version: 1,
  sessions: 3,
  rewardsEarned: 0,
  lastSessionAt: 1,
  pendingReward: {
    transactionId: "training.reward:primary-buddy:3",
    itemId: "consumable.apple",
    quantity: 1,
    reason: "Completed Buddy Training session 3",
  },
});
assert.equal(unavailable.unavailable, true);
assert.ok((unavailable.state as { pendingReward: unknown }).pendingReward);

console.error("Buddy Training profile and inventory vertical slice passed.");
