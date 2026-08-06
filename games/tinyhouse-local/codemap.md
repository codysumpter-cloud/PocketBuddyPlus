# TinyHouse local game codemap

## Responsibility

Public-safe browser house builder that uses a user-selected licensed TinyHouse
asset folder without committing or uploading the purchased image files. The
builder preserves the approved 128×64 projection while representing the house as
editable floor cells and wall/door edges. Cozy Mode adds local productivity,
ambience, room reactions, and a narrow Pocket Buddy+ host bridge.

## Files

- `index.html` — game shell, catalog, room layers, structure controls, and Cozy entry point.
- `styles.css` — pixel UI, room presentation, and local-folder gate.
- `house-grid.css` — editable floor/edge targets, working-door presentation, and Structure panel.
- `manifest.js` — metadata-only catalog: stable IDs, paths, dimensions, orientation, animation groups, support classes, and tabletop flags.
- `generated-recipes.js` — source-layer composition and spritesheet-slice recipes rendered locally in the browser.
- `local-assets.js` — validates the selected folder, creates temporary object URLs, renders generated frames, then releases the game boot promise.
- `app.js` — original exact isometric transforms, furnishing placement, animation state, selection, camera, and compatibility behavior.
- `house-grid-core.js` — canonical house topology: floor-cell coordinates, wall/door edge keys, projection helpers, bounds, room connectivity, working door state, connected-room creation, and serialization.
- `house-grid.js` — shared structure runtime, persistence boundary, fast/late plugin initialization, and public `TinyHouseStructure` API.
- `house-grid-render.js` — dynamic floor/wall/door rendering, camera fit, and full-house PNG export.
- `house-grid-editor.js` — Structure panel, floor/edge editing, connected-room actions, house-aware furnishing placement, and complete save/load.
- `drag-core.js` — pointer-offset and complete placement snapshot helpers, including structural wall-edge anchors.
- `drag-pointer-lock.js` — grab-point-locked drag preview and release snapping to the current editable floor set.
- `wall-core.js` — wall-mount classification and targeting restricted to wall edges that exist in the current house topology.
- `wall-mount.js` — wall-item placement UI, badges, canonical structural-edge persistence, metadata, and restoration.
- `cozy-core.js` — bounded Cozy state schema, task operations, timer reconciliation, statistics, room-reaction moods, import/export, and public host snapshot.
- `cozy.js` — Cozy panel, original Web Audio ambience, persistence, keyboard shortcuts, furniture reactions, and host bridge.
- `cozy.css` — Cozy panel, room lighting themes, responsive layout, and reduced-motion behavior.
- `test-contract.mjs` — public asset boundary and original gameplay contracts.
- `test-drag-contract.mjs` — pointer-lock and editable-grid release snapping.
- `test-wall-contract.mjs` — tabletop depth and canonical structural wall mounting.
- `test-house-grid-contract.mjs` — cell/edge topology, expansion, door connectivity, exact projection, persistence, clickable doors, and full-house export contract.
- `test-cozy-contract.mjs` — Cozy state, timer, integration, bridge, and no-upload checks.

## Structural invariants

- A floor is identified by integer `(column,row)` coordinates on one shared grid.
- A `left` or `right` edge has one canonical key and separates at most two adjacent cells.
- A wall blocks traversal. A closed door blocks traversal. An open door connects its two adjacent floor cells.
- Removing a floor invalidates furnishing placement on that cell and removes only edges that no longer touch any floor.
- Wall-mounted decor retains the canonical edge key, coordinates, and orientation across drag, duplicate, save, and load.
- The initial 5×5 structure renders with the exact same floor and wall coordinates as the previously verified fixed room.
- Purchased asset bytes never enter serialized house state, repository source, or host snapshots.
