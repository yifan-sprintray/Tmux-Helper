const sessionsEl = document.querySelector("#sessions");
const summaryEl = document.querySelector("#summary");
const alertEl = document.querySelector("#alert");
const statusEl = document.querySelector("#tmuxStatus");
const selectTmuxButton = document.querySelector("#selectTmuxButton");
const template = document.querySelector("#sessionTemplate");
const createForm = document.querySelector("#createSessionForm");
const refreshButton = document.querySelector("#refreshButton");
const sessionsNavButton = document.querySelector("#sessionsNavButton");
const settingsNavButton = document.querySelector("#settingsNavButton");
const sessionsView = document.querySelector("#sessionsView");
const controlView = document.querySelector("#controlView");
const settingsView = document.querySelector("#settingsView");
const controlTitle = document.querySelector("#controlTitle");
const controlSummary = document.querySelector("#controlSummary");
const controlAlert = document.querySelector("#controlAlert");
const settingsAlert = document.querySelector("#settingsAlert");
const tmuxPathInput = document.querySelector("#tmuxPathInput");
const terminalToggle = document.querySelector("#terminalToggle");
const selectedTerminalLabel = document.querySelector("#selectedTerminalLabel");
const terminalOptions = document.querySelector("#terminalOptions");
const orchestratorChip = document.querySelector("#orchestratorChip");
const orchestratorToggle = document.querySelector("#orchestratorToggle");
const orchestratorToggleLabel = document.querySelector("#orchestratorToggleLabel");
const orchestratorPathInput = document.querySelector("#orchestratorPathInput");
const selectOrchestratorButton = document.querySelector("#selectOrchestratorButton");
const controlWindowButtons = document.querySelector("#controlWindowButtons");
const chooseTreeButton = document.querySelector("#chooseTreeButton");
const refreshWindowsButton = document.querySelector("#refreshWindowsButton");
const backButton = document.querySelector("#backButton");
const newSessionToggle = document.querySelector("#newSessionToggle");
const commandToggle = document.querySelector("#commandToggle");
const commandExamples = document.querySelector("#commandExamples");
const orchestratorSetupSection = document.querySelector("#orchestratorSetupSection");
const orchestratorSetupToggle = document.querySelector("#orchestratorSetupToggle");
const orchestratorSetupPanel = document.querySelector("#orchestratorSetupPanel");
const consoleToggle = document.querySelector("#consoleToggle");
const consolePanel = document.querySelector("#consolePanel");
const commandConsole = document.querySelector("#commandConsole");
const clearConsoleButton = document.querySelector("#clearConsoleButton");

let activeControlSession = null;
let tmuxAvailable = false;
let orchestratorChipState = "off";
let orchestratorChipLoading = false;
let latestOrchestratorStatus = null;

for (const pathInput of [tmuxPathInput, orchestratorPathInput]) {
  pathInput.readOnly = true;
  pathInput.setAttribute("aria-readonly", "true");
}

function showAlert(message, type = "error") {
  alertEl.textContent = message;
  alertEl.dataset.type = type;
  alertEl.hidden = !message;
}

function showControlAlert(message, type = "error") {
  controlAlert.textContent = message;
  controlAlert.dataset.type = type;
  controlAlert.hidden = !message;
}

function showSettingsAlert(message, type = "error") {
  settingsAlert.textContent = message;
  settingsAlert.dataset.type = type;
  settingsAlert.hidden = !message;
}

function setActiveNav(viewName) {
  const isSettings = viewName === "settings";
  sessionsNavButton.classList.toggle("nav-button--active", !isSettings);
  settingsNavButton.classList.toggle("nav-button--active", isSettings);
  sessionsNavButton.classList.toggle("secondary", isSettings);
  settingsNavButton.classList.toggle("secondary", !isSettings);
}

function showSessionsView() {
  activeControlSession = null;
  sessionsView.hidden = false;
  controlView.hidden = true;
  settingsView.hidden = true;
  setActiveNav("sessions");
  showControlAlert("");
}

function showSettingsView() {
  activeControlSession = null;
  sessionsView.hidden = true;
  controlView.hidden = true;
  settingsView.hidden = false;
  setActiveNav("settings");
  showAlert("");
  showControlAlert("");
  loadSettings();
}

function describeSession(session) {
  const windows = session.windows === 1 ? "1 window" : `${session.windows} windows`;
  return `${windows} · created ${session.created || "unknown"}`;
}

