export const BUDDY_STATE_SCHEMA_VERSION = 1 as const;

export const buddyNeedOrder = [
  "hunger",
  "energy",
  "social",
  "play",
  "comfort",
  "cleanliness",
] as const;

export type BuddyNeedId = typeof buddyNeedOrder[number];
export type BuddyMood = "content" | "curious" | "playful" | "hungry" | "tired" | "lonely" | "uncomfortable";
export type BuddyActivity = "idle" | "exploring" | "sleeping" | "eating" | "playing" | "socializing" | "grooming";
export type BuddyCareAction = "pet" | "feed" | "play" | "rest" | "clean";

export type BuddyNeedPressures = Readonly<Record<BuddyNeedId, number>>;

export interface BuddyState {
  readonly schemaVersion: typeof BUDDY_STATE_SCHEMA_VERSION;
  readonly id: string;
  readonly displayName: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly ageMs: number;
  readonly affection: number;
  readonly needs: BuddyNeedPressures;
  readonly mood: BuddyMood;
  readonly activity: BuddyActivity;
  readonly lastCareAction?: BuddyCareAction;
}

export interface CreateBuddyStateInput {
  readonly id: string;
  readonly displayName?: string;
  readonly nowMs?: number;
  readonly affection?: number;
  readonly needs?: Partial<Record<BuddyNeedId, number>>;
}

export interface BuddyDriveSnapshot {
  readonly id: BuddyNeedId;
  readonly label: string;
  readonly value: number;
}

export interface BuddySnapshot {
  readonly id: string;
  readonly name: string;
  readonly mood: BuddyMood;
  readonly activity: BuddyActivity;
  readonly ageMs: number;
  readonly affection: number;
  readonly dominantNeed: BuddyNeedId;
  readonly drives: readonly BuddyDriveSnapshot[];
}

const needLabels: Readonly<Record<BuddyNeedId, string>> = {
  hunger: "Hunger",
  energy: "Rest",
  social: "Company",
  play: "Play",
  comfort: "Comfort",
  cleanliness: "Cleanliness",
};

const basePressurePerHour: Readonly<Record<BuddyNeedId, number>> = {
  hunger: 0.045,
  energy: 0.03,
  social: 0.025,
  play: 0.02,
  comfort: 0.012,
  cleanliness: 0.014,
};

