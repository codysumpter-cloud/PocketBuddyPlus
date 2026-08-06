import assert from "node:assert/strict";

import {
  DEFAULT_CLIENT_ID,
  SPOTIFY_SCOPES,
  normalizeSpotifyPlayback,
  pollNowPlaying,
  register,
  sessionFor,
} from "./index.js";

const payload = {
  is_playing: true,
  progress_ms: 12_000,
  item: {
    id: "track-1",
    name: "Pixel Dreams",
    artists: [{ name: "Buddy Band" }],
    duration_ms: 180_000,
    album: { name: "Pocket Songs", images: [{ url: "https://example.invalid/cover.png" }] },
  },
};
const normalized = normalizeSpotifyPlayback(payload, 1234);
assert.deepEqual(normalized, {
  source: "spotify",
  id: "track-1",
  title: "Pixel Dreams",
  artist: "Buddy Band",
  album: "Pocket Songs",
  artworkUrl: "https://example.invalid/cover.png",
  durationMs: 180_000,
  positionMs: 12_000,
  isPlaying: true,
  updatedAt: 1234,
});
assert.equal(normalizeSpotifyPlayback({ is_playing: true, item: null }), null);

const commands = new Map();
const calls = { oauth: [], net: [], speech: [], reactions: [], status: [], signOut: [] };
const ctx = {
  auth: {
    async oauth(config) { calls.oauth.push(config); return { accessToken: "connected", expiresAt: Date.now() + 600_000 }; },
    async refresh(provider) { assert.equal(provider, "spotify"); return { accessToken: "refreshed", expiresAt: Date.now() + 600_000 }; },
    async signOut(provider) { calls.signOut.push(provider); },
  },
  commands: {
    async register(command, handler) { commands.set(command.id, handler); },
  },
  config: {
    async get() { return { announceTrackChanges: true, quietWhenPaused: true }; },
    onChange() {},
  },
  net: {
    async fetch(url, options) {
      calls.net.push({ url, method: options.method });
      if (url.endsWith("/v1/me/player")) return { status: 200, ok: true, headers: {}, json: payload, text: JSON.stringify(payload) };
      return { status: 204, ok: true, headers: {}, text: "" };
    },
  },
  pet: {
    async speak(text) { calls.speech.push(text); },
    async react(reaction) { calls.reactions.push(reaction); },
  },
  status: {
    async set(value) { calls.status.push(value); },
  },
  log: { debug() {}, info() {}, warn() {}, error() {} },
};

let definition;
register({ register(value) { definition = value; } });
assert.ok(definition);
await definition.start(ctx);
assert.ok(commands.has("music-connect-spotify"));
assert.ok(commands.has("music-now-playing"));
assert.ok(commands.has("music-play-pause"));
assert.ok(commands.has("music-next"));
assert.ok(commands.has("music-previous"));

await commands.get("music-connect-spotify")();
assert.deepEqual(calls.oauth[0], { provider: "spotify", clientId: DEFAULT_CLIENT_ID, scopes: SPOTIFY_SCOPES });
assert.ok(calls.status.some((entry) => entry.text === "♪ Buddy Band — Pixel Dreams"));
assert.ok(calls.speech.some((entry) => entry.includes("Buddy Band — Pixel Dreams")));

const session = sessionFor(ctx);
session.isPlaying = false;
await commands.get("music-play-pause")();
assert.ok(calls.net.some((entry) => entry.url.endsWith("/v1/me/player/play") && entry.method === "PUT"));
await commands.get("music-next")();
assert.ok(calls.net.some((entry) => entry.url.endsWith("/v1/me/player/next") && entry.method === "POST"));
await commands.get("music-previous")();
assert.ok(calls.net.some((entry) => entry.url.endsWith("/v1/me/player/previous") && entry.method === "POST"));

await pollNowPlaying(ctx, { forceAnnounce: true });
await commands.get("music-disconnect-spotify")();
assert.deepEqual(calls.signOut, ["spotify"]);
assert.equal(session.accessToken, null);

await definition.stop(ctx);
assert.equal(session.stopped, true);

console.log("openpets.music-buddy specs passed.");
