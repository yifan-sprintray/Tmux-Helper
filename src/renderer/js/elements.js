export const elements = {
  sessions: document.querySelector("#sessions"),
  summary: document.querySelector("#summary"),
  alert: document.querySelector("#alert"),
  status: document.querySelector("#tmuxStatus"),
  selectTmuxButton: document.querySelector("#selectTmuxButton"),
  template: document.querySelector("#sessionTemplate"),
  createForm: document.querySelector("#createSessionForm"),
  refreshButton: document.querySelector("#refreshButton"),
  sessionsNavButton: document.querySelector("#sessionsNavButton"),
  settingsNavButton: document.querySelector("#settingsNavButton"),
  sessionsView: document.querySelector("#sessionsView"),
  controlView: document.querySelector("#controlView"),
  settingsView: document.querySelector("#settingsView"),
  controlTitle: document.querySelector("#controlTitle"),
  controlSummary: document.querySelector("#controlSummary"),
  controlAlert: document.querySelector("#controlAlert"),
  settingsAlert: document.querySelector("#settingsAlert"),
  tmuxPathInput: document.querySelector("#tmuxPathInput"),
  terminalToggle: document.querySelector("#terminalToggle"),
  selectedTerminalLabel: document.querySelector("#selectedTerminalLabel"),
  terminalOptions: document.querySelector("#terminalOptions"),
  orchestratorChip: document.querySelector("#orchestratorChip"),
  orchestratorToggle: document.querySelector("#orchestratorToggle"),
  orchestratorToggleLabel: document.querySelector("#orchestratorToggleLabel"),
  orchestratorPathInput: document.querySelector("#orchestratorPathInput"),
  selectOrchestratorButton: document.querySelector("#selectOrchestratorButton"),
  controlWindowButtons: document.querySelector("#controlWindowButtons"),
  chooseTreeButton: document.querySelector("#chooseTreeButton"),
  refreshWindowsButton: document.querySelector("#refreshWindowsButton"),
  backButton: document.querySelector("#backButton"),
  newSessionToggle: document.querySelector("#newSessionToggle"),
  commandToggle: document.querySelector("#commandToggle"),
  commandExamples: document.querySelector("#commandExamples"),
  orchestratorSetupSection: document.querySelector("#orchestratorSetupSection"),
  orchestratorSetupToggle: document.querySelector("#orchestratorSetupToggle"),
  orchestratorSetupPanel: document.querySelector("#orchestratorSetupPanel"),
  consoleToggle: document.querySelector("#consoleToggle"),
  consolePanel: document.querySelector("#consolePanel"),
  commandConsole: document.querySelector("#commandConsole"),
  clearConsoleButton: document.querySelector("#clearConsoleButton")
};

export function initializeReadonlyInputs() {
  for (const pathInput of [elements.tmuxPathInput, elements.orchestratorPathInput]) {
    pathInput.readOnly = true;
    pathInput.setAttribute("aria-readonly", "true");
  }
}
