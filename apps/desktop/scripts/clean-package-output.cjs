const { rmSync } = require("node:fs");
const { basename, dirname, resolve } = require("node:path");

const scriptsDir = __dirname;
const desktopDir = resolve(scriptsDir, "..");
const requestedTarget = process.argv[2] || "dist-electron";
const allowedTargets = new Set(["dist-electron", "dist-electron-plus"]);

if (!allowedTargets.has(requestedTarget)) {
  throw new Error(`Refusing to clean unknown package output: ${requestedTarget}`);
}

const target = resolve(desktopDir, requestedTarget);
if (basename(target) !== requestedTarget || dirname(target) !== desktopDir) {
  throw new Error(`Refusing to clean unexpected package output path: ${target}`);
}

rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
