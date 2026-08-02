#!/usr/bin/env node
/**
 * License boundary gate.
 *
 * Pocket Buddy+ is MIT except for clearly identified separately licensed
 * packages. `packages/buddy-life-lgpl` is LGPL-2.1-or-later because it is a port
 * of openc2e-derived code, which is NOT ours to relicense.
 *
 * The failure this guards against is quiet and expensive: someone copies an
 * LGPL-derived implementation into an MIT package during a refactor, and the
 * product silently ships copyleft code as MIT. That is very hard to unwind after
 * a release, so it is checked mechanically on every run.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const LGPL_PACKAGE = join("packages", "buddy-life-lgpl");
const SPDX_LGPL = "SPDX-License-Identifier: LGPL-2.1-or-later";
const UPSTREAM_REVISION = "6a4396c83152fe9f9152be924b5a8edc8e759a6a";

const SKIP_DIRS = new Set(["node_modules", "dist", "dist-tests", ".git", ".test-dist", "dist-electron", "dist-electron-plus", "verification-artifacts", ".godot"]);

const failures = [];
const notes = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const sourceFiles = walk(join(repoRoot, "packages"))
  .concat(walk(join(repoRoot, "apps")))
  .filter((file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file));

// --- 1. Every file in the LGPL package carries the SPDX header ---------------
const lgplDir = join(repoRoot, LGPL_PACKAGE);
if (!existsSync(lgplDir)) {
  failures.push(`${LGPL_PACKAGE} is missing entirely`);
} else {
  for (const file of walk(lgplDir).filter((f) => /\.(ts|tsx)$/.test(f))) {
    const rel = relative(repoRoot, file);
    if (!readFileSync(file, "utf8").includes(SPDX_LGPL)) {
      failures.push(`${rel}: missing "${SPDX_LGPL}"`);
    }
  }
}

// --- 2. No LGPL-derived implementation leaks into an MIT package -------------
// A file outside the LGPL package that declares the LGPL SPDX identifier is
// either misplaced code or a mislabelled file. Either way it must not stand.
for (const file of sourceFiles) {
  const rel = relative(repoRoot, file);
  if (rel.startsWith(LGPL_PACKAGE)) continue;
  const text = readFileSync(file, "utf8");
  if (text.includes(SPDX_LGPL)) {
    failures.push(`${rel}: declares LGPL but sits OUTSIDE ${LGPL_PACKAGE}. Move it into the LGPL package.`);
  }
  // Catch a copied implementation that dropped its header on the way.
  if (/buddy_biology_|openc2e/i.test(text) && !/BUDDY_BRAIN_PORT_MATRIX|check-license-boundary|THIRD_PARTY|LICENSE_MATRIX/.test(rel)) {
    failures.push(`${rel}: references openc2e-derived material outside ${LGPL_PACKAGE}`);
  }
}

// --- 3. Required licence and notice files exist ------------------------------
for (const required of [
  join(LGPL_PACKAGE, "LICENSE"),
  join(LGPL_PACKAGE, "NOTICE"),
  join("LICENSES", "LGPL-2.1-or-later.txt"),
  join("docs", "LICENSE_MATRIX.md"),
  "THIRD_PARTY_NOTICES.md",
]) {
  if (!existsSync(join(repoRoot, required))) failures.push(`missing required file: ${required}`);
}

// --- 4. Attribution and upstream revision are preserved ----------------------
const noticePath = join(repoRoot, LGPL_PACKAGE, "NOTICE");
if (existsSync(noticePath)) {
  const notice = readFileSync(noticePath, "utf8");
  for (const needle of ["openc2e", UPSTREAM_REVISION, "WITHOUT ANY", "Prismtek"]) {
    if (!notice.includes(needle)) failures.push(`${LGPL_PACKAGE}/NOTICE: missing required content "${needle}"`);
  }
}

// --- 5. Release-gate: verbatim licence text must be vendored before shipping --
const licenseTextPath = join(repoRoot, "LICENSES", "LGPL-2.1-or-later.txt");
if (existsSync(licenseTextPath)) {
  const text = readFileSync(licenseTextPath, "utf8");
  // The real text contains these; a pointer stub does not.
  const verbatim = text.includes("GNU LESSER GENERAL PUBLIC LICENSE") && text.includes("TERMS AND CONDITIONS");
  if (!verbatim) {
    notes.push(
      "LICENSES/LGPL-2.1-or-later.txt is currently a pointer, not the verbatim licence text. " +
      "This is ACCEPTABLE for development but MUST be vendored before any public binary release.",
    );
  }
}

// --- Report -------------------------------------------------------------------
for (const note of notes) console.log(`NOTE  ${note}`);
if (failures.length) {
  console.error(`\nlicense boundary: ${failures.length} violation(s)`);
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  process.exit(1);
}
console.log(`license boundary: OK (${sourceFiles.length} source files scanned, ${notes.length} release note(s))`);
