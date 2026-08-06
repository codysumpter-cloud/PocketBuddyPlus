import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, resolve, sep } from "node:path";

import {
  canonicalPetDirections,
  normalizePetAnimationId,
  parsePocketBuddyAnimationManifest,
  pocketBuddyAnimationManifestFileName,
  pocketBuddyAnimationManifestVersion,
  type CanonicalAnimationSemantic,
  type PetAnimationDefinition,
  type PetAnimationFrame,
  type PetAnimationLoopMode,
  type PetDirection,
  type PetMotionMappingId,
  type PocketBuddyAnimationManifest,
} from "@open-pets/pet-format";
import sharp from "sharp";
import yauzl from "yauzl";
import type { Entry, ZipFile } from "yauzl";

const maxArchiveBytes = 250 * 1024 * 1024;
const maxExtractedBytes = 750 * 1024 * 1024;
const maxEntryBytes = 100 * 1024 * 1024;
const maxEntries = 20_000;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const frameIndexPattern = /(?:^|\/)frame_(\d+)\.png$/i;
const directionSet = new Set<string>(canonicalPetDirections);

export interface PixelLabImportAnimationPolicy {
  readonly durationMs?: number;
  readonly iterations?: number | "infinite";
  readonly loopMode?: PetAnimationLoopMode;
  readonly semanticTags?: readonly string[];
  readonly description?: string;
  readonly directionIndependent?: boolean;
}

export interface PixelLabPackageSpec {
  readonly petId: string;
  readonly expectedArchiveName?: string;
  readonly expectedArchiveSha256?: string;
  readonly displayName: string;
  readonly description: string;
  readonly includeStates?: readonly string[];
  readonly semanticDefaults?: Readonly<Partial<Record<CanonicalAnimationSemantic, string>>>;
  readonly motionMappings?: Readonly<Partial<Record<PetMotionMappingId, string>>>;
  readonly animationPolicies?: Readonly<Record<string, PixelLabImportAnimationPolicy>>;
  readonly provenance?: {
    readonly creator?: string;
    readonly sourceName?: string;
    readonly sourceUrl?: string;
    readonly license?: string;
    readonly notes?: readonly string[];
  };
  readonly blockedGenerationSemantics?: readonly CanonicalAnimationSemantic[];
}

export interface PixelLabImportOptions {
  readonly package: PixelLabPackageSpec;
  readonly repairMissingIndexedFrames?: boolean;
  readonly importedAt?: string;
}

export interface PixelLabRepairReceipt {
  readonly animationId: string;
  readonly direction: PetDirection;
  readonly missingIndex: number;
  readonly outputPath: string;
  readonly repairedFrom: string;
  readonly method: "duplicate-nearest-frame";
}

export interface PixelLabImportIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly animationId?: string;
  readonly direction?: PetDirection;
  readonly path?: string;
}

export interface PixelLabInspection {
  readonly exportVersion: "3.1";
  readonly archiveName: string;
  readonly archiveSha256: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly states: readonly string[];
  readonly animations: readonly {
    readonly state: string;
    readonly originalName: string;
    readonly id: string;
    readonly directions: readonly PetDirection[];
    readonly frameCounts: Readonly<Partial<Record<PetDirection, number>>>;
    readonly missingDirections: readonly PetDirection[];
    readonly missingIndices: Readonly<Partial<Record<PetDirection, readonly number[]>>>;
  }[];
  readonly issues: readonly PixelLabImportIssue[];
}

export interface PixelLabImportResult {
  readonly outputDirectory: string;
  readonly manifest: PocketBuddyAnimationManifest;
  readonly inspection: PixelLabInspection;
  readonly repairs: readonly PixelLabRepairReceipt[];
  readonly issues: readonly PixelLabImportIssue[];
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
}

interface PixelLabCharacter {
  readonly id?: string;
  readonly name?: string;
  readonly prompt?: string;
  readonly size?: { readonly width?: number; readonly height?: number };
  readonly directions?: number;
  readonly view?: string;
  readonly created_at?: string;
}

interface PixelLabState {
  readonly character?: PixelLabCharacter;
  readonly folder?: string;
  readonly frames?: {
    readonly rotations?: Readonly<Record<string, string>>;
    readonly animations?: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  };
}

interface PixelLabMetadata {
  readonly export_version?: string;
  readonly group_id?: string;
  readonly states?: readonly PixelLabState[];
}

interface ZipArchive {
  readonly archivePath: string;
  readonly archiveName: string;
  readonly archiveSha256: string;
  readonly entries: ReadonlyMap<string, Buffer>;
  readonly rootPrefix: string;
}

interface WorkingAnimation {
  readonly id: string;
  readonly originalName: string;
  readonly label: string;
  readonly state: string;
  readonly folder: string;
  readonly sourceFrames: Readonly<Partial<Record<PetDirection, readonly string[]>>>;
  readonly policy: PixelLabImportAnimationPolicy;
  readonly semanticTags: readonly string[];
}

interface FrameMetrics {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  readonly opaquePixels: number;
  readonly bbox?: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly touchesEdge: boolean;
  readonly uniqueColors: number;
  readonly isolatedNoiseComponents: number;
  readonly hash: string;
  readonly raw: Buffer;
}

