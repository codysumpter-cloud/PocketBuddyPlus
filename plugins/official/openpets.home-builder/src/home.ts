import { HOME_PUBLIC_ASSETS, type HomeDirection, type HomeItemAction } from "@open-pets/buddy-domain";
import {
  HOME_BRUSHES,
  HOME_ITEM_ASSETS,
  HOME_MODES,
  HOME_SIMULATION_MODES,
  mountPhaserHome,
  setHomeSprites,
  type HomeBrush,
  type HomeBuddyPresence,
  type HomeMode,
  type HomeSimulationMode,
  type PhaserHomeController,
  type PhaserHomeSnapshot,
} from "./home-scene";

type PresentationMode = "panel" | "home" | "buddy";
type PanelMessage = Record<string, unknown>;

const rootElement = document.getElementById("home-root");
if (!rootElement) throw new Error("Home panel root is missing");
const root: HTMLElement = rootElement;

let controller: PhaserHomeController | null = null;
let selectedMode: HomeMode = "play";
let selectedBrush: HomeBrush = "floor.wood";
let selectedAssetId = HOME_ITEM_ASSETS[0] ?? "home.bed.basic";
let presentation: PresentationMode = "panel";
let simulation: HomeSimulationMode = "play";
let buddyPresence: HomeBuddyPresence | null = null;
let buddyImage: CanvasImageSource | null = null;
let buddyFrameChunks: string[] = [];
let spriteChunks = new Map<string, string[]>();
let spriteImages: Record<string, CanvasImageSource> = {};
let savedValues: Record<string, string> = {};

interface PanelBridge {
  postMessage(message: unknown): void;
  onMessage(handler: (message: unknown) => void): () => void;
  close(): void;
}

const panelCandidate = (globalThis as { openPetsPanel?: PanelBridge }).openPetsPanel;
if (!panelCandidate) throw new Error("Home panel bridge is unavailable");
const panel: PanelBridge = panelCandidate;

function renderShell(): void {
  root.dataset.presentation = presentation;
  root.dataset.simulation = simulation;
  root.innerHTML = `
    <main class="pb-home-shell">
      <div class="pb-home-presence-bar" role="toolbar" aria-label="Home presentation">
        <div class="pb-home-segment" role="group" aria-label="Presentation mode">
          <button data-home-presentation="panel" class="${presentation === "panel" ? "active" : ""}">Panel</button>
          <button data-home-presentation="home" class="${presentation === "home" ? "active" : ""}">Home</button>
          <button data-home-presentation="buddy">Buddy</button>
        </div>
        <div class="pb-home-segment" role="group" aria-label="Simulation mode">
          <button data-home-simulation="play" class="${simulation === "play" ? "active" : ""}">Play</button>
          <button data-home-simulation="idle" class="${simulation === "idle" ? "active" : ""}">Idle</button>
        </div>
        <span class="pb-home-presence-name" data-home-presence-name>${buddyPresence?.displayName ?? "Buddy"}</span>
      </div>
      <header class="pb-home-header">
        <div><p class="pb-home-eyebrow">Pocket Buddy+ · Home</p><h1>Buddy Home</h1><p>Decorate, play as your human, or let the household run itself.</p></div>
        <button data-home-close aria-label="Close Home">×</button>
      </header>
      <section class="pb-home-toolbar" aria-label="Home tools">
        <div class="pb-home-tool-section"><span>Mode</span><div class="pb-home-mode-buttons">${HOME_MODES.map(modeButton).join("")}</div></div>
        <div class="pb-home-tool-section" data-home-floor-tools><span>Floor</span><div class="pb-home-brushes">${HOME_BRUSHES.map(brushButton).join("")}</div></div>
        <div class="pb-home-tool-section pb-home-furniture-section" data-home-furniture-tools><span>Furniture</span><div class="pb-home-items">${HOME_PUBLIC_ASSETS.map(itemButton).join("")}</div></div>
        <div class="pb-home-actions">
          <button data-home-pet>Pet Buddy</button><button data-home-use>Use selected</button><button data-home-channel>Next TV channel</button>
          <button data-home-rotate="-1">↶ Rotate</button><button data-home-rotate="1">Rotate ↷</button>
          <button data-home-clear-floor>Reset floor</button><button data-home-reset-room>Reset room</button><button data-home-load-pack>Load TinyHouse art</button>
        </div>
        <div class="pb-home-movement"><button data-home-move="north">↑</button><button data-home-move="west">←</button><button data-home-move="south">↓</button><button data-home-move="east">→</button></div>
      </section>
      <div class="pb-home-stage" data-home-stage tabindex="0" aria-label="Playable Buddy Home"></div>
      <footer class="pb-home-footer"><span data-home-status>Loading Home…</span><span data-home-thought>Buddy is coming home.</span><span class="pb-home-help">Play: WASD/arrows move your human. Idle: both actors choose their own movement.</span></footer>
    </main>`;
  root.addEventListener("click", handleClick);
  mountScene();
}

