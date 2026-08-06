import {
  buddyProfilesMateriallyEqual,
  parseBuddyProfileCandidate,
  toBuddyUiCandidate,
  type BuddyPublicProfile,
} from "../../buddy/buddy-profile-contract.ts";

const BUDDY_STORAGE_KEY = "pocket-buddy-plus:buddy-ui:v1";
const RELOAD_GUARD_KEY = "pocket-buddy-plus:buddy-profile-reload:v1";

type BuddyProfileApi = {
  initializeBuddyProfile(candidate?: unknown): Promise<BuddyPublicProfile>;
  getBuddyProfile(): Promise<BuddyPublicProfile>;
  syncBuddyProfile(candidate: unknown): Promise<BuddyPublicProfile>;
};

function api(): BuddyProfileApi | null {
  const candidate = (window as typeof window & { openPetsControlCenter?: Partial<BuddyProfileApi> }).openPetsControlCenter;
  return typeof candidate?.initializeBuddyProfile === "function"
    && typeof candidate.getBuddyProfile === "function"
    && typeof candidate.syncBuddyProfile === "function"
    ? candidate as BuddyProfileApi
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBuddyUiState(): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(BUDDY_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function readCandidate(): unknown {
  const state = readBuddyUiState();
  if (!state || !isRecord(state.buddy)) return undefined;
  return { buddy: state.buddy, wardrobe: state.wardrobe };
}

function mergeHostProfile(profile: BuddyPublicProfile): void {
  const current = readBuddyUiState() ?? { version: 1 };
  const candidate = toBuddyUiCandidate(profile);
  window.localStorage.setItem(BUDDY_STORAGE_KEY, JSON.stringify({
    ...current,
    buddy: candidate.buddy,
    wardrobe: candidate.wardrobe,
  }));
}

function currentProfile(): BuddyPublicProfile | null {
  const candidate = readCandidate();
  if (candidate === undefined) return null;
  try { return parseBuddyProfileCandidate(candidate); } catch { return null; }
}

function reconcile(profile: BuddyPublicProfile): boolean {
  const local = currentProfile();
  if (local && buddyProfilesMateriallyEqual(local, profile)) return false;
  mergeHostProfile(profile);
  return true;
}

function reloadOnce(): boolean {
  if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) === "1") return false;
  window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  window.location.reload();
  return true;
}

let syncQueued = false;
function queueProfileSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  window.setTimeout(() => {
    syncQueued = false;
    const bridge = api();
    const candidate = readCandidate();
    if (!bridge || candidate === undefined) return;
    void bridge.syncBuddyProfile(candidate).then((profile) => {
      if (reconcile(profile) && reloadOnce()) return;
      window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
    }).catch(() => undefined);
  }, 0);
}

function installMutationSync(): void {
  document.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-pb-care]")) queueProfileSync();
  });
  document.addEventListener("submit", (event) => {
    const form = event.target as HTMLFormElement;
    if (form.dataset.pbForm === "rename") queueProfileSync();
  });
  document.addEventListener("change", (event) => {
    if ((event.target as HTMLElement).closest("[data-pb-wardrobe]")) queueProfileSync();
  });
}

async function initialize(): Promise<void> {
  const bridge = api();
  if (!bridge) return;
  const profile = await bridge.initializeBuddyProfile(readCandidate());
  if (reconcile(profile) && reloadOnce()) return;
  window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
  installMutationSync();
}

void initialize().catch(() => undefined);
