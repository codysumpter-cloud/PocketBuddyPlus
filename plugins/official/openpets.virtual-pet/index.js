// Buddy Brain (openpets.virtual-pet) — one canonical Buddy state owner.
//
// The stable plugin id is intentionally preserved so existing Virtual Pet saves
// migrate in place. The visible product is Buddy Brain.

export const SCHEDULE_ID = "virtual-pet-tick";
export const STATE_VERSION = 3;
export const PANEL_NAME = "brain";

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
const VALID_WARDROBES = new Set(["classic", "gold-star", "blue-scarf", "night-cap"]);
const VALID_TRAINING_TRAITS = new Set([
  "sociability", "curiosity", "playfulness", "diligence", "bravery",
  "affection", "independence", "patience", "aggression", "creativity", "neatness",
]);
const VALID_CARE_ACTIONS = new Set(["feed", "play", "pet", "nap", "clean", "medicine", "start-over"]);

export const DEFAULT_PERSONALITY = Object.freeze({
  sociability: 0.55,
  curiosity: 0.65,
  playfulness: 0.6,
  diligence: 0.55,
  bravery: 0.45,
  affection: 0.65,
  independence: 0.45,
  patience: 0.55,
  aggression: 0.2,
  creativity: 0.6,
  neatness: 0.5,
});

export const DEFAULT_DRIVES = Object.freeze({
  hunger: 0.15,
  energy: 0.1,
  comfort: 0.1,
  safety: 0.05,
  boredom: 0.2,
  curiosity: 0.25,
  affection: 0.15,
  social: 0.15,
  accomplishment: 0.2,
  cleanliness: 0.05,
  focus: 0.15,
});

export const DEFAULT_RELATIONSHIP = Object.freeze({
  affection: 0.5,
  trust: 0.5,
  familiarity: 0.1,
  respect: 0.4,
});

const pinnedBubbles = new WeakMap();
const openPanels = new WeakMap();

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

function clamp01(value, fallback = 0) {
  return clamp(finiteNumber(value, fallback), 0, 1);
}

function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(finiteNumber(value, fallback)));
}

function safeText(value, fallback = "", maximum = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maximum);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeStringArray(value, maximum = 100, itemMaximum = 500) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, itemMaximum)).filter(Boolean).slice(-maximum)
    : [];
}

function careCountsFrom(current = {}) {
  const source = isRecord(current) ? current : {};
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

function numericMap(source, defaults, minimum = 0, maximum = 1) {
  const current = isRecord(source) ? source : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [
    key,
    clamp(finiteNumber(current[key], fallback), minimum, maximum),
  ]));
}

function cleanTasks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((task, index) => ({
      id: safeText(task.id, `task-${index + 1}`, 80),
      text: safeText(task.text, "", 240),
      completed: task.completed === true,
      createdAt: Math.max(0, finiteNumber(task.createdAt, 0)),
    }))
    .filter((task) => task.text)
    .slice(-100);
}

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((message) => ({
      role: message.role === "user" ? "user" : "buddy",
      text: safeText(message.text, "", 500),
      at: Math.max(0, finiteNumber(message.at, 0)),
    }))
    .filter((message) => message.text)
    .slice(-80);
}

function cleanWorkingMemory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((entry) => ({
    action: safeText(entry.action, "", 64),
    at: Math.max(0, finiteNumber(entry.at, 0)),
  })).filter((entry) => entry.action).slice(-32);
}

function defaultBrain(currentAffection = 50) {
  return {
    schema: "pocket-buddy-brain-v1",
    buddyId: "primary-buddy",
    displayName: "Buddy",
    personality: { ...DEFAULT_PERSONALITY },
    drives: { ...DEFAULT_DRIVES },
    relationship: { ...DEFAULT_RELATIONSHIP, affection: clamp01(currentAffection / 100, 0.5) },
    stats: {
      skillPoints: 0,
      rerolls: 1,
      strength: 1,
      defense: 1,
      speed: 1,
      focus: 1,
    },
    notes: [],
    tasks: [],
    messages: [{ role: "buddy", text: "Hey! I’m here whenever you need me.", at: 0 }],
    trainingCounts: {},
    learnedAssociations: {},
    actionCounts: {},
    lastActions: [],
    workingMemory: [],
    inventory: {},
    customization: { wardrobe: "classic" },
    legacyUiMigratedAt: 0,
  };
}

