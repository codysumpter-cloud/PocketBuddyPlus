import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const desktopRoot = process.env.OPENPETS_DESKTOP_ROOT ?? process.cwd();
const pluginUrl = pathToFileURL(resolve(desktopRoot, "..", "..", "plugins", "official", "openpets.buddy-battles", "index.js")).href;
const plugin = await import(pluginUrl) as {
  cleanBattleState(value?: unknown): Record<string, unknown>;
  deriveBuddyFighter(profile: Record<string, unknown>, inventory?: Record<string, unknown> | null): { power: number; guard: number; speed: number; hp: number; equipmentBonus: number };
  selectBattleOpponent(battleNumber: number): { id: string; tier: number; power: number; hp: number };
  simulateBattle(profile: Record<string, unknown>, inventory: Record<string, unknown> | null, battleNumber: number): Record<string, unknown>;
  battleRewardTransactionId(profileId: string, battleNumber: number): string;
  settlePendingBattleReward(ctx: Record<string, unknown>, state: unknown): Promise<{ state: Record<string, unknown>; settled: boolean; unavailable?: boolean }>;
  runBattle(ctx: Record<string, unknown>, now?: number): Promise<Record<string, unknown>>;
  register(registry: { register(definition: { start(ctx: Record<string, unknown>): Promise<void>; stop(): Promise<void> }): void }): void;
};

assert.deepEqual(plugin.cleanBattleState(), {
  version: 1,
  battles: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  streak: 0,
  bestStreak: 0,
  rewardsEarned: 0,
  lastBattleAt: 0,
  pendingReward: null,
  lastResult: null,
});
assert.equal(plugin.selectBattleOpponent(1).id, "paper-drone");
assert.equal(plugin.selectBattleOpponent(4).tier, 1);
assert.equal(plugin.battleRewardTransactionId("primary-buddy", 1), "battle.reward:primary-buddy:1");
assert.equal(plugin.battleRewardTransactionId("bad id", 0), "battle.reward:primary-buddy:1");

const profile = {
  schemaVersion: 1,
  id: "primary-buddy",
  displayName: "Pixel",
  createdAtMs: 1,
  updatedAtMs: 1,
  ageMs: 0,
  affection: 1,
  needs: { hunger: 0, energy: 0, social: 0, play: 0, comfort: 0, cleanliness: 0 },
  mood: "happy",
  activity: "idle",
  dominantNeed: "play",
  wardrobe: "classic",
};
const equippedInventory = {
  equipped: {
    badge: "wardrobe.gold-star",
    neck: "wardrobe.blue-scarf",
    head: "wardrobe.night-cap",
    home: "home.bed.basic",
  },
};
const plainFighter = plugin.deriveBuddyFighter(profile, null);
const equippedFighter = plugin.deriveBuddyFighter(profile, equippedInventory);
assert.ok(equippedFighter.power > plainFighter.power);
assert.ok(equippedFighter.guard > plainFighter.guard);
assert.ok(equippedFighter.speed > plainFighter.speed);
assert.ok(equippedFighter.equipmentBonus > 0);

const deterministicA = plugin.simulateBattle(profile, equippedInventory, 1);
const deterministicB = plugin.simulateBattle(profile, equippedInventory, 1);
assert.deepEqual(deterministicA, deterministicB);
assert.equal(deterministicA.winner, "buddy");

const storage = new Map<string, unknown>();
const registeredCommands = new Map<string, () => Promise<unknown>>();
const reactions: string[] = [];
const toasts: Array<{ text?: string; tone?: string }> = [];
const statuses: string[] = [];
const transactions = new Map<string, { itemId: string; quantity: number; reason: string }>();
let appleCount = 2;

const ctx = {
  pets: {
    async list() {
      return [{ id: "default", name: "Balinese Cat", kind: "default", visible: true, buddyProfile: profile }];
    },
  },
  inventory: {
    async snapshot() {
      return { ...equippedInventory, quantities: { "consumable.apple": appleCount } };
    },
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

const first = await plugin.runBattle(ctx, 30_000);
assert.equal(first.ok, true);
assert.equal((first.result as { winner: string }).winner, "buddy");
assert.equal((first.state as { battles: number }).battles, 1);
assert.equal((first.state as { wins: number }).wins, 1);
assert.equal(first.rewardSettled, true);
assert.equal(appleCount, 3);
assert.equal(transactions.has("battle.reward:primary-buddy:1"), true);
assert.equal((storage.get("state") as { pendingReward: unknown }).pendingReward, null);
assert.ok(reactions.includes("working"));
assert.ok(reactions.includes("celebrating"));
assert.ok(toasts.some((toast) => toast.text?.includes("earned an apple")));
assert.ok(statuses.some((status) => status.includes("1-0-0")));

const cooldown = await plugin.runBattle(ctx, 35_000);
assert.equal(cooldown.ok, false);
assert.equal(cooldown.reason, "cooldown");

const pending = {
  version: 1,
  battles: 2,
  wins: 2,
  losses: 0,
  draws: 0,
  streak: 2,
  bestStreak: 2,
  rewardsEarned: 1,
  lastBattleAt: 60_000,
  pendingReward: {
    transactionId: "battle.reward:primary-buddy:2",
    itemId: "consumable.apple",
    quantity: 1,
    reason: "Won Buddy Battle 2 against Moss Golem",
  },
  lastResult: {
    battleNumber: 2,
    opponentId: "moss-golem",
    opponentName: "Moss Golem",
    winner: "buddy",
    rounds: 7,
    buddyHp: 20,
    opponentHp: 0,
  },
};
const settledOnce = await plugin.settlePendingBattleReward(ctx, pending);
const settledTwice = await plugin.settlePendingBattleReward(ctx, pending);
assert.equal(settledOnce.settled, true);
assert.equal(settledTwice.settled, true, "replaying a pending battle reward must remain idempotent");
assert.equal(appleCount, 4);
assert.equal(transactions.size, 2);

let registration: { start(ctx: Record<string, unknown>): Promise<void>; stop(): Promise<void> } | undefined;
plugin.register({ register(definition) { registration = definition; } });
assert.ok(registration);
await registration!.start(ctx);
assert.equal(registeredCommands.has("spar"), true);
assert.equal(registeredCommands.has("battle-status"), true);
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
const unavailable = await plugin.settlePendingBattleReward(noInventoryCtx, pending);
assert.equal(unavailable.unavailable, true);
assert.ok((unavailable.state as { pendingReward: unknown }).pendingReward);

const noProfileCtx = {
  ...ctx,
  pets: { async list() { return []; } },
  storage: {
    async get() { return undefined; },
    async set() {},
  },
};
const missingProfile = await plugin.runBattle(noProfileCtx, 100_000);
assert.equal(missingProfile.ok, false);
assert.equal(missingProfile.reason, "profile-unavailable");

console.error("Buddy Battles local sparring and inventory reward slice passed.");
