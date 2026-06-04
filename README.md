# Tmux Helper

A small Electron desktop app for running common `tmux` commands from a focused UI, with optional [Tmux Orchestrator](https://github.com/Jedward23/Tmux-Orchestrator) integration.

## What it does

- Shows current tmux sessions.
- Creates, attaches to, renames, and kills sessions.
- Runs a curated set of common tmux commands.
- Copies command examples for use in a normal terminal.
- Integrates with Tmux Orchestrator: link an existing clone or clone it from the app, then check for updates and run the orchestrator setup prompts from the sidebar.

The app keeps tmux command execution in Electron's main process and exposes only specific actions to the renderer.

## Requirements

- Node.js 20 or newer
- npm
- tmux available on your `PATH`
- A terminal app for launching attached sessions. On macOS the app supports Terminal.app (default), Ghostty, and iTerm2. On Linux it uses `x-terminal-emulator`.
- `git` on your `PATH` if you want the app to clone or update Tmux Orchestrator for you.

On macOS with Homebrew:

```sh
brew install tmux
# Optional terminals
brew install --cask ghostty
brew install --cask iterm2
```

If Ghostty is not installed in `/Applications`, set `GHOSTTY_APP_PATH` before starting the app:

```sh
GHOSTTY_APP_PATH="/path/to/Ghostty.app" npm start
```

The app checks common install locations automatically. If it cannot find tmux, it will show this command to run in Terminal:

```sh
command -v tmux && tmux -V
```

Then use the app's `Choose Path` button under Settings → tmux location to select the executable. You can also set `TMUX_PATH` before starting the app:

```sh
TMUX_PATH="/opt/homebrew/bin/tmux" npm start
```

Pick which terminal to use under Settings → Run tmux in.

## Setup

```sh
npm install
npm run check
npm start
```

## Tmux Orchestrator

The Sessions toolbar shows an Orchestrator chip whose state reflects the current configuration. To turn it on:

1. Open Settings and toggle **Tmux Orchestrator** on.
2. Either point the app at an existing Tmux Orchestrator checkout, or let the app clone it from GitHub (HTTPS or SSH) into a folder you choose.

The folder must contain the required scripts `schedule_with_note.sh` and `send-claude-message.sh`.

Tmux Orchestrator works best with [Claude Code](https://docs.claude.com/en/docs/claude-code) — the sidebar prompts and the bundled `send-claude-message.sh` script are written against it. Other AI coding agents can also drive the orchestrator, but expect to adjust the prompts and helper scripts to match your agent's CLI and message format.

When the orchestrator is active:

- A **Tmux Orchestrator Setup** section appears in the sidebar with copy-able prompts to test the scripts, switch `claude` calls to `claude --dangerously-skip-permissions`, and kick off a project task.
- The app can `git fetch` the orchestrator folder to detect upstream changes and `git pull --ff-only` to update.

Toggling the orchestrator off keeps the folder selection saved but hides the setup section and stops the chip from showing as active.

## Package

```sh
npm run package:mac
```

The packaged app will be written to `dist/`.

## Notes

Attaching to a tmux session opens the configured terminal and runs:

```sh
tmux attach-session -t <session>
```

The command examples in the sidebar can also be launched in the configured terminal. They are intentionally curated instead of accepting arbitrary shell input from the renderer.

For best results, use the app for quick session management and keep long-running interactive work inside your terminal.
