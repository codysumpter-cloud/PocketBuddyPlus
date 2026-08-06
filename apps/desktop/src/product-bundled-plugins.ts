export const pocketBuddyPlusBundledPluginIds = [
  "openpets.prismpixel-rig-studio",
  "openpets.prismcade-creator",
  "openpets.music-buddy",
] as const;

/**
 * Extend the shared plugin-service bundle with PocketBuddy+-specific tools.
 * This changes only which packages are seeded; enabled-by-default remains owned
 * by the plugin service and therefore stays false for these bundled plugins.
 */
export function registerPocketBuddyPlusBundledPlugins(ids: readonly string[]): void {
  const mutableIds = ids as unknown as string[];
  for (const id of pocketBuddyPlusBundledPluginIds) {
    if (!mutableIds.includes(id)) mutableIds.push(id);
  }
}
