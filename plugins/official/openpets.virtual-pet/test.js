import assert from "node:assert/strict";

import {
  DEFAULT_DRIVES,
  DEFAULT_PERSONALITY,
  PANEL_NAME,
  SCHEDULE_ID,
  STATE_VERSION,
  addNote,
  addTask,
  addXp,
  applyDecay,
  cleanPet,
  cleanState,
  createBrainSnapshot,
  feed,
  getMood,
  giveMedicine,
  importLegacyBuddyUi,
  maybeNudge,
  nap,
  openBrain,
  pet,
  play,
  register,
  startOver,
  resolveStage,
  toggleTask,
  trainTrait,
  updatePinned,
  updateProfile,
} from "./index.js";

const HOUR = 3_600_000;

function createContext(now = 100_000) {
  const storage = new Map();
  const commands = new Map();
  const speech = [];
  const reactions = [];
  const bubbles = [];
  const panels = [];
  const schedules = new Map();
  const ctx = {
    storage: {
      async get(key) { return storage.get(key); },
      async set(key, value) { storage.set(key, structuredClone(value)); },
    },
    config: {
      async get() { return { showStats: false, classicLifecycle: false }; },
      onChange() {},
    },
    commands: {
      async register(meta, handler) { commands.set(meta.id, { meta, handler }); },
      async unregister(id) { commands.delete(id); },
    },
    schedule: {
      async cancel(id) { schedules.delete(id); },
      async once(id, delay, handler) { schedules.set(id, { delay, handler }); },
    },
    events: { on() {} },
    assets: { icon(name) { return { kind: "icon", name }; } },
    pet: {
      async speak(text) { speech.push(text); },
      async react(reaction) { reactions.push(reaction); },
    },
    audio: { async play() {} },
    ui: {
      async bubble(spec) {
        const handle = {
          id: `bubble-${bubbles.length + 1}`,
          spec,
          async update(next) { this.spec = { ...this.spec, ...next }; },
          async dismiss() {},
          onDismiss() {},
        };
        bubbles.push(handle);
        return handle;
      },
      async panel(spec) {
        const panel = {
          id: `panel-${panels.length + 1}`,
          spec,
          messages: [],
          handler: null,
          async show() {},
          async hide() {},
          async close() {},
          async postMessage(message) { this.messages.push(structuredClone(message)); },
          onMessage(handler) { this.handler = handler; },
        };
        panels.push(panel);
        return panel;
      },
    },
    t(key) { return key; },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  };
  return { ctx, storage, commands, speech, reactions, bubbles, panels, schedules, now };
}

// Existing v2 saves migrate in place and gain durable brain defaults.
{
  const state = cleanState({
    version: 2,
    hunger: 20,
    energy: 30,
    happiness: 40,
    affection: 60,
    health: 70,
    level: 3,
    xp: 12,
    careCounts: { fed: 5 },
  });
  assert.equal(state.version, STATE_VERSION);
  assert.equal(state.hunger, 20);
  assert.equal(state.level, 3);
  assert.equal(state.careCounts.fed, 5);
  assert.equal(state.brain.schema, "pocket-buddy-brain-v1");
  assert.deepEqual(state.brain.personality, DEFAULT_PERSONALITY);
  assert.equal(state.brain.relationship.affection, 0.6);
  assert.equal(state.brain.drives.hunger, 0.8);
  assert.equal(state.brain.drives.energy, 0.7);
  assert.equal(state.brain.drives.boredom, 0.6);
  assert.equal(state.brain.stats.level, 3);
  assert.equal(state.brain.stats.experience, 12);
}

// Donor-aligned lifecycle behavior remains intact.
{
  assert.equal(getMood(cleanState({ deadAt: 100 }), 1_000), "dead");
  assert.equal(getMood(cleanState({ isSick: true }), 1_000), "sick");
  assert.equal(getMood(cleanState({ hunger: 20 }), 1_000), "hungry");
  const level = addXp({ xp: 45, level: 1 }, 10);
  assert.deepEqual(level, { xp: 5, level: 2, leveledUp: true });
  const bornAt = 10 * 24 * HOUR;
  assert.equal(resolveStage(cleanState({ bornAt, level: 3 }), bornAt + HOUR), "growing");
  const decayed = applyDecay(cleanState({ hunger: 80, energy: 80, happiness: 80, affection: 50, lastSeenAt: 1_000 }), 2 * HOUR, 1_000 + 2 * HOUR);
  assert.equal(decayed.hunger, 76);
  assert.equal(decayed.energy, 74);
  assert.equal(decayed.happiness, 76);
  assert.equal(decayed.affection, 48);
  assert.equal(decayed.brain.relationship.affection, 0.48);
}

