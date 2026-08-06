# TinyHouse local-asset game

Pocket Buddy+ includes a public-safe HTML room builder at
`games/tinyhouse-local/index.html`. It recreates the TinyHouse-style interior
building workflow while keeping the purchased Pixel Salvaje image files outside
the public repository.

## Runtime boundary

The checked-in code owns room geometry, snapping, animation grouping, tabletop
relationships, save/load behavior, the local asset loader, and the Cozy Mode
productivity layer. The player owns the licensed TinyHouse 0.17 files and selects
the extracted folder at startup. The browser creates temporary object URLs; the
files are not uploaded or copied into the workspace.

This boundary is intentional. The asset pack may be edited and used in projects,
but its source assets may not be redistributed. The repository therefore stores
only filenames, dimensions, animation recipes, interaction metadata, and original
Prismtek UI/runtime code.

## Shipped behavior

- 5×5 exact 128px isometric floor with left and right wall planes
- shared floor/wall transform and six seam invariants
- half-cell placement and forgiving edge clamping
- tabletop support attachment, transfer, parent-following movement, and save/load
- 33 grouped animation/state definitions
- 35 client-generated frames for layered drawers/doors and the cleaning-robot sheet
- asset search, paging, selection, duplication, depth, flip, pan, zoom, reset, and PNG export

## Cozy Mode

`cozy-core.js`, `cozy.js`, and `cozy.css` extend the verified builder without
changing its geometry or local-asset loader. Cozy Mode provides:

- wall-clock focus and break timers that reconcile after tab sleep
- persistent tasks, active-task selection, memos, session totals, and streaks
- original dependency-free Web Audio ambience generated locally
- theme lighting and room-object reactions
- JSON import/export
- a narrow public snapshot and host bridge through `BroadcastChannel`,
  `postMessage`, a custom DOM event, and `window.TinyRoomCozy`

The bridge shares only the current theme, Buddy mood, active task text, timer
summary, ambience enabled state, and aggregate statistics. It does not expose
licensed file handles, object URLs, room asset bytes, memo content, or unrelated
Pocket Buddy+ data.

## Open-source design references

The implementation is original Prismtek code. No third-party source, art, audio,
or models are vendored. Design patterns were evaluated from:

- Pixel Agents — persistent room layouts, external asset directories, and animated room occupants
- Pomotroid — compact focus workflow, wall-clock timer behavior, and session statistics
- Magenta Lo-Fi Player — object-driven ambience as an interaction concept

See `docs/tinyhouse-cozy-reference-notes.md` for the adoption boundary.

## Verification

`games/tinyhouse-local/test-contract.mjs` verifies the original builder contracts.
`games/tinyhouse-local/test-cozy-contract.mjs` verifies the Cozy state contract,
timer behavior, integration entry points, and public-safe asset boundary. Both run
through `pnpm test:tinyhouse-local`, which remains part of the root test command.
