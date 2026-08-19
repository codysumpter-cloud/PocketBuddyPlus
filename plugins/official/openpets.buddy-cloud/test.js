import assert from "node:assert/strict";

import {
  AUTO_BACKUP_INTERVAL_MS,
  PROJECT_URL,
  backupProfile,
  jwtSubject,
  recall,
  register,
  signIn,
  tokenExpiresWithin,
} from "./index.js";

const ownerId = "11111111-2222-4333-8444-555555555555";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: ownerId, email: "buddy@example.com", exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
assert.equal(jwtSubject(accessToken), ownerId);
assert.equal(tokenExpiresWithin(accessToken, 90), false);

const calls = { net: [], toasts: [], status: [], schedules: [], receipts: 0, stateWrites: 0 };
const commands = new Map();
const secrets = new Map();
const storage = new Map();
const profile = {
  schemaVersion: 1,
  id: "primary-buddy",
  displayName: "Buddy",
  createdAtMs: 1,
  updatedAtMs: 2,
  ageMs: 1,
  affection: 0.5,
  needs: { hunger: 0.1, energy: 0.2, social: 0.2, play: 0.1, comfort: 0.1, cleanliness: 0.1 },
  mood: "content",
  activity: "idle",
  dominantNeed: "energy",
  wardrobe: "classic",
};

const ctx = {
  commands: { async register(command, handler) { commands.set(command.id, { command, handler }); } },
  schedule: { async every(id, intervalMs, handler) { calls.schedules.push({ id, intervalMs, handler }); } },
  secrets: {
    async get(key) { return secrets.get(key); },
    async set(key, value) { secrets.set(key, value); },
    async delete(key) { secrets.delete(key); },
  },
  storage: {
    async get(key) { return storage.get(key); },
    async set(key, value) { storage.set(key, value); },
    async delete(key) { storage.delete(key); },
  },
  pets: { async list() { return [{ id: "default", name: "Buddy", kind: "default", visible: true, buddyProfile: profile }]; } },
  status: { async set(value) { calls.status.push(value); } },
  ui: {
    async toast(value) { calls.toasts.push(value); },
    async panel() { return { onMessage() {}, async postMessage() {}, async close() {}, async show() {}, async hide() {} }; },
  },
  log: { debug() {}, info() {}, warn() {}, error() {} },
  net: {
    async fetch(url, options = {}) {
      calls.net.push({ url, options });
      if (url.includes("/auth/v1/token?grant_type=password")) {
        return { status: 200, ok: true, headers: {}, text: "", json: { access_token: accessToken, refresh_token: "refresh-1", expires_in: 3600, user: { email: "buddy@example.com" } } };
      }
      if (url.includes("/rest/v1/buddy_state?on_conflict=")) {
        calls.stateWrites += 1;
        return { status: 201, ok: true, headers: {}, text: "" };
      }
      if (url.endsWith("/rest/v1/buddy_receipts")) {
        calls.receipts += 1;
        return { status: 201, ok: true, headers: {}, text: "" };
      }
      if (url.endsWith("/rest/v1/rpc/search_buddy_memories")) {
        return { status: 200, ok: true, headers: {}, text: "", json: [{ content: "Buddy likes apples", rank: 0.9 }] };
      }
      if (url.includes("/rest/v1/buddy_state?select=")) {
        return { status: 200, ok: true, headers: {}, text: "", json: [{ state: { profile }, version: 3, updated_at: new Date().toISOString() }] };
      }
      if (url.includes("/rest/v1/buddy_missions?")) {
        return { status: 200, ok: true, headers: {}, text: "", json: [] };
      }
      throw new Error(`unexpected network call ${url}`);
    },
  },
};

const session = await signIn(ctx, "buddy@example.com", "secret12");
assert.equal(session.email, "buddy@example.com");
assert.equal(await secrets.get("buddy-cloud-refresh-token"), "refresh-1");

const backup = await backupProfile(ctx, { quiet: true });
assert.equal(backup.ok, true);
assert.equal(calls.stateWrites, 1);
assert.equal(calls.receipts, 1);
assert.ok(storage.get("lastBackupAt"));

const matches = await recall(ctx, "apples");
assert.equal(matches.length, 1);
assert.match(calls.toasts.at(-1).text, /Buddy likes apples/);

let definition;
register({ register(value) { definition = value; } });
assert.ok(definition);
await definition.start(ctx);
for (const id of ["buddy-cloud-connect", "buddy-cloud-backup", "buddy-cloud-status", "buddy-cloud-remember", "buddy-cloud-recall", "buddy-cloud-missions"]) {
  assert.ok(commands.has(id), `missing command ${id}`);
}
assert.equal(calls.schedules.at(-1).intervalMs, AUTO_BACKUP_INTERVAL_MS);
assert.ok(calls.net.every((entry) => entry.url.startsWith(PROJECT_URL)));

console.log("openpets.buddy-cloud specs passed.");
