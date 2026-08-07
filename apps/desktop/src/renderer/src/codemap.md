# apps/desktop/src/renderer/src/

## Responsibility

React/Tailwind source for the Control Center management UI plus the Pocket Buddy+
product layer. The renderer presents dashboard status, pet management,
coding-agent integrations, plugin management, settings, appearance controls,
and the native Buddy+ experience using narrow preload APIs and the pure Buddy
state engine.

## Design

- **Route Shell**: In-renderer route state supports `dashboard`, `pets`,
  `integrations`, `plugins`, and `settings`; tray actions retarget the singleton
  window through route-change events.
- **Pocket Buddy+ Product Layer**: `product-ui.ts` augments the inherited shell
  without duplicating its routes. It owns exact visible branding, the
  light/dark/system appearance selector, the Pocket Buddy+ wordmark, the Buddy+
  navigation entry, the dashboard Buddy card, and the modal Buddy center.
- **Buddy Center**: Uses the pure `src/buddy/buddy-core.ts` state transitions for
  care, needs, mood, activity, affection, and snapshots. It provides Status,
  Talk, Notes & Tasks, Collection, Field Guide, and Wardrobe surfaces with
  versioned local persistence. UI code requests care actions through the core
  functions and never writes need values directly.
- **Brand Boundary**: Renderer translations and a DOM boundary normalizer convert
  inherited product wording to the exact user-facing name `Pocket Buddy+` while
  technical protocols, package IDs, and source attribution remain unchanged.
- **Appearance**: `product-ui.css` defines semantic light and dark tokens and
  applies them across inherited cards, navigation, forms, dialogs, plugin views,
  galleries, the Buddy center, and the dashboard. `system` follows OS appearance
  and updates live.
- **Monitor Selection**: `monitor-settings-ui.ts` augments General/Movement
  settings with the persisted monitor picker. The main process is authoritative:
  the UI only chooses a monitor, while `monitor-manager.ts` clamps all visible
  desktop windows to that monitor's usable work area. The obsolete cross-display
  roaming toggle is hidden because selected-monitor containment is now a hard
  product rule.
- **Dashboard**: Reads a narrowed dashboard snapshot for default pet preview,
  install/catalog counts, plugin health, update status, and activity totals.
- **Pets**: Combines installed pets, catalog v3 pages/search, Codex imports,
  filters, detail panes, set-default/install/import/remove actions, and animated
  sprite previews.
- **Integrations**: Card-first setup UI for Claude Code, OpenCode, Cursor, and Pi
  guidance, including command mode/path controls and preview/action flows.
- **Plugins**: Gallery-first plugin hub for installed/catalog/local/broken
  filters, catalog refresh, local load, install/update/uninstall, enable/disable,
  config modal, command execution, runtime/status display, and broken-state
  feedback.
- **Settings**: Startup, launch-at-login, monitor selection, pet scale,
  reaction-animation mapping, update check, default-pet position reset, and pet
  reaction previews.
- **Bridge Contract**: Existing app data and actions go through
  `window.openPetsControlCenter`; the Buddy+ product layer imports only the pure
  Buddy domain module and stores its versioned renderer state under the Plus-only
  Electron profile.

## Key Files

- `main.tsx`: Inherited React app containing type definitions, route shell, page
  components, icons, snapshot loading, and action handlers.
- `styles.css`: Inherited Tailwind base/components/utilities and page layouts.
- `product-ui.ts`: Pocket Buddy+ branding, theme persistence, Buddy state UI,
  dashboard card, feature center, care actions, notes/tasks, local conversation,
  collection, field guide, and wardrobe preferences.
- `product-ui.css`: Semantic light/dark theme tokens and Pocket Buddy+ component
  styling.
- `monitor-settings-ui.ts`: Settings monitor selector backed by the narrow
  `getMonitorSelection`/`setMonitorSelection` preload bridge.
- `i18n.tsx`: Renderer translation facade with product-name normalization.
- `vite-env.d.ts`: Vite/TypeScript renderer environment declarations.
