# PrismPixel Rig Studio plugin

An official PocketBuddy+ SDK v3 panel plugin that brings the modular-outfit part of PrismPixel Rig Studio into the companion app.

The panel accepts a bare/body sprite sheet and a frame-aligned baked outfit sheet, extracts overlay and erase-mask frames, previews exact recomposition, and exports:

- `prismpixel-outfit-item-v1`
- overlay PNG sheet
- erase-mask PNG sheet
- `prismpixel-baked-character-state-v1`

The plugin uses the host `files` save surface because plugin-panel downloads are intentionally blocked by PocketBuddy+'s sandbox.
