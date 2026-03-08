"use strict";

const requirementRbjPolicyVersion = "requirement-rbj-v1-rule";

const RBJ_MARKER = "[REQUIREMENT_RBJ_V1]";
const RBJ_ENABLED_ENV_KEY = "CODEX_REQUIREMENT_RBJ_ENABLED";
const RBJ_REQUIRE_CONFIRM_ENV_KEY = "CODEX_REQUIREMENT_RBJ_REQUIRE_CONFIRM";
const RBJ_MAX_QUESTIONS_ENV_KEY = "CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS";
const RBJ_MAX_REVISIONS_ENV_KEY = "CODEX_REQUIREMENT_RBJ_MAX_REVISIONS";
const RBJ_MIN_CONFIDENCE_ENV_KEY = "CODEX_REQUIREMENT_RBJ_MIN_CONFIDENCE";

const RBJ_DEFAULT_ENABLED = true;
const RBJ_DEFAULT_REQUIRE_CONFIRM = false;
const RBJ_DEFAULT_MAX_QUESTIONS = 3;
const RBJ_DEFAULT_MAX_REVISIONS = 2;
const RBJ_DEFAULT_MIN_CONFIDENCE = 80;
const RBJ_DEFAULT_PARENT_AGENTS = Object.freeze(["default", "intake", "release_manager"]);
const RBJ_RED_SKILL_TOKEN = "$red-requirement-auditor";

