const { spawn } = require("node:child_process");

const { COMMAND_ENV } = require("./config");

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

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

module.exports = {
  runGit,
  shellSingleQuote
};
