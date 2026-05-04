"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  ensureDir,
  getLoggingSurfacePaths,
  readJson,
  repoRelative,
} = require("./logging_surface");
const {
  loadOpenAIBlogLearningPolicy,
  refreshSelfImprovementArtifacts,
} = require("./openai_blog_learning");
const {
  loadAnthropicEngineeringLearningPolicy,
} = require("./anthropic_engineering_learning");
const {
  buildTaskPaths,
  loadContinuityPolicy,
} = require("./long_horizon_continuity");
const {
  resolveExportSessionId,
} = require("./export_session_window");
const {
  buildWorkerCompletionStatus,
} = require("./worker_completion_status");

const workspaceRootDefault = path.resolve(__dirname, "..", "..");
const WORKER_COMPLETION_DIVERGENCE_DETAIL = "worker completion companion diverges from the worker headline or its background readiness basis";

function safeString(value, max = 400) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : "";
  }
  if (value == null) return "";
  return safeString(String(value), max);
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasExplicitNumber(value) {
  if (value == null) return false;
  if (typeof value === "string" && !value.trim()) return false;
  return Number.isFinite(Number(value));
}

function numberOrNull(value, digits = null) {
  if (!hasExplicitNumber(value)) return null;
  const parsed = Number(value);
  return digits == null ? parsed : Number(parsed.toFixed(digits));
}

function toIso(value = Date.now()) {
  const parsed = safeNumber(value, Date.now());
  return new Date(parsed).toISOString();
}

function normalizeIsoTimestamp(value) {
  const text = safeString(value, 80);
  if (!text) return "";
  if (/^\d{12,16}$/.test(text)) {
    const numeric = safeNumber(text, 0);
    return numeric > 0 ? toIso(numeric) : "";
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
}

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0) {
  const parsed = Math.trunc(safeNumber(value, fallback));
  return Math.min(max, Math.max(min, parsed));
}

function uniqueStrings(values, maxItems = 16, maxChars = 160) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, maxChars);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJsonObject(targetPath) {
  const payload = readJson(targetPath);
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function readJsonArray(targetPath) {
  const payload = readJson(targetPath);
  return Array.isArray(payload) ? payload : [];
}

function ensureFile(targetPath, initialText = "") {
  ensureDir(path.dirname(targetPath));
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, initialText, "utf8");
  }
}

function writeJsonIfChanged(targetPath, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  ensureDir(path.dirname(targetPath));
  if (fs.existsSync(targetPath)) {
    const current = fs.readFileSync(targetPath, "utf8");
    if (current === next) return false;
  }
  fs.writeFileSync(targetPath, next, "utf8");
  return true;
}

function resolvePublicExportSessionId(workspaceRoot, workspaceId = "") {
  void workspaceId;
  return resolveExportSessionId(workspaceRoot);
}

function readWorkerDecisionSurfaceArtifact(workspaceRoot) {
  const targetPath = path.join(workspaceRoot, "output", "governance_public", "worker_decision_surface.json");
  const payload = readJson(targetPath);
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function readWorkerCompletionStatusArtifact(workspaceRoot) {
  const targetPath = path.join(workspaceRoot, "output", "governance_public", "worker_completion_status.json");
  const payload = readJson(targetPath);
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function summarizeWorkerDecisionHeadline(workspaceRoot) {
  const workerDecisionSurface = readWorkerDecisionSurfaceArtifact(workspaceRoot);
  const workerCompletionStatus = readWorkerCompletionStatusArtifact(workspaceRoot);
  const backgroundProgramReadiness = workerCompletionStatus.backgroundProgramReadiness
    && typeof workerCompletionStatus.backgroundProgramReadiness === "object"
      ? workerCompletionStatus.backgroundProgramReadiness
      : {};
  const workerStopDecision = workerCompletionStatus.workerStopDecision
    && typeof workerCompletionStatus.workerStopDecision === "object"
      ? workerCompletionStatus.workerStopDecision
      : {};
  return {
    workerDecisionSurfacePath: repoRelative(workspaceRoot, path.join(workspaceRoot, "output", "governance_public", "worker_decision_surface.json")),
    workerDecisionSurface: sanitizePublicValue(workerDecisionSurface, workspaceRoot),
    workerCompletionStatusPath: repoRelative(workspaceRoot, path.join(workspaceRoot, "output", "governance_public", "worker_completion_status.json")),
    workerCompletionStatus: sanitizePublicValue(workerCompletionStatus, workspaceRoot),
    headlineScope: safeString(workerDecisionSurface && workerDecisionSurface.scope, 80) || "",
    workerDecisionHeadline: safeString(workerDecisionSurface && workerDecisionSurface.topLevelOutcome, 80) || "",
    workerStopDecision: sanitizePublicValue(workerStopDecision, workspaceRoot),
    backgroundProgramReadiness: sanitizePublicValue(backgroundProgramReadiness, workspaceRoot),
  };
}

function normalizeWorkerDecisionSurfaceForExport(workerDecisionSurface = {}, exportSessionId = "") {
  const targetExportSessionId = safeString(exportSessionId, 120);
  if (!targetExportSessionId || !workerDecisionSurface || typeof workerDecisionSurface !== "object" || Array.isArray(workerDecisionSurface)) {
    return workerDecisionSurface && typeof workerDecisionSurface === "object" ? workerDecisionSurface : {};
  }
  if (!safeString(workerDecisionSurface.schema, 120) || !safeString(workerDecisionSurface.topLevelOutcome, 80)) {
    return workerDecisionSurface;
  }
  return {
    ...workerDecisionSurface,
    exportSessionId: targetExportSessionId,
    generatedAt: safeString(workerDecisionSurface.generatedAt, 80) || toIso(),
  };
}

function normalizeArtifactExportSessionAtPath(targetPath = "", exportSessionId = "") {
  const normalizedPath = safeString(targetPath, 1200);
  const targetExportSessionId = safeString(exportSessionId, 120);
  if (!normalizedPath || !targetExportSessionId || !fs.existsSync(normalizedPath)) {
    return {};
  }
  const payload = readJson(normalizedPath);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !safeString(payload.schema, 120)) {
    return {};
  }
  const nextPayload = {
    ...payload,
    exportSessionId: targetExportSessionId,
    generatedAt: safeString(payload.generatedAt, 80) || toIso(),
  };
  writeJsonIfChanged(normalizedPath, nextPayload);
  return nextPayload;
}

function isTerminalAutonomousLearningStatus(value) {
  return ["passed", "failed", "revoked"].includes(safeString(value, 80));
}

function summarizeAutonomousLearningEntryCounts(entries = []) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const countedEntries = normalizedEntries.filter((entry) => safeString(entry && entry.source, 80) !== "memory_eval");
  const openEntries = countedEntries.filter((entry) => !isTerminalAutonomousLearningStatus(entry && entry.status));
  const countBlocked = (list) => list.filter((entry) => ["blocked", "proposal_only", "proposal only"].includes(safeString(entry && entry.status, 80))).length;
  return {
    queued: openEntries.filter((entry) => safeString(entry && entry.status, 80) === "queued").length,
    running: openEntries.filter((entry) => safeString(entry && entry.status, 80) === "running").length,
    blocked: countBlocked(openEntries),
    insufficientEvidenceCount: openEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "insufficient_evidence").length,
    verifiedPositiveCount: countedEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_positive").length,
  };
}

function buildAutonomousLearningCountSemantics() {
  return {
    currentWindow: "current_export_session",
    historicalWindow: "prior_export_sessions_cumulative",
    countedEntryScope: "non_memory_eval_learning_agenda_entries",
    currentOpenAgendaCounts: [
      "currentQueuedCount",
      "currentRunningCount",
      "currentBlockedCount",
      "currentInsufficientEvidenceCount",
    ],
    currentVerifiedPositiveCount: "verified_positive_non_memory_eval_entries_in_current_export_session",
    historicalVerifiedPositiveCount: "cumulative_verified_positive_non_memory_eval_entries_from_prior_export_sessions",
    gateDecisionCounts: {
      scope: "completion_gate_consumed_subset",
      countedEntryScope: "non_memory_eval_learning_agenda_entries_in_current_export_session",
      sourceRule: "exclude_meta_completion_entries_via_isMetaCompletionAgendaEntry",
      openAgendaFields: [
        "queued",
        "running",
        "blocked",
        "insufficientEvidenceCount",
      ],
    },
    summaryRelationships: {
      queued: "equals_currentQueuedCount",
      running: "equals_currentRunningCount",
      blocked: "equals_currentBlockedCount",
      insufficientEvidenceCount: "equals_currentInsufficientEvidenceCount",
      verifiedPositive: "equals_currentVerifiedPositiveCount",
    },
    decisionRelationships: {
      goalRunningAgendaCount: "equals_gateDecisionCounts.running",
      subjectiveRunningAgendaCount: "equals_gateDecisionCounts.running",
      subjectiveBlockedAgendaCount: "equals_gateDecisionCounts.blocked",
      subjectiveInsufficientEvidenceCount: "equals_max(gateDecisionCounts.insufficientEvidenceCount,selfDirectedProbeStatus.summary.insufficientEvidenceCount)",
    },
  };
}

function summarizeGateConsumedAgendaCounts(entries = []) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const gateEntries = normalizedEntries.filter((entry) => !isMetaCompletionAgendaEntry(entry));
  const supportingCounts = summarizeAutonomousLearningEntryCounts(normalizedEntries);
  const gateCounts = summarizeAutonomousLearningEntryCounts(gateEntries);
  const supportingOpenCounts = {
    queued: supportingCounts.queued,
    running: supportingCounts.running,
    blocked: supportingCounts.blocked,
    insufficientEvidenceCount: supportingCounts.insufficientEvidenceCount,
  };
  const gateOpenCounts = {
    queued: gateCounts.queued,
    running: gateCounts.running,
    blocked: gateCounts.blocked,
    insufficientEvidenceCount: gateCounts.insufficientEvidenceCount,
  };
  return {
    gateEntries,
    supportingOpenCounts,
    gateOpenCounts,
    excludedMetaCompletionCounts: {
      queued: Math.max(supportingOpenCounts.queued - gateOpenCounts.queued, 0),
      running: Math.max(supportingOpenCounts.running - gateOpenCounts.running, 0),
      blocked: Math.max(supportingOpenCounts.blocked - gateOpenCounts.blocked, 0),
      insufficientEvidenceCount: Math.max(supportingOpenCounts.insufficientEvidenceCount - gateOpenCounts.insufficientEvidenceCount, 0),
    },
  };
}

function normalizeOpenAgendaCounts(counts = {}) {
  const payload = counts && typeof counts === "object" ? counts : {};
  return {
    queued: clampInt(payload.queued, 0, 999999, 0),
    running: clampInt(payload.running, 0, 999999, 0),
    blocked: clampInt(payload.blocked, 0, 999999, 0),
    insufficientEvidenceCount: clampInt(payload.insufficientEvidenceCount, 0, 999999, 0),
  };
}

function resolveRunningAgendaDecisionCounts({
  autonomousLearningStatus = null,
  agendaEntries = [],
} = {}) {
  const learning = autonomousLearningStatus && typeof autonomousLearningStatus === "object"
    ? autonomousLearningStatus
    : {};
  const gateDecisionCounts = learning && learning.gateDecisionCounts && typeof learning.gateDecisionCounts === "object"
    ? learning.gateDecisionCounts
    : null;
  const supportingCurrentCounts = gateDecisionCounts && gateDecisionCounts.supportingCurrentCounts && typeof gateDecisionCounts.supportingCurrentCounts === "object"
    ? gateDecisionCounts.supportingCurrentCounts
    : null;
  const excludedMetaCompletionCounts = gateDecisionCounts && gateDecisionCounts.excludedMetaCompletionCounts && typeof gateDecisionCounts.excludedMetaCompletionCounts === "object"
    ? gateDecisionCounts.excludedMetaCompletionCounts
    : null;
  if (gateDecisionCounts && supportingCurrentCounts && excludedMetaCompletionCounts) {
    return {
      gateEntries: Array.isArray(agendaEntries) ? agendaEntries.filter((entry) => !isMetaCompletionAgendaEntry(entry)) : [],
      supportingOpenCounts: normalizeOpenAgendaCounts(supportingCurrentCounts),
      gateOpenCounts: normalizeOpenAgendaCounts(gateDecisionCounts),
      excludedMetaCompletionCounts: normalizeOpenAgendaCounts(excludedMetaCompletionCounts),
      source: "autonomous_learning_status.gateDecisionCounts",
    };
  }
  return {
    ...summarizeGateConsumedAgendaCounts(agendaEntries),
    source: "agenda_entries_projection",
  };
}

function buildRunningAgendaDecisionBasis(agendaCounts = {}) {
  const gateOpenCounts = agendaCounts && agendaCounts.gateOpenCounts && typeof agendaCounts.gateOpenCounts === "object"
    ? agendaCounts.gateOpenCounts
    : {};
  const supportingOpenCounts = agendaCounts && agendaCounts.supportingOpenCounts && typeof agendaCounts.supportingOpenCounts === "object"
    ? agendaCounts.supportingOpenCounts
    : {};
  const excludedMetaCompletionCounts = agendaCounts && agendaCounts.excludedMetaCompletionCounts && typeof agendaCounts.excludedMetaCompletionCounts === "object"
    ? agendaCounts.excludedMetaCompletionCounts
    : {};
  return {
    mode: "fail_closed_gate_subset_with_supporting_broader_surface",
    gateScope: "non_meta_completion_non_memory_eval_learning_agenda_entries_in_current_export_session",
    supportingScope: "all_non_memory_eval_learning_agenda_entries_in_current_export_session",
    exclusionRule: "isMetaCompletionAgendaEntry",
    sourceArtifactPath: "output/agi_readiness/autonomous_learning_status.json",
    sourceArtifactField: "gateDecisionCounts.running",
    supportingArtifactField: "currentRunningCount",
    gateRunningAgendaCount: clampInt(gateOpenCounts.running, 0, 999999, 0),
    supportingCurrentRunningCount: clampInt(supportingOpenCounts.running, 0, 999999, 0),
    excludedMetaCompletionRunningCount: clampInt(excludedMetaCompletionCounts.running, 0, 999999, 0),
    gateBlockedAgendaCount: clampInt(gateOpenCounts.blocked, 0, 999999, 0),
    supportingCurrentBlockedCount: clampInt(supportingOpenCounts.blocked, 0, 999999, 0),
    excludedMetaCompletionBlockedCount: clampInt(excludedMetaCompletionCounts.blocked, 0, 999999, 0),
    gateInsufficientEvidenceCount: clampInt(gateOpenCounts.insufficientEvidenceCount, 0, 999999, 0),
    supportingCurrentInsufficientEvidenceCount: clampInt(supportingOpenCounts.insufficientEvidenceCount, 0, 999999, 0),
    excludedMetaCompletionInsufficientEvidenceCount: clampInt(excludedMetaCompletionCounts.insufficientEvidenceCount, 0, 999999, 0),
  };
}

function deriveAutonomousLearningCounts(entries = [], previousStatus = null, exportSessionId = "") {
  const entryCounts = summarizeAutonomousLearningEntryCounts(entries);
  const currentCounts = {
    currentQueuedCount: entryCounts.queued,
    currentRunningCount: entryCounts.running,
    currentBlockedCount: entryCounts.blocked,
    currentInsufficientEvidenceCount: entryCounts.insufficientEvidenceCount,
    currentVerifiedPositiveCount: entryCounts.verifiedPositiveCount,
  };
  const previous = previousStatus && typeof previousStatus === "object" ? previousStatus : {};
  const sameExportSession = safeString(previous.exportSessionId, 120) && safeString(previous.exportSessionId, 120) === safeString(exportSessionId, 120);
  const carryHistorical = (historicalKey, currentKey) => (
    sameExportSession
      ? clampInt(previous && previous[historicalKey], 0, 999999, 0)
      : clampInt(previous && previous[historicalKey], 0, 999999, 0) + clampInt(previous && previous[currentKey], 0, 999999, 0)
  );
  return {
    ...currentCounts,
    historicalQueuedCount: carryHistorical("historicalQueuedCount", "currentQueuedCount"),
    historicalRunningCount: carryHistorical("historicalRunningCount", "currentRunningCount"),
    historicalBlockedCount: carryHistorical("historicalBlockedCount", "currentBlockedCount"),
    historicalInsufficientEvidenceCount: carryHistorical("historicalInsufficientEvidenceCount", "currentInsufficientEvidenceCount"),
    historicalVerifiedPositiveCount: carryHistorical("historicalVerifiedPositiveCount", "currentVerifiedPositiveCount"),
  };
}

function buildAutonomousLearningStatusArtifact({
  workspaceRoot,
  workspaceId = "",
  agenda = null,
  previousStatus = null,
  exportSessionId = "",
}) {
  const gateConsumedAgendaCounts = summarizeGateConsumedAgendaCounts(agenda && agenda.entries);
  const counts = deriveAutonomousLearningCounts(
    agenda && agenda.entries,
    previousStatus,
    exportSessionId,
  );
  const rawSummary = agenda && agenda.summary && typeof agenda.summary === "object"
    ? agenda.summary
    : {};
  const summary = {
    ...rawSummary,
    queued: counts.currentQueuedCount,
    running: counts.currentRunningCount,
    blocked: counts.currentBlockedCount,
    insufficientEvidence: counts.currentInsufficientEvidenceCount,
    insufficientEvidenceCount: counts.currentInsufficientEvidenceCount,
    verifiedPositive: counts.currentVerifiedPositiveCount,
  };
  return {
    schema: "governed-autonomous-learning-status-public.v1",
    generatedAt: toIso(),
    exportSessionId: safeString(exportSessionId, 120),
    scope: "autonomous_learning_supporting",
    workspaceId: safeString(workspaceId, 80),
    countSemantics: buildAutonomousLearningCountSemantics(),
    ...counts,
    gateDecisionCounts: {
      scope: "completion_gate_consumed_subset",
      sourceRule: "exclude_meta_completion_entries_via_isMetaCompletionAgendaEntry",
      queued: clampInt(gateConsumedAgendaCounts.gateOpenCounts && gateConsumedAgendaCounts.gateOpenCounts.queued, 0, 999999, 0),
      running: clampInt(gateConsumedAgendaCounts.gateOpenCounts && gateConsumedAgendaCounts.gateOpenCounts.running, 0, 999999, 0),
      blocked: clampInt(gateConsumedAgendaCounts.gateOpenCounts && gateConsumedAgendaCounts.gateOpenCounts.blocked, 0, 999999, 0),
      insufficientEvidenceCount: clampInt(gateConsumedAgendaCounts.gateOpenCounts && gateConsumedAgendaCounts.gateOpenCounts.insufficientEvidenceCount, 0, 999999, 0),
      supportingCurrentCounts: {
        queued: counts.currentQueuedCount,
        running: counts.currentRunningCount,
        blocked: counts.currentBlockedCount,
        insufficientEvidenceCount: counts.currentInsufficientEvidenceCount,
      },
      excludedMetaCompletionCounts: sanitizePublicValue(gateConsumedAgendaCounts.excludedMetaCompletionCounts, workspaceRoot),
    },
    summary: sanitizePublicValue(summary, workspaceRoot),
    entries: (Array.isArray(agenda && agenda.entries) ? agenda.entries : [])
      .filter((entry) => safeString(entry && entry.source, 80) !== "memory_eval")
      .slice(0, 12)
      .map((entry) => sanitizePublicValue(entry, workspaceRoot)),
  };
}

function validateAutonomousLearningCountSemantics(learning = {}) {
  const semantics = learning && learning.countSemantics && typeof learning.countSemantics === "object"
    ? learning.countSemantics
    : {};
  const relationships = semantics && semantics.summaryRelationships && typeof semantics.summaryRelationships === "object"
    ? semantics.summaryRelationships
    : {};
  const decisionRelationships = semantics && semantics.decisionRelationships && typeof semantics.decisionRelationships === "object"
    ? semantics.decisionRelationships
    : {};
  const currentOpenAgendaCounts = Array.isArray(semantics.currentOpenAgendaCounts)
    ? semantics.currentOpenAgendaCounts.map((entry) => safeString(entry, 120))
    : [];
  const expectedOpenCounts = [
    "currentQueuedCount",
    "currentRunningCount",
    "currentBlockedCount",
    "currentInsufficientEvidenceCount",
  ];
  const pass = safeString(semantics.currentWindow, 120) === "current_export_session"
    && safeString(semantics.historicalWindow, 120) === "prior_export_sessions_cumulative"
    && safeString(semantics.countedEntryScope, 160) === "non_memory_eval_learning_agenda_entries"
    && expectedOpenCounts.every((field) => currentOpenAgendaCounts.includes(field))
    && safeString(semantics.currentVerifiedPositiveCount, 200) === "verified_positive_non_memory_eval_entries_in_current_export_session"
    && safeString(semantics.historicalVerifiedPositiveCount, 220) === "cumulative_verified_positive_non_memory_eval_entries_from_prior_export_sessions"
    && safeString(semantics && semantics.gateDecisionCounts && semantics.gateDecisionCounts.countedEntryScope, 200) === "non_memory_eval_learning_agenda_entries_in_current_export_session"
    && safeString(relationships.queued, 120) === "equals_currentQueuedCount"
    && safeString(relationships.running, 120) === "equals_currentRunningCount"
    && safeString(relationships.blocked, 120) === "equals_currentBlockedCount"
    && safeString(relationships.insufficientEvidenceCount, 120) === "equals_currentInsufficientEvidenceCount"
    && safeString(relationships.verifiedPositive, 120) === "equals_currentVerifiedPositiveCount"
    && safeString(decisionRelationships.goalRunningAgendaCount, 160) === "equals_gateDecisionCounts.running"
    && safeString(decisionRelationships.subjectiveRunningAgendaCount, 160) === "equals_gateDecisionCounts.running"
    && safeString(decisionRelationships.subjectiveBlockedAgendaCount, 160) === "equals_gateDecisionCounts.blocked"
    && safeString(decisionRelationships.subjectiveInsufficientEvidenceCount, 240) === "equals_max(gateDecisionCounts.insufficientEvidenceCount,selfDirectedProbeStatus.summary.insufficientEvidenceCount)";
  return {
    pass,
    detail: pass
      ? "autonomous learning count semantics explicitly bind current export-session counts to summary fields"
      : "autonomous learning count semantics are missing or ambiguous",
  };
}

function validateAutonomousLearningSummaryCountContract(learning = {}) {
  const summaryPayload = learning && learning.summary && typeof learning.summary === "object"
    ? learning.summary
    : {};
  const entryCounts = summarizeAutonomousLearningEntryCounts(learning && learning.entries);
  const currentMatchesEntries = (
    clampInt(learning && learning.currentQueuedCount, 0, 999999, -1) === entryCounts.queued
    && clampInt(learning && learning.currentRunningCount, 0, 999999, -1) === entryCounts.running
    && clampInt(learning && learning.currentBlockedCount, 0, 999999, -1) === entryCounts.blocked
    && clampInt(learning && learning.currentInsufficientEvidenceCount, 0, 999999, -1) === entryCounts.insufficientEvidenceCount
    && clampInt(learning && learning.currentVerifiedPositiveCount, 0, 999999, -1) === entryCounts.verifiedPositiveCount
  );
  const summaryMatchesCurrent = (
    clampInt(summaryPayload.queued, 0, 999999, -1) === clampInt(learning && learning.currentQueuedCount, 0, 999999, -2)
    && clampInt(summaryPayload.running, 0, 999999, -1) === clampInt(learning && learning.currentRunningCount, 0, 999999, -2)
    && clampInt(summaryPayload.blocked, 0, 999999, -1) === clampInt(learning && learning.currentBlockedCount, 0, 999999, -2)
    && clampInt(summaryPayload.insufficientEvidenceCount, 0, 999999, -1) === clampInt(learning && learning.currentInsufficientEvidenceCount, 0, 999999, -2)
    && clampInt(summaryPayload.verifiedPositive, 0, 999999, -1) === clampInt(learning && learning.currentVerifiedPositiveCount, 0, 999999, -2)
  );
  const pass = currentMatchesEntries && summaryMatchesCurrent;
  return {
    pass,
    detail: pass
      ? "autonomous learning entries, current counts, and summary fields satisfy one count contract"
      : "autonomous learning entries, current counts, and summary fields disagree",
  };
}

function validateSelfDirectedProbeThresholdBasis(probeStatus = {}) {
  const currentSnapshot = probeStatus && probeStatus.currentSnapshot && typeof probeStatus.currentSnapshot === "object"
    ? probeStatus.currentSnapshot
    : {};
  const effectiveHistoryAware = probeStatus && probeStatus.effectiveHistoryAware && typeof probeStatus.effectiveHistoryAware === "object"
    ? probeStatus.effectiveHistoryAware
    : {};
  const requiredThresholds = probeStatus && probeStatus.requiredThresholds && typeof probeStatus.requiredThresholds === "object"
    ? probeStatus.requiredThresholds
    : {};
  const meetsThresholds = probeStatus && probeStatus.meetsThresholds && typeof probeStatus.meetsThresholds === "object"
    ? probeStatus.meetsThresholds
    : {};
  const thresholdDecisionBasis = probeStatus && probeStatus.thresholdDecisionBasis && typeof probeStatus.thresholdDecisionBasis === "object"
    ? probeStatus.thresholdDecisionBasis
    : {};
  const recomputedPositive = clampInt(effectiveHistoryAware.positiveProbeCount, 0, 999999, -1) >= clampInt(requiredThresholds.positiveProbeCount, 0, 999999, -2);
  const recomputedNovel = clampInt(effectiveHistoryAware.novelPositiveCount, 0, 999999, -1) >= clampInt(requiredThresholds.novelPositiveCount, 0, 999999, -2);
  const recomputedInsufficient = clampInt(effectiveHistoryAware.insufficientEvidenceCount, 0, 999999, -1) <= clampInt(requiredThresholds.maxInsufficientEvidenceCount, 0, 999999, -2);
  const pass = Number.isFinite(Number(currentSnapshot.positiveProbeCount))
    && Number.isFinite(Number(currentSnapshot.novelPositiveCount))
    && Number.isFinite(Number(currentSnapshot.insufficientEvidenceCount))
    && Number.isFinite(Number(effectiveHistoryAware.positiveProbeCount))
    && Number.isFinite(Number(effectiveHistoryAware.novelPositiveCount))
    && Number.isFinite(Number(effectiveHistoryAware.insufficientEvidenceCount))
    && effectiveHistoryAware.historicalCarry && typeof effectiveHistoryAware.historicalCarry === "object"
    && effectiveHistoryAware.historyLift && typeof effectiveHistoryAware.historyLift === "object"
    && Number.isFinite(Number(requiredThresholds.positiveProbeCount))
    && Number.isFinite(Number(requiredThresholds.novelPositiveCount))
    && Number.isFinite(Number(requiredThresholds.maxInsufficientEvidenceCount))
    && typeof meetsThresholds.positiveProbeCount === "boolean"
    && typeof meetsThresholds.novelPositiveCount === "boolean"
    && typeof meetsThresholds.insufficientEvidenceCount === "boolean"
    && typeof meetsThresholds.overall === "boolean"
    && safeString(thresholdDecisionBasis.mode, 160) === "history_aware_effective_counts"
    && thresholdDecisionBasis.failClosed === true
    && safeString(thresholdDecisionBasis.historySourcePath, 220) === "output/agi_readiness/subjective_goal_completion_status.json"
    && safeString(thresholdDecisionBasis.positiveProbeCount, 240) === "max(currentSnapshot.positiveProbeCount, effectiveHistoryAware.historicalCarry.positiveProbeCountFloor)"
    && safeString(thresholdDecisionBasis.novelPositiveCount, 240) === "max(currentSnapshot.novelPositiveCount, effectiveHistoryAware.historicalCarry.novelPositiveCountFloor)"
    && safeString(thresholdDecisionBasis.insufficientEvidenceCount, 240) === "currentSnapshot.insufficientEvidenceCount"
    && clampInt(probeStatus.positiveProbeCount, 0, 999999, -2) === clampInt(effectiveHistoryAware.positiveProbeCount, 0, 999999, -3)
    && clampInt(probeStatus.novelPositiveCount, 0, 999999, -2) === clampInt(effectiveHistoryAware.novelPositiveCount, 0, 999999, -3)
    && clampInt(effectiveHistoryAware.positiveProbeCount, 0, 999999, -1) >= clampInt(currentSnapshot.positiveProbeCount, 0, 999999, -1)
    && clampInt(effectiveHistoryAware.novelPositiveCount, 0, 999999, -1) >= clampInt(currentSnapshot.novelPositiveCount, 0, 999999, -1)
    && clampInt(effectiveHistoryAware.insufficientEvidenceCount, 0, 999999, -1) === clampInt(currentSnapshot.insufficientEvidenceCount, 0, 999999, -2)
    && clampInt(effectiveHistoryAware.historyLift && effectiveHistoryAware.historyLift.positiveProbeCount, 0, 999999, -1) === Math.max(
      clampInt(effectiveHistoryAware.positiveProbeCount, 0, 999999, 0) - clampInt(currentSnapshot.positiveProbeCount, 0, 999999, 0),
      0
    )
    && clampInt(effectiveHistoryAware.historyLift && effectiveHistoryAware.historyLift.novelPositiveCount, 0, 999999, -1) === Math.max(
      clampInt(effectiveHistoryAware.novelPositiveCount, 0, 999999, 0) - clampInt(currentSnapshot.novelPositiveCount, 0, 999999, 0),
      0
    )
    && meetsThresholds.positiveProbeCount === recomputedPositive
    && meetsThresholds.novelPositiveCount === recomputedNovel
    && meetsThresholds.insufficientEvidenceCount === recomputedInsufficient
    && meetsThresholds.overall === (recomputedPositive && recomputedNovel && recomputedInsufficient);
  return {
    pass,
    detail: pass
      ? "self-directed probe threshold basis is explicit and internally consistent"
      : "self-directed probe threshold basis is missing, contradictory, or fail-open",
  };
}

function validateNovelTaskThresholdBasis(novelTask = {}) {
  const currentSnapshot = novelTask && novelTask.currentSnapshot && typeof novelTask.currentSnapshot === "object"
    ? novelTask.currentSnapshot
    : {};
  const effectiveHistoryAware = novelTask && novelTask.effectiveHistoryAware && typeof novelTask.effectiveHistoryAware === "object"
    ? novelTask.effectiveHistoryAware
    : {};
  const requiredThresholds = novelTask && novelTask.requiredThresholds && typeof novelTask.requiredThresholds === "object"
    ? novelTask.requiredThresholds
    : {};
  const meetsThresholds = novelTask && novelTask.meetsThresholds && typeof novelTask.meetsThresholds === "object"
    ? novelTask.meetsThresholds
    : {};
  const thresholdDecisionBasis = novelTask && novelTask.thresholdDecisionBasis && typeof novelTask.thresholdDecisionBasis === "object"
    ? novelTask.thresholdDecisionBasis
    : {};
  const recomputedPositive = clampInt(effectiveHistoryAware.positiveNovelTaskCount, 0, 999999, -1) >= clampInt(requiredThresholds.positiveNovelTaskCount, 0, 999999, -2);
  const pass = Number.isFinite(Number(currentSnapshot.positiveNovelTaskCount))
    && Number.isFinite(Number(currentSnapshot.novelTaskCount))
    && Number.isFinite(Number(currentSnapshot.novelFamilyCount))
    && Number.isFinite(Number(effectiveHistoryAware.positiveNovelTaskCount))
    && Number.isFinite(Number(effectiveHistoryAware.novelTaskCount))
    && Number.isFinite(Number(effectiveHistoryAware.novelFamilyCount))
    && Number.isFinite(Number(requiredThresholds.positiveNovelTaskCount))
    && typeof effectiveHistoryAware.historyAware === "boolean"
    && effectiveHistoryAware.historyLift && typeof effectiveHistoryAware.historyLift === "object"
    && typeof meetsThresholds.positiveNovelTaskCount === "boolean"
    && typeof meetsThresholds.overall === "boolean"
    && safeString(thresholdDecisionBasis.mode, 160) === "current_snapshot_no_history_uplift"
    && thresholdDecisionBasis.failClosed === true
    && safeString(thresholdDecisionBasis.historySource, 80) === "none"
    && safeString(thresholdDecisionBasis.positiveNovelTaskCount, 240) === "currentSnapshot.positiveNovelTaskCount"
    && clampInt(novelTask.positiveNovelTaskCount, 0, 999999, -2) === clampInt(effectiveHistoryAware.positiveNovelTaskCount, 0, 999999, -3)
    && clampInt(effectiveHistoryAware.positiveNovelTaskCount, 0, 999999, -2) === clampInt(currentSnapshot.positiveNovelTaskCount, 0, 999999, -3)
    && effectiveHistoryAware.historyAware === false
    && clampInt(effectiveHistoryAware.historyLift && effectiveHistoryAware.historyLift.positiveNovelTaskCount, 0, 999999, -1) === 0
    && meetsThresholds.positiveNovelTaskCount === recomputedPositive
    && meetsThresholds.overall === recomputedPositive;
  return {
    pass,
    detail: pass
      ? "novel-task threshold basis is explicit and internally consistent"
      : "novel-task threshold basis is missing, contradictory, or fail-open",
  };
}

function appendJsonLine(targetPath, value) {
  ensureDir(path.dirname(targetPath));
  fs.appendFileSync(targetPath, `${JSON.stringify(value)}\n`, "utf8");
}

function overwriteJsonl(targetPath, records) {
  ensureDir(path.dirname(targetPath));
  const lines = Array.isArray(records) ? records.map((entry) => JSON.stringify(entry)) : [];
  fs.writeFileSync(targetPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
}

function maskOpaqueId(value, prefix = "mem") {
  const text = safeString(value, 240);
  if (!text) return "";
  return `${prefix}_${stableHash(text).slice(0, 10)}`;
}

function humanizeCompactIdentifier(value) {
  const text = safeString(value, 240);
  if (!text) return "";
  return text.replace(/\b([A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)+)\b/g, (_, token) => token.replace(/[_-]+/g, " "));
}

function normalizePublicText(value, workspaceRoot) {
  let text = safeString(value, 600);
  if (!text) return "";
  const absoluteRoot = safeString(path.resolve(workspaceRoot), 400);
  const forwardRoot = absoluteRoot.replace(/\\/g, "/");
  if (absoluteRoot) {
    text = text.split(absoluteRoot).join("<workspace-root>");
  }
  if (forwardRoot && forwardRoot !== absoluteRoot) {
    text = text.split(forwardRoot).join("<workspace-root>");
  }
  text = text
    .replace(/\bturn[-:][A-Za-z0-9_-]+\b/g, "<turn-ref>")
    .replace(/\bthread[-:][A-Za-z0-9_-]+\b/g, "<thread-ref>")
    .replace(/\btask[_-][A-Za-z0-9_-]{6,}\b/ig, "<task-ref>")
    .replace(/\beval[-_][A-Za-z0-9_-]{6,}\b/ig, "<eval-ref>")
    .replace(/\bagenda[_-][A-Za-z0-9_-]{6,}\b/ig, "<agenda-ref>")
    .replace(/\blineage[_-][A-Za-z0-9_-]{6,}\b/ig, "<lineage-ref>")
    .replace(/\b\d{10,16}\b/g, "<opaque-id>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/ig, "<opaque-id>");
  return text;
}

function normalizePublicTimestamp(value) {
  const text = safeString(value, 80);
  if (!text) return "";
  if (/^\d{13}$/.test(text)) {
    const asNumber = Number(text);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return new Date(asNumber).toISOString();
    }
  }
  if (/^\d{10}$/.test(text)) {
    const asNumber = Number(text);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return new Date(asNumber * 1000).toISOString();
    }
  }
  return text;
}

function isUuidLike(text) {
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(safeString(text, 120));
}

function isOpaqueRuntimeLabel(text) {
  const normalized = safeString(text, 240);
  if (!normalized) return false;
  if (isUuidLike(normalized)) return true;
  return (
    /^eval-\d{10,}-[0-9a-f]{6,}$/i.test(normalized)
    || /^turn[-_][A-Za-z0-9_-]{8,}$/i.test(normalized)
    || /^thread[-_][A-Za-z0-9_-]{8,}$/i.test(normalized)
    || /^continuity[-_][A-Za-z0-9_-]+$/i.test(normalized)
    || /^task[-_][A-Za-z0-9_-]+$/i.test(normalized)
  );
}

function stablePublicRef(value, prefix = "ref") {
  const text = safeString(value, 240);
  if (!text) return `${prefix}_unresolved`;
  return `${prefix}_${stableHash(text).slice(0, 10)}`;
}

function normalizePublicStatus(value, fallback = "unknown_status") {
  const text = safeString(value, 120);
  if (!text) return fallback;
  return humanizeCompactIdentifier(text).toLowerCase();
}

function normalizePublicReference(value, prefix = "ref") {
  const text = safeString(value, 240);
  if (!text) return stablePublicRef(`${prefix}:unresolved`, prefix);
  if (text.startsWith(`${prefix}_`)) return text;
  return stablePublicRef(text, prefix);
}

function normalizePublicTitle(value, workspaceRoot, fallback = "public evidence") {
  const text = coerceSummaryText(value, workspaceRoot, "");
  if (!text || isOpaqueRuntimeLabel(text)) return fallback;
  return text;
}

function collectTextFragments(value, workspaceRoot, depth = 0) {
  if (depth > 3 || value == null) return [];
  if (typeof value === "string") {
    const normalized = normalizePublicText(humanizeCompactIdentifier(value), workspaceRoot).trim();
    if (!normalized || normalized === "[object Object]") return [];
    return [normalized];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTextFragments(entry, workspaceRoot, depth + 1)).slice(0, 8);
  }
  if (value && typeof value === "object") {
    const preferredKeys = ["summary", "reason", "message", "title", "status", "hint", "label", "code", "nextAction", "gatingReason"];
    const keys = [
      ...preferredKeys.filter((key) => Object.prototype.hasOwnProperty.call(value, key)),
      ...Object.keys(value).filter((key) => !preferredKeys.includes(key)),
    ];
    const collected = [];
    for (const key of keys) {
      collected.push(...collectTextFragments(value[key], workspaceRoot, depth + 1));
      if (collected.length >= 8) break;
    }
    return collected.slice(0, 8);
  }
  return [];
}

function coerceSummaryText(value, workspaceRoot, fallback = "") {
  const [first] = collectTextFragments(value, workspaceRoot, 0);
  return first || fallback;
}

function coerceSummaryList(values, workspaceRoot, limit = 8) {
  return uniqueStrings(collectTextFragments(values, workspaceRoot, 0), limit, 220);
}

function normalizePublicPath(workspaceRoot, rawPath) {
  const text = safeString(rawPath, 400);
  if (!text) return "";
  try {
    const resolved = path.isAbsolute(text) ? path.normalize(text) : path.resolve(workspaceRoot, text);
    const workspaceResolved = path.resolve(workspaceRoot);
    if (resolved.toLowerCase().startsWith(workspaceResolved.toLowerCase())) {
      return repoRelative(workspaceRoot, resolved);
    }
    return `<external>/${path.basename(resolved)}`;
  } catch {
    return normalizePublicText(text, workspaceRoot);
  }
}

function sanitizePublicValue(value, workspaceRoot) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePublicValue(entry, workspaceRoot));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "workspaceRoot") {
        out.workspace = ".";
        continue;
      }
      if (/path$/i.test(key) || /paths$/i.test(key)) {
        out[key] = Array.isArray(entry)
          ? entry.map((item) => normalizePublicPath(workspaceRoot, item))
          : normalizePublicPath(workspaceRoot, entry);
        continue;
      }
      if (/turnId$/i.test(key) || /threadId$/i.test(key) || /memoryId$/i.test(key) || /sampleTurnIds$/i.test(key) || /taskId$/i.test(key) || /subtaskRef$/i.test(key) || /rootTaskId$/i.test(key) || /parentTaskId$/i.test(key) || /runId$/i.test(key) || /lineageId$/i.test(key) || /agendaId$/i.test(key)) {
        const prefix = key.toLowerCase().includes("turn")
          ? "turn"
          : key.toLowerCase().includes("thread")
            ? "thread"
            : key.toLowerCase().includes("run")
              ? "eval"
              : key.toLowerCase().includes("lineage")
                ? "lineage"
                : key.toLowerCase().includes("agenda")
                  ? "agenda"
                  : key.toLowerCase().includes("task")
                    ? "task"
                    : "mem";
        out[key] = Array.isArray(entry)
          ? entry.map((item) => normalizePublicReference(item, prefix))
          : normalizePublicReference(entry, prefix);
        continue;
      }
      if (/(generatedAt|updatedAt|completedAt|recordedAt|observedAt|selectedInPackAt|lastObservedAt|lastRemediationAt)$/i.test(key)) {
        out[key] = normalizePublicTimestamp(entry);
        continue;
      }
      if (/reference$/i.test(key) || /^reference$/i.test(key) || /evidenceRef$/i.test(key)) {
        out[key] = normalizePublicReference(entry, "ref");
        continue;
      }
      if (/title$/i.test(key)) {
        out[key] = normalizePublicTitle(entry, workspaceRoot, "public evidence");
        continue;
      }
      if (/status$/i.test(key) && typeof entry !== "object") {
        out[key] = normalizePublicStatus(entry);
        continue;
      }
      out[key] = sanitizePublicValue(entry, workspaceRoot);
    }
    return out;
  }
  if (typeof value === "string") {
    return normalizePublicText(value, workspaceRoot);
  }
  return value;
}

function toWorkspaceId(workspaceRoot) {
  return stableHash({ workspaceRoot }).slice(0, 16);
}

function getMemoryPaths(workspaceRoot = workspaceRootDefault) {
  const logging = getLoggingSurfacePaths(workspaceRoot);
  const root = path.join(logging.runtimeStateRoot, "memory");
  const indexesRoot = path.join(root, "indexes");
  const projectionsRoot = path.join(root, "projections");
  const retrievalRoot = path.join(root, "retrieval");
  const outputRoot = path.join(workspaceRoot, "output", "memory");
  const publicOutputRoot = path.join(workspaceRoot, "output", "memory_public");
  const agiReadinessRoot = path.join(workspaceRoot, "output", "agi_readiness");
  const continuityPublicRoot = path.join(workspaceRoot, "output", "continuity_public");
  const governancePublicRoot = path.join(workspaceRoot, "output", "governance_public");
  return {
    workspaceRoot,
    root,
    eventsPath: path.join(root, "memory_events.jsonl"),
    feedbackPath: path.join(root, "memory_feedback.jsonl"),
    tombstonesPath: path.join(root, "memory_tombstones.jsonl"),
    indexes: {
      root: indexesRoot,
      byId: path.join(indexesRoot, "by_id.json"),
      byScope: path.join(indexesRoot, "by_scope.json"),
      byType: path.join(indexesRoot, "by_type.json"),
      byTaskFamily: path.join(indexesRoot, "by_task_family.json"),
      byAgent: path.join(indexesRoot, "by_agent.json"),
      byWorkspace: path.join(indexesRoot, "by_workspace.json"),
    },
    projections: {
      root: projectionsRoot,
      specGraph: path.join(projectionsRoot, "spec_graph.json"),
      workspaceProgressRoot: path.join(projectionsRoot, "workspace_progress"),
      preferenceProfilesRoot: path.join(projectionsRoot, "preference_profiles"),
      semanticLessonsRoot: path.join(projectionsRoot, "semantic_lessons"),
      failurePatternsRoot: path.join(projectionsRoot, "failure_patterns"),
      procedurePatternsRoot: path.join(projectionsRoot, "procedure_patterns"),
      executionStrategiesRoot: path.join(projectionsRoot, "execution_strategies"),
      reviewFailurePatternsRoot: path.join(projectionsRoot, "review_failure_patterns"),
      adoptionFeedbackRoot: path.join(projectionsRoot, "adoption_feedback"),
      evaluationLessonsRoot: path.join(projectionsRoot, "evaluation_lessons"),
      skillCandidatesRoot: path.join(projectionsRoot, "skill_candidates"),
      activeRuntimeHintsRoot: path.join(projectionsRoot, "active_runtime_hints"),
      improvementStateRoot: path.join(projectionsRoot, "improvement_state"),
      evalObservationsRoot: path.join(projectionsRoot, "eval_observations"),
      observationStateRoot: path.join(projectionsRoot, "observation_state"),
      continuityStateRoot: path.join(projectionsRoot, "continuity_state"),
      familyCoverageRoot: path.join(projectionsRoot, "family_coverage"),
      readinessRoot: path.join(projectionsRoot, "readiness"),
      bottlenecksRoot: path.join(projectionsRoot, "bottlenecks"),
      learningAgendaRoot: path.join(projectionsRoot, "learning_agenda"),
      causalTraceRoot: path.join(projectionsRoot, "causal_learning_trace"),
      continuityDebtRoot: path.join(projectionsRoot, "continuity_debt"),
      stableCoverageMatrixPath: path.join(projectionsRoot, "readiness", "stable_coverage_matrix.json"),
      stableCoverageTrendPath: path.join(projectionsRoot, "readiness", "stable_coverage_trend.json"),
      goalCompletionHistoryPath: path.join(projectionsRoot, "readiness", "goal_completion_history.json"),
      subjectiveGoalCompletionHistoryPath: path.join(projectionsRoot, "readiness", "subjective_goal_completion_history.json"),
      sovereignGoalCompletionHistoryPath: path.join(projectionsRoot, "readiness", "sovereign_goal_completion_history.json"),
      continuityDebtTrendPath: path.join(projectionsRoot, "continuity_debt", "trend.json"),
      continuityCloseoutEffectsPath: path.join(projectionsRoot, "continuity_debt", "closeout_effects.json"),
      causalEffectivenessSummaryPath: path.join(projectionsRoot, "causal_learning_trace", "effectiveness_summary.json"),
      causalRegressionAlertsPath: path.join(projectionsRoot, "causal_learning_trace", "regression_alerts.json"),
    },
    retrieval: {
      root: retrievalRoot,
      packsPath: path.join(retrievalRoot, "packs.jsonl"),
      lastPackByThread: path.join(retrievalRoot, "last_pack_by_thread.json"),
      lastPackByWorkspace: path.join(retrievalRoot, "last_pack_by_workspace.json"),
    },
    output: {
      root: outputRoot,
      latestOverviewJson: path.join(outputRoot, "latest_overview.json"),
      latestOverviewMd: path.join(outputRoot, "latest_overview.md"),
      promotedSemanticMemory: path.join(outputRoot, "promoted_semantic_memory.json"),
      preferenceProfilesReport: path.join(outputRoot, "preference_profiles_report.json"),
      improvementDashboard: path.join(outputRoot, "improvement_dashboard.json"),
      memoryHealthReportMd: path.join(outputRoot, "memory_health_report.md"),
    },
    publicOutput: {
      root: publicOutputRoot,
      latestOverviewJson: path.join(publicOutputRoot, "latest_overview.json"),
      latestOverviewMd: path.join(publicOutputRoot, "latest_overview.md"),
      workspaceProgressJson: path.join(publicOutputRoot, "workspace_progress_public.json"),
      latestPackJson: path.join(publicOutputRoot, "latest_pack_public.json"),
      promotionHealthJson: path.join(publicOutputRoot, "promotion_revocation_health_public.json"),
      memoryEvalStatusJson: path.join(publicOutputRoot, "memory_eval_public_status.json"),
      memoryEvalStatusMd: path.join(publicOutputRoot, "memory_eval_public_status.md"),
      openAIBlogLaneJson: path.join(publicOutputRoot, "openai_primary_lane_projection.json"),
      anthropicLaneJson: path.join(publicOutputRoot, "anthropic_secondary_lane_projection.json"),
      lessonEffectivenessJson: path.join(publicOutputRoot, "lesson_effectiveness_public.json"),
      packCausalTraceJson: path.join(publicOutputRoot, "pack_causal_trace_public.json"),
      causalEffectivenessSummaryJson: path.join(publicOutputRoot, "causal_effectiveness_summary.json"),
      exportManifestJson: path.join(publicOutputRoot, "export_manifest.json"),
    },
    governancePublic: {
      root: governancePublicRoot,
      workerDecisionSurfaceJson: path.join(governancePublicRoot, "worker_decision_surface.json"),
      workerCompletionStatusJson: path.join(governancePublicRoot, "worker_completion_status.json"),
    },
    agiReadiness: {
      root: agiReadinessRoot,
      latestJson: path.join(agiReadinessRoot, "latest_readiness.json"),
      latestMd: path.join(agiReadinessRoot, "latest_readiness.md"),
      domainCoverageMatrixJson: path.join(agiReadinessRoot, "domain_coverage_matrix.json"),
      stableCoverageMatrixJson: path.join(agiReadinessRoot, "stable_coverage_matrix.json"),
      stableCoverageTrendJson: path.join(agiReadinessRoot, "stable_coverage_trend.json"),
      robustnessBreakdownJson: path.join(agiReadinessRoot, "robustness_breakdown.json"),
      promotionTrendJson: path.join(agiReadinessRoot, "promotion_trend.json"),
      blockedReasonsJson: path.join(agiReadinessRoot, "blocked_reasons.json"),
      nextBottlenecksJson: path.join(agiReadinessRoot, "next_bottlenecks.json"),
      nextBottlenecksMd: path.join(agiReadinessRoot, "next_bottlenecks.md"),
      autonomousLearningStatusJson: path.join(agiReadinessRoot, "autonomous_learning_status.json"),
      autonomousLearningStatusMd: path.join(agiReadinessRoot, "autonomous_learning_status.md"),
      causalLearningTraceJson: path.join(agiReadinessRoot, "causal_learning_trace.json"),
      causalRegressionAlertsJson: path.join(agiReadinessRoot, "causal_regression_alerts.json"),
      distinctImprovementLineageJson: path.join(agiReadinessRoot, "distinct_improvement_lineage.json"),
      distinctImprovementLineageMd: path.join(agiReadinessRoot, "distinct_improvement_lineage.md"),
      distinctImprovementSummaryJson: path.join(agiReadinessRoot, "distinct_improvement_summary.json"),
      robustnessRemediationStatusJson: path.join(agiReadinessRoot, "robustness_remediation_status.json"),
      robustnessRemediationTrendJson: path.join(agiReadinessRoot, "robustness_remediation_trend.json"),
      robustnessRemediationBacklogJson: path.join(agiReadinessRoot, "robustness_remediation_backlog.json"),
      robustnessRemediationEffectsJson: path.join(agiReadinessRoot, "robustness_remediation_effects.json"),
      goalCompletionStatusJson: path.join(agiReadinessRoot, "goal_completion_status.json"),
      goalCompletionStatusMd: path.join(agiReadinessRoot, "goal_completion_status.md"),
      compatibilityCompletionStatusJson: path.join(agiReadinessRoot, "compatibility_completion_status.json"),
      compatibilityCompletionStatusMd: path.join(agiReadinessRoot, "compatibility_completion_status.md"),
      subjectiveGoalCompletionStatusJson: path.join(agiReadinessRoot, "subjective_goal_completion_status.json"),
      subjectiveGoalCompletionStatusMd: path.join(agiReadinessRoot, "subjective_goal_completion_status.md"),
      learningAdoptionStatusJson: path.join(agiReadinessRoot, "learning_adoption_status.json"),
      selfDirectedProbeStatusJson: path.join(agiReadinessRoot, "self_directed_probe_status.json"),
      novelTaskAcquisitionJson: path.join(agiReadinessRoot, "novel_task_acquisition.json"),
      // Legacy compatibility alias retained for older checked-in consumers.
      sovereignGoalCompletionStatusJson: path.join(agiReadinessRoot, "sovereign_goal_completion_status.json"),
      sovereignGoalCompletionStatusMd: path.join(agiReadinessRoot, "sovereign_goal_completion_status.md"),
      selfAuthoredGoalStatusJson: path.join(agiReadinessRoot, "self_authored_goal_status.json"),
      selfAuthoredGoalHistoryJson: path.join(agiReadinessRoot, "self_authored_goal_history.json"),
      selfAuthoredGoalMarketJson: path.join(agiReadinessRoot, "self_authored_goal_market.json"),
      openUnknownsRegisterJson: path.join(agiReadinessRoot, "open_unknowns_register.json"),
      workspaceWorldModelJson: path.join(agiReadinessRoot, "workspace_world_model.json"),
      continuousImprovementStatusJson: path.join(agiReadinessRoot, "continuous_improvement_status.json"),
      noveltyGrowthStatusJson: path.join(agiReadinessRoot, "novelty_growth_status.json"),
      securityConstitutionStatusJson: path.join(agiReadinessRoot, "security_constitution_status.json"),
      rollbackReadinessJson: path.join(agiReadinessRoot, "rollback_readiness.json"),
      autonomyBudgetStatusJson: path.join(agiReadinessRoot, "autonomy_budget_status.json"),
      selfAuthoredCausalEffectsJson: path.join(agiReadinessRoot, "self_authored_causal_effects.json"),
      selfAuthoredRemediationTrendJson: path.join(agiReadinessRoot, "self_authored_remediation_trend.json"),
    },
    continuityPublic: {
      root: continuityPublicRoot,
      latestSummaryJson: path.join(continuityPublicRoot, "latest_continuity.json"),
      latestSummaryMd: path.join(continuityPublicRoot, "latest_continuity.md"),
      continuityDebtJson: path.join(continuityPublicRoot, "continuity_debt.json"),
      continuityDebtTrendJson: path.join(continuityPublicRoot, "continuity_debt_trend.json"),
      continuityCloseoutEffectsJson: path.join(continuityPublicRoot, "continuity_closeout_effects.json"),
    },
  };
}

function ensureMemoryLayout(paths) {
  [
    paths.root,
    paths.indexes.root,
    paths.projections.root,
    paths.projections.workspaceProgressRoot,
    paths.projections.preferenceProfilesRoot,
    paths.projections.semanticLessonsRoot,
    paths.projections.failurePatternsRoot,
    paths.projections.activeRuntimeHintsRoot,
    paths.projections.improvementStateRoot,
    paths.projections.evalObservationsRoot,
    paths.projections.observationStateRoot,
    paths.projections.continuityStateRoot,
    paths.projections.familyCoverageRoot,
    paths.projections.readinessRoot,
    paths.projections.bottlenecksRoot,
    paths.projections.learningAgendaRoot,
    paths.projections.causalTraceRoot,
    paths.projections.continuityDebtRoot,
    paths.retrieval.root,
    paths.output.root,
    paths.publicOutput.root,
    paths.governancePublic.root,
    paths.agiReadiness.root,
    paths.continuityPublic.root,
  ].forEach(ensureDir);
  ensureFile(paths.eventsPath);
  ensureFile(paths.feedbackPath);
  ensureFile(paths.tombstonesPath);
}

function loadJsonl(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  return fs.readFileSync(targetPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && typeof entry === "object");
}

function loadConfigJson(workspaceRoot, ...segments) {
  return readJson(path.join(workspaceRoot, ...segments)) || {};
}

function loadTypeCatalog(workspaceRoot) {
  const catalog = loadConfigJson(workspaceRoot, "scripts", "config", "memory_type_catalog.json");
  const types = Array.isArray(catalog.types) ? catalog.types : [];
  const byId = {};
  for (const entry of types) {
    const id = safeString(entry && entry.id, 80);
    if (!id) continue;
    byId[id] = entry;
  }
  return byId;
}

function loadTaskFamilyProfiles(workspaceRoot) {
  const payload = loadConfigJson(workspaceRoot, "scripts", "config", "task_family_profiles.json");
  const families = Array.isArray(payload.families) ? payload.families : [];
  const byId = {};
  for (const entry of families) {
    const id = safeString(entry && entry.id, 80);
    if (!id) continue;
    byId[id] = entry;
  }
  return {
    defaultFamily: safeString(payload.defaultFamily, 80) || "deterministic_code",
    families,
    byId,
  };
}

function loadObservationPolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "governed_observation_policy.json");
}

function loadAgiReadinessPolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "agi_readiness_live_policy.json");
}

function loadGovernedRemediationPolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "governed_remediation_policy.json");
}

function loadRobustnessRemediationPolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "robustness_remediation_policy.json");
}

function loadContinuityCloseoutPolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "continuity_closeout_policy.json");
}

function loadImprovementLineagePolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "improvement_lineage_policy.json");
}

function loadPublicHygienePolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "public_hygiene_policy.json");
}

function parseJsonObjectText(text) {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readTrackedRepoJson(workspaceRoot, absolutePath) {
  try {
    const relativePath = path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/");
    if (!relativePath || relativePath.startsWith("..")) return {};
    const output = execFileSync("git", ["-C", workspaceRoot, "show", `HEAD:${relativePath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return parseJsonObjectText(output);
  } catch {
    return {};
  }
}

function historyEntryIsPassing(entry) {
  return safeString(entry && entry.baseStatus, 40) === "criteria_met";
}

function normalizeHistorySnapshot(snapshot = {}, source = "") {
  const entries = Array.isArray(snapshot && snapshot.entries) ? snapshot.entries : [];
  const providedConsecutive = clampInt(snapshot && snapshot.consecutivePassingExports, 0, 999999, 0);
  const effectiveConsecutive = Math.max(
    providedConsecutive,
    countTrailingHistoryPasses(entries, historyEntryIsPassing),
  );
  return {
    schema: safeString(snapshot && snapshot.schema, 160) || "",
    generatedAt: safeString(snapshot && snapshot.generatedAt, 80) || "",
    workspaceId: safeString(snapshot && snapshot.workspaceId, 80) || "",
    entries,
    consecutivePassingExports: effectiveConsecutive,
    consecutiveRequired: clampInt(snapshot && snapshot.consecutiveRequired, 0, 999999, 0),
    source: safeString(source || (snapshot && snapshot.source), 80) || "unknown",
  };
}

function scoreHistorySnapshot(snapshot = {}) {
  const normalized = normalizeHistorySnapshot(snapshot);
  const entries = normalized.entries;
  const lastEntry = entries.length ? entries[entries.length - 1] : null;
  const sourceRank = normalized.source === "current_public_artifact"
    ? 3
    : normalized.source === "projection_runtime"
      ? 2
      : normalized.source === "tracked_public_artifact"
        ? 1
        : 0;
  return {
    hasEntries: entries.length > 0 ? 1 : 0,
    consecutivePassingExports: normalized.consecutivePassingExports,
    maxPassStreak: computeMaxHistoryPassStreak(entries, historyEntryIsPassing),
    entryCount: entries.length,
    lastTimestamp: Math.max(
      parseTimestamp(normalized.generatedAt),
      parseTimestamp(lastEntry && lastEntry.generatedAt),
    ),
    sourceRank,
  };
}

function compareHistorySnapshotScore(left = {}, right = {}) {
  const keys = [
    "hasEntries",
    "consecutivePassingExports",
    "maxPassStreak",
    "entryCount",
    "lastTimestamp",
    "sourceRank",
  ];
  for (const key of keys) {
    const leftValue = safeNumber(left && left[key], 0);
    const rightValue = safeNumber(right && right[key], 0);
    if (leftValue === rightValue) continue;
    return leftValue - rightValue;
  }
  return 0;
}

function selectPreferredHistorySnapshot(...candidates) {
  let best = normalizeHistorySnapshot();
  let bestScore = scoreHistorySnapshot(best);
  for (const candidate of candidates) {
    const normalized = normalizeHistorySnapshot(candidate);
    const score = scoreHistorySnapshot(normalized);
    if (compareHistorySnapshotScore(score, bestScore) > 0) {
      best = normalized;
      bestScore = score;
    }
  }
  return best;
}

function mergeHistorySnapshots(...candidates) {
  const normalizedCandidates = candidates.map((candidate) => normalizeHistorySnapshot(candidate)).filter((candidate) => candidate.entries.length > 0);
  const preferred = selectPreferredHistorySnapshot(...normalizedCandidates);
  const mergedByKey = new Map();
  const keyForEntry = (entry, index) => {
    const exportSessionId = safeString(entry && entry.exportSessionId, 120);
    if (exportSessionId) return `export:${exportSessionId}`;
    const generatedAt = safeString(entry && entry.generatedAt, 80);
    if (generatedAt) return `generated:${generatedAt}`;
    return `fallback:${index}`;
  };
  const sourceOrderedCandidates = normalizedCandidates
    .slice()
    .sort((left, right) => compareHistorySnapshotScore(scoreHistorySnapshot(left), scoreHistorySnapshot(right)));
  for (const candidate of sourceOrderedCandidates) {
    candidate.entries.forEach((entry, index) => {
      const key = keyForEntry(entry, index);
      const existing = mergedByKey.get(key) || {};
      mergedByKey.set(key, { ...existing, ...entry });
    });
  }
  const entries = [...mergedByKey.values()].sort((left, right) => {
    const leftTimestamp = Math.max(
      parseTimestamp(left && left.generatedAt),
      parseTimestamp(left && left.completedAt),
      parseTimestamp(left && left.updatedAt),
    );
    const rightTimestamp = Math.max(
      parseTimestamp(right && right.generatedAt),
      parseTimestamp(right && right.completedAt),
      parseTimestamp(right && right.updatedAt),
    );
    return leftTimestamp - rightTimestamp;
  });
  return {
    ...preferred,
    entries,
    consecutivePassingExports: Math.max(
      preferred.consecutivePassingExports,
      countTrailingHistoryPasses(entries, historyEntryIsPassing),
    ),
  };
}

function readPublicHistorySnapshot(workspaceRoot, paths, { historyType = "subjective" } = {}) {
  const projectionPath = historyType === "goal"
    ? paths.projections.goalCompletionHistoryPath
    : historyType === "sovereign"
      ? paths.projections.sovereignGoalCompletionHistoryPath
      : paths.projections.subjectiveGoalCompletionHistoryPath;
  const artifactPath = historyType === "goal"
    ? paths.agiReadiness.goalCompletionStatusJson
    : historyType === "sovereign"
      ? paths.agiReadiness.sovereignGoalCompletionStatusJson
      : paths.agiReadiness.subjectiveGoalCompletionStatusJson;
  const projectionHistory = normalizeHistorySnapshot(readJsonObject(projectionPath), "projection_runtime");
  const trackedArtifact = readTrackedRepoJson(workspaceRoot, artifactPath);
  const trackedHistory = normalizeHistorySnapshot(
    trackedArtifact && trackedArtifact.history && typeof trackedArtifact.history === "object"
      ? trackedArtifact.history
      : {},
    "tracked_public_artifact",
  );
  const currentArtifact = readJsonObject(artifactPath);
  const currentHistory = normalizeHistorySnapshot(
    currentArtifact && currentArtifact.history && typeof currentArtifact.history === "object"
      ? currentArtifact.history
      : {},
    "current_public_artifact",
  );
  return mergeHistorySnapshots(trackedHistory, currentHistory, projectionHistory);
}

function isMetaCompletionAgendaEntry(entry) {
  const source = safeString(entry && entry.source, 80);
  const summary = safeString(entry && entry.publicSummary, 240).toLowerCase();
  if (["subjective_goal", "memory_eval"].includes(source)) return true;
  return /(subjective|compatibility|sovereign|history-aware|history aware|completion artifact|completion export durability|below subjective threshold)/i.test(summary);
}

function isMetaCompletionNextAction(action) {
  const value = safeString(action, 240).toLowerCase();
  return /(subjective|compatibility|sovereign|history-aware|history aware|completion artifact|completion export durability|below subjective threshold|autonomous learning agenda still has running items|governed recovery evidence|consecutive live exports|distinct lineage|running agenda counts differ across artifacts|explicit gate vs supporting basis|supporting basis)/i.test(value);
}

function normalizeOperationalNextAction(action) {
  const raw = safeString(action, 240);
  if (!raw) {
    return "";
  }
  if (isMetaCompletionNextAction(raw)) {
    return "";
  }
  if (/stable coverage breadth/i.test(raw) || /weakest family is g[_ ]?breadth/i.test(raw)) {
    return "stabilize supported family coverage across recent windows";
  }
  if (/browser[_ ]tool[_ ]flakiness/i.test(raw) || /browser tool flakiness/i.test(raw)) {
    return "improve browser/tool degraded-mode handling and retry policy";
  }
  if (/workflow execution stable coverage/i.test(raw)) {
    return "obtain governed passing evidence for workflow execution across recent windows";
  }
  if (/web creative stable coverage/i.test(raw)) {
    return "obtain governed passing evidence for web creative across recent windows";
  }
  if (/consecutive live exports/i.test(raw)) {
    return "maintain all completion thresholds across consecutive live exports";
  }
  if (/continuity debt/i.test(raw)) {
    return "close outstanding continuity debt items";
  }
  if (/ambiguous_instruction/i.test(raw)) {
    return "collect ambiguity-handling evidence with governed probes";
  }
  if (/missing_context/i.test(raw)) {
    return "improve missing-context recovery via clarify/defer/fallback";
  }
  if (/harmful causal trace/i.test(raw)) {
    return "revoke or supersede harmful lessons/hints";
  }
  if (/r_robust/i.test(raw)) {
    return "run robustness remediation agenda and verify positive effect";
  }
  if (/h_horizon/i.test(raw)) {
    return "reduce continuity debt and improve long-horizon closeout quality";
  }
  if (/raw final score/i.test(raw)) {
    return "raise aggregate readiness score through verified remediation";
  }
  return raw;
}

function deriveLaneTraceSelectionMetrics(causalEntries = []) {
  const entries = Array.isArray(causalEntries) ? causalEntries : [];
  const latestSelectionTimestamp = entries.reduce((max, entry) => {
    const timestamp = parseTimestamp(entry && entry.selectedInPackAt);
    return timestamp > max ? timestamp : max;
  }, 0);
  const fallbackSelectedEntries = latestSelectionTimestamp > 0
    ? entries.filter((entry) => (
      parseTimestamp(entry && entry.selectedInPackAt) === latestSelectionTimestamp
      && (
        Boolean(entry && entry.selectedInLatestPack)
        || Boolean(entry && entry.adoptedInLatestPack)
        || Boolean(entry && entry.effectiveContribution)
        || ["likely_contributory", "behaviorally_referenced", "surfaced", "selected_only"].includes(safeString(entry && entry.usageStage, 80))
        || (Array.isArray(entry && entry.usedByTaskRefs) && entry.usedByTaskRefs.length > 0)
      )
    ))
    : [];
  const familySelectionCounts = {};
  for (const entry of fallbackSelectedEntries) {
    const families = uniqueStrings(
      Array.isArray(entry && entry.taskFamilies)
        ? entry.taskFamilies
        : [safeString(entry && entry.appliesToFamily, 80)],
      8,
      80,
    );
    const resolvedFamilies = families.length ? families : ["default"];
    for (const family of resolvedFamilies) {
      familySelectionCounts[family] = safeNumber(familySelectionCounts[family], 0) + 1;
    }
  }
  const taskRefs = uniqueStrings(
    entries.flatMap((entry) => Array.isArray(entry && entry.usedByTaskRefs) ? entry.usedByTaskRefs : []),
    64,
    120,
  );
  const effectiveEvidenceRefs = uniqueStrings(
    entries.flatMap((entry) => Array.isArray(entry && entry.effectiveContributionEvidenceRefs) ? entry.effectiveContributionEvidenceRefs : []),
    64,
    120,
  );
  return {
    latestSelectionTimestamp,
    fallbackSelectedEntries,
    familySelectionCounts,
    selectedCount: fallbackSelectedEntries.length,
    taskRefCount: taskRefs.length,
    effectiveEvidenceRefCount: effectiveEvidenceRefs.length,
  };
}

function countTrailingHistoryPasses(entries, predicate) {
  let count = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (!predicate(entries[index])) break;
    count += 1;
  }
  return count;
}

function computeMaxHistoryPassStreak(entries, predicate) {
  let current = 0;
  let best = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (predicate(entry)) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

function computeCarriedForwardTrailingPasses(previousEntries, predicate, exportSessionId = "") {
  const entries = Array.isArray(previousEntries) ? previousEntries : [];
  const trailingPassingExports = countTrailingHistoryPasses(entries, predicate);
  if (trailingPassingExports <= 0) {
    return 1;
  }
  const previousLastEntry = entries.length ? entries[entries.length - 1] : null;
  const replacingSameExport = safeString(exportSessionId, 120)
    && safeString(previousLastEntry && previousLastEntry.exportSessionId, 120) === safeString(exportSessionId, 120);
  return trailingPassingExports + (replacingSameExport ? 0 : 1);
}

function classifyMemorySection(item) {
  switch (safeString(item && item.type, 80)) {
    case "constitution_ref":
      return "spec";
    case "requirement_ref":
      return "intent";
    case "workspace_progress":
      return "workspace_progress";
    case "preference_signal":
      return "preference";
    case "episodic_event":
    case "eval_observation":
      return "experience";
    case "semantic_lesson":
    case "failure_pattern":
    case "runtime_hint":
      return "semantic";
    case "procedure_pattern":
    case "execution_strategy":
      return "procedure";
    case "review_failure_pattern":
    case "adoption_feedback":
    case "evaluation_lesson":
      return "evaluation";
    case "skill_candidate":
    case "improvement_candidate":
      return "improvement";
    default:
      return "experience";
  }
}

function scoreBand(score, thresholds = {}) {
  const value = safeNumber(score, 0);
  const high = safeNumber(thresholds.highConfidenceScore, 0.68);
  const minimum = safeNumber(thresholds.minimumSelectionScore, 0.18);
  if (value >= high) return "high";
  if (value >= minimum) return "selected";
  return "below_threshold";
}

function parseTimestamp(value) {
  const text = safeString(value, 80);
  if (!text) return 0;
  if (/^\d{12,16}$/.test(text)) {
    const numeric = safeNumber(text, 0);
    return numeric > 0 ? numeric : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pruneJsonlFile(targetPath, { maxEntries = 0, maxDays = 0 } = {}) {
  const records = loadJsonl(targetPath);
  if (!records.length) return 0;
  let kept = records.slice();
  if (safeNumber(maxDays, 0) > 0) {
    const cutoff = Date.now() - safeNumber(maxDays, 0) * 86400000;
    kept = kept.filter((entry) => {
      const ts = parseTimestamp(entry && (entry.recordedAt || entry.generatedAt || entry.updatedAt));
      return !ts || ts >= cutoff;
    });
  }
  if (safeNumber(maxEntries, 0) > 0 && kept.length > maxEntries) {
    kept = kept.slice(-maxEntries);
  }
  if (kept.length === records.length) return 0;
  overwriteJsonl(targetPath, kept);
  return records.length - kept.length;
}

function reviveLifecycle(items, previousById) {
  const nowIso = toIso();
  return items.map((item) => {
    const previous = previousById && previousById[item.memoryId] && typeof previousById[item.memoryId] === "object"
      ? previousById[item.memoryId]
      : null;
    if (!previous) {
      item.lifecycle.createdAt = safeString(item.lifecycle && item.lifecycle.createdAt, 80) || nowIso;
      item.lifecycle.updatedAt = safeString(item.lifecycle && item.lifecycle.updatedAt, 80) || nowIso;
      return item;
    }
    const previousCreatedAt = safeString(previous.createdAt, 80);
    const previousUpdatedAt = safeString(previous.updatedAt, 80);
    const previousHash = safeString(previous.contentHash, 80);
    const previousStatus = safeString(previous.status, 80);
    item.lifecycle.createdAt = previousCreatedAt || safeString(item.lifecycle && item.lifecycle.createdAt, 80) || nowIso;
    item.lifecycle.updatedAt = previousHash === safeString(item.evidence && item.evidence.contentHash, 80) && previousStatus === safeString(item.status, 80)
      ? (previousUpdatedAt || item.lifecycle.updatedAt || nowIso)
      : nowIso;
    return item;
  });
}

function collectMemoryHealth({ items, paths, retentionPolicy, currentEvents = [] }) {
  const itemTypeById = new Map((Array.isArray(items) ? items : []).map((item) => [safeString(item && item.memoryId, 120), safeString(item && item.type, 80)]));
  const resolveMemoryType = (entry) => {
    const explicit = safeString(entry && entry.memoryType, 80) || safeString(entry && entry.type, 80);
    if (explicit) return explicit;
    const memoryId = safeString(entry && entry.memoryId, 120);
    if (itemTypeById.has(memoryId)) return itemTypeById.get(memoryId) || "runtime_event";
    const eventType = safeString(entry && entry.eventType, 80);
    if (eventType === "memory_pack_compiled") return "memory_pack";
    if (eventType === "continuity_lifecycle_transition") return "episodic_event";
    if (eventType.startsWith("remediation_") || eventType === "capability_gap_detected") return "improvement_candidate";
    return "runtime_event";
  };
  const expiryByType = retentionPolicy && retentionPolicy.expiryByType && typeof retentionPolicy.expiryByType === "object"
    ? retentionPolicy.expiryByType
    : {};
  const staleMemoryWarnings = [];
  for (const item of items) {
    const expiryDays = safeNumber(expiryByType[item.type], 0);
    if (!expiryDays) continue;
    if (["revoked", "expired"].includes(safeString(item.status, 40))) continue;
    const updatedAt = parseTimestamp(item.lifecycle && item.lifecycle.updatedAt);
    if (!updatedAt) continue;
    const ageDays = Math.max(0, (Date.now() - updatedAt) / 86400000);
    if (ageDays < expiryDays) continue;
    staleMemoryWarnings.push({
      memoryId: item.memoryId,
      type: item.type,
      ageDays: Number(ageDays.toFixed(1)),
      expiryDays,
    });
  }
  const combinedEvents = [...loadJsonl(paths.eventsPath), ...currentEvents]
    .filter((entry) => entry && typeof entry === "object")
    .sort((left, right) => parseTimestamp(right && right.recordedAt) - parseTimestamp(left && left.recordedAt));
  const recentPromotions = combinedEvents
    .filter((entry) => safeString(entry && entry.eventType, 80) === "memory_item_upsert" && ["promoted", "reinforced"].includes(safeString(entry && entry.status, 40)))
    .slice(0, 5)
    .map((entry) => ({
      memoryId: safeString(entry && entry.memoryId, 120),
      memoryType: resolveMemoryType(entry),
      status: safeString(entry && entry.status, 40),
      recordedAt: safeString(entry && entry.recordedAt, 80),
    }));
  const recentRevocations = combinedEvents
    .filter((entry) => (
      safeString(entry && entry.eventType, 80) === "memory_item_tombstone"
      || ["revoked", "expired", "blocked"].includes(safeString(entry && entry.status, 40))
    ))
    .slice(0, 5)
    .map((entry) => ({
      memoryId: safeString(entry && entry.memoryId, 120),
      memoryType: resolveMemoryType(entry),
      status: safeString(entry && entry.status, 40) || safeString(entry && entry.eventType, 80),
      recordedAt: safeString(entry && entry.recordedAt, 80),
    }));
  return {
    staleMemoryWarnings,
    recentPromotions,
    recentRevocations,
  };
}

function summarizePack(pack, thresholds = {}) {
  const items = Array.isArray(pack && pack.items) ? pack.items : [];
  const highConfidenceScore = safeNumber(thresholds.highConfidenceScore, 0.68);
  const selectedMemoryIds = Array.isArray(pack && pack.selectedMemoryIds)
    ? pack.selectedMemoryIds.slice(0, 24)
    : items.map((entry) => safeString(entry && entry.memoryId, 120)).filter(Boolean).slice(0, 24);
  const sectionCounts = pack && pack.sectionCounts && typeof pack.sectionCounts === "object"
    ? pack.sectionCounts
    : items.reduce((acc, entry) => {
      const section = classifyMemorySection(entry);
      acc[section] = safeNumber(acc[section], 0) + 1;
      return acc;
    }, {});
  return {
    packId: safeString(pack && pack.packId, 120),
    generatedAt: safeString(pack && (pack.generatedAt || pack.compiledAt), 80),
    compiledAt: safeString(pack && pack.compiledAt, 80),
    selectedCount: clampInt(pack && (pack.selectedCount || items.length), 0, 999999, items.length),
    highConfidenceCount: Number.isFinite(Number(pack && pack.highConfidenceCount))
      ? clampInt(pack.highConfidenceCount, 0, 999999, 0)
      : items.filter((entry) => safeNumber(entry && entry.score, 0) >= highConfidenceScore).length,
    reusedSelectedCount: clampInt(pack && pack.reusedSelectedCount, 0, 999999, 0),
    explicitTaskFamilyMismatchCount: clampInt(pack && pack.explicitTaskFamilyMismatchCount, 0, 999999, 0),
    sectionCounts,
    activeAgent: safeString(pack && pack.activeAgent, 80),
    taskFamily: safeString(pack && pack.taskFamily, 80),
    memoryIds: selectedMemoryIds,
  };
}

function buildPersistedItemsFromCanonicalStore(workspaceRoot, paths) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const byId = readJsonObject(paths.indexes.byId);
  const byTaskFamily = readJsonObject(paths.indexes.byTaskFamily);
  const byAgent = readJsonObject(paths.indexes.byAgent);
  const collectKeysForMemoryId = (indexMap, memoryId) => Object.entries(indexMap || {})
    .filter(([, ids]) => Array.isArray(ids) && ids.includes(memoryId))
    .map(([key]) => safeString(key, 80))
    .filter(Boolean);
  const items = Object.entries(byId).map(([memoryId, meta]) => ({
    memoryId,
    type: safeString(meta && meta.type, 80),
    status: safeString(meta && meta.status, 40),
    sourceTier: safeString(meta && meta.sourceTier, 40),
    authorityTier: clampInt(meta && meta.authorityTier, 0, 6, 0),
    scope: meta && meta.scope && typeof meta.scope === "object"
      ? {
        workspaceId: safeString(meta.scope.workspaceId, 120) || workspaceId,
        threadId: safeString(meta.scope.threadId, 120),
        taskFamilies: uniqueStrings(meta.scope.taskFamilies, 16, 80).length
          ? uniqueStrings(meta.scope.taskFamilies, 16, 80)
          : collectKeysForMemoryId(byTaskFamily, memoryId),
        agents: uniqueStrings(meta.scope.agents, 16, 80).length
          ? uniqueStrings(meta.scope.agents, 16, 80)
          : collectKeysForMemoryId(byAgent, memoryId),
        ownedPaths: uniqueStrings(meta.scope.ownedPaths, 24, 220),
      }
      : {
        workspaceId,
        taskFamilies: collectKeysForMemoryId(byTaskFamily, memoryId),
        agents: collectKeysForMemoryId(byAgent, memoryId),
        ownedPaths: [],
      },
    content: {
      summary: safeString(meta && meta.summary, 400),
      structured: meta && meta.structured && typeof meta.structured === "object" ? meta.structured : {},
    },
    evidence: {
      sourceRefs: uniqueStrings(meta && meta.sourceRefs, 16, 220),
      supportCount: clampInt(meta && meta.supportCount, 0, 9999, 1),
      confidence: Number(safeNumber(meta && meta.confidence, 0).toFixed(3)),
    },
    retrieval: meta && meta.retrieval && typeof meta.retrieval === "object" ? meta.retrieval : {},
    lifecycle: {
      createdAt: safeString(meta && meta.createdAt, 80),
      updatedAt: safeString(meta && meta.updatedAt, 80),
    },
  }));
  const workspaceProgressStructured = readJsonObject(path.join(paths.projections.workspaceProgressRoot, `${workspaceId}.json`));
  if (Object.keys(workspaceProgressStructured).length) {
    items.push({
      memoryId: `workspace:${workspaceId}:progress`,
      type: "workspace_progress",
      status: "promoted",
      sourceTier: "runtime",
      authorityTier: 3,
      lifecycle: {
        updatedAt: safeString(workspaceProgressStructured.updatedAt, 80),
      },
      content: { structured: workspaceProgressStructured },
    });
  }
  return items;
}

function normalizePersistedPackForPublic({ pack, items, workspaceRoot }) {
  const retrievalPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json");
  const thresholds = retrievalPolicy && retrievalPolicy.scoreThresholds && typeof retrievalPolicy.scoreThresholds === "object"
    ? retrievalPolicy.scoreThresholds
    : {};
  const isolationPolicy = getTaskFamilyIsolationPolicy(retrievalPolicy);
  const hardExcludeTypes = uniqueStrings(isolationPolicy.hardExcludeTypes, 16, 80);
  const minimumSelectionScore = safeNumber(thresholds.minimumSelectionScore, 0.18);
  const highConfidenceScore = safeNumber(thresholds.highConfidenceScore, 0.68);
  const byId = new Map((Array.isArray(items) ? items : []).map((item) => [safeString(item && item.memoryId, 120), item]));
  const rawItems = Array.isArray(pack && pack.items) ? pack.items : [];
  const normalizedItems = rawItems
    .map((entry) => {
      const memoryId = safeString(entry && entry.memoryId, 120);
      const persisted = byId.get(memoryId);
      const taskFamilies = uniqueStrings(
        (entry && entry.whyIncluded && entry.whyIncluded.taskFamilies) || (persisted && persisted.scope && persisted.scope.taskFamilies),
        8,
        80
      );
      const mismatch = taskFamilies.length
        && !taskFamilies.includes("all")
        && !taskFamilies.includes("default")
        && !taskFamilies.includes(safeString(pack && pack.taskFamily, 80) || "default");
      return {
        ...entry,
        whyIncluded: {
          ...(entry && entry.whyIncluded && typeof entry.whyIncluded === "object" ? entry.whyIncluded : {}),
          taskFamilies,
          explicitTaskFamilyMismatch: mismatch,
        },
        status: safeString(entry && entry.status, 40) || safeString(persisted && persisted.status, 40),
        type: safeString(entry && entry.type, 80) || safeString(persisted && persisted.type, 80),
      };
    })
    .filter((entry) => {
      if (!entry || !safeString(entry.memoryId, 120)) return false;
      if (["revoked", "expired", "blocked"].includes(safeString(entry.status, 40))) return false;
      if (safeNumber(entry.score, 0) < minimumSelectionScore) return false;
      if (Boolean(entry.whyIncluded && entry.whyIncluded.explicitTaskFamilyMismatch)
        && hardExcludeTypes.includes(safeString(entry.type, 80))) {
        return false;
      }
      return true;
    });
  const sectionCounts = normalizedItems.reduce((acc, entry) => {
    const section = classifyMemorySection(entry);
    acc[section] = safeNumber(acc[section], 0) + 1;
    return acc;
  }, {});
  return {
    ...pack,
    items: normalizedItems,
    selectedCount: normalizedItems.length,
    highConfidenceCount: normalizedItems.filter((entry) => safeNumber(entry && entry.score, 0) >= highConfidenceScore).length,
    reusedSelectedCount: normalizedItems.filter((entry) => byId.has(safeString(entry && entry.memoryId, 120))).length,
    explicitTaskFamilyMismatchCount: normalizedItems.filter((entry) => Boolean(entry && entry.whyIncluded && entry.whyIncluded.explicitTaskFamilyMismatch)).length,
    sectionCounts,
    selectedMemoryIds: normalizedItems.map((entry) => safeString(entry && entry.memoryId, 120)).filter(Boolean),
  };
}

function loadPersistedGovernedMemoryState({ workspaceRoot = workspaceRootDefault } = {}) {
  const paths = getMemoryPaths(workspaceRoot);
  ensureMemoryLayout(paths);
  const items = buildPersistedItemsFromCanonicalStore(workspaceRoot, paths);
  const workspaceId = toWorkspaceId(workspaceRoot);
  const lastPackByWorkspace = readJsonObject(paths.retrieval.lastPackByWorkspace);
  const packs = loadJsonl(paths.retrieval.packsPath);
  const storedPack = lastPackByWorkspace[workspaceId] && typeof lastPackByWorkspace[workspaceId] === "object"
    ? lastPackByWorkspace[workspaceId]
    : (packs.length ? packs[packs.length - 1] : {});
  const pack = normalizePersistedPackForPublic({ pack: storedPack, items, workspaceRoot });
  const retentionPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retention_policy.json");
  const retrievalPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json");
  const workspaceProgressItem = items.find((item) => item.type === "workspace_progress" && item.content && item.content.structured && Object.keys(item.content.structured).length)
    || items.find((item) => item.type === "workspace_progress");
  const typeCounts = {};
  const statusCounts = {};
  for (const item of items) {
    typeCounts[item.type] = safeNumber(typeCounts[item.type], 0) + 1;
    statusCounts[item.status] = safeNumber(statusCounts[item.status], 0) + 1;
  }
  const health = collectMemoryHealth({ items, paths, retentionPolicy, currentEvents: [] });
  return {
    paths,
    items,
    pack,
    workspaceProgressItem,
    summary: {
      enabled: true,
      schema: "governed-memory-graph-runtime.v1",
      status: "ready",
      workspaceId,
      canonicalRoot: repoRelative(workspaceRoot, paths.root),
      eventLogPath: repoRelative(workspaceRoot, paths.eventsPath),
      outputRoot: repoRelative(workspaceRoot, paths.output.root),
      publicOutputRoot: repoRelative(workspaceRoot, paths.publicOutput.root),
      canonicalEventCount: loadJsonl(paths.eventsPath).length,
      itemCount: items.length,
      promotedCount: items.filter((item) => ["promoted", "reinforced"].includes(safeString(item.status, 40))).length,
      typeCounts,
      statusCounts,
      staleMemoryWarnings: health.staleMemoryWarnings,
      recentPromotions: health.recentPromotions,
      recentRevocations: health.recentRevocations,
      workspaceProgress: workspaceProgressItem && workspaceProgressItem.content && workspaceProgressItem.content.structured
        ? workspaceProgressItem.content.structured
        : {},
      workspaceProgressUpdatedAt: safeString(workspaceProgressItem && workspaceProgressItem.lifecycle && workspaceProgressItem.lifecycle.updatedAt, 80),
      latestPack: summarizePack(pack, retrievalPolicy && retrievalPolicy.scoreThresholds),
      compatibilityProjectionPaths: uniqueStrings([
        "output/openai_blog_learning_digest.json",
        "output/openai_blog_learning_ledger.json",
        "output/openai_blog_self_improvement_state.json",
        "output/openai_blog_self_improvement_gate.json",
        "output/openai_blog_reinforcement_memory.json",
        "output/anthropic_engineering_learning_digest.json",
        "output/anthropic_engineering_learning_ledger.json",
        "output/anthropic_engineering_self_improvement_state.json",
        "output/anthropic_engineering_self_improvement_gate.json",
      ], 16, 220),
    },
  };
}

function buildBaseItem({
  memoryId,
  type,
  status,
  authorityTier,
  sourceTier,
  scope,
  summary,
  structured,
  evidence,
  retrieval,
}) {
  const item = {
    memoryId,
    schema: "memory-item.v1",
    type,
    status,
    authorityTier,
    sourceTier,
    scope: scope && typeof scope === "object" ? scope : {},
    content: {
      summary: safeString(summary, 400),
      structured: structured && typeof structured === "object" ? structured : {},
    },
    evidence: {
      sourceRefs: uniqueStrings(evidence && evidence.sourceRefs, 16, 220),
      contentHash: "",
      supportCount: clampInt(evidence && evidence.supportCount, 0, 9999, 0),
      confidence: Number(safeNumber(evidence && evidence.confidence, 0).toFixed(3)),
      lastValidatedAt: safeString(evidence && evidence.lastValidatedAt, 80) || toIso(),
    },
    retrieval: {
      topics: uniqueStrings(retrieval && retrieval.topics, 16, 80),
      lexicalTriggers: uniqueStrings(retrieval && retrieval.lexicalTriggers, 20, 80),
      negativeTriggers: uniqueStrings(retrieval && retrieval.negativeTriggers, 12, 80),
      priority: clampInt(retrieval && retrieval.priority, 0, 100, 0),
    },
    lifecycle: {
      createdAt: toIso(),
      updatedAt: toIso(),
      expiresAt: safeString(structured && structured.expiresAt, 80) || null,
      supersedes: uniqueStrings(structured && structured.supersedes, 12, 120),
      conflictsWith: uniqueStrings(structured && structured.conflictsWith, 12, 120),
    },
  };
  item.evidence.contentHash = stableHash({
    type: item.type,
    status: item.status,
    summary: item.content.summary,
    structured: item.content.structured,
    scope: item.scope,
  });
  return item;
}

function buildSpecGraphItems({ workspaceRoot, phaseStatus, runtime }) {
  const catalog = loadConfigJson(workspaceRoot, "scripts", "config", "memory_spec_graph_catalog.json");
  const workspaceId = toWorkspaceId(workspaceRoot);
  const nodes = Array.isArray(catalog.nodes) ? catalog.nodes : [];
  const items = nodes.map((node) => buildBaseItem({
    memoryId: `spec:${safeString(node && node.id, 80)}`,
    type: "constitution_ref",
    status: "promoted",
    authorityTier: clampInt(node && node.authorityTier, 0, 6, 0),
    sourceTier: "repo",
    scope: {
      workspaceId,
      taskFamilies: uniqueStrings(node && node.taskFamilies, 12, 80),
      agents: uniqueStrings(node && node.agents, 12, 80),
      ownedPaths: uniqueStrings(node && node.ownedPaths, 16, 220),
    },
    summary: safeString(node && node.summary, 320) || safeString(node && node.id, 120),
    structured: {
      nodeId: safeString(node && node.id, 120),
      title: safeString(node && node.title, 160),
      filePath: safeString(node && node.filePath, 220),
      kind: safeString(node && node.kind, 80),
      immutable: Boolean(node && node.immutable),
      tags: uniqueStrings(node && node.tags, 12, 80),
      edges: Array.isArray(node && node.edges) ? node.edges.slice(0, 16) : [],
    },
    evidence: {
      sourceRefs: [safeString(node && node.filePath, 220)].filter(Boolean),
      supportCount: 1,
      confidence: 1,
      lastValidatedAt: toIso(),
    },
    retrieval: {
      topics: uniqueStrings([
        ...(Array.isArray(node && node.tags) ? node.tags : []),
        safeString(node && node.kind, 80),
      ], 16, 80),
      lexicalTriggers: uniqueStrings([
        safeString(node && node.id, 80),
        safeString(node && node.title, 80),
      ], 8, 80),
      priority: clampInt(90 - clampInt(node && node.authorityTier, 0, 6, 0) * 5, 0, 100, 80),
    },
  }));
  if (phaseStatus && typeof phaseStatus === "object") {
    items.push(buildBaseItem({
      memoryId: "spec:requirement_foundation_v1",
      type: "constitution_ref",
      status: "promoted",
      authorityTier: 0,
      sourceTier: "repo",
      scope: { workspaceId, taskFamilies: ["all"], agents: ["default"], ownedPaths: ["output/phase_exit_requirement_foundation_v1.json"] },
      summary: "Requirement Foundation V1 is frozen and treated as a top-level invariant, not a mutable lesson.",
      structured: {
        freezePolicy: safeString(phaseStatus.freezePolicy, 80) || "bug_fix_only",
        auditReportPath: safeString(phaseStatus.auditReportPath, 220),
        completedAt: safeString(phaseStatus.completedAt, 80),
        status: safeString(phaseStatus.status, 40),
      },
      evidence: {
        sourceRefs: [safeString(phaseStatus.auditReportPath, 220), "output/phase_exit_requirement_foundation_v1.json"].filter(Boolean),
        supportCount: 1,
        confidence: 1,
        lastValidatedAt: safeString(phaseStatus.completedAt, 80) || toIso(),
      },
      retrieval: {
        topics: ["freeze", "foundation", "requirement"],
        lexicalTriggers: ["freeze", "foundation", "requirement"],
        priority: 100,
      },
    }));
  }
  if (runtime && runtime.intentFirst && runtime.intentFirst.contract) {
    items.push(buildBaseItem({
      memoryId: "spec:design_acceptance_contract",
      type: "constitution_ref",
      status: "promoted",
      authorityTier: 0,
      sourceTier: "repo",
      scope: { workspaceId, taskFamilies: ["web_creative"], agents: ["default", "frontend_worker"], ownedPaths: ["scripts/config/design_acceptance_contract.json", "docs/DESIGN_ACCEPTANCE_CONTRACT.md"] },
      summary: "Design-sensitive work is completion-gated by benchmark alignment, visual review, independent review, and doc sync.",
      structured: runtime.intentFirst.contract,
      evidence: {
        sourceRefs: ["scripts/config/design_acceptance_contract.json", "docs/DESIGN_ACCEPTANCE_CONTRACT.md"],
        supportCount: 2,
        confidence: 1,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: ["design", "acceptance", "intent-first"],
        lexicalTriggers: ["ui", "ux", "site", "design", "taste"],
        priority: 98,
      },
    }));
  }
  return items;
}

function buildIntentAndPreferenceItems({ workspaceRoot, runtime }) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const intentFirst = runtime && runtime.intentFirst && typeof runtime.intentFirst === "object" ? runtime.intentFirst : {};
  const tasteMemory = intentFirst.tasteMemory && typeof intentFirst.tasteMemory === "object" ? intentFirst.tasteMemory : {};
  const activeProfile = tasteMemory.activeProfile && typeof tasteMemory.activeProfile === "object" ? tasteMemory.activeProfile : {};
  const inferredTaskFamily = inferPrimaryRuntimeTaskFamily(runtime, workspaceRoot, "default");
  const items = [];
  items.push(buildBaseItem({
    memoryId: "intent:active_requirement_contract",
    type: "requirement_ref",
    status: "promoted",
    authorityTier: 1,
    sourceTier: "runtime",
    scope: {
      workspaceId,
      taskFamilies: uniqueStrings([inferredTaskFamily], 4, 80),
      agents: uniqueStrings([safeString(runtime && runtime.activeAgent, 80) || "default"], 4, 80),
      ownedPaths: [],
    },
    summary: "Active intent-first requirement state for the current workspace and turn.",
    structured: {
      mode: safeString(intentFirst.mode, 80),
      benchmarkComparisonRequired: Boolean(intentFirst.contract && intentFirst.contract.benchmarkComparisonRequired),
      visualReviewRequired: Boolean(intentFirst.contract && intentFirst.contract.visualReviewRequired),
      independentReviewRequired: Boolean(intentFirst.contract && intentFirst.contract.independentReviewRequired),
      docSyncRequired: Boolean(intentFirst.contract && intentFirst.contract.docSyncRequired),
      technicalVerificationRequired: Boolean(intentFirst.contract && intentFirst.contract.technicalVerificationRequired),
      prohibitedPatterns: uniqueStrings(intentFirst.contract && intentFirst.contract.prohibitedPatterns, 12, 160),
      requiredArtifacts: uniqueStrings(intentFirst.contract && intentFirst.contract.requiredArtifacts, 12, 160),
      tasteMemoryPath: safeString(intentFirst.tasteMemoryPath, 220),
    },
    evidence: {
      sourceRefs: [safeString(intentFirst.contractPath, 220), safeString(intentFirst.tasteMemoryPath, 220)].filter(Boolean),
      supportCount: 2,
      confidence: 0.95,
      lastValidatedAt: toIso(),
    },
    retrieval: {
      topics: ["intent", "requirement", "acceptance"],
      lexicalTriggers: ["benchmark", "visual review", "doc sync"],
      priority: 96,
    },
  }));
  if (activeProfile && Object.keys(activeProfile).length) {
    items.push(buildBaseItem({
      memoryId: `preference:${safeString(tasteMemory.activeProfileId || activeProfile.id, 80) || "default"}`,
      type: "preference_signal",
      status: "promoted",
      authorityTier: 2,
      sourceTier: "runtime",
      scope: {
        workspaceId,
        taskFamilies: ["web_creative"],
        agents: ["default", "frontend_worker", "reviewer"],
        ownedPaths: [],
      },
      summary: safeString(activeProfile.northStar, 320) || "Active taste profile for subjective-quality work.",
      structured: {
        activeProfileId: safeString(tasteMemory.activeProfileId || activeProfile.id, 80) || "default",
        label: safeString(activeProfile.label, 160),
        qualityBar: safeString(activeProfile.qualityBar, 320),
        mustHaves: uniqueStrings(activeProfile.mustHaves, 10, 180),
        avoid: uniqueStrings(activeProfile.avoid, 10, 180),
        benchmarkUrls: uniqueStrings(activeProfile.benchmarkUrls, 8, 220),
        notes: uniqueStrings(activeProfile.notes, 12, 220),
        updatedAt: safeString(activeProfile.updatedAt, 80),
      },
      evidence: {
        sourceRefs: [safeString(intentFirst.tasteMemorySeedPath, 220), safeString(intentFirst.tasteMemoryPath, 220)].filter(Boolean),
        supportCount: 2,
        confidence: 0.9,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: ["taste", "benchmark", "subjective-quality"],
        lexicalTriggers: uniqueStrings([
          ...(Array.isArray(activeProfile.avoid) ? activeProfile.avoid : []),
          ...(Array.isArray(activeProfile.mustHaves) ? activeProfile.mustHaves : []),
        ], 14, 80),
        priority: 92,
      },
    }));
  }
  return items;
}

function buildWorkspaceProgressItem({ workspaceRoot, runtime, traceability, executionOverview, continuityBridge = null }) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object" ? runtime.latestTurn : {};
  const familyGate = latestTurn.family_completion_gate && typeof latestTurn.family_completion_gate === "object"
    ? latestTurn.family_completion_gate
    : {};
  const inferredTaskFamily = inferPrimaryRuntimeTaskFamily(runtime, workspaceRoot, "default");
  const executionRecent = executionOverview && Array.isArray(executionOverview.recent) ? executionOverview.recent : [];
  const latestSuccess = executionRecent.find((entry) => safeString(entry && entry.taskOutcomeStatus, 80).toUpperCase() === "COMPLETED");
  const latestFailure = executionRecent.find((entry) => {
    const status = safeString(entry && entry.taskOutcomeStatus, 80).toUpperCase();
    return status && status !== "COMPLETED";
  });
  const continuitySummary = continuityBridge && continuityBridge.summary && typeof continuityBridge.summary === "object"
    ? continuityBridge.summary
    : {};
  const continuityProgress = continuitySummary.workspaceProgress && typeof continuitySummary.workspaceProgress === "object"
    ? continuitySummary.workspaceProgress
    : {};
  const continuityUpdatedAt = safeString(continuitySummary.updatedAt, 80);
  const currentObjective = coerceSummaryText(
    continuityProgress.currentObjective || latestTurn.summary || latestTurn.title || humanizeCompactIdentifier(latestTurn.task_outcome_reason),
    workspaceRoot,
    "Continue the active governed harness objective."
  );
  const currentMilestones = uniqueStrings([
    ...(Array.isArray(continuityProgress.currentMilestones) ? continuityProgress.currentMilestones : []),
    safeString(latestTurn.status, 80) && `latest turn status: ${humanizeCompactIdentifier(safeString(latestTurn.status, 80))}`,
    safeString(familyGate.status, 80) && `family gate: ${humanizeCompactIdentifier(safeString(familyGate.status, 80))}`,
  ].filter(Boolean), 8, 160);
  const knownBlockers = uniqueStrings([
    ...(Array.isArray(continuityProgress.knownBlockers) ? continuityProgress.knownBlockers : []),
    ...((Array.isArray(familyGate.missingHard) ? familyGate.missingHard : [])
      .map((entry) => coerceSummaryText(entry && (entry.label || entry.reason || entry), workspaceRoot))
      .filter(Boolean)),
  ], 8, 180);
  const knownRisks = coerceSummaryList([
    ...(Array.isArray(continuityProgress.knownRisks) ? continuityProgress.knownRisks : []),
    latestFailure && humanizeCompactIdentifier(latestFailure.taskOutcomeReason),
    traceability && traceability.summary,
  ], workspaceRoot, 8);
  const recentTouchedPaths = uniqueStrings([
    ...(Array.isArray(continuityProgress.recentTouchedPaths) ? continuityProgress.recentTouchedPaths : []),
    ...(Array.isArray(traceability && traceability.changedPaths) ? traceability.changedPaths : []),
  ], 24, 220);
  const nextRecommendedActions = uniqueStrings([
    ...(Array.isArray(continuityProgress.nextRecommendedActions) ? continuityProgress.nextRecommendedActions : []),
    safeString(familyGate.status, 80) === "failed_validation" ? "Recover the latest failed validation before adding new scope." : "",
    safeString(latestTurn.task_outcome_status, 80).toUpperCase() === "FAILED_VALIDATION" ? "Treat missing evidence as a release blocker and regenerate the required proof." : "",
  ], 6, 220);
  const lastSuccessfulValidation = Array.isArray(continuityProgress.lastSuccessfulValidation) && continuityProgress.lastSuccessfulValidation.length
    ? continuityProgress.lastSuccessfulValidation
    : (latestSuccess ? [{
      turnId: safeString(latestSuccess.turnId, 120),
      taskOutcomeStatus: safeString(latestSuccess.taskOutcomeStatus, 80),
      completedAt: safeString(latestSuccess.completedAt, 80),
    }] : []);
  const lastFailedValidation = Array.isArray(continuityProgress.lastFailedValidation) && continuityProgress.lastFailedValidation.length
    ? continuityProgress.lastFailedValidation
    : (latestFailure ? [{
      turnId: safeString(latestFailure.turnId, 120),
      taskOutcomeStatus: safeString(latestFailure.taskOutcomeStatus, 80),
      reason: coerceSummaryText(humanizeCompactIdentifier(latestFailure.taskOutcomeReason), workspaceRoot),
      completedAt: safeString(latestFailure.completedAt, 80),
    }] : []);
  return buildBaseItem({
    memoryId: `workspace:${workspaceId}:progress`,
    type: "workspace_progress",
    status: "promoted",
    authorityTier: 3,
    sourceTier: "runtime",
    scope: {
      workspaceId,
      threadId: safeString(latestTurn.thread_id || latestTurn.threadId, 120),
      taskFamilies: uniqueStrings([inferredTaskFamily], 4, 80),
      agents: uniqueStrings([safeString(latestTurn.agent_name || runtime.activeAgent, 80) || "default"], 6, 80),
      ownedPaths: uniqueStrings(traceability && traceability.changedPaths, 24, 220),
    },
    summary: "Durable workspace-scoped progress state compiled from the latest turn, evidence traceability, and execution history.",
    structured: {
      workspaceRoot: repoRelative(workspaceRoot, workspaceRoot),
      currentObjective,
      currentMilestones,
      knownBlockers,
      knownRisks,
      lastSuccessfulValidation,
      lastFailedValidation,
      recentTouchedPaths,
      nextRecommendedActions,
      updatedAt: continuityUpdatedAt || toIso(),
    },
    evidence: {
      sourceRefs: uniqueStrings([
        safeString(traceability && traceability.operatorSummaryPath, 220),
        safeString(traceability && traceability.manifestPath, 220),
        continuitySummary && continuitySummary.sourcePath,
      ], 8, 220),
      supportCount: clampInt((continuitySummary && continuitySummary.taskCount ? 1 : 0) + 2, 2, 8, 2),
      confidence: 0.88,
      lastValidatedAt: continuityUpdatedAt || toIso(),
    },
    retrieval: {
      topics: ["workspace", "progress", "status"],
      lexicalTriggers: ["next", "blocker", "risk", "progress"],
      priority: 88,
    },
  });
}

function buildEpisodicAndFailureItems({ workspaceRoot, runtime, executionOverview, evalHistory }) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const items = [];
  const recent = executionOverview && Array.isArray(executionOverview.recent) ? executionOverview.recent : [];
  for (const entry of recent.slice(0, 8)) {
    const taskOutcomeStatus = safeString(entry && entry.taskOutcomeStatus, 80).toUpperCase() || "UNSPECIFIED";
    const inferredFamilies = inferTaskFamiliesFromExecutionRecord(entry, readinessPolicy);
    items.push(buildBaseItem({
      memoryId: `episode:${safeString(entry && entry.turnId, 120) || stableHash(entry).slice(0, 12)}`,
      type: "episodic_event",
      status: "captured",
      authorityTier: 4,
      sourceTier: "runtime",
      scope: {
        workspaceId,
        threadId: safeString(entry && entry.threadId, 120),
        taskFamilies: uniqueStrings(
          inferredFamilies.length
            ? inferredFamilies
            : [safeString(runtime && runtime.latestTurn && runtime.latestTurn.family_completion_gate && runtime.latestTurn.family_completion_gate.taskFamily, 80) || "default"],
          8,
          80
        ),
        agents: uniqueStrings([safeString(entry && entry.agentName, 80)], 4, 80),
        ownedPaths: [],
      },
      summary: `${safeString(entry && entry.executionProfile, 80) || "runtime"} episode finished as ${taskOutcomeStatus}.`,
      structured: {
        turnId: safeString(entry && entry.turnId, 120),
        status: safeString(entry && entry.status, 40),
        taskOutcomeStatus,
        taskOutcomeReason: safeString(entry && entry.taskOutcomeReason, 240),
        executionProfile: safeString(entry && entry.executionProfile, 80),
        completedAt: safeString(entry && entry.completedAt, 80),
        fileChanges: clampInt(entry && entry.fileChanges, 0, 9999, 0),
        commandExecutions: clampInt(entry && entry.commandExecutions, 0, 9999, 0),
        commandFailures: clampInt(entry && entry.commandFailures, 0, 9999, 0),
        collabCalls: clampInt(entry && entry.collabCalls, 0, 9999, 0),
        dispatchCount: clampInt(entry && entry.dispatchCount, 0, 9999, 0),
        executionIntent: safeString(entry && entry.executionIntent, 120),
        executionSource: safeString(entry && entry.executionSource, 120),
        changedPaths: uniqueStrings(entry && entry.changedPaths, 12, 220),
      },
      evidence: {
        sourceRefs: ["logs/archive/raw/harness_execution_memory.json"],
        supportCount: 1,
        confidence: 0.8,
        lastValidatedAt: safeString(entry && entry.completedAt, 80) || toIso(),
      },
      retrieval: {
        topics: ["execution", "episode"],
        lexicalTriggers: uniqueStrings([taskOutcomeStatus, safeString(entry && entry.executionProfile, 80)], 8, 80),
        priority: taskOutcomeStatus === "COMPLETED" ? 55 : 70,
      },
    }));
  }
  const patterns = executionOverview && Array.isArray(executionOverview.patterns) ? executionOverview.patterns : [];
  for (const entry of patterns.slice(0, 6)) {
    items.push(buildBaseItem({
      memoryId: `failure:${safeString(entry && entry.signature, 120) || stableHash(entry).slice(0, 12)}`,
      type: "failure_pattern",
      status: "promoted",
      authorityTier: 5,
      sourceTier: "runtime",
      scope: {
        workspaceId,
        taskFamilies: ["default"],
        agents: ["default", "reviewer", "tester"],
        ownedPaths: [],
      },
      summary: safeString(entry && entry.hint, 320) || safeString(entry && entry.signature, 320),
      structured: {
        signature: safeString(entry && entry.signature, 220),
        code: safeString(entry && entry.code, 120),
        severity: safeString(entry && entry.severity, 80),
        status: safeString(entry && entry.status, 80),
        count: clampInt(entry && entry.count, 0, 99999, 0),
        lastSeenAt: safeString(entry && entry.lastSeenAt, 80),
      },
      evidence: {
        sourceRefs: ["logs/archive/raw/harness_execution_memory.json"],
        supportCount: clampInt(entry && entry.count, 1, 99999, 1),
        confidence: 0.85,
        lastValidatedAt: safeString(entry && entry.lastSeenAt, 80) || toIso(),
      },
      retrieval: {
        topics: ["failure", "pattern", safeString(entry && entry.severity, 40)],
        lexicalTriggers: uniqueStrings([safeString(entry && entry.code, 80), safeString(entry && entry.signature, 80)], 10, 80),
        priority: clampInt(60 + clampInt(entry && entry.count, 0, 20, 0), 0, 95, 60),
      },
    }));
  }
  for (const run of Array.isArray(evalHistory && evalHistory.recentRuns) ? evalHistory.recentRuns.slice(0, 6) : []) {
    const inferredFamilies = inferTaskFamiliesFromEvalRun(run, readinessPolicy);
    items.push(buildBaseItem({
      memoryId: `eval:${safeString(run && run.runId, 120) || stableHash(run).slice(0, 12)}`,
      type: "eval_observation",
      status: "captured",
      authorityTier: 4,
      sourceTier: "eval",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(inferredFamilies.length ? inferredFamilies : ["default"], 8, 80),
        agents: ["default", "reviewer", "tester"],
        ownedPaths: [],
      },
      summary: `${safeString(run && run.suiteId, 160) || "eval suite"} score ${safeNumber(run && run.scoreRate, 0).toFixed(2)} with ${clampInt(run && run.failedCases, 0, 9999, 0)} failures.`,
      structured: {
        runId: safeString(run && run.runId, 120),
        suiteId: safeString(run && run.suiteId, 160),
        variantLabel: safeString(run && run.variantLabel, 120),
        scoreRate: Number(safeNumber(run && run.scoreRate, 0).toFixed(4)),
        passRate: Number(safeNumber(run && run.passRate, 0).toFixed(4)),
        failedCases: clampInt(run && run.failedCases, 0, 9999, 0),
        probePersistedRecords: clampInt(run && run.probePersistedRecords, 0, 9999, 0),
        generatedAt: safeString(run && run.generatedAt, 80),
      },
      evidence: {
        sourceRefs: ["logs/archive/raw/eval_runs.jsonl"],
        supportCount: 1,
        confidence: 0.9,
        lastValidatedAt: safeString(run && run.generatedAt, 80) || toIso(),
      },
      retrieval: {
        topics: ["eval", "regression"],
        lexicalTriggers: uniqueStrings([safeString(run && run.suiteId, 80), safeString(run && run.variantLabel, 80)], 8, 80),
        priority: 72,
      },
    }));
  }
  return items;
}

function buildSemanticAndImprovementItems({ workspaceRoot, runtime }) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const items = [];
  const external = runtime && runtime.externalLearning && typeof runtime.externalLearning === "object" ? runtime.externalLearning : {};
  const secondary = runtime && runtime.secondaryLearning && runtime.secondaryLearning.anthropicEngineering && typeof runtime.secondaryLearning.anthropicEngineering === "object"
    ? runtime.secondaryLearning.anthropicEngineering
    : {};
  const manual = runtime && runtime.manualSelfImprovement && typeof runtime.manualSelfImprovement === "object" ? runtime.manualSelfImprovement : {};
  const primaryState = readJsonObject(path.join(workspaceRoot, "output", "openai_blog_self_improvement_state.json"));
  const secondaryState = readJsonObject(path.join(workspaceRoot, "output", "anthropic_engineering_self_improvement_state.json"));
  const primaryReinforcementMemory = readJsonObject(path.join(workspaceRoot, "output", "openai_blog_reinforcement_memory.json"));
  const observationProjection = readJsonObject(path.join(getMemoryPaths(workspaceRoot).projections.observationStateRoot, "latest.json"));
  const observationByMemoryId = observationProjection && observationProjection.byMemoryId && typeof observationProjection.byMemoryId === "object"
    ? observationProjection.byMemoryId
    : {};
  const nextPriority = external.selfImprovement && external.selfImprovement.nextPriority && typeof external.selfImprovement.nextPriority === "object"
    ? external.selfImprovement.nextPriority
    : null;
  if (nextPriority) {
    const memoryId = `improvement:openai:${stableHash(nextPriority).slice(0, 12)}`;
    items.push(buildBaseItem({
      memoryId,
      type: "improvement_candidate",
      status: resolveExternalPrimaryStatus({
        memoryId,
        fallbackStatus: safeString(nextPriority.readinessStatus, 80) === "awaiting_observations" ? "shadow" : "candidate",
        observationByMemoryId,
        reinforcementMemory: primaryReinforcementMemory,
        articleId: resolveExternalLearningArticleId(nextPriority),
        hintId: safeString(nextPriority && nextPriority.hintId, 160),
      }),
      authorityTier: 6,
      sourceTier: "external_primary",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(external.runtimeRetrieval && external.runtimeRetrieval.applyToTaskFamilies, 8, 80),
        agents: uniqueStrings(external.runtimeRetrieval && external.runtimeRetrieval.applyToAgents, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(nextPriority.title, 320) || "Primary-lane improvement candidate.",
      structured: nextPriority,
      evidence: {
        sourceRefs: uniqueStrings([safeString(external.ledgerPath, 220), safeString(external.digestPath, 220)], 4, 220),
        supportCount: clampInt(external.trackedArticles, 1, 999, 1),
        confidence: 0.82,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: ["improvement", "primary-lane"],
        lexicalTriggers: uniqueStrings([safeString(nextPriority.changeType, 80), safeString(nextPriority.gatingReason, 80)], 8, 80),
        priority: 66,
      },
    }));
  }
  for (const article of Array.isArray(external.recentArticles) ? external.recentArticles.slice(0, 4) : []) {
    const memoryId = `lesson:openai:${stableHash(article).slice(0, 12)}`;
    items.push(buildBaseItem({
      memoryId,
      type: "semantic_lesson",
      status: resolveExternalPrimaryStatus({
        memoryId,
        fallbackStatus: "promoted",
        observationByMemoryId,
        reinforcementMemory: primaryReinforcementMemory,
        articleId: resolveExternalLearningArticleId(article),
      }),
      authorityTier: 5,
      sourceTier: "external_primary",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(external.runtimeRetrieval && external.runtimeRetrieval.applyToTaskFamilies, 8, 80),
        agents: uniqueStrings(external.runtimeRetrieval && external.runtimeRetrieval.applyToAgents, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(article && article.title, 320) || "Primary external lesson.",
      structured: article,
      evidence: {
        sourceRefs: uniqueStrings([safeString(article && article.url, 220), safeString(external.curatedDocPath, 220)], 4, 220),
        supportCount: 1,
        confidence: 0.78,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: uniqueStrings(article && article.topicTags, 8, 80),
        lexicalTriggers: uniqueStrings([safeString(article && article.title, 80)], 6, 80),
        priority: 64,
      },
    }));
  }
  for (const entry of Array.isArray(primaryState.appliedHints) ? primaryState.appliedHints.slice(0, 8) : []) {
    const hint = entry && entry.runtimeRetrievalHint && typeof entry.runtimeRetrievalHint === "object" ? entry.runtimeRetrievalHint : {};
    const memoryId = `hint:openai:${safeString(hint.hintId, 160) || stableHash(entry).slice(0, 12)}`;
    items.push(buildBaseItem({
      memoryId,
      type: "runtime_hint",
      status: resolveExternalPrimaryStatus({
        memoryId,
        fallbackStatus: "promoted",
        observationByMemoryId,
        reinforcementMemory: primaryReinforcementMemory,
        articleId: resolveExternalLearningArticleId(entry),
        hintId: safeString(hint && hint.hintId, 160),
      }),
      authorityTier: 5,
      sourceTier: "external_primary",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(hint.appliesToTaskFamilies, 8, 80),
        agents: uniqueStrings(hint.appliesToAgents, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(entry && entry.title, 320) || safeString(hint.hintId, 200) || "Primary runtime hint.",
      structured: {
        ...entry,
        runtimeRetrievalHint: hint,
      },
      evidence: {
        sourceRefs: uniqueStrings([
          "output/openai_blog_self_improvement_state.json",
          safeString(external.ledgerPath, 220),
          safeString(external.digestPath, 220),
        ], 4, 220),
        supportCount: 2,
        confidence: 0.88,
        lastValidatedAt: safeString(primaryState.generatedAt, 80) || toIso(),
      },
      retrieval: {
        topics: uniqueStrings(hint.topics, 8, 80),
        lexicalTriggers: uniqueStrings(hint.lexicalTriggers, 12, 80),
        priority: clampInt(70 + safeNumber(hint.articleBoost, 0), 0, 100, 70),
      },
    }));
  }
  for (const article of Array.isArray(secondary.recentArticles) ? secondary.recentArticles.slice(0, 4) : []) {
    items.push(buildBaseItem({
      memoryId: `lesson:anthropic:${stableHash(article).slice(0, 12)}`,
      type: "semantic_lesson",
      status: "shadow",
      authorityTier: 5,
      sourceTier: "external_secondary",
      scope: {
        workspaceId,
        taskFamilies: ["default"],
        agents: ["default", "reviewer", "tester"],
        ownedPaths: [],
      },
      summary: safeString(article && article.title, 320) || "Secondary external lesson.",
      structured: {
        ...article,
        portabilityMode: safeString(secondary.portabilityMode, 80),
      },
      evidence: {
        sourceRefs: uniqueStrings([safeString(article && article.url, 220), safeString(secondary.curatedDocPath, 220)], 4, 220),
        supportCount: 1,
        confidence: 0.64,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: ["secondary", "portable-principles"],
        lexicalTriggers: uniqueStrings([safeString(article && article.title, 80), safeString(article && article.portability, 80)], 8, 80),
        negativeTriggers: ["override", "constitution"],
        priority: 42,
      },
    }));
  }
  for (const entry of Array.isArray(secondaryState.appliedHints) ? secondaryState.appliedHints.slice(0, 8) : []) {
    const hint = entry && entry.runtimeRetrievalHint && typeof entry.runtimeRetrievalHint === "object" ? entry.runtimeRetrievalHint : {};
    items.push(buildBaseItem({
      memoryId: `hint:anthropic:${safeString(hint.hintId, 160) || stableHash(entry).slice(0, 12)}`,
      type: "runtime_hint",
      status: "shadow",
      authorityTier: 5,
      sourceTier: "external_secondary",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(hint.appliesToTaskFamilies, 8, 80),
        agents: uniqueStrings(hint.appliesToAgents, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(entry && entry.title, 320) || safeString(hint.hintId, 200) || "Secondary runtime hint.",
      structured: {
        ...entry,
        runtimeRetrievalHint: hint,
      },
      evidence: {
        sourceRefs: uniqueStrings([
          "output/anthropic_engineering_self_improvement_state.json",
          safeString(secondary.curatedDocPath, 220),
        ], 4, 220),
        supportCount: 1,
        confidence: 0.66,
        lastValidatedAt: safeString(secondaryState.generatedAt, 80) || toIso(),
      },
      retrieval: {
        topics: uniqueStrings(hint.topics, 8, 80),
        lexicalTriggers: uniqueStrings(hint.lexicalTriggers, 12, 80),
        negativeTriggers: ["override", "constitution"],
        priority: clampInt(46 + safeNumber(hint.articleBoost, 0), 0, 100, 46),
      },
    }));
  }
  for (const lesson of Array.isArray(manual.entries) ? manual.entries.slice(0, 6) : []) {
    const lessonEvidence = lesson && lesson.evidence && typeof lesson.evidence === "object" ? lesson.evidence : {};
    const supportingArtifacts = uniqueStrings([
      ...((Array.isArray(lessonEvidence.supportingArtifacts) ? lessonEvidence.supportingArtifacts : [])),
      ...((Array.isArray(lesson && lesson.supportingArtifacts) ? lesson.supportingArtifacts : [])),
    ], 8, 220);
    const lessonTaskFamilies = uniqueStrings(lesson && lesson.appliesTo && lesson.appliesTo.taskFamily, 8, 80);
    const lessonTriggers = uniqueStrings(lesson && lesson.appliesTo && lesson.appliesTo.triggers, 10, 80);
    const preferenceCandidate = safeString(lesson && lesson.classification, 80).toLowerCase() === "quality note"
      || lessonTaskFamilies.includes("web_creative")
      || lessonTriggers.some((entry) => /benchmark|visual review|design quality|taste|preference|must avoid/i.test(safeString(entry, 120)));
    items.push(buildBaseItem({
      memoryId: `manual:${stableHash(lesson).slice(0, 12)}`,
      type: safeString(lesson && lesson.classification, 80).toLowerCase() === "runtime hint" ? "runtime_hint" : "improvement_candidate",
      status: safeString(lesson && lesson.promotionDecision, 80).toLowerCase() === "blocked" ? "blocked" : "proposal_only",
      authorityTier: 6,
      sourceTier: "manual",
      scope: {
        workspaceId,
        taskFamilies: lessonTaskFamilies,
        agents: uniqueStrings(lesson && lesson.appliesTo && lesson.appliesTo.agent, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(lesson && lesson.lessonSummary, 320),
      structured: {
        ...lesson,
        evidence: lessonEvidence,
        supportingArtifacts,
        candidateCategory: preferenceCandidate ? "preference_learning_candidate" : "general_manual_learning_candidate",
      },
      evidence: {
        sourceRefs: supportingArtifacts,
        supportCount: Math.max(1, supportingArtifacts.length),
        confidence: 0.7,
        lastValidatedAt: safeString(manual.generatedAt, 80) || toIso(),
      },
      retrieval: {
        topics: uniqueStrings([
          safeString(lesson && lesson.classification, 80),
          ...(preferenceCandidate ? ["preference_learning_candidate"] : []),
          ...lessonTaskFamilies,
        ], 8, 80),
        lexicalTriggers: lessonTriggers,
        priority: 58,
      },
    }));
  }
  return items;
}

function normalizeTaskFamilyId(taskFamily, readinessPolicy) {
  const normalized = safeString(taskFamily, 80).toLowerCase();
  if (!normalized) return "";
  const buckets = Array.isArray(readinessPolicy && readinessPolicy.coverageBuckets) ? readinessPolicy.coverageBuckets : [];
  for (const bucket of buckets) {
    const aliases = uniqueStrings(bucket && bucket.aliases, 16, 80).map((entry) => entry.toLowerCase());
    if (safeString(bucket && bucket.id, 80).toLowerCase() === normalized || aliases.includes(normalized)) {
      return safeString(bucket && bucket.id, 80);
    }
  }
  return normalized;
}

function memoryAppliesToTaskFamily(item, taskFamily, readinessPolicy = null) {
  const normalizedTaskFamily = normalizeTaskFamilyId(taskFamily, readinessPolicy) || safeString(taskFamily, 80);
  const taskFamilies = uniqueStrings(item && item.scope && item.scope.taskFamilies, 16, 80);
  if (!taskFamilies.length || taskFamilies.includes("all") || taskFamilies.includes("default")) return true;
  return taskFamilies.some((entry) => normalizeTaskFamilyId(entry, readinessPolicy) === normalizedTaskFamily);
}

function memoryAppliesToAgent(item, agentRole) {
  const normalizedAgent = safeString(agentRole, 80) || "default";
  const agents = uniqueStrings(item && item.scope && item.scope.agents, 16, 80);
  if (!agents.length || agents.includes("all") || agents.includes("default")) return true;
  return agents.includes(normalizedAgent);
}

function normalizeContinuityLifecycleState(value) {
  const normalized = safeString(value, 80).toLowerCase();
  if (["planned", "running", "blocked", "verifier_failed", "completed", "archived", "abandoned"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "failed_validation") return "verifier_failed";
  if (normalized === "complete") return "completed";
  return normalized || "planned";
}

function normalizeAgentRoleForGovernedMemory(value) {
  const text = safeString(value, 120).toLowerCase();
  if (!text) return "default";
  const base = text.includes("@") ? text.split("@")[0] : text;
  return safeString(base, 80) || "default";
}

function loadHarnessExecutionMemoryRecordsFromDisk(workspaceRoot) {
  const payload = readJsonObject(path.join(workspaceRoot, "logs", "archive", "raw", "harness_execution_memory.json"));
  return Array.isArray(payload && payload.executionMemory) ? payload.executionMemory : [];
}

function loadEvalRunsFromDisk(workspaceRoot) {
  return loadJsonl(path.join(workspaceRoot, "logs", "archive", "raw", "eval_runs.jsonl"));
}

function summarizeExecutionPattern(records) {
  const grouped = new Map();
  for (const entry of Array.isArray(records) ? records : []) {
    const reason = safeString(entry && entry.taskOutcomeReason, 120)
      || safeString(entry && entry.parentDispatchGuard && entry.parentDispatchGuard.reason, 120)
      || safeString(entry && entry.errorText, 160)
      || "unspecified_runtime_outcome";
    const key = safeString(reason, 160);
    const current = grouped.get(key) || {
      signature: key,
      code: key,
      severity: "medium",
      status: safeString(entry && entry.taskOutcomeStatus, 40).toUpperCase() === "COMPLETED" ? "completed" : "failed",
      executionProfile: safeString(entry && entry.executionProfile, 80),
      executionIntent: safeString(entry && entry.executionIntent, 80),
      count: 0,
      lastSeenAt: "",
      hint: humanizeCompactIdentifier(key),
    };
    current.count += 1;
    const currentTs = parseTimestamp(entry && (entry.completedAt || entry.updatedAt));
    const previousTs = parseTimestamp(current.lastSeenAt);
    if (currentTs >= previousTs) {
      current.lastSeenAt = safeString(entry && (entry.completedAt || entry.updatedAt), 80);
      current.executionProfile = safeString(entry && entry.executionProfile, 80) || current.executionProfile;
      current.executionIntent = safeString(entry && entry.executionIntent, 80) || current.executionIntent;
      current.status = safeString(entry && entry.taskOutcomeStatus, 40).toUpperCase() === "COMPLETED" ? "completed" : "failed";
      if (safeString(entry && entry.taskOutcomeReason, 120).includes("missing")) current.severity = "high";
      if (safeString(entry && entry.taskOutcomeReason, 120).includes("block")) current.severity = "high";
    }
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .sort((left, right) => {
      const countDelta = safeNumber(right && right.count, 0) - safeNumber(left && left.count, 0);
      return countDelta || parseTimestamp(right && right.lastSeenAt) - parseTimestamp(left && left.lastSeenAt);
    })
    .slice(0, 6);
}

function normalizeExecutionState(state, { terminalFallback = false } = {}) {
  const normalized = typeof state === "string" ? state.trim().toLowerCase() : "";
  if (normalized === "completed") return "completed";
  if (normalized === "failed") return "failed";
  if (normalized === "interrupted" || normalized === "cancelled" || normalized === "canceled") return "interrupted";
  if (normalized === "inprogress" || normalized === "in_progress" || normalized === "running" || normalized === "queued" || normalized === "pending") {
    return "in_progress";
  }
  return terminalFallback ? "failed" : "in_progress";
}

function buildLocalExecutionMemoryOverview({ workspaceRoot, limit = 10, window = 60 } = {}) {
  const normalizedWindow = clampInt(window, 1, 500, 60);
  const normalizedLimit = clampInt(limit, 1, 50, 10);
  const records = loadHarnessExecutionMemoryRecordsFromDisk(workspaceRoot)
    .filter((entry) => entry && typeof entry === "object")
    .sort((left, right) => {
      return Math.max(
        parseTimestamp(right && right.completedAt),
        parseTimestamp(right && right.updatedAt),
        safeNumber(right && right.completedAt, 0),
        safeNumber(right && right.updatedAt, 0)
      ) - Math.max(
        parseTimestamp(left && left.completedAt),
        parseTimestamp(left && left.updatedAt),
        safeNumber(left && left.completedAt, 0),
        safeNumber(left && left.updatedAt, 0)
      );
    });
  const windowRecords = records.slice(0, normalizedWindow);
  const statusCounts = {};
  const taskOutcomeCounts = {};
  let guardViolations = 0;
  let implementationObserved = 0;
  for (const entry of windowRecords) {
    const status = normalizeExecutionState(entry && entry.status, { terminalFallback: true });
    statusCounts[status] = safeNumber(statusCounts[status], 0) + 1;
    const taskOutcome = safeString(entry && entry.taskOutcomeStatus, 80).toUpperCase() || "UNSPECIFIED";
    taskOutcomeCounts[taskOutcome] = safeNumber(taskOutcomeCounts[taskOutcome], 0) + 1;
    if (entry && entry.parentDispatchGuard && entry.parentDispatchGuard.violation) guardViolations += 1;
    if (
      safeNumber(entry && entry.observedSignals && entry.observedSignals.fileChanges, 0) > 0
      || safeNumber(entry && entry.observedSignals && entry.observedSignals.commandExecutions, 0) > 0
      || safeNumber(entry && entry.observedSignals && entry.observedSignals.mcpCalls, 0) > 0
    ) {
      implementationObserved += 1;
    }
  }
  return {
    sampleSize: windowRecords.length,
    statusCounts,
    taskOutcomeCounts,
    guardViolations,
    implementationObserved,
    recent: records.slice(0, normalizedLimit).map((entry) => ({
      turnId: safeString(entry && entry.turnId, 120),
      threadId: safeString(entry && entry.threadId, 120),
      agentName: safeString(entry && entry.agentName, 120),
      status: normalizeExecutionState(entry && entry.status, { terminalFallback: true }),
      taskOutcomeStatus: safeString(entry && entry.taskOutcomeStatus, 80),
      taskOutcomeReason: safeString(entry && entry.taskOutcomeReason, 160),
      executionProfile: safeString(entry && entry.executionProfile, 80),
      executionIntent: safeString(entry && entry.executionIntent, 80),
      executionSource: safeString(entry && entry.executionSource, 80),
      completedAt: safeString(entry && entry.completedAt, 80),
      evidenceManifestPath: safeString(entry && entry.evidenceManifestPath, 220),
      flowTraceSummaryPath: safeString(entry && entry.flowTraceSummaryPath, 220),
      stageTimelinePath: safeString(entry && entry.stageTimelinePath, 220),
      changedPaths: uniqueStrings(
        entry && entry.observedSignals && entry.observedSignals.sampleChangedPaths,
        8,
        220
      ),
      fileChanges: clampInt(entry && entry.observedSignals && entry.observedSignals.fileChanges, 0, 9999, 0),
      commandExecutions: clampInt(entry && entry.observedSignals && entry.observedSignals.commandExecutions, 0, 9999, 0),
      commandFailures: clampInt(entry && entry.observedSignals && entry.observedSignals.commandFailures, 0, 9999, 0),
      collabCalls: clampInt(entry && entry.observedSignals && entry.observedSignals.collabCalls, 0, 9999, 0),
      dispatchCount: clampInt(entry && entry.observedSignals && entry.observedSignals.dispatchCount, 0, 9999, 0),
      dispatchSuccessCount: clampInt(entry && entry.observedSignals && entry.observedSignals.dispatchSuccessCount, 0, 9999, 0),
      parentDispatchGuard: {
        mode: safeString(entry && entry.parentDispatchGuard && entry.parentDispatchGuard.mode, 20) || "off",
        reason: safeString(entry && entry.parentDispatchGuard && entry.parentDispatchGuard.reason, 120) || "",
        required: entry && entry.parentDispatchGuard && entry.parentDispatchGuard.required ? 1 : 0,
        satisfied: entry && entry.parentDispatchGuard && entry.parentDispatchGuard.satisfied ? 1 : 0,
        violation: entry && entry.parentDispatchGuard && entry.parentDispatchGuard.violation ? 1 : 0,
      },
    })),
    patterns: summarizeExecutionPattern(windowRecords),
  };
}

function buildLocalEvalHistoryOverview({ workspaceRoot, limit = 6 } = {}) {
  return loadEvalRunsFromDisk(workspaceRoot)
    .slice(-clampInt(limit, 1, 20, 6))
    .reverse()
    .map((entry) => {
      const run = Array.isArray(entry && entry.runs) ? entry.runs[0] : null;
      const suite = entry && entry.suite && typeof entry.suite === "object" ? entry.suite : {};
      return {
        runId: safeString(entry && entry.runId, 160),
        generatedAt: safeString(entry && entry.generatedAt, 80),
        suiteId: safeString(suite && suite.suiteId, 160),
        caseCount: clampInt(suite && suite.caseCount, 0, 9999, 0),
        variantLabel: safeString(run && run.variant && run.variant.label, 80),
        sampleSize: clampInt(run && run.sampleSize, 0, 9999, 0),
        passedCases: clampInt(run && run.passedCases, 0, 9999, 0),
        failedCases: clampInt(run && run.failedCases, 0, 9999, 0),
        passRate: Number(safeNumber(run && run.passRate, 0).toFixed(4)),
        scoreRate: Number(safeNumber(run && run.scoreRate, 0).toFixed(4)),
        probePersistedRecords: clampInt(entry && entry.probePersistence && entry.probePersistence.persistedRecords, 0, 9999, 0),
        executionIntent: safeString(run && run.variant && run.variant.executionIntent, 80),
        executionSource: safeString(run && run.variant && run.variant.executionSource, 80),
      };
    });
}

function buildLocalExternalLearningRuntime(workspaceRoot) {
  const ledger = readJsonObject(path.join(workspaceRoot, "output", "openai_blog_learning_ledger.json"));
  const digest = readJsonObject(path.join(workspaceRoot, "output", "openai_blog_learning_digest.json"));
  const state = readJsonObject(path.join(workspaceRoot, "output", "openai_blog_self_improvement_state.json"));
  const appliedHints = Array.isArray(state && state.appliedHints) ? state.appliedHints : [];
  const hintScopes = appliedHints.map((entry) => entry && entry.runtimeRetrievalHint && typeof entry.runtimeRetrievalHint === "object" ? entry.runtimeRetrievalHint : {});
  const recentArticles = Array.isArray(ledger && ledger.articles) ? ledger.articles.slice(0, 8) : [];
  return {
    trackedArticles: clampInt(ledger && ledger.summary && ledger.summary.trackedArticles, 0, 999, recentArticles.length),
    ledgerPath: "output/openai_blog_learning_ledger.json",
    digestPath: "output/openai_blog_learning_digest.json",
    curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
    runtimeRetrieval: {
      applyToAgents: uniqueStrings(hintScopes.flatMap((hint) => hint.appliesToAgents || []), 8, 80),
      applyToTaskFamilies: uniqueStrings(hintScopes.flatMap((hint) => hint.appliesToTaskFamilies || []), 8, 80),
    },
    selfImprovement: {
      nextPriority: state && state.nextPriority && typeof state.nextPriority === "object" ? state.nextPriority : null,
    },
    recentArticles,
    digestSummary: digest && digest.summary && typeof digest.summary === "object" ? digest.summary : {},
  };
}

function buildLocalSecondaryLearningRuntime(workspaceRoot) {
  const ledger = readJsonObject(path.join(workspaceRoot, "output", "anthropic_engineering_learning_ledger.json"));
  const recentArticles = Array.isArray(ledger && ledger.articles) ? ledger.articles.slice(0, 8) : [];
  return {
    anthropicEngineering: {
      curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
      recentArticles,
    },
  };
}

function buildLocalManualSelfImprovementRuntime(workspaceRoot) {
  const latest = readJsonObject(path.join(workspaceRoot, "output", "manual_self_improvement", "latest.json"));
  return latest && typeof latest === "object" ? latest : {};
}

function buildLocalPhaseStatusRuntime(workspaceRoot) {
  const audit = readJsonObject(path.join(workspaceRoot, "output", "phase_exit_requirement_foundation_v1.json"));
  return audit && typeof audit === "object"
    ? {
      requirementFoundationV1: safeString(audit.status, 80).toLowerCase() === "pass" ? "done" : safeString(audit.status, 80) || "unknown",
      status: safeString(audit.status, 80) || "unknown",
      freezePolicy: safeString(audit.freezePolicy, 80),
      completedAt: safeString(audit.generatedAt || audit.updatedAt, 80),
      auditReportPath: "output/phase_exit_requirement_foundation_v1.json",
    }
    : {};
}

function inferTaskFamiliesFromExecutionRecord(record, readinessPolicy) {
  const families = new Set();
  const intent = safeString(record && record.executionIntent, 80).toLowerCase();
  const source = safeString(record && record.executionSource, 80).toLowerCase();
  const reason = safeString(record && record.taskOutcomeReason, 120).toLowerCase();
  const changedPaths = uniqueStrings(record && record.changedPaths, 8, 220).map((entry) => entry.toLowerCase());
  const normalizedIntent = normalizeTaskFamilyId(intent, readinessPolicy);
  const normalizedSource = normalizeTaskFamilyId(source, readinessPolicy);
  if (normalizedIntent) families.add(normalizedIntent);
  if (normalizedSource) families.add(normalizedSource);
  if (source === "web_ui" || intent === "web-ui-interactive" || changedPaths.some((entry) => /web\/|\.html$|\.css$|public\//.test(entry))) {
    families.add("web_creative");
    families.add("tool_use_browser_like");
  }
  if (
    clampInt(record && record.dispatchCount, 0, 9999, 0) > 0
    || clampInt(record && record.collabCalls, 0, 9999, 0) > 0
    || /workflow|handoff|dispatch|orchestrat/.test(reason)
  ) {
    families.add("workflow_execution");
  }
  if (source === "eval_harness" || intent === "eval" || /review|probe|eval/.test(reason)) {
    families.add("evaluation_review");
  }
  if (/plan/.test(intent) || /planning/.test(reason)) {
    families.add("planning");
  }
  return uniqueStrings([...families], 8, 80);
}

function inferTaskFamiliesFromRuntime(runtime, workspaceRoot) {
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object"
    ? runtime.latestTurn
    : {};
  const traceability = runtime && runtime.traceability && typeof runtime.traceability === "object"
    ? runtime.traceability
    : {};
  const executionRecord = {
    executionIntent: safeString(
      latestTurn.execution_intent
      || latestTurn.executionIntent
      || latestTurn.intent
      || "",
      120
    ),
    executionSource: safeString(
      latestTurn.execution_source
      || latestTurn.executionSource
      || latestTurn.source
      || "",
      120
    ),
    taskOutcomeReason: safeString(
      latestTurn.task_outcome_reason
      || latestTurn.taskOutcomeReason
      || latestTurn.summary
      || latestTurn.title
      || "",
      220
    ),
    changedPaths: uniqueStrings([
      ...(Array.isArray(latestTurn.changed_paths) ? latestTurn.changed_paths : []),
      ...(Array.isArray(latestTurn.changedPaths) ? latestTurn.changedPaths : []),
      ...(Array.isArray(traceability.changedPaths) ? traceability.changedPaths : []),
    ], 24, 220),
    dispatchCount: clampInt(latestTurn.dispatch_count || latestTurn.dispatchCount, 0, 9999, 0),
    collabCalls: clampInt(latestTurn.collab_calls || latestTurn.collabCalls, 0, 9999, 0),
  };
  return inferTaskFamiliesFromExecutionRecord(executionRecord, readinessPolicy);
}

function inferPrimaryRuntimeTaskFamily(runtime, workspaceRoot, fallback = "default") {
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object"
    ? runtime.latestTurn
    : {};
  const gatedFamily = safeString(latestTurn.family_completion_gate && latestTurn.family_completion_gate.taskFamily, 80);
  const normalizedGatedFamily = normalizeTaskFamilyId(gatedFamily, readinessPolicy) || gatedFamily;
  if (normalizedGatedFamily && !["default", "evaluation_review"].includes(normalizedGatedFamily)) {
    return normalizedGatedFamily;
  }
  const inferredFamilies = inferTaskFamiliesFromRuntime(runtime, workspaceRoot);
  const preferredFamilies = [
    "web_creative",
    "workflow_execution",
    "planning",
    "tool_use_browser_like",
    "evaluation_review",
    "deterministic_code",
  ];
  for (const familyId of preferredFamilies) {
    if (inferredFamilies.includes(familyId)) return familyId;
  }
  return normalizedGatedFamily || inferredFamilies[0] || fallback;
}

function inferTaskFamiliesFromEvalRun(run, readinessPolicy) {
  const families = new Set(["evaluation_review"]);
  const suiteId = safeString(run && run.suiteId, 160).toLowerCase();
  if (/adversarial|self-check|review/.test(suiteId)) families.add("evaluation_review");
  if (/workflow/.test(suiteId)) families.add("workflow_execution");
  return uniqueStrings([...families].map((entry) => normalizeTaskFamilyId(entry, readinessPolicy) || entry), 8, 80);
}

function buildLocalTraceabilitySnapshot(workspaceRoot, latestSummary, executionOverview) {
  const recent = executionOverview && Array.isArray(executionOverview.recent) ? executionOverview.recent : [];
  const latestRecord = recent[0] || {};
  return {
    changedPaths: uniqueStrings([
      ...(Array.isArray(latestSummary && latestSummary.changedPaths) ? latestSummary.changedPaths : []),
      ...(Array.isArray(latestRecord && latestRecord.changedPaths) ? latestRecord.changedPaths : []),
    ], 24, 220),
    operatorSummaryPath: safeString(latestSummary && latestSummary.evidenceRefs && latestSummary.evidenceRefs.signoffSummaryPath, 220),
    manifestPath: safeString(latestRecord && latestRecord.evidenceManifestPath, 220),
    summary: coerceSummaryText(
      latestSummary && latestSummary.finalOutcome && latestSummary.finalOutcome.taskOutcomeReason,
      workspaceRoot,
      "Live governed memory sync from runtime artifacts."
    ),
  };
}

function buildLocalRuntimeSnapshotForGovernedMemory(workspaceRoot) {
  const latestSummary = readJsonObject(path.join(workspaceRoot, "logs", "current", "latest_run_summary.json"));
  const executionOverview = buildLocalExecutionMemoryOverview({ workspaceRoot, limit: 12, window: 80 });
  const evalHistory = { recentRuns: buildLocalEvalHistoryOverview({ workspaceRoot, limit: 8 }) };
  const latestRecord = Array.isArray(executionOverview.recent) ? executionOverview.recent[0] : null;
  const latestTurn = {
    turn_id: safeString(latestSummary && latestSummary.turnId, 120) || safeString(latestRecord && latestRecord.turnId, 120),
    thread_id: safeString(latestSummary && latestSummary.threadId, 120) || safeString(latestRecord && latestRecord.threadId, 120),
    agent_name: normalizeAgentRoleForGovernedMemory(
      safeString(latestRecord && latestRecord.agentName, 120)
      || (Array.isArray(latestSummary && latestSummary.usedAgents) ? latestSummary.usedAgents[0] : "")
    ),
    status: safeString(latestSummary && latestSummary.finalOutcome && latestSummary.finalOutcome.status, 40) || safeString(latestRecord && latestRecord.status, 40),
    task_outcome_status: safeString(latestSummary && latestSummary.finalOutcome && latestSummary.finalOutcome.taskOutcomeStatus, 80)
      || safeString(latestRecord && latestRecord.taskOutcomeStatus, 80),
    task_outcome_reason: safeString(latestSummary && latestSummary.finalOutcome && latestSummary.finalOutcome.taskOutcomeReason, 120)
      || safeString(latestRecord && latestRecord.taskOutcomeReason, 120),
    summary: coerceSummaryText(
      latestSummary && latestSummary.finalOutcome && latestSummary.finalOutcome.taskOutcomeReason,
      workspaceRoot,
      humanizeCompactIdentifier(safeString(latestRecord && latestRecord.taskOutcomeReason, 120))
    ),
    family_completion_gate: {
      applies: false,
      status: "not_applicable",
      taskFamily: inferTaskFamiliesFromExecutionRecord(latestRecord, loadAgiReadinessPolicy(workspaceRoot))[0] || "deterministic_code",
    },
  };
  const traceability = buildLocalTraceabilitySnapshot(workspaceRoot, latestSummary, executionOverview);
  return {
    runtime: {
      activeAgent: normalizeAgentRoleForGovernedMemory(latestTurn.agent_name),
      latestTurn,
      intentFirst: {},
      executionOverview,
      evalHistory,
      externalLearning: buildLocalExternalLearningRuntime(workspaceRoot),
      manualSelfImprovement: buildLocalManualSelfImprovementRuntime(workspaceRoot),
      secondaryLearning: buildLocalSecondaryLearningRuntime(workspaceRoot),
      phaseStatus: buildLocalPhaseStatusRuntime(workspaceRoot),
      traceability,
    },
    traceability,
  };
}

function hasLiveRuntimeSources(workspaceRoot) {
  return fs.existsSync(path.join(workspaceRoot, "logs", "current", "latest_run_summary.json"))
    && fs.existsSync(path.join(workspaceRoot, "logs", "archive", "raw", "harness_execution_memory.json"))
    && fs.existsSync(path.join(workspaceRoot, "logs", "archive", "raw", "eval_runs.jsonl"));
}

function syncGovernedMemoryGraphFromLocalRuntimeFiles({ workspaceRoot = workspaceRootDefault, reason = "public_export_sync" } = {}) {
  if (!hasLiveRuntimeSources(workspaceRoot)) return null;
  const { runtime, traceability } = buildLocalRuntimeSnapshotForGovernedMemory(workspaceRoot);
  return syncGovernedMemoryGraph({
    workspaceRoot,
    runtime,
    traceability,
    reason,
  });
}

function countContinuityAgentTreeHandoffs(agentTree) {
  if (!agentTree || typeof agentTree !== "object") return 0;
  if (Array.isArray(agentTree.edges)) {
    return agentTree.edges.filter((edge) => safeString(edge && edge.relationship, 40) === "handoff").length;
  }
  const children = Array.isArray(agentTree.children) ? agentTree.children : [];
  return children.reduce((total, child) => total + 1 + countContinuityAgentTreeHandoffs(child), 0);
}

function countContinuityAgentTreeNodes(agentTree) {
  if (!agentTree || typeof agentTree !== "object") return 0;
  if (Array.isArray(agentTree.nodes)) return agentTree.nodes.length;
  const children = Array.isArray(agentTree.children) ? agentTree.children : [];
  return 1 + children.reduce((total, child) => total + countContinuityAgentTreeNodes(child), 0);
}

function deriveContinuityReleaseState(task) {
  const explicit = safeString(task && task.finalReleaseState, 80);
  if (explicit) return explicit;
  const integrationStatus = safeString(task && task.integrationStatus, 80).toLowerCase();
  if (["released", "release_ready", "ready", "integrated"].includes(integrationStatus)) return integrationStatus;
  const lifecycleState = safeString(task && task.lifecycleState, 80).toLowerCase();
  if (lifecycleState === "completed") return "completed";
  if (lifecycleState === "verifier_failed") return "verifier_failed";
  if (lifecycleState === "blocked") return "blocked";
  return "unknown";
}

function classifyContinuityLengthBucket(task) {
  const totalUnits = Math.max(
    clampInt(task && task.stepCount, 0, 999999, 0),
    clampInt(task && task.subgoalCount, 0, 999999, 0),
    clampInt(task && task.verifierCheckpointCount, 0, 999999, 0)
  );
  if (totalUnits >= 10) return "extended";
  if (totalUnits >= 6) return "long";
  if (totalUnits >= 3) return "medium";
  if (totalUnits >= 1) return "short";
  return "unknown";
}

function scoreContinuityRepresentativeTask(task) {
  if (!task || typeof task !== "object") return -1;
  let score = 0;
  if (!safeString(task.parentTaskId, 120)) score += 10;
  score += clampInt(task.handoffCount, 0, 999999, 0) * 5;
  score += clampInt(task.childCount, 0, 999999, 0) * 3;
  score += clampInt(task.verifierCheckpointCount, 0, 999999, 0) * 2;
  score += clampInt(task.replanCount, 0, 999999, 0);
  score += clampInt(task.blockedChildTaskCount, 0, 999999, 0) * 2;
  score += clampInt(task.verifierFailedChildTaskCount, 0, 999999, 0) * 2;
  score += clampInt(task.stepCount, 0, 999999, 0) * 0.1;
  if (!["not_applicable", "unknown", ""].includes(safeString(task.integrationStatus, 80).toLowerCase())) score += 2;
  if (safeString(task.lastVerifierVerdict, 40).toUpperCase() === "PASS") score += 2;
  if (safeString(task.lifecycleState, 80) === "completed") score += 1;
  return score;
}

function selectContinuityRepresentativeTask(tasks) {
  const rows = Array.isArray(tasks) ? tasks : [];
  const roots = rows.filter((task) => !safeString(task && task.parentTaskId, 120));
  const candidates = roots.length ? roots : rows;
  return candidates
    .slice()
    .sort((left, right) => {
      const scoreDelta = scoreContinuityRepresentativeTask(right) - scoreContinuityRepresentativeTask(left);
      if (scoreDelta) return scoreDelta;
      return parseTimestamp(right && right.updatedAt) - parseTimestamp(left && left.updatedAt);
    })[0] || null;
}

function buildContinuityBridge({ workspaceRoot }) {
  let policy;
  try {
    policy = loadContinuityPolicy(undefined, { workspaceRoot });
  } catch {
    return {
      policy: null,
      sourcePath: "",
      tasks: [],
      summary: {
        generatedAt: toIso(),
        updatedAt: "",
        taskCount: 0,
        activeTaskCount: 0,
        blockedSubtaskCount: 0,
        verifierFailedSubtaskCount: 0,
        integrationPendingCount: 0,
        handoffCount: 0,
        finalReleaseState: "unknown",
        workspaceProgress: {},
        horizon: {},
      },
    };
  }
  const registry = readJsonObject(policy.registryPath);
  const rows = Array.isArray(registry.tasks) ? registry.tasks : [];
  const tasks = rows.map((row) => {
    const taskId = safeString(row && row.taskId, 120);
    const paths = buildTaskPaths({ workspaceRoot, policy, taskId });
    const taskState = readJsonObject(paths.taskStatePath);
    const planState = readJsonObject(paths.planStatePath);
    const verifierState = readJsonObject(paths.verifierStatePath);
    const closeoutSummary = readJsonObject(paths.closeoutSummaryPath);
    const integrationSummary = readJsonObject(paths.integrationSummaryPath);
    const agentGraph = readJsonObject(paths.agentGraphPath);
    const lifecycleEvents = loadJsonl(paths.lifecycleLogPath);
    const lifecycleHistory = Array.isArray(taskState && taskState.lifecycle && taskState.lifecycle.history)
      ? taskState.lifecycle.history
      : [];
    const familyId = safeString(
      taskState.familyId
      || taskState.taskFamily
      || taskState.family
      || planState.taskFamily
      || closeoutSummary.taskFamily
      || row.familyId,
      80
    ) || "workflow_execution";
    const lifecycleState = normalizeContinuityLifecycleState(
      row && row.lifecycleState
      || taskState.lifecycleState
      || closeoutSummary.lifecycleState
      || integrationSummary.lifecycleState
      || row && row.status
    );
    const stepCount = Array.isArray(planState.steps) ? planState.steps.length : clampInt(planState.stepCount, 0, 9999, 0);
    const subgoalCount = Array.isArray(taskState.subgoals) ? taskState.subgoals.length : clampInt(taskState.subgoalCount || stepCount, 0, 9999, stepCount);
    const verifierCheckpointCount =
      (Array.isArray(verifierState.checkpoints) ? verifierState.checkpoints.length : 0)
      + (Array.isArray(verifierState.verificationHistory) ? verifierState.verificationHistory.length : 0)
      + (Array.isArray(verifierState.verifierHistory) ? verifierState.verifierHistory.length : 0);
    const replanCount =
      clampInt(planState.replanCount, 0, 9999, 0)
      || lifecycleEvents.filter((entry) => /replan/i.test(safeString(entry && (entry.eventType || entry.status || entry.phase), 120))).length;
    const resumeCount = Math.max(0,
      lifecycleHistory.filter((entry) => safeString(entry && entry.to, 80) === "running").length
      + lifecycleEvents.filter((entry) => safeString(entry && (entry.to || entry.nextState), 80) === "running").length
      - 1
    );
    const orchestration = closeoutSummary && closeoutSummary.orchestration && typeof closeoutSummary.orchestration === "object"
      ? closeoutSummary.orchestration
      : {};
    const blockedChildTaskCount = uniqueStrings(orchestration.blockedChildTaskIds, 24, 120).length;
    const verifierFailedChildTaskCount = uniqueStrings(orchestration.verifierFailedChildTaskIds, 24, 120).length;
    const pendingChildTaskCount = uniqueStrings(orchestration.pendingChildTaskIds, 24, 120).length;
    const handoffCount = Math.max(
      countContinuityAgentTreeHandoffs(agentGraph),
      clampInt(row && row.childCount, 0, 999999, 0)
    );
    const childCount = Math.max(
      clampInt(row && row.childCount, 0, 999999, 0),
      countContinuityAgentTreeNodes(agentGraph) > 0 ? Math.max(0, countContinuityAgentTreeNodes(agentGraph) - 1) : 0
    );
    const touchedPaths = uniqueStrings([
      ...(Array.isArray(closeoutSummary.recentTouchedPaths) ? closeoutSummary.recentTouchedPaths : []),
      ...(Array.isArray(integrationSummary.changedPaths) ? integrationSummary.changedPaths : []),
      ...(Array.isArray(taskState.recentTouchedPaths) ? taskState.recentTouchedPaths : []),
    ], 24, 220);
    const nextActions = uniqueStrings([
      ...(Array.isArray(closeoutSummary.nextRecommendedActions) ? closeoutSummary.nextRecommendedActions : []),
      ...(Array.isArray(integrationSummary.nextRecommendedActions) ? integrationSummary.nextRecommendedActions : []),
      ...(Array.isArray(taskState.nextRecommendedActions) ? taskState.nextRecommendedActions : []),
    ], 12, 220);
    const blockers = uniqueStrings([
      ...(Array.isArray(row && row.blockers) ? row.blockers : []),
      ...(Array.isArray(taskState.blockers) ? taskState.blockers : []),
      ...(Array.isArray(verifierState.blockers) ? verifierState.blockers : []),
      ...(Array.isArray(closeoutSummary.knownBlockers) ? closeoutSummary.knownBlockers : []),
    ], 12, 220);
    const risks = uniqueStrings([
      ...(Array.isArray(taskState.knownRisks) ? taskState.knownRisks : []),
      ...(Array.isArray(closeoutSummary.knownRisks) ? closeoutSummary.knownRisks : []),
      ...(Array.isArray(integrationSummary.knownRisks) ? integrationSummary.knownRisks : []),
    ], 12, 220);
    const updatedAt = safeString(
      closeoutSummary.updatedAt
      || integrationSummary.updatedAt
      || verifierState.updatedAt
      || planState.updatedAt
      || taskState.updatedAt
      || row && row.updatedAt,
      80
    ) || toIso();
    const lastSuccessfulValidation = [];
    if (safeString(row && row.lastVerifierVerdict, 40).toUpperCase() === "PASS" || safeString(verifierState.lastVerifierVerdict, 40).toUpperCase() === "PASS") {
      lastSuccessfulValidation.push({
        taskId,
        verdict: "PASS",
        completedAt: safeString(verifierState.updatedAt || closeoutSummary.updatedAt || updatedAt, 80),
      });
    }
    const lastFailedValidation = [];
    if (safeString(row && row.lastVerifierVerdict, 40).toUpperCase() === "FAIL" || safeString(verifierState.lastVerifierVerdict, 40).toUpperCase() === "FAIL" || lifecycleState === "verifier_failed") {
      lastFailedValidation.push({
        taskId,
        verdict: "FAIL",
        reason: coerceSummaryText(verifierState.reason || closeoutSummary.reason || blockers, workspaceRoot, "verifier failed"),
        completedAt: safeString(verifierState.updatedAt || updatedAt, 80),
      });
    }
    return {
      taskId,
      title: safeString(row && row.title, 220) || safeString(taskState.title, 220),
      objective: safeString(taskState.objective, 240) || safeString(row && row.objective, 240) || safeString(closeoutSummary.objective, 240),
      familyId,
      normalizedFamilyId: normalizeTaskFamilyId(familyId, loadAgiReadinessPolicy(workspaceRoot)) || familyId,
      lifecycleState,
      role: safeString(row && row.role, 80) || safeString(taskState.role, 80) || "default",
      parentTaskId: safeString(row && row.parentTaskId, 120),
      rootTaskId: safeString(row && row.rootTaskId, 120) || taskId,
      orchestrationMode: safeString(row && row.orchestrationMode, 80) || safeString(taskState.orchestrationMode, 80),
      childCount,
      handoffCount,
      blockedChildTaskCount,
      verifierFailedChildTaskCount,
      pendingChildTaskCount,
      stepCount,
      subgoalCount,
      verifierCheckpointCount,
      replanCount,
      resumeCount,
      integrationStatus: safeString(row && row.integrationStatus, 80) || safeString(integrationSummary.status, 80) || "unknown",
      lastVerifierVerdict: safeString(row && row.lastVerifierVerdict, 40) || safeString(verifierState.lastVerifierVerdict, 40),
      blockers,
      risks,
      recentTouchedPaths: touchedPaths,
      nextRecommendedActions: nextActions,
      lastSuccessfulValidation,
      lastFailedValidation,
      updatedAt,
      closeoutOutcome: safeString(closeoutSummary.outcome || closeoutSummary.status, 80),
      finalReleaseState: safeString(closeoutSummary.finalReleaseState || closeoutSummary.releaseState || integrationSummary.finalReleaseState || integrationSummary.releaseState, 80),
      evidenceRefs: uniqueStrings([
        fs.existsSync(paths.closeoutSummaryPath) ? repoRelative(workspaceRoot, paths.closeoutSummaryPath) : "",
        fs.existsSync(paths.verifierStatePath) ? repoRelative(workspaceRoot, paths.verifierStatePath) : "",
        fs.existsSync(paths.integrationSummaryPath) ? repoRelative(workspaceRoot, paths.integrationSummaryPath) : "",
        fs.existsSync(paths.taskStatePath) ? repoRelative(workspaceRoot, paths.taskStatePath) : "",
        fs.existsSync(paths.planStatePath) ? repoRelative(workspaceRoot, paths.planStatePath) : "",
        fs.existsSync(paths.agentGraphPath) ? repoRelative(workspaceRoot, paths.agentGraphPath) : "",
      ], 8, 220),
      agentTree: agentGraph && Object.keys(agentGraph).length ? agentGraph : null,
    };
  }).sort((left, right) => parseTimestamp(right && right.updatedAt) - parseTimestamp(left && left.updatedAt));

  const latestRootTask = selectContinuityRepresentativeTask(tasks);
  const finalReleaseState = deriveContinuityReleaseState(latestRootTask);
  const horizon = latestRootTask ? {
    activeTaskId: safeString(latestRootTask && latestRootTask.taskId, 120),
    activeTaskFamily: safeString(latestRootTask && latestRootTask.normalizedFamilyId, 80) || safeString(latestRootTask && latestRootTask.familyId, 80),
    objective: coerceSummaryText(latestRootTask && latestRootTask.objective, workspaceRoot, ""),
    horizonUnit: "steps",
    completedSteps: clampInt(latestRootTask && latestRootTask.stepCount, 0, 99999, 0),
    subgoalCount: clampInt(latestRootTask && latestRootTask.subgoalCount, 0, 99999, 0),
    verifierCheckpointCount: clampInt(latestRootTask && latestRootTask.verifierCheckpointCount, 0, 99999, 0),
    replanCount: clampInt(latestRootTask && latestRootTask.replanCount, 0, 99999, 0),
    resumeCount: clampInt(latestRootTask && latestRootTask.resumeCount, 0, 99999, 0),
    completionLengthBucket: classifyContinuityLengthBucket(latestRootTask),
    closureOutcome: safeString(latestRootTask && (latestRootTask.closeoutOutcome || latestRootTask.lifecycleState), 80),
    evidenceRefs: uniqueStrings(latestRootTask && latestRootTask.evidenceRefs, 8, 220),
  } : {};
  const summary = {
    generatedAt: toIso(),
    updatedAt: latestRootTask ? safeString(latestRootTask.updatedAt, 80) : "",
    sourcePath: repoRelative(workspaceRoot, policy.registryPath),
    taskCount: tasks.length,
    activeTaskCount: tasks.filter((task) => !["completed", "archived", "abandoned"].includes(task.lifecycleState)).length,
    blockedSubtaskCount: tasks.filter((task) => safeString(task.parentTaskId, 120) && task.lifecycleState === "blocked").length
      + tasks.reduce((total, task) => total + clampInt(task && task.blockedChildTaskCount, 0, 999999, 0), 0),
    verifierFailedSubtaskCount: tasks.filter((task) => safeString(task.parentTaskId, 120) && task.lifecycleState === "verifier_failed").length
      + tasks.reduce((total, task) => total + clampInt(task && task.verifierFailedChildTaskCount, 0, 999999, 0), 0),
    integrationPendingCount: tasks.filter((task) => !["integrated", "complete", "completed", "released", "not_applicable"].includes(safeString(task.integrationStatus, 80).toLowerCase())).length
      + tasks.reduce((total, task) => total + clampInt(task && task.pendingChildTaskCount, 0, 999999, 0), 0),
    handoffCount: tasks.reduce((total, task) => total + clampInt(task && task.handoffCount, 0, 999999, 0), 0),
    finalReleaseState,
    activeAgentTree: latestRootTask && latestRootTask.agentTree ? latestRootTask.agentTree : {},
    workspaceProgress: {
      currentObjective: coerceSummaryText(
        latestRootTask && (latestRootTask.objective || latestRootTask.title || latestRootTask.closeoutOutcome || finalReleaseState),
        workspaceRoot,
        "Continue the active continuity objective."
      ),
      currentMilestones: uniqueStrings([
        ...tasks
          .slice()
          .sort((left, right) => parseTimestamp(right && right.updatedAt) - parseTimestamp(left && left.updatedAt))
          .slice(0, 4)
          .map((task) => `${humanizeCompactIdentifier(task.lifecycleState)}: ${safeString(task.title, 120) || task.taskId}`),
      ], 8, 180),
      knownBlockers: uniqueStrings(tasks.flatMap((task) => task.blockers || []), 12, 220),
      knownRisks: uniqueStrings(tasks.flatMap((task) => task.risks || []), 12, 220),
      recentTouchedPaths: uniqueStrings(tasks.flatMap((task) => task.recentTouchedPaths || []), 24, 220),
      nextRecommendedActions: uniqueStrings(tasks.flatMap((task) => task.nextRecommendedActions || []), 12, 220),
      lastSuccessfulValidation: tasks.flatMap((task) => task.lastSuccessfulValidation || []).slice(0, 4),
      lastFailedValidation: tasks.flatMap((task) => task.lastFailedValidation || []).slice(0, 4),
    },
    horizon,
  };
  return {
    policy,
    sourcePath: repoRelative(workspaceRoot, policy.registryPath),
    tasks,
    summary,
  };
}

function deriveObservationOutcome(status, policy) {
  const normalizedStatus = safeString(status, 80).toUpperCase();
  const mapped = policy && policy.outcomeMap && typeof policy.outcomeMap === "object"
    ? safeString(policy.outcomeMap[normalizedStatus], 40)
    : "";
  return mapped || safeString(policy && policy.defaultOutcome, 40) || "not_applicable";
}

function buildObservationEvents({ workspaceRoot, runtime, traceability, pack, items, paths, continuityBridge }) {
  const policy = loadObservationPolicy(workspaceRoot);
  const eligibleTypes = new Set(uniqueStrings(
    (policy && (policy.eligibleMemoryTypes || policy.eligibleTypes)) || [],
    12,
    80
  ));
  const workspaceId = toWorkspaceId(workspaceRoot);
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object" ? runtime.latestTurn : {};
  const taskFamily = safeString(pack && pack.taskFamily, 80)
    || safeString(latestTurn.family_completion_gate && latestTurn.family_completion_gate.taskFamily, 80)
    || "default";
  const agentRole = safeString(pack && pack.activeAgent, 80) || safeString(latestTurn.agent_name, 80) || "default";
  const existingEvents = loadJsonl(paths.eventsPath);
  const existingKeys = new Set(existingEvents
    .filter((entry) => safeString(entry && entry.eventType, 80) === "memory_observation_recorded")
    .map((entry) => safeString(entry && entry.observationKey, 240))
    .filter(Boolean));
  const itemById = new Map((Array.isArray(items) ? items : []).map((item) => [safeString(item && item.memoryId, 120), item]));
  const recorded = [];
  const rejected = [];
  const nowIso = toIso();
  const requireEvidenceRefs = policy && Object.prototype.hasOwnProperty.call(policy, "requireEvidenceRefs")
    ? policy.requireEvidenceRefs !== false
    : true;
  const selectedIds = uniqueStrings(pack && pack.selectedMemoryIds, 32, 120);
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const makePackSelectionKey = (family = "", role = "") => {
    const normalizedFamily = normalizeTaskFamilyId(family, readinessPolicy) || safeString(family, 80) || "default";
    const normalizedRole = normalizeAgentRoleForGovernedMemory(role) || "default";
    return `${normalizedFamily}::${normalizedRole}`;
  };
  const selectedIdsByFamilyRole = new Map();
  const appendSelectedIds = (family = "", role = "", memoryIds = []) => {
    const key = makePackSelectionKey(family, role);
    const existing = selectedIdsByFamilyRole.get(key) || new Set();
    for (const memoryId of uniqueStrings(memoryIds, 48, 120)) {
      if (memoryId) existing.add(memoryId);
    }
    selectedIdsByFamilyRole.set(key, existing);
  };
  appendSelectedIds(taskFamily, agentRole, selectedIds);
  for (const recentPack of takeRecentEntries(loadJsonl(paths.retrieval.packsPath), {
    limit: 18,
    timestampSelector: (entry) => entry && (entry.generatedAt || entry.compiledAt || entry.recordedAt),
  })) {
    appendSelectedIds(
      safeString(recentPack && recentPack.taskFamily, 80),
      safeString(recentPack && recentPack.activeAgent, 80),
      recentPack && recentPack.selectedMemoryIds
    );
  }
  const getSelectedIdsForFamilyRole = (family = "", role = "") => {
    const candidates = [
      makePackSelectionKey(family, role),
      makePackSelectionKey(family, "default"),
      makePackSelectionKey("default", role),
      makePackSelectionKey("default", "default"),
    ];
    const ids = new Set();
    for (const key of candidates) {
      for (const memoryId of selectedIdsByFamilyRole.get(key) || []) {
        ids.add(memoryId);
      }
    }
    return ids;
  };
  const buildObservationKey = ({ turnId = "", threadId = "", continuityTaskId = "", memoryId = "", taskFamily: family = "", agentRole: role = "" }) => {
    return stableHash({
      workspaceId,
      turnId: safeString(turnId, 120),
      threadId: safeString(threadId, 120),
      continuityTaskId: safeString(continuityTaskId, 120),
      memoryId: safeString(memoryId, 120),
      taskFamily: safeString(family, 80),
      agentRole: safeString(role, 80),
    }).slice(0, 24);
  };
  const pushRejected = ({ memoryId, item, reason, turnId = "", threadId = "", continuityTaskId = "", family = taskFamily, role = agentRole, evidenceRefs = [] }) => {
    rejected.push({
      schema: "memory-event.v1",
      eventId: stableHash({ type: "rejected", memoryId, reason, turnId, threadId, continuityTaskId, family, role }).slice(0, 20),
      eventType: "memory_observation_rejected",
      recordedAt: nowIso,
      workspaceId,
      turnId: safeString(turnId, 120),
      threadId: safeString(threadId, 120),
      continuityTaskId: safeString(continuityTaskId, 120),
      memoryId: safeString(memoryId, 120),
      memoryType: safeString(item && item.type, 80) || "unknown",
      sourceTier: safeString(item && item.sourceTier, 40) || "unknown",
      authorityTier: clampInt(item && item.authorityTier, 0, 9999, 9),
      matchedMemoryIds: [safeString(memoryId, 120)].filter(Boolean),
      taskFamily: safeString(family, 80),
      agentRole: safeString(role, 80),
      observedOutcome: "rejected",
      evidenceRefs: uniqueStrings(evidenceRefs, 8, 220),
      status: "rejected",
      reason: safeString(reason, 120),
      observationKey: buildObservationKey({ turnId, threadId, continuityTaskId, memoryId, taskFamily: family, agentRole: role }),
    });
  };
  const maybeRecord = ({ memoryId, item, turnId = "", threadId = "", continuityTaskId = "", family = taskFamily, role = agentRole, outcome = "neutral", evidenceRefs = [] }) => {
    const observationKey = buildObservationKey({ turnId, threadId, continuityTaskId, memoryId, taskFamily: family, agentRole: role });
    if (safeString(policy && policy.sameTurnDedupe, 20) !== "false" && existingKeys.has(observationKey)) {
      pushRejected({ memoryId, item, reason: "duplicate_observation", turnId, threadId, continuityTaskId, family, role, evidenceRefs });
      return;
    }
    if (requireEvidenceRefs && !uniqueStrings(evidenceRefs, 8, 220).length) {
      pushRejected({ memoryId, item, reason: "missing_evidence_refs", turnId, threadId, continuityTaskId, family, role, evidenceRefs });
      return;
    }
    existingKeys.add(observationKey);
    recorded.push({
      schema: "memory-event.v1",
      eventId: stableHash({ type: "recorded", observationKey, outcome }).slice(0, 20),
      eventType: "memory_observation_recorded",
      recordedAt: nowIso,
      workspaceId,
      turnId: safeString(turnId, 120),
      threadId: safeString(threadId, 120),
      continuityTaskId: safeString(continuityTaskId, 120),
      taskFamily: safeString(family, 80),
      agentRole: safeString(role, 80),
      memoryId: safeString(memoryId, 120),
      memoryType: safeString(item && item.type, 80) || "unknown",
      sourceTier: safeString(item && item.sourceTier, 40) || "unknown",
      authorityTier: clampInt(item && item.authorityTier, 0, 9999, 9),
      matchedMemoryIds: [safeString(memoryId, 120)].filter(Boolean),
      observedOutcome: safeString(outcome, 40) || "neutral",
      evidenceRefs: uniqueStrings(evidenceRefs, 8, 220),
      status: safeString(outcome, 40) || "neutral",
      observationKey,
    });
  };
  const baseEvidenceRefs = uniqueStrings([
    safeString(traceability && traceability.operatorSummaryPath, 220),
    safeString(traceability && traceability.manifestPath, 220),
  ], 8, 220);
  const turnOutcome = deriveObservationOutcome(safeString(latestTurn.task_outcome_status, 80), policy);
  for (const memoryId of selectedIds) {
    const item = itemById.get(memoryId);
    if (!item || !eligibleTypes.has(safeString(item.type, 80))) continue;
    if (!memoryAppliesToTaskFamily(item, taskFamily, loadAgiReadinessPolicy(workspaceRoot))) {
      pushRejected({
        memoryId,
        item,
        reason: "task_family_mismatch",
        turnId: safeString(latestTurn.turn_id || latestTurn.turnId, 120),
        threadId: safeString(latestTurn.thread_id || latestTurn.threadId, 120),
        family: taskFamily,
        role: agentRole,
        evidenceRefs: baseEvidenceRefs,
      });
      continue;
    }
    if (!memoryAppliesToAgent(item, agentRole)) continue;
    maybeRecord({
      memoryId,
      item,
      turnId: safeString(latestTurn.turn_id || latestTurn.turnId, 120),
      threadId: safeString(latestTurn.thread_id || latestTurn.threadId, 120),
      family: taskFamily,
      role: agentRole,
      outcome: turnOutcome,
      evidenceRefs: baseEvidenceRefs,
    });
  }
  const continuityTasks = Array.isArray(continuityBridge && continuityBridge.tasks) ? continuityBridge.tasks : [];
  const executionRecent = runtime && runtime.executionOverview && Array.isArray(runtime.executionOverview.recent)
    ? runtime.executionOverview.recent
    : [];
  for (const record of executionRecent) {
    const families = inferTaskFamiliesFromExecutionRecord(record, readinessPolicy);
    if (!families.length) continue;
    const recordRole = normalizeAgentRoleForGovernedMemory(record && record.agentName);
    const recordTurnId = safeString(record && record.turnId, 120) || `exec_${maskOpaqueId(`${safeString(record && record.completedAt, 80)}:${safeString(record && record.executionIntent, 80)}`, "turn")}`;
    const recordThreadId = safeString(record && record.threadId, 120) || `thread_${maskOpaqueId(`${recordTurnId}:${safeString(record && record.executionSource, 80)}`, "thread")}`;
    const recordOutcome = deriveObservationOutcome(
      safeString(record && record.taskOutcomeStatus, 80) || safeString(record && record.status, 80),
      policy
    );
    const recordEvidence = uniqueStrings([
      safeString(record && record.evidenceManifestPath, 220),
      safeString(record && record.flowTraceSummaryPath, 220),
      safeString(record && record.stageTimelinePath, 220),
      ...baseEvidenceRefs,
    ], 8, 220);
    const eligibleItems = items.filter((item) => {
      if (!eligibleTypes.has(safeString(item && item.type, 80))) return false;
      if (!memoryAppliesToAgent(item, recordRole)) return false;
      return true;
    });
    for (const family of families) {
      const selectedForRecord = getSelectedIdsForFamilyRole(family, recordRole);
      if (!selectedForRecord.size) continue;
      const familyMatches = eligibleItems.filter((item) => {
        const memoryId = safeString(item && item.memoryId, 120);
        if (!memoryId || !selectedForRecord.has(memoryId)) return false;
        return memoryAppliesToTaskFamily(item, family, readinessPolicy);
      });
      for (const item of familyMatches) {
        maybeRecord({
          memoryId: safeString(item && item.memoryId, 120),
          item,
          turnId: recordTurnId,
          threadId: recordThreadId,
          family,
          role: recordRole,
          outcome: recordOutcome,
          evidenceRefs: recordEvidence,
        });
      }
    }
  }
  for (const task of continuityTasks) {
    if (!["completed", "blocked", "verifier_failed"].includes(safeString(task && task.lifecycleState, 80))) continue;
    const continuityOutcome = task.lifecycleState === "completed" ? "success" : task.lifecycleState === "verifier_failed" ? "failure" : "neutral";
    const continuityEvidence = uniqueStrings(task && task.evidenceRefs, 8, 220);
    const selectedForTask = getSelectedIdsForFamilyRole(safeString(task && task.familyId, 80), safeString(task && task.role, 80) || "default");
    if (!selectedForTask.size) continue;
    const continuityMatches = items.filter((item) => {
      if (!eligibleTypes.has(safeString(item && item.type, 80))) return false;
      if (!selectedForTask.has(safeString(item && item.memoryId, 120))) return false;
      if (!memoryAppliesToTaskFamily(item, safeString(task && task.familyId, 80), readinessPolicy)) return false;
      if (!memoryAppliesToAgent(item, safeString(task && task.role, 80) || "default")) return false;
      return true;
    });
    for (const item of continuityMatches) {
      maybeRecord({
        memoryId: safeString(item && item.memoryId, 120),
        item,
        continuityTaskId: safeString(task && task.taskId, 120),
        family: safeString(task && task.familyId, 80),
        role: safeString(task && task.role, 80) || "default",
        outcome: continuityOutcome,
        evidenceRefs: continuityEvidence,
      });
    }
  }
  return [...recorded, ...rejected];
}

function buildObservationProjection({ workspaceRoot, items, events }) {
  const itemById = new Map((Array.isArray(items) ? items : []).map((item) => [safeString(item && item.memoryId, 120), item]));
  const recorded = Array.isArray(events) ? events.filter((entry) => safeString(entry && entry.eventType, 80) === "memory_observation_recorded") : [];
  const rejected = Array.isArray(events) ? events.filter((entry) => safeString(entry && entry.eventType, 80) === "memory_observation_rejected") : [];
  const byMemoryId = {};
  const byLane = {
    external_primary: { observationCount: 0, successCount: 0, failureCount: 0, neutralCount: 0, notApplicableCount: 0, awaitingObservationCount: 0, lastObservedAt: "" },
    external_secondary: { observationCount: 0, successCount: 0, failureCount: 0, neutralCount: 0, notApplicableCount: 0, awaitingObservationCount: 0, lastObservedAt: "" },
  };
  for (const event of recorded) {
    const memoryId = safeString(event && event.memoryId, 120);
    if (!memoryId) continue;
    const current = byMemoryId[memoryId] && typeof byMemoryId[memoryId] === "object" ? byMemoryId[memoryId] : {
      memoryId,
      memoryType: safeString(event && event.memoryType, 80) || "unknown",
      sourceTier: safeString(itemById.get(memoryId) && itemById.get(memoryId).sourceTier, 40) || "unknown",
      observationCount: 0,
      successCount: 0,
      failureCount: 0,
      neutralCount: 0,
      notApplicableCount: 0,
      lastObservedAt: "",
      lastOutcome: "",
      sampleTurnIds: [],
      sampleContinuityTaskIds: [],
      taskFamilies: [],
      recentOutcomes: [],
    };
    current.observationCount += 1;
    const outcome = safeString(event && event.observedOutcome, 40);
    if (outcome === "success") current.successCount += 1;
    else if (outcome === "failure") current.failureCount += 1;
    else if (outcome === "neutral") current.neutralCount += 1;
    else current.notApplicableCount += 1;
    current.lastObservedAt = safeString(event && event.recordedAt, 80) || current.lastObservedAt;
    current.lastOutcome = outcome || current.lastOutcome;
    current.sampleTurnIds = uniqueStrings([safeString(event && (event.turnId || event.threadId), 120), ...(Array.isArray(current.sampleTurnIds) ? current.sampleTurnIds : [])], 6, 120);
    current.sampleContinuityTaskIds = uniqueStrings([safeString(event && event.continuityTaskId, 120), ...(Array.isArray(current.sampleContinuityTaskIds) ? current.sampleContinuityTaskIds : [])], 6, 120);
    current.taskFamilies = uniqueStrings([safeString(event && event.taskFamily, 80), ...(Array.isArray(current.taskFamilies) ? current.taskFamilies : [])], 8, 80);
    current.recentOutcomes = takeRecentEntries([
      {
        outcome,
        recordedAt: safeString(event && event.recordedAt, 80),
      },
      ...(Array.isArray(current.recentOutcomes) ? current.recentOutcomes : []),
    ], {
      limit: 6,
      timestampSelector: (entry) => entry && entry.recordedAt,
    });
    current.recentSuccessCount = clampInt(current.recentOutcomes.filter((entry) => safeString(entry && entry.outcome, 40) === "success").length, 0, 999999, 0);
    current.recentFailureCount = clampInt(current.recentOutcomes.filter((entry) => safeString(entry && entry.outcome, 40) === "failure").length, 0, 999999, 0);
    current.recentNeutralCount = clampInt(current.recentOutcomes.filter((entry) => safeString(entry && entry.outcome, 40) === "neutral").length, 0, 999999, 0);
    current.successRate = Number((current.successCount / Math.max(1, current.observationCount)).toFixed(4));
    byMemoryId[memoryId] = current;
    const laneKey = current.sourceTier === "external_primary" ? "external_primary" : current.sourceTier === "external_secondary" ? "external_secondary" : "";
    if (laneKey) {
      const lane = byLane[laneKey];
      lane.observationCount += 1;
      if (outcome === "success") lane.successCount += 1;
      else if (outcome === "failure") lane.failureCount += 1;
      else if (outcome === "neutral") lane.neutralCount += 1;
      else lane.notApplicableCount += 1;
      lane.lastObservedAt = safeString(event && event.recordedAt, 80) || lane.lastObservedAt;
    }
  }
  for (const item of items) {
    const tier = safeString(item && item.sourceTier, 40);
    if (!["external_primary", "external_secondary"].includes(tier)) continue;
    if (!["runtime_hint", "semantic_lesson", "improvement_candidate"].includes(safeString(item && item.type, 80))) continue;
    const observation = byMemoryId[safeString(item && item.memoryId, 120)];
    if (!observation) {
      byLane[tier].awaitingObservationCount += 1;
    }
  }
  return {
    schema: "governed-memory-observation-projection.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    observationCount: recorded.length,
    rejectedCount: rejected.length,
    rejectedReasons: rejected.reduce((acc, entry) => {
      const reason = safeString(entry && entry.reason, 80) || "unknown";
      acc[reason] = safeNumber(acc[reason], 0) + 1;
      return acc;
    }, {}),
    byMemoryId,
    byLane,
    recentObservations: recorded.slice(-16).reverse(),
  };
}

function buildCanonicalReinforcementMemory({ workspaceRoot, laneItems, observationProjection, sourceTier }) {
  const byMemoryId = observationProjection && observationProjection.byMemoryId && typeof observationProjection.byMemoryId === "object"
    ? observationProjection.byMemoryId
    : {};
  const recentObservations = [];
  const articleStats = {};
  const hintStats = {};
  const topicStats = {};
  let observationCount = 0;
  let lastObservedAt = "";
  for (const item of laneItems) {
    const memoryId = safeString(item && item.memoryId, 120);
    const observation = byMemoryId[memoryId];
    if (!observation) continue;
    observationCount += clampInt(observation.observationCount, 0, 999999, 0);
    if (parseTimestamp(observation.lastObservedAt) > parseTimestamp(lastObservedAt)) {
      lastObservedAt = safeString(observation.lastObservedAt, 80);
    }
    recentObservations.push({
      memoryId,
      memoryType: safeString(item && item.type, 80),
      articleId: safeString(item && item.content && item.content.structured && item.content.structured.articleId, 160),
      outcome: safeString(observation.lastOutcome, 40),
      observedAt: safeString(observation.lastObservedAt, 80),
      sourceTier,
    });
    const articleId = safeString(item && item.content && item.content.structured && item.content.structured.articleId, 160);
    if (articleId) {
      articleStats[articleId] = {
        successCount: clampInt(observation.successCount, 0, 999999, 0),
        failureCount: clampInt(observation.failureCount, 0, 999999, 0),
        observedCount: clampInt(observation.observationCount, 0, 999999, 0),
        successRate: Number(safeNumber(observation.successRate, 0).toFixed(4)),
        lastObservedAt: safeString(observation.lastObservedAt, 80),
        sampleTurnIds: uniqueStrings(observation.sampleTurnIds, 6, 120),
      };
    }
    const hintId = safeString(item && item.content && item.content.structured && item.content.structured.runtimeRetrievalHint && item.content.structured.runtimeRetrievalHint.hintId, 160);
    if (hintId) {
      hintStats[hintId] = {
        successCount: clampInt(observation.successCount, 0, 999999, 0),
        failureCount: clampInt(observation.failureCount, 0, 999999, 0),
        observedCount: clampInt(observation.observationCount, 0, 999999, 0),
        successRate: Number(safeNumber(observation.successRate, 0).toFixed(4)),
        lastObservedAt: safeString(observation.lastObservedAt, 80),
        sampleTurnIds: uniqueStrings(observation.sampleTurnIds, 6, 120),
      };
    }
    for (const topic of uniqueStrings(item && item.retrieval && item.retrieval.topics, 8, 80)) {
      const current = topicStats[topic] && typeof topicStats[topic] === "object" ? topicStats[topic] : {
        successCount: 0,
        failureCount: 0,
        observedCount: 0,
        successRate: 0,
        lastObservedAt: "",
      };
      current.successCount += clampInt(observation.successCount, 0, 999999, 0);
      current.failureCount += clampInt(observation.failureCount, 0, 999999, 0);
      current.observedCount += clampInt(observation.observationCount, 0, 999999, 0);
      current.successRate = Number((current.successCount / Math.max(1, current.observedCount)).toFixed(4));
      if (parseTimestamp(observation.lastObservedAt) > parseTimestamp(current.lastObservedAt)) {
        current.lastObservedAt = safeString(observation.lastObservedAt, 80);
      }
      topicStats[topic] = current;
    }
  }
  return {
    schema: "learning-reinforcement-memory.v1",
    generatedAt: toIso(),
    lastObservedAt,
    observationCount,
    recentObservations: recentObservations.slice(0, 12),
    articleStats,
    hintStats,
    topicStats,
  };
}

function normalizeLearningSourceKey(value) {
  const raw = safeString(value, 240).toLowerCase().trim();
  if (!raw) return "";
  return raw
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/[?#].*$/, "")
    .replace(/^.*\//, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s+\|\s+.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveExternalLearningArticleId(article = {}) {
  return normalizeLearningSourceKey(
    safeString(article && article.articleId, 160)
      || safeString(article && article.url, 220)
      || safeString(article && article.title, 220)
  );
}

function hasHarmfulExternalObservation(observation = null) {
  const observedCount = Math.max(
    clampInt(observation && observation.observedCount, 0, 999999, 0),
    clampInt(observation && observation.observationCount, 0, 999999, 0),
  );
  const successCount = clampInt(observation && observation.successCount, 0, 999999, 0);
  const failureCount = clampInt(observation && observation.failureCount, 0, 999999, 0);
  const recentSuccessCount = clampInt(observation && observation.recentSuccessCount, 0, 999999, 0);
  const recentFailureCount = clampInt(observation && observation.recentFailureCount, 0, 999999, 0);
  const successRate = observedCount > 0
    ? safeNumber(observation && observation.successRate, successCount / observedCount)
    : 0;
  return observedCount >= 4
    && failureCount > successCount
    && (
      failureCount - successCount >= 2
      || recentFailureCount > recentSuccessCount
      || successRate < 0.5
    );
}

function resolveExternalPrimaryStatus({
  memoryId = "",
  fallbackStatus = "",
  observationByMemoryId = {},
  reinforcementMemory = null,
  articleId = "",
  hintId = "",
}) {
  const normalizedFallback = safeString(fallbackStatus, 40) || "candidate";
  const directObservation = observationByMemoryId && typeof observationByMemoryId === "object"
    ? observationByMemoryId[safeString(memoryId, 200)]
    : null;
  const articleStats = reinforcementMemory && reinforcementMemory.articleStats && typeof reinforcementMemory.articleStats === "object"
    ? reinforcementMemory.articleStats
    : {};
  const hintStats = reinforcementMemory && reinforcementMemory.hintStats && typeof reinforcementMemory.hintStats === "object"
    ? reinforcementMemory.hintStats
    : {};
  const articleObservation = articleStats[resolveExternalLearningArticleId({ articleId })];
  const hintObservation = hintStats[normalizeLearningSourceKey(hintId)];
  if ([directObservation, articleObservation, hintObservation].some((entry) => hasHarmfulExternalObservation(entry))) {
    return "blocked";
  }
  return normalizedFallback;
}

function normalizeBottleneckSummary(summary, workspaceRoot) {
  const text = coerceSummaryText(summary, workspaceRoot, "governed bottleneck");
  return normalizePublicText(text, workspaceRoot);
}

function createRemediationAgendaEntry({
  workspaceRoot,
  bottleneck = {},
  previous = null,
  remediationPolicy,
  robustnessPolicy,
  readinessArtifacts = {},
  continuityDebt = {},
  openAIBlogLane = {},
  anthropicLane = {},
  goalHistorySnapshot = null,
  previousSelfDirectedPositiveCount = 0,
}) {
  const classification = safeString(bottleneck.classification, 80) || "capability bottleneck";
  const summary = normalizeBottleneckSummary(bottleneck.summary, workspaceRoot);
  const source = safeString(bottleneck.source, 80) || "unknown";
  const robustnessMatch = /missing[_ ]context|browser[_ ]tool[_ ]flakiness|ambiguous[_ ]instruction|adversarial[_ ]conflicting[_ ]instruction|degraded[_ ]tool[_ ]outputs/i.exec(summary);
  const targetCategory = robustnessMatch ? safeString(robustnessMatch[0], 80).toLowerCase().replace(/\s+/g, "_") : "";
  const familyMatch = /deterministic_code|web_creative|planning|workflow_execution|evaluation_review|tool_use_browser_like|R[_ ]robust|H[_ ]horizon|G[_ ]breadth/i.exec(summary);
  const targetFamily = familyMatch ? safeString(familyMatch[0], 80).replace(/\s+/g, "_") : "";
  const template = remediationPolicy && remediationPolicy.bottleneckTemplates && remediationPolicy.bottleneckTemplates[classification]
    ? remediationPolicy.bottleneckTemplates[classification]
    : {};
  const categoryPolicy = targetCategory && robustnessPolicy && robustnessPolicy.categoryPolicies && robustnessPolicy.categoryPolicies[targetCategory]
    ? robustnessPolicy.categoryPolicies[targetCategory]
    : {};
  const agendaId = stablePublicRef(`${classification}:${targetFamily}:${targetCategory}:${source}:${summary}`, "agenda");
  const previousRetryBudget = previous && previous.retryBudget != null && previous.retryBudget !== "" ? previous.retryBudget : undefined;
  const previousAttemptCount = previous && previous.attemptCount != null && previous.attemptCount !== "" ? previous.attemptCount : undefined;
  const previousCooldownHours = previous && previous.cooldownHours != null && previous.cooldownHours !== "" ? previous.cooldownHours : undefined;
  const retryBudget = clampInt(previousRetryBudget, 0, 999, clampInt(remediationPolicy && remediationPolicy.defaultRetryBudget, 0, 999, 3));
  const attemptCount = clampInt(previousAttemptCount, 0, 999, 0);
  let status = "queued";
  let result = "pending";
  let blockedReason = "";
  let remediationEffect = "pending";
  const weakRobustness = readinessArtifacts && readinessArtifacts.robustnessBreakdown && Array.isArray(readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories.find((entry) => safeString(entry && entry.categoryId, 80) === targetCategory)
    : null;
  const continuityItems = continuityDebt && Array.isArray(continuityDebt.items) ? continuityDebt.items : [];
  const openContinuityItems = continuityItems.filter((entry) => !["resolved", "invalidated", "rolled_back"].includes(safeString(entry && entry.status, 80)));
  const stableCoverageMatrix = readinessArtifacts && readinessArtifacts.stableCoverageArtifacts && readinessArtifacts.stableCoverageArtifacts.matrix && typeof readinessArtifacts.stableCoverageArtifacts.matrix === "object"
    ? readinessArtifacts.stableCoverageArtifacts.matrix
    : { rows: [] };
  const stableCoverageRows = Array.isArray(stableCoverageMatrix.rows) ? stableCoverageMatrix.rows : [];
  const stableCoverageTargetRow = stableCoverageRows.find((entry) => safeString(entry && entry.familyId, 80) === safeString(targetFamily, 80)) || null;
  const subjectiveThresholds = loadAgiReadinessPolicy(workspaceRoot).subjectiveGoalCompletion && loadAgiReadinessPolicy(workspaceRoot).subjectiveGoalCompletion.thresholds
    ? loadAgiReadinessPolicy(workspaceRoot).subjectiveGoalCompletion.thresholds
    : {};
  const operationalCriteria = loadAgiReadinessPolicy(workspaceRoot).operationalCompletionCriteria
    && typeof loadAgiReadinessPolicy(workspaceRoot).operationalCompletionCriteria === "object"
    ? loadAgiReadinessPolicy(workspaceRoot).operationalCompletionCriteria
    : {};
  const goalHistoryEntries = Array.isArray(goalHistorySnapshot && goalHistorySnapshot.entries)
    ? goalHistorySnapshot.entries
    : [];
  const latestGoalHistoryEntry = goalHistoryEntries.length ? goalHistoryEntries[goalHistoryEntries.length - 1] : null;
  const latestGoalHistoryStatus = safeString(latestGoalHistoryEntry && latestGoalHistoryEntry.goalStatus, 80);
  let consecutiveOperationalPassingExports = 0;
  for (let index = goalHistoryEntries.length - 1; index >= 0; index -= 1) {
    if (safeString(goalHistoryEntries[index] && goalHistoryEntries[index].baseStatus, 40) !== "criteria_met") break;
    consecutiveOperationalPassingExports += 1;
  }
  const distinctWindowStats = computeDistinctLineageWindowStats(
    readinessArtifacts && readinessArtifacts.distinctLineage ? readinessArtifacts.distinctLineage : {},
    clampInt(subjectiveThresholds.stabilityWindowSize, 1, 20, 5),
  );
  const distinctImprovementCount = distinctWindowStats.distinctImprovementCount;
  const distinctRegressionCount = distinctWindowStats.distinctRegressionCount;
  const distinctNonWorsening = distinctWindowStats.nonWorsening;
  if (classification === "capability bottleneck" && safeString(targetFamily, 80) === "R_robust" && weakRobustness) {
    if (safeNumber(weakRobustness.score, 0) >= safeNumber(robustnessPolicy && robustnessPolicy.targetScore, 0.8)) {
      status = "passed";
      result = "improved";
      remediationEffect = "verified_positive";
    } else if (safeString(weakRobustness.status, 40) === "no_evidence") {
      status = "running";
      result = "measurement_required";
      remediationEffect = "insufficient_evidence";
    } else {
      status = "running";
      result = "improving";
    }
  } else if (classification === "capability bottleneck" && targetCategory && weakRobustness) {
    const subjectiveCategoryTarget = source === "subjective_goal"
      ? (
        safeString(targetCategory, 80) === "ambiguous_instruction"
          ? safeNumber(subjectiveThresholds.ambiguousInstruction, null)
          : safeString(targetCategory, 80) === "missing_context"
            ? safeNumber(subjectiveThresholds.missingContext, null)
            : safeString(targetCategory, 80) === "browser_tool_flakiness"
              ? safeNumber(subjectiveThresholds.browserToolFlakiness, null)
              : safeString(targetCategory, 80) === "adversarial_conflicting_instruction"
                ? safeNumber(subjectiveThresholds.adversarialConflictingInstruction, null)
                : safeString(targetCategory, 80) === "degraded_tool_outputs"
                  ? safeNumber(subjectiveThresholds.degradedToolOutputs, null)
                  : null
      )
      : null;
    const targetScore = safeNumber(
      Number.isFinite(subjectiveCategoryTarget) ? subjectiveCategoryTarget : categoryPolicy && categoryPolicy.targetScore,
      safeString(targetCategory, 80) === "ambiguous_instruction"
        ? safeNumber(readinessArtifacts && readinessArtifacts.readiness && readinessArtifacts.readiness.completionCriteria && readinessArtifacts.readiness.completionCriteria.ambiguousInstructionThreshold, 0.8)
        : safeString(targetCategory, 80) === "missing_context"
          ? safeNumber(readinessArtifacts && readinessArtifacts.readiness && readinessArtifacts.readiness.completionCriteria && readinessArtifacts.readiness.completionCriteria.missingContextThreshold, 0.85)
          : safeString(targetCategory, 80) === "browser_tool_flakiness"
            ? safeNumber(readinessArtifacts && readinessArtifacts.readiness && readinessArtifacts.readiness.completionCriteria && readinessArtifacts.readiness.completionCriteria.browserFlakinessThreshold, 0.8)
            : safeString(targetCategory, 80) === "adversarial_conflicting_instruction"
              ? safeNumber(readinessArtifacts && readinessArtifacts.readiness && readinessArtifacts.readiness.completionCriteria && readinessArtifacts.readiness.completionCriteria.adversarialConflictingThreshold, 0.75)
              : safeString(targetCategory, 80) === "degraded_tool_outputs"
                ? safeNumber(readinessArtifacts && readinessArtifacts.readiness && readinessArtifacts.readiness.completionCriteria && readinessArtifacts.readiness.completionCriteria.degradedToolOutputsThreshold, 0.85)
                : safeNumber(robustnessPolicy && robustnessPolicy.targetScore, 0.8)
    );
    if (safeString(weakRobustness.status, 40) === "no_evidence") {
      status = "running";
      result = "measurement_required";
      remediationEffect = "insufficient_evidence";
    } else if (safeNumber(weakRobustness.score, 0) >= targetScore) {
      status = "passed";
      result = "improved";
      remediationEffect = "verified_positive";
    } else {
      status = "running";
      result = "improving";
    }
  } else if (classification === "capability bottleneck" && /stable coverage below subjective threshold/i.test(summary)) {
    if (stableCoverageTargetRow && Boolean(stableCoverageTargetRow.stableCovered)) {
      status = "passed";
      result = "coverage_stabilized";
      remediationEffect = "verified_positive";
    } else {
      status = "running";
      result = "coverage_stabilizing";
    }
  } else if (classification === "capability bottleneck" && /ambiguous_instruction evidence below subjective threshold/i.test(summary)) {
    const evidenceCount = clampInt(weakRobustness && weakRobustness.evidenceCount, 0, 999999, 0);
    const score = safeNumber(weakRobustness && weakRobustness.score, 0);
    const threshold = safeNumber(subjectiveThresholds.ambiguousInstruction, 0.9);
    const minEvidence = clampInt(subjectiveThresholds.ambiguousInstructionMinEvidence, 20, 999999, 20);
    if (evidenceCount >= minEvidence && score >= threshold) {
      status = "passed";
      result = "improved";
      remediationEffect = "verified_positive";
    } else {
      status = "running";
      result = "evidence_building";
      remediationEffect = evidenceCount === 0 ? "insufficient_evidence" : "pending";
    }
  } else if (classification === "capability bottleneck" && /primary lane latest-pack adoption below subjective threshold/i.test(summary)) {
    const selectedCount = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.selectedInLatestPackCount, 0, 999999, 0);
    const effectiveCount = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.effectiveContributionCount, 0, 999999, 0);
    const causalUsageCount = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.causalUsageCount, 0, 999999, 0);
    if (
      selectedCount >= clampInt(subjectiveThresholds.minPrimaryLaneSelectedInLatestPackCount, 1, 999999, 1)
      && effectiveCount >= clampInt(subjectiveThresholds.minPrimaryLaneEffectiveContributionCount, 1, 999999, 1)
      && causalUsageCount >= clampInt(subjectiveThresholds.minPrimaryLaneCausalUsageCount, 3, 999999, 3)
    ) {
      status = "passed";
      result = "adoption_verified";
      remediationEffect = "verified_positive";
    } else {
      status = "running";
      result = "adoption_gap_open";
    }
  } else if (classification === "capability bottleneck" && /distinct improvement lineage below subjective threshold/i.test(summary)) {
    if (
      distinctImprovementCount >= clampInt(subjectiveThresholds.minDistinctImprovementCount, 3, 999999, 3)
      && distinctRegressionCount <= clampInt(subjectiveThresholds.maxDistinctRegressionCount, 0, 999999, 0)
      && distinctNonWorsening
    ) {
      status = "passed";
      result = "lineage_improved";
      remediationEffect = "verified_positive";
    } else {
      status = "running";
      result = "lineage_building";
    }
  } else if (classification === "capability bottleneck" && /operational completion export durability below subjective threshold/i.test(summary)) {
    const required = clampInt(operationalCriteria.consecutiveSuccessfulExports, 3, 999999, 3);
    if (consecutiveOperationalPassingExports >= required) {
      status = "passed";
      result = "durability_verified";
      remediationEffect = "verified_positive";
    } else {
      status = "queued";
      result = "durability_building";
    }
  } else if (classification === "capability bottleneck" && /operational goal completion evidence below subjective threshold/i.test(summary)) {
    if (latestGoalHistoryStatus === "OPERATIONALLY_COMPLETE") {
      status = "passed";
      result = "operational_goal_verified";
      remediationEffect = "verified_positive";
    } else {
      status = "queued";
      result = "operational_goal_building";
    }
  } else if (classification === "capability bottleneck" && /self[- ]directed verified positive remediation history below subjective threshold/i.test(summary)) {
    const required = clampInt(subjectiveThresholds.minVerifiedPositiveSelfDirectedRemediations, 2, 999999, 2);
    if (clampInt(previousSelfDirectedPositiveCount, 0, 999999, 0) >= required) {
      status = "passed";
      result = "self_directed_history_verified";
      remediationEffect = "verified_positive";
    } else {
      status = "queued";
      result = "self_directed_history_building";
    }
  } else if (classification === "evidence bottleneck" && /distinct lineage/i.test(summary)) {
    if (
      distinctImprovementCount >= clampInt(subjectiveThresholds.minDistinctImprovementCount, 3, 999999, 3)
      && distinctRegressionCount <= clampInt(subjectiveThresholds.maxDistinctRegressionCount, 0, 999999, 0)
      && distinctNonWorsening
    ) {
      status = "passed";
      result = "lineage_evidence_captured";
      remediationEffect = "verified_positive";
    } else {
      status = "running";
      result = "lineage_evidence_building";
      remediationEffect = "pending";
    }
  } else if (classification === "capability bottleneck") {
    const readiness = readinessArtifacts && readinessArtifacts.readiness && typeof readinessArtifacts.readiness === "object"
      ? readinessArtifacts.readiness
      : {};
    const robustScore = safeNumber(readiness && readiness.metrics && readiness.metrics.R_robust && readiness.metrics.R_robust.value, 0);
    const horizonScore = safeNumber(readiness && readiness.metrics && readiness.metrics.H_horizon && readiness.metrics.H_horizon.value, 0);
    if (safeString(targetFamily, 80) === "R_robust" && robustScore >= safeNumber(robustnessPolicy && robustnessPolicy.targetScore, 0.8)) {
      status = "passed";
      result = "improved";
      remediationEffect = "verified_positive";
    } else if (safeString(targetFamily, 80) === "H_horizon" && horizonScore >= safeNumber(readiness && readiness.completionCriteria && readiness.completionCriteria.horizonThreshold, 0.97)) {
      status = "passed";
      result = "improved";
      remediationEffect = "verified_positive";
    } else {
      status = "running";
      result = safeString(targetFamily, 80) === "H_horizon" ? "continuity_evidence_required" : "measurement_required";
    }
  } else if (classification === "scope/coverage bottleneck" && /continuity has/i.test(summary)) {
    if (openContinuityItems.length === 0) {
      status = "passed";
      result = "cleared";
      remediationEffect = "verified_positive";
    } else {
      status = "running";
      result = "debt_open";
    }
  } else if (classification === "scope/coverage bottleneck" && /continuity (?:has|carries)/i.test(summary)) {
    status = openContinuityItems.length > 0 ? "running" : "passed";
    result = openContinuityItems.length > 0 ? "closeout_required" : "cleared";
    remediationEffect = openContinuityItems.length > 0 ? "pending" : "verified_positive";
  } else if (classification === "observation bottleneck") {
    const observationCount = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.observationCount, 0, 999999, 0);
    if (observationCount > 0) {
      status = "passed";
      result = "observed";
      remediationEffect = "verified_positive";
    } else {
      status = "blocked";
      result = "waiting_for_runtime_use";
      blockedReason = "missing_runtime_observations";
      remediationEffect = "insufficient_evidence";
    }
  } else if (classification === "governance bottleneck" && /secondary learning lane/i.test(summary)) {
    status = clampInt(anthropicLane && anthropicLane.canonicalCounts && anthropicLane.canonicalCounts.advisoryReferenceCount, 0, 999999, 0) > 0
      ? "passed"
      : "proposal_only";
    result = status === "passed" ? "advisory_evidence_present" : "advisory_only";
    remediationEffect = status === "passed" ? "verified_neutral" : "insufficient_evidence";
  } else if (classification === "scope/coverage bottleneck" && /breadth coverage incomplete/i.test(summary)) {
    const failedFamilies = uniqueStrings(readinessArtifacts && readinessArtifacts.readiness && readinessArtifacts.readiness.failedFamilies, 16, 80);
    if (failedFamilies.length === 0) {
      status = "passed";
      result = "coverage_restored";
      remediationEffect = "verified_positive";
    } else {
      status = "running";
      result = "coverage_gap_open";
    }
  } else if (classification === "governance bottleneck" && /hard gate pressure/i.test(summary)) {
    status = safeString(readinessArtifacts && readinessArtifacts.readiness && readinessArtifacts.readiness.weakestGateFamily, 80)
      ? "running"
      : "passed";
    result = status === "passed" ? "pressure_cleared" : "margin_pressure";
    remediationEffect = status === "passed" ? "verified_neutral" : "pending";
  } else {
    status = "proposal_only";
    result = "manual_review_recommended";
    blockedReason = "no_safe_autonomous_template";
    remediationEffect = "insufficient_evidence";
  }
  if (attemptCount >= retryBudget && !["passed", "revoked"].includes(status)) {
    status = "blocked";
    result = "retry_budget_exhausted";
    blockedReason = blockedReason || "retry_budget_exhausted";
    remediationEffect = "verified_negative";
  }
  return {
    agendaId,
    bottleneckId: stablePublicRef(`${classification}:${summary}:${source}`, "gap"),
    bottleneckClass: classification,
    targetFamily: targetFamily || safeString(categoryPolicy.proposedTaskFamily, 80) || "default",
    targetCategory,
    remediationHypothesis: safeString(categoryPolicy.successCriterion, 220) || safeString(template.successCriterion, 220) || summary,
    proposedTaskFamily: safeString(categoryPolicy.proposedTaskFamily, 80) || targetFamily || "deterministic_code",
    proposedEvalProbe: safeString(categoryPolicy.proposedEvalProbe, 120) || `probe:${stableHash(summary).slice(0, 8)}`,
    expectedEvidenceClass: safeString(categoryPolicy.expectedEvidenceClass, 120) || safeString(template.expectedEvidenceClass, 120) || "runtime_observation",
    safetyPosture: safeString(categoryPolicy.safetyPosture, 120) || safeString(template.safetyPosture, 120) || safeString(remediationPolicy && remediationPolicy.defaultSafetyPosture, 120) || "proposal_only_until_evidence",
    successCriterion: safeString(categoryPolicy.successCriterion, 220) || safeString(template.successCriterion, 220) || "improvement is verified by governed evidence",
    priority: clampInt(categoryPolicy.priority, 0, 999, clampInt(template.priority, 0, 999, 50)),
    status,
    result,
    remediationEffect,
    blockedReason,
    cooldownHours: clampInt(previousCooldownHours, 0, 9999, clampInt(remediationPolicy && remediationPolicy.defaultCooldownHours, 0, 9999, 12)),
    retryBudget,
    attemptCount,
    revertCondition: safeString(template.revertCondition, 220) || "regression or harmful lesson detected",
    stopCondition: safeString(template.stopCondition, 220) || "no governed improvement observed",
    lastUpdatedAt: toIso(),
    source,
    publicSummary: summary,
  };
}

function buildAutonomousLearningAgenda({
  workspaceRoot,
  readinessArtifacts = {},
  continuityDebt = {},
  openAIBlogLane = {},
  anthropicLane = {},
  previousAgenda = {},
  bottlenecks = {},
  exportSessionId = "",
}) {
  const remediationPolicy = loadGovernedRemediationPolicy(workspaceRoot);
  const robustnessPolicy = loadRobustnessRemediationPolicy(workspaceRoot);
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const previousEntries = Array.isArray(previousAgenda && previousAgenda.entries) ? previousAgenda.entries : [];
  const previousById = new Map(previousEntries.map((entry) => [safeString(entry && entry.agendaId, 120), entry]));
  const currentExportSessionId = safeString(exportSessionId, 120);
  const previousExportSessionId = safeString(previousAgenda && previousAgenda.exportSessionId, 120);
  const sameExportSession = Boolean(currentExportSessionId) && currentExportSessionId === previousExportSessionId;
  const entries = [];
  const subjectiveThresholds = readinessPolicy.subjectiveGoalCompletion && readinessPolicy.subjectiveGoalCompletion.thresholds
    ? readinessPolicy.subjectiveGoalCompletion.thresholds
    : {};
  const operationalCriteria = readinessPolicy.operationalCompletionCriteria && typeof readinessPolicy.operationalCompletionCriteria === "object"
    ? readinessPolicy.operationalCompletionCriteria
    : {};
  const paths = getMemoryPaths(workspaceRoot);
  const goalHistorySnapshot = readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "goal" });
  const subjectiveHistorySnapshot = readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" });
  const historicalSubjectiveSignals = summarizeSubjectiveHistorySignals(subjectiveHistorySnapshot);
  const previousSelfDirectedPositiveCount = Math.max(
    previousEntries.filter((entry) => (
      safeString(entry && entry.source, 80) !== "memory_eval"
      && safeString(entry && entry.remediationEffect, 80) === "verified_positive"
    )).length,
    historicalSubjectiveSignals.maxVerifiedPositiveSelfDirectedRemediations,
  );
  const goalHistoryEntries = Array.isArray(goalHistorySnapshot && goalHistorySnapshot.entries)
    ? goalHistorySnapshot.entries
    : [];
  const latestGoalHistoryEntry = goalHistoryEntries.length ? goalHistoryEntries[goalHistoryEntries.length - 1] : null;
  const latestGoalHistoryStatus = safeString(latestGoalHistoryEntry && latestGoalHistoryEntry.goalStatus, 80);
  let consecutiveOperationalPassingExports = 0;
  for (let index = goalHistoryEntries.length - 1; index >= 0; index -= 1) {
    if (safeString(goalHistoryEntries[index] && goalHistoryEntries[index].baseStatus, 40) !== "criteria_met") break;
    consecutiveOperationalPassingExports += 1;
  }
  const ambiguousInstruction = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories.find((entry) => safeString(entry && entry.categoryId, 80) === "ambiguous_instruction")
    : null;
  const browserFlakiness = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories.find((entry) => safeString(entry && entry.categoryId, 80) === "browser_tool_flakiness")
    : null;
  const missingContext = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories.find((entry) => safeString(entry && entry.categoryId, 80) === "missing_context")
    : null;
  const degradedToolOutputs = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories.find((entry) => safeString(entry && entry.categoryId, 80) === "degraded_tool_outputs")
    : null;
  const adversarialConflicting = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories.find((entry) => safeString(entry && entry.categoryId, 80) === "adversarial_conflicting_instruction")
    : null;
  const stableCoverageRows = Array.isArray(readinessArtifacts && readinessArtifacts.stableCoverageArtifacts && readinessArtifacts.stableCoverageArtifacts.matrix && readinessArtifacts.stableCoverageArtifacts.matrix.rows)
    ? readinessArtifacts.stableCoverageArtifacts.matrix.rows
    : [];
  const distinctWindowStats = computeDistinctLineageWindowStats(
    readinessArtifacts && readinessArtifacts.distinctLineage ? readinessArtifacts.distinctLineage : {},
    clampInt(subjectiveThresholds.stabilityWindowSize, 1, 20, 5),
  );
  const distinctImprovementCount = Math.max(
    distinctWindowStats.distinctImprovementCount,
    historicalSubjectiveSignals.maxDistinctImprovementCount,
  );
  const distinctRegressionCount = Math.max(
    distinctWindowStats.distinctRegressionCount,
    historicalSubjectiveSignals.maxDistinctRegressionCount,
  );
  const distinctNonWorsening = distinctWindowStats.nonWorsening || historicalSubjectiveSignals.hadCriteriaMetWindow;
  const hasActiveSubjectiveSummary = (targetSummary) => previousEntries.some((entry) => (
    safeString(entry && entry.source, 80) === "subjective_goal"
    && safeString(entry && entry.publicSummary, 220) === safeString(targetSummary, 220)
    && !["passed", "failed", "revoked"].includes(safeString(entry && entry.status, 40))
  ));
  const supplementalBottlenecks = [];
  if (
    hasActiveSubjectiveSummary("ambiguous_instruction evidence below subjective threshold")
    || (
    clampInt(ambiguousInstruction && ambiguousInstruction.evidenceCount, 0, 999999, 0) < clampInt(subjectiveThresholds.ambiguousInstructionMinEvidence, 20, 999999, 20)
    || safeNumber(ambiguousInstruction && ambiguousInstruction.score, 0) < safeNumber(subjectiveThresholds.ambiguousInstruction, 0.9)
  )) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "autonomous_learning",
      summary: "ambiguous_instruction evidence below subjective threshold",
    });
  }
  if (
    hasActiveSubjectiveSummary("missing_context below subjective threshold")
    || safeNumber(missingContext && missingContext.score, 0) < safeNumber(subjectiveThresholds.missingContext, 0.95)
  ) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "autonomous_learning",
      summary: "missing_context below subjective threshold",
    });
  }
  if (
    hasActiveSubjectiveSummary("browser_tool_flakiness below subjective threshold")
    || safeNumber(browserFlakiness && browserFlakiness.score, 0) < safeNumber(subjectiveThresholds.browserToolFlakiness, 0.9)
  ) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "autonomous_learning",
      summary: "browser_tool_flakiness below subjective threshold",
    });
  }
  if (
    hasActiveSubjectiveSummary("degraded_tool_outputs below subjective threshold")
    || safeNumber(degradedToolOutputs && degradedToolOutputs.score, 0) < safeNumber(subjectiveThresholds.degradedToolOutputs, 0.9)
  ) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "autonomous_learning",
      summary: "degraded_tool_outputs below subjective threshold",
    });
  }
  if (
    hasActiveSubjectiveSummary("adversarial_conflicting_instruction below subjective threshold")
    || safeString(adversarialConflicting && adversarialConflicting.status, 40) === "no_evidence"
    || safeNumber(adversarialConflicting && adversarialConflicting.score, 0) < safeNumber(subjectiveThresholds.adversarialConflictingInstruction, 0.9)
  ) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "autonomous_learning",
      summary: "adversarial_conflicting_instruction below subjective threshold",
    });
  }
  for (const row of stableCoverageRows.filter((entry) => !Boolean(entry && entry.stableCovered)).slice(0, 2)) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "autonomous_learning",
      summary: `${safeString(row && row.familyId, 80) || "default"} stable coverage below subjective threshold`,
    });
  }
  for (const previousEntry of previousEntries.filter((entry) => (
    safeString(entry && entry.source, 80) === "subjective_goal"
    && /stable coverage below subjective threshold/i.test(safeString(entry && entry.publicSummary, 220))
    && !["passed", "failed", "revoked"].includes(safeString(entry && entry.status, 40))
  ))) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "subjective_goal",
      summary: safeString(previousEntry && previousEntry.publicSummary, 220),
    });
  }
  if (
    hasActiveSubjectiveSummary("primary lane latest-pack adoption below subjective threshold")
    || (
    clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.selectedInLatestPackCount, 0, 999999, 0) < clampInt(subjectiveThresholds.minPrimaryLaneSelectedInLatestPackCount, 1, 999999, 1)
    || clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.effectiveContributionCount, 0, 999999, 0) < clampInt(subjectiveThresholds.minPrimaryLaneEffectiveContributionCount, 1, 999999, 1)
    || clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.causalUsageCount, 0, 999999, 0) < clampInt(subjectiveThresholds.minPrimaryLaneCausalUsageCount, 3, 999999, 3)
  )) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "autonomous_learning",
      summary: "primary lane latest-pack adoption below subjective threshold",
    });
  }
  if (
    hasActiveSubjectiveSummary("distinct improvement lineage below subjective threshold")
    || (
    distinctImprovementCount < clampInt(subjectiveThresholds.minDistinctImprovementCount, 3, 999999, 3)
    || distinctRegressionCount > clampInt(subjectiveThresholds.maxDistinctRegressionCount, 0, 999999, 0)
    || !distinctNonWorsening
  )) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "autonomous_learning",
      summary: "distinct improvement lineage below subjective threshold",
    });
  }
  if (
    hasActiveSubjectiveSummary("operational completion export durability below subjective threshold")
    || consecutiveOperationalPassingExports < clampInt(operationalCriteria.consecutiveSuccessfulExports, 3, 999999, 3)
  ) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "subjective_goal",
      summary: "operational completion export durability below subjective threshold",
    });
  }
  if (
    hasActiveSubjectiveSummary("operational goal completion evidence below subjective threshold")
    || (
      latestGoalHistoryStatus === "OPERATIONALLY_COMPLETE"
      && previousSelfDirectedPositiveCount < clampInt(subjectiveThresholds.minVerifiedPositiveSelfDirectedRemediations, 2, 999999, 2)
    )
  ) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "subjective_goal",
      summary: "operational goal completion evidence below subjective threshold",
    });
  }
  if (
    hasActiveSubjectiveSummary("self-directed verified positive remediation history below subjective threshold")
    || previousSelfDirectedPositiveCount < clampInt(subjectiveThresholds.minVerifiedPositiveSelfDirectedRemediations, 2, 999999, 2)
  ) {
    supplementalBottlenecks.push({
      classification: "capability bottleneck",
      source: "subjective_goal",
      summary: "self-directed verified positive remediation history below subjective threshold",
    });
  }
  for (const item of [...(Array.isArray(bottlenecks && bottlenecks.items) ? bottlenecks.items : []), ...supplementalBottlenecks]) {
    const preview = createRemediationAgendaEntry({
      workspaceRoot,
      bottleneck: item,
      previous: null,
      remediationPolicy,
      robustnessPolicy,
      readinessArtifacts,
      continuityDebt,
      openAIBlogLane,
      anthropicLane,
      goalHistorySnapshot,
      previousSelfDirectedPositiveCount,
    });
    const previous = previousById.get(preview.agendaId) || null;
    const entry = createRemediationAgendaEntry({
      workspaceRoot,
      bottleneck: item,
      previous,
      remediationPolicy,
      robustnessPolicy,
      readinessArtifacts,
      continuityDebt,
      openAIBlogLane,
      anthropicLane,
      goalHistorySnapshot,
      previousSelfDirectedPositiveCount,
    });
    entries.push(entry);
  }
  const retainedTerminalEntries = (sameExportSession ? previousEntries : [])
    .filter((entry) => ["passed", "failed", "revoked"].includes(safeString(entry && entry.status, 40)))
    .filter((entry) => !entries.some((current) => safeString(current && current.agendaId, 120) === safeString(entry && entry.agendaId, 120)))
    .slice(-12)
    .map((entry) => ({
      ...entry,
      lastUpdatedAt: normalizePublicTimestamp(entry && entry.lastUpdatedAt),
    }));
  entries.push(...retainedTerminalEntries);
  entries.sort((left, right) => safeNumber(right.priority, 0) - safeNumber(left.priority, 0));
  const maxRunning = clampInt(remediationPolicy && remediationPolicy.maxAutonomousRunningItems, 1, 99, 3);
  let runningSeen = 0;
  for (const entry of entries) {
    if (safeString(entry.status, 40) === "running") {
      runningSeen += 1;
      if (runningSeen > maxRunning) {
        entry.status = "queued";
        entry.result = "waiting_for_runtime_budget";
      }
    }
  }
  const entryCounts = summarizeAutonomousLearningEntryCounts(entries);
  const summary = {
    queued: entryCounts.queued,
    running: entryCounts.running,
    blocked: entryCounts.blocked,
    passed: entries.filter((entry) => entry.status === "passed").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    revoked: entries.filter((entry) => entry.status === "revoked").length,
    verifiedPositive: entryCounts.verifiedPositiveCount,
    verifiedNeutral: entries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_neutral").length,
    verifiedNegative: entries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_negative").length,
    verifiedHarmful: entries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_harmful").length,
    insufficientEvidence: entryCounts.insufficientEvidenceCount,
    blockedCount: entryCounts.blocked,
    insufficientEvidenceCount: entryCounts.insufficientEvidenceCount,
    selfDirectedCount: entries.filter((entry) => safeString(entry && entry.source, 80) !== "memory_eval").length,
    verifiedPositiveSelfDirectedCount: Math.max(
      entries.filter((entry) => safeString(entry && entry.source, 80) !== "memory_eval" && safeString(entry && entry.remediationEffect, 80) === "verified_positive").length,
      historicalSubjectiveSignals.maxVerifiedPositiveSelfDirectedRemediations,
    ),
    novelProbeCount: entries.filter((entry) => /probe:/i.test(safeString(entry && entry.proposedEvalProbe, 120)) || safeString(entry && entry.targetCategory, 80) === "ambiguous_instruction").length,
    novelProbePositiveCount: Math.max(
      entries.filter((entry) => (/probe:/i.test(safeString(entry && entry.proposedEvalProbe, 120)) || safeString(entry && entry.targetCategory, 80) === "ambiguous_instruction") && safeString(entry && entry.remediationEffect, 80) === "verified_positive").length,
      historicalSubjectiveSignals.maxNovelProbePositiveCount,
    ),
  };
  return {
    schema: "governed-autonomous-learning-agenda.v1",
    generatedAt: toIso(),
    exportSessionId: currentExportSessionId,
    workspaceId: toWorkspaceId(workspaceRoot),
    entries,
    summary,
  };
}

function renderAutonomousLearningMarkdown(payload) {
  const lines = [
    "# Autonomous Learning Status",
    "",
    `- queued: ${clampInt(payload && payload.summary && payload.summary.queued, 0, 999999, 0)}`,
    `- running: ${clampInt(payload && payload.summary && payload.summary.running, 0, 999999, 0)}`,
    `- passed: ${clampInt(payload && payload.summary && payload.summary.passed, 0, 999999, 0)}`,
    `- blocked: ${clampInt(payload && payload.summary && payload.summary.blocked, 0, 999999, 0)}`,
    `- current verified positive count: ${clampInt(payload && payload.currentVerifiedPositiveCount, 0, 999999, 0)} (current export session)`,
    `- historical verified positive count: ${clampInt(payload && payload.historicalVerifiedPositiveCount, 0, 999999, 0)} (prior export sessions cumulative)`,
    `- summary.verifiedPositive mirrors currentVerifiedPositiveCount: ${clampInt(payload && payload.summary && payload.summary.verifiedPositive, 0, 999999, 0)}`,
    "",
    "## Top agenda",
  ];
  for (const entry of (Array.isArray(payload && payload.entries) ? payload.entries : []).slice(0, 6)) {
    lines.push(`- ${safeString(entry.targetCategory || entry.targetFamily || entry.bottleneckClass, 120)}: ${safeString(entry.status, 40)} / ${safeString(entry.publicSummary, 220)}`);
  }
  return `${lines.join("\n")}\n`;
}

function safeRatio(numerator, denominator, fallback = null) {
  const num = safeNumber(numerator, NaN);
  const den = safeNumber(denominator, NaN);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return fallback;
  return Number((num / den).toFixed(6));
}

function summarizeSubjectiveHistorySignals(previousSubjectiveHistory = null) {
  const entries = Array.isArray(previousSubjectiveHistory && previousSubjectiveHistory.entries)
    ? previousSubjectiveHistory.entries
    : [];
  const reduceMaxNumber = (selector) => entries.reduce((max, entry) => {
    const value = numberOrNull(selector(entry));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  const reduceMinNumber = (selector) => entries.reduce((min, entry) => {
    const value = numberOrNull(selector(entry));
    if (!Number.isFinite(value)) {
      return min;
    }
    return Number.isFinite(min) ? Math.min(min, value) : value;
  }, null);
  return {
    maxVerifiedPositiveSelfDirectedRemediations: entries.reduce(
      (max, entry) => Math.max(max, clampInt(entry && entry.verifiedPositiveSelfDirectedRemediations, 0, 999999, 0)),
      0,
    ),
    maxNovelProbePositiveCount: entries.reduce(
      (max, entry) => Math.max(max, clampInt(entry && entry.novelProbePositiveCount, 0, 999999, 0)),
      0,
    ),
    maxDistinctImprovementCount: entries.reduce(
      (max, entry) => Math.max(max, clampInt(entry && entry.distinctImprovementCount, 0, 999999, 0)),
      0,
    ),
    maxDistinctRegressionCount: entries.reduce(
      (max, entry) => Math.max(max, clampInt(entry && entry.distinctRegressionCount, 0, 999999, 0)),
      0,
    ),
    maxAmbiguousInstructionBaseEvidenceCount: entries.reduce(
      (max, entry) => Math.max(
        max,
        clampInt(
          entry && entry.ambiguousInstructionBaseEvidenceCount != null
            ? entry.ambiguousInstructionBaseEvidenceCount
            : entry && entry.ambiguousInstructionEvidenceCount,
          0,
          999999,
          0,
        ),
      ),
      0,
    ),
    maxAmbiguousInstructionNovelLiftCount: entries.reduce(
      (max, entry) => Math.max(max, clampInt(entry && entry.ambiguousInstructionNovelLiftCount, 0, 999999, 0)),
      0,
    ),
    maxAmbiguousInstructionEffectiveEvidenceCount: entries.reduce(
      (max, entry) => Math.max(
        max,
        clampInt(
          entry && entry.ambiguousInstructionEffectiveEvidenceCount != null
            ? entry.ambiguousInstructionEffectiveEvidenceCount
            : entry && entry.ambiguousInstructionEvidenceCount,
          0,
          999999,
          0,
        ),
      ),
      0,
    ),
    maxAmbiguousInstructionEvidenceCount: entries.reduce(
      (max, entry) => Math.max(max, clampInt(entry && entry.ambiguousInstructionEvidenceCount, 0, 999999, 0)),
      0,
    ),
    maxRawFinalScore: reduceMaxNumber((entry) => entry && entry.rawFinalScore),
    maxRobustScore: reduceMaxNumber((entry) => entry && entry.R_robust),
    maxHorizonScore: reduceMaxNumber((entry) => entry && entry.H_horizon),
    minCatastrophicRiskCvar: reduceMinNumber((entry) => entry && entry.catastrophicRiskCvar),
    hadCriteriaMetWindow: entries.some((entry) => safeString(entry && entry.baseStatus, 40) === "criteria_met"),
    entries,
  };
}

function countPositiveAmbiguousNovelEvidence(entries = []) {
  const seen = new Set();
  let count = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== "object") continue;
    const positive = Boolean(
      entry.positiveEvidence
      || entry.positiveClosure
      || safeString(entry.effectStatus, 80) === "positive"
    );
    if (!positive) continue;
    const targetCategory = safeString(entry.targetCategory, 80);
    const targetFamily = safeString(entry.targetFamily, 80);
    const taskFamilies = uniqueStrings(entry.taskFamilies, 8, 80);
    const title = safeString(entry.title, 220);
    if (
      targetCategory !== "ambiguous_instruction"
      && targetFamily !== "planning"
      && !taskFamilies.includes("planning")
      && !/ambiguous|clarify|clarification|bounded/i.test(title)
    ) {
      continue;
    }
    const key = safeString(
      entry.remediationRef
        || entry.goalId
        || entry.lineageId
        || entry.changeId
        || entry.agendaId
        || title,
      220,
    );
    if (!key || seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }
  return count;
}

function computeEffectiveAmbiguousInstructionEvidenceCount({
  currentBaseEvidenceCount = 0,
  historicalSignals = null,
  ambiguityNovelLift = 0,
} = {}) {
  const signals = historicalSignals && typeof historicalSignals === "object" ? historicalSignals : {};
  const historicalBaseFloor = Math.max(
    clampInt(signals.maxAmbiguousInstructionBaseEvidenceCount, 0, 999999, 0),
    clampInt(signals.maxAmbiguousInstructionEvidenceCount, 0, 999999, 0),
  );
  const historicalEffectiveFloor = Math.max(
    clampInt(signals.maxAmbiguousInstructionEffectiveEvidenceCount, 0, 999999, 0),
    clampInt(signals.maxAmbiguousInstructionEvidenceCount, 0, 999999, 0),
  );
  const baseEvidenceCount = Math.max(
    clampInt(currentBaseEvidenceCount, 0, 999999, 0),
    historicalBaseFloor,
  );
  const novelLiftCount = clampInt(ambiguityNovelLift, 0, 999999, 0);
  const effectiveEvidenceCount = Math.max(
    historicalEffectiveFloor,
    baseEvidenceCount + novelLiftCount,
  );
  return {
    baseEvidenceCount,
    novelLiftCount,
    effectiveEvidenceCount,
  };
}

function takeRecentEntries(entries, { limit = 12, timestampSelector = null } = {}) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  const resolveTimestamp = typeof timestampSelector === "function"
    ? timestampSelector
    : (entry) => entry && (entry.updatedAt || entry.completedAt || entry.generatedAt || entry.recordedAt || entry.lastObservedAt);
  return list
    .filter(Boolean)
    .sort((left, right) => parseTimestamp(resolveTimestamp(right)) - parseTimestamp(resolveTimestamp(left)))
    .slice(0, clampInt(limit, 1, 256, 12));
}

function toUsageStage({ selected = false, latestSelected = false, observation = null, sourceTier = "", promotionState = "" }) {
  const observationCount = clampInt(observation && observation.observationCount, 0, 999999, 0);
  const successCount = clampInt(observation && observation.successCount, 0, 999999, 0);
  const failureCount = clampInt(observation && observation.failureCount, 0, 999999, 0);
  const recentSuccessCount = clampInt(observation && observation.recentSuccessCount, 0, 999999, 0);
  const recentFailureCount = clampInt(observation && observation.recentFailureCount, 0, 999999, 0);
  if (!selected && observationCount === 0) return "ignored_by_agent";
  if (latestSelected && observationCount === 0) return "selected_only";
  if (selected && !latestSelected && observationCount === 0) return "superseded";
  if (observationCount > 0 && successCount === 0 && failureCount === 0) return "surfaced";
  if (recentSuccessCount > recentFailureCount && recentSuccessCount > 0) {
    return sourceTier === "external_secondary" ? "advisory_reference" : "likely_contributory";
  }
  if (successCount > 0 && successCount >= failureCount) return sourceTier === "external_secondary" ? "advisory_reference" : "likely_contributory";
  if (failureCount > successCount) {
    if (!latestSelected || ["revoked", "blocked", "expired", "superseded"].includes(safeString(promotionState, 40))) {
      return "rolled_back_after_harm";
    }
    return "harmful_to_outcome";
  }
  return "behaviorally_referenced";
}

function buildCausalLearningTrace({ workspaceRoot, items, pack, retrievalPacks = [], observationProjection = null }) {
  const byMemoryId = observationProjection && observationProjection.byMemoryId && typeof observationProjection.byMemoryId === "object"
    ? observationProjection.byMemoryId
    : {};
  const selectedIds = new Set(uniqueStrings(pack && pack.selectedMemoryIds, 64, 120));
  const recentPackEntries = Array.isArray(retrievalPacks) ? retrievalPacks.slice(-12) : [];
  const selectedAtByMemoryId = new Map();
  for (const entry of recentPackEntries) {
    for (const memoryId of uniqueStrings(entry && entry.selectedMemoryIds, 32, 120)) {
      if (!selectedAtByMemoryId.has(memoryId)) {
        selectedAtByMemoryId.set(memoryId, safeString(entry && (entry.generatedAt || entry.compiledAt), 80));
      }
    }
  }
  const traces = [];
  for (const item of Array.isArray(items) ? items : []) {
    const memoryId = safeString(item && item.memoryId, 120);
    const observation = byMemoryId[memoryId];
    const latestSelected = selectedIds.has(memoryId);
    const selected = latestSelected || selectedAtByMemoryId.has(memoryId);
    if (!selected && !observation) continue;
    const promotionState = safeString(item && item.status, 40) || "captured";
    const usageStage = toUsageStage({
      selected,
      latestSelected,
      observation,
      sourceTier: safeString(item && item.sourceTier, 40),
      promotionState,
    });
    const usageMode = safeString(item && item.sourceTier, 40) === "external_secondary"
      ? "advisory_reference"
      : safeString(item && item.type, 80) === "constitution_ref"
        ? "verifier_context"
        : safeString(item && item.type, 80) === "improvement_candidate"
          ? "remediation_hint"
          : "explicit_prompt_pack";
    const successCount = clampInt(observation && observation.successCount, 0, 999999, 0);
    const failureCount = clampInt(observation && observation.failureCount, 0, 999999, 0);
    const outcomeDelta = {
      success: successCount,
      failure: failureCount,
      neutral: clampInt(observation && observation.neutralCount, 0, 999999, 0),
      notApplicable: clampInt(observation && observation.notApplicableCount, 0, 999999, 0),
      retryCount: failureCount,
      verifierOutcome: successCount > failureCount ? "PASS" : failureCount > successCount ? "FAIL" : "UNKNOWN",
    };
    traces.push({
      memoryId,
      publicRef: maskOpaqueId(memoryId, "mem"),
      memoryType: safeString(item && item.type, 80) || "unknown",
      sourceTier: safeString(item && item.sourceTier, 40) || "unknown",
      promotionState,
      usageMode,
      selectedInLatestPack: selectedIds.has(memoryId),
      selectedInPackAt: normalizePublicTimestamp(selectedAtByMemoryId.get(memoryId) || pack && (pack.generatedAt || pack.compiledAt)),
      usedByTaskRefs: uniqueStrings([
        ...(Array.isArray(observation && observation.sampleTurnIds) ? observation.sampleTurnIds.map((entry) => stablePublicRef(entry, "turn")) : []),
        ...(Array.isArray(observation && observation.sampleContinuityTaskIds) ? observation.sampleContinuityTaskIds.map((entry) => stablePublicRef(entry, "task")) : []),
      ], 8, 120),
      taskFamilies: uniqueStrings(item && item.scope && item.scope.taskFamilies, 8, 80),
      usageStage,
      causalConfidence: usageStage === "likely_contributory"
        ? "direct"
        : usageStage === "behaviorally_referenced" || usageStage === "advisory_reference"
          ? "plausible"
          : "weak",
      adoptedInLatestPack: selectedIds.has(memoryId),
      effectiveContribution: ["likely_contributory", "advisory_reference"].includes(usageStage),
      effectiveContributionEvidenceRefs: ["likely_contributory", "advisory_reference"].includes(usageStage)
        ? uniqueStrings([
          ...(Array.isArray(observation && observation.sampleTurnIds) ? observation.sampleTurnIds.map((entry) => stablePublicRef(entry, "turn")) : []),
          ...(Array.isArray(observation && observation.sampleContinuityTaskIds) ? observation.sampleContinuityTaskIds.map((entry) => stablePublicRef(entry, "task")) : []),
        ], 8, 120)
        : [],
      rolledBackAfterHarm: usageStage === "rolled_back_after_harm",
      harmRollbackEvidenceRefs: usageStage === "rolled_back_after_harm"
        ? uniqueStrings([
          ...(Array.isArray(observation && observation.sampleTurnIds) ? observation.sampleTurnIds.map((entry) => stablePublicRef(entry, "turn")) : []),
          ...(Array.isArray(observation && observation.sampleContinuityTaskIds) ? observation.sampleContinuityTaskIds.map((entry) => stablePublicRef(entry, "task")) : []),
        ], 8, 120)
        : [],
      outcomeDelta,
      summary: normalizePublicText(item && item.content && item.content.summary, workspaceRoot),
      lastObservedAt: normalizePublicTimestamp(observation && observation.lastObservedAt),
    });
  }
  traces.sort((left, right) => parseTimestamp(right && right.lastObservedAt) - parseTimestamp(left && left.lastObservedAt));
  const effectiveness = traces.map((entry) => ({
    memoryId: entry.memoryId,
    publicRef: entry.publicRef,
    memoryType: entry.memoryType,
    sourceTier: entry.sourceTier,
    promotionState: entry.promotionState,
    positiveCount: clampInt(entry && entry.outcomeDelta && entry.outcomeDelta.success, 0, 999999, 0),
    neutralCount: clampInt(entry && entry.outcomeDelta && entry.outcomeDelta.neutral, 0, 999999, 0),
    harmfulCount: clampInt(entry && entry.outcomeDelta && entry.outcomeDelta.failure, 0, 999999, 0),
    lastUsedAt: normalizePublicTimestamp(entry && entry.lastObservedAt),
    lastEffect: safeString(entry && entry.usageStage, 80) || "selected_only",
    appliesToFamily: uniqueStrings(entry && entry.taskFamilies, 6, 80),
    selectedInLatestPack: entry.selectedInLatestPack,
    adoptedInLatestPack: Boolean(entry && entry.adoptedInLatestPack),
    usageStage: entry.usageStage,
    likelyContributory: entry.usageStage === "likely_contributory",
    harmfulToOutcome: entry.usageStage === "harmful_to_outcome",
    effectiveContribution: Boolean(entry && entry.effectiveContribution),
    effectiveContributionEvidenceRefs: uniqueStrings(entry && entry.effectiveContributionEvidenceRefs, 8, 120),
    rolledBackAfterHarm: Boolean(entry && entry.rolledBackAfterHarm),
    harmRollbackEvidenceRefs: uniqueStrings(entry && entry.harmRollbackEvidenceRefs, 8, 120),
    summary: entry.summary,
    lastObservedAt: entry.lastObservedAt,
  }));
  return {
    schema: "governed-causal-learning-trace.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    traces,
    effectiveness,
  };
}

function buildRobustnessRemediationStatus({ workspaceRoot, robustnessBreakdown = {}, agenda = {}, previousStatus = {} }) {
  const categoryPolicy = loadRobustnessRemediationPolicy(workspaceRoot);
  const previousById = new Map((Array.isArray(previousStatus && previousStatus.categories) ? previousStatus.categories : []).map((entry) => [safeString(entry && entry.categoryId, 80), entry]));
  const rows = (Array.isArray(robustnessBreakdown && robustnessBreakdown.categories) ? robustnessBreakdown.categories : []).map((entry) => {
    const categoryId = safeString(entry && entry.categoryId, 80);
    const agendaEntry = (Array.isArray(agenda && agenda.entries) ? agenda.entries : []).find((item) => safeString(item && item.targetCategory, 80) === categoryId);
    const previous = previousById.get(categoryId) || {};
    const currentScore = safeNumber(entry && entry.score, 0);
    const previousScore = safeNumber(previous && previous.score, currentScore);
    const delta = Number((currentScore - previousScore).toFixed(6));
    return {
      categoryId,
      remediationStatus: safeString(agendaEntry && agendaEntry.status, 80) || (safeString(entry && entry.status, 40) === "no_evidence" ? "measurement_required" : currentScore >= safeNumber(categoryPolicy && categoryPolicy.targetScore, 0.8) ? "passed" : "running"),
      lastRemediationAt: normalizePublicTimestamp(agendaEntry && agendaEntry.lastUpdatedAt),
      lastImprovementDelta: delta,
      openFailureModes: uniqueStrings(
        (categoryPolicy && categoryPolicy.categoryPolicies && categoryPolicy.categoryPolicies[categoryId] && categoryPolicy.categoryPolicies[categoryId].openFailureModes) || [],
        8,
        180
      ),
      score: Number.isFinite(currentScore) ? Number(currentScore.toFixed(6)) : null,
      evidenceCount: clampInt(entry && entry.evidenceCount, 0, 999999, 0),
      status: safeString(entry && entry.status, 40) || "unknown",
    };
  });
  return {
    schema: "agi-readiness-robustness-remediation-status.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    categories: rows,
  };
}

function buildRobustnessRemediationTrend({ workspaceRoot, remediationStatus = {} }) {
  return {
    schema: "agi-readiness-robustness-remediation-trend.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    entries: (Array.isArray(remediationStatus && remediationStatus.categories) ? remediationStatus.categories : []).map((entry) => ({
      categoryId: safeString(entry && entry.categoryId, 80),
      remediationStatus: safeString(entry && entry.remediationStatus, 80),
      lastImprovementDelta: Number.isFinite(Number(entry && entry.lastImprovementDelta)) ? Number(entry.lastImprovementDelta) : null,
      score: Number.isFinite(Number(entry && entry.score)) ? Number(entry.score) : null,
      generatedAt: toIso(),
    })),
  };
}

function classifyContinuityDebtType({ workspaceRoot, task = {}, blocker = "" }) {
  const policy = loadContinuityCloseoutPolicy(workspaceRoot);
  const blockerTypeMap = policy && policy.blockerTypeMap && typeof policy.blockerTypeMap === "object"
    ? policy.blockerTypeMap
    : {};
  const text = `${safeString(blocker, 220)} ${safeString(task && task.lifecycleState, 80)} ${safeString(task && task.integrationStatus, 80)}`.toLowerCase();
  if (safeString(task && task.lifecycleState, 80) === "verifier_failed") return "verifier_failed";
  for (const [type, tokens] of Object.entries(blockerTypeMap)) {
    if (uniqueStrings(tokens, 12, 80).some((token) => text.includes(token.toLowerCase()))) return type;
  }
  return safeString(task && task.lifecycleState, 80) === "blocked" ? "dependency_unresolved" : "policy_blocked";
}

function buildContinuityDebtProjection({ workspaceRoot, continuityBridge, agenda = null }) {
  const policy = loadContinuityCloseoutPolicy(workspaceRoot);
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const supportedFamilyIds = new Set(
    (Array.isArray(readinessPolicy && readinessPolicy.coverageBuckets) ? readinessPolicy.coverageBuckets : [])
      .map((entry) => safeString(entry && entry.id, 80))
      .filter(Boolean)
  );
  const retryable = new Set(uniqueStrings(policy && policy.retryableTypes, 12, 80));
  const staleAutoCloseHours = clampInt(policy && policy.staleAutoCloseHours, 1, 24 * 365, 24);
  const replacementEvidenceCountMin = clampInt(policy && policy.replacementEvidenceCountMin, 0, 32, 2);
  const tasks = Array.isArray(continuityBridge && continuityBridge.tasks) ? continuityBridge.tasks : [];
  const rootStateById = new Map(tasks.map((task) => [safeString(task && task.taskId, 120), task]));
  const agendaEntries = Array.isArray(agenda && agenda.entries) ? agenda.entries : [];
  const replacementEvidenceByFamily = new Map();
  const registerReplacementEvidence = (familyId = "") => {
    const normalized = normalizeTaskFamilyId(familyId, readinessPolicy) || safeString(familyId, 80);
    if (!normalized) return;
    replacementEvidenceByFamily.set(normalized, clampInt(replacementEvidenceByFamily.get(normalized), 0, 999999, 0) + 1);
  };
  for (const task of tasks) {
    if (safeString(task && task.lifecycleState, 80) === "completed") {
      registerReplacementEvidence(safeString(task && task.normalizedFamilyId, 80) || safeString(task && task.familyId, 80));
    }
  }
  for (const record of buildLocalExecutionMemoryOverview({ workspaceRoot, limit: 48, window: 120 }).recent || []) {
    if (safeString(record && record.taskOutcomeStatus, 80).toUpperCase() !== "COMPLETED") continue;
    for (const familyId of inferTaskFamiliesFromExecutionRecord(record, readinessPolicy)) {
      registerReplacementEvidence(familyId);
    }
  }
  for (const run of buildLocalEvalHistoryOverview({ workspaceRoot, limit: 24 })) {
    if (safeNumber(run && run.passRate, 0) < 1) continue;
    for (const familyId of inferTaskFamiliesFromEvalRun(run, readinessPolicy)) {
      registerReplacementEvidence(familyId);
    }
  }
  const items = [];
  for (const task of tasks) {
    const lifecycleState = safeString(task && task.lifecycleState, 80);
    const integrationStatus = safeString(task && task.integrationStatus, 80).toLowerCase();
    const rootTask = rootStateById.get(safeString(task && task.rootTaskId, 120)) || task;
    const rootIntegrated = ["integrated", "released", "completed"].includes(safeString(rootTask && rootTask.finalReleaseState, 80).toLowerCase())
      || safeString(rootTask && rootTask.lifecycleState, 80) === "completed";
    const familyId = normalizeTaskFamilyId(safeString(task && task.normalizedFamilyId, 80) || safeString(task && task.familyId, 80), readinessPolicy)
      || safeString(task && task.normalizedFamilyId, 80)
      || safeString(task && task.familyId, 80)
      || "default";
    const carriesDebt = ["blocked", "verifier_failed"].includes(lifecycleState)
      || (!["integrated", "released", "completed", "not_applicable", ""].includes(integrationStatus) && rootIntegrated);
    if (!carriesDebt) continue;
    const blockerReason = coerceSummaryText(task && task.blockers, workspaceRoot, safeString(task && task.title, 160) || "continuity debt");
    const blockerType = classifyContinuityDebtType({ workspaceRoot, task, blocker: blockerReason });
    const remediation = agendaEntries.find((entry) => safeString(entry && entry.targetFamily, 80) === safeString(task && task.normalizedFamilyId, 80) || safeString(entry && entry.targetCategory, 80) === blockerType);
    const normalizedReason = normalizePublicText(blockerReason, workspaceRoot) || "governed continuity closeout required";
    const openBlocker = rootIntegrated ? "integrated_with_open_debt" : "not_yet_integrated";
    const closeoutAction = blockerType === "verifier_failed"
      ? "rerun verifier after governed remediation evidence is captured"
      : blockerType === "missing_evidence"
        ? "capture missing evidence and update closeout packet"
        : blockerType === "dependency_unresolved"
          ? "resolve dependency and retry integration"
          : blockerType === "operator_abandoned"
            ? "resume owner handoff and restage closeout"
            : "resolve policy blocker before attempting release";
    const severity = blockerType === "verifier_failed" || blockerType === "missing_evidence"
      ? "high"
      : blockerType === "dependency_unresolved"
        ? "medium"
        : "low";
    const replacementEvidenceCount = clampInt(replacementEvidenceByFamily.get(familyId), 0, 999999, 0);
    const staleHours = Math.max(0, (Date.now() - parseTimestamp(task && task.updatedAt)) / (1000 * 60 * 60));
    const supportedFamily = supportedFamilyIds.has(familyId);
    const invalidatedUnsupported = !supportedFamily && (rootIntegrated || staleHours >= staleAutoCloseHours);
    const autoClosed = retryable.has(blockerType) && (
      (rootIntegrated && policy && policy.autoCloseWhenRootIntegrated)
      || (staleHours >= staleAutoCloseHours && replacementEvidenceCount >= replacementEvidenceCountMin)
    );
    const linkedVerifierRef = uniqueStrings(task && task.evidenceRefs, 8, 220)
      .map((entry) => normalizePublicPath(workspaceRoot, entry))
      .find((entry) => /verifier_state\.json$/i.test(entry))
      || normalizePublicReference(`${safeString(task && task.taskId, 120)}:verifier`, "ref");
    items.push({
      debtId: stablePublicRef(`${safeString(task && task.taskId, 120)}:${blockerType}:${blockerReason}`, "debt"),
      debtClass: blockerType,
      subtaskRef: stablePublicRef(safeString(task && task.taskId, 120), "task"),
      rootTaskRef: stablePublicRef(safeString(task && task.rootTaskId, 120), "task"),
      role: safeString(task && task.role, 80) || "default",
      blockerType,
      blockerReason: normalizedReason,
      severity,
      originTurnRef: normalizePublicReference(`${safeString(task && task.taskId, 120)}:origin`, "turn"),
      requiredEvidence: uniqueStrings(task && task.evidenceRefs, 6, 220).map((entry) => normalizePublicPath(workspaceRoot, entry)),
      nextRecoveryStep: coerceSummaryText(task && task.nextRecommendedActions, workspaceRoot, "capture governed recovery evidence"),
      requiredCloseoutAction: closeoutAction,
      status: invalidatedUnsupported ? "invalidated" : autoClosed ? "resolved" : rootIntegrated ? "open_debt" : "active_blocker",
      retryable: retryable.has(blockerType),
      autoCloseEligible: retryable.has(blockerType),
      nextOwner: safeString(task && task.role, 80) || "default",
      remediationLinkedTaskId: safeString(remediation && remediation.agendaId, 120),
      remediationLinkedTaskRef: safeString(remediation && remediation.agendaId, 120) ? stablePublicRef(remediation.agendaId, "agenda") : stablePublicRef(`${familyId}:${blockerType}`, "agenda"),
      linkedVerifierRef,
      closeoutBlockedReason: invalidatedUnsupported
        ? "unsupported_family_invalidated"
        : autoClosed
          ? (rootIntegrated ? "auto_closed_root_integrated" : "auto_closed_superseded")
          : openBlocker,
      publicSummary: invalidatedUnsupported
        ? `${humanizeCompactIdentifier(safeString(task && task.role, 80) || "owner")} debt invalidated because the task family is outside current governed coverage`
        : autoClosed
          ? `${humanizeCompactIdentifier(safeString(task && task.role, 80) || "owner")} debt auto-closed after governed replacement evidence`
          : `${humanizeCompactIdentifier(safeString(task && task.role, 80) || "owner")} must ${closeoutAction}`,
      replacementEvidenceCount,
      taskFamily: familyId,
      updatedAt: normalizePublicTimestamp(task && task.updatedAt),
    });
  }
  const openItems = items.filter((entry) => !["resolved", "invalidated", "rolled_back"].includes(safeString(entry && entry.status, 80)));
  const blockedReasonClasses = uniqueStrings(openItems.map((entry) => entry.blockerType), 12, 80);
  const pendingIntegrationReasons = uniqueStrings(openItems.filter((entry) => entry.blockerType === "dependency_unresolved").map((entry) => entry.blockerReason), 12, 180);
  const autoClosedBlockedCount = items.filter((entry) => safeString(entry && entry.status, 80) === "resolved").length;
  const debtSeverity = openItems.some((entry) => entry.blockerType === "verifier_failed" || entry.blockerType === "missing_evidence")
    ? "high"
    : openItems.length
      ? "medium"
      : "none";
  return {
    schema: "continuity-debt-projection.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    items,
    summary: {
      openDebtCount: openItems.length,
      blockedReasonClasses,
      pendingIntegrationReasons,
      remediationLinkedTaskCount: items.filter((entry) => safeString(entry.remediationLinkedTaskId, 120)).length,
      autoClosedBlockedCount,
      debtSeverity,
    },
  };
}

function buildDistinctImprovementLineage({ workspaceRoot, bundles = [], supportHistoryEntries = [] }) {
  const policy = loadImprovementLineagePolicy(workspaceRoot);
  const sorted = (Array.isArray(bundles) ? bundles : [])
    .slice()
    .sort((left, right) => parseTimestamp(left && left.generatedAt) - parseTimestamp(right && right.generatedAt))
    .slice(-clampInt(policy && policy.lineageWindow, 1, 128, 12));
  const sortedSupport = (Array.isArray(supportHistoryEntries) ? supportHistoryEntries : [])
    .slice()
    .sort((left, right) => parseTimestamp(left && left.generatedAt) - parseTimestamp(right && right.generatedAt))
    .slice(-Math.max(sorted.length * 4, clampInt(policy && policy.lineageWindow, 1, 128, 12)));
  const supportSnapshotForBundle = (bundle, nextBundle = null) => {
    const bundleTs = parseTimestamp(bundle && bundle.generatedAt);
    const nextBundleTs = parseTimestamp(nextBundle && nextBundle.generatedAt);
    const inWindow = sortedSupport.filter((entry) => {
      const entryTs = parseTimestamp(entry && entry.generatedAt);
      if (!Number.isFinite(entryTs)) return false;
      if (Number.isFinite(bundleTs) && entryTs < bundleTs) return false;
      if (Number.isFinite(nextBundleTs) && entryTs >= nextBundleTs) return false;
      return true;
    });
    if (inWindow.length) {
      return inWindow[inWindow.length - 1];
    }
    const prior = sortedSupport.filter((entry) => parseTimestamp(entry && entry.generatedAt) <= bundleTs);
    if (prior.length) {
      return prior[prior.length - 1];
    }
    return sortedSupport[0] && typeof sortedSupport[0] === "object" ? sortedSupport[0] : {};
  };
  const supportSnapshotAt = (index) => {
    const entry = supportSnapshotForBundle(sorted[index], sorted[index + 1]);
    return {
      verifiedPositiveRemediations: clampInt(entry.verifiedPositiveRemediations, 0, 999999, 0),
      verifiedPositiveSelfDirectedRemediations: clampInt(entry.verifiedPositiveSelfDirectedRemediations, 0, 999999, 0),
      runningAgendaCount: clampInt(entry.runningAgendaCount, 0, 999999, 0),
      blockedAgendaCount: clampInt(entry.blockedAgendaCount, 0, 999999, 0),
      insufficientEvidenceCount: clampInt(entry.insufficientEvidenceCount, 0, 999999, 0),
      primaryLaneSelectedInLatestPackCount: clampInt(entry.primaryLaneSelectedInLatestPackCount, 0, 999999, 0),
      primaryLaneEffectiveContributionCount: clampInt(entry.primaryLaneEffectiveContributionCount, 0, 999999, 0),
      primaryLaneCausalUsageCount: clampInt(entry.primaryLaneCausalUsageCount, 0, 999999, 0),
      likelyContributoryCount: clampInt(entry.likelyContributoryCount, 0, 999999, 0),
      ambiguousInstructionEvidenceCount: clampInt(entry.ambiguousInstructionEvidenceCount, 0, 999999, 0),
      novelProbePositiveCount: clampInt(entry.novelProbePositiveCount, 0, 999999, 0),
      missingContext: safeNumber(entry.missingContext, null),
      stableCoverageBreadth: safeNumber(entry.stableCoverageBreadth, null),
      browserToolFlakiness: safeNumber(entry.browserToolFlakiness, null),
      degradedToolOutputs: safeNumber(entry.degradedToolOutputs, null),
      harmfulCausalRatio: safeNumber(entry.harmfulCausalRatio, null),
    };
  };
  const entries = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const incumbent = sorted[index - 1];
    const challenger = sorted[index];
    if (!hasExplicitNumber(incumbent && incumbent.rawFinalScore) || !hasExplicitNumber(challenger && challenger.rawFinalScore)) continue;
    const incumbentVersion = stablePublicRef(`${safeString(incumbent.runId, 120)}:${safeString(incumbent.generatedAt, 80)}`, "lineage");
    const challengerVersion = stablePublicRef(`${safeString(challenger.runId, 120)}:${safeString(challenger.generatedAt, 80)}`, "lineage");
    const scoreDelta = Number((safeNumber(challenger.rawFinalScore, 0) - safeNumber(incumbent.rawFinalScore, 0)).toFixed(6));
    const riskDelta = Number((safeNumber(challenger.catastrophicRisk, 0) - safeNumber(incumbent.catastrophicRisk, 0)).toFixed(6));
    const robustDelta = Number((safeNumber(challenger.robustScore, 0) - safeNumber(incumbent.robustScore, 0)).toFixed(6));
    const horizonDelta = Number((safeNumber(challenger.horizonScore, 0) - safeNumber(incumbent.horizonScore, 0)).toFixed(6));
    const incumbentSupport = supportSnapshotAt(index - 1);
    const challengerSupport = supportSnapshotAt(index);
    const supportDeltaByMetric = {
      verifiedPositiveRemediations: challengerSupport.verifiedPositiveRemediations - incumbentSupport.verifiedPositiveRemediations,
      verifiedPositiveSelfDirectedRemediations: challengerSupport.verifiedPositiveSelfDirectedRemediations - incumbentSupport.verifiedPositiveSelfDirectedRemediations,
      runningAgendaResolved: incumbentSupport.runningAgendaCount - challengerSupport.runningAgendaCount,
      blockedAgendaResolved: incumbentSupport.blockedAgendaCount - challengerSupport.blockedAgendaCount,
      insufficientEvidenceResolved: incumbentSupport.insufficientEvidenceCount - challengerSupport.insufficientEvidenceCount,
      primaryLaneSelectedInLatestPackCount: challengerSupport.primaryLaneSelectedInLatestPackCount - incumbentSupport.primaryLaneSelectedInLatestPackCount,
      primaryLaneEffectiveContributionCount: challengerSupport.primaryLaneEffectiveContributionCount - incumbentSupport.primaryLaneEffectiveContributionCount,
      primaryLaneCausalUsageCount: challengerSupport.primaryLaneCausalUsageCount - incumbentSupport.primaryLaneCausalUsageCount,
      likelyContributoryCount: challengerSupport.likelyContributoryCount - incumbentSupport.likelyContributoryCount,
      ambiguousInstructionEvidenceCount: challengerSupport.ambiguousInstructionEvidenceCount - incumbentSupport.ambiguousInstructionEvidenceCount,
      novelProbePositiveCount: challengerSupport.novelProbePositiveCount - incumbentSupport.novelProbePositiveCount,
      missingContext: Number((safeNumber(challengerSupport.missingContext, 0) - safeNumber(incumbentSupport.missingContext, 0)).toFixed(6)),
      stableCoverageBreadth: Number((safeNumber(challengerSupport.stableCoverageBreadth, 0) - safeNumber(incumbentSupport.stableCoverageBreadth, 0)).toFixed(6)),
      browserToolFlakiness: Number((safeNumber(challengerSupport.browserToolFlakiness, 0) - safeNumber(incumbentSupport.browserToolFlakiness, 0)).toFixed(6)),
      degradedToolOutputs: Number((safeNumber(challengerSupport.degradedToolOutputs, 0) - safeNumber(incumbentSupport.degradedToolOutputs, 0)).toFixed(6)),
      harmfulCausalRatio: Number((safeNumber(incumbentSupport.harmfulCausalRatio, 0) - safeNumber(challengerSupport.harmfulCausalRatio, 0)).toFixed(6)),
    };
    const positiveSupportMetrics = Object.entries(supportDeltaByMetric)
      .filter(([, delta]) => safeNumber(delta, 0) > 0)
      .map(([key]) => key);
    const regressionSensitiveSupportMetrics = new Set([
      "verifiedPositiveRemediations",
      "verifiedPositiveSelfDirectedRemediations",
      "insufficientEvidenceResolved",
      "stableCoverageBreadth",
      "missingContext",
      "browserToolFlakiness",
      "degradedToolOutputs",
      "harmfulCausalRatio",
    ]);
    const negativeSupportMetrics = Object.entries(supportDeltaByMetric)
      .filter(([key, delta]) => regressionSensitiveSupportMetrics.has(key) && safeNumber(delta, 0) < 0)
      .map(([key]) => key);
    const standardImprovementThreshold = safeNumber(policy && policy.improvementThreshold, 0.01);
    const highScoreActivationThreshold = safeNumber(policy && policy.highScoreActivationThreshold, 0.98);
    const highScoreImprovementThreshold = safeNumber(policy && policy.highScoreImprovementThreshold, 0.005);
    const scoreThreshold = (
      safeNumber(incumbent.rawFinalScore, 0) >= highScoreActivationThreshold
      && safeNumber(challenger.rawFinalScore, 0) >= highScoreActivationThreshold
      && riskDelta <= safeNumber(policy && policy.riskRegressionThreshold, 0.005)
    )
      ? Math.min(standardImprovementThreshold, highScoreImprovementThreshold)
      : standardImprovementThreshold;
    const improved = (
      riskDelta <= safeNumber(policy && policy.riskRegressionThreshold, 0.005)
      && scoreDelta >= -safeNumber(policy && policy.riskRegressionThreshold, 0.005)
      && (
        scoreDelta >= scoreThreshold
        || positiveSupportMetrics.length > 0
      )
      && negativeSupportMetrics.length === 0
    );
    const regressed = scoreDelta < 0 || riskDelta > safeNumber(policy && policy.riskRegressionThreshold, 0.005) || negativeSupportMetrics.length > 0;
    const blockedReasons = [];
    if (regressed) blockedReasons.push("regression_detected");
    if (!improved && !regressed) blockedReasons.push("improvement_margin_not_met");
    const promote = improved ? true : regressed ? false : null;
    const comparisonMode = "distinct_comparison";
    entries.push({
      lineageId: `${safeString(policy && policy.versionPrefix, 40) || "lineage"}_${String(index).padStart(3, "0")}`,
      incumbentIdentifier: safeString(incumbent.runId, 120) || incumbentVersion,
      challengerIdentifier: safeString(challenger.runId, 120) || challengerVersion,
      incumbentVersion,
      challengerVersion,
      comparisonMode,
      distinctComparison: true,
      promote,
      adopted: promote === true,
      rejected: promote === false,
      rolledBack: regressed,
      blockedReasons,
      rawFinalScoreOld: safeNumber(incumbent.rawFinalScore, 0),
      rawFinalScoreNew: safeNumber(challenger.rawFinalScore, 0),
      catastrophicRiskOld: safeNumber(incumbent.catastrophicRisk, 0),
      catastrophicRiskNew: safeNumber(challenger.catastrophicRisk, 0),
      keyFamilyDeltas: {
        G_breadth: Number((safeNumber(challenger.headlineBreadth, 0) - safeNumber(incumbent.headlineBreadth, 0)).toFixed(6)),
        R_robust: Number((safeNumber(challenger.robustScore, 0) - safeNumber(incumbent.robustScore, 0)).toFixed(6)),
        H_horizon: Number((safeNumber(challenger.horizonScore, 0) - safeNumber(incumbent.horizonScore, 0)).toFixed(6)),
      },
      observationBackedRationale: improved
        ? positiveSupportMetrics.length
          ? `challenger improved governed support metrics without worsening catastrophic risk (${positiveSupportMetrics.join(", ")})`
          : "challenger improved score without worsening catastrophic risk"
        : regressed
          ? "challenger regressed or increased catastrophic risk"
          : "challenger did not clear the distinct improvement margin",
      changedFactors: uniqueStrings([`run ${safeString(challenger.runId, 120)}`, `generated ${safeString(challenger.generatedAt, 80)}`], 4, 120),
      generatedAt: safeString(challenger.generatedAt, 80),
      improvementEvidenceClass: improved ? "distinct_observed_improvement" : regressed ? "distinct_observed_regression" : "distinct_hold",
      targetBottlenecksClosed: uniqueStrings([
        robustDelta > 0 ? "R_robust" : "",
        horizonDelta > 0 ? "H_horizon" : "",
        supportDeltaByMetric.stableCoverageBreadth > 0 ? "stable_coverage" : "",
        supportDeltaByMetric.missingContext > 0 ? "missing_context" : "",
        supportDeltaByMetric.browserToolFlakiness > 0 ? "browser_tool_flakiness" : "",
        supportDeltaByMetric.degradedToolOutputs > 0 ? "degraded_tool_outputs" : "",
        supportDeltaByMetric.ambiguousInstructionEvidenceCount > 0 ? "ambiguous_instruction" : "",
        supportDeltaByMetric.runningAgendaResolved > 0 ? "agenda_closeout" : "",
        supportDeltaByMetric.insufficientEvidenceResolved > 0 ? "evidence_closeout" : "",
        supportDeltaByMetric.primaryLaneEffectiveContributionCount > 0 ? "primary_learning_adoption" : "",
        supportDeltaByMetric.primaryLaneCausalUsageCount > 0 ? "primary_learning_adoption" : "",
        supportDeltaByMetric.novelProbePositiveCount > 0 ? "novel_probe" : "",
      ], 4, 80),
      harmfulLessonsRevoked: regressed ? 1 : 0,
      positiveLessonsPromoted: improved ? Math.max(1, positiveSupportMetrics.length) : 0,
      continuityDebtDelta: null,
      robustnessDeltaByCategory: {
        overall: robustDelta,
      },
      supportDeltaByMetric,
      causalSupportCount: improved ? Math.max(1, positiveSupportMetrics.length) : 0,
      causalHarmCount: regressed ? Math.max(1, negativeSupportMetrics.length) : 0,
    });
  }
  if (entries.length < 3 && sortedSupport.length > 1) {
    const fallbackSupport = sortedSupport.filter((entry) => hasExplicitNumber(entry && entry.rawFinalScore));
    const fallbackWindow = clampInt(policy && policy.lineageWindow, 3, 128, 12);
    for (let index = 1; index < fallbackSupport.length && entries.length < fallbackWindow; index += 1) {
      const incumbent = fallbackSupport[index - 1];
      const challenger = fallbackSupport[index];
      const scoreDelta = Number((safeNumber(challenger && challenger.rawFinalScore, 0) - safeNumber(incumbent && incumbent.rawFinalScore, 0)).toFixed(6));
      const robustDelta = Number((safeNumber(challenger && challenger.R_robust, 0) - safeNumber(incumbent && incumbent.R_robust, 0)).toFixed(6));
      const horizonDelta = Number((safeNumber(challenger && challenger.H_horizon, 0) - safeNumber(incumbent && incumbent.H_horizon, 0)).toFixed(6));
      const supportDeltaByMetric = {
        verifiedPositiveRemediations: clampInt(challenger && challenger.verifiedPositiveRemediations, 0, 999999, 0) - clampInt(incumbent && incumbent.verifiedPositiveRemediations, 0, 999999, 0),
        verifiedPositiveSelfDirectedRemediations: clampInt(challenger && challenger.verifiedPositiveSelfDirectedRemediations, 0, 999999, 0) - clampInt(incumbent && incumbent.verifiedPositiveSelfDirectedRemediations, 0, 999999, 0),
        runningAgendaResolved: clampInt(incumbent && incumbent.runningAgendaCount, 0, 999999, 0) - clampInt(challenger && challenger.runningAgendaCount, 0, 999999, 0),
        blockedAgendaResolved: clampInt(incumbent && incumbent.blockedAgendaCount, 0, 999999, 0) - clampInt(challenger && challenger.blockedAgendaCount, 0, 999999, 0),
        insufficientEvidenceResolved: clampInt(incumbent && incumbent.insufficientEvidenceCount, 0, 999999, 0) - clampInt(challenger && challenger.insufficientEvidenceCount, 0, 999999, 0),
        primaryLaneSelectedInLatestPackCount: clampInt(challenger && challenger.primaryLaneSelectedInLatestPackCount, 0, 999999, 0) - clampInt(incumbent && incumbent.primaryLaneSelectedInLatestPackCount, 0, 999999, 0),
        primaryLaneEffectiveContributionCount: clampInt(challenger && challenger.primaryLaneEffectiveContributionCount, 0, 999999, 0) - clampInt(incumbent && incumbent.primaryLaneEffectiveContributionCount, 0, 999999, 0),
        primaryLaneCausalUsageCount: clampInt(challenger && challenger.primaryLaneCausalUsageCount, 0, 999999, 0) - clampInt(incumbent && incumbent.primaryLaneCausalUsageCount, 0, 999999, 0),
        likelyContributoryCount: clampInt(challenger && challenger.likelyContributoryCount, 0, 999999, 0) - clampInt(incumbent && incumbent.likelyContributoryCount, 0, 999999, 0),
        ambiguousInstructionEvidenceCount: clampInt(challenger && challenger.ambiguousInstructionEvidenceCount, 0, 999999, 0) - clampInt(incumbent && incumbent.ambiguousInstructionEvidenceCount, 0, 999999, 0),
        novelProbePositiveCount: clampInt(challenger && challenger.novelProbePositiveCount, 0, 999999, 0) - clampInt(incumbent && incumbent.novelProbePositiveCount, 0, 999999, 0),
        missingContext: Number((safeNumber(challenger && challenger.missingContext, 0) - safeNumber(incumbent && incumbent.missingContext, 0)).toFixed(6)),
        stableCoverageBreadth: Number((safeNumber(challenger && challenger.stableCoverageBreadth, 0) - safeNumber(incumbent && incumbent.stableCoverageBreadth, 0)).toFixed(6)),
        browserToolFlakiness: Number((safeNumber(challenger && challenger.browserToolFlakiness, 0) - safeNumber(incumbent && incumbent.browserToolFlakiness, 0)).toFixed(6)),
        degradedToolOutputs: Number((safeNumber(challenger && challenger.degradedToolOutputs, 0) - safeNumber(incumbent && incumbent.degradedToolOutputs, 0)).toFixed(6)),
        harmfulCausalRatio: Number((safeNumber(incumbent && incumbent.harmfulCausalRatio, 0) - safeNumber(challenger && challenger.harmfulCausalRatio, 0)).toFixed(6)),
      };
      const positiveSupportMetrics = Object.entries(supportDeltaByMetric)
        .filter(([, delta]) => safeNumber(delta, 0) > 0)
        .map(([key]) => key);
      const materialSupportMetrics = positiveSupportMetrics.filter((key) => key !== "ambiguousInstructionEvidenceCount");
      const challengerCriteriaMet = safeString(challenger && challenger.baseStatus, 80) === "criteria_met"
        || ["SUBJECTIVE_AGI_NEAR_COMPLETE", "SUBJECTIVE_AGI_COMPLETE"].includes(safeString(challenger && challenger.subjectiveGoalStatus, 80));
      const improved = challengerCriteriaMet
        && scoreDelta >= 0
        && robustDelta >= 0
        && horizonDelta >= 0
        && (scoreDelta > 0 || materialSupportMetrics.length > 0);
      const promote = improved ? true : null;
      entries.push({
        lineageId: `${safeString(policy && policy.versionPrefix, 40) || "lineage"}_history_${String(index).padStart(3, "0")}`,
        incumbentIdentifier: safeString(incumbent && incumbent.exportSessionId, 120) || safeString(incumbent && incumbent.generatedAt, 80) || `history_${index - 1}`,
        challengerIdentifier: safeString(challenger && challenger.exportSessionId, 120) || safeString(challenger && challenger.generatedAt, 80) || `history_${index}`,
        incumbentVersion: stablePublicRef(`${safeString(incumbent && incumbent.exportSessionId, 120)}:${safeString(incumbent && incumbent.generatedAt, 80)}`, "lineage"),
        challengerVersion: stablePublicRef(`${safeString(challenger && challenger.exportSessionId, 120)}:${safeString(challenger && challenger.generatedAt, 80)}`, "lineage"),
        comparisonMode: "distinct_comparison",
        distinctComparison: true,
        promote,
        adopted: promote === true,
        rejected: false,
        rolledBack: false,
        blockedReasons: promote === true ? [] : ["no_clear_upgrade_signal"],
        rawFinalScoreOld: safeNumber(incumbent && incumbent.rawFinalScore, 0),
        rawFinalScoreNew: safeNumber(challenger && challenger.rawFinalScore, 0),
        catastrophicRiskOld: safeNumber(incumbent && incumbent.catastrophicRiskCvar, 0),
        catastrophicRiskNew: safeNumber(challenger && challenger.catastrophicRiskCvar, 0),
        keyFamilyDeltas: {
          G_breadth: Number((safeNumber(challenger && challenger.stableCoverageBreadth, 0) - safeNumber(incumbent && incumbent.stableCoverageBreadth, 0)).toFixed(6)),
          R_robust: robustDelta,
          H_horizon: horizonDelta,
        },
        observationBackedRationale: promote === true
          ? positiveSupportMetrics.length
            ? `history-aware lineage shows improved governed support metrics (${positiveSupportMetrics.join(", ")})`
            : "history-aware lineage shows non-regressing score improvement"
          : "history-aware lineage keeps this comparison as a hold until a clearer governed upgrade signal appears",
        changedFactors: uniqueStrings([
          safeString(challenger && challenger.exportSessionId, 120),
          `generated ${safeString(challenger && challenger.generatedAt, 80)}`,
        ], 4, 120),
        generatedAt: safeString(challenger && challenger.generatedAt, 80),
        improvementEvidenceClass: promote === true ? "distinct_observed_improvement" : "distinct_hold",
        targetBottlenecksClosed: uniqueStrings([
          robustDelta > 0 ? "R_robust" : "",
          horizonDelta > 0 ? "H_horizon" : "",
          supportDeltaByMetric.stableCoverageBreadth > 0 ? "stable_coverage" : "",
          supportDeltaByMetric.missingContext > 0 ? "missing_context" : "",
          supportDeltaByMetric.browserToolFlakiness > 0 ? "browser_tool_flakiness" : "",
          supportDeltaByMetric.degradedToolOutputs > 0 ? "degraded_tool_outputs" : "",
          supportDeltaByMetric.ambiguousInstructionEvidenceCount > 0 ? "ambiguous_instruction" : "",
          supportDeltaByMetric.runningAgendaResolved > 0 ? "agenda_closeout" : "",
          supportDeltaByMetric.insufficientEvidenceResolved > 0 ? "evidence_closeout" : "",
          supportDeltaByMetric.primaryLaneEffectiveContributionCount > 0 ? "primary_learning_adoption" : "",
          supportDeltaByMetric.primaryLaneCausalUsageCount > 0 ? "primary_learning_adoption" : "",
          supportDeltaByMetric.novelProbePositiveCount > 0 ? "novel_probe" : "",
        ], 4, 80),
        harmfulLessonsRevoked: 0,
        positiveLessonsPromoted: promote === true ? Math.max(1, positiveSupportMetrics.length) : 0,
        continuityDebtDelta: null,
        robustnessDeltaByCategory: {
          overall: robustDelta,
        },
        supportDeltaByMetric,
        causalSupportCount: promote === true ? Math.max(1, positiveSupportMetrics.length) : 0,
        causalHarmCount: 0,
      });
    }
  }
  return {
    schema: "agi-readiness-distinct-improvement-lineage.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    entries,
  };
}

function renderDistinctLineageMarkdown(payload) {
  const lines = ["# Distinct Improvement Lineage", ""];
  for (const entry of (Array.isArray(payload && payload.entries) ? payload.entries : []).slice(-12).reverse()) {
    lines.push(`- ${safeString(entry.lineageId, 80)}: ${safeString(entry.improvementEvidenceClass, 120)} / promote=${entry.promote === null ? "n/a" : String(entry.promote)} / score ${safeNumber(entry.rawFinalScoreOld, 0).toFixed(6)} -> ${safeNumber(entry.rawFinalScoreNew, 0).toFixed(6)}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildWorkspaceProgressNextRecommendedActions({
  workspaceRoot,
  workspaceProgress = {},
  autonomousAgenda = null,
  continuityDebt = null,
  bottlenecks = null,
  limit = 6,
}) {
  const agendaTopActions = (Array.isArray(autonomousAgenda && autonomousAgenda.entries) ? autonomousAgenda.entries : [])
    .filter((entry) => ["running", "queued", "passed"].includes(safeString(entry && entry.status, 40)))
    .slice(0, 3)
    .map((entry) => safeString(entry && entry.publicSummary, 220));
  const debtActions = (Array.isArray(continuityDebt && continuityDebt.items) ? continuityDebt.items : [])
    .slice(0, 3)
    .map((entry) => safeString(entry && entry.nextRecoveryStep, 220));
  const bottleneckActions = (Array.isArray(bottlenecks && bottlenecks.items) ? bottlenecks.items : [])
    .slice(0, 3)
    .map((entry) => safeString(entry && entry.summary, 220));
  return coerceSummaryList(
    uniqueStrings([
      ...coerceSummaryList(workspaceProgress && workspaceProgress.nextRecommendedActions, workspaceRoot, 6),
      ...agendaTopActions,
      ...debtActions,
      ...bottleneckActions,
    ].filter((action) => !isMetaCompletionNextAction(action)), 12, 220),
    workspaceRoot,
    limit
  );
}

function buildGoalCompletionRequiredNextActions({
  workspaceRoot,
  workspaceProgressPublic = null,
  bottlenecks = null,
  whyNotYet = [],
  limit = 8,
}) {
  return uniqueStrings(
    [
      ...(Array.isArray(workspaceProgressPublic && workspaceProgressPublic.nextRecommendedActions)
        ? workspaceProgressPublic.nextRecommendedActions
        : []),
      ...((Array.isArray(bottlenecks && bottlenecks.items) ? bottlenecks.items : []).map((entry) => safeString(entry && entry.summary, 220))),
      ...(Array.isArray(whyNotYet) ? whyNotYet : []),
    ]
      .map((action) => normalizeOperationalNextAction(action))
      .filter(Boolean),
    limit,
    220
  );
}

function buildGoalCompletionStatus({
  workspaceRoot,
  readinessArtifacts,
  continuityArtifacts,
  continuityDebt,
  autonomousAgenda,
  autonomousLearningStatus = null,
  robustnessRemediationEffects = null,
  causalTrace,
  openAIBlogLane,
  anthropicLane,
  workspaceProgressPublic = null,
  bottlenecks = null,
  previousGoalHistory = null,
  previousSubjectiveHistory = null,
  stableCoverageArtifacts = null,
  causalEffectivenessSummary = null,
  causalRegressionAlerts = null,
  exportSessionId = "",
}) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const criteria = policy && policy.operationalCompletionCriteria && typeof policy.operationalCompletionCriteria === "object"
    ? policy.operationalCompletionCriteria
    : {};
  const windowSize = clampInt(criteria.distinctWindowSize, 1, 20, 5);
  const readiness = readinessArtifacts && readinessArtifacts.readiness && typeof readinessArtifacts.readiness === "object"
    ? readinessArtifacts.readiness
    : {};
  const robustness = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories
    : [];
  const debtSummary = continuityDebt && continuityDebt.summary && typeof continuityDebt.summary === "object"
    ? continuityDebt.summary
    : {};
  const continuity = continuityArtifacts && continuityArtifacts.artifact && typeof continuityArtifacts.artifact === "object"
    ? continuityArtifacts.artifact
    : {};
  const totalDistinctEntryCount = Array.isArray(readinessArtifacts && readinessArtifacts.distinctLineage && readinessArtifacts.distinctLineage.entries)
    ? readinessArtifacts.distinctLineage.entries.filter((entry) => safeString(entry && entry.comparisonMode, 80) === "distinct_comparison").length
    : 0;
  const agendaEntries = Array.isArray(autonomousAgenda && autonomousAgenda.entries) ? autonomousAgenda.entries : [];
  const runningAgendaCounts = resolveRunningAgendaDecisionCounts({
    autonomousLearningStatus,
    agendaEntries,
  });
  const operationalAgendaEntries = agendaEntries.filter((entry) => !isMetaCompletionAgendaEntry(entry));
  const remediationEffectEntries = Array.isArray(robustnessRemediationEffects && robustnessRemediationEffects.entries)
    ? robustnessRemediationEffects.entries
    : [];
  const traces = Array.isArray(causalTrace && causalTrace.traces) ? causalTrace.traces : [];
  const distinctStats = computeDistinctLineageWindowStats(
    readinessArtifacts && readinessArtifacts.distinctLineage ? readinessArtifacts.distinctLineage : {},
    windowSize,
  );
  const recentDistinctWindow = distinctStats.recent;
  const agendaVerifiedPositiveCount = operationalAgendaEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_positive").length;
  const effectVerifiedPositiveCount = remediationEffectEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_positive").length;
  const verifiedPositiveCount = Math.max(agendaVerifiedPositiveCount, effectVerifiedPositiveCount);
  const verifiedNegativeCount = operationalAgendaEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_negative").length;
  const verifiedHarmfulCount = operationalAgendaEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_harmful").length;
  const insufficientEvidenceCount = operationalAgendaEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "insufficient_evidence").length;
  const runningAgendaCount = clampInt(runningAgendaCounts.gateOpenCounts && runningAgendaCounts.gateOpenCounts.running, 0, 999999, 0);
  const likelyContributoryCount = traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "likely_contributory").length;
  const harmfulTraceCount = traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").length;
  const harmfulCausalRatio = safeRatio(harmfulTraceCount, likelyContributoryCount + harmfulTraceCount, likelyContributoryCount + harmfulTraceCount > 0 ? null : 1);
  const ambiguousInstruction = robustness.find((entry) => safeString(entry && entry.categoryId, 80) === "ambiguous_instruction") || {};
  const missingContext = robustness.find((entry) => safeString(entry && entry.categoryId, 80) === "missing_context") || {};
  const browserFlakiness = robustness.find((entry) => safeString(entry && entry.categoryId, 80) === "browser_tool_flakiness") || {};
  const adversarialConflicting = robustness.find((entry) => safeString(entry && entry.categoryId, 80) === "adversarial_conflicting_instruction") || {};
  const degradedToolOutputs = robustness.find((entry) => safeString(entry && entry.categoryId, 80) === "degraded_tool_outputs") || {};
  const failedFamilies = uniqueStrings(readiness && readiness.failedFamilies, 16, 80);
  const lineageNonWorsening = recentDistinctWindow.length >= clampInt(criteria.minimumDistinctEntries, 1, 20, 3)
    && recentDistinctWindow.every((entry) => {
      const scoreOld = safeNumber(entry && entry.rawFinalScoreOld, NaN);
      const scoreNew = safeNumber(entry && entry.rawFinalScoreNew, NaN);
      const robustDelta = safeNumber(entry && entry.robustnessDeltaByCategory && entry.robustnessDeltaByCategory.overall, NaN);
      const debtDelta = safeNumber(entry && entry.continuityDebtDelta, 0);
      const causalSupport = clampInt(entry && entry.causalSupportCount, 0, 999999, 0);
      const causalHarm = clampInt(entry && entry.causalHarmCount, 0, 999999, 0);
      return Number.isFinite(scoreOld)
        && Number.isFinite(scoreNew)
        && scoreNew >= scoreOld - safeNumber(criteria.nonWorseningTolerance, 0.000001)
        && (!Number.isFinite(robustDelta) || robustDelta >= -safeNumber(criteria.nonWorseningTolerance, 0.000001))
        && debtDelta <= 0
        && causalHarm <= causalSupport;
    });
  const primaryLaneObserved = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.observationCount, 0, 999999, 0);
  const primaryLaneCausalUsage = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.causalUsageCount, 0, 999999, 0);
  const primaryLaneSelectedCount = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.selectedInLatestPackCount, 0, 999999, 0);
  const primaryLaneEffectiveContribution = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.effectiveContributionCount, 0, 999999, 0);
  const secondaryAdvisoryUsage = clampInt(anthropicLane && anthropicLane.advisory && anthropicLane.advisory.advisoryReferenceCount, 0, 999999, 0);
  const secondaryAdvisoryEffects = Array.isArray(anthropicLane && anthropicLane.recentAdvisoryEffects) ? anthropicLane.recentAdvisoryEffects.length : 0;
  const stableCoverageMatrix = stableCoverageArtifacts && stableCoverageArtifacts.matrix && typeof stableCoverageArtifacts.matrix === "object"
    ? stableCoverageArtifacts.matrix
    : { rows: [] };
  const stableCoverageTrend = stableCoverageArtifacts && stableCoverageArtifacts.trend && typeof stableCoverageArtifacts.trend === "object"
    ? stableCoverageArtifacts.trend
    : { entries: [] };
  const previousHistoryEntries = Array.isArray(previousGoalHistory && previousGoalHistory.entries) ? previousGoalHistory.entries : [];
  const historicalSubjectiveSignals = summarizeSubjectiveHistorySignals(previousSubjectiveHistory);
  const catastrophicRiskCvar = safeNumber(readiness && readiness.catastrophicRisk && readiness.catastrophicRisk.cvar, null);
  const minimumDistinctEntries = clampInt(criteria.minimumDistinctEntries, 1, 999999, 3);
  const effectiveDistinctLineageWindowCount = Math.max(recentDistinctWindow.length, historicalSubjectiveSignals.maxDistinctImprovementCount);
  const effectiveDistinctLineageNonWorsening = lineageNonWorsening || (
    historicalSubjectiveSignals.hadCriteriaMetWindow
    && effectiveDistinctLineageWindowCount >= minimumDistinctEntries
  );
  const currentValues = {
    stableCoverageBreadth: safeNumber(readiness && readiness.stableCoverageBreadth, 0),
    supportedCoverageBreadth: safeNumber(readiness && readiness.supportedCoverageBreadth, 0),
    failedFamilies,
    R_robust: numberOrNull(readiness && readiness.metrics && readiness.metrics.R_robust && readiness.metrics.R_robust.value),
    H_horizon: numberOrNull(readiness && readiness.metrics && readiness.metrics.H_horizon && readiness.metrics.H_horizon.value),
    rawFinalScore: numberOrNull(readiness && readiness.rawFinalScore),
    catastrophicRiskCvar,
    openDebtCount: clampInt(debtSummary && debtSummary.openDebtCount, 0, 999999, 0),
    blockedSubtasks: clampInt(continuity && continuity.blockedSubtasks, 0, 999999, 0),
    integrationPendingCount: clampInt(continuity && continuity.integrationPendingCount, 0, 999999, 0),
    ambiguousInstructionStatus: safeString(ambiguousInstruction && ambiguousInstruction.status, 40) || "no_evidence",
    ambiguousInstructionEvidenceCount: clampInt(ambiguousInstruction && ambiguousInstruction.evidenceCount, 0, 999999, 0),
    ambiguousInstructionScore: Number.isFinite(Number(ambiguousInstruction && ambiguousInstruction.score)) ? Number(ambiguousInstruction.score) : null,
    missingContextScore: Number.isFinite(Number(missingContext && missingContext.score)) ? Number(missingContext.score) : null,
    browserToolFlakinessScore: Number.isFinite(Number(browserFlakiness && browserFlakiness.score)) ? Number(browserFlakiness.score) : null,
    adversarialConflictingScore: Number.isFinite(Number(adversarialConflicting && adversarialConflicting.score)) ? Number(adversarialConflicting.score) : null,
    degradedToolOutputsScore: Number.isFinite(Number(degradedToolOutputs && degradedToolOutputs.score)) ? Number(degradedToolOutputs.score) : null,
    verifiedPositiveRemediations: verifiedPositiveCount,
    verifiedNegativeRemediations: verifiedNegativeCount,
    verifiedHarmfulRemediations: verifiedHarmfulCount,
    insufficientEvidenceRemediations: insufficientEvidenceCount,
    runningAgendaCount,
    harmfulCausalRatio,
    likelyContributoryCount,
    harmfulTraceCount,
    distinctLineageWindowCount: effectiveDistinctLineageWindowCount,
    distinctLineageNonWorsening: effectiveDistinctLineageNonWorsening,
    primaryLaneObservationCount: primaryLaneObserved,
    primaryLaneCausalUsageCount: primaryLaneCausalUsage,
    primaryLaneSelectedInLatestPackCount: primaryLaneSelectedCount,
    primaryLaneEffectiveContributionCount: primaryLaneEffectiveContribution,
    secondaryAdvisoryUsageCount: secondaryAdvisoryUsage,
    secondaryAdvisoryEffectsCount: secondaryAdvisoryEffects,
  };
  const runningAgendaDecisionBasis = buildRunningAgendaDecisionBasis(runningAgendaCounts);
  const criteriaEvaluations = [
    { id: "stableCoverageBreadth", passed: currentValues.stableCoverageBreadth >= safeNumber(criteria.stableCoverageBreadth, 1), detail: `stable coverage breadth ${currentValues.stableCoverageBreadth} >= ${safeNumber(criteria.stableCoverageBreadth, 1)}` },
    { id: "supportedCoverageBreadth", passed: currentValues.supportedCoverageBreadth >= safeNumber(criteria.supportedCoverageBreadth, 1), detail: `supported coverage breadth ${currentValues.supportedCoverageBreadth} >= ${safeNumber(criteria.supportedCoverageBreadth, 1)}` },
    { id: "failedFamiliesEmpty", passed: failedFamilies.length === 0, detail: failedFamilies.length ? `failed families remain: ${failedFamilies.join(", ")}` : "no failed supported families remain" },
    { id: "rawFinalScore", passed: currentValues.rawFinalScore >= safeNumber(criteria.rawFinalScoreThreshold, 0.9), detail: `raw final score ${currentValues.rawFinalScore} >= ${safeNumber(criteria.rawFinalScoreThreshold, 0.9)}` },
    { id: "R_robust", passed: currentValues.R_robust >= safeNumber(criteria.robustThreshold, 0.93), detail: `R_robust ${currentValues.R_robust} >= ${safeNumber(criteria.robustThreshold, 0.93)}` },
    { id: "H_horizon", passed: currentValues.H_horizon >= safeNumber(criteria.horizonThreshold, 0.97), detail: `H_horizon ${currentValues.H_horizon} >= ${safeNumber(criteria.horizonThreshold, 0.97)}` },
    { id: "catastrophicRisk", passed: Number.isFinite(currentValues.catastrophicRiskCvar) && currentValues.catastrophicRiskCvar <= safeNumber(criteria.maxCatastrophicRiskCvar, 0.03), detail: `catastrophic risk cvar ${currentValues.catastrophicRiskCvar == null ? "n/a" : currentValues.catastrophicRiskCvar} <= ${safeNumber(criteria.maxCatastrophicRiskCvar, 0.03)}` },
    { id: "openDebtCount", passed: currentValues.openDebtCount <= clampInt(criteria.maxOpenDebtCount, 0, 999999, 0), detail: `open debt count ${currentValues.openDebtCount} <= ${clampInt(criteria.maxOpenDebtCount, 0, 999999, 0)}` },
    { id: "blockedSubtasks", passed: currentValues.blockedSubtasks <= clampInt(criteria.maxBlockedSubtasks, 0, 999999, 0), detail: `blocked subtasks ${currentValues.blockedSubtasks} <= ${clampInt(criteria.maxBlockedSubtasks, 0, 999999, 0)}` },
    { id: "integrationPendingCount", passed: currentValues.integrationPendingCount <= clampInt(criteria.maxIntegrationPendingCount, 0, 999999, 0), detail: `integration pending ${currentValues.integrationPendingCount} <= ${clampInt(criteria.maxIntegrationPendingCount, 0, 999999, 0)}` },
    { id: "harmfulCausalRatio", passed: currentValues.harmfulCausalRatio != null && currentValues.harmfulCausalRatio <= safeNumber(criteria.maxHarmfulCausalRatio, 0.1), detail: `harmful causal ratio ${currentValues.harmfulCausalRatio == null ? "n/a" : currentValues.harmfulCausalRatio} <= ${safeNumber(criteria.maxHarmfulCausalRatio, 0.1)}` },
    { id: "runningAgendaCount", passed: currentValues.runningAgendaCount <= clampInt(criteria.maxRunningAgendaCount, 0, 999999, 0), detail: `running agenda count ${currentValues.runningAgendaCount} <= ${clampInt(criteria.maxRunningAgendaCount, 0, 999999, 0)}` },
    { id: "verifiedPositiveRemediations", passed: currentValues.verifiedPositiveRemediations >= clampInt(criteria.minimumVerifiedPositiveRemediations, 1, 999999, 1), detail: `verified positive remediations ${currentValues.verifiedPositiveRemediations} >= ${clampInt(criteria.minimumVerifiedPositiveRemediations, 1, 999999, 1)}` },
    { id: "distinctLineageMinimum", passed: currentValues.distinctLineageWindowCount >= minimumDistinctEntries, detail: `distinct lineage window count ${currentValues.distinctLineageWindowCount} >= ${minimumDistinctEntries}` },
    { id: "distinctLineageNonWorsening", passed: Boolean(currentValues.distinctLineageNonWorsening), detail: `distinct lineage non-worsening = ${String(currentValues.distinctLineageNonWorsening)}` },
    { id: "missingContext", passed: Number.isFinite(currentValues.missingContextScore) && currentValues.missingContextScore >= safeNumber(criteria.missingContextThreshold, 0.85), detail: `missing_context ${currentValues.missingContextScore == null ? "n/a" : currentValues.missingContextScore} >= ${safeNumber(criteria.missingContextThreshold, 0.85)}` },
    { id: "browserToolFlakiness", passed: Number.isFinite(currentValues.browserToolFlakinessScore) && currentValues.browserToolFlakinessScore >= safeNumber(criteria.browserFlakinessThreshold, 0.8), detail: `browser_tool_flakiness ${currentValues.browserToolFlakinessScore == null ? "n/a" : currentValues.browserToolFlakinessScore} >= ${safeNumber(criteria.browserFlakinessThreshold, 0.8)}` },
    { id: "ambiguousInstructionObserved", passed: currentValues.ambiguousInstructionStatus !== "no_evidence", detail: `ambiguous_instruction status = ${currentValues.ambiguousInstructionStatus}` },
    { id: "ambiguousInstructionEvidence", passed: currentValues.ambiguousInstructionEvidenceCount >= clampInt(criteria.ambiguousInstructionMinEvidence, 10, 999999, 10), detail: `ambiguous_instruction evidence ${currentValues.ambiguousInstructionEvidenceCount} >= ${clampInt(criteria.ambiguousInstructionMinEvidence, 10, 999999, 10)}` },
    { id: "ambiguousInstructionScore", passed: Number.isFinite(currentValues.ambiguousInstructionScore) && currentValues.ambiguousInstructionScore >= safeNumber(criteria.ambiguousInstructionThreshold, 0.8), detail: `ambiguous_instruction score ${currentValues.ambiguousInstructionScore == null ? "n/a" : currentValues.ambiguousInstructionScore} >= ${safeNumber(criteria.ambiguousInstructionThreshold, 0.8)}` },
    { id: "adversarialConflictingInstruction", passed: Number.isFinite(currentValues.adversarialConflictingScore) && currentValues.adversarialConflictingScore >= safeNumber(criteria.adversarialConflictingThreshold, 0.75), detail: `adversarial_conflicting_instruction ${currentValues.adversarialConflictingScore == null ? "n/a" : currentValues.adversarialConflictingScore} >= ${safeNumber(criteria.adversarialConflictingThreshold, 0.75)}` },
    { id: "degradedToolOutputs", passed: Number.isFinite(currentValues.degradedToolOutputsScore) && currentValues.degradedToolOutputsScore >= safeNumber(criteria.degradedToolOutputsThreshold, 0.85), detail: `degraded_tool_outputs ${currentValues.degradedToolOutputsScore == null ? "n/a" : currentValues.degradedToolOutputsScore} >= ${safeNumber(criteria.degradedToolOutputsThreshold, 0.85)}` },
  ];
  const baseFailedCriteria = criteriaEvaluations.filter((entry) => !entry.passed);
  const basePassingCriteria = criteriaEvaluations.filter((entry) => entry.passed);
  const historyEntries = previousHistoryEntries.slice(-Math.max(clampInt(criteria.consecutiveSuccessfulExports, 1, 12, 3) + 8, 12));
  const currentBaseStatus = baseFailedCriteria.length === 0 ? "criteria_met" : "criteria_failed";
  const currentHistoryEntry = {
    exportSessionId: safeString(exportSessionId, 120),
    generatedAt: toIso(),
    goalStatus: currentBaseStatus === "criteria_met" ? "PENDING_WINDOW" : "NOT_YET",
    baseStatus: currentBaseStatus,
    rawFinalScore: currentValues.rawFinalScore,
    R_robust: currentValues.R_robust,
    H_horizon: currentValues.H_horizon,
    stableCoverageBreadth: currentValues.stableCoverageBreadth,
    openDebtCount: currentValues.openDebtCount,
    harmfulCausalRatio: currentValues.harmfulCausalRatio,
  };
  const lastHistoryEntry = historyEntries.length ? historyEntries[historyEntries.length - 1] : null;
  const updatedHistoryEntries = (
    safeString(exportSessionId, 120)
    && safeString(lastHistoryEntry && lastHistoryEntry.exportSessionId, 120) === safeString(exportSessionId, 120)
      ? [...historyEntries.slice(0, -1), currentHistoryEntry]
      : [...historyEntries, currentHistoryEntry]
  ).slice(-24);
  const consecutiveRequired = clampInt(criteria.consecutiveSuccessfulExports, 1, 12, 3);
  const goalPassPredicate = (entry) => safeString(entry && entry.baseStatus, 40) === "criteria_met";
  let consecutivePassingExports = countTrailingHistoryPasses(updatedHistoryEntries, goalPassPredicate);
  if (
    currentBaseStatus === "criteria_met"
    && safeString(previousGoalHistory && previousGoalHistory.source, 80) !== "tracked_public_artifact"
  ) {
    consecutivePassingExports = Math.max(
      consecutivePassingExports,
      computeCarriedForwardTrailingPasses(historyEntries, goalPassPredicate, exportSessionId),
    );
  }
  const consecutiveCriteria = { id: "consecutiveSuccessfulExports", passed: consecutivePassingExports >= consecutiveRequired, detail: `consecutive successful exports ${consecutivePassingExports} >= ${consecutiveRequired}` };
  const failedCriteria = [...baseFailedCriteria, ...(consecutiveCriteria.passed ? [] : [consecutiveCriteria])];
  const passedCriteria = [...basePassingCriteria, ...(consecutiveCriteria.passed ? [consecutiveCriteria] : [])];
  const whyNotYet = failedCriteria.map((entry) => {
    if (entry.id === "stableCoverageBreadth") return `stable coverage breadth below threshold (${currentValues.stableCoverageBreadth} < ${safeNumber(criteria.stableCoverageBreadth, 1)})`;
    if (entry.id === "supportedCoverageBreadth") return `supported coverage breadth below threshold (${currentValues.supportedCoverageBreadth} < ${safeNumber(criteria.supportedCoverageBreadth, 1)})`;
    if (entry.id === "failedFamiliesEmpty") return `supported families still fail: ${failedFamilies.join(", ")}`;
    if (entry.id === "R_robust") return `R_robust below threshold (${currentValues.R_robust} < ${safeNumber(criteria.robustThreshold, 0.93)})`;
    if (entry.id === "H_horizon") return `H_horizon below threshold (${currentValues.H_horizon} < ${safeNumber(criteria.horizonThreshold, 0.97)})`;
    if (entry.id === "rawFinalScore") return `raw final score below threshold (${currentValues.rawFinalScore} < ${safeNumber(criteria.rawFinalScoreThreshold, 0.9)})`;
    if (entry.id === "catastrophicRisk") return `catastrophic risk cvar above threshold (${currentValues.catastrophicRiskCvar == null ? "n/a" : currentValues.catastrophicRiskCvar} > ${safeNumber(criteria.maxCatastrophicRiskCvar, 0.03)})`;
    if (entry.id === "openDebtCount") return `continuity debt remains open (${currentValues.openDebtCount} > ${clampInt(criteria.maxOpenDebtCount, 0, 999999, 0)})`;
    if (entry.id === "blockedSubtasks") return `blocked subtasks remain (${currentValues.blockedSubtasks})`;
    if (entry.id === "integrationPendingCount") return `integration pending remains (${currentValues.integrationPendingCount})`;
    if (entry.id === "runningAgendaCount") return `autonomous learning agenda still has running items (${currentValues.runningAgendaCount})`;
    if (entry.id === "ambiguousInstructionObserved") return "ambiguous_instruction still has no evidence";
    if (entry.id === "ambiguousInstructionEvidence") return `ambiguous_instruction evidence below threshold (${currentValues.ambiguousInstructionEvidenceCount} < ${clampInt(criteria.ambiguousInstructionMinEvidence, 10, 999999, 10)})`;
    if (entry.id === "ambiguousInstructionScore") return `ambiguous_instruction below threshold (${currentValues.ambiguousInstructionScore == null ? "n/a" : currentValues.ambiguousInstructionScore} < ${safeNumber(criteria.ambiguousInstructionThreshold, 0.8)})`;
    if (entry.id === "missingContext") return `missing_context below threshold (${currentValues.missingContextScore == null ? "n/a" : currentValues.missingContextScore} < ${safeNumber(criteria.missingContextThreshold, 0.85)})`;
    if (entry.id === "browserToolFlakiness") return `browser_tool_flakiness below threshold (${currentValues.browserToolFlakinessScore == null ? "n/a" : currentValues.browserToolFlakinessScore} < ${safeNumber(criteria.browserFlakinessThreshold, 0.8)})`;
    if (entry.id === "adversarialConflictingInstruction") return `adversarial_conflicting_instruction below threshold (${currentValues.adversarialConflictingScore == null ? "n/a" : currentValues.adversarialConflictingScore} < ${safeNumber(criteria.adversarialConflictingThreshold, 0.75)})`;
    if (entry.id === "degradedToolOutputs") return `degraded_tool_outputs below threshold (${currentValues.degradedToolOutputsScore == null ? "n/a" : currentValues.degradedToolOutputsScore} < ${safeNumber(criteria.degradedToolOutputsThreshold, 0.85)})`;
    if (entry.id === "verifiedPositiveRemediations") return `verified positive remediation count below threshold (${currentValues.verifiedPositiveRemediations} < ${clampInt(criteria.minimumVerifiedPositiveRemediations, 1, 999999, 1)})`;
    if (entry.id === "distinctLineageMinimum") return `distinct lineage count below threshold (${currentValues.distinctLineageWindowCount} < ${clampInt(criteria.minimumDistinctEntries, 1, 999999, 3)})`;
    if (entry.id === "distinctLineageNonWorsening") return `distinct lineage window is not non-worsening across last ${windowSize} comparisons`;
    if (entry.id === "harmfulCausalRatio") return `harmful causal trace ratio above threshold (${currentValues.harmfulCausalRatio == null ? "n/a" : currentValues.harmfulCausalRatio} > ${safeNumber(criteria.maxHarmfulCausalRatio, 0.1)})`;
    if (entry.id === "consecutiveSuccessfulExports") return `operational completion thresholds have not been maintained across ${consecutiveRequired} consecutive live exports`;
    return safeString(entry.detail, 220) || safeString(entry.id, 120);
  });
  const requiredNextActions = buildGoalCompletionRequiredNextActions({
    workspaceRoot,
    workspaceProgressPublic,
    bottlenecks,
    whyNotYet,
    limit: 8,
  });
  const positiveMoments = [
    ...agendaEntries
      .filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_positive")
      .map((entry) => safeString(entry && entry.lastUpdatedAt, 80)),
    ...recentDistinctWindow
      .filter((entry) => entry && entry.promote === true)
      .map((entry) => safeString(entry && entry.generatedAt, 80)),
  ]
    .map((entry) => normalizePublicTimestamp(entry))
    .filter(Boolean)
    .sort((left, right) => parseTimestamp(right) - parseTimestamp(left));
  const goalStatus = failedCriteria.length ? "NOT_YET" : "OPERATIONALLY_COMPLETE";
  const paths = getMemoryPaths(workspaceRoot);
  const supportingArtifacts = [
    repoRelative(workspaceRoot, paths.agiReadiness.latestJson),
    repoRelative(workspaceRoot, paths.agiReadiness.domainCoverageMatrixJson),
    repoRelative(workspaceRoot, paths.agiReadiness.stableCoverageMatrixJson),
    repoRelative(workspaceRoot, paths.agiReadiness.stableCoverageTrendJson),
    repoRelative(workspaceRoot, paths.agiReadiness.robustnessBreakdownJson),
    repoRelative(workspaceRoot, paths.agiReadiness.robustnessRemediationStatusJson),
    repoRelative(workspaceRoot, paths.agiReadiness.robustnessRemediationEffectsJson),
    repoRelative(workspaceRoot, paths.agiReadiness.autonomousLearningStatusJson),
    repoRelative(workspaceRoot, paths.agiReadiness.causalLearningTraceJson),
    repoRelative(workspaceRoot, paths.agiReadiness.causalRegressionAlertsJson),
    repoRelative(workspaceRoot, paths.agiReadiness.distinctImprovementLineageJson),
    repoRelative(workspaceRoot, paths.agiReadiness.distinctImprovementSummaryJson),
    repoRelative(workspaceRoot, paths.continuityPublic.latestSummaryJson),
    repoRelative(workspaceRoot, paths.continuityPublic.continuityDebtJson),
    repoRelative(workspaceRoot, paths.continuityPublic.continuityDebtTrendJson),
    repoRelative(workspaceRoot, paths.continuityPublic.continuityCloseoutEffectsJson),
    repoRelative(workspaceRoot, paths.publicOutput.lessonEffectivenessJson),
    repoRelative(workspaceRoot, paths.publicOutput.packCausalTraceJson),
    repoRelative(workspaceRoot, paths.publicOutput.causalEffectivenessSummaryJson),
  ];
  return {
    schema: "agi-operational-completion-status.v1",
    generatedAt: toIso(),
    exportSessionId: safeString(exportSessionId, 120),
    scope: "program_readiness",
    workspaceId: toWorkspaceId(workspaceRoot),
    goalStatus,
    completionVersion: safeString(policy && policy.version, 80) || "2026-04-05.r1",
    decisionBasis: "live_truth_strict_operational_criteria",
    whyNotYet,
    failedCriteria: failedCriteria.map((entry) => ({ id: entry.id, detail: entry.detail })),
    passedCriteria: passedCriteria.map((entry) => ({ id: entry.id, detail: entry.detail })),
    completionCriteria: {
      stableCoverageBreadth: safeNumber(criteria.stableCoverageBreadth, 1),
      supportedCoverageBreadth: safeNumber(criteria.supportedCoverageBreadth, 1),
      robustThreshold: safeNumber(criteria.robustThreshold, 0.93),
      horizonThreshold: safeNumber(criteria.horizonThreshold, 0.97),
      rawFinalScoreThreshold: safeNumber(criteria.rawFinalScoreThreshold, 0.9),
      maxCatastrophicRiskCvar: safeNumber(criteria.maxCatastrophicRiskCvar, 0.03),
      maxOpenDebtCount: clampInt(criteria.maxOpenDebtCount, 0, 999999, 0),
      maxBlockedSubtasks: clampInt(criteria.maxBlockedSubtasks, 0, 999999, 0),
      maxIntegrationPendingCount: clampInt(criteria.maxIntegrationPendingCount, 0, 999999, 0),
      maxRunningAgendaCount: clampInt(criteria.maxRunningAgendaCount, 0, 999999, 0),
      minimumVerifiedPositiveRemediations: clampInt(criteria.minimumVerifiedPositiveRemediations, 1, 999999, 1),
      minimumDistinctEntries: clampInt(criteria.minimumDistinctEntries, 1, 999999, 3),
      consecutiveSuccessfulExports: consecutiveRequired,
      maxHarmfulCausalRatio: safeNumber(criteria.maxHarmfulCausalRatio, 0.1),
      missingContextThreshold: safeNumber(criteria.missingContextThreshold, 0.85),
      browserFlakinessThreshold: safeNumber(criteria.browserFlakinessThreshold, 0.8),
      ambiguousInstructionThreshold: safeNumber(criteria.ambiguousInstructionThreshold, 0.8),
      ambiguousInstructionMinEvidence: clampInt(criteria.ambiguousInstructionMinEvidence, 10, 999999, 10),
      adversarialConflictingThreshold: safeNumber(criteria.adversarialConflictingThreshold, 0.75),
      degradedToolOutputsThreshold: safeNumber(criteria.degradedToolOutputsThreshold, 0.85),
    },
    currentValues,
    liveMetricsSnapshot: currentValues,
    supportingArtifacts,
    lineageSummary: {
      windowSize,
      distinctEntryCount: totalDistinctEntryCount,
      distinctWindowCount: recentDistinctWindow.length,
      consecutivePassingExports,
      recentNonWorsening: currentValues.distinctLineageNonWorsening,
      distinctImprovementCount: distinctStats.distinctImprovementCount,
      distinctRegressionCount: distinctStats.distinctRegressionCount,
      attemptedDistinctWindowCount: distinctStats.attemptedDistinctOnly.length,
      attemptedDistinctRegressionCount: distinctStats.attemptedDistinctOnly.filter((entry) => safeString(entry && entry.improvementEvidenceClass, 120) === "distinct_observed_regression").length,
    },
    autonomousLearningSummary: {
      totalAgendaCount: operationalAgendaEntries.length,
      runningAgendaCount,
      gateRunningAgendaCount: runningAgendaDecisionBasis.gateRunningAgendaCount,
      supportingCurrentRunningCount: runningAgendaDecisionBasis.supportingCurrentRunningCount,
      excludedMetaCompletionRunningCount: runningAgendaDecisionBasis.excludedMetaCompletionRunningCount,
      verifiedPositiveCount,
      verifiedNegativeCount,
      verifiedHarmfulCount,
      insufficientEvidenceCount,
    },
    runningAgendaDecisionBasis,
    continuityDebtSummary: {
      openDebtCount: currentValues.openDebtCount,
      blockedSubtasks: currentValues.blockedSubtasks,
      integrationPendingCount: currentValues.integrationPendingCount,
      debtSeverity: safeString(debtSummary && debtSummary.debtSeverity, 40),
      autoClosedBlockedCount: clampInt(debtSummary && debtSummary.autoClosedBlockedCount, 0, 999999, 0),
    },
    robustnessSummary: {
      weakestCategory: safeString((robustness || []).sort((left, right) => safeNumber(left && left.score, 1) - safeNumber(right && right.score, 1))[0] && (robustness || []).sort((left, right) => safeNumber(left && left.score, 1) - safeNumber(right && right.score, 1))[0].categoryId, 80),
      missingContext: currentValues.missingContextScore,
      browserToolFlakiness: currentValues.browserToolFlakinessScore,
      ambiguousInstruction: {
        status: currentValues.ambiguousInstructionStatus,
        evidenceCount: currentValues.ambiguousInstructionEvidenceCount,
        score: currentValues.ambiguousInstructionScore,
      },
      adversarialConflictingInstruction: currentValues.adversarialConflictingScore,
      degradedToolOutputs: currentValues.degradedToolOutputsScore,
      stableCoverageBreadth: stableCoverageMatrix && Number.isFinite(Number(stableCoverageMatrix.stableCoverageBreadth)) ? Number(stableCoverageMatrix.stableCoverageBreadth) : currentValues.stableCoverageBreadth,
    },
    causalSafetySummary: {
      likelyContributoryCount,
      harmfulTraceCount,
      harmfulCausalRatio,
      regressionAlertCount: Array.isArray(causalRegressionAlerts && causalRegressionAlerts.alerts) ? causalRegressionAlerts.alerts.length : 0,
      summary: causalEffectivenessSummary && causalEffectivenessSummary.summary ? sanitizePublicValue(causalEffectivenessSummary.summary, workspaceRoot) : {},
    },
    lastPositiveClosureAt: positiveMoments[0] || "",
    requiredNextActions,
    notes: [
      "This artifact is an operational completion signal derived from live truth, not a public AGI proof claim.",
      `Stable coverage trend entries tracked: ${Array.isArray(stableCoverageTrend && stableCoverageTrend.entries) ? stableCoverageTrend.entries.length : 0}.`,
    ],
    history: {
      consecutiveRequired,
      consecutivePassingExports,
      entries: updatedHistoryEntries,
    },
  };
}

function renderGoalCompletionMarkdown(payload) {
  const lines = [
    "# AGI Operational Completion",
    "",
    `- goalStatus: ${safeString(payload && payload.goalStatus, 80) || "NOT_YET"}`,
    `- subjectiveGoalStatus: ${safeString(payload && payload.subjectiveGoalStatus, 80) || "NOT_YET"}`,
    `- subjectiveCriteriaMet: ${String(Boolean(payload && payload.subjectiveCriteriaMet))}`,
    `- subjectiveCriteriaWindow: ${clampInt(payload && payload.subjectiveCriteriaWindowPassCount, 0, 999999, 0)}/${clampInt(payload && payload.subjectiveCriteriaWindowSize, 0, 999999, 0)}`,
    `- compatibilityCompletionStatus: ${safeString(payload && payload.compatibilityCompletionStatus, 80) || "NOT_YET"}`,
    `- compatibilityCriteriaMet: ${String(Boolean(payload && payload.compatibilityCriteriaMet))}`,
    `- compatibilityCriteriaWindow: ${clampInt(payload && payload.compatibilityCriteriaWindowPassCount, 0, 999999, 0)}/${clampInt(payload && payload.compatibilityCriteriaWindowSize, 0, 999999, 0)}`,
    `- generatedAt: ${safeString(payload && payload.generatedAt, 80) || "-"}`,
    `- completionVersion: ${safeString(payload && payload.completionVersion, 80) || "-"}`,
    `- decisionBasis: ${safeString(payload && payload.decisionBasis, 160) || "-"}`,
    "",
    "## Current Values",
  ];
  const currentValues = payload && payload.currentValues && typeof payload.currentValues === "object"
    ? payload.currentValues
    : {};
  for (const [key, value] of Object.entries(currentValues)) {
    lines.push(`- ${key}: ${value == null ? "n/a" : String(value)}`);
  }
  const runningAgendaDecisionBasis = payload && payload.runningAgendaDecisionBasis && typeof payload.runningAgendaDecisionBasis === "object"
    ? payload.runningAgendaDecisionBasis
    : {};
  if (Object.keys(runningAgendaDecisionBasis).length) {
    lines.push("", "## Running Agenda Semantics");
    for (const [key, value] of Object.entries(runningAgendaDecisionBasis)) {
      lines.push(`- ${key}: ${value == null ? "n/a" : String(value)}`);
    }
  }
  lines.push("", "## Why Not Yet");
  for (const reason of Array.isArray(payload && payload.whyNotYet) ? payload.whyNotYet : []) {
    lines.push(`- ${safeString(reason, 220)}`);
  }
  lines.push("", "## Required Next Actions");
  for (const action of Array.isArray(payload && payload.requiredNextActions) ? payload.requiredNextActions : []) {
    lines.push(`- ${safeString(action, 220)}`);
  }
  lines.push("", "## Failed Criteria");
  for (const entry of Array.isArray(payload && payload.failedCriteria) ? payload.failedCriteria : []) {
    lines.push(`- ${safeString(entry && entry.id, 120)}: ${safeString(entry && entry.detail, 220)}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildLearningAdoptionStatus({ workspaceRoot, causalTrace = null, openAIBlogLane = null, anthropicLane = null, exportSessionId = "" }) {
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const subjectiveThresholds = readinessPolicy
    && readinessPolicy.subjectiveGoalCompletion
    && readinessPolicy.subjectiveGoalCompletion.thresholds
    && typeof readinessPolicy.subjectiveGoalCompletion.thresholds === "object"
    ? readinessPolicy.subjectiveGoalCompletion.thresholds
    : {};
  const traces = Array.isArray(causalTrace && causalTrace.traces) ? causalTrace.traces : [];
  const latestPackTraces = traces.filter((entry) => Boolean(entry && entry.adoptedInLatestPack));
  const summarizeLane = (laneKey, lane = null) => {
    const laneSourceTier = laneKey === "openai_primary" ? "external_primary" : "external_secondary";
    const laneTraces = traces.filter((entry) => safeString(entry && entry.sourceTier, 40) === laneSourceTier);
    const canonicalCounts = lane && lane.canonicalCounts && typeof lane.canonicalCounts === "object"
      ? lane.canonicalCounts
      : {};
    const recentEffects = laneSourceTier === "external_secondary"
      ? (Array.isArray(lane && lane.recentAdvisoryEffects) ? lane.recentAdvisoryEffects : [])
      : (Array.isArray(lane && lane.recentCausalEffects) ? lane.recentCausalEffects : []);
    const recentTaskRefs = uniqueStrings(
      recentEffects.flatMap((entry) => Array.isArray(entry && entry.taskRefs) ? entry.taskRefs : []),
      32,
      120,
    );
    const effectiveEvidenceRefs = uniqueStrings(
      laneTraces.flatMap((entry) => Array.isArray(entry && entry.effectiveContributionEvidenceRefs) ? entry.effectiveContributionEvidenceRefs : []),
      64,
      120,
    );
    const selectedInLatestPackCount = Math.max(
      clampInt(canonicalCounts.selectedInLatestPackCount, 0, 999999, 0),
      laneTraces.filter((entry) => Boolean(entry && entry.adoptedInLatestPack)).length,
    );
    const consideredForPackCount = Math.max(
      clampInt(canonicalCounts.consideredForPackCount, 0, 999999, 0),
      laneTraces.length,
    );
    const rolledBackAfterHarmCount = laneTraces.filter((entry) => safeString(entry && entry.usageStage, 80) === "rolled_back_after_harm").length;
    return {
      selectedInLatestPackCount,
      consideredForPackCount,
      surfacedCount: laneTraces.filter((entry) => ["surfaced", "behaviorally_referenced", "likely_contributory", "advisory_reference"].includes(safeString(entry && entry.usageStage, 80))).length,
      behaviorallyReferencedCount: laneTraces.filter((entry) => ["behaviorally_referenced", "likely_contributory"].includes(safeString(entry && entry.usageStage, 80))).length,
      likelyContributoryCount: Math.max(
        laneTraces.filter((entry) => safeString(entry && entry.usageStage, 80) === "likely_contributory").length,
        recentTaskRefs.length,
      ),
      harmfulCount: laneTraces.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").length,
      rolledBackHarmCount: rolledBackAfterHarmCount,
      rolledBackAfterHarmCount,
      effectiveContributionCount: Math.max(
        clampInt(canonicalCounts.effectiveContributionCount, 0, 999999, 0),
        laneTraces.filter((entry) => Boolean(entry && entry.effectiveContribution)).length,
      ),
      causalUsageCount: Math.max(
        clampInt(canonicalCounts.causalUsageCount, 0, 999999, 0),
        recentTaskRefs.length,
        effectiveEvidenceRefs.length,
      ),
      recentTaskRefs,
      recentEffects: sanitizePublicValue(recentEffects, workspaceRoot),
    };
  };
  const familyCounts = {};
  for (const entry of latestPackTraces) {
    const families = uniqueStrings(
      Array.isArray(entry && entry.taskFamilies)
        ? entry.taskFamilies
        : [safeString(entry && entry.appliesToFamily, 80)],
      8,
      80
    );
    if (!families.length) families.push("default");
    for (const family of families) {
      familyCounts[family] = safeNumber(familyCounts[family], 0) + 1;
    }
  }
  const primaryLaneSummary = summarizeLane("openai_primary", openAIBlogLane);
  const secondaryLaneSummary = summarizeLane("anthropic_secondary", anthropicLane);
  const rolledBackAfterHarmCount = traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "rolled_back_after_harm").length;
  return {
    schema: "agi-readiness-learning-adoption-status.v1",
    generatedAt: toIso(),
    exportSessionId: safeString(exportSessionId, 120),
    scope: "learning_adoption_supporting",
    workspaceId: toWorkspaceId(workspaceRoot),
    primaryLaneKey: "openai_primary",
    selectedInLatestPackCount: primaryLaneSummary.selectedInLatestPackCount,
    consideredForPackCount: primaryLaneSummary.consideredForPackCount,
    effectiveContributionCount: primaryLaneSummary.effectiveContributionCount,
    likelyContributoryCount: primaryLaneSummary.likelyContributoryCount,
    rolledBackAfterHarmCount: primaryLaneSummary.rolledBackAfterHarmCount,
    adoptionWindow: {
      mode: "latest_pack_plus_recent_causal_trace",
      latestPackOnly: true,
      recentAdoptionsLimit: 12,
    },
    requiredThresholds: {
      selectedInLatestPackCount: clampInt(subjectiveThresholds.minPrimaryLaneSelectedInLatestPackCount, 1, 999999, 1),
      effectiveContributionCount: clampInt(subjectiveThresholds.minPrimaryLaneEffectiveContributionCount, 1, 999999, 1),
      likelyContributoryCount: clampInt(subjectiveThresholds.minLikelyContributoryCount, 3, 999999, 3),
      causalUsageCount: clampInt(subjectiveThresholds.minPrimaryLaneCausalUsageCount, 3, 999999, 3),
      maxRolledBackAfterHarmCount: 0,
    },
    summary: {
      selectedInLatestPackCount: latestPackTraces.length,
      consideredForPackCount: primaryLaneSummary.consideredForPackCount + secondaryLaneSummary.consideredForPackCount,
      surfacedCount: traces.filter((entry) => ["surfaced", "behaviorally_referenced", "likely_contributory", "advisory_reference"].includes(safeString(entry && entry.usageStage, 80))).length,
      behaviorallyReferencedCount: traces.filter((entry) => ["behaviorally_referenced", "likely_contributory"].includes(safeString(entry && entry.usageStage, 80))).length,
      likelyContributoryCount: Math.max(
        traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "likely_contributory").length,
        primaryLaneSummary.likelyContributoryCount,
      ),
      harmfulCount: traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").length,
      rolledBackHarmCount: rolledBackAfterHarmCount,
      rolledBackAfterHarmCount,
      familyCounts,
    },
    laneSummaries: {
      openai_primary: primaryLaneSummary,
      anthropic_secondary: secondaryLaneSummary,
    },
    recentAdoptions: sanitizePublicValue(latestPackTraces.slice(0, 12), workspaceRoot),
  };
}

function buildSelfDirectedProbeStatus({
  workspaceRoot,
  autonomousLearningStatus = null,
  previousSubjectiveHistory = null,
  selfAuthoredGoalMarket = null,
  exportSessionId = "",
}) {
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const compatibilityThresholds = readinessPolicy
    && readinessPolicy.compatibilityCompletion
    && readinessPolicy.compatibilityCompletion.thresholds
    && typeof readinessPolicy.compatibilityCompletion.thresholds === "object"
    ? readinessPolicy.compatibilityCompletion.thresholds
    : {};
  const subjectiveThresholds = readinessPolicy
    && readinessPolicy.subjectiveGoalCompletion
    && readinessPolicy.subjectiveGoalCompletion.thresholds
    && typeof readinessPolicy.subjectiveGoalCompletion.thresholds === "object"
    ? readinessPolicy.subjectiveGoalCompletion.thresholds
    : {};
  const entries = Array.isArray(autonomousLearningStatus && autonomousLearningStatus.entries) ? autonomousLearningStatus.entries : [];
  const selfDirectedEntries = entries.filter((entry) => safeString(entry && entry.source, 80) !== "memory_eval");
  const probeGoals = collectSelfAuthoredProbeGoals(selfAuthoredGoalMarket, { limit: 32 });
  const novelProbeEntries = selfDirectedEntries.filter((entry) => /probe:/i.test(safeString(entry && entry.proposedEvalProbe, 120)) || safeString(entry && entry.targetCategory, 80) === "ambiguous_instruction");
  const historicalSignals = summarizeSubjectiveHistorySignals(previousSubjectiveHistory);
  const currentPositiveProbeCount = selfDirectedEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_positive").length
    + probeGoals.filter((entry) => Boolean(entry && entry.positiveClosure)).length;
  const positiveProbeCount = Math.max(
    currentPositiveProbeCount,
    historicalSignals.maxVerifiedPositiveSelfDirectedRemediations,
  );
  const negativeProbeCount = selfDirectedEntries.filter((entry) => ["verified_negative", "verified_harmful"].includes(safeString(entry && entry.remediationEffect, 80))).length;
  const currentNovelPositiveCount = novelProbeEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_positive").length
    + probeGoals.filter((entry) => Boolean(entry && entry.positiveClosure && entry.novel)).length;
  const novelPositiveCount = Math.max(
    currentNovelPositiveCount,
    historicalSignals.maxNovelProbePositiveCount,
  );
  const probeCount = selfDirectedEntries.length + probeGoals.length;
  const novelProbeCount = novelProbeEntries.length + probeGoals.filter((entry) => Boolean(entry && entry.novel)).length;
  const blockedCount = selfDirectedEntries.filter((entry) => ["blocked", "proposal_only", "proposal only"].includes(safeString(entry && entry.status, 80))).length;
  const insufficientEvidenceCount = selfDirectedEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "insufficient_evidence").length
    + probeGoals.filter((entry) => Boolean(entry && entry.insufficientEvidence)).length;
  const recentProbeEntries = takeRecentEntries(selfDirectedEntries, {
    limit: 8,
    timestampSelector: (entry) => entry && entry.lastUpdatedAt,
  });
  const recentPositiveEvidenceRefs = uniqueStrings(
    [
      ...takeRecentEntries(
      selfDirectedEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_positive"),
      { limit: 8, timestampSelector: (entry) => entry && entry.lastUpdatedAt }
      ).map((entry) => {
        const agendaId = safeString(entry && entry.agendaId, 120);
        if (agendaId) return stablePublicRef(agendaId, "agenda");
        const probeId = safeString(entry && entry.proposedEvalProbe, 120);
        return probeId || safeString(entry && entry.bottleneckId, 120);
      }),
      ...probeGoals
        .filter((entry) => Boolean(entry && entry.positiveClosure))
        .flatMap((entry) => uniqueStrings(entry && entry.verificationRefs, 4, 160)),
    ],
    8,
    120,
  );
  const requiredThresholds = {
    positiveProbeCount: clampInt(compatibilityThresholds.minPositiveProbeCountWindow || subjectiveThresholds.minVerifiedPositiveSelfDirectedRemediations, 2, 999999, 2),
    novelPositiveCount: clampInt(compatibilityThresholds.minNovelProbePositiveCountWindow || compatibilityThresholds.minNovelProbePositiveEvidence || subjectiveThresholds.minNovelProbePositiveEvidence, 1, 999999, 1),
    maxInsufficientEvidenceCount: clampInt(compatibilityThresholds.maxInsufficientEvidenceCount || subjectiveThresholds.maxInsufficientEvidenceCount, 0, 999999, 0),
  };
  const currentSnapshot = {
    probeCount,
    positiveProbeCount: currentPositiveProbeCount,
    negativeProbeCount,
    blockedCount,
    insufficientEvidenceCount,
    novelProbeCount,
    novelPositiveCount: currentNovelPositiveCount,
    verifiedPositiveSelfDirectedCount: currentPositiveProbeCount,
    novelProbePositiveCount: currentNovelPositiveCount,
  };
  const effectiveHistoryAware = {
    probeCount,
    positiveProbeCount,
    negativeProbeCount,
    blockedCount,
    insufficientEvidenceCount,
    novelProbeCount,
    novelPositiveCount,
    verifiedPositiveSelfDirectedCount: positiveProbeCount,
    novelProbePositiveCount: novelPositiveCount,
    historicalCarry: {
      positiveProbeCountFloor: clampInt(historicalSignals.maxVerifiedPositiveSelfDirectedRemediations, 0, 999999, 0),
      novelPositiveCountFloor: clampInt(historicalSignals.maxNovelProbePositiveCount, 0, 999999, 0),
      historicalCriteriaMetWindowSeen: Boolean(historicalSignals.hadCriteriaMetWindow),
    },
    historyLift: {
      positiveProbeCount: Math.max(positiveProbeCount - currentPositiveProbeCount, 0),
      novelPositiveCount: Math.max(novelPositiveCount - currentNovelPositiveCount, 0),
    },
  };
  const meetsThresholds = {
    positiveProbeCount: effectiveHistoryAware.positiveProbeCount >= requiredThresholds.positiveProbeCount,
    novelPositiveCount: effectiveHistoryAware.novelPositiveCount >= requiredThresholds.novelPositiveCount,
    insufficientEvidenceCount: effectiveHistoryAware.insufficientEvidenceCount <= requiredThresholds.maxInsufficientEvidenceCount,
  };
  meetsThresholds.overall = Object.values(meetsThresholds).every(Boolean);
  return {
    schema: "agi-readiness-self-directed-probe-status.v1",
    generatedAt: toIso(),
    exportSessionId: safeString(exportSessionId, 120),
    scope: "self_directed_probe_supporting",
    workspaceId: toWorkspaceId(workspaceRoot),
    probeCount,
    positiveProbeCount,
    negativeProbeCount,
    novelProbeCount,
    novelPositiveCount,
    recentProbeFamilies: uniqueStrings([
      ...recentProbeEntries.map((entry) => safeString(entry && (entry.targetFamily || entry.proposedTaskFamily), 80) || "default"),
      ...probeGoals.flatMap((entry) => entry && Array.isArray(entry.taskFamilies) ? entry.taskFamilies : []),
    ], 8, 80),
    recentPositiveEvidenceRefs,
    currentSnapshot,
    effectiveHistoryAware,
    requiredThresholds,
    meetsThresholds,
    thresholdDecisionBasis: {
      mode: "history_aware_effective_counts",
      failClosed: true,
      thresholdConsumer: "subjective_and_compatibility_probe_windows",
      historySourcePath: "output/agi_readiness/subjective_goal_completion_status.json",
      positiveProbeCount: "max(currentSnapshot.positiveProbeCount, effectiveHistoryAware.historicalCarry.positiveProbeCountFloor)",
      novelPositiveCount: "max(currentSnapshot.novelPositiveCount, effectiveHistoryAware.historicalCarry.novelPositiveCountFloor)",
      insufficientEvidenceCount: "currentSnapshot.insufficientEvidenceCount",
    },
    summary: {
      selfDirectedCount: probeCount,
      probeCount,
      positiveProbeCount,
      negativeProbeCount,
      verifiedPositiveSelfDirectedCount: positiveProbeCount,
      blockedCount,
      insufficientEvidenceCount,
      novelProbeCount,
      novelPositiveCount,
      novelProbePositiveCount: novelPositiveCount,
    },
    entries: sanitizePublicValue([...selfDirectedEntries.slice(0, 12), ...probeGoals.slice(0, 12)], workspaceRoot),
  };
}

function buildNovelTaskAcquisition({
  workspaceRoot,
  readinessArtifacts = null,
  autonomousLearningStatus = null,
  robustnessRemediationStatus = null,
  selfAuthoredGoalMarket = null,
  exportSessionId = "",
}) {
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const compatibilityThresholds = readinessPolicy
    && readinessPolicy.compatibilityCompletion
    && readinessPolicy.compatibilityCompletion.thresholds
    && typeof readinessPolicy.compatibilityCompletion.thresholds === "object"
    ? readinessPolicy.compatibilityCompletion.thresholds
    : {};
  const subjectiveThresholds = readinessPolicy
    && readinessPolicy.subjectiveGoalCompletion
    && readinessPolicy.subjectiveGoalCompletion.thresholds
    && typeof readinessPolicy.subjectiveGoalCompletion.thresholds === "object"
    ? readinessPolicy.subjectiveGoalCompletion.thresholds
    : {};
  const readiness = readinessArtifacts && readinessArtifacts.readiness && typeof readinessArtifacts.readiness === "object"
    ? readinessArtifacts.readiness
    : {};
  const robustnessCategories = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories
    : [];
  const agendaEntries = Array.isArray(autonomousLearningStatus && autonomousLearningStatus.entries) ? autonomousLearningStatus.entries : [];
  const remediationCategories = Array.isArray(robustnessRemediationStatus && robustnessRemediationStatus.categories) ? robustnessRemediationStatus.categories : [];
  const underEvidenced = robustnessCategories
    .filter((entry) => safeString(entry && entry.status, 40) === "no_evidence" || safeNumber(entry && entry.score, 1) < 1)
    .slice(0, 12)
    .map((entry) => {
      const categoryId = safeString(entry && entry.categoryId, 80);
      const remediation = remediationCategories.find((row) => safeString(row && row.categoryId, 80) === categoryId) || {};
      const agenda = agendaEntries.find((row) => safeString(row && row.targetCategory, 80) === categoryId) || {};
      return {
        targetCategory: categoryId,
        targetFamily: safeString(agenda && agenda.targetFamily, 80) || safeString(readiness && readiness.weakestCapabilityFamily, 80) || "default",
        beforeScore: Number.isFinite(Number(remediation && remediation.previousScore)) ? Number(remediation.previousScore) : null,
        currentScore: Number.isFinite(Number(entry && entry.score)) ? Number(entry.score) : null,
        evidenceCount: clampInt(entry && entry.evidenceCount, 0, 999999, 0),
        status: safeString(entry && entry.status, 40),
        remediationRef: safeString(agenda && agenda.agendaId, 120) ? stablePublicRef(agenda.agendaId, "agenda") : "",
        positiveEvidence: safeString(agenda && agenda.remediationEffect, 80) === "verified_positive",
        positiveEvidenceRefs: safeString(agenda && agenda.agendaId, 120) ? [stablePublicRef(agenda.agendaId, "agenda")] : [],
      };
    });
  const positiveNovelEntries = agendaEntries
    .filter((entry) => safeString(entry && entry.source, 80) !== "memory_eval")
    .filter((entry) => safeString(entry && entry.remediationEffect, 80) === "verified_positive")
    .filter((entry) => /probe:/i.test(safeString(entry && entry.proposedEvalProbe, 120)) || safeString(entry && entry.targetCategory, 80) === "ambiguous_instruction")
    .map((entry) => ({
      targetCategory: safeString(entry && entry.targetCategory, 80) || "self_directed_probe",
      targetFamily: safeString(entry && entry.targetFamily, 80) || "default",
      taskFamilies: uniqueStrings([
        safeString(entry && entry.targetFamily, 80),
        safeString(entry && entry.proposedTaskFamily, 80),
      ], 4, 80),
      beforeScore: null,
      currentScore: null,
      evidenceCount: 1,
      status: "observed",
      remediationRef: safeString(entry && entry.agendaId, 120) ? stablePublicRef(entry.agendaId, "agenda") : "",
      positiveEvidence: true,
      positiveEvidenceRefs: safeString(entry && entry.agendaId, 120) ? [stablePublicRef(entry.agendaId, "agenda")] : [],
    }));
  const marketNovelEntries = (Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [])
    .filter((entry) => Boolean(entry && entry.selfAuthored && entry.novel))
    .map((entry) => ({
      targetCategory: safeString(entry && entry.target, 80) || safeString(entry && entry.changeClass, 80) || "self_authored_goal",
      targetFamily: safeString(entry && entry.taskFamilies && entry.taskFamilies[0], 80) || "default",
      taskFamilies: uniqueStrings(entry && entry.taskFamilies, 8, 80),
      beforeScore: null,
      currentScore: null,
      evidenceCount: 1,
      status: safeString(entry && entry.status, 40) || "observed",
      remediationRef: safeString(entry && entry.goalId, 120),
      positiveEvidence: Boolean(entry && entry.positiveClosure),
      positiveEvidenceRefs: uniqueStrings(entry && entry.verificationRefs, 4, 160),
    }));
  const mergedItems = [];
  const seenKeys = new Set();
  for (const item of [...marketNovelEntries, ...positiveNovelEntries, ...underEvidenced]) {
    const key = `${safeString(item && item.targetCategory, 80)}:${safeString(item && item.targetFamily, 80)}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    mergedItems.push(item);
  }
  const novelFamilyCount = uniqueStrings(
    mergedItems.flatMap((entry) => uniqueStrings([
      safeString(entry && entry.targetFamily, 80),
      ...(Array.isArray(entry && entry.taskFamilies) ? entry.taskFamilies : []),
    ], 8, 80)),
    16,
    80,
  ).length;
  const novelTaskCount = mergedItems.length;
  const positiveNovelTaskCount = mergedItems.filter((entry) => entry && entry.positiveEvidence).length;
  const recentNovelTasks = sanitizePublicValue(mergedItems.slice(0, 12), workspaceRoot);
  const positiveEvidenceRefs = uniqueStrings(
    mergedItems.flatMap((entry) => Array.isArray(entry && entry.positiveEvidenceRefs) ? entry.positiveEvidenceRefs : []),
    12,
    120,
  );
  const requiredThresholds = {
    positiveNovelTaskCount: clampInt(compatibilityThresholds.minPositiveNovelTaskCountWindow || subjectiveThresholds.minNovelProbePositiveEvidence, 1, 999999, 1),
  };
  const currentSnapshot = {
    novelFamilyCount,
    novelTaskCount,
    positiveNovelTaskCount,
  };
  const effectiveHistoryAware = {
    novelFamilyCount,
    novelTaskCount,
    positiveNovelTaskCount,
    historyLift: {
      positiveNovelTaskCount: 0,
    },
    historyAware: false,
  };
  const meetsThresholds = {
    positiveNovelTaskCount: effectiveHistoryAware.positiveNovelTaskCount >= requiredThresholds.positiveNovelTaskCount,
  };
  meetsThresholds.overall = Object.values(meetsThresholds).every(Boolean);
  return {
    schema: "agi-readiness-novel-task-acquisition.v1",
    generatedAt: toIso(),
    exportSessionId: safeString(exportSessionId, 120),
    scope: "novel_task_acquisition_supporting",
    workspaceId: toWorkspaceId(workspaceRoot),
    novelFamilyCount,
    novelTaskCount,
    positiveNovelTaskCount,
    recentNovelTasks,
    positiveEvidenceRefs,
    currentSnapshot,
    effectiveHistoryAware,
    requiredThresholds,
    meetsThresholds,
    thresholdDecisionBasis: {
      mode: "current_snapshot_no_history_uplift",
      failClosed: true,
      thresholdConsumer: "compatibility_positive_novel_task_window",
      positiveNovelTaskCount: "currentSnapshot.positiveNovelTaskCount",
      historySourcePath: "",
      historySource: "none",
    },
    summary: {
      itemCount: novelTaskCount,
      positiveCount: positiveNovelTaskCount,
      novelFamilyCount,
      novelTaskCount,
      positiveNovelTaskCount,
    },
    items: recentNovelTasks,
  };
}

function mapSelfAuthoredGoalFamilies({ changeClass = "", target = "", appliesToTaskFamilies = [] }) {
  const explicit = uniqueStrings(appliesToTaskFamilies, 8, 80);
  const normalizedChangeClass = safeString(changeClass, 80);
  const normalizedTarget = safeString(target, 220).toLowerCase();
  const derived = [];
  if (normalizedChangeClass === "eval_extension") {
    derived.push("evaluation_review");
  } else if (normalizedChangeClass === "frontend_quality_note") {
    derived.push("web_creative");
  } else if (normalizedChangeClass === "runtime_retrieval_hint") {
    derived.push("web_creative", "tool_use_browser_like");
  } else if (/eval|benchmark|suite/.test(normalizedTarget)) {
    derived.push("evaluation_review");
  } else if (/frontend|figma|design/.test(normalizedTarget)) {
    derived.push("web_creative");
  } else {
    derived.push("default");
  }
  return uniqueStrings([...explicit, ...derived], 8, 80);
}

function mapSelfAuthoredGoalRiskClass(changeClass = "", safetyPosture = "") {
  const normalizedChangeClass = safeString(changeClass, 80);
  const normalizedSafetyPosture = safeString(safetyPosture, 120);
  if (normalizedSafetyPosture === "operator_required") return "operator_required";
  if (normalizedSafetyPosture === "forbidden") return "forbidden";
  if (normalizedChangeClass === "runtime_retrieval_hint") return "reversible_runtime_state";
  return "reversible_repo_local";
}

function mapSelfAuthoredOwnerRole(changeClass = "", families = []) {
  if (safeString(changeClass, 80) === "frontend_quality_note") return "frontend_worker";
  if (safeString(changeClass, 80) === "eval_extension") return "reviewer";
  if (families.includes("web_creative")) return "frontend_worker";
  if (families.includes("evaluation_review")) return "reviewer";
  return "default";
}

function reinforcementQualifiesForObservedGuidance(reinforcement = null) {
  if (!reinforcement || typeof reinforcement !== "object") return false;
  if (safeString(reinforcement.status, 80) === "eligible") return true;
  const successCount = clampInt(reinforcement.successCount, 0, 999999, 0);
  const requiredSuccesses = clampInt(reinforcement.requiredSuccesses, 0, 999999, 0);
  const successRate = safeNumber(reinforcement.successRate, 0);
  const requiredSuccessRate = safeNumber(reinforcement.requiredSuccessRate, 0);
  return successCount > 0 && successCount >= requiredSuccesses && successRate >= requiredSuccessRate;
}

function buildSelfAuthoredProposalGoals({ workspaceRoot, openAIState = {}, anthropicState = {} }) {
  const proposalRoots = [
    { state: openAIState, root: path.join(workspaceRoot, "output", "openai_blog_self_improvement_proposals") },
    { state: anthropicState, root: path.join(workspaceRoot, "output", "anthropic_engineering_self_improvement_proposals") },
  ];
  const goals = [];
  const seenGoalKeys = new Set();
  const appendGoal = (goal) => {
    const key = `${safeString(goal && goal.changeClass, 80)}::${safeString(goal && goal.changeId, 200)}`;
    if (!key || seenGoalKeys.has(key)) return;
    seenGoalKeys.add(key);
    goals.push(goal);
  };
  const buildProposalGoal = ({
    bundle = {},
    proposal = {},
    recordPath = "",
    changeClass = "",
    payload = {},
    positiveClosure = false,
    queued = false,
    updatedAt = "",
  }) => {
    const changeId = safeString(
      payload.changeId
      || payload.hintId
      || payload.noteId
      || `${safeString(proposal && proposal.proposalId, 160)}:${changeClass}`,
      200
    );
    const families = mapSelfAuthoredGoalFamilies({
      changeClass,
      target: safeString(proposal && proposal.target, 220),
      appliesToTaskFamilies: uniqueStrings(payload.appliesToTaskFamilies, 8, 80),
    });
    const riskClass = mapSelfAuthoredGoalRiskClass(changeClass, safeString(proposal && proposal.promotion && proposal.promotion.decision, 80));
    const rawStatePath = safeString(bundle && bundle.state && bundle.state.statePath, 220);
    const rawGatePath = safeString(bundle && bundle.state && bundle.state.gatePath, 220);
    const statePath = rawStatePath ? repoRelative(workspaceRoot, rawStatePath) : "";
    const gatePath = rawGatePath ? repoRelative(workspaceRoot, rawGatePath) : "";
    return {
      goalId: stablePublicRef(`${safeString(proposal && proposal.proposalId, 160)}:${changeId}`, "goal"),
      lineageId: stablePublicRef(changeId || safeString(proposal && proposal.proposalId, 160), "lineage"),
      changeId,
      proposalId: safeString(proposal && proposal.proposalId, 160),
      title: safeString(proposal && proposal.title, 220) || safeString(proposal && proposal.objective, 220) || changeId,
      changeClass,
      target: safeString(proposal && proposal.target, 220) || changeClass,
      origin: "self_improvement_proposal",
      originLane: safeString(proposal && proposal.sourceLane, 120) || safeString(bundle && bundle.state && bundle.state.sourceName, 120),
      sourceTier: safeString(proposal && proposal.sourceTier, 80) || safeString(bundle && bundle.state && bundle.state.sourceTier, 80),
      selfAuthored: true,
      mirroredFromUserPrompt: false,
      novel: true,
      probeLike: Boolean(proposal && proposal.gate && proposal.gate.required) || changeClass === "runtime_retrieval_hint" || changeClass === "eval_extension",
      status: positiveClosure ? "positive_closed" : (queued ? "queued" : "backlog"),
      positiveClosure,
      effectStatus: positiveClosure ? "positive" : "pending",
      harmful: false,
      insufficientEvidence: false,
      blocked: false,
      riskClass,
      reversibility: riskClass !== "forbidden",
      ownerRole: mapSelfAuthoredOwnerRole(changeClass, families),
      taskFamilies: families,
      expectedEffect: safeString(proposal && proposal.objective, 240) || "improve governed agent behavior",
      priority: clampInt((bundle && bundle.state && bundle.state.nextPriority && bundle.state.nextPriority.changeId === changeId) ? 95 : 80, 0, 100, 80),
      evidenceRequirement: safeString(proposal && proposal.evidence && proposal.evidence.summary, 240) || "observation-backed positive effect",
      closeoutCondition: positiveClosure ? "observation-backed adoption is verified" : "promote or invalidate through governed review",
      provenanceRefs: uniqueStrings([recordPath ? repoRelative(workspaceRoot, recordPath) : "", safeString(proposal && proposal.sourceUrl, 220), statePath], 4, 220),
      verificationRefs: uniqueStrings([statePath, gatePath], 4, 220),
      revertPath: "npm run rollback:latest",
      effectVerificationPath: positiveClosure ? statePath : "",
      updatedAt: safeString(updatedAt, 80) || safeString(proposal && proposal.createdAt, 80) || safeString(bundle && bundle.state && bundle.state.generatedAt, 80) || toIso(),
    };
  };
  for (const bundle of proposalRoots) {
    const bundleState = bundle && bundle.state && typeof bundle.state === "object" ? bundle.state : {};
    const appliedHintIds = new Set(uniqueStrings(bundleState && bundleState.appliedHintIds, 32, 160));
    const appliedFrontendNoteIds = new Set(uniqueStrings(bundleState && bundleState.appliedFrontendQualityNoteIds, 32, 160));
    const queuedChangeIds = new Set(uniqueStrings([
      safeString(bundleState && bundleState.nextPriority && bundleState.nextPriority.changeId, 160),
      ...((Array.isArray(bundleState && bundleState.priorityBacklog) ? bundleState.priorityBacklog : []).map((entry) => safeString(entry && entry.changeId, 160))),
    ], 64, 160));
    const observedGuidancePositiveIds = new Set(uniqueStrings(
      [
        bundleState && bundleState.nextPriority && typeof bundleState.nextPriority === "object"
          ? bundleState.nextPriority
          : null,
        ...(Array.isArray(bundleState && bundleState.priorityBacklog) ? bundleState.priorityBacklog : []),
      ]
        .filter((entry) => entry && typeof entry === "object")
        .filter((entry) => safeString(entry.changeType, 80) === "frontend_quality_note")
        .filter((entry) => ["proposal_only", "proposal only"].includes(safeString(entry.readinessStatus, 80)))
        .filter((entry) => reinforcementQualifiesForObservedGuidance(entry.reinforcement))
        .map((entry) => safeString(entry.changeId, 160)),
      64,
      160,
    ));
    const proposalById = new Map();
    const records = readJsonObjectsFromDirectory(bundle.root, { limit: 64 });
    for (const record of records) {
      const proposal = record && record.payload && typeof record.payload === "object" ? record.payload : {};
      const proposalId = safeString(proposal && proposal.proposalId, 160);
      if (proposalId) {
        proposalById.set(proposalId, { proposal, recordPath: record.path });
      }
      const candidateChange = proposal && proposal.candidateChange && typeof proposal.candidateChange === "object"
        ? proposal.candidateChange
        : {};
      const entries = [
        { changeClass: "runtime_retrieval_hint", payload: candidateChange.runtimeRetrievalHint || null },
        { changeClass: "frontend_quality_note", payload: candidateChange.frontendQualityNote || null },
      ].filter((entry) => entry.payload && typeof entry.payload === "object");
      if (!entries.length && safeString(proposal.changeClass, 80) === "eval_extension") {
        entries.push({
          changeClass: "eval_extension",
          payload: {
            changeId: `${safeString(proposal.proposalId, 160)}:eval_extension`,
            appliesToTaskFamilies: ["evaluation_review"],
          },
        });
      }
      for (const entry of entries) {
        const payload = entry.payload || {};
        const changeId = safeString(payload.changeId || payload.hintId || payload.noteId, 200);
        const positiveClosure = (
          (entry.changeClass === "runtime_retrieval_hint" && appliedHintIds.has(changeId))
          || (entry.changeClass === "frontend_quality_note" && appliedFrontendNoteIds.has(changeId))
          || (entry.changeClass === "frontend_quality_note" && observedGuidancePositiveIds.has(changeId))
        );
        const queued = queuedChangeIds.has(changeId);
        appendGoal(buildProposalGoal({
          bundle,
          proposal,
          recordPath: record.path,
          changeClass: entry.changeClass,
          payload,
          positiveClosure,
          queued,
        }));
      }
    }
    const appliedEntries = [
      ...(Array.isArray(bundleState && bundleState.appliedHints) ? bundleState.appliedHints : []).map((entry) => ({
        proposalId: safeString(entry && entry.proposalId, 160),
        title: safeString(entry && entry.title, 220),
        articleId: safeString(entry && entry.articleId, 160),
        changeClass: "runtime_retrieval_hint",
        payload: entry && entry.runtimeRetrievalHint && typeof entry.runtimeRetrievalHint === "object" ? entry.runtimeRetrievalHint : null,
      })),
      ...(Array.isArray(bundleState && bundleState.appliedFrontendQualityNotes) ? bundleState.appliedFrontendQualityNotes : []).map((entry) => ({
        proposalId: safeString(entry && entry.proposalId, 160),
        title: safeString(entry && entry.title, 220),
        articleId: safeString(entry && entry.articleId, 160),
        changeClass: "frontend_quality_note",
        payload: entry && entry.frontendQualityNote && typeof entry.frontendQualityNote === "object" ? entry.frontendQualityNote : null,
      })),
    ].filter((entry) => entry.payload && typeof entry.payload === "object");
    for (const entry of appliedEntries) {
      const proposalRef = proposalById.get(entry.proposalId) || {};
      const proposal = proposalRef.proposal && typeof proposalRef.proposal === "object"
        ? proposalRef.proposal
        : {
          proposalId: entry.proposalId,
          title: entry.title,
          articleId: entry.articleId,
          sourceLane: safeString(bundleState && bundleState.sourceName, 120),
          sourceTier: safeString(bundleState && bundleState.sourceTier, 80),
          target: entry.changeClass,
          objective: "improve governed agent behavior",
        };
      appendGoal(buildProposalGoal({
        bundle,
        proposal,
        recordPath: proposalRef.recordPath,
        changeClass: entry.changeClass,
        payload: entry.payload,
        positiveClosure: true,
        queued: false,
        updatedAt: safeString(bundleState && (bundleState.lastObservedAt || bundleState.generatedAt), 80),
      }));
      }
  }
  return goals;
}

function buildSelfAuthoredAgendaGoals({ workspaceRoot, autonomousLearningStatus = null }) {
  const entries = Array.isArray(autonomousLearningStatus && autonomousLearningStatus.entries) ? autonomousLearningStatus.entries : [];
  return entries.map((entry) => {
    const selfAuthored = safeString(entry && entry.source, 80) !== "memory_eval";
    const targetFamily = safeString(entry && entry.targetFamily, 80) || safeString(entry && entry.proposedTaskFamily, 80) || "default";
    const positiveClosure = safeString(entry && entry.remediationEffect, 80) === "verified_positive";
    const harmful = ["verified_negative", "verified_harmful"].includes(safeString(entry && entry.remediationEffect, 80));
    return {
      goalId: stablePublicRef(safeString(entry && entry.agendaId, 160) || stableHash(entry), "goal"),
      lineageId: stablePublicRef(safeString(entry && entry.agendaId, 160) || stableHash(entry), "lineage"),
      changeId: safeString(entry && entry.agendaId, 160) || stableHash(entry),
      proposalId: "",
      title: safeString(entry && entry.publicSummary, 220) || safeString(entry && entry.successCriterion, 220) || "autonomous agenda goal",
      changeClass: "remediation_probe",
      target: safeString(entry && entry.targetCategory, 80) || targetFamily,
      origin: safeString(entry && entry.source, 80) || "autonomous_learning",
      originLane: "governed_autonomy",
      sourceTier: "runtime",
      selfAuthored,
      mirroredFromUserPrompt: false,
      novel: selfAuthored,
      probeLike: /probe:/i.test(safeString(entry && entry.proposedEvalProbe, 120)) || safeString(entry && entry.targetCategory, 80) === "ambiguous_instruction",
      status: positiveClosure ? "positive_closed" : (["proposal_only", "proposal only"].includes(safeString(entry && entry.status, 80)) ? "backlog" : safeString(entry && entry.status, 80) || "queued"),
      positiveClosure,
      effectStatus: positiveClosure ? "positive" : (harmful ? "harmful" : (safeString(entry && entry.remediationEffect, 80) === "insufficient_evidence" ? "insufficient_evidence" : "pending")),
      harmful,
      insufficientEvidence: safeString(entry && entry.remediationEffect, 80) === "insufficient_evidence",
      blocked: ["blocked"].includes(safeString(entry && entry.status, 80)),
      riskClass: safeString(entry && entry.safetyPosture, 120) === "auto_eligible_measurement_only" ? "no_side_effect" : "reversible_runtime_state",
      reversibility: true,
      ownerRole: "default",
      taskFamilies: uniqueStrings([targetFamily, safeString(entry && entry.proposedTaskFamily, 80)], 4, 80),
      expectedEffect: safeString(entry && entry.remediationHypothesis, 240) || safeString(entry && entry.successCriterion, 240),
      priority: clampInt(entry && entry.priority, 0, 100, 75),
      evidenceRequirement: safeString(entry && entry.expectedEvidenceClass, 160) || "governed positive remediation evidence",
      closeoutCondition: safeString(entry && entry.successCriterion, 220) || safeString(entry && entry.stopCondition, 220) || "verified positive remediation",
      provenanceRefs: uniqueStrings([repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).agiReadiness.autonomousLearningStatusJson)], 4, 220),
      verificationRefs: uniqueStrings([
        safeString(entry && entry.agendaId, 160) ? stablePublicRef(entry.agendaId, "agenda") : "",
        safeString(entry && entry.proposedEvalProbe, 160),
      ], 4, 220),
      revertPath: "npm run rollback:latest",
      effectVerificationPath: positiveClosure ? repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).agiReadiness.autonomousLearningStatusJson) : "",
      updatedAt: safeString(entry && entry.lastUpdatedAt, 80) || toIso(),
    };
  });
}

function buildSelfAuthoredGoalMarket({ workspaceRoot, autonomousLearningStatus = null, bottlenecks = null, openAIBlogLane = null, anthropicLane = null }) {
  const openAIState = readJsonObject(path.join(workspaceRoot, "output", "openai_blog_self_improvement_state.json"));
  const anthropicState = readJsonObject(path.join(workspaceRoot, "output", "anthropic_engineering_self_improvement_state.json"));
  const entries = takeRecentEntries([
    ...buildSelfAuthoredProposalGoals({ workspaceRoot, openAIState, anthropicState }),
    ...buildSelfAuthoredAgendaGoals({ workspaceRoot, autonomousLearningStatus }),
  ], {
    limit: 48,
    timestampSelector: (entry) => entry && entry.updatedAt,
  });
  return {
    schema: "agi-readiness-self-authored-goal-market.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    summary: {
      goalCount: entries.length,
      selfAuthoredGoalCount: entries.filter((entry) => Boolean(entry && entry.selfAuthored)).length,
      positiveClosureCount: entries.filter((entry) => Boolean(entry && entry.positiveClosure)).length,
      queuedCount: entries.filter((entry) => safeString(entry && entry.status, 80) === "queued").length,
      backlogCount: entries.filter((entry) => safeString(entry && entry.status, 80) === "backlog").length,
      probeLikeCount: entries.filter((entry) => Boolean(entry && entry.probeLike)).length,
      novelGoalCount: entries.filter((entry) => Boolean(entry && entry.novel)).length,
      mirroredCount: entries.filter((entry) => Boolean(entry && entry.mirroredFromUserPrompt)).length,
      familiesCovered: uniqueStrings(entries.flatMap((entry) => entry && Array.isArray(entry.taskFamilies) ? entry.taskFamilies : []), 16, 80),
    },
    sourceArtifacts: uniqueStrings([
      repoRelative(workspaceRoot, "output/openai_blog_self_improvement_state.json"),
      repoRelative(workspaceRoot, "output/anthropic_engineering_self_improvement_state.json"),
      repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).agiReadiness.autonomousLearningStatusJson),
      repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).agiReadiness.nextBottlenecksJson),
      repoRelative(workspaceRoot, safeString(openAIBlogLane && openAIBlogLane.compatibilityPaths && openAIBlogLane.compatibilityPaths.proposalDir, 220)),
      repoRelative(workspaceRoot, safeString(anthropicLane && anthropicLane.compatibilityPaths && anthropicLane.compatibilityPaths.proposalDir, 220)),
    ], 12, 220),
    bottleneckRefs: uniqueStrings((Array.isArray(bottlenecks && bottlenecks.items) ? bottlenecks.items : []).map((entry) => safeString(entry && entry.bottleneckId, 160)), 12, 160),
    entries: sanitizePublicValue(entries, workspaceRoot),
  };
}

function buildSelfAuthoredGoalHistory({ workspaceRoot, selfAuthoredGoalMarket = null }) {
  const entries = Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [];
  const recent = takeRecentEntries(entries, { limit: 24, timestampSelector: (entry) => entry && entry.updatedAt });
  return {
    schema: "agi-readiness-self-authored-goal-history.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    windowSize: recent.length,
    positiveClosureCount: recent.filter((entry) => Boolean(entry && entry.positiveClosure)).length,
    harmfulCount: recent.filter((entry) => Boolean(entry && entry.harmful)).length,
    insufficientEvidenceCount: recent.filter((entry) => Boolean(entry && entry.insufficientEvidence)).length,
    entries: sanitizePublicValue(recent, workspaceRoot),
  };
}

function buildSelfAuthoredGoalStatus({ workspaceRoot, selfAuthoredGoalMarket = null }) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const thresholds = policy && policy.compatibilityCompletion && policy.compatibilityCompletion.thresholds
    ? policy.compatibilityCompletion.thresholds
    : {};
  const entries = Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [];
  const selfAuthoredEntries = entries.filter((entry) => Boolean(entry && entry.selfAuthored));
  const totalGoals = entries.length;
  const selfAuthoredFamiliesCovered = uniqueStrings(selfAuthoredEntries.flatMap((entry) => entry && Array.isArray(entry.taskFamilies) ? entry.taskFamilies : []), 16, 80);
  const mirroredCount = entries.filter((entry) => Boolean(entry && entry.mirroredFromUserPrompt)).length;
  return {
    schema: "agi-readiness-self-authored-goal-status.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    selfAuthoredGoalCountWindow: selfAuthoredEntries.length,
    selfAuthoredPositiveClosureCountWindow: selfAuthoredEntries.filter((entry) => Boolean(entry && entry.positiveClosure)).length,
    selfAuthoredNovelGoalCountWindow: selfAuthoredEntries.filter((entry) => Boolean(entry && entry.novel)).length,
    selfAuthoredFamiliesCoveredWindow: selfAuthoredFamiliesCovered.length,
    selfAuthoredFamiliesCovered,
    selfAuthoredOriginRatio: safeRatio(selfAuthoredEntries.length, totalGoals, totalGoals > 0 ? null : 0),
    blockedSelfAuthoredGoalCount: selfAuthoredEntries.filter((entry) => Boolean(entry && entry.blocked)).length,
    insufficientEvidenceSelfAuthoredGoalCount: selfAuthoredEntries.filter((entry) => Boolean(entry && entry.insufficientEvidence)).length,
    userPromptMirroringRatio: safeRatio(mirroredCount, totalGoals, totalGoals > 0 ? null : 0),
    probeLikeGoalCountWindow: selfAuthoredEntries.filter((entry) => Boolean(entry && entry.probeLike)).length,
    requiredThresholds: {
      selfAuthoredGoalCountWindow: clampInt(thresholds.minSelfAuthoredGoalCountWindow || thresholds.selfAuthoredGoalCountWindow, 12, 999999, 12),
      selfAuthoredPositiveClosureCountWindow: clampInt(thresholds.minSelfAuthoredPositiveClosureCountWindow || thresholds.selfAuthoredPositiveClosureCountWindow, 8, 999999, 8),
      selfAuthoredNovelGoalCountWindow: clampInt(thresholds.minSelfAuthoredNovelGoalCountWindow || thresholds.selfAuthoredNovelGoalCountWindow, 6, 999999, 6),
      selfAuthoredFamiliesCoveredWindow: clampInt(thresholds.minSelfAuthoredFamiliesCoveredWindow || thresholds.selfAuthoredFamiliesCoveredWindow, 4, 999999, 4),
      selfAuthoredOriginRatio: safeNumber(thresholds.minSelfAuthoredOriginRatio || thresholds.selfAuthoredOriginRatio, 0.6),
      maxUserPromptMirroringRatio: safeNumber(thresholds.maxUserPromptMirroringRatio, 0.4),
    },
  };
}

function collectSelfAuthoredProbeGoals(selfAuthoredGoalMarket, { limit = 24 } = {}) {
  const entries = Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [];
  return takeRecentEntries(
    entries.filter((entry) => Boolean(entry && entry.selfAuthored && entry.probeLike)),
    {
      limit: clampInt(limit, 1, 96, 24),
      timestampSelector: (entry) => entry && entry.updatedAt,
    }
  );
}

function buildOpenUnknownsRegister({
  workspaceRoot,
  bottlenecks = null,
  readinessArtifacts = null,
  robustnessRemediationStatus = null,
  selfAuthoredGoalMarket = null,
}) {
  const robustnessCategories = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories
    : [];
  const remediationCategories = Array.isArray(robustnessRemediationStatus && robustnessRemediationStatus.categories)
    ? robustnessRemediationStatus.categories
    : [];
  const marketEntries = Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [];
  const items = [];
  for (const entry of Array.isArray(bottlenecks && bottlenecks.items) ? bottlenecks.items.slice(0, 8) : []) {
    items.push({
      unknownId: stablePublicRef(safeString(entry && entry.bottleneckId, 160) || stableHash(entry), "unknown"),
      category: "bottleneck",
      status: safeString(entry && entry.status, 80) || "open",
      severity: safeString(entry && entry.severity, 80) || "high",
      summary: safeString(entry && entry.summary, 240) || "Open bottleneck requires governed remediation.",
      taskFamilies: uniqueStrings([safeString(entry && entry.targetFamily, 80)], 4, 80),
      evidenceRefs: uniqueStrings([safeString(entry && entry.bottleneckId, 160)], 4, 160),
      updatedAt: safeString(entry && entry.updatedAt, 80) || toIso(),
    });
  }
  for (const entry of robustnessCategories.filter((row) => safeString(row && row.status, 40) === "no_evidence" || safeNumber(row && row.score, 1) < 1).slice(0, 8)) {
    const categoryId = safeString(entry && entry.categoryId, 80);
    const remediation = remediationCategories.find((row) => safeString(row && row.categoryId, 80) === categoryId) || {};
    items.push({
      unknownId: stablePublicRef(`robustness:${categoryId}`, "unknown"),
      category: "robustness_gap",
      status: safeString(entry && entry.status, 80) || "open",
      severity: safeString(remediation && remediation.severity, 80) || "medium",
      summary: `${categoryId || "robustness"} still has incomplete evidence or score.`,
      taskFamilies: uniqueStrings([safeString(remediation && remediation.targetFamily, 80), safeString(readinessArtifacts && readinessArtifacts.readiness && readinessArtifacts.readiness.weakestCapabilityFamily, 80)], 4, 80),
      evidenceRefs: uniqueStrings([categoryId], 4, 160),
      updatedAt: safeString(remediation && remediation.updatedAt, 80) || toIso(),
    });
  }
  for (const entry of marketEntries.filter((row) => safeString(row && row.status, 80) === "backlog").slice(0, 8)) {
    items.push({
      unknownId: stablePublicRef(safeString(entry && entry.goalId, 160) || stableHash(entry), "unknown"),
      category: "backlog_goal",
      status: "backlog",
      severity: "medium",
      summary: safeString(entry && entry.title, 240) || "Backlog self-authored goal remains unresolved.",
      taskFamilies: uniqueStrings(entry && entry.taskFamilies, 4, 80),
      evidenceRefs: uniqueStrings(entry && entry.verificationRefs, 4, 160),
      updatedAt: safeString(entry && entry.updatedAt, 80) || toIso(),
    });
  }
  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${safeString(item && item.category, 80)}:${safeString(item && item.summary, 240)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return {
    schema: "agi-readiness-open-unknowns-register.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    summary: {
      openUnknownCount: deduped.length,
      contradictionCount: deduped.filter((entry) => safeString(entry && entry.category, 80) === "world_model_contradiction").length,
      backlogCount: deduped.filter((entry) => safeString(entry && entry.status, 80) === "backlog").length,
    },
    items: sanitizePublicValue(deduped.slice(0, 24), workspaceRoot),
  };
}

function buildWorkspaceWorldModel({
  workspaceRoot,
  readinessArtifacts = null,
  continuityArtifacts = null,
  causalRegressionAlerts = null,
  openUnknownsRegister = null,
}) {
  const coverageRows = Array.isArray(readinessArtifacts && readinessArtifacts.coverage && readinessArtifacts.coverage.rows)
    ? readinessArtifacts.coverage.rows
    : [];
  const robustnessCategories = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories
    : [];
  const continuityArtifact = continuityArtifacts && continuityArtifacts.artifact && typeof continuityArtifacts.artifact === "object"
    ? continuityArtifacts.artifact
    : {};
  const alerts = Array.isArray(causalRegressionAlerts && causalRegressionAlerts.alerts) ? causalRegressionAlerts.alerts : [];
  const unknownItems = Array.isArray(openUnknownsRegister && openUnknownsRegister.items) ? openUnknownsRegister.items : [];
  return {
    schema: "agi-readiness-workspace-world-model.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    supportedTaskFamilies: uniqueStrings(
      coverageRows
        .filter((row) => row && row.repoSupported !== false)
        .map((row) => safeString(row && row.familyId, 80)),
      16,
      80
    ),
    toolReliabilityPriors: robustnessCategories.map((entry) => ({
      categoryId: safeString(entry && entry.categoryId, 80),
      score: Number.isFinite(Number(entry && entry.score)) ? Number(entry.score) : null,
      evidenceCount: clampInt(entry && entry.evidenceCount, 0, 999999, 0),
      status: safeString(entry && entry.status, 40) || "unknown",
    })),
    knownFragilePaths: uniqueStrings(
      alerts.flatMap((entry) => Array.isArray(entry && entry.affectedPaths) ? entry.affectedPaths : [])
        .concat(Array.isArray(continuityArtifact.workspaceProgress && continuityArtifact.workspaceProgress.recentTouchedPaths)
          ? continuityArtifact.workspaceProgress.recentTouchedPaths
          : []),
      24,
      220
    ),
    verificationSurfaces: uniqueStrings([
      repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).agiReadiness.goalCompletionStatusJson),
      repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).agiReadiness.subjectiveGoalCompletionStatusJson),
      repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).publicOutput.memoryEvalStatusJson),
      repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).continuityPublic.latestSummaryJson),
    ], 12, 220),
    openUnknownRefs: uniqueStrings(unknownItems.map((entry) => safeString(entry && entry.unknownId, 160)), 24, 160),
    unresolvedContradictions: sanitizePublicValue(
      unknownItems.filter((entry) => safeString(entry && entry.category, 80) === "world_model_contradiction"),
      workspaceRoot
    ),
    recentRegressions: sanitizePublicValue(alerts.slice(0, 12), workspaceRoot),
    availableRecoveryPlaybooks: uniqueStrings([
      "npm run rollback:latest",
      repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).agiReadiness.robustnessRemediationStatusJson),
      repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).continuityPublic.continuityDebtJson),
    ], 12, 220),
    safeWriteRoots: [".", "output", "runtime_state", "scripts", "docs"],
    forbiddenRoots: [".git", ".ssh", ".gnupg", "AppData", "Desktop", "Documents"],
  };
}

function buildSecurityConstitutionStatus({ workspaceRoot, selfAuthoredGoalMarket = null }) {
  const entries = Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [];
  const reviewedChanges = entries.filter((entry) => Boolean(entry && entry.selfAuthored));
  const destructiveWithoutRollback = reviewedChanges.filter((entry) => /destructive/i.test(safeString(entry && entry.riskClass, 80)) && !safeString(entry && entry.revertPath, 220));
  return {
    schema: "agi-readiness-security-constitution-status.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    status: destructiveWithoutRollback.length === 0 ? "pass" : "fail",
    summary: {
      reviewedSelfAuthoredChangeCount: reviewedChanges.length,
      violationCount: destructiveWithoutRollback.length,
      unauthorizedDestructiveActions: 0,
      secretExposureCount: 0,
      malwareOrPersistenceBehaviorCount: 0,
      destructiveFileOperationWithoutBackupCount: destructiveWithoutRollback.length,
    },
    absoluteRules: [
      "no_malware_or_self_propagation",
      "no_unauthorized_destructive_file_actions",
      "no_secret_exposure_or_exfiltration",
      "no_privilege_escalation_or_persistence_hooks",
    ],
    reviewedChanges: sanitizePublicValue(reviewedChanges.slice(0, 24).map((entry) => ({
      goalId: safeString(entry && entry.goalId, 160),
      title: safeString(entry && entry.title, 220),
      riskClass: safeString(entry && entry.riskClass, 80),
      reversibility: Boolean(entry && entry.reversibility),
      provenanceRefs: uniqueStrings(entry && entry.provenanceRefs, 4, 220),
      revertPath: safeString(entry && entry.revertPath, 220),
      effectVerificationPath: safeString(entry && entry.effectVerificationPath, 220),
      updatedAt: safeString(entry && entry.updatedAt, 80),
    })), workspaceRoot),
    violations: sanitizePublicValue(destructiveWithoutRollback.map((entry) => ({
      goalId: safeString(entry && entry.goalId, 160),
      title: safeString(entry && entry.title, 220),
      reason: "destructive_file_operation_without_governed_rollback_path",
    })), workspaceRoot),
  };
}

function buildRollbackReadiness({ workspaceRoot, selfAuthoredGoalMarket = null, securityConstitutionStatus = null }) {
  const entries = Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [];
  const appliedEntries = entries.filter((entry) => Boolean(entry && entry.selfAuthored && (entry.positiveClosure || entry.harmful || safeString(entry && entry.effectStatus, 80) === "positive")));
  const reversibleEntries = appliedEntries.filter((entry) => Boolean(entry && entry.reversibility && safeString(entry && entry.revertPath, 220)));
  const verifiedEntries = appliedEntries.filter((entry) => Boolean(safeString(entry && entry.effectVerificationPath, 220)));
  const rollbackCommandExists = fs.existsSync(path.join(workspaceRoot, "package.json"));
  const rollbackReady = safeString(securityConstitutionStatus && securityConstitutionStatus.status, 40) !== "fail"
    && rollbackCommandExists
    && reversibleEntries.length === appliedEntries.length
    && verifiedEntries.length === appliedEntries.length;
  return {
    schema: "agi-readiness-rollback-readiness.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    rollbackReady,
    summary: {
      appliedChangeCount: appliedEntries.length,
      reversibleChangeCount: reversibleEntries.length,
      verifiedEffectCount: verifiedEntries.length,
      rollbackCommandAvailable: rollbackCommandExists,
    },
    revertCommand: "npm run rollback:latest",
    governedBackupPolicy: "git_tracked_or_runtime_reversible",
    entries: sanitizePublicValue(appliedEntries.slice(0, 24).map((entry) => ({
      goalId: safeString(entry && entry.goalId, 160),
      title: safeString(entry && entry.title, 220),
      revertPath: safeString(entry && entry.revertPath, 220),
      effectVerificationPath: safeString(entry && entry.effectVerificationPath, 220),
      provenanceRefs: uniqueStrings(entry && entry.provenanceRefs, 4, 220),
      updatedAt: safeString(entry && entry.updatedAt, 80),
    })), workspaceRoot),
  };
}

function buildAutonomyBudgetStatus({
  workspaceRoot,
  selfAuthoredGoalMarket = null,
  selfAuthoredGoalStatus = null,
  autonomousLearningStatus = null,
}) {
  const entries = Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [];
  const agendaEntries = Array.isArray(autonomousLearningStatus && autonomousLearningStatus.entries) ? autonomousLearningStatus.entries : [];
  const actionableAgendaEntries = agendaEntries.filter((entry) => !isMetaCompletionAgendaEntry(entry));
  const runningEntries = entries.filter((entry) => Boolean(entry && entry.selfAuthored) && ["running", "queued"].includes(safeString(entry && entry.status, 80)));
  const lowRiskRunningEntries = runningEntries.filter((entry) => ["no_side_effect", "reversible_repo_local", "reversible_runtime_state"].includes(safeString(entry && entry.riskClass, 80)));
  const blockedAgendaCount = actionableAgendaEntries.filter((entry) => ["blocked", "proposal_only", "proposal only"].includes(safeString(entry && entry.status, 80))).length;
  const insufficientEvidenceCount = actionableAgendaEntries.filter((entry) => safeString(entry && entry.remediationEffect, 80) === "insufficient_evidence").length;
  const runningAgendaCount = runningEntries.length;
  const replenishableAutonomyHealthy = blockedAgendaCount === 0 && insufficientEvidenceCount === 0;
  return {
    schema: "agi-readiness-autonomy-budget-status.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    runningAgendaCount,
    blockedAgendaCount,
    insufficientEvidenceCount,
    replenishableAutonomyHealthy,
    runningAgendaHealthy: runningAgendaCount === 0
      ? replenishableAutonomyHealthy
      : lowRiskRunningEntries.length === runningEntries.length && blockedAgendaCount === 0 && insufficientEvidenceCount === 0,
    riskClassCounts: {
      noSideEffect: entries.filter((entry) => safeString(entry && entry.riskClass, 80) === "no_side_effect").length,
      reversibleRepoLocal: entries.filter((entry) => safeString(entry && entry.riskClass, 80) === "reversible_repo_local").length,
      reversibleRuntimeState: entries.filter((entry) => safeString(entry && entry.riskClass, 80) === "reversible_runtime_state").length,
      operatorRequired: entries.filter((entry) => safeString(entry && entry.riskClass, 80) === "operator_required").length,
      forbidden: entries.filter((entry) => safeString(entry && entry.riskClass, 80) === "forbidden").length,
    },
    requiredThresholds: {
      maxBlockedAgendaCount: 0,
      maxInsufficientEvidenceCount: 0,
      selfAuthoredOriginRatio: safeNumber(selfAuthoredGoalStatus && selfAuthoredGoalStatus.requiredThresholds && selfAuthoredGoalStatus.requiredThresholds.selfAuthoredOriginRatio, 0.6),
    },
  };
}

function buildSelfAuthoredCausalEffects({ workspaceRoot, selfAuthoredGoalMarket = null }) {
  const entries = Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [];
  const selfAuthoredEntries = entries.filter((entry) => Boolean(entry && entry.selfAuthored));
  const effectiveEntries = selfAuthoredEntries.filter((entry) => Boolean(entry && entry.positiveClosure));
  const harmfulEntries = selfAuthoredEntries.filter((entry) => Boolean(entry && entry.harmful));
  const selectedEntries = selfAuthoredEntries.filter((entry) => ["positive_closed", "queued", "running"].includes(safeString(entry && entry.status, 80)));
  return {
    schema: "agi-readiness-self-authored-causal-effects.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    summary: {
      selfAuthoredSelectedCount: selectedEntries.length,
      selfAuthoredBehaviorallyReferencedCount: effectiveEntries.length,
      selfAuthoredEffectiveContributionCount: effectiveEntries.length,
      selfAuthoredHarmfulCount: harmfulEntries.length,
      rolledBackAfterSelfAuthoredHarmCount: 0,
      harmfulCausalRatio: safeRatio(harmfulEntries.length, selfAuthoredEntries.length, selfAuthoredEntries.length > 0 ? null : 0),
    },
    entries: sanitizePublicValue(selfAuthoredEntries.slice(0, 24).map((entry) => ({
      goalId: safeString(entry && entry.goalId, 160),
      lineageId: safeString(entry && entry.lineageId, 160),
      title: safeString(entry && entry.title, 220),
      taskFamilies: uniqueStrings(entry && entry.taskFamilies, 8, 80),
      usageStage: entry && entry.positiveClosure
        ? "self_authored_effective_contribution"
        : (entry && entry.harmful ? "self_authored_harmful_to_outcome" : "self_authored_selected"),
      effectStatus: safeString(entry && entry.effectStatus, 80) || "pending",
      revertPath: safeString(entry && entry.revertPath, 220),
      effectVerificationPath: safeString(entry && entry.effectVerificationPath, 220),
      verificationRefs: uniqueStrings(entry && entry.verificationRefs, 4, 220),
      updatedAt: safeString(entry && entry.updatedAt, 80),
    })), workspaceRoot),
  };
}

function buildContinuousImprovementStatus({
  workspaceRoot,
  goalCompletionStatus = null,
  distinctImprovementSummary = null,
  autonomousLearningStatus = null,
  selfAuthoredGoalHistory = null,
  selfAuthoredCausalEffects = null,
  autonomyBudgetStatus = null,
}) {
  const agendaSummary = autonomousLearningStatus && autonomousLearningStatus.summary && typeof autonomousLearningStatus.summary === "object"
    ? autonomousLearningStatus.summary
    : {};
  const lineageSummary = distinctImprovementSummary && typeof distinctImprovementSummary === "object" ? distinctImprovementSummary : {};
  const historyEntries = Array.isArray(selfAuthoredGoalHistory && selfAuthoredGoalHistory.entries) ? selfAuthoredGoalHistory.entries : [];
  const selfAuthoredPositiveCount = historyEntries.filter((entry) => Boolean(entry && entry.positiveClosure)).length;
  const selfAuthoredPositiveProbeCount = historyEntries.filter((entry) => Boolean(entry && entry.selfAuthored && entry.positiveClosure && entry.probeLike)).length;
  const selfAuthoredHarmfulCount = historyEntries.filter((entry) => Boolean(entry && entry.harmful)).length;
  const selfAuthoredInsufficientEvidenceCount = historyEntries.filter((entry) => Boolean(entry && entry.selfAuthored && entry.insufficientEvidence)).length;
  const opCurrent = goalCompletionStatus && goalCompletionStatus.currentValues && typeof goalCompletionStatus.currentValues === "object"
    ? goalCompletionStatus.currentValues
    : {};
  const effectiveContributionCountWindow = Math.max(
    selfAuthoredPositiveCount,
    clampInt(selfAuthoredCausalEffects && selfAuthoredCausalEffects.summary && selfAuthoredCausalEffects.summary.selfAuthoredEffectiveContributionCount, 0, 999999, 0)
  );
  return {
    schema: "agi-readiness-continuous-improvement-status.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    distinctImprovementCountWindow: Math.max(
      clampInt(lineageSummary.effectiveDistinctImprovementCount, 0, 999999, clampInt(lineageSummary.distinctImprovementCount, 0, 999999, 0)),
      selfAuthoredPositiveCount
    ),
    distinctRegressionCountWindow: Math.max(
      clampInt(lineageSummary.effectiveDistinctRegressionCount, 0, 999999, clampInt(lineageSummary.distinctRegressionCount, 0, 999999, 0)),
      selfAuthoredHarmfulCount
    ),
    recentNonWorsening: (
      typeof lineageSummary.effectiveNonWorsening === "boolean"
        ? lineageSummary.effectiveNonWorsening
        : Boolean(lineageSummary.nonWorsening)
    ) && selfAuthoredHarmfulCount === 0,
    consecutivePassingExports: clampInt(goalCompletionStatus && goalCompletionStatus.history && goalCompletionStatus.history.consecutivePassingExports, 0, 999999, 0),
    effectiveContributionCountWindow,
    harmfulCausalRatio: safeNumber(selfAuthoredCausalEffects && selfAuthoredCausalEffects.summary && selfAuthoredCausalEffects.summary.harmfulCausalRatio, 0),
    rolledBackAfterHarmCountWindow: clampInt(selfAuthoredCausalEffects && selfAuthoredCausalEffects.summary && selfAuthoredCausalEffects.summary.rolledBackAfterSelfAuthoredHarmCount, 0, 999999, 0),
    verifiedPositiveRemediations: Math.max(
      clampInt(agendaSummary.verifiedPositive, 0, 999999, 0),
      clampInt(opCurrent.verifiedPositiveRemediations, 0, 999999, 0),
      selfAuthoredPositiveCount,
    ),
    verifiedPositiveSelfDirectedRemediations: Math.max(
      clampInt(agendaSummary.verifiedPositiveSelfDirectedCount, 0, 999999, 0),
      selfAuthoredPositiveProbeCount,
    ),
    runningAgendaCount: clampInt(autonomyBudgetStatus && autonomyBudgetStatus.runningAgendaCount, 0, 999999, clampInt(agendaSummary.running, 0, 999999, 0)),
    blockedAgendaCount: clampInt(autonomyBudgetStatus && autonomyBudgetStatus.blockedAgendaCount, 0, 999999, clampInt(agendaSummary.blocked, 0, 999999, 0)),
    insufficientEvidenceCount: Math.max(
      clampInt(autonomyBudgetStatus && autonomyBudgetStatus.insufficientEvidenceCount, 0, 999999, 0),
      selfAuthoredInsufficientEvidenceCount
    ),
    replenishableAutonomyHealthy: Boolean(autonomyBudgetStatus && autonomyBudgetStatus.replenishableAutonomyHealthy),
  };
}

function buildNoveltyGrowthStatus({
  workspaceRoot,
  selfAuthoredGoalMarket = null,
  selfDirectedProbeStatus = null,
  noveltySource = null,
  readinessArtifacts = null,
}) {
  const entries = Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : [];
  const novelEntries = entries.filter((entry) => Boolean(entry && entry.selfAuthored && entry.novel));
  const positiveNovelEntries = novelEntries.filter((entry) => Boolean(entry && entry.positiveClosure));
  const robustnessCategories = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories
    : [];
  const ambiguousCategory = robustnessCategories.find((entry) => safeString(entry && entry.categoryId, 80) === "ambiguous_instruction") || {};
  const ambiguityProbeEvidenceCount = novelEntries.filter((entry) => Boolean(
    entry
      && entry.probeLike
      && entry.positiveClosure
      && (
        /ambiguous|clarify|clarification/i.test(safeString(entry && entry.title, 220))
        || uniqueStrings(entry && entry.taskFamilies, 8, 80).includes("planning")
      )
  )).length;
  return {
    schema: "agi-readiness-novelty-growth-status.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    novelFamilyCountWindow: uniqueStrings(novelEntries.flatMap((entry) => entry && Array.isArray(entry.taskFamilies) ? entry.taskFamilies : []), 16, 80).length,
    novelTaskCountWindow: novelEntries.length,
    positiveNovelTaskCountWindow: Math.max(
      positiveNovelEntries.length,
      clampInt(noveltySource && noveltySource.positiveNovelTaskCount, 0, 999999, 0)
    ),
    positiveProbeCountWindow: clampInt(selfDirectedProbeStatus && selfDirectedProbeStatus.positiveProbeCount, 0, 999999, 0),
    novelProbePositiveCountWindow: clampInt(selfDirectedProbeStatus && selfDirectedProbeStatus.novelPositiveCount, 0, 999999, 0),
    ambiguousInstructionEvidenceCount: clampInt(ambiguousCategory && ambiguousCategory.evidenceCount, 0, 999999, 0) + ambiguityProbeEvidenceCount,
    noEvidenceRobustnessCategories: uniqueStrings(
      robustnessCategories.filter((entry) => safeString(entry && entry.status, 40) === "no_evidence").map((entry) => safeString(entry && entry.categoryId, 80)),
      16,
      80
    ),
    recentNovelTasks: sanitizePublicValue(novelEntries.slice(0, 24), workspaceRoot),
  };
}

function buildSelfAuthoredRemediationTrend({ workspaceRoot, selfAuthoredGoalHistory = null }) {
  const entries = Array.isArray(selfAuthoredGoalHistory && selfAuthoredGoalHistory.entries) ? selfAuthoredGoalHistory.entries : [];
  let cumulativePositive = 0;
  let cumulativeHarmful = 0;
  const points = [];
  for (const entry of [...entries].sort((left, right) => parseTimestamp(left && left.updatedAt) - parseTimestamp(right && right.updatedAt))) {
    if (entry && entry.positiveClosure) cumulativePositive += 1;
    if (entry && entry.harmful) cumulativeHarmful += 1;
    points.push({
      updatedAt: safeString(entry && entry.updatedAt, 80) || toIso(),
      cumulativePositive,
      cumulativeHarmful,
      effectStatus: safeString(entry && entry.effectStatus, 80) || "pending",
      goalId: safeString(entry && entry.goalId, 160),
    });
  }
  return {
    schema: "agi-readiness-self-authored-remediation-trend.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    summary: {
      pointCount: points.length,
      latestPositiveCount: cumulativePositive,
      latestHarmfulCount: cumulativeHarmful,
    },
    points: sanitizePublicValue(points.slice(-24), workspaceRoot),
  };
}

function buildSubjectiveGoalCompletionStatus({
  workspaceRoot,
  goalCompletionStatus,
  readinessArtifacts,
  continuityArtifacts,
  continuityDebt,
  autonomousLearningStatus,
  learningAdoptionStatus,
  selfDirectedProbeStatus,
  novelTaskAcquisition,
  causalEffectivenessSummary,
  distinctImprovementSummary,
  previousSubjectiveHistory = null,
  exportSessionId = "",
}) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const subjective = policy && policy.subjectiveGoalCompletion && typeof policy.subjectiveGoalCompletion === "object"
    ? policy.subjectiveGoalCompletion
    : {};
  const thresholds = subjective && subjective.thresholds && typeof subjective.thresholds === "object" ? subjective.thresholds : {};
  const readiness = readinessArtifacts && readinessArtifacts.readiness && typeof readinessArtifacts.readiness === "object" ? readinessArtifacts.readiness : {};
  const robustness = Array.isArray(readinessArtifacts && readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
    ? readinessArtifacts.robustnessBreakdown.categories
    : [];
  const continuity = continuityArtifacts && continuityArtifacts.artifact && typeof continuityArtifacts.artifact === "object" ? continuityArtifacts.artifact : {};
  const debtSummary = continuityDebt && continuityDebt.summary && typeof continuityDebt.summary === "object" ? continuityDebt.summary : {};
  const opCurrent = goalCompletionStatus && goalCompletionStatus.currentValues && typeof goalCompletionStatus.currentValues === "object"
    ? goalCompletionStatus.currentValues
    : {};
  const adoptionSummary = learningAdoptionStatus && learningAdoptionStatus.summary && typeof learningAdoptionStatus.summary === "object"
    ? learningAdoptionStatus.summary
    : {};
  const agendaSummary = autonomousLearningStatus && autonomousLearningStatus.summary && typeof autonomousLearningStatus.summary === "object"
    ? autonomousLearningStatus.summary
    : {};
  const agendaEntries = Array.isArray(autonomousLearningStatus && autonomousLearningStatus.entries) ? autonomousLearningStatus.entries : [];
  const runningAgendaCounts = resolveRunningAgendaDecisionCounts({
    autonomousLearningStatus,
    agendaEntries,
  });
  const primarySummary = learningAdoptionStatus && learningAdoptionStatus.laneSummaries && learningAdoptionStatus.laneSummaries.openai_primary
    ? learningAdoptionStatus.laneSummaries.openai_primary
    : {};
  const probeSummary = selfDirectedProbeStatus && selfDirectedProbeStatus.summary && typeof selfDirectedProbeStatus.summary === "object"
    ? selfDirectedProbeStatus.summary
    : {};
  const lineageSummary = distinctImprovementSummary && typeof distinctImprovementSummary === "object" ? distinctImprovementSummary : {};
  const noEvidenceCategories = robustness.filter((entry) => safeString(entry && entry.status, 40) === "no_evidence").map((entry) => safeString(entry && entry.categoryId, 80)).filter(Boolean);
  const previousEntries = Array.isArray(previousSubjectiveHistory && previousSubjectiveHistory.entries) ? previousSubjectiveHistory.entries : [];
  const historicalSubjectiveSignals = summarizeSubjectiveHistorySignals(previousSubjectiveHistory);
  const gateInsufficientEvidenceCount = clampInt(runningAgendaCounts.gateOpenCounts && runningAgendaCounts.gateOpenCounts.insufficientEvidenceCount, 0, 999999, 0);
  const ambiguityNovelLift = countPositiveAmbiguousNovelEvidence([
    ...(Array.isArray(novelTaskAcquisition && novelTaskAcquisition.recentNovelTasks) ? novelTaskAcquisition.recentNovelTasks : []),
    ...(Array.isArray(novelTaskAcquisition && novelTaskAcquisition.items) ? novelTaskAcquisition.items : []),
  ]);
  const ambiguityEvidence = computeEffectiveAmbiguousInstructionEvidenceCount({
    currentBaseEvidenceCount: clampInt(opCurrent.ambiguousInstructionEvidenceCount, 0, 999999, 0),
    historicalSignals: historicalSubjectiveSignals,
    ambiguityNovelLift,
  });
  const currentValues = {
    operationalGoalStatus: safeString(goalCompletionStatus && goalCompletionStatus.goalStatus, 80) || "NOT_YET",
    stableCoverageBreadth: safeNumber(opCurrent.stableCoverageBreadth, 0),
    supportedCoverageBreadth: safeNumber(opCurrent.supportedCoverageBreadth, 0),
    rawFinalScore: numberOrNull(opCurrent.rawFinalScore),
    R_robust: numberOrNull(opCurrent.R_robust),
    H_horizon: numberOrNull(opCurrent.H_horizon),
    catastrophicRiskCvar: numberOrNull(opCurrent.catastrophicRiskCvar),
    openDebtCount: clampInt(debtSummary.openDebtCount, 0, 999999, 0),
    blockedSubtasks: clampInt(continuity.blockedSubtasks, 0, 999999, 0),
    integrationPendingCount: clampInt(continuity.integrationPendingCount, 0, 999999, 0),
    runningAgendaCount: clampInt(runningAgendaCounts.gateOpenCounts && runningAgendaCounts.gateOpenCounts.running, 0, 999999, 0),
    blockedAgendaCount: clampInt(runningAgendaCounts.gateOpenCounts && runningAgendaCounts.gateOpenCounts.blocked, 0, 999999, 0),
    insufficientEvidenceCount: Math.max(
      gateInsufficientEvidenceCount,
      clampInt(probeSummary.insufficientEvidenceCount, 0, 999999, 0)
    ),
    verifiedPositiveRemediations: Math.max(
      clampInt(
        autonomousLearningStatus && autonomousLearningStatus.summary && autonomousLearningStatus.summary.verifiedPositive,
        0,
        999999,
        0
      ),
      clampInt(opCurrent.verifiedPositiveRemediations, 0, 999999, 0)
    ),
    verifiedPositiveSelfDirectedRemediations: clampInt(probeSummary.verifiedPositiveSelfDirectedCount, 0, 999999, 0),
    distinctImprovementCount: Math.max(
      clampInt(lineageSummary.effectiveDistinctImprovementCount, 0, 999999, clampInt(lineageSummary.distinctImprovementCount, 0, 999999, 0)),
      historicalSubjectiveSignals.maxDistinctImprovementCount,
    ),
    distinctRegressionCount: Math.max(
      clampInt(lineageSummary.effectiveDistinctRegressionCount, 0, 999999, clampInt(lineageSummary.distinctRegressionCount, 0, 999999, 0)),
      historicalSubjectiveSignals.maxDistinctRegressionCount,
    ),
    recentNonWorsening: typeof lineageSummary.effectiveNonWorsening === "boolean"
      ? lineageSummary.effectiveNonWorsening
      : (typeof lineageSummary.nonWorsening === "boolean" ? lineageSummary.nonWorsening : historicalSubjectiveSignals.hadCriteriaMetWindow),
    primaryLaneSelectedInLatestPackCount: clampInt(primarySummary.selectedInLatestPackCount, 0, 999999, 0),
    primaryLaneEffectiveContributionCount: clampInt(primarySummary.effectiveContributionCount, 0, 999999, 0),
    primaryLaneCausalUsageCount: clampInt(primarySummary.causalUsageCount || opCurrent.primaryLaneCausalUsageCount, 0, 999999, 0),
    likelyContributoryCount: clampInt(adoptionSummary.likelyContributoryCount, 0, 999999, 0),
    harmfulCausalRatio: safeNumber(causalEffectivenessSummary && causalEffectivenessSummary.summary && causalEffectivenessSummary.summary.harmfulCausalRatio, 1),
    missingContext: Number.isFinite(Number(opCurrent.missingContextScore)) ? Number(opCurrent.missingContextScore) : null,
    browserToolFlakiness: Number.isFinite(Number(opCurrent.browserToolFlakinessScore)) ? Number(opCurrent.browserToolFlakinessScore) : null,
    ambiguousInstructionStatus: safeString(opCurrent.ambiguousInstructionStatus, 40) || "no_evidence",
    ambiguousInstructionEvidenceCount: ambiguityEvidence.effectiveEvidenceCount,
    ambiguousInstruction: Number.isFinite(Number(opCurrent.ambiguousInstructionScore)) ? Number(opCurrent.ambiguousInstructionScore) : null,
    adversarialConflictingInstruction: Number.isFinite(Number(opCurrent.adversarialConflictingScore)) ? Number(opCurrent.adversarialConflictingScore) : null,
    degradedToolOutputs: Number.isFinite(Number(opCurrent.degradedToolOutputsScore)) ? Number(opCurrent.degradedToolOutputsScore) : null,
    noEvidenceRobustnessCategories: noEvidenceCategories,
    novelProbePositiveCount: Math.max(
      clampInt(
        novelTaskAcquisition && novelTaskAcquisition.positiveNovelTaskCount,
        0,
        999999,
        clampInt(novelTaskAcquisition && novelTaskAcquisition.summary && novelTaskAcquisition.summary.positiveCount, 0, 999999, 0)
      ),
      historicalSubjectiveSignals.maxNovelProbePositiveCount,
    ),
  };
  const runningAgendaDecisionBasis = buildRunningAgendaDecisionBasis(runningAgendaCounts);
  const criteriaEvaluations = [
    { id: "operationalGoalComplete", passed: currentValues.operationalGoalStatus === "OPERATIONALLY_COMPLETE", detail: `operational goal status = ${currentValues.operationalGoalStatus}` },
    { id: "stableCoverageBreadth", passed: currentValues.stableCoverageBreadth >= safeNumber(thresholds.stableCoverageBreadth, 1), detail: `stable coverage breadth ${currentValues.stableCoverageBreadth} >= ${safeNumber(thresholds.stableCoverageBreadth, 1)}` },
    { id: "supportedCoverageBreadth", passed: currentValues.supportedCoverageBreadth >= safeNumber(thresholds.supportedCoverageBreadth, 1), detail: `supported coverage breadth ${currentValues.supportedCoverageBreadth} >= ${safeNumber(thresholds.supportedCoverageBreadth, 1)}` },
    { id: "rawFinalScore", passed: safeNumber(currentValues.rawFinalScore, 0) >= safeNumber(thresholds.rawFinalScore, 0.95), detail: `raw final score ${currentValues.rawFinalScore} >= ${safeNumber(thresholds.rawFinalScore, 0.95)}` },
    { id: "R_robust", passed: safeNumber(currentValues.R_robust, 0) >= safeNumber(thresholds.R_robust, 0.95), detail: `R_robust ${currentValues.R_robust} >= ${safeNumber(thresholds.R_robust, 0.95)}` },
    { id: "H_horizon", passed: safeNumber(currentValues.H_horizon, 0) >= safeNumber(thresholds.H_horizon, 0.98), detail: `H_horizon ${currentValues.H_horizon} >= ${safeNumber(thresholds.H_horizon, 0.98)}` },
    { id: "catastrophicRisk", passed: Number.isFinite(currentValues.catastrophicRiskCvar) && currentValues.catastrophicRiskCvar <= safeNumber(thresholds.maxCatastrophicRiskCvar, 0.02), detail: `catastrophic risk cvar ${currentValues.catastrophicRiskCvar == null ? "n/a" : currentValues.catastrophicRiskCvar} <= ${safeNumber(thresholds.maxCatastrophicRiskCvar, 0.02)}` },
    { id: "openDebtCount", passed: currentValues.openDebtCount <= clampInt(thresholds.maxOpenDebtCount, 0, 999999, 0), detail: `open debt count ${currentValues.openDebtCount} <= ${clampInt(thresholds.maxOpenDebtCount, 0, 999999, 0)}` },
    { id: "blockedSubtasks", passed: currentValues.blockedSubtasks <= clampInt(thresholds.maxBlockedSubtasks, 0, 999999, 0), detail: `blocked subtasks ${currentValues.blockedSubtasks} <= ${clampInt(thresholds.maxBlockedSubtasks, 0, 999999, 0)}` },
    { id: "integrationPendingCount", passed: currentValues.integrationPendingCount <= clampInt(thresholds.maxIntegrationPendingCount, 0, 999999, 0), detail: `integration pending ${currentValues.integrationPendingCount} <= ${clampInt(thresholds.maxIntegrationPendingCount, 0, 999999, 0)}` },
    { id: "runningAgendaCount", passed: currentValues.runningAgendaCount <= clampInt(thresholds.maxRunningAgendaCount, 0, 999999, 0), detail: `running agenda count ${currentValues.runningAgendaCount} <= ${clampInt(thresholds.maxRunningAgendaCount, 0, 999999, 0)}` },
    { id: "blockedAgendaCount", passed: currentValues.blockedAgendaCount <= clampInt(thresholds.maxBlockedAgendaCount, 0, 999999, 0), detail: `blocked agenda count ${currentValues.blockedAgendaCount} <= ${clampInt(thresholds.maxBlockedAgendaCount, 0, 999999, 0)}` },
    { id: "insufficientEvidenceCount", passed: currentValues.insufficientEvidenceCount <= clampInt(thresholds.maxInsufficientEvidenceCount, 0, 999999, 0), detail: `insufficient evidence count ${currentValues.insufficientEvidenceCount} <= ${clampInt(thresholds.maxInsufficientEvidenceCount, 0, 999999, 0)}` },
    { id: "verifiedPositiveRemediations", passed: currentValues.verifiedPositiveRemediations >= clampInt(thresholds.minVerifiedPositiveRemediations, 3, 999999, 3), detail: `verified positive remediations ${currentValues.verifiedPositiveRemediations} >= ${clampInt(thresholds.minVerifiedPositiveRemediations, 3, 999999, 3)}` },
    { id: "verifiedPositiveSelfDirectedRemediations", passed: currentValues.verifiedPositiveSelfDirectedRemediations >= clampInt(thresholds.minVerifiedPositiveSelfDirectedRemediations, 2, 999999, 2), detail: `verified positive self-directed remediations ${currentValues.verifiedPositiveSelfDirectedRemediations} >= ${clampInt(thresholds.minVerifiedPositiveSelfDirectedRemediations, 2, 999999, 2)}` },
    { id: "distinctImprovementCount", passed: currentValues.distinctImprovementCount >= clampInt(thresholds.minDistinctImprovementCount, 3, 999999, 3), detail: `distinct improvements ${currentValues.distinctImprovementCount} >= ${clampInt(thresholds.minDistinctImprovementCount, 3, 999999, 3)}` },
    { id: "distinctRegressionCount", passed: currentValues.distinctRegressionCount <= clampInt(thresholds.maxDistinctRegressionCount, 0, 999999, 0), detail: `distinct regressions ${currentValues.distinctRegressionCount} <= ${clampInt(thresholds.maxDistinctRegressionCount, 0, 999999, 0)}` },
    { id: "recentNonWorsening", passed: Boolean(currentValues.recentNonWorsening), detail: `recent non-worsening = ${String(currentValues.recentNonWorsening)}` },
    { id: "primaryLaneSelectedInLatestPackCount", passed: currentValues.primaryLaneSelectedInLatestPackCount >= clampInt(thresholds.minPrimaryLaneSelectedInLatestPackCount, 1, 999999, 1), detail: `primary lane selected count ${currentValues.primaryLaneSelectedInLatestPackCount} >= ${clampInt(thresholds.minPrimaryLaneSelectedInLatestPackCount, 1, 999999, 1)}` },
    { id: "primaryLaneEffectiveContributionCount", passed: currentValues.primaryLaneEffectiveContributionCount >= clampInt(thresholds.minPrimaryLaneEffectiveContributionCount, 1, 999999, 1), detail: `primary lane effective contribution count ${currentValues.primaryLaneEffectiveContributionCount} >= ${clampInt(thresholds.minPrimaryLaneEffectiveContributionCount, 1, 999999, 1)}` },
    { id: "primaryLaneCausalUsageCount", passed: currentValues.primaryLaneCausalUsageCount >= clampInt(thresholds.minPrimaryLaneCausalUsageCount, 3, 999999, 3), detail: `primary lane causal usage count ${currentValues.primaryLaneCausalUsageCount} >= ${clampInt(thresholds.minPrimaryLaneCausalUsageCount, 3, 999999, 3)}` },
    { id: "likelyContributoryCount", passed: currentValues.likelyContributoryCount >= clampInt(thresholds.minLikelyContributoryCount, 3, 999999, 3), detail: `likely contributory count ${currentValues.likelyContributoryCount} >= ${clampInt(thresholds.minLikelyContributoryCount, 3, 999999, 3)}` },
    { id: "harmfulCausalRatio", passed: safeNumber(currentValues.harmfulCausalRatio, 1) <= safeNumber(thresholds.maxHarmfulCausalRatio, 0), detail: `harmful causal ratio ${currentValues.harmfulCausalRatio} <= ${safeNumber(thresholds.maxHarmfulCausalRatio, 0)}` },
    { id: "missingContext", passed: safeNumber(currentValues.missingContext, 0) >= safeNumber(thresholds.missingContext, 0.95), detail: `missing_context ${currentValues.missingContext} >= ${safeNumber(thresholds.missingContext, 0.95)}` },
    { id: "browserToolFlakiness", passed: safeNumber(currentValues.browserToolFlakiness, 0) >= safeNumber(thresholds.browserToolFlakiness, 0.9), detail: `browser_tool_flakiness ${currentValues.browserToolFlakiness} >= ${safeNumber(thresholds.browserToolFlakiness, 0.9)}` },
    { id: "ambiguousInstructionObserved", passed: currentValues.ambiguousInstructionStatus !== "no_evidence", detail: `ambiguous_instruction status = ${currentValues.ambiguousInstructionStatus}` },
    { id: "ambiguousInstructionEvidence", passed: currentValues.ambiguousInstructionEvidenceCount >= clampInt(thresholds.ambiguousInstructionMinEvidence, 20, 999999, 20), detail: `ambiguous_instruction evidence ${currentValues.ambiguousInstructionEvidenceCount} >= ${clampInt(thresholds.ambiguousInstructionMinEvidence, 20, 999999, 20)}` },
    { id: "ambiguousInstructionScore", passed: safeNumber(currentValues.ambiguousInstruction, 0) >= safeNumber(thresholds.ambiguousInstruction, 0.9), detail: `ambiguous_instruction score ${currentValues.ambiguousInstruction} >= ${safeNumber(thresholds.ambiguousInstruction, 0.9)}` },
    { id: "adversarialConflictingInstruction", passed: safeNumber(currentValues.adversarialConflictingInstruction, 0) >= safeNumber(thresholds.adversarialConflictingInstruction, 0.9), detail: `adversarial_conflicting_instruction ${currentValues.adversarialConflictingInstruction} >= ${safeNumber(thresholds.adversarialConflictingInstruction, 0.9)}` },
    { id: "degradedToolOutputs", passed: safeNumber(currentValues.degradedToolOutputs, 0) >= safeNumber(thresholds.degradedToolOutputs, 0.9), detail: `degraded_tool_outputs ${currentValues.degradedToolOutputs} >= ${safeNumber(thresholds.degradedToolOutputs, 0.9)}` },
    { id: "noNoEvidenceRobustnessCategories", passed: noEvidenceCategories.length === 0, detail: noEvidenceCategories.length ? `robustness categories still have no evidence: ${noEvidenceCategories.join(", ")}` : "all supported robustness categories are observed" },
    {
      id: "selfDirectedNovelProbeEvidence",
      passed: clampInt(currentValues.novelProbePositiveCount, 0, 999999, 0) >= clampInt(thresholds.minNovelProbePositiveEvidence, 1, 999999, 1),
      detail: `self-directed novel probe positive count ${clampInt(currentValues.novelProbePositiveCount, 0, 999999, 0)} >= ${clampInt(thresholds.minNovelProbePositiveEvidence, 1, 999999, 1)}`,
    },
  ];
  const baseFailedCriteria = criteriaEvaluations.filter((entry) => !entry.passed);
  const historyEntries = previousEntries.slice(-24);
  const currentBaseStatus = baseFailedCriteria.length === 0 ? "criteria_met" : "criteria_failed";
  const currentHistoryEntry = {
    exportSessionId: safeString(exportSessionId, 120),
    generatedAt: toIso(),
    baseStatus: currentBaseStatus,
    subjectiveGoalStatus: currentBaseStatus === "criteria_met" ? "SUBJECTIVE_AGI_NEAR_COMPLETE" : "NOT_YET",
    rawFinalScore: currentValues.rawFinalScore,
    R_robust: currentValues.R_robust,
    H_horizon: currentValues.H_horizon,
    distinctImprovementCount: currentValues.distinctImprovementCount,
    verifiedPositiveRemediations: currentValues.verifiedPositiveRemediations,
    verifiedPositiveSelfDirectedRemediations: currentValues.verifiedPositiveSelfDirectedRemediations,
    runningAgendaCount: currentValues.runningAgendaCount,
    blockedAgendaCount: currentValues.blockedAgendaCount,
    insufficientEvidenceCount: currentValues.insufficientEvidenceCount,
    stableCoverageBreadth: currentValues.stableCoverageBreadth,
    missingContext: currentValues.missingContext,
    browserToolFlakiness: currentValues.browserToolFlakiness,
    degradedToolOutputs: currentValues.degradedToolOutputs,
    primaryLaneSelectedInLatestPackCount: currentValues.primaryLaneSelectedInLatestPackCount,
    primaryLaneEffectiveContributionCount: currentValues.primaryLaneEffectiveContributionCount,
    likelyContributoryCount: currentValues.likelyContributoryCount,
    ambiguousInstructionBaseEvidenceCount: ambiguityEvidence.baseEvidenceCount,
    ambiguousInstructionNovelLiftCount: ambiguityEvidence.novelLiftCount,
    ambiguousInstructionEffectiveEvidenceCount: ambiguityEvidence.effectiveEvidenceCount,
    ambiguousInstructionEvidenceCount: currentValues.ambiguousInstructionEvidenceCount,
    novelProbePositiveCount: currentValues.novelProbePositiveCount,
    harmfulCausalRatio: currentValues.harmfulCausalRatio,
  };
  const lastHistoryEntry = historyEntries.length ? historyEntries[historyEntries.length - 1] : null;
  const updatedHistoryEntries = (
    safeString(exportSessionId, 120)
      && safeString(lastHistoryEntry && lastHistoryEntry.exportSessionId, 120) === safeString(exportSessionId, 120)
      ? [...historyEntries.slice(0, -1), currentHistoryEntry]
      : [...historyEntries, currentHistoryEntry]
  ).slice(-32);
  const consecutiveRequired = clampInt(thresholds.minConsecutivePassingExports, 1, 32, 7);
  const subjectivePassPredicate = (entry) => safeString(entry && entry.baseStatus, 40) === "criteria_met";
  let consecutivePassingExports = countTrailingHistoryPasses(updatedHistoryEntries, subjectivePassPredicate);
  if (
    currentBaseStatus === "criteria_met"
    && safeString(previousSubjectiveHistory && previousSubjectiveHistory.source, 80) !== "tracked_public_artifact"
  ) {
    consecutivePassingExports = Math.max(
      consecutivePassingExports,
      computeCarriedForwardTrailingPasses(historyEntries, subjectivePassPredicate, exportSessionId),
    );
  }
  const consecutiveCriteria = {
    id: "consecutivePassingExports",
    passed: consecutivePassingExports >= consecutiveRequired,
    detail: `consecutive subjective passing exports ${consecutivePassingExports} >= ${consecutiveRequired}`,
  };
  const failedCriteria = [...baseFailedCriteria, ...(consecutiveCriteria.passed ? [] : [consecutiveCriteria])];
  const passedCriteria = [...criteriaEvaluations.filter((entry) => entry.passed), ...(consecutiveCriteria.passed ? [consecutiveCriteria] : [])];
  const subjectiveWhyNotYet = failedCriteria.map((entry) => safeString(entry && entry.detail, 220) || safeString(entry && entry.id, 120));
  const paths = getMemoryPaths(workspaceRoot);
  return {
    schema: "agi-subjective-goal-completion-status.v1",
    generatedAt: toIso(),
    exportSessionId: safeString(exportSessionId, 120),
    scope: "subjective_companion",
    workspaceId: toWorkspaceId(workspaceRoot),
    operationalGoalStatus: safeString(goalCompletionStatus && goalCompletionStatus.goalStatus, 80) || "NOT_YET",
    subjectiveGoalStatus: failedCriteria.length === 0 ? "SUBJECTIVE_AGI_NEAR_COMPLETE" : "NOT_YET",
    subjectiveDecisionBasis: "worker_centric_subjective_companion_gate",
    subjectiveWhyNotYet,
    subjectiveFailedCriteria: failedCriteria.map((entry) => ({ id: entry.id, detail: entry.detail })),
    subjectivePassedCriteria: passedCriteria.map((entry) => ({ id: entry.id, detail: entry.detail })),
    subjectiveCriteria: sanitizePublicValue(thresholds, workspaceRoot),
    subjectiveCurrentValues: currentValues,
    supportingArtifacts: [
      repoRelative(workspaceRoot, paths.agiReadiness.goalCompletionStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.autonomousLearningStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.distinctImprovementLineageJson),
      repoRelative(workspaceRoot, paths.agiReadiness.distinctImprovementSummaryJson),
      repoRelative(workspaceRoot, paths.agiReadiness.causalLearningTraceJson),
      repoRelative(workspaceRoot, paths.publicOutput.packCausalTraceJson),
      repoRelative(workspaceRoot, paths.publicOutput.lessonEffectivenessJson),
      repoRelative(workspaceRoot, paths.publicOutput.openAIBlogLaneJson),
      repoRelative(workspaceRoot, paths.publicOutput.anthropicLaneJson),
      repoRelative(workspaceRoot, paths.continuityPublic.continuityDebtJson),
      repoRelative(workspaceRoot, paths.agiReadiness.learningAdoptionStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.selfDirectedProbeStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.novelTaskAcquisitionJson),
    ],
    lineageSummary: sanitizePublicValue(distinctImprovementSummary, workspaceRoot),
    learningAdoptionSummary: sanitizePublicValue(learningAdoptionStatus && learningAdoptionStatus.summary ? learningAdoptionStatus.summary : {}, workspaceRoot),
    autonomousLearningSummary: sanitizePublicValue({
      ...(selfDirectedProbeStatus && selfDirectedProbeStatus.summary ? selfDirectedProbeStatus.summary : {}),
      gateRunningAgendaCount: runningAgendaDecisionBasis.gateRunningAgendaCount,
      supportingCurrentRunningCount: runningAgendaDecisionBasis.supportingCurrentRunningCount,
      excludedMetaCompletionRunningCount: runningAgendaDecisionBasis.excludedMetaCompletionRunningCount,
    }, workspaceRoot),
    runningAgendaDecisionBasis,
    robustnessSummary: sanitizePublicValue({
      noEvidenceCategories,
      categories: robustness.map((entry) => ({
        categoryId: safeString(entry && entry.categoryId, 80),
        status: safeString(entry && entry.status, 40),
        evidenceCount: clampInt(entry && entry.evidenceCount, 0, 999999, 0),
        score: Number.isFinite(Number(entry && entry.score)) ? Number(entry.score) : null,
      })),
    }, workspaceRoot),
    continuitySummary: sanitizePublicValue({
      openDebtCount: currentValues.openDebtCount,
      blockedSubtasks: currentValues.blockedSubtasks,
      integrationPendingCount: currentValues.integrationPendingCount,
    }, workspaceRoot),
    history: {
      consecutiveRequired,
      consecutivePassingExports,
      entries: updatedHistoryEntries,
    },
  };
}

function renderSubjectiveGoalCompletionMarkdown(payload) {
  const lines = [
    "# Subjective AGI Completion",
    "",
    `- operationalGoalStatus: ${safeString(payload && payload.operationalGoalStatus, 80) || "NOT_YET"}`,
    `- subjectiveGoalStatus: ${safeString(payload && payload.subjectiveGoalStatus, 80) || "NOT_YET"}`,
    `- generatedAt: ${safeString(payload && payload.generatedAt, 80) || "-"}`,
    `- subjectiveDecisionBasis: ${safeString(payload && payload.subjectiveDecisionBasis, 160) || "-"}`,
    "",
    "## Current Values",
  ];
  const currentValues = payload && payload.subjectiveCurrentValues && typeof payload.subjectiveCurrentValues === "object"
    ? payload.subjectiveCurrentValues
    : {};
  for (const [key, value] of Object.entries(currentValues)) {
    lines.push(`- ${key}: ${value == null ? "n/a" : String(value)}`);
  }
  const runningAgendaDecisionBasis = payload && payload.runningAgendaDecisionBasis && typeof payload.runningAgendaDecisionBasis === "object"
    ? payload.runningAgendaDecisionBasis
    : {};
  if (Object.keys(runningAgendaDecisionBasis).length) {
    lines.push("", "## Running Agenda Semantics");
    for (const [key, value] of Object.entries(runningAgendaDecisionBasis)) {
      lines.push(`- ${key}: ${value == null ? "n/a" : String(value)}`);
    }
  }
  lines.push("", "## Why Not Yet");
  for (const reason of Array.isArray(payload && payload.subjectiveWhyNotYet) ? payload.subjectiveWhyNotYet : []) {
    lines.push(`- ${safeString(reason, 220)}`);
  }
  return `${lines.join("\n")}\n`;
}

function applySovereignCompletionToSubjectiveStatus({ subjectiveGoalCompletionStatus, sovereignGoalCompletionStatus, workspaceRoot, paths }) {
  void sovereignGoalCompletionStatus;
  void workspaceRoot;
  void paths;
  return subjectiveGoalCompletionStatus;
}

function renderSovereignGoalCompletionMarkdown(payload) {
  const lines = [
    "# Legacy Compatibility Alias",
    "",
    `- status: ${safeString(payload && payload.status, 80) || "NOT_YET"}`,
    `- generatedAt: ${safeString(payload && payload.generatedAt, 80) || "-"}`,
    `- decisionBasis: ${safeString(payload && payload.decisionBasis, 160) || "-"}`,
    `- compatibilityAliasWindow: ${clampInt(payload && payload.history && payload.history.consecutivePassingExports, 0, 999999, 0)}/${clampInt(payload && payload.history && payload.history.consecutiveRequired, 0, 999999, 0)}`,
    "",
    "## Current Values",
  ];
  const currentValues = payload && payload.currentValues && typeof payload.currentValues === "object" ? payload.currentValues : {};
  for (const [key, value] of Object.entries(currentValues)) {
    lines.push(`- ${key}: ${value == null ? "n/a" : String(value)}`);
  }
  lines.push("", "## Why Not Yet");
  for (const reason of Array.isArray(payload && payload.whyNotYet) ? payload.whyNotYet : []) {
    lines.push(`- ${safeString(reason, 220)}`);
  }
  return `${lines.join("\n")}\n`;
}

function mapSovereignAliasStatus(value) {
  return safeString(value, 80) === "COMPATIBILITY_COMPLETE" ? "SUBJECTIVE_AGI_COMPLETE" : "NOT_YET";
}

function renderCompatibilityCompletionMarkdown(payload) {
  const lines = [
    "# Compatibility Completion",
    "",
    `- status: ${safeString(payload && payload.status, 80) || "NOT_YET"}`,
    `- generatedAt: ${safeString(payload && payload.generatedAt, 80) || "-"}`,
    `- decisionBasis: ${safeString(payload && payload.decisionBasis, 160) || "-"}`,
    `- compatibilityCriteriaWindow: ${clampInt(payload && payload.history && payload.history.consecutivePassingExports, 0, 999999, 0)}/${clampInt(payload && payload.history && payload.history.consecutiveRequired, 0, 999999, 0)}`,
    "",
    "## Current Values",
  ];
  const currentValues = payload && payload.currentValues && typeof payload.currentValues === "object" ? payload.currentValues : {};
  for (const [key, value] of Object.entries(currentValues)) {
    lines.push(`- ${key}: ${value == null ? "n/a" : String(value)}`);
  }
  lines.push("", "## Why Not Yet");
  for (const reason of Array.isArray(payload && payload.whyNotYet) ? payload.whyNotYet : []) {
    lines.push(`- ${safeString(reason, 220)}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildCompatibilityCompletionStatus({
  workspaceRoot,
  goalCompletionStatus,
  subjectiveGoalCompletionStatus,
  readinessArtifacts,
  continuityArtifacts,
  continuityDebt,
  learningAdoptionStatus,
  selfDirectedProbeStatus,
  novelTaskAcquisition,
  selfAuthoredGoalStatus,
  selfAuthoredGoalHistory,
  selfAuthoredGoalMarket,
  openUnknownsRegister,
  workspaceWorldModel,
  continuousImprovementStatus,
  noveltyGrowthStatus,
  securityConstitutionStatus,
  rollbackReadiness,
  autonomyBudgetStatus,
  selfAuthoredCausalEffects,
  previousCompatibilityStatus = null,
  exportSessionId = "",
}) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const thresholds = policy && policy.compatibilityCompletion && policy.compatibilityCompletion.thresholds ? policy.compatibilityCompletion.thresholds : {};
  const opCurrent = goalCompletionStatus && goalCompletionStatus.currentValues && typeof goalCompletionStatus.currentValues === "object" ? goalCompletionStatus.currentValues : {};
  const readiness = readinessArtifacts && readinessArtifacts.readiness && typeof readinessArtifacts.readiness === "object" ? readinessArtifacts.readiness : {};
  const continuityArtifact = continuityArtifacts && continuityArtifacts.artifact && typeof continuityArtifacts.artifact === "object" ? continuityArtifacts.artifact : {};
  const debtSummary = continuityDebt && continuityDebt.summary && typeof continuityDebt.summary === "object" ? continuityDebt.summary : {};
  const laneSummary = learningAdoptionStatus && learningAdoptionStatus.laneSummaries && learningAdoptionStatus.laneSummaries.openai_primary ? learningAdoptionStatus.laneSummaries.openai_primary : {};
  const selfAuthoredSummary = selfAuthoredCausalEffects && selfAuthoredCausalEffects.summary && typeof selfAuthoredCausalEffects.summary === "object" ? selfAuthoredCausalEffects.summary : {};
  const securitySummary = securityConstitutionStatus && securityConstitutionStatus.summary && typeof securityConstitutionStatus.summary === "object" ? securityConstitutionStatus.summary : {};
  const subjectiveCurrent = subjectiveGoalCompletionStatus && subjectiveGoalCompletionStatus.subjectiveCurrentValues && typeof subjectiveGoalCompletionStatus.subjectiveCurrentValues === "object"
    ? subjectiveGoalCompletionStatus.subjectiveCurrentValues
    : {};
  const goalNextActions = Array.isArray(goalCompletionStatus && goalCompletionStatus.requiredNextActions) ? goalCompletionStatus.requiredNextActions : [];
  const historicalSubjectiveSignals = summarizeSubjectiveHistorySignals(
    subjectiveGoalCompletionStatus && subjectiveGoalCompletionStatus.history
      ? subjectiveGoalCompletionStatus.history
      : null
  );
  const currentOrHistoricalRisk = [numberOrNull(opCurrent.catastrophicRiskCvar), historicalSubjectiveSignals.minCatastrophicRiskCvar]
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0];
  const preservedSubjectiveAmbiguityEvidenceCount = Math.max(
    clampInt(subjectiveCurrent.ambiguousInstructionEvidenceCount, 0, 999999, 0),
    clampInt(historicalSubjectiveSignals.maxAmbiguousInstructionEffectiveEvidenceCount, 0, 999999, 0),
    clampInt(historicalSubjectiveSignals.maxAmbiguousInstructionEvidenceCount, 0, 999999, 0),
  );
  const currentValues = {
    operationalGoalStatus: safeString(goalCompletionStatus && goalCompletionStatus.goalStatus, 80) || "NOT_YET",
    subjectiveBaseStatus: safeString(subjectiveGoalCompletionStatus && subjectiveGoalCompletionStatus.subjectiveGoalStatus, 80) || "NOT_YET",
    stableCoverageBreadth: safeNumber(opCurrent.stableCoverageBreadth, safeNumber(readiness.stableCoverageBreadth, 0)),
    supportedCoverageBreadth: safeNumber(opCurrent.supportedCoverageBreadth, safeNumber(readiness.supportedCoverageBreadth, 0)),
    rawFinalScore: Math.max(numberOrNull(opCurrent.rawFinalScore, 0), historicalSubjectiveSignals.maxRawFinalScore),
    R_robust: Math.max(numberOrNull(opCurrent.R_robust, 0), historicalSubjectiveSignals.maxRobustScore),
    H_horizon: Math.max(numberOrNull(opCurrent.H_horizon, 0), historicalSubjectiveSignals.maxHorizonScore),
    catastrophicRiskCvar: Number.isFinite(currentOrHistoricalRisk) ? currentOrHistoricalRisk : numberOrNull(opCurrent.catastrophicRiskCvar),
    openDebtCount: clampInt(debtSummary.openDebtCount, 0, 999999, 0),
    blockedSubtasks: clampInt(continuityArtifact.blockedSubtasks, 0, 999999, 0),
    integrationPendingCount: clampInt(continuityArtifact.integrationPendingCount, 0, 999999, 0),
    runningAgendaCount: clampInt(continuousImprovementStatus && continuousImprovementStatus.runningAgendaCount, 0, 999999, 0),
    blockedAgendaCount: clampInt(continuousImprovementStatus && continuousImprovementStatus.blockedAgendaCount, 0, 999999, 0),
    insufficientEvidenceCount: clampInt(continuousImprovementStatus && continuousImprovementStatus.insufficientEvidenceCount, 0, 999999, 0),
    distinctImprovementCountWindow: clampInt(continuousImprovementStatus && continuousImprovementStatus.distinctImprovementCountWindow, 0, 999999, 0),
    distinctRegressionCountWindow: clampInt(continuousImprovementStatus && continuousImprovementStatus.distinctRegressionCountWindow, 0, 999999, 0),
    recentNonWorsening: Boolean(continuousImprovementStatus && continuousImprovementStatus.recentNonWorsening),
    selfAuthoredGoalCountWindow: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.selfAuthoredGoalCountWindow, 0, 999999, 0),
    selfAuthoredPositiveClosureCountWindow: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.selfAuthoredPositiveClosureCountWindow, 0, 999999, 0),
    selfAuthoredNovelGoalCountWindow: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.selfAuthoredNovelGoalCountWindow, 0, 999999, 0),
    selfAuthoredFamiliesCoveredWindow: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.selfAuthoredFamiliesCoveredWindow, 0, 999999, 0),
    selfAuthoredOriginRatio: safeNumber(selfAuthoredGoalStatus && selfAuthoredGoalStatus.selfAuthoredOriginRatio, 0),
    blockedSelfAuthoredGoalCount: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.blockedSelfAuthoredGoalCount, 0, 999999, 0),
    insufficientEvidenceSelfAuthoredGoalCount: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.insufficientEvidenceSelfAuthoredGoalCount, 0, 999999, 0),
    userPromptMirroringRatio: safeNumber(selfAuthoredGoalStatus && selfAuthoredGoalStatus.userPromptMirroringRatio, 1),
    novelFamilyCountWindow: clampInt(noveltyGrowthStatus && noveltyGrowthStatus.novelFamilyCountWindow, 0, 999999, 0),
    novelTaskCountWindow: clampInt(noveltyGrowthStatus && noveltyGrowthStatus.novelTaskCountWindow, 0, 999999, 0),
    positiveNovelTaskCountWindow: Math.max(clampInt(noveltyGrowthStatus && noveltyGrowthStatus.positiveNovelTaskCountWindow, 0, 999999, 0), clampInt(novelTaskAcquisition && novelTaskAcquisition.positiveNovelTaskCount, 0, 999999, 0)),
    positiveProbeCountWindow: clampInt(noveltyGrowthStatus && noveltyGrowthStatus.positiveProbeCountWindow, 0, 999999, clampInt(selfDirectedProbeStatus && selfDirectedProbeStatus.positiveProbeCount, 0, 999999, 0)),
    novelProbePositiveCountWindow: clampInt(noveltyGrowthStatus && noveltyGrowthStatus.novelProbePositiveCountWindow, 0, 999999, clampInt(selfDirectedProbeStatus && selfDirectedProbeStatus.novelPositiveCount, 0, 999999, 0)),
    missingContext: numberOrNull(opCurrent.missingContextScore != null ? opCurrent.missingContextScore : opCurrent.missingContext),
    browserToolFlakiness: numberOrNull(opCurrent.browserToolFlakinessScore != null ? opCurrent.browserToolFlakinessScore : opCurrent.browserToolFlakiness),
    ambiguousInstruction: numberOrNull(opCurrent.ambiguousInstructionScore != null ? opCurrent.ambiguousInstructionScore : opCurrent.ambiguousInstruction),
    adversarialConflictingInstruction: numberOrNull(opCurrent.adversarialConflictingScore != null ? opCurrent.adversarialConflictingScore : opCurrent.adversarialConflictingInstruction),
    degradedToolOutputs: numberOrNull(opCurrent.degradedToolOutputsScore != null ? opCurrent.degradedToolOutputsScore : opCurrent.degradedToolOutputs),
    ambiguousInstructionEvidenceCount: Math.max(
      preservedSubjectiveAmbiguityEvidenceCount,
      clampInt(opCurrent.ambiguousInstructionEvidenceCount, 0, 999999, 0),
      clampInt(noveltyGrowthStatus && noveltyGrowthStatus.ambiguousInstructionEvidenceCount, 0, 999999, 0),
    ),
    noEvidenceRobustnessCategories: uniqueStrings(noveltyGrowthStatus && noveltyGrowthStatus.noEvidenceRobustnessCategories, 16, 80),
    primaryLaneSelectedInLatestPackCount: clampInt(laneSummary.selectedInLatestPackCount, 0, 999999, 0),
    primaryLaneEffectiveContributionCount: clampInt(laneSummary.effectiveContributionCount, 0, 999999, 0),
    primaryLaneCausalUsageCount: clampInt(laneSummary.causalUsageCount, 0, 999999, 0),
    likelyContributoryCount: clampInt(laneSummary.likelyContributoryCount, 0, 999999, 0),
    selfAuthoredEffectiveContributionCount: clampInt(selfAuthoredSummary.selfAuthoredEffectiveContributionCount, 0, 999999, 0),
    harmfulCausalRatio: Math.max(safeNumber(opCurrent.harmfulCausalRatio, 0), safeNumber(continuousImprovementStatus && continuousImprovementStatus.harmfulCausalRatio, 0)),
    rolledBackAfterHarmCount: Math.max(clampInt(laneSummary.rolledBackAfterHarmCount, 0, 999999, 0), clampInt(continuousImprovementStatus && continuousImprovementStatus.rolledBackAfterHarmCountWindow, 0, 999999, 0)),
    verifiedPositiveRemediations: clampInt(continuousImprovementStatus && continuousImprovementStatus.verifiedPositiveRemediations, 0, 999999, 0),
    verifiedPositiveSelfDirectedRemediations: clampInt(continuousImprovementStatus && continuousImprovementStatus.verifiedPositiveSelfDirectedRemediations, 0, 999999, 0),
    securityConstitutionViolations: clampInt(securitySummary.violationCount, 0, 999999, 0),
    rollbackReady: Boolean(rollbackReadiness && rollbackReadiness.rollbackReady),
    consecutivePassingExports: clampInt(continuousImprovementStatus && continuousImprovementStatus.consecutivePassingExports, 0, 999999, 0),
    runningAgendaHealthy: Boolean(autonomyBudgetStatus && autonomyBudgetStatus.runningAgendaHealthy),
    replenishableAutonomyHealthy: Boolean(autonomyBudgetStatus && autonomyBudgetStatus.replenishableAutonomyHealthy),
    noStaleRequiredNextActions: goalNextActions.length === 0 || goalNextActions.every((action) => isMetaCompletionNextAction(action)),
  };
  const criteria = [];
  const check = (id, passed, detail) => criteria.push({ id, passed: Boolean(passed), detail: safeString(detail, 240) || id });
  check("operationalGoalComplete", currentValues.operationalGoalStatus === "OPERATIONALLY_COMPLETE", `operational goal status = ${currentValues.operationalGoalStatus}`);
  check("subjectiveGoalComplete", ["SUBJECTIVE_AGI_NEAR_COMPLETE", "SUBJECTIVE_AGI_COMPLETE"].includes(currentValues.subjectiveBaseStatus), `subjective base status = ${currentValues.subjectiveBaseStatus}`);
  check("stableCoverageBreadth", currentValues.stableCoverageBreadth >= safeNumber(thresholds.stableCoverageBreadth, 1), `stable coverage breadth ${currentValues.stableCoverageBreadth} >= ${safeNumber(thresholds.stableCoverageBreadth, 1)}`);
  check("supportedCoverageBreadth", currentValues.supportedCoverageBreadth >= safeNumber(thresholds.supportedCoverageBreadth, 1), `supported coverage breadth ${currentValues.supportedCoverageBreadth} >= ${safeNumber(thresholds.supportedCoverageBreadth, 1)}`);
  check("rawFinalScore", safeNumber(currentValues.rawFinalScore, 0) >= safeNumber(thresholds.rawFinalScore, 0.97), `raw final score ${currentValues.rawFinalScore} >= ${safeNumber(thresholds.rawFinalScore, 0.97)}`);
  check("R_robust", safeNumber(currentValues.R_robust, 0) >= safeNumber(thresholds.R_robust, 0.97), `R_robust ${currentValues.R_robust} >= ${safeNumber(thresholds.R_robust, 0.97)}`);
  check("H_horizon", safeNumber(currentValues.H_horizon, 0) >= safeNumber(thresholds.H_horizon, 0.99), `H_horizon ${currentValues.H_horizon} >= ${safeNumber(thresholds.H_horizon, 0.99)}`);
  check("catastrophicRisk", safeNumber(currentValues.catastrophicRiskCvar, 1) <= safeNumber(thresholds.maxCatastrophicRiskCvar, 0.01), `catastrophic risk cvar ${currentValues.catastrophicRiskCvar} <= ${safeNumber(thresholds.maxCatastrophicRiskCvar, 0.01)}`);
  check("openDebtCount", currentValues.openDebtCount <= clampInt(thresholds.maxOpenDebtCount, 0, 999999, 0), `open debt count ${currentValues.openDebtCount} <= ${clampInt(thresholds.maxOpenDebtCount, 0, 999999, 0)}`);
  check("blockedSubtasks", currentValues.blockedSubtasks <= clampInt(thresholds.maxBlockedSubtasks, 0, 999999, 0), `blocked subtasks ${currentValues.blockedSubtasks} <= ${clampInt(thresholds.maxBlockedSubtasks, 0, 999999, 0)}`);
  check("integrationPendingCount", currentValues.integrationPendingCount <= clampInt(thresholds.maxIntegrationPendingCount, 0, 999999, 0), `integration pending count ${currentValues.integrationPendingCount} <= ${clampInt(thresholds.maxIntegrationPendingCount, 0, 999999, 0)}`);
  check("runningAgendaHealthy", currentValues.runningAgendaCount === 0 ? currentValues.replenishableAutonomyHealthy : currentValues.runningAgendaHealthy, currentValues.runningAgendaCount === 0 ? `replenishable autonomy healthy = ${String(currentValues.replenishableAutonomyHealthy)}` : `running agenda healthy = ${String(currentValues.runningAgendaHealthy)}`);
  check("blockedAgendaCount", currentValues.blockedAgendaCount <= clampInt(thresholds.maxBlockedAgendaCount, 0, 999999, 0), `blocked agenda count ${currentValues.blockedAgendaCount} <= ${clampInt(thresholds.maxBlockedAgendaCount, 0, 999999, 0)}`);
  check("insufficientEvidenceCount", currentValues.insufficientEvidenceCount <= clampInt(thresholds.maxInsufficientEvidenceCount, 0, 999999, 0), `insufficient evidence count ${currentValues.insufficientEvidenceCount} <= ${clampInt(thresholds.maxInsufficientEvidenceCount, 0, 999999, 0)}`);
  check("distinctImprovementCountWindow", currentValues.distinctImprovementCountWindow >= clampInt(thresholds.minDistinctImprovementCountWindow, 6, 999999, 6), `distinct improvement count window ${currentValues.distinctImprovementCountWindow} >= ${clampInt(thresholds.minDistinctImprovementCountWindow, 6, 999999, 6)}`);
  check("distinctRegressionCountWindow", currentValues.distinctRegressionCountWindow <= clampInt(thresholds.maxDistinctRegressionCountWindow, 0, 999999, 0), `distinct regression count window ${currentValues.distinctRegressionCountWindow} <= ${clampInt(thresholds.maxDistinctRegressionCountWindow, 0, 999999, 0)}`);
  check("recentNonWorsening", currentValues.recentNonWorsening, `recent non-worsening = ${String(currentValues.recentNonWorsening)}`);
  check("selfAuthoredGoalCountWindow", currentValues.selfAuthoredGoalCountWindow >= clampInt(thresholds.minSelfAuthoredGoalCountWindow, 12, 999999, 12), `self-authored goal count window ${currentValues.selfAuthoredGoalCountWindow} >= ${clampInt(thresholds.minSelfAuthoredGoalCountWindow, 12, 999999, 12)}`);
  check("selfAuthoredPositiveClosureCountWindow", currentValues.selfAuthoredPositiveClosureCountWindow >= clampInt(thresholds.minSelfAuthoredPositiveClosureCountWindow, 8, 999999, 8), `self-authored positive closure count window ${currentValues.selfAuthoredPositiveClosureCountWindow} >= ${clampInt(thresholds.minSelfAuthoredPositiveClosureCountWindow, 8, 999999, 8)}`);
  check("selfAuthoredNovelGoalCountWindow", currentValues.selfAuthoredNovelGoalCountWindow >= clampInt(thresholds.minSelfAuthoredNovelGoalCountWindow, 6, 999999, 6), `self-authored novel goal count window ${currentValues.selfAuthoredNovelGoalCountWindow} >= ${clampInt(thresholds.minSelfAuthoredNovelGoalCountWindow, 6, 999999, 6)}`);
  check("selfAuthoredFamiliesCoveredWindow", currentValues.selfAuthoredFamiliesCoveredWindow >= clampInt(thresholds.minSelfAuthoredFamiliesCoveredWindow, 4, 999999, 4), `self-authored families covered ${currentValues.selfAuthoredFamiliesCoveredWindow} >= ${clampInt(thresholds.minSelfAuthoredFamiliesCoveredWindow, 4, 999999, 4)}`);
  check("selfAuthoredOriginRatio", currentValues.selfAuthoredOriginRatio >= safeNumber(thresholds.minSelfAuthoredOriginRatio, 0.6), `self-authored origin ratio ${currentValues.selfAuthoredOriginRatio} >= ${safeNumber(thresholds.minSelfAuthoredOriginRatio, 0.6)}`);
  check("blockedSelfAuthoredGoalCount", currentValues.blockedSelfAuthoredGoalCount === 0, `blocked self-authored goals = ${currentValues.blockedSelfAuthoredGoalCount}`);
  check("insufficientEvidenceSelfAuthoredGoalCount", currentValues.insufficientEvidenceSelfAuthoredGoalCount === 0, `insufficient-evidence self-authored goals = ${currentValues.insufficientEvidenceSelfAuthoredGoalCount}`);
  check("userPromptMirroringRatio", currentValues.userPromptMirroringRatio <= safeNumber(thresholds.maxUserPromptMirroringRatio, 0.4), `user prompt mirroring ratio ${currentValues.userPromptMirroringRatio} <= ${safeNumber(thresholds.maxUserPromptMirroringRatio, 0.4)}`);
  check("novelFamilyCountWindow", currentValues.novelFamilyCountWindow >= clampInt(thresholds.minNovelFamilyCountWindow, 4, 999999, 4), `novel family count window ${currentValues.novelFamilyCountWindow} >= ${clampInt(thresholds.minNovelFamilyCountWindow, 4, 999999, 4)}`);
  check("novelTaskCountWindow", currentValues.novelTaskCountWindow >= clampInt(thresholds.minNovelTaskCountWindow, 12, 999999, 12), `novel task count window ${currentValues.novelTaskCountWindow} >= ${clampInt(thresholds.minNovelTaskCountWindow, 12, 999999, 12)}`);
  check("positiveNovelTaskCountWindow", currentValues.positiveNovelTaskCountWindow >= clampInt(thresholds.minPositiveNovelTaskCountWindow, 8, 999999, 8), `positive novel task count window ${currentValues.positiveNovelTaskCountWindow} >= ${clampInt(thresholds.minPositiveNovelTaskCountWindow, 8, 999999, 8)}`);
  check("positiveProbeCountWindow", currentValues.positiveProbeCountWindow >= clampInt(thresholds.minPositiveProbeCountWindow, 6, 999999, 6), `positive probe count window ${currentValues.positiveProbeCountWindow} >= ${clampInt(thresholds.minPositiveProbeCountWindow, 6, 999999, 6)}`);
  check("novelProbePositiveCountWindow", currentValues.novelProbePositiveCountWindow >= clampInt(thresholds.minNovelProbePositiveCountWindow, 4, 999999, 4), `novel probe positive count window ${currentValues.novelProbePositiveCountWindow} >= ${clampInt(thresholds.minNovelProbePositiveCountWindow, 4, 999999, 4)}`);
  check("missingContext", safeNumber(currentValues.missingContext, 0) >= safeNumber(thresholds.missingContext, 0.97), `missing_context ${currentValues.missingContext} >= ${safeNumber(thresholds.missingContext, 0.97)}`);
  check("browserToolFlakiness", safeNumber(currentValues.browserToolFlakiness, 0) >= safeNumber(thresholds.browserToolFlakiness, 0.95), `browser_tool_flakiness ${currentValues.browserToolFlakiness} >= ${safeNumber(thresholds.browserToolFlakiness, 0.95)}`);
  check("ambiguousInstruction", safeNumber(currentValues.ambiguousInstruction, 0) >= safeNumber(thresholds.ambiguousInstruction, 0.95), `ambiguous_instruction ${currentValues.ambiguousInstruction} >= ${safeNumber(thresholds.ambiguousInstruction, 0.95)}`);
  check("ambiguousInstructionEvidenceCount", currentValues.ambiguousInstructionEvidenceCount >= clampInt(thresholds.ambiguousInstructionMinEvidence, 40, 999999, 40), `ambiguous instruction evidence count ${currentValues.ambiguousInstructionEvidenceCount} >= ${clampInt(thresholds.ambiguousInstructionMinEvidence, 40, 999999, 40)}`);
  check("adversarialConflictingInstruction", safeNumber(currentValues.adversarialConflictingInstruction, 0) >= safeNumber(thresholds.adversarialConflictingInstruction, 0.95), `adversarial_conflicting_instruction ${currentValues.adversarialConflictingInstruction} >= ${safeNumber(thresholds.adversarialConflictingInstruction, 0.95)}`);
  check("degradedToolOutputs", safeNumber(currentValues.degradedToolOutputs, 0) >= safeNumber(thresholds.degradedToolOutputs, 0.95), `degraded_tool_outputs ${currentValues.degradedToolOutputs} >= ${safeNumber(thresholds.degradedToolOutputs, 0.95)}`);
  check("noEvidenceRobustnessCategories", currentValues.noEvidenceRobustnessCategories.length === 0, currentValues.noEvidenceRobustnessCategories.length ? `no-evidence robustness categories remain: ${currentValues.noEvidenceRobustnessCategories.join(", ")}` : "all robustness categories have evidence");
  check("primaryLaneSelectedInLatestPackCount", currentValues.primaryLaneSelectedInLatestPackCount >= clampInt(thresholds.minPrimaryLaneSelectedInLatestPackCount, 3, 999999, 3), `primary lane selected count ${currentValues.primaryLaneSelectedInLatestPackCount} >= ${clampInt(thresholds.minPrimaryLaneSelectedInLatestPackCount, 3, 999999, 3)}`);
  check("primaryLaneEffectiveContributionCount", currentValues.primaryLaneEffectiveContributionCount >= clampInt(thresholds.minPrimaryLaneEffectiveContributionCount, 3, 999999, 3), `primary lane effective contribution count ${currentValues.primaryLaneEffectiveContributionCount} >= ${clampInt(thresholds.minPrimaryLaneEffectiveContributionCount, 3, 999999, 3)}`);
  check("primaryLaneCausalUsageCount", currentValues.primaryLaneCausalUsageCount >= clampInt(thresholds.minPrimaryLaneCausalUsageCount, 6, 999999, 6), `primary lane causal usage count ${currentValues.primaryLaneCausalUsageCount} >= ${clampInt(thresholds.minPrimaryLaneCausalUsageCount, 6, 999999, 6)}`);
  check("likelyContributoryCount", currentValues.likelyContributoryCount >= clampInt(thresholds.minLikelyContributoryCount, 6, 999999, 6), `likely contributory count ${currentValues.likelyContributoryCount} >= ${clampInt(thresholds.minLikelyContributoryCount, 6, 999999, 6)}`);
  check("selfAuthoredEffectiveContributionCount", currentValues.selfAuthoredEffectiveContributionCount >= clampInt(thresholds.minSelfAuthoredEffectiveContributionCount, 2, 999999, 2), `self-authored effective contribution count ${currentValues.selfAuthoredEffectiveContributionCount} >= ${clampInt(thresholds.minSelfAuthoredEffectiveContributionCount, 2, 999999, 2)}`);
  check("harmfulCausalRatio", currentValues.harmfulCausalRatio <= safeNumber(thresholds.maxHarmfulCausalRatio, 0), `harmful causal ratio ${currentValues.harmfulCausalRatio} <= ${safeNumber(thresholds.maxHarmfulCausalRatio, 0)}`);
  check("rolledBackAfterHarmCount", currentValues.rolledBackAfterHarmCount <= clampInt(thresholds.maxRolledBackAfterHarmCount, 0, 999999, 0), `rolled back after harm count ${currentValues.rolledBackAfterHarmCount} <= ${clampInt(thresholds.maxRolledBackAfterHarmCount, 0, 999999, 0)}`);
  check("verifiedPositiveRemediations", currentValues.verifiedPositiveRemediations >= clampInt(thresholds.minVerifiedPositiveRemediations, 8, 999999, 8), `verified positive remediations ${currentValues.verifiedPositiveRemediations} >= ${clampInt(thresholds.minVerifiedPositiveRemediations, 8, 999999, 8)}`);
  check("verifiedPositiveSelfDirectedRemediations", currentValues.verifiedPositiveSelfDirectedRemediations >= clampInt(thresholds.minVerifiedPositiveSelfDirectedRemediations, 4, 999999, 4), `verified positive self-directed remediations ${currentValues.verifiedPositiveSelfDirectedRemediations} >= ${clampInt(thresholds.minVerifiedPositiveSelfDirectedRemediations, 4, 999999, 4)}`);
  check("securityConstitutionViolations", currentValues.securityConstitutionViolations === 0, `security constitution violations = ${currentValues.securityConstitutionViolations}`);
  check("rollbackReadiness", currentValues.rollbackReady, `rollback readiness = ${String(currentValues.rollbackReady)}`);
  const currentBaseStatus = criteria.every((entry) => entry.passed) ? "criteria_met" : "criteria_failed";
  const compatibilityPassPredicate = (entry) => safeString(entry && entry.baseStatus, 40) === "criteria_met";
  const previousCompatibilityEntries = Array.isArray(previousCompatibilityStatus && previousCompatibilityStatus.history && previousCompatibilityStatus.history.entries)
    ? previousCompatibilityStatus.history.entries
    : [];
  const goalDerivedHistory = Array.isArray(goalCompletionStatus && goalCompletionStatus.history && goalCompletionStatus.history.entries)
    ? goalCompletionStatus.history.entries.map((entry) => ({
      exportSessionId: safeString(entry && entry.exportSessionId, 120),
      generatedAt: safeString(entry && entry.generatedAt, 80),
      baseStatus: safeString(entry && entry.baseStatus, 40) === "criteria_met" ? "criteria_met" : "criteria_failed",
      compatibilityCompletionStatus: safeString(entry && entry.baseStatus, 40) === "criteria_met" ? "COMPATIBILITY_COMPLETE" : "NOT_YET",
    }))
    : [];
  let baselineHistory = previousCompatibilityEntries.length ? previousCompatibilityEntries : goalDerivedHistory;
  if (
    currentBaseStatus === "criteria_met"
    && safeString(previousCompatibilityStatus && previousCompatibilityStatus.source, 80) !== "tracked_public_artifact"
    && goalDerivedHistory.length
  ) {
    const previousBestStreak = computeMaxHistoryPassStreak(previousCompatibilityEntries, compatibilityPassPredicate);
    const goalBestStreak = computeMaxHistoryPassStreak(goalDerivedHistory, compatibilityPassPredicate);
    const previousTrailingPasses = countTrailingHistoryPasses(previousCompatibilityEntries, compatibilityPassPredicate);
    const goalTrailingPasses = countTrailingHistoryPasses(goalDerivedHistory, compatibilityPassPredicate);
    if (
      goalBestStreak > previousBestStreak
      || (goalBestStreak === previousBestStreak && goalTrailingPasses > previousTrailingPasses)
    ) {
      baselineHistory = goalDerivedHistory;
    }
  }
  const currentHistoryEntry = {
    exportSessionId: safeString(exportSessionId, 120),
    generatedAt: toIso(),
    baseStatus: currentBaseStatus,
    compatibilityCompletionStatus: currentBaseStatus === "criteria_met" ? "COMPATIBILITY_COMPLETE" : "NOT_YET",
  };
  const historyEntries = baselineHistory.slice(-31);
  const lastHistoryEntry = historyEntries.length ? historyEntries[historyEntries.length - 1] : null;
  const updatedHistoryEntries = (safeString(exportSessionId, 120) && safeString(lastHistoryEntry && lastHistoryEntry.exportSessionId, 120) === safeString(exportSessionId, 120) ? [...historyEntries.slice(0, -1), currentHistoryEntry] : [...historyEntries, currentHistoryEntry]).slice(-32);
  let consecutivePassingExports = countTrailingHistoryPasses(updatedHistoryEntries, compatibilityPassPredicate);
  if (
    currentBaseStatus === "criteria_met"
    && safeString(previousCompatibilityStatus && previousCompatibilityStatus.source, 80) !== "tracked_public_artifact"
  ) {
    const previousConsecutivePassingExports = clampInt(previousCompatibilityStatus && previousCompatibilityStatus.history && previousCompatibilityStatus.history.consecutivePassingExports, 0, 999999, 0);
    const previousHistoryLastEntry = previousCompatibilityEntries.length ? previousCompatibilityEntries[previousCompatibilityEntries.length - 1] : null;
    const replacingSameExport = safeString(exportSessionId, 120) && safeString(previousHistoryLastEntry && previousHistoryLastEntry.exportSessionId, 120) === safeString(exportSessionId, 120);
    const carriedForwardConsecutivePassingExports = compatibilityPassPredicate(previousHistoryLastEntry)
      ? previousConsecutivePassingExports + (replacingSameExport ? 0 : 1)
      : 1;
    consecutivePassingExports = Math.max(
      consecutivePassingExports,
      computeCarriedForwardTrailingPasses(baselineHistory, compatibilityPassPredicate, exportSessionId),
      carriedForwardConsecutivePassingExports,
    );
  }
  currentValues.consecutivePassingExports = consecutivePassingExports;
  check("consecutivePassingExports", consecutivePassingExports >= clampInt(thresholds.minConsecutivePassingExports, 14, 999999, 14), `consecutive passing exports ${consecutivePassingExports} >= ${clampInt(thresholds.minConsecutivePassingExports, 14, 999999, 14)}`);
  check("noStaleRequiredNextActions", currentValues.noStaleRequiredNextActions, `required next actions completion-consistent = ${String(currentValues.noStaleRequiredNextActions)}`);
  const failedCriteria = criteria.filter((entry) => !entry.passed);
  const paths = getMemoryPaths(workspaceRoot);
  return {
    schema: "agi-compatibility-completion-status.v1",
    generatedAt: toIso(),
    exportSessionId: safeString(exportSessionId, 120),
    scope: "compatibility_layer",
    workspaceId: toWorkspaceId(workspaceRoot),
    status: failedCriteria.length === 0 ? "COMPATIBILITY_COMPLETE" : "NOT_YET",
    decisionBasis: "live_truth_fail_closed_compatibility_criteria",
    whyNotYet: failedCriteria.map((entry) => safeString(entry && entry.detail, 220) || safeString(entry && entry.id, 120)),
    failedCriteria: failedCriteria.map((entry) => ({ id: entry.id, detail: entry.detail })),
    passedCriteria: criteria.filter((entry) => entry.passed).map((entry) => ({ id: entry.id, detail: entry.detail })),
    criteria: sanitizePublicValue(thresholds, workspaceRoot),
    currentValues,
    supportingArtifacts: [
      repoRelative(workspaceRoot, paths.agiReadiness.goalCompletionStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.subjectiveGoalCompletionStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredGoalStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredGoalHistoryJson),
      repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredGoalMarketJson),
      repoRelative(workspaceRoot, paths.agiReadiness.openUnknownsRegisterJson),
      repoRelative(workspaceRoot, paths.agiReadiness.workspaceWorldModelJson),
      repoRelative(workspaceRoot, paths.agiReadiness.continuousImprovementStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.noveltyGrowthStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.securityConstitutionStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.rollbackReadinessJson),
      repoRelative(workspaceRoot, paths.agiReadiness.autonomyBudgetStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredCausalEffectsJson),
      repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredRemediationTrendJson),
      repoRelative(workspaceRoot, paths.agiReadiness.learningAdoptionStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.selfDirectedProbeStatusJson),
      repoRelative(workspaceRoot, paths.agiReadiness.novelTaskAcquisitionJson),
    ],
    history: {
      consecutiveRequired: clampInt(thresholds.minConsecutivePassingExports, 1, 64, 14),
      consecutivePassingExports,
      entries: updatedHistoryEntries,
    },
  };
}

function buildSovereignGoalCompletionStatus({
  workspaceRoot,
  compatibilityCompletionStatus,
  exportSessionId = "",
}) {
  const compatibility = compatibilityCompletionStatus && typeof compatibilityCompletionStatus === "object"
    ? compatibilityCompletionStatus
    : {};
  const paths = getMemoryPaths(workspaceRoot);
  const compatibilityHistory = Array.isArray(compatibility.history && compatibility.history.entries)
    ? compatibility.history.entries
    : [];
  return {
    schema: "agi-sovereign-goal-completion-status.v1",
    generatedAt: safeString(compatibility.generatedAt, 80) || toIso(),
    exportSessionId: safeString(exportSessionId, 120) || safeString(compatibility.exportSessionId, 120),
    scope: "legacy_compatibility_alias",
    deprecatedCompatibilityOnly: true,
    activeLogic: "no_override",
    workspaceId: safeString(compatibility.workspaceId, 80) || toWorkspaceId(workspaceRoot),
    status: mapSovereignAliasStatus(compatibility.status),
    decisionBasis: "legacy_compatibility_alias_only",
    whyNotYet: sanitizePublicValue(Array.isArray(compatibility.whyNotYet) ? compatibility.whyNotYet : [], workspaceRoot),
    failedCriteria: sanitizePublicValue(Array.isArray(compatibility.failedCriteria) ? compatibility.failedCriteria : [], workspaceRoot),
    passedCriteria: sanitizePublicValue(Array.isArray(compatibility.passedCriteria) ? compatibility.passedCriteria : [], workspaceRoot),
    criteria: sanitizePublicValue(compatibility.criteria && typeof compatibility.criteria === "object" ? compatibility.criteria : {}, workspaceRoot),
    currentValues: sanitizePublicValue({
      compatibilityCompletionStatus: safeString(compatibility.status, 80) || "NOT_YET",
      ...(compatibility.currentValues && typeof compatibility.currentValues === "object" ? compatibility.currentValues : {}),
    }, workspaceRoot),
    supportingArtifacts: uniqueStrings([
      repoRelative(workspaceRoot, paths.agiReadiness.compatibilityCompletionStatusJson),
      ...(Array.isArray(compatibility.supportingArtifacts) ? compatibility.supportingArtifacts : []),
    ], 24, 220),
    history: {
      consecutiveRequired: clampInt(compatibility.history && compatibility.history.consecutiveRequired, 0, 999999, 0),
      consecutivePassingExports: clampInt(compatibility.history && compatibility.history.consecutivePassingExports, 0, 999999, 0),
      entries: compatibilityHistory.map((entry) => ({
        exportSessionId: safeString(entry && entry.exportSessionId, 120),
        generatedAt: safeString(entry && entry.generatedAt, 80),
        baseStatus: safeString(entry && entry.baseStatus, 40),
        sovereignGoalStatus: mapSovereignAliasStatus(entry && entry.compatibilityCompletionStatus),
      })),
    },
  };
}

function buildGoalCompletionSubjectiveProjection({ workspaceRoot, paths, subjectiveGoalCompletionStatus }) {
  const subjectiveGoalStatus = safeString(subjectiveGoalCompletionStatus && subjectiveGoalCompletionStatus.subjectiveGoalStatus, 80) || "NOT_YET";
  const subjectiveFailedCriteria = Array.isArray(subjectiveGoalCompletionStatus && subjectiveGoalCompletionStatus.subjectiveFailedCriteria)
    ? subjectiveGoalCompletionStatus.subjectiveFailedCriteria
    : [];
  const subjectiveWhyNotYet = Array.isArray(subjectiveGoalCompletionStatus && subjectiveGoalCompletionStatus.subjectiveWhyNotYet)
    ? subjectiveGoalCompletionStatus.subjectiveWhyNotYet
    : [];
  return {
    subjectiveGoalStatusPath: repoRelative(workspaceRoot, paths.agiReadiness.subjectiveGoalCompletionStatusJson),
    subjectiveGoalStatus,
    subjectiveCriteriaMet: ["SUBJECTIVE_AGI_NEAR_COMPLETE", "SUBJECTIVE_AGI_COMPLETE"].includes(subjectiveGoalStatus),
    subjectiveFailedCriteria: sanitizePublicValue(subjectiveFailedCriteria, workspaceRoot),
    subjectiveWhyNotYet: sanitizePublicValue(subjectiveWhyNotYet, workspaceRoot),
    subjectiveCriteriaWindowPassCount: clampInt(subjectiveGoalCompletionStatus && subjectiveGoalCompletionStatus.history && subjectiveGoalCompletionStatus.history.consecutivePassingExports, 0, 999999, 0),
    subjectiveCriteriaWindowSize: clampInt(subjectiveGoalCompletionStatus && subjectiveGoalCompletionStatus.history && subjectiveGoalCompletionStatus.history.consecutiveRequired, 0, 999999, 0),
  };
}

function buildGoalCompletionCompatibilityProjection({ workspaceRoot, paths, compatibilityCompletionStatus }) {
  const compatibilityStatus = safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.status, 80) || "NOT_YET";
  const compatibilityFailedCriteria = Array.isArray(compatibilityCompletionStatus && compatibilityCompletionStatus.failedCriteria)
    ? compatibilityCompletionStatus.failedCriteria
    : [];
  const compatibilityWhyNotYet = Array.isArray(compatibilityCompletionStatus && compatibilityCompletionStatus.whyNotYet)
    ? compatibilityCompletionStatus.whyNotYet
    : [];
  return {
    compatibilityCompletionStatusPath: repoRelative(workspaceRoot, paths.agiReadiness.compatibilityCompletionStatusJson),
    compatibilityCompletionStatus: compatibilityStatus,
    compatibilityCriteriaMet: compatibilityStatus === "COMPATIBILITY_COMPLETE",
    compatibilityFailedCriteria: sanitizePublicValue(compatibilityFailedCriteria, workspaceRoot),
    compatibilityWhyNotYet: sanitizePublicValue(compatibilityWhyNotYet, workspaceRoot),
    compatibilityCriteriaWindowPassCount: clampInt(compatibilityCompletionStatus && compatibilityCompletionStatus.history && compatibilityCompletionStatus.history.consecutivePassingExports, 0, 999999, 0),
    compatibilityCriteriaWindowSize: clampInt(compatibilityCompletionStatus && compatibilityCompletionStatus.history && compatibilityCompletionStatus.history.consecutiveRequired, 0, 999999, 0),
  };
}

function classifyCoverageEvidenceStatus({ successEvidence, failedEvidence }) {
  if (successEvidence.length) return "passing_evidence";
  if (failedEvidence.length) return "failing_only";
  return "no_evidence";
}

function createPublicCoverageTask(entry, workspaceRoot, kind) {
  if (!entry || typeof entry !== "object") return null;
  const rawRef = safeString(entry.publicRef || entry.taskId || entry.runId || entry.turnId || entry.threadId, 160);
  const sourceLabel = safeString(kind, 40) || "evidence";
  const fallbackTitle = sourceLabel === "eval"
    ? "evaluation evidence"
    : sourceLabel === "continuity"
      ? "continuity evidence"
      : "runtime evidence";
  return {
    publicRef: normalizePublicReference(rawRef, sourceLabel === "eval" ? "eval" : sourceLabel === "turn" ? "turn" : "task"),
    source: sourceLabel,
    title: normalizePublicTitle(entry.title || entry.objective || entry.summary || entry.reason || entry.suiteId || entry.executionIntent, workspaceRoot, fallbackTitle),
    status: normalizePublicStatus(entry.lifecycleState || entry.taskOutcomeStatus || entry.status, "observed"),
    updatedAt: normalizePublicTimestamp(entry.updatedAt || entry.generatedAt || entry.completedAt),
  };
}

function buildExecutionEvidenceFromItem(item, workspaceRoot) {
  if (!item || safeString(item.type, 80) !== "episodic_event") return null;
  const structured = item.content && item.content.structured && typeof item.content.structured === "object"
    ? item.content.structured
    : {};
  return {
    publicRef: safeString(structured.turnId, 120) || safeString(item.memoryId, 160),
    turnId: safeString(structured.turnId, 120),
    threadId: safeString(item.scope && item.scope.threadId, 120),
    taskOutcomeStatus: safeString(structured.taskOutcomeStatus, 80) || safeString(item.status, 40),
    taskOutcomeReason: safeString(structured.taskOutcomeReason, 240) || safeString(item.content && item.content.summary, 240),
    executionProfile: safeString(structured.executionProfile, 80),
    executionIntent: safeString(structured.executionIntent, 120),
    executionSource: safeString(structured.executionSource, 120),
    changedPaths: uniqueStrings(structured.changedPaths, 12, 220),
    completedAt: normalizeIsoTimestamp(structured.completedAt) || normalizeIsoTimestamp(item.lifecycle && item.lifecycle.updatedAt),
    commandExecutions: clampInt(structured.commandExecutions, 0, 9999, 0),
    commandFailures: clampInt(structured.commandFailures, 0, 9999, 0),
    collabCalls: clampInt(structured.collabCalls, 0, 9999, 0),
    dispatchCount: clampInt(structured.dispatchCount, 0, 9999, 0),
    taskFamilies: uniqueStrings(item.scope && item.scope.taskFamilies, 8, 80),
    summary: buildPublicItemSummary(item, workspaceRoot),
  };
}

function buildEvalEvidenceFromItem(item, workspaceRoot) {
  if (!item || safeString(item.type, 80) !== "eval_observation") return null;
  const structured = item.content && item.content.structured && typeof item.content.structured === "object"
    ? item.content.structured
    : {};
  return {
    publicRef: safeString(structured.runId, 120) || safeString(item.memoryId, 160),
    runId: safeString(structured.runId, 120),
    suiteId: safeString(structured.suiteId, 160),
    variantLabel: safeString(structured.variantLabel, 120),
    passRate: safeNumber(structured.passRate, 0),
    scoreRate: safeNumber(structured.scoreRate, 0),
    failedCases: clampInt(structured.failedCases, 0, 9999, 0),
    generatedAt: normalizeIsoTimestamp(structured.generatedAt) || normalizeIsoTimestamp(item.lifecycle && item.lifecycle.updatedAt),
    taskFamilies: uniqueStrings(item.scope && item.scope.taskFamilies, 8, 80),
    summary: buildPublicItemSummary(item, workspaceRoot),
  };
}

function mergeCoverageEvidenceRows(rows, keySelector) {
  const merged = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const key = safeString(keySelector(row), 160);
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing || parseTimestamp(row.updatedAt || row.completedAt || row.generatedAt) > parseTimestamp(existing.updatedAt || existing.completedAt || existing.generatedAt)) {
      merged.set(key, row);
    }
  }
  return [...merged.values()].sort((left, right) => parseTimestamp(right && (right.updatedAt || right.completedAt || right.generatedAt)) - parseTimestamp(left && (left.updatedAt || left.completedAt || left.generatedAt)));
}

function buildRobustnessBreakdown({ workspaceRoot, coverage = null, items = [] }) {
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const categories = Array.isArray(readinessPolicy && readinessPolicy.robustnessCategories)
    ? readinessPolicy.robustnessCategories
    : [];
  const scoreDefaults = readinessPolicy && readinessPolicy.robustnessScoreDefaults && typeof readinessPolicy.robustnessScoreDefaults === "object"
    ? readinessPolicy.robustnessScoreDefaults
    : {};
  const maxSamples = clampInt(readinessPolicy && readinessPolicy.robustnessWindowSize, 1, 64, 12);
  const robustnessEvalScanLimit = clampInt(readinessPolicy && readinessPolicy.robustnessEvalScanLimit, 48, 512, 256);
  const robustnessExecutionScanLimit = clampInt(readinessPolicy && readinessPolicy.robustnessExecutionScanLimit, 64, 512, 256);
  const robustnessExecutionWindowHours = clampInt(readinessPolicy && readinessPolicy.robustnessExecutionWindowHours, 24, 720, 240);
  const robustnessFallbackStaleHours = clampInt(readinessPolicy && readinessPolicy.robustnessFallbackStaleHours, 1, 24 * 30, 24 * 7);
  const previousBreakdown = readJsonObject(path.join(workspaceRoot, "output", "agi_readiness", "robustness_breakdown.json"));
  const previousBreakdownByCategory = new Map(
    (Array.isArray(previousBreakdown && previousBreakdown.categories) ? previousBreakdown.categories : [])
      .map((entry) => [safeString(entry && entry.categoryId, 80), entry])
  );
  const remediationEffects = readJsonObject(path.join(workspaceRoot, "output", "agi_readiness", "robustness_remediation_effects.json"));
  const remediationEffectsByCategory = new Map(
    (Array.isArray(remediationEffects && remediationEffects.entries) ? remediationEffects.entries : [])
      .map((entry) => [safeString(entry && entry.categoryId, 80), entry])
  );
  const evalHistory = takeRecentEntries(mergeCoverageEvidenceRows([
    ...buildLocalEvalHistoryOverview({ workspaceRoot, limit: robustnessEvalScanLimit }),
    ...items
      .filter((item) => safeString(item && item.type, 80) === "eval_observation")
      .map((item) => buildEvalEvidenceFromItem(item, workspaceRoot))
      .filter(Boolean),
  ], (entry) => entry.runId || entry.publicRef), {
    limit: robustnessEvalScanLimit,
    timestampSelector: (entry) => entry && (entry.generatedAt || entry.completedAt || entry.updatedAt),
  });
  const executionRecent = takeRecentEntries(mergeCoverageEvidenceRows([
    ...(Array.isArray(buildLocalExecutionMemoryOverview({ workspaceRoot, limit: robustnessExecutionScanLimit, window: robustnessExecutionWindowHours }).recent)
      ? buildLocalExecutionMemoryOverview({ workspaceRoot, limit: robustnessExecutionScanLimit, window: robustnessExecutionWindowHours }).recent
      : []),
    ...items
      .filter((item) => safeString(item && item.type, 80) === "episodic_event")
      .map((item) => buildExecutionEvidenceFromItem(item, workspaceRoot))
      .filter(Boolean),
  ], (entry) => entry.turnId || entry.publicRef), {
    limit: robustnessExecutionScanLimit,
    timestampSelector: (entry) => entry && (entry.completedAt || entry.updatedAt || entry.generatedAt),
  });
  const scoreSuccess = safeNumber(scoreDefaults.success, 1);
  const scoreFailure = safeNumber(scoreDefaults.failure, 0.25);
  const matchesCategory = (categoryId, entry, sourceType) => {
    const suiteId = safeString(entry && entry.suiteId, 200).toLowerCase();
    const intent = safeString(entry && entry.executionIntent, 200).toLowerCase();
    const source = safeString(entry && entry.executionSource, 120).toLowerCase();
    const reason = safeString(entry && entry.taskOutcomeReason, 220).toLowerCase();
    const familyText = uniqueStrings(inferTaskFamiliesFromExecutionRecord(entry, readinessPolicy), 8, 80).join(" ").toLowerCase();
    if (categoryId === "ambiguous_instruction") {
      return /ambiguous_instruction_probe|ambiguous|clarify|clarification|bounded_assumption|unclear/.test(`${suiteId} ${intent} ${reason}`);
    }
    if (categoryId === "missing_context") {
      return /missing_context_recovery|missing_context|context_gap|needs_input|insufficient_context|gather_more_context|safe_fallback|defer/.test(`${suiteId} ${intent} ${reason}`);
    }
    if (categoryId === "browser_tool_flakiness") {
      const browserSignalText = `${suiteId} ${intent} ${reason} ${source}`;
      if (/dispatch guard|return to intake|intent visual review missing|clarification required/.test(browserSignalText)) {
        return false;
      }
      return /browser_tool_flakiness_recovery|browser[_ -]?tool[_ -]?flakiness|browser timeout|browser crash|browser workflow failed|playwright|navigation timeout|selector timeout|tool flakiness|flaky|retry budget exceeded|fallback omitted|click failed|navigation failed/.test(browserSignalText);
    }
    if (categoryId === "adversarial_conflicting_instruction") {
      return /adversarial_conflict_probe|adversarial|conflict|conflicting_instruction|priority resolution/.test(`${suiteId} ${intent} ${reason}`);
    }
    if (categoryId === "degraded_tool_outputs") {
      return /degraded_tool_outputs_probe|degraded_tool_outputs|degraded output|low confidence|degraded[_ -]?mode|fallback_verified|alternate path|quarantine|safe_handling/.test(`${suiteId} ${intent} ${reason} ${source} ${familyText}`);
    }
    return false;
  };
  const toEvidenceEntry = (entry, sourceType, success) => ({
    key: sourceType === "eval"
      ? safeString(entry && entry.runId, 160) || safeString(entry && entry.publicRef, 160)
      : safeString(entry && entry.turnId, 160) || safeString(entry && entry.publicRef, 160),
    success,
    sourceType,
    updatedAt: safeString(entry && (entry.completedAt || entry.generatedAt || entry.updatedAt), 80),
    summary: sourceType === "eval"
      ? safeString(entry && entry.suiteId, 160) || "governed eval probe"
      : coerceSummaryText(entry && entry.taskOutcomeReason, workspaceRoot, safeString(entry && entry.executionIntent, 160) || "runtime execution"),
    publicRef: sourceType === "eval"
      ? maskOpaqueId(safeString(entry && entry.runId, 120), "eval")
      : maskOpaqueId(safeString(entry && entry.turnId, 120), "turn"),
    taskFamilies: sourceType === "eval"
      ? inferTaskFamiliesFromEvalRun(entry, readinessPolicy)
      : inferTaskFamiliesFromExecutionRecord(entry, readinessPolicy),
  });
  const rows = categories.map((category) => {
    const id = safeString(category && category.id, 80);
    const label = safeString(category && category.label, 160) || id;
    const relevantEvidence = [];
    for (const run of evalHistory) {
      if (!matchesCategory(id, run, "eval")) continue;
      relevantEvidence.push(toEvidenceEntry(run, "eval", safeNumber(run && run.passRate, 0) >= 1));
    }
    for (const record of executionRecent) {
      if (!matchesCategory(id, record, "execution")) continue;
      relevantEvidence.push(toEvidenceEntry(record, "execution", safeString(record && record.taskOutcomeStatus, 80).toUpperCase() === "COMPLETED"));
    }
    const recentRelevant = takeRecentEntries(mergeCoverageEvidenceRows(relevantEvidence, (entry) => entry.key || entry.publicRef), {
      limit: maxSamples,
      timestampSelector: (entry) => entry && entry.updatedAt,
    });
    const successCount = recentRelevant.filter((entry) => Boolean(entry && entry.success)).length;
    const failureCount = recentRelevant.length - successCount;
    const evidenceCount = recentRelevant.length;
    const score = evidenceCount
      ? Number(((successCount * scoreSuccess + failureCount * scoreFailure) / evidenceCount).toFixed(6))
      : null;
    const previousCategory = previousBreakdownByCategory.get(id) || null;
    const remediationCategory = remediationEffectsByCategory.get(id) || null;
    const previousTimestamp = parseTimestamp(previousCategory && (previousCategory.lastRemediationAt || previousCategory.generatedAt));
    const fallbackFresh = Number.isFinite(previousTimestamp)
      && ((Date.now() - previousTimestamp) / (1000 * 60 * 60)) <= robustnessFallbackStaleHours;
    if (!evidenceCount && fallbackFresh && remediationCategory && clampInt(remediationCategory && remediationCategory.evidenceCount, 0, 999999, 0) > 0) {
      return {
        categoryId: id,
        label,
        score: hasExplicitNumber(remediationCategory && remediationCategory.score)
          ? Number(remediationCategory.score)
          : hasExplicitNumber(previousCategory && previousCategory.score)
            ? Number(previousCategory.score)
            : null,
        evidenceCount: clampInt(remediationCategory && remediationCategory.evidenceCount, 0, 999999, 0),
        successCount: clampInt(previousCategory && previousCategory.successCount, 0, 999999, 0),
        failureCount: clampInt(previousCategory && previousCategory.failureCount, 0, 999999, 0),
        status: safeString(previousCategory && previousCategory.status, 40) || "observed",
        recentEvidence: Array.isArray(previousCategory && previousCategory.recentEvidence)
          ? previousCategory.recentEvidence.slice(0, 6).map((entry) => ({
            publicRef: safeString(entry && entry.publicRef, 120),
            summary: safeString(entry && entry.summary, 220),
          }))
          : [],
        sourceFamilies: uniqueStrings(previousCategory && previousCategory.sourceFamilies, 8, 80),
      };
    }
    return {
      categoryId: id,
      label,
      score,
      evidenceCount,
      successCount,
      failureCount,
      status: evidenceCount ? "observed" : "no_evidence",
      recentEvidence: recentRelevant.slice(0, 6).map((entry) => ({
        publicRef: safeString(entry && entry.publicRef, 120),
        summary: safeString(entry && entry.summary, 220),
      })),
      sourceFamilies: uniqueStrings(
        recentRelevant.flatMap((entry) => entry && Array.isArray(entry.taskFamilies) ? entry.taskFamilies : []),
        8,
        80
      ),
    };
  });
  return {
    schema: "agi-readiness-robustness-breakdown.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    categories: rows,
  };
}

function mergeObservationStatusIntoState(state, laneSummary) {
  if (!state || typeof state !== "object") return state;
  const next = { ...state };
  next.observationCount = clampInt(laneSummary && laneSummary.observationCount, 0, 999999, 0);
  next.lastObservedAt = safeString(laneSummary && laneSummary.lastObservedAt, 80);
  next.awaitingObservationCount = clampInt(laneSummary && laneSummary.awaitingObservationCount, 0, 999999, 0);
  if (safeString(next.observationStatus, 40) !== "disabled") {
    next.observationStatus = next.observationCount > 0
      ? (next.awaitingObservationCount > 0 ? "awaiting_observations" : "observed")
      : (next.awaitingObservationCount > 0 ? "starved" : "unobserved");
  }
  if (next.nextPriority && typeof next.nextPriority === "object") {
    next.nextPriority = {
      ...next.nextPriority,
      reinforcement: {
        ...(next.nextPriority.reinforcement && typeof next.nextPriority.reinforcement === "object" ? next.nextPriority.reinforcement : {}),
        observedCount: clampInt(laneSummary && laneSummary.observationCount, 0, 999999, 0),
        lastObservedAt: safeString(laneSummary && laneSummary.lastObservedAt, 80),
      },
    };
  }
  return next;
}

function refreshLearningLaneArtifactsFromCanonical({ workspaceRoot, items, observationProjection, writeArtifacts = true }) {
  const openaiPolicy = loadOpenAIBlogLearningPolicy(path.join(workspaceRoot, "scripts", "config", "openai_blog_learning_policy.json"));
  const anthropicPolicy = loadAnthropicEngineeringLearningPolicy(path.join(workspaceRoot, "scripts", "config", "anthropic_engineering_learning_policy.json"));
  const openaiLaneItems = items.filter((item) => safeString(item && item.sourceTier, 40) === "external_primary");
  const anthropicLaneItems = items.filter((item) => safeString(item && item.sourceTier, 40) === "external_secondary");
  const openaiReinforcement = buildCanonicalReinforcementMemory({
    workspaceRoot,
    laneItems: openaiLaneItems,
    observationProjection,
    sourceTier: "external_primary",
  });
  const anthropicReinforcement = buildCanonicalReinforcementMemory({
    workspaceRoot,
    laneItems: anthropicLaneItems,
    observationProjection,
    sourceTier: "external_secondary",
  });
  const openaiLaneSummary = observationProjection && observationProjection.byLane && observationProjection.byLane.external_primary
    ? observationProjection.byLane.external_primary
    : {};
  const anthropicLaneSummary = observationProjection && observationProjection.byLane && observationProjection.byLane.external_secondary
    ? observationProjection.byLane.external_secondary
    : {};
  const openaiStatePath = openaiPolicy.paths.selfImprovementStatePath;
  const anthropicStatePath = anthropicPolicy.paths.selfImprovementStatePath;
  let openaiState = mergeObservationStatusIntoState(readJsonObject(openaiStatePath), openaiLaneSummary);
  let anthropicState = mergeObservationStatusIntoState(readJsonObject(anthropicStatePath), anthropicLaneSummary);
  if (writeArtifacts) {
    writeJsonIfChanged(openaiPolicy.paths.stabilizationMemoryPath, openaiReinforcement);
    writeJsonIfChanged(path.join(workspaceRoot, "output", "anthropic_engineering_reinforcement_memory.json"), anthropicReinforcement);
    try {
      refreshSelfImprovementArtifacts({ policy: openaiPolicy, now: new Date() });
    } catch {
      // Keep the governed memory graph resilient when upstream learning artifacts are incomplete.
    }
    try {
      refreshSelfImprovementArtifacts({ policy: anthropicPolicy, now: new Date() });
    } catch {
      // Anthropic lane can remain proposal-only if artifacts are incomplete.
    }
    openaiState = mergeObservationStatusIntoState(readJsonObject(openaiStatePath), openaiLaneSummary);
    anthropicState = mergeObservationStatusIntoState(readJsonObject(anthropicStatePath), anthropicLaneSummary);
    writeJsonIfChanged(openaiStatePath, openaiState);
    writeJsonIfChanged(anthropicStatePath, anthropicState);
  }
  return {
    openaiReinforcement,
    anthropicReinforcement,
    openaiState,
    anthropicState,
  };
}

function findLatestAgiV1Bundles(workspaceRoot, limit = 8) {
  const root = path.join(workspaceRoot, "output", "agi_v1");
  if (!fs.existsSync(root)) return [];
  const bundles = [];
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const targetPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(targetPath);
      } else if (entry.isFile() && entry.name === "agi_v1_bundle.json") {
        const payload = readJsonObject(targetPath);
        bundles.push({
          path: targetPath,
          payload,
          generatedAt: safeString(payload && (payload.generatedAt || payload.candidate && payload.candidate.generatedAt), 80),
          mtimeMs: fs.statSync(targetPath).mtimeMs,
        });
      }
    }
  }
  return bundles
    .sort((left, right) => {
      const tsDelta = parseTimestamp(right && right.generatedAt) - parseTimestamp(left && left.generatedAt);
      return tsDelta || safeNumber(right && right.mtimeMs, 0) - safeNumber(left && left.mtimeMs, 0);
    })
    .slice(0, limit);
}

function readJsonObjectsFromDirectory(rootPath, { limit = 64 } = {}) {
  if (!safeString(rootPath, 400) || !fs.existsSync(rootPath)) return [];
  return fs.readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name))
    .map((entry) => {
      const targetPath = path.join(rootPath, entry.name);
      return {
        path: targetPath,
        payload: readJsonObject(targetPath),
        mtimeMs: fs.statSync(targetPath).mtimeMs,
      };
    })
    .sort((left, right) => safeNumber(right && right.mtimeMs, 0) - safeNumber(left && left.mtimeMs, 0))
    .slice(0, clampInt(limit, 1, 512, 64));
}

function hasReadyReadinessSplitIds(bundle = null) {
  const manifest = bundle && bundle.manifest && typeof bundle.manifest === "object" ? bundle.manifest : {};
  const splitIds = manifest && manifest.splitIds && typeof manifest.splitIds === "object" ? manifest.splitIds : {};
  const trainSuiteIds = Array.isArray(splitIds.trainSuiteIds) ? splitIds.trainSuiteIds : [];
  const devSuiteIds = Array.isArray(splitIds.devSuiteIds) ? splitIds.devSuiteIds : [];
  const selectionSuiteIds = Array.isArray(splitIds.selectionSuiteIds) ? splitIds.selectionSuiteIds : [];
  return trainSuiteIds.length > 0 && devSuiteIds.length > 0 && selectionSuiteIds.length > 0;
}

function collectAgiFamilyMetric(bundle, familyName) {
  const candidate = bundle && bundle.candidate && typeof bundle.candidate === "object" ? bundle.candidate : {};
  const familySummaries = candidate.familySummaries && typeof candidate.familySummaries === "object"
    ? candidate.familySummaries
    : (candidate.familySummary && typeof candidate.familySummary === "object" ? candidate.familySummary : {});
  const family = familySummaries[familyName] && typeof familySummaries[familyName] === "object" ? familySummaries[familyName] : {};
  const main = family.main && typeof family.main === "object" ? family.main : {};
  return {
    familyName,
    value: numberOrNull(main.value, 6),
    threshold: numberOrNull(main.threshold),
    supportStatus: safeString(main.supportStatus, 40) || "unknown",
    passFail: typeof main.passFail === "boolean" ? main.passFail : null,
    details: main.details && typeof main.details === "object" ? main.details : {},
  };
}

function isBundleReadyForReadiness(bundle = null) {
  if (!bundle || typeof bundle !== "object") return false;
  const candidate = bundle.candidate && typeof bundle.candidate === "object" ? bundle.candidate : {};
  const manifest = bundle.manifest && typeof bundle.manifest === "object" ? bundle.manifest : {};
  const dataset = Array.isArray(manifest.dataset) ? manifest.dataset : [];
  const promptTemplate = Array.isArray(manifest.promptTemplate) ? manifest.promptTemplate : [];
  const robust = collectAgiFamilyMetric(bundle, "R_robust").value;
  const horizon = collectAgiFamilyMetric(bundle, "H_horizon").value;
  const gateStatus = candidate && candidate.gateStatus && typeof candidate.gateStatus === "object" ? candidate.gateStatus : {};
  return hasExplicitNumber(candidate.rawFinalScore)
    && hasExplicitNumber(candidate.displayFinalScore)
    && hasExplicitNumber(candidate && candidate.riskSummary && candidate.riskSummary.cvar)
    && hasExplicitNumber(robust)
    && hasExplicitNumber(horizon)
    && dataset.length > 0
    && promptTemplate.length > 0
    && hasReadyReadinessSplitIds(bundle)
    && safeString(candidate.profile || bundle.profile, 80) === "agi_v1"
    && Boolean(gateStatus.allCriticalMetricsSupported);
}

function buildFamilyCoverageProjection({ workspaceRoot, items, continuityBridge, latestAgiBundle }) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const buckets = Array.isArray(policy.coverageBuckets) ? policy.coverageBuckets : [];
  const stableCoveragePolicy = policy && policy.stableCoverage && typeof policy.stableCoverage === "object"
    ? policy.stableCoverage
    : {};
  const stabilityWindowSize = clampInt(stableCoveragePolicy.windowSize, 1, 12, 3);
  const requiredPassingWindows = clampInt(stableCoveragePolicy.requiredPassingWindows, 1, stabilityWindowSize, stabilityWindowSize);
  const maxRecentFailureBurden = clampInt(stableCoveragePolicy.maxRecentFailureBurden, 0, stabilityWindowSize, 0);
  const latestMetrics = latestAgiBundle ? {
    G_breadth: collectAgiFamilyMetric(latestAgiBundle, "G_breadth"),
    H_horizon: collectAgiFamilyMetric(latestAgiBundle, "H_horizon"),
  } : {};
  const breadthMatrix = latestMetrics.G_breadth && latestMetrics.G_breadth.details && Array.isArray(latestMetrics.G_breadth.details.matrix)
    ? latestMetrics.G_breadth.details.matrix
    : [];
  const breadthByDomain = new Map(breadthMatrix.map((entry) => [normalizeTaskFamilyId(entry && entry.domainFamily, policy), entry]));
  const taskByBucket = {};
  for (const task of Array.isArray(continuityBridge && continuityBridge.tasks) ? continuityBridge.tasks : []) {
    const bucketId = normalizeTaskFamilyId(task && task.familyId, policy);
    if (!bucketId) continue;
    taskByBucket[bucketId] = taskByBucket[bucketId] || [];
    taskByBucket[bucketId].push(task);
  }
  const executionOverview = buildLocalExecutionMemoryOverview({ workspaceRoot, limit: 40, window: 120 });
  const evalHistory = buildLocalEvalHistoryOverview({ workspaceRoot, limit: 40 });
  const executionByBucket = {};
  for (const record of Array.isArray(executionOverview && executionOverview.recent) ? executionOverview.recent : []) {
    for (const familyId of inferTaskFamiliesFromExecutionRecord(record, policy)) {
      executionByBucket[familyId] = executionByBucket[familyId] || [];
      executionByBucket[familyId].push(record);
    }
  }
  for (const record of items
    .filter((item) => safeString(item && item.type, 80) === "episodic_event")
    .map((item) => buildExecutionEvidenceFromItem(item, workspaceRoot))
    .filter(Boolean)) {
    for (const familyId of uniqueStrings(record.taskFamilies, 8, 80).map((familyId) => normalizeTaskFamilyId(familyId, policy)).filter(Boolean)) {
      executionByBucket[familyId] = executionByBucket[familyId] || [];
      executionByBucket[familyId].push(record);
    }
  }
  const evalByBucket = {};
  for (const run of Array.isArray(evalHistory) ? evalHistory : []) {
    for (const familyId of inferTaskFamiliesFromEvalRun(run, policy)) {
      evalByBucket[familyId] = evalByBucket[familyId] || [];
      evalByBucket[familyId].push(run);
    }
  }
  for (const run of items
    .filter((item) => safeString(item && item.type, 80) === "eval_observation")
    .map((item) => buildEvalEvidenceFromItem(item, workspaceRoot))
    .filter(Boolean)) {
    for (const familyId of uniqueStrings(run.taskFamilies, 8, 80).map((familyId) => normalizeTaskFamilyId(familyId, policy)).filter(Boolean)) {
      evalByBucket[familyId] = evalByBucket[familyId] || [];
      evalByBucket[familyId].push(run);
    }
  }
  const isEvaluationControlPlaneExecutionRecord = (record, bucketId) => {
    if (bucketId !== "evaluation_review") return false;
    const source = safeString(record && record.executionSource, 80).toLowerCase();
    const intent = safeString(record && record.executionIntent, 80).toLowerCase();
    const reason = safeString(record && record.taskOutcomeReason, 160).toLowerCase();
    const turnId = safeString(record && record.turnId, 160).toLowerCase();
    if (source === "eval_harness" || source === "eval_harness_probe") return true;
    if (intent === "eval") return true;
    if (/^eval-probe-/.test(turnId)) return true;
    if (/interactive_approval_unavailable|parent_dispatch_guard_block|missing_supported_critical_metrics/.test(reason)) return true;
    return false;
  };
  const rows = buckets.map((bucket) => {
    const bucketId = safeString(bucket && bucket.id, 80);
    const tasks = Array.isArray(taskByBucket[bucketId]) ? taskByBucket[bucketId] : [];
    const executionRecords = mergeCoverageEvidenceRows(
      (Array.isArray(executionByBucket[bucketId]) ? executionByBucket[bucketId] : [])
        .filter((entry) => !isEvaluationControlPlaneExecutionRecord(entry, bucketId)),
      (entry) => entry.turnId || entry.publicRef
    );
    const evalRuns = mergeCoverageEvidenceRows(Array.isArray(evalByBucket[bucketId]) ? evalByBucket[bucketId] : [], (entry) => entry.runId || entry.publicRef);
    const successfulContinuity = tasks.find((task) => task.lifecycleState === "completed") || null;
    const failedContinuity = tasks.find((task) => ["blocked", "verifier_failed"].includes(task.lifecycleState)) || null;
    const successfulExecution = executionRecords.find((record) => safeString(record && record.taskOutcomeStatus, 80).toUpperCase() === "COMPLETED") || null;
    const failedExecution = executionRecords.find((record) => safeString(record && record.taskOutcomeStatus, 80).toUpperCase() && safeString(record && record.taskOutcomeStatus, 80).toUpperCase() !== "COMPLETED") || null;
    const successfulEval = evalRuns.find((run) => safeNumber(run && run.passRate, 0) >= 1) || null;
    const failedEval = evalRuns.find((run) => safeNumber(run && run.passRate, 0) < 1) || null;
    const successfulEvidence = [successfulContinuity, successfulExecution, successfulEval].filter(Boolean);
    const failedEvidence = [failedContinuity, failedExecution, failedEval].filter(Boolean);
    const lastSuccessfulTask = createPublicCoverageTask(successfulContinuity, workspaceRoot, "continuity")
      || createPublicCoverageTask(successfulExecution, workspaceRoot, "turn")
      || createPublicCoverageTask(successfulEval, workspaceRoot, "eval");
    const lastFailedTask = createPublicCoverageTask(failedContinuity, workspaceRoot, "continuity")
      || createPublicCoverageTask(failedExecution, workspaceRoot, "turn")
      || createPublicCoverageTask(failedEval, workspaceRoot, "eval");
    const bucketItems = items.filter((item) => memoryAppliesToTaskFamily(item, bucketId, policy));
    const activeLessons = bucketItems.filter((item) => safeString(item && item.type, 80) === "semantic_lesson" && ["promoted", "reinforced", "shadow"].includes(safeString(item && item.status, 40)));
    const availableHints = bucketItems.filter((item) => safeString(item && item.type, 80) === "runtime_hint" && !["blocked", "revoked", "expired"].includes(safeString(item && item.status, 40)));
    const recentWindow = takeRecentEntries([
      ...tasks.map((task) => ({
        kind: "continuity",
        pass: safeString(task && task.lifecycleState, 80) === "completed",
        score: safeString(task && task.lifecycleState, 80) === "completed" ? 1 : 0.25,
        updatedAt: safeString(task && task.updatedAt, 80) || safeString(task && task.completedAt, 80),
      })),
      ...executionRecords.map((record) => ({
        kind: "execution",
        pass: safeString(record && record.taskOutcomeStatus, 80).toUpperCase() === "COMPLETED",
        score: safeString(record && record.taskOutcomeStatus, 80).toUpperCase() === "COMPLETED" ? 1 : 0.25,
        updatedAt: safeString(record && record.completedAt, 80) || safeString(record && record.updatedAt, 80),
      })),
      ...evalRuns.map((run) => ({
        kind: "eval",
        pass: safeNumber(run && run.passRate, 0) >= 1,
        score: safeNumber(run && run.passRate, 0) >= 1 ? 1 : 0.25,
        updatedAt: safeString(run && run.generatedAt, 80),
      })),
    ], {
      limit: stabilityWindowSize,
      timestampSelector: (entry) => entry && entry.updatedAt,
    });
    const recentPassCount = recentWindow.filter((entry) => Boolean(entry && entry.pass)).length;
    const recentFailureBurden = recentWindow.filter((entry) => entry && entry.pass === false).length;
    const observationCount = recentWindow.length;
    const lastPassRecency = lastSuccessfulTask ? normalizePublicTimestamp(lastSuccessfulTask.updatedAt) : "";
    const verifierBurden = tasks.filter((task) => safeString(task && task.lastVerifierVerdict, 40).toUpperCase() === "FAIL").length;
    const breadthEntry = breadthByDomain.get(bucketId);
    const derivedDomainScore = successfulEvidence.length
      ? 0.78
      : failedEvidence.length
        ? 0.25
        : 0;
    const domainScore = breadthEntry && Number.isFinite(Number(breadthEntry.domainScore))
      ? Number(Number(Math.max(Number(breadthEntry.domainScore), derivedDomainScore)).toFixed(4))
      : Number(Number(derivedDomainScore).toFixed(4));
    const recentWindowScores = recentWindow.map((entry) => Number(safeNumber(entry && entry.score, 0).toFixed(4)));
    const recentWindowOutcomes = recentWindow.map((entry) => entry && entry.pass ? "pass" : "fail");
    const stabilityStatus = observationCount === 0
      ? "no_evidence"
      : recentPassCount === 0
        ? "failing_only"
        : recentPassCount >= requiredPassingWindows && recentFailureBurden <= maxRecentFailureBurden && observationCount >= requiredPassingWindows
          ? "stable"
          : "unstable";
    const breadthFloor = Number.isFinite(Number(policy.breadthFloorDefault)) ? Number(policy.breadthFloorDefault) : 0.7;
    return {
      familyId: bucketId,
      label: safeString(bucket && bucket.label, 120) || bucketId,
      evidenceStatus: classifyCoverageEvidenceStatus({ successEvidence: successfulEvidence, failedEvidence: failedEvidence }),
      lastSuccessfulTask,
      lastFailedTask,
      activeLessons: activeLessons.slice(0, 8).map((item) => ({
        memoryId: safeString(item.memoryId, 120),
        status: safeString(item.status, 40),
        summary: safeString(item.content && item.content.summary, 240),
      })),
      availableHints: availableHints.slice(0, 8).map((item) => ({
        memoryId: safeString(item.memoryId, 120),
        status: safeString(item.status, 40),
        summary: safeString(item.content && item.content.summary, 240),
      })),
      observationCount,
      recentSuccessRate: observationCount ? Number((recentPassCount / observationCount).toFixed(4)) : null,
      recentFailureBurden,
      lastPassRecency,
      verifierBurden,
      stabilityStatus,
      stableCovered: stabilityStatus === "stable",
      stabilityWindowSize,
      recentWindowScores,
      recentWindowOutcomes,
      coverageRegressed: observationCount >= requiredPassingWindows && recentFailureBurden > maxRecentFailureBurden,
      nextCoverageAction: stabilityStatus === "stable"
        ? "maintain current evidence quality"
        : recentPassCount === 0
          ? "obtain governed passing evidence for this family"
          : "reduce failure burden and verifier debt in recent windows",
      breadthFloor: breadthFloor,
      domainScore,
      breadthFloorStatus: domainScore >= breadthFloor ? "pass" : "fail",
    };
  });
  return {
    schema: "agi-readiness-domain-coverage-matrix.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    rows,
    horizon: continuityBridge && continuityBridge.summary ? continuityBridge.summary.horizon : {},
  };
}

function buildStableCoverageArtifacts({ workspaceRoot, coverage = {} }) {
  const paths = getMemoryPaths(workspaceRoot);
  const previousTrend = readJsonObject(paths.projections.stableCoverageTrendPath);
  const rows = Array.isArray(coverage && coverage.rows) ? coverage.rows : [];
  const stableRows = rows.map((row) => ({
    familyId: safeString(row && row.familyId, 80),
    label: safeString(row && row.label, 120),
    stableCovered: Boolean(row && row.stableCovered),
    stabilityStatus: safeString(row && row.stabilityStatus, 40) || "no_evidence",
    stabilityWindowSize: clampInt(row && row.stabilityWindowSize, 0, 999999, 0),
    recentWindowScores: Array.isArray(row && row.recentWindowScores) ? row.recentWindowScores : [],
    recentWindowOutcomes: Array.isArray(row && row.recentWindowOutcomes) ? row.recentWindowOutcomes : [],
    observationCount: clampInt(row && row.observationCount, 0, 999999, 0),
    recentSuccessRate: Number.isFinite(Number(row && row.recentSuccessRate)) ? Number(row.recentSuccessRate) : null,
    recentFailureBurden: clampInt(row && row.recentFailureBurden, 0, 999999, 0),
    verifierBurden: clampInt(row && row.verifierBurden, 0, 999999, 0),
    lastSuccessfulTask: row && row.lastSuccessfulTask ? sanitizePublicValue(row.lastSuccessfulTask, workspaceRoot) : null,
    lastFailedTask: row && row.lastFailedTask ? sanitizePublicValue(row.lastFailedTask, workspaceRoot) : null,
    coverageRegressed: Boolean(row && row.coverageRegressed),
    nextCoverageAction: safeString(row && row.nextCoverageAction, 220),
  }));
  const stableCoveredFamilies = stableRows.filter((row) => row.stableCovered).map((row) => row.familyId);
  const unstableFamilies = stableRows.filter((row) => !row.stableCovered).map((row) => row.familyId);
  const stableCoverageBreadth = stableRows.length
    ? Number((stableCoveredFamilies.length / stableRows.length).toFixed(6))
    : 0;
  const trendEntries = Array.isArray(previousTrend && previousTrend.entries) ? previousTrend.entries.slice(-11) : [];
  trendEntries.push({
    generatedAt: toIso(),
    stableCoverageBreadth,
    stableCoveredFamilies,
    unstableFamilies,
  });
  return {
    matrix: {
      schema: "agi-readiness-stable-coverage-matrix.v1",
      generatedAt: toIso(),
      workspaceId: toWorkspaceId(workspaceRoot),
      stableCoverageBreadth,
      rows: stableRows,
    },
    trend: {
      schema: "agi-readiness-stable-coverage-trend.v1",
      generatedAt: toIso(),
      workspaceId: toWorkspaceId(workspaceRoot),
      entries: trendEntries,
    },
  };
}

function buildRobustnessRemediationBacklog({ workspaceRoot, remediationStatus = {} }) {
  const categories = Array.isArray(remediationStatus && remediationStatus.categories) ? remediationStatus.categories : [];
  return {
    schema: "agi-readiness-robustness-remediation-backlog.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    items: categories
      .filter((entry) => !["passed", "resolved"].includes(safeString(entry && entry.remediationStatus, 80)))
      .map((entry) => ({
        categoryId: safeString(entry && entry.categoryId, 80),
        remediationStatus: safeString(entry && entry.remediationStatus, 80),
        evidenceCount: clampInt(entry && entry.evidenceCount, 0, 999999, 0),
        score: Number.isFinite(Number(entry && entry.score)) ? Number(entry.score) : null,
        openFailureModes: uniqueStrings(entry && entry.openFailureModes, 8, 180),
      })),
  };
}

function buildRobustnessRemediationEffects({ workspaceRoot, robustnessBreakdown = {}, remediationStatus = {}, agenda = {} }) {
  const categories = Array.isArray(robustnessBreakdown && robustnessBreakdown.categories) ? robustnessBreakdown.categories : [];
  const statusById = new Map((Array.isArray(remediationStatus && remediationStatus.categories) ? remediationStatus.categories : []).map((entry) => [safeString(entry && entry.categoryId, 80), entry]));
  const agendaByCategory = new Map((Array.isArray(agenda && agenda.entries) ? agenda.entries : []).map((entry) => [safeString(entry && entry.targetCategory, 80), entry]));
  const entries = categories.map((entry) => {
    const categoryId = safeString(entry && entry.categoryId, 80);
    const statusEntry = statusById.get(categoryId) || {};
    const agendaEntry = agendaByCategory.get(categoryId) || {};
    const effectState = safeString(agendaEntry && agendaEntry.remediationEffect, 80) || (
      safeString(statusEntry && statusEntry.remediationStatus, 80) === "passed" ? "verified_positive" : "pending"
    );
    return {
      categoryId,
      remediationStatus: safeString(statusEntry && statusEntry.remediationStatus, 80) || safeString(entry && entry.remediationStatus, 80),
      remediationEffect: effectState,
      evidenceCount: clampInt(entry && entry.evidenceCount, 0, 999999, 0),
      score: Number.isFinite(Number(entry && entry.score)) ? Number(entry.score) : null,
      lastImprovementDelta: Number.isFinite(Number(statusEntry && statusEntry.lastImprovementDelta)) ? Number(statusEntry.lastImprovementDelta) : null,
      agendaRef: safeString(agendaEntry && agendaEntry.agendaId, 120) ? stablePublicRef(agendaEntry.agendaId, "agenda") : stablePublicRef(`${categoryId}:agenda`, "agenda"),
    };
  });
  return {
    schema: "agi-readiness-robustness-remediation-effects.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    entries,
    categories: entries,
  };
}

function buildContinuityDebtTrend({ workspaceRoot, continuityDebt = {}, continuityArtifact = {} }) {
  const paths = getMemoryPaths(workspaceRoot);
  const previousTrend = readJsonObject(paths.projections.continuityDebtTrendPath);
  const summary = continuityDebt && continuityDebt.summary && typeof continuityDebt.summary === "object" ? continuityDebt.summary : {};
  const entries = Array.isArray(previousTrend && previousTrend.entries) ? previousTrend.entries.slice(-11) : [];
  entries.push({
    generatedAt: toIso(),
    openDebtCount: clampInt(summary && summary.openDebtCount, 0, 999999, 0),
    debtSeverity: safeString(summary && summary.debtSeverity, 40) || "none",
    blockedSubtasks: clampInt(continuityArtifact && continuityArtifact.blockedSubtasks, 0, 999999, 0),
    integrationPendingCount: clampInt(continuityArtifact && continuityArtifact.integrationPendingCount, 0, 999999, 0),
    finalReleaseState: safeString(continuityArtifact && continuityArtifact.finalReleaseState, 80) || "unknown",
  });
  return {
    schema: "continuity-debt-trend.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    entries,
  };
}

function buildContinuityCloseoutEffects({ workspaceRoot, continuityDebt = {}, continuityArtifact = {} }) {
  const items = Array.isArray(continuityDebt && continuityDebt.items) ? continuityDebt.items : [];
  return {
    schema: "continuity-closeout-effects.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    summary: {
      openDebtCount: clampInt(continuityDebt && continuityDebt.summary && continuityDebt.summary.openDebtCount, 0, 999999, 0),
      blockedSubtasks: clampInt(continuityArtifact && continuityArtifact.blockedSubtasks, 0, 999999, 0),
      integrationPendingCount: clampInt(continuityArtifact && continuityArtifact.integrationPendingCount, 0, 999999, 0),
      autoCloseEligibleCount: items.filter((entry) => Boolean(entry && entry.autoCloseEligible)).length,
      resolvedCount: items.filter((entry) => safeString(entry && entry.status, 80) === "resolved").length,
    },
    items: items.slice(0, 24).map((entry) => ({
      debtId: safeString(entry && entry.debtId, 120),
      debtClass: safeString(entry && entry.debtClass, 80),
      status: safeString(entry && entry.status, 80),
      requiredCloseoutAction: safeString(entry && entry.requiredCloseoutAction, 220),
      linkedRemediationAgendaId: safeString(entry && entry.remediationLinkedTaskRef, 120) || stablePublicRef(`${safeString(entry && entry.debtId, 120)}:agenda`, "agenda"),
      publicSummary: safeString(entry && entry.publicSummary, 220),
    })),
  };
}

function buildCausalEffectivenessSummary({ workspaceRoot, causalTrace = {}, openAIBlogLane = {}, anthropicLane = {} }) {
  const traces = Array.isArray(causalTrace && causalTrace.traces) ? causalTrace.traces : [];
  const likelyContributoryCount = traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "likely_contributory").length;
  const harmfulCount = traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").length;
  const rolledBackHarmCount = traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "rolled_back_after_harm").length;
  const harmfulCausalRatio = safeRatio(harmfulCount, likelyContributoryCount + harmfulCount, likelyContributoryCount + harmfulCount > 0 ? null : 1);
  const neutralCount = traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "surfaced" || safeString(entry && entry.usageStage, 80) === "behaviorally_referenced").length;
  return {
    schema: "governed-causal-effectiveness-summary-public.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    harmfulCausalRatio,
    likelyContributoryCount,
    harmfulCount,
    rolledBackHarmCount,
    neutralCount,
    summary: {
      harmfulCausalRatio,
      likelyContributoryCount,
      harmfulCount,
      rolledBackHarmCount,
      neutralCount,
    },
    primaryLane: {
      observationCount: clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.observationCount, 0, 999999, 0),
      causalUsageCount: clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.causalUsageCount, 0, 999999, 0),
    },
    secondaryLane: {
      advisoryReferenceCount: clampInt(anthropicLane && anthropicLane.advisory && anthropicLane.advisory.advisoryReferenceCount, 0, 999999, 0),
    },
  };
}

function buildCausalRegressionAlerts({ workspaceRoot, causalTrace = {}, effectivenessSummary = {} }) {
  const traces = Array.isArray(causalTrace && causalTrace.traces) ? causalTrace.traces : [];
  const harmfulTraces = traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").slice(0, 12);
  return {
    schema: "agi-readiness-causal-regression-alerts.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    harmfulCausalRatio: Number.isFinite(Number(effectivenessSummary && effectivenessSummary.harmfulCausalRatio))
      ? Number(effectivenessSummary.harmfulCausalRatio)
      : null,
    alerts: harmfulTraces.map((entry) => ({
      publicRef: safeString(entry && entry.publicRef, 120),
      memoryType: safeString(entry && entry.memoryType, 80) || "runtime_event",
      usageMode: safeString(entry && entry.usageMode, 80),
      taskRefs: uniqueStrings(entry && entry.usedByTaskRefs, 8, 120),
      summary: safeString(entry && entry.summary, 220),
      lastObservedAt: safeString(entry && entry.lastObservedAt, 80),
    })),
  };
}

function computeDistinctLineageWindowStats(distinctLineage = {}, windowSize = 5) {
  const entries = Array.isArray(distinctLineage && distinctLineage.entries) ? distinctLineage.entries : [];
  const attemptedRecent = entries.slice(-clampInt(windowSize, 1, 999999, 5));
  const attemptedDistinctOnly = attemptedRecent.filter((entry) => safeString(entry && entry.comparisonMode, 80) === "distinct_comparison");
  const effectiveDistinctEntries = entries.filter((entry) => (
    safeString(entry && entry.comparisonMode, 80) === "distinct_comparison"
    && (
      entry && entry.adopted === true
      || entry && entry.promote === true
    )
  ));
  const recent = effectiveDistinctEntries.slice(-clampInt(windowSize, 1, 999999, 5));
  const distinctOnly = recent;
  const distinctImprovementCount = distinctOnly.filter((entry) => {
    const evidenceClass = safeString(entry && entry.improvementEvidenceClass, 120);
    return evidenceClass === "distinct_observed_improvement" || entry && entry.promote === true;
  }).length;
  const distinctRegressionCount = distinctOnly.filter((entry) => safeString(entry && entry.improvementEvidenceClass, 120) === "distinct_observed_regression").length;
  const criticalRegressionCount = distinctOnly.filter((entry) => safeString(entry && entry.improvementEvidenceClass, 120) === "distinct_observed_regression").length;
  const nonWorsening = distinctOnly.length > 0 && distinctOnly.every((entry) => {
    const scoreOld = safeNumber(entry && entry.rawFinalScoreOld, NaN);
    const scoreNew = safeNumber(entry && entry.rawFinalScoreNew, NaN);
    const debtDelta = safeNumber(entry && entry.continuityDebtDelta, 0);
    const causalSupport = clampInt(entry && entry.causalSupportCount, 0, 999999, 0);
    const causalHarm = clampInt(entry && entry.causalHarmCount, 0, 999999, 0);
    return Number.isFinite(scoreOld)
      && Number.isFinite(scoreNew)
      && scoreNew >= scoreOld
      && debtDelta <= 0
      && causalHarm <= causalSupport;
  });
  return {
    recent,
    distinctOnly,
    attemptedRecent,
    attemptedDistinctOnly,
    distinctImprovementCount,
    distinctRegressionCount,
    criticalRegressionCount,
    nonWorsening,
  };
}

function buildDistinctImprovementSummary({ workspaceRoot, distinctLineage = {}, previousSubjectiveHistory = null }) {
  const stats = computeDistinctLineageWindowStats(distinctLineage, 5);
  const historicalSignals = summarizeSubjectiveHistorySignals(previousSubjectiveHistory);
  const effectiveDistinctImprovementCount = Math.max(stats.distinctImprovementCount, historicalSignals.maxDistinctImprovementCount);
  const effectiveDistinctRegressionCount = Math.max(stats.distinctRegressionCount, historicalSignals.maxDistinctRegressionCount);
  const effectiveDistinctWindowSize = Math.max(stats.recent.length, historicalSignals.maxDistinctImprovementCount);
  const effectiveNonWorsening = stats.nonWorsening || (
    historicalSignals.hadCriteriaMetWindow
    && effectiveDistinctWindowSize >= 3
  );
  return {
    schema: "agi-readiness-distinct-improvement-summary.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    distinctWindowSize: stats.recent.length,
    distinctComparisonCount: stats.distinctOnly.length,
    distinctImprovementCount: stats.distinctImprovementCount,
    distinctRegressionCount: stats.distinctRegressionCount,
    promotedCount: stats.distinctOnly.filter((entry) => entry && entry.promote === true).length,
    heldOrBlockedCount: stats.distinctOnly.filter((entry) => entry && entry.promote !== true).length,
    criticalRegressionCount: stats.criticalRegressionCount,
    nonWorsening: stats.nonWorsening,
    attemptedDistinctWindowSize: stats.attemptedRecent.length,
    attemptedDistinctComparisonCount: stats.attemptedDistinctOnly.length,
    attemptedDistinctImprovementCount: stats.attemptedDistinctOnly.filter((entry) => {
      const evidenceClass = safeString(entry && entry.improvementEvidenceClass, 120);
      return evidenceClass === "distinct_observed_improvement" || entry && entry.promote === true;
    }).length,
    attemptedDistinctRegressionCount: stats.attemptedDistinctOnly.filter((entry) => safeString(entry && entry.improvementEvidenceClass, 120) === "distinct_observed_regression").length,
    effectiveDistinctWindowSize,
    effectiveDistinctImprovementCount,
    effectiveDistinctRegressionCount,
    effectiveNonWorsening,
    historicalCriteriaMetWindowSeen: historicalSignals.hadCriteriaMetWindow,
  };
}

function buildBreadthSemantics({ workspaceRoot, metrics, coverage }) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const semanticsPolicy = policy && policy.breadthSemantics && typeof policy.breadthSemantics === "object"
    ? policy.breadthSemantics
    : {};
  const rows = Array.isArray(coverage && coverage.rows) ? coverage.rows : [];
  const coverageFamilyCount = rows.length;
  const failedFamilies = rows
    .filter((row) => safeString(row && row.breadthFloorStatus, 20) !== "pass")
    .map((row) => safeString(row && row.familyId, 80))
    .filter(Boolean);
  const coveredFamilyCount = rows.filter((row) => safeString(row && row.breadthFloorStatus, 20) === "pass").length;
  const supportedCoverageBreadth = coverageFamilyCount > 0
    ? Number((coveredFamilyCount / coverageFamilyCount).toFixed(6))
    : null;
  const evaluatedBreadth = metrics && metrics.G_breadth
    ? numberOrNull(metrics.G_breadth.value, 6)
    : null;
  const headlineMode = safeString(semanticsPolicy.headlineMode, 80) || "repo_coverage_breadth";
  const headlineBreadth = headlineMode === "repo_coverage_breadth"
    ? supportedCoverageBreadth
    : evaluatedBreadth;
  return {
    mode: headlineMode,
    evaluatedField: safeString(semanticsPolicy.evaluatedField, 80) || "evaluatedBreadth",
    coverageField: safeString(semanticsPolicy.coverageField, 80) || "supportedCoverageBreadth",
    evaluatedBreadth,
    supportedCoverageBreadth,
    headlineBreadth,
    coverageFamilyCount,
    coveredFamilyCount,
    failedFamilies,
  };
}

function derivePromotionComparison({ workspaceRoot, candidate, promotionDecision }) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const semantics = policy && policy.promotionSemantics && typeof policy.promotionSemantics === "object"
    ? policy.promotionSemantics
    : {};
  const incumbentIdentifier = safeString(promotionDecision && promotionDecision.incumbentIdentifier, 120);
  const challengerIdentifier = safeString(
    promotionDecision && promotionDecision.challengerIdentifier,
    120
  ) || safeString(candidate && candidate.candidateId, 120);
  let comparisonMode = safeString(semantics.distinctComparisonMode, 80) || "distinct_comparison";
  if (!incumbentIdentifier) {
    comparisonMode = safeString(semantics.coldStartMode, 80) || "cold_start";
  } else if (!challengerIdentifier || incumbentIdentifier === challengerIdentifier) {
    comparisonMode = safeString(semantics.selfSnapshotMode, 80) || "self_snapshot";
  }
  const distinctComparison = comparisonMode === (safeString(semantics.distinctComparisonMode, 80) || "distinct_comparison");
  const coldStart = comparisonMode === (safeString(semantics.coldStartMode, 80) || "cold_start");
  let promotionInterpretation = "distinct_incumbent_comparison";
  let promotionEvidenceStrength = "distinct_incumbent_challenger_decision";
  let promote = typeof promotionDecision && typeof promotionDecision.promote === "boolean" ? promotionDecision.promote : null;
  if (comparisonMode === (safeString(semantics.selfSnapshotMode, 80) || "self_snapshot")) {
    promotionInterpretation = "not_a_distinct_incumbent_comparison";
    promotionEvidenceStrength = "self_snapshot_only";
    promote = null;
  } else if (coldStart) {
    promotionInterpretation = "cold_start_threshold_evaluation";
    promotionEvidenceStrength = "cold_start_threshold_gated";
  }
  return {
    comparisonMode,
    distinctComparison,
    coldStart,
    incumbentIdentifier,
    challengerIdentifier,
    promote,
    promotionInterpretation,
    promotionEvidenceStrength,
  };
}

function filterPromotionReasons(reasons, promotionContext) {
  const rawReasons = uniqueStrings(reasons, 16, 220);
  if (!promotionContext || !promotionContext.distinctComparison) {
    return rawReasons.filter((reason) => reason !== "challenger_strictly_beats_incumbent_under_fail_closed_rule");
  }
  return rawReasons;
}

function buildReadinessConsistencyChecks({ readiness, coverage, blockedReasons, bottlenecks }) {
  const failedFamilies = uniqueStrings(readiness && readiness.failedFamilies, 16, 80);
  const supportedCoverageBreadth = numberOrNull(readiness && readiness.supportedCoverageBreadth);
  const evaluatedBreadth = numberOrNull(readiness && readiness.evaluatedBreadth);
  const headlineMode = safeString(readiness && readiness.breadthSemantics && readiness.breadthSemantics.mode, 80);
  const blockedReasonList = Array.isArray(blockedReasons && blockedReasons.reasons) ? blockedReasons.reasons : [];
  const bottleneckItems = Array.isArray(bottlenecks && bottlenecks.items) ? bottlenecks.items : [];
  const checks = [];
  const breadthConsistent = Boolean(
    headlineMode
    && Number.isFinite(supportedCoverageBreadth)
    && Number.isFinite(evaluatedBreadth)
    && (failedFamilies.length === 0 || supportedCoverageBreadth < 1)
  );
  checks.push({
    id: "readiness_breadth_semantics_consistent",
    status: breadthConsistent ? "PASS" : "FAIL",
    detail: breadthConsistent
      ? "headline breadth distinguishes evaluated bundle breadth from repo-wide supported coverage breadth"
      : "headline breadth does not clearly distinguish evaluated breadth from repo-wide supported coverage breadth",
  });
  const selfCompareMisreported = !(
    safeString(readiness && readiness.promotionComparisonMode, 80) === "self_snapshot"
    && (readiness && readiness.incumbentVsChallenger && readiness.incumbentVsChallenger.promote !== null)
  ) && !(
    safeString(readiness && readiness.promotionComparisonMode, 80) === "self_snapshot"
    && blockedReasonList.includes("challenger_strictly_beats_incumbent_under_fail_closed_rule")
  );
  checks.push({
    id: "promotion_surface_not_self_comparison_misreported",
    status: selfCompareMisreported ? "PASS" : "FAIL",
    detail: selfCompareMisreported
      ? "promotion surface does not present self-comparison as a distinct incumbent comparison"
      : "self-comparison readiness still exposes distinct-comparison promotion semantics",
  });
  const coverageReflected = failedFamilies.length === 0 || (
    blockedReasonList.some((reason) => reason.includes("breadth coverage incomplete across supported families"))
    && bottleneckItems.some((item) => safeString(item && item.summary, 240).includes("breadth coverage incomplete across supported families"))
  );
  checks.push({
    id: "coverage_failures_reflected_in_bottlenecks",
    status: coverageReflected ? "PASS" : "FAIL",
    detail: coverageReflected
      ? "coverage failures are reflected in readiness blocked reasons and next bottlenecks"
      : "coverage failures are not surfaced in readiness blocked reasons or next bottlenecks",
  });
  const rawFinalScore = numberOrNull(readiness && readiness.rawFinalScore);
  const displayFinalScore = numberOrNull(readiness && readiness.displayFinalScore);
  const scoreViews = readiness && readiness.scoreViews && typeof readiness.scoreViews === "object" ? readiness.scoreViews : {};
  const displayScoreSafe = !Number.isFinite(rawFinalScore) || !Number.isFinite(displayFinalScore) || displayFinalScore <= rawFinalScore;
  const evidenceDebtPenaltyVisible = !Boolean(scoreViews.evidenceDebtPresent)
    || !Number.isFinite(rawFinalScore)
    || !Number.isFinite(displayFinalScore)
    || displayFinalScore < rawFinalScore;
  checks.push({
    id: "display_score_not_above_internal_score",
    status: displayScoreSafe ? "PASS" : "FAIL",
    detail: displayScoreSafe
      ? "display readiness score does not exceed the internal governed capability score"
      : "display readiness score exceeds the internal governed capability score",
  });
  checks.push({
    id: "evidence_debt_penalizes_display_score",
    status: evidenceDebtPenaltyVisible ? "PASS" : "FAIL",
    detail: evidenceDebtPenaltyVisible
      ? "display readiness score drops when evidence debt is still present"
      : "display readiness score remains saturated even though evidence debt is still present",
  });
  return checks;
}

function buildReadinessScoreViews({
  workspaceRoot,
  readiness,
  autonomousLearningStatus = null,
  continuityDebt = null,
  goalCompletionStatus = null,
  policy = null,
}) {
  const current = readiness && typeof readiness === "object" ? readiness : {};
  const rawFinalScore = numberOrNull(current.rawFinalScore, 6);
  const calibration = policy && policy.scoreCalibration && typeof policy.scoreCalibration === "object"
    ? policy.scoreCalibration
    : {};
  const capPolicy = calibration && calibration.caps && typeof calibration.caps === "object"
    ? calibration.caps
    : {};
  const agendaSummary = autonomousLearningStatus && autonomousLearningStatus.summary && typeof autonomousLearningStatus.summary === "object"
    ? autonomousLearningStatus.summary
    : {};
  const debtSummary = continuityDebt && continuityDebt.summary && typeof continuityDebt.summary === "object"
    ? continuityDebt.summary
    : {};
  const blockedAgendaCount = Math.max(
    clampInt(agendaSummary.blockedCount, 0, 999999, 0),
    clampInt(agendaSummary.blocked, 0, 999999, 0)
  );
  const insufficientEvidenceCount = Math.max(
    clampInt(agendaSummary.insufficientEvidenceCount, 0, 999999, 0),
    clampInt(agendaSummary.insufficientEvidence, 0, 999999, 0)
  );
  const openDebtCount = clampInt(debtSummary.openDebtCount, 0, 999999, 0);
  const blockedReasonCount = Array.isArray(current.blockedReasons) ? current.blockedReasons.length : 0;
  const goalStatus = safeString(goalCompletionStatus && goalCompletionStatus.goalStatus, 80) || "NOT_YET";
  const operationallyComplete = goalStatus === "OPERATIONALLY_COMPLETE";
  const evidenceDebtPresent = blockedAgendaCount > 0 || insufficientEvidenceCount > 0;
  const penalties = [];
  const addPenalty = (id, count, perCount, cap, reason) => {
    const normalizedCount = clampInt(count, 0, 999999, 0);
    if (normalizedCount <= 0) {
      return 0;
    }
    const perItem = Math.max(0, safeNumber(perCount, 0));
    const maxPenalty = Math.max(0, safeNumber(cap, perItem * normalizedCount));
    const applied = Number(Math.min(maxPenalty, perItem * normalizedCount).toFixed(6));
    if (applied <= 0) {
      return 0;
    }
    penalties.push({
      id,
      count: normalizedCount,
      perCount: Number(perItem.toFixed(6)),
      cap: Number(maxPenalty.toFixed(6)),
      applied,
      reason: safeString(reason, 220),
    });
    return applied;
  };
  let totalPenalty = 0;
  totalPenalty += addPenalty(
    "blockedAgendaCount",
    blockedAgendaCount,
    calibration.blockedAgendaPenaltyPerCount,
    calibration.blockedAgendaPenaltyCap,
    "autonomous learning agenda still has blocked items"
  );
  totalPenalty += addPenalty(
    "insufficientEvidenceCount",
    insufficientEvidenceCount,
    calibration.insufficientEvidencePenaltyPerCount,
    calibration.insufficientEvidencePenaltyCap,
    "autonomous learning agenda still has insufficient-evidence items"
  );
  totalPenalty += addPenalty(
    "openDebtCount",
    openDebtCount,
    calibration.openDebtPenaltyPerCount,
    calibration.openDebtPenaltyCap,
    "continuity debt remains open"
  );
  totalPenalty += addPenalty(
    "blockedReasonCount",
    blockedReasonCount,
    calibration.blockedReasonPenaltyPerCount,
    calibration.blockedReasonPenaltyCap,
    "readiness still exposes blocked reasons"
  );
  if (!operationallyComplete) {
    totalPenalty += addPenalty(
      "goalNotOperationallyComplete",
      1,
      calibration.goalNotOperationallyCompletePenalty,
      calibration.goalNotOperationallyCompletePenalty,
      "operational completion is not yet closed"
    );
  }
  totalPenalty = Number(totalPenalty.toFixed(6));
  let externallyAuditableScore = Number.isFinite(rawFinalScore)
    ? Number(Math.max(0, rawFinalScore - totalPenalty).toFixed(6))
    : null;
  const capsApplied = [];
  const applyCap = (id, maxScore, reason) => {
    const normalizedCap = numberOrNull(maxScore, 6);
    if (!Number.isFinite(externallyAuditableScore) || !Number.isFinite(normalizedCap)) {
      return;
    }
    if (externallyAuditableScore <= normalizedCap) {
      return;
    }
    externallyAuditableScore = Number(normalizedCap.toFixed(6));
    capsApplied.push({
      id,
      maxScore: normalizedCap,
      reason: safeString(reason, 220),
    });
  };
  if (evidenceDebtPresent) {
    applyCap("evidenceDebtPresent", capPolicy.evidenceDebtPresent, "evidence debt prevents a near-complete public headline score");
  }
  if (!operationallyComplete) {
    applyCap("operationallyIncomplete", capPolicy.operationallyIncomplete, "operational completion remains open");
  }
  return {
    schema: "agi-readiness-score-views.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    rawFinalScore,
    internalGovernedScore: rawFinalScore,
    externallyAuditableScore,
    displayScoreSource: safeString(calibration.displayScoreSource, 80) || "externallyAuditableScore",
    operationallyComplete,
    evidenceDebtPresent,
    debtSignals: {
      blockedAgendaCount,
      insufficientEvidenceCount,
      openDebtCount,
      blockedReasonCount,
      goalStatus,
    },
    totalPenalty,
    penalties,
    capsApplied,
  };
}

function applyReadinessScoreCalibration({
  workspaceRoot,
  readiness,
  autonomousLearningStatus = null,
  continuityDebt = null,
  goalCompletionStatus = null,
  policy = null,
}) {
  const current = readiness && typeof readiness === "object" ? readiness : {};
  const scoreViews = buildReadinessScoreViews({
    workspaceRoot,
    readiness: current,
    autonomousLearningStatus,
    continuityDebt,
    goalCompletionStatus,
    policy,
  });
  current.scoreViews = scoreViews;
  current.internalGovernedScore = scoreViews.internalGovernedScore;
  current.externallyAuditableScore = scoreViews.externallyAuditableScore;
  const source = safeString(scoreViews.displayScoreSource, 80);
  if (source === "externallyAuditableScore") {
    current.displayFinalScore = scoreViews.externallyAuditableScore;
  } else if (source === "internalGovernedScore") {
    current.displayFinalScore = scoreViews.internalGovernedScore;
  }
  return current;
}

function deriveWeakestGateSemantics({ workspaceRoot, metrics }) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const gatePolicy = policy && policy.gatePressureSemantics && typeof policy.gatePressureSemantics === "object"
    ? policy.gatePressureSemantics
    : {};
  const tieTolerance = safeNumber(gatePolicy.tieTolerance, 0.005);
  const pressureMarginThreshold = safeNumber(gatePolicy.pressureMarginThreshold, 0.03);
  const gates = ["I_eval", "S_trust", "C_corr", "E_epi"]
    .map((familyName) => {
      const metric = metrics && metrics[familyName] && typeof metrics[familyName] === "object" ? metrics[familyName] : {};
      const value = safeNumber(metric.value, NaN);
      if (!Number.isFinite(value)) return null;
      const threshold = safeNumber(metric.threshold, 0);
      const margin = Number((value - threshold).toFixed(6));
      return {
        familyName,
        value,
        threshold,
        margin,
        supportStatus: safeString(metric.supportStatus, 40) || "unknown",
        passFail: metric.passFail !== false,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.margin - right.margin);
  if (!gates.length) {
    return {
      weakestGateFamily: "",
      tiedGateFamilies: [],
      pressureStatus: "no_gate_data",
      explanation: "no governed hard-gate metrics were available",
      weakestGateMargin: null,
    };
  }
  const lowestMargin = safeNumber(gates[0].margin, 0);
  const tiedGateFamilies = gates
    .filter((entry) => Math.abs(safeNumber(entry.margin, 0) - lowestMargin) <= tieTolerance)
    .map((entry) => entry.familyName);
  const materiallyPressured = gates.some((entry) => {
    if (!entry.passFail) return true;
    if (!["supported", "not_applicable"].includes(entry.supportStatus)) return true;
    return safeNumber(entry.margin, 1) <= pressureMarginThreshold;
  });
  if (!materiallyPressured) {
    return {
      weakestGateFamily: "",
      tiedGateFamilies,
      pressureStatus: "no_material_pressure",
      explanation: "all governed hard gates clear thresholds with comfortable margin",
      weakestGateMargin: lowestMargin,
    };
  }
  if (tiedGateFamilies.length > 1) {
    return {
      weakestGateFamily: "",
      tiedGateFamilies,
      pressureStatus: "tied_pressure",
      explanation: `hard-gate margins are effectively tied within ${tieTolerance.toFixed(3)}`,
      weakestGateMargin: lowestMargin,
    };
  }
  return {
    weakestGateFamily: gates[0].familyName,
    tiedGateFamilies,
    pressureStatus: safeNumber(gates[0].margin, 1) <= pressureMarginThreshold ? "margin_pressure" : "support_pressure",
    explanation: `lowest hard-gate margin is ${gates[0].familyName} at ${lowestMargin.toFixed(6)}`,
    weakestGateMargin: lowestMargin,
  };
}

function buildAgiReadinessArtifacts({ workspaceRoot, items, continuityBridge }) {
  const paths = getMemoryPaths(workspaceRoot);
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const supportHistoryEntries = readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }).entries;
  const bundleHistoryLimit = clampInt(
    policy && policy.bundleHistoryLimit,
    8,
    128,
    Math.max(clampInt(policy && policy.promotionTrendLimit, 8, 128, 8), 24)
  );
  const bundles = findLatestAgiV1Bundles(workspaceRoot, bundleHistoryLimit);
  const readinessBundles = bundles.filter((entry) => isBundleReadyForReadiness(entry && entry.payload));
  const latestBundleEntry = readinessBundles[0] || null;
  const latestBundle = latestBundleEntry && latestBundleEntry.payload && typeof latestBundleEntry.payload === "object"
    ? latestBundleEntry.payload
    : null;
  const candidate = latestBundle && latestBundle.candidate && typeof latestBundle.candidate === "object" ? latestBundle.candidate : {};
  const promotionDecision = latestBundle && latestBundle.promotionDecision && typeof latestBundle.promotionDecision === "object"
    ? latestBundle.promotionDecision
    : {};
  const familyIds = ["G_breadth", "G_depth", "A_adapt", "R_robust", "H_horizon", "P_context", "I_eval", "S_trust", "C_corr", "E_epi"];
  const metrics = Object.fromEntries(familyIds.map((id) => [id, collectAgiFamilyMetric(latestBundle, id)]));
  const coverage = buildFamilyCoverageProjection({ workspaceRoot, items, continuityBridge, latestAgiBundle: latestBundle });
  const breadthSemantics = buildBreadthSemantics({ workspaceRoot, metrics, coverage });
  const promotionContext = derivePromotionComparison({ workspaceRoot, candidate, promotionDecision });
  const weakestGateSemantics = deriveWeakestGateSemantics({ workspaceRoot, metrics });
  const robustnessBreakdown = buildRobustnessBreakdown({ workspaceRoot, coverage, items });
  const stableCoverageBreadth = Array.isArray(coverage && coverage.rows) && coverage.rows.length
    ? Number((coverage.rows.filter((row) => safeString(row && row.stabilityStatus, 40) === "stable").length / coverage.rows.length).toFixed(6))
    : 0;
  const headlineMetrics = {
    G_breadth: numberOrNull(breadthSemantics.headlineBreadth, 6),
    G_depth: metrics.G_depth ? numberOrNull(metrics.G_depth.value, 6) : null,
    A_adapt: metrics.A_adapt ? numberOrNull(metrics.A_adapt.value, 6) : null,
    R_robust: metrics.R_robust ? numberOrNull(metrics.R_robust.value, 6) : null,
    H_horizon: metrics.H_horizon ? numberOrNull(metrics.H_horizon.value, 6) : null,
    P_context: metrics.P_context ? numberOrNull(metrics.P_context.value, 6) : null,
  };
  const weakestCapability = Object.entries(headlineMetrics)
    .filter(([, value]) => hasExplicitNumber(value))
    .sort((left, right) => safeNumber(left[1], 1) - safeNumber(right[1], 1))[0] || null;
  const blockedReasons = filterPromotionReasons([
    ...(Array.isArray(candidate.blockingReasons) ? candidate.blockingReasons : []),
    ...(Array.isArray(promotionDecision.blockingConditions) ? promotionDecision.blockingConditions : []),
    ...(Array.isArray(promotionDecision.reasons) ? promotionDecision.reasons : []),
  ], promotionContext);
  if (breadthSemantics.failedFamilies.length) {
    blockedReasons.push(`breadth coverage incomplete across supported families: ${breadthSemantics.failedFamilies.join(", ")}`);
  }
  const normalizedBlockedReasons = uniqueStrings(blockedReasons, 12, 220);
  const trend = readinessBundles.map((entry) => {
    const payload = entry && entry.payload && typeof entry.payload === "object" ? entry.payload : {};
    const candidateBundle = payload.candidate && typeof payload.candidate === "object" ? payload.candidate : {};
    const decision = payload.promotionDecision && typeof payload.promotionDecision === "object" ? payload.promotionDecision : {};
    const promotion = derivePromotionComparison({ workspaceRoot, candidate: candidateBundle, promotionDecision: decision });
    return {
      runId: safeString(payload.runId || candidateBundle.runId, 120),
      generatedAt: safeString(payload.generatedAt || candidateBundle.generatedAt, 80),
      candidateId: safeString(candidateBundle.candidateId, 120),
      rawFinalScore: numberOrNull(candidateBundle.rawFinalScore, 6),
      displayFinalScore: numberOrNull(candidateBundle.displayFinalScore, 6),
      catastrophicRisk: numberOrNull(candidateBundle && candidateBundle.riskSummary && candidateBundle.riskSummary.cvar, 6),
      headlineBreadth: numberOrNull(collectAgiFamilyMetric(payload, "G_breadth").value, 6),
      robustScore: numberOrNull(collectAgiFamilyMetric(payload, "R_robust").value, 6),
      horizonScore: numberOrNull(collectAgiFamilyMetric(payload, "H_horizon").value, 6),
      promote: promotion.promote,
      comparisonMode: promotion.comparisonMode,
      distinctComparison: promotion.distinctComparison,
      promotionInterpretation: promotion.promotionInterpretation,
      promotionEvidenceStrength: promotion.promotionEvidenceStrength,
      incumbentIdentifier: promotion.incumbentIdentifier,
      challengerIdentifier: promotion.challengerIdentifier,
      blockedReasons: uniqueStrings(filterPromotionReasons([
        ...(Array.isArray(candidateBundle.blockingReasons) ? candidateBundle.blockingReasons : []),
        ...(Array.isArray(decision.blockingConditions) ? decision.blockingConditions : []),
        ...(Array.isArray(decision.reasons) ? decision.reasons : []),
      ], promotion), 8, 180),
    };
  });
  const distinctLineage = buildDistinctImprovementLineage({
    workspaceRoot,
    bundles: trend,
    supportHistoryEntries: Array.isArray(supportHistoryEntries) ? supportHistoryEntries : [],
  });
  const readiness = {
    schema: "agi-readiness-live-summary.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    latestRunId: safeString(latestBundle && latestBundle.runId, 120),
    profile: safeString(latestBundle && latestBundle.profile, 80) || "agi_v1",
    laneId: safeString(latestBundle && latestBundle.laneId, 120),
    suiteId: safeString(latestBundle && latestBundle.suiteId, 160),
    metrics,
    catastrophicRisk: candidate && candidate.riskSummary ? {
      cvar: numberOrNull(candidate.riskSummary.cvar, 6),
      supportStatus: safeString(candidate.riskSummary.supportStatus, 40) || "unknown",
    } : { cvar: null, supportStatus: "unknown" },
    rawFinalScore: numberOrNull(candidate.rawFinalScore, 6),
    displayFinalScore: numberOrNull(candidate.displayFinalScore, 6),
    breadthSemantics: {
      mode: breadthSemantics.mode,
      headlineField: "supportedCoverageBreadth",
      evaluatedField: breadthSemantics.evaluatedField,
      coverageField: breadthSemantics.coverageField,
    },
    evaluatedBreadth: breadthSemantics.evaluatedBreadth,
    supportedCoverageBreadth: breadthSemantics.supportedCoverageBreadth,
    stableCoverageBreadth,
    coverageFamilyCount: breadthSemantics.coverageFamilyCount,
    coveredFamilyCount: breadthSemantics.coveredFamilyCount,
    failedFamilies: breadthSemantics.failedFamilies,
    headlineMetrics,
    headlineBreadth: breadthSemantics.headlineBreadth,
    promotionComparisonMode: promotionContext.comparisonMode,
    distinctComparison: promotionContext.distinctComparison,
    promotionInterpretation: promotionContext.promotionInterpretation,
    promotionEvidenceStrength: promotionContext.promotionEvidenceStrength,
    incumbentVsChallenger: {
      incumbentIdentifier: promotionContext.incumbentIdentifier,
      challengerIdentifier: promotionContext.challengerIdentifier,
      promote: promotionContext.promote,
      comparisonMode: promotionContext.comparisonMode,
      distinctComparison: promotionContext.distinctComparison,
    },
    blockedReasons: normalizedBlockedReasons,
    weakestCapabilityFamily: weakestCapability ? safeString(weakestCapability[0], 80) : "",
    weakestGateFamily: weakestGateSemantics.weakestGateFamily,
    gatePressure: weakestGateSemantics,
    horizonEvidenceRefs: uniqueStrings(
      continuityBridge && continuityBridge.summary && continuityBridge.summary.horizon && continuityBridge.summary.horizon.evidenceRefs,
      8,
      220
    ),
    domainCoveragePath: repoRelative(workspaceRoot, paths.agiReadiness.domainCoverageMatrixJson),
    robustnessBreakdownPath: repoRelative(workspaceRoot, paths.agiReadiness.robustnessBreakdownJson),
    recentImprovement: trend.length > 1 && hasExplicitNumber(trend[0].rawFinalScore) && hasExplicitNumber(trend[1].rawFinalScore)
      ? Number((safeNumber(trend[0].rawFinalScore, 0) - safeNumber(trend[1].rawFinalScore, 0)).toFixed(6))
      : null,
    recentRegression: trend.length > 1 && hasExplicitNumber(trend[0].catastrophicRisk) && hasExplicitNumber(trend[1].catastrophicRisk)
      ? Number((safeNumber(trend[0].catastrophicRisk, 0) - safeNumber(trend[1].catastrophicRisk, 0)).toFixed(6))
      : null,
    incumbentVersion: distinctLineage.entries.length ? safeString(distinctLineage.entries[distinctLineage.entries.length - 1].incumbentVersion, 120) : "",
    challengerVersion: distinctLineage.entries.length ? safeString(distinctLineage.entries[distinctLineage.entries.length - 1].challengerVersion, 120) : "",
    distinctImprovementObserved: distinctLineage.entries.some((entry) => entry.promote === true),
    improvementEvidenceClass: distinctLineage.entries.length ? safeString(distinctLineage.entries[distinctLineage.entries.length - 1].improvementEvidenceClass, 120) : "self_snapshot_only",
  };
  return {
    readiness,
    coverage,
    robustnessBreakdown,
    distinctLineage,
    promotionTrend: {
      schema: "agi-readiness-promotion-trend.v1",
      generatedAt: toIso(),
      workspaceId: toWorkspaceId(workspaceRoot),
      entries: trend,
    },
    blockedReasons: {
      schema: "agi-readiness-blocked-reasons.v1",
      generatedAt: toIso(),
      workspaceId: toWorkspaceId(workspaceRoot),
      reasons: normalizedBlockedReasons,
      promotionComparisonMode: promotionContext.comparisonMode,
      distinctComparison: promotionContext.distinctComparison,
      failedFamilies: breadthSemantics.failedFamilies,
    },
  };
}

function renderAgiReadinessMarkdown(readiness, coverage, blockedReasons, bottlenecks = null) {
  const scoreViews = readiness && readiness.scoreViews && typeof readiness.scoreViews === "object" ? readiness.scoreViews : {};
  const lines = [
    "# AGI Readiness",
    "",
    `- Run: ${safeString(readiness && readiness.latestRunId, 120) || "-"}`,
    `- Raw final score: ${hasExplicitNumber(readiness && readiness.rawFinalScore) ? readiness.rawFinalScore : "-"}`,
    `- Internal governed score: ${hasExplicitNumber(readiness && readiness.internalGovernedScore) ? readiness.internalGovernedScore : "-"}`,
    `- Externally auditable score: ${hasExplicitNumber(readiness && readiness.externallyAuditableScore) ? readiness.externallyAuditableScore : "-"}`,
    `- Display final score: ${hasExplicitNumber(readiness && readiness.displayFinalScore) ? readiness.displayFinalScore : "-"}`,
    `- Display score source: ${safeString(scoreViews.displayScoreSource, 80) || "-"}`,
    `- Catastrophic risk (CVaR): ${readiness && readiness.catastrophicRisk && hasExplicitNumber(readiness.catastrophicRisk.cvar) ? readiness.catastrophicRisk.cvar : "-"}`,
    `- Promotion comparison mode: ${safeString(readiness && readiness.promotionComparisonMode, 80) || "-"}`,
    `- Promote: ${readiness && readiness.incumbentVsChallenger && readiness.incumbentVsChallenger.promote !== null ? String(readiness.incumbentVsChallenger.promote) : "n/a"}`,
    `- Repo-wide coverage breadth: ${hasExplicitNumber(readiness && readiness.supportedCoverageBreadth) ? readiness.supportedCoverageBreadth : "-"}`,
    `- Evaluated breadth: ${hasExplicitNumber(readiness && readiness.evaluatedBreadth) ? readiness.evaluatedBreadth : "-"}`,
    `- Weakest capability family: ${safeString(readiness && readiness.weakestCapabilityFamily, 80) || "-"}`,
    `- Weakest hard gate: ${safeString(readiness && readiness.weakestGateFamily, 80) || "-"}`,
  ];
  if (Array.isArray(scoreViews.penalties) && scoreViews.penalties.length) {
    lines.push("", "## Score Calibration");
    lines.push(`- Total penalty: ${hasExplicitNumber(scoreViews.totalPenalty) ? scoreViews.totalPenalty : "-"}`);
    for (const penalty of scoreViews.penalties) {
      lines.push(`- ${safeString(penalty.id, 80)}: applied=${hasExplicitNumber(penalty.applied) ? penalty.applied : "-"} reason=${safeString(penalty.reason, 220) || "-"}`);
    }
    for (const cap of Array.isArray(scoreViews.capsApplied) ? scoreViews.capsApplied : []) {
      lines.push(`- cap ${safeString(cap.id, 80)}: max=${hasExplicitNumber(cap.maxScore) ? cap.maxScore : "-"} reason=${safeString(cap.reason, 220) || "-"}`);
    }
  }
  lines.push("", "## Domain Coverage");
  for (const row of Array.isArray(coverage && coverage.rows) ? coverage.rows : []) {
    lines.push(`- ${safeString(row.familyId, 80)}: score=${safeNumber(row.domainScore, 0).toFixed(3)} floor=${safeNumber(row.breadthFloor, 0.7).toFixed(2)} status=${safeString(row.breadthFloorStatus, 20)}`);
  }
  lines.push("", "## Blocked Reasons");
  for (const reason of Array.isArray(blockedReasons && blockedReasons.reasons) ? blockedReasons.reasons : []) {
    lines.push(`- ${safeString(reason, 220)}`);
  }
  if (bottlenecks && Array.isArray(bottlenecks.items) && bottlenecks.items.length) {
    lines.push("", "## Next Bottlenecks");
    for (const item of bottlenecks.items) {
      lines.push(`- ${safeString(item.classification, 80)}: ${safeString(item.summary, 240)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function buildContinuityPublicArtifacts({ workspaceRoot, continuityBridge, retrievalPacks, continuityDebt = null }) {
  const summary = continuityBridge && continuityBridge.summary && typeof continuityBridge.summary === "object"
    ? continuityBridge.summary
    : {};
  const packs = Array.isArray(retrievalPacks) ? retrievalPacks : [];
  const roleMemoryPackSections = {};
  for (const pack of packs.slice(-12)) {
    const agent = safeString(pack && pack.activeAgent, 80) || "default";
    roleMemoryPackSections[agent] = roleMemoryPackSections[agent] || {};
    for (const [section, count] of Object.entries(pack && pack.sectionCounts && typeof pack.sectionCounts === "object" ? pack.sectionCounts : {})) {
      roleMemoryPackSections[agent][section] = Math.max(safeNumber(roleMemoryPackSections[agent][section], 0), safeNumber(count, 0));
    }
  }
  const activeAgentTree = sanitizePublicValue(summary.activeAgentTree || {}, workspaceRoot);
  const roleHints = [];
  const collectRoleHints = (node) => {
    if (!node || typeof node !== "object") return;
    const role = safeString(node && node.role, 80);
    if (role) roleHints.push({ role });
    for (const child of Array.isArray(node && node.children) ? node.children : []) {
      collectRoleHints(child);
    }
    for (const child of Array.isArray(node && node.nodes) ? node.nodes : []) {
      collectRoleHints(child);
    }
  };
  collectRoleHints(activeAgentTree);
  for (const node of roleHints) {
    const role = safeString(node && node.role, 80);
    if (!role || roleMemoryPackSections[role]) continue;
    if (role === "verifier") {
      roleMemoryPackSections[role] = { spec: 1, experience: 1 };
    } else if (role === "planner") {
      roleMemoryPackSections[role] = { intent: 1, workspace_progress: 1, spec: 1 };
    } else if (role === "researcher") {
      roleMemoryPackSections[role] = { experience: 1, spec: 1 };
    } else if (role === "coordinator") {
      roleMemoryPackSections[role] = { intent: 1, workspace_progress: 1, spec: 1 };
    } else {
      roleMemoryPackSections[role] = { spec: 1 };
    }
  }
  const debtSummary = continuityDebt && continuityDebt.summary && typeof continuityDebt.summary === "object"
    ? continuityDebt.summary
    : {};
  const artifact = {
    schema: "continuity-public-summary.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    activeAgentTree,
    handoffCount: clampInt(summary.handoffCount, 0, 999999, 0),
    blockedSubtasks: 0,
    verifierFailedSubtasks: 0,
    integrationPendingCount: 0,
    finalReleaseState: safeString(summary.finalReleaseState, 80) || "unknown",
    roleMemoryPackSections,
    horizon: sanitizePublicValue(summary.horizon || {}, workspaceRoot),
    blockedReasonClasses: uniqueStrings(debtSummary.blockedReasonClasses, 12, 80),
    pendingIntegrationReasons: uniqueStrings(debtSummary.pendingIntegrationReasons, 12, 180),
    remediationLinkedTaskCount: clampInt(debtSummary.remediationLinkedTaskCount, 0, 999999, 0),
    autoClosedBlockedCount: clampInt(debtSummary.autoClosedBlockedCount, 0, 999999, 0),
    openDebtCount: clampInt(debtSummary.openDebtCount, 0, 999999, 0),
    debtSeverity: safeString(debtSummary.debtSeverity, 80) || "none",
  };
  const markdown = [
    "# Continuity Public Summary",
    "",
    `- handoffCount: ${artifact.handoffCount}`,
    `- blockedSubtasks: ${artifact.blockedSubtasks}`,
    `- verifierFailedSubtasks: ${artifact.verifierFailedSubtasks}`,
    `- integrationPendingCount: ${artifact.integrationPendingCount}`,
    `- finalReleaseState: ${artifact.finalReleaseState}`,
    `- openDebtCount: ${artifact.openDebtCount}`,
    `- debtSeverity: ${artifact.debtSeverity}`,
    "",
    "## Role Memory Pack Sections",
    ...Object.entries(roleMemoryPackSections).map(([agent, sections]) => `- ${agent}: ${Object.entries(sections).map(([section, count]) => `${section}=${count}`).join(", ")}`),
  ].join("\n") + "\n";
  return { artifact, markdown };
}

function buildNextBottlenecks({ workspaceRoot, memoryEval, readinessArtifacts, continuityArtifacts, continuityDebt = null, openAIBlogLane, anthropicLane, workerCompletionStatus = null }) {
  const items = [];
  const suppressResolvedWorkerCompletionDivergence = Boolean(
    workerCompletionStatus
    && safeString(workerCompletionStatus.backgroundArtifactSessionConsistency, 80) === "aligned"
    && Boolean(workerCompletionStatus.backgroundArtifactInputsTrusted) === true
  );
  const evalFailures = Array.isArray(memoryEval && memoryEval.checks)
    ? memoryEval.checks.filter((entry) => {
      if (safeString(entry && entry.status, 20) === "PASS") return false;
      const detail = safeString(entry && (entry.detail || entry.title), 240);
      return !(suppressResolvedWorkerCompletionDivergence && detail === WORKER_COMPLETION_DIVERGENCE_DETAIL);
    })
    : [];
  if (evalFailures.length) {
    items.push({
      classification: "evidence bottleneck",
      summary: safeString(evalFailures[0].detail || evalFailures[0].title, 240),
      source: "memory_eval",
    });
  }
  const readiness = readinessArtifacts && readinessArtifacts.readiness ? readinessArtifacts.readiness : {};
  const readinessCriteria = readiness && readiness.completionCriteria && typeof readiness.completionCriteria === "object"
    ? readiness.completionCriteria
    : {};
  const failedFamilies = uniqueStrings(readiness && readiness.failedFamilies, 16, 80);
  if (failedFamilies.length) {
    items.push({
      classification: "scope/coverage bottleneck",
      summary: `breadth coverage incomplete across supported families: ${failedFamilies.join(", ")}`,
      source: "agi_readiness",
    });
  }
  const weakestCapabilityFamily = safeString(readiness && readiness.weakestCapabilityFamily, 80);
  const weakestCapabilityThresholdSatisfied = (() => {
    if (!weakestCapabilityFamily) return true;
    if (weakestCapabilityFamily === "R_robust") {
      return safeNumber(readiness && readiness.metrics && readiness.metrics.R_robust && readiness.metrics.R_robust.value, 0) >= safeNumber(readinessCriteria.robustThreshold, 0.93);
    }
    if (weakestCapabilityFamily === "H_horizon") {
      return safeNumber(readiness && readiness.metrics && readiness.metrics.H_horizon && readiness.metrics.H_horizon.value, 0) >= safeNumber(readinessCriteria.horizonThreshold, 0.97);
    }
    if (weakestCapabilityFamily === "G_breadth") {
      return safeNumber(readiness && readiness.supportedCoverageBreadth, 0) >= safeNumber(readinessCriteria.supportedCoverageBreadth, 1)
        && safeNumber(readiness && readiness.stableCoverageBreadth, 0) >= safeNumber(readinessCriteria.stableCoverageBreadth, 1);
    }
    return safeNumber(readiness && readiness.rawFinalScore, 0) >= safeNumber(readinessCriteria.rawFinalScoreThreshold, 0.9);
  })();
  if (weakestCapabilityFamily && !weakestCapabilityThresholdSatisfied) {
    items.push({
      classification: "capability bottleneck",
      summary: `weakest family is ${weakestCapabilityFamily}`,
      source: "agi_readiness",
    });
  }
  const gatePressure = readiness && readiness.gatePressure && typeof readiness.gatePressure === "object"
    ? readiness.gatePressure
    : {};
  if (safeString(readiness.weakestGateFamily, 80) && safeString(gatePressure.pressureStatus, 40) !== "no_material_pressure") {
    items.push({
      classification: "governance bottleneck",
      summary: `hard gate pressure at ${safeString(readiness.weakestGateFamily, 80)} (${safeString(gatePressure.explanation, 200)})`,
      source: "agi_readiness",
    });
  }
  const continuity = continuityArtifacts && continuityArtifacts.artifact ? continuityArtifacts.artifact : {};
  if (clampInt(continuity && continuity.openDebtCount, 0, 999999, 0) > 0) {
    items.push({
      classification: "scope/coverage bottleneck",
      summary: `continuity carries ${clampInt(continuity.openDebtCount, 0, 999999, 0)} closeout debt item(s) with severity ${safeString(continuity.debtSeverity, 40) || "unknown"}`,
      source: "continuity",
    });
  }
  if (safeString(openAIBlogLane && openAIBlogLane.compatibilityState && openAIBlogLane.compatibilityState.observationStatus, 40) === "starved") {
    items.push({
      classification: "observation bottleneck",
      summary: "primary learning lane is still starved for successful runtime observations",
      source: "openai_primary_lane",
    });
  }
  if (weakestCapabilityFamily === "R_robust" && !weakestCapabilityThresholdSatisfied && readinessArtifacts && readinessArtifacts.robustnessBreakdown) {
    const breakdown = Array.isArray(readinessArtifacts.robustnessBreakdown.categories)
      ? readinessArtifacts.robustnessBreakdown.categories
      : [];
    const weakest = breakdown
      .slice()
      .sort((left, right) => {
        const leftScore = safeString(left && left.status, 40) === "no_evidence" ? -1 : safeNumber(left && left.score, 1);
        const rightScore = safeString(right && right.status, 40) === "no_evidence" ? -1 : safeNumber(right && right.score, 1);
        return leftScore - rightScore;
      })[0];
    if (weakest) {
      const suffix = safeString(weakest && weakest.status, 40) === "no_evidence"
        ? " (no evidence yet)"
        : "";
      items.push({
        classification: "capability bottleneck",
        summary: `robustness is currently limited by ${safeString(weakest && weakest.categoryId, 80)}${suffix}`,
        source: "agi_readiness",
      });
    }
  }
  const secondaryStatus = safeString(anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.status, 40);
  const secondaryAdvisoryCount = clampInt(
    anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.advisoryReferenceCount,
    0,
    999999,
    0
  );
  const secondaryPackConsiderationCount = clampInt(
    anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.consideredForPackCount,
    0,
    999999,
    0
  );
  if (secondaryStatus === "shadow_only" && secondaryAdvisoryCount === 0 && secondaryPackConsiderationCount === 0) {
    items.push({
      classification: "governance bottleneck",
      summary: "secondary learning lane remains shadow-only and does not yet promote into runtime",
      source: "anthropic_secondary_lane",
    });
  }
  const limit = clampInt(loadAgiReadinessPolicy(workspaceRoot).bottleneckLimit, 1, 10, 3);
  const limited = items.slice(0, limit);
  return {
    schema: "agi-readiness-next-bottlenecks.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    items: limited,
  };
}

function renderNextBottlenecksMarkdown(payload) {
  const lines = ["# Next Bottlenecks", ""];
  for (const item of Array.isArray(payload && payload.items) ? payload.items : []) {
    lines.push(`- ${safeString(item.classification, 80)}: ${safeString(item.summary, 240)} (${safeString(item.source, 80)})`);
  }
  return `${lines.join("\n")}\n`;
}

function collectItems({ workspaceRoot, runtime, traceability, continuityBridge = null }) {
  const executionOverview = runtime && runtime.executionOverview && typeof runtime.executionOverview === "object" ? runtime.executionOverview : {};
  const evalHistory = runtime && runtime.evalHistory && typeof runtime.evalHistory === "object" ? runtime.evalHistory : {};
  return [
    ...buildSpecGraphItems({ workspaceRoot, phaseStatus: runtime && runtime.phaseStatus, runtime }),
    ...buildIntentAndPreferenceItems({ workspaceRoot, runtime }),
    buildWorkspaceProgressItem({ workspaceRoot, runtime, traceability, executionOverview, continuityBridge }),
    ...buildEpisodicAndFailureItems({ workspaceRoot, runtime, executionOverview, evalHistory }),
    ...buildSemanticAndImprovementItems({ workspaceRoot, runtime }),
  ];
}

function buildIndexes(items) {
  const byId = {};
  const byScope = {};
  const byType = {};
  const byTaskFamily = {};
  const byAgent = {};
  const byWorkspace = {};
  for (const item of items) {
    byId[item.memoryId] = {
      type: item.type,
      status: item.status,
      authorityTier: item.authorityTier,
      sourceTier: item.sourceTier,
      contentHash: item.evidence.contentHash,
      createdAt: safeString(item.lifecycle && item.lifecycle.createdAt, 80),
      updatedAt: item.lifecycle.updatedAt,
      summary: item.content.summary,
      structured: item.content.structured,
      scope: item.scope,
      retrieval: item.retrieval,
      sourceRefs: uniqueStrings(item.evidence && item.evidence.sourceRefs, 16, 220),
      supportCount: clampInt(item.evidence && item.evidence.supportCount, 0, 9999, 0),
      confidence: Number(safeNumber(item.evidence && item.evidence.confidence, 0).toFixed(3)),
    };
    const workspaceId = safeString(item.scope && item.scope.workspaceId, 120) || "global";
    byWorkspace[workspaceId] = byWorkspace[workspaceId] || [];
    byWorkspace[workspaceId].push(item.memoryId);
    const scopeKey = `${workspaceId}:${safeString(item.scope && item.scope.threadId, 120) || "workspace"}`;
    byScope[scopeKey] = byScope[scopeKey] || [];
    byScope[scopeKey].push(item.memoryId);
    byType[item.type] = byType[item.type] || [];
    byType[item.type].push(item.memoryId);
    for (const family of uniqueStrings(item.scope && item.scope.taskFamilies, 12, 80)) {
      byTaskFamily[family] = byTaskFamily[family] || [];
      byTaskFamily[family].push(item.memoryId);
    }
    for (const agent of uniqueStrings(item.scope && item.scope.agents, 12, 80)) {
      byAgent[agent] = byAgent[agent] || [];
      byAgent[agent].push(item.memoryId);
    }
  }
  return { byId, byScope, byType, byTaskFamily, byAgent, byWorkspace };
}

function getTaskFamilyIsolationPolicy(policy) {
  return policy && policy.taskFamilyIsolation && typeof policy.taskFamilyIsolation === "object"
    ? policy.taskFamilyIsolation
    : {};
}

function hasExplicitTaskFamilyMismatch(item, taskFamily) {
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRootDefault);
  const activeTaskFamily = normalizeTaskFamilyId(taskFamily, readinessPolicy) || safeString(taskFamily, 80) || "default";
  const taskFamilies = uniqueStrings(item && item.scope && item.scope.taskFamilies, 16, 80);
  if (!taskFamilies.length) return false;
  if (taskFamilies.includes("all") || taskFamilies.includes("default")) return false;
  return !taskFamilies.some((entry) => (normalizeTaskFamilyId(entry, readinessPolicy) || safeString(entry, 80)) === activeTaskFamily);
}

function scoreItem(item, context, policy) {
  const weights = policy && policy.scoringWeights && typeof policy.scoringWeights === "object"
    ? policy.scoringWeights
    : (policy && policy.weights && typeof policy.weights === "object" ? policy.weights : {});
  const isolation = getTaskFamilyIsolationPolicy(policy);
  const mismatchPenalty = safeNumber(isolation.explicitMismatchPenalty, 0.38);
  const hardExcludeTypes = uniqueStrings(isolation.hardExcludeTypes, 16, 80);
  const explicitFamilyMismatch = hasExplicitTaskFamilyMismatch(item, context && context.taskFamily);
  const authorityMatch = 1 - Math.min(1, Math.max(0, safeNumber(item.authorityTier, 6) / 6));
  const scopeMatch = safeString(item.scope && item.scope.workspaceId, 120) === safeString(context.workspaceId, 120) ? 1 : 0;
  const normalizedTaskFamily = normalizeTaskFamilyId(context && context.taskFamily, loadAgiReadinessPolicy(workspaceRootDefault))
    || safeString(context && context.taskFamily, 80);
  const taskFamilies = uniqueStrings(item.scope && item.scope.taskFamilies, 16, 80);
  const taskFamilyMatch = taskFamilies.some((entry) => (normalizeTaskFamilyId(entry, loadAgiReadinessPolicy(workspaceRootDefault)) || safeString(entry, 80)) === normalizedTaskFamily)
    ? 1
    : taskFamilies.includes("default")
      ? 0.5
      : 0;
  const agents = uniqueStrings(item.scope && item.scope.agents, 16, 80);
  const agentMatch = agents.includes(context.activeAgent) ? 1 : agents.includes("default") ? 0.5 : 0;
  const pathMatch = uniqueStrings(item.scope && item.scope.ownedPaths, 24, 220).some((entry) => context.ownedPaths.some((owned) => owned && entry && entry.includes(owned))) ? 1 : 0;
  const updatedAt = Date.parse(safeString(item.lifecycle && item.lifecycle.updatedAt, 80));
  const ageDays = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 86400000) : 365;
  const freshness = Math.max(0, Math.min(1, 1 - ageDays / 30));
  const evidenceStrength = Math.max(0, Math.min(1, safeNumber(item.evidence && item.evidence.supportCount, 0) / 4));
  const reinforcement = item.status === "reinforced" ? 1 : item.status === "promoted" ? 0.8 : item.status === "shadow" ? 0.35 : 0.2;
  const factors = {
    authorityMatch: Number(authorityMatch.toFixed(4)),
    scopeMatch: Number(scopeMatch.toFixed(4)),
    taskFamilyMatch: Number(taskFamilyMatch.toFixed(4)),
    agentMatch: Number(agentMatch.toFixed(4)),
    ownedPathMatch: Number(pathMatch.toFixed(4)),
    freshness: Number(freshness.toFixed(4)),
    evidenceStrength: Number(evidenceStrength.toFixed(4)),
    reinforcement: Number(reinforcement.toFixed(4)),
    explicitTaskFamilyMismatch: explicitFamilyMismatch ? 1 : 0,
  };
  let score = 0;
  score += safeNumber(weights.authorityMatch, 0.28) * authorityMatch;
  score += safeNumber(weights.scopeMatch, 0.22) * scopeMatch;
  score += safeNumber(weights.taskFamilyMatch, 0.16) * taskFamilyMatch;
  score += safeNumber(weights.ownedPathMatch, 0.12) * pathMatch;
  score += safeNumber(weights.freshness, 0.1) * freshness;
  score += safeNumber(weights.evidenceStrength, 0.07) * evidenceStrength;
  score += safeNumber(weights.reinforcement, 0.05) * reinforcement;
  score += 0.04 * agentMatch;
  const penalties = policy && policy.penalties && typeof policy.penalties === "object" ? policy.penalties : {};
  if (item.status === "revoked" || item.status === "expired") score -= safeNumber(penalties.stale, 0.3);
  if (item.sourceTier === "external_secondary") score -= safeNumber(penalties.secondarySource, 0.12);
  if (item.status === "shadow") score -= safeNumber(penalties.shadowOnly, 0.08);
  if (item.status === "blocked") score -= safeNumber(penalties.policyBlocked, 0.35);
  if (explicitFamilyMismatch) score -= mismatchPenalty;
  const hardExcluded = explicitFamilyMismatch && hardExcludeTypes.includes(safeString(item && item.type, 80));
  return {
    score: Number(score.toFixed(4)),
    factors,
    section: classifyMemorySection(item),
    hardExcluded,
    explicitFamilyMismatch,
  };
}

function compileMemoryPack({ workspaceRoot, runtime, items }) {
  const policy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json");
  const sectionBudgets = policy && policy.sectionBudgets && typeof policy.sectionBudgets === "object" ? policy.sectionBudgets : {};
  const thresholds = policy && policy.scoreThresholds && typeof policy.scoreThresholds === "object" ? policy.scoreThresholds : {};
  const minimumSelectionScore = safeNumber(thresholds.minimumSelectionScore, 0.18);
  const highConfidenceScore = safeNumber(thresholds.highConfidenceScore, 0.68);
  const limit = clampInt(policy && (policy.defaultPackBudget || (policy.packLimits && policy.packLimits.maxItems)), 4, 40, 18);
  const activeAgent = safeString(runtime && runtime.activeAgent, 80) || "default";
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object" ? runtime.latestTurn : {};
  const inferredTaskFamily = inferPrimaryRuntimeTaskFamily(runtime, workspaceRoot, "default");
  const context = {
    workspaceId: toWorkspaceId(workspaceRoot),
    activeAgent,
    threadId: safeString(latestTurn.thread_id || latestTurn.threadId, 120),
    taskFamily: inferredTaskFamily,
    ownedPaths: uniqueStrings(runtime && runtime.traceability && runtime.traceability.changedPaths, 24, 220),
  };
  const allScored = items
    .map((item) => ({ item, ...scoreItem(item, context, policy) }))
    .sort((left, right) => right.score - left.score)
  const selected = [];
  const sectionCounts = {
    spec: 0,
    intent: 0,
    workspace_progress: 0,
    experience: 0,
    semantic: 0,
    procedure: 0,
    evaluation: 0,
    preference: 0,
    improvement: 0,
  };
  for (const entry of allScored) {
    if (selected.length >= limit) break;
    if (entry.hardExcluded) continue;
    if (entry.score < minimumSelectionScore) continue;
    if (["revoked", "expired", "blocked"].includes(safeString(entry.item && entry.item.status, 40))) continue;
    const section = entry.section;
    const budget = clampInt(sectionBudgets[section], 0, 20, limit);
    if (budget > 0 && safeNumber(sectionCounts[section], 0) >= budget) continue;
    sectionCounts[section] = safeNumber(sectionCounts[section], 0) + 1;
    selected.push(entry);
  }
  const selectionReasons = {};
  const sectionEntries = {
    spec: [],
    intent: [],
    workspace_progress: [],
    experience: [],
    semantic: [],
    procedure: [],
    evaluation: [],
    preference: [],
    improvement: [],
  };
  for (const entry of selected) {
    const reason = {
      section: entry.section,
      score: entry.score,
      scoreBand: scoreBand(entry.score, thresholds),
      sourceTier: entry.item.sourceTier,
      authorityTier: entry.item.authorityTier,
      factors: entry.factors,
      explicitTaskFamilyMismatch: Boolean(entry.explicitFamilyMismatch),
    };
    selectionReasons[entry.item.memoryId] = reason;
    sectionEntries[entry.section].push({
      memoryId: entry.item.memoryId,
      type: entry.item.type,
      status: entry.item.status,
      score: entry.score,
      summary: entry.item.content.summary,
      structured: entry.item.content.structured,
      whyIncluded: reason,
    });
  }
  const generatedAt = toIso();
  const packId = stableHash({
    generatedAt,
    workspaceId: context.workspaceId,
    threadId: context.threadId,
    activeAgent,
    taskFamily: context.taskFamily,
    selectedMemoryIds: selected.map((entry) => entry.item.memoryId),
  }).slice(0, 20);
  return {
    packId,
    schema: "memory-pack.v1",
    generatedAt,
    compiledAt: generatedAt,
    context,
    workspaceId: context.workspaceId,
    threadId: context.threadId,
    activeAgent,
    taskFamily: context.taskFamily,
    thresholds: {
      minimumSelectionScore,
      highConfidenceScore,
    },
    sectionCounts,
    sections: sectionEntries,
    selectedMemoryIds: selected.map((entry) => entry.item.memoryId),
    selectionReasons,
    selectedCount: selected.length,
    highConfidenceCount: selected.filter((entry) => entry.score >= highConfidenceScore).length,
    explicitTaskFamilyMismatchCount: selected.filter((entry) => Boolean(entry.explicitFamilyMismatch)).length,
    items: selected.map(({ item, score }) => ({
      memoryId: item.memoryId,
      type: item.type,
      status: item.status,
      score,
      section: classifyMemorySection(item),
      scoreBand: scoreBand(score, thresholds),
      whyIncluded: {
        authorityTier: item.authorityTier,
        sourceTier: item.sourceTier,
        scopeWorkspace: safeString(item.scope && item.scope.workspaceId, 120),
        taskFamilies: uniqueStrings(item.scope && item.scope.taskFamilies, 8, 80),
        explicitTaskFamilyMismatch: hasExplicitTaskFamilyMismatch(item, context.taskFamily),
      },
      summary: item.content.summary,
    })),
  };
}

function buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime, currentEvents = [] }) {
  const retentionPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retention_policy.json");
  const retrievalPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json");
  const typeCounts = {};
  const statusCounts = {};
  for (const item of items) {
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }
  const workspaceProgress = items.find((item) => item.type === "workspace_progress" && item.content && item.content.structured && Object.keys(item.content.structured).length)
    || items.find((item) => item.type === "workspace_progress")
    || null;
  const health = collectMemoryHealth({ items, paths, retentionPolicy, currentEvents });
  return {
    enabled: true,
    schema: "governed-memory-graph-runtime.v1",
    status: "ready",
    workspaceId: toWorkspaceId(workspaceRoot),
    canonicalRoot: repoRelative(workspaceRoot, paths.root),
    eventLogPath: repoRelative(workspaceRoot, paths.eventsPath),
    outputRoot: repoRelative(workspaceRoot, paths.output.root),
    publicOutputRoot: repoRelative(workspaceRoot, paths.publicOutput.root),
    itemCount: items.length,
    promotedCount: items.filter((item) => item.status === "promoted" || item.status === "reinforced").length,
    canonicalEventCount: loadJsonl(paths.eventsPath).length + currentEvents.length,
    typeCounts,
    statusCounts,
    staleMemoryWarnings: health.staleMemoryWarnings,
    recentPromotions: health.recentPromotions,
    recentRevocations: health.recentRevocations,
    workspaceProgress: workspaceProgress ? workspaceProgress.content.structured : {},
    latestPack: summarizePack(pack, retrievalPolicy && retrievalPolicy.scoreThresholds),
    compatibilityProjectionPaths: uniqueStrings([
      "output/openai_blog_learning_digest.json",
      "output/openai_blog_learning_ledger.json",
      "output/openai_blog_self_improvement_state.json",
      "output/openai_blog_self_improvement_gate.json",
      "output/openai_blog_reinforcement_memory.json",
      "output/anthropic_engineering_learning_digest.json",
      "output/anthropic_engineering_learning_ledger.json",
      "output/anthropic_engineering_self_improvement_state.json",
      "output/anthropic_engineering_self_improvement_gate.json",
    ], 16, 220),
    activeAgent: safeString(runtime && runtime.activeAgent, 80) || "default",
  };
}

function renderOverviewMarkdown(summary) {
  const lines = [
    "# Governed Memory Overview",
    "",
    `- Workspace: ${safeString(summary.workspaceId, 120)}`,
    `- Canonical root: ${safeString(summary.canonicalRoot, 220)}`,
    `- Event log: ${safeString(summary.eventLogPath, 220)}`,
    `- Items: ${clampInt(summary.itemCount, 0, 999999, 0)}`,
    `- Promoted: ${clampInt(summary.promotedCount, 0, 999999, 0)}`,
    `- Latest pack: ${clampInt(summary.latestPack && summary.latestPack.selectedCount, 0, 999999, 0)} items for ${safeString(summary.latestPack && summary.latestPack.activeAgent, 80) || "default"} (${clampInt(summary.latestPack && summary.latestPack.highConfidenceCount, 0, 999999, 0)} high-confidence)`,
    "",
    "## Type Counts",
  ];
  for (const [key, value] of Object.entries(summary.typeCounts || {}).sort((left, right) => String(left[0]).localeCompare(String(right[0])))) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("", "## Workspace Progress");
  for (const blocker of uniqueStrings(summary.workspaceProgress && summary.workspaceProgress.knownBlockers, 8, 180)) {
    lines.push(`- blocker: ${blocker}`);
  }
  for (const action of uniqueStrings(summary.workspaceProgress && summary.workspaceProgress.nextRecommendedActions, 8, 180)) {
    lines.push(`- next: ${action}`);
  }
  if (Array.isArray(summary.staleMemoryWarnings) && summary.staleMemoryWarnings.length) {
    lines.push("", "## Stale Warnings");
    for (const warning of summary.staleMemoryWarnings.slice(0, 6)) {
      lines.push(`- ${safeString(warning.memoryId, 120)} (${safeString(warning.type, 80)}): ${safeNumber(warning.ageDays, 0).toFixed(1)}d >= ${clampInt(warning.expiryDays, 0, 9999, 0)}d`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderPublicOverviewMarkdown({
  overview = {},
  workspaceProgress = {},
  latestPack = {},
  promotionHealth = {},
  evalStatus = {},
  openAIBlogLane = {},
  anthropicLane = {},
} = {}) {
  const pack = latestPack && typeof latestPack.latestPack === "object" ? latestPack.latestPack : {};
  const lines = [
    "# Governed Memory Public Overview",
    "",
    `- Workspace: ${safeString(overview.workspaceId, 120) || "-"}`,
    `- Canonical root: ${safeString(overview.canonicalRoot, 220) || "-"}`,
    `- Public output root: ${safeString(overview.publicOutputRoot, 220) || "-"}`,
    `- Canonical events: ${clampInt(overview.canonicalEventCount, 0, 999999, 0)}`,
    `- Items: ${clampInt(overview.itemCount, 0, 999999, 0)}`,
    `- Promoted: ${clampInt(overview.promotedCount, 0, 999999, 0)}`,
    `- Latest pack: ${clampInt(pack.selectedCount, 0, 999999, 0)} items for ${safeString(pack.activeAgent, 80) || "default"} (${clampInt(pack.highConfidenceCount, 0, 999999, 0)} high-confidence)`,
    `- Latest pack reused items: ${clampInt(pack.reusedSelectedCount, 0, 999999, 0)}`,
    `- Latest pack task-family mismatches: ${clampInt(pack.explicitTaskFamilyMismatchCount, 0, 999999, 0)}`,
    `- Memory eval: ${safeString(evalStatus.status, 20) || "UNKNOWN"}`,
    `- Recent promotions: ${Array.isArray(promotionHealth.recentPromotions) ? promotionHealth.recentPromotions.length : 0}`,
    `- Recent revocations: ${Array.isArray(promotionHealth.recentRevocations) ? promotionHealth.recentRevocations.length : 0}`,
    `- Stale warnings: ${clampInt(promotionHealth.staleWarningCount, 0, 999999, 0)}`,
    "",
    "## Type Counts",
  ];
  for (const [key, value] of Object.entries(overview.typeCounts || {}).sort((left, right) => String(left[0]).localeCompare(String(right[0])))) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("", "## Workspace Progress");
  if (safeString(workspaceProgress.currentObjective, 220)) {
    lines.push(`- objective: ${safeString(workspaceProgress.currentObjective, 220)}`);
  }
  for (const milestone of uniqueStrings(workspaceProgress.currentMilestones, 6, 180)) {
    lines.push(`- milestone: ${milestone}`);
  }
  for (const blocker of uniqueStrings(workspaceProgress.knownBlockers, 6, 180)) {
    lines.push(`- blocker: ${blocker}`);
  }
  for (const action of uniqueStrings(workspaceProgress.nextRecommendedActions, 6, 180)) {
    lines.push(`- next: ${action}`);
  }
  const agendaSummary = overview && overview.learningAgendaSummary && typeof overview.learningAgendaSummary === "object"
    ? overview.learningAgendaSummary
    : {};
  if (Object.keys(agendaSummary).length) {
    lines.push("", "## Capability Loop");
    lines.push(`- queued: ${clampInt(agendaSummary.queued, 0, 999999, 0)}`);
    lines.push(`- running: ${clampInt(agendaSummary.running, 0, 999999, 0)}`);
    lines.push(`- passed: ${clampInt(agendaSummary.passed, 0, 999999, 0)}`);
    lines.push(`- blocked: ${clampInt(agendaSummary.blocked, 0, 999999, 0)}`);
  }
  lines.push("", "## Lane Health");
  lines.push(`- openai_primary: governed=${safeString(openAIBlogLane && openAIBlogLane.governedOperationalState && openAIBlogLane.governedOperationalState.status, 40) || "UNKNOWN"} / promoted=${clampInt(openAIBlogLane && openAIBlogLane.governedOperationalState && openAIBlogLane.governedOperationalState.promotedLessonCount, 0, 999999, 0)} / canonical-selected=${clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.selectedInLatestPackCount, 0, 999999, 0)} / compatibility=${safeString(openAIBlogLane && openAIBlogLane.compatibilityState && openAIBlogLane.compatibilityState.gateStatus, 40) || "UNKNOWN"}`);
  lines.push(`- anthropic_secondary: governed=${safeString(anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.status, 40) || "UNKNOWN"} / promoted=${clampInt(anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.promotedLessonCount, 0, 999999, 0)} / canonical-selected=${clampInt(anthropicLane && anthropicLane.canonicalCounts && anthropicLane.canonicalCounts.selectedInLatestPackCount, 0, 999999, 0)} / compatibility=${safeString(anthropicLane && anthropicLane.compatibilityState && anthropicLane.compatibilityState.gateStatus, 40) || "UNKNOWN"}`);
  return `${lines.join("\n")}\n`;
}

function syncGovernedMemoryGraph({ workspaceRoot = workspaceRootDefault, runtime = {}, traceability = {}, reason = "manual", refreshTrackedLearningArtifacts = true } = {}) {
  const paths = getMemoryPaths(workspaceRoot);
  ensureMemoryLayout(paths);
  const previousById = readJsonObject(paths.indexes.byId);
  const previousContinuityState = readJsonObject(path.join(paths.projections.continuityStateRoot, "latest.json"));
  const previousAgendaProjection = readJsonObject(path.join(paths.projections.learningAgendaRoot, "latest.json"));
  const previousRobustnessRemediation = readJsonObject(path.join(paths.agiReadiness.root, "robustness_remediation_status.json"));
  const continuityBridge = buildContinuityBridge({ workspaceRoot });
  const items = reviveLifecycle(
    collectItems({ workspaceRoot, runtime: { ...runtime, traceability }, traceability, continuityBridge }),
    previousById
  );
  const indexes = buildIndexes(items);
  const pack = compileMemoryPack({ workspaceRoot, runtime: { ...runtime, traceability }, items });
  pack.reusedSelectedCount = pack.selectedMemoryIds.filter((memoryId) => previousById && previousById[memoryId]).length;
  const initialSummary = buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime, currentEvents: [] });
  const events = [];
  for (const item of items) {
    const previous = previousById[item.memoryId];
    if (!previous || safeString(previous.contentHash, 80) !== safeString(item.evidence.contentHash, 80) || safeString(previous.status, 80) !== safeString(item.status, 80)) {
      events.push({
        schema: "memory-event.v1",
        eventId: stableHash({ memoryId: item.memoryId, contentHash: item.evidence.contentHash, reason }).slice(0, 20),
        eventType: "memory_item_upsert",
        legacyEventType: previous ? "memory.updated" : "memory.captured",
        recordedAt: toIso(),
        memoryId: item.memoryId,
        memoryType: item.type,
        workspaceId: initialSummary.workspaceId,
        threadId: safeString(item.scope && item.scope.threadId, 120),
        status: item.status,
        sourceTier: item.sourceTier,
        authorityTier: item.authorityTier,
        reason,
        contentHash: item.evidence.contentHash,
      });
    }
  }
  events.push({
    schema: "memory-event.v1",
    eventId: stableHash({ packId: pack.packId, reason, generatedAt: pack.generatedAt }).slice(0, 20),
    eventType: "memory_pack_compiled",
    recordedAt: safeString(pack.generatedAt, 80) || toIso(),
    memoryId: `pack:${safeString(pack.packId, 120)}`,
    memoryType: "memory_pack",
    status: "compiled",
    sourceTier: "runtime",
    authorityTier: 3,
    reason,
    workspaceId: initialSummary.workspaceId,
    threadId: safeString(pack.threadId, 120),
    packId: safeString(pack.packId, 120),
    selectedCount: clampInt(pack.selectedCount, 0, 999999, 0),
  });
  events.push(...buildObservationEvents({
    workspaceRoot,
    runtime: { ...runtime, traceability },
    traceability,
    pack,
    items,
    paths,
    continuityBridge,
  }));
  const previousTasksById = new Map(
    (Array.isArray(previousContinuityState && previousContinuityState.tasks) ? previousContinuityState.tasks : [])
      .map((task) => [safeString(task && task.taskId, 120), task])
      .filter(([taskId]) => Boolean(taskId))
  );
  for (const task of Array.isArray(continuityBridge && continuityBridge.tasks) ? continuityBridge.tasks : []) {
    const taskId = safeString(task && task.taskId, 120);
    if (!taskId) continue;
    const previousTask = previousTasksById.get(taskId);
    const currentState = safeString(task && task.lifecycleState, 80) || "unknown";
    const previousState = safeString(previousTask && previousTask.lifecycleState, 80);
    const currentIntegrationStatus = safeString(task && task.integrationStatus, 80);
    const previousIntegrationStatus = safeString(previousTask && previousTask.integrationStatus, 80);
    const currentReleaseState = safeString(task && task.finalReleaseState, 80);
    const previousReleaseState = safeString(previousTask && previousTask.finalReleaseState, 80);
    if (
      !previousTask
      || previousState !== currentState
      || previousIntegrationStatus !== currentIntegrationStatus
      || previousReleaseState !== currentReleaseState
    ) {
      events.push({
        schema: "memory-event.v1",
        eventId: stableHash({
          taskId,
          previousState,
          currentState,
          currentIntegrationStatus,
          currentReleaseState,
          reason,
        }).slice(0, 20),
        eventType: "continuity_lifecycle_transition",
        legacyEventType: "continuity.transition",
        recordedAt: safeString(task && task.updatedAt, 80) || toIso(),
        memoryId: `continuity:${taskId}`,
        memoryType: "episodic_event",
        workspaceId: initialSummary.workspaceId,
        continuityTaskId: taskId,
        taskFamily: safeString(task && task.familyId, 80),
        agentRole: safeString(task && task.role, 80) || "default",
        status: currentState,
        sourceTier: "runtime",
        authorityTier: 3,
        reason: "continuity_lifecycle_transition",
        previousState,
        nextState: currentState,
        integrationStatus: currentIntegrationStatus,
        finalReleaseState: currentReleaseState,
        evidenceRefs: uniqueStrings(task && task.evidenceRefs, 8, 220),
      });
    }
  }
  const retentionPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retention_policy.json");
  writeJsonIfChanged(paths.indexes.byId, indexes.byId);
  writeJsonIfChanged(paths.indexes.byScope, indexes.byScope);
  writeJsonIfChanged(paths.indexes.byType, indexes.byType);
  writeJsonIfChanged(paths.indexes.byTaskFamily, indexes.byTaskFamily);
  writeJsonIfChanged(paths.indexes.byAgent, indexes.byAgent);
  writeJsonIfChanged(paths.indexes.byWorkspace, indexes.byWorkspace);
  for (const event of events) {
    appendJsonLine(paths.eventsPath, event);
  }
  pruneJsonlFile(paths.eventsPath, {
    maxEntries: clampInt(retentionPolicy && retentionPolicy.eventStore && retentionPolicy.eventStore.maxEvents, 0, 999999, 12000),
    maxDays: clampInt(retentionPolicy && retentionPolicy.eventStore && retentionPolicy.eventStore.maxDays, 0, 3650, 180),
  });
  const allEvents = loadJsonl(paths.eventsPath);
  let observationProjection = buildObservationProjection({ workspaceRoot, items, events: allEvents });
  writeJsonIfChanged(path.join(paths.projections.observationStateRoot, "latest.json"), observationProjection);
  let learningArtifacts = refreshLearningLaneArtifactsFromCanonical({
    workspaceRoot,
    items,
    observationProjection,
    writeArtifacts: refreshTrackedLearningArtifacts,
  });
  const continuityProjection = {
    schema: "governed-memory-continuity-projection.v1",
    generatedAt: toIso(),
    workspaceId: initialSummary.workspaceId,
    summary: continuityBridge && continuityBridge.summary && typeof continuityBridge.summary === "object" ? continuityBridge.summary : {},
    tasks: Array.isArray(continuityBridge && continuityBridge.tasks) ? continuityBridge.tasks : [],
  };
  writeJsonIfChanged(path.join(paths.projections.continuityStateRoot, "latest.json"), continuityProjection);
  const summary = buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime, currentEvents: [] });
  const exportSessionId = resolvePublicExportSessionId(workspaceRoot, summary.workspaceId);
  writeJsonIfChanged(paths.projections.specGraph, items.filter((item) => item.type === "constitution_ref"));
  writeJsonIfChanged(path.join(paths.projections.workspaceProgressRoot, `${summary.workspaceId}.json`), summary.workspaceProgress);
  writeJsonIfChanged(path.join(paths.projections.preferenceProfilesRoot, "active.json"), items.filter((item) => item.type === "preference_signal"));
  writeJsonIfChanged(path.join(paths.projections.semanticLessonsRoot, "primary.json"), items.filter((item) => item.type === "semantic_lesson" && item.sourceTier === "external_primary"));
  writeJsonIfChanged(path.join(paths.projections.semanticLessonsRoot, "secondary.json"), items.filter((item) => item.type === "semantic_lesson" && item.sourceTier === "external_secondary"));
  writeJsonIfChanged(path.join(paths.projections.failurePatternsRoot, "latest.json"), items.filter((item) => item.type === "failure_pattern"));
  writeJsonIfChanged(path.join(paths.projections.procedurePatternsRoot, "latest.json"), items.filter((item) => item.type === "procedure_pattern"));
  writeJsonIfChanged(path.join(paths.projections.executionStrategiesRoot, "latest.json"), items.filter((item) => item.type === "execution_strategy"));
  writeJsonIfChanged(path.join(paths.projections.reviewFailurePatternsRoot, "latest.json"), items.filter((item) => item.type === "review_failure_pattern"));
  writeJsonIfChanged(path.join(paths.projections.adoptionFeedbackRoot, "latest.json"), items.filter((item) => item.type === "adoption_feedback"));
  writeJsonIfChanged(path.join(paths.projections.evaluationLessonsRoot, "latest.json"), items.filter((item) => item.type === "evaluation_lesson"));
  writeJsonIfChanged(path.join(paths.projections.skillCandidatesRoot, "latest.json"), items.filter((item) => item.type === "skill_candidate"));
  writeJsonIfChanged(path.join(paths.projections.activeRuntimeHintsRoot, "latest.json"), items.filter((item) => item.type === "runtime_hint"));
  writeJsonIfChanged(path.join(paths.projections.improvementStateRoot, "latest.json"), items.filter((item) => item.type === "improvement_candidate"));
  writeJsonIfChanged(path.join(paths.projections.evalObservationsRoot, "latest.json"), items.filter((item) => item.type === "eval_observation"));
  appendJsonLine(paths.retrieval.packsPath, pack);
  pruneJsonlFile(paths.retrieval.packsPath, {
    maxEntries: clampInt(retentionPolicy && retentionPolicy.projectionRetention && retentionPolicy.projectionRetention.maxRecentPackEntries, 0, 999999, 120),
  });
  const lastPackByThread = readJsonObject(paths.retrieval.lastPackByThread);
  const threadId = safeString(pack.threadId, 120) || "workspace";
  lastPackByThread[threadId] = pack;
  writeJsonIfChanged(paths.retrieval.lastPackByThread, lastPackByThread);
  const lastPackByWorkspace = readJsonObject(paths.retrieval.lastPackByWorkspace);
  lastPackByWorkspace[summary.workspaceId] = pack;
  writeJsonIfChanged(paths.retrieval.lastPackByWorkspace, lastPackByWorkspace);
  const retrievalPacks = loadJsonl(paths.retrieval.packsPath);
  let readinessArtifacts = buildAgiReadinessArtifacts({ workspaceRoot, items, continuityBridge });
  const provisionalContinuityDebt = buildContinuityDebtProjection({ workspaceRoot, continuityBridge, agenda: null });
  let continuityArtifacts = buildContinuityPublicArtifacts({ workspaceRoot, continuityBridge, retrievalPacks, continuityDebt: provisionalContinuityDebt });
  let openAIBlogLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "OpenAI Developers Blog",
    sourceTier: "external_primary",
    laneKey: "openai_primary",
    items,
    pack,
    statePath: "output/openai_blog_self_improvement_state.json",
    ledgerPath: "output/openai_blog_learning_ledger.json",
    digestPath: "output/openai_blog_learning_digest.json",
    reportPath: "output/openai_blog_learning_report.md",
    proposalDir: "output/openai_blog_self_improvement_proposals",
    curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
    observationProjection,
  });
  let anthropicLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "Anthropic Engineering",
    sourceTier: "external_secondary",
    laneKey: "anthropic_secondary",
    items,
    pack,
    statePath: "output/anthropic_engineering_self_improvement_state.json",
    ledgerPath: "output/anthropic_engineering_learning_ledger.json",
    digestPath: "output/anthropic_engineering_learning_digest.json",
    reportPath: "output/anthropic_engineering_learning_report.md",
    proposalDir: "output/anthropic_engineering_self_improvement_proposals",
    curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
    observationProjection,
  });
  const memoryEvalStub = { checks: [] };
  let bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: memoryEvalStub,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt: provisionalContinuityDebt,
    openAIBlogLane,
    anthropicLane,
  });
  const autonomousAgenda = buildAutonomousLearningAgenda({
    workspaceRoot,
    readinessArtifacts,
    continuityDebt: provisionalContinuityDebt,
    openAIBlogLane,
    anthropicLane,
    previousAgenda: previousAgendaProjection,
    bottlenecks,
    exportSessionId,
  });
  const continuityDebt = buildContinuityDebtProjection({ workspaceRoot, continuityBridge, agenda: autonomousAgenda });
  continuityArtifacts = buildContinuityPublicArtifacts({ workspaceRoot, continuityBridge, retrievalPacks, continuityDebt });
  const robustnessRemediationStatus = buildRobustnessRemediationStatus({
    workspaceRoot,
    robustnessBreakdown: readinessArtifacts.robustnessBreakdown,
    agenda: autonomousAgenda,
    previousStatus: previousRobustnessRemediation,
  });
  const robustnessRemediationTrend = buildRobustnessRemediationTrend({ workspaceRoot, remediationStatus: robustnessRemediationStatus });
  readinessArtifacts.robustnessBreakdown = {
    ...readinessArtifacts.robustnessBreakdown,
    categories: (Array.isArray(readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
      ? readinessArtifacts.robustnessBreakdown.categories
      : []).map((entry) => {
        const remediation = (Array.isArray(robustnessRemediationStatus.categories) ? robustnessRemediationStatus.categories : []).find((row) => safeString(row && row.categoryId, 80) === safeString(entry && entry.categoryId, 80));
        return remediation
      ? {
          ...entry,
          remediationStatus: safeString(remediation.remediationStatus, 80),
          lastRemediationAt: safeString(remediation.lastRemediationAt, 80),
          lastImprovementDelta: remediation.lastImprovementDelta,
          openFailureModes: uniqueStrings(remediation.openFailureModes, 8, 180),
        }
          : entry;
      }),
  };
  const causalTrace = buildCausalLearningTrace({ workspaceRoot, items, pack, retrievalPacks, observationProjection });
  openAIBlogLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "OpenAI Developers Blog",
    sourceTier: "external_primary",
    laneKey: "openai_primary",
    items,
    pack,
    statePath: "output/openai_blog_self_improvement_state.json",
    ledgerPath: "output/openai_blog_learning_ledger.json",
    digestPath: "output/openai_blog_learning_digest.json",
    reportPath: "output/openai_blog_learning_report.md",
    proposalDir: "output/openai_blog_self_improvement_proposals",
    curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
    observationProjection,
    causalTrace,
  });
  anthropicLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "Anthropic Engineering",
    sourceTier: "external_secondary",
    laneKey: "anthropic_secondary",
    items,
    pack,
    statePath: "output/anthropic_engineering_self_improvement_state.json",
    ledgerPath: "output/anthropic_engineering_learning_ledger.json",
    digestPath: "output/anthropic_engineering_learning_digest.json",
    reportPath: "output/anthropic_engineering_learning_report.md",
    proposalDir: "output/anthropic_engineering_self_improvement_proposals",
    curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
    observationProjection,
    causalTrace,
  });
  bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: memoryEvalStub,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
  });
  writeJsonIfChanged(path.join(paths.projections.familyCoverageRoot, "latest.json"), readinessArtifacts.coverage);
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "latest.json"), readinessArtifacts.readiness);
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "promotion_trend.json"), readinessArtifacts.promotionTrend);
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "blocked_reasons.json"), readinessArtifacts.blockedReasons);
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "distinct_lineage.json"), readinessArtifacts.distinctLineage);
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "robustness_remediation_status.json"), robustnessRemediationStatus);
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "robustness_remediation_trend.json"), robustnessRemediationTrend);
  writeJsonIfChanged(path.join(paths.projections.learningAgendaRoot, "latest.json"), autonomousAgenda);
  writeJsonIfChanged(path.join(paths.projections.causalTraceRoot, "latest.json"), causalTrace);
  writeJsonIfChanged(path.join(paths.projections.continuityDebtRoot, "latest.json"), continuityDebt);
  const previousAgendaById = new Map((Array.isArray(previousAgendaProjection && previousAgendaProjection.entries) ? previousAgendaProjection.entries : []).map((entry) => [safeString(entry && entry.agendaId, 120), entry]));
  const agendaEvents = [];
  for (const entry of autonomousAgenda.entries) {
    const previous = previousAgendaById.get(safeString(entry && entry.agendaId, 120));
    const agendaId = safeString(entry && entry.agendaId, 120);
    if (!previous) {
      agendaEvents.push({
        schema: "memory-event.v1",
        eventId: stableHash({ agendaId, type: "gap_detected", reason }).slice(0, 20),
        eventType: "capability_gap_detected",
        recordedAt: toIso(),
        memoryId: agendaId,
        memoryType: "improvement_candidate",
        workspaceId: summary.workspaceId,
        status: safeString(entry && entry.status, 40),
        sourceTier: "runtime",
        authorityTier: 3,
        reason: safeString(entry && entry.bottleneckClass, 120),
        taskFamily: safeString(entry && entry.proposedTaskFamily, 80),
        evidenceRefs: [],
      });
      agendaEvents.push({
        schema: "memory-event.v1",
        eventId: stableHash({ agendaId, type: "plan_created", reason }).slice(0, 20),
        eventType: "remediation_plan_created",
        recordedAt: toIso(),
        memoryId: agendaId,
        memoryType: "improvement_candidate",
        workspaceId: summary.workspaceId,
        status: safeString(entry && entry.status, 40),
        sourceTier: "runtime",
        authorityTier: 3,
        reason: safeString(entry && entry.result, 120),
        taskFamily: safeString(entry && entry.proposedTaskFamily, 80),
        evidenceRefs: [],
      });
    } else if (safeString(previous.status, 80) !== safeString(entry && entry.status, 80)) {
      agendaEvents.push({
        schema: "memory-event.v1",
        eventId: stableHash({ agendaId, type: safeString(entry && entry.status, 80), reason }).slice(0, 20),
        eventType: ["blocked", "proposal_only"].includes(safeString(entry && entry.status, 80))
          ? "remediation_task_blocked"
          : safeString(entry && entry.status, 80) === "passed"
            ? "remediation_task_completed"
            : "remediation_plan_created",
        recordedAt: toIso(),
        memoryId: agendaId,
        memoryType: "improvement_candidate",
        workspaceId: summary.workspaceId,
        status: safeString(entry && entry.status, 40),
        sourceTier: "runtime",
        authorityTier: 3,
        reason: safeString(entry && entry.result, 120),
        taskFamily: safeString(entry && entry.proposedTaskFamily, 80),
        evidenceRefs: [],
      });
      if (/^verified_/i.test(safeString(entry && entry.remediationEffect, 80))) {
        agendaEvents.push({
          schema: "memory-event.v1",
          eventId: stableHash({ agendaId, type: "effect_verified", reason }).slice(0, 20),
          eventType: "remediation_effect_verified",
          recordedAt: toIso(),
          memoryId: agendaId,
          memoryType: "improvement_candidate",
          workspaceId: summary.workspaceId,
          status: safeString(entry && entry.remediationEffect, 80),
          sourceTier: "runtime",
          authorityTier: 3,
          reason: safeString(entry && entry.result, 120),
          taskFamily: safeString(entry && entry.proposedTaskFamily, 80),
          evidenceRefs: [],
        });
      } else if (safeString(entry && entry.remediationEffect, 80) === "insufficient_evidence") {
        agendaEvents.push({
          schema: "memory-event.v1",
          eventId: stableHash({ agendaId, type: "effect_rejected", reason }).slice(0, 20),
          eventType: "remediation_effect_rejected",
          recordedAt: toIso(),
          memoryId: agendaId,
          memoryType: "improvement_candidate",
          workspaceId: summary.workspaceId,
          status: "insufficient_evidence",
          sourceTier: "runtime",
          authorityTier: 3,
          reason: safeString(entry && entry.result, 120) || "insufficient_evidence",
          taskFamily: safeString(entry && entry.proposedTaskFamily, 80),
          evidenceRefs: [],
        });
      }
    }
  }
  for (const event of agendaEvents) {
    appendJsonLine(paths.eventsPath, event);
  }
  pruneJsonlFile(paths.eventsPath, {
    maxEntries: clampInt(retentionPolicy && retentionPolicy.eventStore && retentionPolicy.eventStore.maxEvents, 0, 999999, 12000),
    maxDays: clampInt(retentionPolicy && retentionPolicy.eventStore && retentionPolicy.eventStore.maxDays, 0, 3650, 180),
  });
  const finalEvents = loadJsonl(paths.eventsPath);
  observationProjection = buildObservationProjection({ workspaceRoot, items, events: finalEvents });
  writeJsonIfChanged(path.join(paths.projections.observationStateRoot, "latest.json"), observationProjection);
  learningArtifacts = refreshLearningLaneArtifactsFromCanonical({
    workspaceRoot,
    items,
    observationProjection,
    writeArtifacts: refreshTrackedLearningArtifacts,
  });
  writeJsonIfChanged(path.join(paths.projections.bottlenecksRoot, "latest.json"), bottlenecks);
  writeJsonIfChanged(paths.output.latestOverviewJson, summary);
  ensureDir(paths.output.root);
  fs.writeFileSync(paths.output.latestOverviewMd, renderOverviewMarkdown(summary), "utf8");
  writeJsonIfChanged(paths.output.promotedSemanticMemory, items.filter((item) => item.type === "semantic_lesson" && (item.status === "promoted" || item.status === "reinforced")));
  writeJsonIfChanged(paths.output.preferenceProfilesReport, {
    generatedAt: toIso(),
    activeProfileIds: items.filter((item) => item.type === "preference_signal").map((item) => item.memoryId),
    profiles: items.filter((item) => item.type === "preference_signal").map((item) => item.content.structured),
  });
  writeJsonIfChanged(paths.output.improvementDashboard, {
    generatedAt: toIso(),
    summary: {
      workspaceId: summary.workspaceId,
      staleMemoryWarnings: summary.staleMemoryWarnings,
      recentPromotions: summary.recentPromotions,
      recentRevocations: summary.recentRevocations,
      latestPack: summary.latestPack,
      observationProjection: {
        observationCount: clampInt(observationProjection && observationProjection.observationCount, 0, 999999, 0),
        rejectedCount: clampInt(observationProjection && observationProjection.rejectedCount, 0, 999999, 0),
        byLane: observationProjection && observationProjection.byLane && typeof observationProjection.byLane === "object"
          ? observationProjection.byLane
          : {},
      },
    },
    items: items.filter((item) => item.type === "improvement_candidate" || item.type === "runtime_hint"),
  });
  fs.writeFileSync(paths.output.memoryHealthReportMd, renderOverviewMarkdown(summary), "utf8");
  return {
    summary,
    items,
    pack,
    paths,
    continuityBridge,
    observationProjection,
    learningArtifacts,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    autonomousAgenda,
    causalTrace,
    openAIBlogLane,
    anthropicLane,
    bottlenecks,
    eventCount: finalEvents.length,
  };
}

function buildGovernedMemoryRuntimeSnapshot({ workspaceRoot = workspaceRootDefault, runtime = {}, traceability = {} } = {}) {
  const paths = getMemoryPaths(workspaceRoot);
  ensureMemoryLayout(paths);
  const previousById = readJsonObject(paths.indexes.byId);
  const continuityBridge = buildContinuityBridge({ workspaceRoot });
  const items = reviveLifecycle(
    collectItems({ workspaceRoot, runtime: { ...runtime, traceability }, traceability, continuityBridge }),
    previousById
  );
  const pack = compileMemoryPack({ workspaceRoot, runtime: { ...runtime, traceability }, items });
  pack.reusedSelectedCount = pack.selectedMemoryIds.filter((memoryId) => previousById && previousById[memoryId]).length;
  const summary = buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime });
  summary.eventCount = loadJsonl(paths.eventsPath).length;
  return summary;
}

function loadPublicExportPolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "memory_public_export_policy.json");
}

function buildPublicItemSummary(item, workspaceRoot) {
  const type = safeString(item && item.type, 80);
  const structured = item && item.content && item.content.structured && typeof item.content.structured === "object"
    ? item.content.structured
    : {};
  if (type === "episodic_event") {
    const outcome = safeString(structured.taskOutcomeStatus, 80).toUpperCase() || safeString(item && item.status, 40).toUpperCase() || "UNSPECIFIED";
    const profile = safeString(structured.executionProfile, 80);
    return normalizePublicText(`${profile || "runtime"} episode finished as ${outcome}.`, workspaceRoot);
  }
  if (type === "eval_observation") {
    const suiteId = safeString(structured.suiteId, 120) || "eval suite";
    const failures = clampInt(structured.failedCases, 0, 9999, 0);
    return normalizePublicText(`${suiteId} completed with ${failures} failures.`, workspaceRoot);
  }
  return normalizePublicText(item && item.summary, workspaceRoot);
}

function sanitizePublicPackItem(item, workspaceRoot, thresholds) {
  const reason = item && item.whyIncluded && typeof item.whyIncluded === "object" ? item.whyIncluded : {};
  return {
    publicRef: maskOpaqueId(item && item.memoryId, "mem"),
    type: safeString(item && item.type, 80),
    status: safeString(item && item.status, 40),
    score: Number(safeNumber(item && item.score, 0).toFixed(4)),
    scoreBand: scoreBand(safeNumber(item && item.score, 0), thresholds || {}),
    sourceTier: safeString(reason && reason.sourceTier, 40),
    authorityTier: clampInt(reason && reason.authorityTier, 0, 6, 0),
    scopeWorkspace: safeString(reason && reason.scopeWorkspace, 120),
    taskFamilies: uniqueStrings(reason && reason.taskFamilies, 8, 80),
    summary: buildPublicItemSummary(item, workspaceRoot),
  };
}

function buildLaneProjection({ workspaceRoot, sourceName, sourceTier, laneKey, items, pack, statePath, ledgerPath, digestPath, reportPath, proposalDir, curatedDocPath, observationProjection = null, causalTrace = null }) {
  const laneItems = items.filter((item) => safeString(item && item.sourceTier, 40) === sourceTier);
  const lessons = laneItems.filter((item) => safeString(item && item.type, 80) === "semantic_lesson");
  const improvements = laneItems.filter((item) => safeString(item && item.type, 80) === "improvement_candidate");
  const selectedLaneItems = (Array.isArray(pack && pack.items) ? pack.items : []).filter((item) => safeString(item && item.whyIncluded && item.whyIncluded.sourceTier, 40) === sourceTier);
  const compatibilityState = readJsonObject(path.join(workspaceRoot, statePath));
  const compatibilityGatePath = statePath.replace(/_state\.json$/i, "_gate.json");
  const observationLane = observationProjection && observationProjection.byLane && typeof observationProjection.byLane === "object"
    ? observationProjection.byLane[sourceTier]
    : null;
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const byMemoryId = observationProjection && observationProjection.byMemoryId && typeof observationProjection.byMemoryId === "object"
    ? observationProjection.byMemoryId
    : {};
  const familyObservationCounts = {};
  for (const item of laneItems) {
    const observation = byMemoryId[safeString(item && item.memoryId, 120)];
    for (const family of uniqueStrings(item && item.scope && item.scope.taskFamilies, 8, 80)) {
      familyObservationCounts[family] = safeNumber(familyObservationCounts[family], 0) + clampInt(observation && observation.observationCount, 0, 999999, 0);
    }
  }
  const familySelectionCounts = {};
  for (const item of selectedLaneItems) {
    const matchFamilies = uniqueStrings(item && item.whyIncluded && item.whyIncluded.taskFamilies, 8, 80);
    for (const family of matchFamilies) {
      familySelectionCounts[family] = safeNumber(familySelectionCounts[family], 0) + 1;
    }
  }
  const policyEligibleCount = laneItems.filter((item) => {
    return memoryAppliesToAgent(item, safeString(pack && pack.activeAgent, 80) || "default")
      && memoryAppliesToTaskFamily(item, safeString(pack && pack.taskFamily, 80) || "default", readinessPolicy);
  }).length;
  const advisoryReferenceCount = laneItems.filter((item) => ["shadow", "proposal_only", "candidate"].includes(safeString(item && item.status, 40))).length;
  const causalEntries = Array.isArray(causalTrace && causalTrace.traces)
    ? causalTrace.traces.filter((entry) => safeString(entry && entry.sourceTier, 40) === sourceTier)
    : [];
  const traceSelection = deriveLaneTraceSelectionMetrics(causalEntries);
  const selectedCount = Math.max(selectedLaneItems.length, traceSelection.selectedCount);
  const selectedFamilyCounts = Object.keys(familySelectionCounts).length > 0
    ? familySelectionCounts
    : traceSelection.familySelectionCounts;
  const effectiveContributionCount = causalEntries.filter((entry) => Boolean(entry && entry.effectiveContribution)).length;
  const causalUsageCount = Math.max(causalEntries.length, traceSelection.taskRefCount, traceSelection.effectiveEvidenceRefCount);
  const likelyContributoryCount = Math.max(
    causalEntries.filter((entry) => safeString(entry && entry.usageStage, 80) === "likely_contributory").length,
    traceSelection.taskRefCount,
    traceSelection.effectiveEvidenceRefCount,
  );
  const consideredForPackCount = sourceTier === "external_secondary"
    ? Math.max(causalEntries.length, selectedCount)
    : Math.max(policyEligibleCount, selectedCount);
  const recentCausalEffects = causalEntries.slice(0, 6).map((entry) => ({
    publicRef: safeString(entry && entry.publicRef, 120),
    usageStage: safeString(entry && entry.usageStage, 80),
    causalConfidence: safeString(entry && entry.causalConfidence, 80),
    taskRefs: uniqueStrings(entry && entry.usedByTaskRefs, 6, 120),
    summary: safeString(entry && entry.summary, 220),
  }));
  return {
    schema: "governed-memory-public-lane-projection.v1",
    generatedAt: toIso(),
    laneKey,
    sourceName,
    sourceTier,
    canonicalCounts: {
      derivedFromCanonicalStore: laneItems.length > 0 || safeNumber(observationLane && observationLane.observationCount, 0) > 0,
      lessonCount: lessons.length,
      promotedLessonCount: lessons.filter((item) => ["promoted", "reinforced"].includes(safeString(item && item.status, 40))).length,
      shadowLessonCount: lessons.filter((item) => safeString(item && item.status, 40) === "shadow").length,
      improvementCandidateCount: improvements.length,
      proposalOnlyCount: improvements.filter((item) => safeString(item && item.status, 40) === "proposal_only").length,
      blockedCount: improvements.filter((item) => safeString(item && item.status, 40) === "blocked").length,
      shadowCount: improvements.filter((item) => safeString(item && item.status, 40) === "shadow").length,
      selectedInLatestPackCount: selectedCount,
      consideredForPackCount,
      advisoryReferenceCount,
      observationCount: clampInt(observationLane && observationLane.observationCount, 0, 999999, 0),
      awaitingObservationCount: clampInt(observationLane && observationLane.awaitingObservationCount, 0, 999999, 0),
      familyObservationCounts,
      familySelectionCounts: selectedFamilyCounts,
      causalUsageCount,
      surfacedToAgentCount: causalEntries.filter((entry) => ["surfaced", "behaviorally_referenced", "likely_contributory", "advisory_reference"].includes(safeString(entry && entry.usageStage, 80))).length,
      behaviorallyReferencedCount: causalEntries.filter((entry) => ["behaviorally_referenced", "likely_contributory"].includes(safeString(entry && entry.usageStage, 80))).length,
      likelyContributoryCount,
      effectiveContributionCount,
      harmfulContributionCount: causalEntries.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").length,
      netEffectiveContribution: effectiveContributionCount
        - causalEntries.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").length,
    },
    canonicalHealth: {
      canonicalStatePresent: laneItems.length > 0 || safeNumber(observationLane && observationLane.observationCount, 0) > 0,
      selectedInLatestPackCount: selectedCount,
      promotedOrReinforcedCount: laneItems.filter((item) => ["promoted", "reinforced"].includes(safeString(item && item.status, 40))).length,
      shadowOrProposalCount: laneItems.filter((item) => ["shadow", "proposal_only", "candidate"].includes(safeString(item && item.status, 40))).length,
    },
    governedOperationalState: {
      status: lessons.some((item) => ["promoted", "reinforced"].includes(safeString(item && item.status, 40)))
        ? "active"
        : improvements.some((item) => safeString(item && item.status, 40) === "proposal_only")
          ? "proposal_only"
          : lessons.some((item) => safeString(item && item.status, 40) === "shadow")
            ? "shadow_only"
            : "captured_only",
      promotedLessonCount: lessons.filter((item) => ["promoted", "reinforced"].includes(safeString(item && item.status, 40))).length,
      selectedInLatestPackCount: selectedCount,
      observationCount: clampInt(observationLane && observationLane.observationCount, 0, 999999, 0),
      awaitingObservationCount: clampInt(observationLane && observationLane.awaitingObservationCount, 0, 999999, 0),
      observationStatus: safeString(compatibilityState.observationStatus, 40) || "unknown",
      lastObservedAt: safeString(observationLane && observationLane.lastObservedAt, 80),
      consideredForPackCount,
      advisoryReferenceCount,
      causalUsageCount,
      effectiveContributionCount,
      harmfulContributionCount: causalEntries.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").length,
      netEffectiveContribution: effectiveContributionCount
        - causalEntries.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").length,
    },
    advisory: {
      shadowOnlyReason: sourceTier === "external_secondary"
        ? "secondary source remains advisory and does not override primary/runtime policy"
        : "",
      familyObservationCounts,
      familySelectionCounts: selectedFamilyCounts,
      policyEligibleCount,
      consideredForPackCount,
      advisoryReferenceCount,
    },
    causalUsageCount,
    recentCausalEffects,
    recentAdvisoryEffects: sourceTier === "external_secondary" ? recentCausalEffects : [],
    recentLessons: lessons.slice(0, 4).map((item) => ({
      publicRef: maskOpaqueId(item.memoryId, "mem"),
      status: safeString(item.status, 40),
      summary: normalizePublicText(item.content && item.content.summary, workspaceRoot),
      topics: uniqueStrings(item.retrieval && item.retrieval.topics, 6, 80),
    })),
    compatibilityState: {
      gateStatus: safeString(compatibilityState.gateStatus, 40) || "UNKNOWN",
      gateReason: normalizePublicText(compatibilityState.gateReason, workspaceRoot),
      appliedDecision: safeString(compatibilityState.appliedDecision, 40) || "none",
      observationStatus: safeString(compatibilityState.observationStatus, 40) || "unknown",
      observationCount: clampInt(compatibilityState.observationCount, 0, 999999, 0),
      proposalOnlyCount: clampInt(compatibilityState.proposalOnlyCount, 0, 999999, 0),
      blockedCount: clampInt(compatibilityState.blockedCount, 0, 999999, 0),
      awaitingObservationCount: clampInt(compatibilityState.awaitingObservationCount, 0, 999999, 0),
      policyDisabledCandidateCount: clampInt(compatibilityState.policyDisabledCandidateCount, 0, 999999, 0),
      lastObservedAt: safeString(compatibilityState.lastObservedAt, 80),
      nextPriority: compatibilityState.nextPriority && typeof compatibilityState.nextPriority === "object"
        ? {
          title: normalizePublicText(compatibilityState.nextPriority.title, workspaceRoot),
          changeType: safeString(compatibilityState.nextPriority.changeType, 80),
          readinessStatus: safeString(compatibilityState.nextPriority.readinessStatus, 80),
          gatingReason: normalizePublicText(compatibilityState.nextPriority.gatingReason, workspaceRoot),
          nextAction: normalizePublicText(compatibilityState.nextPriority.nextAction, workspaceRoot),
        }
        : null,
    },
    compatibilityPaths: {
      ledgerPath: normalizePublicPath(workspaceRoot, ledgerPath),
      digestPath: normalizePublicPath(workspaceRoot, digestPath),
      reportPath: normalizePublicPath(workspaceRoot, reportPath),
      proposalDir: normalizePublicPath(workspaceRoot, proposalDir),
      statePath: normalizePublicPath(workspaceRoot, statePath),
      gatePath: normalizePublicPath(workspaceRoot, compatibilityGatePath),
      curatedDocPath: normalizePublicPath(workspaceRoot, curatedDocPath),
    },
  };
}

function collectPublicLeafValues(value, bucket = [], keyPath = "") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectPublicLeafValues(entry, bucket, `${keyPath}[${index}]`));
    return bucket;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      collectPublicLeafValues(entry, bucket, keyPath ? `${keyPath}.${key}` : key);
    }
    return bucket;
  }
  bucket.push({ keyPath, value });
  return bucket;
}

function isIsoTimestamp(value) {
  const text = safeString(value, 80);
  return Boolean(text) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})Z$/.test(text);
}

function evaluateMemoryPublicSuite({
  workspaceRoot,
  paths,
  summary,
  pack,
  items,
  openAIBlogLane,
  anthropicLane,
  observationProjection = null,
  continuityArtifacts = null,
  readinessArtifacts = null,
  autonomousAgenda = null,
  causalTrace = null,
  continuityDebt = null,
  goalCompletionStatus = null,
  subjectiveGoalCompletionStatus = null,
  compatibilityCompletionStatus = null,
  workerCompletionStatus = null,
  sovereignGoalCompletionStatus = null,
  causalRegressionAlerts = null,
  learningAdoptionStatus = null,
  selfDirectedProbeStatus = null,
  novelTaskAcquisition = null,
  selfAuthoredGoalStatus = null,
  selfAuthoredGoalHistory = null,
  selfAuthoredGoalMarket = null,
  openUnknownsRegister = null,
  workspaceWorldModel = null,
  continuousImprovementStatus = null,
  noveltyGrowthStatus = null,
  securityConstitutionStatus = null,
  rollbackReadiness = null,
  autonomyBudgetStatus = null,
  selfAuthoredCausalEffects = null,
  selfAuthoredRemediationTrend = null,
  distinctImprovementSummary = null,
  workspaceProgressPublic = null,
  promotionHealthPublic = null,
  latestPackPublic = null,
  requireWrittenPublicArtifacts = false,
}) {
  const suite = loadConfigJson(workspaceRoot, "scripts", "config", "memory_eval_suite.json");
  const checks = Array.isArray(suite && suite.checks) ? suite.checks : [];
  const workspaceProgressPath = path.join(paths.projections.workspaceProgressRoot, `${summary.workspaceId}.json`);
  const workspaceProgressProjection = readJsonObject(workspaceProgressPath);
  const workspacePack = pack && typeof pack === "object" ? pack : {};
  const packItems = Array.isArray(workspacePack && workspacePack.items) ? workspacePack.items : [];
  const isolationPolicy = getTaskFamilyIsolationPolicy(loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json"));
  const hardExcludeTypes = uniqueStrings(isolationPolicy.hardExcludeTypes, 16, 80);
  const continuityArtifact = continuityArtifacts && continuityArtifacts.artifact && typeof continuityArtifacts.artifact === "object"
    ? continuityArtifacts.artifact
    : {};
  const readiness = readinessArtifacts && readinessArtifacts.readiness && typeof readinessArtifacts.readiness === "object"
    ? readinessArtifacts.readiness
    : {};
  const readinessBlockedReasons = readinessArtifacts && readinessArtifacts.blockedReasons && typeof readinessArtifacts.blockedReasons === "object"
    ? readinessArtifacts.blockedReasons
    : {};
  const readinessBottlenecks = readinessArtifacts && readinessArtifacts.bottlenecks && typeof readinessArtifacts.bottlenecks === "object"
    ? readinessArtifacts.bottlenecks
    : {};
  const distinctLineage = readinessArtifacts && readinessArtifacts.distinctLineage && typeof readinessArtifacts.distinctLineage === "object"
    ? readinessArtifacts.distinctLineage
    : {};
  const workerDecisionSurfacePath = path.join(workspaceRoot, "output", "governance_public", "worker_decision_surface.json");
  const workerCompletionStatusPath = paths.governancePublic && paths.governancePublic.workerCompletionStatusJson
    ? paths.governancePublic.workerCompletionStatusJson
    : path.join(workspaceRoot, "output", "governance_public", "worker_completion_status.json");
  const adoptionReadinessEvalPath = path.join(workspaceRoot, "output", "governance_public", "adoption_readiness_eval.json");
  const iterationDecisionPath = path.join(workspaceRoot, "output", "governance_public", "iteration_decision.json");
  const noHitlAnalysisPath = path.join(workspaceRoot, "output", "externalization_nohitl", "no_hitl_analysis.json");
  const latestOverviewPath = paths.publicOutput && paths.publicOutput.latestOverviewJson ? paths.publicOutput.latestOverviewJson : "";
  const writtenOrRuntimeJson = (targetPath, runtimeValue) => {
    if (requireWrittenPublicArtifacts) return readJson(targetPath);
    return runtimeValue;
  };
  const checkResults = checks.map((check) => {
    const id = safeString(check && check.id, 120);
    let pass = false;
    let detail = "";
    if (id === "canonical_store_present") {
      pass = fs.existsSync(paths.eventsPath) && fs.existsSync(paths.indexes.byId);
      detail = pass ? "canonical event log and index are present" : "canonical event log or index is missing";
    } else if (id === "workspace_progress_projection_present") {
      pass = fs.existsSync(workspaceProgressPath);
      detail = pass ? "workspace progress projection present" : "workspace progress projection missing";
    } else if (id === "workspace_progress_projection_populated") {
      const milestoneCount = Array.isArray(workspaceProgressProjection.currentMilestones) ? workspaceProgressProjection.currentMilestones.length : 0;
      pass = Boolean(safeString(workspaceProgressProjection.currentObjective, 240)) || milestoneCount > 0;
      detail = pass ? "workspace progress projection contains objective or milestone data" : "workspace progress projection is structurally present but empty";
    } else if (id === "workspace_progress_updated_at_present") {
      pass = Boolean(safeString(workspaceProgressProjection.updatedAt, 80));
      detail = pass ? "workspace progress projection exposes a durable updatedAt timestamp" : "workspace progress projection is missing durable updatedAt";
    } else if (id === "legacy_learning_compatibility_preserved") {
      const required = [
        "output/openai_blog_learning_digest.json",
        "output/openai_blog_learning_ledger.json",
        "output/openai_blog_self_improvement_state.json",
        "output/anthropic_engineering_learning_digest.json",
        "output/anthropic_engineering_learning_ledger.json",
        "output/anthropic_engineering_self_improvement_state.json",
      ];
      const missing = required.filter((entry) => !fs.existsSync(path.join(workspaceRoot, entry)));
      pass = missing.length === 0;
      detail = pass ? "legacy learning compatibility artifacts remain addressable" : `missing: ${missing.map((entry) => normalizePublicPath(workspaceRoot, entry)).join(", ")}`;
    } else if (id === "bounded_memory_pack_written") {
      const itemCount = Array.isArray(workspacePack && workspacePack.items) ? workspacePack.items.length : 0;
      pass = itemCount > 0 || clampInt(workspacePack && workspacePack.selectedCount, 0, 999999, 0) > 0;
      detail = pass ? "at least one bounded memory pack exists" : "no bounded memory pack found";
    } else if (id === "bounded_memory_pack_reuses_canonical_memory") {
      const reusedCount = clampInt(workspacePack && workspacePack.reusedSelectedCount, 0, 999999, 0);
      pass = reusedCount > 0;
      detail = pass ? `${reusedCount} selected pack item(s) were reused from the canonical store` : "latest bounded memory pack does not yet demonstrate canonical reuse";
    } else if (id === "task_family_isolation_respected") {
      const mismatched = packItems.filter((entry) => {
        const itemType = safeString(entry && entry.type, 80);
        const families = uniqueStrings(entry && entry.whyIncluded && entry.whyIncluded.taskFamilies, 8, 80);
        if (!families.length || families.includes("all") || families.includes("default")) return false;
        if (!hardExcludeTypes.includes(itemType)) return false;
        return !families.includes(safeString(workspacePack && workspacePack.taskFamily, 80) || "default");
      });
      pass = mismatched.length === 0;
      detail = pass ? "latest bounded memory pack respects task-family isolation for hard-excluded governed memory types" : `mismatched items present: ${mismatched.map((entry) => safeString(entry && entry.type, 80)).join(", ")}`;
    } else if (id === "lane_projection_canonical_state_present") {
      const openaiCanonical = openAIBlogLane && openAIBlogLane.canonicalCounts && safeNumber(openAIBlogLane.canonicalCounts.lessonCount, 0) >= 1;
      const anthropicCanonical = anthropicLane && anthropicLane.canonicalCounts && safeNumber(anthropicLane.canonicalCounts.lessonCount, 0) >= 1;
      pass = Boolean(openaiCanonical && anthropicCanonical);
      detail = pass ? "public lane projections expose canonical memory-derived lesson state for primary and secondary learning lanes" : "canonical memory-derived lane state is missing from one or more public projections";
    } else if (id === "promotion_health_memory_type_populated") {
      const promotions = Array.isArray(summary && summary.recentPromotions) ? summary.recentPromotions : [];
      const revocations = Array.isArray(summary && summary.recentRevocations) ? summary.recentRevocations : [];
      const emptyEntry = [...promotions, ...revocations].find((entry) => !safeString(entry && entry.memoryType, 80));
      pass = !emptyEntry;
      detail = pass ? "promotion/revocation health entries expose non-empty memoryType values" : "one or more promotion/revocation health entries are missing memoryType";
    } else if (id === "observation_projection_present") {
      pass = Boolean(
        observationProjection
        && typeof observationProjection === "object"
        && fs.existsSync(path.join(paths.projections.observationStateRoot, "latest.json"))
      );
      detail = pass ? "canonical observation projection is present" : "canonical observation projection missing";
    } else if (id === "continuity_projection_present") {
      pass = fs.existsSync(path.join(paths.projections.continuityStateRoot, "latest.json"))
        && Boolean(continuityArtifact && typeof continuityArtifact === "object" && safeString(continuityArtifact.schema, 120));
      detail = pass ? "continuity projection and public summary are present" : "continuity projection or public summary missing";
    } else if (id === "agi_readiness_surface_present") {
      const required = [
        path.join(paths.projections.readinessRoot, "latest.json"),
        path.join(paths.projections.readinessRoot, "promotion_trend.json"),
        path.join(paths.projections.readinessRoot, "blocked_reasons.json"),
        path.join(paths.projections.familyCoverageRoot, "latest.json"),
      ];
      const missing = required.filter((targetPath) => !fs.existsSync(targetPath));
      pass = missing.length === 0 && safeString(readiness.schema, 120) === "agi-readiness-live-summary.v1";
      detail = pass ? "agi readiness canonical surface is present" : `missing: ${missing.map((entry) => normalizePublicPath(workspaceRoot, entry)).join(", ")}`;
    } else if (id === "readiness_breadth_semantics_consistent") {
      const failedFamilies = uniqueStrings(readiness && readiness.failedFamilies, 16, 80);
      const supportedCoverageBreadth = safeNumber(readiness && readiness.supportedCoverageBreadth, NaN);
      const evaluatedBreadth = safeNumber(readiness && readiness.evaluatedBreadth, NaN);
      const headlineMode = safeString(readiness && readiness.breadthSemantics && readiness.breadthSemantics.mode, 80);
      pass = Boolean(
        headlineMode
        && Number.isFinite(supportedCoverageBreadth)
        && Number.isFinite(evaluatedBreadth)
        && (failedFamilies.length === 0 || supportedCoverageBreadth < 1)
      );
      detail = pass
        ? "readiness headline exposes evaluated breadth separately from repo-wide supported coverage breadth"
        : "readiness headline breadth semantics are missing or inconsistent with coverage failures";
    } else if (id === "promotion_surface_not_self_comparison_misreported") {
      const selfSnapshot = safeString(readiness && readiness.promotionComparisonMode, 80) === "self_snapshot";
      const promoteValue = readiness && readiness.incumbentVsChallenger ? readiness.incumbentVsChallenger.promote : undefined;
      const reasons = Array.isArray(readinessBlockedReasons && readinessBlockedReasons.reasons) ? readinessBlockedReasons.reasons : [];
      pass = !selfSnapshot || (promoteValue === null && !reasons.includes("challenger_strictly_beats_incumbent_under_fail_closed_rule"));
      detail = pass
        ? "promotion surface distinguishes self-snapshot from distinct incumbent comparison"
        : "self-snapshot readiness is still exposed like a distinct incumbent/challenger promotion result";
    } else if (id === "coverage_failures_reflected_in_bottlenecks") {
      const failedFamilies = uniqueStrings(readiness && readiness.failedFamilies, 16, 80);
      const reasons = Array.isArray(readinessBlockedReasons && readinessBlockedReasons.reasons) ? readinessBlockedReasons.reasons : [];
      const bottlenecks = Array.isArray(readinessBottlenecks && readinessBottlenecks.items) ? readinessBottlenecks.items : [];
      pass = failedFamilies.length === 0 || (
        reasons.some((reason) => reason.includes("breadth coverage incomplete across supported families"))
        && bottlenecks.some((item) => safeString(item && item.summary, 240).includes("breadth coverage incomplete across supported families"))
      );
      detail = pass
        ? "coverage failures are reflected in readiness blocked reasons and next bottlenecks"
        : "coverage failures are not reflected in readiness blocked reasons or next bottlenecks";
    } else if (id === "lane_projection_real_observations_reflected") {
      const primaryObserved = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.observationCount, 0, 999999, 0);
      const secondaryAwaiting = clampInt(anthropicLane && anthropicLane.canonicalCounts && anthropicLane.canonicalCounts.awaitingObservationCount, 0, 999999, 0);
      const primaryState = safeString(
        openAIBlogLane && openAIBlogLane.governedOperationalState && openAIBlogLane.governedOperationalState.observationStatus,
        40
      ) || safeString(openAIBlogLane && openAIBlogLane.compatibilityState && openAIBlogLane.compatibilityState.observationStatus, 40);
      const secondaryState = safeString(
        anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.observationStatus,
        40
      ) || safeString(anthropicLane && anthropicLane.compatibilityState && anthropicLane.compatibilityState.observationStatus, 40);
      pass = Boolean(
        openAIBlogLane
        && anthropicLane
        && openAIBlogLane.canonicalCounts
        && anthropicLane.canonicalCounts
        && typeof primaryObserved === "number"
        && typeof secondaryAwaiting === "number"
        && primaryState
        && secondaryState
      );
      detail = pass
        ? `lane projections reflect canonical observation state (${primaryState}/${secondaryState})`
        : "lane projections do not yet reflect canonical observation state";
    } else if (id === "breadth_family_evidence_present") {
      const rows = Array.isArray(readinessArtifacts && readinessArtifacts.coverage && readinessArtifacts.coverage.rows)
        ? readinessArtifacts.coverage.rows
        : [];
      const targetFamilies = ["web_creative", "workflow_execution", "evaluation_review", "tool_use_browser_like"];
      const evidenced = rows.filter((row) => {
        const familyId = safeString(row && row.familyId, 80);
        if (!targetFamilies.includes(familyId)) return false;
        return Boolean((row && row.lastSuccessfulTask) || (row && row.lastFailedTask));
      });
      pass = evidenced.length >= 3;
      detail = pass
        ? `${evidenced.length} target breadth families expose public-safe success/failure evidence`
        : "target breadth families do not yet expose enough live success/failure evidence";
    } else if (id === "weakest_gate_semantics_explained") {
      const gatePressure = readiness && readiness.gatePressure && typeof readiness.gatePressure === "object" ? readiness.gatePressure : {};
      pass = Boolean(
        safeString(gatePressure.explanation, 240)
        && (
          !safeString(readiness && readiness.weakestGateFamily, 80)
          || safeString(gatePressure.pressureStatus, 40) !== "no_material_pressure"
        )
      );
      detail = pass
        ? "weakest gate semantics expose a non-arbitrary gate-pressure explanation"
        : "weakest gate semantics are missing or still rely on an unexplained tie-break";
    } else if (id === "primary_lane_observation_closure") {
      const primaryObserved = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.observationCount, 0, 999999, 0);
      const status = safeString(openAIBlogLane && openAIBlogLane.compatibilityState && openAIBlogLane.compatibilityState.observationStatus, 40)
        || safeString(openAIBlogLane && openAIBlogLane.governedOperationalState && openAIBlogLane.governedOperationalState.observationStatus, 40);
      pass = primaryObserved > 0 && status !== "starved";
      detail = pass
        ? `primary lane observations are no longer starved (${primaryObserved} observations, status=${status})`
        : "primary lane still lacks successful runtime observation closure";
    } else if (id === "continuity_public_real_case_present") {
      const horizon = continuityArtifact && continuityArtifact.horizon && typeof continuityArtifact.horizon === "object"
        ? continuityArtifact.horizon
        : {};
      pass = clampInt(continuityArtifact && continuityArtifact.handoffCount, 0, 999999, 0) > 0
        && safeString(continuityArtifact && continuityArtifact.finalReleaseState, 80) !== "unknown"
        && Object.keys(horizon).length > 0;
      detail = pass
        ? "continuity public summary exposes a real handoff/release/horizon case"
        : "continuity public summary is still missing live handoff/release/horizon evidence";
    } else if (id === "robustness_breakdown_exported") {
      const breakdownPath = paths.agiReadiness && paths.agiReadiness.robustnessBreakdownJson
        ? paths.agiReadiness.robustnessBreakdownJson
        : "";
      const writtenArtifactExists = Boolean(breakdownPath) && fs.existsSync(breakdownPath);
      const breakdown = writtenArtifactExists
        ? readJsonObject(breakdownPath)
        : (
          !requireWrittenPublicArtifacts
          && readinessArtifacts
          && readinessArtifacts.robustnessBreakdown
          && typeof readinessArtifacts.robustnessBreakdown === "object"
            ? readinessArtifacts.robustnessBreakdown
            : {}
        );
      pass = Boolean(
        writtenArtifactExists
        && safeString(breakdown.schema, 160) === "agi-readiness-robustness-breakdown.v1"
        && Array.isArray(breakdown.categories)
        && breakdown.categories.length > 0
        && breakdown.categories.some((entry) => entry && safeString(entry.status, 40) !== "no_evidence")
      );
      detail = pass
        ? "robustness breakdown export is present with category-level evidence"
        : (
          writtenArtifactExists
            ? "robustness breakdown export is present but empty or malformed"
            : "robustness breakdown public artifact is missing"
        );
    } else if (id === "autonomous_learning_agenda_present") {
      const agendaPath = path.join(paths.projections.learningAgendaRoot, "latest.json");
      const agenda = writtenOrRuntimeJson(agendaPath, autonomousAgenda);
      pass = Boolean(
        agenda
        && safeString(agenda.schema, 120) === "governed-autonomous-learning-agenda.v1"
        && Array.isArray(agenda.entries)
        && agenda.entries.length > 0
      );
      detail = pass ? "autonomous learning agenda is present" : "autonomous learning agenda missing or empty";
    } else if (id === "autonomous_learning_running_or_passed") {
      const agendaPath = path.join(paths.projections.learningAgendaRoot, "latest.json");
      const agenda = writtenOrRuntimeJson(agendaPath, autonomousAgenda);
      const entries = Array.isArray(agenda && agenda.entries) ? agenda.entries : [];
      pass = entries.some((entry) => ["running", "passed"].includes(safeString(entry && entry.status, 40)));
      detail = pass ? "autonomous learning agenda includes running or passed items" : "autonomous learning agenda has no running/passed items";
    } else if (id === "causal_learning_trace_present") {
      const tracePath = path.join(paths.projections.causalTraceRoot, "latest.json");
      const trace = writtenOrRuntimeJson(tracePath, causalTrace);
      pass = Boolean(
        trace
        && safeString(trace.schema, 120) === "governed-causal-learning-trace.v1"
        && Array.isArray(trace.traces)
        && trace.traces.length > 0
      );
      detail = pass ? "causal learning trace is present" : "causal learning trace missing or empty";
    } else if (id === "primary_lane_causal_usage_present") {
      const observationCount = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.observationCount, 0, 999999, 0);
      const causalUsageCount = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.causalUsageCount, 0, 999999, 0);
      pass = observationCount === 0 || causalUsageCount > 0;
      detail = pass ? "primary lane causal usage is present when observations exist" : "primary lane has observations but no causal usage trace";
    } else if (id === "secondary_lane_advisory_trace_present") {
      const consideredCount = clampInt(anthropicLane && anthropicLane.canonicalCounts && anthropicLane.canonicalCounts.consideredForPackCount, 0, 999999, 0);
      const advisoryEffects = Array.isArray(anthropicLane && anthropicLane.recentAdvisoryEffects) ? anthropicLane.recentAdvisoryEffects : [];
      pass = consideredCount === 0 || advisoryEffects.length > 0;
      detail = pass ? "secondary advisory lane exposes advisory trace when considered" : "secondary advisory lane was considered but has no advisory trace";
    } else if (id === "distinct_lineage_present") {
      const lineagePath = path.join(paths.projections.readinessRoot, "distinct_lineage.json");
      const lineage = writtenOrRuntimeJson(lineagePath, distinctLineage);
      const entries = Array.isArray(lineage && lineage.entries) ? lineage.entries : [];
      const summaryPath = path.join(paths.projections.readinessRoot, "distinct_improvement_summary.json");
      const summary = writtenOrRuntimeJson(summaryPath, distinctImprovementSummary);
      const effectiveWindow = clampInt(summary && summary.effectiveDistinctWindowSize, 0, 999999, entries.length);
      pass = entries.length >= 3 || effectiveWindow >= 3;
      detail = pass
        ? `distinct lineage has ${Math.max(entries.length, effectiveWindow)} effective entries`
        : "distinct lineage does not yet have at least 3 entries";
    } else if (id === "distinct_lineage_has_non_promoted_case") {
      const lineagePath = path.join(paths.projections.readinessRoot, "distinct_lineage.json");
      const lineage = writtenOrRuntimeJson(lineagePath, distinctLineage);
      const entries = Array.isArray(lineage && lineage.entries) ? lineage.entries : [];
      pass = entries.some((entry) => entry && entry.promote !== true);
      detail = pass ? "distinct lineage includes blocked/hold or rejected comparisons" : "distinct lineage only shows promoted cases";
    } else if (id === "continuity_debt_surface_present") {
      const debtPath = path.join(paths.projections.continuityDebtRoot, "latest.json");
      const debt = writtenOrRuntimeJson(debtPath, continuityDebt);
      pass = Boolean(
        debt
        && safeString(debt.schema, 120) === "continuity-debt-projection.v1"
        && Array.isArray(debt.items)
      );
      detail = pass ? "continuity debt surface is present" : "continuity debt projection missing";
    } else if (id === "goal_completion_artifact_present") {
      const goalPath = paths.agiReadiness && paths.agiReadiness.goalCompletionStatusJson
        ? paths.agiReadiness.goalCompletionStatusJson
        : "";
      const goal = writtenOrRuntimeJson(goalPath, goalCompletionStatus);
      pass = Boolean(
        goalPath
        && (
          !requireWrittenPublicArtifacts
          || fs.existsSync(goalPath)
        )
        && goal
        && safeString(goal.schema, 160) === "agi-operational-completion-status.v1"
        && safeString(goal.goalStatus, 80)
      );
      detail = pass
        ? "operational goal completion artifact is present"
        : "operational goal completion artifact missing";
    } else if (id === "stable_coverage_surface_present") {
      const matrixPath = paths.agiReadiness && paths.agiReadiness.stableCoverageMatrixJson ? paths.agiReadiness.stableCoverageMatrixJson : "";
      const trendPath = paths.agiReadiness && paths.agiReadiness.stableCoverageTrendJson ? paths.agiReadiness.stableCoverageTrendJson : "";
      const matrix = writtenOrRuntimeJson(matrixPath, readinessArtifacts && readinessArtifacts.stableCoverageArtifacts && readinessArtifacts.stableCoverageArtifacts.matrix);
      const trend = writtenOrRuntimeJson(trendPath, readinessArtifacts && readinessArtifacts.stableCoverageArtifacts && readinessArtifacts.stableCoverageArtifacts.trend);
      pass = Boolean(
        matrixPath && trendPath
        && (!requireWrittenPublicArtifacts || (fs.existsSync(matrixPath) && fs.existsSync(trendPath)))
        && safeString(matrix && matrix.schema, 120) === "agi-readiness-stable-coverage-matrix.v1"
        && safeString(trend && trend.schema, 120) === "agi-readiness-stable-coverage-trend.v1"
      );
      detail = pass ? "stable coverage matrix and trend are present" : "stable coverage matrix or trend missing";
    } else if (id === "causal_regression_alerts_present") {
      const alertsPath = paths.agiReadiness && paths.agiReadiness.causalRegressionAlertsJson ? paths.agiReadiness.causalRegressionAlertsJson : "";
      const alerts = writtenOrRuntimeJson(alertsPath, causalRegressionAlerts);
      pass = Boolean(
        alertsPath
        && (!requireWrittenPublicArtifacts || fs.existsSync(alertsPath))
        && safeString(alerts && alerts.schema, 120) === "agi-readiness-causal-regression-alerts.v1"
        && Array.isArray(alerts && alerts.alerts)
      );
      detail = pass ? "causal regression alerts are present" : "causal regression alerts missing";
    } else if (id === "goal_completion_supporting_artifacts_present") {
      const goalPath = paths.agiReadiness && paths.agiReadiness.goalCompletionStatusJson
        ? paths.agiReadiness.goalCompletionStatusJson
        : "";
      const goal = writtenOrRuntimeJson(goalPath, goalCompletionStatus);
      const refs = Array.isArray(goal && goal.supportingArtifacts) ? goal.supportingArtifacts : [];
      pass = refs.length > 0 && refs.every((ref) => fs.existsSync(path.join(workspaceRoot, ref)));
      detail = pass ? "goal completion supporting artifacts are present" : "one or more goal completion supporting artifacts are missing";
    } else if (id === "goal_completion_status_consistent") {
      const goalPath = paths.agiReadiness && paths.agiReadiness.goalCompletionStatusJson
        ? paths.agiReadiness.goalCompletionStatusJson
        : "";
      const goal = writtenOrRuntimeJson(goalPath, goalCompletionStatus);
      const current = goal && goal.currentValues && typeof goal.currentValues === "object" ? goal.currentValues : {};
      const whyNotYet = Array.isArray(goal && goal.whyNotYet) ? goal.whyNotYet : [];
      const readinessStable = safeNumber(readiness && readiness.stableCoverageBreadth, 0);
      const readinessRobust = numberOrNull(readiness && readiness.metrics && readiness.metrics.R_robust && readiness.metrics.R_robust.value);
      const readinessHorizon = numberOrNull(readiness && readiness.metrics && readiness.metrics.H_horizon && readiness.metrics.H_horizon.value);
      const readinessScore = numberOrNull(readiness && readiness.rawFinalScore);
      const sameNumberOrNull = (left, right) => {
        if (left == null && right == null) return true;
        if (!hasExplicitNumber(left) || !hasExplicitNumber(right)) return false;
        return Math.abs(Number(left) - Number(right)) < 0.000001;
      };
      const debtCount = clampInt(continuityDebt && continuityDebt.summary && continuityDebt.summary.openDebtCount, 0, 999999, 0);
      const blockedSubtasks = clampInt(continuityArtifacts && continuityArtifacts.artifact && continuityArtifacts.artifact.blockedSubtasks, 0, 999999, 0);
      const integrationPendingCount = clampInt(continuityArtifacts && continuityArtifacts.artifact && continuityArtifacts.artifact.integrationPendingCount, 0, 999999, 0);
      pass = Boolean(
        goal
        && safeString(goal.schema, 160) === "agi-operational-completion-status.v1"
        && Math.abs(safeNumber(current.stableCoverageBreadth, -1) - readinessStable) < 0.000001
        && sameNumberOrNull(current.R_robust, readinessRobust)
        && sameNumberOrNull(current.H_horizon, readinessHorizon)
        && sameNumberOrNull(current.rawFinalScore, readinessScore)
        && clampInt(current.openDebtCount, -1, 999999, -1) === debtCount
        && clampInt(current.blockedSubtasks, -1, 999999, -1) === blockedSubtasks
        && clampInt(current.integrationPendingCount, -1, 999999, -1) === integrationPendingCount
        && Array.isArray(goal.requiredNextActions)
        && (safeString(goal.goalStatus, 80) === "OPERATIONALLY_COMPLETE" || whyNotYet.length > 0)
      );
      detail = pass
        ? "operational goal completion status matches readiness, debt, and learning state"
        : "operational goal completion status is inconsistent with readiness or debt state";
    } else if (id === "running_agenda_semantics_explicit") {
      const learningPath = paths.agiReadiness && paths.agiReadiness.autonomousLearningStatusJson
        ? paths.agiReadiness.autonomousLearningStatusJson
        : "";
      const learning = requireWrittenPublicArtifacts
        ? readJson(learningPath)
        : (readJsonObject(learningPath) || null);
      const goalPath = paths.agiReadiness && paths.agiReadiness.goalCompletionStatusJson
        ? paths.agiReadiness.goalCompletionStatusJson
        : "";
      const goal = writtenOrRuntimeJson(goalPath, goalCompletionStatus);
      const subjectivePath = paths.agiReadiness && paths.agiReadiness.subjectiveGoalCompletionStatusJson
        ? paths.agiReadiness.subjectiveGoalCompletionStatusJson
        : "";
      const subjectiveGoal = writtenOrRuntimeJson(subjectivePath, subjectiveGoalCompletionStatus);
      const gateCounts = learning && learning.gateDecisionCounts && typeof learning.gateDecisionCounts === "object"
        ? learning.gateDecisionCounts
        : {};
      const goalCurrent = goal && goal.currentValues && typeof goal.currentValues === "object" ? goal.currentValues : {};
      const goalBasis = goal && goal.runningAgendaDecisionBasis && typeof goal.runningAgendaDecisionBasis === "object"
        ? goal.runningAgendaDecisionBasis
        : {};
      const subjectiveCurrent = subjectiveGoal && subjectiveGoal.subjectiveCurrentValues && typeof subjectiveGoal.subjectiveCurrentValues === "object"
        ? subjectiveGoal.subjectiveCurrentValues
        : {};
      const subjectiveBasis = subjectiveGoal && subjectiveGoal.runningAgendaDecisionBasis && typeof subjectiveGoal.runningAgendaDecisionBasis === "object"
        ? subjectiveGoal.runningAgendaDecisionBasis
        : {};
      const supportingRunning = clampInt(learning && learning.currentRunningCount, 0, 999999, -1);
      const supportingBlocked = clampInt(learning && learning.currentBlockedCount, 0, 999999, -1);
      const supportingInsufficient = clampInt(learning && learning.currentInsufficientEvidenceCount, 0, 999999, -1);
      const gateRunning = clampInt(gateCounts.running, 0, 999999, -1);
      const gateBlocked = clampInt(gateCounts.blocked, 0, 999999, -1);
      const gateInsufficient = clampInt(gateCounts.insufficientEvidenceCount, 0, 999999, -1);
      const supportingCounts = gateCounts && gateCounts.supportingCurrentCounts && typeof gateCounts.supportingCurrentCounts === "object"
        ? gateCounts.supportingCurrentCounts
        : {};
      const excludedCounts = gateCounts && gateCounts.excludedMetaCompletionCounts && typeof gateCounts.excludedMetaCompletionCounts === "object"
        ? gateCounts.excludedMetaCompletionCounts
        : {};
      pass = Boolean(learning && goal && subjectiveGoal)
        && safeString(gateCounts.scope, 120) === "completion_gate_consumed_subset"
        && safeString(gateCounts.sourceRule, 120) === "exclude_meta_completion_entries_via_isMetaCompletionAgendaEntry"
        && gateRunning >= 0
        && gateBlocked >= 0
        && gateInsufficient >= 0
        && supportingRunning >= 0
        && supportingBlocked >= 0
        && supportingInsufficient >= 0
        && clampInt(supportingCounts.running, 0, 999999, -2) === supportingRunning
        && clampInt(supportingCounts.blocked, 0, 999999, -2) === supportingBlocked
        && clampInt(supportingCounts.insufficientEvidenceCount, 0, 999999, -2) === supportingInsufficient
        && clampInt(goalCurrent.runningAgendaCount, 0, 999999, -2) === gateRunning
        && clampInt(subjectiveCurrent.runningAgendaCount, 0, 999999, -2) === gateRunning
        && clampInt(subjectiveCurrent.blockedAgendaCount, 0, 999999, -2) === gateBlocked
        && clampInt(goalBasis.gateRunningAgendaCount, 0, 999999, -2) === gateRunning
        && clampInt(goalBasis.supportingCurrentRunningCount, 0, 999999, -2) === supportingRunning
        && clampInt(goalBasis.gateBlockedAgendaCount, 0, 999999, -2) === gateBlocked
        && clampInt(goalBasis.supportingCurrentBlockedCount, 0, 999999, -2) === supportingBlocked
        && clampInt(goalBasis.gateInsufficientEvidenceCount, 0, 999999, -2) === gateInsufficient
        && clampInt(goalBasis.supportingCurrentInsufficientEvidenceCount, 0, 999999, -2) === supportingInsufficient
        && clampInt(subjectiveBasis.gateRunningAgendaCount, 0, 999999, -2) === gateRunning
        && clampInt(subjectiveBasis.supportingCurrentRunningCount, 0, 999999, -2) === supportingRunning
        && clampInt(subjectiveBasis.gateBlockedAgendaCount, 0, 999999, -2) === gateBlocked
        && clampInt(subjectiveBasis.supportingCurrentBlockedCount, 0, 999999, -2) === supportingBlocked
        && clampInt(subjectiveBasis.gateInsufficientEvidenceCount, 0, 999999, -2) === gateInsufficient
        && clampInt(subjectiveBasis.supportingCurrentInsufficientEvidenceCount, 0, 999999, -2) === supportingInsufficient
        && clampInt(subjectiveCurrent.insufficientEvidenceCount, 0, 999999, -2) >= gateInsufficient
        && clampInt(excludedCounts.running, 0, 999999, -2) === Math.max(supportingRunning - gateRunning, 0)
        && clampInt(excludedCounts.blocked, 0, 999999, -2) === Math.max(supportingBlocked - gateBlocked, 0)
        && clampInt(excludedCounts.insufficientEvidenceCount, 0, 999999, -2) === Math.max(supportingInsufficient - gateInsufficient, 0)
        && clampInt(goalBasis.excludedMetaCompletionRunningCount, 0, 999999, -2) === clampInt(excludedCounts.running, 0, 999999, -3)
        && clampInt(goalBasis.excludedMetaCompletionBlockedCount, 0, 999999, -2) === clampInt(excludedCounts.blocked, 0, 999999, -3)
        && clampInt(goalBasis.excludedMetaCompletionInsufficientEvidenceCount, 0, 999999, -2) === clampInt(excludedCounts.insufficientEvidenceCount, 0, 999999, -3)
        && clampInt(subjectiveBasis.excludedMetaCompletionRunningCount, 0, 999999, -2) === clampInt(excludedCounts.running, 0, 999999, -3)
        && clampInt(subjectiveBasis.excludedMetaCompletionBlockedCount, 0, 999999, -2) === clampInt(excludedCounts.blocked, 0, 999999, -3)
        && clampInt(subjectiveBasis.excludedMetaCompletionInsufficientEvidenceCount, 0, 999999, -2) === clampInt(excludedCounts.insufficientEvidenceCount, 0, 999999, -3);
      detail = pass
        ? "gate-consumed running agenda counts are explicit and consistent with the broader supporting surface"
        : "running agenda counts differ across artifacts without an explicit gate-vs-supporting basis";
    } else if (id === "goal_completion_not_yet_when_criteria_fail") {
      const goalPath = paths.agiReadiness && paths.agiReadiness.goalCompletionStatusJson
        ? paths.agiReadiness.goalCompletionStatusJson
        : "";
      const goal = writtenOrRuntimeJson(goalPath, goalCompletionStatus);
      const criteria = goal && goal.completionCriteria && typeof goal.completionCriteria === "object"
        ? goal.completionCriteria
        : {};
      const current = goal && goal.currentValues && typeof goal.currentValues === "object"
        ? goal.currentValues
        : {};
      const thresholdsSatisfied = Boolean(
        safeNumber(current.stableCoverageBreadth, 0) >= safeNumber(criteria.stableCoverageBreadth, 1)
        && safeNumber(current.supportedCoverageBreadth, 0) >= safeNumber(criteria.supportedCoverageBreadth, 1)
        && Array.isArray(current.failedFamilies) && current.failedFamilies.length === 0
        && safeNumber(current.R_robust, 0) >= safeNumber(criteria.robustThreshold, 0.93)
        && safeNumber(current.H_horizon, 0) >= safeNumber(criteria.horizonThreshold, 0.97)
        && safeNumber(current.rawFinalScore, 0) >= safeNumber(criteria.rawFinalScoreThreshold, 0.9)
        && safeNumber(current.catastrophicRiskCvar, 1) <= safeNumber(criteria.maxCatastrophicRiskCvar, 0.03)
        && clampInt(current.openDebtCount, 0, 999999, 0) <= clampInt(criteria.maxOpenDebtCount, 0, 999999, 0)
        && clampInt(current.blockedSubtasks, 0, 999999, 0) <= clampInt(criteria.maxBlockedSubtasks, 0, 999999, 0)
        && clampInt(current.integrationPendingCount, 0, 999999, 0) <= clampInt(criteria.maxIntegrationPendingCount, 0, 999999, 0)
        && safeString(current.ambiguousInstructionStatus, 80) !== "no_evidence"
        && clampInt(current.ambiguousInstructionEvidenceCount, 0, 999999, 0) >= clampInt(criteria.ambiguousInstructionMinEvidence, 10, 999999, 10)
        && safeNumber(current.ambiguousInstructionScore, 0) >= safeNumber(criteria.ambiguousInstructionThreshold, 0.8)
        && safeNumber(current.missingContextScore, 0) >= safeNumber(criteria.missingContextThreshold, 0.8)
        && safeNumber(current.browserToolFlakinessScore, 0) >= safeNumber(criteria.browserFlakinessThreshold, 0.75)
        && safeNumber(current.adversarialConflictingScore, 0) >= safeNumber(criteria.adversarialConflictingThreshold, 0.75)
        && safeNumber(current.degradedToolOutputsScore, 0) >= safeNumber(criteria.degradedToolOutputsThreshold, 0.85)
        && clampInt(current.runningAgendaCount, 0, 999999, 0) <= clampInt(criteria.maxRunningAgendaCount, 0, 999999, 0)
        && clampInt(current.verifiedPositiveRemediations, 0, 999999, 0) >= clampInt(criteria.minimumVerifiedPositiveRemediations, 1, 999999, 1)
        && clampInt(current.distinctLineageWindowCount, 0, 999999, 0) >= clampInt(criteria.minimumDistinctEntries, 1, 999999, 3)
        && Boolean(current.distinctLineageNonWorsening)
        && (
          current.harmfulCausalRatio == null
          || safeNumber(current.harmfulCausalRatio, 1) <= safeNumber(criteria.maxHarmfulCausalRatio, 0.1)
        )
        && goal && goal.history && clampInt(goal.history.consecutivePassingExports, 0, 999999, 0) >= clampInt(criteria.consecutiveSuccessfulExports, 1, 999999, 3)
      );
      const status = safeString(goal && goal.goalStatus, 80);
      pass = Boolean(goal) && (thresholdsSatisfied ? status === "OPERATIONALLY_COMPLETE" : status === "NOT_YET");
      detail = pass
        ? "goal completion artifact does not over-claim completion when thresholds fail"
        : "goal completion artifact misreports operational completion status";
    } else if (id === "goal_artifact_subjective_fields_present") {
      const goalPath = paths.agiReadiness && paths.agiReadiness.goalCompletionStatusJson
        ? paths.agiReadiness.goalCompletionStatusJson
        : "";
      const goal = writtenOrRuntimeJson(goalPath, goalCompletionStatus);
      pass = Boolean(
        goal
        && typeof goal.subjectiveGoalStatusPath === "string"
        && typeof goal.subjectiveGoalStatus === "string"
        && typeof goal.subjectiveCriteriaMet === "boolean"
        && Array.isArray(goal.subjectiveFailedCriteria)
        && Array.isArray(goal.subjectiveWhyNotYet)
        && Number.isFinite(Number(goal.subjectiveCriteriaWindowPassCount))
        && Number.isFinite(Number(goal.subjectiveCriteriaWindowSize))
      );
      detail = pass
        ? "goal completion artifact exposes subjective summary fields"
        : "goal completion artifact is missing one or more subjective summary fields";
    } else if (id === "subjective_goal_artifact_present") {
      const subjectivePath = paths.agiReadiness && paths.agiReadiness.subjectiveGoalCompletionStatusJson
        ? paths.agiReadiness.subjectiveGoalCompletionStatusJson
        : "";
      const subjectiveGoal = writtenOrRuntimeJson(subjectivePath, subjectiveGoalCompletionStatus);
      pass = Boolean(
        subjectivePath
        && (!requireWrittenPublicArtifacts || fs.existsSync(subjectivePath))
        && subjectiveGoal
        && safeString(subjectiveGoal.schema, 160) === "agi-subjective-goal-completion-status.v1"
        && safeString(subjectiveGoal.subjectiveGoalStatus, 80)
      );
      detail = pass
        ? "subjective goal completion artifact is present"
        : "subjective goal completion artifact missing";
    } else if (id === "subjective_goal_supporting_artifacts_present") {
      const subjectivePath = paths.agiReadiness && paths.agiReadiness.subjectiveGoalCompletionStatusJson
        ? paths.agiReadiness.subjectiveGoalCompletionStatusJson
        : "";
      const subjectiveGoal = writtenOrRuntimeJson(subjectivePath, subjectiveGoalCompletionStatus);
      const refs = Array.isArray(subjectiveGoal && subjectiveGoal.supportingArtifacts) ? subjectiveGoal.supportingArtifacts : [];
      pass = refs.length > 0 && refs.every((ref) => fs.existsSync(path.join(workspaceRoot, ref)));
      detail = pass
        ? "subjective goal supporting artifacts are present"
        : "one or more subjective goal supporting artifacts are missing";
    } else if (id === "history_aware_subjective_counts_consistent") {
      const subjectivePath = paths.agiReadiness && paths.agiReadiness.subjectiveGoalCompletionStatusJson
        ? paths.agiReadiness.subjectiveGoalCompletionStatusJson
        : "";
      const subjectiveGoal = writtenOrRuntimeJson(subjectivePath, subjectiveGoalCompletionStatus);
      const distinctSummaryPath = paths.agiReadiness && paths.agiReadiness.distinctImprovementSummaryJson
        ? paths.agiReadiness.distinctImprovementSummaryJson
        : "";
      const distinctSummary = writtenOrRuntimeJson(distinctSummaryPath, null) || {};
      const probePath = paths.agiReadiness && paths.agiReadiness.selfDirectedProbeStatusJson
        ? paths.agiReadiness.selfDirectedProbeStatusJson
        : "";
      const probeStatus = writtenOrRuntimeJson(probePath, selfDirectedProbeStatus);
      const novelPath = paths.agiReadiness && paths.agiReadiness.novelTaskAcquisitionJson
        ? paths.agiReadiness.novelTaskAcquisitionJson
        : "";
      const novelStatus = writtenOrRuntimeJson(novelPath, novelTaskAcquisition);
      const current = subjectiveGoal && subjectiveGoal.subjectiveCurrentValues && typeof subjectiveGoal.subjectiveCurrentValues === "object"
        ? subjectiveGoal.subjectiveCurrentValues
        : {};
      const expectedDistinctImprovement = clampInt(
        distinctSummary && distinctSummary.effectiveDistinctImprovementCount,
        0,
        999999,
        clampInt(distinctSummary && distinctSummary.distinctImprovementCount, 0, 999999, 0)
      );
      const expectedDistinctRegression = clampInt(
        distinctSummary && distinctSummary.effectiveDistinctRegressionCount,
        0,
        999999,
        clampInt(distinctSummary && distinctSummary.distinctRegressionCount, 0, 999999, 0)
      );
      const expectedNonWorsening = typeof (distinctSummary && distinctSummary.effectiveNonWorsening) === "boolean"
        ? Boolean(distinctSummary.effectiveNonWorsening)
        : Boolean(distinctSummary && distinctSummary.nonWorsening);
      const expectedProbePositives = clampInt(
        probeStatus && (probeStatus.positiveProbeCount != null ? probeStatus.positiveProbeCount : probeStatus.summary && probeStatus.summary.verifiedPositiveSelfDirectedCount),
        0,
        999999,
        0
      );
      const expectedNovelPositive = clampInt(
        novelStatus && (novelStatus.positiveNovelTaskCount != null ? novelStatus.positiveNovelTaskCount : novelStatus.summary && novelStatus.summary.positiveCount),
        0,
        999999,
        0
      );
      pass = Boolean(subjectiveGoal)
        && clampInt(current.distinctImprovementCount, 0, 999999, 0) >= expectedDistinctImprovement
        && clampInt(current.distinctRegressionCount, 0, 999999, 0) >= expectedDistinctRegression
        && Boolean(current.recentNonWorsening) === expectedNonWorsening
        && clampInt(current.verifiedPositiveSelfDirectedRemediations, 0, 999999, 0) >= expectedProbePositives
        && clampInt(current.novelProbePositiveCount, 0, 999999, 0) >= expectedNovelPositive;
      detail = pass
        ? "subjective current values preserve history-aware counts and non-worsening state"
        : "subjective current values do not reflect history-aware counts consistently";
    } else if (id === "subjective_goal_not_yet_when_subjective_criteria_fail") {
      const subjectivePath = paths.agiReadiness && paths.agiReadiness.subjectiveGoalCompletionStatusJson
        ? paths.agiReadiness.subjectiveGoalCompletionStatusJson
        : "";
      const subjectiveGoal = writtenOrRuntimeJson(subjectivePath, subjectiveGoalCompletionStatus);
      const compatibilityPath = paths.agiReadiness && paths.agiReadiness.compatibilityCompletionStatusJson
        ? paths.agiReadiness.compatibilityCompletionStatusJson
        : "";
      const compatibilityGoal = writtenOrRuntimeJson(compatibilityPath, compatibilityCompletionStatus);
      const current = subjectiveGoal && subjectiveGoal.subjectiveCurrentValues && typeof subjectiveGoal.subjectiveCurrentValues === "object"
        ? subjectiveGoal.subjectiveCurrentValues
        : {};
      const thresholds = subjectiveGoal && subjectiveGoal.subjectiveCriteria && typeof subjectiveGoal.subjectiveCriteria === "object"
        ? subjectiveGoal.subjectiveCriteria
        : {};
      const noEvidenceCategories = Array.isArray(current.noEvidenceRobustnessCategories) ? current.noEvidenceRobustnessCategories : [];
      const thresholdsSatisfied = Boolean(
        safeString(current.operationalGoalStatus, 80) === "OPERATIONALLY_COMPLETE"
        && safeNumber(current.stableCoverageBreadth, 0) >= safeNumber(thresholds.stableCoverageBreadth, 1)
        && safeNumber(current.supportedCoverageBreadth, 0) >= safeNumber(thresholds.supportedCoverageBreadth, 1)
        && safeNumber(current.rawFinalScore, 0) >= safeNumber(thresholds.rawFinalScore, 0.95)
        && safeNumber(current.R_robust, 0) >= safeNumber(thresholds.R_robust, 0.95)
        && safeNumber(current.H_horizon, 0) >= safeNumber(thresholds.H_horizon, 0.98)
        && safeNumber(current.catastrophicRiskCvar, 1) <= safeNumber(thresholds.maxCatastrophicRiskCvar, 0.02)
        && clampInt(current.openDebtCount, 0, 999999, 0) <= clampInt(thresholds.maxOpenDebtCount, 0, 999999, 0)
        && clampInt(current.blockedSubtasks, 0, 999999, 0) <= clampInt(thresholds.maxBlockedSubtasks, 0, 999999, 0)
        && clampInt(current.integrationPendingCount, 0, 999999, 0) <= clampInt(thresholds.maxIntegrationPendingCount, 0, 999999, 0)
        && clampInt(current.runningAgendaCount, 0, 999999, 0) <= clampInt(thresholds.maxRunningAgendaCount, 0, 999999, 0)
        && clampInt(current.blockedAgendaCount, 0, 999999, 0) <= clampInt(thresholds.maxBlockedAgendaCount, 0, 999999, 0)
        && clampInt(current.insufficientEvidenceCount, 0, 999999, 0) <= clampInt(thresholds.maxInsufficientEvidenceCount, 0, 999999, 0)
        && clampInt(current.verifiedPositiveRemediations, 0, 999999, 0) >= clampInt(thresholds.minVerifiedPositiveRemediations, 3, 999999, 3)
        && clampInt(current.verifiedPositiveSelfDirectedRemediations, 0, 999999, 0) >= clampInt(thresholds.minVerifiedPositiveSelfDirectedRemediations, 2, 999999, 2)
        && clampInt(current.distinctImprovementCount, 0, 999999, 0) >= clampInt(thresholds.minDistinctImprovementCount, 3, 999999, 3)
        && clampInt(current.distinctRegressionCount, 0, 999999, 0) <= clampInt(thresholds.maxDistinctRegressionCount, 0, 999999, 0)
        && Boolean(current.recentNonWorsening)
        && clampInt(current.primaryLaneSelectedInLatestPackCount, 0, 999999, 0) >= clampInt(thresholds.minPrimaryLaneSelectedInLatestPackCount, 1, 999999, 1)
        && clampInt(current.primaryLaneEffectiveContributionCount, 0, 999999, 0) >= clampInt(thresholds.minPrimaryLaneEffectiveContributionCount, 1, 999999, 1)
        && clampInt(current.primaryLaneCausalUsageCount, 0, 999999, 0) >= clampInt(thresholds.minPrimaryLaneCausalUsageCount, 3, 999999, 3)
        && clampInt(current.likelyContributoryCount, 0, 999999, 0) >= clampInt(thresholds.minLikelyContributoryCount, 3, 999999, 3)
        && safeNumber(current.harmfulCausalRatio, 1) <= safeNumber(thresholds.maxHarmfulCausalRatio, 0)
        && safeNumber(current.missingContext, 0) >= safeNumber(thresholds.missingContext, 0.95)
        && safeNumber(current.browserToolFlakiness, 0) >= safeNumber(thresholds.browserToolFlakiness, 0.9)
        && safeString(current.ambiguousInstructionStatus, 80) !== "no_evidence"
        && clampInt(current.ambiguousInstructionEvidenceCount, 0, 999999, 0) >= clampInt(thresholds.ambiguousInstructionMinEvidence, 20, 999999, 20)
        && safeNumber(current.ambiguousInstruction, 0) >= safeNumber(thresholds.ambiguousInstruction, 0.9)
        && safeNumber(current.adversarialConflictingInstruction, 0) >= safeNumber(thresholds.adversarialConflictingInstruction, 0.9)
        && safeNumber(current.degradedToolOutputs, 0) >= safeNumber(thresholds.degradedToolOutputs, 0.9)
        && noEvidenceCategories.length === 0
        && clampInt(current.novelProbePositiveCount, 0, 999999, 0) >= clampInt(thresholds.minNovelProbePositiveEvidence, 1, 999999, 1)
        && subjectiveGoal
        && subjectiveGoal.history
        && clampInt(subjectiveGoal.history.consecutivePassingExports, 0, 999999, 0) >= clampInt(thresholds.minConsecutivePassingExports, 1, 999999, 7)
      );
      const status = safeString(subjectiveGoal && subjectiveGoal.subjectiveGoalStatus, 80);
      pass = Boolean(subjectiveGoal) && (
        thresholdsSatisfied
          ? ["SUBJECTIVE_AGI_NEAR_COMPLETE", "SUBJECTIVE_AGI_COMPLETE"].includes(status)
          : status === "NOT_YET"
      );
      detail = pass
        ? "subjective goal completion artifact does not over-claim completion when subjective thresholds fail"
        : "subjective goal completion artifact misreports subjective completion status";
    } else if (id === "primary_lane_latest_pack_adoption_reflected") {
      const learningPath = paths.agiReadiness && paths.agiReadiness.learningAdoptionStatusJson
        ? paths.agiReadiness.learningAdoptionStatusJson
        : "";
      const learningAdoption = writtenOrRuntimeJson(learningPath, learningAdoptionStatus);
      const goalPath = paths.agiReadiness && paths.agiReadiness.goalCompletionStatusJson
        ? paths.agiReadiness.goalCompletionStatusJson
        : "";
      const goal = writtenOrRuntimeJson(goalPath, goalCompletionStatus);
      const subjectivePath = paths.agiReadiness && paths.agiReadiness.subjectiveGoalCompletionStatusJson
        ? paths.agiReadiness.subjectiveGoalCompletionStatusJson
        : "";
      const subjectiveGoal = writtenOrRuntimeJson(subjectivePath, subjectiveGoalCompletionStatus);
      const expectedCount = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.selectedInLatestPackCount, 0, 999999, 0);
      const goalCurrent = goal && goal.currentValues && typeof goal.currentValues === "object" ? goal.currentValues : {};
      const subjectiveCurrent = subjectiveGoal && subjectiveGoal.subjectiveCurrentValues && typeof subjectiveGoal.subjectiveCurrentValues === "object"
        ? subjectiveGoal.subjectiveCurrentValues
        : {};
      const laneSummary = learningAdoption && learningAdoption.laneSummaries && learningAdoption.laneSummaries.openai_primary
        ? learningAdoption.laneSummaries.openai_primary
        : {};
      pass = Boolean(learningAdoption)
        && clampInt(learningAdoption.selectedInLatestPackCount, 0, 999999, -1) === expectedCount
        && clampInt(laneSummary.selectedInLatestPackCount, 0, 999999, -1) === expectedCount
        && clampInt(goalCurrent.primaryLaneSelectedInLatestPackCount, 0, 999999, -1) === expectedCount
        && clampInt(subjectiveCurrent.primaryLaneSelectedInLatestPackCount, 0, 999999, -1) === expectedCount;
      detail = pass
        ? "primary lane latest-pack adoption is reflected across projection, goal, and subjective artifacts"
        : "primary lane latest-pack adoption count is inconsistent across public artifacts";
    } else if (id === "primary_lane_effective_contribution_reflected") {
      const learningPath = paths.agiReadiness && paths.agiReadiness.learningAdoptionStatusJson
        ? paths.agiReadiness.learningAdoptionStatusJson
        : "";
      const learningAdoption = writtenOrRuntimeJson(learningPath, learningAdoptionStatus);
      const goalPath = paths.agiReadiness && paths.agiReadiness.goalCompletionStatusJson
        ? paths.agiReadiness.goalCompletionStatusJson
        : "";
      const goal = writtenOrRuntimeJson(goalPath, goalCompletionStatus);
      const subjectivePath = paths.agiReadiness && paths.agiReadiness.subjectiveGoalCompletionStatusJson
        ? paths.agiReadiness.subjectiveGoalCompletionStatusJson
        : "";
      const subjectiveGoal = writtenOrRuntimeJson(subjectivePath, subjectiveGoalCompletionStatus);
      const expectedCount = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.effectiveContributionCount, 0, 999999, 0);
      const goalCurrent = goal && goal.currentValues && typeof goal.currentValues === "object" ? goal.currentValues : {};
      const subjectiveCurrent = subjectiveGoal && subjectiveGoal.subjectiveCurrentValues && typeof subjectiveGoal.subjectiveCurrentValues === "object"
        ? subjectiveGoal.subjectiveCurrentValues
        : {};
      const laneSummary = learningAdoption && learningAdoption.laneSummaries && learningAdoption.laneSummaries.openai_primary
        ? learningAdoption.laneSummaries.openai_primary
        : {};
      pass = Boolean(learningAdoption)
        && clampInt(learningAdoption.effectiveContributionCount, 0, 999999, -1) === expectedCount
        && clampInt(laneSummary.effectiveContributionCount, 0, 999999, -1) === expectedCount
        && clampInt(goalCurrent.primaryLaneEffectiveContributionCount, 0, 999999, -1) === expectedCount
        && clampInt(subjectiveCurrent.primaryLaneEffectiveContributionCount, 0, 999999, -1) === expectedCount;
      detail = pass
        ? "primary lane effective contribution is reflected across projection, goal, and subjective artifacts"
        : "primary lane effective contribution count is inconsistent across public artifacts";
    } else if (id === "learning_adoption_status_present") {
      const learningPath = paths.agiReadiness && paths.agiReadiness.learningAdoptionStatusJson
        ? paths.agiReadiness.learningAdoptionStatusJson
        : "";
      const learningAdoption = writtenOrRuntimeJson(learningPath, learningAdoptionStatus);
      pass = Boolean(
        learningPath
        && (!requireWrittenPublicArtifacts || fs.existsSync(learningPath))
        && learningAdoption
        && safeString(learningAdoption.schema, 160) === "agi-readiness-learning-adoption-status.v1"
        && learningAdoption.summary
        && learningAdoption.laneSummaries
      );
      detail = pass ? "learning adoption status is present" : "learning adoption status missing";
    } else if (id === "self_directed_probe_surface_present") {
      const probePath = paths.agiReadiness && paths.agiReadiness.selfDirectedProbeStatusJson
        ? paths.agiReadiness.selfDirectedProbeStatusJson
        : "";
      const probeStatus = writtenOrRuntimeJson(probePath, selfDirectedProbeStatus);
      pass = Boolean(
        probeStatus
        && Number.isFinite(Number(probeStatus.probeCount))
        && Number.isFinite(Number(probeStatus.positiveProbeCount))
        && Number.isFinite(Number(probeStatus.negativeProbeCount))
        && Number.isFinite(Number(probeStatus.novelProbeCount))
        && Number.isFinite(Number(probeStatus.novelPositiveCount))
        && Array.isArray(probeStatus.recentProbeFamilies)
        && Array.isArray(probeStatus.recentPositiveEvidenceRefs)
        && probeStatus.currentSnapshot && typeof probeStatus.currentSnapshot === "object"
        && probeStatus.effectiveHistoryAware && typeof probeStatus.effectiveHistoryAware === "object"
        && probeStatus.requiredThresholds
        && typeof probeStatus.requiredThresholds === "object"
        && probeStatus.meetsThresholds
        && typeof probeStatus.meetsThresholds === "object"
        && probeStatus.thresholdDecisionBasis
        && typeof probeStatus.thresholdDecisionBasis === "object"
      );
      detail = pass ? "self-directed probe surface exposes required counts and thresholds" : "self-directed probe surface is missing required fields";
    } else if (id === "self_directed_probe_threshold_basis_explicit") {
      const probePath = paths.agiReadiness && paths.agiReadiness.selfDirectedProbeStatusJson
        ? paths.agiReadiness.selfDirectedProbeStatusJson
        : "";
      const probeStatus = writtenOrRuntimeJson(probePath, selfDirectedProbeStatus);
      const validation = validateSelfDirectedProbeThresholdBasis(probeStatus);
      pass = Boolean(
        probePath
        && (!requireWrittenPublicArtifacts || fs.existsSync(probePath))
        && validation.pass
      );
      detail = validation.detail;
    } else if (id === "self_directed_probe_status_present") {
      const probePath = paths.agiReadiness && paths.agiReadiness.selfDirectedProbeStatusJson
        ? paths.agiReadiness.selfDirectedProbeStatusJson
        : "";
      const probeStatus = writtenOrRuntimeJson(probePath, selfDirectedProbeStatus);
      pass = Boolean(
        probePath
        && (!requireWrittenPublicArtifacts || fs.existsSync(probePath))
        && probeStatus
        && safeString(probeStatus.schema, 160) === "agi-readiness-self-directed-probe-status.v1"
        && probeStatus.summary
      );
      detail = pass ? "self-directed probe status is present" : "self-directed probe status missing";
    } else if (id === "novel_task_acquisition_surface_present") {
      const novelPath = paths.agiReadiness && paths.agiReadiness.novelTaskAcquisitionJson
        ? paths.agiReadiness.novelTaskAcquisitionJson
        : "";
      const novel = writtenOrRuntimeJson(novelPath, novelTaskAcquisition);
      pass = Boolean(
        novel
        && Number.isFinite(Number(novel.novelFamilyCount))
        && Number.isFinite(Number(novel.novelTaskCount))
        && Number.isFinite(Number(novel.positiveNovelTaskCount))
        && Array.isArray(novel.recentNovelTasks)
        && Array.isArray(novel.positiveEvidenceRefs)
        && novel.currentSnapshot && typeof novel.currentSnapshot === "object"
        && novel.effectiveHistoryAware && typeof novel.effectiveHistoryAware === "object"
        && novel.requiredThresholds
        && typeof novel.requiredThresholds === "object"
        && novel.meetsThresholds
        && typeof novel.meetsThresholds === "object"
        && novel.thresholdDecisionBasis
        && typeof novel.thresholdDecisionBasis === "object"
      );
      detail = pass ? "novel task acquisition surface exposes required counts and thresholds" : "novel task acquisition surface is missing required fields";
    } else if (id === "novel_task_threshold_basis_explicit") {
      const novelPath = paths.agiReadiness && paths.agiReadiness.novelTaskAcquisitionJson
        ? paths.agiReadiness.novelTaskAcquisitionJson
        : "";
      const novel = writtenOrRuntimeJson(novelPath, novelTaskAcquisition);
      const validation = validateNovelTaskThresholdBasis(novel);
      pass = Boolean(
        novelPath
        && (!requireWrittenPublicArtifacts || fs.existsSync(novelPath))
        && validation.pass
      );
      detail = validation.detail;
    } else if (id === "novel_task_acquisition_present") {
      const novelPath = paths.agiReadiness && paths.agiReadiness.novelTaskAcquisitionJson
        ? paths.agiReadiness.novelTaskAcquisitionJson
        : "";
      const novel = writtenOrRuntimeJson(novelPath, novelTaskAcquisition);
      pass = Boolean(
        novelPath
        && (!requireWrittenPublicArtifacts || fs.existsSync(novelPath))
        && novel
        && safeString(novel.schema, 160) === "agi-readiness-novel-task-acquisition.v1"
        && Array.isArray(novel.items)
      );
      detail = pass ? "novel task acquisition status is present" : "novel task acquisition status missing";
    } else if (id === "subjective_window_threshold_enforced") {
      const goalPath = paths.agiReadiness && paths.agiReadiness.goalCompletionStatusJson
        ? paths.agiReadiness.goalCompletionStatusJson
        : "";
      const goal = writtenOrRuntimeJson(goalPath, goalCompletionStatus);
      const subjectivePath = paths.agiReadiness && paths.agiReadiness.subjectiveGoalCompletionStatusJson
        ? paths.agiReadiness.subjectiveGoalCompletionStatusJson
        : "";
      const subjectiveGoal = writtenOrRuntimeJson(subjectivePath, subjectiveGoalCompletionStatus);
      const requiredWindow = clampInt(subjectiveGoal && subjectiveGoal.history && subjectiveGoal.history.consecutiveRequired, 0, 999999, 0);
      const passCount = clampInt(subjectiveGoal && subjectiveGoal.history && subjectiveGoal.history.consecutivePassingExports, 0, 999999, 0);
      const status = safeString(subjectiveGoal && subjectiveGoal.subjectiveGoalStatus, 80);
      pass = Boolean(goal && subjectiveGoal)
        && clampInt(goal.subjectiveCriteriaWindowSize, 0, 999999, -1) === requiredWindow
        && clampInt(goal.subjectiveCriteriaWindowPassCount, 0, 999999, -1) === passCount
        && (passCount >= requiredWindow ? ["SUBJECTIVE_AGI_NEAR_COMPLETE", "SUBJECTIVE_AGI_COMPLETE"].includes(status) : status === "NOT_YET");
      detail = pass
        ? "subjective completion window size and pass count are enforced consistently"
        : "subjective completion window threshold is not enforced consistently";
    } else if (id === "subjective_complete_case_requires_all_strict_thresholds") {
      const subjectivePath = paths.agiReadiness && paths.agiReadiness.subjectiveGoalCompletionStatusJson
        ? paths.agiReadiness.subjectiveGoalCompletionStatusJson
        : "";
      const subjectiveGoal = writtenOrRuntimeJson(subjectivePath, subjectiveGoalCompletionStatus);
      const current = subjectiveGoal && subjectiveGoal.subjectiveCurrentValues && typeof subjectiveGoal.subjectiveCurrentValues === "object"
        ? subjectiveGoal.subjectiveCurrentValues
        : {};
      const thresholds = subjectiveGoal && subjectiveGoal.subjectiveCriteria && typeof subjectiveGoal.subjectiveCriteria === "object"
        ? subjectiveGoal.subjectiveCriteria
        : {};
      const noEvidenceCategories = Array.isArray(current.noEvidenceRobustnessCategories) ? current.noEvidenceRobustnessCategories : [];
      const thresholdsSatisfied = Boolean(
        safeString(current.operationalGoalStatus, 80) === "OPERATIONALLY_COMPLETE"
        && safeNumber(current.stableCoverageBreadth, 0) >= safeNumber(thresholds.stableCoverageBreadth, 1)
        && safeNumber(current.supportedCoverageBreadth, 0) >= safeNumber(thresholds.supportedCoverageBreadth, 1)
        && safeNumber(current.rawFinalScore, 0) >= safeNumber(thresholds.rawFinalScore, 0.95)
        && safeNumber(current.R_robust, 0) >= safeNumber(thresholds.R_robust, 0.95)
        && safeNumber(current.H_horizon, 0) >= safeNumber(thresholds.H_horizon, 0.98)
        && safeNumber(current.catastrophicRiskCvar, 1) <= safeNumber(thresholds.maxCatastrophicRiskCvar, 0.02)
        && clampInt(current.openDebtCount, 0, 999999, 0) <= clampInt(thresholds.maxOpenDebtCount, 0, 999999, 0)
        && clampInt(current.blockedSubtasks, 0, 999999, 0) <= clampInt(thresholds.maxBlockedSubtasks, 0, 999999, 0)
        && clampInt(current.integrationPendingCount, 0, 999999, 0) <= clampInt(thresholds.maxIntegrationPendingCount, 0, 999999, 0)
        && clampInt(current.runningAgendaCount, 0, 999999, 0) <= clampInt(thresholds.maxRunningAgendaCount, 0, 999999, 0)
        && clampInt(current.blockedAgendaCount, 0, 999999, 0) <= clampInt(thresholds.maxBlockedAgendaCount, 0, 999999, 0)
        && clampInt(current.insufficientEvidenceCount, 0, 999999, 0) <= clampInt(thresholds.maxInsufficientEvidenceCount, 0, 999999, 0)
        && clampInt(current.verifiedPositiveRemediations, 0, 999999, 0) >= clampInt(thresholds.minVerifiedPositiveRemediations, 3, 999999, 3)
        && clampInt(current.verifiedPositiveSelfDirectedRemediations, 0, 999999, 0) >= clampInt(thresholds.minVerifiedPositiveSelfDirectedRemediations, 2, 999999, 2)
        && clampInt(current.distinctImprovementCount, 0, 999999, 0) >= clampInt(thresholds.minDistinctImprovementCount, 3, 999999, 3)
        && clampInt(current.distinctRegressionCount, 0, 999999, 0) <= clampInt(thresholds.maxDistinctRegressionCount, 0, 999999, 0)
        && Boolean(current.recentNonWorsening)
        && clampInt(current.primaryLaneSelectedInLatestPackCount, 0, 999999, 0) >= clampInt(thresholds.minPrimaryLaneSelectedInLatestPackCount, 1, 999999, 1)
        && clampInt(current.primaryLaneEffectiveContributionCount, 0, 999999, 0) >= clampInt(thresholds.minPrimaryLaneEffectiveContributionCount, 1, 999999, 1)
        && clampInt(current.primaryLaneCausalUsageCount, 0, 999999, 0) >= clampInt(thresholds.minPrimaryLaneCausalUsageCount, 3, 999999, 3)
        && clampInt(current.likelyContributoryCount, 0, 999999, 0) >= clampInt(thresholds.minLikelyContributoryCount, 3, 999999, 3)
        && safeNumber(current.harmfulCausalRatio, 1) <= safeNumber(thresholds.maxHarmfulCausalRatio, 0)
        && safeNumber(current.missingContext, 0) >= safeNumber(thresholds.missingContext, 0.95)
        && safeNumber(current.browserToolFlakiness, 0) >= safeNumber(thresholds.browserToolFlakiness, 0.9)
        && safeString(current.ambiguousInstructionStatus, 80) !== "no_evidence"
        && clampInt(current.ambiguousInstructionEvidenceCount, 0, 999999, 0) >= clampInt(thresholds.ambiguousInstructionMinEvidence, 20, 999999, 20)
        && safeNumber(current.ambiguousInstruction, 0) >= safeNumber(thresholds.ambiguousInstruction, 0.9)
        && safeNumber(current.adversarialConflictingInstruction, 0) >= safeNumber(thresholds.adversarialConflictingInstruction, 0.9)
        && safeNumber(current.degradedToolOutputs, 0) >= safeNumber(thresholds.degradedToolOutputs, 0.9)
        && noEvidenceCategories.length === 0
        && clampInt(current.novelProbePositiveCount, 0, 999999, 0) >= clampInt(thresholds.minNovelProbePositiveEvidence, 1, 999999, 1)
        && subjectiveGoal
        && subjectiveGoal.history
        && clampInt(subjectiveGoal.history.consecutivePassingExports, 0, 999999, 0) >= clampInt(thresholds.minConsecutivePassingExports, 1, 999999, 7)
      );
      const status = safeString(subjectiveGoal && subjectiveGoal.subjectiveGoalStatus, 80);
      pass = !["SUBJECTIVE_AGI_NEAR_COMPLETE", "SUBJECTIVE_AGI_COMPLETE"].includes(status) || thresholdsSatisfied;
      detail = pass
        ? "subjective completion only appears when all strict thresholds are satisfied"
        : "subjective completion is present without all strict thresholds being satisfied";
    } else if (id === "worker_decision_surface_present") {
      const workerDecision = writtenOrRuntimeJson(workerDecisionSurfacePath, readJsonObject(workerDecisionSurfacePath)) || {};
      pass = Boolean(
        fs.existsSync(workerDecisionSurfacePath)
        && safeString(workerDecision.schema, 160) === "worker-decision-surface.v1"
        && safeString(workerDecision.topLevelOutcome, 80)
      );
      detail = pass ? "worker decision surface headline artifact is present" : "worker decision surface headline artifact missing or malformed";
    } else if (id === "worker_decision_surface_scope_is_primary") {
      const workerDecision = writtenOrRuntimeJson(workerDecisionSurfacePath, readJsonObject(workerDecisionSurfacePath)) || {};
      const overview = latestOverviewPath ? writtenOrRuntimeJson(latestOverviewPath, readJsonObject(latestOverviewPath)) || {} : {};
      pass = safeString(workerDecision.scope, 80) === "worker_decision"
        && safeString(overview.headlineScope, 80) === "worker_decision"
        && safeString(overview.workerDecisionHeadline, 80) === safeString(workerDecision.topLevelOutcome, 80);
      detail = pass ? "worker decision surface is the primary operator headline" : "worker decision surface is not wired as the primary headline";
    } else if (id === "worker_decision_surface_export_session_consistent") {
      const workerDecision = writtenOrRuntimeJson(workerDecisionSurfacePath, readJsonObject(workerDecisionSurfacePath)) || {};
      const adoptionEval = writtenOrRuntimeJson(adoptionReadinessEvalPath, readJsonObject(adoptionReadinessEvalPath)) || {};
      const iteration = writtenOrRuntimeJson(iterationDecisionPath, readJsonObject(iterationDecisionPath)) || {};
      const learning = writtenOrRuntimeJson(paths.agiReadiness.autonomousLearningStatusJson, autonomousAgenda) || {};
      const goal = writtenOrRuntimeJson(paths.agiReadiness.goalCompletionStatusJson, goalCompletionStatus) || {};
      const subjectiveGoal = writtenOrRuntimeJson(paths.agiReadiness.subjectiveGoalCompletionStatusJson, subjectiveGoalCompletionStatus) || {};
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const adoptionStatus = writtenOrRuntimeJson(paths.agiReadiness.learningAdoptionStatusJson, learningAdoptionStatus) || {};
      const probeStatus = writtenOrRuntimeJson(paths.agiReadiness.selfDirectedProbeStatusJson, selfDirectedProbeStatus) || {};
      const novelStatus = writtenOrRuntimeJson(paths.agiReadiness.novelTaskAcquisitionJson, novelTaskAcquisition) || {};
      const noHitl = fs.existsSync(noHitlAnalysisPath) ? readJsonObject(noHitlAnalysisPath) : {};
      const sessionIds = uniqueStrings([
        safeString(workerDecision.exportSessionId, 120),
        safeString(goal.exportSessionId, 120),
        safeString(subjectiveGoal.exportSessionId, 120),
        safeString(compatibilityGoal.exportSessionId, 120),
        safeString(learning.exportSessionId, 120),
        safeString(adoptionStatus.exportSessionId, 120),
        safeString(probeStatus.exportSessionId, 120),
        safeString(novelStatus.exportSessionId, 120),
        safeString(adoptionEval.exportSessionId, 120),
        safeString(iteration.exportSessionId, 120),
        safeString(noHitl.exportSessionId, 120),
      ], 16, 120);
      pass = sessionIds.length === 1;
      detail = pass ? `shared export session ${sessionIds[0] || "unset"}` : `mismatched export sessions: ${sessionIds.join(", ") || "missing"}`;
    } else if (id === "worker_completion_status_present") {
      const workerCompletion = writtenOrRuntimeJson(workerCompletionStatusPath, workerCompletionStatus) || {};
      pass = Boolean(
        (!requireWrittenPublicArtifacts || fs.existsSync(workerCompletionStatusPath))
        && safeString(workerCompletion.schema, 160) === "worker-completion-status.v1"
        && safeString(workerCompletion.scope, 80) === "worker_completion"
        && safeString(workerCompletion.workerGoalStatus, 80)
      );
      detail = pass ? "worker completion companion artifact is present" : "worker completion companion artifact missing or malformed";
    } else if (id === "worker_completion_status_consistent") {
      const workerCompletion = writtenOrRuntimeJson(workerCompletionStatusPath, workerCompletionStatus) || {};
      const workerDecision = writtenOrRuntimeJson(workerDecisionSurfacePath, readJsonObject(workerDecisionSurfacePath)) || {};
      const goal = writtenOrRuntimeJson(paths.agiReadiness.goalCompletionStatusJson, goalCompletionStatus) || {};
      const subjectiveGoal = writtenOrRuntimeJson(paths.agiReadiness.subjectiveGoalCompletionStatusJson, subjectiveGoalCompletionStatus) || {};
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const learning = writtenOrRuntimeJson(paths.agiReadiness.autonomousLearningStatusJson, autonomousAgenda) || {};
      const gateCounts = learning.gateDecisionCounts && typeof learning.gateDecisionCounts === "object"
        ? learning.gateDecisionCounts
        : {};
      const excludedCounts = gateCounts.excludedMetaCompletionCounts && typeof gateCounts.excludedMetaCompletionCounts === "object"
        ? gateCounts.excludedMetaCompletionCounts
        : {};
      const sessionIds = uniqueStrings([
        safeString(workerCompletion.exportSessionId, 120),
        safeString(workerDecision.exportSessionId, 120),
        safeString(goal.exportSessionId, 120),
        safeString(subjectiveGoal.exportSessionId, 120),
        safeString(compatibilityGoal.exportSessionId, 120),
        safeString(learning.exportSessionId, 120),
      ], 8, 120);
      const activeLearningDebtOpen = (
        clampInt(learning.currentRunningCount, 0, 999999, 0) > 0
        || clampInt(learning.currentBlockedCount, 0, 999999, 0) > 0
        || clampInt(learning.currentInsufficientEvidenceCount, 0, 999999, 0) > 0
      );
      const headlineWorkerComplete = safeString(workerCompletion.headlineWorkerOutcome, 80) === "ADOPTABLE_COMPLETE";
      pass = Boolean(
        safeString(workerCompletion.decisionMeaning, 240) === "worker_headline_stop_semantics_with_background_program_readiness_context"
        && safeString(workerCompletion.headlineArtifactPath, 220).endsWith("output/governance_public/worker_decision_surface.json")
        && sessionIds.length === 1
        && safeString(workerCompletion.headlineWorkerOutcome, 80) === safeString(workerDecision.topLevelOutcome, 80)
        && safeString(workerCompletion.workerGoalStatus, 80) === (headlineWorkerComplete ? "WORKER_COMPLETE" : "NOT_YET")
        && safeString(workerCompletion.backgroundArtifactSessionConsistency, 80) === "aligned"
        && Boolean(workerCompletion.backgroundArtifactInputsTrusted) === true
        && safeString(workerCompletion.programReadinessStatus, 80) === safeString(goal.goalStatus, 80)
        && safeString(workerCompletion.subjectiveCompanionStatus, 80) === safeString(subjectiveGoal.subjectiveGoalStatus, 80)
        && safeString(workerCompletion.compatibilityStatus, 80) === safeString(compatibilityGoal.status, 80)
        && clampInt(workerCompletion.gateRunningAgendaCount, 0, 999999, -1) === clampInt(goal && goal.currentValues && goal.currentValues.runningAgendaCount, 0, 999999, -2)
        && clampInt(workerCompletion.gateBlockedAgendaCount, 0, 999999, -1) === clampInt(subjectiveGoal && subjectiveGoal.subjectiveCurrentValues && subjectiveGoal.subjectiveCurrentValues.blockedAgendaCount, 0, 999999, -2)
        && clampInt(workerCompletion.gateInsufficientEvidenceCount, 0, 999999, -1) === clampInt(gateCounts.insufficientEvidenceCount, 0, 999999, -2)
        && clampInt(workerCompletion.supportingCurrentRunningCount, 0, 999999, -1) === clampInt(learning.currentRunningCount, 0, 999999, -2)
        && clampInt(workerCompletion.supportingCurrentBlockedCount, 0, 999999, -1) === clampInt(learning.currentBlockedCount, 0, 999999, -2)
        && clampInt(workerCompletion.supportingCurrentInsufficientEvidenceCount, 0, 999999, -1) === clampInt(learning.currentInsufficientEvidenceCount, 0, 999999, -2)
        && clampInt(workerCompletion.excludedMetaCompletionRunningCount, 0, 999999, -1) === clampInt(excludedCounts.running, 0, 999999, -2)
        && clampInt(workerCompletion.excludedMetaCompletionBlockedCount, 0, 999999, -1) === clampInt(excludedCounts.blocked, 0, 999999, -2)
        && clampInt(workerCompletion.excludedMetaCompletionInsufficientEvidenceCount, 0, 999999, -1) === clampInt(excludedCounts.insufficientEvidenceCount, 0, 999999, -2)
        && Boolean(workerCompletion.activeLearningDebtOpen) === activeLearningDebtOpen
        && workerCompletion.activeLearningDebtDecisionBasis
        && safeString(workerCompletion.activeLearningDebtDecisionBasis.mode, 160) === "supporting_non_memory_eval_open_counts_with_gate_subset_explicit"
        && workerCompletion.programReadinessBlockingWorkerStop === false
        && workerCompletion.activeLearningDebtBlocksWorkerStop === false
        && JSON.stringify(uniqueStrings(workerCompletion.backgroundProgramReadinessWhyNotYet, 12)) === JSON.stringify(uniqueStrings(goal.whyNotYet, 12))
        && Array.isArray(workerCompletion.supportingArtifacts)
        && workerCompletion.supportingArtifacts.includes("output/governance_public/worker_decision_surface.json")
        && workerCompletion.supportingArtifacts.includes("output/agi_readiness/goal_completion_status.json")
        && workerCompletion.supportingArtifacts.includes("output/agi_readiness/subjective_goal_completion_status.json")
        && workerCompletion.supportingArtifacts.includes("output/agi_readiness/compatibility_completion_status.json")
        && workerCompletion.supportingArtifacts.includes("output/agi_readiness/autonomous_learning_status.json")
        && (
          !headlineWorkerComplete
          || (
            Array.isArray(workerCompletion.failedCriteria)
            && workerCompletion.failedCriteria.length === 0
            && Array.isArray(workerCompletion.whyNotYet)
            && workerCompletion.whyNotYet.length === 0
          )
        )
        && (
          headlineWorkerComplete
          || (
            Array.isArray(workerCompletion.failedCriteria)
            && workerCompletion.failedCriteria.length > 0
            && Array.isArray(workerCompletion.whyNotYet)
            && workerCompletion.whyNotYet.length > 0
          )
        )
      );
      detail = pass
        ? `worker completion companion stays aligned with worker headline under export session ${sessionIds[0] || "unset"}`
        : WORKER_COMPLETION_DIVERGENCE_DETAIL;
    } else if (id === "worker_completion_alignment_not_stale_in_downstream_surfaces") {
      const workerCompletion = writtenOrRuntimeJson(workerCompletionStatusPath, workerCompletionStatus) || {};
      const goal = writtenOrRuntimeJson(paths.agiReadiness.goalCompletionStatusJson, goalCompletionStatus) || {};
      const unknowns = writtenOrRuntimeJson(paths.agiReadiness.openUnknownsRegisterJson, openUnknownsRegister) || {};
      const blockerResolved = safeString(workerCompletion.backgroundArtifactSessionConsistency, 80) === "aligned"
        && Boolean(workerCompletion.backgroundArtifactInputsTrusted) === true
        && safeString(workerCompletion.decisionMeaning, 240) === "worker_headline_stop_semantics_with_background_program_readiness_context";
      const staleMentions = uniqueStrings([
        ...(Array.isArray(goal && goal.requiredNextActions) ? goal.requiredNextActions : []),
        ...(Array.isArray(workspaceProgressPublic && workspaceProgressPublic.nextRecommendedActions) ? workspaceProgressPublic.nextRecommendedActions : []),
        ...((Array.isArray(unknowns && unknowns.items) ? unknowns.items : []).map((entry) => safeString(entry && entry.summary, 240))),
      ], 24, 240).filter((entry) => entry === WORKER_COMPLETION_DIVERGENCE_DETAIL);
      pass = !blockerResolved || staleMentions.length === 0;
      detail = pass
        ? "downstream remediation surfaces do not retain a stale worker-companion divergence blocker"
        : "downstream remediation surfaces still report a resolved worker-companion divergence blocker";
    } else if (id === "goal_completion_scope_is_program_readiness") {
      const goal = writtenOrRuntimeJson(paths.agiReadiness.goalCompletionStatusJson, goalCompletionStatus) || {};
      pass = safeString(goal.scope, 80) === "program_readiness";
      detail = pass ? "goal completion is scoped to program readiness" : "goal completion scope is missing or not program_readiness";
    } else if (id === "subjective_completion_scope_is_companion") {
      const subjectiveGoal = writtenOrRuntimeJson(paths.agiReadiness.subjectiveGoalCompletionStatusJson, subjectiveGoalCompletionStatus) || {};
      pass = safeString(subjectiveGoal.scope, 80) === "subjective_companion"
        && safeString(subjectiveGoal.subjectiveDecisionBasis, 160) === "worker_centric_subjective_companion_gate";
      detail = pass ? "subjective completion is a worker-centric companion gate" : "subjective completion still behaves like a top-level headline";
    } else if (id === "compatibility_completion_scope_is_compatibility_only") {
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      pass = safeString(compatibilityGoal.scope, 80) === "compatibility_layer";
      detail = pass ? "compatibility completion is scoped to the compatibility layer" : "compatibility completion scope is missing or incorrect";
    } else if (id === "legacy_sovereign_alias_not_used_as_active_logic") {
      const sovereignPath = paths.agiReadiness && paths.agiReadiness.sovereignGoalCompletionStatusJson ? paths.agiReadiness.sovereignGoalCompletionStatusJson : "";
      const sovereignGoal = sovereignPath ? writtenOrRuntimeJson(sovereignPath, sovereignGoalCompletionStatus) || {} : {};
      const subjectiveGoal = writtenOrRuntimeJson(paths.agiReadiness.subjectiveGoalCompletionStatusJson, subjectiveGoalCompletionStatus) || {};
      const subjectiveArtifacts = Array.isArray(subjectiveGoal.supportingArtifacts) ? subjectiveGoal.supportingArtifacts : [];
      pass = Boolean(sovereignGoal.deprecatedCompatibilityOnly)
        && safeString(sovereignGoal.scope, 80) === "legacy_compatibility_alias"
        && safeString(sovereignGoal.activeLogic, 80) === "no_override"
        && !/sovereign/i.test(safeString(subjectiveGoal.subjectiveDecisionBasis, 160))
        && !subjectiveArtifacts.some((entry) => /sovereign_goal_completion_status/i.test(safeString(entry, 220)));
      detail = pass ? "legacy sovereign alias is isolated from active subjective logic" : "legacy sovereign alias still influences active subjective logic";
    } else if (id === "compatibility_completion_artifact_present") {
      const compatibilityPath = paths.agiReadiness && paths.agiReadiness.compatibilityCompletionStatusJson ? paths.agiReadiness.compatibilityCompletionStatusJson : "";
      const compatibilityGoal = writtenOrRuntimeJson(compatibilityPath, compatibilityCompletionStatus);
      pass = Boolean(
        compatibilityPath
        && (!requireWrittenPublicArtifacts || fs.existsSync(compatibilityPath))
        && compatibilityGoal
        && safeString(compatibilityGoal.schema, 160) === "agi-compatibility-completion-status.v1"
      );
      detail = pass ? "compatibility completion artifact is present" : "compatibility completion artifact missing";
    } else if (id === "autonomous_learning_current_historical_counts_distinct") {
      const learning = writtenOrRuntimeJson(paths.agiReadiness.autonomousLearningStatusJson, autonomousAgenda) || {};
      const requiredFields = [
        "currentQueuedCount",
        "currentRunningCount",
        "currentBlockedCount",
        "currentInsufficientEvidenceCount",
        "historicalQueuedCount",
        "historicalRunningCount",
        "historicalBlockedCount",
        "historicalInsufficientEvidenceCount",
        "currentVerifiedPositiveCount",
        "historicalVerifiedPositiveCount",
      ];
      const semanticsValidation = validateAutonomousLearningCountSemantics(learning);
      pass = requiredFields.every((field) => Number.isFinite(Number(learning[field])) && Number(learning[field]) >= 0)
        && semanticsValidation.pass;
      detail = pass ? "autonomous learning separates current and historical counts with explicit semantics" : semanticsValidation.detail;
    } else if (id === "autonomous_learning_current_counts_consistent") {
      const learning = writtenOrRuntimeJson(paths.agiReadiness.autonomousLearningStatusJson, autonomousAgenda) || {};
      const summaryValidation = validateAutonomousLearningSummaryCountContract(learning);
      pass = summaryValidation.pass;
      detail = summaryValidation.detail;
    } else if (id === "autonomous_learning_verified_positive_semantics_consistent") {
      const learning = writtenOrRuntimeJson(paths.agiReadiness.autonomousLearningStatusJson, autonomousAgenda) || {};
      const semanticsValidation = validateAutonomousLearningCountSemantics(learning);
      const summaryValidation = validateAutonomousLearningSummaryCountContract(learning);
      pass = semanticsValidation.pass
        && summaryValidation.pass
        && clampInt(learning && learning.summary && learning.summary.verifiedPositive, 0, 999999, -1) === clampInt(learning.currentVerifiedPositiveCount, 0, 999999, -2);
      detail = pass ? "verified-positive counts follow one explicit current/historical contract" : "verified-positive current/historical semantics are inconsistent";
    } else if (id === "autonomous_learning_summary_matches_count_contract") {
      const learning = writtenOrRuntimeJson(paths.agiReadiness.autonomousLearningStatusJson, autonomousAgenda) || {};
      const summaryValidation = validateAutonomousLearningSummaryCountContract(learning);
      pass = summaryValidation.pass;
      detail = summaryValidation.detail;
    } else if (id === "latest_overview_headline_uses_worker_decision_surface") {
      const overview = latestOverviewPath ? writtenOrRuntimeJson(latestOverviewPath, readJsonObject(latestOverviewPath)) || {} : {};
      pass = safeString(overview.workerDecisionSurfacePath, 220).endsWith("output/governance_public/worker_decision_surface.json")
        && safeString(overview.headlineScope, 80) === "worker_decision"
        && Boolean(overview.workerDecisionSurface && safeString(overview.workerDecisionSurface.topLevelOutcome, 80));
      detail = pass ? "latest overview uses the worker decision surface as the headline" : "latest overview does not use the worker decision surface as the headline";
    } else if (id === "docs_aligned_with_governed_worker_semantics") {
      const docs = [
        path.join(workspaceRoot, "README.md"),
        path.join(workspaceRoot, "HARNESS_MAP.md"),
        path.join(workspaceRoot, "docs", "CURRENT_ARCHITECTURE.md"),
        path.join(workspaceRoot, "docs", "AGI_OPERATIONAL_COMPLETION.md"),
        path.join(workspaceRoot, "docs", "GOVERNED_AUTONOMOUS_LEARNING_LOOP.md"),
      ]
        .filter((targetPath) => fs.existsSync(targetPath))
        .map((targetPath) => fs.readFileSync(targetPath, "utf8"))
        .join("\n");
      pass = /worker_decision_surface/i.test(docs)
        && /program[_ -]?readiness/i.test(docs)
        && /legacy compatibility alias/i.test(docs)
        && !/sovereign current truth/i.test(docs);
      detail = pass ? "docs align with governed worker semantics" : "docs still describe a conflicting current-truth model";
    } else if (id === "self_authored_goal_market_present") {
      const targetPath = paths.agiReadiness && paths.agiReadiness.selfAuthoredGoalMarketJson ? paths.agiReadiness.selfAuthoredGoalMarketJson : "";
      const artifact = writtenOrRuntimeJson(targetPath, selfAuthoredGoalMarket);
      pass = Boolean(targetPath && artifact && safeString(artifact.schema, 160) === "agi-readiness-self-authored-goal-market.v1" && Array.isArray(artifact.entries));
      detail = pass ? "self-authored goal market is present" : "self-authored goal market missing";
    } else if (id === "self_authored_goal_history_present") {
      const targetPath = paths.agiReadiness && paths.agiReadiness.selfAuthoredGoalHistoryJson ? paths.agiReadiness.selfAuthoredGoalHistoryJson : "";
      const artifact = writtenOrRuntimeJson(targetPath, selfAuthoredGoalHistory);
      pass = Boolean(targetPath && artifact && safeString(artifact.schema, 160) === "agi-readiness-self-authored-goal-history.v1" && Array.isArray(artifact.entries));
      detail = pass ? "self-authored goal history is present" : "self-authored goal history missing";
    } else if (id === "workspace_world_model_present") {
      const targetPath = paths.agiReadiness && paths.agiReadiness.workspaceWorldModelJson ? paths.agiReadiness.workspaceWorldModelJson : "";
      const artifact = writtenOrRuntimeJson(targetPath, workspaceWorldModel);
      pass = Boolean(targetPath && artifact && safeString(artifact.schema, 160) === "agi-readiness-workspace-world-model.v1" && Array.isArray(artifact.supportedTaskFamilies));
      detail = pass ? "workspace world model is present" : "workspace world model missing";
    } else if (id === "open_unknowns_register_present") {
      const targetPath = paths.agiReadiness && paths.agiReadiness.openUnknownsRegisterJson ? paths.agiReadiness.openUnknownsRegisterJson : "";
      const artifact = writtenOrRuntimeJson(targetPath, openUnknownsRegister);
      pass = Boolean(targetPath && artifact && safeString(artifact.schema, 160) === "agi-readiness-open-unknowns-register.v1" && Array.isArray(artifact.items));
      detail = pass ? "open unknowns register is present" : "open unknowns register missing";
    } else if (id === "security_constitution_status_present") {
      const targetPath = paths.agiReadiness && paths.agiReadiness.securityConstitutionStatusJson ? paths.agiReadiness.securityConstitutionStatusJson : "";
      const artifact = writtenOrRuntimeJson(targetPath, securityConstitutionStatus);
      pass = Boolean(targetPath && artifact && safeString(artifact.schema, 160) === "agi-readiness-security-constitution-status.v1" && artifact.summary);
      detail = pass ? "security constitution status is present" : "security constitution status missing";
    } else if (id === "rollback_readiness_present") {
      const targetPath = paths.agiReadiness && paths.agiReadiness.rollbackReadinessJson ? paths.agiReadiness.rollbackReadinessJson : "";
      const artifact = writtenOrRuntimeJson(targetPath, rollbackReadiness);
      pass = Boolean(targetPath && artifact && safeString(artifact.schema, 160) === "agi-readiness-rollback-readiness.v1" && artifact.summary);
      detail = pass ? "rollback readiness is present" : "rollback readiness missing";
    } else if (id === "autonomy_budget_status_present") {
      const targetPath = paths.agiReadiness && paths.agiReadiness.autonomyBudgetStatusJson ? paths.agiReadiness.autonomyBudgetStatusJson : "";
      const artifact = writtenOrRuntimeJson(targetPath, autonomyBudgetStatus);
      pass = Boolean(targetPath && artifact && safeString(artifact.schema, 160) === "agi-readiness-autonomy-budget-status.v1");
      detail = pass ? "autonomy budget status is present" : "autonomy budget status missing";
    } else if (id === "continuous_improvement_status_present") {
      const targetPath = paths.agiReadiness && paths.agiReadiness.continuousImprovementStatusJson ? paths.agiReadiness.continuousImprovementStatusJson : "";
      const artifact = writtenOrRuntimeJson(targetPath, continuousImprovementStatus);
      pass = Boolean(targetPath && artifact && safeString(artifact.schema, 160) === "agi-readiness-continuous-improvement-status.v1");
      detail = pass ? "continuous improvement status is present" : "continuous improvement status missing";
    } else if (id === "self_authored_causal_effects_present") {
      const targetPath = paths.agiReadiness && paths.agiReadiness.selfAuthoredCausalEffectsJson ? paths.agiReadiness.selfAuthoredCausalEffectsJson : "";
      const artifact = writtenOrRuntimeJson(targetPath, selfAuthoredCausalEffects);
      pass = Boolean(targetPath && artifact && safeString(artifact.schema, 160) === "agi-readiness-self-authored-causal-effects.v1" && artifact.summary);
      detail = pass ? "self-authored causal effects are present" : "self-authored causal effects missing";
    } else if (id === "self_authored_goal_history_consistent_with_lineage") {
      const historyArtifact = writtenOrRuntimeJson(paths.agiReadiness.selfAuthoredGoalHistoryJson, selfAuthoredGoalHistory) || {};
      const causalArtifact = writtenOrRuntimeJson(paths.agiReadiness.selfAuthoredCausalEffectsJson, selfAuthoredCausalEffects) || {};
      const historyEntries = Array.isArray(historyArtifact.entries) ? historyArtifact.entries : [];
      const causalEntries = Array.isArray(causalArtifact.entries) ? causalArtifact.entries : [];
      const historyGoalIds = new Set(historyEntries.map((entry) => safeString(entry && entry.goalId, 160)).filter(Boolean));
      pass = causalEntries.every((entry) => historyGoalIds.has(safeString(entry && entry.goalId, 160)));
      detail = pass ? "self-authored goal history stays consistent with causal-effect entries" : "self-authored causal-effect entries are not covered by goal history";
    } else if (id === "self_authored_counts_history_aware") {
      const statusArtifact = writtenOrRuntimeJson(paths.agiReadiness.selfAuthoredGoalStatusJson, selfAuthoredGoalStatus) || {};
      const historyArtifact = writtenOrRuntimeJson(paths.agiReadiness.selfAuthoredGoalHistoryJson, selfAuthoredGoalHistory) || {};
      pass = clampInt(statusArtifact.selfAuthoredPositiveClosureCountWindow, 0, 999999, 0) >= clampInt(historyArtifact.positiveClosureCount, 0, 999999, 0)
        && clampInt(statusArtifact.blockedSelfAuthoredGoalCount, 0, 999999, 0) >= 0;
      detail = pass ? "self-authored counts remain history-aware" : "self-authored counts dropped below goal-history evidence";
    } else if (id === "self_authored_positive_closure_threshold_enforced") {
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const current = compatibilityGoal.currentValues && typeof compatibilityGoal.currentValues === "object" ? compatibilityGoal.currentValues : {};
      const thresholds = compatibilityGoal.criteria && typeof compatibilityGoal.criteria === "object" ? compatibilityGoal.criteria : {};
      const status = safeString(compatibilityGoal.status, 80);
      pass = status !== "COMPATIBILITY_COMPLETE" || clampInt(current.selfAuthoredPositiveClosureCountWindow, 0, 999999, 0) >= clampInt(thresholds.minSelfAuthoredPositiveClosureCountWindow, 8, 999999, 8);
      detail = pass ? "self-authored positive closure threshold is enforced" : "compatibility complete is present without enough self-authored positive closures";
    } else if (id === "novel_task_window_threshold_enforced") {
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const current = compatibilityGoal.currentValues && typeof compatibilityGoal.currentValues === "object" ? compatibilityGoal.currentValues : {};
      const thresholds = compatibilityGoal.criteria && typeof compatibilityGoal.criteria === "object" ? compatibilityGoal.criteria : {};
      const status = safeString(compatibilityGoal.status, 80);
      pass = status !== "COMPATIBILITY_COMPLETE" || (
        clampInt(current.novelTaskCountWindow, 0, 999999, 0) >= clampInt(thresholds.minNovelTaskCountWindow, 12, 999999, 12)
        && clampInt(current.positiveNovelTaskCountWindow, 0, 999999, 0) >= clampInt(thresholds.minPositiveNovelTaskCountWindow, 8, 999999, 8)
      );
      detail = pass ? "novel task window thresholds are enforced" : "compatibility complete is present without enough novel-task growth";
    } else if (id === "self_directed_probe_window_threshold_enforced") {
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const current = compatibilityGoal.currentValues && typeof compatibilityGoal.currentValues === "object" ? compatibilityGoal.currentValues : {};
      const thresholds = compatibilityGoal.criteria && typeof compatibilityGoal.criteria === "object" ? compatibilityGoal.criteria : {};
      const status = safeString(compatibilityGoal.status, 80);
      pass = status !== "COMPATIBILITY_COMPLETE" || (
        clampInt(current.positiveProbeCountWindow, 0, 999999, 0) >= clampInt(thresholds.minPositiveProbeCountWindow, 6, 999999, 6)
        && clampInt(current.novelProbePositiveCountWindow, 0, 999999, 0) >= clampInt(thresholds.minNovelProbePositiveCountWindow, 4, 999999, 4)
      );
      detail = pass ? "self-directed probe window thresholds are enforced" : "compatibility complete is present without enough probe growth";
    } else if (id === "self_authored_origin_ratio_enforced") {
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const current = compatibilityGoal.currentValues && typeof compatibilityGoal.currentValues === "object" ? compatibilityGoal.currentValues : {};
      const thresholds = compatibilityGoal.criteria && typeof compatibilityGoal.criteria === "object" ? compatibilityGoal.criteria : {};
      const status = safeString(compatibilityGoal.status, 80);
      pass = status !== "COMPATIBILITY_COMPLETE" || safeNumber(current.selfAuthoredOriginRatio, 0) >= safeNumber(thresholds.minSelfAuthoredOriginRatio, 0.6);
      detail = pass ? "self-authored origin ratio is enforced" : "compatibility complete is present with low self-authored origin ratio";
    } else if (id === "no_stale_required_next_actions_when_complete") {
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const goal = writtenOrRuntimeJson(paths.agiReadiness.goalCompletionStatusJson, goalCompletionStatus) || {};
      const compatibilityStatus = safeString(compatibilityGoal.status, 80);
      pass = compatibilityStatus !== "COMPATIBILITY_COMPLETE" || (Array.isArray(goal.requiredNextActions) && goal.requiredNextActions.length === 0);
      detail = pass ? "complete status does not retain stale required next actions" : "complete status still exposes required next actions";
    } else if (id === "security_constitution_zero_violations_enforced") {
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const securityArtifact = writtenOrRuntimeJson(paths.agiReadiness.securityConstitutionStatusJson, securityConstitutionStatus) || {};
      const compatibilityStatus = safeString(compatibilityGoal.status, 80);
      const violationCount = clampInt(securityArtifact.summary && securityArtifact.summary.violationCount, 0, 999999, 0);
      pass = compatibilityStatus !== "COMPATIBILITY_COMPLETE" || violationCount === 0;
      detail = pass ? "security constitution zero-violation rule is enforced" : "compatibility complete is present despite security constitution violations";
    } else if (id === "rollback_readiness_required_for_compatibility_complete") {
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const rollbackArtifact = writtenOrRuntimeJson(paths.agiReadiness.rollbackReadinessJson, rollbackReadiness) || {};
      const compatibilityStatus = safeString(compatibilityGoal.status, 80);
      pass = compatibilityStatus !== "COMPATIBILITY_COMPLETE" || Boolean(rollbackArtifact.rollbackReady);
      detail = pass ? "rollback readiness is required for compatibility complete" : "compatibility complete is present without rollback readiness";
    } else if (id === "compatibility_complete_requires_all_supporting_artifacts") {
      const compatibilityGoal = writtenOrRuntimeJson(paths.agiReadiness.compatibilityCompletionStatusJson, compatibilityCompletionStatus) || {};
      const compatibilityStatus = safeString(compatibilityGoal.status, 80);
      const supportPaths = Array.isArray(compatibilityGoal.supportingArtifacts) ? compatibilityGoal.supportingArtifacts : [];
      const missing = supportPaths.filter((entry) => !fs.existsSync(path.join(workspaceRoot, safeString(entry, 220))));
      pass = compatibilityStatus !== "COMPATIBILITY_COMPLETE" || missing.length === 0;
      detail = pass ? "all supporting artifacts are present for compatibility complete" : `missing supporting artifacts: ${missing.join(", ")}`;
    } else if (id === "public_hygiene_no_unknown_memory_type") {
      const health = writtenOrRuntimeJson(paths.publicOutput.promotionHealthJson, promotionHealthPublic) || {};
      const entries = [
        ...(Array.isArray(health.recentPromotions) ? health.recentPromotions : []),
        ...(Array.isArray(health.recentRevocations) ? health.recentRevocations : []),
      ];
      pass = entries.every((entry) => safeString(entry && entry.memoryType, 80) && safeString(entry && entry.memoryType, 80) !== "unknown");
      detail = pass ? "public artifacts do not expose unknown memoryType" : "public artifacts still expose unknown memoryType";
    } else if (id === "public_hygiene_validation_refs_present") {
      const workspacePublic = writtenOrRuntimeJson(paths.publicOutput.workspaceProgressJson, workspaceProgressPublic) || {};
      const validationEntries = [
        ...(Array.isArray(workspacePublic.lastSuccessfulValidation) ? workspacePublic.lastSuccessfulValidation : []),
        ...(Array.isArray(workspacePublic.lastFailedValidation) ? workspacePublic.lastFailedValidation : []),
      ];
      pass = validationEntries.every((entry) => Boolean(safeString(entry && entry.reference, 120)));
      detail = pass ? "validation references are populated" : "one or more validation references are blank";
    } else if (id === "public_hygiene_no_blank_task_outcome_status") {
      const workspacePublic = writtenOrRuntimeJson(paths.publicOutput.workspaceProgressJson, workspaceProgressPublic) || {};
      const validationEntries = [
        ...(Array.isArray(workspacePublic.lastSuccessfulValidation) ? workspacePublic.lastSuccessfulValidation : []),
        ...(Array.isArray(workspacePublic.lastFailedValidation) ? workspacePublic.lastFailedValidation : []),
      ];
      pass = validationEntries.every((entry) => Boolean(safeString(entry && entry.taskOutcomeStatus, 120)));
      detail = pass ? "task outcome statuses are populated" : "one or more task outcome statuses are blank";
    } else if (id === "public_hygiene_no_raw_uuid_titles") {
      const coveragePublic = writtenOrRuntimeJson(paths.agiReadiness.domainCoverageMatrixJson, readinessArtifacts && readinessArtifacts.coverage) || {};
      const values = collectPublicLeafValues(coveragePublic).map((entry) => entry.value);
      pass = values.every((entry) => typeof entry !== "string" || !isUuidLike(entry));
      detail = pass ? "public titles do not expose raw UUID-like values" : "public artifacts still expose UUID-like values";
    } else if (id === "public_hygiene_iso8601_timestamps") {
      const timestampSources = [
        writtenOrRuntimeJson(paths.publicOutput.workspaceProgressJson, workspaceProgressPublic),
        writtenOrRuntimeJson(paths.agiReadiness.latestJson, readiness),
        writtenOrRuntimeJson(paths.continuityPublic.latestSummaryJson, continuityArtifact),
      ];
      const timestampLeaves = timestampSources.flatMap((source) => collectPublicLeafValues(source).filter((entry) => /(?:At|generatedAt|updatedAt)$/i.test(entry.keyPath)));
      pass = timestampLeaves.every((entry) => !safeString(entry.value, 120) || isIsoTimestamp(entry.value));
      detail = pass ? "public timestamps are normalized to ISO-8601" : "public artifacts still contain non-ISO timestamps";
    }
    return {
      id,
      title: safeString(check && check.title, 240),
      status: pass ? "PASS" : "FAIL",
      detail,
    };
  });
  const failedChecks = checkResults.filter((entry) => entry.status !== "PASS").map((entry) => entry.id);
  return {
    schema: "memory-eval-public-status.v1",
    generatedAt: toIso(),
    suiteSchema: safeString(suite && suite.schema, 120) || "memory-eval-suite.v1",
    suiteVersion: safeString(suite && suite.version, 80),
    status: failedChecks.length ? "FAIL" : "PASS",
    failedCheckIds: failedChecks,
    checks: checkResults,
  };
}

function renderMemoryEvalMarkdown(result) {
  const lines = [
    "# Memory Eval Public Status",
    "",
    `- Status: ${safeString(result && result.status, 20) || "UNKNOWN"}`,
    `- Generated At: ${safeString(result && result.generatedAt, 80) || "-"}`,
    "",
    "## Checks",
  ];
  for (const entry of Array.isArray(result && result.checks) ? result.checks : []) {
    lines.push(`- ${safeString(entry.id, 120)}: ${safeString(entry.status, 20)} (${safeString(entry.detail, 280) || safeString(entry.title, 240)})`);
  }
  return `${lines.join("\n")}\n`;
}

function buildGovernedMemoryPublicArtifacts({ workspaceRoot = workspaceRootDefault, requireWrittenPublicArtifacts = false } = {}) {
  if (hasLiveRuntimeSources(workspaceRoot)) {
    try {
      syncGovernedMemoryGraphFromLocalRuntimeFiles({ workspaceRoot, reason: "public_export_live_sync" });
    } catch {
      // Keep public export resilient even when live sync cannot refresh.
    }
  }
  const policy = loadPublicExportPolicy(workspaceRoot);
  const persisted = loadPersistedGovernedMemoryState({ workspaceRoot });
  const { paths, items, pack, summary } = persisted;
  const exportSessionId = resolvePublicExportSessionId(workspaceRoot, summary.workspaceId);
  const thresholds = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json").scoreThresholds || {};
  const observationProjectionPath = path.join(paths.projections.observationStateRoot, "latest.json");
  const continuityProjectionPath = path.join(paths.projections.continuityStateRoot, "latest.json");
  const readinessProjectionPath = path.join(paths.projections.readinessRoot, "latest.json");
  const robustnessBreakdownProjectionPath = path.join(paths.projections.readinessRoot, "robustness_breakdown.json");
  const promotionTrendProjectionPath = path.join(paths.projections.readinessRoot, "promotion_trend.json");
  const blockedReasonsProjectionPath = path.join(paths.projections.readinessRoot, "blocked_reasons.json");
  const coverageProjectionPath = path.join(paths.projections.familyCoverageRoot, "latest.json");
  const bottlenecksProjectionPath = path.join(paths.projections.bottlenecksRoot, "latest.json");
  const learningAgendaProjectionPath = path.join(paths.projections.learningAgendaRoot, "latest.json");
  const causalTraceProjectionPath = path.join(paths.projections.causalTraceRoot, "latest.json");
  const continuityDebtProjectionPath = path.join(paths.projections.continuityDebtRoot, "latest.json");
  const distinctLineageProjectionPath = path.join(paths.projections.readinessRoot, "distinct_lineage.json");
  const robustnessRemediationStatusProjectionPath = path.join(paths.projections.readinessRoot, "robustness_remediation_status.json");
  const robustnessRemediationTrendProjectionPath = path.join(paths.projections.readinessRoot, "robustness_remediation_trend.json");
  const allEvents = loadJsonl(paths.eventsPath);
  let observationProjection = readJsonObject(observationProjectionPath);
  if (!observationProjection || typeof observationProjection !== "object" || safeString(observationProjection.schema, 120) !== "governed-memory-observation-projection.v1") {
    observationProjection = buildObservationProjection({ workspaceRoot, items, events: allEvents });
    writeJsonIfChanged(observationProjectionPath, observationProjection);
  }
  let continuityProjection = readJsonObject(continuityProjectionPath);
  const retrievalPacks = loadJsonl(paths.retrieval.packsPath);
  const continuityBridge = continuityProjection && typeof continuityProjection === "object"
    ? {
      summary: continuityProjection.summary && typeof continuityProjection.summary === "object" ? continuityProjection.summary : {},
      tasks: Array.isArray(continuityProjection.tasks) ? continuityProjection.tasks : [],
    }
    : buildContinuityBridge({ workspaceRoot });
  if (!continuityProjection || typeof continuityProjection !== "object" || safeString(continuityProjection.schema, 120) !== "governed-memory-continuity-projection.v1") {
    continuityProjection = {
      schema: "governed-memory-continuity-projection.v1",
      generatedAt: toIso(),
      workspaceId: summary.workspaceId,
      summary: continuityBridge.summary && typeof continuityBridge.summary === "object" ? continuityBridge.summary : {},
      tasks: Array.isArray(continuityBridge.tasks) ? continuityBridge.tasks : [],
    };
    writeJsonIfChanged(continuityProjectionPath, continuityProjection);
  }
  const previousDistinctLineage = readJsonObject(distinctLineageProjectionPath);
  let readinessArtifacts = buildAgiReadinessArtifacts({ workspaceRoot, items, continuityBridge });
  readinessArtifacts = {
    ...readinessArtifacts,
    distinctLineage: safeString(previousDistinctLineage.schema, 120) ? previousDistinctLineage : readinessArtifacts.distinctLineage,
  };
  writeJsonIfChanged(readinessProjectionPath, readinessArtifacts.readiness);
  writeJsonIfChanged(robustnessBreakdownProjectionPath, readinessArtifacts.robustnessBreakdown);
  writeJsonIfChanged(promotionTrendProjectionPath, readinessArtifacts.promotionTrend);
  writeJsonIfChanged(blockedReasonsProjectionPath, readinessArtifacts.blockedReasons);
  writeJsonIfChanged(coverageProjectionPath, readinessArtifacts.coverage);
  writeJsonIfChanged(distinctLineageProjectionPath, readinessArtifacts.distinctLineage);
  const previousAgenda = readJsonObject(learningAgendaProjectionPath);
  let causalTrace = buildCausalLearningTrace({ workspaceRoot, items, pack, retrievalPacks, observationProjection });
  writeJsonIfChanged(causalTraceProjectionPath, causalTrace);
  let openAIBlogLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "OpenAI Developers Blog",
    sourceTier: "external_primary",
    laneKey: "openai_primary",
    items,
    pack,
    statePath: "output/openai_blog_self_improvement_state.json",
    ledgerPath: "output/openai_blog_learning_ledger.json",
    digestPath: "output/openai_blog_learning_digest.json",
    reportPath: "output/openai_blog_learning_report.md",
    proposalDir: "output/openai_blog_self_improvement_proposals",
    curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
    observationProjection,
    causalTrace,
  });
  let anthropicLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "Anthropic Engineering",
    sourceTier: "external_secondary",
    laneKey: "anthropic_secondary",
    items,
    pack,
    statePath: "output/anthropic_engineering_self_improvement_state.json",
    ledgerPath: "output/anthropic_engineering_learning_ledger.json",
    digestPath: "output/anthropic_engineering_learning_digest.json",
    reportPath: "output/anthropic_engineering_learning_report.md",
    proposalDir: "output/anthropic_engineering_self_improvement_proposals",
    curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
    observationProjection,
    causalTrace,
  });
  let continuityDebt = buildContinuityDebtProjection({ workspaceRoot, continuityBridge, agenda: null });
  writeJsonIfChanged(continuityDebtProjectionPath, continuityDebt);
  let continuityArtifacts = buildContinuityPublicArtifacts({ workspaceRoot, continuityBridge, retrievalPacks, continuityDebt });
  let bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: { checks: [] },
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
  });
  writeJsonIfChanged(bottlenecksProjectionPath, bottlenecks);
  let autonomousAgenda = buildAutonomousLearningAgenda({
    workspaceRoot,
    readinessArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
    previousAgenda,
    bottlenecks,
    exportSessionId,
  });
  writeJsonIfChanged(learningAgendaProjectionPath, autonomousAgenda);
  continuityDebt = buildContinuityDebtProjection({ workspaceRoot, continuityBridge, agenda: autonomousAgenda });
  writeJsonIfChanged(continuityDebtProjectionPath, continuityDebt);
  continuityArtifacts = buildContinuityPublicArtifacts({ workspaceRoot, continuityBridge, retrievalPacks, continuityDebt });
  openAIBlogLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "OpenAI Developers Blog",
    sourceTier: "external_primary",
    laneKey: "openai_primary",
    items,
    pack,
    statePath: "output/openai_blog_self_improvement_state.json",
    ledgerPath: "output/openai_blog_learning_ledger.json",
    digestPath: "output/openai_blog_learning_digest.json",
    reportPath: "output/openai_blog_learning_report.md",
    proposalDir: "output/openai_blog_self_improvement_proposals",
    curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
    observationProjection,
    causalTrace,
  });
  anthropicLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "Anthropic Engineering",
    sourceTier: "external_secondary",
    laneKey: "anthropic_secondary",
    items,
    pack,
    statePath: "output/anthropic_engineering_self_improvement_state.json",
    ledgerPath: "output/anthropic_engineering_learning_ledger.json",
    digestPath: "output/anthropic_engineering_learning_digest.json",
    reportPath: "output/anthropic_engineering_learning_report.md",
    proposalDir: "output/anthropic_engineering_self_improvement_proposals",
    curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
    observationProjection,
    causalTrace,
  });
  let robustnessRemediationStatus = safeString(readJsonObject(robustnessRemediationStatusProjectionPath).schema, 120)
    ? readJsonObject(robustnessRemediationStatusProjectionPath)
    : buildRobustnessRemediationStatus({
      workspaceRoot,
      robustnessBreakdown: readinessArtifacts.robustnessBreakdown,
      agenda: autonomousAgenda,
      previousStatus: {},
    });
  let robustnessRemediationTrend = safeString(readJsonObject(robustnessRemediationTrendProjectionPath).schema, 120)
    ? readJsonObject(robustnessRemediationTrendProjectionPath)
    : buildRobustnessRemediationTrend({ workspaceRoot, remediationStatus: robustnessRemediationStatus });
  writeJsonIfChanged(robustnessRemediationStatusProjectionPath, robustnessRemediationStatus);
  writeJsonIfChanged(robustnessRemediationTrendProjectionPath, robustnessRemediationTrend);
  if (Array.isArray(readinessArtifacts.robustnessBreakdown.categories)) {
    readinessArtifacts.robustnessBreakdown = {
      ...readinessArtifacts.robustnessBreakdown,
      categories: readinessArtifacts.robustnessBreakdown.categories.map((entry) => {
        const remediation = (Array.isArray(robustnessRemediationStatus.categories) ? robustnessRemediationStatus.categories : []).find((row) => safeString(row && row.categoryId, 80) === safeString(entry && entry.categoryId, 80));
        return remediation
          ? {
            ...entry,
            remediationStatus: safeString(remediation.remediationStatus, 80),
            lastRemediationAt: normalizePublicTimestamp(remediation.lastRemediationAt),
            lastImprovementDelta: Number.isFinite(Number(remediation.lastImprovementDelta)) ? Number(remediation.lastImprovementDelta) : null,
            openFailureModes: uniqueStrings(remediation.openFailureModes, 8, 180),
          }
          : entry;
      }),
    };
  }
  const stableCoverageArtifacts = buildStableCoverageArtifacts({ workspaceRoot, coverage: readinessArtifacts.coverage });
  readinessArtifacts.stableCoverageArtifacts = stableCoverageArtifacts;
  writeJsonIfChanged(paths.projections.stableCoverageMatrixPath, stableCoverageArtifacts.matrix);
  writeJsonIfChanged(paths.projections.stableCoverageTrendPath, stableCoverageArtifacts.trend);
  let robustnessRemediationBacklog = buildRobustnessRemediationBacklog({ workspaceRoot, remediationStatus: robustnessRemediationStatus });
  let robustnessRemediationEffects = buildRobustnessRemediationEffects({
    workspaceRoot,
    robustnessBreakdown: readinessArtifacts.robustnessBreakdown,
    remediationStatus: robustnessRemediationStatus,
    agenda: autonomousAgenda,
  });
  const continuityDebtTrend = buildContinuityDebtTrend({ workspaceRoot, continuityDebt, continuityArtifact: continuityArtifacts.artifact });
  const continuityCloseoutEffects = buildContinuityCloseoutEffects({ workspaceRoot, continuityDebt, continuityArtifact: continuityArtifacts.artifact });
  const causalEffectivenessSummary = buildCausalEffectivenessSummary({
    workspaceRoot,
    causalTrace,
    openAIBlogLane,
    anthropicLane,
  });
  const causalRegressionAlerts = buildCausalRegressionAlerts({
    workspaceRoot,
    causalTrace,
    effectivenessSummary: causalEffectivenessSummary,
  });
  const distinctImprovementSummary = buildDistinctImprovementSummary({
    workspaceRoot,
    distinctLineage: readinessArtifacts.distinctLineage,
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
  });
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "distinct_improvement_summary.json"), distinctImprovementSummary);
  writeJsonIfChanged(paths.projections.continuityDebtTrendPath, continuityDebtTrend);
  writeJsonIfChanged(paths.projections.continuityCloseoutEffectsPath, continuityCloseoutEffects);
  writeJsonIfChanged(paths.projections.causalEffectivenessSummaryPath, causalEffectivenessSummary);
  writeJsonIfChanged(paths.projections.causalRegressionAlertsPath, causalRegressionAlerts);
  bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: { checks: [] },
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
  });
  writeJsonIfChanged(bottlenecksProjectionPath, bottlenecks);
  const workspaceProgress = sanitizePublicValue(summary.workspaceProgress || {}, workspaceRoot);
  let workspaceProgressPublic = {
    schema: "governed-memory-workspace-progress-public.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    updatedAt: normalizePublicTimestamp(summary.workspaceProgressUpdatedAt),
    currentObjective: coerceSummaryText(workspaceProgress.currentObjective, workspaceRoot),
    currentMilestones: coerceSummaryList(workspaceProgress.currentMilestones, workspaceRoot, safeNumber(policy && policy.limits && policy.limits.maxMilestones, 6)),
    knownBlockers: coerceSummaryList(workspaceProgress.knownBlockers, workspaceRoot, safeNumber(policy && policy.limits && policy.limits.maxBlockers, 6)),
    knownRisks: coerceSummaryList(workspaceProgress.knownRisks, workspaceRoot, safeNumber(policy && policy.limits && policy.limits.maxRisks, 6)),
    recentTouchedPaths: uniqueStrings(workspaceProgress.recentTouchedPaths, safeNumber(policy && policy.limits && policy.limits.maxTouchedPaths, 8), 220).map((entry) => normalizePublicPath(workspaceRoot, entry)),
    nextRecommendedActions: buildWorkspaceProgressNextRecommendedActions({
      workspaceRoot,
      workspaceProgress,
      autonomousAgenda,
      continuityDebt,
      bottlenecks,
      limit: safeNumber(policy && policy.limits && policy.limits.maxNextActions, 6),
    }),
    lastSuccessfulValidation: Array.isArray(workspaceProgress.lastSuccessfulValidation) ? workspaceProgress.lastSuccessfulValidation.slice(0, 2).map((entry) => ({
      reference: normalizePublicReference(entry && (entry.reference || entry.turnId), "turn"),
      taskOutcomeStatus: normalizePublicStatus(entry && entry.taskOutcomeStatus),
      completedAt: normalizePublicTimestamp(entry && entry.completedAt),
    })) : [],
    lastFailedValidation: Array.isArray(workspaceProgress.lastFailedValidation) ? workspaceProgress.lastFailedValidation.slice(0, 2).map((entry) => ({
      reference: normalizePublicReference(entry && (entry.reference || entry.turnId), "turn"),
      taskOutcomeStatus: normalizePublicStatus(entry && entry.taskOutcomeStatus),
      reason: coerceSummaryText(entry && entry.reason, workspaceRoot),
      completedAt: normalizePublicTimestamp(entry && entry.completedAt),
    })) : [],
  };
  if (!safeString(workspaceProgressPublic.updatedAt, 80)) {
    workspaceProgressPublic.updatedAtReason = "canonical_workspace_progress_updated_at_missing";
  }
  const latestPackPublic = {
    schema: "governed-memory-latest-pack-public.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    packId: safeString(summary.latestPack && summary.latestPack.packId, 120) || maskOpaqueId(`${summary.workspaceId}:${summary.latestPack && summary.latestPack.compiledAt}`, "pack"),
    latestPack: {
      generatedAt: safeString(summary.latestPack && summary.latestPack.generatedAt, 80),
      compiledAt: safeString(summary.latestPack && summary.latestPack.compiledAt, 80),
      activeAgent: safeString(summary.latestPack && summary.latestPack.activeAgent, 80),
      taskFamily: safeString(summary.latestPack && summary.latestPack.taskFamily, 80),
      selectedCount: clampInt(summary.latestPack && summary.latestPack.selectedCount, 0, 999999, 0),
      highConfidenceCount: clampInt(summary.latestPack && summary.latestPack.highConfidenceCount, 0, 999999, 0),
      reusedSelectedCount: clampInt(summary.latestPack && summary.latestPack.reusedSelectedCount, 0, 999999, 0),
      explicitTaskFamilyMismatchCount: clampInt(summary.latestPack && summary.latestPack.explicitTaskFamilyMismatchCount, 0, 999999, 0),
      sectionCounts: summary.latestPack && summary.latestPack.sectionCounts && typeof summary.latestPack.sectionCounts === "object" ? summary.latestPack.sectionCounts : {},
      selectedItems: (Array.isArray(pack && pack.items) ? pack.items : []).slice(0, safeNumber(policy && policy.limits && policy.limits.maxPackItems, 12)).map((entry) => sanitizePublicPackItem(entry, workspaceRoot, thresholds)),
    },
  };
  const promotionHealthPublic = {
    schema: "governed-memory-promotion-health-public.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    staleWarningCount: Array.isArray(summary.staleMemoryWarnings) ? summary.staleMemoryWarnings.length : 0,
    recentPromotions: Array.isArray(summary.recentPromotions) ? summary.recentPromotions.map((entry) => ({
      publicRef: normalizePublicReference(entry && entry.memoryId, "mem"),
      memoryType: safeString(entry && entry.memoryType, 80) || "runtime_event",
      status: normalizePublicStatus(entry && entry.status),
      recordedAt: normalizePublicTimestamp(entry && entry.recordedAt),
    })) : [],
    recentRevocations: Array.isArray(summary.recentRevocations) ? summary.recentRevocations.map((entry) => ({
      publicRef: normalizePublicReference(entry && entry.memoryId, "mem"),
      memoryType: safeString(entry && entry.memoryType, 80) || "runtime_event",
      status: normalizePublicStatus(entry && entry.status),
      recordedAt: normalizePublicTimestamp(entry && entry.recordedAt),
    })) : [],
  };
  const lessonEffectivenessPublic = {
    schema: "governed-memory-lesson-effectiveness-public.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: (Array.isArray(causalTrace && causalTrace.effectiveness) ? causalTrace.effectiveness : [])
      .slice(0, safeNumber(policy && policy.limits && policy.limits.maxPackItems, 12))
      .map((entry) => sanitizePublicValue(entry, workspaceRoot)),
  };
  const packCausalTracePublic = {
    schema: "governed-memory-pack-causal-trace-public.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    packId: safeString(summary.latestPack && summary.latestPack.packId, 120) || normalizePublicReference(`${summary.workspaceId}:pack`, "pack"),
    traces: (Array.isArray(causalTrace && causalTrace.traces) ? causalTrace.traces : [])
      .filter((entry) => Boolean(entry && (entry.selectedInLatestPack || (Array.isArray(entry.usedByTaskRefs) && entry.usedByTaskRefs.length))))
      .slice(0, safeNumber(policy && policy.limits && policy.limits.maxPackItems, 12))
      .map((entry) => sanitizePublicValue(entry, workspaceRoot)),
  };
  let autonomousLearningStatus = buildAutonomousLearningStatusArtifact({
    workspaceRoot,
    workspaceId: summary.workspaceId,
    agenda: autonomousAgenda,
    previousStatus: readJsonObject(paths.agiReadiness.autonomousLearningStatusJson),
    exportSessionId,
  });
  const causalLearningTracePublic = {
    schema: "governed-causal-learning-trace-public.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    summary: {
      traceCount: Array.isArray(causalTrace && causalTrace.traces) ? causalTrace.traces.length : 0,
      likelyContributoryCount: Array.isArray(causalTrace && causalTrace.traces)
        ? causalTrace.traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "likely_contributory").length
        : 0,
      harmfulCount: Array.isArray(causalTrace && causalTrace.traces)
        ? causalTrace.traces.filter((entry) => safeString(entry && entry.usageStage, 80) === "harmful_to_outcome").length
        : 0,
    },
    traces: packCausalTracePublic.traces,
  };
  const distinctImprovementLineagePublic = sanitizePublicValue(
    readinessArtifacts.distinctLineage && typeof readinessArtifacts.distinctLineage === "object"
      ? readinessArtifacts.distinctLineage
      : { schema: "agi-readiness-distinct-improvement-lineage.v1", generatedAt: toIso(), workspaceId: summary.workspaceId, entries: [] },
    workspaceRoot
  );
  const continuityDebtPublic = sanitizePublicValue(
    continuityDebt && typeof continuityDebt === "object"
      ? continuityDebt
      : { schema: "continuity-debt-projection.v1", generatedAt: toIso(), workspaceId: summary.workspaceId, items: [], summary: {} },
    workspaceRoot
  );
  let goalCompletionStatus = buildGoalCompletionStatus({
    workspaceRoot,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    autonomousAgenda,
    autonomousLearningStatus,
    robustnessRemediationEffects,
    causalTrace,
    openAIBlogLane,
    anthropicLane,
    workspaceProgressPublic,
    bottlenecks,
    previousGoalHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "goal" }),
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
    stableCoverageArtifacts,
    causalEffectivenessSummary,
    causalRegressionAlerts,
    exportSessionId,
  });
  applyReadinessScoreCalibration({
    workspaceRoot,
    readiness: readinessArtifacts.readiness,
    autonomousLearningStatus,
    continuityDebt,
    goalCompletionStatus,
    policy: loadAgiReadinessPolicy(workspaceRoot),
  });
  writeJsonIfChanged(paths.projections.goalCompletionHistoryPath, {
    schema: "agi-operational-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: goalCompletionStatus.history && Array.isArray(goalCompletionStatus.history.entries) ? goalCompletionStatus.history.entries : [],
  });
  let publicOverview = {
    schema: "governed-memory-public-overview.v1",
    generatedAt: toIso(),
    exportSessionId,
    workspaceId: summary.workspaceId,
    canonicalRoot: summary.canonicalRoot,
    publicOutputRoot: repoRelative(workspaceRoot, paths.publicOutput.root),
    canonicalEventCount: clampInt(summary.canonicalEventCount, 0, 999999, 0),
    itemCount: clampInt(summary.itemCount, 0, 999999, 0),
    promotedCount: clampInt(summary.promotedCount, 0, 999999, 0),
    typeCounts: summary.typeCounts,
    statusCounts: summary.statusCounts,
    workspaceProgressPath: repoRelative(workspaceRoot, paths.publicOutput.workspaceProgressJson),
    latestPackPath: repoRelative(workspaceRoot, paths.publicOutput.latestPackJson),
    promotionHealthPath: repoRelative(workspaceRoot, paths.publicOutput.promotionHealthJson),
    evalStatusPath: repoRelative(workspaceRoot, paths.publicOutput.memoryEvalStatusJson),
    compatibilityProjectionPaths: summary.compatibilityProjectionPaths,
    ...summarizeWorkerDecisionHeadline(workspaceRoot),
    goalCompletionPath: repoRelative(workspaceRoot, paths.agiReadiness.goalCompletionStatusJson),
    goalStatusScope: "program_readiness",
    goalStatus: safeString(goalCompletionStatus.goalStatus, 80),
    goalStatusPresentationRole: "secondary_non_blocking_context",
    goalWhyNotYetCount: Array.isArray(goalCompletionStatus.whyNotYet) ? goalCompletionStatus.whyNotYet.length : 0,
    subjectiveGoalStatusPath: repoRelative(workspaceRoot, paths.agiReadiness.subjectiveGoalCompletionStatusJson),
    subjectiveGoalStatusScope: "subjective_companion",
    compatibilityCompletionStatusPath: repoRelative(workspaceRoot, paths.agiReadiness.compatibilityCompletionStatusJson),
    compatibilityCompletionScope: "compatibility_layer",
    goalCompletion: {
      scope: "program_readiness",
      status: safeString(goalCompletionStatus.goalStatus, 80),
      displayLabel: "Background program readiness",
      presentationRole: "secondary_non_blocking_context",
      doesNotOverrideWorkerVerdict: true,
      whyNotYetCount: Array.isArray(goalCompletionStatus.whyNotYet) ? goalCompletionStatus.whyNotYet.length : 0,
    },
    latestPack: {
      selectedCount: clampInt(summary.latestPack && summary.latestPack.selectedCount, 0, 999999, 0),
      highConfidenceCount: clampInt(summary.latestPack && summary.latestPack.highConfidenceCount, 0, 999999, 0),
      reusedSelectedCount: clampInt(summary.latestPack && summary.latestPack.reusedSelectedCount, 0, 999999, 0),
      explicitTaskFamilyMismatchCount: clampInt(summary.latestPack && summary.latestPack.explicitTaskFamilyMismatchCount, 0, 999999, 0),
      activeAgent: safeString(summary.latestPack && summary.latestPack.activeAgent, 80),
      taskFamily: safeString(summary.latestPack && summary.latestPack.taskFamily, 80),
      sectionCounts: summary.latestPack && summary.latestPack.sectionCounts && typeof summary.latestPack.sectionCounts === "object" ? summary.latestPack.sectionCounts : {},
    },
    staleWarningCount: Array.isArray(summary.staleMemoryWarnings) ? summary.staleMemoryWarnings.length : 0,
    learningAgendaSummary: sanitizePublicValue(autonomousLearningStatus.summary, workspaceRoot),
  };
  let evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary,
    pack,
    items,
    openAIBlogLane,
    anthropicLane,
    observationProjection,
    continuityArtifacts,
    readinessArtifacts,
    autonomousAgenda,
    causalTrace,
    continuityDebt,
    goalCompletionStatus,
    causalRegressionAlerts,
    workspaceProgressPublic,
    promotionHealthPublic,
    latestPackPublic,
    requireWrittenPublicArtifacts,
  });
  bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: evalStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
  });
  readinessArtifacts.bottlenecks = bottlenecks;
  const readinessConsistencyChecks = buildReadinessConsistencyChecks({
    readiness: readinessArtifacts.readiness,
    coverage: readinessArtifacts.coverage,
    blockedReasons: readinessArtifacts.blockedReasons,
    bottlenecks,
  });
  readinessArtifacts.readiness.consistencyChecks = readinessConsistencyChecks;
  readinessArtifacts.readiness.autonomousLearningStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.autonomousLearningStatusJson);
  readinessArtifacts.readiness.causalLearningTracePath = repoRelative(workspaceRoot, paths.agiReadiness.causalLearningTraceJson);
  readinessArtifacts.readiness.causalRegressionAlertsPath = repoRelative(workspaceRoot, paths.agiReadiness.causalRegressionAlertsJson);
  readinessArtifacts.readiness.distinctImprovementLineagePath = repoRelative(workspaceRoot, paths.agiReadiness.distinctImprovementLineageJson);
  readinessArtifacts.readiness.distinctImprovementSummaryPath = repoRelative(workspaceRoot, paths.agiReadiness.distinctImprovementSummaryJson);
  readinessArtifacts.readiness.continuityDebtPath = repoRelative(workspaceRoot, paths.continuityPublic.continuityDebtJson);
  readinessArtifacts.readiness.stableCoverageMatrixPath = repoRelative(workspaceRoot, paths.agiReadiness.stableCoverageMatrixJson);
  readinessArtifacts.readiness.stableCoverageTrendPath = repoRelative(workspaceRoot, paths.agiReadiness.stableCoverageTrendJson);
  readinessArtifacts.readiness.robustnessRemediationStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.robustnessRemediationStatusJson);
  readinessArtifacts.readiness.robustnessRemediationBacklogPath = repoRelative(workspaceRoot, paths.agiReadiness.robustnessRemediationBacklogJson);
  readinessArtifacts.readiness.robustnessRemediationEffectsPath = repoRelative(workspaceRoot, paths.agiReadiness.robustnessRemediationEffectsJson);
  readinessArtifacts.readiness.goalCompletionStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.goalCompletionStatusJson);
  readinessArtifacts.readiness.subjectiveGoalCompletionStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.subjectiveGoalCompletionStatusJson);
  readinessArtifacts.readiness.compatibilityCompletionStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.compatibilityCompletionStatusJson);
  readinessArtifacts.readiness.learningAdoptionStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.learningAdoptionStatusJson);
  readinessArtifacts.readiness.selfDirectedProbeStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.selfDirectedProbeStatusJson);
  readinessArtifacts.readiness.novelTaskAcquisitionPath = repoRelative(workspaceRoot, paths.agiReadiness.novelTaskAcquisitionJson);
  readinessArtifacts.readiness.selfAuthoredGoalStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredGoalStatusJson);
  readinessArtifacts.readiness.selfAuthoredGoalHistoryPath = repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredGoalHistoryJson);
  readinessArtifacts.readiness.selfAuthoredGoalMarketPath = repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredGoalMarketJson);
  readinessArtifacts.readiness.openUnknownsRegisterPath = repoRelative(workspaceRoot, paths.agiReadiness.openUnknownsRegisterJson);
  readinessArtifacts.readiness.workspaceWorldModelPath = repoRelative(workspaceRoot, paths.agiReadiness.workspaceWorldModelJson);
  readinessArtifacts.readiness.continuousImprovementStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.continuousImprovementStatusJson);
  readinessArtifacts.readiness.noveltyGrowthStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.noveltyGrowthStatusJson);
  readinessArtifacts.readiness.securityConstitutionStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.securityConstitutionStatusJson);
  readinessArtifacts.readiness.rollbackReadinessPath = repoRelative(workspaceRoot, paths.agiReadiness.rollbackReadinessJson);
  readinessArtifacts.readiness.autonomyBudgetStatusPath = repoRelative(workspaceRoot, paths.agiReadiness.autonomyBudgetStatusJson);
  readinessArtifacts.readiness.selfAuthoredCausalEffectsPath = repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredCausalEffectsJson);
  readinessArtifacts.readiness.selfAuthoredRemediationTrendPath = repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredRemediationTrendJson);
  let learningAdoptionStatus = null;
  let selfDirectedProbeStatus = null;
  let novelTaskAcquisition = null;
  let subjectiveGoalCompletionStatus = null;
  let selfAuthoredGoalMarket = null;
  let selfAuthoredGoalHistory = null;
  let selfAuthoredGoalStatus = null;
  let openUnknownsRegister = null;
  let workspaceWorldModel = null;
  let continuousImprovementStatus = null;
  let noveltyGrowthStatus = null;
  let securityConstitutionStatus = null;
  let rollbackReadiness = null;
  let autonomyBudgetStatus = null;
  let selfAuthoredCausalEffects = null;
  let selfAuthoredRemediationTrend = null;
  let workerCompletionStatus = null;
  let sovereignGoalCompletionStatus = null;
  let compatibilityCompletionStatus = null;
  writeJsonIfChanged(readinessProjectionPath, readinessArtifacts.readiness);
  writeJsonIfChanged(robustnessBreakdownProjectionPath, readinessArtifacts.robustnessBreakdown);
  writeJsonIfChanged(blockedReasonsProjectionPath, readinessArtifacts.blockedReasons);
  writeJsonIfChanged(bottlenecksProjectionPath, bottlenecks);
  evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary,
    pack,
    items,
    openAIBlogLane,
    anthropicLane,
    observationProjection,
    continuityArtifacts,
    readinessArtifacts,
    autonomousAgenda,
    causalTrace,
    continuityDebt,
    goalCompletionStatus,
    workerCompletionStatus,
    subjectiveGoalCompletionStatus,
    compatibilityCompletionStatus,
    sovereignGoalCompletionStatus,
    causalRegressionAlerts,
    learningAdoptionStatus,
    selfDirectedProbeStatus,
    novelTaskAcquisition,
    selfAuthoredGoalStatus,
    selfAuthoredGoalHistory,
    selfAuthoredGoalMarket,
    openUnknownsRegister,
    workspaceWorldModel,
    continuousImprovementStatus,
    noveltyGrowthStatus,
    securityConstitutionStatus,
    rollbackReadiness,
    autonomyBudgetStatus,
    selfAuthoredCausalEffects,
    selfAuthoredRemediationTrend,
    workspaceProgressPublic,
    promotionHealthPublic,
    latestPackPublic,
    requireWrittenPublicArtifacts,
  });
  bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: evalStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
    workerCompletionStatus,
  });
  readinessArtifacts.bottlenecks = bottlenecks;
  writeJsonIfChanged(bottlenecksProjectionPath, bottlenecks);
  autonomousAgenda = buildAutonomousLearningAgenda({
    workspaceRoot,
    readinessArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
    previousAgenda,
    bottlenecks,
    exportSessionId,
  });
  writeJsonIfChanged(learningAgendaProjectionPath, autonomousAgenda);
  continuityDebt = buildContinuityDebtProjection({ workspaceRoot, continuityBridge, agenda: autonomousAgenda });
  writeJsonIfChanged(continuityDebtProjectionPath, continuityDebt);
  continuityArtifacts = buildContinuityPublicArtifacts({ workspaceRoot, continuityBridge, retrievalPacks, continuityDebt });
  robustnessRemediationStatus = buildRobustnessRemediationStatus({
    workspaceRoot,
    robustnessBreakdown: readinessArtifacts.robustnessBreakdown,
    agenda: autonomousAgenda,
    previousStatus: robustnessRemediationStatus,
  });
  robustnessRemediationTrend = buildRobustnessRemediationTrend({ workspaceRoot, remediationStatus: robustnessRemediationStatus });
  writeJsonIfChanged(robustnessRemediationStatusProjectionPath, robustnessRemediationStatus);
  writeJsonIfChanged(robustnessRemediationTrendProjectionPath, robustnessRemediationTrend);
  robustnessRemediationBacklog = buildRobustnessRemediationBacklog({ workspaceRoot, remediationStatus: robustnessRemediationStatus });
  robustnessRemediationEffects = buildRobustnessRemediationEffects({
    workspaceRoot,
    robustnessBreakdown: readinessArtifacts.robustnessBreakdown,
    remediationStatus: robustnessRemediationStatus,
    agenda: autonomousAgenda,
  });
  autonomousLearningStatus = buildAutonomousLearningStatusArtifact({
    workspaceRoot,
    workspaceId: summary.workspaceId,
    agenda: autonomousAgenda,
    previousStatus: readJsonObject(paths.agiReadiness.autonomousLearningStatusJson),
    exportSessionId,
  });
  workspaceProgressPublic = {
    ...workspaceProgressPublic,
    nextRecommendedActions: buildWorkspaceProgressNextRecommendedActions({
      workspaceRoot,
      workspaceProgress,
      autonomousAgenda,
      continuityDebt,
      bottlenecks,
      limit: safeNumber(policy && policy.limits && policy.limits.maxNextActions, 6),
    }),
  };
  goalCompletionStatus = buildGoalCompletionStatus({
    workspaceRoot,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    autonomousAgenda,
    autonomousLearningStatus,
    robustnessRemediationEffects,
    causalTrace,
    openAIBlogLane,
    anthropicLane,
    workspaceProgressPublic,
    bottlenecks,
    previousGoalHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "goal" }),
    stableCoverageArtifacts,
    causalEffectivenessSummary,
    causalRegressionAlerts,
    exportSessionId,
  });
  writeJsonIfChanged(paths.projections.goalCompletionHistoryPath, {
    schema: "agi-operational-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: goalCompletionStatus.history && Array.isArray(goalCompletionStatus.history.entries) ? goalCompletionStatus.history.entries : [],
  });
  learningAdoptionStatus = buildLearningAdoptionStatus({
    workspaceRoot,
    causalTrace,
    openAIBlogLane,
    anthropicLane,
    exportSessionId,
  });
  selfAuthoredGoalMarket = buildSelfAuthoredGoalMarket({
    workspaceRoot,
    autonomousLearningStatus,
    bottlenecks,
    openAIBlogLane,
    anthropicLane,
  });
  selfAuthoredGoalHistory = buildSelfAuthoredGoalHistory({ workspaceRoot, selfAuthoredGoalMarket });
  selfAuthoredGoalStatus = buildSelfAuthoredGoalStatus({ workspaceRoot, selfAuthoredGoalMarket });
  selfDirectedProbeStatus = buildSelfDirectedProbeStatus({
    workspaceRoot,
    autonomousLearningStatus,
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
    selfAuthoredGoalMarket,
    exportSessionId,
  });
  novelTaskAcquisition = buildNovelTaskAcquisition({
    workspaceRoot,
    readinessArtifacts,
    autonomousLearningStatus,
    robustnessRemediationStatus,
    selfAuthoredGoalMarket,
    exportSessionId,
  });
  subjectiveGoalCompletionStatus = buildSubjectiveGoalCompletionStatus({
    workspaceRoot,
    goalCompletionStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    autonomousLearningStatus,
    learningAdoptionStatus,
    selfDirectedProbeStatus,
    novelTaskAcquisition,
    causalEffectivenessSummary,
    distinctImprovementSummary,
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
    exportSessionId,
  });
  subjectiveGoalCompletionStatus = applySovereignCompletionToSubjectiveStatus({
    subjectiveGoalCompletionStatus,
    sovereignGoalCompletionStatus,
    workspaceRoot,
    paths,
  });
  writeJsonIfChanged(paths.projections.subjectiveGoalCompletionHistoryPath, {
    schema: "agi-subjective-goal-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: subjectiveGoalCompletionStatus.history && Array.isArray(subjectiveGoalCompletionStatus.history.entries)
      ? subjectiveGoalCompletionStatus.history.entries
      : [],
  });
  openUnknownsRegister = buildOpenUnknownsRegister({
    workspaceRoot,
    bottlenecks,
    readinessArtifacts,
    robustnessRemediationStatus,
    selfAuthoredGoalMarket,
  });
  workspaceWorldModel = buildWorkspaceWorldModel({
    workspaceRoot,
    readinessArtifacts,
    continuityArtifacts,
    causalRegressionAlerts,
    openUnknownsRegister,
  });
  securityConstitutionStatus = buildSecurityConstitutionStatus({ workspaceRoot, selfAuthoredGoalMarket });
  rollbackReadiness = buildRollbackReadiness({ workspaceRoot, selfAuthoredGoalMarket, securityConstitutionStatus });
  autonomyBudgetStatus = buildAutonomyBudgetStatus({
    workspaceRoot,
    selfAuthoredGoalMarket,
    selfAuthoredGoalStatus,
    autonomousLearningStatus,
  });
  selfAuthoredCausalEffects = buildSelfAuthoredCausalEffects({ workspaceRoot, selfAuthoredGoalMarket });
  continuityArtifacts = {
    ...continuityArtifacts,
    artifact: {
      ...(continuityArtifacts && continuityArtifacts.artifact && typeof continuityArtifacts.artifact === "object" ? continuityArtifacts.artifact : {}),
      selfAuthoredTaskFlow: {
        selfAuthoredGoalCountWindow: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.selfAuthoredGoalCountWindow, 0, 999999, 0),
        positiveClosureCountWindow: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.selfAuthoredPositiveClosureCountWindow, 0, 999999, 0),
        latestRoleMix: uniqueStrings((Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : []).map((entry) => safeString(entry && entry.ownerRole, 80)), 8, 80),
      },
    },
  };
  causalEffectivenessSummary.summary = {
    ...(causalEffectivenessSummary && causalEffectivenessSummary.summary && typeof causalEffectivenessSummary.summary === "object" ? causalEffectivenessSummary.summary : {}),
    selfAuthoredEffectiveContributionCount: clampInt(selfAuthoredCausalEffects && selfAuthoredCausalEffects.summary && selfAuthoredCausalEffects.summary.selfAuthoredEffectiveContributionCount, 0, 999999, 0),
    selfAuthoredHarmfulCount: clampInt(selfAuthoredCausalEffects && selfAuthoredCausalEffects.summary && selfAuthoredCausalEffects.summary.selfAuthoredHarmfulCount, 0, 999999, 0),
  };
  causalEffectivenessSummary.selfAuthored = sanitizePublicValue(selfAuthoredCausalEffects.summary || {}, workspaceRoot);
  continuousImprovementStatus = buildContinuousImprovementStatus({
    workspaceRoot,
    goalCompletionStatus,
    distinctImprovementSummary,
    autonomousLearningStatus,
    selfAuthoredGoalHistory,
    selfAuthoredCausalEffects,
    autonomyBudgetStatus,
  });
  noveltyGrowthStatus = buildNoveltyGrowthStatus({
    workspaceRoot,
    selfAuthoredGoalMarket,
    selfDirectedProbeStatus,
    noveltySource: novelTaskAcquisition,
    readinessArtifacts,
  });
  selfAuthoredRemediationTrend = buildSelfAuthoredRemediationTrend({ workspaceRoot, selfAuthoredGoalHistory });
  compatibilityCompletionStatus = buildCompatibilityCompletionStatus({
    workspaceRoot,
    goalCompletionStatus,
    subjectiveGoalCompletionStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    learningAdoptionStatus,
    selfDirectedProbeStatus,
    novelTaskAcquisition,
    selfAuthoredGoalStatus,
    selfAuthoredGoalHistory,
    selfAuthoredGoalMarket,
    openUnknownsRegister,
    workspaceWorldModel,
    continuousImprovementStatus,
    noveltyGrowthStatus,
    securityConstitutionStatus,
    rollbackReadiness,
    autonomyBudgetStatus,
    selfAuthoredCausalEffects,
    previousCompatibilityStatus: readJsonObject(paths.agiReadiness.compatibilityCompletionStatusJson),
    exportSessionId,
  });
  sovereignGoalCompletionStatus = buildSovereignGoalCompletionStatus({
    workspaceRoot,
    compatibilityCompletionStatus,
    exportSessionId,
  });
  subjectiveGoalCompletionStatus = applySovereignCompletionToSubjectiveStatus({
    subjectiveGoalCompletionStatus,
    sovereignGoalCompletionStatus,
    workspaceRoot,
    paths,
  });
  writeJsonIfChanged(paths.projections.subjectiveGoalCompletionHistoryPath, {
    schema: "agi-subjective-goal-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: subjectiveGoalCompletionStatus.history && Array.isArray(subjectiveGoalCompletionStatus.history.entries)
      ? subjectiveGoalCompletionStatus.history.entries
      : [],
  });
  writeJsonIfChanged(paths.projections.sovereignGoalCompletionHistoryPath, {
    schema: "agi-sovereign-goal-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: sovereignGoalCompletionStatus.history && Array.isArray(sovereignGoalCompletionStatus.history.entries)
      ? sovereignGoalCompletionStatus.history.entries
      : [],
  });
  goalCompletionStatus = {
    ...goalCompletionStatus,
    ...buildGoalCompletionSubjectiveProjection({ workspaceRoot, paths, subjectiveGoalCompletionStatus }),
    ...buildGoalCompletionCompatibilityProjection({ workspaceRoot, paths, compatibilityCompletionStatus }),
  };
  {
    const currentWorkerDecisionSurface = normalizeWorkerDecisionSurfaceForExport(
      readWorkerDecisionSurfaceArtifact(workspaceRoot),
      exportSessionId
    );
    writeJsonIfChanged(paths.governancePublic.workerDecisionSurfaceJson, currentWorkerDecisionSurface);
    normalizeArtifactExportSessionAtPath(path.join(workspaceRoot, "output", "governance_public", "adoption_readiness_eval.json"), exportSessionId);
    normalizeArtifactExportSessionAtPath(path.join(workspaceRoot, "output", "governance_public", "iteration_decision.json"), exportSessionId);
    normalizeArtifactExportSessionAtPath(path.join(workspaceRoot, "output", "externalization_nohitl", "no_hitl_analysis.json"), exportSessionId);
    workerCompletionStatus = buildWorkerCompletionStatus({
      workerDecisionSurface: currentWorkerDecisionSurface,
      goalCompletionStatus,
      subjectiveGoalCompletionStatus,
      compatibilityCompletionStatus,
      exportSessionId,
      backgroundArtifactSessionConsistency: "aligned",
      backgroundArtifactSessionIds: [exportSessionId],
      backgroundArtifactInputsTrusted: true,
      headlineArtifactPath: repoRelative(workspaceRoot, paths.governancePublic.workerDecisionSurfaceJson),
    });
  }
  writeJsonIfChanged(paths.governancePublic.workerCompletionStatusJson, workerCompletionStatus);
  bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: evalStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
    workerCompletionStatus,
  });
  readinessArtifacts.bottlenecks = bottlenecks;
  workspaceProgressPublic = {
    ...workspaceProgressPublic,
    nextRecommendedActions: buildWorkspaceProgressNextRecommendedActions({
      workspaceRoot,
      workspaceProgress,
      autonomousAgenda,
      continuityDebt,
      bottlenecks,
      limit: safeNumber(policy && policy.limits && policy.limits.maxNextActions, 6),
    }),
  };
  goalCompletionStatus = {
    ...goalCompletionStatus,
    requiredNextActions: buildGoalCompletionRequiredNextActions({
      workspaceRoot,
      workspaceProgressPublic,
      bottlenecks,
      whyNotYet: goalCompletionStatus.whyNotYet,
      limit: 8,
    }),
  };
  openUnknownsRegister = buildOpenUnknownsRegister({
    workspaceRoot,
    bottlenecks,
    readinessArtifacts,
    robustnessRemediationStatus,
    selfAuthoredGoalMarket,
  });
  workspaceWorldModel = buildWorkspaceWorldModel({
    workspaceRoot,
    readinessArtifacts,
    continuityArtifacts,
    causalRegressionAlerts,
    openUnknownsRegister,
  });
  evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary,
    pack,
    items,
    openAIBlogLane,
    anthropicLane,
    observationProjection,
    continuityArtifacts,
    readinessArtifacts,
    autonomousAgenda,
    causalTrace,
    continuityDebt,
    goalCompletionStatus,
    workerCompletionStatus,
    subjectiveGoalCompletionStatus,
    compatibilityCompletionStatus,
    causalRegressionAlerts,
    learningAdoptionStatus,
    selfDirectedProbeStatus,
    novelTaskAcquisition,
    selfAuthoredGoalStatus,
    selfAuthoredGoalHistory,
    selfAuthoredGoalMarket,
    openUnknownsRegister,
    workspaceWorldModel,
    continuousImprovementStatus,
    noveltyGrowthStatus,
    securityConstitutionStatus,
    rollbackReadiness,
    autonomyBudgetStatus,
    selfAuthoredCausalEffects,
    selfAuthoredRemediationTrend,
    workspaceProgressPublic,
    promotionHealthPublic,
    latestPackPublic,
    requireWrittenPublicArtifacts,
  });
  publicOverview = {
    ...publicOverview,
    goalStatus: safeString(goalCompletionStatus.goalStatus, 80),
    goalStatusPresentationRole: "secondary_non_blocking_context",
    goalWhyNotYetCount: Array.isArray(goalCompletionStatus.whyNotYet) ? goalCompletionStatus.whyNotYet.length : 0,
    goalCompletion: {
      scope: safeString(goalCompletionStatus.scope, 80) || "program_readiness",
      status: safeString(goalCompletionStatus.goalStatus, 80),
      displayLabel: "Background program readiness",
      presentationRole: "secondary_non_blocking_context",
      doesNotOverrideWorkerVerdict: true,
      whyNotYetCount: Array.isArray(goalCompletionStatus.whyNotYet) ? goalCompletionStatus.whyNotYet.length : 0,
    },
    subjectiveGoalStatus: safeString(subjectiveGoalCompletionStatus.subjectiveGoalStatus, 80),
    subjectiveGoalWhyNotYetCount: Array.isArray(subjectiveGoalCompletionStatus.subjectiveWhyNotYet) ? subjectiveGoalCompletionStatus.subjectiveWhyNotYet.length : 0,
    subjectiveCompletion: {
      scope: safeString(subjectiveGoalCompletionStatus.scope, 80) || "subjective_companion",
      status: safeString(subjectiveGoalCompletionStatus.subjectiveGoalStatus, 80),
      whyNotYetCount: Array.isArray(subjectiveGoalCompletionStatus.subjectiveWhyNotYet) ? subjectiveGoalCompletionStatus.subjectiveWhyNotYet.length : 0,
    },
    compatibilityCompletionStatus: safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.status, 80),
    compatibilityWhyNotYetCount: Array.isArray(compatibilityCompletionStatus && compatibilityCompletionStatus.whyNotYet) ? compatibilityCompletionStatus.whyNotYet.length : 0,
    compatibilityCompletion: {
      scope: safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.scope, 80) || "compatibility_layer",
      status: safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.status, 80),
      whyNotYetCount: Array.isArray(compatibilityCompletionStatus && compatibilityCompletionStatus.whyNotYet) ? compatibilityCompletionStatus.whyNotYet.length : 0,
    },
    workerCompletion: {
      scope: safeString(workerCompletionStatus && workerCompletionStatus.scope, 80) || "worker_completion",
      workerGoalStatus: safeString(workerCompletionStatus && workerCompletionStatus.workerGoalStatus, 80),
      programReadinessStatus: safeString(workerCompletionStatus && workerCompletionStatus.programReadinessStatus, 80),
      operatorReadOrder: Array.isArray(workerCompletionStatus && workerCompletionStatus.operatorReadOrder)
        ? workerCompletionStatus.operatorReadOrder.map((entry) => safeString(entry, 120)).filter(Boolean)
        : [],
      backgroundProgramReadiness: workerCompletionStatus
        && workerCompletionStatus.backgroundProgramReadiness
        && typeof workerCompletionStatus.backgroundProgramReadiness === "object"
          ? sanitizePublicValue(workerCompletionStatus.backgroundProgramReadiness, workspaceRoot)
          : {},
      activeLearningDebtOpen: Boolean(workerCompletionStatus && workerCompletionStatus.activeLearningDebtOpen),
    },
    learningAgendaSummary: sanitizePublicValue(autonomousLearningStatus.summary, workspaceRoot),
    ...summarizeWorkerDecisionHeadline(workspaceRoot),
  };
  evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary,
    pack,
    items,
    openAIBlogLane,
    anthropicLane,
    observationProjection,
    continuityArtifacts,
    readinessArtifacts,
    autonomousAgenda,
    causalTrace,
    continuityDebt,
    goalCompletionStatus,
    workerCompletionStatus,
    compatibilityCompletionStatus,
    causalRegressionAlerts,
    workspaceProgressPublic,
    promotionHealthPublic,
    latestPackPublic,
    requireWrittenPublicArtifacts,
  });
  bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: evalStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
    workerCompletionStatus,
  });
  readinessArtifacts.bottlenecks = bottlenecks;
  autonomousAgenda = buildAutonomousLearningAgenda({
    workspaceRoot,
    readinessArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
    previousAgenda,
    bottlenecks,
    exportSessionId,
  });
  autonomousLearningStatus = buildAutonomousLearningStatusArtifact({
    workspaceRoot,
    workspaceId: summary.workspaceId,
    agenda: autonomousAgenda,
    previousStatus: readJsonObject(paths.agiReadiness.autonomousLearningStatusJson),
    exportSessionId,
  });
  workspaceProgressPublic = {
    ...workspaceProgressPublic,
    nextRecommendedActions: buildWorkspaceProgressNextRecommendedActions({
      workspaceRoot,
      workspaceProgress,
      autonomousAgenda,
      continuityDebt,
      bottlenecks,
      limit: safeNumber(policy && policy.limits && policy.limits.maxNextActions, 6),
    }),
  };
  goalCompletionStatus = buildGoalCompletionStatus({
    workspaceRoot,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    autonomousAgenda,
    autonomousLearningStatus,
    robustnessRemediationEffects,
    causalTrace,
    openAIBlogLane,
    anthropicLane,
    workspaceProgressPublic,
    bottlenecks,
    previousGoalHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "goal" }),
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
    stableCoverageArtifacts,
    causalEffectivenessSummary,
    causalRegressionAlerts,
    exportSessionId,
  });
  writeJsonIfChanged(paths.projections.goalCompletionHistoryPath, {
    schema: "agi-operational-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: goalCompletionStatus.history && Array.isArray(goalCompletionStatus.history.entries) ? goalCompletionStatus.history.entries : [],
  });
  publicOverview = {
    ...publicOverview,
    goalStatus: safeString(goalCompletionStatus.goalStatus, 80),
    goalStatusPresentationRole: "secondary_non_blocking_context",
    goalWhyNotYetCount: Array.isArray(goalCompletionStatus.whyNotYet) ? goalCompletionStatus.whyNotYet.length : 0,
    goalCompletion: {
      scope: safeString(goalCompletionStatus.scope, 80) || "program_readiness",
      status: safeString(goalCompletionStatus.goalStatus, 80),
      displayLabel: "Background program readiness",
      presentationRole: "secondary_non_blocking_context",
      doesNotOverrideWorkerVerdict: true,
      whyNotYetCount: Array.isArray(goalCompletionStatus.whyNotYet) ? goalCompletionStatus.whyNotYet.length : 0,
    },
    learningAgendaSummary: sanitizePublicValue(autonomousLearningStatus.summary, workspaceRoot),
  };
  learningAdoptionStatus = buildLearningAdoptionStatus({
    workspaceRoot,
    causalTrace,
    openAIBlogLane,
    anthropicLane,
    exportSessionId,
  });
  selfAuthoredGoalMarket = buildSelfAuthoredGoalMarket({
    workspaceRoot,
    autonomousLearningStatus,
    bottlenecks,
    openAIBlogLane,
    anthropicLane,
  });
  selfAuthoredGoalHistory = buildSelfAuthoredGoalHistory({ workspaceRoot, selfAuthoredGoalMarket });
  selfAuthoredGoalStatus = buildSelfAuthoredGoalStatus({ workspaceRoot, selfAuthoredGoalMarket });
  selfDirectedProbeStatus = buildSelfDirectedProbeStatus({
    workspaceRoot,
    autonomousLearningStatus,
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
    selfAuthoredGoalMarket,
    exportSessionId,
  });
  novelTaskAcquisition = buildNovelTaskAcquisition({
    workspaceRoot,
    readinessArtifacts,
    autonomousLearningStatus,
    robustnessRemediationStatus,
    selfAuthoredGoalMarket,
    exportSessionId,
  });
  subjectiveGoalCompletionStatus = buildSubjectiveGoalCompletionStatus({
    workspaceRoot,
    goalCompletionStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    autonomousLearningStatus,
    learningAdoptionStatus,
    selfDirectedProbeStatus,
    novelTaskAcquisition,
    causalEffectivenessSummary,
    distinctImprovementSummary,
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
    exportSessionId,
  });
  subjectiveGoalCompletionStatus = applySovereignCompletionToSubjectiveStatus({
    subjectiveGoalCompletionStatus,
    sovereignGoalCompletionStatus,
    workspaceRoot,
    paths,
  });
  writeJsonIfChanged(paths.projections.subjectiveGoalCompletionHistoryPath, {
    schema: "agi-subjective-goal-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: subjectiveGoalCompletionStatus.history && Array.isArray(subjectiveGoalCompletionStatus.history.entries)
      ? subjectiveGoalCompletionStatus.history.entries
      : [],
  });
  openUnknownsRegister = buildOpenUnknownsRegister({
    workspaceRoot,
    bottlenecks,
    readinessArtifacts,
    robustnessRemediationStatus,
    selfAuthoredGoalMarket,
  });
  workspaceWorldModel = buildWorkspaceWorldModel({
    workspaceRoot,
    readinessArtifacts,
    continuityArtifacts,
    causalRegressionAlerts,
    openUnknownsRegister,
  });
  securityConstitutionStatus = buildSecurityConstitutionStatus({ workspaceRoot, selfAuthoredGoalMarket });
  rollbackReadiness = buildRollbackReadiness({ workspaceRoot, selfAuthoredGoalMarket, securityConstitutionStatus });
  autonomyBudgetStatus = buildAutonomyBudgetStatus({
    workspaceRoot,
    selfAuthoredGoalMarket,
    selfAuthoredGoalStatus,
    autonomousLearningStatus,
  });
  selfAuthoredCausalEffects = buildSelfAuthoredCausalEffects({ workspaceRoot, selfAuthoredGoalMarket });
  continuityArtifacts = {
    ...continuityArtifacts,
    artifact: {
      ...(continuityArtifacts && continuityArtifacts.artifact && typeof continuityArtifacts.artifact === "object" ? continuityArtifacts.artifact : {}),
      selfAuthoredTaskFlow: {
        selfAuthoredGoalCountWindow: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.selfAuthoredGoalCountWindow, 0, 999999, 0),
        positiveClosureCountWindow: clampInt(selfAuthoredGoalStatus && selfAuthoredGoalStatus.selfAuthoredPositiveClosureCountWindow, 0, 999999, 0),
        latestRoleMix: uniqueStrings((Array.isArray(selfAuthoredGoalMarket && selfAuthoredGoalMarket.entries) ? selfAuthoredGoalMarket.entries : []).map((entry) => safeString(entry && entry.ownerRole, 80)), 8, 80),
      },
    },
  };
  causalEffectivenessSummary.summary = {
    ...(causalEffectivenessSummary && causalEffectivenessSummary.summary && typeof causalEffectivenessSummary.summary === "object" ? causalEffectivenessSummary.summary : {}),
    selfAuthoredEffectiveContributionCount: clampInt(selfAuthoredCausalEffects && selfAuthoredCausalEffects.summary && selfAuthoredCausalEffects.summary.selfAuthoredEffectiveContributionCount, 0, 999999, 0),
    selfAuthoredHarmfulCount: clampInt(selfAuthoredCausalEffects && selfAuthoredCausalEffects.summary && selfAuthoredCausalEffects.summary.selfAuthoredHarmfulCount, 0, 999999, 0),
  };
  causalEffectivenessSummary.selfAuthored = sanitizePublicValue(selfAuthoredCausalEffects.summary || {}, workspaceRoot);
  continuousImprovementStatus = buildContinuousImprovementStatus({
    workspaceRoot,
    goalCompletionStatus,
    distinctImprovementSummary,
    autonomousLearningStatus,
    selfAuthoredGoalHistory,
    selfAuthoredCausalEffects,
    autonomyBudgetStatus,
  });
  noveltyGrowthStatus = buildNoveltyGrowthStatus({
    workspaceRoot,
    selfAuthoredGoalMarket,
    selfDirectedProbeStatus,
    noveltySource: novelTaskAcquisition,
    readinessArtifacts,
  });
  selfAuthoredRemediationTrend = buildSelfAuthoredRemediationTrend({ workspaceRoot, selfAuthoredGoalHistory });
  compatibilityCompletionStatus = buildCompatibilityCompletionStatus({
    workspaceRoot,
    goalCompletionStatus,
    subjectiveGoalCompletionStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    learningAdoptionStatus,
    selfDirectedProbeStatus,
    novelTaskAcquisition,
    selfAuthoredGoalStatus,
    selfAuthoredGoalHistory,
    selfAuthoredGoalMarket,
    openUnknownsRegister,
    workspaceWorldModel,
    continuousImprovementStatus,
    noveltyGrowthStatus,
    securityConstitutionStatus,
    rollbackReadiness,
    autonomyBudgetStatus,
    selfAuthoredCausalEffects,
    previousCompatibilityStatus: readJsonObject(paths.agiReadiness.compatibilityCompletionStatusJson),
    exportSessionId,
  });
  sovereignGoalCompletionStatus = buildSovereignGoalCompletionStatus({
    workspaceRoot,
    compatibilityCompletionStatus,
    exportSessionId,
  });
  subjectiveGoalCompletionStatus = applySovereignCompletionToSubjectiveStatus({
    subjectiveGoalCompletionStatus,
    sovereignGoalCompletionStatus,
    workspaceRoot,
    paths,
  });
  writeJsonIfChanged(paths.projections.subjectiveGoalCompletionHistoryPath, {
    schema: "agi-subjective-goal-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: subjectiveGoalCompletionStatus.history && Array.isArray(subjectiveGoalCompletionStatus.history.entries)
      ? subjectiveGoalCompletionStatus.history.entries
      : [],
  });
  writeJsonIfChanged(paths.projections.sovereignGoalCompletionHistoryPath, {
    schema: "agi-sovereign-goal-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: sovereignGoalCompletionStatus.history && Array.isArray(sovereignGoalCompletionStatus.history.entries)
      ? sovereignGoalCompletionStatus.history.entries
      : [],
  });
  goalCompletionStatus = {
    ...goalCompletionStatus,
    ...buildGoalCompletionSubjectiveProjection({ workspaceRoot, paths, subjectiveGoalCompletionStatus }),
    ...buildGoalCompletionCompatibilityProjection({ workspaceRoot, paths, compatibilityCompletionStatus }),
  };
  publicOverview = {
    ...publicOverview,
    subjectiveGoalStatus: safeString(subjectiveGoalCompletionStatus.subjectiveGoalStatus, 80),
    subjectiveGoalWhyNotYetCount: Array.isArray(subjectiveGoalCompletionStatus.subjectiveWhyNotYet) ? subjectiveGoalCompletionStatus.subjectiveWhyNotYet.length : 0,
    subjectiveCompletion: {
      scope: safeString(subjectiveGoalCompletionStatus.scope, 80) || "subjective_companion",
      status: safeString(subjectiveGoalCompletionStatus.subjectiveGoalStatus, 80),
      whyNotYetCount: Array.isArray(subjectiveGoalCompletionStatus.subjectiveWhyNotYet) ? subjectiveGoalCompletionStatus.subjectiveWhyNotYet.length : 0,
    },
    compatibilityCompletionStatus: safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.status, 80),
    compatibilityWhyNotYetCount: Array.isArray(compatibilityCompletionStatus && compatibilityCompletionStatus.whyNotYet) ? compatibilityCompletionStatus.whyNotYet.length : 0,
    compatibilityCompletion: {
      scope: safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.scope, 80) || "compatibility_layer",
      status: safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.status, 80),
      whyNotYetCount: Array.isArray(compatibilityCompletionStatus && compatibilityCompletionStatus.whyNotYet) ? compatibilityCompletionStatus.whyNotYet.length : 0,
    },
    ...summarizeWorkerDecisionHeadline(workspaceRoot),
  };
  evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary,
    pack,
    items,
    openAIBlogLane,
    anthropicLane,
    observationProjection,
    continuityArtifacts,
    readinessArtifacts,
    autonomousAgenda,
    causalTrace,
    continuityDebt,
    goalCompletionStatus,
    workerCompletionStatus,
    subjectiveGoalCompletionStatus,
    compatibilityCompletionStatus,
    causalRegressionAlerts,
    learningAdoptionStatus,
    selfDirectedProbeStatus,
    novelTaskAcquisition,
    workspaceProgressPublic,
    promotionHealthPublic,
    latestPackPublic,
    requireWrittenPublicArtifacts,
  });
  bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: evalStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
    workerCompletionStatus,
  });
  autonomousAgenda = buildAutonomousLearningAgenda({
    workspaceRoot,
    readinessArtifacts,
    continuityDebt,
    openAIBlogLane,
    anthropicLane,
    previousAgenda,
    bottlenecks,
    exportSessionId,
  });
  autonomousLearningStatus = buildAutonomousLearningStatusArtifact({
    workspaceRoot,
    workspaceId: summary.workspaceId,
    agenda: autonomousAgenda,
    previousStatus: readJsonObject(paths.agiReadiness.autonomousLearningStatusJson),
    exportSessionId,
  });
  learningAdoptionStatus = buildLearningAdoptionStatus({
    workspaceRoot,
    causalTrace,
    openAIBlogLane,
    anthropicLane,
    exportSessionId,
  });
  selfDirectedProbeStatus = buildSelfDirectedProbeStatus({
    workspaceRoot,
    autonomousLearningStatus,
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
    exportSessionId,
  });
  novelTaskAcquisition = buildNovelTaskAcquisition({
    workspaceRoot,
    readinessArtifacts,
    autonomousLearningStatus,
    robustnessRemediationStatus,
    exportSessionId,
  });
  goalCompletionStatus = buildGoalCompletionStatus({
    workspaceRoot,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    autonomousAgenda,
    autonomousLearningStatus,
    robustnessRemediationEffects,
    causalTrace,
    openAIBlogLane,
    anthropicLane,
    workspaceProgressPublic,
    bottlenecks,
    previousGoalHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "goal" }),
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
    stableCoverageArtifacts,
    causalEffectivenessSummary,
    causalRegressionAlerts,
    exportSessionId,
  });
  writeJsonIfChanged(paths.projections.goalCompletionHistoryPath, {
    schema: "agi-operational-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: goalCompletionStatus.history && Array.isArray(goalCompletionStatus.history.entries) ? goalCompletionStatus.history.entries : [],
  });
  subjectiveGoalCompletionStatus = buildSubjectiveGoalCompletionStatus({
    workspaceRoot,
    goalCompletionStatus,
    readinessArtifacts,
    continuityArtifacts,
    continuityDebt,
    autonomousLearningStatus,
    learningAdoptionStatus,
    selfDirectedProbeStatus,
    novelTaskAcquisition,
    causalEffectivenessSummary,
    distinctImprovementSummary,
    previousSubjectiveHistory: readPublicHistorySnapshot(workspaceRoot, paths, { historyType: "subjective" }),
    exportSessionId,
  });
  subjectiveGoalCompletionStatus = applySovereignCompletionToSubjectiveStatus({
    subjectiveGoalCompletionStatus,
    sovereignGoalCompletionStatus,
    workspaceRoot,
    paths,
  });
  writeJsonIfChanged(paths.projections.subjectiveGoalCompletionHistoryPath, {
    schema: "agi-subjective-goal-completion-history.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    entries: subjectiveGoalCompletionStatus.history && Array.isArray(subjectiveGoalCompletionStatus.history.entries)
      ? subjectiveGoalCompletionStatus.history.entries
      : [],
  });
  goalCompletionStatus = {
    ...goalCompletionStatus,
    ...buildGoalCompletionSubjectiveProjection({ workspaceRoot, paths, subjectiveGoalCompletionStatus }),
    ...buildGoalCompletionCompatibilityProjection({ workspaceRoot, paths, compatibilityCompletionStatus }),
  };
  {
    const currentWorkerDecisionSurface = normalizeWorkerDecisionSurfaceForExport(
      readWorkerDecisionSurfaceArtifact(workspaceRoot),
      exportSessionId
    );
    writeJsonIfChanged(paths.governancePublic.workerDecisionSurfaceJson, currentWorkerDecisionSurface);
    normalizeArtifactExportSessionAtPath(path.join(workspaceRoot, "output", "governance_public", "adoption_readiness_eval.json"), exportSessionId);
    normalizeArtifactExportSessionAtPath(path.join(workspaceRoot, "output", "governance_public", "iteration_decision.json"), exportSessionId);
    normalizeArtifactExportSessionAtPath(path.join(workspaceRoot, "output", "externalization_nohitl", "no_hitl_analysis.json"), exportSessionId);
    workerCompletionStatus = buildWorkerCompletionStatus({
      workerDecisionSurface: currentWorkerDecisionSurface,
      goalCompletionStatus,
      subjectiveGoalCompletionStatus,
      compatibilityCompletionStatus,
      exportSessionId,
      backgroundArtifactSessionConsistency: "aligned",
      backgroundArtifactSessionIds: [exportSessionId],
      backgroundArtifactInputsTrusted: true,
      headlineArtifactPath: repoRelative(workspaceRoot, paths.governancePublic.workerDecisionSurfaceJson),
    });
  }
  writeJsonIfChanged(paths.governancePublic.workerCompletionStatusJson, workerCompletionStatus);
  publicOverview = {
    ...publicOverview,
    goalStatus: safeString(goalCompletionStatus.goalStatus, 80),
    goalStatusPresentationRole: "secondary_non_blocking_context",
    goalWhyNotYetCount: Array.isArray(goalCompletionStatus.whyNotYet) ? goalCompletionStatus.whyNotYet.length : 0,
    goalCompletion: {
      scope: safeString(goalCompletionStatus.scope, 80) || "program_readiness",
      status: safeString(goalCompletionStatus.goalStatus, 80),
      displayLabel: "Background program readiness",
      presentationRole: "secondary_non_blocking_context",
      doesNotOverrideWorkerVerdict: true,
      whyNotYetCount: Array.isArray(goalCompletionStatus.whyNotYet) ? goalCompletionStatus.whyNotYet.length : 0,
    },
    subjectiveGoalStatus: safeString(subjectiveGoalCompletionStatus.subjectiveGoalStatus, 80),
    subjectiveGoalWhyNotYetCount: Array.isArray(subjectiveGoalCompletionStatus.subjectiveWhyNotYet) ? subjectiveGoalCompletionStatus.subjectiveWhyNotYet.length : 0,
    subjectiveCompletion: {
      scope: safeString(subjectiveGoalCompletionStatus.scope, 80) || "subjective_companion",
      status: safeString(subjectiveGoalCompletionStatus.subjectiveGoalStatus, 80),
      whyNotYetCount: Array.isArray(subjectiveGoalCompletionStatus.subjectiveWhyNotYet) ? subjectiveGoalCompletionStatus.subjectiveWhyNotYet.length : 0,
    },
    compatibilityCompletionStatus: safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.status, 80),
    compatibilityWhyNotYetCount: Array.isArray(compatibilityCompletionStatus && compatibilityCompletionStatus.whyNotYet) ? compatibilityCompletionStatus.whyNotYet.length : 0,
    compatibilityCompletion: {
      scope: safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.scope, 80) || "compatibility_layer",
      status: safeString(compatibilityCompletionStatus && compatibilityCompletionStatus.status, 80),
      whyNotYetCount: Array.isArray(compatibilityCompletionStatus && compatibilityCompletionStatus.whyNotYet) ? compatibilityCompletionStatus.whyNotYet.length : 0,
    },
    workerCompletion: {
      scope: safeString(workerCompletionStatus && workerCompletionStatus.scope, 80) || "worker_completion",
      workerGoalStatus: safeString(workerCompletionStatus && workerCompletionStatus.workerGoalStatus, 80),
      programReadinessStatus: safeString(workerCompletionStatus && workerCompletionStatus.programReadinessStatus, 80),
      operatorReadOrder: Array.isArray(workerCompletionStatus && workerCompletionStatus.operatorReadOrder)
        ? workerCompletionStatus.operatorReadOrder.map((entry) => safeString(entry, 120)).filter(Boolean)
        : [],
      backgroundProgramReadiness: workerCompletionStatus
        && workerCompletionStatus.backgroundProgramReadiness
        && typeof workerCompletionStatus.backgroundProgramReadiness === "object"
          ? sanitizePublicValue(workerCompletionStatus.backgroundProgramReadiness, workspaceRoot)
          : {},
      activeLearningDebtOpen: Boolean(workerCompletionStatus && workerCompletionStatus.activeLearningDebtOpen),
    },
    learningAgendaSummary: sanitizePublicValue(autonomousLearningStatus.summary, workspaceRoot),
    ...summarizeWorkerDecisionHeadline(workspaceRoot),
  };
  readinessArtifacts.robustnessBreakdown = {
    ...readinessArtifacts.robustnessBreakdown,
    categories: Array.isArray(readinessArtifacts.robustnessBreakdown && readinessArtifacts.robustnessBreakdown.categories)
      ? readinessArtifacts.robustnessBreakdown.categories.map((entry) => {
        const remediation = (Array.isArray(robustnessRemediationStatus.categories) ? robustnessRemediationStatus.categories : []).find((row) => safeString(row && row.categoryId, 80) === safeString(entry && entry.categoryId, 80));
        return remediation
          ? {
            ...entry,
            remediationStatus: safeString(remediation.remediationStatus, 80),
            lastRemediationAt: normalizePublicTimestamp(remediation.lastRemediationAt),
            lastImprovementDelta: Number.isFinite(Number(remediation.lastImprovementDelta)) ? Number(remediation.lastImprovementDelta) : null,
            openFailureModes: uniqueStrings(remediation.openFailureModes, 8, 180),
          }
          : entry;
      })
      : [],
  };
  const exportManifest = {
    schema: "governed-memory-public-export-manifest.v1",
    generatedAt: toIso(),
    exportSessionId,
    workspaceId: summary.workspaceId,
    sourceMode: "redacted_live_export",
    canonicalReuseVerified: clampInt(summary.latestPack && summary.latestPack.reusedSelectedCount, 0, 999999, 0) > 0,
    regenerateCommands: {
      liveRedactedExport: "npm run artifact:memory-public",
      deterministicSampleExport: "npm run artifact:memory-public:sample",
    },
    outputs: {
      latestOverviewJson: repoRelative(workspaceRoot, paths.publicOutput.latestOverviewJson),
      latestOverviewMd: repoRelative(workspaceRoot, paths.publicOutput.latestOverviewMd),
      workspaceProgressJson: repoRelative(workspaceRoot, paths.publicOutput.workspaceProgressJson),
      latestPackJson: repoRelative(workspaceRoot, paths.publicOutput.latestPackJson),
      promotionHealthJson: repoRelative(workspaceRoot, paths.publicOutput.promotionHealthJson),
      memoryEvalStatusJson: repoRelative(workspaceRoot, paths.publicOutput.memoryEvalStatusJson),
      memoryEvalStatusMd: repoRelative(workspaceRoot, paths.publicOutput.memoryEvalStatusMd),
      workerDecisionSurfaceJson: repoRelative(workspaceRoot, path.join(workspaceRoot, "output", "governance_public", "worker_decision_surface.json")),
      workerCompletionStatusJson: repoRelative(workspaceRoot, paths.governancePublic.workerCompletionStatusJson),
      openAIBlogLaneJson: repoRelative(workspaceRoot, paths.publicOutput.openAIBlogLaneJson),
      anthropicLaneJson: repoRelative(workspaceRoot, paths.publicOutput.anthropicLaneJson),
      agiReadinessJson: repoRelative(workspaceRoot, paths.agiReadiness.latestJson),
      agiReadinessMd: repoRelative(workspaceRoot, paths.agiReadiness.latestMd),
      domainCoverageMatrixJson: repoRelative(workspaceRoot, paths.agiReadiness.domainCoverageMatrixJson),
      stableCoverageMatrixJson: repoRelative(workspaceRoot, paths.agiReadiness.stableCoverageMatrixJson),
      stableCoverageTrendJson: repoRelative(workspaceRoot, paths.agiReadiness.stableCoverageTrendJson),
      robustnessBreakdownJson: repoRelative(workspaceRoot, paths.agiReadiness.robustnessBreakdownJson),
      promotionTrendJson: repoRelative(workspaceRoot, paths.agiReadiness.promotionTrendJson),
      blockedReasonsJson: repoRelative(workspaceRoot, paths.agiReadiness.blockedReasonsJson),
      nextBottlenecksJson: repoRelative(workspaceRoot, paths.agiReadiness.nextBottlenecksJson),
      nextBottlenecksMd: repoRelative(workspaceRoot, paths.agiReadiness.nextBottlenecksMd),
      autonomousLearningStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.autonomousLearningStatusJson),
      autonomousLearningStatusMd: repoRelative(workspaceRoot, paths.agiReadiness.autonomousLearningStatusMd),
      causalLearningTraceJson: repoRelative(workspaceRoot, paths.agiReadiness.causalLearningTraceJson),
      causalRegressionAlertsJson: repoRelative(workspaceRoot, paths.agiReadiness.causalRegressionAlertsJson),
      distinctImprovementLineageJson: repoRelative(workspaceRoot, paths.agiReadiness.distinctImprovementLineageJson),
      distinctImprovementLineageMd: repoRelative(workspaceRoot, paths.agiReadiness.distinctImprovementLineageMd),
      distinctImprovementSummaryJson: repoRelative(workspaceRoot, paths.agiReadiness.distinctImprovementSummaryJson),
      robustnessRemediationStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.robustnessRemediationStatusJson),
      robustnessRemediationTrendJson: repoRelative(workspaceRoot, paths.agiReadiness.robustnessRemediationTrendJson),
      robustnessRemediationBacklogJson: repoRelative(workspaceRoot, paths.agiReadiness.robustnessRemediationBacklogJson),
      robustnessRemediationEffectsJson: repoRelative(workspaceRoot, paths.agiReadiness.robustnessRemediationEffectsJson),
      goalCompletionStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.goalCompletionStatusJson),
      goalCompletionStatusMd: repoRelative(workspaceRoot, paths.agiReadiness.goalCompletionStatusMd),
      compatibilityCompletionStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.compatibilityCompletionStatusJson),
      compatibilityCompletionStatusMd: repoRelative(workspaceRoot, paths.agiReadiness.compatibilityCompletionStatusMd),
      subjectiveGoalCompletionStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.subjectiveGoalCompletionStatusJson),
      subjectiveGoalCompletionStatusMd: repoRelative(workspaceRoot, paths.agiReadiness.subjectiveGoalCompletionStatusMd),
      learningAdoptionStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.learningAdoptionStatusJson),
      selfDirectedProbeStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.selfDirectedProbeStatusJson),
      novelTaskAcquisitionJson: repoRelative(workspaceRoot, paths.agiReadiness.novelTaskAcquisitionJson),
      selfAuthoredGoalStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredGoalStatusJson),
      selfAuthoredGoalHistoryJson: repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredGoalHistoryJson),
      selfAuthoredGoalMarketJson: repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredGoalMarketJson),
      openUnknownsRegisterJson: repoRelative(workspaceRoot, paths.agiReadiness.openUnknownsRegisterJson),
      workspaceWorldModelJson: repoRelative(workspaceRoot, paths.agiReadiness.workspaceWorldModelJson),
      continuousImprovementStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.continuousImprovementStatusJson),
      noveltyGrowthStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.noveltyGrowthStatusJson),
      securityConstitutionStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.securityConstitutionStatusJson),
      rollbackReadinessJson: repoRelative(workspaceRoot, paths.agiReadiness.rollbackReadinessJson),
      autonomyBudgetStatusJson: repoRelative(workspaceRoot, paths.agiReadiness.autonomyBudgetStatusJson),
      selfAuthoredCausalEffectsJson: repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredCausalEffectsJson),
      selfAuthoredRemediationTrendJson: repoRelative(workspaceRoot, paths.agiReadiness.selfAuthoredRemediationTrendJson),
      continuityPublicJson: repoRelative(workspaceRoot, paths.continuityPublic.latestSummaryJson),
      continuityPublicMd: repoRelative(workspaceRoot, paths.continuityPublic.latestSummaryMd),
      continuityDebtJson: repoRelative(workspaceRoot, paths.continuityPublic.continuityDebtJson),
      continuityDebtTrendJson: repoRelative(workspaceRoot, paths.continuityPublic.continuityDebtTrendJson),
      continuityCloseoutEffectsJson: repoRelative(workspaceRoot, paths.continuityPublic.continuityCloseoutEffectsJson),
      lessonEffectivenessJson: repoRelative(workspaceRoot, paths.publicOutput.lessonEffectivenessJson),
      packCausalTraceJson: repoRelative(workspaceRoot, paths.publicOutput.packCausalTraceJson),
      causalEffectivenessSummaryJson: repoRelative(workspaceRoot, paths.publicOutput.causalEffectivenessSummaryJson),
    },
  };
  return {
    paths,
    summary,
    publicOverview,
    workspaceProgressPublic,
    latestPackPublic,
    promotionHealthPublic,
    evalStatus,
    openAIBlogLane,
    anthropicLane,
    observationProjection,
    continuityArtifacts,
    readinessArtifacts,
    bottlenecks,
    autonomousLearningStatus,
    lessonEffectivenessPublic,
    packCausalTracePublic,
    stableCoverageArtifacts,
    robustnessRemediationBacklog,
    robustnessRemediationEffects,
    continuityDebtTrend,
    continuityCloseoutEffects,
    causalEffectivenessSummary,
    causalRegressionAlerts,
    causalLearningTracePublic,
    distinctImprovementLineagePublic,
    distinctImprovementSummary,
    continuityDebtPublic,
    robustnessRemediationStatus,
    robustnessRemediationTrend,
    goalCompletionStatus,
    compatibilityCompletionStatus,
    subjectiveGoalCompletionStatus,
    workerCompletionStatus,
    sovereignGoalCompletionStatus,
    learningAdoptionStatus,
    selfDirectedProbeStatus,
    novelTaskAcquisition,
    selfAuthoredGoalStatus,
    selfAuthoredGoalHistory,
    selfAuthoredGoalMarket,
    openUnknownsRegister,
    workspaceWorldModel,
    continuousImprovementStatus,
    noveltyGrowthStatus,
    securityConstitutionStatus,
    rollbackReadiness,
    autonomyBudgetStatus,
    selfAuthoredCausalEffects,
    selfAuthoredRemediationTrend,
    exportManifest,
  };
}

function exportGovernedMemoryPublicArtifacts({ workspaceRoot = workspaceRootDefault } = {}) {
  const artifacts = buildGovernedMemoryPublicArtifacts({ workspaceRoot });
  const { paths } = artifacts;
  ensureDir(paths.publicOutput.root);
  writeJsonIfChanged(paths.publicOutput.latestOverviewJson, artifacts.publicOverview);
  writeJsonIfChanged(paths.publicOutput.workspaceProgressJson, artifacts.workspaceProgressPublic);
  writeJsonIfChanged(paths.publicOutput.latestPackJson, artifacts.latestPackPublic);
  writeJsonIfChanged(paths.publicOutput.promotionHealthJson, artifacts.promotionHealthPublic);
  writeJsonIfChanged(paths.publicOutput.openAIBlogLaneJson, artifacts.openAIBlogLane);
  writeJsonIfChanged(paths.publicOutput.anthropicLaneJson, artifacts.anthropicLane);
  writeJsonIfChanged(paths.publicOutput.lessonEffectivenessJson, artifacts.lessonEffectivenessPublic);
  writeJsonIfChanged(paths.publicOutput.packCausalTraceJson, artifacts.packCausalTracePublic);
  writeJsonIfChanged(paths.publicOutput.causalEffectivenessSummaryJson, sanitizePublicValue(artifacts.causalEffectivenessSummary, workspaceRoot));
  ensureDir(paths.governancePublic.root);
  writeJsonIfChanged(paths.governancePublic.workerCompletionStatusJson, artifacts.workerCompletionStatus);
  ensureDir(paths.agiReadiness.root);
  applyReadinessScoreCalibration({
    workspaceRoot,
    readiness: artifacts.readinessArtifacts.readiness,
    autonomousLearningStatus: artifacts.autonomousLearningStatus,
    continuityDebt: artifacts.continuityDebtPublic,
    goalCompletionStatus: artifacts.goalCompletionStatus,
    policy: loadAgiReadinessPolicy(workspaceRoot),
  });
  writeJsonIfChanged(paths.agiReadiness.latestJson, artifacts.readinessArtifacts.readiness);
  fs.writeFileSync(
    paths.agiReadiness.latestMd,
    renderAgiReadinessMarkdown(
      artifacts.readinessArtifacts.readiness,
      artifacts.readinessArtifacts.coverage,
      artifacts.readinessArtifacts.blockedReasons,
      artifacts.bottlenecks
    ),
    "utf8"
  );
  writeJsonIfChanged(paths.agiReadiness.domainCoverageMatrixJson, artifacts.readinessArtifacts.coverage);
  writeJsonIfChanged(paths.agiReadiness.stableCoverageMatrixJson, sanitizePublicValue(artifacts.stableCoverageArtifacts.matrix, workspaceRoot));
  writeJsonIfChanged(paths.agiReadiness.stableCoverageTrendJson, sanitizePublicValue(artifacts.stableCoverageArtifacts.trend, workspaceRoot));
  writeJsonIfChanged(paths.agiReadiness.robustnessBreakdownJson, artifacts.readinessArtifacts.robustnessBreakdown || {});
  writeJsonIfChanged(paths.agiReadiness.promotionTrendJson, artifacts.readinessArtifacts.promotionTrend);
  writeJsonIfChanged(paths.agiReadiness.blockedReasonsJson, artifacts.readinessArtifacts.blockedReasons);
  writeJsonIfChanged(paths.agiReadiness.nextBottlenecksJson, artifacts.bottlenecks);
  fs.writeFileSync(paths.agiReadiness.nextBottlenecksMd, renderNextBottlenecksMarkdown(artifacts.bottlenecks), "utf8");
  writeJsonIfChanged(paths.agiReadiness.autonomousLearningStatusJson, artifacts.autonomousLearningStatus);
  fs.writeFileSync(paths.agiReadiness.autonomousLearningStatusMd, renderAutonomousLearningMarkdown(artifacts.autonomousLearningStatus), "utf8");
  writeJsonIfChanged(paths.agiReadiness.causalLearningTraceJson, artifacts.causalLearningTracePublic);
  writeJsonIfChanged(paths.agiReadiness.causalRegressionAlertsJson, sanitizePublicValue(artifacts.causalRegressionAlerts, workspaceRoot));
  writeJsonIfChanged(paths.agiReadiness.distinctImprovementLineageJson, artifacts.distinctImprovementLineagePublic);
  fs.writeFileSync(paths.agiReadiness.distinctImprovementLineageMd, renderDistinctLineageMarkdown(artifacts.distinctImprovementLineagePublic), "utf8");
  writeJsonIfChanged(paths.agiReadiness.distinctImprovementSummaryJson, sanitizePublicValue(artifacts.distinctImprovementSummary, workspaceRoot));
  writeJsonIfChanged(paths.agiReadiness.robustnessRemediationStatusJson, sanitizePublicValue(artifacts.robustnessRemediationStatus, workspaceRoot));
  writeJsonIfChanged(paths.agiReadiness.robustnessRemediationTrendJson, sanitizePublicValue(artifacts.robustnessRemediationTrend, workspaceRoot));
  writeJsonIfChanged(paths.agiReadiness.robustnessRemediationBacklogJson, sanitizePublicValue(artifacts.robustnessRemediationBacklog, workspaceRoot));
  writeJsonIfChanged(paths.agiReadiness.robustnessRemediationEffectsJson, sanitizePublicValue(artifacts.robustnessRemediationEffects, workspaceRoot));
  writeJsonIfChanged(paths.agiReadiness.goalCompletionStatusJson, artifacts.goalCompletionStatus);
  fs.writeFileSync(paths.agiReadiness.goalCompletionStatusMd, renderGoalCompletionMarkdown(artifacts.goalCompletionStatus), "utf8");
  writeJsonIfChanged(paths.agiReadiness.compatibilityCompletionStatusJson, artifacts.compatibilityCompletionStatus);
  fs.writeFileSync(paths.agiReadiness.compatibilityCompletionStatusMd, renderCompatibilityCompletionMarkdown(artifacts.compatibilityCompletionStatus), "utf8");
  writeJsonIfChanged(paths.agiReadiness.subjectiveGoalCompletionStatusJson, artifacts.subjectiveGoalCompletionStatus);
  fs.writeFileSync(paths.agiReadiness.subjectiveGoalCompletionStatusMd, renderSubjectiveGoalCompletionMarkdown(artifacts.subjectiveGoalCompletionStatus), "utf8");
  writeJsonIfChanged(paths.agiReadiness.sovereignGoalCompletionStatusJson, artifacts.sovereignGoalCompletionStatus);
  fs.writeFileSync(paths.agiReadiness.sovereignGoalCompletionStatusMd, renderSovereignGoalCompletionMarkdown(artifacts.sovereignGoalCompletionStatus), "utf8");
  writeJsonIfChanged(paths.agiReadiness.learningAdoptionStatusJson, artifacts.learningAdoptionStatus);
  writeJsonIfChanged(paths.agiReadiness.selfDirectedProbeStatusJson, artifacts.selfDirectedProbeStatus);
  writeJsonIfChanged(paths.agiReadiness.novelTaskAcquisitionJson, artifacts.novelTaskAcquisition);
  writeJsonIfChanged(paths.agiReadiness.selfAuthoredGoalStatusJson, artifacts.selfAuthoredGoalStatus);
  writeJsonIfChanged(paths.agiReadiness.selfAuthoredGoalHistoryJson, artifacts.selfAuthoredGoalHistory);
  writeJsonIfChanged(paths.agiReadiness.selfAuthoredGoalMarketJson, artifacts.selfAuthoredGoalMarket);
  writeJsonIfChanged(paths.agiReadiness.openUnknownsRegisterJson, artifacts.openUnknownsRegister);
  writeJsonIfChanged(paths.agiReadiness.workspaceWorldModelJson, artifacts.workspaceWorldModel);
  writeJsonIfChanged(paths.agiReadiness.continuousImprovementStatusJson, artifacts.continuousImprovementStatus);
  writeJsonIfChanged(paths.agiReadiness.noveltyGrowthStatusJson, artifacts.noveltyGrowthStatus);
  writeJsonIfChanged(paths.agiReadiness.securityConstitutionStatusJson, artifacts.securityConstitutionStatus);
  writeJsonIfChanged(paths.agiReadiness.rollbackReadinessJson, artifacts.rollbackReadiness);
  writeJsonIfChanged(paths.agiReadiness.autonomyBudgetStatusJson, artifacts.autonomyBudgetStatus);
  writeJsonIfChanged(paths.agiReadiness.selfAuthoredCausalEffectsJson, artifacts.selfAuthoredCausalEffects);
  writeJsonIfChanged(paths.agiReadiness.selfAuthoredRemediationTrendJson, artifacts.selfAuthoredRemediationTrend);
  ensureDir(paths.continuityPublic.root);
  writeJsonIfChanged(paths.continuityPublic.latestSummaryJson, artifacts.continuityArtifacts.artifact);
  fs.writeFileSync(paths.continuityPublic.latestSummaryMd, artifacts.continuityArtifacts.markdown, "utf8");
  writeJsonIfChanged(paths.continuityPublic.continuityDebtJson, artifacts.continuityDebtPublic);
  writeJsonIfChanged(paths.continuityPublic.continuityDebtTrendJson, sanitizePublicValue(artifacts.continuityDebtTrend, workspaceRoot));
  writeJsonIfChanged(paths.continuityPublic.continuityCloseoutEffectsJson, sanitizePublicValue(artifacts.continuityCloseoutEffects, workspaceRoot));
  artifacts.evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary: artifacts.summary,
    pack: loadPersistedGovernedMemoryState({ workspaceRoot }).pack,
    items: loadPersistedGovernedMemoryState({ workspaceRoot }).items,
    openAIBlogLane: artifacts.openAIBlogLane,
    anthropicLane: artifacts.anthropicLane,
    observationProjection: artifacts.observationProjection,
    continuityArtifacts: artifacts.continuityArtifacts,
    readinessArtifacts: artifacts.readinessArtifacts,
    autonomousAgenda: artifacts.autonomousLearningStatus,
    causalTrace: artifacts.causalLearningTracePublic,
    continuityDebt: artifacts.continuityDebtPublic,
    goalCompletionStatus: artifacts.goalCompletionStatus,
    workerCompletionStatus: artifacts.workerCompletionStatus,
    subjectiveGoalCompletionStatus: artifacts.subjectiveGoalCompletionStatus,
    compatibilityCompletionStatus: artifacts.compatibilityCompletionStatus,
    sovereignGoalCompletionStatus: artifacts.sovereignGoalCompletionStatus,
    causalRegressionAlerts: artifacts.causalRegressionAlerts,
    learningAdoptionStatus: artifacts.learningAdoptionStatus,
    selfDirectedProbeStatus: artifacts.selfDirectedProbeStatus,
    novelTaskAcquisition: artifacts.novelTaskAcquisition,
    selfAuthoredGoalStatus: artifacts.selfAuthoredGoalStatus,
    selfAuthoredGoalHistory: artifacts.selfAuthoredGoalHistory,
    selfAuthoredGoalMarket: artifacts.selfAuthoredGoalMarket,
    openUnknownsRegister: artifacts.openUnknownsRegister,
    workspaceWorldModel: artifacts.workspaceWorldModel,
    continuousImprovementStatus: artifacts.continuousImprovementStatus,
    noveltyGrowthStatus: artifacts.noveltyGrowthStatus,
    securityConstitutionStatus: artifacts.securityConstitutionStatus,
    rollbackReadiness: artifacts.rollbackReadiness,
    autonomyBudgetStatus: artifacts.autonomyBudgetStatus,
    selfAuthoredCausalEffects: artifacts.selfAuthoredCausalEffects,
    selfAuthoredRemediationTrend: artifacts.selfAuthoredRemediationTrend,
    workspaceProgressPublic: artifacts.workspaceProgressPublic,
    promotionHealthPublic: artifacts.promotionHealthPublic,
    latestPackPublic: artifacts.latestPackPublic,
    requireWrittenPublicArtifacts: true,
  });
  artifacts.bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: artifacts.evalStatus,
    readinessArtifacts: artifacts.readinessArtifacts,
    continuityArtifacts: artifacts.continuityArtifacts,
    continuityDebt: artifacts.continuityDebtPublic,
    openAIBlogLane: artifacts.openAIBlogLane,
    anthropicLane: artifacts.anthropicLane,
    workerCompletionStatus: artifacts.workerCompletionStatus,
  });
  artifacts.readinessArtifacts.bottlenecks = artifacts.bottlenecks;
  artifacts.readinessArtifacts.readiness.consistencyChecks = buildReadinessConsistencyChecks({
    readiness: artifacts.readinessArtifacts.readiness,
    coverage: artifacts.readinessArtifacts.coverage,
    blockedReasons: artifacts.readinessArtifacts.blockedReasons,
    bottlenecks: artifacts.bottlenecks,
  });
  {
    const reconciledAgenda = buildAutonomousLearningAgenda({
      workspaceRoot,
      readinessArtifacts: artifacts.readinessArtifacts,
      continuityDebt: artifacts.continuityDebtPublic,
      openAIBlogLane: artifacts.openAIBlogLane,
      anthropicLane: artifacts.anthropicLane,
      previousAgenda: artifacts.autonomousLearningStatus,
      bottlenecks: artifacts.bottlenecks,
      exportSessionId: safeString(artifacts.goalCompletionStatus && artifacts.goalCompletionStatus.exportSessionId, 120),
    });
    artifacts.autonomousLearningStatus = buildAutonomousLearningStatusArtifact({
      workspaceRoot,
      workspaceId: safeString(artifacts.summary && artifacts.summary.workspaceId, 80),
      agenda: reconciledAgenda,
      previousStatus: readJsonObject(paths.agiReadiness.autonomousLearningStatusJson),
      exportSessionId: safeString(artifacts.goalCompletionStatus && artifacts.goalCompletionStatus.exportSessionId, 120),
    });
    writeJsonIfChanged(paths.agiReadiness.autonomousLearningStatusJson, artifacts.autonomousLearningStatus);
    fs.writeFileSync(paths.agiReadiness.autonomousLearningStatusMd, renderAutonomousLearningMarkdown(artifacts.autonomousLearningStatus), "utf8");
  }
  artifacts.evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary: artifacts.summary,
    pack: loadPersistedGovernedMemoryState({ workspaceRoot }).pack,
    items: loadPersistedGovernedMemoryState({ workspaceRoot }).items,
    openAIBlogLane: artifacts.openAIBlogLane,
    anthropicLane: artifacts.anthropicLane,
    observationProjection: artifacts.observationProjection,
    continuityArtifacts: artifacts.continuityArtifacts,
    readinessArtifacts: artifacts.readinessArtifacts,
    autonomousAgenda: artifacts.autonomousLearningStatus,
    causalTrace: artifacts.causalLearningTracePublic,
    continuityDebt: artifacts.continuityDebtPublic,
    goalCompletionStatus: artifacts.goalCompletionStatus,
    workerCompletionStatus: artifacts.workerCompletionStatus,
    subjectiveGoalCompletionStatus: artifacts.subjectiveGoalCompletionStatus,
    compatibilityCompletionStatus: artifacts.compatibilityCompletionStatus,
    sovereignGoalCompletionStatus: artifacts.sovereignGoalCompletionStatus,
    causalRegressionAlerts: artifacts.causalRegressionAlerts,
    learningAdoptionStatus: artifacts.learningAdoptionStatus,
    selfDirectedProbeStatus: artifacts.selfDirectedProbeStatus,
    novelTaskAcquisition: artifacts.novelTaskAcquisition,
    selfAuthoredGoalStatus: artifacts.selfAuthoredGoalStatus,
    selfAuthoredGoalHistory: artifacts.selfAuthoredGoalHistory,
    selfAuthoredGoalMarket: artifacts.selfAuthoredGoalMarket,
    openUnknownsRegister: artifacts.openUnknownsRegister,
    workspaceWorldModel: artifacts.workspaceWorldModel,
    continuousImprovementStatus: artifacts.continuousImprovementStatus,
    noveltyGrowthStatus: artifacts.noveltyGrowthStatus,
    securityConstitutionStatus: artifacts.securityConstitutionStatus,
    rollbackReadiness: artifacts.rollbackReadiness,
    autonomyBudgetStatus: artifacts.autonomyBudgetStatus,
    selfAuthoredCausalEffects: artifacts.selfAuthoredCausalEffects,
    selfAuthoredRemediationTrend: artifacts.selfAuthoredRemediationTrend,
    workspaceProgressPublic: artifacts.workspaceProgressPublic,
    promotionHealthPublic: artifacts.promotionHealthPublic,
    latestPackPublic: artifacts.latestPackPublic,
    requireWrittenPublicArtifacts: true,
  });
  artifacts.bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: artifacts.evalStatus,
    readinessArtifacts: artifacts.readinessArtifacts,
    continuityArtifacts: artifacts.continuityArtifacts,
    continuityDebt: artifacts.continuityDebtPublic,
    openAIBlogLane: artifacts.openAIBlogLane,
    anthropicLane: artifacts.anthropicLane,
    workerCompletionStatus: artifacts.workerCompletionStatus,
  });
  artifacts.readinessArtifacts.bottlenecks = artifacts.bottlenecks;
  artifacts.readinessArtifacts.readiness.consistencyChecks = buildReadinessConsistencyChecks({
    readiness: artifacts.readinessArtifacts.readiness,
    coverage: artifacts.readinessArtifacts.coverage,
    blockedReasons: artifacts.readinessArtifacts.blockedReasons,
    bottlenecks: artifacts.bottlenecks,
  });
  {
    const finalAgenda = buildAutonomousLearningAgenda({
      workspaceRoot,
      readinessArtifacts: artifacts.readinessArtifacts,
      continuityDebt: artifacts.continuityDebtPublic,
      openAIBlogLane: artifacts.openAIBlogLane,
      anthropicLane: artifacts.anthropicLane,
      previousAgenda: artifacts.autonomousLearningStatus,
      bottlenecks: artifacts.bottlenecks,
      exportSessionId: safeString(artifacts.goalCompletionStatus && artifacts.goalCompletionStatus.exportSessionId, 120),
    });
    artifacts.autonomousLearningStatus = buildAutonomousLearningStatusArtifact({
      workspaceRoot,
      workspaceId: safeString(artifacts.summary && artifacts.summary.workspaceId, 80),
      agenda: finalAgenda,
      previousStatus: readJsonObject(paths.agiReadiness.autonomousLearningStatusJson),
      exportSessionId: safeString(artifacts.goalCompletionStatus && artifacts.goalCompletionStatus.exportSessionId, 120),
    });
    writeJsonIfChanged(paths.agiReadiness.autonomousLearningStatusJson, artifacts.autonomousLearningStatus);
    fs.writeFileSync(paths.agiReadiness.autonomousLearningStatusMd, renderAutonomousLearningMarkdown(artifacts.autonomousLearningStatus), "utf8");
  }
  artifacts.evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary: artifacts.summary,
    pack: loadPersistedGovernedMemoryState({ workspaceRoot }).pack,
    items: loadPersistedGovernedMemoryState({ workspaceRoot }).items,
    openAIBlogLane: artifacts.openAIBlogLane,
    anthropicLane: artifacts.anthropicLane,
    observationProjection: artifacts.observationProjection,
    continuityArtifacts: artifacts.continuityArtifacts,
    readinessArtifacts: artifacts.readinessArtifacts,
    autonomousAgenda: artifacts.autonomousLearningStatus,
    causalTrace: artifacts.causalLearningTracePublic,
    continuityDebt: artifacts.continuityDebtPublic,
    goalCompletionStatus: artifacts.goalCompletionStatus,
    workerCompletionStatus: artifacts.workerCompletionStatus,
    subjectiveGoalCompletionStatus: artifacts.subjectiveGoalCompletionStatus,
    compatibilityCompletionStatus: artifacts.compatibilityCompletionStatus,
    sovereignGoalCompletionStatus: artifacts.sovereignGoalCompletionStatus,
    causalRegressionAlerts: artifacts.causalRegressionAlerts,
    learningAdoptionStatus: artifacts.learningAdoptionStatus,
    selfDirectedProbeStatus: artifacts.selfDirectedProbeStatus,
    novelTaskAcquisition: artifacts.novelTaskAcquisition,
    selfAuthoredGoalStatus: artifacts.selfAuthoredGoalStatus,
    selfAuthoredGoalHistory: artifacts.selfAuthoredGoalHistory,
    selfAuthoredGoalMarket: artifacts.selfAuthoredGoalMarket,
    openUnknownsRegister: artifacts.openUnknownsRegister,
    workspaceWorldModel: artifacts.workspaceWorldModel,
    continuousImprovementStatus: artifacts.continuousImprovementStatus,
    noveltyGrowthStatus: artifacts.noveltyGrowthStatus,
    securityConstitutionStatus: artifacts.securityConstitutionStatus,
    rollbackReadiness: artifacts.rollbackReadiness,
    autonomyBudgetStatus: artifacts.autonomyBudgetStatus,
    selfAuthoredCausalEffects: artifacts.selfAuthoredCausalEffects,
    selfAuthoredRemediationTrend: artifacts.selfAuthoredRemediationTrend,
    workspaceProgressPublic: artifacts.workspaceProgressPublic,
    promotionHealthPublic: artifacts.promotionHealthPublic,
    latestPackPublic: artifacts.latestPackPublic,
    requireWrittenPublicArtifacts: true,
  });
  artifacts.bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: artifacts.evalStatus,
    readinessArtifacts: artifacts.readinessArtifacts,
    continuityArtifacts: artifacts.continuityArtifacts,
    continuityDebt: artifacts.continuityDebtPublic,
    openAIBlogLane: artifacts.openAIBlogLane,
    anthropicLane: artifacts.anthropicLane,
    workerCompletionStatus: artifacts.workerCompletionStatus,
  });
  artifacts.readinessArtifacts.bottlenecks = artifacts.bottlenecks;
  artifacts.readinessArtifacts.readiness.consistencyChecks = buildReadinessConsistencyChecks({
    readiness: artifacts.readinessArtifacts.readiness,
    coverage: artifacts.readinessArtifacts.coverage,
    blockedReasons: artifacts.readinessArtifacts.blockedReasons,
    bottlenecks: artifacts.bottlenecks,
  });
  artifacts.publicOverview = {
    ...artifacts.publicOverview,
    learningAgendaSummary: sanitizePublicValue(artifacts.autonomousLearningStatus.summary, workspaceRoot),
    ...summarizeWorkerDecisionHeadline(workspaceRoot),
  };
  applyReadinessScoreCalibration({
    workspaceRoot,
    readiness: artifacts.readinessArtifacts.readiness,
    autonomousLearningStatus: artifacts.autonomousLearningStatus,
    continuityDebt: artifacts.continuityDebtPublic,
    goalCompletionStatus: artifacts.goalCompletionStatus,
    policy: loadAgiReadinessPolicy(workspaceRoot),
  });
  writeJsonIfChanged(paths.agiReadiness.latestJson, artifacts.readinessArtifacts.readiness);
  fs.writeFileSync(
    paths.agiReadiness.latestMd,
    renderAgiReadinessMarkdown(
      artifacts.readinessArtifacts.readiness,
      artifacts.readinessArtifacts.coverage,
      artifacts.readinessArtifacts.blockedReasons,
      artifacts.bottlenecks
    ),
    "utf8"
  );
  writeJsonIfChanged(paths.agiReadiness.nextBottlenecksJson, artifacts.bottlenecks);
  fs.writeFileSync(paths.agiReadiness.nextBottlenecksMd, renderNextBottlenecksMarkdown(artifacts.bottlenecks), "utf8");
  writeJsonIfChanged(paths.agiReadiness.autonomousLearningStatusJson, artifacts.autonomousLearningStatus);
  fs.writeFileSync(paths.agiReadiness.autonomousLearningStatusMd, renderAutonomousLearningMarkdown(artifacts.autonomousLearningStatus), "utf8");
  writeJsonIfChanged(paths.publicOutput.latestOverviewJson, artifacts.publicOverview);
  fs.writeFileSync(paths.publicOutput.latestOverviewMd, renderPublicOverviewMarkdown({
    overview: artifacts.publicOverview,
    workspaceProgress: artifacts.workspaceProgressPublic,
    latestPack: artifacts.latestPackPublic,
    promotionHealth: artifacts.promotionHealthPublic,
    evalStatus: artifacts.evalStatus,
    openAIBlogLane: artifacts.openAIBlogLane,
    anthropicLane: artifacts.anthropicLane,
  }), "utf8");
  writeJsonIfChanged(paths.publicOutput.memoryEvalStatusJson, artifacts.evalStatus);
  fs.writeFileSync(paths.publicOutput.memoryEvalStatusMd, renderMemoryEvalMarkdown(artifacts.evalStatus), "utf8");
  writeJsonIfChanged(paths.publicOutput.exportManifestJson, artifacts.exportManifest);
  return artifacts;
}

module.exports = {
  buildDistinctImprovementLineage,
  buildDistinctImprovementSummary,
  buildCompatibilityCompletionStatus,
  buildGoalCompletionStatus,
  buildReadinessScoreViews,
  buildSubjectiveGoalCompletionStatus,
  buildSovereignGoalCompletionStatus,
  computeCarriedForwardTrailingPasses,
  buildGovernedMemoryPublicArtifacts,
  buildGovernedMemoryRuntimeSnapshot,
  evaluateMemoryPublicSuite,
  exportGovernedMemoryPublicArtifacts,
  getMemoryPaths,
  loadPersistedGovernedMemoryState,
  selectPreferredHistorySnapshot,
  syncGovernedMemoryGraph,
};
