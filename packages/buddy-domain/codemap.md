# packages/buddy-domain/

## Responsibility

Pure, renderer-independent Buddy and Home domain contracts. This package owns state transitions and deterministic geometry that must behave the same in the Electron main process, tests, migration tools, and any current or future renderer.

It does not own Electron windows, React UI, Phaser drawing, filesystem paths, models, plugins, private art, or Godot execution.

## Entry points

- `src/index.ts` — public package exports.
- `src/drive-set.ts` — donor-parity unmet-need pressures and drift.
- `src/personality.ts` — donor-parity stable personality traits.
- `src/creature-state.ts` — durable Buddy identity, relationships, memories, inventory, customization, progression, and serialization.
- `src/mood-model.ts` — donor-parity mood evaluation.
- `src/home/brush.ts` — stable renderer-independent floor brush identifiers.
- `src/home/room-document.ts` — canonical versioned room document, physical surfaces, strict validation, furniture state, and revisions.
- `src/home/isometric.ts` — canonical-cell rotation, projection, and near/rear physical wall classification.
- `src/home/wall-model.ts` — donor-parity legacy wall parsing, boundary cells, and cutaway presentation.
- `src/home/placement.ts` — deterministic occupancy, support validation, item upsert, and cascading removal.
- `src/home/tile-layer.ts` — immutable sparse floor materials.
- `src/home/content-catalog.ts` — public placeholder furniture ids, footprints, affordances, persistent object state, and interaction outcomes.
- `src/home/play-state.ts` — player/Buddy poses, collision, deterministic elapsed-time decisions, autonomous target choice, care, object use, and strict play-save parsing.
- `src/parity/trace.ts` — JSON trace contract and deterministic Godot↔TypeScript comparison with numeric tolerances and exact mismatch paths.

## Invariants

- Physical room state uses north/east/south/west. Camera labels such as left and right are presentation only and rejected at the save boundary.
- Rotation never rewrites canonical cells; it derives a presented grid.
- Room and play documents accept JSON-safe state only.
- Renderers propose paint, placement, movement, care, and interaction intentions; the domain validates and returns new state.
- Furniture presentation may be replaced by a licensed private manifest, but public ids, footprints, actions, and state keys are behavior contracts.
- Buddy needs advance from explicit elapsed time, never animation frames.
- Petting and object use update BuddyCreatureState relationships, drives, mood, and action history rather than renderer-only counters.
- Godot and TypeScript parity compares observable snapshots and event order, not private helper calls.
- Provider/model output never owns Buddy or room state.

## Tests

- `tests/drive-set-parity.test.ts` protects donor-derived Buddy drive behavior.
- `tests/creature-mood-parity.test.ts` protects durable creature and mood behavior.
- `tests/home-domain.test.ts` protects room surfaces, rotation, projection, wall classification, placement, supports, and save validation.
- `tests/home-play-state.test.ts` protects furniture state, collision, feeding, autonomous object use, petting, and invalid play saves.
- `tests/parity-trace.test.ts` protects tolerant numeric parity, exact mismatch paths, event ordering, compact failures, and monotonic trace time.
