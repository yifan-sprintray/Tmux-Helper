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

function getTerminalOptions() {
  return TERMINAL_OPTIONS[process.platform] || TERMINAL_OPTIONS.darwin;
}

function normalizeTerminal(terminalId) {
  const options = getTerminalOptions();
  const defaultTerminal = DEFAULT_TERMINAL_BY_PLATFORM[process.platform] || options[0].id;
  return options.some((option) => option.id === terminalId) ? terminalId : defaultTerminal;
}

module.exports = {
  COMMAND_ENV,
  GHOSTTY_APP_CANDIDATES,
  ORCHESTRATOR_REPO,
  ORCHESTRATOR_REQUIRED_FILES,
  TMUX_FIELD_SEPARATOR,
  getTerminalOptions,
  normalizeTerminal
};
