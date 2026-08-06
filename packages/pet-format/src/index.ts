export interface PetFormatPackageMarker {
  readonly packageName: "@open-pets/pet-format";
}

export const petFormatPackageName = "@open-pets/pet-format";
export const pocketBuddyAnimationManifestVersion = "pocket-buddy-animation-manifest-v1" as const;
export const pocketBuddyAnimationManifestFileName = "animation-manifest.json" as const;

export const canonicalPetDirections = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;

export type PetDirection = typeof canonicalPetDirections[number];
export type CanonicalAnimationSemantic = "idle" | "review" | "running" | "waiting" | "waving" | "jumping" | "failed";
export type PetMotionMappingId = "idle" | "running-left" | "running-right";
export type PetAnimationLoopMode = "loop" | "once" | "recover";

export interface PetAnimationFrame {
  readonly path: string;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly sha256?: string;
  readonly repairedFrom?: string;
}

export interface PetAnimationSource {
  readonly state: string;
  readonly folder: string;
  readonly partial?: boolean;
  readonly directionIndependent?: boolean;
}

export interface PetAnimationDefinition {
  readonly id: string;
  readonly originalName: string;
  readonly label: string;
  readonly description?: string;
  readonly directions: readonly PetDirection[];
  readonly frames: Readonly<Partial<Record<PetDirection, readonly PetAnimationFrame[]>>>;
  readonly frameCount: number;
  readonly frameCountsByDirection?: Readonly<Partial<Record<PetDirection, number>>>;
  readonly durationMs: number;
  readonly iterations: number | "infinite";
  readonly loopMode: PetAnimationLoopMode;
  readonly semanticTags: readonly string[];
  readonly source: PetAnimationSource;
  readonly complete: boolean;
  readonly issues?: readonly string[];
}

export interface PetAnimationManifestSource {
  readonly kind: "builtin" | "pixellab" | "derived";
  readonly exportVersion?: string;
  readonly archiveName?: string;
  readonly archiveSha256?: string;
}

export interface PetAnimationManifestPreview {
  readonly thumbnailPath: string;
  readonly contactSheetPath?: string;
  readonly defaultAnimationId?: string;
  readonly defaultDirection?: PetDirection;
}

export interface PetAnimationManifestProvenance {
  readonly creator?: string;
  readonly sourceName?: string;
  readonly sourceUrl?: string;
  readonly license?: string;
  readonly notes?: readonly string[];
  readonly importedAt?: string;
  readonly generationReceiptPath?: string;
  readonly validationReceiptPath?: string;
}

export interface PocketBuddyAnimationManifestV1 {
  readonly version: typeof pocketBuddyAnimationManifestVersion;
  readonly petId: string;
  readonly displayName: string;
  readonly source: PetAnimationManifestSource;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly directions: readonly PetDirection[];
  readonly animations: readonly PetAnimationDefinition[];
  readonly semanticDefaults: Readonly<Partial<Record<CanonicalAnimationSemantic, string>>>;
  readonly motionMappings: Readonly<Partial<Record<PetMotionMappingId, string>>>;
  readonly preview: PetAnimationManifestPreview;
  readonly provenance: PetAnimationManifestProvenance;
}

export type PocketBuddyAnimationManifest = PocketBuddyAnimationManifestV1;

const petIdPattern = /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/;
const animationIdPattern = /^[a-z0-9][a-z0-9._-]{0,126}[a-z0-9]$|^[a-z0-9]$/;
const safeRelativeAssetPathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)(?!.*\0)[^:]+$/;
const directionSet = new Set<string>(canonicalPetDirections);
const semanticSet = new Set<string>(["idle", "review", "running", "waiting", "waving", "jumping", "failed"]);
const motionSet = new Set<string>(["idle", "running-left", "running-right"]);

export function isValidPetAnimationId(value: string): boolean {
  return animationIdPattern.test(value);
}

export function normalizePetAnimationId(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128)
    .replace(/-+$/g, "");
  return normalized || "animation";
}

