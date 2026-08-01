export const PRODUCT_NAME = "Pocket Buddy Plus";
export const PRODUCT_SHORT_NAME = "Buddy Plus";
export const APP_ID = "dev.prismtek.pocketbuddyplus";
export const PRODUCT_WEBSITE_URL = "https://prismtek.dev";
export const DEFAULT_GITHUB_REPOSITORY = "codysumpter-cloud/PocketBuddyPlus";

export const UPSTREAM_PROJECT_NAME = "OpenPets";
export const UPSTREAM_REPOSITORY_URL = "https://github.com/alvinunreal/openpets";
export const UPSTREAM_WEBSITE_URL = "https://openpets.dev/";

/**
 * Both electron-builder targets package this same main process, so the product
 * identity cannot be a compile-time constant: the inherited OpenPets build would
 * otherwise present itself as Pocket Buddy Plus and, worse, share its Electron
 * user-data directory with the Plus build.
 *
 * electron-builder.plus.yml sets `extraMetadata.name` to PRODUCT_NAME, so the
 * packaged package.json -- which is what Electron derives both app.getName() and
 * the userData path from -- differs per target. The inherited target is left
 * untouched so existing OpenPets installs keep their current userData directory.
 *
 * `packagedAppName` is app.getName() before any setName() call.
 */
export function resolveProductName(packagedAppName: string | undefined): string {
  return packagedAppName === PRODUCT_NAME ? PRODUCT_NAME : UPSTREAM_PROJECT_NAME;
}

export function isPocketBuddyPlusBuild(packagedAppName: string | undefined): boolean {
  return resolveProductName(packagedAppName) === PRODUCT_NAME;
}
