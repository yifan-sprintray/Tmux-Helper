const { app, BrowserWindow, ipcMain, clipboard, dialog } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PATH_ENTRIES = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin"
];
const COMMAND_ENV = {
  ...process.env,
  PATH: [
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean),
    ...DEFAULT_PATH_ENTRIES
  ].filter((entry, index, entries) => entries.indexOf(entry) === index).join(path.delimiter)
};
const TMUX_FIELD_SEPARATOR = "|||";
const ORCHESTRATOR_REQUIRED_FILES = [
  "schedule_with_note.sh",
  "send-claude-message.sh"
];
const ORCHESTRATOR_REPO = {
  https: "https://github.com/Jedward23/Tmux-Orchestrator.git",
  ssh: "git@github.com:Jedward23/Tmux-Orchestrator.git"
};
const GHOSTTY_APP_CANDIDATES = [
  process.env.GHOSTTY_APP_PATH,
  "/Applications/Ghostty.app",
  "/Volumes/Workspace/Applications/Ghostty.app"
].filter(Boolean);
let selectedTmuxPath = "";
let selectedTerminal = "ghostty";
let orchestratorEnabled = false;
let orchestratorPath = "";
let orchestratorGitStatus = {
  isGitRepo: false,
  checking: false,
  updateAvailable: false,
  error: ""
};

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findTmux() {
  const candidates = [
    selectedTmuxPath,
    process.env.TMUX_PATH,
    ...COMMAND_ENV.PATH.split(path.delimiter).map((entry) => path.join(entry, "tmux"))
  ].filter(Boolean);

  return candidates.find((candidate) => path.isAbsolute(candidate) && isExecutable(candidate)) || "tmux";
}

function tmuxNotFoundMessage() {
  return "tmux was not found. Run `command -v tmux` in Terminal to check its path, then select the tmux executable.";
}

const TERMINAL_OPTIONS = {
  darwin: [
    { id: "ghostty", label: "Ghostty" },
    { id: "terminal", label: "Terminal.app" },
    { id: "iterm2", label: "iTerm2" }
  ],
  linux: [
    { id: "x-terminal-emulator", label: "System terminal" }
  ]
};
const DEFAULT_TERMINAL_BY_PLATFORM = {
  darwin: "terminal",
  linux: "x-terminal-emulator"
};

function getConfigPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getLegacyTmuxConfigPath() {
  return path.join(app.getPath("userData"), "tmux-path.json");
}

function getTerminalOptions() {
  return TERMINAL_OPTIONS[process.platform] || TERMINAL_OPTIONS.darwin;
}

function normalizeTerminal(terminalId) {
  const options = getTerminalOptions();
  const defaultTerminal = DEFAULT_TERMINAL_BY_PLATFORM[process.platform] || options[0].id;
  return options.some((option) => option.id === terminalId) ? terminalId : defaultTerminal;
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
    tmuxPath: selectedTmuxPath,
    terminal: selectedTerminal,
    orchestratorEnabled,
    orchestratorPath
  }, null, 2));
}

function initializeFirstStartSettings() {
  if (settingsFileExists()) return;

  const tmuxStatus = getTmuxStatus();
  if (tmuxStatus.ok && tmuxStatus.path) {
    selectedTmuxPath = tmuxStatus.path;
  }

  writeSettings();
}

function resetOrchestratorGitStatus() {
  orchestratorGitStatus = {
    isGitRepo: false,
    checking: false,
    updateAvailable: false,
    error: ""
  };
}

function runGit(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      env: COMMAND_ENV,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({ ok: false, stdout: stdout.trim(), stderr: error.message, code: 1 });
    });

    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}

