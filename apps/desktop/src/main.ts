import { app, powerMonitor } from "electron";
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

import { getAppStateSnapshot, initializeAppState, releaseStartupInstallLock } from "./app-state.js";
import { createAppIcon } from "./assets.js";
import { installBuddyChatIpcHandler } from "./buddy-chat-ipc.js";
import { installBuddyProfileIpcHandlers } from "./buddy-profile-ipc.js";
import { installBuddyProfilePluginCapability } from "./buddy-profile-plugin-capability.js";
import { BuddyProfileStore } from "./buddy/buddy-profile-store.js";
import { setLocaleFromPreference } from "./i18n/index.js";
import { installDefaultPetDisplayHandlers, shouldOpenDefaultPetOnLaunch, showDefaultPet } from "./default-pet-controller.js";
import { installAppLifecycle } from "./lifecycle.js";
import { startLanController } from "./lan-controller.js";
import { debug, error as logError, getLogFilePath, info, initializeLogger, warn } from "./logger.js";
import { startLocalIpcServer } from "./local-ipc.js";
import { createInventoryAwarePluginJsHost, installBuddyInventorySdkCallHandlers } from "./inventory/buddy-inventory-plugin-sdk.js";
import { BuddyInventoryStore } from "./inventory/buddy-inventory-store.js";
import { initializeMonitorSelection, installMonitorSelectionIpc, installMonitorWindowGuard } from "./monitor-manager.js";
import { startDevPluginWatcher } from "./plugin-dev-watcher.js";
import { createElectronPluginHostCapabilities } from "./plugin-host-capabilities.js";
import { defaultPluginPetApi } from "./plugin-pet-api.js";
import { initializePluginPlatformSettings } from "./plugin-platform-settings.js";
import { ElectronPluginJsHost } from "./plugin-js-host.js";
import { bundledOfficialPluginIds, initializePluginService } from "./plugin-service.js";
import { registerPocketBuddyPlusBundledPlugins } from "./product-bundled-plugins.js";
import { APP_ID } from "./product.js";
import { applyPlusUserDataPath, getRuntimeProductName, isPlusRuntime } from "./product-runtime.js";
import { createAppTray, refreshTrayMenu } from "./tray.js";
import { checkForGitHubReleaseUpdate } from "./update-checker.js";
import { installInternalUiHandlers, installInternalUiProtocol } from "./windows.js";

// Plugin secrets use Electron safeStorage. Production must use the real OS
// credential backend (Keychain on macOS, DPAPI on Windows, a supported secret
// service on Linux). The previous unconditional `use-mock-keychain` switch was
// suitable only for tests and would weaken macOS secret protection.
//
// Linux is explicit because Pocket Buddy+ requires encrypted secret storage and
// should fail clearly if the selected keyring is unavailable rather than fall
// back to Chromium's basic-text backend.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("password-store", "gnome-libsecret");
}

// Chromium's native window occlusion tracker treats every window on a display
// as occluded while a fullscreen app is active there and stops painting it.
// For transparent always-on-top pet windows that means the pet goes blank
// during any fullscreen video or game even when its z-order is intact.
// Occlusion-based paint throttling saves next to nothing for windows this
// small, so trade it away to keep the pet drawn.
if (process.platform === "win32") {
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

// Pocket Buddy Plus requires programmatic window positioning and z-ordering,
// which native Wayland compositors disallow for XDG-shell toplevels. To ensure
// gravity, drag, and always-on-top work correctly on all KDE/GNOME Linux
// desktops, we force the x11/XWayland backend. Users who explicitly need
// native Wayland can set OPENPETS_ALLOW_WAYLAND=1, but gravity, walkabout,
// and manual drag will not function under native Wayland.
const isLinux = process.platform === "linux";
const allowWayland = process.env.OPENPETS_ALLOW_WAYLAND === "1";
const hasExplicitOzonePlatformArg = process.argv.some(
  (arg) => arg === "--ozone-platform" || arg.startsWith("--ozone-platform="),
);
// When OPENPETS_ALLOW_WAYLAND=1 we deliberately do NOT append an ozone-platform
// switch: Electron honours the system default (typically wayland on a Wayland
// session, or any explicit --ozone-platform the user passed) and we warn at
// startup that positioning/gravity/walkabout/drag are unsupported there.
if (isLinux && !allowWayland) {
  // Force x11 even if the user passed --ozone-platform=wayland or auto;
  // we overwrite any pre-existing switch so nothing silently slips through.
  app.commandLine.appendSwitch("ozone-platform", "x11");
}

// Must happen before any userData-derived path is read.
applyPlusUserDataPath();

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showDefaultPet();
  });
}

