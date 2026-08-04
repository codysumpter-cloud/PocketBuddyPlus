# Prismtek Mac workspace cleanup

## Goal

Create one boring, predictable home for active development without losing unique
work or exposing purchased assets:

```text
~/Prismtek/
├── repos/                  # one canonical checkout per repository
├── worktrees/              # temporary branch-specific checkouts
├── assets-private/         # purchased/source assets
├── inbox/                  # unsorted downloads
├── backups/                # recovery bundles and patches
├── archive/                # dated quarantine; never active work
└── reports/                # Workspace Doctor receipts
```

The Workspace Doctor is intentionally conservative. It does not delete anything
and it never automatically moves private assets, dirty repositories, linked
worktrees, repositories with local-only commits, or repositories from unknown
remotes.

## Commands

Run from any PocketBuddyPlus checkout containing the script:

```bash
pnpm workspace:doctor audit
```

This scans the normal development locations and writes a Markdown report under
`~/Prismtek/reports/`. It does not move repositories.

After reading the report, create the standard folders and recovery material for
risky repositories:

```bash
pnpm workspace:doctor prepare
```

For each dirty or locally divergent repository, `prepare` records status,
remotes, branches, staged and unstaged patches, a full Git bundle, and an archive
of untracked files when present.

Then perform the safe consolidation:

```bash
pnpm workspace:doctor apply
```

`apply`:

1. creates canonical clones at `~/Prismtek/repos/PocketBuddyPlus` and
   `~/Prismtek/repos/prismtek-apps` when missing;
2. fetches existing canonical clones;
3. compares every candidate checkout with its canonical clone;
4. moves only clean standalone duplicates whose branch commits already exist in
   the canonical clone;
5. places those duplicates in a dated directory under `~/Prismtek/archive/`;
6. leaves every uncertain checkout exactly where it was and lists it under
   **Manual review required**.

No mode deletes data.

## What must remain manual

Purchased Tiny House, Pixel Salvaje, Cozy Isometric, and similar source packs are
reported but never moved automatically. Their source paths can be embedded in
Godot imports, build scripts, or private licensing boundaries, so moving them
requires a separate dependency-aware pass.

Unknown repositories are inventoried but not reorganized. The first automated
scope is deliberately limited to PocketBuddyPlus and prismtek-apps because they
are the immediate canonical checkouts needed for the Electron Home migration.

## Recovery

A quarantined duplicate can be restored by moving its folder out of the dated
archive. Nothing is altered inside the moved repository.

A backed-up dirty repository can be reconstructed from:

- `repository.bundle` — all Git refs and objects;
- `unstaged.patch` and `staged.patch` — tracked changes;
- `untracked-files.tar.gz` — untracked files;
- `status.txt`, `branches.txt`, and `remotes.txt` — recovery context.

## Habits after consolidation

- Active repositories live only under `~/Prismtek/repos/`.
- New branch work uses `git worktree` under `~/Prismtek/worktrees/`; do not make
  another full clone.
- New downloads land in `~/Prismtek/inbox/` and are sorted before use.
- End a session by checking `git status -sb` and either committing, pushing, or
  leaving a written reason for a dirty tree.
- Remove a task worktree after its pull request merges.
- Keep quarantine for at least 30 days and delete only after the canonical repos,
  Godot projects, builds, and private content paths have been verified.

## Verification

`scripts/test-prismtek-workspace-doctor.sh` runs the tool inside a disposable
sandbox with local fake remotes. It proves that a clean duplicate is quarantined,
a dirty checkout remains untouched and is backed up, canonical clones are
created, and no deletion path is involved.
