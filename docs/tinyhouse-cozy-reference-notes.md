# TinyHouse Cozy Mode and room-builder reference notes

## Decision

Use external open-source projects as design references, then rebuild the useful
patterns as original Pocket Buddy+ code. Do not copy source, art, audio, models,
or branding into TinyHouse Local without a file-level provenance review.

## Evaluated Cozy references

### Pixel Agents

Useful patterns:

- room layouts remain durable independently from character activity
- external asset directories are user-controlled rather than silently bundled
- room objects, occupants, and pets react to state changes
- import/export is a first-class escape hatch

Pocket Buddy+ adoption:

- Cozy state is separate from the existing room save
- local TinyHouse files remain user-selected and temporary
- the Cozy bridge publishes a bounded public snapshot

### Pomotroid

Useful patterns:

- compact, glanceable focus controls
- explicit start, pause, resume, and reset states
- session totals and configurable durations
- external integration should consume a narrow state contract

Pocket Buddy+ adoption:

- timer completion is derived from an absolute deadline, not animation-frame delta
- the browser and host bridges receive timer summaries rather than private state

### Magenta Lo-Fi Player

Useful pattern:

- room objects can influence ambience and make the environment feel alive

Pocket Buddy+ adoption:

- music objects toggle a small original Web Audio mixer
- lamps change lighting themes
- no Magenta model, checkpoint, code, generated track, or third-party audio ships

## Evaluated room-builder references

### Diorama — MIT

Useful patterns:

- compact isometric room editing should feel immediate rather than architectural
- object actions and room controls should remain visible and reversible
- room editing benefits from a small, readable control surface

Pocket Buddy+ adoption:

- the Structure panel keeps editing actions next to the room
- structural history exposes direct Undo and Redo controls
- the default room remains visually compact while supporting larger structures

### Blueprint3D Modern — MIT

Useful patterns:

- room changes should be represented as durable topology rather than decorative sprites
- planning should validate dimensions before committing geometry
- walls, openings, and room boundaries should share one model

Pocket Buddy+ adoption:

- the Blueprint Room Planner preflights rectangular additions
- planned rooms use the existing canonical cell/edge graph
- every room addition creates a real shared-boundary door

### Godot Home Builder — MIT

Useful patterns:

- structural edits need guardrails against invalid or surprising geometry
- connected additions should preserve one coherent building
- destructive building actions should be easy to reverse

Pocket Buddy+ adoption:

- bridge-tile removal is blocked when it would accidentally split the footprint
- Alt-click is the explicit override for intentionally disconnected structures
- structure edits retain a bounded 64-step undo/redo history

### Arcada — Apache-2.0

Useful patterns:

- floor-plan dimensions should be explicit inputs
- multiple room sizes should reuse the same underlying planner

Pocket Buddy+ adoption:

- width and depth are selectable independently from 2 through 8 tiles
- one planner handles both east and south expansion

### FreeSO — MPL-2.0

Useful patterns:

- an isometric house should separate architecture, traversal, furnishings, and save state
- rooms remain meaningful through structural connectivity rather than screen position alone

Pocket Buddy+ adoption:

- Blueprint planning changes only topology and does not mingle licensed asset bytes with structure data
- open and closed doors continue to control traversable zones independently from the physical footprint guard

## Licensing and provenance boundary

The TinyHouse files are original Prismtek source. They contain no purchased Pixel
Salvaje image bytes, no source copied from the projects above, no remote media
URLs, and no third-party JavaScript packages. The references inform behavior and
editor ergonomics only. Future vendoring requires the normal source URL, author,
exact license, attribution, modification, commercial-use, redistribution, and
destination record.
