# Buddy Brain unified plugin

`openpets.virtual-pet` is the canonical Buddy state owner. The stable plugin id is preserved so existing Virtual Pet saves upgrade in place instead of becoming orphaned.

## Product boundary

The visible product is **Buddy Brain**. One plugin owns:

- lifecycle: food, energy, happiness, affection, health, mess, sickness, sleep, death/restart;
- progression: level, XP, stage, care history;
- brain: durable identity, personality, drive pressures, relationship, training, working memory, notes, tasks, inventory, learned associations, and customization;
- UI: the `brain` sandboxed panel and the existing pinned HUD;
- actions: care commands plus profile, memory, task, and training changes.

Reaction Mapping remains the existing first-party Control Center editor during this compatibility pass. It continues to own only reaction-to-animation overrides; it is not a second Buddy lifecycle or personality store.

## Save migration

State version 3 is additive. `cleanState` accepts old version 2 payloads and fills the new `brain` block without changing lifecycle values.

The Control Center compatibility adapter imports `pocket-buddy-plus:buddy-ui:v1` through the normal `import-legacy-buddy-ui` plugin command. On success it:

1. keeps a rollback copy at `pocket-buddy-plus:buddy-ui:migrated-backup:v1`;
2. removes the duplicate live key;
3. marks migration complete at `pocket-buddy-plus:buddy-brain-migrated:v1`.

The plugin records `brain.legacyUiMigratedAt`, so repeated imports are idempotent.

## Security

The panel is manifest-declared and sandboxed. It receives clone-safe snapshots and sends validated action messages to the plugin. It has no Node, Electron, filesystem, shell, or cross-plugin storage access.

## Compatibility debt

`product-ui.ts` still contains the retired renderer-local Buddy implementation for one rollback release. `buddy-brain-plugin-entry.ts` hides and replaces its navigation/card, performs the one-time migration, and routes actions to the plugin. Remove the dead implementation only after migration has shipped and rollback support is no longer required.