export async function inferPixelLabPackageSpec(archivePath: string): Promise<PixelLabPackageSpec> {
  const archive = await readZipArchive(archivePath);
  const metadata = parseMetadata(archive);
  const characterName = metadata.states?.map((state) => state.character?.name).find((name): name is string => typeof name === "string" && name.trim().length > 0);
  const archiveBase = basename(archivePath, ".zip").replace(/-2$/i, "").replace(/[_-]+/g, " ").trim();
  const genericStateNames = new Set(["idle", "adult", "baby", "adolescent", "default", "main", "sitting", "sleeping"]);
  const normalizedCharacterName = characterName?.trim();
  const displayName = (!normalizedCharacterName || genericStateNames.has(normalizedCharacterName.toLocaleLowerCase("en-US"))
    ? archiveBase
    : normalizedCharacterName
  ).trim().slice(0, 80) || "Imported Buddy";
  return {
    petId: normalizePetId(displayName),
    displayName,
    description: `Imported from PixelLab export ${archive.archiveName}.`,
    provenance: { sourceName: archive.archiveName, notes: ["Imported locally from a user-owned PixelLab export. No API generation was performed."] },
  };
}

export async function importPixelLabExportWithDefaults(archivePath: string, outputDirectory: string, options: Omit<PixelLabImportOptions, "package"> = {}): Promise<PixelLabImportResult> {
  return importPixelLabExport(archivePath, outputDirectory, { ...options, package: await inferPixelLabPackageSpec(archivePath) });
}

export async function inspectPixelLabExport(archivePath: string, options?: Pick<PixelLabImportOptions, "package">): Promise<PixelLabInspection> {
  const archive = await readZipArchive(archivePath);
  const metadata = parseMetadata(archive);
  const packageSpec: PixelLabPackageSpec = options?.package ?? {
    petId: normalizePetId(metadata.states?.[0]?.character?.name ?? basename(archivePath, ".zip")),
    displayName: metadata.states?.[0]?.character?.name ?? basename(archivePath, ".zip"),
    description: "PixelLab export",
  };
  const parsed = collectAnimations(metadata, archive, packageSpec);
  return buildInspection(metadata, archive, parsed.animations, parsed.issues, packageSpec.includeStates);
}

