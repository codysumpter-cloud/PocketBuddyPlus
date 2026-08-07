// Home panel entry. Ported from the app's home-ui.ts.
//
// The app version injected a nav tab and opened a modal over the dashboard. A
// panel is already its own window, so the nav button, the MutationObserver that
// kept re-adding it, the modal chrome and the Escape-to-close handler are all
// gone; the toolbar and stage render straight into the page.
//
// The other change is the save. The scene used to write to browser-local
// storage synchronously. Panel storage is sandboxed per `file:` page and does
// not survive reinstalls, so the host owns the save: it is requested once
// before the scene mounts, then written back through the message channel.
import { HOME_PUBLIC_ASSETS, type HomeDirection, type HomeItemAction } from "@open-pets/buddy-domain";
import { setHomeSprites } from "./home-scene";
import {
  HOME_BRUSHES,
  HOME_ITEM_ASSETS,
  HOME_MODES,
  mountPhaserHome,
  type HomeBrush,
  type HomeMode,
  type PhaserHomeController,
  type PhaserHomeSnapshot,
} from "./home-scene";

let controller: PhaserHomeController | null = null;
let selectedMode: HomeMode = "play";
let selectedBrush: HomeBrush = "floor.wood";
let selectedAssetId = HOME_ITEM_ASSETS[0] ?? "home.bed.basic";
let root: HTMLElement;

/** The panel side of the plugin bridge, exposed by panel-preload.cjs. */
interface PanelBridge {
  postMessage(message: unknown): void;
  onMessage(handler: (message: unknown) => void): () => void;
  close(): void;
}

const bridge = (globalThis as { openPetsPanel?: PanelBridge }).openPetsPanel;

function modeButton(mode: HomeMode): string {
  const labels: Record<HomeMode, string> = { play: "Play", paint: "Paint", place: "Place", remove: "Remove" };
  return `<button type="button" data-home-mode="${mode}" class="${mode === selectedMode ? "active" : ""}">${labels[mode]}</button>`;
}

function brushButton(brush: HomeBrush): string {
  const labels: Record<HomeBrush, string> = {
    "floor.wood": "Wood", "floor.stone": "Stone", "floor.grass": "Grass", "floor.water": "Water", erase: "Erase",
  };
  return `<button type="button" data-home-brush="${brush}" class="${brush === selectedBrush ? "active" : ""}">
    <span class="pb-home-swatch ${brush.replace("floor.", "")}" aria-hidden="true"></span>${labels[brush]}
  </button>`;
}

function itemButton(asset: (typeof HOME_PUBLIC_ASSETS)[number]): string {
  return `<button type="button" data-home-item-asset="${asset.assetId}" class="${asset.assetId === selectedAssetId ? "active" : ""}" title="${asset.label}">
    <span class="pb-home-item-dot" aria-hidden="true"></span>
    ${asset.label}
  </button>`;
}

function renderShell(): void {
  root.innerHTML = `
    <header class="pb-home-header">
      <div>
        <p class="pb-home-eyebrow">Pocket Buddy+ · Home</p>
        <h1>Buddy Home</h1>
        <p>Live with Buddy, decorate the room, use objects, and keep one canonical world state.</p>
      </div>
      <button type="button" class="pb-home-close" data-home-close aria-label="Close Home">×</button>
    </header>
    <div class="pb-home-toolbar" aria-label="Home tools">
      <div class="pb-home-tool-section">
        <span class="pb-home-tool-label">Mode</span>
        <div class="pb-home-mode-buttons" role="group" aria-label="Home mode">${HOME_MODES.map(modeButton).join("")}</div>
      </div>
      <div class="pb-home-tool-section" data-home-floor-tools>
        <span class="pb-home-tool-label">Floor</span>
        <div class="pb-home-brushes" role="group" aria-label="Floor brush">${HOME_BRUSHES.map(brushButton).join("")}</div>
      </div>
      <div class="pb-home-tool-section pb-home-furniture-section" data-home-furniture-tools>
        <span class="pb-home-tool-label">Furniture</span>
        <div class="pb-home-items" role="group" aria-label="Furniture item">${HOME_PUBLIC_ASSETS.map(itemButton).join("")}</div>
      </div>
      <div class="pb-home-actions">
        <button type="button" data-home-pet>Pet Buddy</button>
        <button type="button" data-home-use>Use selected</button>
        <button type="button" data-home-channel>Next TV channel</button>
        <button type="button" data-home-rotate="-1" title="Rotate room left">↶ Rotate</button>
        <button type="button" data-home-rotate="1" title="Rotate room right">Rotate ↷</button>
        <button type="button" data-home-clear-floor>Reset floor</button>
        <button type="button" data-home-reset-room>Reset room</button>
        <button type="button" data-home-load-pack title="Load sprites from your own TinyHouse pack folder">Load TinyHouse art</button>
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
  `;
  root.addEventListener("click", handleClick);
}

