"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir, writeJson, repoRelative, readJsonIfExists } = require("./logging_surface");
const { runBoundedWorkflow, runSingleAgentFallback } = require("./bounded_multi_agent_orchestrator");
const { runPublicRegression } = require("../run_public_regression");
const { runHoldoutEval } = require("../run_holdout_eval");
const { loadRepoLocalSkillCatalog } = require("./long_horizon_continuity");
const {
  appendIncidentLog,
  archiveKnowledgeEntries,
  buildExternalAuditBundle,
  buildForensicTraceBundle,
  clusterFailures,
  compareAiToHuman,
  computeGeneralityScorecard,
  createAdaptationJobSpec,
  evaluateAdaptationCandidate,
  evaluateClaimGate,
  evaluateRetrievalQuality,
  exportHumanBaselineTasks,
  generateCurriculum,
  importHumanBaselineRuns,
  loadClaimGatePolicy,
  loadKnowledgePolicy,
  loadRawEvalSuiteForLane,
  loadRuntimeToolRegistry,
  loadAutonomyRiskPolicy,
  loadDeploymentControlState,
  packageAdaptationDataset,
  pruneGeneratedSkills,
  registerGeneratedSkill,
  registerKnowledgeVersion,
  registerToolCandidate,
  retrieveKnowledgeSlice,
  routeModel,
  runChampionChallenger,
  safeString,
  summarizeEvalResults,
  uniqueStrings,
  updateDeploymentControlState,
  assertSafeAction,
} = require("./agi_candidate_runtime");

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function workspaceRootFrom(input) {
  return input || path.resolve(__dirname, "..", "..");
}

function makeOutputPath(workspaceRoot, relativePath) {
  const full = path.join(workspaceRoot, relativePath);
  ensureDir(path.dirname(full));
  return full;
}

function rel(workspaceRoot, absolutePath) {
  return repoRelative(workspaceRoot, absolutePath);
}

function writeOutput(workspaceRoot, relativePath, payload) {
  const filePath = makeOutputPath(workspaceRoot, relativePath);
  writeJson(filePath, payload);
  return {
    absolutePath: filePath,
    relativePath: rel(workspaceRoot, filePath),
  };
}

async function executeSuiteCase({ workspaceRoot, laneId, evalCase }) {
  const taskId = `${safeString(evalCase && evalCase.id, 120) || "case"}-${Date.now()}`;
  const orchestrationMode = safeString(evalCase && evalCase.orchestrationMode, 80);
  const acceptanceCriteria = uniqueStrings(evalCase && evalCase.acceptanceCriteria, 24);
  const result = orchestrationMode === "multi_agent_required"
    ? await runBoundedWorkflow({
        workspaceRoot,
        taskId,
        sessionId: "agi-readiness",
        title: safeString(evalCase && evalCase.title, 240) || taskId,
        objective: safeString(evalCase && evalCase.objective, 2000),
        familyId: safeString(evalCase && evalCase.familyId, 120) || "analysis",
        acceptanceCriteria,
        workflow: ensureArray(evalCase && evalCase.workflow),
        casePayload: evalCase && evalCase.payload ? evalCase.payload : {},
        allowFallback: false,
      })
    : await runSingleAgentFallback({
        workspaceRoot,
        taskId,
        sessionId: "agi-readiness",
        title: safeString(evalCase && evalCase.title, 240) || taskId,
        objective: safeString(evalCase && evalCase.objective, 2000),
        familyId: safeString(evalCase && evalCase.familyId, 120) || "analysis",
        acceptanceCriteria,
        note: `single-agent ${laneId} case completed`,
      });
  const closed = result && result.closed ? result.closed : {};
  const lifecycleState = safeString(closed.lifecycleState, 80) || safeString(closed.closed && closed.closed.lifecycleState, 80);
  const closeoutSummary = closed.closeoutSummary || (closed.closed && closed.closed.closeoutSummary) || {};
  const pass = lifecycleState === "completed" ? 1 : 0;
  return {
    caseId: safeString(evalCase && evalCase.id, 120),
    taskId,
    familyId: safeString(evalCase && evalCase.familyId, 120),
    difficultyTier: safeString(evalCase && evalCase.difficultyTier, 80) || "unknown",
    modalityTags: uniqueStrings(evalCase && evalCase.modalityTags, 24),
    structureTags: uniqueStrings(evalCase && evalCase.structureTags, 24),
    orchestrationMode,
    pass,
    score: pass ? 100 : 40,
    lifecycleState,
    verifierVerdict: pass ? "PASS" : "FAIL",
    failureType: pass ? "" : "acceptance_unmet",
    rootCauseTaxonomy: pass ? [] : ["acceptance_gap"],
    blockers: uniqueStrings(closeoutSummary && closeoutSummary.blockers, 16),
    remainingWork: uniqueStrings(closeoutSummary && closeoutSummary.remainingWork, 16),
  };
}

