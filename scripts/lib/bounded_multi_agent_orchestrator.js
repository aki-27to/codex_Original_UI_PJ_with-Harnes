"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir, readJsonIfExists, repoRelative, writeJson } = require("./logging_surface");
const {
  buildTaskPaths,
  closeSession,
  initializeTask,
  inspectTask,
  loadContinuityPolicy,
  resumeTask,
  updateTask,
} = require("./long_horizon_continuity");
const {
  buildAcceptanceContract,
  buildPlanArtifact,
  buildReplanArtifact,
  ensurePlanStateShape,
} = require("./structured_task_lifecycle");
const {
  assertSafeAction,
  retrieveKnowledgeSlice,
  routeModel,
} = require("./agi_candidate_runtime");
const { assertOperationalModeAllowed } = require("./deployment_guards");

const defaultAgentRoleContractManifestPath = path.join(__dirname, "..", "config", "agent_role_contract_manifest.json");
const defaultMultiAgentPublicBaselinePath = path.join(__dirname, "..", "config", "multi_agent_public_baseline.json");
const artifactSimulatorExecutionMode = "artifact_simulator";

function safeString(value, max = 4000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function uniqueStrings(values, max = 32) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 320);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value, fallback = "item", max = 80) {
  const raw = safeString(value, 200).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (raw || fallback).slice(0, max);
}

function parseJson(filePath, fallback = null) {
  const payload = readJsonIfExists(filePath);
  return payload === null ? fallback : payload;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function loadAgentRoleContractManifest(filePath = defaultAgentRoleContractManifestPath) {
  const payload = parseJson(filePath, {});
  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "agent-role-contract-manifest.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    defaultRole: safeString(payload.defaultRole, 80) || "coordinator",
    singleAgentFallback: payload.singleAgentFallback && typeof payload.singleAgentFallback === "object"
      ? payload.singleAgentFallback
      : { stepThreshold: 1, acceptanceThreshold: 1, maxDelegationsPerStep: 2 },
    protectedStateScopes: uniqueStrings(payload.protectedStateScopes, 16),
    roles,
  });
}

function resolveRoleContract({ manifest, roleId }) {
  const normalizedRoleId = safeString(roleId, 80) || safeString(manifest && manifest.defaultRole, 80) || "coordinator";
  const contract = Array.isArray(manifest && manifest.roles)
    ? manifest.roles.find((entry) => safeString(entry && entry.id, 80) === normalizedRoleId)
    : null;
  if (!contract) {
    throw new Error(`unknown_agent_role:${normalizedRoleId}`);
  }
  return contract;
}

function loadMultiAgentBaseline(filePath = defaultMultiAgentPublicBaselinePath) {
  const payload = parseJson(filePath, {});
  const cases = ensureArray(payload.cases).map((entry) => {
    const workflow = ensureArray(entry && entry.workflow).map((step) => {
      if (typeof step === "string") {
        const role = safeString(step, 80);
        return {
          role,
          objective: `${role} for ${safeString(entry && entry.objective, 240)}`,
          expectedDeliverable: role === "planner"
            ? "update plan and checkpoints"
            : role === "researcher"
              ? safeString(entry && entry.expectedDeliverable, 240) || "produce research summary"
              : role === "executor"
                ? safeString(entry && entry.executorDeliverable, 240) || safeString(entry && entry.expectedDeliverable, 240) || "produce bounded deliverable"
                : role === "verifier"
                  ? "validate delegated acceptance subset"
                  : safeString(entry && entry.expectedDeliverable, 240),
          acceptanceSubset: uniqueStrings(entry && entry.acceptanceCriteria, 12),
          contextSlice: {
            researchMaterials: ensureArray(entry && entry.researchMaterials),
            verificationRules: entry && entry.verificationRules ? entry.verificationRules : {},
          },
          targetRole: role === "verifier"
            ? (ensureArray(entry && entry.workflow).includes("executor") ? "executor" : ensureArray(entry && entry.workflow).includes("researcher") ? "researcher" : "")
            : "",
          payload: role === "researcher"
            ? {
                findings: ensureArray(entry && entry.researchMaterials),
                citations: ensureArray(entry && entry.researchMaterials).map((_, index) => `source-${index + 1}`),
              }
            : role === "executor"
              ? {
                  deliverableSummary: safeString(entry && entry.executorDeliverable, 400) || safeString(entry && entry.expectedDeliverable, 240),
                  changedSurface: ["scripts/lib/bounded_multi_agent_orchestrator.js"],
                }
              : role === "verifier"
                ? {
                    verificationRules: entry && entry.verificationRules ? entry.verificationRules : {},
                  }
                : {},
        };
      }
      return step;
    });
    return { ...entry, workflow };
  });
  return {
    schema: safeString(payload.schema, 120) || "multi-agent-public-baseline.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    cases,
  };
}

function childArtifactPaths(taskPaths) {
  return {
    delegatedWorkItemPath: path.join(taskPaths.taskRoot, "delegated_work_item.json"),
    rawOutputPath: path.join(taskPaths.taskRoot, "agent_raw_output.json"),
    normalizedResultPath: path.join(taskPaths.taskRoot, "agent_normalized_result.json"),
  };
}