function updateHomeStatus(snapshot: PhaserHomeSnapshot): void {
  selectedMode = snapshot.mode;
  selectedAssetId = snapshot.selectedAssetId;
  const status = root.querySelector<HTMLElement>("[data-home-status]");
  const thought = root.querySelector<HTMLElement>("[data-home-thought]");
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

function handleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("[data-home-close]")) { bridge?.close(); return; }

  const mode = target.closest<HTMLButtonElement>("[data-home-mode]");
  if (mode) {
    const value = mode.dataset.homeMode as HomeMode;
    if (!HOME_MODES.includes(value)) return;
    selectedMode = value;
    controller?.setMode(value);
    syncActiveControls();
    return;
  }

  const brush = target.closest<HTMLButtonElement>("[data-home-brush]");
  if (brush) {
    const value = brush.dataset.homeBrush as HomeBrush;
    if (!HOME_BRUSHES.includes(value)) return;
    selectedBrush = value;
    selectedMode = "paint";
    controller?.setBrush(value);
    controller?.setMode("paint");
    syncActiveControls();
    return;
  }

  const item = target.closest<HTMLButtonElement>("[data-home-item-asset]");
  if (item) {
    const assetId = item.dataset.homeItemAsset ?? "";
    if (!HOME_ITEM_ASSETS.includes(assetId)) return;
    selectedAssetId = assetId;
    selectedMode = "place";
    controller?.setItemAsset(assetId);
    controller?.setMode("place");
    syncActiveControls();
    return;
  }

  const move = target.closest<HTMLButtonElement>("[data-home-move]");
  if (move) { controller?.movePlayer(move.dataset.homeMove as HomeDirection); return; }

  const rotate = target.closest<HTMLButtonElement>("[data-home-rotate]");
  if (rotate) { controller?.rotate(Number(rotate.dataset.homeRotate)); return; }

  if (target.closest("[data-home-load-pack]")) { setPackStatus("Choose your TinyHouse images…"); bridge?.postMessage({ type: "home-pack-pick" }); return; }

  if (target.closest("[data-home-pet]")) controller?.petBuddy();
  else if (target.closest("[data-home-use]")) controller?.interactSelected();
  else if (target.closest("[data-home-channel]")) controller?.interactSelected("next-channel" as HomeItemAction);
  else if (target.closest("[data-home-clear-floor]")) controller?.clearFloor();
  else if (target.closest("[data-home-reset-room]")) controller?.resetRoom();
}

function syncActiveControls(): void {
  for (const entry of root.querySelectorAll<HTMLElement>("[data-home-mode]")) entry.classList.toggle("active", entry.dataset.homeMode === selectedMode);
  for (const entry of root.querySelectorAll<HTMLElement>("[data-home-brush]")) entry.classList.toggle("active", entry.dataset.homeBrush === selectedBrush);
  for (const entry of root.querySelectorAll<HTMLElement>("[data-home-item-asset]")) entry.classList.toggle("active", entry.dataset.homeItemAsset === selectedAssetId);
}

function setPackStatus(text: string): void {
  const node = root.querySelector<HTMLElement>("[data-home-thought]");
  if (node) node.textContent = text;
}

// Sprites arrive in pieces because a panel message is capped at 64 KiB.
const spriteChunks = new Map<string, string[]>();
const loadedSprites: Record<string, CanvasImageSource> = {};

function decodeSprite(key: string, dataUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => { loadedSprites[key] = image; resolve(); };
    image.onerror = () => resolve();  // one bad file must not stall the rest
    image.src = dataUrl;
  });
}

async function handlePackMessage(message: Record<string, unknown>): Promise<boolean> {
  switch (message.type) {
    case "home-pack-begin":
      spriteChunks.clear();
      setPackStatus("Loading TinyHouse art…");
      return true;
    case "home-pack-chunk": {
      const key = String(message.key ?? "");
      const parts = spriteChunks.get(key) ?? [];
      parts[Number(message.index)] = String(message.data ?? "");
      spriteChunks.set(key, parts);
      if (parts.filter((part) => typeof part === "string").length === Number(message.count)) {
        await decodeSprite(key, parts.join(""));
        spriteChunks.delete(key);
      }
      return true;
    }
    case "home-pack-end": {
      const count = Object.keys(loadedSprites).length;
      setHomeSprites({ ...loadedSprites });
      setPackStatus(count ? `TinyHouse art loaded — ${count} sprites.` : "No TinyHouse art loaded.");
      return true;
    }
    case "home-pack-cancelled":
      setPackStatus("Art loading cancelled.");
      return true;
    case "home-pack-error":
      setPackStatus(String(message.error ?? "Could not load the pack."));
      return true;
    default:
      return false;
  }
}

function capitalize(value: string): string {
  return value.replace(/^./, (letter) => letter.toUpperCase());
}

/** Ask the host for the saved room, giving up rather than hanging on a silent host. */
function requestSavedState(timeoutMs = 4_000): Promise<Record<string, string>> {
  if (!bridge) return Promise.resolve({});
  return new Promise((resolve) => {
    const done = (values: Record<string, string>) => { window.clearTimeout(timer); resolve(values); };
    const timer = window.setTimeout(() => done({}), timeoutMs);
    bridge.onMessage((message) => {
      if (typeof message !== "object" || message === null) return;
      const record = message as Record<string, unknown>;
      if (record.type === "home-state") {
        const values = record.values;
        done(typeof values === "object" && values !== null ? values as Record<string, string> : {});
        return;
      }
      void handlePackMessage(record);
    });
    bridge.postMessage({ type: "home-state-request" });
  });
}

async function start(): Promise<void> {
  const container = document.getElementById("home-root");
  if (!container) return;
  root = container;
  renderShell();
  const stage = root.querySelector<HTMLElement>("[data-home-stage]");
  if (!stage) return;

  const saved = await requestSavedState();
  controller = mountPhaserHome(stage, {
    onStateChange: updateHomeStatus,
    store: {
      read: (key) => saved[key] ?? null,
      write: (key, value) => {
        // Keep the in-memory copy authoritative too, so a reset-and-reload
        // inside one session does not resurrect the pre-reset room.
        saved[key] = value;
        bridge?.postMessage({ type: "home-state-write", key, value });
      },
    },
  });
  controller.setMode(selectedMode);
  controller.setBrush(selectedBrush);
  controller.setItemAsset(selectedAssetId);
  requestAnimationFrame(() => stage.focus());
}

void start();
