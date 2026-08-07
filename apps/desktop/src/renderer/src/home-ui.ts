import "./home-ui.css";

const HOME_PLUGIN_ID = "openpets.home-builder";
let observerQueued = false;
let messageTimer = 0;

type PluginRecord = { id: string; enabled: boolean; brokenReason?: string; commands?: readonly { id: string }[] };
type PluginSnapshot = { plugins: readonly PluginRecord[] };
type HomePluginApi = {
  getPluginsSnapshot(): Promise<PluginSnapshot>;
  executePluginCommand(id: string, commandId: string, args?: Record<string, unknown>): Promise<unknown>;
};

function api(): HomePluginApi | undefined { return (window as unknown as { openPetsControlCenter?: HomePluginApi }).openPetsControlCenter; }

function createHomeNavButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-tab pb-home-nav";
  button.innerHTML = '<span class="pb-home-nav-icon" aria-hidden="true">◆</span><span>Home</span>';
  button.addEventListener("click", () => void openPluginHome());
  return button;
}

function ensureHomeNavButton(): void {
  if (document.querySelector(".pb-home-nav")) return;
  const nav = document.querySelector(".nav-bar");
  if (!nav) return;
  const button = createHomeNavButton();
  const settings = Array.from(nav.querySelectorAll<HTMLElement>(".nav-tab")).find((entry) => entry.textContent?.trim().toLowerCase() === "settings");
  if (settings) nav.insertBefore(button, settings); else nav.append(button);
}

async function openPluginHome(): Promise<void> {
  const bridge = api();
  if (!bridge) return showHomeLauncherMessage("Home plugin controls are unavailable in this window.");
  try {
    const snapshot = await bridge.getPluginsSnapshot();
    const home = snapshot.plugins.find((plugin) => plugin.id === HOME_PLUGIN_ID);
    if (!home) return showHomeLauncherMessage("Install the Home plugin from Plugins to use Buddy Home.");
    if (home.brokenReason) return showHomeLauncherMessage(`Home needs attention: ${home.brokenReason}`);
    if (!home.enabled) return showHomeLauncherMessage("Home is installed but disabled. Enable it in Plugins and approve its Home permissions first.");
    if (!home.commands?.some((command) => command.id === "open-home")) return showHomeLauncherMessage("Home is still starting. Try again in a moment.");
    await bridge.executePluginCommand(HOME_PLUGIN_ID, "open-home");
  } catch (error) {
    showHomeLauncherMessage(`Could not open Home: ${String((error as Error)?.message ?? error).slice(0, 120)}`);
  }
}

function showHomeLauncherMessage(text: string): void {
  let node = document.querySelector<HTMLDivElement>(".pb-home-launcher-message");
  if (!node) { node = document.createElement("div"); node.className = "pb-home-launcher-message"; document.body.append(node); }
  node.textContent = text; node.classList.add("show");
  clearTimeout(messageTimer); messageTimer = window.setTimeout(() => node?.classList.remove("show"), 4500);
}

function queueEnsure(): void { if (observerQueued) return; observerQueued = true; queueMicrotask(() => { observerQueued = false; ensureHomeNavButton(); }); }
const observer = new MutationObserver(queueEnsure);
observer.observe(document.documentElement, { childList: true, subtree: true });
ensureHomeNavButton();
