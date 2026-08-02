# License matrix

The root `LICENSE` (MIT) **does not override separately licensed subdirectories.**
Where a package carries its own LICENSE, that license governs it.

| Path | License | Origin |
|---|---|---|
| `/` (application, `apps/desktop`, most packages) | **MIT** | Derived from `alvinunreal/openpets` (MIT) |
| `packages/buddy-life-lgpl` | **LGPL-2.1-or-later** | Port of openc2e-derived Buddy Life module. **Not ours to relicense.** |
| `packages/buddy-domain` | MIT | Port of first-party Prismtek `creature/` (Prismtek Source Available; owner authorised) |
| `apps/desktop/assets/Monocraft.otf` | OFL-1.1 | © 2022 Idrees Hassan |

## Why `buddy-life-lgpl` is separate

Its sources derive from `openc2e/openc2e` (reviewed revision
`6a4396c83152fe9f9152be924b5a8edc8e759a6a`) via the Prismtek Buddy Core
`life/` module, which is explicitly `LGPL-2.1-or-later`. openc2e is third-party
copyleft code; hosting a port in a Prismtek repository does not make it
relicensable. Translating it to TypeScript produces a derivative of the code, so
the port stays LGPL.

**This is not a dual license.** The LGPL-derived code is never offered as MIT.

## Boundary rules (enforced by `scripts/check-license-boundary.mjs`)

1. Every `.ts` file in `packages/buddy-life-lgpl` carries `SPDX-License-Identifier: LGPL-2.1-or-later`.
2. No file outside that package declares the LGPL identifier or references
   openc2e-derived material.
3. `LICENSE`, `NOTICE`, `LICENSES/LGPL-2.1-or-later.txt`, this matrix and
   `THIRD_PARTY_NOTICES.md` all exist.
4. The NOTICE preserves upstream attribution, the reviewed revision, the Prismtek
   modification record and the warranty disclaimer.

Run: `pnpm check:licenses`

## Replaceable module — your LGPL rights

`buddy-life-lgpl` is an independently replaceable runtime module, not an
inseparable blob. It communicates with the MIT host only through a narrow,
versioned, JSON-compatible contract (commands in, snapshots and events out).

The MIT host retains all authority: Electron lifecycle, persistence, command
validation, plugin permissions, UI, provider routing. The LGPL module *proposes*
physiological state and bounded intents; it has no scene, filesystem, plugin,
credential, network or command-execution authority.

To exercise your LGPL right to modify and run a changed version, the packaged
application ships the module with complete corresponding TypeScript source,
declarations, build scripts and source maps in an identifiable unpacked location.

## Outstanding release requirements

- [ ] Vendor the **verbatim** LGPL-2.1 text into `LICENSES/LGPL-2.1-or-later.txt`
      (currently a pointer; the checker reports this as a release note).
- [ ] Produce a source-archive artifact alongside every packaged release,
      recording the exact source commit.
- [ ] Prove the packaged app can load a compatible replacement module.
- [ ] Focused open-source-license review before any public commercial release.
