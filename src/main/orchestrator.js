const { BrowserWindow, dialog } = require("electron");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { COMMAND_ENV, ORCHESTRATOR_REPO, ORCHESTRATOR_REQUIRED_FILES } = require("./config");
const { runGit } = require("./process-utils");
const { resetOrchestratorGitStatus, state } = require("./state");
const { writeSettings } = require("./settings");

function notifyOrchestratorStatusChanged() {
  const status = getOrchestratorStatus();
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send("orchestrator:statusChanged", status);
  });
}

function isValidOrchestratorFolder(folderPath) {
  if (!folderPath || !path.isAbsolute(folderPath)) return false;

  return ORCHESTRATOR_REQUIRED_FILES.every((fileName) => {
    try {
      const scriptPath = path.join(folderPath, fileName);
      return fs.statSync(scriptPath).isFile();
    } catch {
      return false;
    }
  });
}

function getOrchestratorStatus() {
  if (state.orchestratorPath && !isValidOrchestratorFolder(state.orchestratorPath)) {
    state.orchestratorPath = "";
    writeSettings();
  }

  const configured = Boolean(state.orchestratorPath);

  return {
    enabled: state.orchestratorEnabled,
    active: state.orchestratorEnabled && configured,
    configured,
    path: state.orchestratorPath,
    valid: configured,
    updateAvailable: state.orchestratorGitStatus.updateAvailable,
    git: state.orchestratorGitStatus,
    requiredFiles: ORCHESTRATOR_REQUIRED_FILES
  };
}

function getActiveOrchestratorPath() {
  const status = getOrchestratorStatus();
  return status.active ? status.path : "";
}

async function checkOrchestratorUpdates() {
  const folderPath = getActiveOrchestratorPath();
  if (!folderPath) {
    resetOrchestratorGitStatus();
    return getOrchestratorStatus();
  }

  state.orchestratorGitStatus = {
    isGitRepo: false,
    checking: true,
    updateAvailable: false,
    error: ""
  };
  notifyOrchestratorStatusChanged();

  const repo = await runGit(["rev-parse", "--is-inside-work-tree"], folderPath);
  if (!repo.ok || repo.stdout !== "true") {
    resetOrchestratorGitStatus();
    notifyOrchestratorStatusChanged();
    return getOrchestratorStatus();
  }

  const fetch = await runGit(["fetch"], folderPath);
  if (!fetch.ok) {
    state.orchestratorGitStatus = {
      isGitRepo: true,
      checking: false,
      updateAvailable: false,
      error: fetch.stderr || fetch.stdout || "git fetch failed."
    };
    notifyOrchestratorStatusChanged();
    return getOrchestratorStatus();
  }

  const upstream = await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], folderPath);
  if (!upstream.ok || !upstream.stdout) {
    state.orchestratorGitStatus = {
      isGitRepo: true,
      checking: false,
      updateAvailable: false,
      error: "No upstream branch is configured."
    };
    notifyOrchestratorStatusChanged();
    return getOrchestratorStatus();
  }

  const behind = await runGit(["rev-list", "--count", `HEAD..${upstream.stdout}`], folderPath);
  const behindCount = Number(behind.stdout);
  state.orchestratorGitStatus = {
    isGitRepo: true,
    checking: false,
    updateAvailable: behind.ok && Number.isInteger(behindCount) && behindCount > 0,
    error: behind.ok ? "" : behind.stderr || "Could not compare orchestrator branch with upstream."
  };
  notifyOrchestratorStatusChanged();
  return getOrchestratorStatus();
}

async function updateOrchestrator() {
  let status = getOrchestratorStatus();
  if (!status.active) {
    return { ok: false, error: "Complete Tmux Orchestrator settings before updating.", status };
  }

  if (!status.updateAvailable) {
    status = await checkOrchestratorUpdates();
    if (!status.updateAvailable) {
      return { ok: true, status };
    }
  }

  const folderPath = status.path;
  state.orchestratorGitStatus = {
    ...state.orchestratorGitStatus,
    checking: true,
    error: ""
  };
  notifyOrchestratorStatusChanged();

  const pull = await runGit(["pull", "--ff-only"], folderPath);
  if (!pull.ok) {
    state.orchestratorGitStatus = {
      ...state.orchestratorGitStatus,
      checking: false,
      error: pull.stderr || pull.stdout || "git pull failed."
    };
    notifyOrchestratorStatusChanged();
    return { ok: false, error: state.orchestratorGitStatus.error, status: getOrchestratorStatus() };
  }

  const nextStatus = await checkOrchestratorUpdates();
  return { ok: true, status: nextStatus };
}