async function checkOrchestratorUpdates() {
  const folderPath = getActiveOrchestratorPath();
  if (!folderPath) {
    resetOrchestratorGitStatus();
    return getOrchestratorStatus();
  }

  orchestratorGitStatus = {
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
    orchestratorGitStatus = {
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
    orchestratorGitStatus = {
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
  orchestratorGitStatus = {
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
  orchestratorGitStatus = {
    ...orchestratorGitStatus,
    checking: true,
    error: ""
  };
  notifyOrchestratorStatusChanged();

  const pull = await runGit(["pull", "--ff-only"], folderPath);
  if (!pull.ok) {
    orchestratorGitStatus = {
      ...orchestratorGitStatus,
      checking: false,
      error: pull.stderr || pull.stdout || "git pull failed."
    };
    notifyOrchestratorStatusChanged();
    return { ok: false, error: orchestratorGitStatus.error, status: getOrchestratorStatus() };
  }

  const nextStatus = await checkOrchestratorUpdates();
  return { ok: true, status: nextStatus };
}

function notifyOrchestratorStatusChanged() {
  const status = getOrchestratorStatus();
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send("orchestrator:statusChanged", status);
  });
}

function getSettings() {
  return {
    tmux: getTmuxStatus(),
    terminal: selectedTerminal,
    terminalOptions: getTerminalOptions(),
    orchestrator: getOrchestratorStatus()
  };
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
  if (orchestratorPath && !isValidOrchestratorFolder(orchestratorPath)) {
    orchestratorPath = "";
    writeSettings();
  }

  const configured = Boolean(orchestratorPath);

  return {
    enabled: orchestratorEnabled,
    active: orchestratorEnabled && configured,
    configured,
    path: orchestratorPath,
    valid: configured,
    updateAvailable: orchestratorGitStatus.updateAvailable,
    git: orchestratorGitStatus,
    requiredFiles: ORCHESTRATOR_REQUIRED_FILES
  };
}

function getActiveOrchestratorPath() {
  const status = getOrchestratorStatus();
  return status.active ? status.path : "";
}

function withWorkingDirectory(command, workingDirectory) {
  if (!workingDirectory) return command;
  return `cd ${shellSingleQuote(workingDirectory)} && ${command}`;
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
    orchestratorPath = folderPath;
    orchestratorEnabled = true;
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

  orchestratorPath = destination;
  orchestratorEnabled = true;
  resetOrchestratorGitStatus();
  writeSettings();
  return { ok: true, status: getOrchestratorStatus() };
}

async function setOrchestratorEnabled(parentWindow, enabled) {
  if (!enabled) {
    orchestratorEnabled = false;
    resetOrchestratorGitStatus();
    writeSettings();
    return { ok: true, status: getOrchestratorStatus() };
  }

  if (isValidOrchestratorFolder(orchestratorPath)) {
    orchestratorEnabled = true;
    writeSettings();
    return { ok: true, status: getOrchestratorStatus() };
  }

  orchestratorEnabled = false;
  orchestratorPath = "";
  resetOrchestratorGitStatus();
  writeSettings();

  const selectedFolder = await chooseOrchestratorFolder(parentWindow);
  if (selectedFolder.ok || selectedFolder.canceled) return selectedFolder;

  const clonedFolder = await promptCloneOrchestrator(parentWindow);
  if (clonedFolder.ok) return clonedFolder;

  orchestratorEnabled = false;
  orchestratorPath = "";
  resetOrchestratorGitStatus();
  writeSettings();
  return clonedFolder;
}

async function chooseOrchestratorPath(parentWindow) {
  const selectedFolder = await chooseOrchestratorFolder(parentWindow);
  if (selectedFolder.ok || selectedFolder.canceled) return selectedFolder;

  return promptCloneOrchestrator(parentWindow);
}

function getTmuxStatus() {
  const tmuxPath = findTmux();
  const tmux = spawnSync(tmuxPath, ["-V"], { encoding: "utf8", env: COMMAND_ENV });
  const ok = tmux.status === 0;

  if (!ok && selectedTmuxPath && tmuxPath === selectedTmuxPath) {
    selectedTmuxPath = "";
    return getTmuxStatus();
  }

  return {
    ok,
    path: ok && path.isAbsolute(tmuxPath) ? tmuxPath : "",
    version: ok ? (tmux.stdout || tmux.stderr || "").trim() : "",
    error: ok ? "" : tmuxNotFoundMessage(),
    checkCommand: "command -v tmux && tmux -V"
  };
}

async function chooseTmuxPath(parentWindow) {
  const { response } = await dialog.showMessageBox(parentWindow, {
    type: "info",
    buttons: ["Select tmux", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Select tmux executable",
    message: "Tmux Helper could not find tmux automatically.",
    detail: "In Terminal, run `command -v tmux && tmux -V` to check the executable path and version. Then select the tmux executable file."
  });
  if (response !== 0) return { ok: false, canceled: true };

  const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, {
    title: "Select tmux executable",
    buttonLabel: "Use tmux",
    properties: ["openFile", "showHiddenFiles"]
  });

  if (canceled || !filePaths.length) return { ok: false, canceled: true };

  const tmuxPath = filePaths[0];
  if (!isExecutable(tmuxPath)) {
    return { ok: false, error: "The selected file is not executable." };
  }

  const tmux = spawnSync(tmuxPath, ["-V"], { encoding: "utf8", env: COMMAND_ENV });
  if (tmux.status !== 0 || !/tmux/i.test(`${tmux.stdout}${tmux.stderr}`)) {
    return { ok: false, error: "The selected file did not respond like tmux." };
  }

  selectedTmuxPath = tmuxPath;
  writeSettings();
  return { ok: true, status: getTmuxStatus() };
}

function runTmux(args) {
  return new Promise((resolve) => {
    const child = spawn(findTmux(), args, {
      env: COMMAND_ENV,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        stdout,
        stderr: error.code === "ENOENT" ? tmuxNotFoundMessage() : error.message,
        code: 1
      });
    });

    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}

function splitTmuxFields(line) {
  if (line.includes(TMUX_FIELD_SEPARATOR)) return line.split(TMUX_FIELD_SEPARATOR);
  if (line.includes("\t")) return line.split("\t");
  return line.trim().split(/\s+/);
}

function parseSessions(output) {
  if (!output) return [];

  return output.split("\n").filter(Boolean).map((line) => {
    const fields = splitTmuxFields(line);
    const [id, name, windows, attached, created, activity] = fields;
    return {
      id,
      name: name || id || "",
      windows: Number(windows || 0),
      attached: Number(attached || 0) > 0,
      created,
      activity
    };
  });
}

function parseAttachedSessions(output) {
  const attached = {
    ids: new Set(),
    names: new Set()
  };

  if (!output) return attached;

  output.split("\n").filter(Boolean).forEach((line) => {
    const fields = splitTmuxFields(line);
    const [id, name] = fields;
    if (id) attached.ids.add(id);
    if (name) attached.names.add(name);
  });

  return attached;
}

function parseAttachedSessionNamesFromList(output) {
  if (!output) return new Set();

  const attachedPattern = /\((?:[^)]*,\s*)?attached(?:,\s*[^)]*)?\)/i;

  return new Set(output.split("\n").reduce((names, line) => {
    if (!attachedPattern.test(line)) return names;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex > 0) {
      names.push(line.slice(0, separatorIndex));
    }

    return names;
  }, []));
}

