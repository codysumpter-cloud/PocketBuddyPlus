import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  BUDDY_INVENTORY_SCHEMA_VERSION,
  buddyEquipmentSlots,
  buddyItemDefinitionMap,
  builtInBuddyItemDefinitions,
  validateEquipmentSlot,
  validateInventoryQuantity,
  validateInventoryReason,
  validateInventorySource,
  validateInventoryTransactionId,
  type BuddyEquipmentSlot,
  type BuddyInventoryLedgerEntry,
  type BuddyInventoryMutation,
  type BuddyInventorySnapshot,
  type BuddyItemDefinition,
} from "./buddy-inventory-contract.js";

export const BUDDY_INVENTORY_FILENAME = "pocket-buddy-plus-inventory.json";
const documentVersion = 1 as const;
const maxLedgerEntries = 200;

type BuddyInventoryDocument = {
  readonly documentVersion: typeof documentVersion;
  readonly schemaVersion: typeof BUDDY_INVENTORY_SCHEMA_VERSION;
  readonly revision: number;
  readonly updatedAtMs: number;
  readonly quantities: Record<string, number>;
  readonly equipped: Partial<Record<BuddyEquipmentSlot, string>>;
  readonly ledger: BuddyInventoryLedgerEntry[];
};

function cloneSnapshot(snapshot: BuddyInventorySnapshot): BuddyInventorySnapshot {
  return {
    ...snapshot,
    definitions: snapshot.definitions.map((definition) => ({ ...definition })),
    quantities: { ...snapshot.quantities },
    equipped: { ...snapshot.equipped },
    recentLedger: snapshot.recentLedger.map((entry) => ({ ...entry })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function transactionMatches(
  existing: BuddyInventoryLedgerEntry,
  source: string,
  mutation: BuddyInventoryMutation,
  definitions: ReadonlyMap<string, BuddyItemDefinition>,
): boolean {
  if (existing.source !== source || existing.operation !== mutation.operation || existing.reason !== mutation.reason) return false;
  switch (mutation.operation) {
    case "grant":
    case "consume":
      return existing.itemId === mutation.itemId && existing.quantity === mutation.quantity;
    case "exchange":
      return existing.itemId === mutation.itemId
        && existing.quantity === mutation.quantity
        && existing.receivedItemId === mutation.receivedItemId
        && existing.receivedQuantity === mutation.receivedQuantity;
    case "equip": {
      const definition = definitions.get(mutation.itemId);
      const slot = mutation.slot ?? definition?.equipmentSlot;
      return existing.itemId === mutation.itemId && existing.slot === slot;
    }
    case "unequip":
      return existing.slot === mutation.slot;
  }
}

export class BuddyInventoryStore {
  readonly #path: string;
  readonly #clock: () => number;
  readonly #definitions: readonly BuddyItemDefinition[];
  readonly #definitionMap: ReadonlyMap<string, BuddyItemDefinition>;
  readonly #listeners = new Set<(snapshot: BuddyInventorySnapshot) => void>();
  #document: BuddyInventoryDocument | null = null;

  constructor(userDataPath: string, options: { clock?: () => number; definitions?: readonly BuddyItemDefinition[] } = {}) {
    this.#path = join(userDataPath, BUDDY_INVENTORY_FILENAME);
    this.#clock = options.clock ?? Date.now;
    this.#definitions = (options.definitions ?? builtInBuddyItemDefinitions).map((definition) => ({ ...definition }));
    this.#definitionMap = buddyItemDefinitionMap(this.#definitions);
  }

  initialize(): BuddyInventorySnapshot {
    if (this.#document) return this.snapshot();
    this.#document = this.#readDocument() ?? this.#defaultDocument();
    this.#persist();
    return this.snapshot();
  }

  snapshot(): BuddyInventorySnapshot {
    if (!this.#document) this.initialize();
    const document = this.#document!;
    return cloneSnapshot({
      schemaVersion: BUDDY_INVENTORY_SCHEMA_VERSION,
      revision: document.revision,
      updatedAtMs: document.updatedAtMs,
      definitions: this.#definitions,
      quantities: document.quantities,
      equipped: document.equipped,
      recentLedger: document.ledger.slice(-50).reverse(),
    });
  }

  mutate(sourceValue: unknown, mutationValue: unknown): BuddyInventorySnapshot {
    if (!this.#document) this.initialize();
    const source = validateInventorySource(sourceValue);
    const mutation = this.#parseMutation(mutationValue);
    const existing = this.#document!.ledger.find((entry) => entry.transactionId === mutation.transactionId);
    if (existing) {
      if (!transactionMatches(existing, source, mutation, this.#definitionMap)) {
        throw new Error("Inventory transaction id was already used for a different mutation.");
      }
      return this.snapshot();
    }

    const quantities = { ...this.#document!.quantities };
    const equipped = { ...this.#document!.equipped };
    let ledgerEntry: Omit<BuddyInventoryLedgerEntry, "atMs" | "revision">;

    const removeQuantity = (definition: BuddyItemDefinition, quantity: number): void => {
      const current = quantities[definition.id] ?? 0;
      if (current < quantity) throw new Error(`Not enough ${definition.displayName} in inventory.`);
      const next = current - quantity;
      if (next === 0) delete quantities[definition.id];
      else quantities[definition.id] = next;
      for (const [slot, itemId] of Object.entries(equipped)) {
        if (itemId === definition.id && next === 0) delete equipped[slot as BuddyEquipmentSlot];
      }
    };

    switch (mutation.operation) {
      case "grant": {
        const definition = this.#requireDefinition(mutation.itemId);
        const current = quantities[definition.id] ?? 0;
        if (current + mutation.quantity > definition.maxStack) throw new Error(`Inventory stack limit exceeded for ${definition.id}.`);
        quantities[definition.id] = current + mutation.quantity;
        ledgerEntry = { transactionId: mutation.transactionId, source, operation: "grant", itemId: definition.id, quantity: mutation.quantity, reason: mutation.reason };
        break;
      }
      case "consume": {
        const definition = this.#requireDefinition(mutation.itemId);
        removeQuantity(definition, mutation.quantity);
        ledgerEntry = { transactionId: mutation.transactionId, source, operation: "consume", itemId: definition.id, quantity: mutation.quantity, reason: mutation.reason };
        break;
      }
      case "exchange": {
        const offered = this.#requireDefinition(mutation.itemId);
        const received = this.#requireDefinition(mutation.receivedItemId);
        if (offered.id === received.id) throw new Error("Inventory exchange items must be different.");
        if (!offered.tradable || !received.tradable) throw new Error("Inventory exchange requires tradable items.");
        const receivedCurrent = quantities[received.id] ?? 0;
        if (receivedCurrent + mutation.receivedQuantity > received.maxStack) throw new Error(`Inventory stack limit exceeded for ${received.id}.`);
        removeQuantity(offered, mutation.quantity);
        quantities[received.id] = receivedCurrent + mutation.receivedQuantity;
        ledgerEntry = {
          transactionId: mutation.transactionId,
          source,
          operation: "exchange",
          itemId: offered.id,
          quantity: mutation.quantity,
          receivedItemId: received.id,
          receivedQuantity: mutation.receivedQuantity,
          reason: mutation.reason,
        };
        break;
      }
      case "equip": {
        const definition = this.#requireDefinition(mutation.itemId);
        if (!definition.equipmentSlot) throw new Error(`${definition.displayName} cannot be equipped.`);
        const slot = mutation.slot ?? definition.equipmentSlot;
        if (slot !== definition.equipmentSlot) throw new Error(`${definition.displayName} cannot be equipped in ${slot}.`);
        if ((quantities[definition.id] ?? 0) < 1) throw new Error(`${definition.displayName} is not owned.`);
        equipped[slot] = definition.id;
        ledgerEntry = { transactionId: mutation.transactionId, source, operation: "equip", itemId: definition.id, slot, reason: mutation.reason };
        break;
      }
      case "unequip": {
        const slot = mutation.slot;
        const itemId = equipped[slot];
        delete equipped[slot];
        ledgerEntry = { transactionId: mutation.transactionId, source, operation: "unequip", ...(itemId ? { itemId } : {}), slot, reason: mutation.reason };
        break;
      }
    }

    const now = this.#clock();
    const revision = this.#document!.revision + 1;
    const entry: BuddyInventoryLedgerEntry = { ...ledgerEntry, atMs: now, revision };
    this.#document = {
      ...this.#document!,
      revision,
      updatedAtMs: now,
      quantities,
      equipped,
      ledger: [...this.#document!.ledger, entry].slice(-maxLedgerEntries),
    };
    this.#persist();
    this.#emit();
    return this.snapshot();
  }

  onChange(listener: (snapshot: BuddyInventorySnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #parseMutation(value: unknown): BuddyInventoryMutation {
    if (!isRecord(value)) throw new Error("Inventory mutation must be an object.");
    const operation = value.operation;
    const transactionId = validateInventoryTransactionId(value.transactionId);
    const reason = validateInventoryReason(value.reason);
    if (operation === "grant" || operation === "consume") {
      return { operation, transactionId, itemId: String(value.itemId ?? ""), quantity: validateInventoryQuantity(value.quantity), reason };
    }
    if (operation === "exchange") {
      return {
        operation,
        transactionId,
        itemId: String(value.itemId ?? ""),
        quantity: validateInventoryQuantity(value.quantity),
        receivedItemId: String(value.receivedItemId ?? ""),
        receivedQuantity: validateInventoryQuantity(value.receivedQuantity),
        reason,
      };
    }
    if (operation === "equip") {
      return { operation, transactionId, itemId: String(value.itemId ?? ""), ...(value.slot === undefined ? {} : { slot: validateEquipmentSlot(value.slot) }), reason };
    }
    if (operation === "unequip") {
      return { operation, transactionId, slot: validateEquipmentSlot(value.slot), reason };
    }
    throw new Error("Inventory mutation operation is invalid.");
  }

  #requireDefinition(itemId: string): BuddyItemDefinition {
    const definition = this.#definitionMap.get(itemId);
    if (!definition) throw new Error(`Unknown Buddy item: ${itemId}`);
    return definition;
  }

  #defaultDocument(): BuddyInventoryDocument {
    const now = this.#clock();
    const starterQuantities: Record<string, number> = {};
    for (const [itemId, quantity] of [["consumable.apple", 3], ["home.toy.ball", 1], ["home.bed.basic", 1], ["home.food-bowl.basic", 1]] as const) {
      if (this.#definitionMap.has(itemId)) starterQuantities[itemId] = quantity;
    }
    return {
      documentVersion,
      schemaVersion: BUDDY_INVENTORY_SCHEMA_VERSION,
      revision: 0,
      updatedAtMs: now,
      quantities: starterQuantities,
      equipped: {},
      ledger: [],
    };
  }

  #readDocument(): BuddyInventoryDocument | null {
    if (!existsSync(this.#path)) return null;
    try {
      const value: unknown = JSON.parse(readFileSync(this.#path, "utf8"));
      if (!isRecord(value) || value.documentVersion !== documentVersion || value.schemaVersion !== BUDDY_INVENTORY_SCHEMA_VERSION) return null;
      const quantities: Record<string, number> = {};
      if (isRecord(value.quantities)) {
        for (const [itemId, rawQuantity] of Object.entries(value.quantities)) {
          const definition = this.#definitionMap.get(itemId);
          const quantity = Number(rawQuantity);
          if (definition && Number.isInteger(quantity) && quantity >= 1 && quantity <= definition.maxStack) quantities[itemId] = quantity;
        }
      }
      const equipped: Partial<Record<BuddyEquipmentSlot, string>> = {};
      if (isRecord(value.equipped)) {
        for (const slot of buddyEquipmentSlots) {
          const itemId = value.equipped[slot];
          const definition = typeof itemId === "string" ? this.#definitionMap.get(itemId) : undefined;
          if (definition?.equipmentSlot === slot && (quantities[itemId as string] ?? 0) > 0) equipped[slot] = itemId as string;
        }
      }
      const ledger = Array.isArray(value.ledger)
        ? value.ledger.filter((entry): entry is BuddyInventoryLedgerEntry => isRecord(entry) && typeof entry.transactionId === "string" && typeof entry.source === "string" && typeof entry.operation === "string" && typeof entry.reason === "string" && typeof entry.atMs === "number" && typeof entry.revision === "number").slice(-maxLedgerEntries)
        : [];
      return {
        documentVersion,
        schemaVersion: BUDDY_INVENTORY_SCHEMA_VERSION,
        revision: Number.isInteger(value.revision) && Number(value.revision) >= 0 ? Number(value.revision) : 0,
        updatedAtMs: typeof value.updatedAtMs === "number" && Number.isFinite(value.updatedAtMs) ? value.updatedAtMs : this.#clock(),
        quantities,
        equipped,
        ledger,
      };
    } catch {
      return null;
    }
  }

  #persist(): void {
    if (!this.#document) return;
    mkdirSync(dirname(this.#path), { recursive: true });
    const temporaryPath = `${this.#path}.${process.pid}.${this.#clock()}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(this.#document, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.#path);
  }

  #emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try { listener(snapshot); } catch { /* listeners are isolated */ }
    }
  }
}
