/**
 * Replaceable Buddy Life module loader.
 *
 * The LGPL requires that a user can substitute their own build of the covered
 * module. These tests prove the substitution actually works, and — just as
 * importantly — that every failure mode is contained rather than trusted.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_LOAD_TIMEOUT_MS, LIFE_MODULE_PATH_ENV, loadBundledLifeModule, loadLifeModule, } from "../src/life-module-loader.js";
const here = dirname(fileURLToPath(import.meta.url));
// tests compile to dist-tests/tests, so fixtures live beside the source tree.
const fixture = (name) => pathToFileURL(join(here, "..", "..", "tests", "fixtures", name)).href;
const BUNDLED = pathToFileURL(join(here, "..", "..", "..", "buddy-life-lgpl", "dist", "reference-module.js")).href;
const base = { bundledSpecifier: BUNDLED, env: {} };
test("bundled implementation loads by default", async () => {
    const result = await loadLifeModule(base);
    assert.equal(result.ok, true);
    if (!result.ok)
        return;
    assert.equal(result.origin, "bundled");
    assert.equal(result.diagnostics.license, "LGPL-2.1-or-later");
    assert.equal(result.diagnostics.apiVersion, 1);
    // Diagnostics must surface the source revision so a user can tell which build ran.
    assert.equal(result.diagnostics.sourceRevision, "6a4396c83152fe9f9152be924b5a8edc8e759a6a");
    assert.ok(result.diagnostics.capabilities.includes("chemistry"));
});
test("a compatible replacement module loads and is actually used", async () => {
    const result = await loadLifeModule({ ...base, env: { [LIFE_MODULE_PATH_ENV]: fixture("compatible-module.mjs") } });
    assert.equal(result.ok, true);
    if (!result.ok)
        return;
    assert.equal(result.origin, "override");
    assert.equal(result.diagnostics.name, "fake-compatible");
    assert.equal(result.diagnostics.implementationVersion, "9.9.9-fake");
    // Prove the host is talking to the replacement, not the bundled module.
    const snapshot = result.module.createCreature({ creatureId: "b1", seed: 1, schema: "pbp-buddy-life-v1" });
    assert.equal(snapshot.creatureId, "b1");
    const advanced = result.module.advance({ elapsedSeconds: 5 });
    assert.equal(advanced.snapshot.simulationSeconds, 5);
    assert.equal(advanced.snapshot.diagnostics.implementation, "fake-compatible");
});
test("an API version mismatch is rejected", async () => {
    const result = await loadLifeModule({ ...base, env: { [LIFE_MODULE_PATH_ENV]: fixture("wrong-api-version.mjs") } });
    assert.equal(result.ok, false);
    if (result.ok)
        return;
    assert.equal(result.code, "api_version_mismatch");
    assert.match(result.message, /99/);
});
test("missing required methods are rejected", async () => {
    const result = await loadLifeModule({ ...base, env: { [LIFE_MODULE_PATH_ENV]: fixture("missing-methods.mjs") } });
    assert.equal(result.ok, false);
    if (result.ok)
        return;
    assert.equal(result.code, "invalid_module");
    assert.match(result.message, /createCreature/);
});
test("a module with no factory export is rejected", async () => {
    const result = await loadLifeModule({ ...base, env: { [LIFE_MODULE_PATH_ENV]: fixture("no-factory.mjs") } });
    assert.equal(result.ok, false);
    if (result.ok)
        return;
    assert.equal(result.code, "invalid_module");
    assert.match(result.message, /createLifeModule/);
});
test("a throwing initializer is contained, not propagated", async () => {
    const result = await loadLifeModule({ ...base, env: { [LIFE_MODULE_PATH_ENV]: fixture("throwing-factory.mjs") } });
    assert.equal(result.ok, false);
    if (result.ok)
        return;
    assert.equal(result.code, "factory_threw");
    assert.match(result.message, /deliberate initialization failure/);
});
test("a nonexistent path is reported, not thrown", async () => {
    const result = await loadLifeModule({ ...base, env: { [LIFE_MODULE_PATH_ENV]: "/nope/does-not-exist.mjs" } });
    assert.equal(result.ok, false);
    if (result.ok)
        return;
    assert.equal(result.code, "not_found");
});
test("a hanging module import times out instead of blocking startup", async () => {
    const result = await loadLifeModule({
        ...base,
        env: { [LIFE_MODULE_PATH_ENV]: "hanging" },
        timeoutMs: 50,
        importModule: () => new Promise(() => { }), // never settles
    });
    assert.equal(result.ok, false);
    if (result.ok)
        return;
    assert.equal(result.code, "timeout");
});
test("a failed override does NOT silently fall back", async () => {
    // Silently running a different brain than the user asked for would hide the
    // failure, so recovery must be an explicit, separate call.
    const failed = await loadLifeModule({ ...base, env: { [LIFE_MODULE_PATH_ENV]: fixture("wrong-api-version.mjs") } });
    assert.equal(failed.ok, false);
    if (!failed.ok)
        assert.equal(failed.origin, "override");
    const recovered = await loadBundledLifeModule(base);
    assert.equal(recovered.ok, true);
    if (recovered.ok)
        assert.equal(recovered.origin, "bundled");
});
test("the override is read only from the injected environment", async () => {
    // Renderers and plugins never reach this: the loader takes no path argument
    // and consults nothing a page could influence.
    const result = await loadLifeModule({ ...base, env: {} });
    assert.equal(result.ok, true);
    if (result.ok)
        assert.equal(result.origin, "bundled");
});
test("the loader never evaluates source text", async () => {
    // Guard against a future refactor reintroducing eval/new Function.
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(join(here, "..", "..", "src", "life-module-loader.ts"), "utf8");
    // Strip comments first: the module documents that it avoids these constructs,
    // and scanning prose would match its own explanation rather than real code.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of ["eval(", "new Function", "child_process", "execSync", "vm.runIn"]) {
        assert.ok(!code.includes(forbidden), `loader must not use ${forbidden}`);
    }
});
test("bundled module advances deterministically regardless of call cadence", async () => {
    const a = await loadBundledLifeModule(base);
    const b = await loadBundledLifeModule(base);
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok)
        return;
    a.module.createCreature({ creatureId: "x", seed: 1, schema: "pbp-buddy-life-v1" });
    b.module.createCreature({ creatureId: "x", seed: 1, schema: "pbp-buddy-life-v1" });
    a.module.advance({ elapsedSeconds: 60 });
    for (let i = 0; i < 60; i += 1)
        b.module.advance({ elapsedSeconds: 1 });
    assert.deepEqual(a.module.snapshot(), b.module.snapshot(), "tick cadence must not change state");
});
test("negative elapsed time cannot rewind the bundled module", async () => {
    const loaded = await loadBundledLifeModule(base);
    assert.ok(loaded.ok);
    if (!loaded.ok)
        return;
    loaded.module.createCreature({ creatureId: "x", seed: 1, schema: "pbp-buddy-life-v1" });
    loaded.module.advance({ elapsedSeconds: 10 });
    const before = loaded.module.snapshot().simulationSeconds;
    loaded.module.advance({ elapsedSeconds: -9999 });
    assert.equal(loaded.module.snapshot().simulationSeconds, before);
});
test("an unsupported schema is refused by the bundled module", async () => {
    const loaded = await loadBundledLifeModule(base);
    assert.ok(loaded.ok);
    if (!loaded.ok)
        return;
    assert.throws(() => loaded.module.createCreature({ creatureId: "x", seed: 1, schema: "not-a-schema" }), /unsupported schema/);
});
test("default timeout is a sane, documented constant", () => {
    assert.equal(DEFAULT_LOAD_TIMEOUT_MS, 5_000);
});
