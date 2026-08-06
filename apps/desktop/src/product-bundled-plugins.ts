export const pocketBuddyPlusBundledPluginIds = [
  "openpets.prismpixel-rig-studio",
  "openpets.prismcade-creator",
  "openpets.buddy-training",
] as const;

/**
 * Extend the shared plugin-service bundle with PocketBuddy+-specific tools and
 * experiences. Enabled-by-default remains owned by the plugin service, so new
 * bundled plugins still require an intentional user enable/permission flow.
 */
export function registerPocketBuddyPlusBundledPlugins(ids: readonly string[]): void {
  const mutableIds = ids as unknown as string[];
  for (const id of pocketBuddyPlusBundledPluginIds) {
    if (!mutableIds.includes(id)) mutableIds.push(id);
  }
}
