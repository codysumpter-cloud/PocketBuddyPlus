import {
  BUDDY_STATE_SCHEMA_VERSION,
  advanceBuddyState,
  createBuddySnapshot,
  createBuddyState,
  deriveBuddyMood,
  selectDominantNeed,
  type BuddyActivity,
  type BuddyCareAction,
  type BuddyMood,
  type BuddyNeedId,
  type BuddyNeedPressures,
  type BuddyState,
} from "./buddy-core.js";

export const BUDDY_PROFILE_SCHEMA_VERSION = 1 as const;
export const buddyWardrobes = ["classic", "gold-star", "blue-scarf", "night-cap"] as const;
export type BuddyWardrobe = typeof buddyWardrobes[number];

export interface BuddyPublicProfile {
  readonly schemaVersion: typeof BUDDY_PROFILE_SCHEMA_VERSION;
  readonly id: string;
  readonly displayName: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly ageMs: number;
  readonly affection: number;
  /** Need pressure values: 0 means satisfied, 1 means urgent. */
  readonly needs: BuddyNeedPressures;
  readonly mood: BuddyMood;
  readonly activity: BuddyActivity;
  readonly dominantNeed: BuddyNeedId;
  readonly lastCareAction?: BuddyCareAction;
  readonly wardrobe: BuddyWardrobe;
}

export interface BuddyProfileCandidate {
  readonly buddy: unknown;
  readonly wardrobe?: unknown;
}

