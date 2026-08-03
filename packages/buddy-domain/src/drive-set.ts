/**
 * Parity port of BuddyDriveSet.
 *
 * Donor: codysumpter-cloud/prismtek-apps
 *        packages/godot/prismtek-buddy-core/addons/prismtek_buddy_core/
 *        creature/buddy_drive_set.gd
 * Licence: Prismtek Source Available (first-party; reuse authorised by the owner).
 *
 * Sign convention is preserved exactly from the donor: every value is an UNMET
 * NEED PRESSURE where 0.0 is satisfied and 1.0 is urgent. `energy` therefore
 * means "needs to recover energy", not "has energy remaining". Keeping the donor's
 * single sign convention is what makes utility scoring and learned outcomes
 * comparable across the two runtimes.
 *
 * Constants below are transcribed verbatim from the donor and are covered by
 * parity tests; changing one is a behavioural change, not a refactor.
 */

export const DRIVE_KEYS = [
  "hunger",
  "energy",
  "comfort",
  "safety",
  "boredom",
  "curiosity",
  "affection",
  "social",
  "accomplishment",
  "cleanliness",
  "focus",
] as const;

export type DriveKey = (typeof DRIVE_KEYS)[number];

export const DEFAULT_PRESSURES: Readonly<Record<DriveKey, number>> = Object.freeze({
  hunger: 0.15,
  energy: 0.1,
  comfort: 0.1,
  safety: 0.05,
  boredom: 0.2,
  curiosity: 0.25,
  affection: 0.15,
  social: 0.15,
  accomplishment: 0.2,
  cleanliness: 0.05,
  focus: 0.15,
});

export const DEFAULT_DRIFT_PER_SECOND: Readonly<Record<DriveKey, number>> = Object.freeze({
  hunger: 0.0008,
  energy: 0.0006,
  comfort: 0.0002,
  safety: -0.0001,
  boredom: 0.001,
  curiosity: 0.0005,
  affection: 0.0003,
  social: 0.0004,
  accomplishment: 0.0003,
  cleanliness: 0.0002,
  focus: 0.0004,
});

export interface DriveSetData {
  readonly pressures: Record<string, number>;
  readonly drift_per_second: Record<string, number>;
}

export interface DriveUrgency {
  readonly drive: DriveKey;
  readonly pressure: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isDriveKey(key: string): key is DriveKey {
  return (DRIVE_KEYS as readonly string[]).includes(key);
}

/** Mirrors the donor Resource, including its mutation semantics. */
export class BuddyDriveSet {
  private readonly pressures = new Map<DriveKey, number>();
  private readonly driftPerSecond = new Map<DriveKey, number>();

  constructor() {
    this.ensureDefaults();
  }

  /** Donor `ensure_defaults`: fill missing keys, then clamp pressures to [0,1]. */
  ensureDefaults(): void {
    for (const key of DRIVE_KEYS) {
      if (!this.pressures.has(key)) this.pressures.set(key, DEFAULT_PRESSURES[key]);
      if (!this.driftPerSecond.has(key)) this.driftPerSecond.set(key, DEFAULT_DRIFT_PER_SECOND[key]);
      this.pressures.set(key, clamp01(this.pressures.get(key) as number));
      // Drift is deliberately NOT clamped in the donor: safety drifts negative.
    }
  }

  pressure(key: string): number {
    this.ensureDefaults();
    return isDriveKey(key) ? (this.pressures.get(key) as number) : 0;
  }

  drift(key: string): number {
    this.ensureDefaults();
    return isDriveKey(key) ? (this.driftPerSecond.get(key) as number) : 0;
  }

  /** Donor `set_pressure`: unknown keys are ignored rather than throwing. */
  setPressure(key: string, value: number): void {
    if (!isDriveKey(key)) return;
    this.pressures.set(key, clamp01(value));
  }

  adjust(key: string, delta: number): void {
    this.setPressure(key, this.pressure(key) + delta);
  }

  /**
   * Donor `apply_relief`: POSITIVE values satisfy a need (subtracted from the
   * pressure); negative values represent an action cost.
   */
  applyRelief(relief: Readonly<Record<string, number>>): void {
    for (const [key, amount] of Object.entries(relief)) {
      if (isDriveKey(key)) this.adjust(key, -amount);
    }
  }

  /**
   * Donor `apply_drift`: elapsed seconds are floored at zero, so a backwards
   * clock can never rewind the simulation.
   */
  applyDrift(deltaSeconds: number, overrides: Readonly<Record<string, number>> = {}): void {
    this.ensureDefaults();
    const elapsed = Math.max(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0);
    for (const key of DRIVE_KEYS) {
      const rate = Object.prototype.hasOwnProperty.call(overrides, key)
        ? Number(overrides[key])
        : (this.driftPerSecond.get(key) as number);
      this.adjust(key, rate * elapsed);
    }
  }

  urgencyAverage(): number {
    this.ensureDefaults();
    let total = 0;
    for (const key of DRIVE_KEYS) total += this.pressure(key);
    return total / DRIVE_KEYS.length;
  }

  /**
   * Donor `most_urgent`: descending by pressure, ties broken by ascending drive
   * name so the ordering is deterministic across runtimes.
   */
  mostUrgent(limit = 3): DriveUrgency[] {
    this.ensureDefaults();
    const rows: DriveUrgency[] = DRIVE_KEYS.map((drive) => ({ drive, pressure: this.pressure(drive) }));
    rows.sort((a, b) => (a.pressure === b.pressure ? (a.drive < b.drive ? -1 : 1) : b.pressure - a.pressure));
    return rows.slice(0, Math.min(Math.max(limit, 0), rows.length));
  }

  toData(): DriveSetData {
    this.ensureDefaults();
    return {
      pressures: Object.fromEntries(DRIVE_KEYS.map((key) => [key, this.pressure(key)])),
      drift_per_second: Object.fromEntries(DRIVE_KEYS.map((key) => [key, this.drift(key)])),
    };
  }

  /**
   * Donor `from_dict`, including its legacy fallback: when there is no
   * `pressures` member the payload itself is treated as the pressure map, so
   * older saves keep loading.
   */
  static fromData(data: unknown): BuddyDriveSet {
    const result = new BuddyDriveSet();
    if (typeof data !== "object" || data === null) return result;
    const record = data as Record<string, unknown>;

    const rawPressures = Object.prototype.hasOwnProperty.call(record, "pressures") ? record.pressures : record;
    if (typeof rawPressures === "object" && rawPressures !== null) {
      for (const [key, value] of Object.entries(rawPressures as Record<string, unknown>)) {
        if (isDriveKey(key) && typeof value === "number") result.pressures.set(key, value);
      }
    }

    const rawDrift = record.drift_per_second;
    if (typeof rawDrift === "object" && rawDrift !== null) {
      for (const [key, value] of Object.entries(rawDrift as Record<string, unknown>)) {
        if (isDriveKey(key) && typeof value === "number") result.driftPerSecond.set(key, value);
      }
    }

    result.ensureDefaults();
    return result;
  }
}
