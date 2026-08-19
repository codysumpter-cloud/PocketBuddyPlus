import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Encrypted per-plugin credential store (§13.3): values are encrypted with
 * Electron `safeStorage` and persisted as base64 ciphertext, scoped per plugin
 * id. Electron is loaded lazily so merely starting Pocket Buddy+ does not touch
 * the OS credential store; keychain/DPAPI access happens only when a secret is
 * actually read or written.
 *
 * Do not enable Chromium's mock keychain in production. It is a test facility,
 * not a secure replacement for the real OS credential backend.
 */

type SecretsFile = Record<string, Record<string, string>>;

async function loadSafeStorage() {
  const { safeStorage } = await import("electron");
  return safeStorage;
}

export class PluginSecretsStore {
  readonly #path: string;
  #data: SecretsFile;

  constructor(userDataPath: string) {
    this.#path = join(userDataPath, "plugin-secrets.json");
    this.#data = this.#read();
  }

  async get(pluginId: string, key: string): Promise<string | undefined> {
    const encrypted = this.#data[pluginId]?.[key];
    if (encrypted === undefined) return undefined;
    try {
      const safeStorage = await loadSafeStorage();
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return undefined;
    }
  }

  async set(pluginId: string, key: string, value: string): Promise<void> {
    const safeStorage = await loadSafeStorage();
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secret storage encryption is unavailable on this system.");
    const encrypted = safeStorage.encryptString(value).toString("base64");
    this.#data = { ...this.#data, [pluginId]: { ...(this.#data[pluginId] ?? {}), [key]: encrypted } };
    this.#write();
  }

  async delete(pluginId: string, key: string): Promise<void> {
    const plugin = { ...(this.#data[pluginId] ?? {}) };
    delete plugin[key];
    this.#data = { ...this.#data, [pluginId]: plugin };
    this.#write();
  }

  async has(pluginId: string, key: string): Promise<boolean> {
    return this.#data[pluginId]?.[key] !== undefined;
  }

  /** Remove every secret a plugin owns (uninstall). */
  async clearPlugin(pluginId: string): Promise<void> {
    const next = { ...this.#data };
    delete next[pluginId];
    this.#data = next;
    this.#write();
  }

  #read(): SecretsFile {
    try {
      if (!existsSync(this.#path)) return {};
      const parsed = JSON.parse(readFileSync(this.#path, "utf8")) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
      const out: SecretsFile = {};
      for (const [pluginId, secrets] of Object.entries(parsed)) {
        if (typeof secrets !== "object" || secrets === null) continue;
        out[pluginId] = {};
        for (const [key, value] of Object.entries(secrets)) if (typeof value === "string") out[pluginId][key] = value;
      }
      return out;
    } catch {
      return {};
    }
  }

  #write(): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    const tmp = `${this.#path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.#data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.#path);
  }
}
