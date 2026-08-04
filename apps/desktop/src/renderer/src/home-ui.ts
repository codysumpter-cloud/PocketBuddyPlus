import { HOME_PUBLIC_ASSETS, type HomeDirection, type HomeItemAction } from "@open-pets/buddy-domain";
import {
  HOME_BRUSHES,
  HOME_ITEM_ASSETS,
  HOME_MODES,
  mountPhaserHome,
  type HomeBrush,
  type HomeMode,
  type PhaserHomeController,
  type PhaserHomeSnapshot,
} from "./home/phaser-home";
import "./home-ui.css";

let modal: HTMLDivElement | null = null;
let controller: PhaserHomeController | null = null;
let selectedMode: HomeMode = "play";
let selectedBrush: HomeBrush = "floor.wood";
let selectedAssetId = HOME_ITEM_ASSETS[0] ?? "home.bed.basic";
let observerQueued = false;

function createHomeNavButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-tab pb-home-nav";
  button.innerHTML = '<span class="pb-home-nav-icon" aria-hidden="true">◆</span><span>Home</span>';
  button.addEventListener("click", openHome);
  return button;
}

function ensureHomeNavButton(): void {
  if (document.querySelector(".pb-home-nav")) return;
  const nav = document.querySelector(".nav-bar");
  if (!nav) return;
  const button = createHomeNavButton();
  const settingsTab = Array.from(nav.querySelectorAll<HTMLElement>(".nav-tab"))
    .find((entry) => entry.textContent?.trim().toLowerCase() === "settings");
  if (settingsTab) nav.insertBefore(button, settingsTab);
  else nav.append(button);
}

function createHomeModal(): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "pb-home-modal";
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-modal", "true");
  element.setAttribute("aria-label", "Pocket Buddy Home");
  element.innerHTML = `
    <div class="pb-home-backdrop" data-home-close></div>
    <section class="pb-home-panel">
      <header class="pb-home-header">
        <div>
          <p class="pb-home-eyebrow">Pocket Buddy+ · Home</p>
          <h2>Buddy Home</h2>
          <p>Live with Buddy, decorate the room, use objects, and keep one canonical world state.</p>
        </div>
        <button type="button" class="pb-home-close" data-home-close aria-label="Close Home">×</button>
      </header>
      <div class="pb-home-toolbar" aria-label="Home tools">
        <div class="pb-home-tool-section">
          <span class="pb-home-tool-label">Mode</span>
          <div class="pb-home-mode-buttons" role="group" aria-label="Home mode">
            ${HOME_MODES.map(modeButton).join("")}
          </div>
        </div>
        <div class="pb-home-tool-section" data-home-floor-tools>
          <span class="pb-home-tool-label">Floor</span>
          <div class="pb-home-brushes" role="group" aria-label="Floor brush">
            ${HOME_BRUSHES.map(brushButton).join("")}
          </div>
        </div>
        <div class="pb-home-tool-section pb-home-furniture-section" data-home-furniture-tools>
          <span class="pb-home-tool-label">Furniture</span>
          <div class="pb-home-items" role="group" aria-label="Furniture item">
            ${HOME_PUBLIC_ASSETS.map(itemButton).join("")}
          </div>
        </div>
        <div class="pb-home-actions">
          <button type="button" data-home-pet>Pet Buddy</button>
          <button type="button" data-home-use>Use selected</button>
          <button type="button" data-home-channel>Next TV channel</button>
          <button type="button" data-home-rotate="-1" title="Rotate room left">↶ Rotate</button>
          <button type="button" data-home-rotate="1" title="Rotate room right">Rotate ↷</button>
          <button type="button" data-home-clear-floor>Reset floor</button>
          <button type="button" data-home-reset-room>Reset room</button>
        </div>
        <div class="pb-home-movement" role="group" aria-label="Move player">
          <button type="button" data-home-move="north" aria-label="Move north">↑</button>
          <button type="button" data-home-move="west" aria-label="Move west">←</button>
          <button type="button" data-home-move="south" aria-label="Move south">↓</button>
          <button type="button" data-home-move="east" aria-label="Move east">→</button>
        </div>
      </div>
      <div class="pb-home-stage" data-home-stage tabindex="0" aria-label="Playable Buddy Home"></div>
      <footer class="pb-home-footer">
        <span data-home-status>Camera SE · Play mode · 0 items</span>
        <span data-home-thought>Buddy is taking in the new room.</span>
        <span class="pb-home-help">WASD or arrows move the player. Click Buddy to pet. Click usable furniture to interact.</span>
      </footer>
    </section>
  `;
  element.addEventListener("click", handleModalClick);
  return element;
}

function modeButton(mode: HomeMode): string {
  const labels: Record<HomeMode, string> = {
    play: "Play",
    paint: "Paint",
    place: "Place",
    remove: "Remove",
  };
  return `<button type="button" data-home-mode="${mode}" class="${mode === selectedMode ? "active" : ""}">${labels[mode]}</button>`;
}

function brushButton(brush: HomeBrush): string {
  const labels: Record<HomeBrush, string> = {
    "floor.wood": "Wood",
    "floor.stone": "Stone",
    "floor.grass": "Grass",
    "floor.water": "Water",
    erase: "Erase",
  };
  const swatchClass = brush.replace("floor.", "");
  return `<button type="button" data-home-brush="${brush}" class="${brush === selectedBrush ? "active" : ""}">
    <span class="pb-home-swatch ${swatchClass}" aria-hidden="true"></span>${labels[brush]}
  </button>`;
}

