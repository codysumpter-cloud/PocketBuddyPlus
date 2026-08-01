/**
 * Headless verification preload.
 *
 * Mirrors control-center-preload.cjs exactly, but resolves every channel from
 * in-process fixtures instead of IPC, so the real renderer bundle can be booted
 * in a hidden window with no main process behind it. This is a *renderer* level
 * harness: it objectively covers branding, theming, layout, overflow, focus
 * order, and accessible names. It deliberately does NOT stand in for
 * main-process behaviour (persistence, care actions, quit/relaunch), which is
 * covered by the packaged smoke test instead.
 */
const { contextBridge } = require("electron");

// The preload shares the DOM event target with the main world, so this catches
// renderer boot failures with a stack the harness can act on.
window.addEventListener("error", (event) => {
  console.error(`[harness] uncaught: ${event.message}\n${event.error && event.error.stack ? event.error.stack : "(no stack)"}`);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  console.error(`[harness] unhandled rejection: ${reason && reason.stack ? reason.stack : String(reason)}`);
});

const noop = () => () => {};

const i18n = require("./fixtures/i18n.json");
const petsState = require("./fixtures/pets-state.json");
const dashboard = require("./fixtures/dashboard.json");
const settings = require("./fixtures/settings.json");
const plugins = require("./fixtures/plugins.json");
const integrations = require("./fixtures/integrations.json");
const pluginCatalog = require("./fixtures/plugin-catalog.json");
const catalog = require("./fixtures/catalog.json");

const ok = (value) => () => Promise.resolve(value);

const api = {
  getPetsState: ok(petsState),
  getDashboardSnapshot: ok(dashboard),
  getSettingsState: ok(settings),
  getLanStatus: ok({ enabled: false, mode: "off", clients: [], serverUrl: null, token: null }),
  getI18n: ok(i18n),
  updatePreferences: ok(settings),
  getReactionAnimationSettings: ok({ enabled: true, mappings: {} }),
  getLaunchAtLogin: ok(false),
  setLaunchAtLogin: ok(false),
  getUpdateStatus: ok({ state: "current", currentVersion: "3.3.0", latestVersion: "3.3.0", releaseUrl: null, error: null }),
  checkForUpdates: ok({ state: "current", currentVersion: "3.3.0", latestVersion: "3.3.0", releaseUrl: null, error: null }),
  openUpdateReleasePage: ok(undefined),
  resetDefaultPetPosition: ok(undefined),
  getPluginsSnapshot: ok(plugins),
  getPluginCatalogSnapshot: ok(pluginCatalog),
  setPluginEnabled: ok(plugins),
  savePluginConfig: ok({ ok: true }),
  pickPluginConfigSound: ok(null),
  reloadPlugin: ok({ ok: true }),
  refreshLocalPlugin: ok({ ok: true }),
  executePluginCommand: ok({ ok: true }),
  loadLocalPlugin: ok({ ok: false, error: "headless" }),
  installCatalogPlugin: ok({ ok: true }),
  updateCatalogPlugin: ok({ ok: true }),
  uninstallPlugin: ok({ ok: true }),
  getPluginInspector: ok({ id: "", logs: [], state: {}, config: {} }),
  getPluginPlatformSettings: ok({ ai: { provider: "none", model: "" }, network: { allowLan: false } }),
  updatePluginPlatformSettings: ok({ ok: true }),
  setPluginAiApiKey: ok({ ok: true }),
  getPluginAiApiKeyStatus: ok({ configured: false }),
  getCatalog: ok(catalog),
  getCatalogPage: ok(catalog),
  getCatalogSearch: ok(catalog),
  getCodexPets: ok({ pets: [] }),
  setDefaultPet: ok(petsState),
  setPetPoolOrder: ok(petsState),
  installPet: ok({ ok: true }),
  installLocalPet: ok({ ok: false, error: "headless" }),
  importCodexPet: ok({ ok: true }),
  openGallery: ok(undefined),
  removePet: ok(petsState),
  onRouteChange: noop,
  onPluginsRefresh: noop,
  getIntegrationsState: ok(integrations),
  runIntegrationAction: ok(integrations),
  updateIntegrationCommandPaths: ok(integrations),
};

contextBridge.exposeInMainWorld("openPetsControlCenter", api);
// Lets the harness know the stub is live and every channel is accounted for.
contextBridge.exposeInMainWorld("__pbpHarness", { channels: Object.keys(api).sort() });
