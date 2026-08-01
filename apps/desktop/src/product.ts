export const PRODUCT_NAME = "Pocket Buddy Plus";
export const PRODUCT_SHORT_NAME = "Buddy Plus";
export const APP_ID = "dev.prismtek.pocketbuddyplus";
export const PRODUCT_WEBSITE_URL = "https://prismtek.dev";
export const DEFAULT_GITHUB_REPOSITORY = "codysumpter-cloud/PocketBuddyPlus";

export const UPSTREAM_PROJECT_NAME = "OpenPets";
export const UPSTREAM_REPOSITORY_URL = "https://github.com/alvinunreal/openpets";
export const UPSTREAM_WEBSITE_URL = "https://openpets.dev/";

/** Matches `executableName` in electron-builder.plus.yml. */
export const PLUS_EXECUTABLE_NAME = "pocket-buddy-plus";

/**
 * Both electron-builder targets package this same main process, so the product
 * identity cannot be a compile-time constant: the inherited OpenPets build would
 * otherwise present itself as Pocket Buddy Plus and share its Electron user-data
 * directory with the Plus build.
 *
 * Identity is taken from the packaged executable name, which each config already
 * sets (`pocket-buddy-plus` vs `openpets`) and which needs no build-time
 * rewriting. An earlier attempt used electron-builder's `extraMetadata`, but in
 * this pnpm workspace that rewrites the workspace-root package.json in place.
 *
 * Unpackaged runs are development runs of this repository, which is Pocket Buddy
 * Plus, so they resolve to the Plus identity.
 */
export function resolveProductNameFor(executablePath: string, packaged: boolean): string {
  if (!packaged) return PRODUCT_NAME;
  const executable = executablePath.split(/[\\/]/).pop() ?? "";
  // Windows appends .exe; strip any extension before comparing.
  const base = executable.replace(/\.[^.]*$/, "").toLowerCase();
  return base === PLUS_EXECUTABLE_NAME ? PRODUCT_NAME : UPSTREAM_PROJECT_NAME;
}

export function isPocketBuddyPlusBuildFor(executablePath: string, packaged: boolean): boolean {
  return resolveProductNameFor(executablePath, packaged) === PRODUCT_NAME;
}
