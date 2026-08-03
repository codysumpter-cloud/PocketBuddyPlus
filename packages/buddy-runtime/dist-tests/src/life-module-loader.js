/**
 * Loads the replaceable Buddy Life module on behalf of the Electron main process.
 *
 * The Life module is LGPL-2.1-or-later and must be independently replaceable, so
 * this loader exists to honour that right *safely*. The security posture matters
 * as much as the licence obligation:
 *
 *  - the override is read ONCE from the process environment, never from a
 *    renderer, a plugin, a config file, or anything a web page can influence;
 *  - modules are loaded with a plain dynamic `import()` of a filesystem path.
 *    No `eval`, no `new Function`, no source string execution, no shelling out,
 *    and no fetching code over the network;
 *  - the candidate is structurally validated and version-checked before the host
 *    trusts it, and initialisation is wrapped so a throwing or hanging module is
 *    contained rather than taking down the app;
 *  - a failed replacement never mutates the Buddy save. The host holds the save;
 *    this loader only returns a module or an error.
 *
 * Falling back to the bundled implementation after a failed override is
 * deliberately NOT automatic: silently running a different brain than the user
 * asked for would hide the failure. The caller must ask for it explicitly.
 */
import { LIFE_MODULE_API_VERSION, validateLifeModule, } from "@open-pets/buddy-life-lgpl";
export const LIFE_MODULE_PATH_ENV = "POCKET_BUDDY_PLUS_LIFE_MODULE_PATH";
/** Default ceiling for module import + factory execution. */
export const DEFAULT_LOAD_TIMEOUT_MS = 5_000;
const BUNDLED_SPECIFIER = "@open-pets/buddy-life-lgpl/dist/reference-module.js";
function diagnosticsFor(module, origin, specifier) {
    const identity = module.identity;
    return {
        origin,
        specifier,
        name: identity.name,
        license: identity.license,
        apiVersion: identity.apiVersion,
        implementationVersion: identity.implementationVersion,
        sourceRevision: identity.sourceRevision,
        capabilities: [...identity.capabilities],
        supportedSchemas: [...identity.supportedSchemas],
    };
}
async function withTimeout(promise, timeoutMs) {
    let timer;
    const timeout = new Promise((resolve) => {
        // Deliberately NOT unref'd: a genuinely hanging import settles nothing else,
        // so an unref'd timer lets the event loop drain and the race never resolves.
        // The `finally` below always clears it, so it cannot outlive the load.
        timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeout]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
const TIMEOUT = Symbol("life-module-load-timeout");
async function loadFrom(specifier, origin, options) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
    const importModule = options.importModule ?? ((target) => import(target));
    let namespace;
    try {
        const imported = await withTimeout(Promise.resolve(importModule(specifier)), timeoutMs);
        if (imported === TIMEOUT) {
            return { ok: false, origin, specifier, code: "timeout", message: `life module import exceeded ${timeoutMs}ms` };
        }
        namespace = imported;
    }
    catch (error) {
        return {
            ok: false,
            origin,
            specifier,
            code: "not_found",
            message: `could not import life module: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    if (typeof namespace !== "object" || namespace === null) {
        return { ok: false, origin, specifier, code: "invalid_module", message: "life module namespace is not an object" };
    }
    const factory = namespace.createLifeModule;
    if (typeof factory !== "function") {
        return { ok: false, origin, specifier, code: "invalid_module", message: "life module does not export createLifeModule()" };
    }
    let candidate;
    try {
        const produced = await withTimeout(Promise.resolve(factory()), timeoutMs);
        if (produced === TIMEOUT) {
            return { ok: false, origin, specifier, code: "timeout", message: `createLifeModule() exceeded ${timeoutMs}ms` };
        }
        candidate = produced;
    }
    catch (error) {
        // A throwing factory is contained here; the caller still holds the save.
        return {
            ok: false,
            origin,
            specifier,
            code: "factory_threw",
            message: `createLifeModule() threw: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    const invalid = validateLifeModule(candidate);
    if (invalid) {
        const mismatched = invalid.message.includes("API version");
        return {
            ok: false,
            origin,
            specifier,
            code: mismatched ? "api_version_mismatch" : "invalid_module",
            message: invalid.message,
        };
    }
    const module = candidate;
    return { ok: true, module, origin, specifier, diagnostics: diagnosticsFor(module, origin, specifier) };
}
/**
 * Resolve and load the Life module.
 *
 * Reads the override from the supplied environment only. A failed override is
 * REPORTED, not silently replaced with the bundled module -- see `loadBundledLifeModule`
 * for the explicit recovery path.
 */
export async function loadLifeModule(options = {}) {
    const env = options.env ?? process.env;
    const bundled = options.bundledSpecifier ?? BUNDLED_SPECIFIER;
    const override = env[LIFE_MODULE_PATH_ENV]?.trim();
    if (override)
        return loadFrom(override, "override", options);
    return loadFrom(bundled, "bundled", options);
}
/** Explicit recovery path after a failed override. Never automatic. */
export async function loadBundledLifeModule(options = {}) {
    return loadFrom(options.bundledSpecifier ?? BUNDLED_SPECIFIER, "bundled", options);
}
export { LIFE_MODULE_API_VERSION };
