/**
 * Parity port of BuddyPersonalityProfile.
 *
 * Donor: codysumpter-cloud/prismtek-apps
 *        packages/godot/prismtek-buddy-core/addons/prismtek_buddy_core/
 *        creature/buddy_personality_profile.gd
 * Licence: Prismtek Source Available (first-party; reuse authorised by the owner).
 *
 * Stable behavioural biases. Per the donor's own note: a model may *describe* the
 * personality, but it does not own it. Nothing here may be written by a provider
 * response; personality changes only through domain commands.
 */

export const TRAIT_KEYS = [
  "sociability",
  "curiosity",
  "playfulness",
  "diligence",
  "bravery",
  "affection",
  "independence",
  "patience",
  "aggression",
  "creativity",
  "neatness",
] as const;

export type TraitKey = (typeof TRAIT_KEYS)[number];

export const DEFAULT_TRAITS: Readonly<Record<TraitKey, number>> = Object.freeze({
  sociability: 0.55,
  curiosity: 0.65,
  playfulness: 0.6,
  diligence: 0.55,
  bravery: 0.45,
  affection: 0.65,
  independence: 0.45,
  patience: 0.55,
  aggression: 0.2,
  creativity: 0.6,
  neatness: 0.5,
});

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isTraitKey(key: string): key is TraitKey {
  return (TRAIT_KEYS as readonly string[]).includes(key);
}

export class BuddyPersonalityProfile {
  private readonly traits = new Map<TraitKey, number>();

  constructor() {
    this.ensureDefaults();
  }

  ensureDefaults(): void {
    for (const key of TRAIT_KEYS) {
      if (!this.traits.has(key)) this.traits.set(key, DEFAULT_TRAITS[key]);
      this.traits.set(key, clamp01(this.traits.get(key) as number));
    }
  }

  /** Donor `value`: unknown traits read as the neutral 0.5, not 0. */
  value(key: string): number {
    this.ensureDefaults();
    return isTraitKey(key) ? (this.traits.get(key) as number) : 0.5;
  }

  /** Donor `set_value`: unknown traits are ignored rather than created. */
  setValue(key: string, next: number): void {
    if (!isTraitKey(key)) return;
    this.traits.set(key, clamp01(next));
  }

  toData(): Record<string, number> {
    this.ensureDefaults();
    return Object.fromEntries(TRAIT_KEYS.map((key) => [key, this.value(key)]));
  }

  static fromData(data: unknown): BuddyPersonalityProfile {
    const result = new BuddyPersonalityProfile();
    if (typeof data === "object" && data !== null) {
      const record = data as Record<string, unknown>;
      const traits = typeof record.traits === "object" && record.traits !== null ? record.traits : record;
      for (const [key, value] of Object.entries(traits as Record<string, unknown>)) {
        if (isTraitKey(key) && typeof value === "number") result.setValue(key, value);
      }
    }
    result.ensureDefaults();
    return result;
  }
}
