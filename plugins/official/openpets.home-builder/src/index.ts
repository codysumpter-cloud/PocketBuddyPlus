// Home Builder — host side.
//
// Two jobs, both of which exist because the panel is sandboxed:
//
//  1. The save. Panel storage is wiped when the panel closes (the host calls
//     clearStorageData on the panel session), so the room lives here.
//
//  2. The art. Home ships no sprites. The TinyHouse pack is paid art the user
//     owns, so nothing from it is committed or redistributed: the user points
//     the file picker at their own copy, this side reads only the handful of
//     files Home maps, and hands the bytes to the panel as data URLs. The panel
//     cannot reach the filesystem itself - its CSP allows `data:` images and
//     nothing else - so the transfer runs over the message channel.

import { PACK_SPRITES, packCoverage, packSpriteKeyForFile } from "@open-pets/buddy-domain";

/** The two keys the scene reads and writes. Anything else is refused. */
export const HOME_STATE_KEYS = [
  "pocket-buddy-plus:phaser-home:v2",
  "pocket-buddy-plus:phaser-home:v1",
] as const;

/** Where the decoded pack sprites are cached so the user picks their pack once. */
export const PACK_CACHE_KEY = "pocket-buddy-plus:home:pack-sprites:v1";

/** A save big enough to be a bug rather than a room. */
export const MAX_HOME_STATE_CHARS = 512 * 1024;

/** Per sprite. Pack tiles are a few KB; anything near this is not a tile. */
export const MAX_SPRITE_BYTES = 512 * 1024;

/**
 * Panel messages are capped at 64 KiB by the host, so sprites are streamed in
 * pieces. Kept well under the cap to leave room for the envelope.
 */
export const CHUNK_CHARS = 32 * 1024;

interface PanelLike {
  postMessage(message: unknown): Promise<void> | void;
  onMessage(handler: (message: unknown) => void): void;
}

interface StorageLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

interface PickedFile {
  readonly name: string;
  readonly sizeBytes: number;
  readBytes(): Promise<Uint8Array>;
}

interface FilesLike {
  pick(opts?: { accept?: string[]; multiple?: boolean }): Promise<PickedFile[]>;
}

export function isHomeStateKey(value: unknown): boolean {
  return typeof value === "string" && (HOME_STATE_KEYS as readonly string[]).includes(value);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
  return btoa(binary);
}

/** Split a data URL into message-sized pieces. */
export function chunkDataUrl(dataUrl: string, chunkChars = CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < dataUrl.length; index += chunkChars) chunks.push(dataUrl.slice(index, index + chunkChars));
  return chunks;
}

/**
 * Read the pack files Home can use out of whatever the user selected.
 *
 * The user is expected to select the whole pack - 1,097 files - so this filters
 * by name first and only reads the matches. Reading everything would pull
 * hundreds of megabytes through the plugin for no reason.
 */
export async function collectPackSprites(files: readonly PickedFile[]): Promise<Record<string, string>> {
  const sprites: Record<string, string> = {};
  for (const file of files) {
    const key = packSpriteKeyForFile(file.name);
    if (!key || sprites[key] || file.sizeBytes > MAX_SPRITE_BYTES) continue;
    const bytes = await file.readBytes();
    if (bytes.byteLength > MAX_SPRITE_BYTES) continue;
    sprites[key] = `data:image/png;base64,${toBase64(bytes)}`;
  }
  return sprites;
}

/** Stream one sprite set to the panel within the message size cap. */
async function sendSprites(panel: PanelLike, sprites: Record<string, string>): Promise<void> {
  await panel.postMessage({ type: "home-pack-begin", keys: Object.keys(sprites), total: Object.keys(PACK_SPRITES).length });
  for (const [key, dataUrl] of Object.entries(sprites)) {
    const chunks = chunkDataUrl(dataUrl);
    for (let index = 0; index < chunks.length; index += 1) {
      await panel.postMessage({ type: "home-pack-chunk", key, index, count: chunks.length, data: chunks[index] });
    }
  }
  await panel.postMessage({ type: "home-pack-end" });
}

