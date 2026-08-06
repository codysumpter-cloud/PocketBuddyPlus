# packages/pixel-asset-pipeline/

Reusable deterministic import and validation tooling for PixelLab export archives.

## Responsibilities

- Safely reads PixelLab export `3.1` ZIP archives and rejects traversal, absolute paths, symlinks, encrypted entries, collisions, excessive sizes, and unsupported compression.
- Preserves native transparent PNG frames and every source state, animation, direction, frame count, and original animation name.
- Normalizes stable per-pet animation IDs without constraining application code to known packs.
- Detects missing directions and indexed-frame gaps; optional deterministic gap repair duplicates the nearest temporal source frame and records the repair.
- Produces `pet.json`, `animation-manifest.json`, normalized frame folders, lossless fallback preview, contact sheet, provenance/import receipt, and asset-validation receipt.
- Validates native dimensions, alpha, clipping, ground contact, scale drift, palette growth, isolated noise, temporal consistency, hashes, and manifest paths.

## Boundaries

The package never calls PixelLab or reads credentials. API generation belongs to repository-owned generation scripts and must write separate receipts. The importer never invents missing semantic animations and never marks partial-direction source art complete unless an explicit direction-independent policy is supplied.
