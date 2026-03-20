const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("neoAPI", {
  launchAction: (payload) => ipcRenderer.invoke("launch-action", payload),
  hideLauncher: () => ipcRenderer.invoke("hide-launcher"),
  getApps: () => ipcRenderer.invoke("get-apps"),
  refreshApps: () => ipcRenderer.invoke("refresh-apps"),
  onLauncherShown: (callback) => ipcRenderer.on("launcher-shown", callback),
  onLauncherHidden: (callback) => ipcRenderer.on("launcher-hidden", callback)
});