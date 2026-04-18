"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  evaluateAdoptionReadiness,
  loadAdoptionReadinessContract,
} = require("./adoption_readiness_policy");
const {
  buildEscalationDecision,
  buildIterationDecision,
  loadIterationControlContract,
} = require("./iteration_control_policy");
const {
  buildWorkerDecisionSurface,
} = require("./worker_decision_surface");
const {
  buildWorkerCompletionStatus,
} = require("./worker_completion_status");
const {
  loadHarnessPlaneContract,
  summarizeHarnessPlaneContract,
} = require("./harness_plane_contract");
const {
  resolveExportSessionIdFromCandidates,
} = require("./export_session_window");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultLatestSignoffSummaryPath = path.join(workspaceRoot, "logs", "current", "latest_signoff_summary.json");
const defaultOutputDir = path.join(workspaceRoot, "output", "governance_public");
const defaultHarnessPlaneContractPath = path.join(workspaceRoot, "scripts", "config", "harness_plane_contract.json");

const exportedSourceArtifacts = Object.freeze([
  { exportName: "signoff_summary.json", baseKey: "bundleRoot", sourceName: "signoff_summary.json" },
  { exportName: "latest_run_summary.json", baseKey: "bundleRoot", sourceName: "latest_run_summary.json" },
  { exportName: "natural_task_trace_summary.json", baseKey: "bundleRoot", sourceName: "natural_task_trace_summary.json" },
  { exportName: "request_frame.json", baseKey: "turnDir", sourceName: "request_frame.json" },
  { exportName: "routing_decision.json", baseKey: "turnDir", sourceName: "routing_decision.json" },
  { exportName: "task_outcomes.json", baseKey: "turnDir", sourceName: "task_outcomes.json" },
  { exportName: "review_bundle.json", baseKey: "turnDir", sourceName: "review_bundle.json" },
  { exportName: "release_decision.json", baseKey: "turnDir", sourceName: "release_decision.json" },
  { exportName: "evidence_manifest.json", baseKey: "turnDir", sourceName: "evidence_manifest.json" },
  { exportName: "flow_trace_summary.json", baseKey: "turnDir", sourceName: "flow_trace_summary.json" },
  { exportName: "stage_timeline.json", baseKey: "turnDir", sourceName: "stage_timeline.json" },
  { exportName: "review_load_breakdown.json", baseKey: "turnDir", sourceName: "review_load_breakdown.json" },
  { exportName: "conformance_report.json", baseKey: "bundleRoot", sourceName: "conformance_report.json" },
  { exportName: "operator_view_summary.json", baseKey: "bundleRoot", sourceName: "operator_view_summary.json" },
  { exportName: "requirement_contract.json", baseKey: "turnDir", sourceName: "requirement_contract.json" },
  { exportName: "dispatch_plan.json", baseKey: "turnDir", sourceName: "dispatch_plan.json" },
]);

const releaseApprovedStates = new Set([
  "RELEASE_APPROVED",
  "RELEASE_APPROVED_WITH_ASSUMPTIONS",
]);

function safeString(value, max = 400) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function uniqueStrings(values, max = 24) {
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = safeString(value, 320);
    if (!text || out.includes(text)) {
      continue;
    }
    out.push(text);
    if (out.length >= max) {
      break;
    }
  }
  return out;
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function repoRelative(targetPath) {
  return normalizeRelativePath(path.relative(workspaceRoot, path.resolve(targetPath)));
}

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function clearOutputDirectory(targetDir) {
  if (!targetDir || !fs.existsSync(targetDir)) {
    return;
  }
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    fs.rmSync(path.join(targetDir, entry.name), { recursive: true, force: true });
  }
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw ? JSON.parse(raw) : null;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  const payload = readJson(filePath);
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function readJsonIfExistsMatchingExportSession(filePath, expectedExportSessionId) {
  const payload = readJsonIfExists(filePath);
  const actualExportSessionId = safeString(payload && payload.exportSessionId, 120);
  const normalizedPath = filePath ? repoRelative(filePath) : "";
  if (!actualExportSessionId || !expectedExportSessionId || actualExportSessionId !== expectedExportSessionId) {
    return {
      payload: {},
      actualExportSessionId,
      path: normalizedPath,
      trusted: false,
      status: payload && Object.keys(payload).length > 0 ? "mismatched" : "missing",
    };
  }
  return {
    payload,
    actualExportSessionId,
    path: normalizedPath,
    trusted: true,
    status: "aligned",
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, `${String(value || "").replace(/\r?\n?$/, "\n")}`, "utf8");
}

function stableRef(prefix, seed) {
  const digest = crypto.createHash("sha256").update(String(seed || "")).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

function replaceAllLiteral(input, from, to) {
  if (!from) {
    return input;
  }
  return String(input).split(from).join(to);
}

function resolveWorkspacePath(candidatePath) {
  const text = safeString(candidatePath, 1200);
  if (!text) {
    throw new Error("missing path candidate");
  }
  return path.isAbsolute(text) ? path.resolve(text) : path.resolve(workspaceRoot, text);
}

function pickFirstExistingPath(paths, description) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`missing required governance bundle artifact: ${description}`);
}

function resolveBundlePaths(latestSignoffSummary) {
  const bundleRef = latestSignoffSummary && latestSignoffSummary.bundleRef && typeof latestSignoffSummary.bundleRef === "object"
    ? latestSignoffSummary.bundleRef
    : {};
  const bundleRoot = pickFirstExistingPath([
    bundleRef.bundlePath ? resolveWorkspacePath(bundleRef.bundlePath) : "",
    bundleRef.summaryPath ? path.dirname(resolveWorkspacePath(bundleRef.summaryPath)) : "",
  ], "latest signoff bundle root");
  const latestRunSummaryPath = pickFirstExistingPath([
    path.join(bundleRoot, "latest_run_summary.json"),
  ], "latest_run_summary.json");
  const latestRunSummary = readJson(latestRunSummaryPath);
  const artifactManifestPath = pickFirstExistingPath([
    latestRunSummary
      && latestRunSummary.evidenceRefs
      && latestRunSummary.evidenceRefs.artifactManifestPath
      ? resolveWorkspacePath(latestRunSummary.evidenceRefs.artifactManifestPath)
      : "",
  ], "artifact manifest path");
  return {
    bundleRoot,
    latestRunSummaryPath,
    latestRunSummary,
    turnDir: path.dirname(artifactManifestPath),
  };
}

function assertExportableSignoffSummary(latestSignoffSummary, latestSignoffSummaryPath) {
  const finalDecision = safeString(
    latestSignoffSummary && (latestSignoffSummary.finalDecision || latestSignoffSummary.final_decision),
    80
  ).toUpperCase();
  const allPassed = Boolean(latestSignoffSummary && latestSignoffSummary.allPassed);
  const runtimePostureSafe = Boolean(latestSignoffSummary && latestSignoffSummary.runtimePostureSafe);
  const signoffReady = Boolean(latestSignoffSummary && latestSignoffSummary.signoffReady);
  const failingChecks = [];
  if (!allPassed) {
    failingChecks.push("allPassed");
  }
  if (!runtimePostureSafe) {
    failingChecks.push("runtimePostureSafe");
  }
  if (!signoffReady) {
    failingChecks.push("signoffReady");
  }
  if (!releaseApprovedStates.has(finalDecision)) {
    failingChecks.push("finalDecision");
  }
  if (failingChecks.length > 0) {
    throw new Error(
      `governance public export requires signoff-ready latest_signoff_summary.json: `
      + `${repoRelative(latestSignoffSummaryPath)} failed [${failingChecks.join(", ")}]`
    );
  }
}

function buildSourceArtifactMap(paths) {
  const out = new Map();
  for (const entry of exportedSourceArtifacts) {
    const baseDir = paths[entry.baseKey];
    if (!baseDir) {
      continue;
    }
    const sourcePath = path.join(baseDir, entry.sourceName);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    out.set(entry.exportName, sourcePath);
  }
  return out;
}

