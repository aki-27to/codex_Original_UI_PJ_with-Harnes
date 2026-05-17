const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("harnesDesktop", {
  getBackendStatus: () => ipcRenderer.invoke("harnes:get-backend-status"),
  getRuntime: () => ipcRenderer.invoke("harnes:get-runtime"),
  getProposalManifest: () => ipcRenderer.invoke("harnes:get-proposal-manifest"),
  getCurrentLogs: () => ipcRenderer.invoke("harnes:get-current-logs"),
  getDiagnostics: () => ipcRenderer.invoke("harnes:get-diagnostics"),
  submitExec: (payload) => ipcRenderer.invoke("harnes:submit-exec", payload),
  cancelExec: (requestId) => ipcRenderer.invoke("harnes:cancel-exec", requestId),
  restartBackend: () => ipcRenderer.invoke("harnes:restart-backend"),
  lockWorkspace: (targetPath) => ipcRenderer.invoke("harnes:lock-workspace", targetPath),
  unlockWorkspace: () => ipcRenderer.invoke("harnes:unlock-workspace"),
  openExternal: (target) => ipcRenderer.invoke("harnes:open-external", target),
  onBackendStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("harnes:backend-status", listener);
    return () => ipcRenderer.removeListener("harnes:backend-status", listener);
  },
  onExecEvent: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("harnes:exec-event", listener);
    return () => ipcRenderer.removeListener("harnes:exec-event", listener);
  },
});
