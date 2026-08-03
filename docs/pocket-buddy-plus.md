# Pocket Buddy+

Pocket Buddy+ is Prismtek's OpenPets-derived living desktop companion platform.
It keeps the complete upstream desktop runtime, plugin SDK, pet catalog, agent
integrations, permission model, IPC, packaging, and cross-platform window work,
then adds Buddy identity, care, biology, conversation, collections, notes/tasks,
and the successful Pocket Buddy interaction model natively in TypeScript.

## Product boundary

Pocket Buddy+ is the canonical desktop product. The long-term user-facing model
is one durable Buddy moving between four Electron-native experiences:

- **Desktop** — ambient pet windows, perches, reactions, attached controls;
- **Home** — the isometric house, building, household activities, and world;
- **Play** — Buddy Ascent and future game experiences;
- **Studio** — appearance, rigging, outfits, and creation tools.

The existing Godot Pocket Buddy and Prismtek Buddies/Tiny House applications in
`prismtek-apps` remain read-only donor implementations during migration. They are
behavioral oracles, visual references, save donors, and temporary playable
builds—not permanent competing products.

Pocket Buddy+ does not adopt a permanent embedded-Godot architecture. Home is
being rebuilt natively in Electron/TypeScript with a GPU-backed 2D renderer.
Godot remains available until Electron passes the same behavior, persistence,
and visible-runtime receipts. Existing saves remain isolated until explicit
read-only importers are shipped; neither runtime may advance the same Buddy.

See [home-electron-migration.md](home-electron-migration.md) for the complete
migration and Claude handoff contract.

## Exact visible identity

The only user-facing product name is **Pocket Buddy+**. `OpenPets`, `Open Pets`,
`Pocket Buddy Plus`, and `Buddy Plus` are normalized at UI boundaries before
being displayed.

Inherited names remain only where technically or legally required:

- internal `@open-pets/*` package names
- IPC method and protocol identifiers
- catalog/schema compatibility keys
- environment-variable names
- upstream Git remote and source URLs
- license notices and contributor attribution

Those technical identifiers must not leak into visible menus, windows, dialogs,
notifications, setup guidance, or generated product copy.

## Product identity and packaging

Canonical values live in `apps/desktop/src/product.ts`:

- app ID: `dev.prismtek.pocketbuddyplus`
- visible product name: `Pocket Buddy+`
- executable: `pocket-buddy-plus`
- output directory: `apps/desktop/dist-electron-plus`
- repository: `codysumpter-cloud/PocketBuddyPlus`

The inherited `electron-builder.yml` remains unchanged for upstream regression
coverage. `electron-builder.plus.yml` remains the verified compatibility base.
Actual Pocket Buddy+ releases use
`electron-builder.pocket-buddy-plus.yml`, which extends that base and applies the
exact visible name, installer name, shortcut name, uninstall name, and artifact
name.

Commands:

- `pnpm package:desktop:plus:dir` — build an unpacked Pocket Buddy+ application
- `pnpm package:desktop:plus` — build Pocket Buddy+ installers and archives

## Existing UI, evolved rather than duplicated

Pocket Buddy+ extends the mature inherited Control Center and pet interactions.
It does not build a second competing management shell.

### Control Center

Existing Dashboard, Pets, Plugins, Integrations, and Settings routes remain the
platform-management surfaces. Pocket Buddy+ adds:

- exact product wordmark and branding
- a Buddy+ navigation entry
- a living Buddy dashboard card
- persistent light, dark, and system appearance controls
- the Buddy+ center for creature-specific features
- navigation into Desktop, Home, Play, and Studio as those experiences land

### Buddy+ center

The first native vertical slice provides:

- **Status** — live name, mood, activity, affection, dominant need, age, last care
  action, and all six need pressures
- **Talk** — durable local, mood-aware conversation
- **Notes & Tasks** — real notes, add/complete/delete tasks, and persistence
- **Collection** — interaction-driven unlockable moments
- **Field Guide** — needs, care behavior, temperament, activity, and bond details
- **Wardrobe** — durable appearance/accessory preference ready for sprite binding
- **Care actions** — pet, feed, play, rest, and clean through the pure Buddy core

The dashboard card exposes quick petting and opens the full center.

## Appearance

Pocket Buddy+ supports:

- **System** — follows the operating-system appearance and updates live
- **Light**
- **Dark**

The selected mode persists under the isolated Pocket Buddy+ profile. Shared
semantic tokens style inherited cards, navigation, forms, dialogs, plugin views,
galleries, and new Buddy surfaces rather than scattering one-off colors.

## State authority

The current renderer-local Buddy state is transitional. The destination is a
single Electron main-process Buddy host with atomic storage and narrow preload
APIs. React and canvas renderers receive bounded snapshots and submit intentions;
they never write needs, relationships, inventory, room ownership, memories, or
progression directly.

`packages/buddy-domain` is the renderer-independent contract layer. It currently
contains donor-parity drives/personality plus the first canonical Home room and
cross-runtime parity contracts. A subsystem does not become authoritative merely
because a TypeScript type with the same name exists—it needs behavior tests and,
for donor behavior, golden trace parity.

## Next system ports

1. Build the Godot→TypeScript golden trace emitters and run them against the
   parity comparator already in `packages/buddy-domain/src/parity/`.
2. Move durable Buddy storage and periodic simulation into the Electron main
   process with atomic writes and recovery.
3. Bind wardrobe choices and care reactions to the active desktop pet renderer.
4. Route attached-pet menu actions into the same Buddy state authority.
5. Build the Electron-native Home room shell from the canonical Home document.
6. Port the Tiny House catalog, placement, interactions, and one-Buddy loop.
7. Port multiple Buddy identities, relationships, memory, cortex routing,
   household life, PrismWorld, and PrismScript incrementally.
8. Port Pocket Bird movement, species, hats, feathers, petting, and sleep parity.
9. Add explicit, read-only importers for existing Pocket Buddy and house saves.
10. Add optional advanced sprite, rigged 2D, and later 3D renderers.

## Upstream discipline

OpenPets is MIT-licensed and remains the upstream source platform. Preserve its
license, notices, contributor attribution, and Git history. Keep Prismtek changes
small and reviewable so security and platform improvements can continue to flow
from `alvinunreal/openpets`.

Do not rename internal `@open-pets/*` protocol and SDK packages merely for
branding. They are compatibility contracts, not visible product copy.
