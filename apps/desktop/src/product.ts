export const PRODUCT_NAME = "Pocket Buddy+";
export const PRODUCT_SHORT_NAME = "Buddy+";
export const APP_ID = "dev.prismtek.pocketbuddyplus";
export const PRODUCT_WEBSITE_URL = "https://prismtek.dev";
export const DEFAULT_GITHUB_REPOSITORY = "codysumpter-cloud/PocketBuddyPlus";

// These values are retained only for source compatibility, attribution, and the
// inherited package target. They must never leak into the Pocket Buddy+ UI.
export const UPSTREAM_PROJECT_NAME = "OpenPets";
export const UPSTREAM_REPOSITORY_URL = "https://github.com/alvinunreal/openpets";
export const UPSTREAM_WEBSITE_URL = "https://openpets.dev/";

/** Matches the explicit executableName used on Windows and Linux. */
export const PLUS_EXECUTABLE_NAME = "pocket-buddy-plus";

/**
 * Normalize inherited and transitional product wording at user-facing
 * boundaries. Do not apply this to protocol names, package IDs, URLs stored as
 * machine data, or license notices.
 */
export function brandVisibleText(value: string): string {
  return value
    .replace(/Pocket\s+Buddy\s+Plus/giu, PRODUCT_NAME)
    .replace(/Buddy\s+Plus/giu, PRODUCT_SHORT_NAME)
    .replace(/Open(?:\s|-)*Pets/giu, PRODUCT_NAME);
}

/**
 * Both electron-builder targets package this same main process, so the product
 * identity cannot be a compile-time constant: the inherited compatibility build
 * would otherwise present itself as Pocket Buddy+ and share its Electron
 * user-data directory with the Plus build.
 *
 * Windows and Linux use the explicit `pocket-buddy-plus` executable name. On
 * macOS, electron-builder may use the product name (`Pocket Buddy+`) for the
 * executable inside the app bundle even when executableName is configured. Both
 * forms are therefore exact accepted Plus identities; arbitrary names still
 * fall back to the inherited technical identity.
 *
 * Unpackaged runs are development runs of this repository, which is Pocket
 * Buddy+, so they resolve to the Plus identity.
 */
export function resolveProductNameFor(executablePath: string, packaged: boolean): string {
  if (!packaged) return PRODUCT_NAME;
  const executable = executablePath.split(/[\\/]/).pop() ?? "";
  // Windows appends .exe; strip any extension before comparing.
  const base = executable.replace(/\.[^.]*$/, "").toLowerCase();
  const isPlusExecutable = base === PLUS_EXECUTABLE_NAME || base === PRODUCT_NAME.toLowerCase();
  return isPlusExecutable ? PRODUCT_NAME : UPSTREAM_PROJECT_NAME;
}

export function isPocketBuddyPlusBuildFor(executablePath: string, packaged: boolean): boolean {
  return resolveProductNameFor(executablePath, packaged) === PRODUCT_NAME;
}
