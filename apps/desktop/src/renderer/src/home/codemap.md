# Home renderer codemap

## Responsibility

This folder contains the Phaser-powered real-time Home canvas used by the Pocket Buddy+ Electron renderer. It owns presentation, input, and direct manipulation only. Canonical room geometry, furniture footprints, object affordances, actor movement, Buddy needs, elapsed-time decisions, and save validation live in `@open-pets/buddy-domain`.

## Files

- `phaser-home.ts`
  - mounts and destroys the Phaser game inside a caller-owned DOM element;
  - projects canonical cells for all four camera corners;
  - renders the floor, donor-aligned cutaway walls, starter furniture, the Human player, and Buddy;
  - supports Play, Paint, Place, and Remove modes;
  - performs pointer hit testing, floor painting, item placement/removal, player movement, petting, and object use;
  - advances Buddy from an injected wall-clock second value rather than animation frames;
  - persists isolated schema-v2 preview state and migrates the old schema-v1 floor preview;
  - exposes a narrow controller for the DOM toolbar.

## Data flow

1. `home-ui.ts` owns the accessible application shell and mounts this canvas.
2. Toolbar and keyboard intentions are emitted through `PhaserHomeController`.
3. The scene calls immutable operations from `@open-pets/buddy-domain`.
4. The domain returns canonical room and play snapshots; Phaser only draws them.
5. The public catalog supplies stable placeholder ids, footprints, affordances, and colors. A private release manifest may replace presentation assets without changing behavior.
6. Preview persistence uses `pocket-buddy-plus:phaser-home:v2`, isolated from Godot and future main-process Home saves.

## Current playable behavior

- separate player and Buddy positions;
- WASD/arrow and on-screen movement;
- Buddy need drift, mood evaluation, thoughts, autonomous target choice, and object use;
- bed/rest, bowl/feed, ball/play, chair/sit, plant/water, and television power/channel state;
- canonical collision against furniture footprints;
- starter room reset, floor reset, room rotation, and close/reopen persistence.

## Invariants

- No purchased source art is committed here.
- No Godot save is read or modified directly.
- Destroying the modal must destroy the Phaser instance and detach listeners.
- Phaser coordinates never enter canonical documents.
- The simulation clock is explicit and deterministic; frame rate cannot advance needs.
- Furniture visuals may be replaced, but ids, footprints, actions, and state keys require migrations or parity evidence.
- Production persistence must move behind a narrow main-process preload API before this surface becomes authoritative across Desktop, Home, and the Buddy+ hub.
