"use strict";

const path=require("path");

function createRuntimeArtifactReaders(options={}){
  const {
    workspaceRoot,
    safeString,
    readJsonObjectFile,
    readLoggingSurfaceJson,
  }=options;

  function rebaseWorkspaceArtifactPath(rawPath){
    const raw=safeString(rawPath,400);
    if(!raw)return"";
    const normalizedRaw=raw.replace(/\\/g,"/");
    const normalizedWorkspace=String(workspaceRoot||"").replace(/\\/g,"/");
    if(normalizedWorkspace&&(normalizedRaw===normalizedWorkspace||normalizedRaw.startsWith(`${normalizedWorkspace}/`))){
      return path.normalize(raw);
    }
    const workspaceName=path.basename(workspaceRoot||"");
    const marker=workspaceName?`/${workspaceName}/`:"";
    const markerIndex=marker?normalizedRaw.toLowerCase().indexOf(marker.toLowerCase()):-1;
    if(markerIndex>=0){
      const suffix=normalizedRaw.slice(markerIndex+marker.length);
      return path.normalize(path.join(workspaceRoot,suffix));
    }
    return "";
  }

  function resolveWorkspaceRuntimePath(targetPath){
    const raw=safeString(targetPath,400);
    if(!raw)return"";
    const rebased=rebaseWorkspaceArtifactPath(raw);
    if(rebased)return rebased;
    if(path.isAbsolute(raw))return path.normalize(raw);
    return path.normalize(path.join(workspaceRoot,raw));
  }

  function readWorkspaceJsonArtifact(targetPath){
    const resolved=resolveWorkspaceRuntimePath(targetPath);
    if(!resolved)return null;
    return readJsonObjectFile(resolved)||readLoggingSurfaceJson(resolved);
  }

  return{
    resolveWorkspaceRuntimePath,
    readWorkspaceJsonArtifact,
  };
}

function buildContinuityOverviewSurface(options={}){
  const {
    readWorkspaceJsonArtifact,
    safeString,
    toFiniteNumber,
  }=options;
  const latestSummary=readWorkspaceJsonArtifact("output/continuity_public/latest_continuity.json");
  const debt=readWorkspaceJsonArtifact("output/continuity_public/continuity_debt.json");
  const debtTrend=readWorkspaceJsonArtifact("output/continuity_public/continuity_debt_trend.json");
  const closeoutEffects=readWorkspaceJsonArtifact("output/continuity_public/continuity_closeout_effects.json");
  const debtItems=Array.isArray(debt&&debt.items)?debt.items:[];
  const openItems=debtItems.filter((entry)=>safeString(entry&&entry.status,40)!=="resolved");
  const latestRoleMix=Array.isArray(latestSummary&&latestSummary.selfAuthoredTaskFlow&&latestSummary.selfAuthoredTaskFlow.latestRoleMix)
    ?latestSummary.selfAuthoredTaskFlow.latestRoleMix.slice(0,4)
    :[];
  const trendEntries=Array.isArray(debtTrend&&debtTrend.entries)?debtTrend.entries.slice(-3).reverse():[];
  return{
    schema:safeString(latestSummary&&latestSummary.schema,120)||"continuity-public-summary.v1",
    generatedAt:safeString(latestSummary&&latestSummary.generatedAt,80)||safeString(debt&&debt.generatedAt,80)||"",
    summaryPath:"output/continuity_public/latest_continuity.json",
    debtPath:"output/continuity_public/continuity_debt.json",
    debtTrendPath:"output/continuity_public/continuity_debt_trend.json",
    closeoutEffectsPath:"output/continuity_public/continuity_closeout_effects.json",
    activeTaskId:safeString(latestSummary&&latestSummary.horizon&&latestSummary.horizon.activeTaskId,120)||"",
    activeTaskFamily:safeString(latestSummary&&latestSummary.horizon&&latestSummary.horizon.activeTaskFamily,120)||"",
    objective:safeString(latestSummary&&latestSummary.horizon&&latestSummary.horizon.objective,240)||"",
    finalReleaseState:safeString(latestSummary&&latestSummary.finalReleaseState,80)||"unreported",
    handoffCount:toFiniteNumber(latestSummary&&latestSummary.handoffCount,0),
    blockedSubtasks:toFiniteNumber(latestSummary&&latestSummary.blockedSubtasks,0),
    integrationPendingCount:toFiniteNumber(latestSummary&&latestSummary.integrationPendingCount,0),
    openDebtCount:toFiniteNumber(latestSummary&&latestSummary.openDebtCount,openItems.length),
    debtSeverity:safeString(latestSummary&&latestSummary.debtSeverity,40)||"unreported",
    resumeCount:toFiniteNumber(latestSummary&&latestSummary.horizon&&latestSummary.horizon.resumeCount,0),
    replanCount:toFiniteNumber(latestSummary&&latestSummary.horizon&&latestSummary.horizon.replanCount,0),
    verifierCheckpointCount:toFiniteNumber(latestSummary&&latestSummary.horizon&&latestSummary.horizon.verifierCheckpointCount,0),
    autoCloseEligibleCount:toFiniteNumber(closeoutEffects&&closeoutEffects.summary&&closeoutEffects.summary.autoCloseEligibleCount,0),
    resolvedDebtCount:toFiniteNumber(closeoutEffects&&closeoutEffects.summary&&closeoutEffects.summary.resolvedCount,0),
    latestRoleMix,
    recentTrend:trendEntries.map((entry)=>({
      generatedAt:safeString(entry&&entry.generatedAt,80)||"",
      openDebtCount:toFiniteNumber(entry&&entry.openDebtCount,0),
      blockedSubtasks:toFiniteNumber(entry&&entry.blockedSubtasks,0),
      integrationPendingCount:toFiniteNumber(entry&&entry.integrationPendingCount,0),
      finalReleaseState:safeString(entry&&entry.finalReleaseState,80)||"",
    })),
    openItems:openItems.slice(0,3).map((entry)=>({
      debtId:safeString(entry&&entry.debtId,120)||"",
      debtClass:safeString(entry&&entry.debtClass,80)||"",
      nextOwner:safeString(entry&&entry.nextOwner,80)||"",
      nextRecoveryStep:safeString(entry&&entry.nextRecoveryStep,200)||"",
      publicSummary:safeString(entry&&entry.publicSummary,240)||"",
    })),
  };
}