function cleanBrain(value, lifecycle) {
  const source = isRecord(value) ? value : {};
  const fallback = defaultBrain(lifecycle.affection);
  const relationship = numericMap(source.relationship, {
    ...DEFAULT_RELATIONSHIP,
    affection: lifecycle.affection / 100,
  });
  relationship.affection = clamp01(lifecycle.affection / 100, relationship.affection);
  const statsSource = isRecord(source.stats) ? source.stats : {};
  const customizationSource = isRecord(source.customization) ? source.customization : {};
  const wardrobe = VALID_WARDROBES.has(customizationSource.wardrobe) ? customizationSource.wardrobe : "classic";
  const actionCountsSource = isRecord(source.actionCounts) ? source.actionCounts : {};
  const actionCounts = Object.fromEntries(
    Object.entries(actionCountsSource)
      .filter(([key, count]) => /^[A-Za-z0-9._:-]{1,64}$/.test(key) && Number.isFinite(count))
      .map(([key, count]) => [key, nonNegativeInteger(count)])
      .slice(0, 100),
  );
  const trainingSource = isRecord(source.trainingCounts) ? source.trainingCounts : {};
  const trainingCounts = Object.fromEntries(
    Object.entries(trainingSource)
      .filter(([key, count]) => VALID_TRAINING_TRAITS.has(key) && Number.isFinite(count))
      .map(([key, count]) => [key, nonNegativeInteger(count)]),
  );

  return {
    schema: "pocket-buddy-brain-v1",
    buddyId: safeText(source.buddyId, fallback.buddyId, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "primary-buddy",
    displayName: safeText(source.displayName, fallback.displayName, 64),
    personality: numericMap(source.personality, DEFAULT_PERSONALITY),
    drives: numericMap(source.drives, DEFAULT_DRIVES),
    relationship,
    stats: {
      skillPoints: nonNegativeInteger(statsSource.skillPoints),
      rerolls: nonNegativeInteger(statsSource.rerolls, 1),
      strength: Math.max(1, finiteNumber(statsSource.strength, 1)),
      defense: Math.max(1, finiteNumber(statsSource.defense, 1)),
      speed: Math.max(1, finiteNumber(statsSource.speed, 1)),
      focus: Math.max(1, finiteNumber(statsSource.focus, 1)),
    },
    notes: sanitizeStringArray(source.notes, 100, 500),
    tasks: cleanTasks(source.tasks),
    messages: cleanMessages(source.messages).length ? cleanMessages(source.messages) : fallback.messages,
    trainingCounts,
    learnedAssociations: isRecord(source.learnedAssociations) ? structuredClone(source.learnedAssociations) : {},
    actionCounts,
    lastActions: sanitizeStringArray(source.lastActions, 16, 64),
    workingMemory: cleanWorkingMemory(source.workingMemory),
    inventory: isRecord(source.inventory) ? structuredClone(source.inventory) : {},
    customization: { wardrobe },
    legacyUiMigratedAt: Math.max(0, finiteNumber(source.legacyUiMigratedAt, 0)),
  };
}

function synchronizeBrain(state) {
  const brain = cleanBrain(state.brain, state);
  brain.relationship.affection = clamp01(state.affection / 100, brain.relationship.affection);
  brain.drives.hunger = clamp01((100 - state.hunger) / 100);
  brain.drives.energy = clamp01((100 - state.energy) / 100);
  brain.drives.boredom = clamp01((100 - state.happiness) / 100);
  brain.drives.cleanliness = clamp01(state.mess / 5);
  brain.drives.affection = clamp01((100 - state.affection) / 100);
  brain.stats.level = state.level;
  brain.stats.experience = state.xp;
  brain.stats.health = state.health;
  brain.stats.maxHealth = 100;
  brain.stats.stamina = state.energy;
  brain.stats.maxStamina = 100;
  return brain;
}

export function cleanState(state = {}) {
  const current = isRecord(state) ? state : {};
  const stage = VALID_STAGES.has(current.stage) ? current.stage : "hatchling";
  const deathReason = VALID_DEATH_REASONS.has(current.deathReason) ? current.deathReason : "";

  const lifecycle = {
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
    brain: null,
  };
  lifecycle.brain = synchronizeBrain({ ...lifecycle, brain: current.brain });
  return lifecycle;
}

export function createBrainSnapshot(state, now = Date.now()) {
  const clean = cleanState(state);
  return {
    version: clean.version,
    buddyId: clean.brain.buddyId,
    displayName: clean.brain.displayName,
    mood: getMood(clean, now),
    stage: clean.stage,
    level: clean.level,
    xp: clean.xp,
    bornAt: clean.bornAt,
    lifecycle: {
      hunger: clean.hunger,
      energy: clean.energy,
      happiness: clean.happiness,
      affection: clean.affection,
      health: clean.health,
      mess: clean.mess,
      isSick: clean.isSick,
      medicineDoses: clean.medicineDoses,
      sleptUntil: clean.sleptUntil,
      deadAt: clean.deadAt,
      deathReason: clean.deathReason,
    },
    brain: structuredClone(clean.brain),
    careCounts: { ...clean.careCounts },
    updatedAt: clean.lastSeenAt || now,
  };
}

function recordBrainAction(state, action, now = Date.now(), relationship = {}) {
  const clean = cleanState(state);
  const brain = structuredClone(clean.brain);
  brain.actionCounts[action] = nonNegativeInteger(brain.actionCounts[action]) + 1;
  brain.lastActions = [...brain.lastActions, action].slice(-16);
  brain.workingMemory = [...brain.workingMemory, { action, at: now }].slice(-32);
  for (const [key, delta] of Object.entries(relationship)) {
    if (key in brain.relationship) brain.relationship[key] = clamp01(brain.relationship[key] + delta);
  }
  return cleanState({ ...clean, affection: brain.relationship.affection * 100, brain });
}

export function resolveStage(state, now = Date.now()) {
  const clean = cleanState(state);
  const bornAt = clean.bornAt || now;
  const ageMs = Math.max(0, now - bornAt);
  if (clean.level >= 10 && clean.affection >= 85 && clean.careMistakes <= 2) return "beloved";
  if (ageMs >= 7 * DAY_MS && clean.level >= 5) return "companion";
  if (ageMs >= DAY_MS || clean.level >= 3) return "growing";
  return "hatchling";
}

export function getMood(state, now = Date.now()) {
  if (state.deadAt > 0) return "dead";
  if (state.isSick) return "sick";
  if (state.mess >= 3) return "dirty";
  if (now < state.sleptUntil) return "sleeping";
  if (state.hunger < 30) return "hungry";
  if (state.energy < 30) return "tired";
  if (state.happiness < 30) return "bored";
  if ((state.hunger + state.energy + state.happiness + state.affection) / 4 >= 75) return "happy";
  return "content";
}

function wakeUpIfSleeping(state, now) {
  return state.sleptUntil > now ? { ...state, sleptUntil: 0 } : state;
}

function withResolvedCareDeadlines(state) {
  return {
    ...state,
    careDeadlineAt: state.hunger > 0 && state.energy > 0 && state.happiness > 0 ? 0 : state.careDeadlineAt,
    criticalSince: state.hunger > 0 || state.energy > 0 || state.happiness > 0 ? 0 : state.criticalSince,
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
  if (current.sleptUntil > lastSeen) sleepMs = Math.max(0, Math.min(current.sleptUntil, now) - lastSeen);
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
      } else careDeadlineAt = now + CARE_DEADLINE_MS;
    } else if (now >= careDeadlineAt) {
      const overdueMs = now - careDeadlineAt;
      const addedMistakes = 1 + Math.floor(overdueMs / REPEAT_CARE_MISTAKE_MS);
      careMistakes += addedMistakes;
      careDeadlineAt += addedMistakes * REPEAT_CARE_MISTAKE_MS;
    }
  } else careDeadlineAt = 0;
  let criticalSince = current.criticalSince;
  if (allCritical) {
    if (criticalSince <= 0) criticalSince = now - Math.min(boundedElapsedMs, CLASSIC_NEGLECT_DEATH_MS);
  } else criticalSince = 0;
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
  if (!isSick && mess < 3 && !hasCriticalNeed) health += sleepHours + wakeHours * 0.5;
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
  } else if (health <= 0) health = 10;
  return cleanState({
    ...current, hunger, energy, happiness, affection, health, mess, messProgressMs,
    isSick, medicineDoses: isSick ? current.medicineDoses : 0, careMistakes,
    careDeadlineAt, criticalSince, sickSince, deadAt, deathReason,
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
    if (cfg.sound) await ctx.audio.play(cfg.sound);
  } catch {}
}

