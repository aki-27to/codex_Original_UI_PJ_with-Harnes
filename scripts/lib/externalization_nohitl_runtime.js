"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ensureDir, readJsonIfExists, repoRelative, writeJsonFile } = require("./logging_surface");
const {
  aggregateHumanBaseline,
  importExternalAuditResults,
  importHumanTrialResults,
  loadClaimClosureGatePolicy,
  loadExternalAuditPolicy,
  loadHumanBaselinePolicy,
  runClaimClosureCompatibility,
  runClaimClosureProgram,
} = require("./claim_closure_runtime");
const { describeKnowledgeBackends, probeKnowledgeBackend } = require("./knowledge_backend");
const { describeSecretProviders, probeSecretProvider } = require("./secret_provider");

const defaultNonInteractiveProfilePath = path.join(__dirname, "..", "config", "non_interactive_execution_profile.json");
const defaultNoHitlBlockedReasonTaxonomyPath = path.join(__dirname, "..", "config", "no_hitl_blocked_reason_taxonomy.json");
const defaultDeploymentEvidencePolicyPath = path.join(__dirname, "..", "config", "deployment_evidence_policy.json");

function safeString(value, max = 4000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJson(filePath, fallback = null) {
  const payload = readJsonIfExists(filePath);
  return payload === null ? fallback : payload;
}

function writeJson(targetPath, payload) {
  ensureDir(path.dirname(targetPath));
  writeJsonFile(targetPath, payload);
}

function appendJsonLine(targetPath, payload) {
  ensureDir(path.dirname(targetPath));
  fs.appendFileSync(targetPath, `${JSON.stringify(payload)}\n`, "utf8");
}

function workspaceRootFrom(input) {
  return input || path.resolve(__dirname, "..", "..");
}

function rel(workspaceRoot, absolutePath) {
  return repoRelative(workspaceRoot, absolutePath);
}

function writeOutput(workspaceRoot, relativePath, payload) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  writeJson(absolutePath, payload);
  return {
    absolutePath,
    relativePath: rel(workspaceRoot, absolutePath),
  };
}

function loadJsonConfig(filePath, fallback = {}) {
  return parseJson(path.resolve(filePath), fallback) || fallback;
}

function slugify(value, fallback = "item", max = 80) {
  const raw = safeString(value, 200).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (raw || fallback).slice(0, max);
}

function computeStats(values = []) {
  const clean = ensureArray(values).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  if (!clean.length) {
    return { sampleCount: 0, mean: 0, variance: 0, stddev: 0, ci95HalfWidth: 0, min: 0, max: 0 };
  }
  const mean = clean.reduce((sum, entry) => sum + entry, 0) / clean.length;
  const variance = clean.length > 1
    ? clean.reduce((sum, entry) => sum + ((entry - mean) ** 2), 0) / (clean.length - 1)
    : 0;
  const stddev = Math.sqrt(variance);
  const ci95HalfWidth = clean.length > 1 ? (1.96 * stddev) / Math.sqrt(clean.length) : 0;
  return {
    sampleCount: clean.length,
    mean: Number(mean.toFixed(4)),
    variance: Number(variance.toFixed(4)),
    stddev: Number(stddev.toFixed(4)),
    ci95HalfWidth: Number(ci95HalfWidth.toFixed(4)),
    min: Number(Math.min(...clean).toFixed(4)),
    max: Number(Math.max(...clean).toFixed(4)),
  };
}

function computeFileHash(filePath, algorithm = "sha256") {
  return crypto.createHash(algorithm).update(fs.readFileSync(filePath)).digest("hex");
}

function stablePayloadHash(payload, algorithm = "sha256") {
  return crypto.createHash(algorithm).update(JSON.stringify(payload)).digest("hex");
}