export async function importPixelLabExport(archivePath: string, outputDirectory: string, options: PixelLabImportOptions): Promise<PixelLabImportResult> {
  const archive = await readZipArchive(archivePath);
  if (options.package.expectedArchiveName && archive.archiveName !== options.package.expectedArchiveName) throw new Error(`PixelLab archive name mismatch: ${archive.archiveName}`);
  if (options.package.expectedArchiveSha256 && archive.archiveSha256 !== options.package.expectedArchiveSha256) throw new Error(`PixelLab archive hash mismatch: ${archive.archiveSha256}`);
  const metadata = parseMetadata(archive);
  const { width, height } = getNativeFrameSize(metadata, options.package.includeStates);
  const collected = collectAnimations(metadata, archive, options.package);
  const inspection = buildInspection(metadata, archive, collected.animations, collected.issues, options.package.includeStates);
  const issues: PixelLabImportIssue[] = [...collected.issues];
  const repairs: PixelLabRepairReceipt[] = [];
  const files: Array<{ path: string; sha256: string; bytes: number }> = [];
  const frameMetrics = new Map<string, FrameMetrics>();
  const outputRoot = resolve(outputDirectory);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });

  const definitions: PetAnimationDefinition[] = [];
  for (const animation of collected.animations) {
    const frames: Partial<Record<PetDirection, readonly PetAnimationFrame[]>> = {};
    const frameCountsByDirection: Partial<Record<PetDirection, number>> = {};
    const animationIssues: string[] = [];
    for (const direction of canonicalPetDirections) {
      const sourcePaths = animation.sourceFrames[direction];
      if (!sourcePaths?.length) continue;
      const indexed = indexFramePaths(sourcePaths);
      const outputFrames: PetAnimationFrame[] = [];
      for (let index = 0; index <= indexed.maxIndex; index += 1) {
        let sourcePath = indexed.byIndex.get(index);
        let repairedFrom: string | undefined;
        if (!sourcePath) {
          const missingMessage = `Missing indexed frame ${String(index).padStart(3, "0")} in ${animation.originalName}/${direction}.`;
          if (!options.repairMissingIndexedFrames) {
            animationIssues.push(missingMessage);
            issues.push({ severity: "error", code: "missing-indexed-frame", message: missingMessage, animationId: animation.id, direction });
            continue;
          }
          sourcePath = nearestFramePath(indexed.byIndex, index);
          if (!sourcePath) {
            animationIssues.push(missingMessage);
            issues.push({ severity: "error", code: "missing-indexed-frame", message: missingMessage, animationId: animation.id, direction });
            continue;
          }
          repairedFrom = sourcePath;
        }
        const sourceBuffer = getEntry(archive, sourcePath);
        const relativePath = `animations/${animation.id}/${direction}/frame_${String(index).padStart(3, "0")}.png`;
        const destination = safeOutputPath(outputRoot, relativePath);
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        await writeFile(destination, sourceBuffer, { mode: 0o600 });
        const hash = sha256(sourceBuffer);
        files.push({ path: relativePath, sha256: hash, bytes: sourceBuffer.byteLength });
        const metricKey = `${animation.id}:${direction}:${index}`;
        const metrics = await validatePngFrame(sourceBuffer, relativePath, width, height);
        frameMetrics.set(metricKey, metrics);
        issues.push(...metricsToIssues(metrics, animation.id, direction));
        outputFrames.push({ path: relativePath, sha256: hash, ...(repairedFrom ? { repairedFrom } : {}) });
        if (repairedFrom) {
          repairs.push({ animationId: animation.id, direction, missingIndex: index, outputPath: relativePath, repairedFrom, method: "duplicate-nearest-frame" });
          issues.push({ severity: "warning", code: "repaired-indexed-frame", message: `Repaired ${animation.originalName}/${direction}/frame_${String(index).padStart(3, "0")} by duplicating ${repairedFrom}.`, animationId: animation.id, direction, path: relativePath });
        }
      }
      if (outputFrames.length) {
        frames[direction] = outputFrames;
        frameCountsByDirection[direction] = outputFrames.length;
        issues.push(...validateTemporalSeries(animation.id, direction, outputFrames, frameMetrics));
      }
    }
    const directions = canonicalPetDirections.filter((direction) => Boolean(frames[direction]?.length));
    const missingDirections = canonicalPetDirections.filter((direction) => !directions.includes(direction));
    if (missingDirections.length && !animation.policy.directionIndependent) {
      animationIssues.push(`Missing directions: ${missingDirections.join(", ")}.`);
    }
    const complete = animationIssues.length === 0 && (missingDirections.length === 0 || animation.policy.directionIndependent === true);
    const frameCount = Math.max(0, ...Object.values(frameCountsByDirection).filter((value): value is number => typeof value === "number"));
    definitions.push({
      id: animation.id,
      originalName: animation.originalName,
      label: animation.label,
      ...(animation.policy.description ? { description: animation.policy.description } : {}),
      directions,
      frames,
      frameCount,
      frameCountsByDirection,
      durationMs: animation.policy.durationMs ?? inferDuration(animation.originalName),
      iterations: animation.policy.iterations ?? inferIterations(animation.originalName),
      loopMode: animation.policy.loopMode ?? inferLoopMode(animation.originalName),
      semanticTags: [...new Set([...animation.semanticTags, ...(animation.policy.semanticTags ?? [])])],
      source: {
        state: animation.state,
        folder: animation.folder,
        ...(missingDirections.length ? { partial: true } : {}),
        ...(animation.policy.directionIndependent ? { directionIndependent: true } : {}),
      },
      complete,
      ...(animationIssues.length ? { issues: animationIssues } : {}),
    });
  }

  const resolvedSemanticDefaults = resolveMappings(options.package.semanticDefaults ?? {}, definitions, "semantic default", issues);
  const inferredDefaults = inferSemanticDefaults(definitions);
  const semanticDefaults = { ...inferredDefaults, ...resolvedSemanticDefaults };
  const motionMappings = {
    idle: semanticDefaults.idle,
    "running-left": semanticDefaults.running,
    "running-right": semanticDefaults.running,
    ...resolveMappings(options.package.motionMappings ?? {}, definitions, "motion mapping", issues),
  } as Partial<Record<PetMotionMappingId, string>>;

  const defaultAnimation = definitions.find((animation) => animation.id === semanticDefaults.idle && animation.complete)
    ?? definitions.find((animation) => animation.complete)
    ?? definitions[0];
  if (!defaultAnimation) throw new Error("PixelLab export contains no importable rotations or animations.");
  const defaultDirection = defaultAnimation.frames.south?.length ? "south" : defaultAnimation.directions[0] ?? "south";
  const defaultFrame = defaultAnimation.frames[defaultDirection]?.[0];
  if (!defaultFrame) throw new Error("PixelLab export contains no previewable frame.");
  const defaultBuffer = await readFile(safeOutputPath(outputRoot, defaultFrame.path));
  const previewPng = await sharp(defaultBuffer).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  await writeOutput(outputRoot, "preview.png", previewPng, files);
  const fallbackWebp = await sharp(defaultBuffer).webp({ lossless: true, effort: 6 }).toBuffer();
  await writeOutput(outputRoot, "spritesheet.webp", fallbackWebp, files);
  const contactSheet = await createContactSheet(definitions, outputRoot, width, height);
  await writeOutput(outputRoot, "contact-sheet.png", contactSheet, files);

  const importedAt = options.importedAt ?? inferImportDate(metadata);
  const manifest = parsePocketBuddyAnimationManifest({
    version: pocketBuddyAnimationManifestVersion,
    petId: options.package.petId,
    displayName: options.package.displayName,
    source: { kind: "pixellab", exportVersion: "3.1", archiveName: archive.archiveName, archiveSha256: archive.archiveSha256 },
    frameWidth: width,
    frameHeight: height,
    directions: canonicalPetDirections,
    animations: definitions,
    semanticDefaults,
    motionMappings,
    preview: { thumbnailPath: "preview.png", contactSheetPath: "contact-sheet.png", defaultAnimationId: defaultAnimation.id, defaultDirection },
    provenance: {
      ...(options.package.provenance ?? {}),
      sourceName: options.package.provenance?.sourceName ?? archive.archiveName,
      importedAt,
      generationReceiptPath: "generation-receipt.json",
      validationReceiptPath: "validation-receipt.json",
    },
  });

  const petJson = {
    id: options.package.petId,
    displayName: options.package.displayName,
    description: options.package.description,
    spritesheetPath: "spritesheet.webp",
    animationManifestPath: pocketBuddyAnimationManifestFileName,
  };
  await writeJson(outputRoot, "pet.json", petJson, files);
  await writeJson(outputRoot, pocketBuddyAnimationManifestFileName, manifest, files);
  const generationReceipt = {
    version: "pocket-buddy-animation-generation-receipt-v1",
    petId: manifest.petId,
    operation: "pixellab-export-import",
    model: null,
    apiOperation: null,
    prompt: null,
    seed: null,
    guidance: null,
    sourceArchive: { name: archive.archiveName, sha256: archive.archiveSha256, exportVersion: "3.1" },
    repairs,
    blockedGenerationSemantics: options.package.blockedGenerationSemantics ?? [],
    generatedAt: importedAt,
    cost: { amount: 0, currency: "USD", source: "No API generation was performed." },
  };
  await writeJson(outputRoot, "generation-receipt.json", generationReceipt, files);
  const validationReceipt = {
    version: "pocket-buddy-animation-validation-receipt-v1",
    petId: manifest.petId,
    archiveSha256: archive.archiveSha256,
    expectedDimensions: { width, height },
    animationCount: manifest.animations.length,
    selectableAnimationCount: manifest.animations.filter((animation) => animation.complete).length,
    repairs,
    issues,
    files: files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })),
    passed: !issues.some((issue) => issue.severity === "error"),
  };
  await writeJson(outputRoot, "validation-receipt.json", validationReceipt, files);
  verifyManifestPaths(manifest, new Set(files.map((file) => file.path)));
  return { outputDirectory: outputRoot, manifest, inspection, repairs, issues, files };
}