async function speak(ctx, key) {
  try { await ctx.pet.speak(ctx.t(key)); } catch {}
}

async function react(ctx, reaction) {
  try { await ctx.pet.react(reaction, { showMessage: false }); } catch {}
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
    sticky: true, pin: true, dismissOn: [], priority: "normal",
    hud: { items: [
      { icon: "food", value: state.hunger, tone: "amber", label: ctx.t("hud.food") },
      { icon: "zap", value: state.energy, tone: "blue", label: ctx.t("hud.energy") },
      { icon: "play", value: state.happiness, tone: "green", label: ctx.t("hud.play") },
      fourthItem,
    ] },
  };
  const pinnedBubble = getPinnedBubble(ctx);
  if (pinnedBubble) {
    try { await pinnedBubble.update(spec); return; } catch { setPinnedBubble(ctx, null); }
  }
  try {
    const nextBubble = await ctx.ui.bubble(spec);
    nextBubble.onDismiss(() => {
      if (getPinnedBubble(ctx)?.id === nextBubble.id) setPinnedBubble(ctx, null);
    });
    setPinnedBubble(ctx, nextBubble);
  } catch {}
}

async function postBrainState(ctx, panel, state = null) {
  const current = state ?? cleanState(await ctx.storage.get("state"));
  try { await panel.postMessage({ type: "brain-state", state: createBrainSnapshot(current) }); } catch {}
}

