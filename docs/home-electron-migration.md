# Electron-native Buddy Home migration

## Decision

Pocket Buddy+ is the canonical desktop product. The Godot Pocket Buddy and
Prismtek Buddies/Tiny House projects remain read-only donor implementations
while their proven behavior is migrated into Electron-native TypeScript.

The production destination is one Electron process tree with four user-facing
places for the same durable Buddy:

- **Desktop** — ambient companion behavior and attached-pet controls;
- **Home** — the isometric house, building, household life, and world systems;
- **Play** — Buddy Ascent and later game experiences;
- **Studio** — appearance, rigging, outfits, and content creation.

Godot is not embedded as the permanent Home runtime. It remains the behavioral
oracle, visual reference, save donor, and temporary playable implementation
until the Electron surface passes the same receipts.

## Authority boundaries

- Electron main process is the eventual authority for Buddy identity, durable
  state, time advancement, room documents, permissions, storage, and model use.
- React owns controls and navigation, not simulation values.
- A GPU-backed 2D canvas renderer should own isometric drawing, animation,
  pointer hit testing, particles, and camera presentation.
- `@open-pets/buddy-domain` owns renderer-independent contracts and decisions.
- Renderers send intentions; the domain/host validates them and returns bounded
  snapshots.
- Godot saves are imported read-only. Migration never rewrites a donor save.

## Foundation implemented in this repository

`packages/buddy-domain/src/home/` now provides:

- `pocket-buddy-home-room-v1`, a versioned room document;
- canonical floor and north/east/south/west wall identities;
- strict JSON-safe save validation;
- deterministic room orientation and isometric projection;
- near/rear wall classification for all four views;
- canonical footprint occupancy and support relationships;
- immutable item upsert and cascading support removal.

`packages/buddy-domain/src/parity/` now provides:

- `prismtek-parity-trace-v1`;
- deterministic snapshot/event comparison;
- configurable numeric epsilon;
- exact mismatch paths suitable for CI and agent handoff;
- event-order verification;
- bounded failure output.

This is a foundation, not a claim that Home is playable in Electron.

## Migration sequence

### 0. Inventory and freeze

Inventory every local and committed Buddy game version. Mark each as canonical,
donor, prototype, superseded, or archive. Freeze regular Pocket Buddy and the
Godot house to critical fixes plus parity/export instrumentation.

### 1. Emit golden donor traces

Add headless Godot trace emitters in the private `prismtek-apps` checkout for:

- room rotation and physical-wall presentation;
- floor and tabletop placement;
- save/load and legacy room import;
- object affordances and persistent object state;
- one-Buddy needs, actions, outcomes, and relationships;
- household cooking, meals, garden, and Human Life;
- PrismWorld timers, environmental state, and PrismScript execution.

Each emitter writes `prismtek-parity-trace-v1` JSON. PocketBuddyPlus runs the
matching TypeScript scenario and compares it with `compareParityTraces`.

### 2. Build the Home renderer shell

Create an Electron Home route/window using a GPU-backed 2D canvas renderer.
Implement only the room contract first:

- floor and four physical walls;
- four camera orientations;
- near-wall fade/hide presentation;
- deterministic depth sorting;
- zoom/pan;
- pointer hit testing;
- build/play modes;
- room-document save/load.

No licensed source art enters this public repository. Public development uses
safe placeholders or generated fixtures.

### 3. Port the object catalog and builder

Generate a private, versioned content manifest from the Tiny House source pack.
The public app consumes packaged atlases/manifests during private release builds.
Port furniture categories, animation clips, screen channels, tabletop supports,
wall mounts, placement settling, and persistent object state behind parity tests.

### 4. Put one real Buddy in Home

Connect the same main-process Buddy authority used by Desktop mode. Port
movement, pathing, petting, sleep, eating, play, conversation, thought/status
feedback, object use, relationship outcomes, and restart continuity.

### 5. Port household and world depth

Migrate cooking, meals, garden, Human Life, population/family systems, ecology,
PrismWorld, and PrismScript incrementally. A subsystem is complete only after:

- donor trace parity;
- behavior-focused TypeScript tests;
- visible Electron runtime capture;
- save/restart verification;
- no competing Godot/Electron state owner.

### 6. Import and retire

Ship explicit read-only importers for regular Pocket Buddy and Prismtek Buddies
saves. Retire old executables only after imported identity, room, inventory,
relationships, and progress survive normal play and recovery tests.

## Asset and licensing boundary

PocketBuddyPlus is public. Purchased Tiny House, Buddy, and Pixel Salvaje source
art must remain in a private content/source repository. Private CI may package
permitted production atlases into the final application, but source sheets must
not be committed here.

The OpenC2E-derived `life/` modules are LGPL-2.1-or-later. Any translated
TypeScript derivative must remain a separately identified LGPL module with its
source, license, attribution, and modification notices available. The MIT
application must not silently relicense that code.

Pocket Bird is MPL-2.0 and remains a behavior/design reference unless a covered
file is intentionally adopted under the MPL boundary.

## Claude handoff

Claude should work from the actual Mac checkouts and licensed assets. The next
bounded assignment is:

1. Add Godot emitters for four-wall room geometry and placement using
   `prismtek-parity-trace-v1`.
2. Add a TypeScript runner that produces the same scenarios from
   `@open-pets/buddy-domain`.
3. Run `compareParityTraces` and fix every mismatch without weakening epsilon or
   ignoring behavioral paths.
4. Scaffold the Home canvas renderer with placeholder assets only.
5. Produce four orientation screenshots and a short interaction recording.
6. Keep Godot and Electron saves isolated; do not advance the same Buddy from
   both runtimes.
7. Open draft PRs in both repositories with exact-head test and capture receipts.

Do not port the full cognition/biology/world stack before the room shell and one
Buddy vertical slice are visible and stable.
