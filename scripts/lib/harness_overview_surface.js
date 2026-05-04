"use strict";

function syncHarnessOverviewGovernedMemory(options={}){
  const {
    buildEvalHistoryOverview,
    buildExecutionMemoryOverview,
    buildHarnessTraceabilitySnapshot,
    buildRuntimeApiSnapshot,
    safeString,
    syncGovernedMemoryGraph,
    workspaceRoot,
    reason="runtime_sync",
    refreshTrackedLearningArtifacts=false,
  }=options;
  const runtime=buildRuntimeApiSnapshot();
  const traceability=buildHarnessTraceabilitySnapshot(
    runtime&&runtime.latestTurn&&runtime.latestTurn.planning&&typeof runtime.latestTurn.planning==="object"
      ?runtime.latestTurn.planning
      :{},
    safeString(runtime&&runtime.latestTurn&&runtime.latestTurn.agent_name,80)
      ||safeString(runtime&&runtime.activeAgent,80)
      ||"default"
  );
  return syncGovernedMemoryGraph({
    workspaceRoot,
    runtime:{
      activeAgent:runtime.activeAgent,
      latestTurn:runtime.latestTurn,
      intentFirst:runtime.intentFirst,
      executionOverview:buildExecutionMemoryOverview({limit:10,window:60}),
      evalHistory:{
        recentRuns:buildEvalHistoryOverview({limit:6}),
      },
      externalLearning:runtime.externalLearning,
      manualSelfImprovement:runtime.manualSelfImprovement,
      secondaryLearning:runtime.secondaryLearning,
      phaseStatus:runtime.phaseStatus,
      traceability,
    },
    traceability,
    reason:safeString(reason,80)||"runtime_sync",
    refreshTrackedLearningArtifacts,
  });
}