async function refreshOpenPanel(ctx, state = null) {
  const panel = openPanels.get(ctx);
  if (panel) await postBrainState(ctx, panel, state);
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
  if (!speechKey || (state.lastNudgeAt !== 0 && now - state.lastNudgeAt < NUDGE_COOLDOWN_MS)) return;
  const nextState = cleanState({ ...state, lastNudgeAt: now });
  await ctx.storage.set("state", nextState);
  await speak(ctx, speechKey);
}

async function scheduleNextTick(ctx) {
  try {
    await ctx.schedule.cancel(SCHEDULE_ID);
    await ctx.schedule.once(SCHEDULE_ID, 15 * MINUTE_MS, () => reconcile(ctx));
  } catch {}
}

async function saveActionState(ctx, state, now, action = "", relationship = {}) {
  let next = cleanState({
    ...withResolvedCareDeadlines(state),
    stage: resolveStage(state, now),
    lastActionAt: now,
    lastSeenAt: now,
  });
  if (action) next = recordBrainAction(next, action, now, relationship);
  await ctx.storage.set("state", next);
  await updatePinned(ctx, next);
  await refreshOpenPanel(ctx, next);
  return next;
}

export async function feed(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardHealthyForActivity(ctx, state)) return state;
  const active = wakeUpIfSleeping(state, now);
  const xpInfo = addXp(active, 5);
  const newState = await saveActionState(ctx, {
    ...active, hunger: Math.min(100, active.hunger + 25), health: Math.min(100, active.health + 2),
    xp: xpInfo.xp, level: xpInfo.level, careCounts: { ...active.careCounts, fed: active.careCounts.fed + 1 },
  }, now, "feed", { trust: 0.01, familiarity: 0.005 });
  await playActionSound(ctx); await react(ctx, "celebrating");
  await speak(ctx, xpInfo.leveledUp ? "speech.levelup" : `speech.feed.${Math.floor(Math.random() * 4)}`);
  return newState;
}

