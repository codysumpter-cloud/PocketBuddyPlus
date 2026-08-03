/**
 * Donor-contract tests for the BuddyCreatureState and BuddyMoodModel ports.
 *
 * IMPORTANT SCOPE NOTE: these are transcribed from the donor GDScript, not from
 * the TypeScript, so they catch drift from the recorded contract. They are NOT
 * cross-runtime parity -- unlike the chemical pool, these subsystems do not yet
 * have a live Godot oracle, so a translation error that is *consistent* with my
 * reading of the donor would survive. The port matrix records this distinction.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BuddyCreatureState, CREATURE_SCHEMA, DEFAULT_RELATIONSHIP, DEFAULT_STATS, safeBuddyId, } from "../src/creature-state.js";
import { evaluateMood, moodLabel } from "../src/mood-model.js";
test("schema id and defaults match the donor exactly", () => {
    assert.equal(CREATURE_SCHEMA, "prismtek-buddy-creature-v1");
    assert.deepEqual({ ...DEFAULT_RELATIONSHIP }, { affection: 0.5, trust: 0.5, familiarity: 0.1, respect: 0.4 });
    assert.equal(DEFAULT_STATS.level, 1);
    assert.equal(DEFAULT_STATS.health, 10);
    assert.equal(DEFAULT_STATS.max_stamina, 10);
    assert.equal(DEFAULT_STATS.rerolls, 1);
    assert.equal(DEFAULT_STATS.focus, 1);
});
test("a fresh creature carries donor defaults", () => {
    const state = new BuddyCreatureState(1000, "pip");
    assert.equal(state.displayName, "Buddy");
    assert.equal(state.evolutionStage, "base");
    assert.equal(state.relationshipValue("affection"), 0.5);
    assert.equal(state.relationshipValue("familiarity"), 0.1);
    assert.equal(state.mood.label, "content");
});
test("unknown relationship keys read 0.0 and are not writable", () => {
    // Donor `relationship_value` falls back to 0.0, and `adjust_relationship`
    // ignores unknown keys WITHOUT bumping the revision.
    const state = new BuddyCreatureState(0, "x");
    assert.equal(state.relationshipValue("nope"), 0);
    const revision = state.revision;
    state.adjustRelationship("nope", 0.5);
    assert.equal(state.revision, revision, "unknown key must not bump revision");
    assert.equal(state.relationshipValue("nope"), 0);
});
test("known relationship adjustments clamp and bump the revision", () => {
    const state = new BuddyCreatureState(0, "x");
    state.adjustRelationship("affection", 0.25);
    assert.ok(Math.abs(state.relationshipValue("affection") - 0.75) < 1e-12);
    assert.equal(state.revision, 1);
    state.adjustRelationship("affection", 5);
    assert.equal(state.relationshipValue("affection"), 1);
    state.adjustRelationship("affection", -5);
    assert.equal(state.relationshipValue("affection"), 0);
    assert.equal(state.revision, 3);
});
test("action memory keeps a FIFO window but counts every occurrence", () => {
    const state = new BuddyCreatureState(0, "x");
    for (let i = 0; i < 12; i += 1)
        state.rememberAction(`act_${i % 3}`);
    assert.equal(state.lastActions.length, 8, "donor window is 8");
    assert.equal(state.actionCounts.act_0, 4, "counts are lifetime, not windowed");
    state.rememberAction("");
    assert.equal(state.lastActions.length, 8, "empty action id is ignored");
});
test("working memory is bounded and stores copies", () => {
    const state = new BuddyCreatureState(0, "x");
    const entry = { note: "a" };
    state.addWorkingMemory(entry);
    entry.note = "mutated";
    assert.equal(state.workingMemory[0].note, "a", "must store a copy");
    for (let i = 0; i < 20; i += 1)
        state.addWorkingMemory({ i });
    assert.equal(state.workingMemory.length, 16, "donor maximum is 16");
});
test("id and display name are normalized like the donor", () => {
    assert.equal(safeBuddyId("Weird ID!!"), "weirdid");
    const state = new BuddyCreatureState(0, "x");
    state.buddyId = "  Weird ID!! ";
    state.displayName = "   ";
    state.ensureDefaults();
    assert.equal(state.buddyId, "weirdid");
    assert.equal(state.displayName, "Buddy", "blank name falls back");
    state.displayName = "y".repeat(200);
    state.ensureDefaults();
    assert.equal(state.displayName.length, 64, "donor truncates at 64");
});
// --- Mood model --------------------------------------------------------------
test("mood label rules are order-sensitive and match the donor", () => {
    assert.equal(moodLabel(0.2, 0.7, 0.5), "distressed");
    assert.equal(moodLabel(0.3, 0.5, 0.3), "sad");
    assert.equal(moodLabel(0.6, 0.8, 0.5), "excited");
    assert.equal(moodLabel(0.6, 0.5, 0.8), "confident");
    assert.equal(moodLabel(0.6, 0.2, 0.5), "calm");
    assert.equal(moodLabel(0.7, 0.6, 0.5), "happy");
    assert.equal(moodLabel(0.5, 0.6, 0.5), "alert");
    assert.equal(moodLabel(0.5, 0.4, 0.5), "content");
    // "distressed" must win over "sad" when both would match.
    assert.equal(moodLabel(0.25, 0.7, 0.3), "distressed");
});
test("mood is computed from the donor's exact weights", () => {
    const state = new BuddyCreatureState(0, "x");
    for (const key of ["hunger", "energy", "comfort", "safety", "boredom", "curiosity", "affection", "social", "accomplishment", "cleanliness", "focus"]) {
        state.drives.setPressure(key, 0);
    }
    const mood = evaluateMood(state, 1234);
    // pressure=0, support=(0.5+0.5)/2=0.5, accomplishment=1, safety=1
    // valence = 1*0.55 + 0.5*0.25 + 1*0.20 = 0.875
    assert.ok(Math.abs(mood.valence - 0.875) < 1e-9, `valence ${mood.valence}`);
    // arousal = 0 + 0 + 0 + playfulness(0.60)*0.15 = 0.09
    assert.ok(Math.abs(mood.arousal - 0.09) < 1e-9, `arousal ${mood.arousal}`);
    // dominance = 1*0.35 + 0.5*0.20 + 1*0.25 + bravery(0.45)*0.20 = 0.79
    assert.ok(Math.abs(mood.dominance - 0.79) < 1e-9, `dominance ${mood.dominance}`);
    // "confident" (dominance > 0.70 && valence >= 0.50) is evaluated BEFORE
    // "calm" in the donor, so it wins here even though arousal is also < 0.28.
    // My first expectation of "calm" was wrong; the port was right.
    assert.equal(mood.label, "confident");
    assert.equal(mood.evaluated_unix, 1234, "timestamp is injected, not read from the clock");
});
test("evaluate mutates the state's mood, matching the donor contract", () => {
    const state = new BuddyCreatureState(0, "x");
    const returned = evaluateMood(state, 7);
    assert.deepEqual({ ...state.mood }, { ...returned });
});
test("mood is deterministic for identical inputs", () => {
    const a = new BuddyCreatureState(0, "x");
    const b = new BuddyCreatureState(0, "x");
    assert.deepEqual(evaluateMood(a, 1), evaluateMood(b, 1));
});
// --- Serialization -----------------------------------------------------------
test("state round-trips through the donor dictionary shape", () => {
    const state = new BuddyCreatureState(500, "pip");
    state.displayName = "Pip";
    state.currentGoal = "explore";
    state.adjustRelationship("trust", 0.2);
    state.rememberAction("pet");
    state.activeTasks.push("task-1");
    const data = state.toData();
    assert.equal(data.schema, CREATURE_SCHEMA);
    assert.equal(data.buddy_id, "pip");
    assert.equal(data.display_name, "Pip");
    const restored = BuddyCreatureState.fromData(data);
    assert.equal(restored.displayName, "Pip");
    assert.equal(restored.currentGoal, "explore");
    assert.ok(Math.abs(restored.relationshipValue("trust") - 0.7) < 1e-12);
    assert.deepEqual(restored.lastActions, ["pet"]);
    assert.deepEqual(restored.activeTasks, ["task-1"]);
    assert.equal(restored.actionCounts.pet, 1);
});
test("malformed and partial payloads degrade to defaults rather than throwing", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { relationship: "nope", stats: 7, last_actions: "no" }]) {
        const restored = BuddyCreatureState.fromData(bad);
        assert.equal(restored.relationshipValue("affection"), 0.5);
        assert.equal(restored.stats.level, 1);
        assert.deepEqual(restored.lastActions, []);
        assert.ok(restored.buddyId.length > 0, "a usable id is always produced");
    }
});
test("mood.valence retains the donor's [-1,1] storage range", () => {
    // The donor clamps stored valence to [-1,1] even though the model only emits
    // [0,1]. Narrowing that here would silently rewrite existing saves.
    const restored = BuddyCreatureState.fromData({ mood: { label: "sad", valence: -0.8, arousal: 0.5, dominance: 0.5 } });
    assert.equal(restored.mood.valence, -0.8);
});
