# plugins/official/

## Responsibility

First-party SDK v3 plugin product source. These plugins are the reviewed default/catalog lineup for Pocket Buddy+ and demonstrate companion experiences, host-owned shared contracts, localized manifests, command surfaces, scheduled behaviors, persistent storage, and explicit user-invoked sandboxed tool panels.

## Design/Patterns

- **Uniform Plugin Package Shape**: Every plugin folder contains `openpets.plugin.json` and `index.js`; many also provide `assets/*.svg`, `locales/*.json`, and deterministic behavior tests.
- **Localization by Reference**: Manifests may use `$t:` labels/descriptions and runtime code uses `ctx.t(key, vars)` so strings resolve through plugin locales with fallback.
- **Host-Rendered Interaction**: Plugins register commands and render speech, alert, HUD, status, toast, and action UI through trusted host surfaces.
- **Persistent Companion State**: Stateful plugins keep reminders, routines, mood history, focus sessions, Buddy care, training, battle records, and pending settlements in `ctx.storage`.
- **Shared Buddy Contracts**: Approved plugins read the public host Buddy profile and use the host inventory/equipment ledger rather than cloning identity or maintaining incompatible item stores.
- **Retry-Safe Transactions**: Rewards and exchanges persist stable transaction ids before host settlement so restart retries cannot duplicate items.
- **Sandboxed Creator Panels**: Explicit tool plugins may declare package-local HTML panels. Panels cannot navigate or download directly; exports flow through permission-gated host file surfaces.

## Data & Control Flow

1. `openpets.plugin.json` declares `manifestVersion: 3`, `sdkVersion`, permissions, entry file, commands/config, and asset/localization metadata.
2. The sandboxed plugin host loads `index.js` and calls the exported registration hook with the SDK context.
3. Plugin startup registers commands, schedules work, reads config/storage, and initializes visible status or HUD state.
4. User actions call registered handlers, which update private progress and invoke narrow host capabilities.
5. Profile-aware experiences read only the public Buddy snapshot exposed under `pets:read`.
6. Item experiences use `ctx.inventory`; mutations require `pets:manage` and are recorded by the host ledger.
7. User-invoked creator commands may open a sandboxed panel; panel exports flow through `openPetsPanel.postMessage` and `ctx.files.save`.
8. Tests use SDK harnesses or narrow pure-helper tests to assert observable behavior without trusting plugin-private side effects.

## Plugin Inventory

| Plugin | Primary responsibility | Main SDK surfaces |
|--------|------------------------|-------------------|
| `openpets.reminders` | Quick reminders with due/missed delivery, snooze/done actions, status text, optional notification/sound, and localized messages. | `schedule`, `storage`, `status`, `ui.alert`, `commands`, `assets`, `config`, `notify` |
| `openpets.launch-buddy` | Launch/checklist companion for shipping moments, using scheduled prompts and command-driven progress feedback. | `schedule`, `storage`, `commands`, `pet`, `audio`, `assets`, `config` |
| `openpets.water-reminder` | Hydration reminder loop with configurable cadence and localized alerts. | `schedule`, `storage`, `commands`, `ui.alert`, `assets`, `config` |
| `openpets.focus-buddy` | Focus-session helper with timers, commands, status updates, and completion/break feedback. | `schedule`, `storage`, `status`, `commands`, `ui`, `config` |
| `openpets.magic-8-ball` | Command-driven decision/fortune response plugin with stored usage state. | `commands`, `storage`, `pet.speak` |
| `openpets.day-routine` | Daily routine nudges and scheduled check-ins. | `schedule`, `storage`, `commands`, `pet.speak`, `config` |
| `openpets.mood-check-in` | Mood logging/check-in companion with configurable prompts and command entry points. | `schedule`, `storage`, `commands`, `pet`, `config` |
| `openpets.fortune-cookie` | Periodic or command-triggered fortune messages. | `schedule`, `storage`, `commands`, `pet.speak` |
| `openpets.virtual-pet` | Unified Buddy Brain and virtual-pet lifecycle, including care, needs, affection, growth, memory, management UI, and restart-safe migration. | `events`, `schedule`, `storage`, `ui`, `commands`, `pet`, `assets`, `audio`, `config` |
| `openpets.buddy-training` | Selects drills from the public Buddy profile and issues retry-safe shared apple rewards. | `pets`, `inventory`, `storage`, `commands`, `status`, `ui.toast`, `pet.react` |
| `openpets.buddy-battles` | Deterministic local sparring with profile-derived stats, equipment bonuses, scaling opponents, records, and retry-safe rewards. | `pets`, `inventory`, `storage`, `commands`, `status`, `ui.toast`, `pet.react` |
| `openpets.buddy-trading-post` | Fixed local barter offers executed through one atomic host inventory exchange with pending retry recovery. | `pets`, `inventory`, `storage`, `commands`, `status`, `ui.toast`, `pet.react` |
| `openpets.prismpixel-rig-studio` | Extracts modular outfit overlay/erase-mask frames from matching bare and dressed animation sheets and exports PrismPixel item/state contracts. | `commands`, `ui.panel`, `files` |
| `openpets.prismcade-creator` | Builds Prismcade game manifests and outfit-aware character recipes in a sandboxed creator panel. | `commands`, `ui.panel`, `files` |
| `openpets.music-buddy` | Provider-based music companion with Spotify now-playing status, announcements, and playback controls. | `auth`, `network`, `network:write`, `status`, `commands`, `pet` |

## Integration Points

- **Desktop dev mode**: `OPENPETS_DEV_PLUGIN_ROOTS=plugins/official` lets the app hot-load these packages through the local loader.
- **Bundled product lineup**: Pocket Buddy+-specific plugins are registered in `apps/desktop/src/product-bundled-plugins.ts` and remain disabled until the normal user permission flow enables them.
- **Release validation**: `pnpm plugins:package` and `pnpm plugins:validate-release` package manifests, entries, assets, panels, and locales while checking catalog/package drift.
- **Shared state boundary**: Buddy identity and inventory are host-owned; plugins own only experience-specific progress, pending operations, and presentation state.
- **Network boundary**: Local Battles and Trading Post do not imply remote PvP or player-to-player settlement. Those require separate authenticated and server-authoritative contracts.