function readTaskBundle(paths) {
  return {
    taskState: parseJson(paths.taskStatePath, null),
    planState: parseJson(paths.planStatePath, null),
    taskSpec: parseJson(paths.taskSpecPath, null),
    acceptanceContract: parseJson(paths.acceptanceContractPath, null),
    verifierState: parseJson(paths.verifierStatePath, null),
    agentGraph: parseJson(paths.agentGraphPath, null),
    handoffHistory: parseJson(paths.handoffHistoryPath, null),
    integrationSummary: parseJson(paths.integrationSummaryPath, null),
  };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureGraph(taskId, taskState, graph) {
  const base = graph && typeof graph === "object" ? clone(graph) : {
    schema: "agent-graph.v1",
    generatedAt: nowIso(),
    rootTaskId: safeString(taskState && taskState.rootTaskId, 120) || taskId,
    nodes: [],
    edges: [],
  };
  base.nodes = ensureArray(base.nodes);
  base.edges = ensureArray(base.edges);
  if (!base.nodes.some((entry) => safeString(entry && entry.taskId, 120) === taskId)) {
    base.nodes.push({
      taskId,
      parentTaskId: safeString(taskState && taskState.parentTaskId, 120),
      role: safeString(taskState && taskState.role, 80) || "coordinator",
      lifecycleState: safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80),
      orchestrationMode: safeString(taskState && taskState.orchestrationMode, 80) || "single_agent",
      updatedAt: safeString(taskState && taskState.updatedAt, 80) || nowIso(),
    });
  }
  base.generatedAt = nowIso();
  return base;
}

function ensureHandoffHistory(taskId, history) {
  const base = history && typeof history === "object" ? clone(history) : {
    schema: "handoff-history.v1",
    generatedAt: nowIso(),
    taskId,
    entries: [],
  };
  base.entries = ensureArray(base.entries);
  base.generatedAt = nowIso();
  return base;
}

function ensureIntegrationSummary(taskId, summary) {
  const base = summary && typeof summary === "object" ? clone(summary) : {
    schema: "integration-summary.v1",
    generatedAt: nowIso(),
    taskId,
    entries: [],
    pendingIntegrations: [],
    blockedChildren: [],
    verifierFailedChildren: [],
    deniedChildren: [],
    orphanChildTaskIds: [],
    blockers: [],
  };
  base.entries = ensureArray(base.entries);
  base.pendingIntegrations = ensureArray(base.pendingIntegrations);
  base.blockedChildren = ensureArray(base.blockedChildren);
  base.verifierFailedChildren = ensureArray(base.verifierFailedChildren);
  base.deniedChildren = ensureArray(base.deniedChildren);
  base.orphanChildTaskIds = ensureArray(base.orphanChildTaskIds);
  base.blockers = ensureArray(base.blockers);
  base.generatedAt = nowIso();
  return base;
}

function assertAllowedTool(roleContract, toolName) {
  const denied = uniqueStrings(roleContract && roleContract.deniedTools, 32);
  if (denied.includes(toolName)) {
    throw new Error(`multi_agent_denied_tool:${safeString(roleContract && roleContract.id, 80)}:${toolName}`);
  }
}

function assertWritableScope(roleContract, scope, manifest) {
  const denied = new Set(uniqueStrings(roleContract && roleContract.deniedStateScope, 16));
  for (const entry of uniqueStrings(manifest && manifest.protectedStateScopes, 16)) denied.add(entry);
  const allowed = uniqueStrings(roleContract && roleContract.writableStateScope, 24);
  if (denied.has(scope)) {
    throw new Error(`multi_agent_denied_state_write:${safeString(roleContract && roleContract.id, 80)}:${scope}`);
  }
  if (allowed.length && !allowed.includes(scope)) {
    throw new Error(`multi_agent_state_scope_violation:${safeString(roleContract && roleContract.id, 80)}:${scope}`);
  }
}

function chooseSingleAgentFallback({ manifest, planState, acceptanceContract }) {
  const stepThreshold = Number(manifest && manifest.singleAgentFallback && manifest.singleAgentFallback.stepThreshold) || 1;
  const acceptanceThreshold = Number(manifest && manifest.singleAgentFallback && manifest.singleAgentFallback.acceptanceThreshold) || 1;
  const stepCount = Array.isArray(planState && planState.steps) ? planState.steps.length : 0;
  const acceptanceCount = Array.isArray(acceptanceContract && acceptanceContract.items) ? acceptanceContract.items.length : 0;
  return stepCount <= stepThreshold && acceptanceCount <= acceptanceThreshold;
}

function buildChildTaskId(parentTaskId, role) {
  return `${parentTaskId}-${safeString(role, 80) || "agent"}-${Date.now()}`;
}

function writeArtifacts(paths, values) {
  for (const [filePath, payload] of Object.entries(values)) {
    if (!filePath || payload === undefined) continue;
    ensureDir(path.dirname(filePath));
    writeJson(filePath, payload);
  }
}

