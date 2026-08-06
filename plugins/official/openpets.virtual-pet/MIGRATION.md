# Buddy Brain migration

- Stable plugin id: `openpets.virtual-pet`
- Previous state version: `2`
- Unified state version: `3`
- New panel: `brain.html`

Version 2 lifecycle saves are accepted directly and receive a default `brain` block. The Control Center imports the former `pocket-buddy-plus:buddy-ui:v1` renderer state through the `import-legacy-buddy-ui` command, keeps a rollback backup, and marks the import complete. Repeated imports are ignored after `brain.legacyUiMigratedAt` is set.
