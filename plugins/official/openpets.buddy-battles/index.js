export const STATE_VERSION = 1;
export const BATTLE_COOLDOWN_MS = 20_000;
export const BATTLE_REWARD_ITEM_ID = "consumable.apple";

export const battleOpponents = [
  { id: "paper-drone", name: "Paper Drone", power: 10, guard: 7, speed: 9, hp: 48 },
  { id: "moss-golem", name: "Moss Golem", power: 9, guard: 12, speed: 5, hp: 62 },
  { id: "spark-fox", name: "Spark Fox", power: 12, guard: 7, speed: 13, hp: 46 },
];

function nonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function cleanPendingReward(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.transactionId !== "string" || typeof value.itemId !== "string" || typeof value.reason !== "string") return null;
  const quantity = nonNegativeInteger(value.quantity);
  if (quantity < 1) return null;
  return { transactionId: value.transactionId, itemId: value.itemId, quantity, reason: value.reason };
}

function cleanLastResult(value) {
  if (!value || typeof value !== "object") return null;
  if (!battleOpponents.some((opponent) => opponent.id === value.opponentId)) return null;
  if (!["buddy", "opponent", "draw"].includes(value.winner)) return null;
  return {
    battleNumber: Math.max(1, nonNegativeInteger(value.battleNumber)),
    opponentId: value.opponentId,
    opponentName: typeof value.opponentName === "string" ? value.opponentName.slice(0, 40) : "Opponent",
    winner: value.winner,
    rounds: Math.max(1, nonNegativeInteger(value.rounds)),
    buddyHp: nonNegativeInteger(value.buddyHp),
    opponentHp: nonNegativeInteger(value.opponentHp),
  };
}

export function cleanBattleState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: STATE_VERSION,
    battles: nonNegativeInteger(source.battles),
    wins: nonNegativeInteger(source.wins),
    losses: nonNegativeInteger(source.losses),
    draws: nonNegativeInteger(source.draws),
    streak: nonNegativeInteger(source.streak),
    bestStreak: nonNegativeInteger(source.bestStreak),
    rewardsEarned: nonNegativeInteger(source.rewardsEarned),
    lastBattleAt: typeof source.lastBattleAt === "number" && Number.isFinite(source.lastBattleAt) && source.lastBattleAt >= 0 ? source.lastBattleAt : 0,
    pendingReward: cleanPendingReward(source.pendingReward),
    lastResult: cleanLastResult(source.lastResult),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pressure(profile, need) {
  const value = profile?.needs?.[need];
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
}

export function deriveBuddyFighter(profile, inventorySnapshot) {
  const affection = typeof profile?.affection === "number" && Number.isFinite(profile.affection)
    ? clamp(profile.affection, 0, 1)
    : 0;
  const equipped = inventorySnapshot?.equipped && typeof inventorySnapshot.equipped === "object"
    ? inventorySnapshot.equipped
    : {};
  let powerBonus = 0;
  let guardBonus = 0;
  let speedBonus = 0;
  let hpBonus = 0;

  if (equipped.badge === "wardrobe.gold-star") powerBonus += 3;
  if (equipped.neck === "wardrobe.blue-scarf") speedBonus += 3;
  if (equipped.head === "wardrobe.night-cap") guardBonus += 3;
  if (equipped.home === "home.bed.basic") guardBonus += 2;
  if (equipped.home === "home.food-bowl.basic") hpBonus += 6;

  return {
    id: typeof profile?.id === "string" ? profile.id : "primary-buddy",
    name: typeof profile?.displayName === "string" ? profile.displayName : "Buddy",
    power: 10 + Math.round(affection * 7) + Math.round((1 - pressure(profile, "play")) * 2) + powerBonus,
    guard: 8 + Math.round((1 - pressure(profile, "comfort")) * 5) + guardBonus,
    speed: 8 + Math.round((1 - pressure(profile, "energy")) * 6) + speedBonus,
    hp: 52 + Math.round((1 - pressure(profile, "hunger")) * 12) + Math.round(affection * 8) + hpBonus,
    equipmentBonus: powerBonus + guardBonus + speedBonus + hpBonus,
  };
}