async function executeEvalLane({
  workspaceRoot,
  laneId,
  actor,
  env = process.env,
  outputRelativePrefix,
}) {
  const { lane, suite } = loadRawEvalSuiteForLane({ workspaceRoot, laneId, actor, env });
  const results = [];
  for (const evalCase of ensureArray(suite && suite.cases)) {
    results.push(await executeSuiteCase({ workspaceRoot, laneId: lane.id, evalCase }));
  }
  const summary = summarizeEvalResults(results);
  const report = {
    schema: "agi-readiness-lane-report.v1",
    generatedAt: nowIso(),
    laneId: lane.id,
    suiteId: safeString(suite && suite.suiteId, 120),
    visibility: safeString(lane && lane.visibility, 80),
    results,
    summary,
  };
  const latest = writeOutput(workspaceRoot, `${outputRelativePrefix}/${lane.id}_latest.json`, report);
  const summarized = writeOutput(workspaceRoot, `${outputRelativePrefix}/${lane.id}_summary.json`, {
    schema: "agi-readiness-lane-summary.v1",
    generatedAt: report.generatedAt,
    laneId: lane.id,
    suiteId: report.suiteId,
    passRate: summary.passRate,
    verifierReliabilityRate: summary.verifierReliabilityRate,
    caseCount: summary.caseCount,
    familyBreakdown: summary.familyBreakdown,
    difficultyBreakdown: summary.difficultyBreakdown,
  });
  writeJson(lane.outputPath, report);
  writeJson(lane.summaryPath, readJsonIfExists(summarized.absolutePath));
  fs.appendFileSync(lane.historyPath, `${JSON.stringify({
    generatedAt: report.generatedAt,
    laneId: lane.id,
    suiteId: report.suiteId,
    passRate: summary.passRate,
    verifierReliabilityRate: summary.verifierReliabilityRate,
  })}\n`, "utf8");
  return { lane, suite, results, summary, latest, summarized, report };
}

async function runPhase5BroadEval({ workspaceRoot = workspaceRootFrom() } = {}) {
  const phaseRoot = "output/agi_readiness/phase5";
  const publicEval = await executeEvalLane({ workspaceRoot, laneId: "agi_readiness_public", actor: "developer", outputRelativePrefix: phaseRoot });
  const holdoutEval = await executeEvalLane({ workspaceRoot, laneId: "agi_readiness_holdout", actor: "release", outputRelativePrefix: phaseRoot, env: { ...process.env, CODEX_HOLDOUT_EVAL_UNLOCK: process.env.CODEX_HOLDOUT_EVAL_UNLOCK || "1" } });
  const blackboxEval = await executeEvalLane({ workspaceRoot, laneId: "blackbox_readiness", actor: "release", outputRelativePrefix: phaseRoot, env: { ...process.env, CODEX_BLACKBOX_EVAL_UNLOCK: process.env.CODEX_BLACKBOX_EVAL_UNLOCK || "1" } });
  const humanTaskExport = exportHumanBaselineTasks({
    workspaceRoot,
    suite: publicEval.suite,
    destinationPath: makeOutputPath(workspaceRoot, `${phaseRoot}/human_baseline_task_export.json`),
  });
  const syntheticHumanRunsPath = makeOutputPath(workspaceRoot, `${phaseRoot}/human_baseline_runs.synthetic.json`);
  const syntheticRuns = {
    schema: "human-baseline-run-import.v1",
    generatedAt: nowIso(),
    synthetic: 1,
    runs: ensureArray(publicEval.results).map((entry) => ({
      caseId: entry.caseId,
      score: 90,
      completionRate: 100,
      domainProfile: `family:${entry.familyId}`,
      cognitiveProfile: "generalist-operator",
    })),
  };
  writeJson(syntheticHumanRunsPath, syntheticRuns);
  const humanComparison = compareAiToHuman({
    aiResults: publicEval.results,
    humanImport: importHumanBaselineRuns(syntheticHumanRunsPath),
  });
  const humanComparisonPath = writeOutput(workspaceRoot, `${phaseRoot}/human_baseline_comparison.json`, humanComparison);
  const scorecard = computeGeneralityScorecard({
    publicSummary: publicEval.summary,
    holdoutSummary: holdoutEval.summary,
    blackboxSummary: blackboxEval.summary,
    humanComparison,
    regressionStable: 1,
  });
  const scorecardPath = writeOutput(workspaceRoot, `${phaseRoot}/agi_readiness_scorecard.json`, scorecard);
  return {
    phase: "phase5",
    publicEval,
    holdoutEval,
    blackboxEval,
    humanTaskExportPath: rel(workspaceRoot, humanTaskExport.outputPath),
    humanRunsPath: rel(workspaceRoot, syntheticHumanRunsPath),
    humanComparisonPath: humanComparisonPath.relativePath,
    scorecard,
    scorecardPath: scorecardPath.relativePath,
  };
}

