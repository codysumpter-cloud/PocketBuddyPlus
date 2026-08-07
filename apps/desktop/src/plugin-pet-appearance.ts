import { stat } from "node:fs/promises";
import { join } from "node:path";

import { app } from "electron";
import sharp from "sharp";
import type { PetDirection } from "@open-pets/pet-format";

import { getAppStateSnapshot } from "./app-state.js";
import { builtInPet } from "./built-in-pet.js";
import { getInstalledPetAnimationFrame, readInstalledPetAnimationManifest } from "./pet-animation-manifest.js";
import { getInstalledPetDir } from "./pet-paths.js";
import { defaultPetSprite } from "./reaction-animation-mapping.js";

export interface PluginPetAppearance {
  readonly petHandleId: "default";
  readonly installedPetId: string;
  readonly displayName: string;
  readonly frameDataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly animationId: string;
  readonly direction: PetDirection;
  readonly source: "manifest-frame" | "legacy-sheet";
}

const maxSourceSheetBytes = 100 * 1024 * 1024;
const maxRenderedFrameBytes = 4 * 1024 * 1024;

/**
 * Return one bounded, rendered idle frame for the user's canonical default pet.
 * Plugins never receive the installed pet path, spritesheet path, or arbitrary
 * asset bytes through this surface. Home uses this to draw the same Buddy the
 * desktop pet window represents without creating a second pet identity.
 */
export async function getPluginPetAppearance(petHandleId: string): Promise<PluginPetAppearance> {
  if (petHandleId !== "default") throw new Error("Appearance is currently available only for the default Buddy.");

  const state = getAppStateSnapshot();
  const selected = state.pets.installed.find((pet) => pet.id === state.preferences.defaultPetId && !pet.broken)
    ?? state.pets.installed.find((pet) => pet.id === builtInPet.id && !pet.broken)
    ?? builtInPet;
  const installedPetId = selected.id;
  const displayName = selected.displayName;

  if (!selected.builtIn) {
    const manifest = await readInstalledPetAnimationManifest(installedPetId).catch(() => null);
    if (manifest) {
      const animationId = manifest.semanticDefaults.idle
        ?? manifest.animations.find((animation) => animation.complete)?.id
        ?? manifest.animations[0]?.id;
      if (!animationId) throw new Error("The active Buddy has no renderable animation.");
      const direction = (manifest.directions.includes("south") ? "south" : manifest.directions[0] ?? "south") as PetDirection;
      const frame = await getInstalledPetAnimationFrame(installedPetId, animationId, direction, 0);
      if (frame.buffer.byteLength > maxRenderedFrameBytes) throw new Error("The active Buddy preview frame is too large.");
      return {
        petHandleId: "default",
        installedPetId,
        displayName,
        frameDataUrl: `data:${frame.contentType};base64,${frame.buffer.toString("base64")}`,
        width: manifest.frameWidth,
        height: manifest.frameHeight,
        animationId,
        direction,
        source: "manifest-frame",
      };
    }
  }

  const sourcePath = selected.builtIn
    ? join(app.getAppPath(), "assets", defaultPetSprite.fileName)
    : join(getInstalledPetDir(installedPetId), "spritesheet.webp");
  const info = await stat(sourcePath);
  if (!info.isFile() || info.size <= 0 || info.size > maxSourceSheetBytes) throw new Error("The active Buddy spritesheet is unavailable.");
  const idle = defaultPetSprite.states.idle;
  const frame = await sharp(sourcePath)
    .extract({
      left: 0,
      top: idle.row * defaultPetSprite.frameHeight,
      width: defaultPetSprite.frameWidth,
      height: defaultPetSprite.frameHeight,
    })
    .png()
    .toBuffer();
  if (frame.byteLength > maxRenderedFrameBytes) throw new Error("The active Buddy preview frame is too large.");
  return {
    petHandleId: "default",
    installedPetId,
    displayName,
    frameDataUrl: `data:image/png;base64,${frame.toString("base64")}`,
    width: defaultPetSprite.frameWidth,
    height: defaultPetSprite.frameHeight,
    animationId: "idle",
    direction: "south",
    source: "legacy-sheet",
  };
}
