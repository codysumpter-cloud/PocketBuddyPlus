# TinyHouse local-asset game

Pocket Buddy+ includes a public-safe HTML house builder at
`games/tinyhouse-local/index.html`. It recreates the TinyHouse-style interior
building workflow while keeping the purchased Pixel Salvaje image files outside
the public repository.

## Runtime boundary

The checked-in code owns house topology, exact isometric projection, snapping,
animation grouping, tabletop relationships, wall mounting, save/load/export,
the local asset loader, and the Cozy Mode productivity layer. The player owns the
licensed TinyHouse 0.17 files and selects the extracted folder at startup. The
browser creates temporary object URLs; the files are not uploaded or copied into
the workspace.

This boundary is intentional. The asset pack may be edited and used in projects,
but its source assets may not be redistributed. The repository therefore stores
only filenames, dimensions, animation recipes, interaction metadata, structure
coordinates, and original Prismtek UI/runtime code.

## Editable house topology

The initial presentation remains the previously verified 5×5 room, but it is now
backed by a real structural model rather than a fixed rectangular render:

- floor tiles are addressable integer cells on one 128×64 isometric grid;
- walls and doors are canonical left/right edges between adjacent cells;
- individual floors and edges can be added or removed;
- the structure can expand beyond the original bounds or shrink to an irregular footprint;
- interior walls split the floor graph into separate connected zones;
- a structural door replaces an edge, animates, and changes graph connectivity when opened or closed;
- connected room actions append new cells to the same coordinate system rather than drawing an unrelated room mockup;
- furnishing placement and drag release snap only to floor cells that currently exist;
- wall-mounted objects target only wall edges that currently exist and persist against canonical edge keys;
- one house save contains structure, furnishings, wall placements, and door states;
- PNG export renders the complete edited footprint and its current doors.

`house-grid-core.js` owns the serializable topology and connectivity rules.
`house-grid.js`, `house-grid-render.js`, and `house-grid-editor.js` own the
structure runtime, visual projection, editing controls, and integration with the
existing builder. The exact projection helpers remain shared so the default
room's floor and wall placement does not move.

## Furnishing and Cozy behavior

The house builder retains pointer-locked furniture dragging, tabletop attachment,
wall mounting, grouped animation states, catalog search, camera controls, and Cozy
Mode. Cozy Mode continues to publish only bounded productivity state and never
publishes licensed asset handles, image bytes, or the private house save.

## Open-source design references

The implementation is original Prismtek code. No third-party source, art, audio,
or models are vendored. Design patterns were evaluated from Pixel Agents,
Pomotroid, and Magenta Lo-Fi Player. See
`docs/tinyhouse-cozy-reference-notes.md` for the adoption boundary.

## Verification

The root `pnpm test:tinyhouse-local` command runs behavior contracts for the
original asset boundary, pointer dragging, structural wall mounting, editable
house topology, and Cozy Mode. The house-grid contract specifically protects:

- the initial 25-cell/10-edge structure;
- exact expanded-cell projection;
- individual floor removal and growth beyond 5×5;
- connected-room creation;
- closed/open door traversal behavior;
- lossless topology persistence;
- full-house export wiring.
