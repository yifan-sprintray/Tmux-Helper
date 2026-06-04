const { spawn } = require("node:child_process");
const fs = require("node:fs");

const { COMMAND_ENV, GHOSTTY_APP_CANDIDATES } = require("./config");
const { getActiveOrchestratorPath } = require("./orchestrator");
const { shellSingleQuote } = require("./process-utils");
const { state } = require("./state");
const { findTmux } = require("./tmux");

function withWorkingDirectory(command, workingDirectory) {
  if (!workingDirectory) return command;
  return `cd ${shellSingleQuote(workingDirectory)} && ${command}`;
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
    if (state.selectedTerminal === "terminal") return openMacTerminal(command);
    if (state.selectedTerminal === "iterm2") return openIterm(command);
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

module.exports = {
  openAttachTerminal
};