function describeWindow(windowInfo) {
  const panes = windowInfo.panes === 1 ? "1 pane" : `${windowInfo.panes} panes`;
  return `${windowInfo.index}: ${windowInfo.name || "window"} · ${panes}`;
}

function shellQuote(value) {
  const text = String(value || "");
  return /^[A-Za-z0-9_./:=+-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
}

function formatTmuxCommand(args) {
  return `tmux ${args.map(shellQuote).join(" ")}`;
}

function toggleExplorerSection(button, panel, expanded) {
  button.setAttribute("aria-expanded", String(expanded));
  button.querySelector("[aria-hidden]").textContent = expanded ? "v" : ">";
  panel.hidden = !expanded;
  panel.setAttribute("aria-hidden", String(!expanded));
}

function logCommand(command) {
  const line = `$ ${command}`;
  console.log(`[tmux-helper] ${line}`);
  commandConsole.textContent = commandConsole.textContent ? `${commandConsole.textContent}\n${line}` : line;
  commandConsole.scrollTop = commandConsole.scrollHeight;
}

function toggleCardForm(card, formName, initialValue = "") {
  const targetForm = card.querySelector(`[data-form="${formName}"]`);
  const isOpening = targetForm.classList.contains("card-form--closed");

  card.querySelectorAll(".card-form").forEach((form) => {
    form.classList.add("card-form--closed");
    form.setAttribute("aria-hidden", "true");
    form.querySelectorAll("input, button").forEach((control) => {
      control.disabled = true;
    });
  });

  if (!isOpening) return;

  targetForm.classList.remove("card-form--closed");
  targetForm.setAttribute("aria-hidden", "false");
  targetForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = false;
  });
  const input = targetForm.querySelector("input");
  input.value = initialValue;
  window.requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function renderSessions(sessions) {
  sessionsEl.replaceChildren();

  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<h3>No sessions yet</h3><p>Create a tmux session to begin.</p>";
    sessionsEl.append(empty);
    return;
  }

  for (const session of sessions) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = session.name;
    node.querySelector(".meta").textContent = describeSession(session);
    node.querySelector(".status-pill").textContent = session.attached ? "Attached" : "Detached";
    node.querySelector(".status-pill").dataset.attached = String(session.attached);

    const attachButton = node.querySelector('[data-action="attach"]');
    attachButton.textContent = session.attached ? "Control" : "Attach";
    attachButton.addEventListener("click", () => {
      if (session.attached) {
        openControlView(session);
        return;
      }

      attachSession(session.id || session.name);
    });

    node.querySelector('[data-action="newWindow"]').addEventListener("click", () => {
      toggleCardForm(node, "newWindow", "shell");
    });
    node.querySelector('[data-action="rename"]').addEventListener("click", () => {
      toggleCardForm(node, "rename", session.name);
    });
    node.querySelector('[data-action="detach"]').addEventListener("click", () => detachSession(session.id || session.name));

    node.querySelector('[data-form="newWindow"]').addEventListener("submit", (event) => {
      event.preventDefault();
      createWindow(session.id || session.name, new FormData(event.currentTarget).get("windowName"));
    });

    node.querySelector('[data-form="rename"]').addEventListener("submit", (event) => {
      event.preventDefault();
      renameSession(session.id || session.name, new FormData(event.currentTarget).get("sessionName"));
    });

    sessionsEl.append(node);
  }
}

async function openControlView(session) {
  activeControlSession = {
    id: session.id || session.name,
    name: session.name
  };
  const sessionTarget = activeControlSession.id;
  sessionsView.hidden = true;
  controlView.hidden = false;
  settingsView.hidden = true;
  setActiveNav("sessions");
  controlTitle.textContent = activeControlSession.name;
  controlSummary.textContent = "Loading window chooser...";
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
  controlWindowButtons.textContent = "Loading windows...";

  const result = await window.tmuxHelper.listWindows(sessionName);
  if (!result.ok) {
    controlSummary.textContent = "Unable to load windows.";
    controlWindowButtons.textContent = "";
    showControlAlert(result.stderr || "Could not load session windows.");
    return;
  }

  controlWindowButtons.replaceChildren();

  if (!result.windows.length) {
    controlSummary.textContent = "No windows found.";
    controlWindowButtons.textContent = "No windows found.";
    return;
  }

  const count = result.windows.length;
  controlSummary.textContent = count === 1 ? "Choose from 1 window" : `Choose from ${count} windows`;

  for (const windowInfo of result.windows) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = windowInfo.active ? "window-button window-button--active" : "window-button secondary";
    button.setAttribute("aria-pressed", String(windowInfo.active));
    button.textContent = describeWindow(windowInfo);
    button.addEventListener("click", () => selectWindow(sessionName, windowInfo.index));
    controlWindowButtons.append(button);
  }
}

