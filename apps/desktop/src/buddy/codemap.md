# apps/desktop/src/buddy/

## Responsibility

Native Pocket Buddy Plus creature-domain code. This folder owns deterministic,
renderer-independent Buddy state and the stable contract for the compact menu
attached to a Buddy. It must not depend on Electron windows, React components,
plugins, language-model providers, or pet rendering.

## Files

- `buddy-core.ts` — versioned immutable Buddy state, need pressure progression,
  dominant-need and mood derivation, care actions, and UI-safe snapshots.
- `buddy-menu.ts` — ordered Pocket Buddy click-menu actions and labels, including
  conditional process exit support.

## Data flow

1. A host creates or loads one `BuddyState` per durable Buddy identity.
2. Time and completed activities advance that state through pure functions.
3. Player care is proposed by UI or plugins and applied by the authoritative
   Buddy host through `applyBuddyCare`.
4. `createBuddySnapshot` exposes a bounded read model for menus, the future Plus
   dock, renderers, and diagnostics.
5. Presentation surfaces consume snapshots and menu actions; they never mutate
   need values or affection directly.

## Invariants

- Functions return new state and never mutate prior snapshots.
- Need and affection values stay in the inclusive `0..1` range.
- Time never moves backwards.
- Exact attached-menu wording and order are a user-facing product contract.
- OpenPets plugins and integrations remain capability callers, not state owners.
- Future memory, relationships, cognition, and save modules extend this domain
  rather than duplicating it in UI or pet-window code.
