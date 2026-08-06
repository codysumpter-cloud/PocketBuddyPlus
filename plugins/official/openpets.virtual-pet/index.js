// Virtual Pet (openpets.virtual-pet) — SDK v3 Virtual Pet companion.

export const SCHEDULE_ID = "virtual-pet-tick";
export const STATE_VERSION = 2;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_CATCHUP_MS = 30 * DAY_MS;
const MESS_INTERVAL_MS = 4 * HOUR_MS;
const CARE_DEADLINE_MS = 30 * MINUTE_MS;
const REPEAT_CARE_MISTAKE_MS = 6 * HOUR_MS;
const CLASSIC_NEGLECT_DEATH_MS = 24 * HOUR_MS;
const NUDGE_COOLDOWN_MS = 6 * HOUR_MS;

const VALID_STAGES = new Set(["hatchling", "growing", "companion", "beloved"]);
const VALID_DEATH_REASONS = new Set(["", "neglect", "sickness"]);

const pinnedBubbles = new WeakMap();

function getPinnedBubble(ctx) {
  return pinnedBubbles.get(ctx) ?? null;
}

function setPinnedBubble(ctx, handle) {
  if (handle) pinnedBubbles.set(ctx, handle);
  else pinnedBubbles.delete(ctx);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(finiteNumber(value, fallback)));
}

function careCountsFrom(current = {}) {
  const source = current && typeof current === "object" ? current : {};
  return {
    fed: nonNegativeInteger(source.fed),
    played: nonNegativeInteger(source.played),
    petted: nonNegativeInteger(source.petted),
    napped: nonNegativeInteger(source.napped),
    cleaned: nonNegativeInteger(source.cleaned),
    medicated: nonNegativeInteger(source.medicated),
    restarted: nonNegativeInteger(source.restarted),
  };
}

export function cleanState(state = {}) {
  const current = state && typeof state === "object" ? state : {};
  const stage = VALID_STAGES.has(current.stage) ? current.stage : "hatchling";
  const deathReason = VALID_DEATH_REASONS.has(current.deathReason) ? current.deathReason : "";

  return {
    version: STATE_VERSION,
    hunger: clamp(finiteNumber(current.hunger, 80), 0, 100),
    energy: clamp(finiteNumber(current.energy, 80), 0, 100),
    happiness: clamp(finiteNumber(current.happiness, 80), 0, 100),
    affection: clamp(finiteNumber(current.affection, 50), 0, 100),
    health: clamp(finiteNumber(current.health, 100), 0, 100),
    mess: clamp(nonNegativeInteger(current.mess), 0, 5),
    messProgressMs: clamp(finiteNumber(current.messProgressMs, 0), 0, MESS_INTERVAL_MS - 1),
    isSick: current.isSick === true,
    medicineDoses: clamp(nonNegativeInteger(current.medicineDoses), 0, 1),
    careMistakes: nonNegativeInteger(current.careMistakes),
    careDeadlineAt: Math.max(0, finiteNumber(current.careDeadlineAt, 0)),
    criticalSince: Math.max(0, finiteNumber(current.criticalSince, 0)),
    sickSince: Math.max(0, finiteNumber(current.sickSince, 0)),
    bornAt: Math.max(0, finiteNumber(current.bornAt, 0)),
    stage,
    deadAt: Math.max(0, finiteNumber(current.deadAt, 0)),
    deathReason,
    level: Math.max(1, nonNegativeInteger(current.level, 1)),
    xp: nonNegativeInteger(current.xp),
    careCounts: careCountsFrom(current.careCounts),
    lastSeenAt: Math.max(0, finiteNumber(current.lastSeenAt, 0)),
    lastNudgeAt: Math.max(0, finiteNumber(current.lastNudgeAt, 0)),
    sleptUntil: Math.max(0, finiteNumber(current.sleptUntil, 0)),
    lastActionAt: Math.max(0, finiteNumber(current.lastActionAt, 0)),
  };
}

export function resolveStage(state, now = Date.now()) {
  const clean = cleanState(state);
  const bornAt = clean.bornAt || now;
  const ageMs = Math.max(0, now - bornAt);

  if (clean.level >= 10 && clean.affection >= 85 && clean.careMistakes <= 2) {
    return "beloved";
  }
  if (ageMs >= 7 * DAY_MS && clean.level >= 5) {
    return "companion";
  }
  if (ageMs >= DAY_MS || clean.level >= 3) {
    return "growing";
  }
  return "hatchling";
}