export async function play(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardHealthyForActivity(ctx, state)) return state;
  const active = wakeUpIfSleeping(state, now);
  const xpInfo = addXp(active, 5);
  const newState = await saveActionState(ctx, {
    ...active, happiness: Math.min(100, active.happiness + 25), energy: Math.max(0, active.energy - 15),
    health: Math.min(100, active.health + 1), xp: xpInfo.xp, level: xpInfo.level,
    careCounts: { ...active.careCounts, played: active.careCounts.played + 1 },
  }, now, "play", { familiarity: 0.015, affection: 0.01 });
  await playActionSound(ctx); await react(ctx, "celebrating");
  await speak(ctx, xpInfo.leveledUp ? "speech.levelup" : `speech.play.${Math.floor(Math.random() * 4)}`);
  return newState;
}

export async function pet(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardAlive(ctx, state)) return state;
  const active = wakeUpIfSleeping(state, now);
  const xpInfo = addXp(active, 3);
  const newState = await saveActionState(ctx, {
    ...active, affection: Math.min(100, active.affection + 15), happiness: Math.min(100, active.happiness + 10),
    health: Math.min(100, active.health + 1), xp: xpInfo.xp, level: xpInfo.level,
    careCounts: { ...active.careCounts, petted: active.careCounts.petted + 1 },
  }, now, "pet", { trust: 0.01, familiarity: 0.01 });
  await playActionSound(ctx); await react(ctx, "waving");
  await speak(ctx, xpInfo.leveledUp ? "speech.levelup" : `speech.pet.${Math.floor(Math.random() * 4)}`);
  return newState;
}

export async function nap(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardAlive(ctx, state)) return state;
  const xpInfo = addXp(state, 5);
  const newState = await saveActionState(ctx, {
    ...state, energy: Math.min(100, state.energy + 40), health: Math.min(100, state.health + 3),
    sleptUntil: now + 15 * MINUTE_MS, xp: xpInfo.xp, level: xpInfo.level,
    careCounts: { ...state.careCounts, napped: state.careCounts.napped + 1 },
  }, now, "nap", { trust: 0.005 });
  await playActionSound(ctx); await react(ctx, "waiting");
  await speak(ctx, xpInfo.leveledUp ? "speech.levelup" : `speech.nap.${Math.floor(Math.random() * 4)}`);
  return newState;
}

export async function cleanPet(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardAlive(ctx, state)) return state;
  if (state.mess <= 0) { await speak(ctx, "speech.clean.none"); return state; }
  const xpInfo = addXp(state, 4);
  const newState = await saveActionState(ctx, {
    ...state, mess: 0, messProgressMs: 0, health: Math.min(100, state.health + 10),
    affection: Math.min(100, state.affection + 5), xp: xpInfo.xp, level: xpInfo.level,
    careCounts: { ...state.careCounts, cleaned: state.careCounts.cleaned + 1 },
  }, now, "clean", { trust: 0.01, respect: 0.005 });
  await playActionSound(ctx); await react(ctx, "celebrating");
  await speak(ctx, xpInfo.leveledUp ? "speech.levelup" : "speech.clean.done");
  return newState;
}