export function normalizePetId(value: string): string {
  const id = normalizePetAnimationId(value).slice(0, 64).replace(/-+$/g, "");
  const safe = id.length >= 3 ? id : `pet-${id || "import"}`;
  return safe === "builtin" ? "imported-builtin" : safe;
}

function parseMetadata(archive: ZipArchive): PixelLabMetadata {
  const metadataPath = archive.rootPrefix ? `${archive.rootPrefix}/metadata.json` : "metadata.json";
  const raw = archive.entries.get(metadataPath);
  if (!raw) throw new Error("PixelLab export is missing metadata.json.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw.toString("utf8")); } catch { throw new Error("PixelLab metadata.json is not valid JSON."); }
  if (!isRecord(parsed) || parsed.export_version !== "3.1" || !Array.isArray(parsed.states) || parsed.states.length < 1) throw new Error("Archive is not a supported PixelLab export 3.1 package.");
  return parsed as unknown as PixelLabMetadata;
}

function collectAnimations(metadata: PixelLabMetadata, archive: ZipArchive, spec: PixelLabPackageSpec): { animations: WorkingAnimation[]; issues: PixelLabImportIssue[] } {
  const included = spec.includeStates ? new Set(spec.includeStates) : null;
  const states = (metadata.states ?? []).filter((state) => typeof state.folder === "string" && (!included || included.has(state.folder)));
  if (!states.length) throw new Error("PixelLab import selection contains no matching states.");
  const issues: PixelLabImportIssue[] = [];
  const animations: WorkingAnimation[] = [];
  const ids = new Map<string, string>();
  for (const state of states) {
    const stateName = state.folder!;
    const rotations = state.frames?.rotations ?? {};
    if (Object.keys(rotations).length) {
      const originalName = `[state] ${stateName}`;
      const id = uniqueAnimationId(`state-${normalizePetAnimationId(stateName)}`, `${stateName}:rotations`, ids);
      const sourceFrames: Partial<Record<PetDirection, readonly string[]>> = {};
      for (const [direction, path] of Object.entries(rotations)) {
        if (!directionSet.has(direction) || typeof path !== "string") continue;
        assertArchiveEntryExists(archive, path);
        sourceFrames[direction as PetDirection] = [path];
      }
      const policy = findPolicy(spec.animationPolicies, originalName, id);
      animations.push({ id, originalName, label: humanize(stateName), state: stateName, folder: `${stateName}/rotations`, sourceFrames, policy, semanticTags: ["state", "pose"] });
    }
    for (const [originalName, directionFrames] of Object.entries(state.frames?.animations ?? {})) {
      const base = normalizePetAnimationId(originalName);
      const id = uniqueAnimationId(base, `${stateName}:${originalName}`, ids);
      const sourceFrames: Partial<Record<PetDirection, readonly string[]>> = {};
      for (const [direction, paths] of Object.entries(directionFrames)) {
        if (!directionSet.has(direction) || !Array.isArray(paths)) continue;
        const normalized = paths.filter((path): path is string => typeof path === "string");
        for (const path of normalized) assertArchiveEntryExists(archive, path);
        if (normalized.length) sourceFrames[direction as PetDirection] = normalized;
      }
      const policy = findPolicy(spec.animationPolicies, originalName, id);
      animations.push({ id, originalName, label: humanize(originalName), state: stateName, folder: `${stateName}/animations/${originalName}`, sourceFrames, policy, semanticTags: inferSemanticTags(originalName, stateName) });
    }
  }
  for (const animation of animations) {
    const missing = canonicalPetDirections.filter((direction) => !animation.sourceFrames[direction]?.length);
    if (missing.length) issues.push({ severity: "warning", code: "missing-directions", message: `${animation.originalName} is missing ${missing.join(", ")}.`, animationId: animation.id });
    for (const [direction, paths] of Object.entries(animation.sourceFrames) as Array<[PetDirection, readonly string[]]>) {
      const indexed = indexFramePaths(paths);
      const missingIndices = missingFrameIndices(indexed);
      if (missingIndices.length) issues.push({ severity: "warning", code: "missing-indexed-frame", message: `${animation.originalName}/${direction} is missing indexed frame(s): ${missingIndices.map((index) => String(index).padStart(3, "0")).join(", ")}.`, animationId: animation.id, direction });
    }
  }
  return { animations, issues };
}

function buildInspection(metadata: PixelLabMetadata, archive: ZipArchive, animations: readonly WorkingAnimation[], issues: readonly PixelLabImportIssue[], includeStates?: readonly string[]): PixelLabInspection {
  const size = getNativeFrameSize(metadata, includeStates);
  return {
    exportVersion: "3.1",
    archiveName: archive.archiveName,
    archiveSha256: archive.archiveSha256,
    frameWidth: size.width,
    frameHeight: size.height,
    states: [...new Set(animations.map((animation) => animation.state))],
    animations: animations.map((animation) => {
      const frameCounts: Partial<Record<PetDirection, number>> = {};
      const missingIndices: Partial<Record<PetDirection, readonly number[]>> = {};
      for (const [direction, paths] of Object.entries(animation.sourceFrames) as Array<[PetDirection, readonly string[]]>) {
        frameCounts[direction] = paths.length;
        const missing = missingFrameIndices(indexFramePaths(paths));
        if (missing.length) missingIndices[direction] = missing;
      }
      const directions = canonicalPetDirections.filter((direction) => Boolean(animation.sourceFrames[direction]?.length));
      return { state: animation.state, originalName: animation.originalName, id: animation.id, directions, frameCounts, missingDirections: canonicalPetDirections.filter((direction) => !directions.includes(direction)), missingIndices };
    }),
    issues,
  };
}

async function readZipArchive(archivePath: string): Promise<ZipArchive> {
  const archiveStats = await stat(archivePath);
  if (!archiveStats.isFile() || archiveStats.size <= 0 || archiveStats.size > maxArchiveBytes) throw new Error("PixelLab archive is missing, empty, or too large.");
  const archiveBuffer = await readFile(archivePath);
  const archiveSha256 = sha256(archiveBuffer);
  const entries = new Map<string, Buffer>();
  const caseFolded = new Set<string>();
  let extractedBytes = 0;
  const zip = await openZip(archivePath);
  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let settled = false;
      const reject = (error: unknown) => {
        if (settled) return;
        settled = true;
        zip.close();
        rejectPromise(error instanceof Error ? error : new Error("PixelLab ZIP read failed."));
      };
      zip.on("error", reject);
      zip.on("end", () => { if (!settled) { settled = true; resolvePromise(); } });
      zip.on("entry", (entry) => {
        void (async () => {
          validateZipEntry(entry);
          const normalized = validateSafeZipPath(entry.fileName);
          if (!normalized || entry.fileName.endsWith("/")) { zip.readEntry(); return; }
          if (entries.size >= maxEntries) throw new Error("PixelLab ZIP contains too many files.");
          const folded = normalized.toLocaleLowerCase("en-US");
          if (entries.has(normalized) || caseFolded.has(folded)) throw new Error(`PixelLab ZIP contains duplicate or case-colliding path: ${normalized}`);
          extractedBytes += entry.uncompressedSize;
          if (extractedBytes > maxExtractedBytes) throw new Error("PixelLab ZIP extracted size is too large.");
          const buffer = await readZipEntry(zip, entry);
          entries.set(normalized, buffer);
          caseFolded.add(folded);
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } finally { zip.close(); }
  const rootPrefix = findMetadataRoot(entries.keys());
  return { archivePath: resolve(archivePath), archiveName: basename(archivePath), archiveSha256, entries, rootPrefix };
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(path, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => error || !zip ? rejectPromise(error ?? new Error("ZIP could not be opened.")) : resolvePromise(zip));
  });
}

function readZipEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) { rejectPromise(error ?? new Error("ZIP entry stream unavailable.")); return; }
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on("data", (chunk: Buffer) => { total += chunk.byteLength; if (total > maxEntryBytes) stream.destroy(new Error("ZIP entry too large.")); else chunks.push(chunk); });
      stream.on("error", rejectPromise);
      stream.on("end", () => total === entry.uncompressedSize ? resolvePromise(Buffer.concat(chunks, total)) : rejectPromise(new Error("ZIP entry size mismatch.")));
    });
  });
}

