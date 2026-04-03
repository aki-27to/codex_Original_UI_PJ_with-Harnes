"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");

const releaseDecisionStates = Object.freeze([
  "RELEASE_APPROVED",
  "RELEASE_APPROVED_WITH_ASSUMPTIONS",
  "RELEASE_BLOCKED",
  "EXTERNAL_ACTION_REQUIRED",
  "HARNESS_FAILURE",
]);

function safeString(value, max = 2000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function uniqueStrings(values, max = 24) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 320);
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

function toCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function repoRelative(targetPath) {
  return path.relative(workspaceRoot, path.resolve(targetPath)).replace(/\\/g, "/");
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw ? JSON.parse(raw) : null;
}

function loadOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function loadConfigJson(name) {
  return readJson(path.join(workspaceRoot, "scripts", "config", name));
}

function normalizePlanningDepth(value) {
  const normalized = safeString(value, 60).toUpperCase();
  if (normalized === "FAST_PLANNING" || normalized === "STANDARD_PLANNING" || normalized === "DISCOVERY_PLANNING") {
    return normalized;
  }
  return "STANDARD_PLANNING";
}

function normalizeAssuranceDepth(value) {
  const normalized = safeString(value, 60).toUpperCase();
  if (normalized === "LIGHT_ASSURANCE" || normalized === "STANDARD_ASSURANCE" || normalized === "SIGNOFF_ASSURANCE") {
    return normalized;
  }
  return "STANDARD_ASSURANCE";
}

function normalizeLane(value) {
  const normalized = safeString(value, 40).toUpperCase();
  if (normalized === "DISCOVERY") {
    return "DISCOVERY";
  }
  return "DELIVERY";
}

function normalizeReleaseState(value) {
  const normalized = safeString(value, 80).toUpperCase();
  return releaseDecisionStates.includes(normalized) ? normalized : "HARNESS_FAILURE";
}

function summarizePlanningScore(selection) {
  const source = selection && typeof selection === "object" ? selection : {};
  const breakdown = source.planningScoreBreakdown && typeof source.planningScoreBreakdown === "object"
    ? source.planningScoreBreakdown
    : {};
  return {
    ambiguity: toCount(breakdown.ambiguity),
    acceptance_uncertainty: toCount(breakdown.acceptance_uncertainty),
    novelty: toCount(breakdown.novelty),
    external_dependency: toCount(breakdown.external_dependency),
    total: toCount(breakdown.total || source.planningScore),
    rationale: uniqueStrings(breakdown.rationale, 8),
  };
}

function summarizeAssuranceScore(selection) {
  const source = selection && typeof selection === "object" ? selection : {};
  const breakdown = source.assuranceScoreBreakdown && typeof source.assuranceScoreBreakdown === "object"
    ? source.assuranceScoreBreakdown
    : {};
  return {
    blast_radius: toCount(breakdown.blast_radius),
    irreversibility: toCount(breakdown.irreversibility),
    release_criticality: toCount(breakdown.release_criticality),
    evidence_burden: toCount(breakdown.evidence_burden),
    total: toCount(breakdown.total || source.assuranceScore),
    rationale: uniqueStrings(breakdown.rationale, 8),
  };
}

function deriveRiskClass({ selection, finalOutcome } = {}) {
  const assuranceDepth = normalizeAssuranceDepth(selection && selection.selectedAssuranceDepth);
  const outcomeStatus = safeString(finalOutcome && finalOutcome.taskOutcomeStatus, 80).toUpperCase();
  if (assuranceDepth === "SIGNOFF_ASSURANCE") {
    return "signoff_critical";
  }
  if (outcomeStatus === "FAILED_VALIDATION" || outcomeStatus === "BLOCKED") {
    return "high";
  }
  if (assuranceDepth === "STANDARD_ASSURANCE") {
    return "medium";
  }
  return "low";
}

