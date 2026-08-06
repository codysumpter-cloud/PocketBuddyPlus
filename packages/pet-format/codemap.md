# packages/pet-format/

Versioned pet-package and animation-manifest contracts shared by the desktop host, installers, and asset pipelines.

## Responsibility

- Validates `pocket-buddy-animation-manifest-v1` without touching the filesystem.
- Defines canonical eight-direction names, semantic animation defaults, motion mappings, frame offsets, loop/recovery behavior, and provenance.
- Keeps arbitrary per-pet animation IDs while preserving the original source animation name.
- Provides safe fallback resolution for removed, incomplete, or invalid animation IDs.

## Boundary

This package owns data contracts only. ZIP parsing, image validation, frame copying, contact-sheet generation, and installation belong to the asset pipeline and host packages.