function hashSeed(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x100000000;
  };
}

export function selectBattleOpponent(battleNumber) {
  const safeBattleNumber = Math.max(1, nonNegativeInteger(battleNumber));
  const base = battleOpponents[(safeBattleNumber - 1) % battleOpponents.length];
  const tier = Math.floor((safeBattleNumber - 1) / battleOpponents.length);
  return {
    ...base,
    tier,
    power: base.power + tier,
    guard: base.guard + tier,
    speed: base.speed + Math.floor(tier / 2),
    hp: base.hp + tier * 5,
  };
}

function attack(attacker, defender, random) {
  const variance = Math.floor(random() * 5) - 2;
  const critical = random() > 0.9;
  return Math.max(1, attacker.power + variance + (critical ? 3 : 0) - Math.floor(defender.guard / 2));
}

export function simulateBattle(profile, inventorySnapshot, battleNumber) {
  const buddy = deriveBuddyFighter(profile, inventorySnapshot);
  const opponent = selectBattleOpponent(battleNumber);
  const random = seededRandom(hashSeed(`${buddy.id}:${battleNumber}:${opponent.id}`));
  let buddyHp = buddy.hp;
  let opponentHp = opponent.hp;
  let rounds = 0;

  while (buddyHp > 0 && opponentHp > 0 && rounds < 24) {
    rounds += 1;
    const buddyFirst = buddy.speed + random() * 6 >= opponent.speed + random() * 6;
    if (buddyFirst) {
      opponentHp = Math.max(0, opponentHp - attack(buddy, opponent, random));
      if (opponentHp > 0) buddyHp = Math.max(0, buddyHp - attack(opponent, buddy, random));
    } else {
      buddyHp = Math.max(0, buddyHp - attack(opponent, buddy, random));
      if (buddyHp > 0) opponentHp = Math.max(0, opponentHp - attack(buddy, opponent, random));
    }
  }

  const winner = buddyHp === opponentHp ? "draw" : buddyHp > opponentHp ? "buddy" : "opponent";
  return {
    battleNumber,
    buddy,
    opponent,
    winner,
    rounds,
    buddyHp,
    opponentHp,
  };
}

export function battleRewardTransactionId(profileId, battleNumber) {
  const safeProfileId = typeof profileId === "string" && /^[A-Za-z0-9._:-]{1,80}$/u.test(profileId) ? profileId : "primary-buddy";
  return `battle.reward:${safeProfileId}:${Math.max(1, nonNegativeInteger(battleNumber))}`;
}

async function readPrimaryProfile(ctx) {
  const pets = await ctx.pets.list();
  return pets.find((pet) => pet.kind === "default")?.buddyProfile ?? null;
}

async function readInventory(ctx) {
  if (!ctx.inventory) return null;
  try { return await ctx.inventory.snapshot(); }
  catch { return null; }
}

async function saveState(ctx, state) {
  const clean = cleanBattleState(state);
  await ctx.storage.set("state", clean);
  return clean;
}

export async function settlePendingBattleReward(ctx, stateValue) {
  const state = cleanBattleState(stateValue);
  if (!state.pendingReward) return { state, settled: false };
  if (!ctx.inventory) return { state, settled: false, unavailable: true };
  await ctx.inventory.grant(state.pendingReward);
  const next = await saveState(ctx, {
    ...state,
    rewardsEarned: state.rewardsEarned + state.pendingReward.quantity,
    pendingReward: null,
  });
  return { state: next, settled: true };
}

function statusText(profile, state) {
  const name = profile?.displayName ?? "Buddy";
  const record = `${state.wins}-${state.losses}-${state.draws}`;
  if (state.pendingReward) return `${name} has a pending battle reward · record ${record}`;
  return `${name} battles · ${record} · streak ${state.streak}`;
}

async function refreshStatus(ctx, profile, state) {
  await ctx.status.set({ text: statusText(profile, state), tone: state.pendingReward ? "warning" : state.streak > 0 ? "success" : "info" });
}

