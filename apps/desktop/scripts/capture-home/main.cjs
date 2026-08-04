/**
 * Fail-closed packaged-renderer verification for the Phaser Home slice.
 *
 * The harness uses a disposable Electron profile, performs real DOM controls,
 * inspects only the isolated public preview save, and captures all four camera
 * corners. It proves more than process startup: Buddy actions, player movement,
 * object state, restart persistence, rotation, non-blank rendering, and the
 * absence of renderer console errors.
 */
const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

app.disableHardwareAcceleration();

const EXPECTED_CORNERS = ["SE", "SW", "NW", "NE"];
const HOME_STORAGE_KEY = "pocket-buddy-plus:phaser-home:v2";
const rendererIndex = join(__dirname, "..", "..", "dist", "renderer", "index.html");
const artifactsDir = join(__dirname, "..", "..", "artifacts", "home-corners");
const profile = join(tmpdir(), `pbp-capture-home-${process.pid}`);
app.setPath("userData", profile);
process.env.POCKET_BUDDY_PLUS_USER_DATA = profile;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function imageEntropy(png) {
  const buf = png.toBitmap();
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i + 3 < buf.length; i += 4 * 16) {
    hist[Math.round(buf[i + 2] * 0.299 + buf[i + 1] * 0.587 + buf[i] * 0.114)] += 1;
    n += 1;
  }
  if (n === 0) return 0;
  let entropy = 0;
  for (const count of hist) {
    if (!count) continue;
    const probability = count / n;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function differingFraction(a, b) {
  if (a.length !== b.length) return 1;
  let different = 0;
  let samples = 0;
  for (let i = 0; i + 3 < a.length; i += 4 * 16) {
    const left = a[i + 2] * 0.299 + a[i + 1] * 0.587 + a[i] * 0.114;
    const right = b[i + 2] * 0.299 + b[i + 1] * 0.587 + b[i] * 0.114;
    if (Math.abs(left - right) > 8) different += 1;
    samples += 1;
  }
  return samples === 0 ? 0 : different / samples;
}

async function execute(win, source) {
  return win.webContents.executeJavaScript(source, true);
}

async function openHome(win) {
  const opened = await execute(
    win,
    `(() => { const button = document.querySelector(".pb-home-nav"); if (!button) return "no-nav"; button.click(); return "clicked"; })()`,
  );
  if (opened !== "clicked") throw new Error(`could not open Home: ${opened}`);
  await wait(2_500);
}

async function closeHome(win) {
  const closed = await execute(
    win,
    `(() => { const button = document.querySelector(".pb-home-close"); if (!button) return false; button.click(); return true; })()`,
  );
  if (!closed) throw new Error("could not close Home");
  await wait(250);
}

async function readSave(win) {
  return execute(
    win,
    `(() => { const raw = localStorage.getItem(${JSON.stringify(HOME_STORAGE_KEY)}); return raw ? JSON.parse(raw) : null; })()`,
  );
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
      backgroundThrottling: false,
    },
  });
  win.webContents.setBackgroundThrottling(false);

  const consoleErrors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) consoleErrors.push(message);
  });

  await win.loadFile(rendererIndex);
  await wait(2_000);
  await openHome(win);

  const initial = await readSave(win);
  if (initial?.version !== 2) throw new Error(`expected Home save v2, got ${initial?.version}`);
  if (initial?.play?.schema !== "pocket-buddy-home-play-v1") {
    throw new Error(`missing canonical play state: ${initial?.play?.schema}`);
  }
  if (!Array.isArray(initial?.room?.items) || initial.room.items.length < 5) {
    throw new Error(`starter room missing furniture: ${initial?.room?.items?.length}`);
  }

  await execute(win, `document.querySelector("[data-home-pet]")?.click()`);
  await wait(150);
  const petted = await readSave(win);
  if (petted?.play?.creature?.action_counts?.["home.pet"] !== 1) {
    throw new Error("Pet Buddy did not reach the canonical Buddy action history");
  }

  const playerBefore = petted.play.player.cell;
  await execute(win, `document.querySelector('[data-home-move="east"]')?.click()`);
  await wait(150);
  const moved = await readSave(win);
  if (moved?.play?.player?.cell?.x !== playerBefore.x + 1 || moved?.play?.player?.cell?.y !== playerBefore.y) {
    throw new Error(`player did not move east: ${JSON.stringify(playerBefore)} -> ${JSON.stringify(moved?.play?.player?.cell)}`);
  }

  await closeHome(win);
  await openHome(win);
  const reopened = await readSave(win);
  if (reopened?.play?.player?.cell?.x !== moved.play.player.cell.x || reopened?.play?.creature?.action_counts?.["home.pet"] !== 1) {
    throw new Error("Home close/reopen did not restore player and Buddy state");
  }

  // Select the starter television in the disposable save, then exercise the
  // real toolbar command. This avoids brittle canvas coordinates while still
  // proving renderer -> controller -> domain -> persistence wiring.
  await execute(
    win,
    `(() => { const key = ${JSON.stringify(HOME_STORAGE_KEY)}; const save = JSON.parse(localStorage.getItem(key)); save.play.selectedItemId = "starter-tv"; localStorage.setItem(key, JSON.stringify(save)); })()`,
  );
  await closeHome(win);
  await openHome(win);
  await execute(win, `document.querySelector("[data-home-channel]")?.click()`);
  await wait(150);
  const televised = await readSave(win);
  const television = televised?.room?.items?.find((item) => item.id === "starter-tv");
  if (television?.state?.powered !== true || television?.state?.channel !== "arcade") {
    throw new Error(`TV state did not persist: ${JSON.stringify(television?.state)}`);
  }

  const results = [];
  let previousBitmap = null;
  for (const corner of EXPECTED_CORNERS) {
    const status = await execute(win, `(document.querySelector("[data-home-status]")?.textContent ?? "")`);
    const reported = /Camera\s+(\w+)/.exec(status)?.[1] ?? null;
    if (reported !== corner) {
      throw new Error(`expected camera corner ${corner}, renderer reported ${reported} (status: ${status})`);
    }
    if (!status.includes("items") || !status.includes("feels")) {
      throw new Error(`Home status is not reporting playable state: ${status}`);
    }

    const canvasBox = await execute(
      win,
      `(() => { const canvas = document.querySelector("[data-home-stage] canvas");
         if (!canvas) return null; const rect = canvas.getBoundingClientRect();
         return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }; })()`,
    );
    if (!canvasBox || canvasBox.width < 64 || canvasBox.height < 64) {
      throw new Error(`no usable Home canvas for ${corner}: ${JSON.stringify(canvasBox)}`);
    }

    const shot = await win.webContents.capturePage();
    const entropy = imageEntropy(shot);
    if (entropy < 1.0) throw new Error(`Home canvas for ${corner} looks blank (entropy ${entropy.toFixed(3)})`);

    const bitmap = shot.toBitmap();
    if (previousBitmap) {
      const changed = differingFraction(previousBitmap, bitmap);
      if (changed < 0.01) throw new Error(`rotation to ${corner} changed only ${(changed * 100).toFixed(2)}% of pixels`);
      results[results.length - 1].changedIntoNext = Number(changed.toFixed(4));
    }
    previousBitmap = bitmap;

    writeFileSync(join(artifactsDir, `home-${corner}.png`), shot.toPNG());
    results.push({ corner, entropy: Number(entropy.toFixed(3)), canvas: canvasBox });

    await execute(win, `(() => { document.querySelector('[data-home-rotate="1"]')?.click(); return true; })()`);
    await wait(700);
  }

  const finalStatus = await execute(win, `(document.querySelector("[data-home-status]")?.textContent ?? "")`);
  const finalCorner = /Camera\s+(\w+)/.exec(finalStatus)?.[1] ?? null;
  if (finalCorner !== EXPECTED_CORNERS[0]) {
    throw new Error(`orbit did not close: ended at ${finalCorner}, expected ${EXPECTED_CORNERS[0]}`);
  }

  writeFileSync(
    join(artifactsDir, "summary.json"),
    `${JSON.stringify({
      interactions: {
        starterItems: initial.room.items.length,
        petActionCount: petted.play.creature.action_counts["home.pet"],
        playerBefore,
        playerAfter: moved.play.player.cell,
        television: television.state,
      },
      results,
      consoleErrors,
    }, null, 2)}\n`,
    "utf8",
  );

  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
  }

  console.log(`playable Home captures OK -> ${artifactsDir}`);
  for (const result of results) {
    console.log(`  ${result.corner}: entropy ${result.entropy} canvas ${result.canvas.width}x${result.canvas.height}`);
  }
}

app.whenReady().then(run).then(
  () => { rmSync(profile, { recursive: true, force: true }); app.exit(0); },
  (error) => {
    console.error(`home capture FAILED: ${error.message}`);
    rmSync(profile, { recursive: true, force: true });
    app.exit(1);
  },
);