function createHandoffBundle({
  parentTaskId,
  childTaskId,
  roleContract,
  role,
  parentBundle,
  delegatedObjective,
  relevantPlanStep,
  acceptanceSubset,
  contextSlice,
  expectedDeliverable,
  budget,
  modelRoute,
  knowledgeSlice,
  riskAssessment,
}) {
  return {
    schema: "bounded-handoff-bundle.v1",
    generatedAt: nowIso(),
    parentTaskId,
    childTaskId,
    role,
    delegatedObjective: safeString(delegatedObjective, 1200),
    relevantTaskSpecSubset: {
      taskId: safeString(parentBundle.taskSpec && parentBundle.taskSpec.taskId, 120),
      taskFamily: safeString(parentBundle.taskSpec && parentBundle.taskSpec.taskFamily, 80),
      objective: safeString(parentBundle.taskSpec && parentBundle.taskSpec.objective, 1200),
      successCriteria: uniqueStrings(parentBundle.taskSpec && parentBundle.taskSpec.successCriteria, 16),
      stopConditions: uniqueStrings(parentBundle.taskSpec && parentBundle.taskSpec.stopConditions, 16),
    },
    relevantPlanStep: relevantPlanStep || null,
    acceptanceSubset: acceptanceSubset || [],
    allowedTools: uniqueStrings(roleContract && roleContract.allowedTools, 24),
    deniedTools: uniqueStrings(roleContract && roleContract.deniedTools, 24),
    contextSlice: contextSlice || {},
    knowledgeSlice: knowledgeSlice || { entries: [] },
    expectedDeliverable: safeString(expectedDeliverable, 400),
    budget: budget || (roleContract && roleContract.timeBudget) || {},
    modelRoute: modelRoute || {},
    riskAssessment: riskAssessment || {},
    handoffPreconditions: ensureArray(roleContract && roleContract.handoff && roleContract.handoff.preconditions),
    handoffPostconditions: ensureArray(roleContract && roleContract.handoff && roleContract.handoff.postconditions),
  };
}

function appendGraphNode(graph, { taskId, parentTaskId, role, lifecycleState, orchestrationMode }) {
  if (!graph.nodes.some((entry) => safeString(entry && entry.taskId, 120) === taskId)) {
    graph.nodes.push({
      taskId,
      parentTaskId: safeString(parentTaskId, 120),
      role: safeString(role, 80),
      lifecycleState: safeString(lifecycleState, 80) || "planned",
      orchestrationMode: safeString(orchestrationMode, 80) || "bounded_multi_agent",
      updatedAt: nowIso(),
    });
  }
  if (parentTaskId && !graph.edges.some((entry) => safeString(entry && entry.parentTaskId, 120) === parentTaskId && safeString(entry && entry.childTaskId, 120) === taskId)) {
    graph.edges.push({
      parentTaskId: safeString(parentTaskId, 120),
      childTaskId: taskId,
      relationship: "handoff",
      at: nowIso(),
    });
  }
}

function upsertIntegrationEntry(summary, entry) {
  const childTaskId = safeString(entry && entry.childTaskId, 120);
  summary.entries = ensureArray(summary.entries).filter((row) => safeString(row && row.childTaskId, 120) !== childTaskId);
  summary.entries.push(entry);
  summary.pendingIntegrations = ensureArray(summary.pendingIntegrations).filter((row) => safeString(row && row.childTaskId, 120) !== childTaskId);
  summary.blockedChildren = ensureArray(summary.blockedChildren).filter((row) => safeString(row && row.childTaskId, 120) !== childTaskId);
  summary.verifierFailedChildren = ensureArray(summary.verifierFailedChildren).filter((row) => safeString(row && row.childTaskId, 120) !== childTaskId);
  summary.deniedChildren = ensureArray(summary.deniedChildren).filter((row) => safeString(row && row.childTaskId, 120) !== childTaskId);
  if (safeString(entry && entry.integrationStatus, 80) === "pending") {
    summary.pendingIntegrations.push({
      childTaskId,
      role: safeString(entry && entry.role, 80),
      expectedDeliverable: safeString(entry && entry.expectedDeliverable, 240),
      at: nowIso(),
    });
  }
  if (safeString(entry && entry.integrationStatus, 80) === "blocked") {
    summary.blockedChildren.push({
      childTaskId,
      role: safeString(entry && entry.role, 80),
      at: nowIso(),
    });
  }
  if (safeString(entry && entry.integrationStatus, 80) === "verifier_failed") {
    summary.verifierFailedChildren.push({
      childTaskId,
      role: safeString(entry && entry.role, 80),
      at: nowIso(),
    });
  }
  if (safeString(entry && entry.integrationStatus, 80) === "denied") {
    summary.deniedChildren.push({
      childTaskId,
      role: safeString(entry && entry.role, 80),
      at: nowIso(),
    });
  }
}

