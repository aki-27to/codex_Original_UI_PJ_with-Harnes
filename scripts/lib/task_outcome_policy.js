"use strict";

const fs = require("fs");
const path = require("path");

const defaultTaskOutcomeContractPath = path.join(__dirname, "..", "config", "task_outcome_contract.json");

const defaultTaskOutcomeContractDefinition = Object.freeze({
  schema: "task-outcome-contract.v3",
  version: "2026-04-12.r1",
  proofCarryingRequiredFields: [
    "task_id",
    "actor",
    "status",
    "claimed_work",
    "changed_artifacts",
    "evidence_refs",
    "unresolved_items",
    "acceptance_coverage",
    "handoff_readiness",
    "goal_alignment_trace",
    "adoption_decision_basis",
  ],
  decisionArtifacts: {
    required: ["iteration_decision.json", "release_decision.json"],
    derived: ["adoption_readiness_eval.json", "escalation_decision.json", "worker_decision_surface.json"],
  },
  authoritySeparation: Object.freeze({
    taskVerdictPrimaryArtifact: "worker_decision_surface.json",
    programReadinessArtifacts: Object.freeze([
      "goal_completion_status.json",
      "subjective_goal_completion_status.json",
      "compatibility_completion_status.json",
    ]),
    programReadinessBlockingDefault: false,
    blockingActivation: Object.freeze({
      requiresExplicitUserRequest: true,
      explicitRequestScopes: Object.freeze(["readiness", "release", "whole_harness_completion"]),
      ordinaryTaskCompletion: Object.freeze({
        taskVerdictPrimary: true,
        programReadinessIsBackgroundTelemetry: true,
        programReadinessMayBlockTaskCompletion: false,
      }),
    }),
  }),
  statuses: [
    { id: "COMPLETED", class: "success", terminal: true },
    { id: "BLOCKED", class: "blocked", terminal: true },
    { id: "NEEDS_INPUT", class: "needs_input", terminal: true },
    { id: "FAILED_VALIDATION", class: "validation_failure", terminal: true },
    { id: "PARTIAL", class: "partial", terminal: true },
  ],
  turnStateDefaults: {
    completed: "COMPLETED",
    interrupted: "BLOCKED",
    failed: "BLOCKED",
  },
  turnStateHints: {
    completed: ["COMPLETED", "PARTIAL"],
    interrupted: ["BLOCKED", "NEEDS_INPUT"],
    failed: ["FAILED_VALIDATION", "BLOCKED", "NEEDS_INPUT"],
  },
  reasonMap: {
    interactive_approval_unavailable: "NEEDS_INPUT",
    high_risk_requires_request: "NEEDS_INPUT",
    danger_full_access_high_risk_guard: "NEEDS_INPUT",
    legacy_only_requires_parent_override: "BLOCKED",
    path_out_of_scope: "BLOCKED",
    verification_scope_violation: "BLOCKED",
    agent_read_only_role: "BLOCKED",
    parent_material_implementation_forbidden: "FAILED_VALIDATION",
    parent_dispatch_guard_block: "FAILED_VALIDATION",
    missing_required_evidence: "FAILED_VALIDATION",
    system_coherence_review_missing: "FAILED_VALIDATION",
    family_completion_gate_failed: "FAILED_VALIDATION",
    silent_requirement_rewrite: "FAILED_VALIDATION",
    runtime_post_lock_drift_failed: "FAILED_VALIDATION",
    return_to_intake_required: "BLOCKED",
    release_clause_unsatisfied: "FAILED_VALIDATION",
    required_evidence_failures_present: "FAILED_VALIDATION",
    goal_substitution_detected: "FAILED_VALIDATION",
    silent_task_contract_rewrite: "FAILED_VALIDATION",
    literal_alignment_below_threshold: "FAILED_VALIDATION",
    task_contract_integrity_below_threshold: "FAILED_VALIDATION",
    procedural_closure_without_adoption: "FAILED_VALIDATION",
    latent_intent_alignment_below_threshold: "PARTIAL",
    artifact_quality_below_threshold: "PARTIAL",
    budget_exhausted_while_value_remaining: "BLOCKED",
    release_conditions_unsatisfied: "PARTIAL",
    "intent_*": "FAILED_VALIDATION",
    partial_delivery: "PARTIAL",
  },
});

