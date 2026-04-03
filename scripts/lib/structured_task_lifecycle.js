"use strict";

function safeString(value, max = 4000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function nowIso(value = Date.now()) {
  const parsed = Number(value);
  return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString();
}

function slugify(value, fallback = "item", max = 120) {
  const raw = safeString(value, 200)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (raw || fallback).slice(0, max);
}

function uniqueStrings(values, max = 32) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 500);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

const lifecycleStates = Object.freeze([
  "initialized",
  "planned",
  "running",
  "blocked",
  "awaiting_approval",
  "verifier_failed",
  "completed",
  "abandoned",
  "archived",
]);

const lifecycleTransitionMap = Object.freeze({
  initialized: new Set(["planned", "abandoned"]),
  planned: new Set(["running", "blocked", "awaiting_approval", "verifier_failed", "abandoned"]),
  running: new Set(["running", "blocked", "awaiting_approval", "verifier_failed", "completed", "abandoned"]),
  blocked: new Set(["running", "awaiting_approval", "verifier_failed", "abandoned"]),
  awaiting_approval: new Set(["running", "blocked", "verifier_failed", "abandoned"]),
  verifier_failed: new Set(["running", "blocked", "abandoned", "archived"]),
  completed: new Set(["archived"]),
  abandoned: new Set(["archived"]),
  archived: new Set([]),
});

const legacyStatusByLifecycle = Object.freeze({
  initialized: "active",
  planned: "active",
  running: "active",
  blocked: "PARTIAL",
  awaiting_approval: "PARTIAL",
  verifier_failed: "FAILED_VALIDATION",
  completed: "COMPLETED",
  abandoned: "ABANDONED",
  archived: "ARCHIVED",
});

function deriveLifecycleFromLegacyStatus(taskState) {
  const status = safeString(taskState && taskState.status, 80).toUpperCase();
  if (status === "COMPLETED") return "completed";
  if (status === "FAILED_VALIDATION") return "verifier_failed";
  if (status === "ABANDONED") return "abandoned";
  if (status === "ARCHIVED") return "archived";
  if (safeString(taskState && taskState.phase, 80) === "paused") return "blocked";
  return "planned";
}

function ensureLifecycle(taskState, { source = "phase3_backfill", reason = "initialize lifecycle metadata" } = {}) {
  if (!taskState || typeof taskState !== "object") return taskState;
  if (taskState.lifecycle && lifecycleStates.includes(safeString(taskState.lifecycle.currentState, 80))) {
    taskState.status = legacyStatusByLifecycle[safeString(taskState.lifecycle.currentState, 80)] || taskState.status;
    return taskState;
  }
  const initialState = deriveLifecycleFromLegacyStatus(taskState);
  taskState.lifecycle = {
    schema: "task-lifecycle-state.v1",
    currentState: initialState,
    updatedAt: nowIso(),
    history: [
      {
        from: "",
        to: initialState,
        at: nowIso(),
        source: safeString(source, 120) || "phase3_backfill",
        reason: safeString(reason, 400) || "initialize lifecycle metadata",
      },
    ],
  };
  taskState.status = legacyStatusByLifecycle[initialState] || taskState.status;
  return taskState;
}

function canTransitionLifecycle(currentState, nextState) {
  const current = safeString(currentState, 80);
  const next = safeString(nextState, 80);
  if (!lifecycleStates.includes(current) || !lifecycleStates.includes(next)) return false;
  return lifecycleTransitionMap[current].has(next);
}

