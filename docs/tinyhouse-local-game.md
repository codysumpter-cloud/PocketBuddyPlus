# TinyHouse local-asset game

Pocket Buddy+ includes a public-safe HTML room builder at
`games/tinyhouse-local/index.html`. It recreates the TinyHouse-style interior
building workflow while keeping the purchased Pixel Salvaje image files outside
the public repository.

## Runtime boundary

The checked-in code owns room geometry, snapping, animation grouping, tabletop
relationships, save/load behavior, and the local asset loader. The player owns
the licensed TinyHouse 0.17 files and selects the extracted folder at startup.
The browser creates temporary object URLs; the files are not uploaded or copied
into the workspace.

This boundary is intentional. The asset pack may be edited and used in projects,
but its source assets may not be redistributed. The repository therefore stores
only filenames, dimensions, animation recipes, and interaction metadata.

## Shipped behavior

- 5×5 exact 128px isometric floor with left and right wall planes
- shared floor/wall transform and six seam invariants
- half-cell placement and forgiving edge clamping
- tabletop support attachment, transfer, parent-following movement, and save/load
- 33 grouped animation/state definitions
- 35 client-generated frames for layered drawers/doors and the cleaning-robot sheet
- asset search, paging, selection, duplication, depth, flip, pan, zoom, reset, and PNG export

## Verification

`games/tinyhouse-local/test-contract.mjs` is registered as
`pnpm test:tinyhouse-local` and runs in the root test command. It verifies the
geometry constants, animation-group count, generated-frame recipes, tabletop
contracts, folder loader, and the absence of embedded purchased image data.

Browser acceptance additionally selects a real user-owned 0.17 folder and checks
that the room renders 25 floors, five tiles on each wall plane, default tabletop
attachment, mapped television assets, and zero page errors.
