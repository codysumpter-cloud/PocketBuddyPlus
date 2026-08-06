import type { CanonicalAnimationSemantic, PocketBuddyAnimationManifest } from "@open-pets/pet-format";
import { resolvePetAnimationId } from "@open-pets/pet-format";

import { allowedReactions, type OpenPetsReaction } from "./local-ipc-protocol.js";

export const petMotionDirections = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
export type PetMotionDirection = typeof petMotionDirections[number];
export type PetMotionState = "idle" | "run-left" | "run-right" | `run-${PetMotionDirection}`;

export const motionDirectionByState = {
  "run-left": "west",
  "run-right": "east",
  "run-north": "north",
  "run-north-east": "north-east",
  "run-east": "east",
  "run-south-east": "south-east",
  "run-south": "south",
  "run-south-west": "south-west",
  "run-west": "west",
  "run-north-west": "north-west",
} as const satisfies Record<Exclude<PetMotionState, "idle">, PetMotionDirection>;

export function resolvePetMotionDirection(state: PetMotionState): PetMotionDirection | null {
  return state === "idle" ? null : motionDirectionByState[state];
}

export function resolvePetMotionState(dx: number, dy: number): PetMotionState {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.001) return "idle";
  const octant = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  const direction = (["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"] as const)[octant] ?? "east";
  return `run-${direction}`;
}
export type UniversalSpriteState = "idle" | "running-right" | "running-left" | "waving" | "jumping" | "failed" | "waiting" | "running" | "review";
export type UserSelectableAnimationState = Exclude<UniversalSpriteState, "running-left" | "running-right">;
export type PetAnimationId = string;
export type ReactionAnimationOverrides = Partial<Record<OpenPetsReaction, PetAnimationId>>;
export type ReactionAnimationOverridesByPetId = Readonly<Record<string, ReactionAnimationOverrides>>;

export interface SpriteStateDefinition {
  readonly row: number;
  readonly frames: number;
  readonly durationMs: number;
  readonly iterations?: number | "infinite";
}

export const motionToSpriteState = {
  idle: "idle",
  "run-left": "running-left",
  "run-right": "running-right",
  "run-north": "running-left",
  "run-north-east": "running-right",
  "run-east": "running-right",
  "run-south-east": "running-right",
  "run-south": "running-right",
  "run-south-west": "running-left",
  "run-west": "running-left",
  "run-north-west": "running-left",
} as const satisfies Record<PetMotionState, UniversalSpriteState>;

export const defaultReactionToSpriteState = {
  idle: "idle",
  thinking: "review",
  working: "running",
  editing: "running",
  running: "running",
  testing: "waiting",
  waiting: "waiting",
  waving: "waving",
  success: "jumping",
  error: "failed",
  celebrating: "jumping",
} as const satisfies Record<OpenPetsReaction, UserSelectableAnimationState>;

export const defaultPetSprite = {
  fileName: "default-pet-spritesheet.webp",
  frameWidth: 192,
  frameHeight: 208,
  columns: 8,
  rows: 9,
  states: {
    idle: { row: 0, frames: 6, durationMs: 5500, iterations: "infinite" },
    "running-right": { row: 1, frames: 8, durationMs: 1060 },
    "running-left": { row: 2, frames: 8, durationMs: 1060 },
    waving: { row: 3, frames: 4, durationMs: 700, iterations: 2 },
    jumping: { row: 4, frames: 5, durationMs: 840, iterations: 2 },
    failed: { row: 5, frames: 8, durationMs: 1220, iterations: 2 },
    waiting: { row: 6, frames: 6, durationMs: 1010 },
    running: { row: 7, frames: 6, durationMs: 820 },
    review: { row: 8, frames: 6, durationMs: 1030 },
  } satisfies Record<UniversalSpriteState, SpriteStateDefinition>,
} as const;

export const selectableAnimationMetadata = [
  { id: "idle", label: "Idle", description: "Neutral/no special movement." },
  { id: "review", label: "Review", description: "Thinking, reading, reviewing." },
  { id: "running", label: "Running", description: "Active work, editing, executing." },
  { id: "waiting", label: "Waiting", description: "Waiting, blocked, testing, permission pending." },
  { id: "waving", label: "Waving", description: "Attention, greeting, notification." },
  { id: "jumping", label: "Jumping", description: "Success, celebration." },
  { id: "failed", label: "Failed", description: "Error or failure." },
] as const satisfies readonly { readonly id: UserSelectableAnimationState; readonly label: string; readonly description: string }[];

export const reactionAnimationMetadata = [
  { id: "idle", label: "Idle", description: "Explicit neutral reaction.", defaultAnimation: defaultReactionToSpriteState.idle },
  { id: "thinking", label: "Thinking", description: "Agent is reasoning or reviewing.", defaultAnimation: defaultReactionToSpriteState.thinking },
  { id: "working", label: "Working", description: "Agent is doing general tool work.", defaultAnimation: defaultReactionToSpriteState.working },
  { id: "editing", label: "Editing", description: "Agent is changing files.", defaultAnimation: defaultReactionToSpriteState.editing },
  { id: "running", label: "Running", description: "Agent is running a command.", defaultAnimation: defaultReactionToSpriteState.running },
  { id: "testing", label: "Testing", description: "Agent is running checks.", defaultAnimation: defaultReactionToSpriteState.testing },
  { id: "waiting", label: "Waiting", description: "Agent is blocked or waiting for permission.", defaultAnimation: defaultReactionToSpriteState.waiting },
  { id: "waving", label: "Waving", description: "Pet is greeting or getting attention.", defaultAnimation: defaultReactionToSpriteState.waving },
  { id: "success", label: "Success", description: "Task completed successfully.", defaultAnimation: defaultReactionToSpriteState.success },
  { id: "error", label: "Error", description: "Something failed.", defaultAnimation: defaultReactionToSpriteState.error },
  { id: "celebrating", label: "Celebrating", description: "Positive manual reaction.", defaultAnimation: defaultReactionToSpriteState.celebrating },
] as const satisfies readonly { readonly id: OpenPetsReaction; readonly label: string; readonly description: string; readonly defaultAnimation: UserSelectableAnimationState }[];