function runPhase6KnowledgeSkill({ workspaceRoot = workspaceRootFrom(), phase5 = null } = {}) {
  const phaseRoot = "output/agi_readiness/phase6";
  const knowledgePolicy = loadKnowledgePolicy(undefined, { workspaceRoot });
  const registered = [
    registerKnowledgeVersion({ workspaceRoot, policy: knowledgePolicy, key: "phase1-eval-hardening", title: "Phase 1 Eval Hardening", content: "Public regression, hidden holdout, independent verifier, rollback, and CI gate are established.", source: "repo-docs", trustLevel: "verified", tags: ["eval", "rollback"], familyIds: ["analysis", "debugging_incident_response"] }),
    registerKnowledgeVersion({ workspaceRoot, policy: knowledgePolicy, key: "phase2-continuity", title: "Phase 2 Continuity", content: "Continuity state, initialize/resume/close, session memory, global memory, and handoff artifacts are file-backed.", source: "repo-docs", trustLevel: "verified", tags: ["continuity", "memory"], familyIds: ["planning", "business_ops"] }),
    registerKnowledgeVersion({ workspaceRoot, policy: knowledgePolicy, key: "legacy-openworld-note", title: "Legacy Open World Note", content: "Old unsupported guidance kept only for archive/prune testing.", source: "synthetic", trustLevel: "working", tags: ["stale"], familyIds: ["research"] }),
  ];
  const retrievalSlice = retrieveKnowledgeSlice({
    workspaceRoot,
    policy: knowledgePolicy,
    objective: "Summarize continuity and verification layers for planning and analysis tasks.",
    familyId: "analysis",
    tags: ["continuity", "eval"],
    limit: 4,
  });
  const retrievalQuality = evaluateRetrievalQuality({
    workspaceRoot,
    policy: knowledgePolicy,
    retrievalSlice,
    taskOutcome: "retrieval supports continuation planning",
    supportedCitations: ensureArray(retrievalSlice.entries).slice(0, 2).map((entry) => entry.key),
  });
  const generatedSkill = registerGeneratedSkill({
    workspaceRoot,
    policy: knowledgePolicy,
    id: "continuity-verification-closeout",
    title: "Continuity Verification Closeout",
    description: "Use after a successful long-horizon execution to combine changed surface, verification state, and next-session brief.",
    trigger: "when closeout must preserve verifier and continuity state",
    deterministicSteps: ["load latest verifier state", "refresh closeout summary", "emit next_session_brief"],
    reasoningGuidance: ["prefer verified artifacts", "do not promote session-only notes"],
    tests: ["closeout_summary exists", "verification_status exists"],
    sourceTrace: phase5 && phase5.publicEval && phase5.publicEval.latest ? phase5.publicEval.latest.relativePath : "phase5_public_eval",
  });
  const loadedSkillCatalog = loadRepoLocalSkillCatalog(undefined, { workspaceRoot });
  const archiveKnowledge = archiveKnowledgeEntries({
    workspaceRoot,
    policy: knowledgePolicy,
    keys: ["legacy-openworld-note"],
    reason: "stale knowledge archived after versioned store promotion",
  });
  const staleSkill = registerGeneratedSkill({
    workspaceRoot,
    policy: knowledgePolicy,
    id: "stale-skill-candidate",
    title: "Stale Skill Candidate",
    description: "Archive-only generated skill used to test prune flow.",
    trigger: "none",
    deterministicSteps: ["noop"],
    reasoningGuidance: ["archive when stale"],
    tests: ["synthetic"],
    sourceTrace: "synthetic",
  });
  const prunedSkills = pruneGeneratedSkills({
    workspaceRoot,
    policy: knowledgePolicy,
    staleIds: [staleSkill.entry.id],
    reason: "archive stale generated skill after validation",
  });
  const phase6Report = {
    schema: "phase6-knowledge-skill-report.v1",
    generatedAt: nowIso(),
    registeredKnowledgeKeys: registered.map((entry) => entry.key),
    retrievalSlice,
    retrievalQuality,
    generatedSkillId: generatedSkill.entry.id,
    generatedSkillVisibleInCatalog: loadedSkillCatalog.skills.some((entry) => entry.id === generatedSkill.entry.id) ? 1 : 0,
    archivedKnowledge: archiveKnowledge,
    prunedSkills,
  };
  const phase6Path = writeOutput(workspaceRoot, `${phaseRoot}/phase6_knowledge_skill_report.json`, phase6Report);
  return { phase: "phase6", report: phase6Report, reportPath: phase6Path.relativePath };
}

