import { formatTmuxCommand, logCommand } from "./commands.js";
import { elements, initializeReadonlyInputs } from "./elements.js";
import { renderSessions, renderWindowButtons } from "./session-renderers.js";
import { state } from "./state.js";
import {
  showAlert,
  showControlAlert,
  showSettingsAlert,
  showSessionsView,
  showSettingsView,
  toggleExplorerSection
} from "./view.js";

async function openControlView(session) {
  state.activeControlSession = {
    id: session.id || session.name,
    name: session.name
  };
  const sessionTarget = state.activeControlSession.id;
  elements.sessionsView.hidden = true;
  elements.controlView.hidden = false;
  elements.settingsView.hidden = true;
  elements.sessionsNavButton.classList.add("nav-button--active");
  elements.sessionsNavButton.classList.remove("secondary");
  elements.settingsNavButton.classList.remove("nav-button--active");
  elements.settingsNavButton.classList.add("secondary");
  elements.controlTitle.textContent = state.activeControlSession.name;
  elements.controlSummary.textContent = "Loading window chooser...";
  showAlert("");
  showControlAlert("");
  await loadControlWindows(sessionTarget);
}

function closeControlView() {
  showSessionsView();
  showControlAlert("");
  refreshSessions();
}

async function loadControlWindows(sessionName) {
  logCommand(formatTmuxCommand(["list-windows", "-t", sessionName]));
  elements.controlWindowButtons.textContent = "Loading windows...";

  const result = await window.tmuxHelper.listWindows(sessionName);
  if (!result.ok) {
    elements.controlSummary.textContent = "Unable to load windows.";
    elements.controlWindowButtons.textContent = "";
    showControlAlert(result.stderr || "Could not load session windows.");
    return;
  }

  renderWindowButtons(result.windows, sessionName, selectWindow);
}

async function refreshSessions() {
  if (!state.tmuxAvailable) {
    elements.summary.textContent = "Select tmux to load sessions.";
    renderSessions([], sessionHandlers);
    return;
  }

  showAlert("");
  logCommand(formatTmuxCommand(["list-sessions"]));
  elements.refreshButton.disabled = true;
  elements.summary.textContent = "Refreshing sessions...";

  const result = await window.tmuxHelper.listSessions();
  elements.refreshButton.disabled = false;

  if (!result.ok) {
    elements.summary.textContent = "Unable to read tmux sessions.";
    showAlert(result.stderr || "tmux returned an error.");
    renderSessions([], sessionHandlers);
    return;
  }

  const count = result.sessions.length;
  elements.summary.textContent = count === 1 ? "1 active session" : `${count} active sessions`;
  if (result.message) showAlert(result.message, "info");
  renderSessions(result.sessions, sessionHandlers);
}

async function createSession(name) {
  logCommand(formatTmuxCommand(["new-session", "-d", "-s", name]));
  const result = await window.tmuxHelper.createSession(name);
  if (!result.ok) {
    showAlert(result.stderr || "Could not create the session.");
    return;
  }
  elements.createForm.reset();
  await refreshSessions();
}

async function renameSession(currentName, nextName) {
  if (!nextName || nextName === currentName) return;

  logCommand(formatTmuxCommand(["rename-session", "-t", currentName, nextName]));
  const result = await window.tmuxHelper.renameSession(currentName, nextName);
  if (!result.ok) {
    showAlert(result.stderr || "Could not rename the session.");
    return;
  }

  await refreshSessions();
}

async function createWindow(sessionName, windowName) {
  const args = ["new-window", "-t", sessionName];
  if (windowName) args.push("-n", windowName);
  logCommand(formatTmuxCommand(args));
  const result = await window.tmuxHelper.newWindow(sessionName, windowName);
  if (!result.ok) {
    showAlert(result.stderr || "Could not create the tmux window.");
    return;
  }

  await refreshSessions();
}

async function detachSession(sessionName) {
  logCommand(formatTmuxCommand(["detach-client", "-s", sessionName]));
  const result = await window.tmuxHelper.detachSession(sessionName);
  if (!result.ok) {
    showAlert(result.stderr || "Could not detach the session.");
    return;
  }

  await refreshSessions();
  if (result.stderr) showAlert(result.stderr, "info");
}