export function getMood(state, now) {
  if (state.deadAt > 0) return "dead";
  if (state.isSick) return "sick";
  if (state.mess >= 3) return "dirty";
  if (now < state.sleptUntil) return "sleeping";
  if (state.hunger < 30) return "hungry";
  if (state.energy < 30) return "tired";
  if (state.happiness < 30) return "bored";
  if ((state.hunger + state.energy + state.happiness + state.affection) / 4 >= 75) {
    return "happy";
  }
  return "content";
}

function wakeUpIfSleeping(state, now) {
  if (state.sleptUntil > now) {
    return { ...state, sleptUntil: 0 };
  }
  return state;
}

function withResolvedCareDeadlines(state) {
  return {
    ...state,
    careDeadlineAt: state.hunger > 0 && state.energy > 0 && state.happiness > 0
      ? 0
      : state.careDeadlineAt,
    criticalSince: state.hunger > 0 || state.energy > 0 || state.happiness > 0
      ? 0
      : state.criticalSince,
  };
}

export function addXp(state, amount) {
  let xp = state.xp + amount;
  let level = state.level;
  let leveledUp = false;
  while (xp >= level * 50) {
    xp -= level * 50;
    level += 1;
    leveledUp = true;
  }
  return { xp, level, leveledUp };
}

export function applyDecay(state, elapsedMs, now, options = {}) {
  const current = cleanState(state);
  if (current.deadAt > 0) return current;

  const boundedElapsedMs = clamp(finiteNumber(elapsedMs, 0), 0, MAX_CATCHUP_MS);
  const lastSeen = current.lastSeenAt || Math.max(0, now - boundedElapsedMs);

  let sleepMs = 0;
  if (current.sleptUntil > lastSeen) {
    const sleepEnd = Math.min(current.sleptUntil, now);
    sleepMs = Math.max(0, sleepEnd - lastSeen);
  }
  sleepMs = Math.min(sleepMs, boundedElapsedMs);
  const wakeMs = Math.max(0, boundedElapsedMs - sleepMs);

  const sleepHours = sleepMs / HOUR_MS;
  const wakeHours = wakeMs / HOUR_MS;
  const totalHours = boundedElapsedMs / HOUR_MS;

  const hunger = clamp(current.hunger - wakeHours * 2 - sleepHours * 2, 0, 100);
  const energy = clamp(current.energy - wakeHours * 3 + sleepHours * 15, 0, 100);
  const happiness = clamp(current.happiness - wakeHours * 2 - sleepHours * 0.5, 0, 100);
  const affection = clamp(current.affection - wakeHours, 0, 100);

  const totalMessProgress = current.messProgressMs + wakeMs;
  const messGain = Math.floor(totalMessProgress / MESS_INTERVAL_MS);
  const mess = clamp(current.mess + messGain, 0, 5);
  const messProgressMs = totalMessProgress % MESS_INTERVAL_MS;

  const hasCriticalNeed = hunger <= 0 || energy <= 0 || happiness <= 0;
  const allCritical = hunger <= 0 && energy <= 0 && happiness <= 0;

  let careDeadlineAt = current.careDeadlineAt;
  let careMistakes = current.careMistakes;
  if (hasCriticalNeed) {
    if (careDeadlineAt <= 0) {
      if (boundedElapsedMs > CARE_DEADLINE_MS) {
        const overdueMs = boundedElapsedMs - CARE_DEADLINE_MS;
        const addedMistakes = 1 + Math.floor(overdueMs / REPEAT_CARE_MISTAKE_MS);
        careMistakes += addedMistakes;
        careDeadlineAt = now + REPEAT_CARE_MISTAKE_MS;
      } else {
        careDeadlineAt = now + CARE_DEADLINE_MS;
      }
    } else if (now >= careDeadlineAt) {
      const overdueMs = now - careDeadlineAt;
      const addedMistakes = 1 + Math.floor(overdueMs / REPEAT_CARE_MISTAKE_MS);
      careMistakes += addedMistakes;
      careDeadlineAt += addedMistakes * REPEAT_CARE_MISTAKE_MS;
    }
  } else {
    careDeadlineAt = 0;
  }

  let criticalSince = current.criticalSince;
  if (allCritical) {
    if (criticalSince <= 0) {
      criticalSince = now - Math.min(boundedElapsedMs, CLASSIC_NEGLECT_DEATH_MS);
    }
  } else {
    criticalSince = 0;
  }

  const sicknessTriggered = mess >= 4 || (hunger <= 0 && happiness <= 0);
  const isSick = current.isSick || sicknessTriggered;
  const sickSince = isSick ? (current.sickSince || now) : 0;

  let health = current.health;
  const illnessHours = current.isSick ? totalHours : (sicknessTriggered ? Math.min(totalHours, 6) : 0);
  if (illnessHours > 0) health -= illnessHours * 4;
  if (mess >= 3) health -= totalHours;
  if (hunger <= 0) health -= wakeHours * 2;
  if (happiness <= 0) health -= wakeHours;
  if (energy <= 0) health -= wakeHours;

  if (!isSick && mess < 3 && !hasCriticalNeed) {
    health += sleepHours + wakeHours * 0.5;
  }
  health = clamp(health, 0, 100);

  let deadAt = 0;
  let deathReason = "";
  if (options.classicLifecycle === true) {
    if (health <= 0) {
      deadAt = now;
      deathReason = isSick ? "sickness" : "neglect";
    } else if (criticalSince > 0 && now - criticalSince >= CLASSIC_NEGLECT_DEATH_MS) {
      deadAt = now;
      deathReason = "neglect";
    }
  } else if (health <= 0) {
    health = 10;
  }

  return cleanState({
    ...current,
    hunger,
    energy,
    happiness,
    affection,
    health,
    mess,
    messProgressMs,
    isSick,
    medicineDoses: isSick ? current.medicineDoses : 0,
    careMistakes,
    careDeadlineAt,
    criticalSince,
    sickSince,
    deadAt,
    deathReason,
  });
}

