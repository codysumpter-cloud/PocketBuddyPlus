# TinyHouse Cozy Mode and room-builder reference notes

## Decision

Use external open-source projects as design references, then rebuild the useful
patterns as original Pocket Buddy+ code. Do not copy source, art, audio, models,
or branding into TinyHouse Local without a file-level provenance review.

Use the player's licensed TinyHouse pack as the runtime art source. The pack's
animated full-room GIFs and PNG compositions may be viewed locally as layout and
behavior references, but they are not committed, uploaded, embedded in saves, or
used as a substitute for editable room objects.

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

## Evaluated TinyHouse showcase compositions

The licensed TinyHouse pack includes full-room compositions for spaces including
Bathroom, Kitchen, Office, and Japanese Room. Several supplied showcase files are
animated and demonstrate coordinated object states, including bath and sink
activity, appliance and cabinet changes, office equipment, and sliding doors.

Useful patterns:

- a good preset communicates a room purpose immediately;
- animated objects should remain independent interactive entities rather than one flattened room movie;
- a full-room composition is useful as a reference and preview even when the final room remains editable;
- preset application must be reversible because it replaces a large amount of player work.

Pocket Buddy+ adoption:

- `room-templates-core.js` records metadata-only recipes using exact local manifest IDs;
- Bathroom, Kitchen, Office, and Japanese recipes create real floor cells, walls, movable furnishings, tabletop relationships, and wall anchors;
- **Play Room Animations** triggers the editable objects through the normal animation runtime;
- template application stores a one-step complete-house backup before replacement;
- optional GIF/PNG previews use revocable local object URLs;
- named previews can auto-match, while UUID-named files require explicit **Choose Preview** assignment so the app does not guess incorrectly;
- the showcase image bytes never enter source control, room saves, public host snapshots, or the Prismtek Apps integration record.

## Licensing and provenance boundary

The TinyHouse runtime and editor files are original Prismtek source. They contain
no purchased Pixel Salvaje image bytes, no source copied from the projects above,
no remote media URLs, and no third-party JavaScript packages. Open-source
references inform behavior and editor ergonomics only. The licensed TinyHouse
showcases inform local room arrangement and animation intent only; the checked-in
recipes contain IDs and placement metadata, not art bytes.

Future vendoring requires the normal source URL, author, exact license,
attribution, modification, commercial-use, redistribution, and destination
record. Future TinyHouse template additions must also prove that all referenced
asset IDs exist in the selected local pack and that no preview or source image was
added to the repository.
