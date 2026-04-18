"use strict";

function createTraceabilityService(deps = {}) {
  const {
    safeString,
    sanitizePlanningArtifactsForRuntime,
    buildOperatorPlanEvent,
  } = deps;

  function uniqueOverviewStrings(values, max = 8) {
    const seen = new Set();
    const result = [];
    const items = Array.isArray(values) ? values : [];
    for (const value of items) {
      const text = safeString(String(value || ""), 160);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      result.push(text);
      if (result.length >= max) break;
    }
    return result;
  }

  function clampOverviewInt(value, fallback = 0, min = 0, max = 999) {
    const parsed = Number(value);
    const normalized = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
    return Math.min(max, Math.max(min, normalized));
  }

  function buildPlanningTraceabilityData({
    planningContext,
    agentName = "default",
    dispatchesOverride = null,
    planStepsOverride = null,
  } = {}) {
    const sanitizedPlanning = sanitizePlanningArtifactsForRuntime(
      planningContext && typeof planningContext === "object" ? planningContext : {}
    );
    const requirement = sanitizedPlanning.requirementContract && typeof sanitizedPlanning.requirementContract === "object"
      ? sanitizedPlanning.requirementContract
      : {};
    const requestCoverage = requirement.requestCoverage && typeof requirement.requestCoverage === "object"
      ? requirement.requestCoverage
      : {};
    const rawRequestClauses = Array.isArray(requestCoverage.rawRequestClauses)
      ? requestCoverage.rawRequestClauses
      : [];
    const mappedRequirements = Array.isArray(requestCoverage.mappedRequirements)
      ? requestCoverage.mappedRequirements
      : [];
    const parkedItems = Array.isArray(requestCoverage.parkedItems)
      ? requestCoverage.parkedItems
      : [];
    const droppedItems = Array.isArray(requestCoverage.droppedItems)
      ? requestCoverage.droppedItems
      : [];
    const summary = requestCoverage.coverageSummary && typeof requestCoverage.coverageSummary === "object"
      ? requestCoverage.coverageSummary
      : {};
    const coreObligations = new Set(uniqueOverviewStrings(requestCoverage.coreObligations, 32));
    const mappedByClause = new Map();
    const parkedByClause = new Map();
    const droppedByClause = new Map();
    const dispatchIdsByClause = new Map();
    const planStepIdsByClause = new Map();
    const acceptanceRefsByClause = new Map();

    const pushMapValues = (map, key, values, max = 24) => {
      const normalizedKey = safeString(key, 80);
      if (!normalizedKey) return;
      map.set(
        normalizedKey,
        uniqueOverviewStrings([...(map.get(normalizedKey) || []), ...(Array.isArray(values) ? values : [])], max)
      );
    };

    mappedRequirements.forEach((entry) => {
      const clauseId = safeString(entry && entry.clauseId, 80);
      if (!clauseId) return;
      mappedByClause.set(clauseId, uniqueOverviewStrings(entry && entry.requirementRefs, 16));
    });

    parkedItems.forEach((entry) => {
      const clauseId = safeString(entry && entry.clauseId, 80);
      if (!clauseId) return;
      parkedByClause.set(clauseId, {
        reason: safeString(entry && entry.reason, 240),
        requirementRefs: uniqueOverviewStrings(entry && entry.requirementRefs, 16),
      });
    });

    droppedItems.forEach((entry) => {
      const clauseId = safeString(entry && entry.clauseId, 80);
      if (!clauseId) return;
      droppedByClause.set(clauseId, {
        reasonCode: safeString(entry && entry.reasonCode, 80),
        reason: safeString(entry && entry.reason, 240),
        requirementRefs: uniqueOverviewStrings(entry && entry.requirementRefs, 16),
      });
    });

    const dispatches = Array.isArray(dispatchesOverride)
      ? dispatchesOverride
      : Array.isArray(sanitizedPlanning.dispatchPlan && sanitizedPlanning.dispatchPlan.dispatches)
        ? sanitizedPlanning.dispatchPlan.dispatches
        : [];
    dispatches.forEach((dispatch, index) => {
      const dispatchId = safeString(dispatch && dispatch.dispatchId, 120) || `dispatch-${index + 1}`;
      const clauseRefs = uniqueOverviewStrings(dispatch && dispatch.requestClauseRefs, 24);
      const acceptanceRefs = uniqueOverviewStrings(dispatch && dispatch.acceptanceCheckRefs, 16);
      clauseRefs.forEach((clauseId) => {
        pushMapValues(dispatchIdsByClause, clauseId, [dispatchId], 12);
        pushMapValues(acceptanceRefsByClause, clauseId, acceptanceRefs, 16);
      });
    });

    const operatorPlanEvent = buildOperatorPlanEvent({
      planningContext: sanitizedPlanning,
      agentName: safeString(agentName, 80) || "default",
    });
    const planSteps = Array.isArray(planStepsOverride)
      ? planStepsOverride
      : Array.isArray(operatorPlanEvent && operatorPlanEvent.steps)
        ? operatorPlanEvent.steps
        : [];
    planSteps.forEach((step, index) => {
      const stepId = safeString(step && step.stepId, 120) || `plan-${index + 1}`;
      const clauseRefs = uniqueOverviewStrings(step && step.requestClauseRefs, 24);
      const acceptanceRefs = uniqueOverviewStrings(step && step.acceptanceCheckRefs, 16);
      clauseRefs.forEach((clauseId) => {
        pushMapValues(planStepIdsByClause, clauseId, [stepId], 16);
        pushMapValues(acceptanceRefsByClause, clauseId, acceptanceRefs, 16);
      });
    });

    const clauses = rawRequestClauses.map((entry, index) => {
      const clauseId = safeString(entry && entry.id, 80) || `req-${index + 1}`;
      const mappedRefs = uniqueOverviewStrings(mappedByClause.get(clauseId) || [], 16);
      const parked = parkedByClause.get(clauseId) || null;
      const dropped = droppedByClause.get(clauseId) || null;
      return {
        clauseId,
        text: safeString(entry && entry.text, 320),
        kind: safeString(entry && entry.kind, 80) || "explicit_request",
        lane: safeString(entry && entry.lane, 80) || "core",
        core: coreObligations.has(clauseId),
        state: dropped
          ? "dropped"
          : parked
            ? "parked"
            : mappedRefs.length
              ? "mapped"
              : coreObligations.has(clauseId)
                ? "unmapped"
                : "tracked",
        requirementRefs: uniqueOverviewStrings([
          ...mappedRefs,
          ...(parked && Array.isArray(parked.requirementRefs) ? parked.requirementRefs : []),
          ...(dropped && Array.isArray(dropped.requirementRefs) ? dropped.requirementRefs : []),
        ], 16),
        dispatchIds: uniqueOverviewStrings(dispatchIdsByClause.get(clauseId) || [], 12),
        planStepIds: uniqueOverviewStrings(planStepIdsByClause.get(clauseId) || [], 16),
        acceptanceCheckRefs: uniqueOverviewStrings(acceptanceRefsByClause.get(clauseId) || [], 16),
        parkedReason: parked && parked.reason ? parked.reason : "",
        droppedReasonCode: dropped && dropped.reasonCode ? dropped.reasonCode : "",
        droppedReason: dropped && dropped.reason ? dropped.reason : "",
      };
    });

    return {
      sanitizedPlanning,
      requirement,
      requestCoverage,
      rawRequestClauses,
      mappedRequirements,
      parkedItems,
      droppedItems,
      summary,
      dispatches,
      plan: {
        decision: safeString(operatorPlanEvent && operatorPlanEvent.decision, 40) || "",
        planningDepth: safeString(operatorPlanEvent && operatorPlanEvent.planningDepth, 80)
          || safeString(sanitizedPlanning.selection && sanitizedPlanning.selection.selectedPlanningDepth, 80),
        assuranceDepth: safeString(operatorPlanEvent && operatorPlanEvent.assuranceDepth, 80)
          || safeString(sanitizedPlanning.selection && sanitizedPlanning.selection.selectedAssuranceDepth, 80),
        flowPath: safeString(operatorPlanEvent && operatorPlanEvent.flowPath, 80)
          || safeString(sanitizedPlanning.selection && sanitizedPlanning.selection.flowPath, 80),
      },
      operatorPlanEvent,
      planSteps,
      clauses,
    };
  }

  function buildHarnessTraceabilitySnapshot(planningContext, agentName = "default") {
    const traceability = buildPlanningTraceabilityData({ planningContext, agentName });
    return {
      owner: safeString(traceability.requirement && traceability.requirement.owner, 80) || "intake",
      summary: {
        totalClauses: clampOverviewInt(traceability.summary.totalClauses, traceability.rawRequestClauses.length, 0, 999),
        mappedCount: clampOverviewInt(traceability.summary.mappedCount, traceability.mappedRequirements.length, 0, 999),
        coreTotal: clampOverviewInt(
          traceability.summary.coreTotal,
          traceability.clauses.filter((entry) => entry && entry.core).length,
          0,
          999
        ),
        coreMapped: clampOverviewInt(traceability.summary.coreMapped, 0, 0, 999),
        coreUnmapped: clampOverviewInt(traceability.summary.coreUnmapped, 0, 0, 999),
        parkedCount: clampOverviewInt(traceability.summary.parkedCount, traceability.parkedItems.length, 0, 999),
        droppedCount: clampOverviewInt(traceability.summary.droppedCount, traceability.droppedItems.length, 0, 999),
        dispatchCount: traceability.dispatches.length,
        planStepCount: traceability.planSteps.length,
      },
      plan: traceability.plan,
      clauses: traceability.clauses,
    };
  }

  function buildPostLockDriftSnapshot({
    planningContext,
    agentName = "default",
    dispatchesOverride = null,
    planStepsOverride = null,
  } = {}) {
    const traceability = buildPlanningTraceabilityData({
      planningContext,
      agentName,
      dispatchesOverride,
      planStepsOverride,
    });
    const coreClauses = traceability.clauses.filter((entry) => entry && entry.core);
    const mappedCoreClauses = coreClauses.filter((entry) => Array.isArray(entry && entry.requirementRefs) && entry.requirementRefs.length);
    const unmappedCoreClauseIds = uniqueOverviewStrings(
      coreClauses.filter((entry) => !Array.isArray(entry && entry.requirementRefs) || !entry.requirementRefs.length).map((entry) => entry.clauseId),
      24
    );
    const dispatchGapClauseIds = uniqueOverviewStrings(
      mappedCoreClauses.filter((entry) => !Array.isArray(entry && entry.dispatchIds) || !entry.dispatchIds.length).map((entry) => entry.clauseId),
      24
    );
    const planGapClauseIds = uniqueOverviewStrings(
      mappedCoreClauses.filter((entry) => !Array.isArray(entry && entry.planStepIds) || !entry.planStepIds.length).map((entry) => entry.clauseId),
      24
    );
    const driftedClauseIds = uniqueOverviewStrings([...dispatchGapClauseIds, ...planGapClauseIds], 24);
    const orphanDispatchIds = uniqueOverviewStrings(
      traceability.dispatches.map((dispatch, index) => {
        const clauseRefs = uniqueOverviewStrings(dispatch && dispatch.requestClauseRefs, 24);
        const requirementRefs = uniqueOverviewStrings(dispatch && dispatch.requirementRefs, 24);
        const acceptanceRefs = uniqueOverviewStrings(dispatch && dispatch.acceptanceCheckRefs, 16);
        if (clauseRefs.length || requirementRefs.length || acceptanceRefs.length) return "";
        return safeString(dispatch && dispatch.dispatchId, 120) || `dispatch-${index + 1}`;
      }).filter(Boolean),
      16
    );
    const orphanPlanStepIds = uniqueOverviewStrings(
      traceability.planSteps.map((step, index) => {
        const clauseRefs = uniqueOverviewStrings(step && step.requestClauseRefs, 24);
        const requirementRefs = uniqueOverviewStrings(step && step.requirementRefs, 24);
        const acceptanceRefs = uniqueOverviewStrings(step && step.acceptanceCheckRefs, 16);
        if (clauseRefs.length || requirementRefs.length || acceptanceRefs.length) return "";
        return safeString(step && step.stepId, 120) || `plan-${index + 1}`;
      }).filter(Boolean),
      16
    );
    const coreMappedCount = mappedCoreClauses.length;
    const dispatchCoveredCoreCount = mappedCoreClauses.filter((entry) => Array.isArray(entry && entry.dispatchIds) && entry.dispatchIds.length).length;
    const planCoveredCoreCount = mappedCoreClauses.filter((entry) => Array.isArray(entry && entry.planStepIds) && entry.planStepIds.length).length;
    const fullyCoveredCoreCount = mappedCoreClauses.filter((entry) =>
      Array.isArray(entry && entry.dispatchIds) && entry.dispatchIds.length
      && Array.isArray(entry && entry.planStepIds) && entry.planStepIds.length
    ).length;
    const acceptanceLinkedCoreCount = mappedCoreClauses.filter((entry) =>
      Array.isArray(entry && entry.acceptanceCheckRefs) && entry.acceptanceCheckRefs.length
    ).length;
    const rate = (covered, total) => total > 0 ? Number((covered / total).toFixed(4)) : 0;
    let status = "PASS";
    let reason = "no_drift";
    if (!coreClauses.length) {
      status = "NO_BASELINE";
      reason = "no_core_request_clauses";
    } else if (unmappedCoreClauseIds.length) {
      status = "LOCK_INCOMPLETE";
      reason = "core_unmapped_before_post_lock";
    } else if (driftedClauseIds.length) {
      status = "FAIL";
      reason = "downstream_clause_gap";
    } else if (orphanDispatchIds.length || orphanPlanStepIds.length) {
      status = "FAIL";
      reason = "orphan_downstream_trace";
    }
    const driftedClauseIdSet = new Set(driftedClauseIds);
    return {
      schema: "post-lock-drift.v1",
      status,
      reason,
      planningDepth: traceability.plan.planningDepth
        || safeString(traceability.sanitizedPlanning && traceability.sanitizedPlanning.selection && traceability.sanitizedPlanning.selection.selectedPlanningDepth, 80)
        || "",
      assuranceDepth: traceability.plan.assuranceDepth
        || safeString(traceability.sanitizedPlanning && traceability.sanitizedPlanning.selection && traceability.sanitizedPlanning.selection.selectedAssuranceDepth, 80)
        || "",
      flowPath: traceability.plan.flowPath
        || safeString(traceability.sanitizedPlanning && traceability.sanitizedPlanning.selection && traceability.sanitizedPlanning.selection.flowPath, 80)
        || "",
      counts: {
        totalClauses: traceability.clauses.length,
        coreClauseCount: coreClauses.length,
        coreMappedCount,
        coreUnmappedCount: unmappedCoreClauseIds.length,
        dispatchCount: traceability.dispatches.length,
        planStepCount: traceability.planSteps.length,
        dispatchCoveredCoreCount,
        planCoveredCoreCount,
        fullyCoveredCoreCount,
        acceptanceLinkedCoreCount,
        dispatchGapCount: dispatchGapClauseIds.length,
        planGapCount: planGapClauseIds.length,
        driftedClauseCount: driftedClauseIds.length,
        orphanDispatchCount: orphanDispatchIds.length,
        orphanPlanStepCount: orphanPlanStepIds.length,
      },
      rates: {
        dispatchCoverageRate: rate(dispatchCoveredCoreCount, coreMappedCount),
        planCoverageRate: rate(planCoveredCoreCount, coreMappedCount),
        fullCoverageRate: rate(fullyCoveredCoreCount, coreMappedCount),
        driftRate: rate(driftedClauseIds.length, coreMappedCount),
      },
      unmappedCoreClauseIds,
      dispatchGapClauseIds,
      planGapClauseIds,
      driftedClauseIds,
      orphanDispatchIds,
      orphanPlanStepIds,
      driftedClauses: traceability.clauses.filter((entry) => driftedClauseIdSet.has(entry.clauseId)).map((entry) => ({
        clauseId: entry.clauseId,
        text: safeString(entry && entry.text, 320),
        dispatchIds: uniqueOverviewStrings(entry && entry.dispatchIds, 12),
        planStepIds: uniqueOverviewStrings(entry && entry.planStepIds, 16),
        acceptanceCheckRefs: uniqueOverviewStrings(entry && entry.acceptanceCheckRefs, 16),
      })),
    };
  }

  return Object.freeze({
    buildPlanningTraceabilityData,
    buildHarnessTraceabilitySnapshot,
    buildPostLockDriftSnapshot,
  });
}

module.exports = {
  createTraceabilityService,
};
