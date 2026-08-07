#!/usr/bin/env node
// Bundle official plugins that are written as TypeScript sources.
//
//   node scripts/build-plugins.mjs           # write the shipped artifacts
//   node scripts/build-plugins.mjs --check   # fail if the artifacts are stale
//
// Most official plugins are hand-written single files and are left alone: a
// plugin only opts in by having a `src/` directory.
//
// The reason this exists at all is the sandbox. A plugin ships as its manifest,
// its entry file, and its declared assets - there is no script asset kind, so
// panel JavaScript has to be inline, and nothing can `import` a workspace
// package at runtime. Home needs ~1,500 lines of room/wall/play-state rules
// from @open-pets/buddy-domain. Hand-copying those into a panel would fork the
// game rules away from the package that tests them, so instead the sources
// import normally and everything is inlined here, at build time.
//
// The bundled output is committed, because it is what actually ships. CI runs
// --check so a source edit that never got rebuilt fails loudly instead of
// shipping the previous bundle.
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = join(repoRoot, "plugins", "official");
const check = process.argv.includes("--check");

// vite is a dependency of the desktop app, not of the repo root.
const require = createRequire(join(repoRoot, "apps", "desktop", "package.json"));
const vite = await import(require.resolve("vite"));

/** Map every workspace package to its TypeScript source. */
async function workspaceAliases() {
  const packagesDir = join(repoRoot, "packages");
  const alias = {};
  for (const name of await fs.readdir(packagesDir)) {
    const manifestPath = join(packagesDir, name, "package.json");
    const manifest = await fs.readFile(manifestPath, "utf8").then(JSON.parse).catch(() => null);
    const entry = join(packagesDir, name, "src", "index.ts");
    if (manifest?.name && await exists(entry)) alias[manifest.name] = entry;
  }
  return alias;
}

async function exists(path) {
  return fs.access(path).then(() => true, () => false);
}

async function bundle(entry, alias) {
  const result = await vite.build({
    root: repoRoot,
    configFile: false,
    logLevel: "error",
    resolve: { alias },
    build: {
      write: false,
      minify: false,
      target: "es2022",
      lib: { entry, formats: ["es"], fileName: "bundle" },
    },
  });
  const output = (Array.isArray(result) ? result[0] : result).output;
  const chunks = output.filter((item) => item.type === "chunk");
  // lib mode emits one chunk unless something was split out - and a second
  // chunk would be a runtime import the sandbox cannot resolve, so refuse it
  // here rather than shipping a plugin that fails on load.
  if (chunks.length !== 1) throw new Error(`${entry} produced ${chunks.length} chunks; the sandbox can only load one file.`);
  const code = chunks[0].code;
  const leftover = code.match(/^\s*import\s.*$/gm);
  if (leftover) throw new Error(`${entry} still imports at runtime: ${leftover.join(", ")}`);
  return code;
}

/** Write, or in --check mode report drift without touching the file. */
async function emit(path, content, stale) {
  const current = await fs.readFile(path, "utf8").catch(() => null);
  if (current === content) return;
  if (check) { stale.push(relative(repoRoot, path)); return; }
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, content);
  console.log(`  wrote ${relative(repoRoot, path)} (${content.length} bytes)`);
}

const alias = await workspaceAliases();
const stale = [];
let built = 0;

for (const id of (await fs.readdir(pluginsDir)).sort()) {
  const pluginDir = join(pluginsDir, id);
  const srcDir = join(pluginDir, "src");
  if (!await exists(join(srcDir, "index.ts"))) continue;

  const manifest = JSON.parse(await fs.readFile(join(pluginDir, "openpets.plugin.json"), "utf8"));
  if (!check) console.log(`building ${id}`);
  built += 1;

  await emit(join(pluginDir, manifest.entry), await bundle(join(srcDir, "index.ts"), alias), stale);

  // A panel is one HTML file with its script inline, so build the panel source
  // and substitute it into the template.
  for (const [name, relPath] of Object.entries(manifest.panels ?? {})) {
    const template = join(srcDir, `${name}.html`);
    if (!await exists(template)) throw new Error(`Panel "${name}" declares ${relPath} but ${relative(repoRoot, template)} is missing.`);
    let html = await fs.readFile(template, "utf8");
    const marker = "<!--PANEL_SCRIPT-->";
    if (!html.includes(marker)) throw new Error(`${relative(repoRoot, template)} must contain ${marker}.`);

    const stylePath = join(srcDir, `${name}.css`);
    if (html.includes("<!--PANEL_STYLE-->")) {
      const style = await fs.readFile(stylePath, "utf8").catch(() => { throw new Error(`${relative(repoRoot, template)} wants <!--PANEL_STYLE--> but ${relative(repoRoot, stylePath)} is missing.`); });
      html = html.replace("<!--PANEL_STYLE-->", `<style>\n${style.replaceAll("</style", "<\\/style")}</style>`);
    }

    const code = await bundle(join(srcDir, `${name}.ts`), alias);
    // A literal </script> inside the bundle would close the tag early.
    await emit(join(pluginDir, relPath), html.replace(marker, `<script type="module">\n${code.replaceAll("</script", "<\\/script")}\n</script>`), stale);
  }
}

if (stale.length) {
  console.error(`Plugin artifacts are stale:\n${stale.map((path) => `  ${path}`).join("\n")}\n\nRun: node scripts/build-plugins.mjs`);
  process.exit(1);
}
console.log(check ? `Plugin artifacts are up to date (${built} built from source).` : `Built ${built} plugin(s) from source.`);