function validateZipEntry(entry: Entry): void {
  if (entry.isEncrypted()) throw new Error("Encrypted PixelLab ZIP entries are not supported.");
  if (![0, 8].includes(entry.compressionMethod)) throw new Error("Unsupported PixelLab ZIP compression method.");
  if (entry.uncompressedSize > maxEntryBytes || entry.compressedSize > maxArchiveBytes) throw new Error("PixelLab ZIP entry is too large.");
  if ((entry.versionMadeBy >> 8) === 3) {
    const mode = (entry.externalFileAttributes >> 16) & 0o177777;
    const type = mode & 0o170000;
    if (type && type !== 0o100000 && type !== 0o040000) throw new Error("PixelLab ZIP special files and symlinks are not supported.");
  }
}

export function validateSafeZipPath(path: string): string {
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/") || path.startsWith("//") || /^[A-Za-z]:\//.test(path) || path.includes("//")) throw new Error(`Unsafe ZIP path: ${path}`);
  const parts = path.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error(`Unsafe ZIP path: ${path}`);
  return parts.join("/");
}

function findMetadataRoot(paths: Iterable<string>): string {
  const candidates = [...paths].filter((path) => path === "metadata.json" || /^[^/]+\/metadata\.json$/.test(path));
  if (candidates.length !== 1) throw new Error("PixelLab ZIP must contain exactly one root metadata.json.");
  return candidates[0] === "metadata.json" ? "" : candidates[0]!.slice(0, -"/metadata.json".length);
}