function transitionLifecycle(taskState, nextState, { source = "phase3", reason = "", allowSame = false, force = false } = {}) {
  ensureLifecycle(taskState);
  const currentState = safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80);
  const targetState = safeString(nextState, 80);
  if (!lifecycleStates.includes(targetState)) {
    throw new Error(`unknown_lifecycle_state:${targetState || "(empty)"}`);
  }
  if (currentState === targetState) {
    if (!allowSame) return taskState;
  } else if (!force && !canTransitionLifecycle(currentState, targetState)) {
    throw new Error(`invalid_lifecycle_transition:${currentState}->${targetState}`);
  }
  taskState.lifecycle.history = Array.isArray(taskState.lifecycle.history) ? taskState.lifecycle.history : [];
  taskState.lifecycle.history.push({
    from: currentState,
    to: targetState,
    at: nowIso(),
    source: safeString(source, 120) || "phase3",
    reason: safeString(reason, 400) || "",
  });
  taskState.lifecycle.currentState = targetState;
  taskState.lifecycle.updatedAt = nowIso();
  taskState.status = legacyStatusByLifecycle[targetState] || taskState.status;
  taskState.updatedAt = nowIso();
  return taskState;
}

function lifecycleAllowsResume(state) {
  const normalized = safeString(state, 80);
  return ["planned", "running", "blocked", "awaiting_approval", "verifier_failed"].includes(normalized);
}

function lifecycleAllowsArchive(state) {
  const normalized = safeString(state, 80);
  return ["completed", "abandoned", "verifier_failed"].includes(normalized);
}

function lifecycleAllowsAbandon(state) {
  const normalized = safeString(state, 80);
  return ["initialized", "planned", "running", "blocked", "awaiting_approval", "verifier_failed"].includes(normalized);
}

function summarizeAcceptanceState(planState) {
  const rows = Array.isArray(planState && planState.acceptanceCriteria) ? planState.acceptanceCriteria : [];
  const completed = rows.filter((entry) => safeString(entry && entry.status, 40) === "passed").length;
  const remaining = rows.length - completed;
  return {
    total: rows.length,
    completed,
    remaining,
  };
}

function ensurePlanStateShape(planState, { objective = "", sessionId = "" } = {}) {
  if (!planState || typeof planState !== "object") return planState;
  planState.schema = "long-horizon-plan-state.v2";
  planState.steps = Array.isArray(planState.steps) ? planState.steps : [];
  planState.acceptanceCriteria = Array.isArray(planState.acceptanceCriteria) ? planState.acceptanceCriteria : [];
  for (const step of planState.steps) {
    step.checkpoints = Array.isArray(step.checkpoints) && step.checkpoints.length
      ? step.checkpoints
      : [{
        id: slugify(`${safeString(step && step.id, 120)}-checkpoint`, "checkpoint"),
        expectedEvidence: uniqueStrings(step && step.acceptanceRefs, 8),
        verifierTouchpoint: "close_session",
      }];
    step.dependencies = Array.isArray(step.dependencies) ? step.dependencies : [];
    step.blockers = Array.isArray(step.blockers) ? step.blockers : [];
    step.verifierTouchpoints = Array.isArray(step.verifierTouchpoints) && step.verifierTouchpoints.length
      ? step.verifierTouchpoints
      : ["close_session"];
    step.replanTriggers = Array.isArray(step.replanTriggers) && step.replanTriggers.length
      ? step.replanTriggers
      : ["verifier_fail", "plan_drift", "blocked"];
  }
  planState.blockers = Array.isArray(planState.blockers) ? planState.blockers : [];
  planState.verifierTouchpoints = Array.isArray(planState.verifierTouchpoints) && planState.verifierTouchpoints.length
    ? planState.verifierTouchpoints
    : ["before_close", "after_replan"];
  planState.replanTriggers = Array.isArray(planState.replanTriggers) && planState.replanTriggers.length
    ? planState.replanTriggers
    : ["verifier_fail", "plan_drift", "blocked"];
  if (!planState.currentSprint || typeof planState.currentSprint !== "object") {
    planState.currentSprint = {
      id: slugify(`sprint-${sessionId || "current"}`, "sprint"),
      title: "current sprint",
      goal: safeString(objective, 260),
      status: "active",
      stepIds: planState.steps.slice(0, 2).map((entry) => safeString(entry && entry.id, 120)).filter(Boolean),
      sessionId: safeString(sessionId, 120),
      updatedAt: nowIso(),
    };
  }
  planState.updatedAt = nowIso();
  return planState;
}

