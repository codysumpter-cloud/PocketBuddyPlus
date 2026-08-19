# apps/desktop/src/buddy/

## Responsibility

Native Pocket Buddy Plus creature-domain code. This folder owns deterministic,
renderer-independent Buddy state and the stable contract for the compact menu
attached to a Buddy. It must not depend on Electron windows, React components,
plugins, language-model providers, or pet rendering, except for the explicitly
host-facing `buddy-menu-integration.ts` adapter described below.

## Files

- `buddy-core.ts` — versioned immutable Buddy state, need pressure progression,
  dominant-need and mood derivation, care actions, and UI-safe snapshots.
- `buddy-menu.ts` — ordered Pocket Buddy click-menu actions and labels, including
  conditional process exit support.
- `buddy-menu-integration.ts` — narrow Electron host adapter that recognizes only
  the default-pet context-menu template, prepends the protected `buddy-menu.ts`
  contract, and routes actions to Buddy Brain, Pets, Settings, or process exit
  without replacing the newer plugin/menu organization.

## Data flow

1. A host creates or loads one `BuddyState` per durable Buddy identity.
2. Time and completed activities advance that state through pure functions.
3. Player care is proposed by UI or plugins and applied by the authoritative
   Buddy host through `applyBuddyCare`.
4. `createBuddySnapshot` exposes a bounded read model for menus, the future Plus
   dock, renderers, and diagnostics.
5. `built-in-pet.ts` loads `buddy-menu-integration.ts` before the default pet
   context menu is built. The integration consumes `getBuddyMenuItems()` and
   leaves agent-pet, tray, command-form, and unrelated Electron menus alone.
6. Creature actions route to the canonical Buddy Brain plugin; platform actions
   route to the existing Control Center. Presentation surfaces never mutate need
   values or affection directly.

## Invariants

- Functions return new state and never mutate prior snapshots.
- Need and affection values stay in the inclusive `0..1` range.
- Time never moves backwards.
- Exact attached-menu wording and order are a user-facing product contract.
- The live default-pet menu consumes that contract rather than duplicating its
  labels in the pet-window implementation.
- OpenPets plugins and integrations remain capability callers, not state owners.
- Future memory, relationships, cognition, and save modules extend this domain
  rather than duplicating it in UI or pet-window code.
