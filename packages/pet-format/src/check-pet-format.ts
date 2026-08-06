import assert from "node:assert/strict";
import {
  canonicalPetDirections,
  getSelectablePetAnimations,
  normalizePetAnimationId,
  parsePocketBuddyAnimationManifest,
  resolvePetAnimationId,
  resolvePetAnimationFrames,
  pocketBuddyAnimationManifestVersion,
} from "./index.js";

const animation = {
  id: "idle",
  originalName: "Idle",
  label: "Idle",
  directions: [...canonicalPetDirections],
  frames: Object.fromEntries(canonicalPetDirections.map((direction) => [direction, [{ path: `animations/idle/${direction}/frame_000.png`, sha256: "a".repeat(64) }]])),
  frameCount: 1,
  durationMs: 140,
  iterations: "infinite" as const,
  loopMode: "loop" as const,
  semanticTags: ["idle"],
  source: { state: "Idle", folder: "Idle/animations/Idle" },
  complete: true,
};
const manifest = parsePocketBuddyAnimationManifest({
  version: pocketBuddyAnimationManifestVersion,
  petId: "test-pet",
  displayName: "Test Pet",
  source: { kind: "pixellab", exportVersion: "3.1" },
  frameWidth: 60,
  frameHeight: 60,
  directions: [...canonicalPetDirections],
  animations: [animation, { ...animation, id: "partial", originalName: "Partial", complete: false, directions: ["south"], frames: { south: animation.frames.south } }],
  semanticDefaults: { idle: "idle", waving: "partial" },
  motionMappings: { idle: "idle", "running-left": "idle", "running-right": "idle" },
  preview: { thumbnailPath: "preview.png", defaultAnimationId: "idle", defaultDirection: "south" },
  provenance: { sourceName: "fixture" },
});
assert.equal(manifest.frameWidth, 60);
assert.equal(manifest.animations[0]?.originalName, "Idle");
assert.equal(getSelectablePetAnimations(manifest).length, 1);
assert.equal(resolvePetAnimationId(manifest, "waving", "missing", "idle"), "idle");
assert.equal(resolvePetAnimationFrames(manifest.animations[0]!, "west").length, 1);
assert.equal(normalizePetAnimationId("  Ani Idle_Battle!! "), "ani-idle-battle");
assert.throws(() => parsePocketBuddyAnimationManifest({ ...manifest, animations: [{ ...animation, frames: { south: [{ path: "../escape.png" }] } }] }));
console.log("Pet animation manifest contract passed.");