function buildRequestFrame({ requirementContract, selection, finalOutcome } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const normalizedSelection = selection && typeof selection === "object" ? selection : {};
  return {
    schema: "RequestFrame.v1",
    user_goal: safeString(requirement.explicitGoal, 320) || "Unspecified user goal",
    expected_deliverable: uniqueStrings([
      ...(Array.isArray(requirement.baselineScope) ? requirement.baselineScope : []),
      ...(Array.isArray(requirement.overDeliveryScope) ? requirement.overDeliveryScope : []),
    ], 16),
    constraints: uniqueStrings([
      ...(Array.isArray(requirement.nonGoals) ? requirement.nonGoals : []),
      ...(Array.isArray(requirement.approvalBoundaryItems) ? requirement.approvalBoundaryItems : []),
    ], 16),
    acceptance_criteria: (Array.isArray(requirement.acceptanceChecks) ? requirement.acceptanceChecks : [])
      .map((entry) => safeString(entry && entry.title, 240))
      .filter(Boolean)
      .slice(0, 16),
    ambiguity_points: uniqueStrings(requirement.openQuestions, 16),
    risk_class: deriveRiskClass({ selection: normalizedSelection, finalOutcome }),
    external_dependencies: uniqueStrings(requirement.approvalBoundaryItems, 12),
    assumption_policy: uniqueStrings([
      ...(Array.isArray(requirement.assumptions) ? requirement.assumptions : []),
      "Unresolved ambiguity must not be auto-answered by the harness.",
    ], 12),
    requested_release_posture: normalizeAssuranceDepth(requirement.selectedAssuranceDepth || normalizedSelection.selectedAssuranceDepth),
  };
}

function buildDispatchGraph(dispatchPlan) {
  const dispatches = Array.isArray(dispatchPlan && dispatchPlan.dispatches) ? dispatchPlan.dispatches : [];
  const nodes = [
    { id: "parent", role: "default" },
    ...dispatches.map((entry) => ({
      id: safeString(entry.dispatchId, 80) || safeString(entry.ownerAgent, 80),
      role: safeString(entry.ownerAgent, 80) || "unknown",
    })),
  ];
  const edges = dispatches.map((entry) => ({
    from: "parent",
    to: safeString(entry.dispatchId, 80) || safeString(entry.ownerAgent, 80),
    owned_paths: Array.isArray(entry.ownedPaths) ? entry.ownedPaths.slice(0, 12) : [],
  }));
  return { nodes, edges };
}

function buildRoutingDecision({ selection, dispatchPlan, evidenceContract } = {}) {
  const normalizedSelection = selection && typeof selection === "object" ? selection : {};
  const normalizedDispatch = dispatchPlan && typeof dispatchPlan === "object" ? dispatchPlan : {};
  const planningScore = summarizePlanningScore(normalizedSelection);
  const assuranceScore = summarizeAssuranceScore(normalizedSelection);
  const evidenceClasses = evidenceContract && evidenceContract.evidenceClasses && typeof evidenceContract.evidenceClasses === "object"
    ? Object.keys(evidenceContract.evidenceClasses)
    : [];
  return {
    schema: "RoutingDecision.v1",
    lane: normalizeLane(normalizedSelection.selectedMode),
    planning_depth: normalizePlanningDepth(normalizedSelection.selectedPlanningDepth || normalizedDispatch.planningDepth),
    assurance_depth: normalizeAssuranceDepth(normalizedSelection.selectedAssuranceDepth || normalizedDispatch.assuranceDepth),
    dispatch_graph: buildDispatchGraph(normalizedDispatch),
    agent_assignments: (Array.isArray(normalizedDispatch.dispatches) ? normalizedDispatch.dispatches : []).map((entry) => ({
      dispatch_id: safeString(entry.dispatchId, 80),
      actor: safeString(entry.ownerAgent, 80),
      owned_paths: Array.isArray(entry.ownedPaths) ? entry.ownedPaths.slice(0, 12) : [],
      task_summary: safeString(entry.taskSummary, 320),
    })),
    required_evidence_classes: uniqueStrings([
      ...evidenceClasses,
      ...(Array.isArray(normalizedDispatch.expectedEvidence) ? normalizedDispatch.expectedEvidence : []),
    ], 24),
    review_requirements: {
      reviewer_required: normalizedDispatch.reviewerRequired ? 1 : 0,
      tester_required: normalizedDispatch.testerRequired ? 1 : 0,
      signoff_required: normalizedDispatch.signoffRequired ? 1 : 0,
      dedicated_tests_required: normalizedDispatch.dedicatedTestsRequired ? 1 : 0,
    },
    routing_rationale: uniqueStrings([
      ...(Array.isArray(normalizedSelection.planningReasons) ? normalizedSelection.planningReasons : []),
      ...(Array.isArray(normalizedSelection.assuranceReasons) ? normalizedSelection.assuranceReasons : []),
    ], 16),
    planning_score: planningScore,
    assurance_score: assuranceScore,
  };
}

