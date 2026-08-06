# Buddy Brain Visual Reaction Mapping

Buddy Brain is the visual editor layered over Settings → Reaction Mapping. It
uses a node graph to show the same per-pet reaction-to-animation rules that the
existing list editor manages.

## Product contract

- A **trigger node** represents one host reaction such as thinking, editing,
  testing, success, waiting, or error.
- An **animation node** represents one complete animation supplied by the
  selected Buddy's installed animation manifest.
- One directed edge from a trigger to an animation is one runtime mapping.
- Incomplete animations remain visible for diagnosis but cannot receive new
  connections.
- The existing list editor remains available after the visual editor closes and
  is the keyboard/accessibility fallback.

Buddy Brain does not introduce a second runtime mapping format. The graph is
compiled into the existing `reactionAnimationOverridesByPetId` contract through
`getReactionAnimationSettings` and `setReactionAnimationOverrides`. Defaults are
removed from the persisted override object, preserving the current minimal save
format.

## State and persistence

`apps/desktop/src/renderer/src/buddy-brain-core.ts` owns pure graph behavior:

- migration from the existing overrides into a complete graph
- compilation back to non-default overrides
- stable reaction and animation node IDs
- validation and normalization of saved node coordinates
- the XState editor machine for ready, saving, saved, and error feedback

Only visual node positions are new state. They are stored locally per Buddy under
`pocket-buddy-plus:buddy-brain-layout:v1:<petId>`. Invalid JSON, non-finite
coordinates, removed reactions, and removed animations fall back to a generated
two-column layout without blocking reaction edits.

## Renderer integration

`buddy-brain-entry.tsx` is a progressive renderer enhancement loaded alongside
the existing Control Center. It watches for the Reaction Mapping grid, inserts an
**Open visual editor** action, and mounts the React Flow dialog only when used.
The editor uses:

- **React Flow** for nodes, handles, connections, zoom, pan, controls, and minimap
- **XState** for explicit editor save/error states
- the existing narrow preload API for all durable mapping writes

The implementation intentionally avoids new main-process IPC or duplicate app
state. Removing the renderer entry script restores the original list-only UI
without migrating or deleting user reaction mappings.

## Validation

`apps/desktop/tests/buddy-brain.test.ts` protects observable contracts:

- existing overrides migrate without changing effective mappings
- graph edits compile into the existing minimal override format
- node IDs safely bridge React Flow connections to runtime identifiers
- stale or corrupt layout data is discarded safely
- the XState machine exposes deterministic save and error states
