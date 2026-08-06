# Per-pet animation manifests

Pocket Buddy+ supports optional, versioned animation catalogues alongside the existing `pet.json` and `spritesheet.webp` compatibility files.

## Package layout

```text
pet.json
spritesheet.webp                 # compatibility/static fallback
animation-manifest.json          # pocket-buddy-animation-manifest-v1
preview.png
contact-sheet.png
animations/<animation>/<direction>/frame_000.png
generation-receipt.json
validation-receipt.json
```

`pet.json` advertises the extension through `animationManifestPath: "animation-manifest.json"`. Packages without the field continue to use the original fixed-grid spritesheet renderer.

## Manifest v1

`pocket-buddy-animation-manifest-v1` records the pet identity, native frame dimensions, canonical source directions, arbitrary validated animation IDs, original source names, per-direction frame paths and offsets, timing, finite or infinite iterations, semantic tags, source folders, completeness issues, reaction defaults, motion mappings, previews, and provenance.

The parser rejects unsafe paths, invalid dimensions, duplicate IDs, inconsistent frame counts, undeclared directions, and animations falsely marked complete while missing required directions. An incomplete source animation remains visible for audit but cannot be selected for a reaction.

## Reaction resolution

Reaction mappings are persisted per pet. The legacy global `reactionAnimationOverrides` field remains readable and migrates into the built-in pet entry without being discarded.

Resolution order is:

1. selected pet's explicit reaction override;
2. selected pet's semantic default;
3. canonical built-in animation ID when that exact animation exists;
4. selected pet's complete idle animation;
5. first complete animation;
6. a safe static frame from the package.

Removed, incomplete, or unknown animation IDs never reach the pet renderer. Finite reactions recover to idle after their declared iteration count. Desktop movement uses manifest `running-left` and `running-right` mappings and chooses west/east source directions respectively.

## PixelLab export 3.1

`@open-pets/pixel-asset-pipeline` is the reusable importer for PixelLab export version 3.1. It:

- validates ZIP entry paths, counts, sizes, compression, and special-file types;
- parses every selected state, rotation, animation, direction, and indexed frame;
- preserves original names, native transparent PNG bytes, dimensions, and eight-direction data;
- creates stable normalized IDs and records collisions deterministically;
- detects missing directions and missing indexed frames;
- supports variable dimensions and frame counts;
- optionally repairs an indexed gap by duplicating the nearest source frame and records the repair;
- validates alpha, clipping risk, palette size, isolated pixels, contact-point drift, scale drift, temporal discontinuity, paths, and hashes;
- emits a manifest, compatibility sprite, preview, contact sheet, generation receipt, and validation receipt.

The renderer and previews use nearest-neighbor image rendering. No importer path resizes the source frames to the built-in 192×208 grid.

## Licensed-asset boundary

Importer code, schemas, recipes, tests, and validation metadata may live in this public repository. User-owned PixelLab archives, generated frame packages, and purchased Pixel Salvaje body/clothing assets remain outside public Git history and are installed locally through the existing pet package contract.