// Care actions update both lifecycle and brain history.
{
  const h = createContext();
  await h.ctx.storage.set("state", cleanState({ lastSeenAt: h.now, bornAt: h.now }));
  const fed = await feed(h.ctx, h.now + 1);
  assert.equal(fed.hunger, 100);
  assert.equal(fed.xp, 5);
  assert.equal(fed.careCounts.fed, 1);
  assert.equal(fed.brain.actionCounts.feed, 1);
  assert.equal(fed.brain.lastActions.at(-1), "feed");

  const petted = await pet(h.ctx, h.now + 2);
  assert.equal(petted.careCounts.petted, 1);
  assert.ok(petted.brain.relationship.trust > fed.brain.relationship.trust);
  assert.equal(petted.brain.lastActions.at(-1), "pet");
}

// Legacy renderer state imports once, maps needs, and preserves plugin lifecycle.
{
  const h = createContext(200_000);
  await h.ctx.storage.set("state", cleanState({ hunger: 55, health: 88, lastSeenAt: h.now, bornAt: 10 }));
  const payload = {
    version: 1,
    buddy: {
      displayName: "Pixel",
      createdAtMs: 5,
      affection: 0.73,
      needs: { hunger: 0.2, energy: 0.4, play: 0.1, cleanliness: 0.6 },
    },
    notes: ["remember this"],
    tasks: [{ id: "a", text: "ship plugin", completed: false }],
    messages: [{ role: "user", text: "hello", at: 10 }],
    careCounts: { pet: 7, feed: 3, play: 2, rest: 1, clean: 4 },
    wardrobe: "blue-scarf",
  };
  const migrated = await importLegacyBuddyUi(h.ctx, payload, h.now);
  assert.equal(migrated.brain.displayName, "Pixel");
  assert.equal(migrated.affection, 73);
  assert.equal(migrated.hunger, 80);
  assert.equal(migrated.energy, 60);
  assert.equal(migrated.happiness, 90);
  assert.equal(migrated.mess, 3);
  assert.deepEqual(migrated.brain.notes, ["remember this"]);
  assert.equal(migrated.brain.tasks[0].text, "ship plugin");
  assert.equal(migrated.brain.customization.wardrobe, "blue-scarf");
  assert.equal(migrated.careCounts.petted, 7);
  assert.ok(migrated.brain.legacyUiMigratedAt > 0);

  const second = await importLegacyBuddyUi(h.ctx, { buddy: { displayName: "Overwrite" } }, h.now + 1);
  assert.equal(second.brain.displayName, "Pixel", "legacy migration is idempotent");
}

// Profile, memory, tasks, and training live in the same state.
{
  const h = createContext(300_000);
  await h.ctx.storage.set("state", cleanState({ lastSeenAt: h.now, bornAt: h.now }));
  await updateProfile(h.ctx, { displayName: "Nova", wardrobe: "gold-star" }, h.now + 1);
  await addNote(h.ctx, "first memory", h.now + 2);
  await addTask(h.ctx, "finish the brain", h.now + 3);
  const taskId = cleanState(await h.ctx.storage.get("state")).brain.tasks[0].id;
  await toggleTask(h.ctx, taskId, h.now + 4);
  const before = cleanState(await h.ctx.storage.get("state"));
  const trained = await trainTrait(h.ctx, "curiosity", h.now + 5);
  assert.equal(trained.brain.displayName, "Nova");
  assert.equal(trained.brain.customization.wardrobe, "gold-star");
  assert.deepEqual(trained.brain.notes, ["first memory"]);
  assert.equal(trained.brain.tasks[0].completed, true);
  assert.equal(trained.brain.personality.curiosity, before.brain.personality.curiosity + 0.01);
  assert.equal(trained.brain.trainingCounts.curiosity, 1);
  assert.equal(trained.brain.stats.skillPoints, 1);
}

// The Brain panel is the management UI for the canonical state.
{
  const h = createContext(400_000);
  await h.ctx.storage.set("state", cleanState({ lastSeenAt: h.now, bornAt: h.now }));
  const panel = await openBrain(h.ctx);
  assert.equal(panel.spec.panel, PANEL_NAME);
  assert.ok(panel.messages.some((message) => message.type === "brain-state"));
  await panel.handler({ type: "profile-update", displayName: "Panel Buddy", wardrobe: "night-cap" });
  const snapshot = createBrainSnapshot(await h.ctx.storage.get("state"));
  assert.equal(snapshot.displayName, "Panel Buddy");
  assert.equal(snapshot.brain.customization.wardrobe, "night-cap");
  await panel.handler({ type: "care", action: "pet" });
  assert.equal(cleanState(await h.ctx.storage.get("state")).careCounts.petted, 1);
}

// Registration exposes one product plugin with brain and care commands.
{
  const h = createContext(500_000);
  let definition = null;
  register({ register(value) { definition = value; } });
  assert.ok(definition);
  await definition.start(h.ctx);
  assert.ok(h.commands.has("open-brain"));
  assert.ok(h.commands.has("import-legacy-buddy-ui"));
  assert.ok(h.commands.has("feed"));
  assert.ok(h.commands.has("medicine"));
  assert.ok(h.schedules.has(SCHEDULE_ID));
  await definition.stop(h.ctx);
}


