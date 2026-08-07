/**
 * Fail-closed verification for the canonical Home plugin panel.
 *
 * Home is plugin-owned now: the sandboxed panel never owns durable localStorage.
 * This harness therefore mirrors the real host boundary instead of the retired
 * Control Center-local Home. It loads the actual built Home panel, supplies the
 * narrow openPetsPanel bridge, keeps host-owned state across panel reopen, and
 * verifies player/Buddy actions, furniture state, camera rotation and rendering.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const { mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

app.disableHardwareAcceleration();

const EXPECTED_CORNERS = ["SE", "SW", "NW", "NE"];
const HOME_STORAGE_KEY = "pocket-buddy-plus:phaser-home:v2";
const PANEL_CHANNEL = "pbp-home-capture:panel-message";
const HOST_CHANNEL = "pbp-home-capture:host-message";
const panelHtml = join(__dirname, "..", "..", "..", "..", "plugins", "official", "openpets.home-builder", "home.html");
const artifactsDir = join(__dirname, "..", "..", "artifacts", "home-corners");
const profile = join(tmpdir(), `pbp-capture-home-${process.pid}`);
app.setPath("userData", profile);
process.env.POCKET_BUDDY_PLUS_USER_DATA = profile;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hostState = new Map();
const buddyActions = [];
let closeRequests = 0;
let win = null;

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

async function execute(source) {
  return win.webContents.executeJavaScript(source, true);
}

function sendHost(message) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(HOST_CHANNEL, message);
}

function installHostBridge() {
  ipcMain.on(PANEL_CHANNEL, (_event, message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "home-state-request") {
      const values = Object.fromEntries(hostState.entries());
      sendHost({ type: "home-state", values });
      sendHost({ type: "home-presentation", mode: "panel" });
      sendHost({
        type: "home-buddy-presence",
        buddy: {
          id: "default",
          name: "Capture Buddy",
          profile: {
            displayName: "Capture Buddy",
            mood: "content",
            activity: "idle",
            dominantNeed: "social",
            affection: 72,
            needs: { hunger: 18, energy: 22, fun: 12, social: 25 },
          },
        },
      });
      return;
    }
    if (message.type === "home-state-write" && message.key === HOME_STORAGE_KEY && typeof message.value === "string") {
      hostState.set(message.key, message.value);
      return;
    }
    if (message.type === "home-buddy-react" && typeof message.action === "string") {
      buddyActions.push(message.action);
      return;
    }
    if (message.type === "home-presentation" && (message.mode === "panel" || message.mode === "home")) {
      sendHost({ type: "home-presentation", mode: message.mode });
      return;
    }
    if (message.type === "home-panel-closing" || message.type === "capture-panel-close") {
      closeRequests += 1;
    }
  });
}

async function waitForHome() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await execute(`Boolean(document.querySelector("[data-home-stage] canvas"))`);
    if (ready && readSave()?.version === 2) return;
    await wait(100);
  }
  throw new Error("Home plugin panel did not become playable");
}

async function openHome() {
  await win.loadFile(panelHtml);
  await waitForHome();
}

async function closeHome() {
  const before = closeRequests;
  const closed = await execute(
    `(() => { const button = document.querySelector("[data-home-close]"); if (!button) return false; button.click(); return true; })()`,
  );
  if (!closed) throw new Error("could not request Home panel close");
  for (let attempt = 0; attempt < 20 && closeRequests === before; attempt += 1) await wait(50);
  if (closeRequests === before) throw new Error("Home panel did not send its close message");
}

function readSave() {
  const raw = hostState.get(HOME_STORAGE_KEY);
  if (typeof raw !== "string") return null;
  return JSON.parse(raw);
}

function writeSave(save) {
  hostState.set(HOME_STORAGE_KEY, JSON.stringify(save));
}

async function run() {
  rmSync(artifactsDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });
  installHostBridge();

  win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "panel-preload.cjs"),
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

  await openHome();

  const initial = readSave();
  if (initial?.version !== 2) throw new Error(`expected host-owned Home save v2, got ${initial?.version}`);
  if (initial?.play?.schema !== "pocket-buddy-home-play-v1") {
    throw new Error(`missing canonical play state: ${initial?.play?.schema}`);
  }
  if (!Array.isArray(initial?.room?.items) || initial.room.items.length < 5) {
    throw new Error(`starter room missing furniture: ${initial?.room?.items?.length}`);
  }
  if (initial.room.cameraCorner !== EXPECTED_CORNERS[0]) {
    throw new Error(`unexpected initial camera corner: ${initial.room.cameraCorner}`);
  }

  const initialStatus = await execute(`document.querySelector("[data-home-status]")?.textContent ?? ""`);
  if (!initialStatus.includes("Capture Buddy") || !initialStatus.includes("items")) {
    throw new Error(`Home did not receive host Buddy presence: ${initialStatus}`);
  }

  await execute(`document.querySelector("[data-home-pet]")?.click()`);
  await wait(150);
  const petted = readSave();
  if (!buddyActions.includes("pet")) throw new Error("Pet Buddy did not cross the plugin Buddy-reaction bridge");
  if (!String(petted?.play?.thought ?? "").includes("Capture Buddy")) {
    throw new Error(`Buddy presence did not affect canonical Home state: ${petted?.play?.thought}`);
  }

  const playerBefore = petted.play.player.cell;
  await execute(`document.querySelector('[data-home-move="east"]')?.click()`);
  await wait(150);
  const moved = readSave();
  if (moved?.play?.player?.cell?.x !== playerBefore.x + 1 || moved?.play?.player?.cell?.y !== playerBefore.y) {
    throw new Error(`player did not move east: ${JSON.stringify(playerBefore)} -> ${JSON.stringify(moved?.play?.player?.cell)}`);
  }

  await closeHome();
  await openHome();
  const reopened = readSave();
  if (reopened?.play?.player?.cell?.x !== moved.play.player.cell.x || reopened?.play?.player?.cell?.y !== moved.play.player.cell.y) {
    throw new Error("Home close/reopen did not restore host-owned player state");
  }

  const selected = readSave();
  selected.play.selectedItemId = "starter-tv";
  writeSave(selected);
  await openHome();
  await execute(`document.querySelector("[data-home-channel]")?.click()`);
  await wait(150);
  const televised = readSave();
  const television = televised?.room?.items?.find((item) => item.id === "starter-tv");
  if (television?.state?.powered !== true || television?.state?.channel !== "arcade") {
    throw new Error(`TV state did not persist: ${JSON.stringify(television?.state)}`);
  }

  const results = [];
  let previousBitmap = null;
  for (const corner of EXPECTED_CORNERS) {
    const save = readSave();
    if (save?.room?.cameraCorner !== corner) {
      throw new Error(`expected camera corner ${corner}, save reported ${save?.room?.cameraCorner}`);
    }
    const status = await execute(`document.querySelector("[data-home-status]")?.textContent ?? ""`);
    if (!status.includes("items") || !status.includes("Capture Buddy")) {
      throw new Error(`Home status is not reporting playable Buddy state: ${status}`);
    }

    const canvasBox = await execute(
      `(() => { const canvas = document.querySelector("[data-home-stage] canvas");
         if (!canvas) return null; const rect = canvas.getBoundingClientRect();
         return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }; })()`,
    );
    if (!canvasBox || canvasBox.width < 640 || canvasBox.height < 280) {
      throw new Error(`Home canvas is missing or visually crushed for ${corner}: ${JSON.stringify(canvasBox)}`);
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

    await execute(`document.querySelector('[data-home-rotate="1"]')?.click()`);
    await wait(700);
  }

  const finalCorner = readSave()?.room?.cameraCorner ?? null;
  if (finalCorner !== EXPECTED_CORNERS[0]) {
    throw new Error(`orbit did not close: ended at ${finalCorner}, expected ${EXPECTED_CORNERS[0]}`);
  }

  writeFileSync(
    join(artifactsDir, "summary.json"),
    `${JSON.stringify({
      interactions: {
        starterItems: initial.room.items.length,
        buddyActions,
        playerBefore,
        playerAfter: moved.play.player.cell,
        television: television.state,
        closeRequests,
      },
      results,
      consoleErrors,
    }, null, 2)}\n`,
    "utf8",
  );

  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
  }

  console.log(`plugin-owned playable Home captures OK -> ${artifactsDir}`);
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