export function isSafePetAssetPath(value: string): boolean {
  return safeRelativeAssetPathPattern.test(value) && !value.startsWith(".") && !value.split("/").some((part) => !part || part === "." || part === "..");
}

export function parsePocketBuddyAnimationManifest(value: unknown): PocketBuddyAnimationManifest {
  if (!isRecord(value)) throw new Error("Animation manifest must be an object.");
  if (value.version !== pocketBuddyAnimationManifestVersion) throw new Error(`Unsupported animation manifest version: ${String(value.version)}`);
  if (typeof value.petId !== "string" || !petIdPattern.test(value.petId)) throw new Error("Animation manifest petId is invalid.");
  if (typeof value.displayName !== "string" || !value.displayName.trim() || value.displayName.length > 120) throw new Error("Animation manifest displayName is invalid.");
  if (!isPositiveInteger(value.frameWidth, 1, 2048) || !isPositiveInteger(value.frameHeight, 1, 2048)) throw new Error("Animation manifest frame dimensions are invalid.");
  if (!Array.isArray(value.directions) || value.directions.length < 1 || value.directions.some((direction) => typeof direction !== "string" || !directionSet.has(direction))) throw new Error("Animation manifest directions are invalid.");
  if (!Array.isArray(value.animations) || value.animations.length < 1 || value.animations.length > 512) throw new Error("Animation manifest animations are invalid.");
  if (!isRecord(value.source) || !["builtin", "pixellab", "derived"].includes(String(value.source.kind))) throw new Error("Animation manifest source is invalid.");
  if (!isRecord(value.semanticDefaults) || !isRecord(value.motionMappings) || !isRecord(value.preview) || !isRecord(value.provenance)) throw new Error("Animation manifest mappings or metadata are invalid.");

  const manifestDirections = [...new Set(value.directions)] as PetDirection[];
  const animationIds = new Set<string>();
  const animations = value.animations.map((animation, index) => parseAnimation(animation, index, animationIds, manifestDirections));
  const byId = new Map(animations.map((animation) => [animation.id, animation]));
  const semanticDefaults = parseMapping(value.semanticDefaults, semanticSet, byId, "semanticDefaults");
  const motionMappings = parseMapping(value.motionMappings, motionSet, byId, "motionMappings");
  if (typeof value.preview.thumbnailPath !== "string" || !isSafePetAssetPath(value.preview.thumbnailPath)) throw new Error("Animation manifest preview thumbnail path is invalid.");
  if (value.preview.contactSheetPath !== undefined && (typeof value.preview.contactSheetPath !== "string" || !isSafePetAssetPath(value.preview.contactSheetPath))) throw new Error("Animation manifest contact sheet path is invalid.");
  if (value.preview.defaultAnimationId !== undefined && (typeof value.preview.defaultAnimationId !== "string" || !byId.has(value.preview.defaultAnimationId))) throw new Error("Animation manifest preview animation is invalid.");
  if (value.preview.defaultDirection !== undefined && (typeof value.preview.defaultDirection !== "string" || !directionSet.has(value.preview.defaultDirection))) throw new Error("Animation manifest preview direction is invalid.");

  return {
    version: pocketBuddyAnimationManifestVersion,
    petId: value.petId,
    displayName: value.displayName.trim(),
    source: value.source as unknown as PetAnimationManifestSource,
    frameWidth: value.frameWidth,
    frameHeight: value.frameHeight,
    directions: manifestDirections,
    animations,
    semanticDefaults: semanticDefaults as Partial<Record<CanonicalAnimationSemantic, string>>,
    motionMappings: motionMappings as Partial<Record<PetMotionMappingId, string>>,
    preview: value.preview as unknown as PetAnimationManifestPreview,
    provenance: value.provenance as unknown as PetAnimationManifestProvenance,
  };
}

export function getAnimationById(manifest: PocketBuddyAnimationManifest, animationId: string | undefined): PetAnimationDefinition | undefined {
  return animationId ? manifest.animations.find((animation) => animation.id === animationId) : undefined;
}