function buildTaskSpec({
  taskId,
  title,
  objective,
  familyId,
  contract,
  acceptanceCriteria = [],
  deliverables = [],
  stopConditions = [],
  verifierRequirements = [],
} = {}) {
  const derivedDeliverables = uniqueStrings(deliverables.length ? deliverables : acceptanceCriteria, 32);
  return {
    schema: "task-spec.v1",
    generatedAt: nowIso(),
    taskId: safeString(taskId, 120),
    title: safeString(title, 200),
    taskFamily: safeString(familyId || contract && contract.familyId, 80),
    objective: safeString(objective, 1200),
    humanComparableTaskFraming: safeString(contract && contract.humanComparableTaskFraming, 600),
    successCriteria: uniqueStrings(contract && contract.successCriteria, 24),
    acceptanceCriteria: uniqueStrings(acceptanceCriteria, 32),
    deliverables: derivedDeliverables,
    timeBudget: contract && contract.timeBudget ? contract.timeBudget : { targetMs: 120000, warnMs: 300000, hardStopMs: 900000 },
    allowedTools: uniqueStrings(contract && contract.allowedTools, 32),
    deniedTools: uniqueStrings(contract && contract.deniedTools, 32),
    stopConditions: uniqueStrings(stopConditions.length ? stopConditions : contract && contract.stopConditions, 24),
    difficultyTiers: uniqueStrings(contract && contract.difficultyTiers, 12),
    modalityTags: uniqueStrings(contract && contract.modalityTags, 12),
    structureTags: uniqueStrings(contract && contract.structureTags, 12),
    approvalBoundary: contract && contract.approvalBoundary ? contract.approvalBoundary : { requiredWhen: [] },
    verifierRequirements: uniqueStrings(
      verifierRequirements.length
        ? verifierRequirements
        : (Array.isArray(contract && contract.verifierRequirements) && contract.verifierRequirements.length
          ? contract.verifierRequirements
        : [
          "independent_verifier_pass_required_for_completed",
          "acceptance_contract_all_items_passed_for_completed",
          "closeout_summary_written_before_completed",
        ]),
      24
    ),
  };
}

function buildAcceptanceContract({ taskSpec, planState, verifierState } = {}) {
  const planCriteria = Array.isArray(planState && planState.acceptanceCriteria) ? planState.acceptanceCriteria : [];
  const items = planCriteria.map((entry) => ({
    id: safeString(entry && entry.id, 120),
    text: safeString(entry && entry.text, 400),
    status: safeString(entry && entry.status, 40) || "pending",
    evidence: uniqueStrings(entry && entry.evidence, 12),
    verifierTouchpoint: safeString(entry && entry.verifierTouchpoint, 120) || "close_session",
    lastCheckedAt: safeString(entry && entry.lastCheckedAt, 80),
  }));
  const summary = summarizeAcceptanceState(planState);
  return {
    schema: "acceptance-contract.v1",
    generatedAt: nowIso(),
    taskId: safeString(taskSpec && taskSpec.taskId, 120),
    verifierVerdict: safeString(verifierState && verifierState.lastVerifierVerdict, 40) || "UNKNOWN",
    items,
    summary,
  };
}

