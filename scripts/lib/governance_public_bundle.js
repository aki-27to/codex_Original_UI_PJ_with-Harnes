"use strict";

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

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultLatestSignoffSummaryPath = path.join(workspaceRoot, "logs", "current", "latest_signoff_summary.json");
const defaultOutputDir = path.join(workspaceRoot, "output", "governance_public");

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
  { exportName: "conformance_report.json", baseKey: "turnDir", sourceName: "conformance_report.json" },
  { exportName: "operator_view_summary.json", baseKey: "turnDir", sourceName: "operator_view_summary.json" },
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

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw ? JSON.parse(raw) : null;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, `${String(value || "").replace(/\r?\n?$/, "\n")}`, "utf8");
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

function deriveIterationHintAction(reviewBundle, releaseDecision, finalOutcome) {
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
  const outcomeStatus = safeString(finalOutcome && finalOutcome.taskOutcomeStatus, 80).toUpperCase();
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
  taskOutcomes,
  evidenceContract,
  exportedEvidenceRefs,
  adoptionReadinessContract,
  iterationControlContract,
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
  const iterationHint = {
    action: deriveIterationHintAction(reviewBundle, releaseDecision, finalOutcome),
    blockers: uniqueStrings([
      ...(Array.isArray(reviewBundle && reviewBundle.missing_evidence) ? reviewBundle.missing_evidence : []),
      ...(Array.isArray(releaseDecision && releaseDecision.blocker_list) ? releaseDecision.blocker_list : []),
    ], 16),
  };
  const adoptionReadinessEval = evaluateAdoptionReadiness({
    acceptanceResults,
    reviewBundle,
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
  const iterationDecision = buildIterationDecision({
    evaluator: adoptionReadinessEval,
    finalOutcome,
    residualRisks,
    assumptions,
    requiredEvidenceFailures: missingEvidence,
    stepCount: Array.isArray(taskOutcomes && taskOutcomes.task_outcomes) ? taskOutcomes.task_outcomes.length : 0,
  }, iterationControlContract);
  const escalationDecision = buildEscalationDecision({
    contract: iterationControlContract,
    iterationDecision,
    finalOutcome,
  });
  return {
    adoption_readiness_eval: adoptionReadinessEval,
    iteration_decision: iterationDecision,
    escalation_decision: escalationDecision,
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
    exportedFiles,
  };
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

function exportGovernancePublicBundle({
  latestSignoffSummaryPath = defaultLatestSignoffSummaryPath,
  outputDir = defaultOutputDir,
} = {}) {
  const resolvedLatestSignoffSummaryPath = resolveWorkspacePath(latestSignoffSummaryPath);
  const latestSignoffSummary = readJson(resolvedLatestSignoffSummaryPath);
  assertExportableSignoffSummary(latestSignoffSummary, resolvedLatestSignoffSummaryPath);
  const {
    bundleRoot,
    latestRunSummaryPath,
    latestRunSummary,
    turnDir,
  } = resolveBundlePaths(latestSignoffSummary);
  const sourceArtifactMap = buildSourceArtifactMap({ bundleRoot, turnDir });
  const replacementEntries = buildReplacementEntries(sourceArtifactMap);
  ensureDir(outputDir);

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
  });
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
    exportManifest,
  };
}

module.exports = {
  defaultLatestSignoffSummaryPath,
  defaultOutputDir,
  exportGovernancePublicBundle,
  assertExportableSignoffSummary,
  sanitizeValue,
};
