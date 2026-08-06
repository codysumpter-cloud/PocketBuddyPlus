// Music Buddy — Spotify and native Apple Music providers for Pocket Buddy+.
// Native Apple Music support belongs behind a separate, narrow host capability.

export const DEFAULT_CLIENT_ID = "1ac5489fdb9a46a8bf4c9179ca7a291f";
export const SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
];

const sessions = new WeakMap();

function sessionFor(ctx) {
  let session = sessions.get(ctx);
  if (!session) {
    session = {
      accessToken: null,
      expiresAt: 0,
      timer: null,
      stopped: false,
      lastTrackId: null,
      isPlaying: false,
      consecutiveErrors: 0,
      backoffUntil: 0,
      config: { announceTrackChanges: true, quietWhenPaused: true },
    };
    sessions.set(ctx, session);
  }
  return session;
}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseJson(response) {
  if (response?.json !== undefined) return response.json;
  try {
    return JSON.parse(response?.text ?? "");
  } catch {
    return null;
  }
}

export function normalizeSpotifyPlayback(payload, updatedAt = Date.now()) {
  if (!payload || typeof payload !== "object" || !payload.item || typeof payload.item !== "object") return null;
  const title = typeof payload.item.name === "string" ? payload.item.name.trim() : "";
  if (!title) return null;
  const artists = Array.isArray(payload.item.artists)
    ? payload.item.artists.map((artist) => typeof artist?.name === "string" ? artist.name.trim() : "").filter(Boolean)
    : [];
  const album = typeof payload.item.album?.name === "string" ? payload.item.album.name.trim() : undefined;
  const artworkUrl = Array.isArray(payload.item.album?.images)
    ? payload.item.album.images.find((image) => typeof image?.url === "string")?.url
    : undefined;
  const durationMs = Number.isFinite(payload.item.duration_ms) ? Math.max(0, payload.item.duration_ms) : undefined;
  const positionMs = Number.isFinite(payload.progress_ms) ? Math.max(0, payload.progress_ms) : undefined;
  return {
    source: "spotify",
    id: typeof payload.item.id === "string" ? payload.item.id : `${artists.join(", ")}:${title}`,
    title,
    artist: artists.join(", ") || undefined,
    album,
    artworkUrl,
    durationMs,
    positionMs,
    isPlaying: payload.is_playing === true,
    updatedAt,
  };
}

async function refreshAccessToken(ctx, force = false) {
  const session = sessionFor(ctx);
  const now = Date.now();
  if (!force && session.accessToken && session.expiresAt - now > 60_000) return session.accessToken;
  try {
    const tokens = await ctx.auth.refresh("spotify");
    session.accessToken = tokens.accessToken;
    session.expiresAt = tokens.expiresAt ?? now + 3_600_000;
    return session.accessToken;
  } catch {
    session.accessToken = null;
    session.expiresAt = 0;
    return null;
  }
}