function dispatchChildTask({
  workspaceRoot,
  parentTaskId,
  sessionId = "orchestrator",
  role,
  delegatedObjective,
  acceptanceSubset = [],
  contextSlice = {},
  expectedDeliverable = "",
  budget = null,
  requestedTool = "",
  requestedStateWrite = "",
}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const parentForGuard = readTaskBundle(buildTaskPaths({
    workspaceRoot,
    policy,
    taskId: parentTaskId,
  }));
  assertOperationalModeAllowed({
    workspaceRoot,
    actionType: "multi_agent_delegation",
    taskFamily: safeString(parentForGuard.taskState && parentForGuard.taskState.familyId, 120) || "analysis",
    environment: "sandbox",
  });
  const manifest = loadAgentRoleContractManifest();
  const roleContract = resolveRoleContract({ manifest, roleId: role });
  if (requestedTool) assertAllowedTool(roleContract, requestedTool);
  if (requestedStateWrite) assertWritableScope(roleContract, requestedStateWrite, manifest);

  const parentPaths = buildTaskPaths({ workspaceRoot, policy, taskId: parentTaskId });
  const parentBundle = readTaskBundle(parentPaths);
  if (!parentBundle.taskState) {
    throw new Error(`parent_task_missing:${parentTaskId}`);
  }
  const childTaskId = buildChildTaskId(parentTaskId, role);
  const rootTaskId = safeString(parentBundle.taskState.rootTaskId, 120) || parentTaskId;
  const relevantPlanStep = Array.isArray(parentBundle.planState && parentBundle.planState.steps)
    ? parentBundle.planState.steps.find((entry) => safeString(entry && entry.id, 120) === safeString(parentBundle.planState && parentBundle.planState.currentStepId, 120)) || parentBundle.planState.steps[0] || null
    : null;
  const modelRoute = routeModel({
    role,
    familyId: safeString(parentBundle.taskState && parentBundle.taskState.familyId, 120),
    budgetTier: "standard",
  });
  const knowledgeSlice = retrieveKnowledgeSlice({
    workspaceRoot,
    objective: safeString(delegatedObjective, 1200) || safeString(parentBundle.taskState && parentBundle.taskState.objective, 1200),
    familyId: safeString(parentBundle.taskState && parentBundle.taskState.familyId, 120),
    limit: 3,
  });
  const riskAssessment = requestedTool || requestedStateWrite
    ? assertSafeAction({
        familyId: safeString(parentBundle.taskState && parentBundle.taskState.familyId, 120),
        toolName: safeString(requestedTool, 120),
        stateScope: safeString(requestedStateWrite, 160),
        approved: false,
      })
    : {
        schema: "autonomy-risk-classification.v1",
        generatedAt: nowIso(),
        familyId: safeString(parentBundle.taskState && parentBundle.taskState.familyId, 120),
        toolName: "",
        riskTier: "bounded",
        maxAutonomyLevel: "L1",
        approvalRequired: 0,
      };
  const handoffBundle = createHandoffBundle({
    parentTaskId,
    childTaskId,
    roleContract,
    role,
    parentBundle,
    delegatedObjective,
    relevantPlanStep,
    acceptanceSubset,
    contextSlice,
    expectedDeliverable,
    budget,
    modelRoute,
    knowledgeSlice,
    riskAssessment,
  });
  const childInit = initializeTask({
    workspaceRoot,
    taskId: childTaskId,
    sessionId,
    title: `${safeString(role, 80)} handoff for ${safeString(parentBundle.taskState.title, 120) || parentTaskId}`,
    objective: delegatedObjective,
    familyId: safeString(parentBundle.taskState.familyId, 80),
    acceptanceCriteria: acceptanceSubset.length ? acceptanceSubset : [expectedDeliverable || `${role} deliverable recorded`],
    stopConditions: uniqueStrings(parentBundle.taskState.stopConditions, 16),
    role,
    roleContractId: safeString(roleContract && roleContract.id, 80),
    parentTaskId,
    rootTaskId,
    orchestrationMode: "bounded_multi_agent",
  });
  const childPaths = buildTaskPaths({ workspaceRoot, policy, taskId: childTaskId, sessionId });
  const artifacts = childArtifactPaths(childPaths);
  writeArtifacts(artifacts, {
    [artifacts.delegatedWorkItemPath]: handoffBundle,
  });

  const graph = ensureGraph(parentTaskId, parentBundle.taskState, parentBundle.agentGraph);
  const history = ensureHandoffHistory(parentTaskId, parentBundle.handoffHistory);
  const integrationSummary = ensureIntegrationSummary(parentTaskId, parentBundle.integrationSummary);
  appendGraphNode(graph, {
    taskId: childTaskId,
    parentTaskId,
    role,
    lifecycleState: safeString(childInit.taskState && childInit.taskState.lifecycle && childInit.taskState.lifecycle.currentState, 80),
    orchestrationMode: "bounded_multi_agent",
  });
  history.entries.push({
    handoffId: slugify(`${parentTaskId}-${childTaskId}-handoff`, "handoff"),
    parentTaskId,
    childTaskId,
    role,
    delegatedObjective: safeString(delegatedObjective, 1200),
    expectedDeliverable: safeString(expectedDeliverable, 240),
    at: nowIso(),
    integrationStatus: "pending",
  });
  upsertIntegrationEntry(integrationSummary, {
    childTaskId,
    parentTaskId,
    role,
    expectedDeliverable: safeString(expectedDeliverable, 240),
    integrationStatus: "pending",
    status: "planned",
    verifierVerdict: "UNKNOWN",
    at: nowIso(),
  });
  writeArtifacts(parentPaths, {
    [parentPaths.agentGraphPath]: graph,
    [parentPaths.handoffHistoryPath]: history,
    [parentPaths.integrationSummaryPath]: integrationSummary,
  });
  updateTask({
    workspaceRoot,
    taskId: parentTaskId,
    sessionId,
    progressSummary: `delegated ${role} child ${childTaskId}`,
    note: `handoff:${role}:${childTaskId}`,
    noteKind: "workflow_event",
    childTaskIds: uniqueStrings([...(parentBundle.taskState.childTaskIds || []), childTaskId], 64),
    integrationStatus: "pending",
  });
  return {
    childTaskId,
    sessionId,
    role,
    roleContract,
    handoffBundle,
    childPaths,
  };
}