function safeString(value, max = 2000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value !== 0 : fallback;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizeStatusId(value) {
  return safeString(value, 80)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeReasonToken(value) {
  return safeString(value, 120)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function promptMentionsExplicitScope(prompt, scope) {
  const text = safeString(prompt, 16000).toLowerCase();
  const normalizedScope = normalizeReasonToken(scope);
  if (!text || !normalizedScope) {
    return false;
  }
  const candidates = [
    normalizedScope,
    normalizedScope.replace(/_/g, " "),
    normalizedScope.replace(/_/g, "-"),
  ];
  return candidates.some((candidate) => candidate && text.includes(candidate));
}

function normalizeTurnState(value) {
  const normalized = safeString(value, 60).toLowerCase();
  if (normalized === "completed") {
    return "completed";
  }
  if (normalized === "failed") {
    return "failed";
  }
  if (normalized === "interrupted" || normalized === "cancelled" || normalized === "canceled") {
    return "interrupted";
  }
  if (normalized === "in_progress" || normalized === "inprogress" || normalized === "queued" || normalized === "pending" || normalized === "running") {
    return "in_progress";
  }
  return "";
}

function normalizeStatusEntries(values) {
  const source = Array.isArray(values) ? values : defaultTaskOutcomeContractDefinition.statuses;
  const entries = [];
  const seen = new Set();
  for (const value of source) {
    const raw = value && typeof value === "object" ? value : {};
    const id = normalizeStatusId(raw.id || raw.status);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    entries.push(Object.freeze({
      id,
      class: safeString(raw.class, 80).toLowerCase() || "unknown",
      terminal: normalizeBoolean(raw.terminal, true),
    }));
  }
  return entries.length ? entries : defaultTaskOutcomeContractDefinition.statuses.slice();
}

function normalizeTurnStateDefaults(input, validStatusIds) {
  const source = input && typeof input === "object" ? input : defaultTaskOutcomeContractDefinition.turnStateDefaults;
  const out = {};
  for (const [turnState, statusId] of Object.entries(source)) {
    const normalizedTurnState = normalizeTurnState(turnState);
    const normalizedStatus = normalizeStatusId(statusId);
    if (!normalizedTurnState || !validStatusIds.has(normalizedStatus)) {
      continue;
    }
    out[normalizedTurnState] = normalizedStatus;
  }
  for (const [turnState, statusId] of Object.entries(defaultTaskOutcomeContractDefinition.turnStateDefaults)) {
    if (!Object.prototype.hasOwnProperty.call(out, turnState)) {
      out[turnState] = statusId;
    }
  }
  return Object.freeze(out);
}

function normalizeTurnStateHints(input, validStatusIds) {
  const source = input && typeof input === "object" ? input : defaultTaskOutcomeContractDefinition.turnStateHints;
  const out = {};
  for (const [turnState, values] of Object.entries(source)) {
    const normalizedTurnState = normalizeTurnState(turnState);
    if (!normalizedTurnState || !Array.isArray(values)) {
      continue;
    }
    const unique = [];
    for (const value of values) {
      const normalizedStatus = normalizeStatusId(value);
      if (!normalizedStatus || !validStatusIds.has(normalizedStatus) || unique.includes(normalizedStatus)) {
        continue;
      }
      unique.push(normalizedStatus);
    }
    if (unique.length) {
      out[normalizedTurnState] = Object.freeze(unique);
    }
  }
  for (const [turnState, values] of Object.entries(defaultTaskOutcomeContractDefinition.turnStateHints)) {
    if (!Object.prototype.hasOwnProperty.call(out, turnState)) {
      out[turnState] = Object.freeze(values.slice());
    }
  }
  return Object.freeze(out);
}

function normalizeReasonMap(input, validStatusIds) {
  const source = input && typeof input === "object" ? input : defaultTaskOutcomeContractDefinition.reasonMap;
  const out = {};
  for (const [rawReason, rawStatus] of Object.entries(source)) {
    const reason = normalizeReasonToken(rawReason);
    const status = normalizeStatusId(rawStatus);
    if (!reason || !status || !validStatusIds.has(status)) {
      continue;
    }
    out[reason] = status;
  }
  for (const [rawReason, rawStatus] of Object.entries(defaultTaskOutcomeContractDefinition.reasonMap)) {
    if (!Object.prototype.hasOwnProperty.call(out, rawReason)) {
      out[rawReason] = rawStatus;
    }
  }
  return Object.freeze(out);
}

function normalizeAuthoritySeparation(input) {
  const source = input && typeof input === "object"
    ? input
    : defaultTaskOutcomeContractDefinition.authoritySeparation;
  const blockingActivation = source.blockingActivation && typeof source.blockingActivation === "object"
    ? source.blockingActivation
    : defaultTaskOutcomeContractDefinition.authoritySeparation.blockingActivation;
  const ordinaryTaskCompletion = blockingActivation.ordinaryTaskCompletion && typeof blockingActivation.ordinaryTaskCompletion === "object"
    ? blockingActivation.ordinaryTaskCompletion
    : defaultTaskOutcomeContractDefinition.authoritySeparation.blockingActivation.ordinaryTaskCompletion;
  return Object.freeze({
    taskVerdictPrimaryArtifact: safeString(
      source.taskVerdictPrimaryArtifact,
      120
    ) || defaultTaskOutcomeContractDefinition.authoritySeparation.taskVerdictPrimaryArtifact,
    programReadinessArtifacts: Array.isArray(source.programReadinessArtifacts)
      ? Object.freeze(source.programReadinessArtifacts.map((entry) => safeString(entry, 120)).filter(Boolean).slice(0, 12))
      : defaultTaskOutcomeContractDefinition.authoritySeparation.programReadinessArtifacts,
    programReadinessBlockingDefault: normalizeBoolean(
      source.programReadinessBlockingDefault,
      defaultTaskOutcomeContractDefinition.authoritySeparation.programReadinessBlockingDefault
    ),
    blockingActivation: Object.freeze({
      requiresExplicitUserRequest: normalizeBoolean(
        blockingActivation.requiresExplicitUserRequest,
        defaultTaskOutcomeContractDefinition.authoritySeparation.blockingActivation.requiresExplicitUserRequest
      ),
      explicitRequestScopes: Array.isArray(blockingActivation.explicitRequestScopes)
        ? Object.freeze(blockingActivation.explicitRequestScopes.map((entry) => normalizeReasonToken(entry)).filter(Boolean).slice(0, 12))
        : defaultTaskOutcomeContractDefinition.authoritySeparation.blockingActivation.explicitRequestScopes,
      ordinaryTaskCompletion: Object.freeze({
        taskVerdictPrimary: normalizeBoolean(
          ordinaryTaskCompletion.taskVerdictPrimary,
          defaultTaskOutcomeContractDefinition.authoritySeparation.blockingActivation.ordinaryTaskCompletion.taskVerdictPrimary
        ),
        programReadinessIsBackgroundTelemetry: normalizeBoolean(
          ordinaryTaskCompletion.programReadinessIsBackgroundTelemetry,
          defaultTaskOutcomeContractDefinition.authoritySeparation.blockingActivation.ordinaryTaskCompletion.programReadinessIsBackgroundTelemetry
        ),
        programReadinessMayBlockTaskCompletion: normalizeBoolean(
          ordinaryTaskCompletion.programReadinessMayBlockTaskCompletion,
          defaultTaskOutcomeContractDefinition.authoritySeparation.blockingActivation.ordinaryTaskCompletion.programReadinessMayBlockTaskCompletion
        ),
      }),
    }),
  });
}

function isProgramReadinessBlockingRequested({ prompt = "", requestedDecisionScopes = [], contract } = {}) {
  const normalizedContract = normalizeTaskOutcomeContract(contract);
  const authoritySeparation = normalizedContract.authoritySeparation;
  const activation = authoritySeparation.blockingActivation;
  if (authoritySeparation.programReadinessBlockingDefault) {
    return true;
  }
  if (!activation.requiresExplicitUserRequest) {
    return true;
  }
  const normalizedScopes = Array.isArray(requestedDecisionScopes)
    ? requestedDecisionScopes.map((entry) => normalizeReasonToken(entry)).filter(Boolean)
    : [];
  if (normalizedScopes.some((scope) => activation.explicitRequestScopes.includes(scope))) {
    return true;
  }
  return activation.explicitRequestScopes.some((scope) => promptMentionsExplicitScope(prompt, scope));
}

function normalizeTaskOutcomeContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  const statuses = normalizeStatusEntries(payload.statuses);
  const validStatusIds = new Set(statuses.map((entry) => entry.id));
  return Object.freeze({
    schema: safeString(payload.schema, 120) || defaultTaskOutcomeContractDefinition.schema,
    version: safeString(payload.version, 120) || defaultTaskOutcomeContractDefinition.version,
    proofCarryingRequiredFields: Array.isArray(payload.proofCarryingRequiredFields)
      ? payload.proofCarryingRequiredFields.map((entry) => safeString(entry, 120)).filter(Boolean).slice(0, 24)
      : defaultTaskOutcomeContractDefinition.proofCarryingRequiredFields.slice(),
    statuses: Object.freeze(statuses),
    decisionArtifacts: Object.freeze({
      required: Array.isArray(payload.decisionArtifacts && payload.decisionArtifacts.required)
        ? payload.decisionArtifacts.required.map((entry) => safeString(entry, 120)).filter(Boolean).slice(0, 12)
        : defaultTaskOutcomeContractDefinition.decisionArtifacts.required.slice(),
      derived: Array.isArray(payload.decisionArtifacts && payload.decisionArtifacts.derived)
        ? payload.decisionArtifacts.derived.map((entry) => safeString(entry, 120)).filter(Boolean).slice(0, 12)
        : defaultTaskOutcomeContractDefinition.decisionArtifacts.derived.slice(),
    }),
    authoritySeparation: normalizeAuthoritySeparation(payload.authoritySeparation),
    turnStateDefaults: normalizeTurnStateDefaults(payload.turnStateDefaults, validStatusIds),
    turnStateHints: normalizeTurnStateHints(payload.turnStateHints, validStatusIds),
    reasonMap: normalizeReasonMap(payload.reasonMap, validStatusIds),
  });
}

function loadTaskOutcomeContract(filePath = defaultTaskOutcomeContractPath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = raw ? JSON.parse(raw) : {};
  return normalizeTaskOutcomeContract(parsed);
}

function validateTaskOutcomeStatus({ status, spec }) {
  const contract = normalizeTaskOutcomeContract(spec);
  const normalizedStatus = normalizeStatusId(status);
  if (!normalizedStatus) {
    return { ok: false, reason: "missing_task_outcome_status", status: "" };
  }
  if (!contract.statuses.some((entry) => entry.id === normalizedStatus)) {
    return { ok: false, reason: "task_outcome_status_not_allowed", status: normalizedStatus };
  }
  return { ok: true, reason: "ok", status: normalizedStatus };
}

function validateTaskOutcomeTurnCompatibility({ turnStatus, taskOutcomeStatus, spec }) {
  const contract = normalizeTaskOutcomeContract(spec);
  const normalizedTurnState = normalizeTurnState(turnStatus);
  const normalizedOutcome = normalizeStatusId(taskOutcomeStatus);
  if (!normalizedTurnState) {
    return { ok: false, reason: "missing_turn_state", turnState: "", taskOutcomeStatus: normalizedOutcome };
  }
  const statusValidation = validateTaskOutcomeStatus({ status: normalizedOutcome, spec: contract });
  if (!statusValidation.ok) {
    return {
      ok: false,
      reason: statusValidation.reason,
      turnState: normalizedTurnState,
      taskOutcomeStatus: normalizedOutcome,
    };
  }
  const allowedStatuses = Array.isArray(contract.turnStateHints[normalizedTurnState])
    ? contract.turnStateHints[normalizedTurnState]
    : [];
  const allowed = allowedStatuses.includes(statusValidation.status);
  return {
    ok: allowed,
    reason: allowed ? "ok" : "task_outcome_turn_state_mismatch",
    turnState: normalizedTurnState,
    taskOutcomeStatus: statusValidation.status,
    allowedStatuses,
  };
}

function summarizeTaskOutcomeContract(spec) {
  const contract = normalizeTaskOutcomeContract(spec);
  return {
    schema: contract.schema,
    version: contract.version,
    proofCarryingRequiredFields: Array.isArray(contract.proofCarryingRequiredFields) ? contract.proofCarryingRequiredFields.slice(0, 24) : [],
    statuses: contract.statuses.map((entry) => entry.id),
    decisionArtifacts: contract.decisionArtifacts,
    authoritySeparation: contract.authoritySeparation,
    turnStateDefaults: contract.turnStateDefaults,
    turnStateHints: contract.turnStateHints,
    reasonMapKeys: Object.keys(contract.reasonMap).slice(0, 32),
  };
}

function classifyErrorReason(errorText) {
  const text = safeString(errorText, 2400).toLowerCase();
  if (!text) {
    return "";
  }
  if (
    (text.includes("non-interactive") && text.includes("approval")) ||
    (text.includes("non interactive") && text.includes("approval")) ||
    (text.includes("cannot prompt") && text.includes("approval")) ||
    (text.includes("approval required") && text.includes("non-interactive")) ||
    text.includes("requestuserinput")
  ) {
    return "interactive_approval_unavailable";
  }
  if (text.includes("parent dispatch guard")) {
    return "parent_dispatch_guard_block";
  }
  if (text.includes("missing evidence")) {
    return "missing_required_evidence";
  }
  return "";
}

function deriveTaskOutcome(input = {}) {
  const contract = normalizeTaskOutcomeContract(input.spec);
  const explicitStatus = normalizeStatusId(input.explicitStatus);
  const explicitValidation = validateTaskOutcomeStatus({ status: explicitStatus, spec: contract });
  if (explicitValidation.ok) {
    return {
      status: explicitValidation.status,
      reason: normalizeReasonToken(input.reason) || "explicit_status",
      source: "explicit_status",
      turnState: normalizeTurnState(input.turnStatus),
    };
  }

  const reasonCandidates = [];
  const pushReason = (value) => {
    const normalized = normalizeReasonToken(value);
    if (!normalized || reasonCandidates.includes(normalized)) {
      return;
    }
    reasonCandidates.push(normalized);
  };

  pushReason(input.reason);
  pushReason(input.approvalReason);
  pushReason(input.governanceReason);
  pushReason(classifyErrorReason(input.errorText));
  if (input.parentDispatchViolation) {
    pushReason("parent_dispatch_guard_block");
  }
  if (input.missingEvidence) {
    pushReason("missing_required_evidence");
  }
  if (input.partial) {
    pushReason("partial_delivery");
  }

  const programReadinessBlockingRequested = isProgramReadinessBlockingRequested({
    prompt: input.prompt,
    requestedDecisionScopes: input.requestedDecisionScopes,
    contract,
  });

  for (const reason of reasonCandidates) {
    if (reason === "release_conditions_unsatisfied" && !programReadinessBlockingRequested) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(contract.reasonMap, reason)) {
      return {
        status: contract.reasonMap[reason],
        reason,
        source: "reason_map",
        turnState: normalizeTurnState(input.turnStatus),
      };
    }
  }

  for (const reason of reasonCandidates) {
    const wildcardEntry = Object.entries(contract.reasonMap).find(([pattern]) =>
      pattern.endsWith("*") && reason.startsWith(pattern.slice(0, -1))
    );
    if (wildcardEntry) {
      return {
        status: wildcardEntry[1],
        reason,
        source: "reason_map_wildcard",
        turnState: normalizeTurnState(input.turnStatus),
      };
    }
  }

  const normalizedTurnState = normalizeTurnState(input.turnStatus);
  if (normalizedTurnState && Object.prototype.hasOwnProperty.call(contract.turnStateDefaults, normalizedTurnState)) {
    return {
      status: contract.turnStateDefaults[normalizedTurnState],
      reason: `${normalizedTurnState}_default`,
      source: "turn_state_default",
      turnState: normalizedTurnState,
    };
  }

  return {
    status: "BLOCKED",
    reason: "fallback_default",
    source: "fallback",
    turnState: normalizedTurnState,
  };
}

module.exports = {
  defaultTaskOutcomeContractPath,
  deriveTaskOutcome,
  isProgramReadinessBlockingRequested,
  loadTaskOutcomeContract,
  normalizeTaskOutcomeContract,
  normalizeTaskOutcomeStatus: normalizeStatusId,
  summarizeTaskOutcomeContract,
  validateTaskOutcomeTurnCompatibility,
  validateTaskOutcomeStatus,
};
