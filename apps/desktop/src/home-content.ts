/**
 * Tiny House content pack resolution for Home.
 *
 * The pack is PURCHASED ART (Pixel Salvaje, TinyHouse 0.17) and must never
 * enter this repository, which is public. It is copied into the application
 * bundle at package time from a private path (see scripts/stage-content-pack.mjs
 * and the `extraResources` entry in electron-builder.pocket-buddy-plus.yml), and
 * resolved here at runtime.
 *
 * When no pack is present -- a public checkout, a contributor's machine, CI --
 * every accessor returns null and Home falls back to placeholder geometry. That
 * fallback is the reason this repository stays distributable.
 */
import { app, protocol } from "electron";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";

import { debug, info, warn } from "./logger.js";
import { getAppStateSnapshot } from "./app-state.js";
import { getInstalledPetDir } from "./pet-paths.js";

export const HOME_ASSET_SCHEME = "openpets-home-asset";

/**
 * Make the asset schemes usable by a texture loader.
 *
 * Phaser fetches textures over XHR rather than assigning an <img> src, and a
 * plain custom scheme is not CORS-eligible, so an unregistered scheme fails
 * with "Cross origin requests are only supported for protocol schemes: ...".
 * The existing schemes were only ever used as <img> sources, which is why this
 * never came up before.
 *
 * MUST be called before the app `ready` event.
 */
export function registerHomeContentSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: HOME_ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
    {
      // The Buddy spritesheet reaches Home through the same loader.
      scheme: "openpets-installed",
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
}

/** Extensions the pack is allowed to serve. Art only -- never code or data. */
const ALLOWED_EXTENSIONS = new Map<string, string>([
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

const MAX_ASSET_BYTES = 16 * 1024 * 1024;

let cachedRoot: string | null | undefined;

/**
 * Locate the content pack root, or null when this build has no licensed art.
 *
 * Order: explicit override, packaged resources, then a private developer
 * checkout. The developer path is a convenience for this machine only and is
 * never assumed to exist.
 */
export function resolveHomeContentRoot(): string | null {
  if (cachedRoot !== undefined) return cachedRoot;

  const candidates: string[] = [];
  const override = process.env.POCKET_BUDDY_PLUS_TINYHOUSE_DIR?.trim();
  if (override) candidates.push(override);
  if (process.resourcesPath) candidates.push(join(process.resourcesPath, "tinyhouse"));
  if (!app.isPackaged) {
    candidates.push(
      resolve(
        app.getAppPath(),
        "..",
        "..",
        "..",
        "prismtek-apps",
        "apps",
        "prismtek-buddies-desktop",
        "public",
        "tinyhouse",
      ),
    );
  }

  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, "catalog.json"))) {
      info("home", "content pack resolved", { root: candidate });
      cachedRoot = candidate;
      return cachedRoot;
    }
  }

  info("home", "no content pack present; Home will use placeholder geometry", {
    checked: candidates.length,
  });
  cachedRoot = null;
  return cachedRoot;
}

/**
 * The pack's catalog, or null.
 *
 * Returned to the renderer as parsed JSON rather than a path, so the renderer
 * never learns where the licensed art lives on disk.
 */
