"use strict";

const {
  buildRequirementRbjInstructionBlock,
  getRequirementRbjConfig,
  resolveRequirementRbjState,
  stripRequirementRbjControlTokens,
} = require("../lib/requirement_rbj_policy");

const ORIGINAL_REQUIREMENT = "?????3?????";
const MATCH_VALUE_ENV_KEY = "REQUIREMENT_GUARD_MATCH_VALUE";
const MATCH_VALUE_CONFIG_KEY = "requirement_guard.match_value";
const DEFAULT_MATCH_VALUE = 3;

const REQUIREMENT_LOCK_ENABLED_ENV_KEY = "CODEX_REQUIREMENT_LOCK_ENABLED";
const REQUIREMENT_LOCK_REQUIRE_CONFIRM_ENV_KEY = "CODEX_REQUIREMENT_LOCK_REQUIRE_CONFIRM";
const REQUIREMENT_LOCK_MARKER = "[REQUIREMENT_LOCK_V1]";
const REQUIREMENT_LOCK_DEFAULT_ENABLED = true;
const REQUIREMENT_LOCK_DEFAULT_REQUIRE_CONFIRM = false;
const REQUIREMENT_LOCK_CONFIRM_TOKENS = Object.freeze([
  "#requirement-locked",
  "[requirement-locked]",
  "requirement:locked",
  "requirement locked",
  "confirmed",
]);
const REQUIREMENT_LOCK_BYPASS_TOKENS = Object.freeze([
  "#guard-bypass",
  "[guard-bypass]",
  "guard:bypass",
]);
const SCOPE_EXPANSION_ENABLED_ENV_KEY = "CODEX_SCOPE_EXPANSION_ENABLED";
const SCOPE_EXPANSION_REQUIRE_APPROVAL_ENV_KEY =
  "CODEX_SCOPE_EXPANSION_REQUIRE_APPROVAL";
const SCOPE_EXPANSION_MARKER = "[SCOPE_EXPANSION_V1]";
const SCOPE_EXPANSION_DEFAULT_ENABLED = true;
const SCOPE_EXPANSION_DEFAULT_REQUIRE_APPROVAL = false;
const SCOPE_EXPANSION_APPROVE_TOKENS = Object.freeze([
  "#scope-plus",
  "[scope-plus]",
  "scope:plus",
  "scope plus",
  "#scope-expand",
  "[scope-expand]",
  "scope:expand",
]);
const SCOPE_EXPANSION_REJECT_TOKENS = Object.freeze([
  "#scope-core",
  "[scope-core]",
  "scope:core",
  "#scope-no-plus",
  "[scope-no-plus]",
  "scope:no-plus",
]);

const requirement = Object.freeze({
  id: "3",
  status: "temporary",
  originalRequirement: ORIGINAL_REQUIREMENT,
  matcher: Object.freeze({
    configKey: MATCH_VALUE_CONFIG_KEY,
    envKey: MATCH_VALUE_ENV_KEY,
    defaultValue: DEFAULT_MATCH_VALUE,
  }),
});

function normalizeFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeBooleanFlag(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (
      normalized === "1" ||
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "on"
    ) {
      return true;
    }
    if (
      normalized === "0" ||
      normalized === "false" ||
      normalized === "no" ||
      normalized === "off"
    ) {
      return false;
    }
  }
  return fallback;
}

function normalizeEnvMap(env) {
  return env && typeof env === "object" ? env : process.env;
}

function getRequirementLockConfig(env) {
  const sourceEnv = normalizeEnvMap(env);
  const enabledRaw =
    typeof sourceEnv[REQUIREMENT_LOCK_ENABLED_ENV_KEY] === "string"
      ? sourceEnv[REQUIREMENT_LOCK_ENABLED_ENV_KEY].trim()
      : "";
  const requireConfirmRaw =
    typeof sourceEnv[REQUIREMENT_LOCK_REQUIRE_CONFIRM_ENV_KEY] === "string"
      ? sourceEnv[REQUIREMENT_LOCK_REQUIRE_CONFIRM_ENV_KEY].trim()
      : "";
  return {
    marker: REQUIREMENT_LOCK_MARKER,
    enabled: normalizeBooleanFlag(enabledRaw, REQUIREMENT_LOCK_DEFAULT_ENABLED),
    require_confirm: normalizeBooleanFlag(
      requireConfirmRaw,
      REQUIREMENT_LOCK_DEFAULT_REQUIRE_CONFIRM
    ),
    enabled_source: enabledRaw ? "env" : "default",
    require_confirm_source: requireConfirmRaw ? "env" : "default",
    enabled_env_key: REQUIREMENT_LOCK_ENABLED_ENV_KEY,
    require_confirm_env_key: REQUIREMENT_LOCK_REQUIRE_CONFIRM_ENV_KEY,
    default_enabled: REQUIREMENT_LOCK_DEFAULT_ENABLED,
    default_require_confirm: REQUIREMENT_LOCK_DEFAULT_REQUIRE_CONFIRM,
    confirm_tokens: [...REQUIREMENT_LOCK_CONFIRM_TOKENS],
    bypass_tokens: [...REQUIREMENT_LOCK_BYPASS_TOKENS],
  };
}

