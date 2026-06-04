const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const { normalizeTerminal } = require("./config");
const { state } = require("./state");

function getConfigPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getLegacyTmuxConfigPath() {
  return path.join(app.getPath("userData"), "tmux-path.json");
}

function settingsFileExists() {
  return fs.existsSync(getConfigPath());
}

function readSettings() {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), "utf8"));
    return {
      tmuxPath: typeof config.tmuxPath === "string" ? config.tmuxPath : "",
      terminal: normalizeTerminal(config.terminal),
      orchestratorEnabled: Boolean(config.orchestratorEnabled),
      orchestratorPath: typeof config.orchestratorPath === "string" ? config.orchestratorPath : ""
    };
  } catch {
    try {
      const legacyConfig = JSON.parse(fs.readFileSync(getLegacyTmuxConfigPath(), "utf8"));
      return {
        tmuxPath: typeof legacyConfig.tmuxPath === "string" ? legacyConfig.tmuxPath : "",
        terminal: normalizeTerminal(""),
        orchestratorEnabled: false,
        orchestratorPath: ""
      };
    } catch {
      return { tmuxPath: "", terminal: normalizeTerminal(""), orchestratorEnabled: false, orchestratorPath: "" };
    }
  }
}

function writeSettings() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify({
    tmuxPath: state.selectedTmuxPath,
    terminal: state.selectedTerminal,
    orchestratorEnabled: state.orchestratorEnabled,
    orchestratorPath: state.orchestratorPath
  }, null, 2));
}

function loadSettingsIntoState() {
  const settings = readSettings();
  state.selectedTmuxPath = settings.tmuxPath;
  state.selectedTerminal = settings.terminal;
  state.orchestratorEnabled = settings.orchestratorEnabled;
  state.orchestratorPath = settings.orchestratorPath;
}

function initializeFirstStartSettings(getTmuxStatus) {
  if (settingsFileExists()) return;

  const tmuxStatus = getTmuxStatus();
  if (tmuxStatus.ok && tmuxStatus.path) {
    state.selectedTmuxPath = tmuxStatus.path;
  }

  writeSettings();
}

module.exports = {
  initializeFirstStartSettings,
  loadSettingsIntoState,
  writeSettings
};