const defaultNeeds: BuddyNeedPressures = {
  hunger: 0.18,
  energy: 0.12,
  social: 0.16,
  play: 0.2,
  comfort: 0.08,
  cleanliness: 0.06,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must not be empty`);
  return normalized;
}

function requireTimestamp(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
  return value;
}

function normalizedNeeds(overrides: CreateBuddyStateInput["needs"] = {}): BuddyNeedPressures {
  return Object.fromEntries(
    buddyNeedOrder.map((need) => [need, clamp01(overrides[need] ?? defaultNeeds[need])]),
  ) as Record<BuddyNeedId, number>;
}

export function selectDominantNeed(needs: BuddyNeedPressures): BuddyNeedId {
  return buddyNeedOrder.reduce((current, candidate) => (
    needs[candidate] > needs[current] ? candidate : current
  ), buddyNeedOrder[0]);
}

export function deriveBuddyMood(needs: BuddyNeedPressures): BuddyMood {
  const dominant = selectDominantNeed(needs);
  const pressure = needs[dominant];

  if (pressure < 0.38) return needs.play < 0.18 ? "curious" : "content";
  if (dominant === "hunger") return "hungry";
  if (dominant === "energy") return "tired";
  if (dominant === "social") return "lonely";
  if (dominant === "play") return "playful";
  return "uncomfortable";
}

export function createBuddyState(input: CreateBuddyStateInput): BuddyState {
  const nowMs = requireTimestamp(input.nowMs ?? Date.now(), "nowMs");
  const needs = normalizedNeeds(input.needs);
  return {
    schemaVersion: BUDDY_STATE_SCHEMA_VERSION,
    id: requireNonEmpty(input.id, "id"),
    displayName: requireNonEmpty(input.displayName ?? "Buddy", "displayName"),
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    ageMs: 0,
    affection: clamp01(input.affection ?? 0),
    needs,
    mood: deriveBuddyMood(needs),
    activity: "idle",
  };
}

function pressureDeltaForActivity(activity: BuddyActivity, need: BuddyNeedId): number {
  if (activity === "sleeping" && need === "energy") return -0.18;
  if (activity === "eating" && need === "hunger") return -0.24;
  if (activity === "playing" && need === "play") return -0.2;
  if (activity === "socializing" && need === "social") return -0.16;
  if (activity === "grooming" && need === "cleanliness") return -0.2;
  if ((activity === "exploring" || activity === "playing") && need === "energy") return 0.025;
  return 0;
}

export function advanceBuddyState(state: BuddyState, elapsedMs: number, activity: BuddyActivity = state.activity): BuddyState {
  requireTimestamp(elapsedMs, "elapsedMs");
  const hours = elapsedMs / 3_600_000;
  const needs = Object.fromEntries(
    buddyNeedOrder.map((need) => {
      const rate = basePressurePerHour[need] + pressureDeltaForActivity(activity, need);
      return [need, clamp01(state.needs[need] + rate * hours)];
    }),
  ) as Record<BuddyNeedId, number>;

  return {
    ...state,
    updatedAtMs: state.updatedAtMs + elapsedMs,
    ageMs: state.ageMs + elapsedMs,
    needs,
    mood: deriveBuddyMood(needs),
    activity,
  };
}

function reduceNeeds(needs: BuddyNeedPressures, changes: Partial<Record<BuddyNeedId, number>>): BuddyNeedPressures {
  return Object.fromEntries(
    buddyNeedOrder.map((need) => [need, clamp01(needs[need] + (changes[need] ?? 0))]),
  ) as Record<BuddyNeedId, number>;
}

export function applyBuddyCare(state: BuddyState, action: BuddyCareAction, nowMs = state.updatedAtMs): BuddyState {
  const timestamp = requireTimestamp(nowMs, "nowMs");
  if (timestamp < state.updatedAtMs) throw new Error("nowMs must not move backwards");

  const changes: Record<BuddyCareAction, Partial<Record<BuddyNeedId, number>>> = {
    pet: { social: -0.16, comfort: -0.1 },
    feed: { hunger: -0.58, comfort: -0.04 },
    play: { play: -0.52, social: -0.12, energy: 0.1 },
    rest: { energy: -0.68, comfort: -0.08 },
    clean: { cleanliness: -0.72, comfort: -0.06 },
  };
  const affectionGain: Record<BuddyCareAction, number> = {
    pet: 0.025,
    feed: 0.01,
    play: 0.02,
    rest: 0.005,
    clean: 0.008,
  };
  const activity: Record<BuddyCareAction, BuddyActivity> = {
    pet: "socializing",
    feed: "eating",
    play: "playing",
    rest: "sleeping",
    clean: "grooming",
  };

  const needs = reduceNeeds(state.needs, changes[action]);
  return {
    ...state,
    updatedAtMs: timestamp,
    affection: clamp01(state.affection + affectionGain[action]),
    needs,
    mood: deriveBuddyMood(needs),
    activity: activity[action],
    lastCareAction: action,
  };
}

export function createBuddySnapshot(state: BuddyState): BuddySnapshot {
  return {
    id: state.id,
    name: state.displayName,
    mood: state.mood,
    activity: state.activity,
    ageMs: state.ageMs,
    affection: state.affection,
    dominantNeed: selectDominantNeed(state.needs),
    drives: buddyNeedOrder.map((id) => ({ id, label: needLabels[id], value: state.needs[id] })),
  };
}
