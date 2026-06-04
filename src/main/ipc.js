const { BrowserWindow, clipboard, ipcMain } = require("electron");

const { getTerminalOptions, normalizeTerminal } = require("./config");
const {
  checkOrchestratorUpdates,
  chooseOrchestratorPath,
  getActiveOrchestratorPath,
  getOrchestratorStatus,
  setOrchestratorEnabled,
  updateOrchestrator
} = require("./orchestrator");
const { state } = require("./state");
const { openAttachTerminal } = require("./terminal");
const {
  chooseTmuxPath,
  getTmuxStatus,
  listSessions,
  listWindows,
  runTmux
} = require("./tmux");
const { writeSettings } = require("./settings");

function getSettings() {
  return {
    tmux: getTmuxStatus(),
    terminal: state.selectedTerminal,
    terminalOptions: getTerminalOptions(),
    orchestrator: getOrchestratorStatus()
  };
}

function registerIpcHandlers() {
  ipcMain.handle("settings:get", async () => {
    return getSettings();
  });

  ipcMain.handle("settings:setTerminal", async (_event, terminalId) => {
    state.selectedTerminal = normalizeTerminal(String(terminalId || ""));
    writeSettings();
    return getSettings();
  });

  ipcMain.handle("settings:setOrchestratorEnabled", async (event, enabled) => {
    const result = await setOrchestratorEnabled(BrowserWindow.fromWebContents(event.sender), Boolean(enabled));
    if (result.ok) checkOrchestratorUpdates();
    return { ...result, settings: getSettings() };
  });

  ipcMain.handle("orchestrator:choosePath", async (event) => {
    const result = await chooseOrchestratorPath(BrowserWindow.fromWebContents(event.sender));
    if (result.ok) checkOrchestratorUpdates();
    return { ...result, settings: getSettings() };
  });

  ipcMain.handle("orchestrator:update", async () => {
    const result = await updateOrchestrator();
    return { ...result, settings: getSettings() };
  });

  ipcMain.handle("tmux:status", async () => {
    return getTmuxStatus();
  });

  ipcMain.handle("tmux:choosePath", async (event) => {
    return chooseTmuxPath(BrowserWindow.fromWebContents(event.sender));
  });

  ipcMain.handle("tmux:listSessions", listSessions);

  ipcMain.handle("tmux:listWindows", async (_event, sessionName) => {
    const target = String(sessionName || "").trim();
    if (!target) return { ok: false, stderr: "Choose a session first.", windows: [] };

    return listWindows(target);
  });

  ipcMain.handle("tmux:createSession", async (_event, name) => {
    const cleanName = String(name || "").trim();
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(cleanName)) {
      return { ok: false, stderr: "Use 1-64 characters: letters, numbers, dot, underscore, colon, or dash." };
    }

    const workingDirectory = getActiveOrchestratorPath();
    const args = ["new-session", "-d", "-s", cleanName];
    if (workingDirectory) args.push("-c", workingDirectory);

    return runTmux(args);
  });

  ipcMain.handle("tmux:renameSession", async (_event, currentName, nextName) => {
    const current = String(currentName || "").trim();
    const next = String(nextName || "").trim();
    if (!current || !/^[A-Za-z0-9_.:-]{1,64}$/.test(next)) {
      return { ok: false, stderr: "Enter a valid new session name." };
    }

    return runTmux(["rename-session", "-t", current, next]);
  });

  ipcMain.handle("tmux:detachSession", async (_event, name) => {
    const target = String(name || "").trim();
    if (!target) return { ok: false, stderr: "Choose a session first." };

    const result = await runTmux(["detach-client", "-s", target]);
    if (!result.ok && /no clients/i.test(result.stderr)) {
      return { ok: true, stdout: "", stderr: "No clients are attached to this session.", code: 0 };
    }

    return result;
  });

  ipcMain.handle("tmux:chooseTree", async (_event, sessionName) => {
    const target = String(sessionName || "").trim();
    if (!target) return { ok: false, stderr: "Choose a session first." };

    return runTmux(["choose-tree", "-t", target]);
  });

  ipcMain.handle("tmux:selectWindow", async (_event, sessionName, windowIndex) => {
    const target = String(sessionName || "").trim();
    const index = Number(windowIndex);
    if (!target) return { ok: false, stderr: "Choose a session first." };
    if (!Number.isInteger(index) || index < 0) return { ok: false, stderr: "Choose a valid window." };

    return runTmux(["select-window", "-t", `${target}:${index}`]);
  });

  ipcMain.handle("tmux:newWindow", async (_event, sessionName, windowName) => {
    const target = String(sessionName || "").trim();
    const name = String(windowName || "").trim();
    if (!target) return { ok: false, stderr: "Choose a session first." };
    if (name && !/^[A-Za-z0-9_.:-]{1,64}$/.test(name)) {
      return { ok: false, stderr: "Window names may use letters, numbers, dot, underscore, colon, or dash." };
    }

    const workingDirectory = getActiveOrchestratorPath();
    const args = ["new-window", "-t", target];
    if (name) args.push("-n", name);
    if (workingDirectory) args.push("-c", workingDirectory);

    return runTmux(args);
  });

  ipcMain.handle("tmux:copyCommand", (_event, command) => {
    clipboard.writeText(String(command || ""));
    return { ok: true };
  });

  ipcMain.handle("tmux:attach", async (_event, sessionName) => {
    const target = String(sessionName || "").trim();
    if (!target) return { ok: false, stderr: "Choose a session first." };

    return openAttachTerminal(target);
  });
}

module.exports = {
  registerIpcHandlers
};