async function chooseTree(sessionName) {
  logCommand(formatTmuxCommand(["choose-tree", "-t", sessionName]));
  const result = await window.tmuxHelper.chooseTree(sessionName);
  if (!result.ok) {
    showControlAlert(result.stderr || "Could not open tmux choose-tree.");
    return;
  }

  const sessionLabel = state.activeControlSession ? state.activeControlSession.name : sessionName;
  showControlAlert(`Opened choose-tree for ${sessionLabel}.`, "info");
}

async function selectWindow(sessionName, windowIndex) {
  logCommand(formatTmuxCommand(["select-window", "-t", `${sessionName}:${windowIndex}`]));
  const result = await window.tmuxHelper.selectWindow(sessionName, windowIndex);
  if (!result.ok) {
    showControlAlert(result.stderr || "Could not select this tmux window.");
    return;
  }

  const sessionLabel = state.activeControlSession ? state.activeControlSession.name : sessionName;
  showControlAlert(`Selected ${sessionLabel}:${windowIndex}.`, "info");
  await loadControlWindows(sessionName);
}

async function attachSession(sessionName) {
  logCommand(formatTmuxCommand(["attach-session", "-t", sessionName]));
  const result = await window.tmuxHelper.attach(sessionName);
  if (!result.ok) {
    showAlert(result.stderr || "Could not open a terminal for this session.");
    return;
  }

  window.setTimeout(refreshSessions, 800);
}

const sessionHandlers = {
  attachSession,
  createWindow,
  detachSession,
  openControlView,
  renameSession
};

function updateTmuxStatus(status) {
  state.tmuxAvailable = Boolean(status.ok);
  elements.createForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = !state.tmuxAvailable;
  });
  elements.refreshButton.disabled = !state.tmuxAvailable;
  elements.tmuxPathInput.value = status.path || "No tmux executable selected";

  if (status.ok) {
    elements.status.textContent = status.path ? `${status.version} at ${status.path}` : status.version;
    return;
  }

  elements.status.textContent = status.error || "tmux was not found.";
  elements.summary.textContent = "Select tmux to load sessions.";
  showAlert(`Tmux Helper could not find tmux. Run ${status.checkCommand || "command -v tmux"} in Terminal, then select the tmux executable.`, "info");
}

function renderTerminalOptions(settings) {
  elements.terminalOptions.replaceChildren();

  const selected = settings.terminalOptions.find((option) => option.id === settings.terminal);
  elements.selectedTerminalLabel.textContent = selected ? selected.label : "Choose terminal";

  for (const option of settings.terminalOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = option.id === settings.terminal ? "" : "secondary";
    button.textContent = option.label;
    button.addEventListener("click", () => selectTerminal(option.id));
    elements.terminalOptions.append(button);
  }
}

function renderOrchestratorStatus(orchestrator) {
  state.latestOrchestratorStatus = orchestrator;
  const enabled = Boolean(orchestrator && orchestrator.enabled);
  const active = Boolean(orchestrator && orchestrator.active);
  const configured = Boolean(orchestrator && orchestrator.configured);
  const updateAvailable = active && Boolean(orchestrator && orchestrator.updateAvailable);
  const checking = Boolean(orchestrator && orchestrator.git && orchestrator.git.checking);
  const folderPath = orchestrator && orchestrator.path ? orchestrator.path : "";
  const chipState = !enabled ? "off" : updateAvailable ? "update-available" : active ? "on" : "incomplete";
  const chipLoading = state.orchestratorChipLoading || checking;

  state.orchestratorChipState = chipState;
  elements.orchestratorChip.textContent = chipLoading ? "Checking orchestrator..." : chipState === "update-available" ? "Orchestrator update available" : chipState === "on" ? "Orchestrator On" : chipState === "incomplete" ? "Complete setting" : "Orchestrator Off";
  elements.orchestratorChip.dataset.state = chipState;
  elements.orchestratorChip.dataset.loading = String(chipLoading);
  elements.orchestratorChip.disabled = chipState === "on" || chipLoading;
  elements.orchestratorChip.setAttribute("aria-disabled", String(elements.orchestratorChip.disabled));
  elements.orchestratorToggle.checked = enabled;
  elements.orchestratorToggleLabel.textContent = enabled ? "On" : "Off";
  elements.orchestratorPathInput.value = configured ? folderPath : "No orchestrator folder selected";
  elements.selectOrchestratorButton.hidden = !enabled;
  elements.orchestratorSetupSection.hidden = chipState === "off";

  if (chipState !== "off") {
    toggleExplorerSection(elements.orchestratorSetupToggle, elements.orchestratorSetupPanel, chipState === "on");
  }
}

