// Home Builder — host side.
//
// The panel draws and plays the room; this side owns the save. Panel storage is
// wiped when the panel closes (the host calls clearStorageData on the panel
// session), so the room has to live in plugin storage or it would not survive
// closing the window.

/** The two keys the scene reads and writes. Anything else is refused. */
export const HOME_STATE_KEYS = [
  "pocket-buddy-plus:phaser-home:v2",
  "pocket-buddy-plus:phaser-home:v1",
] as const;

/** A save big enough to be a bug rather than a room. */
export const MAX_HOME_STATE_CHARS = 512 * 1024;

export function isHomeStateKey(value: unknown): boolean {
  return typeof value === "string" && (HOME_STATE_KEYS as readonly string[]).includes(value);
}

interface PanelLike {
  postMessage(message: unknown): Promise<void> | void;
  onMessage(handler: (message: unknown) => void): void;
}

interface StorageLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

/**
 * Wire one panel to plugin storage. Exported so the tests can drive it without
 * an Electron window.
 */
export function createHomeStateHandler(storage: StorageLike, panel: PanelLike): (message: unknown) => Promise<void> {
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
      return;
    }

    if (type === "home-state-write") {
      // The panel is sandboxed but still untrusted input to this side, so the
      // key is checked against the known set and the size is bounded.
      if (!isHomeStateKey(key) || typeof value !== "string" || value.length > MAX_HOME_STATE_CHARS) return;
      await storage.set(key as string, value);
    }
  };
}

export function register(OpenPetsPlugin: {
  register(plugin: { start(ctx: unknown): Promise<void> | void }): void;
}): void {
  OpenPetsPlugin.register({
    async start(ctx: unknown) {
      const context = ctx as {
        commands: { register(descriptor: unknown, run: () => unknown): Promise<void> };
        storage: StorageLike;
        ui: { panel(options: unknown): Promise<PanelLike> };
      };
      await context.commands.register(
        {
          id: "open-home",
          title: "$t:command.open.title",
          description: "$t:command.open.description",
          icon: "home",
        },
        async () => {
          const panel = await context.ui.panel({ panel: "home", title: "Buddy Home", width: 1180, height: 860 });
          panel.onMessage(createHomeStateHandler(context.storage, panel));
          return panel;
        },
      );
    },
  });
}