const RBJ_CONFIRM_TOKENS = Object.freeze(["#rbj-confirm", "[rbj-confirm]", "rbj:confirm"]);
const RBJ_BYPASS_TOKENS = Object.freeze(["#rbj-bypass", "[rbj-bypass]", "rbj:bypass"]);

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
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function toBoundedInt(value, fallback, min, max) {
  if (typeof value === "string" && !value.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeAgentName(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  return normalized.replace(/[\s-]+/g, "_");
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

function normalizeEnvMap(env) {
  return env && typeof env === "object" ? env : process.env;
}

function includesAnyToken(text, tokens) {
  const haystack = String(text || "").toLowerCase();
  if (!haystack || !Array.isArray(tokens)) {
    return false;
  }
  return tokens.some((token) => haystack.includes(String(token || "").toLowerCase()));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTokens(text, tokens) {
  let output = String(text || "");
  for (const token of Array.isArray(tokens) ? tokens : []) {
    if (!token) {
      continue;
    }
    output = output.replace(new RegExp(escapeRegExp(token), "ig"), " ");
  }
  return output.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

function getRequirementRbjConfig(env) {
  const sourceEnv = normalizeEnvMap(env);
  const enabledRaw =
    typeof sourceEnv[RBJ_ENABLED_ENV_KEY] === "string" ? sourceEnv[RBJ_ENABLED_ENV_KEY].trim() : "";
  const requireConfirmRaw =
    typeof sourceEnv[RBJ_REQUIRE_CONFIRM_ENV_KEY] === "string"
      ? sourceEnv[RBJ_REQUIRE_CONFIRM_ENV_KEY].trim()
      : "";
  const maxQuestionsRaw =
    typeof sourceEnv[RBJ_MAX_QUESTIONS_ENV_KEY] === "string" ? sourceEnv[RBJ_MAX_QUESTIONS_ENV_KEY].trim() : "";
  const maxRevisionsRaw =
    typeof sourceEnv[RBJ_MAX_REVISIONS_ENV_KEY] === "string" ? sourceEnv[RBJ_MAX_REVISIONS_ENV_KEY].trim() : "";
  const minConfidenceRaw =
    typeof sourceEnv[RBJ_MIN_CONFIDENCE_ENV_KEY] === "string"
      ? sourceEnv[RBJ_MIN_CONFIDENCE_ENV_KEY].trim()
      : "";

  return {
    marker: RBJ_MARKER,
    version: requirementRbjPolicyVersion,
    enabled: normalizeBooleanFlag(enabledRaw, RBJ_DEFAULT_ENABLED),
    require_confirm: normalizeBooleanFlag(requireConfirmRaw, RBJ_DEFAULT_REQUIRE_CONFIRM),
    max_questions: toBoundedInt(maxQuestionsRaw, RBJ_DEFAULT_MAX_QUESTIONS, 1, 6),
    max_revisions: toBoundedInt(maxRevisionsRaw, RBJ_DEFAULT_MAX_REVISIONS, 1, 5),
    min_confidence: toBoundedInt(minConfidenceRaw, RBJ_DEFAULT_MIN_CONFIDENCE, 50, 100),
    red_skill_token: RBJ_RED_SKILL_TOKEN,
    parent_agents: [...RBJ_DEFAULT_PARENT_AGENTS],
    confirm_tokens: [...RBJ_CONFIRM_TOKENS],
    bypass_tokens: [...RBJ_BYPASS_TOKENS],
    enabled_source: enabledRaw ? "env" : "default",
    require_confirm_source: requireConfirmRaw ? "env" : "default",
    max_questions_source: maxQuestionsRaw ? "env" : "default",
    max_revisions_source: maxRevisionsRaw ? "env" : "default",
    min_confidence_source: minConfidenceRaw ? "env" : "default",
    enabled_env_key: RBJ_ENABLED_ENV_KEY,
    require_confirm_env_key: RBJ_REQUIRE_CONFIRM_ENV_KEY,
    max_questions_env_key: RBJ_MAX_QUESTIONS_ENV_KEY,
    max_revisions_env_key: RBJ_MAX_REVISIONS_ENV_KEY,
    min_confidence_env_key: RBJ_MIN_CONFIDENCE_ENV_KEY,
    default_enabled: RBJ_DEFAULT_ENABLED,
    default_require_confirm: RBJ_DEFAULT_REQUIRE_CONFIRM,
    default_max_questions: RBJ_DEFAULT_MAX_QUESTIONS,
    default_max_revisions: RBJ_DEFAULT_MAX_REVISIONS,
    default_min_confidence: RBJ_DEFAULT_MIN_CONFIDENCE,
  };
}

function resolveRequirementRbjState({ prompt = "", options = {}, config } = {}) {
  const activeConfig = config && typeof config === "object" ? config : getRequirementRbjConfig();
  const normalizedAgentRaw = normalizeAgentName(options && options.agentName);
  const parentAgents = new Set(
    Array.isArray(activeConfig.parent_agents)
      ? activeConfig.parent_agents.map((entry) => normalizeAgentName(entry)).filter(Boolean)
      : []
  );
  const normalizedAgent = normalizeParentComparableAgentName(normalizedAgentRaw, parentAgents);
  const parentAgent = !normalizedAgentRaw || parentAgents.has(normalizedAgent);
  const bypass = includesAnyToken(prompt, activeConfig.bypass_tokens);
  const confirmed = includesAnyToken(prompt, activeConfig.confirm_tokens);
  const confirmationBlocked = Boolean(activeConfig.require_confirm && !confirmed);
  const active = Boolean(activeConfig.enabled && parentAgent && !bypass && !confirmationBlocked);

  let reason = "active";
  if (!activeConfig.enabled) {
    reason = "disabled";
  } else if (!parentAgent) {
    reason = "agent_not_parent";
  } else if (bypass) {
    reason = "bypass";
  } else if (confirmationBlocked) {
    reason = "confirmation_required";
  }

  return {
    mode: active ? "requirement_definition_loop" : "off",
    active,
    reason,
    parent_agent: parentAgent,
    agent_name: normalizedAgentRaw || null,
    bypass,
    confirmed,
    max_questions: toBoundedInt(activeConfig.max_questions, RBJ_DEFAULT_MAX_QUESTIONS, 1, 6),
    max_revisions: toBoundedInt(activeConfig.max_revisions, RBJ_DEFAULT_MAX_REVISIONS, 1, 5),
    min_confidence: toBoundedInt(activeConfig.min_confidence, RBJ_DEFAULT_MIN_CONFIDENCE, 50, 100),
    red_skill_token:
      typeof activeConfig.red_skill_token === "string" && activeConfig.red_skill_token.trim()
        ? activeConfig.red_skill_token.trim()
        : RBJ_RED_SKILL_TOKEN,
  };
}

function stripRequirementRbjControlTokens(text, config) {
  const activeConfig = config && typeof config === "object" ? config : getRequirementRbjConfig();
  return stripTokens(text, [...(activeConfig.confirm_tokens || []), ...(activeConfig.bypass_tokens || [])]);
}

function buildRequirementRbjInstructionBlock({ config, state } = {}) {
  const activeConfig = config && typeof config === "object" ? config : getRequirementRbjConfig();
  const activeState = state && typeof state === "object" ? state : resolveRequirementRbjState({ config: activeConfig });
  const redSkillToken =
    typeof activeState.red_skill_token === "string" && activeState.red_skill_token.trim()
      ? activeState.red_skill_token.trim()
      : RBJ_RED_SKILL_TOKEN;
  const maxQuestions = toBoundedInt(activeState.max_questions, RBJ_DEFAULT_MAX_QUESTIONS, 1, 6);
  const maxRevisions = toBoundedInt(activeState.max_revisions, RBJ_DEFAULT_MAX_REVISIONS, 1, 5);
  const minConfidence = toBoundedInt(activeState.min_confidence, RBJ_DEFAULT_MIN_CONFIDENCE, 50, 100);

  return [
    `${activeConfig.marker} mode: requirement_definition_loop`,
    `rbj_version: ${activeConfig.version || requirementRbjPolicyVersion}`,
    "Requirement-definition loop (mandatory before implementation planning):",
    "1) Blue output must separate: confirmed_requirements, assumptions_non_binding, open_questions_blocking, acceptance_checks.",
    "2) Blue must not invent concrete numeric constraints (deadline/headcount/budget/SLA). If unknown, set value to TBD.",
    `3) Red: apply ${redSkillToken} and audit only clarity/testability/traceability gaps with evidence; do not invent scope.`,
    "4) Judge: return PASS or ASK or FAIL from Blue+Red evidence, not opinion.",
    `5) If verdict is ASK, ask at most ${maxQuestions} blocking questions and stop with STATUS: NEED_USER_INPUT.`,
    `6) Limit revisions to ${maxRevisions} loops per request to avoid drift.`,
    `7) PASS gate: high-severity findings = 0, blocking open questions = 0, confidence >= ${minConfidence}.`,
    "8) Assumptions are non-binding and must never be used as implementation commitments until user confirmation.",
    "Red finding schema (strict): id, severity, requirement_ref, issue, impact, fix_hint.",
    "Judge schema (strict): verdict, confidence, accepted_findings, rejected_findings, unresolved_risks.",
    "Blue schema note: each assumption must include why it is assumed and which user answer is needed to confirm it.",
  ].join("\n");
}

module.exports = {
  buildRequirementRbjInstructionBlock,
  getRequirementRbjConfig,
  requirementRbjPolicyVersion,
  resolveRequirementRbjState,
  stripRequirementRbjControlTokens,
};