export async function readHomeCatalog(): Promise<unknown | null> {
  const root = resolveHomeContentRoot();
  if (!root) return null;
  try {
    const raw = await readFile(join(root, "catalog.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      warn("home", "content pack catalog is not an object");
      return null;
    }
    return parsed;
  } catch (error) {
    warn("home", "content pack catalog unreadable", { error: String(error) });
    return null;
  }
}

/**
 * Map a catalog `src` to a path inside the pack.
 *
 * Catalog entries are web-rooted (`/tinyhouse/items/x.png`). Anything that
 * escapes the pack root, or is not an allowed image extension, is rejected --
 * this handler is reachable from renderer content, so it is treated as an
 * untrusted boundary even though the catalog itself is ours.
 */
function resolvePackFile(root: string, requestPath: string): { path: string; mime: string } | null {
  let relative = decodeURIComponent(requestPath).replace(/^\/+/, "");
  relative = relative.replace(/^tinyhouse\//, "");
  if (!relative || relative.includes("\0")) return null;

  const normalized = normalize(relative);
  if (isAbsolute(normalized) || normalized.split(/[\\/]/).includes("..")) return null;

  const dot = normalized.lastIndexOf(".");
  const mime = dot === -1 ? undefined : ALLOWED_EXTENSIONS.get(normalized.slice(dot).toLowerCase());
  if (!mime) return null;

  const full = resolve(root, normalized);
  const rootWithSep = resolve(root) + sep;
  if (!full.startsWith(rootWithSep)) return null;

  return { path: full, mime };
}

/** Serve pack art to the renderer over its own privileged scheme. */
export function installHomeContentProtocol(): void {
  protocol.handle(HOME_ASSET_SCHEME, async (request) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
      const root = resolveHomeContentRoot();
      if (!root) return new Response(null, { status: 404 });

      const url = new URL(request.url);
      if (url.hostname !== "asset" || url.search || url.hash) return new Response(null, { status: 404 });

      const target = resolvePackFile(root, url.pathname);
      if (!target) return new Response(null, { status: 404 });

      const info = await stat(target.path);
      if (!info.isFile() || info.size <= 0 || info.size > MAX_ASSET_BYTES) return new Response(null, { status: 404 });

      return new Response(await readFile(target.path), {
        headers: {
          "Content-Type": target.mime,
          // Pack contents are immutable for the life of a build.
          "Cache-Control": "private, max-age=86400",
        },
      });
    } catch (error) {
      debug("home", "content asset request failed", { error: String(error) });
      return new Response(null, { status: 404 });
    }
  });
}

/** Renderer-facing URL for a catalog `src`. */
export function homeAssetUrl(src: string): string {
  return `${HOME_ASSET_SCHEME}://asset/${src.replace(/^\/+/, "")}`;
}


export interface HomePetInfo {
  readonly id: string;
  readonly spritesheetUrl: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly idleRow: number;
  readonly idleFrames: number;
  readonly idleFps: number;
  readonly scale: number;
}

/**
 * Render metadata for the Buddy that Home should show as the player.
 *
 * Home draws the same pet the desktop companion does, read from the same
 * installed asset directory, so the two surfaces cannot disagree about who the
 * Buddy is. Returns null when nothing usable is installed, in which case Home
 * falls back to its placeholder figure rather than showing an empty room.
 */
export async function readHomePet(): Promise<HomePetInfo | null> {
  try {
    const state = getAppStateSnapshot();
    const petId = state.preferences.defaultPetId;
    if (!petId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,128}$/.test(petId)) return null;
    const installed = state.pets.installed.find((pet) => pet.id === petId && !pet.broken);
    if (!installed) return null;

    const raw = await readFile(join(getInstalledPetDir(petId), "pet.json"), "utf8");
    const meta: unknown = JSON.parse(raw);
    if (!meta || typeof meta !== "object") return null;
    const record = meta as Record<string, any>;

    const frameWidth = Number(record.frame?.width);
    const frameHeight = Number(record.frame?.height);
    const columns = Number(record.sheet?.columns);
    if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) || !Number.isFinite(columns)) return null;
    if (frameWidth <= 0 || frameHeight <= 0 || columns <= 0) return null;

    const idle = record.animations?.idle ?? {};
    return {
      id: petId,
      spritesheetUrl: `openpets-installed://spritesheet/${encodeURIComponent(petId)}`,
      frameWidth,
      frameHeight,
      columns,
      idleRow: Number.isFinite(Number(idle.row)) ? Number(idle.row) : 0,
      idleFrames: Number.isFinite(Number(idle.frames)) && Number(idle.frames) > 0 ? Number(idle.frames) : 1,
      idleFps: Number.isFinite(Number(idle.fps)) && Number(idle.fps) > 0 ? Number(idle.fps) : 6,
      scale: Number.isFinite(Number(record.defaultScale)) ? Number(record.defaultScale) : 1,
    };
  } catch (error) {
    warn("home", "home pet metadata unreadable", { error: String(error) });
    return null;
  }
}