function itemButton(asset: (typeof HOME_PUBLIC_ASSETS)[number]): string {
  const active = asset.assetId === selectedAssetId ? "active" : "";
  return `<button type="button" data-home-item-asset="${asset.assetId}" class="${active}" title="${asset.label}">
    <span class="pb-home-item-dot" style="--home-item-color:#${asset.color.toString(16).padStart(6, "0")}" aria-hidden="true"></span>
    ${asset.label}
  </button>`;
}

function openHome(): void {
  if (!modal) modal = createHomeModal();
  if (!modal.isConnected) document.body.append(modal);
  document.body.classList.add("pb-home-open");
  const stage = modal.querySelector<HTMLElement>("[data-home-stage]");
  if (!stage) return;
  controller?.destroy();
  controller = mountPhaserHome(stage, { onStateChange: updateHomeStatus });
  controller.setMode(selectedMode);
  controller.setBrush(selectedBrush);
  controller.setItemAsset(selectedAssetId);
  requestAnimationFrame(() => stage.focus());
}

function updateHomeStatus(snapshot: PhaserHomeSnapshot): void {
  selectedMode = snapshot.mode;
  selectedAssetId = snapshot.selectedAssetId;
  const status = modal?.querySelector<HTMLElement>("[data-home-status]");
  const thought = modal?.querySelector<HTMLElement>("[data-home-thought]");
  if (status) {
    const brush = snapshot.brush === "erase"
      ? "Erase"
      : snapshot.brush.replace("floor.", "").replace(/^./, (letter) => letter.toUpperCase());
    const selected = snapshot.selectedItemId ? ` · selected ${snapshot.selectedItemId}` : "";
    status.textContent = `Camera ${snapshot.cameraCorner} · ${capitalize(snapshot.mode)} mode · ${snapshot.itemCount} items · ${snapshot.buddyName} feels ${snapshot.buddyMood}${snapshot.mode === "paint" ? ` · ${brush} brush · ${snapshot.paintedTiles} painted` : ""}${selected}`;
  }
  if (thought) thought.textContent = `“${snapshot.thought}”`;
  syncActiveControls();
}

function closeHome(): void {
  controller?.destroy();
  controller = null;
  modal?.remove();
  document.body.classList.remove("pb-home-open");
}

function handleModalClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("[data-home-close]")) {
    closeHome();
    return;
  }

  const modeButton = target.closest<HTMLButtonElement>("[data-home-mode]");
  if (modeButton) {
    const mode = modeButton.dataset.homeMode as HomeMode;
    if (!HOME_MODES.includes(mode)) return;
    selectedMode = mode;
    controller?.setMode(mode);
    syncActiveControls();
    return;
  }

  const brushButton = target.closest<HTMLButtonElement>("[data-home-brush]");
  if (brushButton) {
    const brush = brushButton.dataset.homeBrush as HomeBrush;
    if (!HOME_BRUSHES.includes(brush)) return;
    selectedBrush = brush;
    selectedMode = "paint";
    controller?.setBrush(brush);
    controller?.setMode("paint");
    syncActiveControls();
    return;
  }

  const itemButton = target.closest<HTMLButtonElement>("[data-home-item-asset]");
  if (itemButton) {
    const assetId = itemButton.dataset.homeItemAsset ?? "";
    if (!HOME_ITEM_ASSETS.includes(assetId)) return;
    selectedAssetId = assetId;
    selectedMode = "place";
    controller?.setItemAsset(assetId);
    controller?.setMode("place");
    syncActiveControls();
    return;
  }

  const moveButton = target.closest<HTMLButtonElement>("[data-home-move]");
  if (moveButton) {
    controller?.movePlayer(moveButton.dataset.homeMove as HomeDirection);
    return;
  }

  const rotateButton = target.closest<HTMLButtonElement>("[data-home-rotate]");
  if (rotateButton) {
    controller?.rotate(Number(rotateButton.dataset.homeRotate));
    return;
  }

  if (target.closest("[data-home-pet]")) controller?.petBuddy();
  else if (target.closest("[data-home-use]")) controller?.interactSelected();
  else if (target.closest("[data-home-channel]")) controller?.interactSelected("next-channel" as HomeItemAction);
  else if (target.closest("[data-home-clear-floor]")) controller?.clearFloor();
  else if (target.closest("[data-home-reset-room]")) controller?.resetRoom();
}

function syncActiveControls(): void {
  modal?.querySelectorAll<HTMLElement>("[data-home-mode]").forEach((entry) => {
    entry.classList.toggle("active", entry.dataset.homeMode === selectedMode);
  });
  modal?.querySelectorAll<HTMLElement>("[data-home-brush]").forEach((entry) => {
    entry.classList.toggle("active", entry.dataset.homeBrush === selectedBrush);
  });
  modal?.querySelectorAll<HTMLElement>("[data-home-item-asset]").forEach((entry) => {
    entry.classList.toggle("active", entry.dataset.homeItemAsset === selectedAssetId);
  });
}

function queueEnsure(): void {
  if (observerQueued) return;
  observerQueued = true;
  queueMicrotask(() => {
    observerQueued = false;
    ensureHomeNavButton();
  });
}

function capitalize(value: string): string {
  return value.replace(/^./, (letter) => letter.toUpperCase());
}

const observer = new MutationObserver(queueEnsure);
observer.observe(document.documentElement, { childList: true, subtree: true });
ensureHomeNavButton();

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal?.isConnected) closeHome();
});
