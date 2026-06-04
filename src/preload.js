const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tmuxHelper", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  onOrchestratorStatusChanged: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("orchestrator:statusChanged", listener);
    return () => ipcRenderer.removeListener("orchestrator:statusChanged", listener);
  },
  setTerminal: (terminalId) => ipcRenderer.invoke("settings:setTerminal", terminalId),
  setOrchestratorEnabled: (enabled) => ipcRenderer.invoke("settings:setOrchestratorEnabled", enabled),
  chooseOrchestratorPath: () => ipcRenderer.invoke("orchestrator:choosePath"),
  updateOrchestrator: () => ipcRenderer.invoke("orchestrator:update"),
  status: () => ipcRenderer.invoke("tmux:status"),
  choosePath: () => ipcRenderer.invoke("tmux:choosePath"),
  listSessions: () => ipcRenderer.invoke("tmux:listSessions"),
  listWindows: (sessionName) => ipcRenderer.invoke("tmux:listWindows", sessionName),
  createSession: (name) => ipcRenderer.invoke("tmux:createSession", name),
  renameSession: (currentName, nextName) => ipcRenderer.invoke("tmux:renameSession", currentName, nextName),
  detachSession: (name) => ipcRenderer.invoke("tmux:detachSession", name),
  chooseTree: (sessionName) => ipcRenderer.invoke("tmux:chooseTree", sessionName),
  selectWindow: (sessionName, windowIndex) => ipcRenderer.invoke("tmux:selectWindow", sessionName, windowIndex),
  newWindow: (sessionName, windowName) => ipcRenderer.invoke("tmux:newWindow", sessionName, windowName),
  attach: (sessionName) => ipcRenderer.invoke("tmux:attach", sessionName),
  copyCommand: (command) => ipcRenderer.invoke("tmux:copyCommand", command)
});
