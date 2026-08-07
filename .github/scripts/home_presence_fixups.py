from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

home_path = ROOT / "plugins/official/openpets.home-builder/src/home.ts"
text = home_path.read_text()
text = text.replace('import "./home.css";\n', '')
text = text.replace(
    'const root = document.getElementById("home-root");\nif (!root) throw new Error("Home panel root is missing");\n',
    'const rootElement = document.getElementById("home-root");\nif (!rootElement) throw new Error("Home panel root is missing");\nconst root: HTMLElement = rootElement;\n',
)
text = text.replace(
    'const panel = window.openPetsPanel;\nif (!panel) throw new Error("Home panel bridge is unavailable");\n',
    'interface PanelBridge {\n  postMessage(message: unknown): void;\n  onMessage(handler: (message: unknown) => void): () => void;\n  close(): void;\n}\n\nconst panelCandidate = (globalThis as { openPetsPanel?: PanelBridge }).openPetsPanel;\nif (!panelCandidate) throw new Error("Home panel bridge is unavailable");\nconst panel: PanelBridge = panelCandidate;\n',
)
home_path.write_text(text)

test_path = ROOT / "plugins/official/openpets.home-builder/test.js"
test = test_path.read_text()
test = test.replace(
    'const blits = afterSprites.filter(([op]) => op === "drawImage");\nassert.ok(blits.length > 0, "loading a pack must repaint the room with sprites");\nassert.ok(blits.every(([, src]) => src === packed), "sprites are drawn from the data URLs the host sent");\n\n// Floor tiles are 64px in the pack and Home draws on a 72px diamond, so the\n// blit must be scaled, not pasted 1:1 - a 64px paste would misalign the grid.\nassert.ok(blits.every(([, , , , w]) => w === 72), `every pack tile scales to the 72px tile; widths were ${[...new Set(blits.map((b) => b[4]))].join(", ")}`);\n\n// The bug this pins: furniture was anchored on its bottom edge and floated\n// clear of the floor. Pack art centres the isometric diamond in the image, so\n// every sprite - floor or furniture - must land on the floor lattice. The room\n// is 8x6, so the first 48 blits are its tiles and anything after is furniture.\nconst floorBlits = blits.slice(0, 48);\nconst itemBlits = blits.slice(48);',
    'const blits = afterSprites.filter(([op]) => op === "drawImage");\nconst packBlits = blits.filter(([, src]) => src === packed);\nassert.ok(packBlits.length > 0, "loading a pack must repaint the room with TinyHouse sprites");\nassert.ok(blits.some(([, src]) => src === "data:image/png;base64,BBBB"), "Buddy remains independently rendered while pack art repaints");\n\n// Floor tiles are 64px in the pack and Home draws on a 72px diamond, so the\n// pack blits must be scaled, not pasted 1:1. Buddy has its own authored size.\nassert.ok(packBlits.every(([, , , , w]) => w === 72), `every pack tile scales to the 72px tile; widths were ${[...new Set(packBlits.map((b) => b[4]))].join(", ")}`);\n\n// The bug this pins: furniture was anchored on its bottom edge and floated\n// clear of the floor. Pack art centres the isometric diamond in the image, so\n// every pack sprite - floor or furniture - must land on the floor lattice. The\n// room is 8x6, so the first 48 pack blits are tiles and anything after is furniture.\nconst floorBlits = packBlits.slice(0, 48);\nconst itemBlits = packBlits.slice(48);',
)
test = test.replace(
    'for (let index = beforeSprites; index < draws.length; index += 1) {\n  if (draws[index][0] !== "drawImage") continue;\n',
    'for (let index = beforeSprites; index < draws.length; index += 1) {\n  if (draws[index][0] !== "drawImage" || draws[index][1] !== packed) continue;\n',
)
test_path.write_text(test)

print("Home panel and sprite-test fixups applied")