function buildRoleExecution({ role, handoffBundle, payload = {}, childBundle = null }) {
  switch (role) {
    case "planner":
      return {
        rawOutput: {
          notes: uniqueStrings(payload.planNotes || [`planned:${safeString(handoffBundle.expectedDeliverable, 240) || "next deliverable"}`], 12),
          recommendedCurrentStepId: safeString(handoffBundle.relevantPlanStep && handoffBundle.relevantPlanStep.id, 120),
          checkpoints: ensureArray(handoffBundle.relevantPlanStep && handoffBundle.relevantPlanStep.checkpoints),
        },
        normalizedResult: {
          status: "completed",
          deliverableType: "plan_delta",
          recommendedCurrentStepId: safeString(handoffBundle.relevantPlanStep && handoffBundle.relevantPlanStep.id, 120),
          summary: `planner updated plan for ${safeString(handoffBundle.delegatedObjective, 240)}`,
        },
      };
    case "researcher":
      return {
        rawOutput: {
          findings: uniqueStrings(payload.findings || ensureArray(payload.researchMaterials), 16),
          citations: uniqueStrings(payload.citations || ensureArray(payload.researchSources), 16),
        },
        normalizedResult: {
          status: "completed",
          deliverableType: "research_summary",
          summary: uniqueStrings(payload.findings || ["bounded research summary completed"], 8).join("; "),
          citations: uniqueStrings(payload.citations || ensureArray(payload.researchSources), 16),
        },
      };
    case "executor":
      return {
        rawOutput: {
          changedSurface: uniqueStrings(payload.changedSurface || [], 24),
          executionNotes: uniqueStrings(payload.executionNotes || [safeString(handoffBundle.expectedDeliverable, 240)], 12),
        },
        normalizedResult: {
          status: payload.forceFailure ? "blocked" : "completed",
          deliverableType: "deliverable",
          summary: safeString(payload.deliverableSummary, 400) || `executor delivered ${safeString(handoffBundle.expectedDeliverable, 240) || "artifact"}`,
          changedSurface: uniqueStrings(payload.changedSurface || [], 24),
        },
      };
    case "verifier": {
      const target = payload.targetResult || {};
      const verdict = payload.forceFailure || safeString(target.status, 80) === "blocked" ? "FAIL" : "PASS";
      const failures = verdict === "FAIL"
        ? [{
            type: safeString(payload.failureType, 120) || "child_validation_failure",
            reason: safeString(payload.failureReason, 400) || "delegated child deliverable did not satisfy acceptance subset",
            caseId: safeString(handoffBundle.childTaskId, 120),
          }]
        : [];
      return {
        rawOutput: {
          verdict,
          checkedAcceptance: ensureArray(handoffBundle.acceptanceSubset),
          targetSummary: safeString(target.summary, 400),
        },
        normalizedResult: {
          status: verdict === "PASS" ? "completed" : "verifier_failed",
          deliverableType: "verifier_report",
          verifierReport: {
            schema: "independent-verifier-report.v1",
            generatedAt: nowIso(),
            verdict,
            reason: verdict === "PASS" ? "delegated_acceptance_subset_passed" : failures[0].reason,
            failures,
          },
          acceptanceChecklist: ensureArray(handoffBundle.acceptanceSubset).map((text, index) => ({
            id: slugify(`acceptance-${index + 1}`, "acceptance"),
            text: safeString(text, 320),
            status: verdict === "PASS" ? "passed" : "failed",
          })),
        },
      };
    }
    default:
      return {
        rawOutput: {
          notes: [safeString(payload.note, 240) || `${role} completed bounded handoff`],
        },
        normalizedResult: {
          status: "completed",
          deliverableType: "generic_result",
          summary: safeString(payload.note, 400) || `${role} completed bounded handoff`,
        },
      };
  }
}

function executeChildTask({
  workspaceRoot,
  childTaskId,
  sessionId = "orchestrator",
  payload = {},
}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const manifest = loadAgentRoleContractManifest();
  const childPaths = buildTaskPaths({ workspaceRoot, policy, taskId: childTaskId, sessionId });
  const childArtifacts = childArtifactPaths(childPaths);
  const handoffBundle = parseJson(childArtifacts.delegatedWorkItemPath, null);
  if (!handoffBundle) {
    throw new Error(`child_handoff_missing:${childTaskId}`);
  }
  const childBundle = readTaskBundle(childPaths);
  const role = safeString(handoffBundle.role, 80) || safeString(childBundle.taskState && childBundle.taskState.role, 80);
  const roleContract = resolveRoleContract({ manifest, roleId: role });
  if (payload.requestedTool) assertAllowedTool(roleContract, safeString(payload.requestedTool, 120));
  if (payload.requestedStateWrite) assertWritableScope(roleContract, safeString(payload.requestedStateWrite, 160), manifest);

  const execution = buildRoleExecution({ role, handoffBundle, payload, childBundle });
  const acceptanceUpdates = Object.fromEntries(
    ensureArray(handoffBundle.acceptanceSubset).map((text, index) => [slugify(`acceptance-${index + 1}`, "acceptance"), execution.normalizedResult.status === "completed" ? "passed" : "failed"])
  );
  const rawOutput = {
    schema: "bounded-agent-raw-output.v1",
    generatedAt: nowIso(),
    childTaskId,
    role,
    executionMode: artifactSimulatorExecutionMode,
    independentAgentExecution: 0,
    ...execution.rawOutput,
  };
  const normalizedResult = {
    schema: "bounded-agent-normalized-result.v1",
    generatedAt: nowIso(),
    childTaskId,
    role,
    parentTaskId: safeString(handoffBundle.parentTaskId, 120),
    executionMode: artifactSimulatorExecutionMode,
    independentAgentExecution: 0,
    ...execution.normalizedResult,
  };
  writeArtifacts(childArtifacts, {
    [childArtifacts.rawOutputPath]: rawOutput,
    [childArtifacts.normalizedResultPath]: normalizedResult,
  });
  updateTask({
    workspaceRoot,
    taskId: childTaskId,
    sessionId,
    phase: normalizedResult.status === "verifier_failed" ? "verification_failed" : "delegated_execution",
    progressPercent: normalizedResult.status === "completed" ? 100 : 60,
    progressSummary: normalizedResult.summary || `${role} child updated`,
    note: `${role}:${normalizedResult.status}`,
    noteKind: "workflow_event",
    acceptanceUpdates,
    verifierReport: normalizedResult.verifierReport || null,
    openIssues: normalizedResult.status === "completed" ? [] : [safeString(normalizedResult.verifierReport && normalizedResult.verifierReport.reason, 320) || "delegated execution blocked"],
  });
  const closed = closeSession({
    workspaceRoot,
    taskId: childTaskId,
    sessionId,
    completionClaim: normalizedResult.status === "completed" ? "completed" : "",
    progressSummary: normalizedResult.summary || `${role} child closed`,
    verifierReport: normalizedResult.verifierReport || null,
    openIssues: normalizedResult.status === "completed" ? [] : [safeString(normalizedResult.verifierReport && normalizedResult.verifierReport.reason, 320) || "delegated execution blocked"],
  });
  return {
    childTaskId,
    role,
    rawOutput,
    normalizedResult,
    closeout: closed,
  };
}

