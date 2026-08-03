/**
 * Captures one screenshot of the Phaser Home room per camera corner.
 *
 * Runs the real built renderer bundle in a hidden BrowserWindow with an
 * isolated Electron user-data directory, so it never touches a real install and
 * never appears on the desktop.
 *
 * Fail-closed by design. A capture harness that cannot fail is worthless: a
 * blank canvas still writes a valid PNG, and a rotation that silently no-ops
 * still writes four files. So every corner must (a) report the expected corner
 * in the status line and (b) produce a canvas with real pixel variety. Anything
 * else exits non-zero.
 *
 *   electron scripts/capture-home/main.cjs
 */
const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

// A never-shown window has no GPU compositing path, so a hardware-accelerated
// WebGL canvas produces no frames and capturePage returns the page with a hole
// where the room should be. Software rendering paints on the main compositor
// and is capturable while the window stays hidden.
app.disableHardwareAcceleration();

const EXPECTED_CORNERS = ["SE", "SW", "NW", "NE"];
const rendererIndex = join(__dirname, "..", "..", "dist", "renderer", "index.html");
const artifactsDir = join(__dirname, "..", "..", "artifacts", "home-corners");

// Never share a profile with a real install.
const profile = join(tmpdir(), `pbp-capture-home-${process.pid}`);
app.setPath("userData", profile);
process.env.POCKET_BUDDY_PLUS_USER_DATA = profile;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Shannon entropy over a sampled grey histogram.
 *
 * A blank, single-colour, or failed-to-paint canvas collapses toward 0. This is
 * the check that stops "four valid PNGs" from being mistaken for "it rendered".
 */
function imageEntropy(png) {
  // Walk the bitmap linearly rather than by (x, y). getSize() reports logical
  // DIPs while toBitmap() returns physical pixels, so on a 2x display any
  // geometry-based index runs off the row stride and samples mostly zeros --
  // which reads as "blank" for an image that is in fact fully drawn.
  const buf = png.toBitmap();
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i + 3 < buf.length; i += 4 * 16) {
    // toBitmap() is BGRA.
    hist[Math.round(buf[i + 2] * 0.299 + buf[i + 1] * 0.587 + buf[i] * 0.114)] += 1;
    n += 1;
  }
  if (n === 0) return 0;
  let e = 0;
  for (const c of hist) {
    if (!c) continue;
    const p = c / n;
    e -= p * Math.log2(p);
  }
  return e;
}

/** Fraction of sampled pixels whose luminance differs meaningfully. */
function differingFraction(a, b) {
  if (a.length !== b.length) return 1;
  let diff = 0, n = 0;
  for (let i = 0; i + 3 < a.length; i += 4 * 16) {
    const la = a[i + 2] * 0.299 + a[i + 1] * 0.587 + a[i] * 0.114;
    const lb = b[i + 2] * 0.299 + b[i + 1] * 0.587 + b[i] * 0.114;
    if (Math.abs(la - lb) > 8) diff += 1;
    n += 1;
  }
  return n === 0 ? 0 : diff / n;
}

async function run() {
  rmSync(artifactsDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "..", "verify-ui", "preload-stub.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      offscreen: false,
      // Phaser draws from requestAnimationFrame. Chromium throttles rAF in
      // hidden windows, which paints a background colour and nothing else --
      // the exact "valid PNG, empty room" failure this harness exists to catch.
      backgroundThrottling: false,
    },
  });
  win.webContents.setBackgroundThrottling(false);

  const consoleErrors = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) consoleErrors.push(message);
  });

  await win.loadFile(rendererIndex);
  await wait(2500);

  const opened = await win.webContents.executeJavaScript(
    `(() => { const b = document.querySelector(".pb-home-nav"); if (!b) return "no-nav"; b.click(); return "clicked"; })()`,
    true,
  );
  if (opened !== "clicked") throw new Error(`could not open Home: ${opened}`);
  // Phaser boots its WebGL/canvas context and paints the first frame.
  await wait(3000);

  const results = [];
  let previousBitmap = null;
  for (const corner of EXPECTED_CORNERS) {
    const status = await win.webContents.executeJavaScript(
      `(document.querySelector("[data-home-status]")?.textContent ?? "")`,
      true,
    );
    const reported = /Camera\s+(\w+)/.exec(status)?.[1] ?? null;
    if (reported !== corner) {
      throw new Error(`expected camera corner ${corner}, renderer reported ${reported} (status: ${status})`);
    }

    const canvasBox = await win.webContents.executeJavaScript(
      `(() => { const c = document.querySelector("[data-home-stage] canvas");
         if (!c) return null; const r = c.getBoundingClientRect();
         return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })()`,
      true,
    );
    if (!canvasBox || canvasBox.width < 64 || canvasBox.height < 64) {
      throw new Error(`no usable Home canvas for ${corner}: ${JSON.stringify(canvasBox)}`);
    }

    // Full page, not a crop: the footer status line ("Camera SE ...") is then
    // visible inside the artifact itself, so a screenshot proves which corner it
    // shows without trusting a filename.
    const shot = await win.webContents.capturePage();
    const entropy = imageEntropy(shot);
    if (entropy < 1.0) {
      throw new Error(`Home canvas for ${corner} looks blank (entropy ${entropy.toFixed(3)})`);
    }
    // Rotation must actually redraw. Without this, a no-op rotate that only
    // updates the status text would still produce four "valid" screenshots of
    // the same room, and the label would be the only thing that ever moved.
    const bitmap = shot.toBitmap();
    if (previousBitmap) {
      const changed = differingFraction(previousBitmap, bitmap);
      if (changed < 0.01) {
        throw new Error(`rotation to ${corner} changed only ${(changed * 100).toFixed(2)}% of pixels`);
      }
      results[results.length - 1].changedIntoNext = Number(changed.toFixed(4));
    }
    previousBitmap = bitmap;

    writeFileSync(join(artifactsDir, `home-${corner}.png`), shot.toPNG());
    results.push({ corner, entropy: Number(entropy.toFixed(3)), canvas: canvasBox });

    await win.webContents.executeJavaScript(
      `(() => { document.querySelector('[data-home-rotate="1"]')?.click(); return true; })()`,
      true,
    );
    await wait(900);
  }

  // A full orbit must return to the starting corner, or "four screenshots"
  // could be four views of the same room.
  const finalStatus = await win.webContents.executeJavaScript(
    `(document.querySelector("[data-home-status]")?.textContent ?? "")`,
    true,
  );
  const finalCorner = /Camera\s+(\w+)/.exec(finalStatus)?.[1] ?? null;
  if (finalCorner !== EXPECTED_CORNERS[0]) {
    throw new Error(`orbit did not close: ended at ${finalCorner}, expected ${EXPECTED_CORNERS[0]}`);
  }

  const distinct = new Set(results.map((r) => r.entropy)).size;
  writeFileSync(
    join(artifactsDir, "summary.json"),
    `${JSON.stringify({ results, distinctEntropies: distinct, consoleErrors }, null, 2)}\n`,
    "utf8",
  );

  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
  }

  console.log(`home corner captures OK -> ${artifactsDir}`);
  for (const r of results) console.log(`  ${r.corner}: entropy ${r.entropy} canvas ${r.canvas.width}x${r.canvas.height}`);
}

app.whenReady().then(run).then(
  () => { rmSync(profile, { recursive: true, force: true }); app.exit(0); },
  (error) => {
    console.error(`home capture FAILED: ${error.message}`);
    rmSync(profile, { recursive: true, force: true });
    app.exit(1);
  },
);