async function getLifecycleConfig(ctx) {
  try {
    const cfg = (await ctx.config.get()) ?? {};
    return { classicLifecycle: cfg.classicLifecycle === true };
  } catch {
    return { classicLifecycle: false };
  }
}

async function playActionSound(ctx) {
  try {
    const cfg = (await ctx.config.get()) ?? {};
    if (cfg.sound) {
      await ctx.audio.play(cfg.sound);
    }
  } catch {}
}

async function speak(ctx, key) {
  try {
    await ctx.pet.speak(ctx.t(key));
  } catch {}
}

async function react(ctx, reaction) {
  try {
    await ctx.pet.react(reaction, { showMessage: false });
  } catch {}
}

async function guardAlive(ctx, state) {
  if (state.deadAt <= 0) return true;
  await react(ctx, "error");
  await speak(ctx, "speech.blocked.dead");
  return false;
}

async function guardHealthyForActivity(ctx, state) {
  if (!await guardAlive(ctx, state)) return false;
  if (!state.isSick) return true;
  await react(ctx, "error");
  await speak(ctx, "speech.blocked.sick");
  return false;
}

export async function updatePinned(ctx, state) {
  let showStats = true;
  try {
    const cfg = (await ctx.config.get()) ?? {};
    if (cfg.showStats === false) showStats = false;
  } catch {}

  if (!showStats) {
    const pinned = getPinnedBubble(ctx);
    if (pinned) {
      try { await pinned.dismiss(); } catch {}
      setPinnedBubble(ctx, null);
    }
    return;
  }

  const showHealth = state.deadAt > 0 || state.isSick || state.mess >= 3 || state.health < 70;
  const fourthItem = showHealth
    ? { icon: "heart", value: state.health, tone: "pink", label: ctx.t("hud.health") }
    : { icon: "heart", value: state.affection, tone: "pink", label: ctx.t("hud.bond") };

  const spec = {
    tone: state.deadAt > 0 || state.isSick ? "warning" : "info",
    sticky: true,
    pin: true,
    dismissOn: [],
    priority: "normal",
    hud: {
      items: [
        { icon: "food", value: state.hunger, tone: "amber", label: ctx.t("hud.food") },
        { icon: "zap", value: state.energy, tone: "blue", label: ctx.t("hud.energy") },
        { icon: "play", value: state.happiness, tone: "green", label: ctx.t("hud.play") },
        fourthItem,
      ],
    },
  };

  const pinnedBubble = getPinnedBubble(ctx);
  if (pinnedBubble) {
    try {
      await pinnedBubble.update(spec);
      return;
    } catch {
      setPinnedBubble(ctx, null);
    }
  }

  try {
    const nextBubble = await ctx.ui.bubble(spec);
    nextBubble.onDismiss(() => {
      if (getPinnedBubble(ctx)?.id === nextBubble.id) {
        setPinnedBubble(ctx, null);
      }
    });
    setPinnedBubble(ctx, nextBubble);
  } catch {}
}

