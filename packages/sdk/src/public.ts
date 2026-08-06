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

export type OpenPetsEquipmentSlot = "head" | "neck" | "badge" | "home";

export interface OpenPetsBuddyItemDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly kind: "consumable" | "toy" | "wardrobe" | "home" | "collectible";
  readonly maxStack: number;
  readonly equipmentSlot?: OpenPetsEquipmentSlot;
  readonly tradable: boolean;
}

export interface OpenPetsInventoryLedgerEntry {
  readonly transactionId: string;
  readonly source: string;
  readonly operation: "grant" | "consume" | "equip" | "unequip";
  readonly itemId?: string;
  readonly quantity?: number;
  readonly slot?: OpenPetsEquipmentSlot;
  readonly reason: string;
  readonly atMs: number;
  readonly revision: number;
}

export interface OpenPetsInventorySnapshot {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly updatedAtMs: number;
  readonly definitions: readonly OpenPetsBuddyItemDefinition[];
  readonly quantities: Readonly<Record<string, number>>;
  readonly equipped: Readonly<Partial<Record<OpenPetsEquipmentSlot, string>>>;
  readonly recentLedger: readonly OpenPetsInventoryLedgerEntry[];
}

export interface OpenPetsInventoryTransactionBase {
  /** Globally unique and stable for retries; repeated identical calls are idempotent. */
  readonly transactionId: string;
  readonly reason: string;
}

export interface OpenPetsInventoryApi {
  /** Requires `pets:read`. */
  snapshot(): Promise<OpenPetsInventorySnapshot>;
  /** Requires `pets:manage`; known host item definitions only. */
  grant(spec: OpenPetsInventoryTransactionBase & { readonly itemId: string; readonly quantity: number }): Promise<OpenPetsInventorySnapshot>;
  /** Requires `pets:manage`; fails atomically when quantity is insufficient. */
  consume(spec: OpenPetsInventoryTransactionBase & { readonly itemId: string; readonly quantity: number }): Promise<OpenPetsInventorySnapshot>;
  /** Requires `pets:manage`; the item must be owned and match the slot. */
  equip(spec: OpenPetsInventoryTransactionBase & { readonly itemId: string; readonly slot?: OpenPetsEquipmentSlot }): Promise<OpenPetsInventorySnapshot>;
  /** Requires `pets:manage`. */
  unequip(spec: OpenPetsInventoryTransactionBase & { readonly slot: OpenPetsEquipmentSlot }): Promise<OpenPetsInventorySnapshot>;
  /** Requires `pets:read`. */
  onChange(listener: (snapshot: OpenPetsInventorySnapshot) => void): () => void;
}

declare module "./index.js" {
  interface OpenPetsPetInfo {
    /** Present only on the host-owned default Buddy. Requires `pets:read`. */
    readonly buddyProfile?: import("./public.js").OpenPetsBuddyProfile;
  }

  interface OpenPetsContext {
    /** Shared host-owned inventory/equipment ledger. */
    readonly inventory: import("./public.js").OpenPetsInventoryApi;
  }
}

export * from "./index.js";