function buildTaskOutcomesArtifact({
  childEvidenceLedger,
  finalOutcome,
  acceptanceResults,
  changedPaths,
  evidenceRefs,
  turnId,
} = {}) {
  const ledger = Array.isArray(childEvidenceLedger) ? childEvidenceLedger : [];
  const criterionIds = (Array.isArray(acceptanceResults) ? acceptanceResults : [])
    .map((entry) => safeString(entry && entry.id, 80))
    .filter(Boolean);
  const childOutcomes = ledger.map((entry, index) => ({
    task_id: safeString(entry && entry.agent, 80) ? `${safeString(entry.agent, 80)}-${index + 1}` : `child-${index + 1}`,
    actor: safeString(entry && entry.agent, 80) || "unknown",
    status: toCount(entry && entry.failedCount) > 0 && toCount(entry && entry.completedCount) === 0 ? "BLOCKED" : "COMPLETED",
    claimed_work: uniqueStrings(entry && entry.evidenceNotes, 6),
    changed_artifacts: Array.isArray(entry && entry.ownedPaths) ? entry.ownedPaths.slice(0, 12) : [],
    evidence_refs: uniqueStrings([
      ...(Array.isArray(entry && entry.evidenceNotes) ? entry.evidenceNotes : []),
      ...(Array.isArray(evidenceRefs) ? evidenceRefs : []),
    ], 12),
    unresolved_items: toCount(entry && entry.failedCount) > 0 ? ["child_dispatch_failed_or_incomplete"] : [],
    acceptance_coverage: criterionIds,
    handoff_readiness: toCount(entry && entry.failedCount) > 0 ? "needs_follow_up" : "ready_for_review",
  }));
  childOutcomes.push({
    task_id: safeString(turnId, 120) || "parent-run",
    actor: "default",
    status: safeString(finalOutcome && finalOutcome.taskOutcomeStatus, 80).toUpperCase() || "BLOCKED",
    claimed_work: ["Aggregate child outcomes into review and release decision artifacts."],
    changed_artifacts: uniqueStrings(changedPaths, 16),
    evidence_refs: uniqueStrings(evidenceRefs, 12),
    unresolved_items: [],
    acceptance_coverage: criterionIds,
    handoff_readiness: "ready_for_release_decision",
  });
  return {
    schema: "TaskOutcomeList.v1",
    task_outcomes: childOutcomes,
  };
}

function collectReviewerFindings(childEvidenceLedger) {
  const findings = [];
  for (const entry of Array.isArray(childEvidenceLedger) ? childEvidenceLedger : []) {
    const notes = Array.isArray(entry && entry.evidenceNotes) ? entry.evidenceNotes : [];
    if (!(entry && entry.reviewerObserved)) {
      continue;
    }
    for (const note of notes) {
      const text = safeString(note, 320);
      if (!text) {
        continue;
      }
      findings.push({
        actor: safeString(entry.agent, 80) || "reviewer",
        note: text,
      });
    }
  }
  return findings.slice(0, 24);
}

