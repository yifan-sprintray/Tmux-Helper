import { elements } from "./elements.js";
import { toggleCardForm } from "./view.js";

function describeSession(session) {
  const windows = session.windows === 1 ? "1 window" : `${session.windows} windows`;
  return `${windows} · created ${session.created || "unknown"}`;
}

function describeWindow(windowInfo) {
  const panes = windowInfo.panes === 1 ? "1 pane" : `${windowInfo.panes} panes`;
  return `${windowInfo.index}: ${windowInfo.name || "window"} · ${panes}`;
}

export function renderSessions(sessions, handlers) {
  elements.sessions.replaceChildren();

  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<h3>No sessions yet</h3><p>Create a tmux session to begin.</p>";
    elements.sessions.append(empty);
    return;
  }

  for (const session of sessions) {
    const node = elements.template.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = session.name;
    node.querySelector(".meta").textContent = describeSession(session);
    node.querySelector(".status-pill").textContent = session.attached ? "Attached" : "Detached";
    node.querySelector(".status-pill").dataset.attached = String(session.attached);

    const attachButton = node.querySelector('[data-action="attach"]');
    attachButton.textContent = session.attached ? "Control" : "Attach";
    attachButton.addEventListener("click", () => {
      if (session.attached) {
        handlers.openControlView(session);
        return;
      }

      handlers.attachSession(session.id || session.name);
    });

    node.querySelector('[data-action="newWindow"]').addEventListener("click", () => {
      toggleCardForm(node, "newWindow", "shell");
    });
    node.querySelector('[data-action="rename"]').addEventListener("click", () => {
      toggleCardForm(node, "rename", session.name);
    });
    node.querySelector('[data-action="detach"]').addEventListener("click", () => handlers.detachSession(session.id || session.name));

    node.querySelector('[data-form="newWindow"]').addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.createWindow(session.id || session.name, new FormData(event.currentTarget).get("windowName"));
    });

    node.querySelector('[data-form="rename"]').addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.renameSession(session.id || session.name, new FormData(event.currentTarget).get("sessionName"));
    });

    elements.sessions.append(node);
  }
}

export function renderWindowButtons(windows, sessionName, onSelectWindow) {
  elements.controlWindowButtons.replaceChildren();

  if (!windows.length) {
    elements.controlSummary.textContent = "No windows found.";
    elements.controlWindowButtons.textContent = "No windows found.";
    return;
  }

  const count = windows.length;
  elements.controlSummary.textContent = count === 1 ? "Choose from 1 window" : `Choose from ${count} windows`;

  for (const windowInfo of windows) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = windowInfo.active ? "window-button window-button--active" : "window-button secondary";
    button.setAttribute("aria-pressed", String(windowInfo.active));
    button.textContent = describeWindow(windowInfo);
    button.addEventListener("click", () => onSelectWindow(sessionName, windowInfo.index));
    elements.controlWindowButtons.append(button);
  }
}