function modeButton(mode: HomeMode): string { return `<button data-home-mode="${mode}" class="${mode === selectedMode ? "active" : ""}">${mode[0].toUpperCase()}${mode.slice(1)}</button>`; }
function brushButton(brush: HomeBrush): string { const label = brush === "erase" ? "Erase" : brush.replace("floor.", ""); return `<button data-home-brush="${brush}" class="${brush === selectedBrush ? "active" : ""}">${label}</button>`; }
function itemButton(asset: (typeof HOME_PUBLIC_ASSETS)[number]): string { return `<button data-home-item-asset="${asset.assetId}" class="${asset.assetId === selectedAssetId ? "active" : ""}">${asset.label}</button>`; }

function mountScene(): void {
  const stage = root.querySelector<HTMLElement>("[data-home-stage]");
  if (!stage) return;
  controller?.destroy();
  controller = mountPhaserHome(stage, {
    store: { read: (key) => savedValues[key] ?? null, write: (key, value) => { savedValues[key] = value; panel.postMessage({ type: "home-state-write", key, value }); } },
    onStateChange: updateStatus,
    onBuddyAction: (action) => panel.postMessage({ type: "home-buddy-react", action }),
  });
  controller.setMode(selectedMode);
  controller.setBrush(selectedBrush);
  controller.setItemAsset(selectedAssetId);
  controller.setSimulationMode(simulation);
  controller.setBuddyPresence(buddyPresence);
  controller.setBuddyAppearance(buddyImage);
  setHomeSprites(spriteImages);
  requestAnimationFrame(() => stage.focus());
}

function updateStatus(snapshot: PhaserHomeSnapshot): void {
  selectedMode = snapshot.mode;
  selectedAssetId = snapshot.selectedAssetId;
  const status = root.querySelector<HTMLElement>("[data-home-status]");
  const thought = root.querySelector<HTMLElement>("[data-home-thought]");
  if (status) status.textContent = `${snapshot.buddyName} · ${snapshot.buddyMood} · ${simulation === "idle" ? "Idle household" : "Player control"} · ${snapshot.itemCount} items`;
  if (thought) thought.textContent = `“${snapshot.thought}”`;
  syncControls();
}

function handleClick(event: Event): void {
  const target = event.target as HTMLElement;
  const presentationButton = target.closest<HTMLButtonElement>("[data-home-presentation]");
  if (presentationButton) {
    const mode = presentationButton.dataset.homePresentation as PresentationMode;
    if (mode === "panel" || mode === "home" || mode === "buddy") panel.postMessage({ type: "home-presentation", mode });
    return;
  }
  const simulationButton = target.closest<HTMLButtonElement>("[data-home-simulation]");
  if (simulationButton) {
    const mode = simulationButton.dataset.homeSimulation as HomeSimulationMode;
    if (HOME_SIMULATION_MODES.includes(mode)) { simulation = mode; controller?.setSimulationMode(mode); applyPresentation(); }
    return;
  }
  if (target.closest("[data-home-close]")) { panel.postMessage({ type: "home-panel-closing" }); panel.close(); return; }
  const modeButton = target.closest<HTMLButtonElement>("[data-home-mode]");
  if (modeButton) { const mode = modeButton.dataset.homeMode as HomeMode; if (HOME_MODES.includes(mode)) { selectedMode = mode; controller?.setMode(mode); syncControls(); } return; }
  const brushButton = target.closest<HTMLButtonElement>("[data-home-brush]");
  if (brushButton) { const brush = brushButton.dataset.homeBrush as HomeBrush; if (HOME_BRUSHES.includes(brush)) { selectedBrush = brush; selectedMode = "paint"; controller?.setBrush(brush); controller?.setMode("paint"); syncControls(); } return; }
  const itemButton = target.closest<HTMLButtonElement>("[data-home-item-asset]");
  if (itemButton) { const assetId = itemButton.dataset.homeItemAsset ?? ""; if (HOME_ITEM_ASSETS.includes(assetId)) { selectedAssetId = assetId; selectedMode = "place"; controller?.setItemAsset(assetId); controller?.setMode("place"); syncControls(); } return; }
  const moveButton = target.closest<HTMLButtonElement>("[data-home-move]"); if (moveButton) { controller?.movePlayer(moveButton.dataset.homeMove as HomeDirection); return; }
  const rotate = target.closest<HTMLButtonElement>("[data-home-rotate]"); if (rotate) { controller?.rotate(Number(rotate.dataset.homeRotate)); return; }
  if (target.closest("[data-home-load-pack]")) { panel.postMessage({ type: "home-pack-pick" }); return; }
  if (target.closest("[data-home-pet]")) controller?.petBuddy();
  else if (target.closest("[data-home-use]")) controller?.interactSelected();
  else if (target.closest("[data-home-channel]")) controller?.interactSelected("next-channel" as HomeItemAction);
  else if (target.closest("[data-home-clear-floor]")) controller?.clearFloor();
  else if (target.closest("[data-home-reset-room]")) controller?.resetRoom();
}