function buildBrowserCapabilitySurface(options={}){
  const {
    readWorkspaceJsonArtifact,
    safeString,
    toFiniteNumber,
  }=options;
  const readiness=readWorkspaceJsonArtifact("output/agi_readiness/latest_readiness.json");
  const robustness=readWorkspaceJsonArtifact("output/agi_readiness/robustness_breakdown.json");
  const stableCoverage=readWorkspaceJsonArtifact("output/agi_readiness/stable_coverage_matrix.json");
  const categories=Array.isArray(robustness&&robustness.categories)?robustness.categories:[];
  const rows=Array.isArray(stableCoverage&&stableCoverage.rows)?stableCoverage.rows:[];
  const category=categories.find((entry)=>safeString(entry&&entry.categoryId,120)==="browser_tool_flakiness")||{};
  const sourceFamilySet=new Set([
    ...rows.filter((entry)=>["web_creative","workflow_execution","tool_use_browser_like"].includes(safeString(entry&&entry.familyId,80))).map((entry)=>safeString(entry&&entry.familyId,80)),
    ...Array.isArray(category.sourceFamilies)?category.sourceFamilies.map((entry)=>safeString(entry,80)).filter(Boolean):[],
  ]);
  const familyRows=Array.from(sourceFamilySet).map((familyId)=>rows.find((entry)=>safeString(entry&&entry.familyId,80)===familyId)).filter(Boolean);
  const unstableFamilyCount=familyRows.filter((entry)=>!Boolean(entry&&entry.stableCovered)).length;
  return{
    schema:"browser-capability-overview.v1",
    generatedAt:safeString(readiness&&readiness.generatedAt,80)||safeString(robustness&&robustness.generatedAt,80)||safeString(stableCoverage&&stableCoverage.generatedAt,80)||"",
    readinessPath:"output/agi_readiness/latest_readiness.json",
    robustnessPath:"output/agi_readiness/robustness_breakdown.json",
    stableCoveragePath:"output/agi_readiness/stable_coverage_matrix.json",
    status:safeString(category.remediationStatus,80)||safeString(category.status,80)||"unreported",
    score:toFiniteNumber(category.score,0),
    evidenceCount:toFiniteNumber(category.evidenceCount,0),
    successCount:toFiniteNumber(category.successCount,0),
    failureCount:toFiniteNumber(category.failureCount,0),
    stableCoverageBreadth:toFiniteNumber(readiness&&readiness.stableCoverageBreadth,0),
    supportedCoverageBreadth:toFiniteNumber(readiness&&readiness.supportedCoverageBreadth,0),
    displayFinalScore:toFiniteNumber(readiness&&readiness.displayFinalScore,0),
    sourceFamilies:Array.isArray(category.sourceFamilies)?category.sourceFamilies.map((entry)=>safeString(entry,80)).filter(Boolean):[],
    openFailureModes:Array.isArray(category.openFailureModes)?category.openFailureModes.slice(0,3).map((entry)=>safeString(entry,200)).filter(Boolean):[],
    familyRows:familyRows.map((entry)=>({
      familyId:safeString(entry&&entry.familyId,80)||"",
      label:safeString(entry&&entry.label,120)||"",
      stableCovered:Boolean(entry&&entry.stableCovered),
      stabilityStatus:safeString(entry&&entry.stabilityStatus,80)||"",
      recentSuccessRate:toFiniteNumber(entry&&entry.recentSuccessRate,0),
      recentFailureBurden:toFiniteNumber(entry&&entry.recentFailureBurden,0),
      nextCoverageAction:safeString(entry&&entry.nextCoverageAction,200)||"",
    })),
    unstableFamilyCount,
  };
}

module.exports={
  buildBrowserCapabilitySurface,
  buildContinuityOverviewSurface,
  createRuntimeArtifactReaders,
};
