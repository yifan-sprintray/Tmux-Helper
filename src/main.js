const { app, BrowserWindow } = require("electron");

const { checkOrchestratorUpdates } = require("./main/orchestrator");
const { createWindow } = require("./main/window");
const { initializeFirstStartSettings, loadSettingsIntoState } = require("./main/settings");
const { getTmuxStatus } = require("./main/tmux");
const { registerIpcHandlers } = require("./main/ipc");

app.whenReady().then(() => {
  loadSettingsIntoState();
  initializeFirstStartSettings(getTmuxStatus);
  registerIpcHandlers();

  createWindow();
  checkOrchestratorUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      checkOrchestratorUpdates();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
