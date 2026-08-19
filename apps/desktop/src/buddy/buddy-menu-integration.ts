import { app, Menu, type MenuItemConstructorOptions } from "electron";

import { t } from "../i18n/index.js";
import { error as logError } from "../logger.js";
import { getBuddyMenuItems, type BuddyMenuAction } from "./buddy-menu.js";

const BUDDY_BRAIN_PLUGIN_ID = "openpets.virtual-pet";

/**
 * The inherited pet window still owns the Electron context-menu builder. Keep
 * its plugin/menu polish intact while restoring the Pocket Buddy product
 * contract at the Menu boundary. The guard is deliberately narrow: only the
 * default-pet template contains both the localized Control Center and Hide Pet
 * actions, so agent-pet, tray, command-form, and unrelated Electron menus are
 * left untouched.
 */
function isDefaultPetMenu(template: readonly MenuItemConstructorOptions[]): boolean {
  const labels = new Set(template.map((item) => item.label).filter((label): label is string => typeof label === "string"));
  return labels.has(t("pet.menu.openControlCenter")) && labels.has(t("pet.menu.hidePet"));
}

function openControlCenter(route: "dashboard" | "pets" | "plugins" | "settings"): void {
  void import("../windows.js")
    .then(({ openControlCenterWindow }) => openControlCenterWindow(route))
    .catch((error) => logError("pet.window", `Buddy menu failed to open Control Center route: ${route}`, error));
}

function runBuddyBrainCommand(commandId: string): void {
  void import("../plugin-service.js")
    .then(({ executeDefaultPetPluginCommand }) => executeDefaultPetPluginCommand(BUDDY_BRAIN_PLUGIN_ID, commandId))
    .catch((error) => logError("pet.window", `Buddy menu command failed: ${commandId}`, error));
}

function runBuddyMenuAction(action: BuddyMenuAction): void {
  switch (action) {
    case "pet":
      runBuddyBrainCommand("pet");
      return;
    case "buddies":
      openControlCenter("pets");
      return;
    case "status":
      runBuddyBrainCommand("status");
      return;
    case "settings":
      openControlCenter("settings");
      return;
    case "quit":
      app.quit();
      return;
    case "talk":
    case "name":
    case "collection":
    case "notes-and-tasks":
    case "guide":
    case "field-guide":
    case "wardrobe":
      // These creature-owned surfaces now live under the unified Buddy Brain.
      // Opening that canonical panel avoids reviving the retired renderer-local
      // Buddy state while preserving the original attached-menu entry points.
      runBuddyBrainCommand("open-brain");
      return;
  }
}

const originalBuildFromTemplate = Menu.buildFromTemplate.bind(Menu);

Menu.buildFromTemplate = ((template: MenuItemConstructorOptions[]): Menu => {
  if (!isDefaultPetMenu(template)) return originalBuildFromTemplate(template);

  const protectedItems = getBuddyMenuItems({ supportsProcessExit: true });
  const existingLabels = new Set(template.map((item) => item.label).filter((label): label is string => typeof label === "string"));
  const missingItems = protectedItems.filter((item) => !existingLabels.has(item.label));
  if (missingItems.length === 0) return originalBuildFromTemplate(template);

  const restored: MenuItemConstructorOptions[] = missingItems.map((item) => ({
    label: item.label,
    click: () => runBuddyMenuAction(item.action),
  }));
  restored.push({ type: "separator" }, ...template);
  return originalBuildFromTemplate(restored);
}) as typeof Menu.buildFromTemplate;
