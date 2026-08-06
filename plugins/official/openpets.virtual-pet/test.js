// Behavior tests for openpets.virtual-pet.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  cleanState,
  getMood,
  resolveStage,
  addXp,
  applyDecay,
  register,
  SCHEDULE_ID,
  STATE_VERSION,
} from "./index.js";

let createTestHarness;
try {
  ({ createTestHarness } = await import("@open-pets/plugin-sdk/testing"));
} catch {
  ({ createTestHarness } = await import(new URL("../../../packages/sdk/dist/testing.js", import.meta.url)));
}

let activeHarness = null;
const originalDateNow = Date.now;
Object.defineProperty(Date, "now", {
  value: () => {
    if (activeHarness?.clock) return activeHarness.clock.now();
    return 1_000_000;
  },
  configurable: true,
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Pure state helpers protect migration, lifecycle, decay, and classic-mode behavior.
{
  const defaultState = cleanState(null);
  assert.equal(defaultState.version, STATE_VERSION);
  assert.equal(defaultState.hunger, 80);
  assert.equal(defaultState.energy, 80);
  assert.equal(defaultState.happiness, 80);
  assert.equal(defaultState.affection, 50);
  assert.equal(defaultState.health, 100);
  assert.equal(defaultState.mess, 0);
  assert.equal(defaultState.isSick, false);
  assert.equal(defaultState.careMistakes, 0);
  assert.equal(defaultState.level, 1);
  assert.equal(defaultState.xp, 0);

  const migratedState = cleanState({ hunger: 20, level: 3, careCounts: { fed: 5 } });
  assert.equal(migratedState.hunger, 20);
  assert.equal(migratedState.level, 3);
  assert.equal(migratedState.health, 100, "old saves gain safe lifecycle defaults");
  assert.equal(migratedState.careCounts.fed, 5);
  assert.equal(migratedState.careCounts.cleaned, 0);

  assert.equal(getMood(cleanState({ deadAt: 100 }), 1_000), "dead");
  assert.equal(getMood(cleanState({ isSick: true }), 1_000), "sick");
  assert.equal(getMood(cleanState({ mess: 3 }), 1_000), "dirty");
  assert.equal(getMood(cleanState({ sleptUntil: 5_000 }), 1_000), "sleeping");
  assert.equal(getMood(cleanState({ hunger: 20 }), 1_000), "hungry");
  assert.equal(getMood(cleanState({ energy: 10 }), 1_000), "tired");
  assert.equal(getMood(cleanState({ happiness: 15 }), 1_000), "bored");
  assert.equal(getMood(cleanState({ hunger: 80, energy: 80, happiness: 80, affection: 80 }), 1_000), "happy");

  const bornAt = 10 * DAY;
  assert.equal(resolveStage(cleanState({ bornAt, level: 1 }), bornAt + HOUR), "hatchling");
  assert.equal(resolveStage(cleanState({ bornAt, level: 3 }), bornAt + HOUR), "growing");
  assert.equal(resolveStage(cleanState({ bornAt, level: 5 }), bornAt + 8 * DAY), "companion");
  assert.equal(resolveStage(cleanState({ bornAt, level: 10, affection: 90, careMistakes: 1 }), bornAt + 8 * DAY), "beloved");

  const levelUp = addXp({ xp: 45, level: 1 }, 10);
  assert.deepEqual(levelUp, { xp: 5, level: 2, leveledUp: true });
  const normalXp = addXp({ xp: 10, level: 1 }, 10);
  assert.deepEqual(normalXp, { xp: 20, level: 1, leveledUp: false });

  const now = 1_000 + 2 * HOUR;
  const stateDecayed = applyDecay(
    cleanState({ hunger: 80, energy: 80, happiness: 80, affection: 50, lastSeenAt: 1_000 }),
    2 * HOUR,
    now,
  );
  assert.equal(stateDecayed.hunger, 76);
  assert.equal(stateDecayed.energy, 74);
  assert.equal(stateDecayed.happiness, 76);
  assert.equal(stateDecayed.affection, 48);
  assert.equal(stateDecayed.mess, 0);

  const fourHours = applyDecay(
    cleanState({ hunger: 100, energy: 100, happiness: 100, affection: 100, lastSeenAt: 1_000 }),
    4 * HOUR,
    1_000 + 4 * HOUR,
  );
  assert.equal(fourHours.mess, 1, "awake time accumulates mess deterministically");

  const sickFromMess = applyDecay(
    cleanState({ mess: 3, messProgressMs: 3 * HOUR, lastSeenAt: 1_000 }),
    HOUR,
    1_000 + HOUR,
  );
  assert.equal(sickFromMess.mess, 4);
  assert.equal(sickFromMess.isSick, true);
  assert.ok(sickFromMess.health < 100);

  const sleeping = applyDecay(
    cleanState({ hunger: 80, energy: 50, happiness: 80, affection: 50, sleptUntil: 1_000 + HOUR, lastSeenAt: 1_000 }),
    HOUR,
    1_000 + HOUR,
  );
  assert.equal(sleeping.hunger, 78);
  assert.equal(sleeping.energy, 65);
  assert.equal(sleeping.happiness, 79.5);
  assert.equal(sleeping.affection, 50);
  assert.equal(sleeping.mess, 0, "sleep does not create mess");

  const casualSurvivor = applyDecay(
    cleanState({ health: 1, isSick: true, sickSince: 1, lastSeenAt: 1_000 }),
    HOUR,
    1_000 + HOUR,
    { classicLifecycle: false },
  );
  assert.equal(casualSurvivor.deadAt, 0);
  assert.equal(casualSurvivor.health, 10, "casual mode never permanently loses the pet");

  const classicDeath = applyDecay(
    cleanState({ health: 1, isSick: true, sickSince: 1, lastSeenAt: 1_000 }),
    HOUR,
    1_000 + HOUR,
    { classicLifecycle: true },
  );
  assert.equal(classicDeath.deadAt, 1_000 + HOUR);
  assert.equal(classicDeath.deathReason, "sickness");
}

const PERMISSIONS = ["pet:speak", "pet:interact", "pet:pin", "pet:reaction", "schedule", "storage", "commands", "audio", "events"];
const LOCALES = { en: JSON.parse(await readFile(new URL("./locales/en.json", import.meta.url), "utf8")) };

// Startup initializes a migratable persistent state, tick schedule, and four-item HUD.
{
  const h = createTestHarness(register, { permissions: PERMISSIONS, locales: LOCALES, nowMs: 100_000_000_000 });
  activeHarness = h;
  await h.start();
  h.expectStored("state", (s) => s.lastSeenAt === 100_000_000_000 && s.bornAt === 100_000_000_000 && s.health === 100);
  assert.ok(h.calls.schedules.has(SCHEDULE_ID));
  h.expectBubble({ sticky: true, pin: true });
  assert.deepEqual(h.calls.bubbles[0].spec.dismissOn, []);

  const lastBubble = h.calls.bubbles.at(-1);
  assert.ok(lastBubble?.spec.hud);
  assert.equal(lastBubble.spec.hud.items.length, 4);
  const [food, energy, play, bond] = lastBubble.spec.hud.items;
  assert.deepEqual([food.icon, food.value, food.label], ["food", 80, "Food"]);
  assert.deepEqual([energy.icon, energy.value, energy.label], ["zap", 80, "Energy"]);
  assert.deepEqual([play.icon, play.value, play.label], ["play", 80, "Play"]);
  assert.deepEqual([bond.icon, bond.value, bond.label], ["heart", 50, "Bond"]);
  h.expectNoErrors();
}

// Hidden stats must not create a pinned HUD.
{
  const h = createTestHarness(register, {
    permissions: PERMISSIONS,
    locales: LOCALES,
    nowMs: 100_000_000_000,
    config: { showStats: false },
  });
  activeHarness = h;
  await h.start();
  assert.equal(h.calls.bubbles.length, 0);
  h.expectNoErrors();
}

// Restart catch-up decays needs and preserves old saves without requiring a reset.
{
  const now = 101_000_000_000;
  const h = createTestHarness(register, { permissions: PERMISSIONS, locales: LOCALES, nowMs: now });
  activeHarness = h;
  await h.ctx.storage.set("state", { hunger: 100, energy: 100, happiness: 100, affection: 100, lastSeenAt: now - 2 * HOUR });
  await h.start();
  h.expectStored("state", (s) => s.hunger === 96 && s.energy === 94 && s.happiness === 96 && s.affection === 98 && s.version === STATE_VERSION);
  h.expectNoErrors();
}

// Everyday care actions mutate the intended public state and reactions.
{
  const now = 102_000_000_000;
  const h = createTestHarness(register, { permissions: PERMISSIONS, locales: LOCALES, nowMs: now });
  activeHarness = h;
  await h.start();

  await h.runCommand("feed");
  h.expectStored("state", (s) => s.hunger === 100 && s.xp === 5 && s.careCounts.fed === 1);
  h.expectSpoke(/food|munch|tasty|delicious/);
  h.expectReacted("celebrating");

  await h.runCommand("play");
  h.expectStored("state", (s) => s.happiness === 100 && s.energy === 65 && s.xp === 10 && s.careCounts.played === 1);
  h.expectReacted("celebrating");

  await h.runCommand("pet");
  h.expectStored("state", (s) => s.affection === 65 && s.happiness === 100 && s.xp === 13 && s.careCounts.petted === 1);
  h.expectReacted("waving");

  await h.runCommand("nap");
  h.expectStored("state", (s) => s.energy === 100 && s.sleptUntil === now + 15 * 60_000 && s.careCounts.napped === 1);
  h.expectReacted("waiting");

  await h.runCommand("status");
  h.expectSpoke(/resting|hungry|sleepy|play|great|content|sick|clean|ended/);
  h.expectNoErrors();
}

// Activity wakes a sleeping pet.
{
  const h = createTestHarness(register, { permissions: PERMISSIONS, locales: LOCALES, nowMs: 103_000_000_000 });
  activeHarness = h;
  await h.start();
  await h.runCommand("nap");
  h.expectStored("state", (s) => s.sleptUntil > 0);
  await h.runCommand("play");
  h.expectStored("state", (s) => s.sleptUntil === 0);
  h.expectNoErrors();
}

// Clicking the pet remains a direct affection action.
{
  const h = createTestHarness(register, { permissions: PERMISSIONS, locales: LOCALES, nowMs: 104_000_000_000 });
  activeHarness = h;
  await h.start();
  await h.emit("pet:clicked", {});
  h.expectStored("state", (s) => s.affection === 65 && s.careCounts.petted === 1);
  h.expectNoErrors();
}

// Dirty and sick states expose health in the HUD, block strenuous actions, and require two medicine doses.
{
  const now = 105_000_000_000;
  const h = createTestHarness(register, { permissions: PERMISSIONS, locales: LOCALES, nowMs: now });
  activeHarness = h;
  await h.ctx.storage.set("state", cleanState({
    hunger: 40,
    energy: 40,
    happiness: 40,
    health: 60,
    mess: 4,
    isSick: true,
    sickSince: now - HOUR,
    lastSeenAt: now,
  }));
  await h.start();

  const healthHud = h.calls.bubbles.at(-1).spec.hud.items[3];
  assert.equal(healthHud.label, "Health");
  assert.equal(healthHud.value, 60);

  await h.runCommand("feed");
  h.expectStored("state", (s) => s.hunger === 40 && s.careCounts.fed === 0);
  h.expectSpoke(/medicine/);

  await h.runCommand("clean");
  h.expectStored("state", (s) => s.mess === 0 && s.careCounts.cleaned === 1 && s.health === 70);

  await h.runCommand("medicine");
  h.expectStored("state", (s) => s.isSick === true && s.medicineDoses === 1 && s.careCounts.medicated === 1);
  await h.runCommand("medicine");
  h.expectStored("state", (s) => s.isSick === false && s.medicineDoses === 0 && s.careCounts.medicated === 2);
  h.expectSpoke(/better/);
  h.expectNoErrors();
}

// Classic lifecycle death is reversible only through the explicit new-life command.
{
  const now = 106_000_000_000;
  const h = createTestHarness(register, {
    permissions: PERMISSIONS,
    locales: LOCALES,
    nowMs: now,
    config: { classicLifecycle: true },
  });
  activeHarness = h;
  await h.ctx.storage.set("state", cleanState({ deadAt: now - HOUR, deathReason: "neglect", lastSeenAt: now }));
  await h.start();

  await h.runCommand("pet");
  h.expectStored("state", (s) => s.deadAt > 0 && s.careCounts.petted === 0);

  await h.runCommand("start-over");
  h.expectStored("state", (s) => s.deadAt === 0 && s.bornAt === now && s.careCounts.restarted === 1 && s.health === 100);
  h.expectSpoke(/new little buddy/);
  h.expectNoErrors();
}

// Nudges are prioritized and cooldown-protected.
{
  const now = 107_000_000_000;
  const h = createTestHarness(register, { permissions: PERMISSIONS, locales: LOCALES, nowMs: now });
  activeHarness = h;
  await h.ctx.storage.set("state", cleanState({ hunger: 10, lastSeenAt: now - 15 * 60_000 }));
  await h.start();
  h.expectSpoke(/hungry/);
  h.expectStored("state", (s) => s.lastNudgeAt === now);

  const previousSpeakCount = h.calls.speak.length;
  await h.clock.advance("5m");
  assert.equal(h.calls.speak.length, previousSpeakCount, "nudge should not spam");
  h.expectNoErrors();
}

Object.defineProperty(Date, "now", {
  value: originalDateNow,
  configurable: true,
});

console.log("openpets.virtual-pet: all checks passed.");