function deriveRecommendedReleaseState({ finalOutcome, missingEvidence, residualRisks, assumptions, clauseCompletionScorecard }) {
  const outcomeStatus = safeString(finalOutcome && finalOutcome.taskOutcomeStatus, 80).toUpperCase();
  const clauseScorecard = clauseCompletionScorecard && typeof clauseCompletionScorecard === "object" ? clauseCompletionScorecard : {};
  const clauseSummary = clauseScorecard.summary && typeof clauseScorecard.summary === "object" ? clauseScorecard.summary : {};
  if (toCount(clauseSummary.unsatisfiedCount) > 0) {
    return "HARNESS_FAILURE";
  }
  if (outcomeStatus === "FAILED_VALIDATION") {
    return "HARNESS_FAILURE";
  }
  if (outcomeStatus === "NEEDS_INPUT") {
    return "EXTERNAL_ACTION_REQUIRED";
  }
  if (outcomeStatus === "BLOCKED") {
    return "RELEASE_BLOCKED";
  }
  if (Array.isArray(missingEvidence) && missingEvidence.length > 0) {
    return "HARNESS_FAILURE";
  }
  if ((Array.isArray(residualRisks) && residualRisks.length > 0) || (Array.isArray(assumptions) && assumptions.length > 0)) {
    return "RELEASE_APPROVED_WITH_ASSUMPTIONS";
  }
  return "RELEASE_APPROVED";
}

function buildReviewBundle({
  acceptanceResults,
  childEvidenceLedger,
  requiredEvidenceFailures,
  residualRisks,
  assumptions,
  finalOutcome,
  clauseCompletionScorecard,
} = {}) {
  const coverage = (Array.isArray(acceptanceResults) ? acceptanceResults : []).map((entry) => ({
    criterion_id: safeString(entry && entry.id, 80),
    title: safeString(entry && entry.title, 240),
    status: safeString(entry && entry.status, 40).toUpperCase() || "UNKNOWN",
    evidence: Array.isArray(entry && entry.evidence) ? entry.evidence.slice(0, 8) : [],
  }));
  const missingEvidence = uniqueStrings(requiredEvidenceFailures, 16);
  const findings = collectReviewerFindings(childEvidenceLedger);
  const recommended = deriveRecommendedReleaseState({
    finalOutcome,
    missingEvidence,
    residualRisks,
    assumptions,
    clauseCompletionScorecard,
  });
  return {
    schema: "ReviewBundle.v1",
    acceptance_coverage_matrix: coverage,
    reviewer_findings: findings,
    severity: clauseCompletionScorecard && clauseCompletionScorecard.summary && toCount(clauseCompletionScorecard.summary.unsatisfiedCount) > 0
      ? "critical"
      : missingEvidence.length > 0
        ? "high"
        : findings.length > 0
          ? "medium"
          : "none",
    residual_risk: uniqueStrings(residualRisks, 16),
    missing_evidence: missingEvidence,
    pass_fail_per_criterion: coverage.map((entry) => ({
      criterion_id: entry.criterion_id,
      status: entry.status,
    })),
    clause_completion_scorecard: clauseCompletionScorecard && typeof clauseCompletionScorecard === "object"
      ? clauseCompletionScorecard
      : {
          schema: "clause-completion-scorecard.v1",
          status: "PASS",
          reason: "all_core_clauses_satisfied",
          summary: { coreTotal: 0, satisfiedCount: 0, unsatisfiedCount: 0, waivedCount: 0 },
          clauses: [],
        },
    recommended_release_state: recommended,
  };
}

function buildDiscoveryOutcome({ requirementContract, dispatchPlan, selection } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const normalizedSelection = selection && typeof selection === "object" ? selection : {};
  const normalizedDispatch = dispatchPlan && typeof dispatchPlan === "object" ? dispatchPlan : {};
  return {
    schema: "DiscoveryOutcome.v1",
    open_questions: uniqueStrings(requirement.openQuestions, 16),
    assumptions: uniqueStrings(requirement.assumptions, 12),
    candidate_hypotheses: uniqueStrings(requirement.overDeliveryScope, 12),
    disconfirming_evidence: uniqueStrings(normalizedDispatch.residualRisks, 12),
    decision_boundary: uniqueStrings([
      ...(Array.isArray(requirement.approvalBoundaryItems) ? requirement.approvalBoundaryItems : []),
      normalizedDispatch.proposalOnly ? "Implementation remains proposal-only until ambiguity is resolved." : "",
    ], 12),
    non_goals: uniqueStrings(requirement.nonGoals, 12),
    recommended_next_path: normalizeLane(normalizedSelection.selectedMode) === "DISCOVERY"
      ? "Resolve open questions or approval boundary items, then re-run DELIVERY."
      : "Proceed with DELIVERY.",
    confidence_rationale: uniqueStrings(normalizedSelection.planningReasons, 8),
  };
}