export async function maybeNudge(ctx, state, now = Date.now()) {
  let speechKey = null;
  if (state.deadAt > 0) speechKey = "nudge.dead";
  else if (state.isSick) speechKey = "nudge.sick";
  else if (state.mess >= 3) speechKey = "nudge.dirty";
  else if (state.hunger < 30) speechKey = "nudge.hungry";
  else if (state.energy < 30) speechKey = "nudge.tired";
  else if (state.happiness < 30) speechKey = "nudge.bored";
  else if (state.affection < 30) speechKey = "nudge.neglected";

  if (!speechKey) return;
  if (state.lastNudgeAt !== 0 && now - state.lastNudgeAt < NUDGE_COOLDOWN_MS) return;

  const nextState = { ...state, lastNudgeAt: now };
  await ctx.storage.set("state", nextState);
  await speak(ctx, speechKey);
}

async function scheduleNextTick(ctx) {
  try {
    await ctx.schedule.cancel(SCHEDULE_ID);
    await ctx.schedule.once(SCHEDULE_ID, 15 * MINUTE_MS, () => reconcile(ctx));
  } catch {}
}

async function saveActionState(ctx, state, now) {
  const next = cleanState({
    ...withResolvedCareDeadlines(state),
    stage: resolveStage(state, now),
    lastActionAt: now,
    lastSeenAt: now,
  });
  await ctx.storage.set("state", next);
  await updatePinned(ctx, next);
  return next;
}

export async function feed(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardHealthyForActivity(ctx, state)) return state;

  const active = wakeUpIfSleeping(state, now);
  const xpInfo = addXp(active, 5);
  const newState = await saveActionState(ctx, {
    ...active,
    hunger: Math.min(100, active.hunger + 25),
    health: Math.min(100, active.health + 2),
    xp: xpInfo.xp,
    level: xpInfo.level,
    careCounts: { ...active.careCounts, fed: active.careCounts.fed + 1 },
  }, now);

  await playActionSound(ctx);
  await react(ctx, "celebrating");
  if (xpInfo.leveledUp) await speak(ctx, "speech.levelup");
  else await speak(ctx, `speech.feed.${Math.floor(Math.random() * 4)}`);
  return newState;
}

export async function play(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardHealthyForActivity(ctx, state)) return state;

  const active = wakeUpIfSleeping(state, now);
  const xpInfo = addXp(active, 5);
  const newState = await saveActionState(ctx, {
    ...active,
    happiness: Math.min(100, active.happiness + 25),
    energy: Math.max(0, active.energy - 15),
    health: Math.min(100, active.health + 1),
    xp: xpInfo.xp,
    level: xpInfo.level,
    careCounts: { ...active.careCounts, played: active.careCounts.played + 1 },
  }, now);

  await playActionSound(ctx);
  await react(ctx, "celebrating");
  if (xpInfo.leveledUp) await speak(ctx, "speech.levelup");
  else await speak(ctx, `speech.play.${Math.floor(Math.random() * 4)}`);
  return newState;
}

export async function pet(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardAlive(ctx, state)) return state;

  const active = wakeUpIfSleeping(state, now);
  const xpInfo = addXp(active, 3);
  const newState = await saveActionState(ctx, {
    ...active,
    affection: Math.min(100, active.affection + 15),
    happiness: Math.min(100, active.happiness + 10),
    health: Math.min(100, active.health + 1),
    xp: xpInfo.xp,
    level: xpInfo.level,
    careCounts: { ...active.careCounts, petted: active.careCounts.petted + 1 },
  }, now);

  await playActionSound(ctx);
  await react(ctx, "waving");
  if (xpInfo.leveledUp) await speak(ctx, "speech.levelup");
  else await speak(ctx, `speech.pet.${Math.floor(Math.random() * 4)}`);
  return newState;
}

export async function nap(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardAlive(ctx, state)) return state;

  const xpInfo = addXp(state, 5);
  const newState = await saveActionState(ctx, {
    ...state,
    energy: Math.min(100, state.energy + 40),
    health: Math.min(100, state.health + 3),
    sleptUntil: now + 15 * MINUTE_MS,
    xp: xpInfo.xp,
    level: xpInfo.level,
    careCounts: { ...state.careCounts, napped: state.careCounts.napped + 1 },
  }, now);

  await playActionSound(ctx);
  await react(ctx, "waiting");
  if (xpInfo.leveledUp) await speak(ctx, "speech.levelup");
  else await speak(ctx, `speech.nap.${Math.floor(Math.random() * 4)}`);
  return newState;
}

export async function cleanPet(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardAlive(ctx, state)) return state;

  if (state.mess <= 0) {
    await speak(ctx, "speech.clean.none");
    return state;
  }

  const xpInfo = addXp(state, 4);
  const newState = await saveActionState(ctx, {
    ...state,
    mess: 0,
    messProgressMs: 0,
    health: Math.min(100, state.health + 10),
    affection: Math.min(100, state.affection + 5),
    xp: xpInfo.xp,
    level: xpInfo.level,
    careCounts: { ...state.careCounts, cleaned: state.careCounts.cleaned + 1 },
  }, now);

  await playActionSound(ctx);
  await react(ctx, "celebrating");
  await speak(ctx, xpInfo.leveledUp ? "speech.levelup" : "speech.clean.done");
  return newState;
}