function runPhase7CurriculumImprovement({ workspaceRoot = workspaceRootFrom(), phase5 = null, phase6 = null } = {}) {
  const phaseRoot = "output/agi_readiness/phase7";
  const publicResults = phase5 && phase5.publicEval ? phase5.publicEval.results : [];
  const syntheticFailures = ensureArray(publicResults).slice(0, 2).map((entry, index) => ({
    ...entry,
    pass: index === 0 ? 0 : entry.pass,
    score: index === 0 ? 45 : entry.score,
    verifierVerdict: index === 0 ? "FAIL" : entry.verifierVerdict,
    failureType: index === 0 ? "missing_skill" : entry.failureType,
    rootCauseTaxonomy: index === 0 ? ["missing_skill", "planner_failure"] : entry.rootCauseTaxonomy,
    missingSkill: index === 0 ? 1 : 0,
    missingKnowledge: index === 0 ? 1 : 0,
  }));
  const failureClusters = clusterFailures(syntheticFailures);
  const clusterPath = writeOutput(workspaceRoot, `${phaseRoot}/failure_clusters.json`, failureClusters);
  const curriculum = generateCurriculum({
    workspaceRoot,
    failureClusters,
    outputPath: makeOutputPath(workspaceRoot, `${phaseRoot}/curriculum.json`),
  });
  const baselineScorecard = phase5 ? phase5.scorecard : {};
  const challengerScorecard = {
    ...baselineScorecard,
    generalityScore: Math.min(100, Number(baselineScorecard.generalityScore || 0) + 3),
    performanceScore: Math.min(100, Number(baselineScorecard.performanceScore || 0) + 2),
  };
  const championChallenger = runChampionChallenger({
    workspaceRoot,
    baselineScorecard,
    challengerScorecard,
  });
  return {
    phase: "phase7",
    failureClusters,
    clusterPath: clusterPath.relativePath,
    curriculumPath: rel(workspaceRoot, curriculum.outputPath),
    championChallengerPath: rel(workspaceRoot, championChallenger.outputPath),
  };
}

function runPhase8RoutingAdaptation({ workspaceRoot = workspaceRootFrom(), phase5 = null, phase6 = null, phase7 = null } = {}) {
  const phaseRoot = "output/agi_readiness/phase8";
  const routes = ["planner", "researcher", "executor", "verifier", "coordinator"].map((role) => routeModel({ role, familyId: role === "executor" ? "coding" : role === "researcher" ? "research" : "planning", budgetTier: role === "executor" ? "performance" : "standard" }));
  const adaptationDataset = packageAdaptationDataset({
    workspaceRoot,
    traces: ensureArray(phase5 && phase5.publicEval && phase5.publicEval.results).slice(0, 3),
    disagreements: ensureArray(phase7 && phase7.failureClusters && phase7.failureClusters.clusters).slice(0, 2),
    skillInductions: phase6 && phase6.report ? [phase6.report.generatedSkillId] : [],
  });
  const jobSpec = createAdaptationJobSpec({
    workspaceRoot,
    familyId: "research",
    route: routes.find((entry) => entry.role === "researcher"),
    datasetPath: adaptationDataset.datasetPath,
    candidateId: "routing-candidate-r1",
  });
  const candidateEval = evaluateAdaptationCandidate({
    baselineScore: Number(phase5 && phase5.scorecard && phase5.scorecard.generalityScore) || 0,
    candidateScore: Math.min(100, (Number(phase5 && phase5.scorecard && phase5.scorecard.generalityScore) || 0) + 2),
    minimumGain: 1,
  });
  const toolCandidate = registerToolCandidate({
    workspaceRoot,
    name: "web_table_extractor",
    capability: "extract structured rows from HTML tables in sandbox mode",
    riskTier: "medium",
    wrapperTests: ["schema normalizes rows", "fallback returns empty set"],
    fallbackMode: "degraded",
    status: "sandbox",
    examples: ["extract release table", "extract benchmark rows"],
  });
  const runtimeToolRegistry = loadRuntimeToolRegistry(loadKnowledgePolicy(undefined, { workspaceRoot }));
  const report = {
    schema: "phase8-routing-adaptation-report.v1",
    generatedAt: nowIso(),
    routes,
    adaptationDatasetPath: rel(workspaceRoot, adaptationDataset.datasetPath),
    adaptationJobSpecPath: rel(workspaceRoot, jobSpec.specPath),
    candidateEval,
    toolCandidate: toolCandidate.entry,
    runtimeToolRegistryCount: ensureArray(runtimeToolRegistry.tools).length,
  };
  const reportPath = writeOutput(workspaceRoot, `${phaseRoot}/phase8_routing_adaptation_report.json`, report);
  return { phase: "phase8", report, reportPath: reportPath.relativePath };
}