function buildHarnessOverviewPayload(options={}){
  const {
    apiVersion,
    buildBrowserCapabilityOverview,
    buildBundleOverview,
    buildContinuityOverviewSnapshot,
    buildEvalHistoryOverview,
    buildExecutionMemoryOverview,
    buildHarnessTraceabilitySnapshot,
    buildRuntimeApiSnapshot,
    buildRuntimeProofBundleSnapshot,
    buildSignoffBundleSnapshot,
    buildSkillPortfolioOverview,
    buildTopographyOverview,
    getAgentTopographySnapshot,
    harnessMemoryLoaded,
    listReplayMemorySnapshots,
    loadHarnessExecutionMemoryStore,
    loggingSurfacePaths,
    repoRelativePath,
    runtimeProofsRoot,
    safeString,
    sanitizeRuntimeSnapshotForOverview,
    signoffBundlesRoot,
    syncGovernedMemoryGraph,
    workspaceRoot,
    detail="light",
    includeHeavyReads,
  }=options;
  const heavyReadsEnabled=typeof includeHeavyReads==="boolean"
    ?includeHeavyReads
    :safeString(detail,40).toLowerCase()==="full";

  const memoryLoaded=typeof harnessMemoryLoaded==="function"
    ?Boolean(harnessMemoryLoaded())
    :Boolean(harnessMemoryLoaded);
  if(heavyReadsEnabled&&!memoryLoaded){
    loadHarnessExecutionMemoryStore();
  }

  const runtime=sanitizeRuntimeSnapshotForOverview(buildRuntimeApiSnapshot());
  const skillPortfolio=buildSkillPortfolioOverview();
  const assignmentsByRole=new Map(
    Array.isArray(skillPortfolio&&skillPortfolio.assignments)
      ?skillPortfolio.assignments.map((entry)=>[entry.role,entry.skills])
      :[]
  );
  const topology=buildTopographyOverview(getAgentTopographySnapshot(),assignmentsByRole);
  const traceability=buildHarnessTraceabilitySnapshot(
    runtime&&runtime.latestTurn&&runtime.latestTurn.planning&&typeof runtime.latestTurn.planning==="object"
      ?runtime.latestTurn.planning
      :{},
    safeString(runtime&&runtime.latestTurn&&runtime.latestTurn.agent_name,80)
      ||safeString(runtime&&runtime.activeAgent,80)
      ||"default"
  );
  const capabilitySurface={
    browser:heavyReadsEnabled?buildBrowserCapabilityOverview():{source:"deferred_heavy_read",fullApi:"/api/harness/overview?detail=full"},
    continuity:heavyReadsEnabled?buildContinuityOverviewSnapshot():{source:"deferred_heavy_read",fullApi:"/api/harness/overview?detail=full"},
  };
  const deferredBundle=(storageRoot,summaryFileName)=>({
    storageRoot:repoRelativePath(workspaceRoot,storageRoot),
    summaryFileName,
    bundleCount:0,
    latest:null,
    recent:[],
    source:"deferred_heavy_read",
    fullApi:"/api/harness/overview?detail=full",
  });

  return{
    apiVersion,
    mode:"harness-overview",
    detail:heavyReadsEnabled?"full":"light",
    heavyReadsDeferred:heavyReadsEnabled?0:1,
    fullOverviewApi:"/api/harness/overview?detail=full",
    generatedAt:Date.now(),
    workspaceRoot,
    pages:{
      console:"/01.HarnesUI/index.html",
      overview:"/01.HarnesUI/overview.html",
    },
    apis:{
      exec:"POST /api/exec",
      eval:"POST /api/eval/run",
      runtime:"/api/runtime",
      overview:"/api/harness/overview",
      overviewFull:"/api/harness/overview?detail=full",
      topography:"/api/agent-topography",
      conversationRuntime:"/api/conversation/runtime",
      evalSuites:"/api/eval/suites",
      evalHistory:"/api/eval/history",
      replayTurns:"/api/replay/turns",
      continuityTask:"/api/continuity/task",
      continuityTasks:"/api/continuity/tasks",
      sloStatus:"/api/slo/status",
    },
    capabilitySurface,
    runtime,
    topology,
    contracts:{
      governance:runtime.governancePolicy,
      turn:runtime.contractSpec,
      taskOutcome:runtime.taskOutcomeContract,
      planning:runtime.planningContracts,
      designAcceptance:runtime.intentFirst&&runtime.intentFirst.contract?runtime.intentFirst.contract:{},
    },
    evidence:{
      current:{
        root:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRoot),
        operatorSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentOperatorSummaryPath),
        indexPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentIndexPath),
        designConformanceSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentDesignConformancePath),
        latestRunSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath),
        reviewLoadBreakdownPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentReviewLoadBreakdownPath),
        latestSignoffSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestSignoffSummaryPath),
      },
      repoTruth:runtime.repoTruth&&typeof runtime.repoTruth==="object"?runtime.repoTruth:{},
      runtimeProof:heavyReadsEnabled
        ?buildBundleOverview(runtimeProofsRoot,"runtime_proof_summary.json",buildRuntimeProofBundleSnapshot)
        :deferredBundle(runtimeProofsRoot,"runtime_proof_summary.json"),
      signoff:heavyReadsEnabled
        ?buildBundleOverview(signoffBundlesRoot,"signoff_summary.json",buildSignoffBundleSnapshot)
        :deferredBundle(signoffBundlesRoot,"signoff_summary.json"),
    },
    eval:{
      suite:runtime.evalHarness&&runtime.evalHarness.suite?runtime.evalHarness.suite:{},
      recentRuns:heavyReadsEnabled?buildEvalHistoryOverview({limit:6}):[],
      source:heavyReadsEnabled?"full_read":"deferred_heavy_read",
      fullApi:"/api/harness/overview?detail=full",
    },
    memory:{
      harness:runtime.harnessMemory,
      governedGraph:runtime.governedMemory&&typeof runtime.governedMemory==="object"
        ?{
          ...runtime.governedMemory,
          source:"runtime_snapshot_no_write",
        }
        :{
          source:"runtime_snapshot_no_write",
        },
      taste:runtime.intentFirst&&runtime.intentFirst.tasteMemory?runtime.intentFirst.tasteMemory:{},
      execution:heavyReadsEnabled
        ?buildExecutionMemoryOverview({limit:10,window:60})
        :{source:"deferred_heavy_read",sampleSize:0,recent:[],fullApi:"/api/harness/overview?detail=full"},
      externalLearning:runtime.externalLearning&&typeof runtime.externalLearning==="object"?runtime.externalLearning:{},
      manualSelfImprovement:runtime.manualSelfImprovement&&typeof runtime.manualSelfImprovement==="object"?runtime.manualSelfImprovement:{},
      agiImprovementFlywheel:runtime.agiImprovementFlywheel&&typeof runtime.agiImprovementFlywheel==="object"?runtime.agiImprovementFlywheel:{},
      secondaryLearning:runtime.secondaryLearning&&typeof runtime.secondaryLearning==="object"?runtime.secondaryLearning:{},
      replay:{
        recent:heavyReadsEnabled?listReplayMemorySnapshots({limit:6}):[],
        source:heavyReadsEnabled?"full_read":"deferred_heavy_read",
        fullApi:"/api/harness/overview?detail=full",
      },
    },
    traceability,
    health:{
      latestTurn:runtime.latestTurn,
      fullUtilization:runtime.fullUtilization,
      slo:runtime.slo,
    },
    skillPortfolio,
  };
}

module.exports={
  buildHarnessOverviewPayload,
  syncHarnessOverviewGovernedMemory,
};