const buddyActivities = new Set<BuddyActivity>(["idle", "exploring", "sleeping", "eating", "playing", "socializing", "grooming"]);
const buddyCareActions = new Set<BuddyCareAction>(["pet", "feed", "play", "rest", "clean"]);
const buddyNeedIds = ["hunger", "energy", "social", "play", "comfort", "cleanliness"] as const satisfies readonly BuddyNeedId[];
const idPattern = /^[A-Za-z0-9._:-]{1,80}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be a finite number between ${min} and ${max}.`);
  }
  return value;
}

function parseId(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw new Error("Buddy id is invalid.");
  return value;
}

function parseDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Buddy display name is invalid.");
  const normalized = value.trim();
  if (!normalized || normalized.length > 40 || /[\0-\x1F\x7F]/u.test(normalized)) throw new Error("Buddy display name is invalid.");
  return normalized;
}

function parseNeeds(value: unknown): BuddyNeedPressures {
  if (!isRecord(value)) throw new Error("Buddy needs are invalid.");
  return Object.fromEntries(buddyNeedIds.map((need) => [need, finiteNumber(value[need], `Buddy need ${need}`, 0, 1)])) as Record<BuddyNeedId, number>;
}

function parseWardrobe(value: unknown): BuddyWardrobe {
  return buddyWardrobes.includes(value as BuddyWardrobe) ? value as BuddyWardrobe : "classic";
}

export function profileFromBuddyState(state: BuddyState, wardrobe: BuddyWardrobe = "classic"): BuddyPublicProfile {
  const snapshot = createBuddySnapshot(state);
  return {
    schemaVersion: BUDDY_PROFILE_SCHEMA_VERSION,
    id: state.id,
    displayName: state.displayName,
    createdAtMs: state.createdAtMs,
    updatedAtMs: state.updatedAtMs,
    ageMs: state.ageMs,
    affection: state.affection,
    needs: { ...state.needs },
    mood: state.mood,
    activity: state.activity,
    dominantNeed: snapshot.dominantNeed,
    ...(state.lastCareAction ? { lastCareAction: state.lastCareAction } : {}),
    wardrobe,
  };
}

export function buddyStateFromProfile(profile: BuddyPublicProfile): BuddyState {
  return {
    schemaVersion: BUDDY_STATE_SCHEMA_VERSION,
    id: profile.id,
    displayName: profile.displayName,
    createdAtMs: profile.createdAtMs,
    updatedAtMs: profile.updatedAtMs,
    ageMs: profile.ageMs,
    affection: profile.affection,
    needs: { ...profile.needs },
    mood: profile.mood,
    activity: profile.activity,
    ...(profile.lastCareAction ? { lastCareAction: profile.lastCareAction } : {}),
  };
}

export function createDefaultBuddyProfile(nowMs = Date.now()): BuddyPublicProfile {
  return profileFromBuddyState(createBuddyState({ id: "primary-buddy", displayName: "Buddy", nowMs, affection: 0.18 }));
}

/**
 * Accepts either the persisted public profile or the renderer's legacy
 * `{ buddy, wardrobe }` shape. All derived fields are recalculated so callers
 * cannot forge mood or dominant-need values.
 */
export function parseBuddyProfileCandidate(value: unknown): BuddyPublicProfile {
  if (!isRecord(value)) throw new Error("Buddy profile must be an object.");
  const source = isRecord(value.buddy) ? value.buddy : value;
  const wardrobe = parseWardrobe(value.wardrobe ?? source.wardrobe);
  if (source.schemaVersion !== BUDDY_STATE_SCHEMA_VERSION && source.schemaVersion !== BUDDY_PROFILE_SCHEMA_VERSION) {
    throw new Error("Buddy profile schema version is unsupported.");
  }

  const id = parseId(source.id);
  const displayName = parseDisplayName(source.displayName);
  const createdAtMs = finiteNumber(source.createdAtMs, "Buddy createdAtMs");
  const updatedAtMs = finiteNumber(source.updatedAtMs, "Buddy updatedAtMs");
  if (updatedAtMs < createdAtMs) throw new Error("Buddy updatedAtMs cannot precede createdAtMs.");
  const ageMs = finiteNumber(source.ageMs, "Buddy ageMs");
  const affection = finiteNumber(source.affection, "Buddy affection", 0, 1);
  const needs = parseNeeds(source.needs);
  const activity = source.activity as BuddyActivity;
  if (!buddyActivities.has(activity)) throw new Error("Buddy activity is invalid.");
  const lastCareAction = source.lastCareAction as BuddyCareAction | undefined;
  if (lastCareAction !== undefined && !buddyCareActions.has(lastCareAction)) throw new Error("Buddy last care action is invalid.");

  const state: BuddyState = {
    schemaVersion: BUDDY_STATE_SCHEMA_VERSION,
    id,
    displayName,
    createdAtMs,
    updatedAtMs,
    ageMs,
    affection,
    needs,
    mood: deriveBuddyMood(needs),
    activity,
    ...(lastCareAction ? { lastCareAction } : {}),
  };
  return profileFromBuddyState(state, wardrobe);
}

export function advanceBuddyProfile(profile: BuddyPublicProfile, nowMs = Date.now()): BuddyPublicProfile {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error("nowMs must be a finite non-negative number.");
  if (nowMs <= profile.updatedAtMs) return profile;
  return profileFromBuddyState(advanceBuddyState(buddyStateFromProfile(profile), nowMs - profile.updatedAtMs), profile.wardrobe);
}

export function toBuddyUiCandidate(profile: BuddyPublicProfile): { buddy: BuddyState; wardrobe: BuddyWardrobe } {
  return { buddy: buddyStateFromProfile(profile), wardrobe: profile.wardrobe };
}

export function buddyProfilesMateriallyEqual(left: BuddyPublicProfile, right: BuddyPublicProfile, timeToleranceMs = 2_000): boolean {
  if (left.id !== right.id || left.displayName !== right.displayName || left.wardrobe !== right.wardrobe) return false;
  if (left.activity !== right.activity || left.mood !== right.mood || left.lastCareAction !== right.lastCareAction) return false;
  if (Math.abs(left.affection - right.affection) > 0.000001) return false;
  if (Math.abs(left.updatedAtMs - right.updatedAtMs) > timeToleranceMs || Math.abs(left.ageMs - right.ageMs) > timeToleranceMs) return false;
  return buddyNeedIds.every((need) => Math.abs(left.needs[need] - right.needs[need]) <= 0.0001)
    && left.dominantNeed === selectDominantNeed(left.needs)
    && right.dominantNeed === selectDominantNeed(right.needs);
}
