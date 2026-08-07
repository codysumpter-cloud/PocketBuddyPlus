from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / "plugins/official/openpets.home-builder/src/home.ts"
text = path.read_text()

text = text.replace('import "./home.css";\n', '')
text = text.replace(
    'const root = document.getElementById("home-root");\nif (!root) throw new Error("Home panel root is missing");\n',
    'const rootElement = document.getElementById("home-root");\nif (!rootElement) throw new Error("Home panel root is missing");\nconst root: HTMLElement = rootElement;\n',
)
text = text.replace(
    'const panel = window.openPetsPanel;\nif (!panel) throw new Error("Home panel bridge is unavailable");\n',
    'interface PanelBridge {\n  postMessage(message: unknown): void;\n  onMessage(handler: (message: unknown) => void): () => void;\n  close(): void;\n}\n\nconst panelCandidate = (globalThis as { openPetsPanel?: PanelBridge }).openPetsPanel;\nif (!panelCandidate) throw new Error("Home panel bridge is unavailable");\nconst panel: PanelBridge = panelCandidate;\n',
)

path.write_text(text)
print("Home panel type fixups applied")