export async function giveMedicine(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!await guardAlive(ctx, state)) return state;
  if (!state.isSick) { await speak(ctx, "speech.medicine.notNeeded"); return state; }
  const nextDose = state.medicineDoses + 1;
  const cured = nextDose >= 2;
  const xpInfo = addXp(state, cured ? 6 : 2);
  const newState = await saveActionState(ctx, {
    ...state, isSick: !cured, medicineDoses: cured ? 0 : nextDose, sickSince: cured ? 0 : state.sickSince,
    health: Math.min(100, state.health + (cured ? 25 : 5)), xp: xpInfo.xp, level: xpInfo.level,
    careCounts: { ...state.careCounts, medicated: state.careCounts.medicated + 1 },
  }, now, "medicine", { trust: 0.02, respect: 0.01 });
  await playActionSound(ctx); await react(ctx, cured ? "celebrating" : "waiting");
  await speak(ctx, xpInfo.leveledUp ? "speech.levelup" : cured ? "speech.medicine.cured" : "speech.medicine.firstDose");
  return newState;
}

export async function startOver(ctx, now = Date.now()) {
  const previous = cleanState(await ctx.storage.get("state"));
  if (previous.deadAt <= 0) { await speak(ctx, "speech.restart.notNeeded"); return previous; }
  const fresh = cleanState({
    bornAt: now, lastSeenAt: now, lastActionAt: now,
    careCounts: { restarted: previous.careCounts.restarted + 1 },
    brain: {
      ...previous.brain,
      relationship: { ...previous.brain.relationship, affection: 0.5, familiarity: 0.1 },
      lastActions: [...previous.brain.lastActions, "start-over"].slice(-16),
    },
  });
  await ctx.storage.set("state", fresh);
  await updatePinned(ctx, fresh); await refreshOpenPanel(ctx, fresh);
  await react(ctx, "celebrating"); await speak(ctx, "speech.restart.done");
  return fresh;
}

export async function showStatus(ctx, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  await updatePinned(ctx, state); await refreshOpenPanel(ctx, state);
  await speak(ctx, `speech.status.${getMood(state, now)}`);
  return state;
}

export async function updateProfile(ctx, patch, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  const brain = structuredClone(state.brain);
  if (typeof patch?.displayName === "string") brain.displayName = safeText(patch.displayName, brain.displayName, 64);
  if (VALID_WARDROBES.has(patch?.wardrobe)) brain.customization.wardrobe = patch.wardrobe;
  return saveActionState(ctx, { ...state, brain }, now, "profile-update");
}

export async function addNote(ctx, text, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  const note = safeText(text, "", 500);
  if (!note) return state;
  const brain = structuredClone(state.brain);
  brain.notes = [...brain.notes, note].slice(-100);
  return saveActionState(ctx, { ...state, brain }, now, "note-add");
}

export async function deleteNote(ctx, index, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  const position = nonNegativeInteger(index, -1);
  if (position < 0 || position >= state.brain.notes.length) return state;
  const brain = structuredClone(state.brain);
  brain.notes.splice(position, 1);
  return saveActionState(ctx, { ...state, brain }, now, "note-delete");
}

export async function addTask(ctx, text, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  const taskText = safeText(text, "", 240);
  if (!taskText) return state;
  const brain = structuredClone(state.brain);
  brain.tasks = [...brain.tasks, { id: `task-${now}-${brain.tasks.length + 1}`, text: taskText, completed: false, createdAt: now }].slice(-100);
  return saveActionState(ctx, { ...state, brain }, now, "task-add");
}

export async function toggleTask(ctx, id, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  const taskId = safeText(id, "", 80);
  const brain = structuredClone(state.brain);
  const task = brain.tasks.find((item) => item.id === taskId);
  if (!task) return state;
  task.completed = !task.completed;
  return saveActionState(ctx, { ...state, brain }, now, "task-toggle");
}

export async function deleteTask(ctx, id, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  const taskId = safeText(id, "", 80);
  const brain = structuredClone(state.brain);
  brain.tasks = brain.tasks.filter((item) => item.id !== taskId);
  return saveActionState(ctx, { ...state, brain }, now, "task-delete");
}

