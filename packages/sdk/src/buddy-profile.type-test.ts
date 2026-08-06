import type { OpenPetsBuddyProfile, OpenPetsContext, OpenPetsInventorySnapshot } from "./public.js";

async function verifyBuddyProfileTypes(ctx: OpenPetsContext): Promise<OpenPetsBuddyProfile | undefined> {
  const defaultBuddy = (await ctx.pets.list()).find((pet) => pet.kind === "default");
  const profile = defaultBuddy?.buddyProfile;
  if (profile) {
    const pressure: number = profile.needs.hunger;
    const name: string = profile.displayName;
    void pressure;
    void name;
  }
  return profile;
}

async function verifyInventoryTypes(ctx: OpenPetsContext): Promise<OpenPetsInventorySnapshot | undefined> {
  const inventory = ctx.inventory;
  if (!inventory) return undefined;
  const snapshot = await inventory.snapshot();
  const dispose = inventory.onChange((next) => {
    const apples: number = next.quantities["consumable.apple"] ?? 0;
    void apples;
  });
  await inventory.grant({ transactionId: "plugin.reward:12345678", itemId: "consumable.apple", quantity: 1, reason: "Battle reward" });
  await inventory.consume({ transactionId: "plugin.consume:12345678", itemId: "consumable.apple", quantity: 1, reason: "Used a snack" });
  await inventory.equip({ transactionId: "plugin.equip:12345678", itemId: "wardrobe.blue-scarf", reason: "Wear scarf" });
  await inventory.unequip({ transactionId: "plugin.unequip:12345678", slot: "neck", reason: "Remove scarf" });
  dispose();
  return snapshot;
}

void verifyBuddyProfileTypes;
void verifyInventoryTypes;
