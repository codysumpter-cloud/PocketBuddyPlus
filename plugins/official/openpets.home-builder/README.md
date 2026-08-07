# Home Builder

Buddy's isometric room as a Pocket Buddy+ plugin: paint floors, place furniture,
move the player, and use objects, with one canonical world state.

## Why this one is built rather than hand-written

Every other official plugin is a hand-written standalone file. This one is
compiled from `src/` by `scripts/build-plugins.mjs`, because the sandbox leaves
no other option:

- A panel ships as a single HTML file capped at 1 MiB, and there is no script
  asset kind, so all panel JavaScript has to be inline.
- Home previously ran on Phaser, which is 1.31 MiB minified. It is replaced by
  `src/canvas-engine.ts`, a small Phaser-shaped shim over a 2D canvas, so the
  drawing and picking code carried over unchanged.
- The room rules (~1,500 lines of floor, wall and play-state logic) live in
  `@open-pets/buddy-domain`. Copying them in by hand would fork the game rules
  away from the package that tests them, so the sources import normally and the
  build inlines them.

The built `index.js` and `home.html` are committed because they are what ships.
`pnpm plugins:build:check` fails if they are stale.

```bash
pnpm plugins:build
```

## Saves

Panel storage is cleared when the panel closes, so the host owns the save. The
panel asks for it once before mounting and writes back through the message
channel; `src/index.ts` confines those writes to the two Home keys and bounds
their size.