app.whenReady().then(async () => {
  try {
    app.setAppUserModelId(APP_ID);
    initializeLogger(app.getPath("userData"));
    info("app", "starting", {
      appId: APP_ID,
      productName: getRuntimeProductName(),
      plusRuntime: isPlusRuntime(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      logFile: getLogFilePath(),
    });
    if (isLinux && allowWayland) {
      warn("app", "native Wayland requested; pet positioning features are unavailable", {
        ozonePlatform: hasExplicitOzonePlatformArg ? "explicit" : "system-default",
        unsupported: ["gravity", "walkabout", "manual-drag", "programmatic-positioning"],
      });
    }

    const snapshot = await initializeAppState();
    setLocaleFromPreference(snapshot.settings.locale);
    initializePluginPlatformSettings({
      notificationsEnabled: snapshot.settings.plugins.notificationsEnabled,
      soundEnabled: snapshot.settings.plugins.soundEnabled,
      quietHoursStart: snapshot.settings.plugins.quietHoursStart,
      quietHoursEnd: snapshot.settings.plugins.quietHoursEnd,
      notificationCooldownMs: snapshot.settings.plugins.notificationCooldownMs,
    });
    initializeMonitorSelection(snapshot.settings.monitorId);
    installMonitorWindowGuard();
    installMonitorSelectionIpc();
    installInternalUiProtocol();
    installInternalUiHandlers();
    installDefaultPetDisplayHandlers();

    const userDataPath = app.getPath("userData");
    const buddyProfileStore = new BuddyProfileStore(userDataPath);
    buddyProfileStore.initialize(snapshot.buddyProfile);
    installBuddyProfileIpcHandlers(buddyProfileStore);
    installBuddyChatIpcHandler();

    const buddyInventoryStore = new BuddyInventoryStore(userDataPath);
    buddyInventoryStore.initialize();

    const capabilities = createElectronPluginHostCapabilities(userDataPath);
    installBuddyProfilePluginCapability(capabilities, buddyProfileStore);
    const pluginJsHost = createInventoryAwarePluginJsHost(
      new ElectronPluginJsHost(capabilities),
      buddyInventoryStore,
    );
    installBuddyInventorySdkCallHandlers(pluginJsHost.sdkBridge, buddyInventoryStore);
    registerPocketBuddyPlusBundledPlugins(bundledOfficialPluginIds);
    const pluginService = initializePluginService({
      userDataPath,
      jsHost: pluginJsHost,
      capabilities,
    });
    await pluginService.initialize();

    const pluginRoots = (process.env.OPENPETS_DEV_PLUGIN_ROOTS ?? "")
      .split(delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => resolve(entry));
    if (pluginRoots.length > 0) startDevPluginWatcher(pluginRoots, pluginService);

    installAppLifecycle();
    createAppTray(createAppIcon());
    refreshTrayMenu();
    startLocalIpcServer();
    startLanController();

    if (shouldOpenDefaultPetOnLaunch(snapshot)) showDefaultPet();

    if (snapshot.settings.updateChecksEnabled) {
      void checkForGitHubReleaseUpdate().catch((err) => {
        warn("updates", "release check failed", { reason: err instanceof Error ? err.message : String(err) });
      });
    }

    if (powerMonitor) {
      powerMonitor.on("resume", () => {
        debug("app", "system resumed");
        if (shouldOpenDefaultPetOnLaunch(getAppStateSnapshot())) showDefaultPet();
      });
    }

    releaseStartupInstallLock();
  } catch (err) {
    releaseStartupInstallLock();
    logError("app", "startup failed", { reason: err instanceof Error ? err.message : String(err) });
    app.quit();
  }
});