// --- Behaviours carried over from the pre-unification suite -----------------
// These four were covered on main before the Buddy Brain merge replaced this
// file. They are re-expressed against the unified state rather than reverted,
// because the old suite drove a createTestHarness API this plugin no longer has.

// Activity wakes a sleeping pet.
{
  const h = createContext(103_000_000_000);
  await h.ctx.storage.set("state", cleanState({ lastSeenAt: h.now, bornAt: h.now }));
  const napped = await nap(h.ctx, h.now);
  assert.ok(napped.sleptUntil > h.now, "nap should set a wake time");
  const played = await play(h.ctx, h.now + 1_000);
  assert.equal(played.sleptUntil, 0, "activity should wake a sleeping pet");
}

// Dirty and sick states expose health in the HUD, block strenuous actions,
// and require two medicine doses.
{
  const now = 105_000_000_000;
  const h = createContext(now);
  // The shared harness hides stats, which suppresses the HUD entirely.
  h.ctx.config.get = async () => ({ showStats: true, classicLifecycle: false });
  await h.ctx.storage.set("state", cleanState({
    hunger: 40, energy: 40, happiness: 40, health: 60, mess: 4,
    isSick: true, sickSince: now - HOUR, lastSeenAt: now, bornAt: now - HOUR,
  }));

  await updatePinned(h.ctx, cleanState(await h.ctx.storage.get("state")));
  const hud = h.bubbles.at(-1).spec.hud;
  assert.equal(hud.items[3].label, "hud.health", "an unwell pet shows health, not bond");
  assert.equal(hud.items[3].value, 60);

  const blocked = await feed(h.ctx, now + 1);
  assert.equal(blocked.careCounts.fed, 0, "feeding is blocked while sick");
  assert.ok(h.speech.includes("speech.blocked.sick"));

  const cleaned = await cleanPet(h.ctx, now + 2);
  assert.equal(cleaned.mess, 0);
  assert.equal(cleaned.careCounts.cleaned, 1);
  assert.equal(cleaned.health, 70);

  const firstDose = await giveMedicine(h.ctx, now + 3);
  assert.equal(firstDose.isSick, true, "one dose is not a cure");
  assert.equal(firstDose.medicineDoses, 1);
  const secondDose = await giveMedicine(h.ctx, now + 4);
  assert.equal(secondDose.isSick, false);
  assert.equal(secondDose.medicineDoses, 0);
  assert.equal(secondDose.careCounts.medicated, 2);
  assert.ok(h.speech.includes("speech.medicine.cured"));
}

// Classic lifecycle death is reversible only through the explicit new-life command.
{
  const now = 106_000_000_000;
  const h = createContext(now);
  h.ctx.config.get = async () => ({ showStats: false, classicLifecycle: true });
  await h.ctx.storage.set("state", cleanState({
    deadAt: now - HOUR, deathReason: "neglect", lastSeenAt: now, bornAt: now - 2 * HOUR,
  }));

  const petted = await pet(h.ctx, now + 1);
  assert.ok(petted.deadAt > 0, "care cannot revive a dead pet");
  assert.equal(petted.careCounts.petted, 0);

  const fresh = await startOver(h.ctx, now + 2);
  assert.equal(fresh.deadAt, 0);
  assert.equal(fresh.bornAt, now + 2);
  assert.equal(fresh.careCounts.restarted, 1);
  assert.equal(fresh.health, 100);

  // "only through the new-life command" cuts both ways: on a LIVING pet the
  // command must refuse, or it becomes an accidental progress wipe.
  const survivor = await startOver(h.ctx, now + 3);
  assert.equal(survivor.bornAt, now + 2, "start-over must not restart a living pet");
  assert.equal(survivor.careCounts.restarted, 1, "restart count must not climb");
  assert.ok(h.speech.includes("speech.restart.notNeeded"));
}

// Nudges are prioritized and cooldown-protected.
{
  const now = 107_000_000_000;
  const h = createContext(now);
  // Sick outranks hungry even though both thresholds are met.
  await maybeNudge(h.ctx, cleanState({ isSick: true, hunger: 10, lastNudgeAt: 0 }), now);
  assert.equal(h.speech.at(-1), "nudge.sick");

  const nudged = cleanState(await h.ctx.storage.get("state"));
  assert.equal(nudged.lastNudgeAt, now);

  const before = h.speech.length;
  await maybeNudge(h.ctx, nudged, now + 60_000);
  assert.equal(h.speech.length, before, "nudges must not spam inside the cooldown");

  await maybeNudge(h.ctx, nudged, now + 7 * HOUR);
  assert.equal(h.speech.length, before + 1, "nudges resume once the cooldown lapses");
}

console.log("openpets.virtual-pet / Buddy Brain: all checks passed.");