export function createHomeStateHandler(storage: StorageLike, panel: PanelLike, files?: FilesLike): (message: unknown) => Promise<void> {
  return async function handle(message: unknown): Promise<void> {
    if (typeof message !== "object" || message === null) return;
    const { type, key, value } = message as { type?: unknown; key?: unknown; value?: unknown };

    if (type === "home-state-request") {
      const values: Record<string, string> = {};
      for (const stateKey of HOME_STATE_KEYS) {
        const stored = await storage.get(stateKey);
        if (typeof stored === "string") values[stateKey] = stored;
      }
      await panel.postMessage({ type: "home-state", values });

      // Replay a previously loaded pack so the room is not bare on reopen.
      const cached = await storage.get(PACK_CACHE_KEY);
      if (typeof cached === "string") {
        try { await sendSprites(panel, JSON.parse(cached) as Record<string, string>); } catch { /* a corrupt cache just means no art */ }
      }
      return;
    }

    if (type === "home-state-write") {
      // The panel is sandboxed but still untrusted input to this side, so the
      // key is checked against the known set and the size is bounded.
      if (!isHomeStateKey(key) || typeof value !== "string" || value.length > MAX_HOME_STATE_CHARS) return;
      await storage.set(key as string, value);
      return;
    }

    if (type === "home-pack-pick") {
      if (!files) { await panel.postMessage({ type: "home-pack-error", error: "File access is unavailable." }); return; }
      try {
        const picked = await files.pick({ accept: [".png"], multiple: true });
        if (!picked.length) { await panel.postMessage({ type: "home-pack-cancelled" }); return; }

        const coverage = packCoverage(picked.map((file) => file.name));
        if (coverage.found === 0) {
          await panel.postMessage({ type: "home-pack-error", error: "No TinyHouse sprites Home uses were in that selection. Open the pack folder and select its images." });
          return;
        }
        const sprites = await collectPackSprites(picked);
        await storage.set(PACK_CACHE_KEY, JSON.stringify(sprites));
        await sendSprites(panel, sprites);
      } catch (error) {
        await panel.postMessage({ type: "home-pack-error", error: String((error as Error)?.message ?? error).slice(0, 200) });
      }
    }
  };
}

type BuddyProfileLike = {
  readonly displayName?: string;
  readonly mood?: string;
  readonly activity?: string;
  readonly dominantNeed?: string;
  readonly affection?: number;
  readonly needs?: Readonly<Record<string, number>>;
};

type HomePetInfo = { readonly id: string; readonly name: string; readonly buddyProfile?: BuddyProfileLike };
type HomePetAppearance = { readonly frameDataUrl: string; readonly displayName: string; readonly width: number; readonly height: number; readonly animationId: string; readonly direction: string; readonly source: string };
type PresentationMode = "panel" | "home" | "buddy";

type HomePluginContext = {
  commands: { register(descriptor: unknown, run: () => unknown): Promise<void> };
  storage: StorageLike;
  files?: FilesLike;
  ui: { panel(options: unknown): Promise<PanelLike & { show(): Promise<void>; close(): Promise<void> }> };
  pet: {
    getAppearance(): Promise<HomePetAppearance>;
    hide(): Promise<void>;
    show(): Promise<void>;
    react(reaction: string, options?: { showMessage?: boolean }): Promise<void>;
  };
  pets: {
    list(): Promise<HomePetInfo[]>;
    onChange(handler: (pets: HomePetInfo[]) => void): () => void;
  };
};