const allowedReactionSet = new Set<OpenPetsReaction>(allowedReactions);
const selectableAnimationSet = new Set<UserSelectableAnimationState>(selectableAnimationMetadata.map((animation) => animation.id));
const animationIdPattern = /^[a-z0-9][a-z0-9._-]{0,126}[a-z0-9]$|^[a-z0-9]$/;
const petIdPattern = /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/;

export function isUserSelectableAnimationState(value: unknown): value is UserSelectableAnimationState {
  return typeof value === "string" && selectableAnimationSet.has(value as UserSelectableAnimationState);
}

export function isSafePetAnimationId(value: unknown): value is string {
  return typeof value === "string" && animationIdPattern.test(value);
}

/** Legacy built-in-only preference normalizer. */
export function normalizeReactionAnimationOverrides(value: unknown): ReactionAnimationOverrides | undefined {
  if (!isRecord(value)) return undefined;
  const overrides: ReactionAnimationOverrides = {};
  for (const [reaction, animation] of Object.entries(value)) {
    if (!allowedReactionSet.has(reaction as OpenPetsReaction) || !isUserSelectableAnimationState(animation)) continue;
    if (defaultReactionToSpriteState[reaction as OpenPetsReaction] !== animation) overrides[reaction as OpenPetsReaction] = animation;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function normalizePerPetReactionAnimationOverrides(value: unknown): ReactionAnimationOverrides | undefined {
  if (!isRecord(value)) return undefined;
  const overrides: ReactionAnimationOverrides = {};
  for (const [reaction, animation] of Object.entries(value)) {
    if (!allowedReactionSet.has(reaction as OpenPetsReaction) || !isSafePetAnimationId(animation)) continue;
    overrides[reaction as OpenPetsReaction] = animation;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function normalizeReactionAnimationOverridesByPetId(value: unknown): ReactionAnimationOverridesByPetId | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, ReactionAnimationOverrides> = {};
  for (const [petId, overrides] of Object.entries(value)) {
    if (!petIdPattern.test(petId)) continue;
    const normalized = normalizePerPetReactionAnimationOverrides(overrides);
    if (normalized) result[petId] = normalized;
  }
  return Object.keys(result).length ? result : undefined;
}

export function migrateLegacyReactionAnimationOverrides(
  byPetValue: unknown,
  legacyValue: unknown,
  builtInPetId = "builtin",
): ReactionAnimationOverridesByPetId | undefined {
  const byPet = { ...(normalizeReactionAnimationOverridesByPetId(byPetValue) ?? {}) };
  const legacy = normalizeReactionAnimationOverrides(legacyValue);
  if (legacy && !byPet[builtInPetId]) byPet[builtInPetId] = legacy;
  return Object.keys(byPet).length ? byPet : undefined;
}

export function validateReactionAnimationOverrides(value: unknown): ReactionAnimationOverrides | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Invalid reaction animation overrides.");
  for (const [reaction, animation] of Object.entries(value)) {
    if (!allowedReactionSet.has(reaction as OpenPetsReaction)) throw new Error("Invalid reaction animation reaction.");
    if (!isUserSelectableAnimationState(animation)) throw new Error("Invalid reaction animation state.");
  }
  return normalizeReactionAnimationOverrides(value);
}

export function validatePerPetReactionAnimationOverrides(value: unknown): ReactionAnimationOverrides | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Invalid per-pet reaction animation overrides.");
  for (const [reaction, animation] of Object.entries(value)) {
    if (!allowedReactionSet.has(reaction as OpenPetsReaction)) throw new Error("Invalid reaction animation reaction.");
    if (!isSafePetAnimationId(animation)) throw new Error("Invalid per-pet animation id.");
  }
  return normalizePerPetReactionAnimationOverrides(value);
}

export function resolveReactionSpriteState(reaction: OpenPetsReaction | undefined, overrides: ReactionAnimationOverrides | undefined): UserSelectableAnimationState {
  if (!reaction) return "idle";
  const candidate = overrides?.[reaction];
  return isUserSelectableAnimationState(candidate) ? candidate : defaultReactionToSpriteState[reaction] ?? "idle";
}

export function reactionToCanonicalSemantic(reaction: OpenPetsReaction | undefined): CanonicalAnimationSemantic {
  return reaction ? defaultReactionToSpriteState[reaction] : "idle";
}

export function resolveManifestReactionAnimation(
  manifest: PocketBuddyAnimationManifest,
  reaction: OpenPetsReaction | undefined,
  overrides: ReactionAnimationOverrides | undefined,
): string | undefined {
  const semantic = reactionToCanonicalSemantic(reaction);
  return resolvePetAnimationId(manifest, semantic, reaction ? overrides?.[reaction] : undefined, semantic);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