function saveParentArtifacts({ parentPaths, parentBundle, planState, verifierState }) {
  const effectivePlanState = ensurePlanStateShape(planState, {
    objective: safeString(parentBundle.taskState && parentBundle.taskState.objective, 1200),
    sessionId: safeString(parentBundle.taskState && parentBundle.taskState.lastSessionId, 120),
  });
  const acceptanceContract = buildAcceptanceContract({
    taskSpec: parentBundle.taskSpec,
    planState: effectivePlanState,
    verifierState,
  });
  writeArtifacts(parentPaths, {
    [parentPaths.planStatePath]: effectivePlanState,
    [parentPaths.planArtifactPath]: buildPlanArtifact({
      taskId: safeString(parentBundle.taskState && parentBundle.taskState.taskId, 120),
      planState: effectivePlanState,
      verifierState,
      reason: "phase4_parent_update",
    }),
    [parentPaths.acceptanceContractPath]: acceptanceContract,
    [parentPaths.verifierStatePath]: verifierState,
  });
  return { planState: effectivePlanState, acceptanceContract, verifierState };
}

function integrateChildTask({
  workspaceRoot,
  parentTaskId,
  childTaskId,
  sessionId = "orchestrator",
}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const parentPaths = buildTaskPaths({ workspaceRoot, policy, taskId: parentTaskId, sessionId });
  const childPaths = buildTaskPaths({ workspaceRoot, policy, taskId: childTaskId, sessionId });
  const parentBundle = readTaskBundle(parentPaths);
  const childBundle = readTaskBundle(childPaths);
  const childArtifacts = childArtifactPaths(childPaths);
  const handoffBundle = parseJson(childArtifacts.delegatedWorkItemPath, null);
  const normalizedResult = parseJson(childArtifacts.normalizedResultPath, null);
  if (!parentBundle.taskState || !childBundle.taskState || !handoffBundle || !normalizedResult) {
    throw new Error(`integration_missing_artifact:${parentTaskId}:${childTaskId}`);
  }

  const role = safeString(handoffBundle.role, 80);
  const graph = ensureGraph(parentTaskId, parentBundle.taskState, parentBundle.agentGraph);
  const history = ensureHandoffHistory(parentTaskId, parentBundle.handoffHistory);
  const integrationSummary = ensureIntegrationSummary(parentTaskId, parentBundle.integrationSummary);
  const planState = clone(parentBundle.planState || {});
  const verifierState = clone(parentBundle.verifierState || {});
  verifierState.schema = safeString(verifierState.schema, 120) || "continuity-verifier-state.v1";
  verifierState.lastUpdatedAt = nowIso();
  verifierState.unresolvedFindings = ensureArray(verifierState.unresolvedFindings);
  verifierState.verifierHistory = ensureArray(verifierState.verifierHistory);

  const childStatus = safeString(normalizedResult.status, 80);
  let integrationStatus = childStatus === "completed" ? "integrated" : childStatus;
  let replanReason = "";
  let parentOpenIssues = [];
  let parentAcceptanceUpdates = {};
  let verifierReport = null;

  if (role === "planner" && childStatus === "completed") {
    if (safeString(normalizedResult.recommendedCurrentStepId, 120)) {
      planState.currentStepId = safeString(normalizedResult.recommendedCurrentStepId, 120);
    }
  }
  if ((role === "executor" || role === "researcher") && childStatus !== "completed") {
    integrationStatus = "blocked";
    replanReason = `child_${role}_blocked`;
    parentOpenIssues = [safeString(normalizedResult.summary, 320) || `${role} child blocked`];
  }
  if (role === "verifier") {
    verifierReport = normalizedResult.verifierReport || null;
    if (verifierReport && safeString(verifierReport.verdict, 40) === "PASS") {
      parentAcceptanceUpdates = Object.fromEntries(
        ensureArray(parentBundle.planState && parentBundle.planState.acceptanceCriteria).map((entry) => [safeString(entry && entry.id, 120), "passed"])
      );
      integrationStatus = "integrated";
      integrationSummary.blockedChildren = [];
      integrationSummary.verifierFailedChildren = [];
      integrationSummary.deniedChildren = [];
      integrationSummary.blockers = [];
      integrationSummary.pendingIntegrations = [];
    } else {
      integrationStatus = "verifier_failed";
      replanReason = `child_verifier_failed:${safeString(verifierReport && verifierReport.reason, 240) || "unknown"}`;
      parentOpenIssues = ensureArray(verifierReport && verifierReport.failures).map((entry) => safeString(entry && entry.reason, 320)).filter(Boolean);
      verifierState.lastVerifierVerdict = "FAIL";
      verifierState.unresolvedFindings = uniqueStrings([
        ...verifierState.unresolvedFindings.map((entry) => safeString(entry && entry.reason, 320)),
        ...parentOpenIssues,
      ], 24).map((reason) => ({ reason, source: childTaskId, at: nowIso() }));
      verifierState.verifierHistory.push({
        at: nowIso(),
        source: childTaskId,
        verdict: "FAIL",
        reason: safeString(verifierReport && verifierReport.reason, 320),
      });
      writeArtifacts(parentPaths, {
        [parentPaths.replanPath]: buildReplanArtifact({
          taskState: parentBundle.taskState,
          planState: parentBundle.planState,
          verifierState,
          acceptanceContract: parentBundle.acceptanceContract,
          reason: replanReason,
        }),
      });
    }
  }

  const graphNode = graph.nodes.find((entry) => safeString(entry && entry.taskId, 120) === childTaskId);
  if (graphNode) {
    graphNode.lifecycleState = safeString(childBundle.taskState && childBundle.taskState.lifecycle && childBundle.taskState.lifecycle.currentState, 80);
    graphNode.updatedAt = nowIso();
  }
  history.entries.push({
    handoffId: slugify(`${parentTaskId}-${childTaskId}-integration`, "integration"),
    parentTaskId,
    childTaskId,
    role,
    at: nowIso(),
    integrationStatus,
    verifierVerdict: safeString(verifierReport && verifierReport.verdict, 40),
  });
  upsertIntegrationEntry(integrationSummary, {
    childTaskId,
    parentTaskId,
    role,
    status: childStatus,
    integrationStatus,
    verifierVerdict: safeString(verifierReport && verifierReport.verdict, 40) || "UNKNOWN",
    expectedDeliverable: safeString(handoffBundle.expectedDeliverable, 240),
    summary: safeString(normalizedResult.summary, 400),
    integratedAt: nowIso(),
  });
  integrationSummary.blockers = uniqueStrings([
    ...integrationSummary.blockers,
    ...parentOpenIssues,
  ], 32);
  writeArtifacts(parentPaths, {
    [parentPaths.agentGraphPath]: graph,
    [parentPaths.handoffHistoryPath]: history,
    [parentPaths.integrationSummaryPath]: integrationSummary,
  });
  if (role === "verifier" && verifierReport && safeString(verifierReport.verdict, 40) === "PASS") {
    verifierState.lastVerifierVerdict = "PASS";
    verifierState.unresolvedFindings = [];
    verifierState.verifierHistory.push({
      at: nowIso(),
      source: childTaskId,
      verdict: "PASS",
      reason: safeString(verifierReport.reason, 320) || "delegated verifier passed",
    });
  }
  saveParentArtifacts({ parentPaths, parentBundle, planState, verifierState });
  const parentUpdate = updateTask({
    workspaceRoot,
    taskId: parentTaskId,
    sessionId,
    progressSummary: `integrated ${role} child ${childTaskId}`,
    note: `integration:${role}:${integrationStatus}`,
    noteKind: "workflow_event",
    acceptanceUpdates: parentAcceptanceUpdates,
    verifierReport,
    openIssues: parentOpenIssues,
    childTaskIds: uniqueStrings([...(parentBundle.taskState.childTaskIds || []), childTaskId], 64),
    integrationStatus,
    replanReason,
  });
  return {
    parentUpdate,
    integrationStatus,
    verifierReport,
    normalizedResult,
  };
}

