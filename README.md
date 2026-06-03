# Tmux Helper

A small Electron desktop app for running common `tmux` commands from a focused UI.

## What it does

- Shows current tmux sessions.
- Creates, attaches to, renames, and kills sessions.
- Runs a curated set of common tmux commands.
- Copies command examples for use in a normal terminal.

The app keeps tmux command execution in Electron's main process and exposes only specific actions to the renderer.

## Requirements

- Node.js 20 or newer
- npm
- tmux available on your `PATH`
- Ghostty installed as the terminal app for launched commands

On macOS with Homebrew:

```sh
brew install tmux
brew install --cask ghostty
```

If Ghostty is not installed in `/Applications`, set `GHOSTTY_APP_PATH` before starting the app:

```sh
GHOSTTY_APP_PATH="/path/to/Ghostty.app" npm start
```

The app checks common install locations automatically. If it cannot find tmux, it will show this command to run in Terminal:

```sh
command -v tmux && tmux -V
```

Then use the app's `Select tmux` button to choose the executable path. You can also set `TMUX_PATH` before starting the app:

```sh
TMUX_PATH="/opt/homebrew/bin/tmux" npm start
```

## Setup

```sh
npm install
npm run check
npm start
```

## Package

```sh
npm run package:mac
```

The packaged app will be written to `dist/`.

## Notes

Attaching to a tmux session opens Ghostty and runs:

```sh
tmux attach-session -t <session>
```

The command examples in the sidebar can also be launched in Ghostty. They are intentionally curated instead of accepting arbitrary shell input from the renderer.

For best results, use the app for quick session management and keep long-running interactive work inside your terminal.
