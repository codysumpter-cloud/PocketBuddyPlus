import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  advanceBuddyProfile,
  createDefaultBuddyProfile,
  parseBuddyProfileCandidate,
  type BuddyPublicProfile,
} from "./buddy-profile-contract.js";

export const BUDDY_PROFILE_FILENAME = "pocket-buddy-plus-buddy-profile.json";
const staleToleranceMs = 2_000;
const persistenceIntervalMs = 60_000;

function cloneProfile(profile: BuddyPublicProfile): BuddyPublicProfile {
  return {
    ...profile,
    needs: { ...profile.needs },
  };
}

export class BuddyProfileStore {
  readonly #path: string;
  readonly #clock: () => number;
  readonly #listeners = new Set<(profile: BuddyPublicProfile) => void>();
  #profile: BuddyPublicProfile | null = null;
  #lastPersistedAt = 0;

  constructor(userDataPath: string, clock: () => number = Date.now) {
    this.#path = join(userDataPath, BUDDY_PROFILE_FILENAME);
    this.#clock = clock;
  }

  initialize(candidate?: unknown): BuddyPublicProfile {
    if (this.#profile) return this.getProfile();
    const now = this.#clock();
    let profile: BuddyPublicProfile | null = null;

    if (existsSync(this.#path)) {
      try {
        profile = parseBuddyProfileCandidate(JSON.parse(readFileSync(this.#path, "utf8")) as unknown);
      } catch {
        profile = null;
      }
    }

    if (!profile && candidate !== undefined) {
      try {
        profile = parseBuddyProfileCandidate(candidate);
      } catch {
        profile = null;
      }
    }

    this.#profile = advanceBuddyProfile(profile ?? createDefaultBuddyProfile(now), now);
    this.#persist(true);
    return cloneProfile(this.#profile);
  }

  getProfile(): BuddyPublicProfile {
    if (!this.#profile) this.initialize();
    const now = this.#clock();
    const advanced = advanceBuddyProfile(this.#profile!, now);
    const changed = advanced.updatedAtMs !== this.#profile!.updatedAtMs;
    this.#profile = advanced;
    if (changed && now - this.#lastPersistedAt >= persistenceIntervalMs) this.#persist(false);
    return cloneProfile(this.#profile);
  }

  /**
   * Replaces the host copy with a validated renderer snapshot. Stale renderer
   * state is ignored so an old window cannot roll a Buddy backwards.
   */
  sync(candidate: unknown): BuddyPublicProfile {
    const current = this.getProfile();
    const next = parseBuddyProfileCandidate(candidate);
    if (next.id !== current.id) throw new Error("Buddy identity cannot change during profile synchronization.");
    if (next.updatedAtMs + staleToleranceMs < current.updatedAtMs) return current;

    const before = JSON.stringify(current);
    this.#profile = next;
    this.#persist(true);
    if (JSON.stringify(next) !== before) this.#emit(next);
    return cloneProfile(next);
  }

  onChange(listener: (profile: BuddyPublicProfile) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(profile: BuddyPublicProfile): void {
    const snapshot = cloneProfile(profile);
    for (const listener of this.#listeners) {
      try { listener(snapshot); } catch { /* listeners are isolated */ }
    }
  }

  #persist(force: boolean): void {
    if (!this.#profile) return;
    const now = this.#clock();
    if (!force && now - this.#lastPersistedAt < persistenceIntervalMs) return;
    mkdirSync(join(this.#path, ".."), { recursive: true });
    const temporaryPath = `${this.#path}.${process.pid}.${now}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(this.#profile, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.#path);
    this.#lastPersistedAt = now;
  }
}
