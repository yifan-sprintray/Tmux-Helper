const { dialog } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { COMMAND_ENV, TMUX_FIELD_SEPARATOR } = require("./config");
const { state } = require("./state");
const { writeSettings } = require("./settings");

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
    state.selectedTmuxPath,
    process.env.TMUX_PATH,
    ...COMMAND_ENV.PATH.split(path.delimiter).map((entry) => path.join(entry, "tmux"))
  ].filter(Boolean);

  return candidates.find((candidate) => path.isAbsolute(candidate) && isExecutable(candidate)) || "tmux";
}

function tmuxNotFoundMessage() {
  return "tmux was not found. Run `command -v tmux` in Terminal to check its path, then select the tmux executable.";
}

function getTmuxStatus() {
  const tmuxPath = findTmux();
  const tmux = spawnSync(tmuxPath, ["-V"], { encoding: "utf8", env: COMMAND_ENV });
  const ok = tmux.status === 0;

  if (!ok && state.selectedTmuxPath && tmuxPath === state.selectedTmuxPath) {
    state.selectedTmuxPath = "";
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

  state.selectedTmuxPath = tmuxPath;
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

module.exports = {
  chooseTmuxPath,
  findTmux,
  getTmuxStatus,
  listSessions,
  listWindows,
  runTmux
};
