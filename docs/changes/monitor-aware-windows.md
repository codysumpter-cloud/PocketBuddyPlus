# Monitor-aware desktop windows

Pocket Buddy+ now treats the monitor selected in Settings as a hard boundary for
all visible desktop windows. Placement uses Electron `workArea` rather than full
display bounds, so Windows taskbars and reserved desktop areas are never covered.

This change is implemented in the shared Electron runtime and therefore applies
to every Windows packaging style that executes the desktop app, including
installed and portable/unpacked distributions.

See `docs/monitor-selection.md` for the full behavior and persistence contract.