function syncControls(): void {
  root.querySelectorAll<HTMLElement>("[data-home-mode]").forEach((node) => node.classList.toggle("active", node.dataset.homeMode === selectedMode));
  root.querySelectorAll<HTMLElement>("[data-home-brush]").forEach((node) => node.classList.toggle("active", node.dataset.homeBrush === selectedBrush));
  root.querySelectorAll<HTMLElement>("[data-home-item-asset]").forEach((node) => node.classList.toggle("active", node.dataset.homeItemAsset === selectedAssetId));
}

function applyPresentation(): void {
  root.dataset.presentation = presentation;
  root.dataset.simulation = simulation;
  root.querySelectorAll<HTMLElement>("[data-home-presentation]").forEach((node) => node.classList.toggle("active", node.dataset.homePresentation === presentation));
  root.querySelectorAll<HTMLElement>("[data-home-simulation]").forEach((node) => node.classList.toggle("active", node.dataset.homeSimulation === simulation));
  const name = root.querySelector<HTMLElement>("[data-home-presence-name]");
  if (name) name.textContent = buddyPresence?.displayName ?? "Buddy";
}

async function decodeImage(dataUrl: string): Promise<CanvasImageSource> {
  return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = dataUrl; });
}

async function handlePanelMessage(message: PanelMessage): Promise<void> {
  if (message.type === "home-state" && message.values && typeof message.values === "object") { savedValues = { ...(message.values as Record<string, string>) }; if (!controller) renderShell(); return; }
  if (message.type === "home-presentation" && (message.mode === "panel" || message.mode === "home")) { presentation = message.mode; applyPresentation(); return; }
  if (message.type === "home-buddy-presence" && message.buddy && typeof message.buddy === "object") {
    const buddy = message.buddy as { name?: unknown; profile?: unknown };
    const profile = buddy.profile && typeof buddy.profile === "object" ? buddy.profile as Record<string, unknown> : {};
    buddyPresence = {
      displayName: typeof profile.displayName === "string" ? profile.displayName : typeof buddy.name === "string" ? buddy.name : "Buddy",
      mood: typeof profile.mood === "string" ? profile.mood : "content",
      activity: typeof profile.activity === "string" ? profile.activity : "idle",
      dominantNeed: typeof profile.dominantNeed === "string" ? profile.dominantNeed : "social",
      affection: typeof profile.affection === "number" ? profile.affection : undefined,
      needs: profile.needs && typeof profile.needs === "object" ? profile.needs as Record<string, number> : undefined,
    };
    controller?.setBuddyPresence(buddyPresence); applyPresentation(); return;
  }
  if (message.type === "home-buddy-frame-begin") { buddyFrameChunks = Array(Math.max(0, Number(message.count) || 0)).fill(""); return; }
  if (message.type === "home-buddy-frame-chunk" && typeof message.data === "string") { buddyFrameChunks[Number(message.index) || 0] = message.data; return; }
  if (message.type === "home-buddy-frame-end") { try { buddyImage = await decodeImage(buddyFrameChunks.join("")); controller?.setBuddyAppearance(buddyImage); } catch { buddyImage = null; controller?.setBuddyAppearance(null); } buddyFrameChunks = []; return; }
  if (message.type === "home-pack-begin") { spriteChunks = new Map((Array.isArray(message.keys) ? message.keys : []).map((key) => [String(key), []])); return; }
  if (message.type === "home-pack-chunk" && typeof message.key === "string" && typeof message.data === "string") { const list = spriteChunks.get(message.key) ?? []; list[Number(message.index) || 0] = message.data; spriteChunks.set(message.key, list); return; }
  if (message.type === "home-pack-end") {
    const next: Record<string, CanvasImageSource> = {};
    await Promise.all([...spriteChunks.entries()].map(async ([key, chunks]) => { try { next[key] = await decodeImage(chunks.join("")); } catch { /* individual missing art keeps shape fallback */ } }));
    spriteImages = next; setHomeSprites(next); return;
  }
  if (message.type === "home-pack-error" && typeof message.error === "string") { const thought = root.querySelector<HTMLElement>("[data-home-thought]"); if (thought) thought.textContent = message.error; }
}

panel.onMessage((message: unknown) => { if (message && typeof message === "object") void handlePanelMessage(message as PanelMessage); });
window.addEventListener("pagehide", () => { panel.postMessage({ type: "home-panel-closing" }); controller?.destroy(); controller = null; }, { once: true });
panel.postMessage({ type: "home-state-request" });
