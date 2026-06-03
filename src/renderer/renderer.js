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
const controlWindowButtons = document.querySelector("#controlWindowButtons");
const chooseTreeButton = document.querySelector("#chooseTreeButton");
const backButton = document.querySelector("#backButton");
const commandToggle = document.querySelector("#commandToggle");
const commandExamples = document.querySelector("#commandExamples");

let activeControlSession = "";
let tmuxAvailable = false;

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
  activeControlSession = "";
  sessionsView.hidden = false;
  controlView.hidden = true;
  settingsView.hidden = true;
  setActiveNav("sessions");
  showControlAlert("");
}

function showSettingsView() {
  activeControlSession = "";
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
        openControlView(session.name);
        return;
      }

      attachSession(session.name);
    });

    node.querySelector('[data-action="newWindow"]').addEventListener("click", () => {
      toggleCardForm(node, "newWindow", "shell");
    });
    node.querySelector('[data-action="rename"]').addEventListener("click", () => {
      toggleCardForm(node, "rename", session.name);
    });
    node.querySelector('[data-action="detach"]').addEventListener("click", () => detachSession(session.name));

    node.querySelector('[data-form="newWindow"]').addEventListener("submit", (event) => {
      event.preventDefault();
      createWindow(session.name, new FormData(event.currentTarget).get("windowName"));
    });

    node.querySelector('[data-form="rename"]').addEventListener("submit", (event) => {
      event.preventDefault();
      renameSession(session.name, new FormData(event.currentTarget).get("sessionName"));
    });

    sessionsEl.append(node);
  }
}

async function openControlView(sessionName) {
  activeControlSession = sessionName;
  sessionsView.hidden = true;
  controlView.hidden = false;
  settingsView.hidden = true;
  setActiveNav("sessions");
  controlTitle.textContent = sessionName;
  controlSummary.textContent = "Loading session windows...";
  showAlert("");
  showControlAlert("");
  await loadControlWindows(sessionName);
}

function closeControlView() {
  showSessionsView();
  showControlAlert("");
  refreshSessions();
}

async function loadControlWindows(sessionName) {
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
  controlSummary.textContent = count === 1 ? "1 window available" : `${count} windows available`;

  for (const windowInfo of result.windows) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = windowInfo.active ? "" : "secondary";
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

  const result = await window.tmuxHelper.renameSession(currentName, nextName);
  if (!result.ok) {
    showAlert(result.stderr || "Could not rename the session.");
    return;
  }

  await refreshSessions();
}

async function createWindow(sessionName, windowName) {
  const result = await window.tmuxHelper.newWindow(sessionName, windowName);
  if (!result.ok) {
    showAlert(result.stderr || "Could not create the tmux window.");
    return;
  }

  await refreshSessions();
}

async function detachSession(sessionName) {
  const result = await window.tmuxHelper.detachSession(sessionName);
  if (!result.ok) {
    showAlert(result.stderr || "Could not detach the session.");
    return;
  }

  await refreshSessions();
  if (result.stderr) showAlert(result.stderr, "info");
}

async function chooseTree(sessionName) {
  const result = await window.tmuxHelper.chooseTree(sessionName);
  if (!result.ok) {
    showControlAlert(result.stderr || "Could not open tmux choose-tree.");
    return;
  }

  showControlAlert(`Opened choose-tree for ${sessionName}.`, "info");
}

async function selectWindow(sessionName, windowIndex) {
  const result = await window.tmuxHelper.selectWindow(sessionName, windowIndex);
  if (!result.ok) {
    showControlAlert(result.stderr || "Could not select this tmux window.");
    return;
  }

  showControlAlert(`Selected ${sessionName}:${windowIndex}.`, "info");
  await loadControlWindows(sessionName);
}

async function attachSession(sessionName) {
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

async function loadSettings() {
  const settings = await window.tmuxHelper.getSettings();
  updateTmuxStatus(settings.tmux);
  renderTerminalOptions(settings);
}

async function loadTmuxStatus() {
  const settings = await window.tmuxHelper.getSettings();
  updateTmuxStatus(settings.tmux);
  renderTerminalOptions(settings);
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

createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createSession(new FormData(createForm).get("sessionName"));
});

refreshButton.addEventListener("click", refreshSessions);
sessionsNavButton.addEventListener("click", showSessionsView);
settingsNavButton.addEventListener("click", showSettingsView);
selectTmuxButton.addEventListener("click", chooseTmuxPath);
backButton.addEventListener("click", closeControlView);
chooseTreeButton.addEventListener("click", () => {
  if (!activeControlSession) return;
  chooseTree(activeControlSession);
});

commandToggle.addEventListener("click", () => {
  const isExpanded = commandToggle.getAttribute("aria-expanded") === "true";
  commandToggle.setAttribute("aria-expanded", String(!isExpanded));
  commandToggle.querySelector("[aria-hidden]").textContent = isExpanded ? "Show" : "Hide";
  commandExamples.hidden = isExpanded;
});

terminalToggle.addEventListener("click", () => {
  const isExpanded = terminalToggle.getAttribute("aria-expanded") === "true";
  terminalToggle.setAttribute("aria-expanded", String(!isExpanded));
  terminalToggle.querySelector("[aria-hidden]").textContent = isExpanded ? "Show" : "Hide";
  terminalOptions.hidden = isExpanded;
});

document.querySelectorAll(".command-row").forEach((row) => {
  const command = row.dataset.command;
  row.querySelector("[data-copy]").addEventListener("click", async () => {
    await window.tmuxHelper.copyCommand(command);
    showAlert(`Copied: ${command}`, "info");
  });
});

loadTmuxStatus().then((ok) => {
  if (ok) refreshSessions();
});
