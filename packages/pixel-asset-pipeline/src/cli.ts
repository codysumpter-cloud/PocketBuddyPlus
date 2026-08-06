#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importPixelLabExport, inferPixelLabPackageSpec, type PixelLabPackageSpec } from "./index.js";

const args = process.argv.slice(2);
const [archive, output, ...flags] = args;
if (!archive || !output) {
  console.error("Usage: openpets-import-pixellab <archive.zip> <output-dir> [--spec package-spec.json] [--pet-id <id>] [--display-name <name>] [--description <text>] [--repair-missing-frames]");
  process.exitCode = 2;
} else {
  const readFlag = (name: string): string | undefined => { const index = flags.indexOf(name); return index >= 0 ? flags[index + 1] : undefined; };
  const archivePath = resolve(archive);
  const specPath = readFlag("--spec");
  let packageSpec: PixelLabPackageSpec = specPath
    ? JSON.parse(await readFile(resolve(specPath), "utf8")) as PixelLabPackageSpec
    : await inferPixelLabPackageSpec(archivePath);
  packageSpec = {
    ...packageSpec,
    ...(readFlag("--pet-id") ? { petId: readFlag("--pet-id")! } : {}),
    ...(readFlag("--display-name") ? { displayName: readFlag("--display-name")! } : {}),
    ...(readFlag("--description") ? { description: readFlag("--description")! } : {}),
  };
  const result = await importPixelLabExport(archivePath, resolve(output), {
    package: packageSpec,
    repairMissingIndexedFrames: flags.includes("--repair-missing-frames"),
  });
  console.log(JSON.stringify({ outputDirectory: result.outputDirectory, petId: result.manifest.petId, animations: result.manifest.animations.length, repairs: result.repairs, issues: result.issues }, null, 2));
}
