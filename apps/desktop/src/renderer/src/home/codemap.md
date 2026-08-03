# Home renderer codemap

## Responsibility

This folder contains the Phaser-powered real-time Home canvas used by the Pocket Buddy+ Electron renderer. It owns presentation and direct manipulation only. Canonical room, orientation, placement, tile, and save validation live in `@open-pets/buddy-domain`.

## Files

- `phaser-home.ts`
  - mounts and destroys the Phaser game inside a caller-owned DOM element;
  - creates the placeholder isometric Home scene;
  - projects canonical cells for all four room orientations;
  - performs pointer hit testing and click/drag floor painting;
  - renders placeholder walls and Buddy graphics;
  - persists an isolated preview document after strict domain parsing;
  - exposes a narrow controller for brush selection, rotation, reset, and teardown.

## Data flow

1. `home-ui.ts` owns the React-adjacent application shell and mounts this canvas.
2. Toolbar intentions are emitted through `PhaserHomeController`.
3. The scene applies immutable operations from `@open-pets/buddy-domain`.
4. Phaser draws the resulting canonical snapshot; it does not become state authority.
5. Preview persistence uses `pocket-buddy-plus:phaser-home:v1`, isolated from Godot and future main-process Home saves.

## Invariants

- No purchased source art is committed here.
- No Godot save is read or modified directly.
- Destroying the modal must destroy the Phaser instance and detach listeners.
- Phaser-specific coordinates never enter canonical room or tile documents.
- Durable production persistence must move behind a narrow preload API before this surface becomes authoritative.
