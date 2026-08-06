# TinyHouse Cozy Mode reference notes

## Decision

Use external open-source projects as design references, then rebuild the useful
patterns as original Pocket Buddy+ code. Do not copy source, art, audio, models,
or branding into TinyHouse Local without a file-level provenance review.

## Evaluated references

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

## Licensing and provenance boundary

The Cozy Mode files are original Prismtek source. They contain no purchased
Pixel Salvaje image bytes, no remote media URLs, and no third-party JavaScript
packages. Future vendoring requires the normal source URL, author, exact license,
attribution, modification, commercial-use, redistribution, and destination record.
