import { elements } from "./elements.js";

export function shellQuote(value) {
  const text = String(value || "");
  return /^[A-Za-z0-9_./:=+-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
}

export function formatTmuxCommand(args) {
  return `tmux ${args.map(shellQuote).join(" ")}`;
}

export function logCommand(command) {
  const line = `$ ${command}`;
  console.log(`[tmux-helper] ${line}`);
  elements.commandConsole.textContent = elements.commandConsole.textContent ? `${elements.commandConsole.textContent}\n${line}` : line;
  elements.commandConsole.scrollTop = elements.commandConsole.scrollHeight;
}
