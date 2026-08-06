const PLUGIN_ID = "openpets.virtual-pet";
const LEGACY_STORAGE_KEY = "pocket-buddy-plus:buddy-ui:v1";
const LEGACY_BACKUP_KEY = "pocket-buddy-plus:buddy-ui:migrated-backup:v1";
const MIGRATION_MARKER_KEY = "pocket-buddy-plus:buddy-brain-migrated:v1";

type PluginResult = { readonly ok: boolean; readonly error?: string };

type BuddyBrainControlCenterApi = {
  getPluginsSnapshot(): Promise<{ readonly plugins?: ReadonlyArray<{ readonly id: string; readonly enabled: boolean }> }>;
  setPluginEnabled(id: string, enabled: boolean): Promise<PluginResult>;
  executePluginCommand(id: string, commandId: string, args?: Record<string, unknown>): Promise<PluginResult>;
};

function getControlCenterApi(): BuddyBrainControlCenterApi | undefined {
  return (window as unknown as { openPetsControlCenter?: BuddyBrainControlCenterApi }).openPetsControlCenter;
}

let reconcileQueued = false;
let migrationStarted = false;

async function ensurePluginEnabled(api: BuddyBrainControlCenterApi): Promise<boolean> {
  const snapshot = await api.getPluginsSnapshot();
  const plugin = snapshot.plugins?.find((candidate) => candidate.id === PLUGIN_ID);
  if (!plugin) return false;
  if (plugin.enabled) return true;
  const result = await api.setPluginEnabled(PLUGIN_ID, true);
  return result.ok;
}

async function openBuddyBrain(): Promise<void> {
  const api = getControlCenterApi();
  if (!api) return;
  try {
    if (!await ensurePluginEnabled(api)) return;
    await api.executePluginCommand(PLUGIN_ID, "open-brain");
  } catch {
    // The Plugins page remains the recovery surface when the plugin is broken.
  }
}

async function runLegacyMigration(): Promise<void> {
  if (migrationStarted || window.localStorage.getItem(MIGRATION_MARKER_KEY) === "done") return;
  migrationStarted = true;
  const api = getControlCenterApi();
  if (!api) return;
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(MIGRATION_MARKER_KEY, "done");
    return;
  }
  try {
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    if (!await ensurePluginEnabled(api)) return;
    const result = await api.executePluginCommand(PLUGIN_ID, "import-legacy-buddy-ui", { payload: payload as Record<string, unknown> });
    if (!result.ok) return;
    if (!window.localStorage.getItem(LEGACY_BACKUP_KEY)) window.localStorage.setItem(LEGACY_BACKUP_KEY, raw);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.localStorage.setItem(MIGRATION_MARKER_KEY, "done");
  } catch {
    // Keep the legacy state untouched when parsing or plugin migration fails.
  }
}

function createBrainNavButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-tab pb-buddy-nav pb-brain-plugin-nav";
  button.innerHTML = `<span aria-hidden="true">♥</span><span>Buddy Brain</span>`;
  button.addEventListener("click", () => void openBuddyBrain());
  return button;
}

function createBrainCard(): HTMLElement {
  const card = document.createElement("section");
  card.className = "pb-dashboard-card pb-brain-plugin-card";
  card.setAttribute("aria-label", "Buddy Brain");
  card.innerHTML = `
    <div>
      <p class="pb-kicker">Your canonical Buddy</p>
      <h3>Buddy Brain</h3>
      <p>Care, health, personality, relationship, training, memories, and progression now share one plugin state.</p>
    </div>
    <div class="pb-dashboard-actions">
      <button type="button" data-brain-care="pet">Pet</button>
      <button type="button" data-brain-open>Open Buddy Brain</button>
    </div>
  `;
  card.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-brain-open]")) void openBuddyBrain();
    if (target.closest("[data-brain-care]")) {
      const api = getControlCenterApi();
      if (api) {
        void ensurePluginEnabled(api).then(async (enabled) => {
          if (enabled) await api.executePluginCommand(PLUGIN_ID, "pet");
        });
      }
    }
  });
  return card;
}

function reconcileUnifiedBuddyUi(): void {
  reconcileQueued = false;

  // Hide the retired renderer-local Buddy UI without deleting its code in this
  // compatibility release. The one-time importer preserves a rollback copy.
  for (const legacy of document.querySelectorAll<HTMLElement>(".pb-buddy-nav:not(.pb-brain-plugin-nav), .pb-dashboard-card:not(.pb-brain-plugin-card), .pb-buddy-modal")) {
    legacy.hidden = true;
    legacy.setAttribute("aria-hidden", "true");
  }

  const nav = document.querySelector(".nav-bar");
  if (nav && !nav.querySelector(".pb-brain-plugin-nav")) {
    const button = createBrainNavButton();
    const secondTab = nav.querySelectorAll(".nav-tab")[1];
    if (secondTab) nav.insertBefore(button, secondTab);
    else nav.prepend(button);
  }

  const hero = document.querySelector(".dashboard-hero");
  if (hero?.parentElement && !document.querySelector(".pb-brain-plugin-card")) {
    hero.insertAdjacentElement("afterend", createBrainCard());
  }

  void runLegacyMigration();
}

function scheduleReconcile(): void {
  if (reconcileQueued) return;
  reconcileQueued = true;
  window.requestAnimationFrame(reconcileUnifiedBuddyUi);
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (!target.closest(".pb-buddy-nav, .pb-dashboard-card [data-pb-open], .pb-buddy-modal")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openBuddyBrain();
}, true);

new MutationObserver(scheduleReconcile).observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleReconcile, { once: true });
else scheduleReconcile();

export {};
