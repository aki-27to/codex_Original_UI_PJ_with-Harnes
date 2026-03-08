"use strict";

function normalizeAgentName(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/[\s-]+/g, "_");
}

function normalizeParentComparableAgentName(normalizedAgentName, parentSet) {
  const normalized = typeof normalizedAgentName === "string" ? normalizedAgentName : "";
  if (!normalized) {
    return "";
  }
  if (!parentSet || parentSet.has(normalized)) {
    return normalized;
  }
  const scopeSep = normalized.indexOf("@");
  if (scopeSep > 0) {
    const base = normalized.slice(0, scopeSep);
    if (parentSet.has(base)) {
      return base;
    }
  }
  return normalized;
}

function normalizeParentDispatchGuardMode(value, fallback = "enforce") {
  const normalizedFallback = normalizeParentDispatchGuardModeInternal(fallback);
  const normalized = normalizeParentDispatchGuardModeInternal(value);
  return normalized || normalizedFallback || "enforce";
}

function normalizeParentDispatchGuardModeInternal(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "off" || normalized === "warn" || normalized === "enforce") {
    return normalized;
  }
  return "";
}

function normalizeParentAgentSet(parentAgents) {
  const source = Array.isArray(parentAgents) ? parentAgents : [];
  const set = new Set();
  for (const entry of source) {
    const normalized = normalizeAgentName(entry);
    if (!normalized) {
      continue;
    }
    set.add(normalized);
  }
  return set;
}

function toNonNegativeInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

function isSmokeLikeProfile(profile) {
  if (typeof profile !== "string") {
    return false;
  }
  const normalized = profile.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes("smoke") || normalized.includes("test") || normalized.includes("ci");
}

function detectImplementationWork({
  fileChanges = 0,
  changedFiles = 0,
  commandExecutions = 0,
  mcpCalls = 0,
} = {}) {
  const fileChangeCount = toNonNegativeInt(fileChanges);
  const changedFileCount = toNonNegativeInt(changedFiles);
  const commandCount = toNonNegativeInt(commandExecutions);
  const mcpCount = toNonNegativeInt(mcpCalls);
  return {
    observed: fileChangeCount > 0 || changedFileCount > 0 || commandCount > 0 || mcpCount > 0,
    fileChanges: fileChangeCount,
    changedFiles: changedFileCount,
    commandExecutions: commandCount,
    mcpCalls: mcpCount,
  };
}

function buildParentDispatchGuardRuntimeSnapshot({
  mode = "enforce",
  envKey = "CODEX_PARENT_DISPATCH_GUARD_MODE",
  maxRetries = 1,
  parentAgents = [],
} = {}) {
  const normalizedMode = normalizeParentDispatchGuardMode(mode, "enforce");
  const normalizedParents = Array.from(normalizeParentAgentSet(parentAgents).values());
  return {
    enabled: normalizedMode !== "off" ? 1 : 0,
    mode: normalizedMode,
    envKey: typeof envKey === "string" && envKey.trim() ? envKey.trim() : "CODEX_PARENT_DISPATCH_GUARD_MODE",
    maxRetries: toNonNegativeInt(maxRetries),
    parentAgents: normalizedParents,
  };
}

function evaluateParentDispatchGuard({
  mode = "enforce",
  parentAgents = [],
  agentName = "",
  executionProfile = "standard",
  finalStatus = "completed",
  fileChanges = 0,
  changedFiles = 0,
  commandExecutions = 0,
  mcpCalls = 0,
  dispatchCount = 0,
  dispatchSuccessCount = 0,
  dispatchFailureCount = 0,
  collabCalls = 0,
  attempt = 0,
  maxRetries = 1,
} = {}) {
  const normalizedMode = normalizeParentDispatchGuardMode(mode, "enforce");
  const parentSet = normalizeParentAgentSet(parentAgents);
  const normalizedAgentRaw = normalizeAgentName(agentName);
  const normalizedAgent = normalizeParentComparableAgentName(normalizedAgentRaw, parentSet);
  const parentAgent = parentSet.has(normalizedAgent);
  const smokeLike = isSmokeLikeProfile(executionProfile);
  const normalizedStatus = typeof finalStatus === "string" ? finalStatus.trim().toLowerCase() : "";
  const completedLike = normalizedStatus === "completed";
  const attempts = toNonNegativeInt(dispatchCount);
  const successes = toNonNegativeInt(dispatchSuccessCount);
  const failures = toNonNegativeInt(dispatchFailureCount);
  const collab = toNonNegativeInt(collabCalls);
  const currentAttempt = toNonNegativeInt(attempt);
  const maxRetryCount = toNonNegativeInt(maxRetries);
  const work = detectImplementationWork({
    fileChanges,
    changedFiles,
    commandExecutions,
    mcpCalls,
  });

  const enabled = normalizedMode !== "off";
  const required = Boolean(enabled && parentAgent && !smokeLike && completedLike && work.observed);
  const satisfied = !required || successes > 0;
  const violation = required && !satisfied;
  const reason = violation
    ? (attempts > 0 ? "dispatch_attempted_without_success" : "dispatch_not_attempted")
    : "";
  const retry = Boolean(violation && normalizedMode === "enforce" && currentAttempt < maxRetryCount);

  return {
    mode: normalizedMode,
    enabled: enabled ? 1 : 0,
    required: required ? 1 : 0,
    satisfied: satisfied ? 1 : 0,
    violation: violation ? 1 : 0,
    reason,
    parentAgent: parentAgent ? 1 : 0,
    smokeLikeProfile: smokeLike ? 1 : 0,
    implementationWorkObserved: work.observed ? 1 : 0,
    finalStatus: normalizedStatus || "unknown",
    work,
    dispatch: {
      attempts,
      successes,
      failures,
      collabCalls: collab,
    },
    retry: retry ? 1 : 0,
    attempt: currentAttempt,
    maxRetries: maxRetryCount,
    nextAttempt: retry ? currentAttempt + 1 : currentAttempt,
  };
}

function buildParentDispatchGuardRetryPrompt({
  originalPrompt = "",
  reason = "",
  attempt = 0,
  maxRetries = 1,
  maxChars = 24000,
} = {}) {
  const basePrompt = typeof originalPrompt === "string" ? originalPrompt.trim() : "";
  const clippedReason = typeof reason === "string" ? reason.trim().slice(0, 180) : "";
  const attemptValue = toNonNegativeInt(attempt);
  const maxRetryValue = toNonNegativeInt(maxRetries);
  const guidance = [
    "[Parent Dispatch Guard]",
    "This run must delegate specialist work via native collab tools.",
    "Required sequence: spawn_agent -> wait -> (send_input if needed) -> wait -> review.",
    "Do not finish Step 4/Step 5 until at least one child dispatch succeeds.",
    clippedReason ? `Previous guard reason: ${clippedReason}` : "",
    `Guard retry attempt: ${attemptValue}/${maxRetryValue}`,
  ].filter(Boolean).join("\n");
  const merged = basePrompt ? `${basePrompt}\n\n${guidance}` : guidance;
  const limit = Number.isFinite(Number(maxChars)) ? Math.max(200, Math.trunc(Number(maxChars))) : 24000;
  return merged.length <= limit ? merged : merged.slice(0, limit);
}

module.exports = {
  buildParentDispatchGuardRetryPrompt,
  buildParentDispatchGuardRuntimeSnapshot,
  evaluateParentDispatchGuard,
  normalizeParentDispatchGuardMode,
};
