"use strict";

const {
  buildRequirementRbjInstructionBlock,
  getRequirementRbjConfig,
  resolveRequirementRbjState,
  stripRequirementRbjControlTokens,
} = require("../lib/requirement_rbj_policy");
const {
  buildPlanningArtifacts,
  loadAssuranceModeContract,
  normalizeAssuranceModeContract,
  loadPlanningModeContract,
  normalizePlanningModeContract,
  sanitizePlanningArtifactsForRuntime,
} = require("../lib/planning_mode_policy");

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
const PLANNING_MODE_MARKER = "[PLANNING_MODE_V1]";
const ASSURANCE_DEPTH_MARKER = "[ASSURANCE_DEPTH_V1]";

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

function getPlanningModeConfig() {
  try {
    return loadPlanningModeContract();
  } catch {
    return normalizePlanningModeContract(null);
  }
}

function getAssuranceModeConfig() {
  try {
    return loadAssuranceModeContract();
  } catch {
    return normalizeAssuranceModeContract(null);
  }
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

function formatPromptBulletBlock(title, values, max = 6) {
  const items = Array.isArray(values)
    ? values
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
        .slice(0, max)
    : [];
  if (!items.length) {
    return "";
  }
  return `${title}:\n${items.map((entry) => `- ${entry}`).join("\n")}`;
}

function buildUserValueFramePromptBlock(requirement) {
  const frame =
    requirement && requirement.userValueFrame && typeof requirement.userValueFrame === "object"
      ? requirement.userValueFrame
      : {};
  const lines = [];
  if (typeof frame.valueThesis === "string" && frame.valueThesis.trim()) {
    lines.push("User-value frame (primary optimization target):");
    lines.push(`- Value thesis: ${frame.valueThesis.trim()}`);
  }
  const sections = [
    formatPromptBulletBlock("User wants", frame.userWants, 6),
    formatPromptBulletBlock("User should feel/get", frame.userShouldFeelGet, 6),
    formatPromptBulletBlock("Must avoid", frame.mustAvoid, 6),
    formatPromptBulletBlock("Hard constraints", frame.hardConstraints, 6),
    formatPromptBulletBlock("Quality axes", frame.qualityAxes, 6),
    formatPromptBulletBlock("Benchmark candidates", frame.benchmarkCandidates, 4),
    formatPromptBulletBlock("Completed means", frame.completedMeans, 6),
  ].filter(Boolean);
  if (!lines.length && !sections.length) {
    return "";
  }
  return [...lines, ...sections].join("\n");
}

function buildRequirementDefinitionGatePrompt(
  originalPrompt,
  config,
  expansionConfig,
  expansionState,
  rbjBlock,
  rbjState,
  planningArtifacts
) {
  const maxQuestions =
    rbjState && Number.isFinite(rbjState.max_questions)
      ? Math.max(1, Math.trunc(rbjState.max_questions))
      : 3;
  const minConfidence =
    rbjState && Number.isFinite(rbjState.min_confidence)
      ? Math.max(50, Math.min(100, Math.trunc(rbjState.min_confidence)))
      : 80;
  const requirement =
    planningArtifacts && planningArtifacts.requirementContract && typeof planningArtifacts.requirementContract === "object"
      ? planningArtifacts.requirementContract
      : {};
  const selection =
    planningArtifacts && planningArtifacts.selection && typeof planningArtifacts.selection === "object"
      ? planningArtifacts.selection
      : {};
  const acceptanceChecks = Array.isArray(requirement.acceptanceChecks)
    ? requirement.acceptanceChecks
        .map((entry) => (entry && typeof entry === "object" && entry.title ? `- ${entry.title}` : ""))
        .filter(Boolean)
        .slice(0, 8)
        .join("\n")
    : "";
  const openQuestions = Array.isArray(requirement.openQuestions)
    ? requirement.openQuestions.map((entry) => `- ${entry}`).slice(0, 8).join("\n")
    : "";
  const userValueFrame = buildUserValueFramePromptBlock(requirement);
  return [
    `${config.marker} mode: requirement_definition_gate`,
    `${expansionConfig.marker} expansion_status: parked_until_rbj_pass`,
    `requested_expansion_mode: ${expansionState.mode}`,
    `${PLANNING_MODE_MARKER} selected: DISCOVERY`,
    `${ASSURANCE_DEPTH_MARKER} selected: ${typeof selection.selectedAssuranceDepth === "string" ? selection.selectedAssuranceDepth : "STANDARD_ASSURANCE"}`,
    `planning_reasons: ${Array.isArray(selection.reasons) ? selection.reasons.join(", ") : ""}`,
    `assurance_reasons: ${Array.isArray(selection.assuranceReasons) ? selection.assuranceReasons.join(", ") : ""}`,
    rbjBlock || "",
    "Execution protocol (mandatory):",
    "1) Output sections in this exact order: [Discovery-Goal], [Discovery-UserValue], [Discovery-NonGoals], [Discovery-Assumptions], [Discovery-OpenQuestions], [Discovery-Acceptance], [Discovery-Decision].",
    "2) Lock the user-value frame first; acceptance is a guardrail, not a substitute for the value target.",
    "3) Never fabricate concrete numbers (deadline/headcount/budget/SLA). If missing, write TBD and keep it in Open Questions.",
    "4) Risky over-delivery is proposal-only in DISCOVERY mode.",
    "5) If any user decision or approval-boundary item remains, stop with STATUS: NEED_USER_INPUT.",
    `6) Ask at most ${maxQuestions} blocking questions in total.`,
    `7) If all blocking questions are resolved and confidence >= ${minConfidence}, you may state STATUS: REQUIREMENTS_READY.`,
    "8) Do not claim implementation completion from DISCOVERY mode output.",
    userValueFrame,
    acceptanceChecks ? "Seed acceptance checks:\n".concat(acceptanceChecks) : "",
    openQuestions ? "Seed open questions:\n".concat(openQuestions) : "",
    "",
    "User request (verbatim):",
    originalPrompt,
  ].join("\n");
}

function buildSingleClarificationPrompt(
  originalPrompt,
  config,
  expansionConfig,
  expansionState,
  planningArtifacts
) {
  const selection =
    planningArtifacts && planningArtifacts.selection && typeof planningArtifacts.selection === "object"
      ? planningArtifacts.selection
      : {};
  const requirement =
    planningArtifacts && planningArtifacts.requirementContract && typeof planningArtifacts.requirementContract === "object"
      ? planningArtifacts.requirementContract
      : {};
  const signals = selection && selection.signals && typeof selection.signals === "object"
    ? selection.signals
    : {};
  const suggestedQuestion =
    typeof signals.clarificationQuestion === "string" && signals.clarificationQuestion.trim()
      ? signals.clarificationQuestion.trim()
      : "Before implementation, what single direction should be prioritized?";
  const summary =
    typeof signals.clarificationSummary === "string" && signals.clarificationSummary.trim()
      ? signals.clarificationSummary.trim()
      : "One high-leverage clarification is required before implementation.";
  return [
    `${config.marker} mode: single_clarification_gate`,
    `${expansionConfig.marker} expansion_status: ${expansionState.mode}`,
    `${PLANNING_MODE_MARKER} selected: DISCOVERY`,
    `${ASSURANCE_DEPTH_MARKER} selected: ${typeof selection.selectedAssuranceDepth === "string" ? selection.selectedAssuranceDepth : "STANDARD_ASSURANCE"}`,
    `planning_reasons: ${Array.isArray(selection.reasons) ? selection.reasons.join(", ") : ""}`,
    `assurance_reasons: ${Array.isArray(selection.assuranceReasons) ? selection.assuranceReasons.join(", ") : ""}`,
    "Execution protocol (mandatory):",
    "1) Ask exactly one short clarifying question in the user's language.",
    "2) Ask only the highest-leverage question that will reduce outcome drift the most.",
    "3) Do not dispatch specialists, do not edit files, and do not claim implementation progress.",
    "4) Keep the reply concise and operator-readable.",
    "5) End with: STATUS: NEED_USER_INPUT",
    `Clarification summary: ${summary}`,
    `Suggested question: ${suggestedQuestion}`,
    buildUserValueFramePromptBlock(requirement),
    "",
    "User request (verbatim):",
    originalPrompt,
  ].join("\n");
}

function buildRequirementGuardPrompt(
  originalPrompt,
  config,
  expansionConfig,
  expansionState,
  planningArtifacts,
  rbjState,
  rbjConfig
) {
  const selection =
    planningArtifacts && planningArtifacts.selection && typeof planningArtifacts.selection === "object"
      ? planningArtifacts.selection
      : {};
  const requirement =
    planningArtifacts && planningArtifacts.requirementContract && typeof planningArtifacts.requirementContract === "object"
      ? planningArtifacts.requirementContract
      : {};
  const dispatchPlan =
    planningArtifacts && planningArtifacts.dispatchPlan && typeof planningArtifacts.dispatchPlan === "object"
      ? planningArtifacts.dispatchPlan
      : {};
  const selectedMode = typeof selection.selectedMode === "string" ? selection.selectedMode : "NORMAL";
  const selectedPlanningDepth =
    typeof selection.selectedPlanningDepth === "string" ? selection.selectedPlanningDepth : "STANDARD_PLANNING";
  const selectedAssuranceDepth =
    typeof selection.selectedAssuranceDepth === "string" ? selection.selectedAssuranceDepth : "STANDARD_ASSURANCE";
  const planningReasonLine = `planning_reasons: ${Array.isArray(selection.reasons) ? selection.reasons.join(", ") : ""}`;
  const assuranceReasonLine = `assurance_reasons: ${Array.isArray(selection.assuranceReasons) ? selection.assuranceReasons.join(", ") : ""}`;
  const clarificationAction =
    selection && selection.signals && typeof selection.signals.clarificationAction === "string"
      ? selection.signals.clarificationAction
      : "";
  const acceptanceChecks = Array.isArray(requirement.acceptanceChecks)
    ? requirement.acceptanceChecks
        .map((entry) => (entry && typeof entry === "object" && entry.title ? `- ${entry.title}` : ""))
        .filter(Boolean)
        .slice(0, 8)
        .join("\n")
    : "";
  const dispatchOwners = Array.isArray(dispatchPlan.dispatches)
    ? dispatchPlan.dispatches
        .map((entry) => (entry && typeof entry === "object" && entry.ownerAgent ? entry.ownerAgent : ""))
        .filter(Boolean)
        .slice(0, 8)
        .join(", ")
    : "";
  const taskFamily =
    typeof selection.taskFamily === "string" && selection.taskFamily
      ? selection.taskFamily
      : "deterministic_code";
  const familyProfile =
    selection.familyProfile && typeof selection.familyProfile === "object"
      ? selection.familyProfile
      : {};
  const familyExecutionRules =
    taskFamily === "web_creative"
      ? [
          "Family profile: web_creative.",
          "10) Treat missing taste detail as room to generate strong directions, not as a reason to stop, unless a real approval-boundary or irreversible decision is present.",
          "11) Start by locking 2-3 candidate visual directions mentally, choose the strongest one, and execute decisively instead of drifting into generic compromise.",
          "12) Optimize for first impression, hierarchy, typography, information density, and benchmark superiority before reviewability or process narration.",
          "13) Avoid AI-looking generic layouts, weak card-grid sameness, glassmorphism-by-default, and abstract filler copy with no proof.",
          "14) Make the page feel intentionally designed: concrete content, strong section rhythm, responsive behavior, and a believable visual system are mandatory.",
        ]
      : taskFamily === "research_analysis"
        ? [
            "Family profile: research_analysis.",
            "10) Favor coverage, comparison, and explicit hypothesis separation over fast single-answer confidence.",
          ]
        : taskFamily === "planning_design"
          ? [
              "Family profile: planning_design.",
              "10) Favor decision support: surface options, tradeoffs, and execution consequences before prescribing a single path.",
            ]
          : [
              "Family profile: deterministic_code.",
          "10) Favor correctness, bounded assumptions, and localized changes over speculative expansion.",
            ];

  if (clarificationAction === "ask_user_once") {
    return buildSingleClarificationPrompt(
      originalPrompt,
      config,
      expansionConfig,
      expansionState,
      planningArtifacts
    );
  }
  if (selectedMode === "DISCOVERY" && rbjState && rbjState.active) {
    return buildRequirementDefinitionGatePrompt(
      originalPrompt,
      config,
      expansionConfig,
      expansionState,
      buildRequirementRbjInstructionBlock({
        config: rbjConfig,
        state: rbjState,
      }),
      rbjState,
      planningArtifacts
    );
  }
  const modeLine = selectedMode === "FAST" ? "mode: fast_execution" : "mode: structured_execution";
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
  const planningRules =
    selectedPlanningDepth === "FAST_PLANNING"
        ? [
            "1) Keep Step 1/2 concise: lock user value, the goal, acceptance checks, and specialist owner quickly, then execute.",
            "2) Do not ask follow-up questions unless correctness is blocked by a real missing decision.",
            "3) Use native specialist dispatch if implementation crosses the parent-only boundary.",
            "4) Preserve the baseline scope and avoid speculative extras.",
            "5) For short fact/status answers, lead with the direct answer and close in place without unsolicited next-step offers.",
          ]
      : [
          "1) Before execution, briefly lock the user-value frame, explicit goal, non-goals, assumptions, and acceptance checks.",
          "2) Make the dispatch plan explicit before implementation when multiple specialists are implicated.",
          "3) If blocking ambiguity remains, stop with STATUS: NEED_USER_INPUT instead of guessing.",
          "4) Keep over-delivery adjacent, bounded, and separately reported.",
          "5) For short fact/status answers, lead with the direct answer and close in place without unsolicited next-step offers.",
        ];
  const assuranceRules =
    selectedAssuranceDepth === "LIGHT_ASSURANCE"
      ? [
          "5) Keep assurance light: do not add reviewer/tester/doc-sync overhead unless the prompt or runtime risk requires it.",
          "6) Still emit the standard trace artifacts for observability.",
        ]
      : selectedAssuranceDepth === "SIGNOFF_ASSURANCE"
        ? [
            "5) Treat this as signoff-grade work: reviewer/tester evidence, doc sync, and signoff bundle readiness are mandatory.",
            "6) If new logic is introduced, dedicated tests are required before claiming completion.",
          ]
        : [
            "5) Use standard assurance: gather bounded reviewer/tester evidence when the plan or risk profile calls for it.",
            "6) Keep evidence organized so Step 4 can be reviewed quickly.",
          ];

  return [
    `${config.marker} ${modeLine}`,
    `${expansionConfig.marker} ${expansionStatusLine}`,
    `${PLANNING_MODE_MARKER} selected: ${selectedMode}`,
    `${ASSURANCE_DEPTH_MARKER} selected: ${selectedAssuranceDepth}`,
    planningReasonLine,
    assuranceReasonLine,
    "Execution protocol (mandatory):",
    ...planningRules,
    ...assuranceRules,
    "7) Deliver all explicit user requirements first.",
    "8) Optimize for the user-value frame first; evidence and acceptance checks confirm the work but are not the creative or technical ceiling.",
    "9) Report baseline delivery, over-delivery items, and residual risks.",
    "10) Do not claim the task is complete, fixed, or already reflected unless the required evidence gates for this run are actually satisfied.",
    taskFamily === "web_creative"
      ? "11) If benchmark candidates are present, keep them fixed across follow-up corrections until the user explicitly replaces them."
      : "",
    `- Task family: ${taskFamily}`,
    typeof familyProfile.objective === "string" && familyProfile.objective
      ? `- Family objective: ${familyProfile.objective}`
      : "",
    buildUserValueFramePromptBlock(requirement),
    ...familyExecutionRules,
    dispatchOwners ? `- Planned dispatch owners: ${dispatchOwners}` : "",
    acceptanceChecks ? "Acceptance checks:\n".concat(acceptanceChecks) : "",
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
  const planningModeConfig = getPlanningModeConfig();
  const assuranceModeConfig = getAssuranceModeConfig();
  const requirementRbjState = resolveRequirementRbjState({
    prompt: fallback.prompt,
    options: fallback.options,
    config: requirementRbjConfig,
  });
  const planningArtifacts = sanitizePlanningArtifactsForRuntime(
    buildPlanningArtifacts({
      prompt: fallback.prompt,
      options: {
        ...fallback.options,
        sandboxMode: fallback.sandboxMode,
      },
      contract: {
        planning: planningModeConfig,
        assurance: assuranceModeConfig,
      },
    })
  );

  fallback.options = {
    ...fallback.options,
    planningContext: planningArtifacts,
  };

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
  const expansionState = {
    mode: expansionMode,
    execute_expansion:
      expansionMode === "auto_enabled" &&
      (!planningArtifacts.selection || planningArtifacts.selection.selectedMode !== "DISCOVERY"),
  };

  return {
    ...fallback,
    options: {
      ...fallback.options,
      planningContext: planningArtifacts,
    },
    prompt: buildRequirementGuardPrompt(
      normalizedPrompt,
      requirementLockConfig,
      scopeExpansionConfig,
      expansionState,
      planningArtifacts,
      requirementRbjState,
      requirementRbjConfig
    ),
  };
}

module.exports = {
  requirement,
  getMatchConfig,
  evaluateMatch,
  getRequirementLockConfig,
  getPlanningModeConfig,
  getAssuranceModeConfig,
  getRequirementRbjConfig,
  getScopeExpansionConfig,
  transformExecRequest,
};

