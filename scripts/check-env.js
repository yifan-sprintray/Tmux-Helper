const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

const ghosttyCandidates = [
  process.env.GHOSTTY_APP_PATH,
  "/Applications/Ghostty.app",
  "/Volumes/Workspace/Applications/Ghostty.app"
].filter(Boolean);

function version(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: (result.stdout || result.stderr || "").trim()
  };
}

const checks = [
  ["node", process.version],
  ["npm", version("npm").output],
  ["tmux", version("tmux", ["-V"]).output],
  ["ghostty", ghosttyCandidates.find((candidate) => fs.existsSync(candidate))]
];

let failed = false;

for (const [name, output] of checks) {
  if (!output) {
    failed = true;
    console.error(`${name}: not found`);
  } else {
    console.log(`${name}: ${output}`);
  }
}

if (failed) {
  process.exitCode = 1;
}