function buildPlanArtifact({ taskId, planState, verifierState, reason = "plan_active" } = {}) {
  const steps = Array.isArray(planState && planState.steps) ? planState.steps : [];
  const currentStep = steps.find((entry) => safeString(entry && entry.id, 120) === safeString(planState && planState.currentStepId, 120)) || null;
  return {
    schema: "task-plan.v1",
    generatedAt: nowIso(),
    taskId: safeString(taskId, 120),
    reason: safeString(reason, 120) || "plan_active",
    orderedSteps: steps.map((step) => ({
      id: safeString(step && step.id, 120),
      title: safeString(step && step.title, 240),
      status: safeString(step && step.status, 40),
      priority: Number(step && step.priority || 0),
      checkpoints: Array.isArray(step && step.checkpoints) ? step.checkpoints : [],
      dependencies: Array.isArray(step && step.dependencies) ? step.dependencies : [],
      blockers: Array.isArray(step && step.blockers) ? step.blockers : [],
      verifierTouchpoints: Array.isArray(step && step.verifierTouchpoints) ? step.verifierTouchpoints : [],
      replanTriggers: Array.isArray(step && step.replanTriggers) ? step.replanTriggers : [],
    })),
    currentStep: currentStep ? {
      id: safeString(currentStep.id, 120),
      title: safeString(currentStep.title, 240),
      status: safeString(currentStep.status, 40),
    } : null,
    blockers: Array.isArray(planState && planState.blockers) ? planState.blockers : [],
    verifierTouchpoints: Array.isArray(planState && planState.verifierTouchpoints) ? planState.verifierTouchpoints : [],
    replanTriggers: Array.isArray(planState && planState.replanTriggers) ? planState.replanTriggers : [],
    lastVerifierVerdict: safeString(verifierState && verifierState.lastVerifierVerdict, 40) || "UNKNOWN",
  };
}

function buildReplanArtifact({ taskState, planState, verifierState, acceptanceContract, reason = "" } = {}) {
  const remainingAcceptance = Array.isArray(acceptanceContract && acceptanceContract.items)
    ? acceptanceContract.items.filter((entry) => safeString(entry && entry.status, 40) !== "passed")
    : [];
  const remainingSteps = Array.isArray(planState && planState.steps)
    ? planState.steps.filter((entry) => safeString(entry && entry.status, 40) !== "completed")
    : [];
  return {
    schema: "task-replan.v1",
    generatedAt: nowIso(),
    taskId: safeString(taskState && taskState.taskId, 120),
    lifecycleState: safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80),
    reason: safeString(reason, 400) || "verifier_failed_or_plan_drift",
    unresolvedVerifierFindings: Array.isArray(verifierState && verifierState.unresolvedFindings) ? verifierState.unresolvedFindings : [],
    remainingAcceptance,
    remainingSteps: remainingSteps.map((entry) => ({
      id: safeString(entry && entry.id, 120),
      title: safeString(entry && entry.title, 240),
      status: safeString(entry && entry.status, 40),
    })),
    recommendedNextStepId: remainingSteps[0] ? safeString(remainingSteps[0].id, 120) : "",
  };
}

function buildCloseoutSummary({ taskState, planState, verifierState, acceptanceContract, completionClaim = "" } = {}) {
  const items = Array.isArray(acceptanceContract && acceptanceContract.items) ? acceptanceContract.items : [];
  const remainingItems = items.filter((entry) => safeString(entry && entry.status, 40) !== "passed");
  const unresolvedVerifier = Array.isArray(verifierState && verifierState.unresolvedFindings) ? verifierState.unresolvedFindings : [];
  return {
    schema: "task-closeout-summary.v1",
    generatedAt: nowIso(),
    taskId: safeString(taskState && taskState.taskId, 120),
    completionClaim: safeString(completionClaim, 80),
    lifecycleState: safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80),
    legacyStatus: safeString(taskState && taskState.status, 80),
    objective: safeString(taskState && taskState.objective, 800),
    currentStepId: safeString(planState && planState.currentStepId, 120),
    verifierVerdict: safeString(verifierState && verifierState.lastVerifierVerdict, 40) || "UNKNOWN",
    acceptance: {
      items,
      completedCount: items.length - remainingItems.length,
      remainingCount: remainingItems.length,
    },
    blockers: uniqueStrings([
      ...(Array.isArray(taskState && taskState.unresolvedItems) ? taskState.unresolvedItems : []),
      ...unresolvedVerifier.map((entry) => safeString(entry && entry.reason, 320)),
      ...remainingItems.map((entry) => safeString(entry && entry.text, 320)),
    ], 48),
    remainingWork: uniqueStrings([
      ...remainingItems.map((entry) => safeString(entry && entry.text, 320)),
      ...unresolvedVerifier.map((entry) => safeString(entry && entry.reason, 320)),
    ], 48),
    closeAllowed: remainingItems.length === 0 && unresolvedVerifier.length === 0 ? 1 : 0,
  };
}

