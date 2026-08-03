# Phaser Home architecture

## Decision

Pocket Buddy+ uses **Phaser 4.2.1** as the 2D game engine for Home, Play, and interactive Studio previews.

- Electron owns the native desktop shell, packaging, filesystem access, and eventual durable state host.
- React owns navigation, toolbars, forms, inspectors, and accessibility.
- Phaser owns scenes, cameras, tilemap presentation, animation, input, particles, effects, and physics where needed.
- `@open-pets/buddy-domain` owns canonical Buddy, room, placement, orientation, tile-painting, and save contracts.
- Godot remains a read-only donor, behavioral oracle, visual reference, and temporary playable implementation during migration. It is not embedded in Electron and must never write the same save as Phaser.

## Why Phaser

PixiJS is a strong renderer, but Pocket Buddy+ needs reusable game systems across Home, Home Builder, Buddy Ascent, Pocket Bird, skating, and later Prismcade experiences. Phaser supplies the scene, camera, input, animation, tilemap, particle, and physics infrastructure that would otherwise need to be rebuilt on top of Pixi.

The domain remains renderer-independent, so selecting Phaser does not make Phaser authoritative over room or Buddy state.

## First vertical slice

The initial Phaser Home surface is deliberately small and uses no purchased art. It provides:

- an 8×6 isometric floor;
- four canonical room orientations;
- wood, stone, grass, and water brushes;
- click-and-drag painting, erase, and reset;
- a placeholder Buddy;
- isolated Pocket Buddy+ preview persistence;
- immutable, validated floor-tile state in `@open-pets/buddy-domain`.

The preview is launched from a new **Home** navigation entry in the existing Pocket Buddy+ Control Center. It proves the Electron/React/Phaser/domain boundary; it is not yet the authoritative Home save or a claim of Godot behavior parity.

## Creator direction

Studio should grow into a creator surface with:

- floor and wall brushes;
- eraser, fill, eyedropper, selection, and transform tools;
- tile, object, collision, and trigger layers;
- prefabs and object properties;
- animation and interaction previews;
- undo and redo;
- Tiled JSON import and export;
- templates that reuse shared Buddy, input, camera, and save systems.

React should own the editor chrome and inspectors. Phaser should own the live world canvas and direct manipulation.

## Next acceptance gate

Before this work leaves draft status:

1. exact-head build, typecheck, test, and packaging must pass;
2. the packaged macOS app must visibly open Home;
3. all four orientations must render;
4. drag painting, erase, reset, close, and reopen must work;
5. preview persistence must remain isolated from original Godot saves;
6. screenshots and a short interaction recording must be attached to the PR.

Private Tiny House, Buddy, Cozy Isometric, and Pixel Salvaje source art stays outside this public repository.
