import { readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import {
  canonicalPetDirections,
  getAnimationById,
  parsePocketBuddyAnimationManifest,
  resolvePetAnimationFrames,
  type PetAnimationDefinition,
  type PetDirection,
  type PocketBuddyAnimationManifest,
} from "@open-pets/pet-format";

import { getAppStateSnapshot } from "./app-state.js";
import { builtInPet } from "./built-in-pet.js";
import type { OpenPetsReaction } from "./local-ipc-protocol.js";
import { getInstalledPetDir } from "./pet-paths.js";
import {
  defaultPetSprite,
  reactionAnimationMetadata,
  resolveManifestReactionAnimation,
  resolveReactionSpriteState,
  selectableAnimationMetadata,
  type PetMotionState,
  type ReactionAnimationOverrides,
} from "./reaction-animation-mapping.js";

const manifestFileName = "animation-manifest.json";
const maxManifestBytes = 2 * 1024 * 1024;
const maxFrameBytes = 24 * 1024 * 1024;
const cache = new Map<string, { readonly signature: string; readonly manifest: PocketBuddyAnimationManifest }>();

export interface ReactionAnimationSettingsSnapshot {
  readonly selectedPetId: string;
  readonly selectedPetDisplayName: string;
  readonly pets: readonly { readonly id: string; readonly displayName: string; readonly builtIn: boolean }[];
  readonly reactions: readonly {
    readonly id: OpenPetsReaction;
    readonly label: string;
    readonly description: string;
    readonly canonicalDefault: string;
    readonly defaultAnimation: string;
  }[];
  readonly animations: readonly {
    readonly id: string;
    readonly originalName: string;
    readonly label: string;
    readonly description: string;
    readonly complete: boolean;
    readonly sourceState: string;
    readonly sourceFolder: string;
    readonly directions: readonly PetDirection[];
    readonly frameCount: number;
    readonly frameCountsByDirection: Readonly<Partial<Record<PetDirection, number>>>;
    readonly durationMs: number;
    readonly iterations: number | "infinite";
    readonly loopMode: string;
    readonly semanticTags: readonly string[];
    readonly issues: readonly string[];
  }[];
  readonly overrides: ReactionAnimationOverrides;
  readonly preview: {
    readonly kind: "builtin-sheet" | "manifest-frames";
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly direction: PetDirection;
    readonly sprite?: typeof defaultPetSprite;
    readonly spriteUrl?: string;
  };
}

export async function readInstalledPetAnimationManifest(petId: string): Promise<PocketBuddyAnimationManifest | null> {
  if (petId === builtInPet.id) return null;
  const root = getInstalledPetDir(petId);
  const path = join(root, manifestFileName);
  let info;
  try { info = await stat(path); } catch { return null; }
  if (!info.isFile() || info.size <= 0 || info.size > maxManifestBytes) throw new Error(`Installed pet ${petId} animation manifest is missing or too large.`);
  const signature = `${info.mtimeMs}:${info.size}`;
  const cached = cache.get(petId);
  if (cached?.signature === signature) return cached.manifest;
  const raw = await readFile(path, "utf8");
  const manifest = parsePocketBuddyAnimationManifest(JSON.parse(raw) as unknown);
  if (manifest.petId !== petId) throw new Error(`Installed pet animation manifest id mismatch: ${manifest.petId}`);
  await validateManifestFiles(root, manifest);
  cache.set(petId, { signature, manifest });
  return manifest;
}

export function clearPetAnimationManifestCache(petId?: string): void {
  if (petId) cache.delete(petId);
  else cache.clear();
}

export async function getReactionAnimationSettingsSnapshot(selectedPetId?: string): Promise<ReactionAnimationSettingsSnapshot> {
  const state = getAppStateSnapshot();
  const availablePets = state.pets.installed.filter((pet) => !pet.broken);
  const selected = availablePets.find((pet) => pet.id === selectedPetId)
    ?? availablePets.find((pet) => pet.id === state.preferences.defaultPetId)
    ?? availablePets[0]
    ?? builtInPet;
  const overrides = state.preferences.reactionAnimationOverridesByPetId?.[selected.id]
    ?? (selected.id === builtInPet.id ? state.preferences.reactionAnimationOverrides : undefined)
    ?? {};
  const pets = availablePets.map((pet) => ({ id: pet.id, displayName: pet.displayName, builtIn: pet.builtIn }));
  /**
   * Pets that predate the animation manifest still render on the universal 8x9
   * spritesheet grid, so they get the same legacy snapshot the built-in pet
   * gets - only the preview image differs. Throwing here instead took the whole
   * Reaction Mapping screen down for every pet installed before manifests
   * existed.
   */
  const legacyGridSnapshot = (spriteUrl: string): ReactionAnimationSettingsSnapshot => {
    return {
      selectedPetId: selected.id,
      selectedPetDisplayName: selected.displayName,
      pets,
      reactions: reactionAnimationMetadata.map((reaction) => ({ ...reaction, canonicalDefault: reaction.defaultAnimation, defaultAnimation: resolveReactionSpriteState(reaction.id, undefined) })),
      animations: selectableAnimationMetadata.map((animation) => {
        const state = defaultPetSprite.states[animation.id];
        const iterations = "iterations" in state ? state.iterations : "infinite";
        return {
          ...animation,
          originalName: animation.label,
          complete: true,
          sourceState: "built-in",
          sourceFolder: defaultPetSprite.fileName,
          directions: canonicalPetDirections,
          frameCount: state.frames,
          frameCountsByDirection: Object.fromEntries(canonicalPetDirections.map((direction) => [direction, state.frames])),
          durationMs: state.durationMs,
          iterations,
          loopMode: typeof iterations === "number" ? "recover" : "loop",
          semanticTags: [animation.id],
          issues: [],
        };
      }),
      overrides,
      preview: { kind: "builtin-sheet", frameWidth: defaultPetSprite.frameWidth, frameHeight: defaultPetSprite.frameHeight, direction: "south", sprite: defaultPetSprite, spriteUrl },
    };
  };

  if (selected.id === builtInPet.id) return legacyGridSnapshot("openpets-pet-preview://spritesheet/default");
  const manifest = await readInstalledPetAnimationManifest(selected.id);
  if (!manifest) return legacyGridSnapshot(`openpets-installed://spritesheet/${encodeURIComponent(selected.id)}`);
  return {
    selectedPetId: selected.id,
    selectedPetDisplayName: selected.displayName,
    pets,
    reactions: reactionAnimationMetadata.map((reaction) => ({
      id: reaction.id,
      label: reaction.label,
      description: reaction.description,
      canonicalDefault: reaction.defaultAnimation,
      defaultAnimation: resolveManifestReactionAnimation(manifest, reaction.id, undefined) ?? manifest.animations[0]!.id,
    })),
    animations: manifest.animations.map((animation) => ({
      id: animation.id,
      originalName: animation.originalName,
      label: animation.label,
      description: animation.description ?? `${animation.originalName} · ${animation.source.state}`,
      complete: animation.complete,
      sourceState: animation.source.state,
      sourceFolder: animation.source.folder,
      directions: animation.directions,
      frameCount: animation.frameCount,
      frameCountsByDirection: animation.frameCountsByDirection ?? Object.fromEntries(animation.directions.map((direction) => [direction, animation.frames[direction]?.length ?? 0])),
      durationMs: animation.durationMs,
      iterations: animation.iterations,
      loopMode: animation.loopMode,
      semanticTags: animation.semanticTags,
      issues: animation.issues ?? [],
    })),
    overrides,
    preview: { kind: "manifest-frames", frameWidth: manifest.frameWidth, frameHeight: manifest.frameHeight, direction: "south" },
  };
}

export async function resolvePetReactionAnimation(petId: string, reaction: OpenPetsReaction | undefined): Promise<{ readonly id: string; readonly animation?: PetAnimationDefinition }> {
  const state = getAppStateSnapshot();
  const overrides = state.preferences.reactionAnimationOverridesByPetId?.[petId]
    ?? (petId === builtInPet.id ? state.preferences.reactionAnimationOverrides : undefined);
  if (petId === builtInPet.id) return { id: resolveReactionSpriteState(reaction, overrides) };
  const manifest = await readInstalledPetAnimationManifest(petId);
  if (!manifest) return { id: resolveReactionSpriteState(reaction, undefined) };
  const id = resolveManifestReactionAnimation(manifest, reaction, overrides) ?? manifest.animations[0]!.id;
  return { id, animation: getAnimationById(manifest, id) };
}

export async function resolvePetMotionAnimation(petId: string, motion: PetMotionState): Promise<{ readonly id: string; readonly animation?: PetAnimationDefinition; readonly direction: PetDirection }> {
  const direction: PetDirection = motion === "run-left" ? "west" : motion === "run-right" ? "east" : "south";
  if (petId === builtInPet.id) return { id: motion === "run-left" ? "running-left" : motion === "run-right" ? "running-right" : "idle", direction };
  const manifest = await readInstalledPetAnimationManifest(petId);
  if (!manifest) return { id: "idle", direction };
  const mappingKey = motion === "run-left" ? "running-left" : motion === "run-right" ? "running-right" : "idle";
  const requested = getAnimationById(manifest, manifest.motionMappings[mappingKey]);
  const idle = getAnimationById(manifest, manifest.semanticDefaults.idle);
  const animation = (requested?.complete ? requested : undefined) ?? (idle?.complete ? idle : undefined) ?? manifest.animations.find((candidate) => candidate.complete) ?? manifest.animations[0];
  return { id: animation?.id ?? "idle", animation, direction };
}

export async function getInstalledPetAnimationFrame(petId: string, animationId: string, direction: PetDirection, index: number): Promise<{ readonly buffer: Buffer; readonly contentType: "image/png"; readonly frameCount: number }> {
  const manifest = await readInstalledPetAnimationManifest(petId);
  if (!manifest) throw new Error("Installed pet has no animation manifest.");
  const animation = getAnimationById(manifest, animationId) ?? getAnimationById(manifest, manifest.semanticDefaults.idle) ?? manifest.animations[0];
  if (!animation) throw new Error("Installed pet has no animation frames.");
  const frames = resolvePetAnimationFrames(animation, direction);
  if (!frames.length) throw new Error("Installed pet animation has no frame for this direction.");
  const frame = frames[Math.max(0, Math.min(frames.length - 1, Math.floor(index)))]!;
  const path = safeManifestPath(getInstalledPetDir(petId), frame.path);
  const info = await stat(path);
  if (!info.isFile() || info.size <= 0 || info.size > maxFrameBytes) throw new Error("Installed pet frame is missing or too large.");
  return { buffer: await readFile(path), contentType: "image/png", frameCount: frames.length };
}

export function getPetAnimationFrameUrl(petId: string, animationId: string, direction: PetDirection, index: number): string {
  return `openpets-installed://frame/${encodeURIComponent(petId)}?animation=${encodeURIComponent(animationId)}&direction=${encodeURIComponent(direction)}&index=${index}`;
}

export async function getPetAnimationDurationMs(petId: string, reaction: OpenPetsReaction): Promise<number | null> {
  if (petId === builtInPet.id) {
    const state = resolveReactionSpriteState(reaction, getAppStateSnapshot().preferences.reactionAnimationOverridesByPetId?.[petId] ?? getAppStateSnapshot().preferences.reactionAnimationOverrides);
    const row = defaultPetSprite.states[state];
    const iterations = "iterations" in row ? row.iterations : "infinite";
    return typeof iterations === "number" ? row.durationMs * iterations : null;
  }
  const resolved = await resolvePetReactionAnimation(petId, reaction);
  const animation = resolved.animation;
  return animation && typeof animation.iterations === "number" ? animation.durationMs * animation.iterations : null;
}

async function validateManifestFiles(root: string, manifest: PocketBuddyAnimationManifest): Promise<void> {
  const paths = new Set<string>();
  paths.add(manifest.preview.thumbnailPath);
  if (manifest.preview.contactSheetPath) paths.add(manifest.preview.contactSheetPath);
  for (const animation of manifest.animations) for (const direction of manifest.directions) for (const frame of animation.frames[direction] ?? []) paths.add(frame.path);
  if (paths.size > 10_000) throw new Error("Installed pet animation manifest references too many files.");
  for (const relativePath of paths) {
    const path = safeManifestPath(root, relativePath);
    const info = await stat(path);
    if (!info.isFile() || info.size <= 0 || info.size > maxFrameBytes) throw new Error(`Installed pet animation asset is invalid: ${relativePath}`);
  }
}

function safeManifestPath(root: string, relativePath: string): string {
  if (!relativePath || relativePath.includes("\\") || relativePath.startsWith("/") || relativePath.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Installed pet manifest contains an unsafe asset path.");
  const target = resolve(root, relativePath);
  const normalizedRoot = resolve(root);
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${sep}`)) throw new Error("Installed pet manifest asset escapes the pet directory.");
  return target;
}
