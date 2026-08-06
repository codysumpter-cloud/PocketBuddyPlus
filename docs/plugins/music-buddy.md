# Music Buddy

Music Buddy is Pocket Buddy+'s provider-based music companion. Version 1 ships the Spotify provider for now-playing status and basic playback controls.

## Spotify provider

The plugin uses the host-mediated OAuth broker with PKCE. OAuth endpoints, redirect behavior, and allowed scopes remain controlled by the trusted Electron host; the plugin supplies only the Spotify provider name, public client ID, and allowlisted scopes.

Supported commands:

- Connect Spotify
- Disconnect Spotify
- Show current song
- Play / Pause
- Next track
- Previous track

The plugin polls while running, slows down when playback is paused, backs off after rate limiting, and clears its timer when stopped. Spotify Premium may be required for playback-control endpoints, while now-playing reads use the account's available playback state.

## Normalized now-playing model

Provider payloads are normalized before use:

```ts
interface MusicBuddyTrack {
  source: "spotify" | string;
  id: string;
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  durationMs?: number;
  positionMs?: number;
  isPlaying: boolean;
  updatedAt: number;
}
```

## Native Apple Music boundary

Native Apple Music support is intentionally not implemented through a general shell or arbitrary AppleScript permission. It should be added as a narrow, read-only host capability such as `system:nowPlaying`, returning the same normalized model. The plugin can then prefer an actively playing native provider and fall back to Spotify.
