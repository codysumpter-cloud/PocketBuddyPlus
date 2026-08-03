// Narrow preload for the Pocket Buddy Plus surfaces (creature-attached menu and
// dock). Runs sandboxed with contextIsolation on and no Node integration; the
// renderer only ever sees the small allow-listed surface below.
const { contextBridge, ipcRenderer } = require("electron");

const tokenArg = process.argv.find((arg) => arg.startsWith("--pocket-buddy-surface="));
const surface = tokenArg ? tokenArg.slice("--pocket-buddy-surface=".length) : "";
const channel = surface ? `pocketbuddyplus:surface:${surface}` : "";
const snapshotHandlers = new Set();
const preferenceHandlers = new Set();

if (channel) {
  ipcRenderer.on(`${channel}:snapshot`, (_event, snapshot) => {
    for (const handler of snapshotHandlers) {
      try { handler(snapshot); } catch { /* surface handler errors stay in the surface */ }
    }
  });
  // Theme and dock preference changes, so every surface stays in sync.
  ipcRenderer.on(`${channel}:preferences`, (_event, preferences) => {
    for (const handler of preferenceHandlers) {
      try { handler(preferences); } catch { /* surface handler errors stay in the surface */ }
    }
  });
}

contextBridge.exposeInMainWorld("pocketBuddyPlus", {
  surface,
  // Read the current authoritative Buddy snapshot.
  getSnapshot: () => (channel ? ipcRenderer.invoke(`${channel}:get-snapshot`) : Promise.resolve(null)),
  onSnapshot: (handler) => {
    if (typeof handler !== "function") return () => {};
    snapshotHandlers.add(handler);
    return () => snapshotHandlers.delete(handler);
  },
  // Request a menu action by id. The main process decides what is permitted;
  // the renderer can never write affection or need values directly.
  invokeMenuAction: (action) => (channel ? ipcRenderer.invoke(`${channel}:menu-action`, action) : Promise.resolve(null)),
  onPreferences: (handler) => {
    if (typeof handler !== "function") return () => {};
    preferenceHandlers.add(handler);
    return () => preferenceHandlers.delete(handler);
  },
  getDockPreferences: () => (channel ? ipcRenderer.invoke(`${channel}:get-dock`) : Promise.resolve(null)),
  setDockPreferences: (preferences) => (channel ? ipcRenderer.invoke(`${channel}:set-dock`, preferences) : Promise.resolve(null)),
  openControlCenter: (route) => { if (channel) ipcRenderer.send(`${channel}:open-control-center`, route); },
  requestResize: (size) => { if (channel) ipcRenderer.send(`${channel}:resize`, size); },
  close: () => { if (channel) ipcRenderer.send(`${channel}:close`); },
});