function uniqueStrings(values, max = 32) {
  const out = [];
  for (const entry of ensureArray(values)) {
    const text = safeString(entry, 320);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function loadNonInteractiveProfile(filePath = defaultNonInteractiveProfilePath) {
  const payload = loadJsonConfig(filePath, {});
  return {
    schema: safeString(payload.schema, 120) || "non-interactive-execution-profile.v1",
    version: safeString(payload.version, 120) || "2026-03-31.r1",
    profileId: safeString(payload.profileId, 80) || "auto_no_hitl",
    requestUserInputPolicy: safeString(payload.requestUserInputPolicy, 80) || "blocked",
    approvalPolicyExpectation: safeString(payload.approvalPolicyExpectation, 80) || "never",
    sandboxExpectation: safeString(payload.sandboxExpectation, 80) || "danger-full-access",
    networkExpectation: safeString(payload.networkExpectation, 80) || "enabled",
    defaultPassStatus: safeString(payload.defaultPassStatus, 40) || "AUTO_PASS",
    defaultFailStatus: safeString(payload.defaultFailStatus, 40) || "AUTO_FAIL",
    blockedStatusMap: payload.blockedStatusMap && typeof payload.blockedStatusMap === "object" ? payload.blockedStatusMap : {},
    failClosedCategories: uniqueStrings(payload.failClosedCategories, 24),
    naturalLanguageNeedsInputSuppression: payload.naturalLanguageNeedsInputSuppression !== false,
    recommendedInvocation: payload.recommendedInvocation && typeof payload.recommendedInvocation === "object" ? payload.recommendedInvocation : {},
  };
}

function loadNoHitlBlockedReasonTaxonomy(filePath = defaultNoHitlBlockedReasonTaxonomyPath) {
  const payload = loadJsonConfig(filePath, {});
  return {
    schema: safeString(payload.schema, 120) || "no-hitl-blocked-reason-taxonomy.v1",
    version: safeString(payload.version, 120) || "2026-03-31.r1",
    statuses: uniqueStrings(payload.statuses, 16),
    categories: ensureArray(payload.categories).map((entry) => ({
      id: safeString(entry && entry.id, 120),
      machineStatus: safeString(entry && entry.machineStatus, 80),
      description: safeString(entry && entry.description, 400),
    })).filter((entry) => entry.id),
  };
}

function loadDeploymentEvidencePolicy(filePath = defaultDeploymentEvidencePolicyPath, { workspaceRoot = workspaceRootFrom() } = {}) {
  const payload = loadJsonConfig(filePath, {});
  return {
    schema: safeString(payload.schema, 120) || "deployment-evidence-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-31.r1",
    workspaceRoot,
    evidenceRoot: path.join(workspaceRoot, safeString(payload.evidenceRoot, 320) || "logs/archive/raw/deployment_evidence"),
    registryPath: path.join(workspaceRoot, safeString(payload.registryPath, 320) || "logs/archive/raw/deployment_evidence/evidence_registry.json"),
    importHistoryPath: path.join(workspaceRoot, safeString(payload.importHistoryPath, 320) || "logs/archive/raw/deployment_evidence/import_history.jsonl"),
    telemetryHistoryPath: path.join(workspaceRoot, safeString(payload.telemetryHistoryPath, 320) || "logs/archive/raw/deployment_evidence/telemetry_history.jsonl"),
    allowedObservationKinds: uniqueStrings(payload.allowedObservationKinds, 16),
    minimumObservedCountForPublicClaim: Math.max(1, Math.trunc(Number(payload.minimumObservedCountForPublicClaim) || 3)),
    minimumBlackboxObservedCountForPublicClaim: Math.max(1, Math.trunc(Number(payload.minimumBlackboxObservedCountForPublicClaim) || 2)),
    requiredMetrics: uniqueStrings(payload.requiredMetrics, 24),
  };
}

function loadRegistry(filePath, schema) {
  const payload = parseJson(filePath, null);
  if (payload && typeof payload === "object") return payload;
  const fresh = { schema, generatedAt: nowIso(), entries: [] };
  writeJson(filePath, fresh);
  return fresh;
}

function writeRegistry(filePath, schema, entries) {
  writeJson(filePath, {
    schema,
    generatedAt: nowIso(),
    entries: ensureArray(entries),
  });
}

function humanRegistryPath(policy) {
  return path.join(policy.trialRoot, "human_evidence_registry.json");
}

function loadHumanEvidenceRegistry(policy) {
  ensureDir(policy.trialRoot);
  return loadRegistry(humanRegistryPath(policy), "human-evidence-registry.v1");
}

function writeHumanEvidenceRegistry(policy, entries) {
  writeRegistry(humanRegistryPath(policy), "human-evidence-registry.v1", entries);
}

function externalEvidenceRegistryPath(policy) {
  return path.join(policy.auditRoot, "external_evidence_registry.json");
}

function loadExternalEvidenceRegistry(policy) {
  ensureDir(policy.auditRoot);
  return loadRegistry(externalEvidenceRegistryPath(policy), "external-evidence-registry.v1");
}

function writeExternalEvidenceRegistry(policy, entries) {
  writeRegistry(externalEvidenceRegistryPath(policy), "external-evidence-registry.v1", entries);
}

function loadDeploymentEvidenceRegistry(policy) {
  ensureDir(policy.evidenceRoot);
  return loadRegistry(policy.registryPath, "deployment-evidence-registry.v1");
}

function writeDeploymentEvidenceRegistry(policy, entries) {
  writeRegistry(policy.registryPath, "deployment-evidence-registry.v1", entries);
}

function buildManifestEnvelope({ workspaceRoot, schema, sourcePath, payload, observationKind, provenance }) {
  const absoluteSourcePath = path.resolve(sourcePath);
  return {
    schema,
    generatedAt: nowIso(),
    sourcePath: rel(workspaceRoot, absoluteSourcePath),
    observationKind: safeString(observationKind, 80),
    fileHash: computeFileHash(absoluteSourcePath),
    payloadHash: stablePayloadHash(payload),
    provenance: provenance && typeof provenance === "object" ? provenance : {},
  };
}

function loadHumanRunsForAggregation(filePath, allowedKinds) {
  const payload = loadJsonConfig(filePath, {});
  return ensureArray(payload.runs).map((entry) => ({
    taskId: safeString(entry && entry.taskId, 120),
    familyId: safeString(entry && entry.familyId, 120),
    observationKind: safeString(entry && entry.observationKind, 80) || "synthetic",
    score: Number(entry && entry.score) || 0,
    completionRate: Number(entry && entry.completionRate) || 0,
    quality: Number(entry && entry.quality) || 0,
    cost: Number(entry && entry.cost) || 0,
    elapsedMinutes: Number(entry && entry.elapsedMinutes) || 0,
    note: safeString(entry && entry.note, 400),
    cognitiveProfile: safeString(entry && entry.cognitiveProfile, 160),
    domainProfile: safeString(entry && entry.domainProfile, 160),
  })).filter((entry) => allowedKinds.includes(entry.observationKind));
}

function loadExternalRunsForAggregation(filePath) {
  const payload = loadJsonConfig(filePath, {});
  return ensureArray(payload.runs).map((entry) => ({
    taskId: safeString(entry && entry.taskId, 120),
    observationKind: safeString(entry && entry.observationKind, 80) || "mock_fixture",
    verdict: safeString(entry && entry.verdict, 40) || "UNKNOWN",
    score: Number(entry && entry.score) || 0,
    auditMode: safeString(entry && entry.auditMode, 80) || "blackbox",
    note: safeString(entry && entry.note, 400),
  }));
}

function loadDeploymentRunsForAggregation(filePath, allowedKinds) {
  const payload = loadJsonConfig(filePath, {});
  return ensureArray(payload.runs).map((entry) => ({
    runId: safeString(entry && entry.runId, 120),
    observationKind: safeString(entry && entry.observationKind, 80) || "lab_internal",
    environmentTier: safeString(entry && entry.environmentTier, 80) || "sandbox",
    suiteKind: safeString(entry && entry.suiteKind, 80) || "public",
    successRate: Number(entry && entry.successRate) || 0,
    rollbackSuccessRate: Number(entry && entry.rollbackSuccessRate) || 0,
    mttrMinutes: Number(entry && entry.mttrMinutes) || 0,
    incidentRate: Number(entry && entry.incidentRate) || 0,
    durationHours: Number(entry && entry.durationHours) || 0,
    operatorInterventionMinutes: Number(entry && entry.operatorInterventionMinutes) || 0,
    familyBreadth: Number(entry && entry.familyBreadth) || 0,
    note: safeString(entry && entry.note, 400),
  })).filter((entry) => allowedKinds.includes(entry.observationKind));
}

async function exportHumanBaselineRunner({ workspaceRoot = workspaceRootFrom(), baseOutputs = null } = {}) {
  const policy = loadHumanBaselinePolicy(undefined, { workspaceRoot });
  const phaseRoot = "output/externalization_nohitl/human_baseline";
  const base = baseOutputs || await runClaimClosureProgram({ workspaceRoot, phase: "all" });
  const manifestPayload = parseJson(policy.trialManifestPath, { packets: [] }) || { packets: [] };
  const packets = ensureArray(manifestPayload.packets);
  const exportManifestPath = writeOutput(workspaceRoot, `${phaseRoot}/human_baseline_trial_manifest.json`, {
    schema: "human-baseline-trial-manifest.v2",
    generatedAt: nowIso(),
    packetCount: packets.length,
    packets,
  }).relativePath;
  const observedTemplatePath = writeOutput(workspaceRoot, `${phaseRoot}/human_observed_results.template.json`, {
    schema: "human-baseline-result-import.v3",
    generatedAt: nowIso(),
    runs: packets.slice(0, 3).map((packet) => ({
      taskId: packet.taskId,
      familyId: packet.familyId,
      observationKind: "human_observed",
      score: 0,
      completionRate: 0,
      quality: 0,
      cost: 0,
      elapsedMinutes: packet.timeLimitMinutes,
      note: "",
      cognitiveProfile: "",
      domainProfile: "",
    })),
  }).relativePath;
  const mockObservedPath = writeOutput(workspaceRoot, `${phaseRoot}/human_results.mock_fixture.json`, {
    schema: "human-baseline-result-import.v3",
    generatedAt: nowIso(),
    runs: packets.slice(0, 3).map((packet) => ({
      taskId: packet.taskId,
      familyId: packet.familyId,
      observationKind: "mock_fixture",
      score: 89,
      completionRate: 1,
      quality: 86,
      cost: 32,
      elapsedMinutes: Math.max(1, Number(packet.timeLimitMinutes || 45) - 4),
      note: "mock observed fixture",
      cognitiveProfile: "mock-generalist",
      domainProfile: `family:${packet.familyId}`,
    })),
  }).relativePath;
  const adjudicationPacketPath = writeOutput(workspaceRoot, `${phaseRoot}/adjudication_packet.json`, {
    schema: "human-adjudication-packet.v2",
    generatedAt: nowIso(),
    rubric: [
      "success criteria satisfied",
      "quality acceptable",
      "time budget respected",
      "uncertainty captured",
    ],
    reviewChecklist: [
      "artifact present",
      "deliverable format valid",
      "verifier notes reviewed",
      "environment constraints respected",
    ],
    interRaterTemplate: {
      fields: ["reviewerId", "taskId", "score", "comments", "confidence", "decision"],
    },
    disagreementLogTemplate: {
      fields: ["taskId", "reviewerA", "reviewerB", "disagreementType", "tieBreakRequired", "resolution"],
    },
  }).relativePath;
  const files = [exportManifestPath, observedTemplatePath, mockObservedPath, adjudicationPacketPath].map((entry) => path.join(workspaceRoot, entry));
  const evidenceManifestPath = writeOutput(workspaceRoot, `${phaseRoot}/human_evidence_manifest.json`, {
    schema: "human-evidence-manifest.v1",
    generatedAt: nowIso(),
    files: files.map((filePath) => ({
      path: rel(workspaceRoot, filePath),
      hash: computeFileHash(filePath),
    })),
  }).relativePath;
  return {
    schema: "human-baseline-runner-export.v1",
    generatedAt: nowIso(),
    trialManifestPath: exportManifestPath,
    observedTemplatePath,
    mockObservedPath,
    adjudicationPacketPath,
    evidenceManifestPath,
    packetCount: packets.length,
    baseClaimClosureReportPath: safeString(base.phase11 && base.phase11.reportPath, 400),
  };
}

function importHumanBaselineEvidence({
  workspaceRoot = workspaceRootFrom(),
  filePath,
  sourceLabel = "",
} = {}) {
  const policy = loadHumanBaselinePolicy(undefined, { workspaceRoot });
  const absolutePath = path.resolve(workspaceRoot, filePath);
  const imported = importHumanTrialResults(absolutePath, policy);
  const runPayload = loadJsonConfig(absolutePath, { runs: [] });
  const importRoot = path.join(policy.trialRoot, "imports");
  ensureDir(importRoot);
  const importCopyPath = path.join(importRoot, `${slugify(sourceLabel || path.basename(absolutePath, path.extname(absolutePath)), "human-import", 80)}-${Date.now()}.json`);
  writeJson(importCopyPath, runPayload);
  const envelope = buildManifestEnvelope({
    workspaceRoot,
    schema: "human-evidence-import-envelope.v1",
    sourcePath: absolutePath,
    payload: runPayload,
    observationKind: uniqueStrings(imported.runs.map((entry) => entry.observationKind), 4).join(","),
    provenance: { sourceLabel: safeString(sourceLabel, 120) || "manual_import" },
  });
  const entry = {
    evidenceId: `human-evidence-${Date.now()}`,
    importedAt: nowIso(),
    sourceLabel: safeString(sourceLabel, 120) || "manual_import",
    sourcePath: rel(workspaceRoot, absolutePath),
    importedCopyPath: rel(workspaceRoot, importCopyPath),
    observedCount: imported.runs.filter((run) => run.observationKind === "human_observed").length,
    mockCount: imported.runs.filter((run) => run.observationKind === "mock_fixture").length,
    syntheticCount: imported.runs.filter((run) => run.observationKind === "synthetic").length,
    envelope,
  };
  const registry = loadHumanEvidenceRegistry(policy);
  const nextEntries = ensureArray(registry.entries).concat(entry);
  writeHumanEvidenceRegistry(policy, nextEntries);
  return {
    schema: "human-baseline-import-report.v1",
    generatedAt: nowIso(),
    entry,
    registryPath: rel(workspaceRoot, humanRegistryPath(policy)),
  };
}

function adjudicateHumanBaselineEvidence({
  workspaceRoot = workspaceRootFrom(),
  primaryPath,
  secondaryPath = "",
  tieBreakPath = "",
} = {}) {
  const policy = loadHumanBaselinePolicy(undefined, { workspaceRoot });
  const primaryRuns = loadHumanRunsForAggregation(path.resolve(workspaceRoot, primaryPath), policy.allowedObservationKinds);
  const secondaryRuns = secondaryPath ? loadHumanRunsForAggregation(path.resolve(workspaceRoot, secondaryPath), policy.allowedObservationKinds) : [];
  const tieBreakRuns = tieBreakPath ? loadHumanRunsForAggregation(path.resolve(workspaceRoot, tieBreakPath), policy.allowedObservationKinds) : [];
  const secondaryMap = new Map(secondaryRuns.map((entry) => [entry.taskId, entry]));
  const tieBreakMap = new Map(tieBreakRuns.map((entry) => [entry.taskId, entry]));
  const decisions = primaryRuns.map((primary) => {
    const secondary = secondaryMap.get(primary.taskId) || null;
    const tieBreak = tieBreakMap.get(primary.taskId) || null;
    if (!secondary) {
      return {
        taskId: primary.taskId,
        decision: "missing_second_rater",
        resolvedScore: primary.score,
        tieBreakRequired: 1,
      };
    }
    const delta = Math.abs(Number(primary.score || 0) - Number(secondary.score || 0));
    if (delta <= 10) {
      return {
        taskId: primary.taskId,
        decision: "average_resolved",
        resolvedScore: Number((((primary.score || 0) + (secondary.score || 0)) / 2).toFixed(4)),
        tieBreakRequired: 0,
      };
    }
    if (tieBreak) {
      return {
        taskId: primary.taskId,
        decision: "tie_break_resolved",
        resolvedScore: Number(tieBreak.score || 0),
        tieBreakRequired: 0,
      };
    }
    return {
      taskId: primary.taskId,
      decision: "tie_break_missing",
      resolvedScore: Number(primary.score || 0),
      tieBreakRequired: 1,
    };
  });
  const adjudicationPath = writeOutput(workspaceRoot, `output/externalization_nohitl/human_baseline/adjudication_${Date.now()}.json`, {
    schema: "human-baseline-adjudication.v1",
    generatedAt: nowIso(),
    primaryPath: safeString(primaryPath, 320),
    secondaryPath: safeString(secondaryPath, 320),
    tieBreakPath: safeString(tieBreakPath, 320),
    decisions,
  }).relativePath;
  return {
    schema: "human-baseline-adjudication-report.v1",
    generatedAt: nowIso(),
    adjudicationPath,
    unresolvedCount: decisions.filter((entry) => entry.tieBreakRequired === 1).length,
  };
}

function aggregateHumanBaselineEvidence({
  workspaceRoot = workspaceRootFrom(),
  baseOutputs,
} = {}) {
  const policy = loadHumanBaselinePolicy(undefined, { workspaceRoot });
  const registry = loadHumanEvidenceRegistry(policy);
  const runs = ensureArray(registry.entries).flatMap((entry) => {
    const importPath = safeString(entry && entry.importedCopyPath, 400);
    return importPath ? loadHumanRunsForAggregation(path.join(workspaceRoot, importPath), policy.allowedObservationKinds) : [];
  });
  const aiResults = ensureArray(baseOutputs && baseOutputs.remainingProgram && baseOutputs.remainingProgram.phase5 && baseOutputs.remainingProgram.phase5.publicEval && baseOutputs.remainingProgram.phase5.publicEval.results)
    .map((entry) => ({
      caseId: entry.caseId,
      taskId: entry.caseId,
      familyId: entry.familyId,
      score: entry.score,
    }));
  const humanBaseline = aggregateHumanBaseline({ aiResults, imported: { runs } });
  const manifestPath = writeOutput(workspaceRoot, "output/externalization_nohitl/human_baseline/human_evidence_manifest.aggregated.json", {
    schema: "human-evidence-aggregate-manifest.v1",
    generatedAt: nowIso(),
    registryPath: rel(workspaceRoot, humanRegistryPath(policy)),
    importCount: ensureArray(registry.entries).length,
    imports: ensureArray(registry.entries).map((entry) => ({
      evidenceId: entry.evidenceId,
      importedCopyPath: entry.importedCopyPath,
      fileHash: entry.envelope && entry.envelope.fileHash,
    })),
  }).relativePath;
  return {
    schema: "human-baseline-aggregate-report.v1",
    generatedAt: nowIso(),
    registryPath: rel(workspaceRoot, humanRegistryPath(policy)),
    manifestPath,
    humanBaseline,
  };
}

function assertProtectedAuditRead({
  workspaceRoot = workspaceRootFrom(),
  actor = "",
  targetPath = "",
} = {}) {
  const auditPolicy = loadExternalAuditPolicy(undefined, { workspaceRoot });
  const protectedRoots = [
    path.join(workspaceRoot, "protected", "holdout"),
    path.join(workspaceRoot, "protected", "blackbox"),
  ];
  const allowedActors = ["release", "auditor", "external_reviewer"];
  const normalizedActor = safeString(actor, 80) || "runtime";
  const absoluteTarget = path.isAbsolute(targetPath) ? path.normalize(targetPath) : path.join(workspaceRoot, targetPath);
  if (allowedActors.includes(normalizedActor)) {
    return { status: "AUTO_PASS", targetPath: rel(workspaceRoot, absoluteTarget) };
  }
  if (protectedRoots.some((root) => absoluteTarget.startsWith(root))) {
    appendJsonLine(auditPolicy.policyBreachLogPath, {
      schema: "external-audit-policy-breach.v2",
      recordedAt: nowIso(),
      actor: normalizedActor,
      targetPath: rel(workspaceRoot, absoluteTarget),
      status: "BLOCKED_BY_POLICY",
      reason: "protected_path_access_denied",
    });
    throw new Error(`BLOCKED_BY_POLICY:protected_audit_path_denied:${normalizedActor}:${rel(workspaceRoot, absoluteTarget)}`);
  }
  return { status: "AUTO_PASS", targetPath: rel(workspaceRoot, absoluteTarget) };
}

function exportExternalAuditPack({
  workspaceRoot = workspaceRootFrom(),
  mode = "blackbox",
} = {}) {
  const policy = loadExternalAuditPolicy(undefined, { workspaceRoot });
  ensureDir(policy.sealedPackRoot);
  const packId = `${Date.now()}`;
  const packRoot = path.join(policy.sealedPackRoot, packId);
  ensureDir(packRoot);
  const allowedMode = ["blackbox", "whitebox", "restricted_view"].includes(mode) ? mode : "blackbox";
  const blackboxSuitePath = path.join(workspaceRoot, "protected", "blackbox", "agi_readiness_blackbox_suite.json");
  const openWorldBlackboxSuitePath = path.join(workspaceRoot, "protected", "blackbox", "open_world_blackbox_suite.json");
  const instructionsPath = path.join(packRoot, "evaluation_instructions.json");
  const resultTemplatePath = path.join(packRoot, "external_audit_result.template.json");
  const taskBundlePath = path.join(packRoot, "blackbox_tasks.json");
  const openWorldBundlePath = path.join(packRoot, "open_world_blackbox_tasks.json");
  const modeDescriptorPath = path.join(packRoot, "audit_modes.json");
  fs.copyFileSync(blackboxSuitePath, taskBundlePath);
  fs.copyFileSync(openWorldBlackboxSuitePath, openWorldBundlePath);
  writeJson(instructionsPath, {
    schema: "external-audit-instructions.v2",
    generatedAt: nowIso(),
    auditMode: allowedMode,
    allowedInterfaces: policy.allowedInterfaces,
    expectedLogging: ["structured_result_json", "tamper_manifest_verification", "interface_used"],
    resultSubmissionFormat: "external_audit_result_import.v2",
    reproducibility: [
      "use sealed pack contents only",
      "return signed structured result json",
      "do not expose protected tasks to optimizer",
    ],
  });
  writeJson(resultTemplatePath, {
    schema: "external-audit-result-import.v2",
    generatedAt: nowIso(),
    auditMode: allowedMode,
    runs: [
      {
        taskId: "external-audit-task-1",
        observationKind: "external_observed",
        auditMode: allowedMode,
        verdict: "PASS",
        score: 0,
        note: "",
      },
    ],
  });
  writeJson(modeDescriptorPath, {
    schema: "external-audit-modes.v1",
    generatedAt: nowIso(),
    modes: [
      { id: "blackbox", visibility: "tasks only" },
      { id: "whitebox", visibility: "tasks plus architecture summary" },
      { id: "restricted_view", visibility: "tasks plus limited interface summary" },
    ],
  });
  const files = [instructionsPath, resultTemplatePath, taskBundlePath, openWorldBundlePath, modeDescriptorPath];
  const tamperManifestPath = path.join(packRoot, "tamper_manifest.json");
  writeJson(tamperManifestPath, {
    schema: "tamper-evident-manifest.v2",
    generatedAt: nowIso(),
    algorithm: policy.tamperManifestAlgorithm,
    files: files.map((filePath) => ({
      path: path.relative(packRoot, filePath).replace(/\\/g, "/"),
      hash: computeFileHash(filePath, policy.tamperManifestAlgorithm),
    })),
  });
  const registry = loadExternalEvidenceRegistry(policy);
  const nextEntries = ensureArray(registry.entries).concat({
    evidenceId: `audit-pack-${packId}`,
    kind: "sealed_pack",
    packRoot: rel(workspaceRoot, packRoot),
    auditMode: allowedMode,
    tamperManifestPath: rel(workspaceRoot, tamperManifestPath),
    observedCount: 0,
    mockCount: 0,
    status: "AUTO_PASS",
  });
  writeExternalEvidenceRegistry(policy, nextEntries);
  return {
    schema: "external-audit-pack-export.v1",
    generatedAt: nowIso(),
    packRoot: rel(workspaceRoot, packRoot),
    instructionsPath: rel(workspaceRoot, instructionsPath),
    resultTemplatePath: rel(workspaceRoot, resultTemplatePath),
    tamperManifestPath: rel(workspaceRoot, tamperManifestPath),
  };
}

function verifyExternalAuditPack({
  workspaceRoot = workspaceRootFrom(),
  packRoot,
} = {}) {
  const absolutePackRoot = path.resolve(workspaceRoot, packRoot);
  const tamperManifestPath = path.join(absolutePackRoot, "tamper_manifest.json");
  const manifest = loadJsonConfig(tamperManifestPath, {});
  const mismatches = ensureArray(manifest.files).filter((entry) => {
    const filePath = path.join(absolutePackRoot, safeString(entry && entry.path, 320));
    return computeFileHash(filePath, safeString(manifest.algorithm, 40) || "sha256") !== safeString(entry && entry.hash, 160);
  }).map((entry) => safeString(entry && entry.path, 320));
  return {
    schema: "external-audit-pack-verification.v1",
    generatedAt: nowIso(),
    packRoot: rel(workspaceRoot, absolutePackRoot),
    status: mismatches.length ? "AUTO_FAIL" : "AUTO_PASS",
    mismatchCount: mismatches.length,
    mismatches,
  };
}

function importExternalAuditEvidence({
  workspaceRoot = workspaceRootFrom(),
  filePath,
  sourceLabel = "",
} = {}) {
  const policy = loadExternalAuditPolicy(undefined, { workspaceRoot });
  const absolutePath = path.resolve(workspaceRoot, filePath);
  const imported = importExternalAuditResults(absolutePath, policy);
  const payload = loadJsonConfig(absolutePath, { runs: [] });
  const importRoot = path.join(policy.resultImportRoot, "verified");
  ensureDir(importRoot);
  const importCopyPath = path.join(importRoot, `${slugify(sourceLabel || path.basename(absolutePath, path.extname(absolutePath)), "audit-import", 80)}-${Date.now()}.json`);
  writeJson(importCopyPath, payload);
  const entry = {
    evidenceId: `external-audit-${Date.now()}`,
    importedAt: nowIso(),
    sourceLabel: safeString(sourceLabel, 120) || "manual_import",
    sourcePath: rel(workspaceRoot, absolutePath),
    importedCopyPath: rel(workspaceRoot, importCopyPath),
    observedCount: imported.runs.filter((run) => run.observationKind === "external_observed").length,
    mockCount: imported.runs.filter((run) => run.observationKind === "mock_fixture").length,
    blackboxObservedCount: imported.runs.filter((run) => run.observationKind === "external_observed" && run.auditMode === "blackbox").length,
    whiteboxObservedCount: imported.runs.filter((run) => run.observationKind === "external_observed" && run.auditMode === "whitebox").length,
    restrictedViewObservedCount: imported.runs.filter((run) => run.observationKind === "external_observed" && run.auditMode === "restricted_view").length,
    verdicts: uniqueStrings(imported.runs.map((run) => run.verdict), 8),
    envelope: buildManifestEnvelope({
      workspaceRoot,
      schema: "external-audit-import-envelope.v1",
      sourcePath: absolutePath,
      payload,
      observationKind: uniqueStrings(imported.runs.map((run) => run.observationKind), 4).join(","),
      provenance: { sourceLabel: safeString(sourceLabel, 120) || "manual_import" },
    }),
  };
  const registry = loadExternalEvidenceRegistry(policy);
  const nextEntries = ensureArray(registry.entries).concat(entry);
  writeExternalEvidenceRegistry(policy, nextEntries);
  return {
    schema: "external-audit-import-report.v1",
    generatedAt: nowIso(),
    entry,
    registryPath: rel(workspaceRoot, externalEvidenceRegistryPath(policy)),
  };
}

function summarizeExternalAuditEvidence({
  workspaceRoot = workspaceRootFrom(),
} = {}) {
  const policy = loadExternalAuditPolicy(undefined, { workspaceRoot });
  const registry = loadExternalEvidenceRegistry(policy);
  const entries = ensureArray(registry.entries).filter((entry) => safeString(entry && entry.kind, 80) !== "sealed_pack");
  return {
    schema: "external-audit-evidence-summary.v1",
    generatedAt: nowIso(),
    registryPath: rel(workspaceRoot, externalEvidenceRegistryPath(policy)),
    observedExternalAuditCount: entries.reduce((sum, entry) => sum + (Number(entry && entry.observedCount) || 0), 0),
    mockExternalAuditCount: entries.reduce((sum, entry) => sum + (Number(entry && entry.mockCount) || 0), 0),
    blackboxObservedCount: entries.reduce((sum, entry) => sum + (Number(entry && entry.blackboxObservedCount) || 0), 0),
    whiteboxObservedCount: entries.reduce((sum, entry) => sum + (Number(entry && entry.whiteboxObservedCount) || 0), 0),
    restrictedViewObservedCount: entries.reduce((sum, entry) => sum + (Number(entry && entry.restrictedViewObservedCount) || 0), 0),
    importCount: entries.length,
  };
}

function exportDeploymentEvidenceTemplate({
  workspaceRoot = workspaceRootFrom(),
} = {}) {
  const phaseRoot = "output/externalization_nohitl/deployment_evidence";
  const templatePath = writeOutput(workspaceRoot, `${phaseRoot}/deployment_evidence.template.json`, {
    schema: "deployment-evidence-import.v1",
    generatedAt: nowIso(),
    runs: [
      {
        runId: "production-like-run-1",
        observationKind: "production_like_observed",
        environmentTier: "production_like",
        suiteKind: "blackbox",
        successRate: 0,
        rollbackSuccessRate: 0,
        mttrMinutes: 0,
        incidentRate: 0,
        durationHours: 6,
        operatorInterventionMinutes: 0,
        familyBreadth: 0,
        note: "",
      },
    ],
  }).relativePath;
  const mockPath = writeOutput(workspaceRoot, `${phaseRoot}/deployment_evidence.mock_fixture.json`, {
    schema: "deployment-evidence-import.v1",
    generatedAt: nowIso(),
    runs: [
      {
        runId: "deployment-mock-1",
        observationKind: "mock_fixture",
        environmentTier: "production_like",
        suiteKind: "blackbox",
        successRate: 0.92,
        rollbackSuccessRate: 1,
        mttrMinutes: 14,
        incidentRate: 0.05,
        durationHours: 6,
        operatorInterventionMinutes: 9,
        familyBreadth: 7,
        note: "mock fixture only",
      },
    ],
  }).relativePath;
  return {
    schema: "deployment-evidence-export.v1",
    generatedAt: nowIso(),
    templatePath,
    mockPath,
  };
}

function importDeploymentEvidence({
  workspaceRoot = workspaceRootFrom(),
  filePath,
  sourceLabel = "",
} = {}) {
  const policy = loadDeploymentEvidencePolicy(undefined, { workspaceRoot });
  const absolutePath = path.resolve(workspaceRoot, filePath);
  const runs = loadDeploymentRunsForAggregation(absolutePath, policy.allowedObservationKinds);
  const payload = loadJsonConfig(absolutePath, { runs: [] });
  const importRoot = path.join(policy.evidenceRoot, "imports");
  ensureDir(importRoot);
  const importCopyPath = path.join(importRoot, `${slugify(sourceLabel || path.basename(absolutePath, path.extname(absolutePath)), "deployment-import", 80)}-${Date.now()}.json`);
  writeJson(importCopyPath, payload);
  const entry = {
    evidenceId: `deployment-evidence-${Date.now()}`,
    importedAt: nowIso(),
    sourceLabel: safeString(sourceLabel, 120) || "manual_import",
    sourcePath: rel(workspaceRoot, absolutePath),
    importedCopyPath: rel(workspaceRoot, importCopyPath),
    productionLikeObservedCount: runs.filter((run) => run.observationKind === "production_like_observed").length,
    blackboxObservedCount: runs.filter((run) => run.observationKind === "production_like_observed" && run.suiteKind === "blackbox").length,
    mockCount: runs.filter((run) => run.observationKind === "mock_fixture").length,
    labInternalCount: runs.filter((run) => run.observationKind === "lab_internal").length,
    simulationCount: runs.filter((run) => run.observationKind === "simulation_fixture").length,
    envelope: buildManifestEnvelope({
      workspaceRoot,
      schema: "deployment-evidence-import-envelope.v1",
      sourcePath: absolutePath,
      payload,
      observationKind: uniqueStrings(runs.map((run) => run.observationKind), 4).join(","),
      provenance: { sourceLabel: safeString(sourceLabel, 120) || "manual_import" },
    }),
  };
  const registry = loadDeploymentEvidenceRegistry(policy);
  const nextEntries = ensureArray(registry.entries).concat(entry);
  writeDeploymentEvidenceRegistry(policy, nextEntries);
  appendJsonLine(policy.importHistoryPath, {
    schema: "deployment-evidence-import-history.v1",
    importedAt: nowIso(),
    sourcePath: rel(workspaceRoot, absolutePath),
    sourceLabel: safeString(sourceLabel, 120) || "manual_import",
    observedCount: entry.productionLikeObservedCount,
    blackboxObservedCount: entry.blackboxObservedCount,
  });
  for (const run of runs) {
    appendJsonLine(policy.telemetryHistoryPath, {
      schema: "deployment-telemetry-history-entry.v1",
      recordedAt: nowIso(),
      run,
    });
  }
  return {
    schema: "deployment-evidence-import-report.v1",
    generatedAt: nowIso(),
    entry,
    registryPath: rel(workspaceRoot, policy.registryPath),
  };
}

function aggregateDeploymentEvidence({
  workspaceRoot = workspaceRootFrom(),
} = {}) {
  const policy = loadDeploymentEvidencePolicy(undefined, { workspaceRoot });
  const registry = loadDeploymentEvidenceRegistry(policy);
  const runs = ensureArray(registry.entries).flatMap((entry) => {
    const importPath = safeString(entry && entry.importedCopyPath, 400);
    return importPath ? loadDeploymentRunsForAggregation(path.join(workspaceRoot, importPath), policy.allowedObservationKinds) : [];
  });
  const observed = runs.filter((run) => run.observationKind === "production_like_observed");
  return {
    schema: "deployment-evidence-aggregate.v1",
    generatedAt: nowIso(),
    registryPath: rel(workspaceRoot, policy.registryPath),
    productionLikeObservedCount: observed.length,
    blackboxObservedCount: observed.filter((run) => run.suiteKind === "blackbox").length,
    mockCount: runs.filter((run) => run.observationKind === "mock_fixture").length,
    labInternalCount: runs.filter((run) => run.observationKind === "lab_internal").length,
    simulationCount: runs.filter((run) => run.observationKind === "simulation_fixture").length,
    observedMetrics: {
      successRate: computeStats(observed.map((run) => run.successRate)),
      rollbackSuccessRate: computeStats(observed.map((run) => run.rollbackSuccessRate)),
      mttrMinutes: computeStats(observed.map((run) => run.mttrMinutes)),
      incidentRate: computeStats(observed.map((run) => run.incidentRate)),
      durationHours: computeStats(observed.map((run) => run.durationHours)),
      operatorInterventionMinutes: computeStats(observed.map((run) => run.operatorInterventionMinutes)),
      familyBreadth: computeStats(observed.map((run) => run.familyBreadth)),
    },
  };
}

function analyzeNoHitl({
  workspaceRoot = workspaceRootFrom(),
  claimClosureOutputs,
  humanAggregate,
  externalAuditSummary,
  deploymentAggregate,
} = {}) {
  const profile = loadNonInteractiveProfile();
  const taxonomy = loadNoHitlBlockedReasonTaxonomy();
  const secretProbe = probeSecretProvider({ workspaceRoot });
  const knowledgeProbe = probeKnowledgeBackend({ workspaceRoot });
  const phase17 = claimClosureOutputs && claimClosureOutputs.phase17 && claimClosureOutputs.phase17.claimGate ? claimClosureOutputs.phase17.claimGate : {};
  const classifications = [
    {
      categoryId: "approval_or_sandbox_policy",
      machineStatus: "AUTO_PASS",
      detail: `profile=${profile.profileId} requestUserInputPolicy=${profile.requestUserInputPolicy}`,
    },
    {
      categoryId: "protected_path_or_secret_policy",
      machineStatus: "AUTO_PASS",
      detail: "protected path and secret denial return structured blocked codes",
    },
    {
      categoryId: "external_human_evidence_missing",
      machineStatus: Number(humanAggregate && humanAggregate.humanBaseline && humanAggregate.humanBaseline.observedHumanCount) > 0 ? "AUTO_PASS" : "EXTERNAL_EVIDENCE_PENDING",
      detail: `observedHumanCount=${Number(humanAggregate && humanAggregate.humanBaseline && humanAggregate.humanBaseline.observedHumanCount) || 0}`,
    },
    {
      categoryId: "external_audit_missing",
      machineStatus: Number(externalAuditSummary && externalAuditSummary.observedExternalAuditCount) > 0 ? "AUTO_PASS" : "EXTERNAL_EVIDENCE_PENDING",
      detail: `observedExternalAuditCount=${Number(externalAuditSummary && externalAuditSummary.observedExternalAuditCount) || 0}`,
    },
    {
      categoryId: "provider_not_connected",
      machineStatus: secretProbe.status === "AUTO_PASS" && knowledgeProbe.status === "AUTO_PASS" ? "AUTO_PASS" : "BLOCKED_BY_ENV",
      detail: `secret=${secretProbe.status} knowledge=${knowledgeProbe.status}`,
    },
    {
      categoryId: "implementation_gap",
      machineStatus: phase17 && phase17.claimGateState ? "AUTO_PASS" : "AUTO_FAIL",
      detail: phase17 && phase17.claimGateState ? `baseClaimGateState=${phase17.claimGateState}` : "claim closure outputs missing",
    },
  ];
  const hostNaturalLanguageConstraint = {
    categoryId: "host_ui_message_surface",
    machineStatus: "BLOCKED_BY_CONFIG",
    detail: "repo-level scripts can return structured blocked statuses, but host-generated natural language may remain outside repository control",
  };
  return {
    schema: "no-hitl-analysis-report.v1",
    generatedAt: nowIso(),
    profile,
    taxonomy,
    classifications,
    hostNaturalLanguageConstraint,
    recommendedInvocation: profile.recommendedInvocation,
  };
}

function buildMissingEvidenceChecklist({
  thresholds,
  humanAggregate,
  externalAuditSummary,
  deploymentAggregate,
  secretProbe,
  knowledgeProbe,
  phase13,
} = {}) {
  const longDurationMetrics = phase13 && phase13.report ? phase13.report.longDurationMetrics : {};
  const taskBreadth = uniqueStrings(
    ensureArray(phase13 && phase13.report && phase13.report.publicSuite && phase13.report.publicSuite.results).map((entry) => entry.familyId)
      .concat(ensureArray(phase13 && phase13.report && phase13.report.holdoutSuite && phase13.report.holdoutSuite.results).map((entry) => entry.familyId))
      .concat(ensureArray(phase13 && phase13.report && phase13.report.blackboxSuite && phase13.report.blackboxSuite.results).map((entry) => entry.familyId)),
    64
  ).length;
  return [
    {
      id: "observed_human_evidence",
      machineStatus: Number(humanAggregate && humanAggregate.humanBaseline && humanAggregate.humanBaseline.observedHumanCount) >= Number(thresholds.observedHumanCountMin || 0)
        ? "AUTO_PASS"
        : "EXTERNAL_EVIDENCE_PENDING",
      observedCount: Number(humanAggregate && humanAggregate.humanBaseline && humanAggregate.humanBaseline.observedHumanCount) || 0,
      requiredCount: Number(thresholds.observedHumanCountMin || 0),
    },
    {
      id: "observed_external_audit",
      machineStatus: Number(externalAuditSummary && externalAuditSummary.observedExternalAuditCount) >= Number(thresholds.observedExternalAuditCountMin || 0)
        ? "AUTO_PASS"
        : "EXTERNAL_EVIDENCE_PENDING",
      observedCount: Number(externalAuditSummary && externalAuditSummary.observedExternalAuditCount) || 0,
      requiredCount: Number(thresholds.observedExternalAuditCountMin || 0),
    },
    {
      id: "production_like_evidence",
      machineStatus: Number(deploymentAggregate && deploymentAggregate.productionLikeObservedCount) >= Number(thresholds.productionLikeObservedCountMin || 0)
        ? "AUTO_PASS"
        : "EXTERNAL_EVIDENCE_PENDING",
      observedCount: Number(deploymentAggregate && deploymentAggregate.productionLikeObservedCount) || 0,
      requiredCount: Number(thresholds.productionLikeObservedCountMin || 0),
    },
    {
      id: "blackbox_observed_coverage",
      machineStatus: Number(externalAuditSummary && externalAuditSummary.blackboxObservedCount) >= Number(thresholds.blackboxObservedCountMin || thresholds.minimumBlackboxObservedCountForPublicClaim || 0)
        ? "AUTO_PASS"
        : "EXTERNAL_EVIDENCE_PENDING",
      observedCount: Number(externalAuditSummary && externalAuditSummary.blackboxObservedCount) || 0,
      requiredCount: Number(thresholds.blackboxObservedCountMin || thresholds.minimumBlackboxObservedCountForPublicClaim || 0),
    },
    {
      id: "task_breadth",
      machineStatus: taskBreadth >= Number(thresholds.minimumTaskBreadth || 0) ? "AUTO_PASS" : "AUTO_FAIL",
      observedCount: taskBreadth,
      requiredCount: Number(thresholds.minimumTaskBreadth || 0),
    },
    {
      id: "long_duration_trials",
      machineStatus: Number(longDurationMetrics && ensureArray(longDurationMetrics.repeatedTrials).length) >= Number(thresholds.minimumLongDurationTrials || 0)
        ? "AUTO_PASS"
        : "AUTO_FAIL",
      observedCount: Number(longDurationMetrics && ensureArray(longDurationMetrics.repeatedTrials).length) || 0,
      requiredCount: Number(thresholds.minimumLongDurationTrials || 0),
    },
    {
      id: "secret_provider_connection",
      machineStatus: secretProbe.status,
      detail: secretProbe.detail,
    },
    {
      id: "knowledge_backend_connection",
      machineStatus: knowledgeProbe.status,
      detail: knowledgeProbe.detail,
    },
  ];
}

function buildPrivateOperatorLoopAssessment({
  policy,
  claimClosureOutputs,
  phase13,
  phase15,
} = {}) {
  const privatePolicy = policy && policy.internalPrivateGovernance && typeof policy.internalPrivateGovernance === "object"
    ? policy.internalPrivateGovernance
    : {};
  const privateStates = privatePolicy.states && typeof privatePolicy.states === "object"
    ? privatePolicy.states
    : {};
  const scorecard = claimClosureOutputs
    && claimClosureOutputs.remainingProgram
    && claimClosureOutputs.remainingProgram.phase5
    && claimClosureOutputs.remainingProgram.phase5.scorecard
    ? claimClosureOutputs.remainingProgram.phase5.scorecard
    : {};
  const taskBreadth = uniqueStrings(
    ensureArray(phase13 && phase13.report && phase13.report.publicSuite && phase13.report.publicSuite.results).map((entry) => entry.familyId)
      .concat(ensureArray(phase13 && phase13.report && phase13.report.holdoutSuite && phase13.report.holdoutSuite.results).map((entry) => entry.familyId))
      .concat(ensureArray(phase13 && phase13.report && phase13.report.blackboxSuite && phase13.report.blackboxSuite.results).map((entry) => entry.familyId)),
    64
  ).length;
  const longDurationTrials = Number(ensureArray(phase13 && phase13.report && phase13.report.longDurationMetrics && phase13.report.longDurationMetrics.repeatedTrials).length) || 0;
  const adaptationGain = Number(phase15 && phase15.report && phase15.report.candidateEval && phase15.report.candidateEval.gain) || 0;
  const toolReliabilityScore = Number(phase15 && phase15.report && phase15.report.toolCandidate && phase15.report.toolCandidate.reliabilityScore) || 0;
  const checks = {
    taskBreadthReady: taskBreadth >= Number(privatePolicy.minimumTaskBreadth || 0),
    longDurationReady: longDurationTrials >= Number(privatePolicy.minimumLongDurationTrials || 0),
    generalityReady: Number(scorecard.generalityScore || 0) >= Number(privatePolicy.minimumGeneralityScore || 0),
    autonomyReady: Number(scorecard.autonomyScore || 0) >= Number(privatePolicy.minimumAutonomyScore || 0),
    regressionReady: Number(scorecard.regressionStabilityScore || 0) >= Number(privatePolicy.minimumRegressionStabilityScore || 0),
    adaptationGainReady: adaptationGain >= Number(privatePolicy.minimumAdaptationGain || 0),
    toolReliabilityReady: toolReliabilityScore >= Number(privatePolicy.minimumToolReliabilityScore || 0),
    freezeSafetyReady: Number(phase15 && phase15.report && phase15.report.promotionDecision && phase15.report.promotionDecision.rollbackAvailable) === 1,
  };
  const passingCount = Object.values(checks).filter(Boolean).length;
  const totalCount = Object.keys(checks).length;
  let state = safeString(privateStates.insufficient, 120) || "PRIVATE_LOOP_INSUFFICIENT";
  if (passingCount === totalCount) {
    state = safeString(privateStates.operational, 120) || "PRIVATE_LOOP_OPERATIONAL";
  } else if (passingCount >= Math.max(1, totalCount - 2)) {
    state = safeString(privateStates.stabilizing, 120) || "PRIVATE_LOOP_STABILIZING";
  }
  return {
    state,
    humanBaselineRole: safeString(privatePolicy.humanBaselineRole, 160) || "calibration_only_for_private_governance",
    primarySignals: uniqueStrings(privatePolicy.primarySignals, 32),
    checks,
    metrics: {
      taskBreadth,
      longDurationTrials,
      adaptationGain,
      toolReliabilityScore,
      generalityScore: Number(scorecard.generalityScore || 0),
      autonomyScore: Number(scorecard.autonomyScore || 0),
      regressionStabilityScore: Number(scorecard.regressionStabilityScore || 0),
    },
  };
}

function recomputeClaimGap({
  workspaceRoot = workspaceRootFrom(),
  claimClosureOutputs,
  humanAggregate,
  externalAuditSummary,
  deploymentAggregate,
  simulationOverrides = null,
} = {}) {
  const policy = loadClaimClosureGatePolicy();
  const thresholds = policy.publicEvidenceThresholds || {};
  const phase17 = claimClosureOutputs && claimClosureOutputs.phase17 && claimClosureOutputs.phase17.claimGate ? claimClosureOutputs.phase17.claimGate : {};
  const phase13 = claimClosureOutputs && claimClosureOutputs.phase13 ? claimClosureOutputs.phase13 : null;
  const phase15 = claimClosureOutputs && claimClosureOutputs.phase15 ? claimClosureOutputs.phase15 : null;
  const secretProbe = probeSecretProvider({ workspaceRoot });
  const knowledgeProbe = probeKnowledgeBackend({ workspaceRoot });
  const simulationMode = Boolean(simulationOverrides && simulationOverrides.enabled);
  const liveHumanObservedCount = Number(humanAggregate && humanAggregate.humanBaseline && humanAggregate.humanBaseline.observedHumanCount) || 0;
  const liveExternalObservedCount = Number(externalAuditSummary && externalAuditSummary.observedExternalAuditCount) || 0;
  const liveBlackboxObservedCount = Number(externalAuditSummary && externalAuditSummary.blackboxObservedCount) || 0;
  const liveProductionObservedCount = Number(deploymentAggregate && deploymentAggregate.productionLikeObservedCount) || 0;
  const effectiveCounts = simulationMode
    ? {
        observedHumanCount: Number(simulationOverrides.observedHumanCount) || 0,
        observedExternalAuditCount: Number(simulationOverrides.observedExternalAuditCount) || 0,
        blackboxObservedCount: Number(simulationOverrides.blackboxObservedCount) || 0,
        productionLikeObservedCount: Number(simulationOverrides.productionLikeObservedCount) || 0,
        incidentRateMean: Number(simulationOverrides.incidentRateMean) || 0,
      }
    : {
        observedHumanCount: liveHumanObservedCount,
        observedExternalAuditCount: liveExternalObservedCount,
        blackboxObservedCount: liveBlackboxObservedCount,
        productionLikeObservedCount: liveProductionObservedCount,
        incidentRateMean: Number(deploymentAggregate && deploymentAggregate.observedMetrics && deploymentAggregate.observedMetrics.incidentRate && deploymentAggregate.observedMetrics.incidentRate.mean) || 0,
      };
  const effectiveSecretProviderReady = simulationMode ? true : secretProbe.status === "AUTO_PASS";
  const taskBreadth = uniqueStrings(
    ensureArray(phase13 && phase13.report && phase13.report.publicSuite && phase13.report.publicSuite.results).map((entry) => entry.familyId)
      .concat(ensureArray(phase13 && phase13.report && phase13.report.holdoutSuite && phase13.report.holdoutSuite.results).map((entry) => entry.familyId))
      .concat(ensureArray(phase13 && phase13.report && phase13.report.blackboxSuite && phase13.report.blackboxSuite.results).map((entry) => entry.familyId)),
    64
  ).length;
  const longDurationMetrics = phase13 && phase13.report ? phase13.report.longDurationMetrics : {};
  const ciReady = Number(longDurationMetrics && longDurationMetrics.completionRate && longDurationMetrics.completionRate.sampleCount) > 0;
  const privateOperatorLoop = buildPrivateOperatorLoopAssessment({
    policy,
    claimClosureOutputs,
    phase13,
    phase15,
  });
  const publicHardBlocks = {
    synthetic_only_baseline: effectiveCounts.observedHumanCount > 0 ? 0 : 1,
    external_audit_not_executed: effectiveCounts.observedExternalAuditCount > 0 ? 0 : 1,
    blackbox_internal_only: effectiveCounts.blackboxObservedCount > 0 ? 0 : 1,
    secret_provider_stub_only: effectiveSecretProviderReady ? 0 : 1,
    adaptation_not_executed: Number(phase15 && phase15.report && phase15.report.promotionDecision && phase15.report.promotionDecision.rollbackAvailable) === 1 ? 0 : 1,
    observed_human_evidence_below_threshold: effectiveCounts.observedHumanCount >= Number(thresholds.observedHumanCountMin || 0) ? 0 : 1,
    observed_external_audit_below_threshold: effectiveCounts.observedExternalAuditCount >= Number(thresholds.observedExternalAuditCountMin || 0) ? 0 : 1,
    production_like_evidence_below_threshold: effectiveCounts.productionLikeObservedCount >= Number(thresholds.productionLikeObservedCountMin || 0) ? 0 : 1,
    blackbox_observed_evidence_below_threshold: effectiveCounts.blackboxObservedCount >= Number(thresholds.blackboxObservedCountMin || thresholds.minimumBlackboxObservedCountForPublicClaim || 0) ? 0 : 1,
    task_breadth_insufficient: taskBreadth >= Number(thresholds.minimumTaskBreadth || 0) ? 0 : 1,
    incident_threshold_exceeded: effectiveCounts.incidentRateMean <= Number(thresholds.maximumIncidentRateMean || 0.2) ? 0 : 1,
    long_duration_trial_missing: Number(ensureArray(longDurationMetrics.repeatedTrials).length) >= Number(thresholds.minimumLongDurationTrials || 0) ? 0 : 1,
    confidence_interval_missing: ciReady ? 0 : 1,
  };
  const remainingBlockers = Object.entries(publicHardBlocks).filter(([, value]) => value === 1).map(([key]) => key);
  const publicClaimabilityState = remainingBlockers.length
    ? "PUBLIC_AGI_CLAIM_BLOCKED"
    : (simulationMode ? "PUBLIC_CLAIM_READY_SIMULATION_ONLY" : "EXTERNALLY_VALIDATED_NO_PUBLIC_AGI_CLAIM");
  const missingEvidenceChecklist = buildMissingEvidenceChecklist({
    thresholds,
    humanAggregate,
    externalAuditSummary,
    deploymentAggregate,
    secretProbe,
    knowledgeProbe,
    phase13,
  });
  return {
    schema: "externalization-claim-gap-report.v1",
    generatedAt: nowIso(),
    internalReadinessState: safeString(phase17.claimGateState, 120) || "INTERNAL_PARTIAL_READINESS",
    privateOperatorLoopState: privateOperatorLoop.state,
    privateOperatorLoop,
    humanBaselineRoles: {
      publicClaim: "required_external_evidence",
      privateOperator: safeString(privateOperatorLoop.humanBaselineRole, 160),
    },
    publicClaimabilityState,
    observedHumanEvidenceCount: liveHumanObservedCount,
    observedExternalAuditCount: liveExternalObservedCount,
    productionLikeEvidenceCount: liveProductionObservedCount,
    blackboxObservedEvidenceCount: liveBlackboxObservedCount,
    syntheticMockExcludedFromPublicClaim: 1,
    simulationMode: simulationMode ? 1 : 0,
    simulationAppliedCounts: simulationMode ? effectiveCounts : null,
    publicHardBlocks,
    missingEvidenceChecklist,
    remainingBlockers,
  };
}

async function runFinalExternalizationNoHitl({
  workspaceRoot = workspaceRootFrom(),
} = {}) {
  const baseOutputs = await runClaimClosureProgram({ workspaceRoot, phase: "all" });
  const humanExport = await exportHumanBaselineRunner({ workspaceRoot, baseOutputs });
  const humanAggregate = aggregateHumanBaselineEvidence({ workspaceRoot, baseOutputs });
  const auditExport = exportExternalAuditPack({ workspaceRoot, mode: "blackbox" });
  const auditVerify = verifyExternalAuditPack({ workspaceRoot, packRoot: auditExport.packRoot });
  const externalAuditSummary = summarizeExternalAuditEvidence({ workspaceRoot });
  const deploymentExport = exportDeploymentEvidenceTemplate({ workspaceRoot });
  const deploymentAggregate = aggregateDeploymentEvidence({ workspaceRoot });
  const noHitl = analyzeNoHitl({
    workspaceRoot,
    claimClosureOutputs: baseOutputs,
    humanAggregate,
    externalAuditSummary,
    deploymentAggregate,
  });
  const claimGap = recomputeClaimGap({
    workspaceRoot,
    claimClosureOutputs: baseOutputs,
    humanAggregate,
    externalAuditSummary,
    deploymentAggregate,
  });
  const noHitlPath = writeOutput(workspaceRoot, "output/externalization_nohitl/no_hitl_analysis.json", noHitl).relativePath;
  const claimGapPath = writeOutput(workspaceRoot, "output/externalization_nohitl/claim_gap_report.json", claimGap).relativePath;
  const missingChecklistPath = writeOutput(workspaceRoot, "output/externalization_nohitl/missing_evidence_checklist.json", {
    schema: "missing-evidence-checklist.v1",
    generatedAt: nowIso(),
    checklist: claimGap.missingEvidenceChecklist,
  }).relativePath;
  return {
    baseOutputs,
    noHitl,
    noHitlPath,
    humanExport,
    humanAggregate,
    auditExport,
    auditVerify,
    externalAuditSummary,
    deploymentExport,
    deploymentAggregate,
    claimGap,
    claimGapPath,
    missingChecklistPath,
  };
}

async function runFinalExternalizationCompatibility({
  workspaceRoot = workspaceRootFrom(),
} = {}) {
  return runClaimClosureCompatibility({ workspaceRoot });
}

module.exports = {
  aggregateDeploymentEvidence,
  aggregateHumanBaselineEvidence,
  adjudicateHumanBaselineEvidence,
  analyzeNoHitl,
  assertProtectedAuditRead,
  exportDeploymentEvidenceTemplate,
  exportExternalAuditPack,
  exportHumanBaselineRunner,
  importDeploymentEvidence,
  importExternalAuditEvidence,
  importHumanBaselineEvidence,
  loadDeploymentEvidencePolicy,
  loadNoHitlBlockedReasonTaxonomy,
  loadNonInteractiveProfile,
  recomputeClaimGap,
  runFinalExternalizationCompatibility,
  runFinalExternalizationNoHitl,
  summarizeExternalAuditEvidence,
  verifyExternalAuditPack,
};