export function getSelectablePetAnimations(manifest: PocketBuddyAnimationManifest): readonly PetAnimationDefinition[] {
  return manifest.animations.filter((animation) => animation.complete && animation.directions.length > 0 && animation.frameCount > 0);
}

export function resolvePetAnimationId(
  manifest: PocketBuddyAnimationManifest,
  semantic: CanonicalAnimationSemantic,
  explicitAnimationId?: string,
  canonicalDefaultAnimationId?: string,
): string | undefined {
  const valid = (id: string | undefined): string | undefined => {
    const animation = getAnimationById(manifest, id);
    return animation?.complete ? animation.id : undefined;
  };
  return valid(explicitAnimationId)
    ?? valid(manifest.semanticDefaults[semantic])
    ?? valid(canonicalDefaultAnimationId)
    ?? valid(manifest.semanticDefaults.idle)
    ?? manifest.animations.find((animation) => animation.complete)?.id
    ?? manifest.animations[0]?.id;
}

export function resolvePetAnimationFrames(
  animation: PetAnimationDefinition,
  direction: PetDirection,
): readonly PetAnimationFrame[] {
  const direct = animation.frames[direction];
  if (direct?.length) return direct;
  if (animation.source.directionIndependent) {
    for (const candidate of canonicalPetDirections) {
      const frames = animation.frames[candidate];
      if (frames?.length) return frames;
    }
  }
  return [];
}

