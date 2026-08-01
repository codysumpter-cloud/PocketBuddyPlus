/**
 * Builds the fixtures the headless renderer harness serves in place of IPC.
 *
 * The i18n fixture is derived from the *built* locale catalog rather than being
 * hand-written, so the harness always asserts against the strings the product
 * actually ships (including product-wording changes) instead of a stale copy.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "..");
const fixturesDir = join(here, "fixtures");

const { en } = await import(pathToFileURL(join(appDir, "dist", "i18n", "locales", "en.js")).href);

mkdirSync(fixturesDir, { recursive: true });

const write = (name, value) => writeFileSync(join(fixturesDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");

// Deliberately raw: the renderer applies brandVisibleText itself, so the harness
// can prove that transform is what removes inherited wording from the UI.
write("i18n.json", {
  locale: "en",
  localePreference: "system",
  availableLocales: [
    { value: "system", label: "System default" },
    { value: "en", label: "English" },
    { value: "ja", label: "日本語" },
  ],
  messages: en,
});

const pet = (id, displayName, extra = {}) => ({
  id,
  displayName,
  broken: false,
  source: "builtin",
  version: "1.0.0",
  ...extra,
});

write("pets-state.json", {
  installed: [pet("builtin", "Professor Hoot"), pet("catalog-fox", "Ember Fox")],
  preferences: {
    defaultPetId: "builtin",
    petScale: "medium",
    locale: "system",
    openDefaultPetOnLaunch: true,
    usePetPool: false,
    petPoolOrder: [],
  },
  pool: { enabled: false, order: [] },
});

// Shape mirrors getDashboardSnapshot() in src/windows.ts.
write("dashboard.json", {
  defaultPet: { id: "builtin", displayName: "Professor Hoot", previewSpriteUrl: "" },
  installedPetCount: 2,
  catalog: { source: "bundled", total: 104, page: 1, pageCount: 4 },
  plugins: { installed: 4, enabled: 3, broken: 0 },
  updateStatus: { state: "current", currentVersion: "3.3.0", latestVersion: "3.3.0", releaseUrl: null, error: null },
  activity: {
    messagesSent: 12,
    reactionsSent: 7,
    reactionCounts: { waving: 4, heart: 2, sparkle: 1 },
    perPetActivityCounts: { builtin: 9, "catalog-fox": 3 },
    lastActivityAt: 1785600000000,
  },
});

write("settings.json", {
  preferences: {
    defaultPetId: "builtin",
    petScale: "medium",
    locale: "system",
    openDefaultPetOnLaunch: true,
    launchAtLogin: false,
    usePetPool: false,
  },
  reactionAnimations: { enabled: true, mappings: {} },
  lan: { enabled: false, mode: "off" },
});

// Shape mirrors PluginServiceSnapshot / PluginCatalogSnapshot in
// src/plugin-service.ts: BOTH are { plugins: [...] }, not an "installed" list.
const plugin = (id, name, description, enabled) => ({
  id,
  name,
  description,
  version: "1.0.0",
  enabled,
  bundled: true,
  runtime: "javascript",
  source: "catalog",
  brokenReason: undefined,
  config: {},
  configSchema: {},
  commands: [],
  permissions: [],
  spritePreviews: {},
  local: false,
  updateAvailable: false,
});

write("plugins.json", {
  plugins: [
    plugin("openpets.focus-buddy", "Focus Buddy", "A pet Pomodoro-style focus timer.", true),
    plugin("openpets.launch-buddy", "Launch Buddy", "A friendly startup greeting.", true),
    plugin("openpets.reminders", "Quick Reminders", "Set short local reminders from the pet menu.", true),
    plugin("openpets.virtual-pet", "Virtual Pet", "Care for a little desktop companion.", false),
  ],
});

write("plugin-catalog.json", { plugins: [] });

write("integrations.json", {
  commandMode: "published",
  selectedPetId: "builtin",
  integrations: [
    { id: "claude", name: "Claude Code", status: "needs-setup", installed: false },
    { id: "opencode", name: "OpenCode", status: "not-detected", installed: false },
    { id: "cursor", name: "Cursor", status: "not-configured", installed: false },
    { id: "pi", name: "Pi", status: "manual", installed: false },
  ],
  commandPaths: {},
});

write("catalog.json", { source: "bundled", pets: [], total: 0, page: 1, pageCount: 1 });

console.log(`verify-ui fixtures written to ${fixturesDir}`);
