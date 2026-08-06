import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  advanceBuddyProfile,
  createDefaultBuddyProfile,
  parseBuddyProfileCandidate,
  type BuddyPublicProfile,
} from "./buddy-profile-contract.js";

export const BUDDY_PROFILE_FILENAME = "pocket-buddy-plus-buddy-profile.json";
const BUDDY_PROFILE_DOCUMENT_VERSION = 1 as const;
const staleToleranceMs = 2_000;
const persistenceIntervalMs = 60_000;
type ProfileOrigin = "default" | "migrated" | "synced";

type BuddyProfileDocument = {
  readonly documentVersion: typeof BUDDY_PROFILE_DOCUMENT_VERSION;
  readonly origin: ProfileOrigin;
  readonly profile: BuddyPublicProfile;
};

function cloneProfile(profile: BuddyPublicProfile): BuddyPublicProfile {
  return { ...profile, needs: { ...profile.needs } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class BuddyProfileStore {
  readonly #path: string;
  readonly #clock: () => number;
  readonly #listeners = new Set<(profile: BuddyPublicProfile) => void>();
  #profile: BuddyPublicProfile | null = null;
  #origin: ProfileOrigin = "default";
  #lastPersistedAt = 0;

  constructor(userDataPath: string, clock: () => number = Date.now) {
    this.#path = join(userDataPath, BUDDY_PROFILE_FILENAME);
    this.#clock = clock;
  }

  initialize(candidate?: unknown): BuddyPublicProfile {
    const now = this.#clock();
    if (this.#profile) {
      if (this.#origin === "default" && candidate !== undefined) this.#tryLegacyMigration(candidate, now);
      return this.getProfile();
    }

    const persisted = this.#readPersisted();
    if (persisted) {
      this.#profile = advanceBuddyProfile(persisted.profile, now);
      this.#origin = persisted.origin;
    } else {
      const migrated = this.#parseCandidate(candidate);
      this.#profile = advanceBuddyProfile(migrated ?? createDefaultBuddyProfile(now), now);
      this.#origin = migrated ? "migrated" : "default";
    }
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
    this.#origin = "synced";
    this.#persist(true);
    if (JSON.stringify(next) !== before) this.#emit(next);
    return cloneProfile(next);
  }

  onChange(listener: (profile: BuddyPublicProfile) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #tryLegacyMigration(candidate: unknown, now: number): void {
    const migrated = this.#parseCandidate(candidate);
    if (!migrated) return;
    const previous = this.#profile!;
    this.#profile = advanceBuddyProfile(migrated, now);
    this.#origin = "migrated";
    this.#persist(true);
    if (JSON.stringify(previous) !== JSON.stringify(this.#profile)) this.#emit(this.#profile);
  }

  #parseCandidate(candidate: unknown): BuddyPublicProfile | null {
    if (candidate === undefined) return null;
    try { return parseBuddyProfileCandidate(candidate); } catch { return null; }
  }

  #readPersisted(): { profile: BuddyPublicProfile; origin: ProfileOrigin } | null {
    if (!existsSync(this.#path)) return null;
    try {
      const value: unknown = JSON.parse(readFileSync(this.#path, "utf8"));
      if (isRecord(value) && value.documentVersion === BUDDY_PROFILE_DOCUMENT_VERSION && isRecord(value.profile)) {
        const origin = value.origin === "default" || value.origin === "migrated" || value.origin === "synced" ? value.origin : "synced";
        return { profile: parseBuddyProfileCandidate(value.profile), origin };
      }
      // Forward-compatible recovery for an early direct-profile draft format.
      return { profile: parseBuddyProfileCandidate(value), origin: "synced" };
    } catch {
      return null;
    }
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
    mkdirSync(dirname(this.#path), { recursive: true });
    const temporaryPath = `${this.#path}.${process.pid}.${now}.tmp`;
    const document: BuddyProfileDocument = {
      documentVersion: BUDDY_PROFILE_DOCUMENT_VERSION,
      origin: this.#origin,
      profile: this.#profile,
    };
    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.#path);
    this.#lastPersistedAt = now;
  }
}