function getScopeExpansionConfig(env) {
  const sourceEnv = normalizeEnvMap(env);
  const enabledRaw =
    typeof sourceEnv[SCOPE_EXPANSION_ENABLED_ENV_KEY] === "string"
      ? sourceEnv[SCOPE_EXPANSION_ENABLED_ENV_KEY].trim()
      : "";
  const requireApprovalRaw =
    typeof sourceEnv[SCOPE_EXPANSION_REQUIRE_APPROVAL_ENV_KEY] === "string"
      ? sourceEnv[SCOPE_EXPANSION_REQUIRE_APPROVAL_ENV_KEY].trim()
      : "";
  return {
    marker: SCOPE_EXPANSION_MARKER,
    enabled: normalizeBooleanFlag(enabledRaw, SCOPE_EXPANSION_DEFAULT_ENABLED),
    require_approval: normalizeBooleanFlag(
      requireApprovalRaw,
      SCOPE_EXPANSION_DEFAULT_REQUIRE_APPROVAL
    ),
    enabled_source: enabledRaw ? "env" : "default",
    require_approval_source: requireApprovalRaw ? "env" : "default",
    enabled_env_key: SCOPE_EXPANSION_ENABLED_ENV_KEY,
    require_approval_env_key: SCOPE_EXPANSION_REQUIRE_APPROVAL_ENV_KEY,
    default_enabled: SCOPE_EXPANSION_DEFAULT_ENABLED,
    default_require_approval: SCOPE_EXPANSION_DEFAULT_REQUIRE_APPROVAL,
    approve_tokens: [...SCOPE_EXPANSION_APPROVE_TOKENS],
    reject_tokens: [...SCOPE_EXPANSION_REJECT_TOKENS],
  };
}

function getMatchConfig(env) {
  const sourceEnv = normalizeEnvMap(env);
  const raw =
    typeof sourceEnv[MATCH_VALUE_ENV_KEY] === "string"
      ? sourceEnv[MATCH_VALUE_ENV_KEY].trim()
      : "";
  if (!raw) {
    return {
      config_key: MATCH_VALUE_CONFIG_KEY,
      env_key: MATCH_VALUE_ENV_KEY,
      source: "default",
      value: DEFAULT_MATCH_VALUE,
      default_value: DEFAULT_MATCH_VALUE,
      raw_value: null,
      config_error: null,
    };
  }
  const parsed = normalizeFiniteNumber(raw);
  if (parsed === null) {
    return {
      config_key: MATCH_VALUE_CONFIG_KEY,
      env_key: MATCH_VALUE_ENV_KEY,
      source: "default",
      value: DEFAULT_MATCH_VALUE,
      default_value: DEFAULT_MATCH_VALUE,
      raw_value: raw,
      config_error: `invalid ${MATCH_VALUE_ENV_KEY}="${raw}"`,
    };
  }
  return {
    config_key: MATCH_VALUE_CONFIG_KEY,
    env_key: MATCH_VALUE_ENV_KEY,
    source: "env",
    value: parsed,
    default_value: DEFAULT_MATCH_VALUE,
    raw_value: raw,
    config_error: null,
  };
}