function parseWindows(output) {
  if (!output) return [];

  return output.split("\n").filter(Boolean).reduce((windows, line) => {
    const [index, name, active, panes] = splitTmuxFields(line);
    const windowIndex = Number(index);

    if (!Number.isInteger(windowIndex) || windowIndex < 0) return windows;

    const paneCount = Number(panes);
    windows.push({
      index: windowIndex,
      name: name || "",
      active: active === "1",
      panes: Number.isInteger(paneCount) && paneCount >= 0 ? paneCount : 0
    });

    return windows;
  }, []);
}

function formatTmuxFields(fields) {
  return fields.join(TMUX_FIELD_SEPARATOR);
}

async function listSessions() {
  const result = await runTmux([
    "list-sessions",
    "-F",
    formatTmuxFields([
      "#{session_id}",
      "#{session_name}",
      "#{session_windows}",
      "#{session_attached}",
      "#{session_created_string}",
      "#{session_activity_string}"
    ])
  ]);

  if (!result.ok && /no server running|failed to connect/i.test(result.stderr)) {
    return { ok: true, sessions: [], message: "No tmux server is running." };
  }

  if (!result.ok) return { ...result, sessions: [] };

  const sessions = parseSessions(result.stdout);
  const clients = await runTmux([
    "list-clients",
    "-F",
    formatTmuxFields(["#{session_id}", "#{client_session}"])
  ]);
  if (clients.ok) {
    const attachedSessions = parseAttachedSessions(clients.stdout);
    sessions.forEach((session) => {
      session.attached = session.attached ||
        attachedSessions.ids.has(session.id) ||
        attachedSessions.names.has(session.name);
    });
  }

  const attachedList = await runTmux(["list-sessions"]);
  if (attachedList.ok) {
    const attachedSessionNames = parseAttachedSessionNamesFromList(attachedList.stdout);
    sessions.forEach((session) => {
      session.attached = session.attached || attachedSessionNames.has(session.name);
    });
  }

  return { ...result, sessions };
}

