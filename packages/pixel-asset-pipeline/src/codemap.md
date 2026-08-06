# packages/pixel-asset-pipeline/src/

- `index.ts`: safe ZIP reader, PixelLab 3.1 parser, deterministic package builder, contact-sheet/preview generation, gap repair, and asset validator.
- `cli.ts`: command-line import entrypoint for future PixelLab exports.
- `check-pixellab-importer.ts`: synthetic export tests for traversal rejection, stable IDs, dimensions, variable frame counts, missing directions/indices, partial animations, 16-frame cycles, and deterministic repair.
