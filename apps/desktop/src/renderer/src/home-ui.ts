import { HOME_BRUSHES, mountPhaserHome, type HomeBrush, type PhaserHomeController } from "./home/phaser-home";
import "./home-ui.css";

let modal: HTMLDivElement | null = null;
let controller: PhaserHomeController | null = null;
let selectedBrush: HomeBrush = "floor.wood";
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
  element.setAttribute("aria-label", "Pocket Buddy Home builder");
  element.innerHTML = `
    <div class="pb-home-backdrop" data-home-close></div>
    <section class="pb-home-panel">
      <header class="pb-home-header">
        <div>
          <p class="pb-home-eyebrow">Pocket Buddy+ · Phaser 4</p>
          <h2>Home Builder</h2>
          <p>Paint the isometric floor, rotate the room, and keep the same canonical world state.</p>
        </div>
        <button type="button" class="pb-home-close" data-home-close aria-label="Close Home">×</button>
      </header>
      <div class="pb-home-toolbar" aria-label="Home tools">
        <div class="pb-home-brushes" role="group" aria-label="Floor brush">
          ${HOME_BRUSHES.map((brush) => brushButton(brush)).join("")}
        </div>
        <div class="pb-home-actions">
          <button type="button" data-home-rotate="-1" title="Rotate room left">↶ Rotate</button>
          <button type="button" data-home-rotate="1" title="Rotate room right">Rotate ↷</button>
          <button type="button" data-home-clear>Reset floor</button>
        </div>
      </div>
      <div class="pb-home-stage" data-home-stage></div>
      <footer class="pb-home-footer">
        <span data-home-status>Orientation SE · Wood brush · 0 painted tiles</span>
        <span>Drag across diamonds to paint. This preview save is isolated from the original Godot game.</span>
      </footer>
    </section>
  `;
  element.addEventListener("click", handleModalClick);
  return element;
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

function openHome(): void {
  if (!modal) modal = createHomeModal();
  if (!modal.isConnected) document.body.append(modal);
  document.body.classList.add("pb-home-open");
  const stage = modal.querySelector<HTMLElement>("[data-home-stage]");
  if (!stage) return;
  controller?.destroy();
  controller = mountPhaserHome(stage, {
    onStateChange(snapshot) {
      const status = modal?.querySelector<HTMLElement>("[data-home-status]");
      if (status) {
        const brush = snapshot.brush === "erase"
          ? "Erase"
          : snapshot.brush.replace("floor.", "").replace(/^./, (letter) => letter.toUpperCase());
        status.textContent = `Orientation ${snapshot.orientation} · ${brush} brush · ${snapshot.paintedTiles} painted tiles`;
      }
    },
  });
  controller.setBrush(selectedBrush);
  requestAnimationFrame(() => modal?.querySelector<HTMLElement>("button")?.focus());
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
  const brushButton = target.closest<HTMLButtonElement>("[data-home-brush]");
  if (brushButton) {
    const brush = brushButton.dataset.homeBrush as HomeBrush;
    if (!HOME_BRUSHES.includes(brush)) return;
    selectedBrush = brush;
    modal?.querySelectorAll<HTMLElement>("[data-home-brush]").forEach((entry) => {
      entry.classList.toggle("active", entry.dataset.homeBrush === brush);
    });
    controller?.setBrush(brush);
    return;
  }
  const rotateButton = target.closest<HTMLButtonElement>("[data-home-rotate]");
  if (rotateButton) {
    controller?.rotate(Number(rotateButton.dataset.homeRotate));
    return;
  }
  if (target.closest("[data-home-clear]")) controller?.clear();
}

function queueEnsure(): void {
  if (observerQueued) return;
  observerQueued = true;
  queueMicrotask(() => {
    observerQueued = false;
    ensureHomeNavButton();
  });
}

const observer = new MutationObserver(queueEnsure);
observer.observe(document.documentElement, { childList: true, subtree: true });
ensureHomeNavButton();

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal?.isConnected) closeHome();
});
