# Phaser Home architecture

## Decision

Pocket Buddy+ uses **Phaser 4.2.1** as the 2D game engine for Home, Play, and interactive Studio previews.

- Electron owns the native desktop shell, packaging, filesystem access, and eventual durable state host.
- React and DOM controls own navigation, toolbars, forms, inspectors, and accessibility.
- Phaser owns scenes, cameras, direct manipulation, animation, input, particles, effects, and physics where needed.
- `@open-pets/buddy-domain` owns canonical Buddy, room, placement, wall, tile, furniture, actor, interaction, and save contracts.
- Godot remains a read-only donor, behavioral oracle, visual reference, and temporary playable implementation during migration. It is not embedded in Electron and must never write the same save as Phaser.

## Why Phaser

PixiJS is a strong renderer, but Pocket Buddy+ needs reusable game systems across Home, Home Builder, Buddy Ascent, Pocket Bird, skating, and later Prismcade experiences. Phaser supplies the scene, camera, input, animation, tilemap, particle, and physics infrastructure that would otherwise need to be rebuilt on top of Pixi.

The domain remains renderer-independent, so Phaser never becomes authoritative over room or Buddy state.

## First playable slice

The original renderer proved only the Electron/React/Phaser boundary: an 8×6 floor, four camera corners, floor brushes, placeholder walls, and a yellow-circle Buddy.

The playable slice adds public, generated-placeholder content and real game rules:

- separate Human player and Buddy actor positions;
- WASD, arrow-key, and on-screen player movement;
- canonical furniture collision and selection;
- Play, Paint, Place, and Remove modes;
- bed, food bowl, ball, television, chair, table, and plant definitions;
- persistent object state, including food servings, TV power/channel, toy use, and plant watering;
- BuddyCreatureState-backed drives, mood, relationships, action history, and elapsed-time drift;
- deterministic autonomous Buddy targeting and object use;
- petting and explicit furniture interaction;
- donor-aligned four-wall cutaway presentation;
- schema-v2 isolated preview persistence with migration from the old schema-v1 floor preview;
- starter furniture so a fresh room is immediately playable.

The public objects are not substitutes for the licensed Tiny House art. They protect canonical ids, footprints, affordances, and state behavior while private release builds supply permitted atlases and manifests.

## Authority and persistence

The playable slice still stores an isolated preview document under:

```text
pocket-buddy-plus:phaser-home:v2
```

That state is deliberately separate from Godot and from the final authoritative Electron main-process Buddy store. It proves the combined room and Buddy behavior before cutover. The next authority step is a narrow preload API backed by atomic main-process storage, then migration of the top-level BUDDY+ hub and Desktop pet onto the same Buddy snapshot and commands.

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

React should own editor chrome and inspectors. Phaser should own the live world canvas and direct manipulation.

## Acceptance gate

Before this slice is ready to merge:

1. exact-head build, typecheck, complete tests, licensing checks, and packaging pass;
2. the packaged macOS app opens Home without renderer console errors;
3. all four camera corners render and a full orbit returns to SE;
4. the player moves while furniture blocks invalid cells;
5. Buddy can be petted and uses a need-matching object;
6. furniture placement, removal, TV power/channel, floor paint, and room reset work;
7. close/reopen restores the schema-v2 preview state;
8. the original Godot saves and purchased source art remain untouched.

Private Tiny House, Buddy, Cozy Isometric, and Pixel Salvaje source art stays outside this public repository.
