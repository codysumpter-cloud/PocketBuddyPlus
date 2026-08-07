process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

const { contextBridge, ipcRenderer } = require("electron");

const PANEL_CHANNEL = "pbp-home-capture:panel-message";
const HOST_CHANNEL = "pbp-home-capture:host-message";

contextBridge.exposeInMainWorld("openPetsPanel", {
  postMessage(message) {
    ipcRenderer.send(PANEL_CHANNEL, message);
  },
  onMessage(handler) {
    if (typeof handler !== "function") return () => {};
    const listener = (_event, message) => handler(message);
    ipcRenderer.on(HOST_CHANNEL, listener);
    return () => ipcRenderer.off(HOST_CHANNEL, listener);
  },
  close() {
    ipcRenderer.send(PANEL_CHANNEL, { type: "capture-panel-close" });
  },
});