export async function runBattle(ctx, now = Date.now()) {
  let state = cleanBattleState(await ctx.storage.get("state"));
  state = (await settlePendingBattleReward(ctx, state)).state;
  const profile = await readPrimaryProfile(ctx);
  if (!profile) {
    await ctx.ui.toast({ text: "Buddy Battles needs the Pocket Buddy+ profile contract.", tone: "error" });
    return { ok: false, reason: "profile-unavailable", state };
  }
  if (state.lastBattleAt > 0 && now - state.lastBattleAt < BATTLE_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((BATTLE_COOLDOWN_MS - (now - state.lastBattleAt)) / 1000);
    await ctx.ui.toast({ text: `${profile.displayName} needs ${remainingSeconds}s before another sparring match.`, tone: "warning" });
    return { ok: false, reason: "cooldown", state, profile };
  }

  const battleNumber = state.battles + 1;
  const inventory = await readInventory(ctx);
  const result = simulateBattle(profile, inventory, battleNumber);
  const won = result.winner === "buddy";
  const lost = result.winner === "opponent";
  const pendingReward = won ? {
    transactionId: battleRewardTransactionId(profile.id, battleNumber),
    itemId: BATTLE_REWARD_ITEM_ID,
    quantity: 1,
    reason: `Won Buddy Battle ${battleNumber} against ${result.opponent.name}`,
  } : null;
  const nextStreak = won ? state.streak + 1 : 0;
  const lastResult = {
    battleNumber,
    opponentId: result.opponent.id,
    opponentName: result.opponent.name,
    winner: result.winner,
    rounds: result.rounds,
    buddyHp: result.buddyHp,
    opponentHp: result.opponentHp,
  };

  state = await saveState(ctx, {
    ...state,
    battles: battleNumber,
    wins: state.wins + (won ? 1 : 0),
    losses: state.losses + (lost ? 1 : 0),
    draws: state.draws + (result.winner === "draw" ? 1 : 0),
    streak: nextStreak,
    bestStreak: Math.max(state.bestStreak, nextStreak),
    lastBattleAt: now,
    pendingReward,
    lastResult,
  });

  await ctx.pet.react("working", { showMessage: false });
  let rewardSettled = false;
  if (pendingReward) {
    const reward = await settlePendingBattleReward(ctx, state);
    state = reward.state;
    rewardSettled = reward.settled === true;
  }

  const outcome = won ? "won" : lost ? "lost" : "drew";
  const rewardText = won ? rewardSettled ? " and earned an apple" : " and queued an apple reward" : "";
  await ctx.ui.toast({
    text: `${profile.displayName} ${outcome} against ${result.opponent.name} in ${result.rounds} rounds${rewardText}.`,
    tone: won ? "success" : lost ? "warning" : "info",
    durationMs: 6_000,
  });
  await ctx.pet.react(won ? "celebrating" : lost ? "waiting" : "waving", { showMessage: false });
  await refreshStatus(ctx, profile, state);
  return { ok: true, state, profile, result, rewardSettled };
}

export async function showBattleStatus(ctx) {
  let state = cleanBattleState(await ctx.storage.get("state"));
  state = (await settlePendingBattleReward(ctx, state)).state;
  const profile = await readPrimaryProfile(ctx);
  await refreshStatus(ctx, profile, state);
  await ctx.ui.toast({ text: statusText(profile, state), tone: state.pendingReward ? "warning" : "info" });
  return { state, profile };
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      let state = cleanBattleState(await ctx.storage.get("state"));
      state = (await settlePendingBattleReward(ctx, state)).state;
      const profile = await readPrimaryProfile(ctx);
      await refreshStatus(ctx, profile, state);
      await ctx.commands.register({
        id: "spar",
        title: "Start local sparring match",
        description: "Battle a deterministic local opponent using your Buddy profile and equipped items.",
        featured: true,
      }, () => runBattle(ctx));
      await ctx.commands.register({
        id: "battle-status",
        title: "Battle record",
        description: "Show wins, losses, draws, streak, and pending rewards.",
      }, () => showBattleStatus(ctx));
    },
    async stop() {},
  });
}
