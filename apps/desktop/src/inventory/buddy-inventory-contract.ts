export const BUDDY_INVENTORY_SCHEMA_VERSION = 1 as const;
export const buddyEquipmentSlots = ["head", "neck", "badge", "home"] as const;
export type BuddyEquipmentSlot = typeof buddyEquipmentSlots[number];
export type BuddyItemKind = "consumable" | "toy" | "wardrobe" | "home" | "collectible";

export interface BuddyItemDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly kind: BuddyItemKind;
  readonly maxStack: number;
  readonly equipmentSlot?: BuddyEquipmentSlot;
  readonly tradable: boolean;
}

export interface BuddyInventoryLedgerEntry {
  readonly transactionId: string;
  readonly source: string;
  readonly operation: "grant" | "consume" | "equip" | "unequip";
  readonly itemId?: string;
  readonly quantity?: number;
  readonly slot?: BuddyEquipmentSlot;
  readonly reason: string;
  readonly atMs: number;
  readonly revision: number;
}

export interface BuddyInventorySnapshot {
  readonly schemaVersion: typeof BUDDY_INVENTORY_SCHEMA_VERSION;
  readonly revision: number;
  readonly updatedAtMs: number;
  readonly definitions: readonly BuddyItemDefinition[];
  readonly quantities: Readonly<Record<string, number>>;
  readonly equipped: Readonly<Partial<Record<BuddyEquipmentSlot, string>>>;
  readonly recentLedger: readonly BuddyInventoryLedgerEntry[];
}

export type BuddyInventoryMutation =
  | { readonly operation: "grant" | "consume"; readonly transactionId: string; readonly itemId: string; readonly quantity: number; readonly reason: string }
  | { readonly operation: "equip"; readonly transactionId: string; readonly itemId: string; readonly slot?: BuddyEquipmentSlot; readonly reason: string }
  | { readonly operation: "unequip"; readonly transactionId: string; readonly slot: BuddyEquipmentSlot; readonly reason: string };

export const builtInBuddyItemDefinitions = [
  {
    id: "consumable.apple",
    displayName: "Apple",
    description: "A simple Buddy snack and the first tradeable consumable.",
    kind: "consumable",
    maxStack: 99,
    tradable: true,
  },
  {
    id: "home.toy.ball",
    displayName: "Play Ball",
    description: "The canonical starter ball already used by Buddy Home.",
    kind: "toy",
    maxStack: 1,
    tradable: true,
  },
  {
    id: "home.bed.basic",
    displayName: "Basic Bed",
    description: "The canonical starter bed used by Buddy Home.",
    kind: "home",
    maxStack: 1,
    equipmentSlot: "home",
    tradable: true,
  },
  {
    id: "home.food-bowl.basic",
    displayName: "Food Bowl",
    description: "The canonical starter food bowl used by Buddy Home.",
    kind: "home",
    maxStack: 1,
    equipmentSlot: "home",
    tradable: true,
  },
  {
    id: "wardrobe.gold-star",
    displayName: "Gold Star",
    description: "A bright badge for your Buddy.",
    kind: "wardrobe",
    maxStack: 1,
    equipmentSlot: "badge",
    tradable: true,
  },
  {
    id: "wardrobe.blue-scarf",
    displayName: "Blue Scarf",
    description: "A familiar blue scarf for your Buddy.",
    kind: "wardrobe",
    maxStack: 1,
    equipmentSlot: "neck",
    tradable: true,
  },
  {
    id: "wardrobe.night-cap",
    displayName: "Night Cap",
    description: "A sleepy cap for rest time.",
    kind: "wardrobe",
    maxStack: 1,
    equipmentSlot: "head",
    tradable: true,
  },
] as const satisfies readonly BuddyItemDefinition[];

const itemIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+){1,7}$/u;
const transactionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/u;
const sourcePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;

export function buddyItemDefinitionMap(definitions: readonly BuddyItemDefinition[] = builtInBuddyItemDefinitions): ReadonlyMap<string, BuddyItemDefinition> {
  const map = new Map<string, BuddyItemDefinition>();
  for (const definition of definitions) {
    if (!itemIdPattern.test(definition.id)) throw new Error(`Invalid Buddy item id: ${definition.id}`);
    if (map.has(definition.id)) throw new Error(`Duplicate Buddy item id: ${definition.id}`);
    if (!Number.isInteger(definition.maxStack) || definition.maxStack < 1 || definition.maxStack > 9999) throw new Error(`Invalid maxStack for ${definition.id}`);
    map.set(definition.id, { ...definition });
  }
  return map;
}

export function validateInventorySource(value: unknown): string {
  const source = String(value ?? "");
  if (!sourcePattern.test(source)) throw new Error("Inventory mutation source is invalid.");
  return source;
}

export function validateInventoryTransactionId(value: unknown): string {
  const transactionId = String(value ?? "");
  if (!transactionIdPattern.test(transactionId)) throw new Error("Inventory transaction id is invalid.");
  return transactionId;
}

export function validateInventoryReason(value: unknown): string {
  const reason = String(value ?? "").trim();
  if (!reason || reason.length > 160 || /[\0-\x1F\x7F]/u.test(reason)) throw new Error("Inventory mutation reason is invalid.");
  return reason;
}

export function validateInventoryQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new Error("Inventory quantity must be an integer between 1 and 9999.");
  return quantity;
}

export function validateEquipmentSlot(value: unknown): BuddyEquipmentSlot {
  if (!buddyEquipmentSlots.includes(value as BuddyEquipmentSlot)) throw new Error("Inventory equipment slot is invalid.");
  return value as BuddyEquipmentSlot;
}
