# Pocket Buddy+ Product Identity

## Canonical product

**Pocket Buddy+ is the product.**

This repository is the active Pocket Buddy+ product repository. OpenPets is the donor/upstream foundation and must not be presented as the current product identity.

Internal compatibility names such as `@open-pets/*`, existing file paths, protocols, logs, or data formats may remain temporarily where renaming would create unnecessary risk. Their presence does not change the product name or authority boundary.

## Donor and attribution boundary

OpenPets source, licenses, copyright notices, attribution, and upstream references must be preserved wherever required. Product rebranding does not erase donor provenance.

Agents working here must distinguish:

- **Product identity:** Pocket Buddy+
- **Canonical repository:** `codysumpter-cloud/PocketBuddyPlus`
- **Donor/upstream:** OpenPets
- **Compatibility namespaces:** existing `@open-pets/*` and OpenPets-derived technical identifiers
- **Godot behavior source during parity work:** the designated Prismtek Buddy implementation in `prismtek-apps`

## Current repository status

Pocket Buddy+ remains standalone during its active product rescue. Do not move it into `prismtek-apps` merely to reduce repository count.

The canonical consolidation tracker is `codysumpter-cloud/prismtek-apps#359`.

## Product rescue gate

Before any repository migration:

1. At least one visible feature is approved by the user in the actual packaged app.
2. The packaged app launches from a clean build.
3. Relevant state survives close and relaunch.
4. Direct runtime evidence exists; tests alone are not completion.
5. Maintained documentation reflects actual product behavior and naming.

## Later monorepo migration gate

Only after the rescue gate passes may Pocket Buddy+ move to `prismtek-apps/apps/pocket-buddy-plus`.

A migration must:

- preserve source history and authorship;
- preserve OpenPets licenses and attribution;
- prove packaging and release output from the monorepo;
- redirect all active consumers and documentation;
- add a final supersession notice and `pre-archive-final` tag to this repository;
- archive this repository only after verification;
- never delete the repository.

## Working rule

When repository memory, old documentation, package names, or upstream text conflict with this file, treat this file and current explicit user direction as the product-identity authority until the maintained documentation is fully updated.
