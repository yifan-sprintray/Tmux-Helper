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
const GHOSTTY_APP_CANDIDATES = [
  process.env.GHOSTTY_APP_PATH,
  "/Applications/Ghostty.app",
  "/Volumes/Workspace/Applications/Ghostty.app"
].filter(Boolean);
let selectedTmuxPath = "";
let selectedTerminal = "ghostty";

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
  return options.some((option) => option.id === terminalId) ? terminalId : options[0].id;
}

function readSettings() {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), "utf8"));
    return {
      tmuxPath: typeof config.tmuxPath === "string" ? config.tmuxPath : "",
      terminal: normalizeTerminal(config.terminal)
    };
  } catch {
    try {
      const legacyConfig = JSON.parse(fs.readFileSync(getLegacyTmuxConfigPath(), "utf8"));
      return {
        tmuxPath: typeof legacyConfig.tmuxPath === "string" ? legacyConfig.tmuxPath : "",
        terminal: normalizeTerminal("")
      };
    } catch {
      return { tmuxPath: "", terminal: normalizeTerminal("") };
    }
  }
}

function writeSettings() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify({
    tmuxPath: selectedTmuxPath,
    terminal: selectedTerminal
  }, null, 2));
}

function getSettings() {
  return {
    tmux: getTmuxStatus(),
    terminal: selectedTerminal,
    terminalOptions: getTerminalOptions()
  };
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
  const command = `PATH=${shellSingleQuote(COMMAND_ENV.PATH)} ${tmuxCommand} attach-session -t ${shellSingleQuote(sessionName)}`;

  if (process.platform === "darwin") {
    if (selectedTerminal === "terminal") return openMacTerminal(command);
    if (selectedTerminal === "iterm2") return openIterm(command);
    return openGhostty(command);
  }

  if (process.platform === "linux") {
    spawn("x-terminal-emulator", ["-e", findTmux(), "attach-session", "-t", sessionName], {
      detached: true,
      stdio: "ignore",
      env: COMMAND_ENV
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

  ipcMain.handle("settings:get", async () => {
    return getSettings();
  });

  ipcMain.handle("settings:setTerminal", async (_event, terminalId) => {
    selectedTerminal = normalizeTerminal(String(terminalId || ""));
    writeSettings();
    return getSettings();
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

    return runTmux(["new-session", "-d", "-s", cleanName]);
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

    return runTmux(name ? ["new-window", "-t", target, "-n", name] : ["new-window", "-t", target]);
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
