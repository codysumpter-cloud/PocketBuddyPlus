import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canonicalPetDirections,
  parsePocketBuddyAnimationManifest,
  resolvePetAnimationId,
  resolvePetAnimationFrames,
  type PetAnimationDefinition,
} from "@open-pets/pet-format";
import { resolveManifestReactionAnimation } from "../src/reaction-animation-mapping.js";

const frame = (animation: string, direction: string, index = 0) => ({ path: `animations/${animation}/${direction}/frame_${String(index).padStart(3, "0")}.png` });
const complete = (id: string, originalName = id): PetAnimationDefinition => ({
  id,
  originalName,
  label: originalName,
  directions: canonicalPetDirections,
  frames: Object.fromEntries(canonicalPetDirections.map((direction) => [direction, [frame(id, direction)]])),
  frameCount: 1,
  durationMs: 240,
  iterations: id === "hop" ? 2 : "infinite",
  loopMode: id === "hop" ? "recover" : "loop",
  semanticTags: [id],
  source: { state: "Main", folder: `Main/animations/${originalName}` },
  complete: true,
});
const partial: PetAnimationDefinition = {
  ...complete("partial-bark", "Bark"),
  directions: ["south"],
  frames: { south: [frame("partial-bark", "south")] },
  complete: false,
  issues: ["Missing directions"],
};
const manifest = parsePocketBuddyAnimationManifest({
  version: "pocket-buddy-animation-manifest-v1",
  petId: "dynamic-pet",
  displayName: "Dynamic Pet",
  source: { kind: "pixellab", exportVersion: "3.1" },
  frameWidth: 60,
  frameHeight: 60,
  directions: canonicalPetDirections,
  animations: [complete("idle"), complete("head-tilt"), complete("run"), complete("hop"), partial],
  semanticDefaults: { idle: "idle", review: "head-tilt", running: "run", jumping: "hop", waving: "partial-bark" },
  motionMappings: { idle: "idle", "running-left": "run", "running-right": "run" },
  preview: { thumbnailPath: "preview.png", defaultAnimationId: "idle", defaultDirection: "south" },
  provenance: { sourceName: "fixture" },
});

assert.equal(resolveManifestReactionAnimation(manifest, "thinking", undefined), "head-tilt");
assert.equal(resolveManifestReactionAnimation(manifest, "thinking", { thinking: "missing" }), "head-tilt", "invalid overrides must fall back to semantic defaults");
assert.equal(resolveManifestReactionAnimation(manifest, "waving", { waving: "partial-bark" }), "idle", "incomplete animations must never resolve as reactions");
assert.equal(resolvePetAnimationId(manifest, "jumping", "hop", "jumping"), "hop");
assert.equal(resolvePetAnimationFrames(manifest.animations[2]!, "west")[0]?.path.includes("/west/"), true);
assert.equal(manifest.frameWidth, 60, "native dimensions must be preserved");

const root = process.env.OPENPETS_DESKTOP_ROOT ?? process.cwd();
const renderer = readFileSync(join(root, "src/renderer/src/main.tsx"), "utf8");
const preload = readFileSync(join(root, "pet-preload.cjs"), "utf8");
const windowSource = readFileSync(join(root, "src/pet-window.ts"), "utf8");
const windows = readFileSync(join(root, "src/windows.ts"), "utf8");
assert.match(renderer, /getReactionAnimationSettings\(\s*petId\?:\s*string\s*\)/, "Settings API must retrieve a selected pet catalogue");
assert.match(renderer, /reactionSettings\.selectedPetId/, "Settings must identify the pet being edited");
assert.match(renderer, /animation\.complete[^\n]*incomplete/, "incomplete animations must be marked or disabled");
assert.match(renderer, /openpets-installed:\/\/frame/, "Settings preview must use selected-pet manifest frames");
assert.match(windows, /set-reaction-animation-overrides/, "per-pet mappings need a dedicated validated IPC mutation");
assert.match(windowSource, /readInstalledPetAnimationManifest/, "runtime must load per-pet animation manifests");
assert.match(windowSource, /image-rendering:pixelated/, "runtime must preserve nearest-neighbor pixels");
assert.doesNotMatch(windowSource, /image-rendering:\s*(auto|smooth)/, "runtime must never enable smoothing");
assert.match(preload, /completedIterations >= iterations[\s\S]*reaction = catalog\.idle/, "finite reactions must recover to idle");
assert.match(preload, /const motionDirectionByState = Object\.freeze/, "runtime must centralize motion-to-direction resolution");
assert.match(preload, /"run-left": "west"/, "legacy run-left must keep selecting west frames");
assert.match(preload, /"run-right": "east"/, "legacy run-right must keep selecting east frames");
assert.match(preload, /"run-north-east": "north-east"/, "eight-way motion must select diagonal manifest frames");

console.log("Per-pet animation manifest, Settings, and runtime contracts passed.");