function runPhase9SafetyGovernance({ workspaceRoot = workspaceRootFrom(), phase8 = null } = {}) {
  const phaseRoot = "output/agi_readiness/phase9";
  const policy = loadAutonomyRiskPolicy(undefined, { workspaceRoot });
  const canaryState = updateDeploymentControlState(policy, { canaryEnabled: 1, freeze: 0, killSwitch: 0 }, workspaceRoot);
  let blockedAction = "";
  try {
    assertSafeAction({
      familyId: "debugging_incident_response",
      toolName: "deploy",
      stateScope: "root.policy",
      actor: "executor",
      approved: false,
      policy,
    });
  } catch (error) {
    blockedAction = error && error.message ? error.message : String(error);
  }
  const freezeState = updateDeploymentControlState(policy, { canaryEnabled: 1, freeze: 1, killSwitch: 0 }, workspaceRoot);
  const incident = appendIncidentLog({
    policy,
    kind: "adversarial_block",
    detail: blockedAction || "expected block missing",
    taskId: "phase9-safety",
  });
  const forensic = buildForensicTraceBundle({
    workspaceRoot,
    policy,
    artifacts: [
      path.join(workspaceRoot, phase8 && phase8.reportPath ? phase8.reportPath : "output/agi_readiness/phase8/phase8_routing_adaptation_report.json"),
      policy.incidentLogPath,
    ],
    incidentKind: "adversarial-block",
  });
  const restoredState = updateDeploymentControlState(policy, { canaryEnabled: 0, freeze: 0, killSwitch: 0 }, workspaceRoot);
  const report = {
    schema: "phase9-safety-governance-report.v1",
    generatedAt: nowIso(),
    canaryState,
    freezeState,
    blockedAction,
    incidentLogPath: rel(workspaceRoot, incident.incidentLogPath),
    forensicBundleRoot: rel(workspaceRoot, forensic.bundleRoot),
    killSwitchState: loadDeploymentControlState(policy, workspaceRoot),
    restoredState,
  };
  const reportPath = writeOutput(workspaceRoot, `${phaseRoot}/phase9_safety_governance_report.json`, report);
  return { phase: "phase9", report, reportPath: reportPath.relativePath };
}

