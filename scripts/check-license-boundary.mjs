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
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const LGPL_PACKAGE = join("packages", "buddy-life-lgpl");
const SPDX_LGPL = "SPDX-License-Identifier: LGPL-2.1-or-later";
const UPSTREAM_REVISION = "6a4396c83152fe9f9152be924b5a8edc8e759a6a";

/**
 * SHA-256 of the verbatim LGPL-2.1 text, taken from openc2e's COPYING at the
 * reviewed revision above. Pinning the digest is what makes "modified" and
 * "truncated" detectable rather than merely "present".
 */
const LGPL_TEXT_SHA256 = "6095e9ffa777dd22839f7801aa845b31c9ed07f3d6bf8a26dc5d2dec8ccc0ef3";
const LGPL_TEXT_LINES = 504;

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

// --- 5. The licence text must be complete, verbatim and unmodified ----------
// A pointer, a truncation or an edited copy all fail here. This is a
// distribution requirement, not advice.
function checkLicenseText(relPath, { allowPrefix = false } = {}) {
  const full = join(repoRoot, relPath);
  if (!existsSync(full)) {
    failures.push(`${relPath}: missing (the complete LGPL text must ship)`);
    return;
  }
  const text = readFileSync(full, "utf8");

  if (!text.includes("GNU LESSER GENERAL PUBLIC LICENSE")) {
    failures.push(`${relPath}: not the LGPL text (pointer or placeholder?)`);
    return;
  }
  if (!text.includes("TERMS AND CONDITIONS")) {
    failures.push(`${relPath}: truncated -- missing "TERMS AND CONDITIONS"`);
  }
  if (!text.includes("That's all there is to it!")) {
    failures.push(`${relPath}: truncated -- missing the final line of the licence`);
  }

  // Exact-match the canonical body. `allowPrefix` covers files that legitimately
  // prepend a module statement before the verbatim text.
  const marker = "\t\t  GNU LESSER GENERAL PUBLIC LICENSE";
  const start = text.indexOf(marker);
  const body = start >= 0 ? text.slice(start) : text;
  const digest = createHash("sha256").update(body).digest("hex");
  const lines = body.split("\n").length - 1;

  if (digest !== LGPL_TEXT_SHA256) {
    failures.push(
      `${relPath}: licence text MODIFIED or incomplete ` +
      `(sha256 ${digest.slice(0, 12)}..., expected ${LGPL_TEXT_SHA256.slice(0, 12)}..., ` +
      `${lines} lines vs ${LGPL_TEXT_LINES})`,
    );
  }
  if (!allowPrefix && start !== 0) {
    failures.push(`${relPath}: unexpected content before the licence text`);
  }
}

checkLicenseText(join("LICENSES", "LGPL-2.1-or-later.txt"));
checkLicenseText(join(LGPL_PACKAGE, "COPYING"));
checkLicenseText(join(LGPL_PACKAGE, "LICENSE"), { allowPrefix: true });

// --- 6. Packaged output must carry licence, NOTICE and corresponding source --
// Only meaningful once a package exists; reported as a note otherwise so the
// gate is useful both before and after packaging.
const packagedApp = join(repoRoot, "apps", "desktop", "dist-electron-plus", "mac-arm64", "Pocket Buddy+.app");
if (existsSync(packagedApp)) {
  const resources = join(packagedApp, "Contents", "Resources");
  const unpacked = join(resources, "app.asar.unpacked", "node_modules", "@open-pets", "buddy-life-lgpl");
  // The LGPL obligation attaches to SHIPPING the library. The desktop app does
  // not currently depend on buddy-life-lgpl (only buddy-domain), so demanding
  // its licence artefacts in a bundle that does not contain it fails every
  // build for a duty that has not been incurred. If the package ever reaches
  // the bundle, every artefact below becomes mandatory again.
  if (existsSync(unpacked)) {
    for (const [label, path] of [
      ["LGPL LICENSE", join(unpacked, "LICENSE")],
      ["LGPL NOTICE", join(unpacked, "NOTICE")],
      ["corresponding source (src/)", join(unpacked, "src")],
    ]) {
      if (!existsSync(path)) {
        failures.push(`packaged app ships buddy-life-lgpl but is missing ${label} at ${relative(repoRoot, path)}`);
      }
    }
  } else {
    notes.push("packaged app does not bundle @open-pets/buddy-life-lgpl; no LGPL redistribution duty for this build");
  }
} else {
  notes.push("packaged app not built; skipped packaged-output licence checks (run pnpm package:desktop:plus:dir)");
}

// --- Report -------------------------------------------------------------------
for (const note of notes) console.log(`NOTE  ${note}`);
if (failures.length) {
  console.error(`\nlicense boundary: ${failures.length} violation(s)`);
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  process.exit(1);
}
console.log(`license boundary: OK (${sourceFiles.length} source files scanned, ${notes.length} release note(s))`);
