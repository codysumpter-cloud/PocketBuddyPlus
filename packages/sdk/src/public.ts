/** Public Pocket Buddy+ additions layered over the compatibility SDK surface. */

export interface OpenPetsBuddyNeeds {
  readonly hunger: number;
  readonly energy: number;
  readonly social: number;
  readonly play: number;
  readonly comfort: number;
  readonly cleanliness: number;
}

/**
 * Read-only public identity and living-state snapshot for the user's primary
 * Buddy. Need values are pressure values: 0 is satisfied and 1 is urgent.
 * Talk history, notes, tasks, files, credentials, and plugin data are excluded.
 */
export interface OpenPetsBuddyProfile {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly displayName: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly ageMs: number;
  readonly affection: number;
  readonly needs: OpenPetsBuddyNeeds;
  readonly mood: "content" | "curious" | "playful" | "hungry" | "tired" | "lonely" | "uncomfortable";
  readonly activity: "idle" | "exploring" | "sleeping" | "eating" | "playing" | "socializing" | "grooming";
  readonly dominantNeed: keyof OpenPetsBuddyNeeds;
  readonly lastCareAction?: "pet" | "feed" | "play" | "rest" | "clean";
  readonly wardrobe: "classic" | "gold-star" | "blue-scarf" | "night-cap";
}

declare module "./index.js" {
  interface OpenPetsPetInfo {
    /** Present only on the host-owned default Buddy. Requires `pets:read`. */
    readonly buddyProfile?: import("./public.js").OpenPetsBuddyProfile;
  }
}

export * from "./index.js";
