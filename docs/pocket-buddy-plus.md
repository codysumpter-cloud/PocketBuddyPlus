# Pocket Buddy Plus

Pocket Buddy Plus is Prismtek's OpenPets-derived desktop companion platform.
It keeps the complete OpenPets desktop shell, plugin SDK, pet catalog, agent
integrations, permission model, IPC, packaging, and cross-platform window work,
then ports the living Buddy systems and the successful Pocket Buddy interaction
model into that native TypeScript/Electron architecture.

## Product boundary

- **Pocket Buddy** remains the stable Godot application in `prismtek-apps`.
- **Pocket Buddy Plus** lives in this repository and uses the OpenPets stack
  directly: Electron, TypeScript, React, Tailwind, Vite, and pnpm workspaces.
- Pocket Buddy Plus does not embed, launch, or require the Godot runtime.
- The Godot game is a read-only behavioral reference while features are ported.
- The two products use distinct app IDs, executables, storage, settings, logs,
  saves, conversations, and release artifacts.

## UI ownership

Pocket Buddy Plus has two complementary surfaces.

### Buddy menu

Clicking the active Buddy opens the compact, creature-attached menu. Its layout,
wording, visual hierarchy, and behavior should remain faithful to the working
Pocket Buddy menu:

- Pet the Buddy
- Talk to Buddy
- Name your Buddy
- Buddies
- Status
- Collection
- Notes & Tasks
- How Buddy works
- Field Guide
- Wardrobe
- Settings

The menu is intimate and specific to the selected Buddy. It must not become a
full-screen administration surface.

### Plus dock

The OpenPets Control Center evolves into a collapsible dock for platform-wide
features:

- Buddy overview
- Pets and appearance gallery
- Plugins
- Integrations
- AI providers
- Global settings

The dock manages the platform. The attached Buddy menu manages the creature.

## State authority

The ported Buddy runtime owns:

- identity and personality
- needs and biology
- mood and emotions
- intent selection and activities
- episodic and semantic memory
- relationships
- conversation state
- durable saves

Plugins, agent integrations, language models, menus, and renderers may propose
or display actions. They do not directly rewrite authoritative Buddy state.

## Migration sequence

1. Establish Pocket Buddy Plus product identity and separate packaging.
2. Preserve the upstream OpenPets feature set and tests.
3. Add the Plus dock shell without removing existing Control Center routes.
4. Recreate the Pocket Buddy attached menu in React/Tailwind.
5. Port Pocket Bird movement, species, hats, feathers, petting, sleep, and notes.
6. Port Buddy Core into deterministic TypeScript packages with parity fixtures.
7. Port chat, memory promotion, relationships, and multiple Buddy identities.
8. Add optional advanced sprite, rigged 2D, and later 3D renderers.
9. Add a read-only, explicit one-time importer for existing Pocket Buddy data.

## Upstream discipline

OpenPets is MIT-licensed and remains the upstream platform. Preserve its license,
notices, contributor attribution, and Git history. Keep Prismtek changes in small,
reviewable commits so security and platform improvements can continue to flow
from `alvinunreal/openpets`.

Do not rename the internal `@open-pets/*` protocol and SDK packages merely for
branding. Those package names are compatibility contracts and should change only
through an intentional migration with downstream impact measured first.