async function chooseOrchestratorFolder(parentWindow) {
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, {
    title: "Select Tmux Orchestrator folder",
    buttonLabel: "Use Folder",
    properties: ["openDirectory"]
  });

  if (canceled || !filePaths.length) return { ok: false, canceled: true };

  const folderPath = filePaths[0];
  if (isValidOrchestratorFolder(folderPath)) {
    state.orchestratorPath = folderPath;
    state.orchestratorEnabled = true;
    resetOrchestratorGitStatus();
    writeSettings();
    return { ok: true, status: getOrchestratorStatus() };
  }

  return { ok: false, invalidFolder: true, folderPath };
}

async function promptCloneOrchestrator(parentWindow) {
  const { response } = await dialog.showMessageBox(parentWindow, {
    type: "question",
    buttons: ["Clone with HTTPS", "Clone with SSH", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: "Clone Tmux Orchestrator",
    message: "The selected folder does not contain the required orchestrator scripts.",
    detail: "Clone Tmux-Orchestrator from GitHub, then Tmux Helper will use the cloned folder."
  });

  if (response === 2) return { ok: false, canceled: true };

  const repoUrl = response === 1 ? ORCHESTRATOR_REPO.ssh : ORCHESTRATOR_REPO.https;
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, {
    title: "Choose where to clone Tmux Orchestrator",
    buttonLabel: "Clone Here",
    properties: ["openDirectory", "createDirectory"]
  });

  if (canceled || !filePaths.length) return { ok: false, canceled: true };

  const destination = path.join(filePaths[0], "Tmux-Orchestrator");
  if (fs.existsSync(destination)) {
    return { ok: false, error: `${destination} already exists. Select that folder or choose another parent folder.` };
  }

  const clone = spawnSync("git", ["clone", repoUrl, destination], {
    encoding: "utf8",
    env: COMMAND_ENV
  });

  if (clone.status !== 0) {
    return { ok: false, error: (clone.stderr || clone.stdout || "git clone failed.").trim() };
  }

  if (!isValidOrchestratorFolder(destination)) {
    return { ok: false, error: "Clone completed, but the required orchestrator scripts were not found." };
  }

  state.orchestratorPath = destination;
  state.orchestratorEnabled = true;
  resetOrchestratorGitStatus();
  writeSettings();
  return { ok: true, status: getOrchestratorStatus() };
}

async function setOrchestratorEnabled(parentWindow, enabled) {
  if (!enabled) {
    state.orchestratorEnabled = false;
    resetOrchestratorGitStatus();
    writeSettings();
    return { ok: true, status: getOrchestratorStatus() };
  }

  if (isValidOrchestratorFolder(state.orchestratorPath)) {
    state.orchestratorEnabled = true;
    writeSettings();
    return { ok: true, status: getOrchestratorStatus() };
  }

  state.orchestratorEnabled = false;
  state.orchestratorPath = "";
  resetOrchestratorGitStatus();
  writeSettings();

  const selectedFolder = await chooseOrchestratorFolder(parentWindow);
  if (selectedFolder.ok || selectedFolder.canceled) return selectedFolder;

  const clonedFolder = await promptCloneOrchestrator(parentWindow);
  if (clonedFolder.ok) return clonedFolder;

  state.orchestratorEnabled = false;
  state.orchestratorPath = "";
  resetOrchestratorGitStatus();
  writeSettings();
  return clonedFolder;
}

async function chooseOrchestratorPath(parentWindow) {
  const selectedFolder = await chooseOrchestratorFolder(parentWindow);
  if (selectedFolder.ok || selectedFolder.canceled) return selectedFolder;

  return promptCloneOrchestrator(parentWindow);
}

module.exports = {
  checkOrchestratorUpdates,
  chooseOrchestratorPath,
  getActiveOrchestratorPath,
  getOrchestratorStatus,
  setOrchestratorEnabled,
  updateOrchestrator
};
