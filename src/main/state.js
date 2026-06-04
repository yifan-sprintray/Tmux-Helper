const state = {
  selectedTmuxPath: "",
  selectedTerminal: "ghostty",
  orchestratorEnabled: false,
  orchestratorPath: "",
  orchestratorGitStatus: {
    isGitRepo: false,
    checking: false,
    updateAvailable: false,
    error: ""
  }
};

function resetOrchestratorGitStatus() {
  state.orchestratorGitStatus = {
    isGitRepo: false,
    checking: false,
    updateAvailable: false,
    error: ""
  };
}

module.exports = {
  resetOrchestratorGitStatus,
  state
};