function evaluateMatch(inputValue, options) {
  const normalizedInput = normalizeFiniteNumber(inputValue);
  const optionMap = options && typeof options === "object" ? options : {};
  const config = getMatchConfig(optionMap.env);
  if (normalizedInput === null) {
    return {
      is_match: false,
      normalized_input: null,
      expected_value: config.value,
      reason: "invalid_input",
      config_key: config.config_key,
      env_key: config.env_key,
      config_source: config.source,
      config_error: config.config_error,
      original_requirement: ORIGINAL_REQUIREMENT,
    };
  }
  const isMatch = normalizedInput === config.value;
  return {
    is_match: isMatch,
    normalized_input: normalizedInput,
    expected_value: config.value,
    reason: isMatch ? "matched" : "not_matched",
    config_key: config.config_key,
    env_key: config.env_key,
    config_source: config.source,
    config_error: config.config_error,
    original_requirement: ORIGINAL_REQUIREMENT,
  };
}

function isSlashCommand(prompt) {
  return typeof prompt === "string" && prompt.trim().startsWith("/");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripControlTokens(text, tokens) {
  let output = String(text || "");
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    output = output.replace(new RegExp(escapeRegExp(token), "ig"), " ");
  }
  return output.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

function includesAnyToken(text, tokens) {
  const haystack = String(text || "").toLowerCase();
  if (!haystack) {
    return false;
  }
  return tokens.some((token) =>
    haystack.includes(String(token || "").toLowerCase())
  );
}

function buildRequirementDefinitionGatePrompt(
  originalPrompt,
  config,
  expansionConfig,
  expansionState,
  rbjBlock,
  rbjState
) {
  const maxQuestions =
    rbjState && Number.isFinite(rbjState.max_questions)
      ? Math.max(1, Math.trunc(rbjState.max_questions))
      : 3;
  const minConfidence =
    rbjState && Number.isFinite(rbjState.min_confidence)
      ? Math.max(50, Math.min(100, Math.trunc(rbjState.min_confidence)))
      : 80;
  return [
    `${config.marker} mode: requirement_definition_gate`,
    `${expansionConfig.marker} expansion_status: parked_until_rbj_pass`,
    `requested_expansion_mode: ${expansionState.mode}`,
    rbjBlock || "",
    "Execution protocol (mandatory):",
    "1) Output sections in this exact order: [Blue-1], [Red], [Judge], [Blue-Improved].",
    "2) In Blue sections, split content into: Confirmed Requirements / Assumptions (non-binding) / Open Questions (blocking).",
    "3) Never fabricate concrete numbers (deadline/headcount/budget/SLA). If missing, write TBD and move to Open Questions.",
    "4) Assumptions are placeholders only and must not become implementation commitments without user confirmation.",
    "5) Keep Red strictly on evidence-backed requirement gaps; no scope invention.",
    `6) If Judge verdict is ASK, ask at most ${maxQuestions} blocking questions and stop with STATUS: NEED_USER_INPUT.`,
    `7) If Judge verdict is PASS with confidence >= ${minConfidence}, continue only if implementation is explicitly requested.`,
    "8) If user requested requirement-definition only, stop after Blue-Improved with STATUS: REQUIREMENTS_READY.",
    "",
    "User request (verbatim):",
    originalPrompt,
  ].join("\n");
}

function buildRequirementGuardPrompt(
  originalPrompt,
  config,
  canExecute,
  expansionConfig,
  expansionState,
  rbjBlock,
  rbjState
) {
  if (rbjState && rbjState.active) {
    return buildRequirementDefinitionGatePrompt(
      originalPrompt,
      config,
      expansionConfig,
      expansionState,
      rbjBlock,
      rbjState
    );
  }
  void canExecute;
  const modeLine = "mode: over_delivery_execution";
  const finishRule = expansionState.execute_expansion
    ? "- End with: STATUS: OVER_DELIVERED_OR_COMPLETED"
    : "- End with: STATUS: COMPLETED";
  const expansionStatusLine = `expansion_status: ${expansionState.mode}`;
  const expansionControlRule = !expansionConfig.enabled
    ? "- Scope Expansion is disabled in this environment."
    : expansionState.execute_expansion
      ? "- Scope Expansion enabled: implement explicit request first, then add safe high-value improvements."
      : "- Respect explicit core-only scope request and skip optional expansion.";
  const expansionHint = !expansionConfig.enabled
    ? "- Expansion controls are unavailable."
    : "- Preferred over-delivery scope: bug fixes, refactoring, safety hardening, tests, and docs updates.";

  return [
    `${config.marker} ${modeLine}`,
    `${expansionConfig.marker} ${expansionStatusLine}`,
    rbjBlock || "",
    "Execution protocol (mandatory):",
    "1) Deliver all explicit user requirements first.",
    "2) Infer and implement safe high-value over-delivery where beneficial.",
    "3) Prioritize quality upgrades: bug fixes, refactoring, test coverage, resilience, and maintainability.",
    "4) Keep changes coherent and avoid destructive unrelated edits.",
    "5) If critical ambiguity blocks correctness, ask concise clarifying questions.",
    "6) Report baseline delivery, over-delivery items, and residual risks.",
    expansionControlRule,
    expansionHint,
    finishRule,
    "",
    "User request (verbatim):",
    originalPrompt,
  ].join("\n");
}

/**
 * Requirement guard extension point.
 *
 * Input shape:
 * {
 *   requirement: { id, status, originalRequirement },
 *   prompt: string,
 *   sandboxMode: string,
 *   options: { approvalPolicy, webSearch, agentName, cwd, images, ... }
 * }
 *
 * Return shape (optional partial override):
 * {
 *   prompt?: string,
 *   sandboxMode?: string,
 *   options?: object
 * }
 */
function transformExecRequest(input) {
  const normalizedInput = input && typeof input === "object" ? input : {};
  const fallback = {
    prompt: typeof normalizedInput.prompt === "string" ? normalizedInput.prompt : "",
    sandboxMode:
      typeof normalizedInput.sandboxMode === "string"
        ? normalizedInput.sandboxMode
        : "workspace-write",
    options:
      normalizedInput.options && typeof normalizedInput.options === "object"
        ? { ...normalizedInput.options }
        : {},
  };

  const envMap =
    normalizedInput.env && typeof normalizedInput.env === "object"
      ? normalizedInput.env
      : process.env;
  const requirementLockConfig = getRequirementLockConfig(envMap);
  const scopeExpansionConfig = getScopeExpansionConfig(envMap);
  const requirementRbjConfig = getRequirementRbjConfig(envMap);
  const requirementRbjState = resolveRequirementRbjState({
    prompt: fallback.prompt,
    options: fallback.options,
    config: requirementRbjConfig,
  });

  if (!requirementLockConfig.enabled) {
    return fallback;
  }
  if (!fallback.prompt) {
    return fallback;
  }
  if (isSlashCommand(fallback.prompt)) {
    return fallback;
  }
  if (fallback.prompt.includes(requirementLockConfig.marker)) {
    return fallback;
  }

  const shouldBypass = includesAnyToken(
    fallback.prompt,
    requirementLockConfig.bypass_tokens
  );
  const hasExpansionRejectToken =
    scopeExpansionConfig.enabled &&
    includesAnyToken(fallback.prompt, scopeExpansionConfig.reject_tokens);
  const expansionMode = !scopeExpansionConfig.enabled
    ? "disabled"
    : hasExpansionRejectToken
      ? "core_only"
      : "auto_enabled";
  if (shouldBypass) {
    return {
      ...fallback,
      prompt: stripControlTokens(fallback.prompt, [
        ...requirementLockConfig.bypass_tokens,
        ...scopeExpansionConfig.approve_tokens,
        ...scopeExpansionConfig.reject_tokens,
        ...requirementRbjConfig.confirm_tokens,
        ...requirementRbjConfig.bypass_tokens,
      ]),
    };
  }

  const normalizedPromptWithCoreTokens = stripControlTokens(fallback.prompt, [
    ...requirementLockConfig.confirm_tokens,
    ...requirementLockConfig.bypass_tokens,
    ...scopeExpansionConfig.approve_tokens,
    ...scopeExpansionConfig.reject_tokens,
  ]);
  const normalizedPrompt = stripRequirementRbjControlTokens(
    normalizedPromptWithCoreTokens,
    requirementRbjConfig
  );
  const canExecute = true;
  const expansionState = {
    mode: expansionMode,
    execute_expansion: expansionMode === "auto_enabled" && canExecute,
  };
  const rbjBlock = requirementRbjState.active
    ? buildRequirementRbjInstructionBlock({
      config: requirementRbjConfig,
      state: requirementRbjState,
    })
    : "";

  return {
    ...fallback,
    prompt: buildRequirementGuardPrompt(
      normalizedPrompt,
      requirementLockConfig,
      canExecute,
      scopeExpansionConfig,
      expansionState,
      rbjBlock,
      requirementRbjState
    ),
  };
}

module.exports = {
  requirement,
  getMatchConfig,
  evaluateMatch,
  getRequirementLockConfig,
  getRequirementRbjConfig,
  getScopeExpansionConfig,
  transformExecRequest,
};

