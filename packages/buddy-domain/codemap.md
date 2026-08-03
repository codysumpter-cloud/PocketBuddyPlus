# packages/buddy-domain/

## Responsibility

Pure, renderer-independent Buddy and Home domain contracts. This package owns
state transitions and deterministic geometry that must behave the same in the
Electron main process, tests, migration tools, and any future renderer.

It does not own Electron windows, React UI, canvas drawing, filesystem paths,
models, plugins, or Godot execution.

## Entry points

- `src/index.ts` — public package exports.
- `src/drive-set.ts` — donor-parity unmet-need pressures and drift.
- `src/personality.ts` — donor-parity stable personality traits.
- `src/home/room-document.ts` — canonical versioned Home room document,
  physical surface names, strict boundary validation, and revisions.
- `src/home/isometric.ts` — canonical-cell rotation, isometric projection, and
  near/rear physical wall classification.
- `src/home/placement.ts` — deterministic cell occupancy, support validation,
  item upsert, and cascading removal.
- `src/parity/trace.ts` — JSON trace contract and deterministic Godot↔TypeScript
  comparison with numeric tolerances and exact mismatch paths.

## Invariants

- Physical room state uses north/east/south/west. Camera labels such as left and
  right are presentation only and are rejected at the save boundary.
- Rotation never rewrites canonical cells; it derives a presented grid.
- The room document accepts JSON-safe item state only.
- Renderers propose placement; the domain validates canonical occupancy.
- Godot and TypeScript parity compares observable snapshots and event order, not
  private helper calls.
- Provider/model output never owns Buddy or room state.

## Tests

- `tests/drive-set-parity.test.ts` protects donor-derived Buddy drive behavior.
- `tests/home-domain.test.ts` protects room surfaces, rotational closure,
  projection, wall classification, placement, supports, and save validation.
- `tests/parity-trace.test.ts` protects tolerant numeric parity, exact mismatch
  paths, event ordering, compact failures, and monotonic trace time.