function getEntry(archive: ZipArchive, sourcePath: string): Buffer {
  const path = archive.rootPrefix ? `${archive.rootPrefix}/${sourcePath}` : sourcePath;
  const buffer = archive.entries.get(path);
  if (!buffer) throw new Error(`PixelLab metadata references missing file: ${sourcePath}`);
  return buffer;
}

function assertArchiveEntryExists(archive: ZipArchive, sourcePath: string): void { void getEntry(archive, sourcePath); }

function getNativeFrameSize(metadata: PixelLabMetadata, includeStates?: readonly string[]): { width: number; height: number } {
  const included = includeStates ? new Set(includeStates) : null;
  const sizes = (metadata.states ?? [])
    .filter((state) => !included || (typeof state.folder === "string" && included.has(state.folder)))
    .map((state) => state.character?.size)
    .filter((size): size is { width: number; height: number } => Boolean(size && Number.isInteger(size.width) && Number.isInteger(size.height)));
  if (!sizes.length) throw new Error("PixelLab metadata has no valid native frame dimensions.");
  const first = sizes[0]!;
  if (first.width < 1 || first.height < 1 || first.width > 2048 || first.height > 2048 || sizes.some((size) => size.width !== first.width || size.height !== first.height)) throw new Error("Selected PixelLab states do not share valid native frame dimensions.");
  return first;
}

function indexFramePaths(paths: readonly string[]): { byIndex: Map<number, string>; maxIndex: number } {
  const byIndex = new Map<number, string>();
  let fallback = 0;
  for (const path of paths) {
    const match = frameIndexPattern.exec(path);
    const index = match ? Number(match[1]) : fallback;
    if (!Number.isSafeInteger(index) || index < 0 || index > 4095 || byIndex.has(index)) throw new Error(`Invalid or duplicate frame index in ${path}.`);
    byIndex.set(index, path);
    fallback += 1;
  }
  return { byIndex, maxIndex: Math.max(...byIndex.keys()) };
}

function missingFrameIndices(indexed: { byIndex: Map<number, string>; maxIndex: number }): number[] {
  const result: number[] = [];
  for (let index = 0; index <= indexed.maxIndex; index += 1) if (!indexed.byIndex.has(index)) result.push(index);
  return result;
}

function nearestFramePath(byIndex: Map<number, string>, missing: number): string | undefined {
  const indexes = [...byIndex.keys()].sort((a, b) => Math.abs(a - missing) - Math.abs(b - missing) || a - b);
  return indexes.length ? byIndex.get(indexes[0]!) : undefined;
}

function uniqueAnimationId(base: string, identity: string, ids: Map<string, string>): string {
  const current = ids.get(base);
  if (!current) { ids.set(base, identity); return base; }
  if (current === identity) return base;
  const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 8);
  const id = `${base.slice(0, Math.max(1, 119 - suffix.length))}-${suffix}`;
  ids.set(id, identity);
  return id;
}

function findPolicy(policies: Readonly<Record<string, PixelLabImportAnimationPolicy>> | undefined, originalName: string, id: string): PixelLabImportAnimationPolicy {
  return policies?.[originalName] ?? policies?.[id] ?? {};
}

function inferSemanticTags(name: string, state: string): string[] {
  const value = `${name} ${state}`.toLowerCase();
  const tags: string[] = [];
  for (const tag of ["idle", "run", "walk", "sprint", "jump", "roll", "punch", "death", "fall", "bark", "sleep", "nap", "sit", "wince", "lunge", "wave", "review", "wait"]) if (value.includes(tag)) tags.push(tag);
  return tags;
}

function inferDuration(name: string): number {
  const value = name.toLowerCase();
  if (value.includes("run") || value.includes("sprint")) return 680;
  if (value.includes("walk")) return 880;
  if (value.includes("jump") || value.includes("roll") || value.includes("punch")) return 700;
  if (value.includes("death") || value.includes("fall") || value.includes("wince")) return 1050;
  return 1000;
}

function inferIterations(name: string): number | "infinite" {
  const value = name.toLowerCase();
  return /jump|roll|punch|death|fall|wince|lunge|bark|wave/.test(value) ? 1 : "infinite";
}

function inferLoopMode(name: string): PetAnimationLoopMode {
  return inferIterations(name) === "infinite" ? "loop" : "recover";
}

