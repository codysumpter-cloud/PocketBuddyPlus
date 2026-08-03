# Pocket Buddy+

Pocket Buddy+ is Prismtek's OpenPets-derived living desktop companion platform.
It keeps the complete upstream desktop runtime, plugin SDK, pet catalog, agent
integrations, permission model, IPC, packaging, and cross-platform window work,
then adds Buddy identity, care, biology, conversation, collections, notes/tasks,
and the successful Pocket Buddy interaction model natively in TypeScript.

## Product boundary

- **Pocket Buddy** remains the stable Godot application in `prismtek-apps`.
- **Pocket Buddy+** lives in this repository and uses Electron, TypeScript,
  React, Tailwind, Vite, and pnpm workspaces directly.
- Pocket Buddy+ does not embed, launch, bridge to, or require Godot.
- The Godot game is a read-only behavioral and visual reference while deeper
  systems are ported.
- The two products use distinct app IDs, executables, storage, settings, logs,
  saves, conversations, and release artifacts.

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

`apps/desktop/src/buddy/buddy-core.ts` owns deterministic creature transitions:

- identity
- needs and biology
- mood and activity derivation
- time advancement
- affection
- care actions
- bounded UI snapshots

The product UI calls those functions and never writes need values directly. The
current renderer persistence is versioned and isolated under the Pocket Buddy+
Electron profile. A future main-process Buddy host will move persistence and
periodic simulation behind narrow IPC without changing the visible contracts.

## Next system ports

1. Bind wardrobe choices and care reactions to the active desktop pet renderer.
2. Route attached-pet menu actions into the same Buddy state authority.
3. Add durable main-process Buddy storage with atomic writes and recovery.
4. Port multiple Buddy identities and relationships.
5. Port episodic/semantic memory and cloud/local cortex routing.
6. Port Pocket Bird movement, species, hats, feathers, petting, and sleep parity.
7. Add an explicit, read-only importer for existing Pocket Buddy data.
8. Add optional advanced sprite, rigged 2D, and later 3D renderers.

## Upstream discipline

OpenPets is MIT-licensed and remains the upstream source platform. Preserve its
license, notices, contributor attribution, and Git history. Keep Prismtek changes
small and reviewable so security and platform improvements can continue to flow
from `alvinunreal/openpets`.

Do not rename internal `@open-pets/*` protocol and SDK packages merely for
branding. They are compatibility contracts, not visible product copy.