export async function giveMedicine(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardAlive(ctx, state)) return state;

  if (!state.isSick) {
    await speak(ctx, "speech.medicine.notNeeded");
    return state;
  }

  const nextDose = state.medicineDoses + 1;
  const cured = nextDose >= 2;
  const xpInfo = addXp(state, cured ? 6 : 2);
  const newState = await saveActionState(ctx, {
    ...state,
    isSick: !cured,
    medicineDoses: cured ? 0 : nextDose,
    sickSince: cured ? 0 : state.sickSince,
    health: Math.min(100, state.health + (cured ? 25 : 5)),
    xp: xpInfo.xp,
    level: xpInfo.level,
    careCounts: { ...state.careCounts, medicated: state.careCounts.medicated + 1 },
  }, now);

  await playActionSound(ctx);
  await react(ctx, cured ? "celebrating" : "waiting");
  if (xpInfo.leveledUp) await speak(ctx, "speech.levelup");
  else await speak(ctx, cured ? "speech.medicine.cured" : "speech.medicine.firstDose");
  return newState;
}

export async function startOver(ctx, now = Date.now()) {
  const previous = cleanState(await ctx.storage.get("state"));
  if (previous.deadAt <= 0) {
    await speak(ctx, "speech.restart.notNeeded");
    return previous;
  }

  const fresh = cleanState({
    bornAt: now,
    lastSeenAt: now,
    lastActionAt: now,
    careCounts: { restarted: previous.careCounts.restarted + 1 },
  });
  await ctx.storage.set("state", fresh);
  await updatePinned(ctx, fresh);
  await react(ctx, "celebrating");
  await speak(ctx, "speech.restart.done");
  return fresh;
}

export async function showStatus(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  await updatePinned(ctx, state);
  await speak(ctx, `speech.status.${getMood(state, now)}`);
}

export async function reconcile(ctx, now = Date.now()) {
  const rawState = await ctx.storage.get("state");
  let state = cleanState(rawState);
  if (state.bornAt <= 0) state = { ...state, bornAt: now };

  let updatedState = state;
  if (state.lastSeenAt > 0) {
    const elapsedMs = Math.max(0, now - state.lastSeenAt);
    updatedState = applyDecay(state, elapsedMs, now, await getLifecycleConfig(ctx));
  }

  const previousStage = state.stage;
  updatedState = cleanState({
    ...updatedState,
    stage: resolveStage(updatedState, now),
    lastSeenAt: now,
  });
  await ctx.storage.set("state", updatedState);

  await updatePinned(ctx, updatedState);
  if (updatedState.stage !== previousStage && state.lastSeenAt > 0 && updatedState.deadAt <= 0) {
    await react(ctx, "celebrating");
    await speak(ctx, `speech.stage.${updatedState.stage}`);
  }
  await maybeNudge(ctx, updatedState, now);
  await scheduleNextTick(ctx);
  return updatedState;
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await reconcile(ctx);

      try {
        ctx.events.on("pet:clicked", () => pet(ctx));
      } catch {}

      const icon = ctx.assets.icon("virtual-pet");

      await ctx.commands.register({ id: "feed", title: "$t:command.feed.title", description: "$t:command.feed.description", icon }, () => feed(ctx));
      await ctx.commands.register({ id: "play", title: "$t:command.play.title", description: "$t:command.play.description", icon }, () => play(ctx));
      await ctx.commands.register({ id: "pet", title: "$t:command.pet.title", description: "$t:command.pet.description", icon }, () => pet(ctx));
      await ctx.commands.register({ id: "nap", title: "$t:command.nap.title", description: "$t:command.nap.description", icon }, () => nap(ctx));
      await ctx.commands.register({ id: "clean", title: "$t:command.clean.title", description: "$t:command.clean.description", icon }, () => cleanPet(ctx));
      await ctx.commands.register({ id: "medicine", title: "$t:command.medicine.title", description: "$t:command.medicine.description", icon }, () => giveMedicine(ctx));
      await ctx.commands.register({ id: "status", title: "$t:command.status.title", description: "$t:command.status.description", icon }, () => showStatus(ctx));
      await ctx.commands.register({ id: "start-over", title: "$t:command.restart.title", description: "$t:command.restart.description", icon }, () => startOver(ctx));
    },
    async stop() {},
  });
}