function buildReleaseDecision({
  finalOutcome,
  reviewBundle,
  signoffRefs,
  replayBundleRefs,
  residualRisks,
  assumptions,
  missingEvidence,
  clauseCompletionScorecard,
  rationaleNotes,
} = {}) {
  const recommended = safeString(reviewBundle && reviewBundle.recommended_release_state, 80);
  const terminalState = normalizeReleaseState(
    recommended || deriveRecommendedReleaseState({ finalOutcome, missingEvidence, residualRisks, assumptions, clauseCompletionScorecard })
  );
  const clauseScorecard = clauseCompletionScorecard && typeof clauseCompletionScorecard === "object"
    ? clauseCompletionScorecard
    : reviewBundle && reviewBundle.clause_completion_scorecard && typeof reviewBundle.clause_completion_scorecard === "object"
      ? reviewBundle.clause_completion_scorecard
      : {};
  const unsatisfiedClauses = Array.isArray(clauseScorecard.clauses)
    ? clauseScorecard.clauses
        .filter((entry) => safeString(entry && entry.status, 40) === "unsatisfied")
        .map((entry) => {
          const clauseId = safeString(entry && entry.clauseId, 80);
          const text = safeString(entry && entry.text, 160);
          return clauseId && text ? `${clauseId}: ${text}` : clauseId || text;
        })
        .filter(Boolean)
    : [];
  return {
    schema: "ReleaseDecision.v1",
    terminal_state: terminalState,
    rationale: uniqueStrings([
      ...(Array.isArray(rationaleNotes) ? rationaleNotes : []),
      safeString(finalOutcome && finalOutcome.taskOutcomeReason, 160),
      safeString(reviewBundle && reviewBundle.severity, 80) ? `review_severity=${safeString(reviewBundle.severity, 80)}` : "",
    ], 16),
    signoff_refs: uniqueStrings(signoffRefs, 12),
    blocker_list: terminalState === "RELEASE_BLOCKED" || terminalState === "HARNESS_FAILURE"
      ? uniqueStrings([
          ...(Array.isArray(missingEvidence) ? missingEvidence : []),
          ...unsatisfiedClauses,
          ...(Array.isArray(residualRisks) ? residualRisks : []),
        ], 16)
      : [],
    waived_risks: terminalState === "RELEASE_APPROVED_WITH_ASSUMPTIONS" ? uniqueStrings(residualRisks, 12) : [],
    remaining_conditions: terminalState === "EXTERNAL_ACTION_REQUIRED"
      ? uniqueStrings([
          ...(Array.isArray(assumptions) ? assumptions : []),
          "External decision or user input is still required.",
        ], 12)
      : terminalState === "HARNESS_FAILURE"
        ? uniqueStrings(missingEvidence, 12)
        : [],
    replay_bundle_refs: uniqueStrings(replayBundleRefs, 12),
  };
}