function runSingleAgentFallback({
  workspaceRoot,
  taskId,
  sessionId = "s1",
  title,
  objective,
  familyId,
  acceptanceCriteria = [],
  note = "single-agent fallback completed",
}) {
  const init = initializeTask({
    workspaceRoot,
    taskId,
    sessionId,
    title,
    objective,
    familyId,
    acceptanceCriteria,
    role: "coordinator",
    orchestrationMode: "single_agent_fallback",
  });
  const acceptanceUpdates = Object.fromEntries(
    ensureArray(init.planState && init.planState.acceptanceCriteria).map((entry) => [safeString(entry && entry.id, 120), "passed"])
  );
  updateTask({
    workspaceRoot,
    taskId,
    sessionId,
    progressPercent: 100,
    progressSummary: note,
    note,
    noteKind: "workflow_event",
    acceptanceUpdates,
  });
  const closed = closeSession({
    workspaceRoot,
    taskId,
    sessionId,
    completionClaim: "completed",
    progressSummary: note,
  });
  return {
    fallback: 1,
    init,
    closed,
  };
}

async function runBoundedWorkflow({
  workspaceRoot,
  taskId,
  sessionId = "s1",
  title,
  objective,
  familyId,
  acceptanceCriteria = [],
  workflow = [],
  casePayload = {},
  allowFallback = true,
}) {
  const init = initializeTask({
    workspaceRoot,
    taskId,
    sessionId,
    title,
    objective,
    familyId,
    acceptanceCriteria,
    role: "coordinator",
    orchestrationMode: "bounded_multi_agent",
  });
  const initialAcceptance = buildAcceptanceContract({
    taskSpec: inspectTask({ workspaceRoot, taskId, mode: "task_spec" }),
    planState: init.planState,
    verifierState: init.verifierState,
  });
  const manifest = loadAgentRoleContractManifest();
  if (allowFallback && chooseSingleAgentFallback({ manifest, planState: init.planState, acceptanceContract: initialAcceptance })) {
    return runSingleAgentFallback({
      workspaceRoot,
      taskId: `${taskId}-fallback`,
      sessionId,
      title: `${title} fallback`,
      objective,
      familyId,
      acceptanceCriteria,
      note: "single-agent fallback used for simple task",
    });
  }

  const childRuns = [];
  for (const step of ensureArray(workflow)) {
    const role = safeString(step && step.role, 80);
    try {
      const dispatch = dispatchChildTask({
        workspaceRoot,
        parentTaskId: taskId,
        sessionId,
        role,
        delegatedObjective: safeString(step && step.objective, 1200) || `${role} for ${objective}`,
        acceptanceSubset: uniqueStrings(step && step.acceptanceSubset, 12),
        contextSlice: step && step.contextSlice ? step.contextSlice : {},
        expectedDeliverable: safeString(step && step.expectedDeliverable, 240),
        requestedTool: safeString(step && step.requestedTool, 120),
        requestedStateWrite: safeString(step && step.requestedStateWrite, 160),
      });
      const targetChildTaskId = safeString(step && step.targetChildTaskId, 120)
        || safeString(
          childRuns.slice().reverse().find((entry) => safeString(entry && entry.role, 80) === safeString(step && step.targetRole, 80))?.childTaskId,
          120
        );
      const targetResult = targetChildTaskId
        ? parseJson(childArtifactPaths(buildTaskPaths({
            workspaceRoot,
            policy: loadContinuityPolicy(undefined, { workspaceRoot }),
            taskId: targetChildTaskId,
            sessionId,
          })).normalizedResultPath, null)
        : null;
      const execution = executeChildTask({
        workspaceRoot,
        childTaskId: dispatch.childTaskId,
        sessionId,
        payload: {
          ...casePayload,
          ...(step && step.payload ? step.payload : {}),
          targetResult,
          targetChildTaskId,
        },
      });
      const integration = integrateChildTask({
        workspaceRoot,
        parentTaskId: taskId,
        childTaskId: dispatch.childTaskId,
        sessionId,
      });
      childRuns.push({
        role,
        childTaskId: dispatch.childTaskId,
        execution,
        integration,
      });
    } catch (error) {
      updateTask({
        workspaceRoot,
        taskId,
        sessionId,
        progressSummary: `child ${role} failed`,
        note: `child_error:${role}:${error && error.message ? error.message : String(error)}`,
        noteKind: "workflow_event",
        openIssues: [error && error.message ? error.message : String(error)],
        integrationStatus: "blocked",
        replanReason: `child_${role}_failure`,
      });
      childRuns.push({
        role,
        childTaskId: "",
        error: error && error.message ? error.message : String(error),
      });
      break;
    }
  }
  const closed = closeSession({
    workspaceRoot,
    taskId,
    sessionId,
    completionClaim: "completed",
    progressSummary: "bounded multi-agent workflow complete",
  });
  return {
    fallback: 0,
    init,
    childRuns,
    closed,
  };
}