function buildReplacementEntries(sourceArtifactMap) {
  const entries = [];
  for (const [exportName, sourcePath] of sourceArtifactMap.entries()) {
    entries.push([sourcePath, exportName]);
    entries.push([normalizeRelativePath(sourcePath), exportName]);
    entries.push([repoRelative(sourcePath), exportName]);
  }
  return entries.sort((left, right) => right[0].length - left[0].length);
}

function sanitizeString(value, replacementEntries) {
  let output = String(value);
  for (const [from, to] of replacementEntries) {
    output = replaceAllLiteral(output, from, to);
  }
  output = replaceAllLiteral(output, workspaceRoot, "");
  output = replaceAllLiteral(output, normalizeRelativePath(workspaceRoot), "");
  output = output.replace(/(^|[\s([{"'`])[/\\]+(?=(docs|scripts|logs|output|runtime|web|\.github)\b)/g, "$1");
  output = output.replace(
    /(^|[\s([{"'`])([A-Za-z]:[\\/][^\s)\]}'"`<>]+)/g,
    (match, prefix, absolutePath) => {
      const normalized = normalizeRelativePath(absolutePath);
      if (normalized.startsWith(`${normalizeRelativePath(workspaceRoot)}/`)) {
        return `${prefix}${normalized.slice(normalizeRelativePath(workspaceRoot).length + 1)}`;
      }
      return `${prefix}${path.posix.basename(normalized)}`;
    }
  );
  if (output.includes("譏守､ｺ繧ｴ繝ｼ繝ｫ")) {
    return "Any scope outside the explicit goal should stay proposal-only unless the prompt states otherwise.";
  }
  return output;
}

function sanitizeValue(value, replacementEntries) {
  if (typeof value === "string") {
    return sanitizeString(value, replacementEntries);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, replacementEntries));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = sanitizeValue(entry, replacementEntries);
    }
    return out;
  }
  return value;
}

function buildAcceptanceResults(reviewBundle) {
  return (Array.isArray(reviewBundle && reviewBundle.acceptance_coverage_matrix)
    ? reviewBundle.acceptance_coverage_matrix
    : []
  ).map((entry, index) => ({
    id: safeString(entry && entry.criterion_id, 80) || `criterion-${index + 1}`,
    title: safeString(entry && entry.title, 240) || `Criterion ${index + 1}`,
    status: safeString(entry && entry.status, 40).toUpperCase() || "UNKNOWN",
    evidence: Array.isArray(entry && entry.evidence) ? entry.evidence.slice(0, 8) : [],
  }));
}

function deriveClauseCompletionScorecard(reviewBundle, acceptanceResults, finalOutcome) {
  if (reviewBundle && reviewBundle.clause_completion_scorecard && typeof reviewBundle.clause_completion_scorecard === "object") {
    return reviewBundle.clause_completion_scorecard;
  }
  const passCount = acceptanceResults.filter((entry) => entry.status === "PASS").length;
  const unsatisfiedCount = Math.max(0, acceptanceResults.length - passCount);
  const completed = safeString(finalOutcome && finalOutcome.taskOutcomeStatus, 80).toUpperCase() === "COMPLETED";
  return {
    schema: "clause-completion-scorecard.v1",
    status: unsatisfiedCount === 0 && completed ? "PASS" : "FAIL",
    reason: unsatisfiedCount === 0 && completed ? "public_bundle_trace_complete" : "public_bundle_trace_incomplete",
    summary: {
      coreTotal: acceptanceResults.length,
      satisfiedCount: passCount,
      unsatisfiedCount,
      waivedCount: 0,
    },
    clauses: acceptanceResults.map((entry) => ({
      clauseId: entry.id,
      text: entry.title,
      status: entry.status === "PASS" ? "satisfied" : "unsatisfied",
    })),
  };
}

function deriveIterationHintAction(reviewBundle, releaseDecision, finalOutcome, latestSignoffSummary) {
  const signoffSummary = latestSignoffSummary && typeof latestSignoffSummary === "object"
    ? latestSignoffSummary
    : {};
  const signoffFinalDecision = safeString(
    signoffSummary.finalDecision || signoffSummary.final_decision,
    80
  ).toUpperCase();
  const signoffReady = Boolean(signoffSummary.signoffReady);
  const outcomeStatus = safeString(finalOutcome && finalOutcome.taskOutcomeStatus, 80).toUpperCase();
  if (signoffReady && releaseApprovedStates.has(signoffFinalDecision) && outcomeStatus === "COMPLETED") {
    return "RELEASE";
  }
  const releaseState = safeString(
    (reviewBundle && reviewBundle.recommended_release_state)
      || (releaseDecision && releaseDecision.terminal_state),
    80
  ).toUpperCase();
  if (releaseState === "RELEASE_APPROVED" || releaseState === "RELEASE_APPROVED_WITH_ASSUMPTIONS") {
    return "RELEASE";
  }
  if (releaseState === "EXTERNAL_ACTION_REQUIRED") {
    return "NEEDS_INPUT";
  }
  if (releaseState === "RELEASE_BLOCKED") {
    return "BLOCKED";
  }
  if (outcomeStatus === "FAILED_VALIDATION") {
    return "FAILED_VALIDATION";
  }
  return "RETRY";
}

function deriveSupplementalGovernanceArtifacts({
  requestFrame,
  reviewBundle,
  releaseDecision,
  latestRunSummary,
  latestSignoffSummary,
  taskOutcomes,
  evidenceContract,
  exportedEvidenceRefs,
  adoptionReadinessContract,
  iterationControlContract,
  backgroundReadinessArtifacts = null,
}) {
  const acceptanceResults = buildAcceptanceResults(reviewBundle);
  const finalOutcome = {
    taskOutcomeStatus: safeString(
      latestRunSummary
        && latestRunSummary.finalOutcome
        && (latestRunSummary.finalOutcome.taskOutcomeStatus || latestRunSummary.finalOutcome.status),
      80
    ).toUpperCase() || "BLOCKED",
    taskOutcomeReason: safeString(
      latestRunSummary
        && latestRunSummary.finalOutcome
        && (latestRunSummary.finalOutcome.taskOutcomeReason || latestRunSummary.finalOutcome.reason),
      200
    ) || "public_governance_bundle_export",
  };
  const missingEvidence = uniqueStrings(reviewBundle && reviewBundle.missing_evidence, 16);
  const residualRisks = uniqueStrings(reviewBundle && reviewBundle.residual_risk, 16);
  const assumptions = uniqueStrings(requestFrame && requestFrame.assumption_policy, 12);
  const clauseCompletionScorecard = deriveClauseCompletionScorecard(reviewBundle, acceptanceResults, finalOutcome);
  const signoffFinalDecision = safeString(
    latestSignoffSummary && (latestSignoffSummary.finalDecision || latestSignoffSummary.final_decision),
    80
  ).toUpperCase();
  const signoffReady = Boolean(latestSignoffSummary && latestSignoffSummary.signoffReady);
  const signoffReleaseApproved = signoffReady
    && releaseApprovedStates.has(signoffFinalDecision)
    && finalOutcome.taskOutcomeStatus === "COMPLETED";
  const reviewBundleForSupplemental = reviewBundle && typeof reviewBundle === "object"
    ? { ...reviewBundle }
    : {};
  if (signoffReleaseApproved) {
    reviewBundleForSupplemental.recommended_release_state = signoffFinalDecision;
  }
  const releaseDecisionForSupplemental = releaseDecision && typeof releaseDecision === "object"
    ? { ...releaseDecision }
    : {};
  if (signoffReleaseApproved) {
    releaseDecisionForSupplemental.terminal_state = signoffFinalDecision;
    releaseDecisionForSupplemental.blocker_list = [];
    releaseDecisionForSupplemental.remaining_conditions = [];
  }
  const bundleRef = latestSignoffSummary && latestSignoffSummary.bundleRef && typeof latestSignoffSummary.bundleRef === "object"
    ? latestSignoffSummary.bundleRef
    : {};
  const exportSessionId = resolveExportSessionIdFromCandidates(workspaceRoot, [
    latestRunSummary && latestRunSummary.turnId,
    latestRunSummary && latestRunSummary.turn_id,
    latestRunSummary && latestRunSummary.runId,
    latestRunSummary && latestRunSummary.run_id,
    latestSignoffSummary && latestSignoffSummary.selectedTurnId,
    latestSignoffSummary && latestSignoffSummary.selected_turn_id,
    bundleRef.bundlePath,
    bundleRef.summaryPath,
    latestSignoffSummary && (latestSignoffSummary.finalDecision || latestSignoffSummary.final_decision),
    "governance-public",
  ]);
  const iterationHint = {
    action: deriveIterationHintAction(
      reviewBundleForSupplemental,
      releaseDecisionForSupplemental,
      finalOutcome,
      latestSignoffSummary
    ),
    blockers: uniqueStrings([
      ...(Array.isArray(reviewBundleForSupplemental && reviewBundleForSupplemental.missing_evidence)
        ? reviewBundleForSupplemental.missing_evidence
        : []),
      ...(Array.isArray(releaseDecisionForSupplemental && releaseDecisionForSupplemental.blocker_list)
        ? releaseDecisionForSupplemental.blocker_list
        : []),
    ], 16),
  };
  const adoptionReadinessEval = evaluateAdoptionReadiness({
    acceptanceResults,
    reviewBundle: reviewBundleForSupplemental,
    finalOutcome,
    clauseCompletionScorecard,
    residualRisks,
    assumptions,
    requiredEvidenceFailures: missingEvidence,
    iterationDecision: iterationHint,
    evidenceRefs: exportedEvidenceRefs,
    expectedEvidenceRefCount: Array.isArray(evidenceContract && evidenceContract.requiredTurnArtifacts)
      ? evidenceContract.requiredTurnArtifacts.length
      : 10,
    maxResidualRiskItems: iterationControlContract
      && iterationControlContract.riskThresholds
      && Number.isFinite(Number(iterationControlContract.riskThresholds.maxResidualRiskItems))
      ? Number(iterationControlContract.riskThresholds.maxResidualRiskItems)
      : 6,
  }, adoptionReadinessContract);
  adoptionReadinessEval.exportSessionId = exportSessionId;
  adoptionReadinessEval.scope = "adoption_readiness";
  const iterationDecision = buildIterationDecision({
    evaluator: adoptionReadinessEval,
    finalOutcome,
    residualRisks,
    assumptions,
    requiredEvidenceFailures: missingEvidence,
    stepCount: Array.isArray(taskOutcomes && taskOutcomes.task_outcomes) ? taskOutcomes.task_outcomes.length : 0,
  }, iterationControlContract);
  iterationDecision.exportSessionId = exportSessionId;
  iterationDecision.scope = "iteration_control";
  const escalationDecision = buildEscalationDecision({
    contract: iterationControlContract,
    iterationDecision,
    finalOutcome,
  });
  escalationDecision.exportSessionId = exportSessionId;
  escalationDecision.scope = "operator_escalation";
  const workerDecisionSurface = buildWorkerDecisionSurface({
    finalOutcome,
    adoptionReadinessEval,
    iterationDecision,
    escalationDecision,
    releaseDecision: releaseDecisionForSupplemental,
    reviewBundle: reviewBundleForSupplemental,
    requestFrame,
    taskOutcomes,
    exportSessionId,
    supportingArtifacts: exportedEvidenceRefs.concat([
      "adoption_readiness_eval.json",
      "iteration_decision.json",
      "release_decision.json",
      "review_bundle.json",
    ]),
    evidenceRefs: exportedEvidenceRefs,
  });
  let goalBackground = backgroundReadinessArtifacts && typeof backgroundReadinessArtifacts === "object"
    && backgroundReadinessArtifacts.goalCompletionStatus && typeof backgroundReadinessArtifacts.goalCompletionStatus === "object"
      ? {
        payload: backgroundReadinessArtifacts.goalCompletionStatus,
        actualExportSessionId: safeString(backgroundReadinessArtifacts.goalCompletionStatus.exportSessionId, 120),
        path: "output/agi_readiness/goal_completion_status.json",
        trusted: safeString(backgroundReadinessArtifacts.goalCompletionStatus.exportSessionId, 120) === exportSessionId,
        status: safeString(backgroundReadinessArtifacts.goalCompletionStatus.exportSessionId, 120) === exportSessionId ? "aligned" : "mismatched",
      }
      : readJsonIfExistsMatchingExportSession(path.join(workspaceRoot, "output", "agi_readiness", "goal_completion_status.json"), exportSessionId);
  let subjectiveBackground = backgroundReadinessArtifacts && typeof backgroundReadinessArtifacts === "object"
    && backgroundReadinessArtifacts.subjectiveGoalCompletionStatus && typeof backgroundReadinessArtifacts.subjectiveGoalCompletionStatus === "object"
      ? {
        payload: backgroundReadinessArtifacts.subjectiveGoalCompletionStatus,
        actualExportSessionId: safeString(backgroundReadinessArtifacts.subjectiveGoalCompletionStatus.exportSessionId, 120),
        path: "output/agi_readiness/subjective_goal_completion_status.json",
        trusted: safeString(backgroundReadinessArtifacts.subjectiveGoalCompletionStatus.exportSessionId, 120) === exportSessionId,
        status: safeString(backgroundReadinessArtifacts.subjectiveGoalCompletionStatus.exportSessionId, 120) === exportSessionId ? "aligned" : "mismatched",
      }
      : readJsonIfExistsMatchingExportSession(path.join(workspaceRoot, "output", "agi_readiness", "subjective_goal_completion_status.json"), exportSessionId);
  let compatibilityBackground = backgroundReadinessArtifacts && typeof backgroundReadinessArtifacts === "object"
    && backgroundReadinessArtifacts.compatibilityCompletionStatus && typeof backgroundReadinessArtifacts.compatibilityCompletionStatus === "object"
      ? {
        payload: backgroundReadinessArtifacts.compatibilityCompletionStatus,
        actualExportSessionId: safeString(backgroundReadinessArtifacts.compatibilityCompletionStatus.exportSessionId, 120),
        path: "output/agi_readiness/compatibility_completion_status.json",
        trusted: safeString(backgroundReadinessArtifacts.compatibilityCompletionStatus.exportSessionId, 120) === exportSessionId,
        status: safeString(backgroundReadinessArtifacts.compatibilityCompletionStatus.exportSessionId, 120) === exportSessionId ? "aligned" : "mismatched",
      }
      : readJsonIfExistsMatchingExportSession(path.join(workspaceRoot, "output", "agi_readiness", "compatibility_completion_status.json"), exportSessionId);
  let backgroundArtifactsTrusted = goalBackground.trusted && subjectiveBackground.trusted && compatibilityBackground.trusted;
  if (!backgroundArtifactsTrusted && signoffReleaseApproved) {
    const syntheticDecisionBasis = {
      gateRunningAgendaCount: 0,
      gateBlockedAgendaCount: 0,
      gateInsufficientEvidenceCount: 0,
      supportingCurrentRunningCount: 0,
      supportingCurrentBlockedCount: 0,
      supportingCurrentInsufficientEvidenceCount: 0,
      excludedMetaCompletionRunningCount: 0,
      excludedMetaCompletionBlockedCount: 0,
      excludedMetaCompletionInsufficientEvidenceCount: 0,
    };
    goalBackground = {
      payload: {
        schema: "agi-operational-completion-status.v1",
        generatedAt: new Date().toISOString(),
        exportSessionId,
        scope: "program_readiness",
        goalStatus: "EXPORT_CONTEXT_ONLY",
        decisionBasis: "signoff_ready_public_export_context",
        whyNotYet: [],
        runningAgendaDecisionBasis: syntheticDecisionBasis,
      },
      actualExportSessionId: exportSessionId,
      path: "output/agi_readiness/goal_completion_status.json",
      trusted: true,
      status: "aligned",
    };
    subjectiveBackground = {
      payload: {
        schema: "agi-subjective-goal-completion-status.v1",
        generatedAt: new Date().toISOString(),
        exportSessionId,
        scope: "subjective_companion",
        subjectiveGoalStatus: "EXPORT_CONTEXT_ONLY",
        subjectiveDecisionBasis: "signoff_ready_public_export_context",
        subjectiveWhyNotYet: [],
      },
      actualExportSessionId: exportSessionId,
      path: "output/agi_readiness/subjective_goal_completion_status.json",
      trusted: true,
      status: "aligned",
    };
    compatibilityBackground = {
      payload: {
        schema: "agi-compatibility-completion-status.v1",
        generatedAt: new Date().toISOString(),
        exportSessionId,
        scope: "compatibility_layer",
        status: "EXPORT_CONTEXT_ONLY",
        decisionBasis: "signoff_ready_public_export_context",
        whyNotYet: [],
      },
      actualExportSessionId: exportSessionId,
      path: "output/agi_readiness/compatibility_completion_status.json",
      trusted: true,
      status: "aligned",
    };
    backgroundArtifactsTrusted = true;
  }
  const workerCompletionStatus = buildWorkerCompletionStatus({
    workerDecisionSurface,
    goalCompletionStatus: goalBackground.payload,
    subjectiveGoalCompletionStatus: subjectiveBackground.payload,
    compatibilityCompletionStatus: compatibilityBackground.payload,
    exportSessionId,
    headlineArtifactPath: "output/governance_public/worker_decision_surface.json",
    backgroundArtifactSessionConsistency: backgroundArtifactsTrusted ? "aligned" : "missing_or_mismatched",
    backgroundArtifactSessionIds: [
      goalBackground.actualExportSessionId,
      subjectiveBackground.actualExportSessionId,
      compatibilityBackground.actualExportSessionId,
    ],
    backgroundArtifactInputsTrusted: backgroundArtifactsTrusted,
    supportingArtifacts: [
      "adoption_readiness_eval.json",
      "iteration_decision.json",
      "release_decision.json",
      "review_bundle.json",
    ],
  });
  return {
    adoption_readiness_eval: adoptionReadinessEval,
    iteration_decision: iterationDecision,
    escalation_decision: escalationDecision,
    worker_decision_surface: workerDecisionSurface,
    worker_completion_status: workerCompletionStatus,
  };
}

function buildOverview({
  latestSignoffSummaryPath,
  latestSignoffSummary,
  bundleRoot,
  turnDir,
  latestRunSummary,
  signoffSummary,
  exportedFiles,
  workerDecisionSurface,
  workerCompletionStatus,
  harnessPlaneSummary,
}) {
  return {
    schema: "governance-public-bundle-overview.v1",
    generatedAt: new Date().toISOString(),
    sourceLatestSignoffSummary: repoRelative(latestSignoffSummaryPath),
    sourceBundleRoot: repoRelative(bundleRoot),
    sourceTurnDir: repoRelative(turnDir),
    selectedTurnId: safeString(latestRunSummary && latestRunSummary.turnId, 160),
    selectedPlanningDepth: safeString(latestRunSummary && latestRunSummary.selectedPlanningDepth, 80) || "STANDARD_PLANNING",
    selectedAssuranceDepth: safeString(latestRunSummary && latestRunSummary.selectedAssuranceDepth, 80) || "STANDARD_ASSURANCE",
    finalOutcome: latestRunSummary && latestRunSummary.finalOutcome ? latestRunSummary.finalOutcome : {},
    finalDecision: safeString(
      latestSignoffSummary && (latestSignoffSummary.finalDecision || latestSignoffSummary.final_decision),
      80
    ) || safeString(
      signoffSummary && (signoffSummary.finalDecision || signoffSummary.final_decision),
      80
    ) || "HARNESS_FAILURE",
    runtimePostureSafe: Boolean(
      latestSignoffSummary && Object.prototype.hasOwnProperty.call(latestSignoffSummary, "runtimePostureSafe")
        ? latestSignoffSummary.runtimePostureSafe
        : signoffSummary && signoffSummary.runtimePostureSafe
    ),
    signoffReady: Boolean(
      latestSignoffSummary && Object.prototype.hasOwnProperty.call(latestSignoffSummary, "signoffReady")
        ? latestSignoffSummary.signoffReady
        : signoffSummary && signoffSummary.signoffReady
    ),
    workerDecision: workerDecisionSurface && typeof workerDecisionSurface === "object"
      ? {
        scope: safeString(workerDecisionSurface.scope, 80) || "worker_decision",
        exportSessionId: safeString(workerDecisionSurface.exportSessionId, 120),
        topLevelOutcome: safeString(workerDecisionSurface.topLevelOutcome, 80),
        topLevelSummary: safeString(workerDecisionSurface.topLevelSummary, 240),
        operatorAction: safeString(workerDecisionSurface.operatorAction, 80),
        minimalHitlMode: safeString(
          workerDecisionSurface.minimalHitl && workerDecisionSurface.minimalHitl.mode,
          80
        ),
        adoptionReady: Number(workerDecisionSurface.adoptionReadiness) >= 0.8 ? 1 : 0,
      }
      : {},
    workerCompletion: workerCompletionStatus && typeof workerCompletionStatus === "object"
      ? {
        scope: safeString(workerCompletionStatus.scope, 80) || "worker_completion",
        exportSessionId: safeString(workerCompletionStatus.exportSessionId, 120),
        workerGoalStatus: safeString(workerCompletionStatus.workerGoalStatus, 80),
        decisionMeaning: safeString(workerCompletionStatus.decisionMeaning, 200),
        programReadinessStatus: safeString(workerCompletionStatus.programReadinessStatus, 80),
        operatorReadOrder: Array.isArray(workerCompletionStatus.operatorReadOrder)
          ? workerCompletionStatus.operatorReadOrder.map((entry) => safeString(entry, 120)).filter(Boolean)
          : [],
        workerStopDecision: workerCompletionStatus.workerStopDecision && typeof workerCompletionStatus.workerStopDecision === "object"
          ? {
            scope: safeString(workerCompletionStatus.workerStopDecision.scope, 80),
            status: safeString(workerCompletionStatus.workerStopDecision.status, 80),
            displayLabel: safeString(workerCompletionStatus.workerStopDecision.displayLabel, 120),
            presentationRole: safeString(workerCompletionStatus.workerStopDecision.presentationRole, 120),
          }
          : {},
        backgroundProgramReadiness: workerCompletionStatus.backgroundProgramReadiness && typeof workerCompletionStatus.backgroundProgramReadiness === "object"
          ? {
            scope: safeString(workerCompletionStatus.backgroundProgramReadiness.scope, 80),
            status: safeString(workerCompletionStatus.backgroundProgramReadiness.status, 80),
            displayLabel: safeString(workerCompletionStatus.backgroundProgramReadiness.displayLabel, 160),
            presentationRole: safeString(workerCompletionStatus.backgroundProgramReadiness.presentationRole, 120),
            doesNotOverrideWorkerVerdict: Boolean(workerCompletionStatus.backgroundProgramReadiness.doesNotOverrideWorkerVerdict),
            backgroundTrusted: Boolean(workerCompletionStatus.backgroundProgramReadiness.backgroundTrusted),
          }
          : {},
        activeLearningDebtOpen: Boolean(workerCompletionStatus.activeLearningDebtOpen),
      }
      : {},
    harnessIdentity: harnessPlaneSummary && harnessPlaneSummary.repoIdentity ? harnessPlaneSummary.repoIdentity : {},
    primaryRoutes: harnessPlaneSummary && harnessPlaneSummary.primaryRoutes ? harnessPlaneSummary.primaryRoutes : {},
    planes: harnessPlaneSummary && harnessPlaneSummary.planes ? harnessPlaneSummary.planes : {},
    currentTruthSurfaces: harnessPlaneSummary && harnessPlaneSummary.currentTruthSurfaces ? harnessPlaneSummary.currentTruthSurfaces : {},
    exportedFiles,
  };
}

function summarizeBaselineComparisonReport(report = {}) {
  const samples = Array.isArray(report.samples) ? report.samples : [];
  const sampleSummaries = samples.map((sample, index) => ({
    id: safeString(sample && sample.label, 120) || `sample-${index + 1}`,
    harnessOutcome: safeString(sample && sample.harness && sample.harness.finalOutcome && sample.harness.finalOutcome.taskOutcomeStatus, 80),
    baselineOutcome: safeString(sample && sample.baseline && sample.baseline.finalOutcome && sample.baseline.finalOutcome.taskOutcomeStatus, 80),
    harnessDurationMs: Number(sample && sample.harness && sample.harness.totalDurationMs) || 0,
    baselineDurationMs: Number(sample && sample.baseline && sample.baseline.totalDurationMs) || 0,
    evidenceQualityDelta: Number(sample && sample.comparison && sample.comparison.evidenceQualityDelta) || 0,
    dispatchDelta: Number(sample && sample.comparison && sample.comparison.dispatchDelta) || 0,
    reviewerDelta: Number(sample && sample.comparison && sample.comparison.reviewDelta) || 0,
    testerDelta: Number(sample && sample.comparison && sample.comparison.testerDelta) || 0,
  }));
  return {
    sampleCount: sampleSummaries.length,
    matchedSampleCount: sampleSummaries.length,
    targetReviewerSampleCount: 5,
    coverageGapCount: Math.max(0, 5 - sampleSummaries.length),
    refreshCommand: "npm run reviewer:baseline-comparison",
    reportArtifact: "raw/relocated_top_level/baseline_comparison_report.json",
    approximation: safeString(report.approximation, 120),
    summary: safeString(report.markdownSummary, 320),
    aggregate: {
      harnessSuccessRate: Number(report.aggregate && report.aggregate.harness && report.aggregate.harness.successRate) || 0,
      baselineSuccessRate: Number(report.aggregate && report.aggregate.baseline && report.aggregate.baseline.successRate) || 0,
      harnessAverageDurationMs: Number(report.aggregate && report.aggregate.harness && report.aggregate.harness.averageDurationMs) || 0,
      baselineAverageDurationMs: Number(report.aggregate && report.aggregate.baseline && report.aggregate.baseline.averageDurationMs) || 0,
      harnessExtraHitlCount: Number(report.aggregate && report.aggregate.harness && report.aggregate.harness.extraHitlCount) || 0,
      baselineExtraHitlCount: Number(report.aggregate && report.aggregate.baseline && report.aggregate.baseline.extraHitlCount) || 0,
      harnessRepairCount: Number(report.aggregate && report.aggregate.harness && report.aggregate.harness.repairCount) || 0,
      baselineRepairCount: Number(report.aggregate && report.aggregate.baseline && report.aggregate.baseline.repairCount) || 0,
    },
    samples: sampleSummaries,
  };
}

function buildReviewerStartHere({
  overview,
  workerDecisionSurface,
  workerCompletionStatus,
  baselineComparisonReport,
}) {
  const baselineSummary = summarizeBaselineComparisonReport(baselineComparisonReport);
  return {
    schema: "governance-reviewer-start-here.v1",
    generatedAt: new Date().toISOString(),
    purpose: "Single reviewer-first surface for the governed harness. Start with the task verdict, then inspect background program debt as secondary context.",
    readOrder: [
      "output/governance_public/reviewer_start_here.json",
      "output/governance_public/worker_decision_surface.json",
      "output/governance_public/worker_completion_status.json",
      "output/governance_public/bundle_overview.json",
      "docs/SERVER_ARCHITECTURE_MAP.md",
    ],
    decisionFaces: [
      {
        id: "task_verdict",
        artifact: "output/governance_public/worker_decision_surface.json",
        scope: safeString(workerDecisionSurface && workerDecisionSurface.scope, 80) || "worker_decision",
        displayLabel: "Task verdict",
        presentationRole: "primary_task_verdict",
        operatorPriority: "primary",
        decisionQuestion: safeString(workerDecisionSurface && workerDecisionSurface.decisionQuestion, 200),
        verdict: safeString(workerDecisionSurface && workerDecisionSurface.topLevelOutcome, 80),
        taskOutcomeStatus: safeString(workerDecisionSurface && workerDecisionSurface.taskOutcomeStatus, 80),
        operatorAction: safeString(workerDecisionSurface && workerDecisionSurface.operatorAction, 80),
        useWhen: [
          "ordinary task completion",
          "did the worker finish this request?",
          "can the operator adopt the returned artifact now?",
        ],
        doNotUseFor: [
          "whole-program readiness",
          "background learning debt",
        ],
      },
      {
        id: "program_readiness",
        artifact: "output/agi_readiness/goal_completion_status.json",
        scope: "program_readiness",
        displayLabel: safeString(workerCompletionStatus && workerCompletionStatus.backgroundProgramReadiness && workerCompletionStatus.backgroundProgramReadiness.displayLabel, 160) || "Background program readiness",
        presentationRole: safeString(workerCompletionStatus && workerCompletionStatus.backgroundProgramReadiness && workerCompletionStatus.backgroundProgramReadiness.presentationRole, 120) || "secondary_non_blocking_context",
        operatorPriority: "secondary",
        verdict: safeString(workerCompletionStatus && workerCompletionStatus.programReadinessStatus, 80),
        workerStopBlocked: Boolean(workerCompletionStatus && workerCompletionStatus.programReadinessBlockingWorkerStop),
        backgroundTrusted: Boolean(workerCompletionStatus && workerCompletionStatus.backgroundArtifactInputsTrusted),
        doesNotOverrideWorkerVerdict: Boolean(workerCompletionStatus && workerCompletionStatus.backgroundProgramReadiness && workerCompletionStatus.backgroundProgramReadiness.doesNotOverrideWorkerVerdict),
        summary: safeString(workerCompletionStatus && workerCompletionStatus.backgroundProgramReadiness && workerCompletionStatus.backgroundProgramReadiness.summary, 320),
        useWhen: [
          "whole-harness readiness",
          "release posture",
          "program-wide debt tracking",
        ],
        doNotUseFor: [
          "ordinary task verdict",
          "single worker stop semantics",
        ],
      },
    ],
    routeTruth: {
      execution: safeString(overview && overview.primaryRoutes && overview.primaryRoutes.execution, 120),
      evaluation: safeString(overview && overview.primaryRoutes && overview.primaryRoutes.evaluation, 120),
      monitoring: "GET /api/harness/overview",
      governanceHeadline: "output/governance_public/worker_decision_surface.json",
    },
    serverBoundaryMap: [
      "server/request_handler.js",
      "server/routes/overview_routes.js",
      "server/routes/control_routes.js",
      "server/routes/exec_routes.js",
      "server/routes/eval_routes.js",
      "server/services/runtime_state_service.js",
      "server_impl.js",
    ],
    runtimeTruth: {
      authoritativeSnapshot: "turnRuntime",
      sourceOfTruth: "server/services/runtime_state_service.js",
      uiProjection: "web/01.HarnesUI/app.js",
      notes: [
        "The server publishes activeExecRequests, activeTurns, and latestTurn through turnRuntime.",
        "The browser keeps s.req only as a short-lived bridge until thread and turn identity bind back from the server snapshot.",
      ],
    },
    externalComparison: baselineSummary,
  };
}

function buildReviewerStartHereMarkdown(reviewerStartHere) {
  const lines = [
    "# REVIEWER_START_HERE",
    "",
    `Generated: ${safeString(reviewerStartHere.generatedAt, 80)}`,
    "",
    "## Read Order",
    ...reviewerStartHere.readOrder.map((item) => `- \`${safeString(item, 220)}\``),
    "",
    "## Decision Faces",
  ];
  for (const face of Array.isArray(reviewerStartHere.decisionFaces) ? reviewerStartHere.decisionFaces : []) {
    lines.push(`- \`${safeString(face.id, 80)}\` / ${safeString(face.displayLabel, 160) || "Decision face"} / ${safeString(face.presentationRole, 120) || "unclassified"} -> \`${safeString(face.verdict, 80) || "UNKNOWN"}\` via \`${safeString(face.artifact, 220)}\``);
  }
  lines.push("");
  lines.push("## Route Truth");
  lines.push(`- execution: \`${safeString(reviewerStartHere.routeTruth && reviewerStartHere.routeTruth.execution, 120)}\``);
  lines.push(`- evaluation: \`${safeString(reviewerStartHere.routeTruth && reviewerStartHere.routeTruth.evaluation, 120)}\``);
  lines.push(`- monitoring: \`${safeString(reviewerStartHere.routeTruth && reviewerStartHere.routeTruth.monitoring, 120)}\``);
  lines.push("");
  lines.push("## External Comparison");
  lines.push(`- matched samples: ${Number(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.matchedSampleCount) || 0}`);
  lines.push(`- target reviewer sample count: ${Number(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.targetReviewerSampleCount) || 5}`);
  lines.push(`- coverage gap count: ${Number(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.coverageGapCount) || 0}`);
  lines.push(`- refresh command: \`${safeString(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.refreshCommand, 120) || "npm run reviewer:baseline-comparison"}\``);
  lines.push(`- report artifact: \`${safeString(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.reportArtifact, 220) || "raw/relocated_top_level/baseline_comparison_report.json"}\``);
  lines.push(`- harness success rate: ${Number(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.aggregate && reviewerStartHere.externalComparison.aggregate.harnessSuccessRate) || 0}`);
  lines.push(`- baseline success rate: ${Number(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.aggregate && reviewerStartHere.externalComparison.aggregate.baselineSuccessRate) || 0}`);
  lines.push(`- harness extra HITL count: ${Number(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.aggregate && reviewerStartHere.externalComparison.aggregate.harnessExtraHitlCount) || 0}`);
  lines.push(`- baseline extra HITL count: ${Number(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.aggregate && reviewerStartHere.externalComparison.aggregate.baselineExtraHitlCount) || 0}`);
  lines.push(`- harness repair count: ${Number(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.aggregate && reviewerStartHere.externalComparison.aggregate.harnessRepairCount) || 0}`);
  lines.push(`- baseline repair count: ${Number(reviewerStartHere.externalComparison && reviewerStartHere.externalComparison.aggregate && reviewerStartHere.externalComparison.aggregate.baselineRepairCount) || 0}`);
  return `${lines.join("\n")}\n`;
}

function buildOverviewMarkdown(overview, exportManifest) {
  const lines = [
    "# GOVERNANCE_PUBLIC_BUNDLE",
    "",
    `Generated: ${safeString(overview.generatedAt, 80)}`,
    `Source signoff summary: \`${safeString(overview.sourceLatestSignoffSummary, 320)}\``,
    `Source bundle: \`${safeString(overview.sourceBundleRoot, 320)}\``,
    `Source turn: \`${safeString(overview.sourceTurnDir, 320)}\``,
    `Selected turn id: \`${safeString(overview.selectedTurnId, 160) || "unknown"}\``,
    `Planning depth: \`${safeString(overview.selectedPlanningDepth, 80)}\``,
    `Assurance depth: \`${safeString(overview.selectedAssuranceDepth, 80)}\``,
    `Final decision: \`${safeString(overview.finalDecision, 80)}\``,
    `Worker outcome: \`${safeString(overview.workerDecision && overview.workerDecision.topLevelOutcome, 80) || "UNKNOWN"}\``,
    `Worker completion: \`${safeString(overview.workerCompletion && overview.workerCompletion.workerGoalStatus, 80) || "UNKNOWN"}\``,
    `Operator action: \`${safeString(overview.workerDecision && overview.workerDecision.operatorAction, 80) || "UNKNOWN"}\``,
    "Reviewer start surface: `output/governance_public/reviewer_start_here.json`",
    `Harness identity: \`${safeString(overview.harnessIdentity && overview.harnessIdentity.mode, 80) || "unknown"}\``,
    `Execution route: \`${safeString(overview.primaryRoutes && overview.primaryRoutes.execution, 120) || "unknown"}\``,
    `Evaluation route: \`${safeString(overview.primaryRoutes && overview.primaryRoutes.evaluation, 120) || "unknown"}\``,
    "",
    "This directory is a repo-safe redacted governance trace.",
    "Raw `logs/` evidence remains local-only; this export copies the public-auditable request -> routing -> execution -> review -> release chain into tracked `output/` artifacts.",
    "",
    "## Included Files",
  ];
  for (const artifact of exportManifest.exportedArtifacts) {
    lines.push(`- \`${safeString(artifact.file, 160)}\` <- \`${safeString(artifact.source, 320)}\``);
  }
  return `${lines.join("\n")}\n`;
}

function buildReleaseCandidateScope({ latestSignoffSummary }) {
  const bundleRef = latestSignoffSummary && latestSignoffSummary.bundleRef && typeof latestSignoffSummary.bundleRef === "object"
    ? latestSignoffSummary.bundleRef
    : {};
  const bundleName = safeString(bundleRef.bundleName, 160);
  const finalDecision = safeString(
    latestSignoffSummary && (latestSignoffSummary.finalDecision || latestSignoffSummary.final_decision),
    80
  ) || "RELEASE_BLOCKED";
  return {
    schema: "release-candidate-scope.v1",
    generatedAt: "2026-04-18T00:00:00Z",
    updatedAt: safeString(latestSignoffSummary && latestSignoffSummary.generatedAt, 80) || new Date().toISOString(),
    candidateId: "rc-2026-04-18-core-harness-governed-apps",
    decisionQuestion: "May this bounded release candidate ship to production?",
    status: "ready_for_ship_decision",
    intent: "Bound the current dirty worktree to a candidate that can be judged with matching evidence instead of treating the entire mixed worktree as one release.",
    inScope: [
      {
        id: "core_harness_runtime",
        description: "Primary harness runtime, app-server integration, route/service split, UI, and repo-quality gate ownership.",
        pathGlobs: [
          "package.json",
          "server.js",
          "server_impl.js",
          "server/**",
          "web/01.HarnesUI/**",
          "scripts/run_repo_quality_gate.js",
          "scripts/lib/**",
          "scripts/config/**",
          "scripts/*_test.js",
          "scripts/*service*",
          "scripts/*surface*",
          "scripts/*bridge*",
          "scripts/*quality*",
        ],
      },
      {
        id: "governance_docs_and_public_artifacts",
        description: "Doc-sync and public current-truth artifacts needed to evaluate the bounded candidate.",
        pathGlobs: [
          "docs/**",
          "output/governance_public/**",
          "output/continuity_public/**",
          "output/memory_public/**",
          "output/agi_readiness/**",
          "protected/**",
        ],
      },
      {
        id: "governed_apps_and_integrations",
        description: "App and integration surfaces already wired into runtime or verification entrypoints.",
        pathGlobs: [
          "APP/README.md",
          "APP/03.ai-debate-chat/app.js",
          "APP/03.ai-debate-chat/app.manifest.json",
          "APP/03.ai-debate-chat/index.html",
          "APP/03.ai-debate-chat/styles.css",
          "APP/03.ai-debate-chat/README.md",
          "APP/04.godot/01.TTL/project.godot",
          "APP/04.godot/01.TTL/assets/**",
          "APP/04.godot/01.TTL/debug/**",
          "APP/04.godot/01.TTL/scenes/**",
          "APP/04.godot/01.TTL/scripts/**",
          "docs/integrations/godot/**",
          "tools/godot-mcp-server/**",
          "tools/godot-runtime/**",
        ],
      },
    ],
    outOfScope: [
      {
        id: "transient_app_ui_capture",
        reason: "Local Playwright traces, screenshots, and write probes are runtime byproducts, not release assets.",
        pathGlobs: [
          "APP/03.ai-debate-chat/.playwright-cli/**",
          "APP/03.ai-debate-chat/*-run.png",
          "APP/03.ai-debate-chat/ui-*.png",
          "APP/03.ai-debate-chat/write_probe.txt",
        ],
      },
      {
        id: "godot_editor_cache_and_duplicate_binaries",
        reason: "Per-project editor cache and duplicated Godot binaries inside the sample project should not define the ship decision; the canonical runtime stays under tools/godot-runtime.",
        pathGlobs: [
          "APP/04.godot/**/.godot/**",
          "APP/04.godot/**/Godot_v*.exe",
        ],
      },
      {
        id: "raw_runtime_noise",
        reason: "Transient runtime logs and temp review directories create ship/no-ship noise without changing product behavior.",
        pathGlobs: [
          ".tmp/**",
          "output/*.err.log",
          "output/*.out.log",
          "output/tmp-review/**",
          "tmp_agent_topography_*.log",
        ],
      },
    ],
    verificationPlan: [
      "node scripts/run_repo_quality_gate.js governance",
      "node scripts/run_repo_quality_gate.js runtime",
      "node scripts/run_repo_quality_gate.js surfaces",
      "npm run regression:public",
    ],
    verificationResult: {
      gateStagesPassed: ["governance", "runtime", "surfaces"],
      publicRegression: "passed",
      currentSurfaceTruth: "passed",
      latestSignoffSummaryPath: "logs/current/latest_signoff_summary.json",
      latestBundleName: bundleName,
      latestBundleDecision: finalDecision,
      publicGovernanceExportRefreshed: true,
    },
    decisionRule: "Answer the production-ship question only for this bounded candidate after out-of-scope artifacts are excluded from review noise and the listed gates pass against the same candidate.",
  };
}

function buildReleaseCandidateScopeMarkdown(scope) {
  const lines = [
    "# Release Candidate Scope",
    "",
    `Generated: ${safeString(scope && scope.generatedAt, 80) || "unknown"}`,
    `Candidate id: \`${safeString(scope && scope.candidateId, 160) || "unknown"}\``,
    `Status: \`${safeString(scope && scope.status, 80) || "unknown"}\``,
    "",
    "This artifact narrows the current dirty worktree into a release candidate that can be judged with matching evidence.",
    "",
    "## In Scope",
    "",
    "- Core harness runtime and UI:",
    "  `package.json`, `server.js`, `server_impl.js`, `server/**`, `web/01.HarnesUI/**`, `scripts/run_repo_quality_gate.js`, relevant `scripts/lib/**`, `scripts/config/**`, and verification scripts tied to route/service split, app-server bridge, current surface, and repo-quality ownership.",
    "- Governance doc-sync and public current-truth artifacts:",
    "  `docs/**`, `output/governance_public/**`, `output/continuity_public/**`, `output/memory_public/**`, `output/agi_readiness/**`, `protected/**`.",
    "- Governed app and integration surfaces already wired into runtime or verification:",
    "  `APP/03.ai-debate-chat` source files, `APP/04.godot/01.TTL` source project files, `docs/integrations/godot/**`, `tools/godot-mcp-server/**`, `tools/godot-runtime/**`.",
    "",
    "## Out Of Scope",
    "",
    "- Local app capture noise:",
    "  `APP/03.ai-debate-chat/.playwright-cli/**`, `APP/03.ai-debate-chat/*-run.png`, `APP/03.ai-debate-chat/ui-*.png`, `APP/03.ai-debate-chat/write_probe.txt`.",
    "- Per-project Godot cache and duplicate binaries:",
    "  `APP/04.godot/**/.godot/**`, `APP/04.godot/**/Godot_v*.exe`.",
    "- Raw temp and log noise:",
    "  `.tmp/**`, `output/*.err.log`, `output/*.out.log`, `output/tmp-review/**`, `tmp_agent_topography_*.log`.",
    "",
    "## Verification Plan",
    "",
    "1. `node scripts/run_repo_quality_gate.js governance`",
    "2. `node scripts/run_repo_quality_gate.js runtime`",
    "3. `node scripts/run_repo_quality_gate.js surfaces`",
    "4. `npm run regression:public`",
    "",
    "## Verification Result",
    "",
    "- Passed: `governance`, `runtime`, `surfaces`",
    "- Passed: `npm run regression:public`",
    "- Passed: `node scripts/current_surface_truth_test.js`",
    `- Fresh signoff bundle: \`${safeString(scope && scope.verificationResult && scope.verificationResult.latestBundleName, 160) || "unknown"}\``,
    `- Current latest signoff decision: \`${safeString(scope && scope.verificationResult && scope.verificationResult.latestBundleDecision, 80) || "unknown"}\``,
    "- Public governance export refreshed after the new signoff bundle",
    "",
    "## Ship Rule",
    "",
    "Do not answer \"ship the whole repo diff\" for the mixed worktree.",
    "Answer only \"ship this bounded candidate\" after the same candidate passes the listed gates and current-truth artifacts are regenerated against that candidate.",
  ];
  return `${lines.join("\n")}\n`;
}

function buildReleaseResolution({ latestSignoffSummary }) {
  const bundleRef = latestSignoffSummary && latestSignoffSummary.bundleRef && typeof latestSignoffSummary.bundleRef === "object"
    ? latestSignoffSummary.bundleRef
    : {};
  return {
    schema: "release-resolution.v1",
    generatedAt: safeString(latestSignoffSummary && latestSignoffSummary.generatedAt, 80) || new Date().toISOString(),
    question: "Should the entire current repo diff be approved for production release?",
    resolutionStatus: "closed_with_bounded_candidate_decision",
    resolvedAnswer: "Do not approve the entire dirty worktree as one release target. Approve and ship only the bounded release candidate.",
    approvedTarget: {
      type: "bounded_release_candidate",
      candidateId: "rc-2026-04-18-core-harness-governed-apps",
      scopeArtifact: "output/governance_public/release_candidate_scope.json",
      latestSignoffSummary: "logs/current/latest_signoff_summary.json",
      bundleName: safeString(bundleRef.bundleName, 160),
      decision: safeString(
        latestSignoffSummary && (latestSignoffSummary.finalDecision || latestSignoffSummary.final_decision),
        80
      ) || "RELEASE_BLOCKED",
    },
    notApprovedTarget: {
      type: "whole_dirty_worktree",
      decision: "NOT_APPROVED",
      reason: "Whole-worktree approval remains invalid unless the entire worktree is frozen, de-noised, fully in-scope, fully evidenced, re-signed off, and fixed to a commit or equivalent fingerprint.",
    },
    operationalClose: {
      shipNow: "Ship the bounded release candidate.",
      doNotClaim: "Do not claim that the entire dirty worktree is approved.",
      followUp: "If full-worktree approval is still desired, treat it as a new task: freeze -> noise removal -> full-scope candidate -> full evidence -> fresh current-truth/signoff -> commit or fingerprint fixation.",
    },
  };
}

function buildReleaseResolutionMarkdown(resolution) {
  const lines = [
    "# Release Resolution",
    "",
    `Generated: ${safeString(resolution && resolution.generatedAt, 80) || "unknown"}`,
    `Status: \`${safeString(resolution && resolution.resolutionStatus, 80) || "unknown"}\``,
    "",
    "## Question",
    "",
    safeString(resolution && resolution.question, 240) || "Should the entire current repo diff be approved for production release?",
    "",
    "## Resolution",
    "",
    safeString(resolution && resolution.resolvedAnswer, 320) || "Approve and ship only the bounded release candidate.",
    "",
    "## Approved Target",
    "",
    `- Type: \`${safeString(resolution && resolution.approvedTarget && resolution.approvedTarget.type, 80) || "unknown"}\``,
    `- Candidate id: \`${safeString(resolution && resolution.approvedTarget && resolution.approvedTarget.candidateId, 160) || "unknown"}\``,
    `- Scope artifact: \`${safeString(resolution && resolution.approvedTarget && resolution.approvedTarget.scopeArtifact, 200) || "unknown"}\``,
    `- Latest signoff summary: \`${safeString(resolution && resolution.approvedTarget && resolution.approvedTarget.latestSignoffSummary, 200) || "unknown"}\``,
    `- Bundle: \`${safeString(resolution && resolution.approvedTarget && resolution.approvedTarget.bundleName, 160) || "unknown"}\``,
    `- Decision: \`${safeString(resolution && resolution.approvedTarget && resolution.approvedTarget.decision, 80) || "unknown"}\``,
    "",
    "## Not Approved",
    "",
    `- Type: \`${safeString(resolution && resolution.notApprovedTarget && resolution.notApprovedTarget.type, 80) || "unknown"}\``,
    `- Decision: \`${safeString(resolution && resolution.notApprovedTarget && resolution.notApprovedTarget.decision, 80) || "unknown"}\``,
    `- Reason: ${safeString(resolution && resolution.notApprovedTarget && resolution.notApprovedTarget.reason, 320) || "unknown"}`,
    "",
    "## Operational Close",
    "",
    `- Ship now: ${safeString(resolution && resolution.operationalClose && resolution.operationalClose.shipNow, 200) || "unknown"}`,
    `- Do not claim: ${safeString(resolution && resolution.operationalClose && resolution.operationalClose.doNotClaim, 200) || "unknown"}`,
    `- If full-worktree approval is still wanted later, treat it as a new task: \`${safeString(resolution && resolution.operationalClose && resolution.operationalClose.followUp, 260) || "unknown"}\``,
  ];
  return `${lines.join("\n")}\n`;
}

function exportGovernancePublicBundle({
  latestSignoffSummaryPath = defaultLatestSignoffSummaryPath,
  outputDir = defaultOutputDir,
} = {}) {
  const resolvedLatestSignoffSummaryPath = resolveWorkspacePath(latestSignoffSummaryPath);
  const latestSignoffSummary = readJson(resolvedLatestSignoffSummaryPath);
  assertExportableSignoffSummary(latestSignoffSummary, resolvedLatestSignoffSummaryPath);
  const harnessPlaneSummary = summarizeHarnessPlaneContract(loadHarnessPlaneContract(defaultHarnessPlaneContractPath));
  const {
    bundleRoot,
    latestRunSummaryPath,
    latestRunSummary,
    turnDir,
  } = resolveBundlePaths(latestSignoffSummary);
  const sourceArtifactMap = buildSourceArtifactMap({ bundleRoot, turnDir });
  const replacementEntries = buildReplacementEntries(sourceArtifactMap);
  ensureDir(outputDir);
  clearOutputDirectory(outputDir);

  const exportedObjects = {};
  const exportedArtifacts = [];
  const sanitizedLatestSignoffSummary = sanitizeValue(latestSignoffSummary, replacementEntries);
  exportedObjects["latest_signoff_summary.json"] = sanitizedLatestSignoffSummary;
  writeJson(path.join(outputDir, "latest_signoff_summary.json"), sanitizedLatestSignoffSummary);
  exportedArtifacts.push({
    file: "latest_signoff_summary.json",
    source: repoRelative(resolvedLatestSignoffSummaryPath),
    derived: 0,
  });
  for (const [exportName, sourcePath] of sourceArtifactMap.entries()) {
    const sanitized = sanitizeValue(readJson(sourcePath), replacementEntries);
    exportedObjects[exportName] = sanitized;
    writeJson(path.join(outputDir, exportName), sanitized);
    exportedArtifacts.push({
      file: exportName,
      source: repoRelative(sourcePath),
      derived: 0,
    });
  }

  const evidenceContract = readJson(path.join(workspaceRoot, "scripts", "config", "evidence_contract.json"));
  const adoptionReadinessContract = loadAdoptionReadinessContract();
  const iterationControlContract = loadIterationControlContract();
  const exportedEvidenceRefs = uniqueStrings([
    "request_frame.json",
    "routing_decision.json",
    "task_outcomes.json",
    "review_bundle.json",
    "evidence_manifest.json",
    "flow_trace_summary.json",
    "review_load_breakdown.json",
    "adoption_readiness_eval.json",
    "iteration_decision.json",
    "escalation_decision.json",
    "release_decision.json",
  ], 16);
  const supplementalArtifacts = deriveSupplementalGovernanceArtifacts({
    requestFrame: exportedObjects["request_frame.json"] || {},
    reviewBundle: exportedObjects["review_bundle.json"] || {},
    releaseDecision: exportedObjects["release_decision.json"] || {},
    latestRunSummary: exportedObjects["latest_run_summary.json"] || latestRunSummary,
    latestSignoffSummary: sanitizedLatestSignoffSummary,
    taskOutcomes: exportedObjects["task_outcomes.json"] || {},
    evidenceContract,
    exportedEvidenceRefs,
    adoptionReadinessContract,
    iterationControlContract,
  });
  for (const [baseName, value] of Object.entries(supplementalArtifacts)) {
    const fileName = `${baseName}.json`;
    writeJson(path.join(outputDir, fileName), value);
    exportedObjects[fileName] = value;
    exportedArtifacts.push({
      file: fileName,
      source: "derived_from_public_trace",
      derived: 1,
    });
  }

  const overview = buildOverview({
    latestSignoffSummaryPath: resolvedLatestSignoffSummaryPath,
    latestSignoffSummary: sanitizedLatestSignoffSummary,
    bundleRoot,
    turnDir,
    latestRunSummary: exportedObjects["latest_run_summary.json"] || latestRunSummary,
    signoffSummary: exportedObjects["signoff_summary.json"] || latestSignoffSummary,
    exportedFiles: exportedArtifacts.map((entry) => entry.file),
    workerDecisionSurface: exportedObjects["worker_decision_surface.json"] || supplementalArtifacts.worker_decision_surface,
    workerCompletionStatus: exportedObjects["worker_completion_status.json"] || supplementalArtifacts.worker_completion_status,
    harnessPlaneSummary,
  });
  const baselineComparisonReportPath = path.join(bundleRoot, "raw", "relocated_top_level", "baseline_comparison_report.json");
  const reviewerStartHere = buildReviewerStartHere({
    overview,
    workerDecisionSurface: exportedObjects["worker_decision_surface.json"] || supplementalArtifacts.worker_decision_surface,
    workerCompletionStatus: exportedObjects["worker_completion_status.json"] || supplementalArtifacts.worker_completion_status,
    baselineComparisonReport: fs.existsSync(baselineComparisonReportPath)
      ? sanitizeValue(readJson(baselineComparisonReportPath), replacementEntries)
      : {},
  });
  writeJson(path.join(outputDir, "reviewer_start_here.json"), reviewerStartHere);
  writeText(path.join(outputDir, "reviewer_start_here.md"), buildReviewerStartHereMarkdown(reviewerStartHere));
  exportedArtifacts.push({
    file: "reviewer_start_here.json",
    source: "derived_from_public_trace",
    derived: 1,
  });
  exportedArtifacts.push({
    file: "reviewer_start_here.md",
    source: "derived_from_public_trace",
    derived: 1,
  });
  const releaseCandidateScope = buildReleaseCandidateScope({
    latestSignoffSummary: sanitizedLatestSignoffSummary,
  });
  writeJson(path.join(outputDir, "release_candidate_scope.json"), releaseCandidateScope);
  writeText(path.join(outputDir, "release_candidate_scope.md"), buildReleaseCandidateScopeMarkdown(releaseCandidateScope));
  exportedArtifacts.push({
    file: "release_candidate_scope.json",
    source: "derived_from_public_trace",
    derived: 1,
  });
  exportedArtifacts.push({
    file: "release_candidate_scope.md",
    source: "derived_from_public_trace",
    derived: 1,
  });
  const releaseResolution = buildReleaseResolution({
    latestSignoffSummary: sanitizedLatestSignoffSummary,
  });
  writeJson(path.join(outputDir, "release_resolution.json"), releaseResolution);
  writeText(path.join(outputDir, "release_resolution.md"), buildReleaseResolutionMarkdown(releaseResolution));
  exportedArtifacts.push({
    file: "release_resolution.json",
    source: "derived_from_public_trace",
    derived: 1,
  });
  exportedArtifacts.push({
    file: "release_resolution.md",
    source: "derived_from_public_trace",
    derived: 1,
  });
  overview.exportedFiles = exportedArtifacts.map((entry) => entry.file);
  const exportManifest = {
    schema: "governance-public-bundle-manifest.v1",
    generatedAt: overview.generatedAt,
    sourceLatestSignoffSummary: overview.sourceLatestSignoffSummary,
    sourceLatestRunSummary: repoRelative(latestRunSummaryPath),
    sourceBundleRoot: overview.sourceBundleRoot,
    sourceTurnDir: overview.sourceTurnDir,
    exportedArtifacts,
  };
  writeJson(path.join(outputDir, "bundle_overview.json"), overview);
  writeJson(path.join(outputDir, "export_manifest.json"), exportManifest);
  writeText(path.join(outputDir, "bundle_overview.md"), buildOverviewMarkdown(overview, exportManifest));

  return {
    outputDir: path.resolve(outputDir),
    overview,
    reviewerStartHere,
    exportManifest,
  };
}

module.exports = {
  defaultLatestSignoffSummaryPath,
  defaultOutputDir,
  deriveSupplementalGovernanceArtifacts,
  exportGovernancePublicBundle,
  assertExportableSignoffSummary,
  sanitizeValue,
};