function inferSemanticDefaults(animations: readonly PetAnimationDefinition[]): Partial<Record<CanonicalAnimationSemantic, string>> {
  const complete = animations.filter((animation) => animation.complete);
  const find = (...tests: RegExp[]) => complete.find((animation) => tests.some((test) => test.test(`${animation.id} ${animation.originalName} ${animation.semanticTags.join(" ")}`.toLowerCase())))?.id;
  const idle = find(/^idle\b/, /\bidle\b/) ?? complete[0]?.id;
  const running = find(/\bani-run\b/, /\brunning\b/, /\bfull-sprint\b/, /\bwalking\b/) ?? idle;
  const review = find(/review|think|head|curious|wince/) ?? idle;
  const waiting = find(/wait|sitting|sleep|nap|relaxed/) ?? idle;
  const waving = find(/wave/) ?? idle;
  const jumping = find(/jump/) ?? idle;
  const failed = find(/failed|wince|fall|slump|head/) ?? idle;
  return { idle, review, running, waiting, waving, jumping, failed };
}

function resolveMappings<T extends string>(mapping: Readonly<Partial<Record<T, string>>>, animations: readonly PetAnimationDefinition[], label: string, issues: PixelLabImportIssue[]): Partial<Record<T, string>> {
  const byId = new Map(animations.map((animation) => [animation.id, animation]));
  const byOriginal = new Map(animations.map((animation) => [animation.originalName, animation]));
  const result: Partial<Record<T, string>> = {};
  for (const [key, requested] of Object.entries(mapping) as Array<[T, string | undefined]>) {
    if (!requested) continue;
    const animation = byId.get(requested) ?? byOriginal.get(requested);
    if (!animation) { issues.push({ severity: "error", code: "missing-semantic-animation", message: `Requested ${label} ${key} references missing animation ${requested}.` }); continue; }
    if (!animation.complete) { issues.push({ severity: "warning", code: "incomplete-semantic-animation", message: `Requested ${label} ${key} references incomplete animation ${animation.originalName}; it will remain unavailable in Settings.`, animationId: animation.id }); continue; }
    result[key] = animation.id;
  }
  return result;
}

async function validatePngFrame(buffer: Buffer, path: string, expectedWidth: number, expectedHeight: number): Promise<FrameMetrics> {
  if (buffer.length < pngSignature.length || !buffer.subarray(0, pngSignature.length).equals(pngSignature)) throw new Error(`Frame is not a PNG: ${path}`);
  const image = sharp(buffer, { failOn: "error" }).ensureAlpha();
  const metadata = await image.metadata();
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) throw new Error(`Frame dimensions mismatch for ${path}: ${metadata.width}x${metadata.height}, expected ${expectedWidth}x${expectedHeight}.`);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  let opaquePixels = 0;
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  const colors = new Set<number>();
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const offset = pixel * 4;
    const a = data[offset + 3]!;
    alpha[pixel] = a;
    if (!a) continue;
    opaquePixels += 1;
    const x = pixel % info.width, y = Math.floor(pixel / info.width);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    colors.add((data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | a);
  }
  if (!opaquePixels) throw new Error(`Frame is fully transparent: ${path}`);
  const bbox = { left: minX, top: minY, right: maxX, bottom: maxY };
  return {
    path, width: info.width, height: info.height, hasAlpha: metadata.hasAlpha === true,
    opaquePixels, bbox, touchesEdge: minX === 0 || minY === 0 || maxX === info.width - 1 || maxY === info.height - 1,
    uniqueColors: colors.size, isolatedNoiseComponents: countTinyComponents(alpha, info.width, info.height), hash: sha256(buffer), raw: data,
  };
}

function metricsToIssues(metrics: FrameMetrics, animationId: string, direction: PetDirection): PixelLabImportIssue[] {
  const result: PixelLabImportIssue[] = [];
  if (!metrics.hasAlpha) result.push({ severity: "error", code: "missing-alpha", message: `${metrics.path} does not preserve an alpha channel.`, animationId, direction, path: metrics.path });
  if (metrics.touchesEdge) result.push({ severity: "warning", code: "sprite-clipping-risk", message: `${metrics.path} touches the native frame edge.`, animationId, direction, path: metrics.path });
  if (metrics.uniqueColors > 512) result.push({ severity: "warning", code: "palette-explosion", message: `${metrics.path} uses ${metrics.uniqueColors} colors.`, animationId, direction, path: metrics.path });
  if (metrics.isolatedNoiseComponents > 0) result.push({ severity: "warning", code: "isolated-noise", message: `${metrics.path} contains ${metrics.isolatedNoiseComponents} isolated 1-2 pixel component(s).`, animationId, direction, path: metrics.path });
  return result;
}

function countTinyComponents(alpha: Uint8Array, width: number, height: number): number {
  const seen = new Uint8Array(alpha.length);
  let tiny = 0;
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let start = 0; start < alpha.length; start += 1) {
    if (!alpha[start] || seen[start]) continue;
    const stack = [start]; seen[start] = 1; let size = 0;
    while (stack.length) {
      const index = stack.pop()!; size += 1;
      const x = index % width, y = Math.floor(index / width);
      for (const [dx, dy] of neighbors) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (alpha[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
      }
    }
    if (size <= 2) tiny += 1;
  }
  return tiny;
}