let activePanel: (PanelLike & { show(): Promise<void>; close(): Promise<void> }) | null = null;
let activePresentation: Exclude<PresentationMode, "buddy"> = "panel";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function sendBuddyPresence(context: HomePluginContext, panel: PanelLike): Promise<void> {
  const pets = await context.pets.list();
  const pet = pets.find((candidate) => candidate.id === "default") ?? pets[0];
  const profile = pet?.buddyProfile;
  await panel.postMessage({
    type: "home-buddy-presence",
    buddy: {
      id: "default",
      name: profile?.displayName ?? pet?.name ?? "Buddy",
      profile: profile ?? null,
    },
  });

  try {
    const appearance = await context.pet.getAppearance();
    const { frameDataUrl, ...metadata } = appearance;
    const chunks = chunkDataUrl(frameDataUrl);
    await panel.postMessage({ type: "home-buddy-frame-begin", count: chunks.length, metadata });
    for (let index = 0; index < chunks.length; index += 1) {
      await panel.postMessage({ type: "home-buddy-frame-chunk", index, count: chunks.length, data: chunks[index] });
    }
    await panel.postMessage({ type: "home-buddy-frame-end" });
  } catch (error) {
    await panel.postMessage({ type: "home-buddy-frame-unavailable", error: String((error as Error)?.message ?? error).slice(0, 160) });
  }
}

function reactionForHomeAction(action: string): string {
  if (action === "play") return "celebrating";
  if (action === "feed") return "success";
  if (action === "rest" || action === "sit") return "waiting";
  return "waving";
}

async function openHome(context: HomePluginContext, presentation: Exclude<PresentationMode, "buddy">): Promise<void> {
  activePresentation = presentation;
  if (activePanel) {
    await context.pet.hide();
    await activePanel.postMessage({ type: "home-presentation", mode: presentation });
    await sendBuddyPresence(context, activePanel);
    await activePanel.show();
    return;
  }

  const panel = await context.ui.panel({ panel: "home", title: "Buddy Home", width: 1180, height: 860 });
  activePanel = panel;
  const baseHandler = createHomeStateHandler(context.storage, panel, context.files);
  panel.onMessage(async (message: unknown) => {
    await baseHandler(message);
    if (!isRecord(message)) return;
    if (message.type === "home-state-request") {
      await panel.postMessage({ type: "home-presentation", mode: activePresentation });
      await sendBuddyPresence(context, panel);
      return;
    }
    if (message.type === "home-presentation") {
      const mode = message.mode;
      if (mode === "buddy") {
        activePanel = null;
        await context.pet.show();
        await panel.close();
        return;
      }
      if (mode === "panel" || mode === "home") {
        activePresentation = mode;
        await context.pet.hide();
        await panel.postMessage({ type: "home-presentation", mode });
      }
      return;
    }
    if (message.type === "home-panel-closing") {
      if (activePanel === panel) activePanel = null;
      await context.pet.show();
      return;
    }
    if (message.type === "home-buddy-react" && typeof message.action === "string") {
      await context.pet.react(reactionForHomeAction(message.action), { showMessage: false });
    }
  });
  await context.pet.hide();
}

async function buddyOnly(context: HomePluginContext): Promise<void> {
  const panel = activePanel;
  activePanel = null;
  await context.pet.show();
  if (panel) await panel.close();
}

export function register(OpenPetsPlugin: {
  register(plugin: { start(ctx: unknown): Promise<void> | void }): void;
}): void {
  OpenPetsPlugin.register({
    async start(ctx: unknown) {
      const context = ctx as HomePluginContext;
      await context.commands.register(
        { id: "open-home", title: "$t:command.open.title", description: "$t:command.open.description", icon: "home", featured: true },
        () => openHome(context, "panel"),
      );
      await context.commands.register(
        { id: "show-home", title: "Show Buddy in Home", description: "Open the playable Home scene without the builder chrome.", icon: "home" },
        () => openHome(context, "home"),
      );
      await context.commands.register(
        { id: "buddy-only", title: "Buddy Only", description: "Return Buddy to the normal desktop pet view.", icon: "home" },
        () => buddyOnly(context),
      );

      context.pets.onChange(() => {
        const panel = activePanel;
        if (panel) void sendBuddyPresence(context, panel).catch(() => undefined);
      });
    },
  });
}
