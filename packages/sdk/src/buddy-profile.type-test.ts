import type { OpenPetsBuddyProfile, OpenPetsContext } from "./public.js";

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

void verifyBuddyProfileTypes;