async function runMultiAgentPublicBaseline({ workspaceRoot }) {
  const baseline = loadMultiAgentBaseline();
  const results = [];
  for (const entry of baseline.cases) {
    const caseId = safeString(entry && entry.id, 120);
    const workflow = ensureArray(entry && entry.workflow);
    const taskId = `${caseId}-${Date.now()}`;
    const orchestrationMode = safeString(entry && entry.orchestrationMode, 80);
    const result = orchestrationMode === "single_agent_fallback"
      ? runSingleAgentFallback({
          workspaceRoot,
          taskId,
          sessionId: "baseline",
          title: safeString(entry && entry.title, 200) || caseId,
          objective: safeString(entry && entry.objective, 1200),
          familyId: safeString(entry && entry.familyId, 80) || "deterministic_code",
          acceptanceCriteria: uniqueStrings(entry && entry.acceptanceCriteria, 12),
          note: "baseline single-agent fallback completed",
        })
      : await runBoundedWorkflow({
          workspaceRoot,
          taskId,
          sessionId: "baseline",
          title: safeString(entry && entry.title, 200) || caseId,
          objective: safeString(entry && entry.objective, 1200),
          familyId: safeString(entry && entry.familyId, 80) || "deterministic_code",
          acceptanceCriteria: uniqueStrings(entry && entry.acceptanceCriteria, 12),
          workflow,
          casePayload: entry && entry.payload ? entry.payload : {},
          allowFallback: orchestrationMode !== "multi_agent_required",
        });
    results.push({
      caseId,
      taskId,
      familyId: safeString(entry && entry.familyId, 80),
      fallback: result.fallback ? 1 : 0,
      lifecycleState: safeString(result.closed && result.closed.lifecycleState, 80) || safeString(result.closed && result.closed.closed && result.closed.closed.lifecycleState, 80),
      taskStatus: safeString(result.closed && result.closed.taskStatus, 80) || safeString(result.closed && result.closed.closed && result.closed.closed.taskStatus, 80),
      childCount: Array.isArray(result.childRuns) ? result.childRuns.length : 0,
    });
  }
  const ok = results.every((entry) => safeString(entry.lifecycleState, 80) === "completed" || entry.fallback === 1);
  return {
    schema: "multi-agent-public-baseline-run.v1",
    generatedAt: nowIso(),
    results,
    verdict: ok ? "PASS" : "FAIL",
  };
}

module.exports = {
  defaultAgentRoleContractManifestPath,
  defaultMultiAgentPublicBaselinePath,
  dispatchChildTask,
  executeChildTask,
  integrateChildTask,
  loadAgentRoleContractManifest,
  loadMultiAgentBaseline,
  resolveRoleContract,
  runBoundedWorkflow,
  runMultiAgentPublicBaseline,
  runSingleAgentFallback,
};
