# Prismtek creator plugins

PocketBuddy+ includes two official, user-invoked creator-tool plugins sourced from the canonical Prismtek product monorepo's workflows.

## PrismPixel Rig Studio

Plugin id: `openpets.prismpixel-rig-studio`

The panel imports matching bare and dressed sprite sheets, slices them with one shared grid, and extracts a modular outfit using paired overlay and erase-mask frames. This supports silhouette-changing clothing such as robes, hoods, capes, armor, and held items while retaining the canonical animation frame order.

Exports:

- `prismpixel-outfit-item-v1`
- overlay sprite sheet
- erase-mask sprite sheet
- `prismpixel-baked-character-state-v1`

The panel validates exact frame recomposition before marking the item valid.

## Prismcade Creator

Plugin id: `openpets.prismcade-creator`

The panel provides the manifest-first part of Prismcade Creator: project template selection, system selection, render metadata, and outfit-aware character recipes.

Exports:

- `prismcade-game-manifest-v1`
- `prismcade-character-recipe-v1`

## Security boundary

Both tools are explicit user-invoked sandboxed panels. They:

- request only `commands`, `files`, and `ui:panel`;
- load no remote content;
- cannot navigate outside their installed plugin directory;
- use the PocketBuddy+ host save dialog instead of browser downloads;
- do not include purchased Prismtek or third-party art assets.

They are official catalog plugins, not default-enabled companion behaviors.
