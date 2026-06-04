import { elements } from "./elements.js";
import { state } from "./state.js";

export function showAlert(message, type = "error") {
  elements.alert.textContent = message;
  elements.alert.dataset.type = type;
  elements.alert.hidden = !message;
}

export function showControlAlert(message, type = "error") {
  elements.controlAlert.textContent = message;
  elements.controlAlert.dataset.type = type;
  elements.controlAlert.hidden = !message;
}

export function showSettingsAlert(message, type = "error") {
  elements.settingsAlert.textContent = message;
  elements.settingsAlert.dataset.type = type;
  elements.settingsAlert.hidden = !message;
}

function setActiveNav(viewName) {
  const isSettings = viewName === "settings";
  elements.sessionsNavButton.classList.toggle("nav-button--active", !isSettings);
  elements.settingsNavButton.classList.toggle("nav-button--active", isSettings);
  elements.sessionsNavButton.classList.toggle("secondary", isSettings);
  elements.settingsNavButton.classList.toggle("secondary", !isSettings);
}

export function showSessionsView() {
  state.activeControlSession = null;
  elements.sessionsView.hidden = false;
  elements.controlView.hidden = true;
  elements.settingsView.hidden = true;
  setActiveNav("sessions");
  showControlAlert("");
}

export function showSettingsView() {
  state.activeControlSession = null;
  elements.sessionsView.hidden = true;
  elements.controlView.hidden = true;
  elements.settingsView.hidden = false;
  setActiveNav("settings");
  showAlert("");
  showControlAlert("");
}

export function toggleExplorerSection(button, panel, expanded) {
  button.setAttribute("aria-expanded", String(expanded));
  button.querySelector("[aria-hidden]").textContent = expanded ? "v" : ">";
  panel.hidden = !expanded;
  panel.setAttribute("aria-hidden", String(!expanded));
}

export function toggleCardForm(card, formName, initialValue = "") {
  const targetForm = card.querySelector(`[data-form="${formName}"]`);
  const isOpening = targetForm.classList.contains("card-form--closed");

  card.querySelectorAll(".card-form").forEach((form) => {
    form.classList.add("card-form--closed");
    form.setAttribute("aria-hidden", "true");
    form.querySelectorAll("input, button").forEach((control) => {
      control.disabled = true;
    });
  });

  if (!isOpening) return;

  targetForm.classList.remove("card-form--closed");
  targetForm.setAttribute("aria-hidden", "false");
  targetForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = false;
  });
  const input = targetForm.querySelector("input");
  input.value = initialValue;
  window.requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}
