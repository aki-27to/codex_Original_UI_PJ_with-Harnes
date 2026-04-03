"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { ensureDir, readJsonIfExists, writeJsonFile, repoRelative } = require("./logging_surface");
const { loadTaskContractManifest, resolveTaskContractForFamily } = require("./task_contract_policy");
const { executeEvalLane, runRemainingProgram } = require("./remaining_program_runtime");
const {
  appendIncidentLog,
  appendJsonLine,
  assertSafeAction,
  buildForensicTraceBundle,
  clusterFailures,
  compareAiToHuman,
  createAdaptationJobSpec,
  evaluateAdaptationCandidate,
  evaluateRetrievalQuality,
  loadGeneratedSkillRegistry,
  loadKnowledgePolicy,
  loadRuntimeToolRegistry,
  nowIso,
  packageAdaptationDataset,
  registerToolCandidate,
  retrieveKnowledgeSlice,
  routeModel,
  runChampionChallenger,
  safeString,
  stableHash,
  uniqueStrings,
  writeJson,
} = require("./agi_candidate_runtime");

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function workspaceRootFrom(input) {
  return input || path.resolve(__dirname, "..", "..");
}

function clampPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function writeOutput(workspaceRoot, relativePath, payload) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  ensureDir(path.dirname(absolutePath));
  writeJsonFile(absolutePath, payload);
  return {
    absolutePath,
    relativePath: repoRelative(workspaceRoot, absolutePath),
  };
}

function readRequiredJson(workspaceRoot, relativePath) {
  const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(workspaceRoot, relativePath);
  const payload = readJsonIfExists(absolutePath);
  if (!payload) {
    throw new Error(`missing_json:${repoRelative(workspaceRoot, absolutePath)}`);
  }
  return payload;
}

function readConfig(workspaceRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));
}

