# Monitor selection and window containment

Pocket Buddy+ treats the user's selected monitor as a hard desktop boundary.
This policy applies to the shared Electron runtime used by Windows packaging, so
installed and portable/unpacked builds do not get separate positioning logic.

## User contract

Settings exposes a **Monitor** selector. The default is **Primary monitor**.
Users may instead pin Pocket Buddy+ to one currently connected monitor.

Every user-facing Pocket Buddy+ window must remain completely inside the
selected monitor's Electron `workArea`:

- the pet window and its bubbles;
- the Control Center / Settings window;
- plugin command forms and other visible BrowserWindows;
- session/terminal-confined pets;
- windows restored after sleep or display topology changes.

`workArea` is authoritative rather than full display `bounds`. On Windows this
excludes the taskbar, including taskbars placed on the top, left, right, or
bottom edge. On macOS it respects the usable area reserved by the dock/menu bar.

A window that is larger than the selected work area is reduced to fit. The
window guard also temporarily lowers that window's effective minimum size when
necessary, so a small monitor cannot force part of the Control Center beneath a
taskbar or off-screen.

## Persistence and disconnected monitors

The selection is stored under the Pocket Buddy+ Electron user-data directory in
`monitor-selection.json`.

Explicit monitor selections use the existing stable geometry key:

`<x>,<y>,<width>x<height>`

If the selected monitor is disconnected, Pocket Buddy+ keeps the saved choice
but safely uses the current primary monitor. If that monitor is reconnected,
normal display-topology handling resolves it again by geometry and reclamps
visible windows.

## Movement and terminal confinement

The old `petCrossDisplayEnabled` state remains readable for backward
compatibility, but it no longer permits a window to cross the selected-monitor
boundary. The Settings UI hides that obsolete control because monitor selection
now owns cross-monitor behavior.

Terminal confinement can only narrow the allowed pet area. The selected
monitor's work area is the outermost confinement rectangle. A terminal located
partly or wholly on another display cannot pull the pet away from the selected
monitor.

## Topology changes

Display added/removed/metrics-changed events invalidate the display cache,
refresh the outer confinement work area, and reclamp all visible BrowserWindows.
This covers taskbar moves/resizes, resolution changes, scale changes, monitor
hotplug, docking/undocking, and resume-related desktop rearrangement.

## Implementation

- `apps/desktop/src/display.ts` — selected-display resolution and pure geometry
  clamps.
- `apps/desktop/src/monitor-manager.ts` — persisted selection, IPC, topology
  events, and the visible BrowserWindow guard.
- `apps/desktop/src/confinement-manager.ts` — terminal confinement intersected
  with the selected monitor work area.
- `apps/desktop/src/renderer/src/monitor-settings-ui.ts` — Settings monitor
  selector and removal of the obsolete cross-display toggle.

Tests live in `apps/desktop/tests/display.test.ts` and
`apps/desktop/tests/monitor-confinement.test.ts`.