function parseAnimation(value: unknown, index: number, ids: Set<string>, manifestDirections: readonly PetDirection[]): PetAnimationDefinition {
  if (!isRecord(value)) throw new Error(`Animation ${index} must be an object.`);
  if (typeof value.id !== "string" || !isValidPetAnimationId(value.id) || ids.has(value.id)) throw new Error(`Animation ${index} id is invalid or duplicated.`);
  ids.add(value.id);
  if (typeof value.originalName !== "string" || !value.originalName || value.originalName.length > 240) throw new Error(`Animation ${value.id} originalName is invalid.`);
  if (typeof value.label !== "string" || !value.label.trim() || value.label.length > 160) throw new Error(`Animation ${value.id} label is invalid.`);
  if (value.description !== undefined && (typeof value.description !== "string" || value.description.length > 2_000)) throw new Error(`Animation ${value.id} description is invalid.`);
  if (!Array.isArray(value.directions) || value.directions.length < 1 || value.directions.some((direction) => typeof direction !== "string" || !directionSet.has(direction))) throw new Error(`Animation ${value.id} directions are invalid.`);
  if (!isRecord(value.frames)) throw new Error(`Animation ${value.id} frames are invalid.`);
  if (!isPositiveInteger(value.frameCount, 1, 4096) || !isPositiveInteger(value.durationMs, 16, 60_000)) throw new Error(`Animation ${value.id} timing is invalid.`);
  if (!(value.iterations === "infinite" || isPositiveInteger(value.iterations, 1, 1000))) throw new Error(`Animation ${value.id} iterations are invalid.`);
  if (!["loop", "once", "recover"].includes(String(value.loopMode))) throw new Error(`Animation ${value.id} loop mode is invalid.`);
  if (!Array.isArray(value.semanticTags) || value.semanticTags.some((tag) => typeof tag !== "string" || tag.length > 64)) throw new Error(`Animation ${value.id} semantic tags are invalid.`);
  if (!isRecord(value.source) || typeof value.source.state !== "string" || !value.source.state || value.source.state.length > 240 || typeof value.source.folder !== "string" || !value.source.folder || value.source.folder.length > 500) throw new Error(`Animation ${value.id} source is invalid.`);
  if (value.source.partial !== undefined && typeof value.source.partial !== "boolean") throw new Error(`Animation ${value.id} source partial flag is invalid.`);
  if (value.source.directionIndependent !== undefined && typeof value.source.directionIndependent !== "boolean") throw new Error(`Animation ${value.id} directionIndependent flag is invalid.`);
  if (typeof value.complete !== "boolean") throw new Error(`Animation ${value.id} complete flag is invalid.`);
  if (value.issues !== undefined && (!Array.isArray(value.issues) || value.issues.some((issue) => typeof issue !== "string" || issue.length > 500))) throw new Error(`Animation ${value.id} issues are invalid.`);

  const declaredDirections = [...new Set(value.directions)] as PetDirection[];
  const frames: Partial<Record<PetDirection, readonly PetAnimationFrame[]>> = {};
  for (const [direction, rawFrames] of Object.entries(value.frames)) {
    if (!directionSet.has(direction) || !Array.isArray(rawFrames) || rawFrames.length < 1) throw new Error(`Animation ${value.id} has invalid ${direction} frames.`);
    frames[direction as PetDirection] = rawFrames.map((frame, frameIndex) => {
      if (!isRecord(frame) || typeof frame.path !== "string" || !isSafePetAssetPath(frame.path)) throw new Error(`Animation ${value.id} frame ${frameIndex} is invalid.`);
      if (frame.offsetX !== undefined && !isFiniteInteger(frame.offsetX, -4096, 4096)) throw new Error(`Animation ${value.id} frame offsetX is invalid.`);
      if (frame.offsetY !== undefined && !isFiniteInteger(frame.offsetY, -4096, 4096)) throw new Error(`Animation ${value.id} frame offsetY is invalid.`);
      if (frame.sha256 !== undefined && (typeof frame.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(frame.sha256))) throw new Error(`Animation ${value.id} frame hash is invalid.`);
      return frame as unknown as PetAnimationFrame;
    });
  }
  for (const direction of declaredDirections) if (!frames[direction]?.length) throw new Error(`Animation ${value.id} declares ${direction} without frames.`);
  for (const direction of Object.keys(frames) as PetDirection[]) if (!declaredDirections.includes(direction)) throw new Error(`Animation ${value.id} has undeclared ${direction} frames.`);
  const actualCounts = Object.fromEntries(declaredDirections.map((direction) => [direction, frames[direction]?.length ?? 0])) as Partial<Record<PetDirection, number>>;
  const maxFrameCount = Math.max(...Object.values(actualCounts));
  if (value.frameCount !== maxFrameCount) throw new Error(`Animation ${value.id} frameCount does not match its direction frames.`);
  let frameCountsByDirection: Partial<Record<PetDirection, number>> | undefined;
  if (value.frameCountsByDirection !== undefined) {
    if (!isRecord(value.frameCountsByDirection)) throw new Error(`Animation ${value.id} frameCountsByDirection is invalid.`);
    frameCountsByDirection = {};
    for (const [direction, count] of Object.entries(value.frameCountsByDirection)) {
      if (!directionSet.has(direction) || !declaredDirections.includes(direction as PetDirection) || !isPositiveInteger(count, 1, 4096) || count !== actualCounts[direction as PetDirection]) throw new Error(`Animation ${value.id} frame count for ${direction} is invalid.`);
      frameCountsByDirection[direction as PetDirection] = count;
    }
    if (Object.keys(frameCountsByDirection).length !== declaredDirections.length) throw new Error(`Animation ${value.id} frameCountsByDirection is incomplete.`);
  }
  if (value.complete && value.source.directionIndependent !== true && manifestDirections.some((direction) => !declaredDirections.includes(direction))) throw new Error(`Animation ${value.id} is marked complete but lacks required directions.`);
  return { ...value, directions: declaredDirections, frames, ...(frameCountsByDirection ? { frameCountsByDirection } : {}) } as unknown as PetAnimationDefinition;
}

function parseMapping(value: Record<string, unknown>, allowedKeys: Set<string>, animations: Map<string, PetAnimationDefinition>, label: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, animationId] of Object.entries(value)) {
    if (!allowedKeys.has(key) || typeof animationId !== "string" || !animations.has(animationId)) throw new Error(`Animation manifest ${label} is invalid.`);
    result[key] = animationId;
  }
  return result;
}

function isPositiveInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isFiniteInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