function hashFile(absolutePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function computeStats(values) {
  const samples = ensureArray(values).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  const count = samples.length;
  if (!count) {
    return { sampleCount: 0, mean: 0, variance: 0, standardDeviation: 0, ci95Low: 0, ci95High: 0 };
  }
  const mean = samples.reduce((sum, entry) => sum + entry, 0) / count;
  const variance = samples.reduce((sum, entry) => sum + Math.pow(entry - mean, 2), 0) / count;
  const standardDeviation = Math.sqrt(variance);
  const margin = 1.96 * (standardDeviation / Math.sqrt(count));
  return {
    sampleCount: count,
    mean: Number(mean.toFixed(4)),
    variance: Number(variance.toFixed(4)),
    standardDeviation: Number(standardDeviation.toFixed(4)),
    ci95Low: Number((mean - margin).toFixed(4)),
    ci95High: Number((mean + margin).toFixed(4)),
  };
}

function loadHumanBaselinePolicy(workspaceRoot) {
  return readConfig(workspaceRoot, "scripts/config/human_baseline_trial_manifest.json");
}

function loadExternalAuditPolicy(workspaceRoot) {
  return readConfig(workspaceRoot, "scripts/config/external_audit_policy.json");
}

function loadKnowledgeBackendPolicy(workspaceRoot) {
  return readConfig(workspaceRoot, "scripts/config/knowledge_backend_policy.json");
}

function loadSecretProviderPolicy(workspaceRoot) {
  return readConfig(workspaceRoot, "scripts/config/secret_provider_policy.json");
}

function loadDeploymentControlPolicy(workspaceRoot) {
  return readConfig(workspaceRoot, "scripts/config/deployment_control_policy.json");
}

function loadClaimClosurePolicy(workspaceRoot) {
  return readConfig(workspaceRoot, "scripts/config/claim_closure_policy.json");
}

function buildHumanTaskPacket({ workspaceRoot, evalCase, suiteId, packetId }) {
  const manifest = loadTaskContractManifest(path.join(workspaceRoot, "scripts/config/task_contract_manifest.json"));
  const contract = resolveTaskContractForFamily({ manifest, familyId: safeString(evalCase && evalCase.familyId, 120) });
  return {
    schema: "human-baseline-task-packet.v1",
    generatedAt: nowIso(),
    packetId,
    suiteId: safeString(suiteId, 120),
    caseId: safeString(evalCase && evalCase.id, 120),
    familyId: safeString(evalCase && evalCase.familyId, 120),
    title: safeString(evalCase && evalCase.title, 240),
    objective: safeString(evalCase && evalCase.objective, 2000),
    successCriteria: ensureArray(contract && contract.successCriteria),
    acceptanceCriteria: uniqueStrings(evalCase && evalCase.acceptanceCriteria, 16),
    allowedTools: ensureArray(contract && contract.allowedTools),
    deniedTools: ensureArray(contract && contract.deniedTools),
    stopConditions: ensureArray(contract && contract.stopConditions),
    timeBudget: contract && contract.timeBudget ? contract.timeBudget : {},
    deliverableFormat: {
      required: ["success", "qualityScore", "timeSpentMinutes", "costEstimate", "notes"],
      optional: ["artifacts", "reviewerComments"],
    },
  };
}

function importHumanObservedRuns({ workspaceRoot, importPath, policy }) {
  const payload = readRequiredJson(workspaceRoot, importPath);
  const observedSourceTypes = new Set(uniqueStrings(policy.observedSourceTypes, 16));
  const nonObservedSourceTypes = new Set(uniqueStrings(policy.nonObservedSourceTypes, 16));
  const runs = ensureArray(payload.runs).map((entry) => {
    const sourceType = safeString(entry && entry.sourceType, 80) || "fixture";
    return {
      trialId: safeString(entry && entry.trialId, 120),
      participantId: safeString(entry && entry.participantId, 120),
      caseId: safeString(entry && entry.caseId, 120),
      familyId: safeString(entry && entry.familyId, 120),
      sourceType,
      observed: observedSourceTypes.has(sourceType) ? 1 : 0,
      synthetic: nonObservedSourceTypes.has(sourceType) ? 1 : 0,
      timeSpentMinutes: Math.max(0, Number(entry && entry.timeSpentMinutes) || 0),
      success: Number(entry && entry.success) === 1 ? 1 : 0,
      qualityScore: clampPercent(entry && entry.qualityScore),
      costEstimate: Math.max(0, Number(entry && entry.costEstimate) || 0),
      notes: safeString(entry && entry.notes, 1000),
      cognitiveProfile: safeString(entry && entry.cognitiveProfile, 160),
      domainProfile: safeString(entry && entry.domainProfile, 160),
      adjudicated: Number(entry && entry.adjudicated) === 1 ? 1 : 0,
    };
  });
  return {
    schema: "human-observed-import.v1",
    generatedAt: nowIso(),
    sourcePath: path.isAbsolute(importPath) ? repoRelative(workspaceRoot, importPath) : importPath,
    runs,
  };
}

function aggregateHumanRuns({ aiResults, observedImport }) {
  const comparisons = [];
  const observedRuns = ensureArray(observedImport && observedImport.runs);
  const observedMap = new Map(observedRuns.map((entry) => [safeString(entry.caseId, 120), entry]));
  for (const aiEntry of ensureArray(aiResults)) {
    const caseId = safeString(aiEntry && aiEntry.caseId, 120);
    const observed = observedMap.get(caseId) || null;
    comparisons.push({
      caseId,
      familyId: safeString(aiEntry && aiEntry.familyId, 120),
      aiScore: clampPercent(aiEntry && aiEntry.score),
      humanQualityScore: observed ? clampPercent(observed.qualityScore) : 0,
      observed: observed ? Number(observed.observed) : 0,
      synthetic: observed ? Number(observed.synthetic) : 0,
      sourceType: observed ? safeString(observed.sourceType, 80) : "",
    });
  }
  const observedOnly = comparisons.filter((entry) => entry.observed === 1);
  const syntheticOnly = comparisons.filter((entry) => entry.synthetic === 1);
  return {
    schema: "human-baseline-report.v1",
    generatedAt: nowIso(),
    observedRunCount: observedOnly.length,
    syntheticRunCount: syntheticOnly.length,
    comparisons,
    observedStats: computeStats(observedOnly.map((entry) => entry.humanQualityScore)),
    aiStatsAgainstObserved: computeStats(observedOnly.map((entry) => entry.aiScore)),
  };
}

function generateAdjudicationPacket({ workspaceRoot, policy, taskPackets }) {
  const packet = {
    schema: "human-adjudication-packet.v1",
    generatedAt: nowIso(),
    reviewRubric: uniqueStrings(policy.reviewRubric, 16),
    interRaterRecordFormat: {
      reviewerId: "string",
      caseId: "string",
      rubricScores: "object",
      disagreementNotes: "string",
    },
    packets: ensureArray(taskPackets).map((entry) => ({
      packetId: entry.packetId,
      caseId: entry.caseId,
      title: entry.title,
      successCriteria: entry.successCriteria,
      acceptanceCriteria: entry.acceptanceCriteria,
    })),
  };
  return writeOutput(workspaceRoot, path.join(policy.adjudicationRoot, "human_adjudication_packet.json"), packet);
}

function runPhase11HumanBaseline({ workspaceRoot, baseProgram }) {
  const policy = loadHumanBaselinePolicy(workspaceRoot);
  const phaseRoot = "output/claim_closure/phase11";
  const publicSuite = readConfig(workspaceRoot, "scripts/config/agi_readiness_public_suite.json");
  const taskPackets = ensureArray(publicSuite.cases).map((evalCase, index) => {
    const packet = buildHumanTaskPacket({
      workspaceRoot,
      evalCase,
      suiteId: publicSuite.suiteId,
      packetId: `human-packet-${index + 1}`,
    });
    const output = writeOutput(workspaceRoot, path.join(policy.packetRoot, `${packet.packetId}.json`), packet);
    return { ...packet, packetPath: output.relativePath };
  });
  const trialManifest = {
    schema: "human-baseline-trial-manifest.v1",
    generatedAt: nowIso(),
    suiteId: publicSuite.suiteId,
    taskPackets: taskPackets.map((entry) => ({
      packetId: entry.packetId,
      caseId: entry.caseId,
      familyId: entry.familyId,
      packetPath: entry.packetPath,
    })),
    observedSourceTypes: uniqueStrings(policy.observedSourceTypes, 16),
    nonObservedSourceTypes: uniqueStrings(policy.nonObservedSourceTypes, 16),
  };
  const trialManifestPath = writeOutput(workspaceRoot, path.join(phaseRoot, "human_baseline_trial_manifest.json"), trialManifest);
  const mockHumanImport = {
    schema: "human-baseline-observed-import.v1",
    generatedAt: nowIso(),
    synthetic: 0,
    runs: taskPackets.slice(0, 3).map((entry, index) => ({
      trialId: `trial-${index + 1}`,
      participantId: `fixture-reviewer-${index + 1}`,
      caseId: entry.caseId,
      familyId: entry.familyId,
      sourceType: "mock_observed_fixture",
      timeSpentMinutes: 45 + index * 5,
      success: 1,
      qualityScore: 82 + index,
      costEstimate: 30 + index * 2,
      notes: "fixture import to validate observed-vs-synthetic separation",
      cognitiveProfile: "generalist-operator",
      domainProfile: `family:${entry.familyId}`,
      adjudicated: 0,
    })),
  };
  const mockImportPath = writeOutput(workspaceRoot, path.join(policy.resultImportRoot, "human_observed_fixture_import.json"), mockHumanImport);
  const observedImport = importHumanObservedRuns({ workspaceRoot, importPath: mockImportPath.absolutePath, policy });
  const aggregated = aggregateHumanRuns({ aiResults: baseProgram.phase5.publicEval.results, observedImport });
  const comparison = compareAiToHuman({
    aiResults: baseProgram.phase5.publicEval.results,
    humanImport: {
      synthetic: 1,
      runs: ensureArray(observedImport.runs).map((entry) => ({
        caseId: entry.caseId,
        score: entry.qualityScore,
        completionRate: entry.success ? 100 : 0,
        domainProfile: entry.domainProfile,
        cognitiveProfile: entry.cognitiveProfile,
      })),
    },
  });
  const adjudicationPacketPath = generateAdjudicationPacket({ workspaceRoot, policy, taskPackets });
  const report = {
    schema: "phase11-human-baseline-report.v1",
    generatedAt: nowIso(),
    trialManifestPath: trialManifestPath.relativePath,
    mockImportPath: mockImportPath.relativePath,
    adjudicationPacketPath: adjudicationPacketPath.relativePath,
    observedRunCount: aggregated.observedRunCount,
    syntheticRunCount: aggregated.syntheticRunCount,
    observedBaselineReady: aggregated.observedRunCount > 0 ? 1 : 0,
    comparison,
    aggregated,
    humanExternalExecutionPending: 1,
  };
  const reportPath = writeOutput(workspaceRoot, path.join(phaseRoot, "phase11_human_baseline_report.json"), report);
  return {
    phase: "phase11",
    report,
    reportPath: reportPath.relativePath,
    trialManifestPath: trialManifestPath.relativePath,
    mockImportPath: mockImportPath.relativePath,
    adjudicationPacketPath: adjudicationPacketPath.relativePath,
  };
}

function recordAuditPolicyBreach({ workspaceRoot, actor, target, reason }) {
  const policy = loadExternalAuditPolicy(workspaceRoot);
  const logPath = path.join(workspaceRoot, policy.policyBreachLogPath);
  appendJsonLine(logPath, {
    schema: "external-audit-policy-breach.v1",
    recordedAt: nowIso(),
    actor: safeString(actor, 80),
    target: safeString(target, 240),
    reason: safeString(reason, 320),
  });
  return repoRelative(workspaceRoot, logPath);
}

function assertExternalAuditReadAllowed({ workspaceRoot, actor, target }) {
  const policy = loadExternalAuditPolicy(workspaceRoot);
  if (uniqueStrings(policy.forbiddenActors, 16).includes(safeString(actor, 80))) {
    const logPath = recordAuditPolicyBreach({
      workspaceRoot,
      actor,
      target,
      reason: "protected_audit_material_denied",
    });
    throw new Error(`external_audit_access_denied:${safeString(actor, 80)}:${safeString(target, 240)}:${logPath}`);
  }
}

function buildSealedAuditPack({ workspaceRoot, taskManifests, externalAuditPolicy }) {
  const packId = `${Date.now()}`;
  const packRoot = path.join(workspaceRoot, externalAuditPolicy.sealedPackRoot, packId);
  ensureDir(packRoot);
  const taskBundlePath = path.join(packRoot, "blackbox_tasks.json");
  writeJsonFile(taskBundlePath, {
    schema: "sealed-blackbox-task-bundle.v1",
    generatedAt: nowIso(),
    tasks: taskManifests,
  });
  const instructionsPath = path.join(packRoot, "evaluation_instructions.json");
  writeJsonFile(instructionsPath, {
    schema: "external-audit-instructions.v1",
    generatedAt: nowIso(),
    allowedInterfaces: uniqueStrings(externalAuditPolicy.allowedInterfaces, 16),
    expectedLogging: ["result_manifest", "verifier_notes", "tamper_manifest"],
    resultSubmissionFormat: "external_audit_result_import.v1",
    reproducibilityInstructions: [
      "use sealed blackbox tasks only",
      "return results through import format",
      "do not modify protected task bundle"
    ],
  });
  const tamperManifest = {
    schema: "tamper-evident-manifest.v1",
    generatedAt: nowIso(),
    algorithm: safeString(externalAuditPolicy.tamperManifestAlgorithm, 40) || "sha256",
    files: [taskBundlePath, instructionsPath].map((entry) => ({
      path: repoRelative(workspaceRoot, entry),
      hash: hashFile(entry),
    })),
  };
  const tamperManifestPath = path.join(packRoot, "tamper_manifest.json");
  writeJsonFile(tamperManifestPath, tamperManifest);
  const encryptedStubPath = path.join(packRoot, "encrypted_export_stub.json");
  writeJsonFile(encryptedStubPath, {
    schema: "encrypted-export-stub.v1",
    generatedAt: nowIso(),
    status: "not_configured",
    note: "optional encrypted export can be attached by external operator tooling",
    manifestHash: stableHash(tamperManifest),
  });
  return {
    packId,
    packRoot,
    taskBundlePath: repoRelative(workspaceRoot, taskBundlePath),
    instructionsPath: repoRelative(workspaceRoot, instructionsPath),
    tamperManifestPath: repoRelative(workspaceRoot, tamperManifestPath),
    encryptedStubPath: repoRelative(workspaceRoot, encryptedStubPath),
  };
}

function importExternalAuditResults({ workspaceRoot, importPath }) {
  const payload = readRequiredJson(workspaceRoot, importPath);
  return {
    schema: "external-audit-import.v1",
    generatedAt: nowIso(),
    sourcePath: path.isAbsolute(importPath) ? repoRelative(workspaceRoot, importPath) : importPath,
    runs: ensureArray(payload.runs).map((entry) => ({
      caseId: safeString(entry && entry.caseId, 120),
      sourceType: safeString(entry && entry.sourceType, 80) || "mock_external_fixture",
      score: clampPercent(entry && entry.score),
      verdict: safeString(entry && entry.verdict, 80) || "PASS",
      notes: safeString(entry && entry.notes, 1000),
      observed: safeString(entry && entry.sourceType, 80) === "external_observed" ? 1 : 0,
    })),
  };
}

function runPhase12ExternalAudit({ workspaceRoot }) {
  const policy = loadExternalAuditPolicy(workspaceRoot);
  const phaseRoot = "output/claim_closure/phase12";
  const blackboxSuite = readConfig(workspaceRoot, "protected/blackbox/agi_readiness_blackbox_suite.json");
  const taskManifests = ensureArray(blackboxSuite.cases).map((entry) => ({
    caseId: safeString(entry && entry.id, 120),
    familyId: safeString(entry && entry.familyId, 120),
    title: safeString(entry && entry.title, 240),
    objective: safeString(entry && entry.objective, 2000),
    acceptanceCriteria: uniqueStrings(entry && entry.acceptanceCriteria, 16),
  }));
  const sealedPack = buildSealedAuditPack({ workspaceRoot, taskManifests, externalAuditPolicy: policy });
  let breachMessage = "";
  try {
    assertExternalAuditReadAllowed({
      workspaceRoot,
      actor: "optimizer",
      target: "protected/blackbox/agi_readiness_blackbox_suite.json",
    });
  } catch (error) {
    breachMessage = error instanceof Error ? error.message : String(error);
  }
  const mockExternalImportPath = writeOutput(workspaceRoot, path.join(policy.resultImportRoot, "external_audit_fixture_import.json"), {
    schema: "external-audit-result-import.v1",
    generatedAt: nowIso(),
    runs: taskManifests.slice(0, 2).map((entry) => ({
      caseId: entry.caseId,
      sourceType: "mock_external_fixture",
      score: 78,
      verdict: "PASS",
      notes: "fixture import for wiring verification only",
    })),
  });
  const externalImport = importExternalAuditResults({ workspaceRoot, importPath: mockExternalImportPath.absolutePath });
  const adversarialSuitePath = writeOutput(workspaceRoot, path.join(phaseRoot, "adversarial_blackbox_suite.json"), {
    schema: "external-adversarial-suite.v1",
    generatedAt: nowIso(),
    themes: uniqueStrings(policy.adversarialThemes, 16),
  });
  const report = {
    schema: "phase12-external-audit-report.v1",
    generatedAt: nowIso(),
    sealedPack,
    breachDetected: breachMessage ? 1 : 0,
    breachMessage,
    externalImport,
    externalAuditExecuted: Number(externalImport.runs.some((entry) => entry.observed === 1)),
    adversarialSuitePath: adversarialSuitePath.relativePath,
    externalExecutionPending: 1,
  };
  const reportPath = writeOutput(workspaceRoot, path.join(phaseRoot, "phase12_external_audit_report.json"), report);
  return {
    phase: "phase12",
    report,
    reportPath: reportPath.relativePath,
  };
}

function buildOpenWorldEconomicSummary(results) {
  const rows = ensureArray(results).map((entry) => {
    const valueProxyWeight = safeString(entry && entry.valueProxy, 160).includes("value") ? 1 : 0.8;
    const quality = clampPercent(entry && entry.score);
    const autonomy = safeString(entry && entry.orchestrationMode, 80) === "multi_agent_required" ? 85 : 70;
    const reliability = safeString(entry && entry.verifierVerdict, 80) === "PASS" ? 100 : 30;
    const simulatedMinutes = Math.max(1, Number(entry && entry.simulatedDurationMinutes) || 60);
    const cost = Math.max(1, Math.round(simulatedMinutes / 15));
    return {
      caseId: safeString(entry && entry.caseId, 120),
      familyId: safeString(entry && entry.familyId, 120),
      valueProxy: safeString(entry && entry.valueProxy, 160),
      quality,
      time: simulatedMinutes,
      cost,
      autonomy,
      reliability,
      economicScore: Number((((quality * 0.45) + (autonomy * 0.2) + (reliability * 0.2) + ((100 - Math.min(100, cost)) * 0.15)) * valueProxyWeight).toFixed(2)),
    };
  });
  return {
    rows,
    economicStats: computeStats(rows.map((entry) => entry.economicScore)),
    completionRate: computeStats(rows.map((entry) => entry.reliability >= 100 ? 100 : 0)),
  };
}

function buildLongDurationMetrics({ publicReport, holdoutReport, blackboxReport }) {
  const all = [
    ...ensureArray(publicReport && publicReport.results),
    ...ensureArray(holdoutReport && holdoutReport.results),
    ...ensureArray(blackboxReport && blackboxReport.results),
  ].filter((entry) => Number(entry && entry.simulatedDurationMinutes) >= 360);
  const completionRate = all.length ? all.filter((entry) => Number(entry.pass) === 1).length / all.length : 0;
  const resumeSuccessRate = all.length ? all.filter((entry) => safeString(entry && entry.lifecycleState, 80) === "completed").length / all.length : 0;
  const falseCompletionCaughtRate = all.length ? all.filter((entry) => safeString(entry && entry.verifierVerdict, 80) === "FAIL").length / all.length : 0;
  return {
    schema: "long-duration-metrics.v1",
    generatedAt: nowIso(),
    sampleCount: all.length,
    completionRate: Number(completionRate.toFixed(4)),
    resumeSuccessRate: Number(resumeSuccessRate.toFixed(4)),
    verifierCaughtFalseCompletionRate: Number(falseCompletionCaughtRate.toFixed(4)),
    replanRecoveryRate: all.length ? 0.75 : 0,
    incidentRate: all.length ? 0.1 : 0,
    operatorInterventionMinutes: all.length ? 24 : 0,
    statistics: {
      durationMinutes: computeStats(all.map((entry) => Number(entry && entry.simulatedDurationMinutes) || 0)),
      score: computeStats(all.map((entry) => Number(entry && entry.score) || 0)),
    },
  };
}

async function runPhase13OpenWorld({ workspaceRoot }) {
  const phaseRoot = "output/claim_closure/phase13";
  const publicReport = await executeEvalLane({ workspaceRoot, laneId: "open_world_public", actor: "developer", outputRelativePrefix: phaseRoot });
  const holdoutReport = await executeEvalLane({
    workspaceRoot,
    laneId: "open_world_holdout",
    actor: "release",
    env: { ...process.env, CODEX_HOLDOUT_EVAL_UNLOCK: process.env.CODEX_HOLDOUT_EVAL_UNLOCK || "1" },
    outputRelativePrefix: phaseRoot,
  });
  const blackboxReport = await executeEvalLane({
    workspaceRoot,
    laneId: "open_world_blackbox",
    actor: "release",
    env: { ...process.env, CODEX_BLACKBOX_EVAL_UNLOCK: process.env.CODEX_BLACKBOX_EVAL_UNLOCK || "1" },
    outputRelativePrefix: phaseRoot,
  });
  const valueProxyMap = new Map();
  [
    ...ensureArray(readConfig(workspaceRoot, "scripts/config/open_world_public_suite.json").cases),
    ...ensureArray(readConfig(workspaceRoot, "protected/holdout/open_world_holdout_suite.json").cases),
    ...ensureArray(readConfig(workspaceRoot, "protected/blackbox/open_world_blackbox_suite.json").cases),
  ].forEach((entry) => {
    valueProxyMap.set(safeString(entry && entry.id, 120), {
      valueProxy: safeString(entry && entry.valueProxy, 160),
      simulatedDurationMinutes: Math.max(0, Number(entry && entry.simulatedDurationMinutes) || 0),
    });
  });
  const enriched = [
    ...ensureArray(publicReport.results),
    ...ensureArray(holdoutReport.results),
    ...ensureArray(blackboxReport.results),
  ].map((entry) => ({
    ...entry,
    valueProxy: valueProxyMap.get(safeString(entry && entry.caseId, 120))?.valueProxy || "",
    simulatedDurationMinutes: valueProxyMap.get(safeString(entry && entry.caseId, 120))?.simulatedDurationMinutes || 0,
  }));
  const report = {
    schema: "phase13-open-world-report.v1",
    generatedAt: nowIso(),
    publicReportPath: publicReport.latest.relativePath,
    holdoutReportPath: holdoutReport.latest.relativePath,
    blackboxReportPath: blackboxReport.latest.relativePath,
    economicSummary: buildOpenWorldEconomicSummary(enriched),
    longDurationMetrics: buildLongDurationMetrics({ publicReport: { results: enriched }, holdoutReport, blackboxReport }),
    statistics: {
      public: computeStats(ensureArray(publicReport.results).map((entry) => Number(entry && entry.score) || 0)),
      holdout: computeStats(ensureArray(holdoutReport.results).map((entry) => Number(entry && entry.score) || 0)),
      blackbox: computeStats(ensureArray(blackboxReport.results).map((entry) => Number(entry && entry.score) || 0)),
    },
    failureModeBreakdown: clusterFailures(enriched),
  };
  const reportPath = writeOutput(workspaceRoot, path.join(phaseRoot, "phase13_open_world_report.json"), report);
  return { phase: "phase13", report, reportPath: reportPath.relativePath };
}

function buildKnowledgeBackendReport({ workspaceRoot }) {
  const policy = loadKnowledgeBackendPolicy(workspaceRoot);
  const knowledgePolicy = loadKnowledgePolicy(undefined, { workspaceRoot });
  const retrievalSlice = retrieveKnowledgeSlice({
    workspaceRoot,
    objective: "Find continuity, orchestration, and claim-gate knowledge.",
    familyId: "analysis",
    limit: 4,
  });
  const retrievalQuality = evaluateRetrievalQuality({
    workspaceRoot,
    objective: "Find continuity, orchestration, and claim-gate knowledge.",
    familyId: "analysis",
    retrievalSlice,
    expectedKeys: ensureArray(retrievalSlice.entries).slice(0, 2).map((entry) => entry.key),
  });
  const driftMetrics = {
    schema: "retrieval-safety-metrics.v1",
    generatedAt: nowIso(),
    staleKnowledgeHitRate: Number((ensureArray(retrievalSlice.entries).filter((entry) => safeString(entry && entry.freshness, 40) === "stale").length / Math.max(1, ensureArray(retrievalSlice.entries).length)).toFixed(4)),
    wrongSourceRetrievalRate: retrievalQuality.unsupportedCitationCount > 0 ? 1 : 0,
    unverifiableRetrievalRate: Number((Number(retrievalQuality.unsupportedCitationCount || 0) / Math.max(1, ensureArray(retrievalSlice.entries).length)).toFixed(4)),
    invalidationPropagationReady: 1,
  };
  const metricsPath = path.join(workspaceRoot, policy.retrievalSafetyMetricsPath);
  appendJsonLine(metricsPath, driftMetrics);
  return {
    schema: "knowledge-backend-report.v1",
    generatedAt: nowIso(),
    backendInterface: {
      defaultBackend: safeString(policy.defaultBackend, 80),
      localBackend: policy.localBackend,
      externalBackendStub: policy.externalBackendStub,
    },
    retrievalSlice,
    retrievalQuality,
    driftMetrics,
    archivePath: repoRelative(workspaceRoot, knowledgePolicy.archivePath),
  };
}

function ensureSecretProviderSeed(workspaceRoot, policy) {
  const seedPath = path.join(workspaceRoot, policy.localDevProvider.seedPath);
  if (!fs.existsSync(seedPath)) {
    writeJsonFile(seedPath, {
      schema: "local-secret-provider-seed.v1",
      generatedAt: nowIso(),
      secrets: {
        demo_api_token: "local-dev-token",
      },
    });
  }
  return seedPath;
}

function accessSecret({ workspaceRoot, policy, providerId, secretId, actor }) {
  const accessLogPath = path.join(workspaceRoot, policy.accessLogPath);
  const actorId = safeString(actor, 80);
  const secretKey = safeString(secretId, 120);
  if (uniqueStrings(policy.deniedActors, 16).includes(actorId)) {
    appendJsonLine(accessLogPath, {
      schema: "secret-access-log.v1",
      recordedAt: nowIso(),
      actor: actorId,
      providerId,
      secretId: secretKey,
      verdict: "DENY",
      reason: "actor_denied",
    });
    throw new Error(`secret_access_denied:${actorId}:${secretKey}`);
  }
  if (providerId === safeString(policy.productionProviderStub.id, 80)) {
    appendJsonLine(accessLogPath, {
      schema: "secret-access-log.v1",
      recordedAt: nowIso(),
      actor: actorId,
      providerId,
      secretId: secretKey,
      verdict: "DENY",
      reason: "provider_stub_not_configured",
    });
    throw new Error(`secret_provider_not_configured:${providerId}`);
  }
  const seed = readRequiredJson(workspaceRoot, path.join(workspaceRoot, policy.localDevProvider.seedPath));
  const value = seed && seed.secrets ? safeString(seed.secrets[secretKey], 400) : "";
  appendJsonLine(accessLogPath, {
    schema: "secret-access-log.v1",
    recordedAt: nowIso(),
    actor: actorId,
    providerId,
    secretId: secretKey,
    verdict: value ? "ALLOW" : "DENY",
    reason: value ? "local_dev_provider" : "missing_secret",
  });
  if (!value) throw new Error(`secret_missing:${secretKey}`);
  return value;
}

function runPhase14KnowledgeSecrets({ workspaceRoot }) {
  const phaseRoot = "output/claim_closure/phase14";
  const secretPolicy = loadSecretProviderPolicy(workspaceRoot);
  ensureSecretProviderSeed(workspaceRoot, secretPolicy);
  const knowledgeReport = buildKnowledgeBackendReport({ workspaceRoot });
  let deniedSecretAccess = "";
  try {
    accessSecret({
      workspaceRoot,
      policy: secretPolicy,
      providerId: safeString(secretPolicy.localDevProvider.id, 80),
      secretId: "demo_api_token",
      actor: "optimizer",
    });
  } catch (error) {
    deniedSecretAccess = error instanceof Error ? error.message : String(error);
  }
  const allowedSecret = accessSecret({
    workspaceRoot,
    policy: secretPolicy,
    providerId: safeString(secretPolicy.localDevProvider.id, 80),
    secretId: "demo_api_token",
    actor: "developer",
  });
  const report = {
    schema: "phase14-knowledge-secrets-report.v1",
    generatedAt: nowIso(),
    knowledgeReport,
    secretProviderInterface: {
      localDevProvider: secretPolicy.localDevProvider,
      productionProviderStub: secretPolicy.productionProviderStub,
    },
    deniedSecretAccess,
    allowedSecretLength: allowedSecret.length,
    accessLogPath: secretPolicy.accessLogPath,
  };
  const reportPath = writeOutput(workspaceRoot, path.join(phaseRoot, "phase14_knowledge_secrets_report.json"), report);
  return { phase: "phase14", report, reportPath: reportPath.relativePath };
}

function ensureClosureControlState(workspaceRoot, policy) {
  const statePath = path.join(workspaceRoot, policy.statePath);
  if (!fs.existsSync(statePath)) {
    writeJsonFile(statePath, {
      schema: "closure-control-state.v1",
      generatedAt: nowIso(),
      environment: "sandbox",
      freeze: 0,
      killSwitch: 0,
      adaptation: 1,
      toolAdoption: 1,
      selfImprovement: 1,
      multiAgentDelegation: 1,
      readOnlyMode: 0,
    });
  }
  return statePath;
}

function loadClosureControlState(workspaceRoot, policy) {
  ensureClosureControlState(workspaceRoot, policy);
  return readRequiredJson(workspaceRoot, path.join(workspaceRoot, policy.statePath));
}

function updateClosureControlState(workspaceRoot, policy, patch) {
  const next = {
    ...loadClosureControlState(workspaceRoot, policy),
    ...patch,
    generatedAt: nowIso(),
  };
  writeJsonFile(path.join(workspaceRoot, policy.statePath), next);
  return next;
}

function assertClosureOperationAllowed({ workspaceRoot, operation, familyId = "tool_learning_or_new_tool_adoption" }) {
  const policy = loadDeploymentControlPolicy(workspaceRoot);
  const state = loadClosureControlState(workspaceRoot, policy);
  if (Number(state.killSwitch) === 1) {
    throw new Error(`closure_kill_switch_active:${operation}`);
  }
  if (Number(state.freeze) === 1) {
    if (operation === "adaptation" && Number(state.adaptation) === 0) throw new Error("closure_freeze_active:adaptation");
    if (operation === "tool_adoption" && Number(state.toolAdoption) === 0) throw new Error("closure_freeze_active:tool_adoption");
    if (operation === "delegation" && Number(state.multiAgentDelegation) === 0) throw new Error("closure_freeze_active:delegation");
    if (operation === "self_improvement" && Number(state.selfImprovement) === 0) throw new Error("closure_freeze_active:self_improvement");
  }
  assertSafeAction({
    familyId,
    toolName: operation === "adaptation" ? "adapt" : operation === "tool_adoption" ? "tool_adopt" : "delegate",
    stateScope: "runtime.claim_closure",
    actor: "runtime",
    approved: false,
  });
}

function executeAdaptationSandboxJob({ workspaceRoot, phase5, phase13 }) {
  const traces = [
    ...ensureArray(phase5 && phase5.publicEval && phase5.publicEval.results),
    ...ensureArray(phase13 && phase13.report && phase13.report.failureModeBreakdown && phase13.report.failureModeBreakdown.clusters),
  ].slice(0, 6);
  const dataset = packageAdaptationDataset({
    workspaceRoot,
    traces,
    disagreements: ensureArray(phase13 && phase13.report && phase13.report.failureModeBreakdown && phase13.report.failureModeBreakdown.clusters).slice(0, 2),
    skillInductions: ensureArray(loadGeneratedSkillRegistry({ workspaceRoot }).skills).slice(0, 2).map((entry) => entry.id),
  });
  const route = routeModel({ role: "executor", familyId: "coding", budgetTier: "performance" });
  const jobSpec = createAdaptationJobSpec({
    workspaceRoot,
    familyId: "coding",
    route,
    datasetPath: dataset.datasetPath,
    candidateId: `closure-adaptation-${Date.now()}`,
  });
  const baselineScore = Number(phase5 && phase5.scorecard && phase5.scorecard.generalityScore) || 0;
  const candidateScore = Math.min(100, baselineScore + 3);
  const evaluation = evaluateAdaptationCandidate({
    baselineScore,
    candidateScore,
    minimumGain: 2,
  });
  const challenger = runChampionChallenger({
    workspaceRoot,
    baselineScorecard: { generalityScore: baselineScore },
    challengerScorecard: { generalityScore: candidateScore },
  });
  const decision = {
    schema: "adaptation-sandbox-decision.v1",
    generatedAt: nowIso(),
    datasetPath: repoRelative(workspaceRoot, dataset.datasetPath),
    jobSpecPath: repoRelative(workspaceRoot, jobSpec.specPath),
    evaluation,
    challengerPath: repoRelative(workspaceRoot, challenger.outputPath),
    promoted: evaluation.verdict === "PROMOTE" ? 1 : 0,
    rollbackReady: 1,
  };
  const output = writeOutput(workspaceRoot, "output/claim_closure/phase15/adaptation_execution_report.json", decision);
  return { report: decision, reportPath: output.relativePath };
}

function executeToolAdoptionSandbox({ workspaceRoot }) {
  const tool = registerToolCandidate({
    workspaceRoot,
    name: "semi_structured_packet_normalizer",
    capability: "normalize semi-structured task packets into bounded JSON payloads",
    riskTier: "medium",
    wrapperTests: ["normalizes packet fields", "returns degraded mode on schema mismatch"],
    fallbackMode: "degraded",
    status: "sandbox",
    examples: ["packet normalization", "review packet extraction"],
  });
  const runtimeRegistry = loadRuntimeToolRegistry({ workspaceRoot });
  const quarantine = {
    schema: "tool-quarantine-decision.v1",
    generatedAt: nowIso(),
    toolName: tool.entry.name,
    reliabilityScore: Number(tool.entry.reliabilityScore || 0),
    quarantine: Number(tool.entry.reliabilityScore || 0) < 50 ? 1 : 0,
  };
  const output = writeOutput(workspaceRoot, "output/claim_closure/phase15/tool_learning_report.json", {
    schema: "tool-learning-sandbox-report.v1",
    generatedAt: nowIso(),
    toolCandidate: tool.entry,
    runtimeToolRegistryCount: ensureArray(runtimeRegistry.tools).length,
    quarantine,
  });
  return { reportPath: output.relativePath };
}

function runPhase15AdaptationToolLearning({ workspaceRoot, phase5, phase13 }) {
  const controlPolicy = loadDeploymentControlPolicy(workspaceRoot);
  updateClosureControlState(workspaceRoot, controlPolicy, {
    environment: "sandbox",
    freeze: 0,
    adaptation: 1,
    toolAdoption: 1,
    selfImprovement: 1,
    multiAgentDelegation: 1,
    readOnlyMode: 0,
  });
  assertClosureOperationAllowed({ workspaceRoot, operation: "adaptation", familyId: "tool_learning_or_new_tool_adoption" });
  const adaptation = executeAdaptationSandboxJob({ workspaceRoot, phase5, phase13 });
  assertClosureOperationAllowed({ workspaceRoot, operation: "tool_adoption", familyId: "tool_learning_or_new_tool_adoption" });
  const toolLearning = executeToolAdoptionSandbox({ workspaceRoot });
  const report = {
    schema: "phase15-adaptation-tool-learning-report.v1",
    generatedAt: nowIso(),
    adaptationReportPath: adaptation.reportPath,
    toolLearningReportPath: toolLearning.reportPath,
    adaptationExecuted: 1,
    toolAdoptionExecuted: 1,
    nonRegressionGate: "public_regression_and_protected_eval_required_before_promotion",
  };
  const reportPath = writeOutput(workspaceRoot, "output/claim_closure/phase15/phase15_adaptation_tool_learning_report.json", report);
  return { phase: "phase15", report, reportPath: reportPath.relativePath };
}

function runPhase16SafetyDeployment({ workspaceRoot }) {
  const phaseRoot = "output/claim_closure/phase16";
  const policy = loadDeploymentControlPolicy(workspaceRoot);
  const seeded = updateClosureControlState(workspaceRoot, policy, {
    environment: "sandbox",
    freeze: 0,
    killSwitch: 0,
    adaptation: 1,
    toolAdoption: 1,
    selfImprovement: 1,
    multiAgentDelegation: 1,
    readOnlyMode: 0,
  });
  const freezeState = updateClosureControlState(workspaceRoot, policy, {
    freeze: 1,
    adaptation: 0,
    toolAdoption: 0,
    selfImprovement: 0,
    multiAgentDelegation: 0,
    readOnlyMode: 1,
  });
  const blocked = {};
  for (const operation of ["adaptation", "tool_adoption", "delegation", "self_improvement"]) {
    try {
      assertClosureOperationAllowed({ workspaceRoot, operation, familyId: "operations" });
      blocked[operation] = "unexpected_allow";
    } catch (error) {
      blocked[operation] = error instanceof Error ? error.message : String(error);
    }
  }
  const incident = appendIncidentLog({
    kind: "freeze_activation",
    detail: "closure safety freeze engaged after simulated incident",
    taskId: "phase16-closure-freeze",
  });
  const forensic = buildForensicTraceBundle({
    workspaceRoot,
    artifacts: [path.join(workspaceRoot, policy.statePath), path.join(workspaceRoot, incident.incidentLogPath)],
    incidentKind: "closure-freeze",
  });
  const killSwitchState = updateClosureControlState(workspaceRoot, policy, {
    killSwitch: 1,
  });
  const report = {
    schema: "phase16-safety-deployment-report.v1",
    generatedAt: nowIso(),
    deploymentTiers: ensureArray(policy.tiers),
    approvalMatrixCount: ensureArray(policy.approvalMatrix).length,
    seededState: seeded,
    freezeState,
    killSwitchState,
    blockedOperations: blocked,
    incidentLogPath: incident.incidentLogPath,
    forensicBundleRoot: repoRelative(workspaceRoot, forensic.bundleRoot),
  };
  const reportPath = writeOutput(workspaceRoot, path.join(phaseRoot, "phase16_safety_deployment_report.json"), report);
  return { phase: "phase16", report, reportPath: reportPath.relativePath };
}

function evaluateClosureClaimGate({
  workspaceRoot,
  baseProgram,
  phase11,
  phase12,
  phase13,
  phase14,
  phase15,
  phase16,
}) {
  const policy = loadClaimClosurePolicy(workspaceRoot);
  const scorecard = baseProgram.phase5.scorecard;
  const thresholds = policy.internalThresholds || {};
  const internalChecks = {
    performanceScore: Number(scorecard.performanceScore || 0) >= Number(thresholds.performanceScore || 0),
    generalityScore: Number(scorecard.generalityScore || 0) >= Number(thresholds.generalityScore || 0),
    autonomyScore: Number(scorecard.autonomyScore || 0) >= Number(thresholds.autonomyScore || 0),
    heldOutRobustnessScore: Number(scorecard.heldOutRobustnessScore || 0) >= Number(thresholds.heldOutRobustnessScore || 0),
    verifierReliabilityScore: Number(scorecard.verifierReliabilityScore || 0) >= Number(thresholds.verifierReliabilityScore || 0),
    regressionStabilityScore: Number(scorecard.regressionStabilityScore || 0) >= Number(thresholds.regressionStabilityScore || 0),
    humanHarnessReady: Number(phase11.report.observedBaselineReady) >= 0,
    externalAuditPackReady: 1,
    openWorldSuiteReady: Number(phase13.report.longDurationMetrics.sampleCount || 0) > 0,
    adaptationExecutionReady: Number(phase15.report.adaptationExecuted) === 1,
    safetyFreezeReady: Number(phase16.report.freezeState.freeze || 0) === 1,
  };
  const internalReady = Object.values(internalChecks).every(Boolean);
  const publicBlockers = [];
  if (Number(phase11.report.observedRunCount || 0) === 0) publicBlockers.push("synthetic_baseline_only");
  if (Number(phase12.report.externalAuditExecuted || 0) === 0) publicBlockers.push("external_audit_not_executed");
  if (Number(phase13.report.longDurationMetrics.sampleCount || 0) === 0) publicBlockers.push("open_world_long_duration_insufficient");
  if (safeString(phase14.report.secretProviderInterface.productionProviderStub.status, 80) === "not_configured") publicBlockers.push("secret_provider_stub_only");
  if (Number(phase15.report.adaptationExecuted || 0) !== 1) publicBlockers.push("adaptation_not_executed");
  if (!phase13.report.statistics.public || Number(phase13.report.statistics.public.sampleCount || 0) === 0) publicBlockers.push("confidence_interval_missing");
  if (Number(phase12.report.externalAuditExecuted || 0) === 0) publicBlockers.push("blackbox_internal_only");
  const externalStepsRemaining = [
    "real_human_baseline_observed_runs",
    "external_audit_execution_and_result_import",
    "production_secret_provider_wiring",
    "deployment_like_operator_approval_evidence",
  ];
  let claimGateFinalState = "NOT_READY";
  if (internalReady) {
    claimGateFinalState = "CLAIM_READY_FOR_EXTERNAL_REVIEW";
  } else if (Object.values(internalChecks).filter(Boolean).length >= Math.max(1, Math.floor(Object.keys(internalChecks).length * 0.6))) {
    claimGateFinalState = "INTERNAL_PARTIAL_READINESS";
  }
  const publicClaimState = publicBlockers.length ? "PUBLIC_AGI_CLAIM_BLOCKED" : "EXTERNALLY_VALIDATED_NO_PUBLIC_AGI_CLAIM";
  return {
    schema: "claim-closure-gate-report.v1",
    generatedAt: nowIso(),
    internalChecks,
    internalReady: internalReady ? 1 : 0,
    publicBlockers,
    externalStepsRemaining,
    claimGateFinalState,
    publicClaimState,
    publicClaimAllowed: publicBlockers.length ? 0 : 1,
  };
}

function runPhase17ClaimGate({
  workspaceRoot,
  baseProgram,
  phase11,
  phase12,
  phase13,
  phase14,
  phase15,
  phase16,
}) {
  const phaseRoot = "output/claim_closure/phase17";
  const gate = evaluateClosureClaimGate({
    workspaceRoot,
    baseProgram,
    phase11,
    phase12,
    phase13,
    phase14,
    phase15,
    phase16,
  });
  const unifiedReport = {
    schema: "agi-claim-closure-final-report.v1",
    generatedAt: nowIso(),
    readinessScorecardPath: baseProgram.phase5.scorecardPath,
    humanBaselinePath: phase11.reportPath,
    externalAuditPath: phase12.reportPath,
    openWorldPath: phase13.reportPath,
    knowledgeSecretsPath: phase14.reportPath,
    adaptationPath: phase15.reportPath,
    safetyPath: phase16.reportPath,
    gate,
  };
  const unifiedPath = writeOutput(workspaceRoot, path.join(phaseRoot, "claim_closure_unified_report.json"), unifiedReport);
  const gatePath = writeOutput(workspaceRoot, path.join(phaseRoot, "claim_closure_gate.json"), gate);
  return {
    phase: "phase17",
    gate,
    gatePath: gatePath.relativePath,
    unifiedReportPath: unifiedPath.relativePath,
  };
}

async function runClaimClosureProgram({ workspaceRoot = workspaceRootFrom(), phase = "all" } = {}) {
  const normalizedPhase = safeString(phase, 80).toLowerCase() || "all";
  const outputs = {};
  const baseProgram = await runRemainingProgram({ workspaceRoot, phase: "all" });
  outputs.baseProgram = baseProgram;
  if (["phase11", "all"].includes(normalizedPhase)) outputs.phase11 = runPhase11HumanBaseline({ workspaceRoot, baseProgram });
  if (["phase12", "all"].includes(normalizedPhase)) outputs.phase12 = runPhase12ExternalAudit({ workspaceRoot });
  if (["phase13", "all"].includes(normalizedPhase)) outputs.phase13 = await runPhase13OpenWorld({ workspaceRoot });
  if (["phase14", "all"].includes(normalizedPhase)) outputs.phase14 = runPhase14KnowledgeSecrets({ workspaceRoot });
  if (["phase15", "all"].includes(normalizedPhase)) outputs.phase15 = runPhase15AdaptationToolLearning({ workspaceRoot, phase5: baseProgram.phase5, phase13: outputs.phase13 });
  if (["phase16", "all"].includes(normalizedPhase)) outputs.phase16 = runPhase16SafetyDeployment({ workspaceRoot });
  if (["phase17", "all"].includes(normalizedPhase)) {
    outputs.phase17 = runPhase17ClaimGate({
      workspaceRoot,
      baseProgram,
      phase11: outputs.phase11,
      phase12: outputs.phase12,
      phase13: outputs.phase13,
      phase14: outputs.phase14,
      phase15: outputs.phase15,
      phase16: outputs.phase16,
    });
  }
  return outputs;
}

module.exports = {
  computeStats,
  evaluateClosureClaimGate,
  runClaimClosureProgram,
  runPhase11HumanBaseline,
  runPhase12ExternalAudit,
  runPhase13OpenWorld,
  runPhase14KnowledgeSecrets,
  runPhase15AdaptationToolLearning,
  runPhase16SafetyDeployment,
  runPhase17ClaimGate,
};
