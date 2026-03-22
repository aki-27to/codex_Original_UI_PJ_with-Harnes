"use strict";

const {
  defaultDesignAcceptanceContractPath,
  defaultTasteMemorySeedPath,
  evaluateIntentFirstGates,
  loadDesignAcceptanceContract,
  loadUserTasteMemoryStore,
  requiresWorkspaceLockForSource,
} = require("./intent_first_policy");

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function normalizeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value !== 0 : fallback;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeCompletionContract({ planningContext } = {}) {
  const context = planningContext && typeof planningContext === "object" ? planningContext : {};
  const selection = context.selection && typeof context.selection === "object" ? context.selection : {};
  const familyProfile = selection.familyProfile && typeof selection.familyProfile === "object" ? selection.familyProfile : {};
  const taskFamily = safeString(selection.taskFamily || (context.requirementContract && context.requirementContract.taskFamily), 80) || "deterministic_code";
  const familyProfileId = safeString(selection.familyProfileId || (context.requirementContract && context.requirementContract.familyProfileId), 80) || taskFamily;
  const completionContract = safeString(familyProfile.completionContract, 80)
    || (taskFamily === "web_creative" ? "design_acceptance" : "task_outcome_default");
  return {
    taskFamily,
    familyProfileId,
    completionContract,
  };
}

function inferWorkspaceLocked({ executionSource = "", cwd = "", workspaceLocked = null, contract } = {}) {
  if (typeof workspaceLocked === "boolean") return workspaceLocked;
  const requiresLock = requiresWorkspaceLockForSource({ contract, executionSource });
  if (!requiresLock) return true;
  return Boolean(safeString(cwd, 260));
}

function evaluateFamilyCompletion({
  planningContext = null,
  prompt = "",
  changedPaths = [],
  executionSource = "",
  cwd = "",
  workspaceLocked = null,
  docSyncComplete = false,
  visualEvidence = null,
  dispatchChildren = [],
  sampleMcpTools = [],
  sampleCommands = [],
  commandExecutions = 0,
  designAcceptanceContract = null,
  tasteMemoryStore = null,
} = {}) {
  const { taskFamily, familyProfileId, completionContract } = normalizeCompletionContract({ planningContext });
  if (completionContract !== "design_acceptance") {
    return {
      applies: false,
      taskFamily,
      familyProfileId,
      completionContract,
      status: "not_applicable",
      summary: "Family completion gate not applicable.",
      missingHard: [],
      executionSource: safeString(executionSource, 80).toLowerCase() || "",
      workspaceLockRequired: false,
      workspaceLockedObserved: true,
    };
  }
  const contract = loadDesignAcceptanceContract(designAcceptanceContract || defaultDesignAcceptanceContractPath);
  const store = tasteMemoryStore && typeof tasteMemoryStore === "object"
    ? tasteMemoryStore
    : loadUserTasteMemoryStore({ seedPath: defaultTasteMemorySeedPath });
  const locked = inferWorkspaceLocked({
    executionSource,
    cwd,
    workspaceLocked,
    contract,
  });
  const verdict = evaluateIntentFirstGates({
    contract,
    store,
    prompt,
    changedPaths,
    executionSource,
    forceApply: true,
    workspaceLocked: locked,
    docSyncComplete,
    visualEvidence,
    dispatchChildren,
    sampleMcpTools,
    sampleCommands,
    commandExecutions,
  });
  return {
    ...verdict,
    taskFamily,
    familyProfileId,
    completionContract,
    workspaceLockedObserved: locked,
  };
}

module.exports = {
  defaultDesignAcceptanceContractPath,
  defaultTasteMemorySeedPath,
  evaluateFamilyCompletion,
  inferWorkspaceLocked,
  loadDesignAcceptanceContract,
  loadUserTasteMemoryStore,
  normalizeCompletionContract,
};


