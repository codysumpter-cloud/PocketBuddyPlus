# TinyHouse local game codemap

## Responsibility

Public-safe browser room builder that uses a user-selected licensed TinyHouse
asset folder without committing or uploading the purchased image files. Cozy
Mode adds local productivity, ambience, room reactions, and a narrow Pocket
Buddy+ host bridge without changing the verified builder geometry or loader.

## Files

- `index.html` — game shell, notebook catalog, room layers, controls, and Cozy entry point.
- `styles.css` — pixel UI, room presentation, and local-folder gate.
- `manifest.js` — metadata-only catalog: stable IDs, paths, dimensions,
  orientation, animation groups, support classes, and tabletop flags.
- `generated-recipes.js` — source-layer composition and spritesheet-slice recipes
  for frames generated locally in the browser.
- `local-assets.js` — validates the selected folder, creates temporary object
  URLs, renders generated frames, then releases the game boot promise.
- `app.js` — isometric transforms, placement, snapping, support relationships,
  animation state, persistence, selection, camera, and export behavior.
- `cozy-core.js` — bounded Cozy state schema, task operations, timer reconciliation,
  statistics, room-reaction moods, import/export, and public host snapshot.
- `cozy.js` — Cozy panel, original Web Audio ambience, persistence, keyboard
  shortcuts, furniture reactions, and `BroadcastChannel`/`postMessage` bridge.
- `cozy.css` — pixel-styled Cozy panel, room lighting themes, responsive layout,
  focus states, and reduced-motion behavior.
- `test-contract.mjs` — public asset boundary and gameplay contract checks.
- `test-cozy-contract.mjs` — Cozy state, timer, integration, bridge, and no-upload checks.
