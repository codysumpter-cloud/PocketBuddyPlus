export const pocketBuddyPlusBundledPluginIds = [
  "openpets.prismpixel-rig-studio",
  "openpets.prismcade-creator",
] as const;

/**
 * Extend the shared plugin-service bundle with PocketBuddy+-specific tools.
 * This changes only which packages are seeded; enabled-by-default remains owned
 * by the plugin service and therefore stays false for these creator tools.
 */
export function registerPocketBuddyPlusBundledPlugins(ids: readonly string[]): void {
  const mutableIds = ids as string[];
  for (const id of pocketBuddyPlusBundledPluginIds) {
    if (!mutableIds.includes(id)) mutableIds.push(id);
  }
}