async function refreshSessions() {
  if (!tmuxAvailable) {
    summaryEl.textContent = "Select tmux to load sessions.";
    renderSessions([]);
    return;
  }

  showAlert("");
  logCommand(formatTmuxCommand(["list-sessions"]));
  refreshButton.disabled = true;
  summaryEl.textContent = "Refreshing sessions...";

  const result = await window.tmuxHelper.listSessions();
  refreshButton.disabled = false;

  if (!result.ok) {
    summaryEl.textContent = "Unable to read tmux sessions.";
    showAlert(result.stderr || "tmux returned an error.");
    renderSessions([]);
    return;
  }

  const count = result.sessions.length;
  summaryEl.textContent = count === 1 ? "1 active session" : `${count} active sessions`;
  if (result.message) showAlert(result.message, "info");
  renderSessions(result.sessions);
}

async function createSession(name) {
  logCommand(formatTmuxCommand(["new-session", "-d", "-s", name]));
  const result = await window.tmuxHelper.createSession(name);
  if (!result.ok) {
    showAlert(result.stderr || "Could not create the session.");
    return;
  }
  createForm.reset();
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

  const sessionLabel = activeControlSession ? activeControlSession.name : sessionName;
  showControlAlert(`Opened choose-tree for ${sessionLabel}.`, "info");
}

async function selectWindow(sessionName, windowIndex) {
  logCommand(formatTmuxCommand(["select-window", "-t", `${sessionName}:${windowIndex}`]));
  const result = await window.tmuxHelper.selectWindow(sessionName, windowIndex);
  if (!result.ok) {
    showControlAlert(result.stderr || "Could not select this tmux window.");
    return;
  }

  const sessionLabel = activeControlSession ? activeControlSession.name : sessionName;
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

function updateTmuxStatus(status) {
  tmuxAvailable = Boolean(status.ok);
  createForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = !tmuxAvailable;
  });
  refreshButton.disabled = !tmuxAvailable;
  tmuxPathInput.value = status.path || "No tmux executable selected";

  if (status.ok) {
    statusEl.textContent = status.path ? `${status.version} at ${status.path}` : status.version;
    return;
  }

  statusEl.textContent = status.error || "tmux was not found.";
  summaryEl.textContent = "Select tmux to load sessions.";
  showAlert(`Tmux Helper could not find tmux. Run ${status.checkCommand || "command -v tmux"} in Terminal, then select the tmux executable.`, "info");
}

function renderTerminalOptions(settings) {
  terminalOptions.replaceChildren();

  const selected = settings.terminalOptions.find((option) => option.id === settings.terminal);
  selectedTerminalLabel.textContent = selected ? selected.label : "Choose terminal";

  for (const option of settings.terminalOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = option.id === settings.terminal ? "" : "secondary";
    button.textContent = option.label;
    button.addEventListener("click", () => selectTerminal(option.id));
    terminalOptions.append(button);
  }
}