export async function trainTrait(ctx, trait, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (!VALID_TRAINING_TRAITS.has(trait)) return state;
  const brain = structuredClone(state.brain);
  brain.personality[trait] = clamp01(brain.personality[trait] + 0.01);
  brain.trainingCounts[trait] = nonNegativeInteger(brain.trainingCounts[trait]) + 1;
  brain.stats.skillPoints += 1;
  const xpInfo = addXp(state, 2);
  const next = await saveActionState(ctx, { ...state, xp: xpInfo.xp, level: xpInfo.level, brain }, now, `train:${trait}`, { respect: 0.005 });
  await react(ctx, "working");
  return next;
}

export async function importLegacyBuddyUi(ctx, payload, now = Date.now()) {
  const state = cleanState(await ctx.storage.get("state"));
  if (state.brain.legacyUiMigratedAt > 0) return state;
  const legacy = isRecord(payload) ? payload : {};
  const legacyBuddy = isRecord(legacy.buddy) ? legacy.buddy : {};
  const legacyNeeds = isRecord(legacyBuddy.needs) ? legacyBuddy.needs : {};
  const brain = structuredClone(state.brain);
  if (typeof legacyBuddy.displayName === "string") brain.displayName = safeText(legacyBuddy.displayName, brain.displayName, 64);
  brain.notes = sanitizeStringArray(legacy.notes, 100, 500);
  brain.tasks = cleanTasks(legacy.tasks);
  brain.messages = cleanMessages(legacy.messages).length ? cleanMessages(legacy.messages) : brain.messages;
  if (VALID_WARDROBES.has(legacy.wardrobe)) brain.customization.wardrobe = legacy.wardrobe;
  brain.legacyUiMigratedAt = now;
  const legacyCare = isRecord(legacy.careCounts) ? legacy.careCounts : {};
  const next = cleanState({
    ...state,
    bornAt: state.bornAt || Math.max(0, finiteNumber(legacyBuddy.createdAtMs, now)),
    hunger: Number.isFinite(legacyNeeds.hunger) ? (1 - clamp01(legacyNeeds.hunger)) * 100 : state.hunger,
    energy: Number.isFinite(legacyNeeds.energy) ? (1 - clamp01(legacyNeeds.energy)) * 100 : state.energy,
    happiness: Number.isFinite(legacyNeeds.play) ? (1 - clamp01(legacyNeeds.play)) * 100 : state.happiness,
    affection: Number.isFinite(legacyBuddy.affection) ? clamp01(legacyBuddy.affection) * 100 : state.affection,
    mess: Number.isFinite(legacyNeeds.cleanliness) ? Math.round(clamp01(legacyNeeds.cleanliness) * 5) : state.mess,
    careCounts: {
      ...state.careCounts,
      petted: Math.max(state.careCounts.petted, nonNegativeInteger(legacyCare.pet)),
      fed: Math.max(state.careCounts.fed, nonNegativeInteger(legacyCare.feed)),
      played: Math.max(state.careCounts.played, nonNegativeInteger(legacyCare.play)),
      napped: Math.max(state.careCounts.napped, nonNegativeInteger(legacyCare.rest)),
      cleaned: Math.max(state.careCounts.cleaned, nonNegativeInteger(legacyCare.clean)),
    },
    brain,
    lastSeenAt: now,
  });
  await ctx.storage.set("state", next);
  await updatePinned(ctx, next);
  await refreshOpenPanel(ctx, next);
  return next;
}

async function handlePanelMessage(ctx, panel, message) {
  if (!isRecord(message)) return;
  const type = message.type;
  let next = null;
  if (type === "ready" || type === "refresh") next = cleanState(await ctx.storage.get("state"));
  else if (type === "care" && VALID_CARE_ACTIONS.has(message.action)) {
    const actionHandlers = {
      feed, play, pet, nap, clean: cleanPet, medicine: giveMedicine, "start-over": startOver,
    };
    next = await actionHandlers[message.action](ctx);
  } else if (type === "profile-update") next = await updateProfile(ctx, message);
  else if (type === "note-add") next = await addNote(ctx, message.text);
  else if (type === "note-delete") next = await deleteNote(ctx, message.index);
  else if (type === "task-add") next = await addTask(ctx, message.text);
  else if (type === "task-toggle") next = await toggleTask(ctx, message.id);
  else if (type === "task-delete") next = await deleteTask(ctx, message.id);
  else if (type === "train") next = await trainTrait(ctx, message.trait);
  if (next) await postBrainState(ctx, panel, next);
}

