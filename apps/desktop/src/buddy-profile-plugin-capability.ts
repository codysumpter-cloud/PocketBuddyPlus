import type { BuddyPublicProfile } from "./buddy/buddy-profile-contract.js";
import type { BuddyProfileStore } from "./buddy/buddy-profile-store.js";
import type { ElectronPluginHostCapabilities } from "./plugin-host-capabilities.js";
import type { PluginPetInfo } from "./plugin-sdk-bridge.js";

export type ProfiledPluginPetInfo = PluginPetInfo & { readonly buddyProfile?: BuddyPublicProfile };

/**
 * Extends the existing `pets:read` surface without creating a second plugin
 * permission. Only the default pet receives the public Buddy profile; spawned
 * pets keep the original registry shape.
 */
export function installBuddyProfilePluginCapability(
  capabilities: ElectronPluginHostCapabilities,
  store: BuddyProfileStore,
): void {
  const originalList = capabilities.pets.list.bind(capabilities.pets);
  const originalOnChange = capabilities.pets.onChange.bind(capabilities.pets);

  const decorate = (pets: PluginPetInfo[]): ProfiledPluginPetInfo[] => {
    const profile = store.getProfile();
    return pets.map((pet) => pet.id === "default" ? { ...pet, buddyProfile: profile } : pet);
  };

  capabilities.pets.list = () => decorate(originalList());
  capabilities.pets.onChange = (handler) => {
    const emit = () => handler(decorate(originalList()));
    const disposePets = originalOnChange(() => emit());
    const disposeProfile = store.onChange(() => emit());
    return () => {
      disposePets();
      disposeProfile();
    };
  };
}