function buildOperatorViewSummary({
  latestRunSummary,
  reviewBundle,
  releaseDecision,
  conformanceReport,
  routingDecision,
} = {}) {
  const latestRun = latestRunSummary && typeof latestRunSummary === "object" ? latestRunSummary : {};
  const review = reviewBundle && typeof reviewBundle === "object" ? reviewBundle : {};
  const release = releaseDecision && typeof releaseDecision === "object" ? releaseDecision : {};
  const conformance = conformanceReport && typeof conformanceReport === "object" ? conformanceReport : {};
  const routing = routingDecision && typeof routingDecision === "object" ? routingDecision : {};
  return {
    schema: "operator-view-summary.v1",
    current_phase: safeString(latestRun.currentPhase, 80) || "Release / Close",
    current_lane: safeString(routing.lane, 40) || "DELIVERY",
    planning_depth: safeString(routing.planning_depth, 80) || safeString(latestRun.selectedPlanningDepth, 80) || "STANDARD_PLANNING",
    assurance_depth: safeString(routing.assurance_depth, 80) || safeString(latestRun.selectedAssuranceDepth, 80) || "STANDARD_ASSURANCE",
    dispatch_graph: routing.dispatch_graph || { nodes: [], edges: [] },
    current_blockers: uniqueStrings([
      ...(Array.isArray(release.blocker_list) ? release.blocker_list : []),
      ...(Array.isArray(review.missing_evidence) ? review.missing_evidence : []),
    ], 16),
    evidence_completeness: {
      missing_evidence_count: toCount(review && Array.isArray(review.missing_evidence) ? review.missing_evidence.length : 0),
      acceptance_criteria_total: toCount(review && Array.isArray(review.acceptance_coverage_matrix) ? review.acceptance_coverage_matrix.length : 0),
      acceptance_criteria_passed: toCount(
        review && Array.isArray(review.acceptance_coverage_matrix)
          ? review.acceptance_coverage_matrix.filter((entry) => safeString(entry && entry.status, 40).toUpperCase() === "PASS").length
          : 0
      ),
      core_clause_total: toCount(review && review.clause_completion_scorecard && review.clause_completion_scorecard.summary && review.clause_completion_scorecard.summary.coreTotal),
      core_clause_satisfied: toCount(review && review.clause_completion_scorecard && review.clause_completion_scorecard.summary && review.clause_completion_scorecard.summary.satisfiedCount),
      core_clause_unsatisfied: toCount(review && review.clause_completion_scorecard && review.clause_completion_scorecard.summary && review.clause_completion_scorecard.summary.unsatisfiedCount),
    },
    residual_risk: uniqueStrings(review.residual_risk, 16),
    release_state: safeString(release.terminal_state, 80) || "HARNESS_FAILURE",
    violated_invariants: uniqueStrings(
      Array.isArray(conformance.invariants)
        ? conformance.invariants.filter((entry) => entry && entry.status === "fail").map((entry) => entry.id)
        : [],
      16
    ),
    remaining_conditions_to_release: uniqueStrings(release.remaining_conditions, 16),
  };
}