async function listWindows(sessionName) {
  const result = await runTmux([
    "list-windows",
    "-t",
    sessionName,
    "-F",
    formatTmuxFields([
      "#{window_index}",
      "#{window_name}",
      "#{window_active}",
      "#{window_panes}"
    ])
  ]);

  return { ...result, windows: result.ok ? parseWindows(result.stdout) : [] };
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function findGhosttyApp() {
  return GHOSTTY_APP_CANDIDATES.find((candidate) => fs.existsSync(candidate));
}

function openGhostty(command) {
  return new Promise((resolve) => {
    const appPath = findGhosttyApp();
    if (!appPath) {
      resolve({
        ok: false,
        stderr: "Ghostty.app was not found. Set GHOSTTY_APP_PATH or install Ghostty in /Applications."
      });
      return;
    }

    const child = spawn("open", [
      "-na",
      appPath,
      "--args",
      "-e",
      "zsh",
      "-lc",
      command
    ], {
      env: COMMAND_ENV,
      windowsHide: true
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({ ok: false, stderr: error.message });
    });

    child.on("close", (code) => {
      resolve({ ok: code === 0, stderr: stderr.trim(), code });
    });
  });
}

function runAppleScript(script) {
  return new Promise((resolve) => {
    const child = spawn("osascript", ["-e", script], {
      env: COMMAND_ENV,
      windowsHide: true
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({ ok: false, stderr: error.message });
    });

    child.on("close", (code) => {
      resolve({ ok: code === 0, stderr: stderr.trim(), code });
    });
  });
}

function openMacTerminal(command) {
  const script = [
    'tell application "Terminal"',
    `do script ${JSON.stringify(command)}`,
    "activate",
    "end tell"
  ].join("\n");

  return runAppleScript(script);
}

function openIterm(command) {
  const script = [
    'tell application "iTerm2"',
    "create window with default profile",
    "tell current session of current window",
    `write text ${JSON.stringify(command)}`,
    "end tell",
    "activate",
    "end tell"
  ].join("\n");

  return runAppleScript(script);
}

async function openAttachTerminal(sessionName) {
  const tmuxCommand = shellSingleQuote(findTmux());
  const attachCommand = `PATH=${shellSingleQuote(COMMAND_ENV.PATH)} ${tmuxCommand} attach-session -t ${shellSingleQuote(sessionName)}`;
  const command = withWorkingDirectory(attachCommand, getActiveOrchestratorPath());

  if (process.platform === "darwin") {
    if (selectedTerminal === "terminal") return openMacTerminal(command);
    if (selectedTerminal === "iterm2") return openIterm(command);
    return openGhostty(command);
  }

  if (process.platform === "linux") {
    const workingDirectory = getActiveOrchestratorPath() || undefined;
    spawn("x-terminal-emulator", ["-e", findTmux(), "attach-session", "-t", sessionName], {
      detached: true,
      stdio: "ignore",
      env: COMMAND_ENV,
      cwd: workingDirectory
    }).unref();
    return { ok: true };
  }

  return { ok: false, stderr: "Attach is currently supported on macOS and Linux." };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    title: "Tmux Helper",
    backgroundColor: "#101214",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  const settings = readSettings();
  selectedTmuxPath = settings.tmuxPath;
  selectedTerminal = settings.terminal;
  orchestratorEnabled = settings.orchestratorEnabled;
  orchestratorPath = settings.orchestratorPath;
  initializeFirstStartSettings();

  ipcMain.handle("settings:get", async () => {
    return getSettings();
  });

  ipcMain.handle("settings:setTerminal", async (_event, terminalId) => {
    selectedTerminal = normalizeTerminal(String(terminalId || ""));
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
