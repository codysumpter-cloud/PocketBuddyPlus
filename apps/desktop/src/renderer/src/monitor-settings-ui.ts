type Rectangle = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type MonitorChoice = {
  readonly key: string;
  readonly primary: boolean;
  readonly bounds: Rectangle;
  readonly workArea: Rectangle;
};
type MonitorSnapshot = {
  readonly selected: string;
  readonly effective: string;
  readonly monitors: readonly MonitorChoice[];
};
type MonitorApi = {
  getMonitorSelection(): Promise<MonitorSnapshot>;
  setMonitorSelection(selection: string): Promise<MonitorSnapshot>;
};

let renderQueued = false;
let currentSnapshot: MonitorSnapshot | null = null;
let loading = false;

function getApi(): MonitorApi | null {
  const candidate = (window as typeof window & { openPetsControlCenter?: Partial<MonitorApi> }).openPetsControlCenter;
  if (typeof candidate?.getMonitorSelection !== "function" || typeof candidate?.setMonitorSelection !== "function") return null;
  return candidate as MonitorApi;
}

function formatArea(rect: Rectangle): string {
  return `${Math.round(rect.width)}×${Math.round(rect.height)} usable`;
}

function monitorLabel(choice: MonitorChoice, index: number): string {
  return `Monitor ${index + 1}${choice.primary ? " (Primary)" : ""} — ${formatArea(choice.workArea)}`;
}

function hideLegacyCrossDisplaySetting(): void {
  const toggle = document.querySelector<HTMLInputElement>('[data-testid="setting-pet-cross-display-toggle"]');
  const row = toggle?.closest<HTMLElement>(".settings-row");
  if (row) row.hidden = true;
}

function createMonitorRow(snapshot: MonitorSnapshot): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-row";
  row.dataset.pbMonitorSetting = "1";

  const info = document.createElement("div");
  info.className = "settings-row-info";
  const title = document.createElement("strong");
  title.textContent = "Monitor";
  const description = document.createElement("small");
  description.textContent = "Buddy, menus, and app windows stay inside this monitor’s usable area. The taskbar/dock is a hard edge.";
  info.append(title, description);

  const select = document.createElement("select");
  select.className = "settings-select";
  select.setAttribute("aria-label", "Pocket Buddy monitor");

  const primary = snapshot.monitors.find((monitor) => monitor.primary);
  const automatic = document.createElement("option");
  automatic.value = "primary";
  automatic.textContent = `Primary monitor${primary ? ` — ${formatArea(primary.workArea)}` : ""}`;
  select.append(automatic);

  snapshot.monitors.forEach((monitor, index) => {
    const option = document.createElement("option");
    option.value = monitor.key;
    option.textContent = monitorLabel(monitor, index);
    select.append(option);
  });

  if (snapshot.selected !== "primary" && !snapshot.monitors.some((monitor) => monitor.key === snapshot.selected)) {
    const disconnected = document.createElement("option");
    disconnected.value = snapshot.selected;
    disconnected.textContent = "Selected monitor disconnected — using primary";
    select.append(disconnected);
  }

  select.value = snapshot.selected;
  select.addEventListener("change", async () => {
    const api = getApi();
    if (!api) return;
    select.disabled = true;
    try {
      currentSnapshot = await api.setMonitorSelection(select.value);
      replaceMonitorRow();
    } catch (error) {
      console.error("Pocket Buddy monitor selection failed", error);
      select.value = currentSnapshot?.selected ?? "primary";
    } finally {
      select.disabled = false;
    }
  });

  row.append(info, select);
  return row;
}

function replaceMonitorRow(): void {
  hideLegacyCrossDisplaySetting();
  if (!currentSnapshot) return;
  const confinementToggle = document.querySelector<HTMLInputElement>('[data-testid="setting-pet-confinement-toggle"]');
  const group = confinementToggle?.closest<HTMLElement>(".settings-group");
  if (!group) return;

  const existing = group.querySelector<HTMLElement>("[data-pb-monitor-setting]");
  const row = createMonitorRow(currentSnapshot);
  if (existing) existing.replaceWith(row);
  else group.prepend(row);
}

async function ensureMonitorSetting(): Promise<void> {
  hideLegacyCrossDisplaySetting();
  if (!document.querySelector('[data-testid="setting-pet-confinement-toggle"]')) return;
  if (!currentSnapshot && !loading) {
    const api = getApi();
    if (!api) return;
    loading = true;
    try {
      currentSnapshot = await api.getMonitorSelection();
    } catch (error) {
      console.error("Pocket Buddy monitor list failed", error);
    } finally {
      loading = false;
    }
  }
  replaceMonitorRow();
}

function queueEnsure(): void {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    void ensureMonitorSetting();
  });
}

new MutationObserver(queueEnsure).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("focus", () => {
  currentSnapshot = null;
  queueEnsure();
});
queueEnsure();
