import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Read-only "what is playing right now" from the native macOS Music app.
 *
 * This is deliberately NOT a general shell or AppleScript capability. It runs
 * one fixed script, returns one normalized shape, and can neither control
 * playback nor read the user's library.
 *
 * The script is guarded by `if application "Music" is running`. Without that
 * guard, addressing the app by name LAUNCHES it — so merely polling would open
 * Music on a machine where the user never asked for it.
 */
export interface NativeNowPlayingTrack {
  readonly source: "apple-music";
  readonly id: string;
  readonly title: string;
  readonly artist?: string;
  readonly album?: string;
  readonly durationMs?: number;
  readonly positionMs?: number;
  readonly isPlaying: boolean;
  readonly updatedAt: number;
}

/** Distinguishes "nothing playing" from "we could not ask". */
export type NativeNowPlayingResult =
  | { readonly status: "playing" | "paused"; readonly track: NativeNowPlayingTrack }
  | { readonly status: "idle" | "not-running" | "unsupported" }
  | { readonly status: "unavailable"; readonly reason: string };

const FIELD_SEPARATOR = "";       // unit separator: cannot occur in tag text
const SCRIPT = `
if application "Music" is running then
  tell application "Music"
    if player state is stopped then
      return "IDLE"
    end if
    set t to current track
    return "OK" & "${FIELD_SEPARATOR}" & (database ID of t as text) ¬
      & "${FIELD_SEPARATOR}" & (name of t) ¬
      & "${FIELD_SEPARATOR}" & (artist of t) ¬
      & "${FIELD_SEPARATOR}" & (album of t) ¬
      & "${FIELD_SEPARATOR}" & (duration of t as text) ¬
      & "${FIELD_SEPARATOR}" & (player position as text) ¬
      & "${FIELD_SEPARATOR}" & (player state as text)
  end tell
else
  return "NOT_RUNNING"
end if
`;

const timeoutMs = 4_000;
// osascript is comparatively expensive and the first call may block on a TCC
// prompt, so a short cache keeps a 2s plugin poll from spawning 30 processes a
// minute. Shorter than any sensible poll interval, so it never hides a change.
const cacheTtlMs = 900;
let cached: { readonly at: number; readonly result: NativeNowPlayingResult } | null = null;

function seconds(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : undefined;
}

export function clearNativeNowPlayingCache(): void {
  cached = null;
}

export async function readNativeNowPlaying(): Promise<NativeNowPlayingResult> {
  if (process.platform !== "darwin") return { status: "unsupported" };
  if (cached && Date.now() - cached.at < cacheTtlMs) return cached.result;

  let result: NativeNowPlayingResult;
  try {
    const { stdout } = await run("osascript", ["-e", SCRIPT], { timeout: timeoutMs });
    const raw = stdout.trim();
    if (raw === "NOT_RUNNING") result = { status: "not-running" };
    else if (raw === "IDLE") result = { status: "idle" };
    else {
      const [tag, id, title, artist, album, duration, position, state] = raw.split(FIELD_SEPARATOR);
      if (tag !== "OK" || !title) {
        result = { status: "unavailable", reason: "unrecognized Music response" };
      } else {
        const isPlaying = state === "playing";
        result = {
          status: isPlaying ? "playing" : "paused",
          track: {
            source: "apple-music",
            id: id || title,
            title,
            ...(artist ? { artist } : {}),
            ...(album ? { album } : {}),
            ...(seconds(duration) === undefined ? {} : { durationMs: seconds(duration)! }),
            ...(seconds(position) === undefined ? {} : { positionMs: seconds(position)! }),
            isPlaying,
            updatedAt: Date.now(),
          },
        };
      }
    }
  } catch (error) {
    // execFile rejects with the whole command echoed in .message, which is
    // useless to a user, so prefer stderr — that carries the AppleScript error.
    const err = error as { stderr?: string; message?: string; killed?: boolean; code?: string };
    const detail = (err.stderr ?? "").trim() || err.message || String(error);
    const timedOut = err.killed === true || err.code === "ETIMEDOUT";
    result = {
      status: "unavailable",
      reason:
        // -1743 is a refusal, -1712 is the Apple Event timing out. The first
        // call blocks on the macOS Automation prompt, so an unanswered prompt
        // surfaces here as a timeout rather than a denial.
        /-1743|not authori[sz]ed|not allowed/i.test(detail)
          ? "Automation permission for Music was denied. Grant it in System Settings › Privacy & Security › Automation."
          : timedOut || /-1712|timed out/i.test(detail)
            ? "Music did not respond in time. If macOS is asking permission to control Music, approve it and try again."
            : detail.slice(0, 200),
    };
  }

  cached = { at: Date.now(), result };
  return result;
}
