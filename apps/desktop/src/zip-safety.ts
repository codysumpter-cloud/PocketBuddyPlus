import { posix, resolve, sep } from "node:path";

const rootFiles = new Set([
  "pet.json",
  "spritesheet.webp",
  "animation-manifest.json",
  "preview.png",
  "contact-sheet.png",
  "generation-receipt.json",
  "validation-receipt.json",
]);

const animationIdPattern = /^[a-z0-9][a-z0-9._-]{0,126}$/;
const directionPattern = /^(south|south-east|east|north-east|north|north-west|west|south-west)$/;
const framePattern = /^frame_[0-9]{3,6}\.png$/;

export interface SafeZipEntryPath {
  readonly originalName: string;
  readonly normalizedName: string;
  readonly topLevelDirectory: string;
  readonly relativeOutputPath: string | null;
  readonly isDirectory: boolean;
}

export class ZipEntryPathTracker {
  readonly #normalizedPaths = new Set<string>();
  readonly #caseFoldedPaths = new Set<string>();
  #topLevelDirectory: string | null = null;

  accept(fileName: string): SafeZipEntryPath {
    const entry = validateZipEntryName(fileName, this.#topLevelDirectory);
    if (this.#topLevelDirectory !== null && entry.topLevelDirectory !== this.#topLevelDirectory) {
      throw new Error("Zip contains mixed or multiple top-level layouts.");
    }
    this.#topLevelDirectory ??= entry.topLevelDirectory;

    if (this.#normalizedPaths.has(entry.normalizedName)) throw new Error(`Duplicate zip entry path: ${entry.normalizedName}`);
    const caseFolded = entry.normalizedName.toLocaleLowerCase("en-US");
    if (this.#caseFoldedPaths.has(caseFolded)) throw new Error(`Case-insensitive zip entry collision: ${entry.normalizedName}`);
    this.#normalizedPaths.add(entry.normalizedName);
    this.#caseFoldedPaths.add(caseFolded);
    return entry;
  }
}

export function validateZipEntryName(fileName: string, expectedTopLevel: string | null = null): SafeZipEntryPath {
  if (fileName.includes("\0")) throw new Error("Zip entry contains NUL byte.");
  if (fileName.includes("\\")) throw new Error("Zip entry contains backslash separator.");
  if (fileName.startsWith("/") || fileName.startsWith("//")) throw new Error("Zip entry is absolute.");
  if (/^[a-zA-Z]:\//.test(fileName)) throw new Error("Zip entry contains Windows drive path.");
  if (fileName.includes("//")) throw new Error("Zip entry contains empty path segment.");

  const parts = fileName.split("/").filter(Boolean);
  if (!parts.length) throw new Error("Zip entry path is empty.");
  if (parts.some((part) => part === "..")) throw new Error("Zip entry contains parent traversal.");
  if (parts.some((part) => part === ".")) throw new Error("Zip entry contains current-directory segment.");
  if (parts.some((part) => part.startsWith("."))) throw new Error("Zip entry contains hidden path segment.");
  if (parts.some((part) => part.includes(":"))) throw new Error("Zip entry contains an invalid path segment.");

  const rootLayout = rootFiles.has(parts[0]!) || parts[0] === "animations";
  const topLevelDirectory = rootLayout ? "" : parts[0]!;
  if (expectedTopLevel !== null && topLevelDirectory !== expectedTopLevel) throw new Error("Zip contains mixed or multiple top-level layouts.");
  const relativeParts = topLevelDirectory ? parts.slice(1) : parts;
  if (!relativeParts.length) {
    if (!fileName.endsWith("/")) throw new Error("Zip wrapper directory must be a directory entry.");
    return { originalName: fileName, normalizedName: parts.join("/"), topLevelDirectory, relativeOutputPath: null, isDirectory: true };
  }

  const isDirectory = fileName.endsWith("/");
  const relativeOutputPath = relativeParts.join("/");
  if (isDirectory) {
    validatePackageDirectory(relativeParts);
    return { originalName: fileName, normalizedName: parts.join("/"), topLevelDirectory, relativeOutputPath: null, isDirectory: true };
  }
  validatePackageFile(relativeParts);
  return { originalName: fileName, normalizedName: parts.join("/"), topLevelDirectory, relativeOutputPath, isDirectory: false };
}

function validatePackageDirectory(parts: readonly string[]): void {
  if (parts.length === 1 && parts[0] === "animations") return;
  if (parts.length === 2 && parts[0] === "animations" && animationIdPattern.test(parts[1]!)) return;
  if (parts.length === 3 && parts[0] === "animations" && animationIdPattern.test(parts[1]!) && directionPattern.test(parts[2]!)) return;
  throw new Error(`Unexpected zip directory: ${parts.join("/")}`);
}

function validatePackageFile(parts: readonly string[]): void {
  if (parts.length === 1 && rootFiles.has(parts[0]!)) return;
  if (parts.length === 4 && parts[0] === "animations" && animationIdPattern.test(parts[1]!) && directionPattern.test(parts[2]!) && framePattern.test(parts[3]!)) return;
  throw new Error(`Unexpected zip file: ${parts.join("/")}`);
}

export function assertOutputPathInside(tempDir: string, outputPath: string): void {
  const root = resolve(tempDir);
  const target = resolve(outputPath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("Zip entry output path escapes temp directory.");
}

export function hasSupportedZipMagic(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  const signature = buffer.readUInt32LE(0);
  return signature === 0x04034b50 || signature === 0x06054b50;
}

export function assertRejectsPath(fileName: string): void {
  try { validateZipEntryName(fileName); } catch { return; }
  throw new Error(`Unsafe zip path was accepted: ${fileName}`);
}

export function isAllowedPetPackagePath(relativePath: string): boolean {
  try {
    const normalized = posix.normalize(relativePath);
    if (normalized !== relativePath || normalized.startsWith("../")) return false;
    validatePackageFile(relativePath.split("/"));
    return true;
  } catch {
    return false;
  }
}