async function loadSettings() {
  const settings = await window.tmuxHelper.getSettings();
  updateTmuxStatus(settings.tmux);
  renderTerminalOptions(settings);
  renderOrchestratorStatus(settings.orchestrator);
}

async function loadTmuxStatus() {
  const settings = await window.tmuxHelper.getSettings();
  updateTmuxStatus(settings.tmux);
  renderTerminalOptions(settings);
  renderOrchestratorStatus(settings.orchestrator);
  return settings.tmux.ok;
}

async function chooseTmuxPath() {
  elements.selectTmuxButton.disabled = true;
  showSettingsAlert("");
  const result = await window.tmuxHelper.choosePath();
  elements.selectTmuxButton.disabled = false;

  if (!result.ok) {
    if (!result.canceled) {
      showSettingsAlert(result.error || "Could not use the selected tmux executable.");
      showAlert(result.error || "Could not use the selected tmux executable.");
    }
    return;
  }

  updateTmuxStatus(result.status);
  showSettingsAlert("Updated tmux location.", "info");
  await refreshSessions();
}

async function selectTerminal(terminalId) {
  const settings = await window.tmuxHelper.setTerminal(terminalId);
  renderTerminalOptions(settings);
  showSettingsAlert(`Tmux will open in ${elements.selectedTerminalLabel.textContent}.`, "info");
}

async function setOrchestratorEnabled(enabled) {
  elements.orchestratorToggle.disabled = true;
  showSettingsAlert("");

  const result = await window.tmuxHelper.setOrchestratorEnabled(enabled);
  elements.orchestratorToggle.disabled = false;
  renderOrchestratorStatus(result.settings.orchestrator);

  if (!result.ok) {
    if (!result.canceled) {
      showSettingsAlert(result.error || "Could not enable Tmux Orchestrator.");
    }
    return;
  }

  showSettingsAlert(result.settings.orchestrator.active ? "Tmux Orchestrator enabled." : result.settings.orchestrator.enabled ? "Complete Tmux Orchestrator settings to enable it." : "Tmux Orchestrator disabled.", "info");
}

async function chooseOrchestratorPath() {
  elements.selectOrchestratorButton.disabled = true;
  showSettingsAlert("");

  const result = await window.tmuxHelper.chooseOrchestratorPath();
  elements.selectOrchestratorButton.disabled = false;
  renderOrchestratorStatus(result.settings.orchestrator);

  if (!result.ok) {
    if (!result.canceled) {
      showSettingsAlert(result.error || "Could not use the selected Tmux Orchestrator folder.");
    }
    return;
  }

  showSettingsAlert("Updated Tmux Orchestrator folder.", "info");
}

async function activateOrchestratorChip() {
  if (state.orchestratorChipState === "on" || state.orchestratorChipLoading) return;

  if (state.orchestratorChipState === "update-available") {
    state.orchestratorChipLoading = true;
    renderOrchestratorStatus(state.latestOrchestratorStatus);
    showAlert("Updating Tmux Orchestrator...", "info");

    try {
      const result = await window.tmuxHelper.updateOrchestrator();
      renderOrchestratorStatus(result.settings.orchestrator);

      if (!result.ok) {
        showAlert(result.error || "Could not update Tmux Orchestrator.");
        return;
      }

      showAlert(result.settings.orchestrator.active ? "Tmux Orchestrator is up to date." : "Complete Tmux Orchestrator settings.", "info");
    } finally {
      state.orchestratorChipLoading = false;
      const settings = await window.tmuxHelper.getSettings();
      renderOrchestratorStatus(settings.orchestrator);
    }
    return;
  }

  showSettingsView();
  loadSettings();
}