function evaluateInvariantStatuses({
  invariantsContract,
  latestRunSummary,
  requestFrame,
  routingDecision,
  taskOutcomes,
  reviewBundle,
  releaseDecision,
  signoffSummary,
  traceSummary,
} = {}) {
  const latestRun = latestRunSummary && typeof latestRunSummary === "object" ? latestRunSummary : {};
  const routing = routingDecision && typeof routingDecision === "object" ? routingDecision : {};
  const outcomes = taskOutcomes && Array.isArray(taskOutcomes.task_outcomes) ? taskOutcomes.task_outcomes : [];
  const review = reviewBundle && typeof reviewBundle === "object" ? reviewBundle : {};
  const release = releaseDecision && typeof releaseDecision === "object" ? releaseDecision : {};
  const signoff = signoffSummary && typeof signoffSummary === "object" ? signoffSummary : {};
  const trace = traceSummary && typeof traceSummary === "object" ? traceSummary : {};
  const finalOutcome = latestRun.finalOutcome && typeof latestRun.finalOutcome === "object" ? latestRun.finalOutcome : {};
  const signoffAllPassed = Boolean(signoff.allPassed || (signoff.assertions && signoff.assertions.allPassed));
  const invariants = Array.isArray(invariantsContract && invariantsContract.invariants) ? invariantsContract.invariants : [];
  const autonomyFirstPolicies = new Set(["auto-default", "auto-empty"]);
  const liveRuntimePolicy = safeString(trace.runtimeDefaultRequestUserInputPolicy, 80).toLowerCase();
  const latestRunPolicy = safeString(latestRun.requestUserInputPolicy, 80).toLowerCase();
  const tracePolicy = safeString(trace.requestUserInputPolicy, 80).toLowerCase();
  const signoffPolicy = safeString(signoff.runtime && signoff.runtime.nonInteractiveUserInput && signoff.runtime.nonInteractiveUserInput.policy, 80).toLowerCase();
  const strictLane = safeString(routing.assurance_depth, 80) === "SIGNOFF_ASSURANCE"
    || safeString(latestRun.selectedAssuranceDepth, 80) === "SIGNOFF_ASSURANCE";
  const liveRuntimeAutonomyFirst = autonomyFirstPolicies.has(liveRuntimePolicy);
  const observedRunAutonomyFirst = autonomyFirstPolicies.has(latestRunPolicy) || autonomyFirstPolicies.has(tracePolicy);
  const strictLaneBlocked = strictLane && [latestRunPolicy, tracePolicy, signoffPolicy].includes("blocked");
  const derived = {
    "control.parent_no_material_implementation":
      !(latestRun.parentMaterialImplementationObserved || (trace.invariants && trace.invariants.parentMaterialImplementationObserved)),
    "control.material_change_maps_to_dispatch":
      !(latestRun.implementationObserved && toCount(latestRun.dispatchSuccessCount) === 0),
    "control.routing_before_child_execution":
      Boolean(requestFrame && requestFrame.schema && routing && routing.schema),
    "control.retired_worker_not_runtime":
      !Array.isArray(latestRun.usedAgents) || !latestRun.usedAgents.includes("worker"),
    "execution.autonomy_first_user_input_posture":
      liveRuntimePolicy
        ? liveRuntimeAutonomyFirst
        : (observedRunAutonomyFirst || strictLaneBlocked),
    "execution.task_outcome_required":
      outcomes.length > 0,
    "execution.delivery_evidence_per_material_claim":
      !latestRun.implementationObserved || (Array.isArray(review.acceptance_coverage_matrix) && review.acceptance_coverage_matrix.length > 0),
    "execution.discovery_boundary_outputs":
      routing.lane !== "DISCOVERY" || Boolean(trace.discoveryOutcome && trace.discoveryOutcome.open_questions && trace.discoveryOutcome.decision_boundary),
    "assurance.review_bundle_required":
      Boolean(review && review.schema),
    "assurance.signoff_requires_evidence_classes":
      routing.assurance_depth !== "SIGNOFF_ASSURANCE" || signoffAllPassed,
    "assurance.depth_requirements_satisfied":
      routing.assurance_depth !== "SIGNOFF_ASSURANCE" || (Array.isArray(review.missing_evidence) && review.missing_evidence.length === 0),
    "assurance.business_terminal_state_only":
      releaseDecisionStates.includes(safeString(release.terminal_state, 80)),
    "audit.replay_lineage_reconstructible":
      Boolean(latestRun.turnId || latestRun.threadId || (trace.turn && trace.turn.turnId)),
    "audit.blockers_and_risk_explicit":
      Array.isArray(review.residual_risk) && Array.isArray(release.blocker_list),
    "audit.acceptance_coverage_inspectable":
      Array.isArray(review.acceptance_coverage_matrix) && review.acceptance_coverage_matrix.length > 0,
  };
  return invariants.map((entry) => ({
    id: safeString(entry && entry.id, 120),
    plane: safeString(entry && entry.plane, 80),
    statement: safeString(entry && entry.statement, 320),
    status: derived[safeString(entry && entry.id, 120)] ? "pass" : "fail",
  }));
}