async function spotifyRequest(ctx, path, method = "GET") {
  const session = sessionFor(ctx);
  if (Date.now() < session.backoffUntil) return { status: 429, ok: false, headers: {}, text: "" };
  let token = await refreshAccessToken(ctx);
  if (!token) throw new Error("NOT_CONNECTED");
  const request = async () => ctx.net.fetch(`https://api.spotify.com${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    timeoutMs: 8_000,
  });
  let response = await request();
  if (response.status === 401) {
    token = await refreshAccessToken(ctx, true);
    if (!token) throw new Error("NOT_CONNECTED");
    response = await request();
  }
  if (response.status === 429) {
    const retryAfter = Number.parseInt(response.headers?.["retry-after"] ?? "5", 10);
    session.backoffUntil = Date.now() + Math.min(Math.max(Number.isFinite(retryAfter) ? retryAfter : 5, 1), 300) * 1_000;
  }
  return response;
}

/**
 * Native Apple Music, through the read-only `system:nowPlaying` capability.
 * Returns a track only when something is actually loaded; every other state
 * (idle, player closed, permission refused, non-macOS) yields null so the
 * caller can fall through to Spotify.
 */
async function loadNativeNowPlaying(ctx) {
  if (typeof ctx.system?.nowPlaying !== "function") return null;
  let result;
  try {
    result = await ctx.system.nowPlaying();
  } catch (error) {
    ctx.log?.debug?.("native now-playing unavailable", safeMessage(error));
    return null;
  }
  if (!result || (result.status !== "playing" && result.status !== "paused")) {
    // Surface a refused permission once — it is actionable, unlike "idle".
    if (result?.status === "unavailable" && result.reason && !nativeWarningShown) {
      nativeWarningShown = true;
      ctx.log?.warn?.("Apple Music", result.reason);
    }
    return null;
  }
  const track = result.track;
  return {
    source: "apple-music",
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    positionMs: track.positionMs,
    isPlaying: track.isPlaying,
    updatedAt: track.updatedAt,
  };
}

let nativeWarningShown = false;

async function loadNowPlaying(ctx) {
  // Prefer whatever the user is actually listening to locally. Apple Music has
  // no now-playing Web API, so this is the only way to see it, and a running
  // local player is a stronger signal of intent than a stale Spotify session.
  const native = await loadNativeNowPlaying(ctx);
  if (native) return native;

  const response = await spotifyRequest(ctx, "/v1/me/player");
  if (response.status === 204) return null;
  if (!response.ok) {
    const payload = parseJson(response);
    throw new Error(payload?.error?.message || `Spotify request failed with HTTP ${response.status}`);
  }
  return normalizeSpotifyPlayback(parseJson(response));
}

function formatTrack(track) {
  return track.artist ? `${track.artist} — ${track.title}` : track.title;
}

async function applyTrack(ctx, track, { forceAnnounce = false } = {}) {
  const session = sessionFor(ctx);
  if (!track) {
    session.isPlaying = false;
    await ctx.status.set({ text: "Music Buddy ready" });
    return null;
  }
  const changed = track.id !== session.lastTrackId;
  session.lastTrackId = track.id;
  session.isPlaying = track.isPlaying;
  session.consecutiveErrors = 0;
  await ctx.status.set({ text: track.isPlaying ? `♪ ${formatTrack(track)}` : `♪ Paused — ${formatTrack(track)}` });
  if ((changed || forceAnnounce) && session.config.announceTrackChanges && (track.isPlaying || !session.config.quietWhenPaused)) {
    await ctx.pet.speak(`Now playing: ${formatTrack(track)}`);
    await ctx.pet.react(track.isPlaying ? "celebrating" : "idle");
  }
  return track;
}

export async function pollNowPlaying(ctx, options = {}) {
  const session = sessionFor(ctx);
  if (Date.now() < session.backoffUntil) return null;
  try {
    return await applyTrack(ctx, await loadNowPlaying(ctx), options);
  } catch (error) {
    if (safeMessage(error) === "NOT_CONNECTED") {
      await ctx.status.set({ text: "Music Buddy needs Spotify connection" });
      return null;
    }
    session.consecutiveErrors += 1;
    ctx.log.warn("Music Buddy polling failed", { error: safeMessage(error), consecutiveErrors: session.consecutiveErrors });
    if (session.consecutiveErrors === 1) await ctx.status.set({ text: "Music Buddy temporarily unavailable", tone: "warning" });
    return null;
  }
}

async function playbackCommand(ctx, path, method) {
  const response = await spotifyRequest(ctx, path, method);
  if (response.status === 403) {
    await ctx.pet.speak("Spotify Premium is required for playback controls.");
    await ctx.pet.react("error");
    return false;
  }
  if (response.status === 404) {
    await ctx.pet.speak("Open Spotify and start playback on a device first.");
    await ctx.pet.react("thinking");
    return false;
  }
  if (!response.ok) {
    ctx.log.warn("Music Buddy playback command failed", { path, status: response.status });
    return false;
  }
  return true;
}

function clearTimer(session) {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
}

function schedulePoll(ctx, delayMs) {
  const session = sessionFor(ctx);
  clearTimer(session);
  if (session.stopped) return;
  session.timer = setTimeout(async () => {
    session.timer = null;
    await pollNowPlaying(ctx);
    schedulePoll(ctx, session.isPlaying ? 10_000 : 30_000);
  }, delayMs);
  session.timer.unref?.();
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      const session = sessionFor(ctx);
      session.stopped = false;
      const config = await ctx.config.get();
      session.config = {
        announceTrackChanges: config?.announceTrackChanges !== false,
        quietWhenPaused: config?.quietWhenPaused !== false,
      };
      ctx.config.onChange((next) => {
        session.config = {
          announceTrackChanges: next?.announceTrackChanges !== false,
          quietWhenPaused: next?.quietWhenPaused !== false,
        };
      });

      await ctx.commands.register({ id: "music-connect-spotify", title: "Connect Spotify", description: "Connect Music Buddy to Spotify." }, async () => {
        try {
          const tokens = await ctx.auth.oauth({ provider: "spotify", clientId: DEFAULT_CLIENT_ID, scopes: SPOTIFY_SCOPES });
          session.accessToken = tokens.accessToken;
          session.expiresAt = tokens.expiresAt ?? Date.now() + 3_600_000;
          session.backoffUntil = 0;
          session.consecutiveErrors = 0;
          await ctx.pet.react("celebrating");
          await pollNowPlaying(ctx, { forceAnnounce: true });
        } catch (error) {
          ctx.log.error("Spotify connection failed", { error: safeMessage(error) });
          await ctx.pet.speak("Spotify connection failed. Please try again.");
          await ctx.pet.react("error");
        }
      });

      await ctx.commands.register({ id: "music-disconnect-spotify", title: "Disconnect Spotify", description: "Remove Music Buddy's saved Spotify session." }, async () => {
        await ctx.auth.signOut("spotify");
        session.accessToken = null;
        session.expiresAt = 0;
        session.lastTrackId = null;
        session.isPlaying = false;
        session.backoffUntil = 0;
        await ctx.status.set({ text: "Music Buddy ready" });
        await ctx.pet.react("idle");
      });

      await ctx.commands.register({ id: "music-now-playing", title: "Show current song", description: "Show the current Spotify track." }, async () => {
        const token = await refreshAccessToken(ctx);
        if (!token) {
          await ctx.pet.speak("Connect Spotify to use Music Buddy.");
          await ctx.pet.react("thinking");
          return;
        }
        await pollNowPlaying(ctx, { forceAnnounce: true });
      });

      await ctx.commands.register({ id: "music-play-pause", title: "Play / Pause", description: "Toggle Spotify playback." }, async () => {
        const path = session.isPlaying ? "/v1/me/player/pause" : "/v1/me/player/play";
        if (await playbackCommand(ctx, path, "PUT")) {
          session.isPlaying = !session.isPlaying;
          setTimeout(() => void pollNowPlaying(ctx), 750).unref?.();
        }
      });
      await ctx.commands.register({ id: "music-next", title: "Next track", description: "Skip to the next Spotify track." }, async () => {
        if (await playbackCommand(ctx, "/v1/me/player/next", "POST")) setTimeout(() => void pollNowPlaying(ctx), 750).unref?.();
      });
      await ctx.commands.register({ id: "music-previous", title: "Previous track", description: "Return to the previous Spotify track." }, async () => {
        if (await playbackCommand(ctx, "/v1/me/player/previous", "POST")) setTimeout(() => void pollNowPlaying(ctx), 750).unref?.();
      });

      await ctx.status.set({ text: "Music Buddy ready" });
      schedulePoll(ctx, 1_000);
    },

    async stop(ctx) {
      const session = sessionFor(ctx);
      session.stopped = true;
      clearTimer(session);
    },
  });
}

export { sessionFor };
