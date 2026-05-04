"use strict";

function createCurrentLogSurfaceService(deps = {}) {
  const {
    currentSurfaceService,
    ensureLoggingSurfaceDir,
    writeLoggingSurfaceJson,
    buildConformanceReport,
    buildOperatorViewSummary,
    loggingSurfacePaths,
    repoRelativePath,
    workspaceRoot,
    safeString,
    logOperation,
    fs,
  } = deps;

  function updateCurrentLogSurface({ trigger = "" } = {}) {
    ensureLoggingSurfaceDir(loggingSurfacePaths.currentRoot);
    const runtimeSnapshot = currentSurfaceService.buildCurrentRuntimeSnapshotFile();
    const latestSignoffSummaryRaw = currentSurfaceService.buildLatestSignoffSummaryFile();
    const latestRunSummaryRaw = currentSurfaceService.buildLatestRunSummaryFile();
    const reviewLoadBreakdownRaw = currentSurfaceService.buildCurrentReviewLoadBreakdownFile(latestRunSummaryRaw);
    const designConformanceSummaryRaw = currentSurfaceService.buildCurrentDesignConformanceSummary({
      runtimeSnapshot,
      latestRunSummary: latestRunSummaryRaw,
      latestSignoffSummary: latestSignoffSummaryRaw,
    });
    const conformanceReport = buildConformanceReport({
      latestRunSummary: latestRunSummaryRaw,
      signoffSummary: latestSignoffSummaryRaw,
      runtimeRequestUserInputPolicy: safeString(runtimeSnapshot && runtimeSnapshot.posture && runtimeSnapshot.posture.requestUserInputPolicy && runtimeSnapshot.posture.requestUserInputPolicy.policy, 40) || "",
      childEvidenceLedger: latestRunSummaryRaw && Array.isArray(latestRunSummaryRaw.childEvidenceLedger) ? latestRunSummaryRaw.childEvidenceLedger : [],
      requiredEvidenceFailures: reviewLoadBreakdownRaw && Array.isArray(reviewLoadBreakdownRaw.requiredEvidenceFailures) ? reviewLoadBreakdownRaw.requiredEvidenceFailures : [],
      evidenceRefs: [
        repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestRunSummaryPath),
        repoRelativePath(workspaceRoot, loggingSurfacePaths.currentReviewLoadBreakdownPath),
        repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestSignoffSummaryPath),
      ],
      rationaleNotes: [
        `trigger=${safeString(trigger, 80) || "runtime_update"}`,
      ],
    });
    const operatorViewSummary = buildOperatorViewSummary({
      latestRunSummary: latestRunSummaryRaw,
      reviewBundle: conformanceReport.reviewBundle,
      releaseDecision: conformanceReport.releaseDecision,
      conformanceReport,
      routingDecision: conformanceReport.routingDecision,
    });
    const operatorSummaryRaw = currentSurfaceService.buildCurrentOperatorSummaryFile({
      runtimeSnapshot,
      latestRunSummary: latestRunSummaryRaw,
      latestSignoffSummary: latestSignoffSummaryRaw,
      reviewLoadBreakdown: reviewLoadBreakdownRaw,
      designConformanceSummary: designConformanceSummaryRaw,
      conformanceReport,
      operatorViewSummary,
    });
    const latestSignoffSummary = currentSurfaceService.normalizeCurrentLatestSignoffSummary(latestSignoffSummaryRaw);
    const latestRunSummary = currentSurfaceService.normalizeCurrentLatestRunSummary(latestRunSummaryRaw, latestSignoffSummary);
    const reviewLoadBreakdown = currentSurfaceService.normalizeCurrentReviewLoadBreakdown(reviewLoadBreakdownRaw);
    const designConformanceSummary = currentSurfaceService.normalizeCurrentDesignConformanceSummary(designConformanceSummaryRaw);
    const operatorSummary = currentSurfaceService.normalizeCurrentOperatorSummary({
      operatorSummary: operatorSummaryRaw,
      designConformanceSummary,
      latestRunSummary,
      reviewLoadBreakdown,
      latestSignoffSummary,
    });
    writeLoggingSurfaceJson(loggingSurfacePaths.currentOperatorSummaryPath, operatorSummary);
    writeLoggingSurfaceJson(loggingSurfacePaths.currentLatestRunSummaryPath, latestRunSummary);
    writeLoggingSurfaceJson(loggingSurfacePaths.currentReviewLoadBreakdownPath, reviewLoadBreakdown);
    writeLoggingSurfaceJson(loggingSurfacePaths.currentDesignConformancePath, designConformanceSummary);
    if (latestSignoffSummary) {
      writeLoggingSurfaceJson(loggingSurfacePaths.currentLatestSignoffSummaryPath, latestSignoffSummary);
    } else if (fs.existsSync(loggingSurfacePaths.currentLatestSignoffSummaryPath)) {
      try {
        fs.unlinkSync(loggingSurfacePaths.currentLatestSignoffSummaryPath);
      } catch {
      }
    }
    [
      loggingSurfacePaths.currentRuntimeSnapshotPath,
      loggingSurfacePaths.currentIndexPath,
      loggingSurfacePaths.currentConformanceReportPath,
      loggingSurfacePaths.currentOperatorViewSummaryPath,
    ].forEach((targetPath) => {
      if (!targetPath || !fs.existsSync(targetPath)) return;
      try {
        fs.unlinkSync(targetPath);
      } catch {
      }
    });
    const allowedCurrentFiles = new Set([
      "design_conformance_summary.json",
      "latest_run_summary.json",
      "latest_signoff_summary.json",
      "operator_summary.json",
      "review_load_breakdown.json",
    ]);
    for (const entry of fs.readdirSync(loggingSurfacePaths.currentRoot, { withFileTypes: true })) {
      if (!entry.isFile() || allowedCurrentFiles.has(entry.name)) continue;
      try {
        fs.unlinkSync(`${loggingSurfacePaths.currentRoot}/${entry.name}`);
      } catch {
      }
    }
    logOperation("current_logs.updated", {
      trigger: safeString(trigger, 80) || "runtime",
      currentRoot: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentRoot),
      operatorSummaryPath: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentOperatorSummaryPath),
      latestTurnId: latestRunSummary && latestRunSummary.turnId ? safeString(latestRunSummary.turnId, 160) : "",
      signoffBundle: latestSignoffSummary && latestSignoffSummary.bundleName ? safeString(latestSignoffSummary.bundleName, 160) : "",
    }, "core");
  }

  function buildRefreshCurrentLogSurfaceResult() {
    return {
      currentRoot: loggingSurfacePaths.currentRoot,
      operatorSummaryPath: loggingSurfacePaths.currentOperatorSummaryPath,
      runtimeSnapshotPath: loggingSurfacePaths.currentRuntimeSnapshotPath,
      designConformancePath: loggingSurfacePaths.currentDesignConformancePath,
      latestRunSummaryPath: loggingSurfacePaths.currentLatestRunSummaryPath,
      reviewLoadBreakdownPath: loggingSurfacePaths.currentReviewLoadBreakdownPath,
      latestSignoffSummaryPath: loggingSurfacePaths.currentLatestSignoffSummaryPath,
      indexPath: loggingSurfacePaths.currentIndexPath,
    };
  }

  return Object.freeze({
    updateCurrentLogSurface,
    buildRefreshCurrentLogSurfaceResult,
  });
}

module.exports = {
  createCurrentLogSurfaceService,
};
