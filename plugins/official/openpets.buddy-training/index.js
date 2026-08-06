export const STATE_VERSION = 1;
export const TRAINING_COOLDOWN_MS = 15_000;
export const REWARD_EVERY_SESSIONS = 3;
export const REWARD_ITEM_ID = "consumable.apple";

function nonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function cleanPendingReward(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.transactionId !== "string" || typeof value.itemId !== "string" || typeof value.reason !== "string") return null;
  const quantity = nonNegativeInteger(value.quantity);
  if (quantity < 1) return null;
  return {
    transactionId: value.transactionId,
    itemId: value.itemId,
    quantity,
    reason: value.reason,
  };
}

export function cleanTrainingState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: STATE_VERSION,
    sessions: nonNegativeInteger(source.sessions),
    rewardsEarned: nonNegativeInteger(source.rewardsEarned),
    lastSessionAt: typeof source.lastSessionAt === "number" && Number.isFinite(source.lastSessionAt) && source.lastSessionAt >= 0 ? source.lastSessionAt : 0,
    pendingReward: cleanPendingReward(source.pendingReward),
  };
}

export function chooseTrainingDrill(profile) {
  const dominantNeed = profile?.dominantNeed;
  if (dominantNeed === "energy") return { id: "balance", label: "balance and breathing", reaction: "thinking" };
  if (dominantNeed === "hunger") return { id: "patience", label: "patience practice", reaction: "waiting" };
  if (dominantNeed === "social") return { id: "teamwork", label: "teamwork signals", reaction: "waving" };
  if (dominantNeed === "play") return { id: "agility", label: "agility course", reaction: "running" };
  if (dominantNeed === "cleanliness" || dominantNeed === "comfort") return { id: "focus", label: "gentle focus drills", reaction: "thinking" };
  return profile?.mood === "playful"
    ? { id: "agility", label: "agility course", reaction: "running" }
    : { id: "focus", label: "focus drills", reaction: "thinking" };
}

export function rewardTransactionId(profileId, sessionNumber) {
  const safeProfileId = typeof profileId === "string" && /^[A-Za-z0-9._:-]{1,80}$/u.test(profileId) ? profileId : "primary-buddy";
  return `training.reward:${safeProfileId}:${sessionNumber}`;
}

async function readPrimaryProfile(ctx) {
  const pets = await ctx.pets.list();
  return pets.find((pet) => pet.kind === "default")?.buddyProfile ?? null;
}

async function saveState(ctx, state) {
  const clean = cleanTrainingState(state);
  await ctx.storage.set("state", clean);
  return clean;
}

export async function settlePendingReward(ctx, stateValue) {
  const state = cleanTrainingState(stateValue);
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
  const untilReward = REWARD_EVERY_SESSIONS - (state.sessions % REWARD_EVERY_SESSIONS || REWARD_EVERY_SESSIONS);
  if (state.pendingReward) return `${name} has a pending training reward.`;
  if (state.sessions > 0 && state.sessions % REWARD_EVERY_SESSIONS === 0) return `${name} completed ${state.sessions} sessions and earned ${state.rewardsEarned} apples.`;
  return `${name}: ${state.sessions} sessions · ${untilReward} until the next apple.`;
}

async function refreshStatus(ctx, profile, state) {
  await ctx.status.set({ text: statusText(profile, state), tone: state.pendingReward ? "warning" : "success" });
}

export async function runTraining(ctx, now = Date.now()) {
  let state = cleanTrainingState(await ctx.storage.get("state"));
  const settled = await settlePendingReward(ctx, state);
  state = settled.state;

  const profile = await readPrimaryProfile(ctx);
  if (!profile) {
    await ctx.ui.toast({ text: "Buddy Training needs the Pocket Buddy+ profile contract.", tone: "error" });
    return { ok: false, reason: "profile-unavailable", state };
  }

  if (state.lastSessionAt > 0 && now - state.lastSessionAt < TRAINING_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((TRAINING_COOLDOWN_MS - (now - state.lastSessionAt)) / 1000);
    await ctx.ui.toast({ text: `${profile.displayName} needs ${remainingSeconds}s before another training session.`, tone: "warning" });
    return { ok: false, reason: "cooldown", state, profile };
  }

  const drill = chooseTrainingDrill(profile);
  const sessionNumber = state.sessions + 1;
  const rewardDue = sessionNumber % REWARD_EVERY_SESSIONS === 0;
  const pendingReward = rewardDue ? {
    transactionId: rewardTransactionId(profile.id, sessionNumber),
    itemId: REWARD_ITEM_ID,
    quantity: 1,
    reason: `Completed Buddy Training session ${sessionNumber}`,
  } : null;

  state = await saveState(ctx, {
    ...state,
    sessions: sessionNumber,
    lastSessionAt: now,
    pendingReward,
  });

  await ctx.pet.react(drill.reaction, { showMessage: false });
  let rewardSettled = false;
  if (pendingReward) {
    const rewardResult = await settlePendingReward(ctx, state);
    state = rewardResult.state;
    rewardSettled = rewardResult.settled === true;
  }

  const rewardText = rewardDue
    ? rewardSettled ? " You earned an apple." : " Your apple reward is queued."
    : ` ${REWARD_EVERY_SESSIONS - (sessionNumber % REWARD_EVERY_SESSIONS)} session${REWARD_EVERY_SESSIONS - (sessionNumber % REWARD_EVERY_SESSIONS) === 1 ? "" : "s"} until the next apple.`;
  await ctx.ui.toast({
    text: `${profile.displayName} completed ${drill.label}.${rewardText}`,
    tone: rewardSettled ? "success" : "info",
    durationMs: 5_000,
  });
  await ctx.pet.react(rewardSettled ? "celebrating" : "waving", { showMessage: false });
  await refreshStatus(ctx, profile, state);
  return { ok: true, state, profile, drill, rewardDue, rewardSettled };
}

export async function showTrainingStatus(ctx) {
  let state = cleanTrainingState(await ctx.storage.get("state"));
  const settled = await settlePendingReward(ctx, state);
  state = settled.state;
  const profile = await readPrimaryProfile(ctx);
  await refreshStatus(ctx, profile, state);
  await ctx.ui.toast({ text: statusText(profile, state), tone: state.pendingReward ? "warning" : "info" });
  return { state, profile };
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      const state = cleanTrainingState(await ctx.storage.get("state"));
      const settled = await settlePendingReward(ctx, state);
      const profile = await readPrimaryProfile(ctx);
      await refreshStatus(ctx, profile, settled.state);
      await ctx.commands.register({
        id: "train",
        title: "Run training session",
        description: "Choose a drill from your Buddy's current profile and work toward a shared reward.",
        featured: true,
      }, () => runTraining(ctx));
      await ctx.commands.register({
        id: "training-status",
        title: "Training status",
        description: "Show sessions, pending rewards, and apple progress.",
      }, () => showTrainingStatus(ctx));
    },
    async stop() {},
  });
}