export async function openBrain(ctx) {
  const existing = openPanels.get(ctx);
  if (existing) {
    try {
      await existing.show();
      await postBrainState(ctx, existing);
      return existing;
    } catch {
      openPanels.delete(ctx);
    }
  }
  const panel = await ctx.ui.panel({ panel: PANEL_NAME, title: "Buddy Brain", width: 1040, height: 760 });
  panel.onMessage((message) => handlePanelMessage(ctx, panel, message));
  openPanels.set(ctx, panel);
  await postBrainState(ctx, panel);
  return panel;
}

export async function reconcile(ctx, now = Date.now()) {
  const rawState = await ctx.storage.get("state");
  let state = cleanState(rawState);
  if (state.bornAt <= 0) state = cleanState({ ...state, bornAt: now });
  let updatedState = state;
  if (state.lastSeenAt > 0) {
    const elapsedMs = Math.max(0, now - state.lastSeenAt);
    updatedState = applyDecay(state, elapsedMs, now, await getLifecycleConfig(ctx));
  }
  const previousStage = state.stage;
  updatedState = cleanState({ ...updatedState, stage: resolveStage(updatedState, now), lastSeenAt: now });
  await ctx.storage.set("state", updatedState);
  await updatePinned(ctx, updatedState);
  await refreshOpenPanel(ctx, updatedState);
  if (updatedState.stage !== previousStage && state.lastSeenAt > 0 && updatedState.deadAt <= 0) {
    await react(ctx, "celebrating"); await speak(ctx, `speech.stage.${updatedState.stage}`);
  }
  await maybeNudge(ctx, updatedState, now);
  await scheduleNextTick(ctx);
  return updatedState;
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await reconcile(ctx);
      try { ctx.events.on("pet:clicked", () => pet(ctx)); } catch {}
      const icon = ctx.assets.icon("virtual-pet");
      await ctx.commands.register({ id: "open-brain", title: "$t:command.brain.title", description: "$t:command.brain.description", icon }, () => openBrain(ctx));
      await ctx.commands.register({ id: "import-legacy-buddy-ui", title: "$t:command.import.title", description: "$t:command.import.description", icon }, (values) => importLegacyBuddyUi(ctx, values?.payload ?? values));
      await ctx.commands.register({ id: "feed", title: "$t:command.feed.title", description: "$t:command.feed.description", icon }, () => feed(ctx));
      await ctx.commands.register({ id: "play", title: "$t:command.play.title", description: "$t:command.play.description", icon }, () => play(ctx));
      await ctx.commands.register({ id: "pet", title: "$t:command.pet.title", description: "$t:command.pet.description", icon }, () => pet(ctx));
      await ctx.commands.register({ id: "nap", title: "$t:command.nap.title", description: "$t:command.nap.description", icon }, () => nap(ctx));
      await ctx.commands.register({ id: "clean", title: "$t:command.clean.title", description: "$t:command.clean.description", icon }, () => cleanPet(ctx));
      await ctx.commands.register({ id: "medicine", title: "$t:command.medicine.title", description: "$t:command.medicine.description", icon }, () => giveMedicine(ctx));
      await ctx.commands.register({ id: "status", title: "$t:command.status.title", description: "$t:command.status.description", icon }, () => showStatus(ctx));
      await ctx.commands.register({ id: "start-over", title: "$t:command.restart.title", description: "$t:command.restart.description", icon }, () => startOver(ctx));
    },
    async stop(ctx) {
      const panel = openPanels.get(ctx);
      if (panel) {
        try { await panel.close(); } catch {}
        openPanels.delete(ctx);
      }
      const pinned = getPinnedBubble(ctx);
      if (pinned) {
        try { await pinned.dismiss(); } catch {}
        setPinnedBubble(ctx, null);
      }
    },
  });
}
