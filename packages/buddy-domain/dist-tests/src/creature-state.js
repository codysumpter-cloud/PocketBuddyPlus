/**
 * Parity port of BuddyCreatureState.
 *
 * Donor: prismtek-apps/packages/godot/prismtek-buddy-core/addons/
 *        prismtek_buddy_core/creature/buddy_creature_state.gd
 * Licence: Prismtek Source Available (first-party; reuse authorised by the owner).
 *
 * Durable identity and simulation state. Per the donor's own note, provider and
 * model data are deliberately absent: a model can be replaced without replacing
 * the Buddy's identity, relationships, learned habits, progression or history.
 *
 * DEFAULT_STATS carries the derived combat/progression pools whose arithmetic
 * follows Pigeon Ascent (MIT, (c) 2020 Guilherme Rodrigues Ribeiro, Rafael
 * Pimentel da Silva) via the donor's progression model. See THIRD_PARTY_NOTICES.
 */
import { BuddyDriveSet } from "./drive-set.js";
import { BuddyPersonalityProfile } from "./personality.js";
export const CREATURE_SCHEMA = "prismtek-buddy-creature-v1";
export const ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789_-";
export const DEFAULT_RELATIONSHIP = Object.freeze({
    affection: 0.5,
    trust: 0.5,
    familiarity: 0.1,
    respect: 0.4,
});
export const DEFAULT_STATS = Object.freeze({
    level: 1,
    experience: 0,
    skill_points: 0,
    rerolls: 1,
    health: 10.0,
    max_health: 10.0,
    stamina: 10.0,
    max_stamina: 10.0,
    strength: 1.0,
    defense: 1.0,
    speed: 1.0,
    focus: 1.0,
});
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.min(max, Math.max(min, value));
}
/** Donor `_safe_id`: keep only characters from the allowed alphabet. */
export function safeBuddyId(value) {
    return [...String(value ?? "").toLowerCase()].filter((ch) => ID_CHARACTERS.includes(ch)).join("");
}
export class BuddyCreatureState {
    buddyId = "";
    displayName = "Buddy";
    createdUnix = 0;
    revision = 0;
    currentIntent = "";
    currentGoal = "";
    evolutionStage = "base";
    drives = new BuddyDriveSet();
    personality = new BuddyPersonalityProfile();
    relationship = {};
    stats = {};
    learnedAssociations = {};
    actionCounts = {};
    cooldownUntilUnix = {};
    lastActions = [];
    workingMemory = [];
    episodicMemoryRefs = [];
    activeTasks = [];
    inventory = {};
    customization = {};
    flags = {};
    mood = { label: "content", valence: 0.5, arousal: 0.3, dominance: 0.5 };
    constructor(nowUnix = 0, idSeed = "") {
        if (this.createdUnix <= 0)
            this.createdUnix = nowUnix;
        if (!this.buddyId)
            this.buddyId = idSeed || "buddy";
        this.ensureDefaults();
    }
    /**
     * Donor `ensure_defaults`. Order matters and is preserved: relationships and
     * stats are filled, mood is coerced, then the id and name are normalized.
     *
     * Note the donor's asymmetry, kept deliberately: relationship values clamp to
     * [0,1] but mood.valence clamps to [-1,1] even though the mood model only ever
     * produces [0,1]. Narrowing that here would silently change stored data.
     */
    ensureDefaults() {
        this.drives.ensureDefaults();
        this.personality.ensureDefaults();
        for (const key of Object.keys(DEFAULT_RELATIONSHIP)) {
            if (!(key in this.relationship))
                this.relationship[key] = DEFAULT_RELATIONSHIP[key];
            this.relationship[key] = clamp(Number(this.relationship[key]), 0, 1);
        }
        for (const key of Object.keys(DEFAULT_STATS)) {
            if (!(key in this.stats))
                this.stats[key] = DEFAULT_STATS[key];
        }
        const mood = (typeof this.mood === "object" && this.mood !== null ? this.mood : {});
        this.mood = {
            label: String(mood.label ?? "content"),
            valence: clamp(Number(mood.valence ?? 0.5), -1, 1),
            arousal: clamp(Number(mood.arousal ?? 0.3), 0, 1),
            dominance: clamp(Number(mood.dominance ?? 0.5), 0, 1),
            ...(mood.evaluated_unix === undefined ? {} : { evaluated_unix: Number(mood.evaluated_unix) }),
        };
        this.buddyId = safeBuddyId(this.buddyId);
        if (!this.buddyId)
            this.buddyId = "buddy";
        this.displayName = String(this.displayName ?? "").trim().slice(0, 64);
        if (!this.displayName)
            this.displayName = "Buddy";
    }
    /** Donor `relationship_value`: unknown keys read 0.0, not a neutral default. */
    relationshipValue(key) {
        this.ensureDefaults();
        return Number(this.relationship[key] ?? 0);
    }
    /** Donor `adjust_relationship`: unknown keys are ignored and do NOT bump revision. */
    adjustRelationship(key, delta) {
        if (!(key in DEFAULT_RELATIONSHIP))
            return;
        this.relationship[key] = clamp(this.relationshipValue(key) + delta, 0, 1);
        this.revision += 1;
    }
    /** Donor `remember_action`: FIFO window, plus a lifetime counter that never trims. */
    rememberAction(actionId, maximum = 8) {
        if (!actionId)
            return;
        this.lastActions.push(actionId);
        while (this.lastActions.length > maximum)
            this.lastActions.shift();
        this.actionCounts[actionId] = Number(this.actionCounts[actionId] ?? 0) + 1;
    }
    addWorkingMemory(entry, maximum = 16) {
        this.workingMemory.push(structuredClone(entry));
        while (this.workingMemory.length > maximum)
            this.workingMemory.shift();
    }
    toData() {
        this.ensureDefaults();
        return {
            schema: CREATURE_SCHEMA,
            buddy_id: this.buddyId,
            display_name: this.displayName,
            created_unix: this.createdUnix,
            revision: this.revision,
            current_intent: this.currentIntent,
            current_goal: this.currentGoal,
            evolution_stage: this.evolutionStage,
            drives: this.drives.toData(),
            personality: { traits: this.personality.toData() },
            relationship: { ...this.relationship },
            stats: { ...this.stats },
            learned_associations: structuredClone(this.learnedAssociations),
            action_counts: { ...this.actionCounts },
            cooldown_until_unix: { ...this.cooldownUntilUnix },
            last_actions: [...this.lastActions],
            working_memory: structuredClone(this.workingMemory),
            episodic_memory_refs: [...this.episodicMemoryRefs],
            active_tasks: [...this.activeTasks],
            inventory: structuredClone(this.inventory),
            customization: structuredClone(this.customization),
            flags: structuredClone(this.flags),
            mood: { ...this.mood },
        };
    }
    /** Malformed or partial payloads degrade to defaults rather than throwing. */
    static fromData(data, nowUnix = 0) {
        const state = new BuddyCreatureState(nowUnix);
        if (typeof data !== "object" || data === null)
            return state;
        const record = data;
        const str = (key, fallback) => (typeof record[key] === "string" ? record[key] : fallback);
        const num = (key, fallback) => (typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] : fallback);
        const obj = (key) => (typeof record[key] === "object" && record[key] !== null && !Array.isArray(record[key]) ? record[key] : {});
        const arr = (key) => (Array.isArray(record[key]) ? record[key] : []);
        state.buddyId = str("buddy_id", state.buddyId);
        state.displayName = str("display_name", state.displayName);
        state.createdUnix = num("created_unix", state.createdUnix);
        state.revision = num("revision", 0);
        state.currentIntent = str("current_intent", "");
        state.currentGoal = str("current_goal", "");
        state.evolutionStage = str("evolution_stage", "base");
        state.drives = BuddyDriveSet.fromData(record.drives);
        state.personality = BuddyPersonalityProfile.fromData(record.personality);
        state.relationship = Object.fromEntries(Object.entries(obj("relationship")).filter(([, v]) => typeof v === "number"));
        state.stats = Object.fromEntries(Object.entries(obj("stats")).filter(([, v]) => typeof v === "number"));
        state.learnedAssociations = obj("learned_associations");
        state.actionCounts = Object.fromEntries(Object.entries(obj("action_counts")).filter(([, v]) => typeof v === "number"));
        state.cooldownUntilUnix = Object.fromEntries(Object.entries(obj("cooldown_until_unix")).filter(([, v]) => typeof v === "number"));
        state.lastActions = arr("last_actions").filter((v) => typeof v === "string");
        state.workingMemory = arr("working_memory").filter((v) => typeof v === "object" && v !== null);
        state.episodicMemoryRefs = arr("episodic_memory_refs").filter((v) => typeof v === "string");
        state.activeTasks = arr("active_tasks").filter((v) => typeof v === "string");
        state.inventory = obj("inventory");
        state.customization = obj("customization");
        state.flags = obj("flags");
        if (typeof record.mood === "object" && record.mood !== null)
            state.mood = record.mood;
        state.ensureDefaults();
        return state;
    }
}
