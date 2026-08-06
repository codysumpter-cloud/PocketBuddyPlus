# Product decisions

1. Buddy Brain and Virtual Pet are one plugin, not two bridged plugins.
2. `openpets.virtual-pet` remains the internal id to preserve installed state.
3. The plugin is visibly named Buddy Brain.
4. State v3 is the single source of truth for lifecycle, brain, relationship, progression, memory, and customization.
5. The old renderer-local state is migrated once, backed up, and retired.
6. Reaction Mapping remains a settings-owned animation override editor until its UI is moved into the plugin without duplicating state.
