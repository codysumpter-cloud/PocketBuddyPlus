# TinyHouse local game codemap

## Responsibility

Public-safe browser room builder that uses a user-selected licensed TinyHouse
asset folder without committing or uploading the purchased image files.

## Files

- `index.html` — game shell, notebook catalog, room layers, and controls.
- `styles.css` — pixel UI, room presentation, and local-folder gate.
- `manifest.js` — metadata-only catalog: stable IDs, paths, dimensions,
  orientation, animation groups, support classes, and tabletop flags.
- `generated-recipes.js` — source-layer composition and spritesheet-slice recipes
  for frames generated locally in the browser.
- `local-assets.js` — validates the selected folder, creates temporary object
  URLs, renders generated frames, then releases the game boot promise.
- `app.js` — isometric transforms, placement, snapping, support relationships,
  animation state, persistence, selection, camera, and export behavior.
- `test-contract.mjs` — public asset boundary and gameplay contract checks.