function bindEvents() {
  elements.createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createSession(new FormData(elements.createForm).get("sessionName"));
  });

  elements.refreshButton.addEventListener("click", refreshSessions);
  elements.sessionsNavButton.addEventListener("click", showSessionsView);
  elements.settingsNavButton.addEventListener("click", () => {
    showSettingsView();
    loadSettings();
  });
  elements.selectTmuxButton.addEventListener("click", chooseTmuxPath);
  elements.selectOrchestratorButton.addEventListener("click", chooseOrchestratorPath);
  elements.orchestratorChip.addEventListener("click", activateOrchestratorChip);
  elements.backButton.addEventListener("click", closeControlView);
  elements.clearConsoleButton.addEventListener("click", () => {
    elements.commandConsole.textContent = "";
  });
  elements.chooseTreeButton.addEventListener("click", () => {
    if (!state.activeControlSession) return;
    chooseTree(state.activeControlSession.id);
  });
  elements.refreshWindowsButton.addEventListener("click", () => {
    if (!state.activeControlSession) return;
    loadControlWindows(state.activeControlSession.id);
  });

  elements.newSessionToggle.addEventListener("click", () => {
    const isExpanded = elements.newSessionToggle.getAttribute("aria-expanded") === "true";
    toggleExplorerSection(elements.newSessionToggle, elements.createForm, !isExpanded);
  });

  elements.commandToggle.addEventListener("click", () => {
    const isExpanded = elements.commandToggle.getAttribute("aria-expanded") === "true";
    toggleExplorerSection(elements.commandToggle, elements.commandExamples, !isExpanded);
  });

  elements.orchestratorSetupToggle.addEventListener("click", () => {
    const isExpanded = elements.orchestratorSetupToggle.getAttribute("aria-expanded") === "true";
    toggleExplorerSection(elements.orchestratorSetupToggle, elements.orchestratorSetupPanel, !isExpanded);
  });

  elements.consoleToggle.addEventListener("click", () => {
    const isExpanded = elements.consoleToggle.getAttribute("aria-expanded") === "true";
    toggleExplorerSection(elements.consoleToggle, elements.consolePanel, !isExpanded);
  });

  elements.terminalToggle.addEventListener("click", () => {
    const isExpanded = elements.terminalToggle.getAttribute("aria-expanded") === "true";
    elements.terminalToggle.setAttribute("aria-expanded", String(!isExpanded));
    elements.terminalToggle.querySelector("[aria-hidden]").textContent = isExpanded ? "Show" : "Hide";
    elements.terminalOptions.hidden = isExpanded;
  });

  elements.orchestratorToggle.addEventListener("change", () => {
    setOrchestratorEnabled(elements.orchestratorToggle.checked);
  });

  window.tmuxHelper.onOrchestratorStatusChanged((orchestrator) => {
    renderOrchestratorStatus(orchestrator);
  });

  document.querySelectorAll(".command-row").forEach((row) => {
    const command = row.dataset.command;
    row.querySelector("[data-copy]").addEventListener("click", async () => {
      logCommand(command);
      await window.tmuxHelper.copyCommand(command);
      showAlert(`Copied: ${command}`, "info");
    });
  });

  document.querySelectorAll("[data-copy-prompt]").forEach((button) => {
    button.addEventListener("click", async () => {
      const prompt = button.parentElement.querySelector("code").textContent;
      await window.tmuxHelper.copyCommand(prompt);
      showAlert("Copied orchestrator setup prompt.", "info");
    });
  });
}

export function startApp() {
  initializeReadonlyInputs();
  bindEvents();
  loadTmuxStatus().then((ok) => {
    if (ok) refreshSessions();
  });
}
