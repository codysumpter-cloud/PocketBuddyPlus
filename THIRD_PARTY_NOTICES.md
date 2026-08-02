# Third-party notices

Pocket Buddy+ is derived from OpenPets and additionally ports first-party
Prismtek systems. This file records every external boundary.

## OpenPets

- Upstream: `alvinunreal/openpets`. License: MIT.
- Pocket Buddy+ is a derivative work. MIT notices and upstream Git history are
  preserved. Internal `@open-pets/*` package names, IPC keys and schema IDs are
  retained deliberately for compatibility and are not user-facing product copy.

## Prismtek Buddy Core, Buddy Brain, Buddy Agent, KnowledgeVault

- Upstream: `codysumpter-cloud/prismtek-apps`, `buddy-brain`, `buddy-agent`,
  `knowledge-vault`. License: Prismtek Source Available License v1.0.
- First-party. The owner has authorised reuse and adaptation inside Pocket Buddy+.
- Embedded third-party attribution inside those repositories is preserved below;
  hosting in a Prismtek repository does not imply Prismtek owns a third-party
  contribution.

## Pigeon Ascent

- Upstream: `Escada-Games/pigeonAscent`. License: MIT.
- Copyright (c) 2020 Guilherme Rodrigues Ribeiro, Rafael Pimentel da Silva.
- Source code may be adapted; this notice must be retained wherever it is.
- Reused mechanics (via Prismtek Buddy Core `progression/buddy_progression_model.gd`):
  derived health/stamina pools computed from allocated stats with defense and
  speed weighted double, a defense cap, refundable rerolls, and a tiered
  evolution ladder. Balance constants are Prismtek's own.
- Assets are NOT cleared by the code license. Every image, font, sound, music and
  data file requires separate audit before redistribution. Prefer original
  Pocket Buddy+ assets.

## Pocket Bird

- Upstream: `IdreesInc/Pocket-Bird`, reviewed through the fork
  `codysumpter-cloud/Pocket-Bird`. License: **Mozilla Public License 2.0**.
- **Behaviour and design reference only.** No Pocket Bird source, distinctive
  implementation structure, comments, function bodies, sprites, CSS, extension
  manifests or other covered files are copied, translated or adapted into
  Pocket Buddy+.
- Observable behaviour studied: ambient autonomous movement, petting, species
  collection, hats, falling-feather unlock events, persistent notes, local
  settings. These are reimplemented independently in TypeScript.
- MPL-2.0 is file-level copyleft. Any future reuse of a covered file must retain
  its MPL notices and make that covered source available as the license requires.
  Doing so would encumber the containing file, so it is avoided by default.

## Monocraft

- Upstream: `IdreesInc/Monocraft`. License: SIL Open Font License 1.1.
- Copyright 2022 Idrees Hassan. Bundled with its license at
  `apps/desktop/assets/Monocraft.LICENSE.txt`.
