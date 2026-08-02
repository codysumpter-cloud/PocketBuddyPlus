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

// pets-state.json is emitted by tests/verify-ui-fixtures.ts, type checked
// against InstalledPetState. Do not duplicate (or clobber) it here.

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

// plugins.json / plugin-catalog.json are emitted by tests/verify-ui-fixtures.ts,
// type checked against PluginServiceSnapshot and SafePluginRecord.

// integrations.json is emitted by tests/verify-ui-fixtures.ts, which is type
// checked against AgentSetupSnapshot. Do not duplicate (or clobber) it here.

write("catalog.json", { source: "bundled", pets: [], total: 0, page: 1, pageCount: 1 });

console.log(`verify-ui fixtures written to ${fixturesDir}`);
