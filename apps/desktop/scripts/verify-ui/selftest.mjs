/**
 * Harness self-test: proves `verify:ui` actually fails.
 *
 * A suite that has only ever been observed passing is not evidence. This drives
 * five deliberate breaks and asserts the harness rejects each for the intended
 * reason, then asserts a clean run still passes. The breaks are injected via
 * PBP_VERIFY_INJECT and exist only for this script, so nothing is left broken in
 * source afterwards.
 *
 * This must pass before verify:ui is wired into CI.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "..");
const electron = join(appDir, "node_modules", ".bin", "electron");
const harness = join(here, "main.cjs");

const CONTROLS = [
  { id: "fixture", label: "invalid fixture", expect: ["route-not-reached", "react-root-empty", "body-effectively-empty", "renderer-uncaught-error", "too-few-visible-elements"] },
  { id: "crash", label: "renderer crash", expect: ["react-root-empty", "body-effectively-empty", "too-few-visible-elements", "no-visible-heading"] },
  { id: "blank", label: "blank screenshot", expect: ["blank-screenshot"] },
  { id: "a11y", label: "missing accessible label", expect: ["missing-accessible-name"] },
  { id: "branding", label: "branding regression", expect: ["visible-openpets-wording"] },
];

function runHarness(inject) {
  const artifacts = mkdtempSync(join(tmpdir(), "pbp-selftest-"));
  const result = spawnSync(electron, [harness], {
    cwd: appDir,
    encoding: "utf8",
    env: { ...process.env, PBP_VERIFY_INJECT: inject, PBP_VERIFY_ARTIFACTS: artifacts },
  });
  let summary = null;
  try {
    summary = JSON.parse(readFileSync(join(artifacts, "summary.json"), "utf8"));
  } catch {
    summary = null;
  }
  const messages = new Set((summary?.findings ?? []).map((f) => f.message));
  // A fatal aborts before summary.json is written, so the abort text is also
  // treated as evidence of the reason.
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  for (const line of output.split("\n")) {
    const gates = line.match(/gates:\s*(.+)/);
    if (gates) for (const gate of gates[1].split(",")) messages.add(gate.trim());
    // A screenshot rejection aborts before summary.json exists and is reported
    // as prose, so map it back to its finding name.
    if (/screenshot \S+: (near-uniform luminance|single-colour|mostly transparent|too few distinct colours|implausible size)/.test(line)) {
      messages.add("blank-screenshot");
    }
  }
  return { status: result.status, messages, output };
}

let failures = 0;

console.log("verify-ui self-test: proving the harness detects regressions\n");

for (const control of CONTROLS) {
  const { status, messages, output } = runHarness(control.id);
  const matched = control.expect.filter((expected) => messages.has(expected));
  const detected = status !== 0 && matched.length > 0;
  console.log(`${detected ? "PASS" : "FAIL"}  ${control.id.padEnd(9)} ${control.label}`);
  console.log(`        exit=${status} reasons=${[...messages].join(",") || "(none)"}`);
  if (!detected) {
    failures += 1;
    console.log(`        expected one of: ${control.expect.join(", ")}`);
    console.log(output.split("\n").slice(-6).join("\n"));
  }
}

// And the control case: with no injection the harness must still pass, or the
// checks above would be meaningless (anything that always fails proves nothing).
const clean = runHarness("");
const cleanOk = clean.status === 0;
console.log(`${cleanOk ? "PASS" : "FAIL"}  clean     no injection -> exit=${clean.status}`);
if (!cleanOk) {
  failures += 1;
  console.log(clean.output.split("\n").slice(-8).join("\n"));
}

console.log(`\n${failures === 0 ? "self-test passed" : `self-test FAILED (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