function buildConformanceReport(input = {}) {
  const invariantsContract = input.invariantsContract || loadConfigJson("conformance_invariants.json");
  const evidenceContract = input.evidenceContract || loadConfigJson("evidence_contract.json");
  const requestFrame = buildRequestFrame({
    requirementContract: input.requirementContract,
    selection: input.selection,
    finalOutcome: input.latestRunSummary && input.latestRunSummary.finalOutcome,
  });
  const routingDecision = buildRoutingDecision({
    selection: input.selection,
    dispatchPlan: input.dispatchPlan,
    evidenceContract,
  });
  const taskOutcomes = buildTaskOutcomesArtifact({
    childEvidenceLedger: input.childEvidenceLedger,
    finalOutcome: input.latestRunSummary && input.latestRunSummary.finalOutcome,
    acceptanceResults: input.acceptanceResults,
    changedPaths: input.latestRunSummary && input.latestRunSummary.changedPaths,
    evidenceRefs: input.evidenceRefs,
    turnId: input.latestRunSummary && input.latestRunSummary.turnId,
  });
  const reviewBundle = buildReviewBundle({
    acceptanceResults: input.acceptanceResults,
    childEvidenceLedger: input.childEvidenceLedger,
    requiredEvidenceFailures: input.requiredEvidenceFailures,
    residualRisks: input.latestRunSummary && input.latestRunSummary.residualRisks,
    assumptions: input.latestRunSummary && input.latestRunSummary.assumptions,
    finalOutcome: input.latestRunSummary && input.latestRunSummary.finalOutcome,
  });
  const discoveryOutcome = buildDiscoveryOutcome({
    requirementContract: input.requirementContract,
    dispatchPlan: input.dispatchPlan,
    selection: input.selection,
  });
  const releaseDecision = buildReleaseDecision({
    finalOutcome: input.latestRunSummary && input.latestRunSummary.finalOutcome,
    reviewBundle,
    signoffRefs: input.evidenceRefs,
    replayBundleRefs: input.replayBundleRefs,
    residualRisks: input.latestRunSummary && input.latestRunSummary.residualRisks,
    assumptions: input.latestRunSummary && input.latestRunSummary.assumptions,
    missingEvidence: input.requiredEvidenceFailures,
    rationaleNotes: input.rationaleNotes,
  });
  const invariantStatuses = evaluateInvariantStatuses({
    invariantsContract,
    latestRunSummary: input.latestRunSummary,
    requestFrame,
    routingDecision,
    taskOutcomes,
    reviewBundle,
    releaseDecision,
    signoffSummary: input.signoffSummary,
    traceSummary: {
      discoveryOutcome,
      turn: {
        turnId: input.latestRunSummary && input.latestRunSummary.turnId,
      },
      runtimeDefaultRequestUserInputPolicy: input.runtimeRequestUserInputPolicy,
      requestUserInputPolicy: input.latestRunSummary && input.latestRunSummary.requestUserInputPolicy,
      invariants: {
        parentMaterialImplementationObserved: Boolean(input.latestRunSummary && input.latestRunSummary.parentMaterialImplementationObserved),
      },
    },
  });
  const violatedInvariants = invariantStatuses.filter((entry) => entry.status === "fail").map((entry) => entry.id);
  const operatorView = buildOperatorViewSummary({
    latestRunSummary: {
      ...input.latestRunSummary,
      currentPhase: "Release / Close",
    },
    reviewBundle,
    releaseDecision,
    conformanceReport: { invariants: invariantStatuses },
    routingDecision,
  });
  return {
    schema: "conformance-report.v1",
    generatedAt: new Date().toISOString(),
    requestFrame,
    routingDecision,
    taskOutcomes,
    reviewBundle,
    releaseDecision,
    discoveryOutcome,
    invariants: invariantStatuses,
    violatedInvariants,
    evidenceContractRef: repoRelative(path.join(workspaceRoot, "scripts", "config", "evidence_contract.json")),
    operatorView,
  };
}

module.exports = {
  buildConformanceReport,
  buildDiscoveryOutcome,
  buildOperatorViewSummary,
  buildReleaseDecision,
  buildRequestFrame,
  buildReviewBundle,
  buildRoutingDecision,
  buildTaskOutcomesArtifact,
  loadConfigJson,
  loadOptionalJson,
  normalizeReleaseState,
  releaseDecisionStates,
  repoRelative,
  summarizeAssuranceScore,
  summarizePlanningScore,
  uniqueStrings,
};
