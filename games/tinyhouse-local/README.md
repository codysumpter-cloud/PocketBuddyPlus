# Pocket Buddy+ TinyHouse Local Game

A public-safe playable HTML room builder for the user's purchased Pixel Salvaje TinyHouse 0.17 asset pack.

## Run

1. Unzip `TinyHouse_0.17(@Pixel_Salvaje).zip` somewhere on your computer.
2. Open `index.html` in Chromium, Chrome, or Edge.
3. Choose **Select Extracted Folder** and select the unzipped TinyHouse folder.

The game reads the PNGs from the browser's local file handles and creates temporary object URLs. It does not upload, copy, or commit the purchased assets.

## Included behavior

- Exact 128px floor and wall geometry with shared isometric transforms
- Half-cell, forgiving furniture snapping
- 33 grouped animation/state definitions instead of exposing raw frames
- Tabletop/support placement and parent-following movement
- Save/load, selection, layers, duplication, flip, pan, zoom, and PNG export
- Local-only metadata manifest with filenames and dimensions; no purchased image bytes

## Controls

- Click a catalog item, then click the floor or a compatible table/desk.
- Drag furniture to move it; small compatible items attach to tabletop supports.
- Double-click or press **Enter** to activate an animation/state.
- **R** flips the selected item; **Delete** removes it.
- Hold **Space** and drag to pan; use the camera buttons to zoom or re-center.
- **Ctrl/Cmd+S** saves and **Ctrl/Cmd+L** loads.

## Asset boundary

Pixel Salvaje permits using and editing the pack in projects but does not permit redistributing the source assets. This directory intentionally contains no purchased PNG/GIF bytes. The user supplies their own licensed copy at runtime.
