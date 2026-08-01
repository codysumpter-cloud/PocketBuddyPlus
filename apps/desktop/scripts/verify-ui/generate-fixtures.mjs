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

// Shape mirrors getPetsStateSnapshot() in src/windows.ts.
const pet = (id, displayName, builtIn) => ({
  id,
  displayName,
  builtIn,
  broken: false,
  source: builtIn ? "builtin" : "catalog",
  version: "1.0.0",
  installedAt: 1785500000000,
});

write("pets-state.json", {
  preferences: { defaultPetId: "builtin" },
  pets: {
    installed: [pet("builtin", "Professor Hoot", true), pet("catalog-fox", "Ember Fox", false)],
  },
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

// Shape mirrors getSettingsStateSnapshot() in src/windows.ts, including
// petScaleOptions from src/app-state-core.ts.
write("settings.json", {
  preferences: {
    openDefaultPetOnLaunch: true,
    petScale: 1,
    reactionAnimationOverrides: {},
    petPoolOrder: [],
    petPoolEnabled: false,
    petConfinementEnabled: false,
    petCrossDisplayEnabled: false,
    petGravityEnabled: true,
  },
  petScaleOptions: [
    { label: "XS", value: 0.5 },
    { label: "Small", value: 0.75 },
    { label: "Medium", value: 1 },
    { label: "Large", value: 1.25 },
    { label: "Huge", value: 1.5 },
  ],
  petPoolCandidates: [{ id: "catalog-fox", displayName: "Ember Fox" }],
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

// integrations.json is emitted by tests/verify-ui-fixtures.ts, which is type
// checked against AgentSetupSnapshot. Do not duplicate (or clobber) it here.

write("catalog.json", { source: "bundled", pets: [], total: 0, page: 1, pageCount: 1 });

console.log(`verify-ui fixtures written to ${fixturesDir}`);