function buildTaskOperatingSummary({ taskState, planState, verifierState, acceptanceContract } = {}) {
  const acceptance = buildAcceptanceContract({ taskSpec: { taskId: taskState && taskState.taskId }, planState, verifierState });
  const contract = acceptanceContract && acceptanceContract.items ? acceptanceContract : acceptance;
  const remainingItems = contract.items.filter((entry) => safeString(entry && entry.status, 40) !== "passed");
  const currentStep = Array.isArray(planState && planState.steps)
    ? planState.steps.find((entry) => safeString(entry && entry.id, 120) === safeString(planState && planState.currentStepId, 120))
    : null;
  return {
    taskId: safeString(taskState && taskState.taskId, 120),
    title: safeString(taskState && taskState.title, 200),
    objective: safeString(taskState && taskState.objective, 800),
    role: safeString(taskState && taskState.role, 80) || "coordinator",
    parentTaskId: safeString(taskState && taskState.parentTaskId, 120),
    rootTaskId: safeString(taskState && taskState.rootTaskId, 120) || safeString(taskState && taskState.taskId, 120),
    orchestrationMode: safeString(taskState && taskState.orchestrationMode, 80) || "single_agent",
    lifecycleState: safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80),
    legacyStatus: safeString(taskState && taskState.status, 80),
    phase: safeString(taskState && taskState.phase, 80),
    currentStep: currentStep ? {
      id: safeString(currentStep.id, 120),
      title: safeString(currentStep.title, 240),
      status: safeString(currentStep.status, 40),
    } : null,
    acceptance: {
      total: contract.summary.total,
      completed: contract.summary.completed,
      remaining: contract.summary.remaining,
      remainingItems,
    },
    blockers: uniqueStrings([
      ...(Array.isArray(taskState && taskState.unresolvedItems) ? taskState.unresolvedItems : []),
      ...(Array.isArray(planState && planState.blockers) ? planState.blockers : []),
      ...(Array.isArray(verifierState && verifierState.unresolvedFindings)
        ? verifierState.unresolvedFindings.map((entry) => safeString(entry && entry.reason, 320))
        : []),
    ], 40),
    lastVerifierVerdict: safeString(verifierState && verifierState.lastVerifierVerdict, 40) || "UNKNOWN",
    lastUpdatedAt: safeString(taskState && taskState.updatedAt, 80) || nowIso(),
    childTaskIds: uniqueStrings(taskState && taskState.childTaskIds, 32),
    childTaskCount: Array.isArray(taskState && taskState.childTaskIds) ? taskState.childTaskIds.length : 0,
    integrationStatus: safeString(taskState && taskState.integrationStatus, 80) || "not_applicable",
    abandonAllowed: lifecycleAllowsAbandon(safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80)) ? 1 : 0,
    archiveAllowed: lifecycleAllowsArchive(safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80)) ? 1 : 0,
  };
}

module.exports = {
  buildAcceptanceContract,
  buildCloseoutSummary,
  buildPlanArtifact,
  buildReplanArtifact,
  buildTaskOperatingSummary,
  buildTaskSpec,
  canTransitionLifecycle,
  ensureLifecycle,
  ensurePlanStateShape,
  lifecycleAllowsAbandon,
  lifecycleAllowsArchive,
  lifecycleAllowsResume,
  lifecycleStates,
  summarizeAcceptanceState,
  transitionLifecycle,
};
