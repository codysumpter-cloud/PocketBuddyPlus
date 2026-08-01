import { app, Menu, shell, Tray, type MenuItemConstructorOptions } from "electron";

import { getAppStateSnapshot } from "./app-state.js";
import { createTrayIcon } from "./assets.js";
import { hideDefaultPet, isDefaultPetVisible, setDefaultPetPaused, showDefaultPet } from "./default-pet-controller.js";
import { t } from "./i18n/index.js";
import { quitOpenPets } from "./lifecycle.js";
import { info, openLogsFolder } from "./logger.js";
import { PRODUCT_WEBSITE_URL, UPSTREAM_WEBSITE_URL, isPocketBuddyPlusBuild } from "./product.js";
import { shellState, togglePaused } from "./state.js";
import { getUpdateStatus, openUpdateReleasePage } from "./update-checker.js";
import { openControlCenterWindow } from "./windows.js";

let tray: Tray | null = null;

export function createAppTray(): Tray {
  if (tray) {
    return tray;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip(app.getName());
  refreshTrayMenu();
  info("tray", "created", { product: app.getName() });
  console.log(`${app.getName()} tray created.`);

  return tray;
}

export function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }

  const state = getAppStateSnapshot();
  const defaultPet = state.pets.installed.find((pet) => pet.id === state.preferences.defaultPetId && !pet.broken) ?? state.pets.installed[0];
  const defaultPetName = defaultPet?.displayName ?? t("common.builtInPet");

  const menu = Menu.buildFromTemplate([
    {
      label: app.getName(),
      enabled: false,
    },
    ...createUpdateMenuItems(),
    { type: "separator" },
    {
      label: t("tray.defaultPet", { name: defaultPetName }),
      click: () => openControlCenterWindow("pets"),
    },
    {
      label: isDefaultPetVisible() ? t("tray.hideDefaultPet") : t("tray.showDefaultPet"),
      click: () => {
        if (isDefaultPetVisible()) {
          hideDefaultPet();
        } else {
          showDefaultPet();
        }

        refreshTrayMenu();
      },
    },
    {
      label: shellState.paused ? t("tray.resumeAllPets") : t("tray.pauseAllPets"),
      click: () => {
        const paused = togglePaused();
        setDefaultPetPaused(paused);
        info("tray", "pause toggled", { paused });
        console.log(paused ? `${app.getName()} paused.` : `${app.getName()} resumed.`);
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: t("tray.managePets"),
      click: () => openControlCenterWindow("pets"),
    },
    {
      label: t("tray.controlCenter"),
      click: () => openControlCenterWindow(),
    },
    {
      label: t("tray.integrations"),
      click: () => openControlCenterWindow("integrations"),
    },
    {
      label: t("tray.plugins"),
      click: () => openControlCenterWindow("plugins"),
    },
    {
      label: t("tray.settings"),
      click: () => openControlCenterWindow("settings"),
    },
    { type: "separator" },
    {
      label: t("tray.website"),
      click: () => { void shell.openExternal(isPocketBuddyPlusBuild(app.getName()) ? PRODUCT_WEBSITE_URL : UPSTREAM_WEBSITE_URL); },
    },
    {
      label: t("tray.openLogsFolder"),
      click: () => { void openLogsFolder(); },
    },
    { type: "separator" },
    {
      label: t("tray.quit", { name: app.getName() }),
      click: () => quitOpenPets(),
    },
  ]);

  tray.setContextMenu(menu);
}

function createUpdateMenuItems(): MenuItemConstructorOptions[] {
  const status = getUpdateStatus();
  if (status.state !== "available") return [];
  return [
    {
      label: t("tray.updateAvailable", { version: status.latestVersion ?? t("common.latest") }),
      click: () => { void openUpdateReleasePage(); },
    },
  ];
}