function validateTemporalSeries(animationId: string, direction: PetDirection, frames: readonly PetAnimationFrame[], metrics: ReadonlyMap<string, FrameMetrics>): PixelLabImportIssue[] {
  const result: PixelLabImportIssue[] = [];
  const series = frames.map((_frame, index) => metrics.get(`${animationId}:${direction}:${index}`)).filter((value): value is FrameMetrics => Boolean(value));
  if (series.length < 2) return result;
  const bottoms = series.map((metric) => metric.bbox!.bottom);
  if (Math.max(...bottoms) - Math.min(...bottoms) > Math.max(4, Math.round(series[0]!.height * 0.12))) result.push({ severity: "warning", code: "ground-contact-drift", message: `${animationId}/${direction} ground contact drifts ${Math.max(...bottoms) - Math.min(...bottoms)} pixels.`, animationId, direction });
  const areas = series.map((metric) => metric.opaquePixels);
  if (Math.max(...areas) / Math.max(1, Math.min(...areas)) > 1.8) result.push({ severity: "warning", code: "scale-drift", message: `${animationId}/${direction} opaque area changes by more than 1.8x.`, animationId, direction });
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1]!, current = series[index]!;
    let changed = 0;
    for (let byte = 0; byte < current.raw.length; byte += 4) if (current.raw[byte] !== previous.raw[byte] || current.raw[byte + 1] !== previous.raw[byte + 1] || current.raw[byte + 2] !== previous.raw[byte + 2] || current.raw[byte + 3] !== previous.raw[byte + 3]) changed += 1;
    if (changed / (current.width * current.height) > 0.82) result.push({ severity: "warning", code: "temporal-discontinuity", message: `${animationId}/${direction} changes more than 82% of pixels between frames ${index - 1} and ${index}.`, animationId, direction });
  }
  return result;
}

async function createContactSheet(animations: readonly PetAnimationDefinition[], root: string, frameWidth: number, frameHeight: number): Promise<Buffer> {
  const labelWidth = 260;
  const headerHeight = 24;
  const cellPadding = 8;
  const cellWidth = frameWidth + cellPadding * 2;
  const rowHeight = frameHeight + headerHeight + cellPadding;
  const width = labelWidth + canonicalPetDirections.length * cellWidth;
  const height = Math.max(rowHeight, animations.length * rowHeight);
  const composites: sharp.OverlayOptions[] = [];
  const text: string[] = [`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:monospace;font-size:11px;fill:#e2e8f0}.muted{fill:#94a3b8}.bad{fill:#fca5a5}</style><rect width="100%" height="100%" fill="#202632"/>`];
  animations.forEach((animation, row) => {
    const y = row * rowHeight;
    text.push(`<text x="8" y="${y + 16}" class="${animation.complete ? "" : "bad"}">${escapeXml(animation.label.slice(0, 36))}</text>`);
    text.push(`<text x="8" y="${y + 31}" class="muted">${animation.directions.length}/8 dirs · ${animation.frameCount} frames</text>`);
    canonicalPetDirections.forEach((direction, column) => {
      const x = labelWidth + column * cellWidth;
      text.push(`<text x="${x + 3}" y="${y + 14}" class="muted">${direction}</text>`);
      const frame = animation.frames[direction]?.[0] ?? (animation.source.directionIndependent ? firstFrame(animation) : undefined);
      if (frame) composites.push({ input: safeOutputPath(root, frame.path), left: x + cellPadding, top: y + headerHeight });
    });
  });
  text.push("</svg>");
  return sharp({ create: { width, height, channels: 4, background: { r: 32, g: 38, b: 50, alpha: 1 } } })
    .composite([{ input: Buffer.from(text.join("")), left: 0, top: 0 }, ...composites])
    .png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
}

function firstFrame(animation: PetAnimationDefinition): PetAnimationFrame | undefined {
  for (const direction of canonicalPetDirections) { const frame = animation.frames[direction]?.[0]; if (frame) return frame; }
  return undefined;
}

function verifyManifestPaths(manifest: PocketBuddyAnimationManifest, files: Set<string>): void {
  for (const animation of manifest.animations) for (const direction of manifest.directions) for (const frame of animation.frames[direction] ?? []) if (!files.has(frame.path)) throw new Error(`Manifest references missing output frame: ${frame.path}`);
  for (const path of [manifest.preview.thumbnailPath, manifest.preview.contactSheetPath].filter((value): value is string => Boolean(value))) if (!files.has(path)) throw new Error(`Manifest references missing preview file: ${path}`);
}

async function writeOutput(root: string, relativePath: string, buffer: Buffer, files: Array<{ path: string; sha256: string; bytes: number }>): Promise<void> {
  const path = safeOutputPath(root, relativePath); await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFile(path, buffer, { mode: 0o600 }); files.push({ path: relativePath, sha256: sha256(buffer), bytes: buffer.byteLength });
}

async function writeJson(root: string, relativePath: string, value: unknown, files: Array<{ path: string; sha256: string; bytes: number }>): Promise<void> {
  await writeOutput(root, relativePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"), files);
}

function safeOutputPath(root: string, relativePath: string): string {
  if (!relativePath || relativePath.includes("\\") || posix.isAbsolute(relativePath) || relativePath.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Unsafe output path: ${relativePath}`);
  const output = resolve(root, relativePath);
  if (output !== root && !output.startsWith(`${root}${sep}`)) throw new Error(`Output path escapes package root: ${relativePath}`);
  return output;
}

function inferImportDate(metadata: PixelLabMetadata): string {
  const dates = (metadata.states ?? []).map((state) => state.character?.created_at).filter((value): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value))).sort();
  return dates[0] ?? "1970-01-01T00:00:00.000Z";
}

function humanize(value: string): string {
  return value.replace(/^\[state\]\s*/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeXml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!); }
function sha256(buffer: Buffer): string { return createHash("sha256").update(buffer).digest("hex"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