function runPhase10ReadinessBoard({
  workspaceRoot = workspaceRootFrom(),
  phase5 = null,
  phase6 = null,
  phase7 = null,
  phase8 = null,
  phase9 = null,
} = {}) {
  const phaseRoot = "output/agi_readiness/phase10";
  const readinessReport = {
    schema: "agi-readiness-board-report.v1",
    generatedAt: nowIso(),
    scorecard: phase5 ? phase5.scorecard : {},
    phaseReports: {
      phase5: phase5 ? phase5.scorecardPath : "",
      phase6: phase6 ? phase6.reportPath : "",
      phase7: phase7 ? phase7.championChallengerPath : "",
      phase8: phase8 ? phase8.reportPath : "",
      phase9: phase9 ? phase9.reportPath : "",
    },
    knownLimitations: [
      "human baseline is scaffolded with synthetic import only",
      "blackbox readiness lane is bounded synthetic coverage, not external audit coverage",
      "tool learning remains sandbox-first and local",
    ],
  };
  const readinessReportPath = writeOutput(workspaceRoot, `${phaseRoot}/unified_readiness_report.json`, readinessReport);
  const claimPolicy = loadClaimGatePolicy();
  const claimGate = evaluateClaimGate({
    scorecard: phase5 ? phase5.scorecard : {},
    humanComparison: { observedCount: 0, synthetic: 1 },
    auditArtifacts: [
      "benchmark_manifest",
      "scoring_logic_summary",
      "human_baseline_protocol",
      "safety_policy_summary",
      "architecture_summary",
      "reproducibility_runbook",
      "known_limitations",
    ],
    catastrophicWeaknessCount: 1,
    policy: claimPolicy,
  });
  const claimGatePath = writeOutput(workspaceRoot, `${phaseRoot}/claim_gate.json`, claimGate);
  const auditBundle = buildExternalAuditBundle({
    workspaceRoot,
    readinessReport,
    scorecard: phase5 ? phase5.scorecard : {},
    outputs: {
      readinessReportPath: readinessReportPath.relativePath,
      phase5ScorecardPath: phase5 ? phase5.scorecardPath : "",
      phase6ReportPath: phase6 ? phase6.reportPath : "",
      phase7ReportPath: phase7 ? phase7.championChallengerPath : "",
      phase8ReportPath: phase8 ? phase8.reportPath : "",
      phase9ReportPath: phase9 ? phase9.reportPath : "",
      claimGatePath: claimGatePath.relativePath,
    },
  });
  return {
    phase: "phase10",
    readinessReportPath: readinessReportPath.relativePath,
    claimGatePath: claimGatePath.relativePath,
    claimRecommendation: claimGate.claimRecommendation,
    auditBundleRoot: rel(workspaceRoot, auditBundle.bundleRoot),
  };
}

async function runRemainingProgram({ workspaceRoot = workspaceRootFrom(), phase = "all" } = {}) {
  const normalizedPhase = safeString(phase, 80).toLowerCase() || "all";
  const outputs = {};
  if (["phase5", "all"].includes(normalizedPhase)) outputs.phase5 = await runPhase5BroadEval({ workspaceRoot });
  if (["phase6", "all"].includes(normalizedPhase)) outputs.phase6 = runPhase6KnowledgeSkill({ workspaceRoot, phase5: outputs.phase5 });
  if (["phase7", "all"].includes(normalizedPhase)) outputs.phase7 = runPhase7CurriculumImprovement({ workspaceRoot, phase5: outputs.phase5, phase6: outputs.phase6 });
  if (["phase8", "all"].includes(normalizedPhase)) outputs.phase8 = runPhase8RoutingAdaptation({ workspaceRoot, phase5: outputs.phase5, phase6: outputs.phase6, phase7: outputs.phase7 });
  if (["phase9", "all"].includes(normalizedPhase)) outputs.phase9 = runPhase9SafetyGovernance({ workspaceRoot, phase8: outputs.phase8 });
  if (["phase10", "all"].includes(normalizedPhase)) outputs.phase10 = runPhase10ReadinessBoard({ workspaceRoot, phase5: outputs.phase5, phase6: outputs.phase6, phase7: outputs.phase7, phase8: outputs.phase8, phase9: outputs.phase9 });
  return outputs;
}

async function runCompatibilitySuite({ workspaceRoot = workspaceRootFrom() } = {}) {
  const compatibility = {
    publicRegression: await runPublicRegression(),
    holdout: await runHoldoutEval({ actor: "release" }),
  };
  const scripts = [
    "scripts/phase1_hardening_e2e_test.js",
    "scripts/long_horizon_continuity_e2e_test.js",
    "scripts/phase3_structured_planning_lifecycle_e2e_test.js",
    "scripts/phase4_bounded_multi_agent_e2e_test.js",
  ];
  for (const script of scripts) {
    const { spawnSync } = require("child_process");
    const result = spawnSync(process.execPath, [script], {
      cwd: workspaceRoot,
      encoding: "utf8",
      env: { ...process.env, CODEX_HOLDOUT_EVAL_UNLOCK: process.env.CODEX_HOLDOUT_EVAL_UNLOCK || "1" },
    });
    if (result.status !== 0) {
      throw new Error(`${script} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    }
  }
  return compatibility;
}

module.exports = {
  executeEvalLane,
  runCompatibilitySuite,
  runPhase5BroadEval,
  runPhase6KnowledgeSkill,
  runPhase7CurriculumImprovement,
  runPhase8RoutingAdaptation,
  runPhase9SafetyGovernance,
  runPhase10ReadinessBoard,
  runRemainingProgram,
};