function renderOrchestratorStatus(orchestrator) {
  latestOrchestratorStatus = orchestrator;
  const enabled = Boolean(orchestrator && orchestrator.enabled);
  const active = Boolean(orchestrator && orchestrator.active);
  const configured = Boolean(orchestrator && orchestrator.configured);
  const updateAvailable = active && Boolean(orchestrator && orchestrator.updateAvailable);
  const checking = Boolean(orchestrator && orchestrator.git && orchestrator.git.checking);
  const folderPath = orchestrator && orchestrator.path ? orchestrator.path : "";
  const chipState = !enabled ? "off" : updateAvailable ? "update-available" : active ? "on" : "incomplete";
  const chipLoading = orchestratorChipLoading || checking;

  orchestratorChipState = chipState;
  orchestratorChip.textContent = chipLoading ? "Checking orchestrator..." : chipState === "update-available" ? "Orchestrator update available" : chipState === "on" ? "Orchestrator On" : chipState === "incomplete" ? "Complete setting" : "Orchestrator Off";
  orchestratorChip.dataset.state = chipState;
  orchestratorChip.dataset.loading = String(chipLoading);
  orchestratorChip.disabled = chipState === "on" || chipLoading;
  orchestratorChip.setAttribute("aria-disabled", String(orchestratorChip.disabled));
  orchestratorToggle.checked = enabled;
  orchestratorToggleLabel.textContent = enabled ? "On" : "Off";
  orchestratorPathInput.value = configured ? folderPath : "No orchestrator folder selected";
  selectOrchestratorButton.hidden = !enabled;
  orchestratorSetupSection.hidden = chipState === "off";

  if (chipState !== "off") {
    toggleExplorerSection(orchestratorSetupToggle, orchestratorSetupPanel, chipState === "on");
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
  selectTmuxButton.disabled = true;
  showSettingsAlert("");
  const result = await window.tmuxHelper.choosePath();
  selectTmuxButton.disabled = false;

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
  showSettingsAlert(`Tmux will open in ${selectedTerminalLabel.textContent}.`, "info");
}

async function setOrchestratorEnabled(enabled) {
  orchestratorToggle.disabled = true;
  showSettingsAlert("");

  const result = await window.tmuxHelper.setOrchestratorEnabled(enabled);
  orchestratorToggle.disabled = false;
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
  selectOrchestratorButton.disabled = true;
  showSettingsAlert("");

  const result = await window.tmuxHelper.chooseOrchestratorPath();
  selectOrchestratorButton.disabled = false;
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
  if (orchestratorChipState === "on" || orchestratorChipLoading) return;

  if (orchestratorChipState === "update-available") {
    orchestratorChipLoading = true;
    renderOrchestratorStatus(latestOrchestratorStatus);
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
      orchestratorChipLoading = false;
      const settings = await window.tmuxHelper.getSettings();
      renderOrchestratorStatus(settings.orchestrator);
    }
    return;
  }

  showSettingsView();
}

createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createSession(new FormData(createForm).get("sessionName"));
});

refreshButton.addEventListener("click", refreshSessions);
sessionsNavButton.addEventListener("click", showSessionsView);
settingsNavButton.addEventListener("click", showSettingsView);
selectTmuxButton.addEventListener("click", chooseTmuxPath);
selectOrchestratorButton.addEventListener("click", chooseOrchestratorPath);
orchestratorChip.addEventListener("click", activateOrchestratorChip);
backButton.addEventListener("click", closeControlView);
clearConsoleButton.addEventListener("click", () => {
  commandConsole.textContent = "";
});
chooseTreeButton.addEventListener("click", () => {
  if (!activeControlSession) return;
  chooseTree(activeControlSession.id);
});
refreshWindowsButton.addEventListener("click", () => {
  if (!activeControlSession) return;
  loadControlWindows(activeControlSession.id);
});

newSessionToggle.addEventListener("click", () => {
  const isExpanded = newSessionToggle.getAttribute("aria-expanded") === "true";
  toggleExplorerSection(newSessionToggle, createForm, !isExpanded);
});

commandToggle.addEventListener("click", () => {
  const isExpanded = commandToggle.getAttribute("aria-expanded") === "true";
  toggleExplorerSection(commandToggle, commandExamples, !isExpanded);
});

orchestratorSetupToggle.addEventListener("click", () => {
  const isExpanded = orchestratorSetupToggle.getAttribute("aria-expanded") === "true";
  toggleExplorerSection(orchestratorSetupToggle, orchestratorSetupPanel, !isExpanded);
});

consoleToggle.addEventListener("click", () => {
  const isExpanded = consoleToggle.getAttribute("aria-expanded") === "true";
  toggleExplorerSection(consoleToggle, consolePanel, !isExpanded);
});

terminalToggle.addEventListener("click", () => {
  const isExpanded = terminalToggle.getAttribute("aria-expanded") === "true";
  terminalToggle.setAttribute("aria-expanded", String(!isExpanded));
  terminalToggle.querySelector("[aria-hidden]").textContent = isExpanded ? "Show" : "Hide";
  terminalOptions.hidden = isExpanded;
});

orchestratorToggle.addEventListener("change", () => {
  setOrchestratorEnabled(orchestratorToggle.checked);
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

loadTmuxStatus().then((ok) => {
  if (ok) refreshSessions();
});
