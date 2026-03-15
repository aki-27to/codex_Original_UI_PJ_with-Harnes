"use strict";

function safeString(value, max = 4000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!Number.isFinite(Number(max)) || max <= 0) {
    return trimmed;
  }
  return trimmed.slice(0, Math.trunc(Number(max)));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values, max = 8) {
  const seen = new Set();
  const result = [];
  for (const value of toArray(values)) {
    const text = safeString(String(value || ""), 160);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

function normalizeAgentName(value) {
  return safeString(String(value || ""), 80).toLowerCase();
}

function formatOwnerLabel(ownerAgent) {
  const normalized = normalizeAgentName(ownerAgent);
  if (!normalized) {
    return "default";
  }
  return normalized;
}

function joinOwnerLabels(labels) {
  const normalized = uniqueStrings(labels, 4);
  if (!normalized.length) {
    return "default";
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  if (normalized.length === 2) {
    return `${normalized[0]} + ${normalized[1]}`;
  }
  return `${normalized.slice(0, -1).join(", ")} + ${normalized[normalized.length - 1]}`;
}

function translateQualityLabel(label) {
  const normalized = safeString(label, 80).toLowerCase();
  if (normalized === "reviewer") return "\u30ec\u30d3\u30e5\u30fc";
  if (normalized === "tester") return "\u30c6\u30b9\u30c8";
  if (normalized === "dedicated tests") return "\u5c02\u7528\u30c6\u30b9\u30c8";
  if (normalized === "signoff") return "\u627f\u8a8d\u7528\u30c1\u30a7\u30c3\u30af";
  return safeString(label, 80);
}

function buildPlanningSummary(selection, dispatchPlan) {
  const planningMode = safeString(selection && selection.selectedMode, 40)
    || safeString(dispatchPlan && dispatchPlan.planningMode, 40)
    || "NORMAL";
  const planningDepth = safeString(selection && selection.selectedPlanningDepth, 60)
    || safeString(dispatchPlan && dispatchPlan.planningDepth, 60)
    || "STANDARD_PLANNING";
  const assuranceDepth = safeString(selection && selection.selectedAssuranceDepth, 60)
    || safeString(dispatchPlan && dispatchPlan.assuranceDepth, 60)
    || "STANDARD_ASSURANCE";
  const flowPath = safeString(selection && selection.flowPath, 80)
    || safeString(dispatchPlan && dispatchPlan.flowPath, 80)
    || "NORMAL_PATH";
  return { planningMode, planningDepth, assuranceDepth, flowPath };
}

function normalizeDispatches(dispatchPlan) {
  return toArray(dispatchPlan && dispatchPlan.dispatches).map((dispatch, index) => {
    const item = dispatch && typeof dispatch === "object" ? dispatch : {};
    return {
      dispatchId: safeString(item.dispatchId, 120) || `dispatch-${index + 1}`,
      ownerAgent: formatOwnerLabel(item.ownerAgent),
      taskSummary: safeString(item.taskSummary, 240),
      ownedPaths: uniqueStrings(item.ownedPaths, 8),
      acceptanceChecks: uniqueStrings(item.acceptanceChecks, 8),
    };
  }).filter((dispatch) => dispatch.ownerAgent || dispatch.taskSummary || dispatch.ownedPaths.length > 0);
}

function getClarificationSignals(planningContext) {
  const context = planningContext && typeof planningContext === "object" ? planningContext : {};
  const selectionSignals = context.selection && context.selection.signals && typeof context.selection.signals === "object"
    ? context.selection.signals
    : {};
  const planningSignals = context.planningDecisionContract && context.planningDecisionContract.planningSignals && typeof context.planningDecisionContract.planningSignals === "object"
    ? context.planningDecisionContract.planningSignals
    : {};
  return {
    action: safeString(selectionSignals.clarificationAction || planningSignals.clarificationAction, 40),
    question: safeString(selectionSignals.clarificationQuestion || planningSignals.clarificationQuestion, 320),
    summary: safeString(selectionSignals.clarificationSummary || planningSignals.clarificationSummary, 320),
  };
}

function shouldSkipDetailedPlan({ selection, dispatchPlan, requirementContract, agentName }) {
  if (safeString(selection && selection.signals && selection.signals.clarificationAction, 40) === "ask_user_once") {
    return false;
  }
  const dispatches = normalizeDispatches(dispatchPlan);
  if (dispatches.length !== 1) {
    return false;
  }
  if (dispatchPlan && (
    dispatchPlan.reviewerRequired
    || dispatchPlan.testerRequired
    || dispatchPlan.signoffRequired
    || dispatchPlan.dedicatedTestsRequired
  )) {
    return false;
  }
  const primary = dispatches[0];
  const activeAgent = normalizeAgentName(agentName) || "default";
  if (primary.ownerAgent !== activeAgent) {
    return false;
  }
  if (primary.ownedPaths.length > 0) {
    return false;
  }
  const acceptanceChecks = toArray(requirementContract && requirementContract.acceptanceChecks);
  if (acceptanceChecks.length > 0) {
    return false;
  }
  const openQuestions = toArray(requirementContract && requirementContract.openQuestions);
  if (openQuestions.length > 1) {
    return false;
  }
  const planningDepth = safeString(selection && selection.selectedPlanningDepth, 60)
    || safeString(dispatchPlan && dispatchPlan.planningDepth, 60);
  return planningDepth === "FAST_PLANNING" || planningDepth === "DISCOVERY_PLANNING";
}

function buildSkipExplanation(summary) {
  return `\u3053\u306e\u76f4\u63a5\u5fdc\u7b54\u30bf\u30fc\u30f3\u3067\u306f\u3001\u8a73\u7d30\u306a\u5b9f\u884c\u8a08\u753b\u3092\u7701\u7565\u3057\u307e\u3057\u305f (${summary.planningDepth} / ${summary.assuranceDepth})\u3002`;
}

function buildSkipStep() {
  return {
    stepId: "plan-skip",
    step: "\u591a\u6bb5\u306e\u5b9f\u884c\u8a08\u753b\u306f\u4f5c\u3089\u305a\u3001\u305d\u306e\u307e\u307e\u56de\u7b54\u307e\u305f\u306f\u78ba\u8a8d\u3092\u884c\u3044\u307e\u3059\u3002",
    status: "skipped",
    phase: "planning",
    kind: "skip",
    ownerAgent: "default",
  };
}

function buildDiscoverySteps(dispatches) {
  const primary = dispatches[0] || {};
  const firstStepText = primary.taskSummary
    || "\u5b9f\u88c5\u306b\u5165\u308b\u524d\u306b\u3001\u672a\u89e3\u6c7a\u306e\u8981\u4ef6\u3001\u524d\u63d0\u3001\u30e6\u30fc\u30b6\u30fc\u5224\u65ad\u5883\u754c\u3092\u6574\u7406\u3057\u307e\u3059\u3002";
  return [
    {
      stepId: primary.dispatchId || "discovery-clarify",
      step: firstStepText,
      status: "in_progress",
      phase: "planning",
      kind: "discovery",
      ownerAgent: primary.ownerAgent || "default",
    },
    {
      stepId: "needs-input-stop",
      step: "\u672a\u89e3\u6c7a\u306e\u78ba\u8a8d\u4e8b\u9805\u304c\u6b8b\u308b\u5834\u5408\u306f\u3001\u5b9f\u88c5\u524d\u306b\u30e6\u30fc\u30b6\u30fc\u5165\u529b\u3092\u6c42\u3081\u3066\u505c\u6b62\u3057\u307e\u3059\u3002",
      status: "pending",
      phase: "report",
      kind: "needs_input",
      ownerAgent: primary.ownerAgent || "default",
    },
  ];
}

function buildClarificationSteps(clarification, dispatches) {
  const primary = dispatches[0] || {};
  const question = clarification && clarification.question
    ? clarification.question
    : "\u5b9f\u88c5\u524d\u306b\u78ba\u8a8d\u8cea\u554f\u30921\u3064\u884c\u3044\u307e\u3059\u3002";
  return [
    {
      stepId: primary.dispatchId || "clarification-question",
      step: `\u5b9f\u88c5\u524d\u306b\u78ba\u8a8d\u8cea\u554f\u30921\u3064\u884c\u3044\u307e\u3059\u3002 ${question}`,
      status: "in_progress",
      phase: "planning",
      kind: "clarification",
      ownerAgent: primary.ownerAgent || "default",
    },
    {
      stepId: "clarification-wait",
      step: "\u30e6\u30fc\u30b6\u30fc\u306e\u56de\u7b54\u3092\u5f85\u3061\u3001\u305d\u306e\u5185\u5bb9\u3092\u8d77\u70b9\u306b\u5b9f\u884c\u8a08\u753b\u3092\u7d44\u307f\u76f4\u3057\u307e\u3059\u3002",
      status: "pending",
      phase: "report",
      kind: "needs_input",
      ownerAgent: primary.ownerAgent || "default",
    },
  ];
}

function buildExecutionStep(dispatches) {
  const owners = joinOwnerLabels(dispatches.map((dispatch) => dispatch.ownerAgent));
  const summaries = uniqueStrings(dispatches.map((dispatch) => dispatch.taskSummary), 3);
  const detail = summaries.length
    ? ` \u62c5\u5f53\u5185\u5bb9: ${summaries.join(" / ")}`
    : "";
  return {
    stepId: "execution",
    step: `\u5b9f\u884c: ${owners} \u304c\u62c5\u5f53\u7bc4\u56f2\u3092\u9032\u3081\u307e\u3059\u3002${detail}`,
    status: "in_progress",
    phase: "execution",
    kind: "execution",
    ownerAgent: owners,
  };
}

function buildQualityStep(dispatchPlan) {
  const labels = [];
  if (dispatchPlan && dispatchPlan.reviewerRequired) {
    labels.push(translateQualityLabel("reviewer"));
  }
  if (dispatchPlan && dispatchPlan.testerRequired) {
    labels.push(translateQualityLabel("tester"));
  }
  if (dispatchPlan && dispatchPlan.dedicatedTestsRequired) {
    labels.push(translateQualityLabel("dedicated tests"));
  }
  if (dispatchPlan && dispatchPlan.signoffRequired) {
    labels.push(translateQualityLabel("signoff"));
  }
  if (!labels.length) {
    return null;
  }
  return {
    stepId: "quality",
    step: `\u54c1\u8cea\u30b2\u30fc\u30c8: \u6700\u7d42\u5831\u544a\u306e\u524d\u306b ${labels.join("\u3001")} \u306e\u8a3c\u8de1\u3092\u63c3\u3048\u307e\u3059\u3002`,
    status: "pending",
    phase: "quality",
    kind: "quality",
    ownerAgent: labels.join(", "),
  };
}

function buildReportStep() {
  return {
    stepId: "report",
    step: "\u6700\u7d42\u7d50\u679c\u3001\u8a3c\u8de1\u306e\u8981\u7d04\u3001\u6b8b\u308b\u30ea\u30b9\u30af\u3092\u30aa\u30da\u30ec\u30fc\u30bf\u30fc\u306b\u5831\u544a\u3057\u307e\u3059\u3002",
    status: "pending",
    phase: "report",
    kind: "report",
    ownerAgent: "default",
  };
}

function buildPlanExplanation(summary, dispatches, dispatchPlan) {
  const owners = joinOwnerLabels(dispatches.map((dispatch) => dispatch.ownerAgent));
  const flags = [];
  if (dispatchPlan && dispatchPlan.reviewerRequired) {
    flags.push(translateQualityLabel("reviewer"));
  }
  if (dispatchPlan && dispatchPlan.testerRequired) {
    flags.push(translateQualityLabel("tester"));
  }
  if (dispatchPlan && dispatchPlan.dedicatedTestsRequired) {
    flags.push(translateQualityLabel("dedicated tests"));
  }
  if (dispatchPlan && dispatchPlan.signoffRequired) {
    flags.push(translateQualityLabel("signoff"));
  }
  const qualitySummary = flags.length ? `\u54c1\u8cea=${flags.join("\u3001")}` : "\u54c1\u8cea=\u306a\u3057";
  return `\u30dd\u30ea\u30b7\u30fc\u30d7\u30e9\u30f3\u3092\u78ba\u5b9a\u3057\u307e\u3057\u305f (${summary.planningMode} / ${summary.planningDepth} / ${summary.assuranceDepth} / ${summary.flowPath})\u3002 \u62c5\u5f53=${owners}; ${qualitySummary}\u3002`;
}

function buildOperatorPlanEvent({ planningContext, agentName = "default" } = {}) {
  const context = planningContext && typeof planningContext === "object" ? planningContext : {};
  const selection = context.selection && typeof context.selection === "object" ? context.selection : {};
  const dispatchPlan = context.dispatchPlan && typeof context.dispatchPlan === "object" ? context.dispatchPlan : {};
  const requirementContract = context.requirementContract && typeof context.requirementContract === "object"
    ? context.requirementContract
    : {};
  const summary = buildPlanningSummary(selection, dispatchPlan);
  const dispatches = normalizeDispatches(dispatchPlan);
  const clarification = getClarificationSignals(context);

  let decision = "plan";
  let skipReason = "";
  let steps = [];
  let explanation = "";

  if (shouldSkipDetailedPlan({ selection, dispatchPlan, requirementContract, agentName })) {
    decision = "skip";
    skipReason = "direct_response_only";
    steps = [buildSkipStep()];
    explanation = buildSkipExplanation(summary);
  } else if (clarification.action === "ask_user_once") {
    steps = buildClarificationSteps(clarification, dispatches);
    explanation = clarification.summary
      ? `${buildPlanExplanation(summary, dispatches, dispatchPlan)} ${clarification.summary}`
      : buildPlanExplanation(summary, dispatches, dispatchPlan);
  } else if (dispatchPlan && dispatchPlan.proposalOnly) {
    steps = buildDiscoverySteps(dispatches);
    explanation = buildPlanExplanation(summary, dispatches, dispatchPlan);
  } else {
    steps = [buildExecutionStep(dispatches)];
    const qualityStep = buildQualityStep(dispatchPlan);
    if (qualityStep) {
      steps.push(qualityStep);
    }
    steps.push(buildReportStep());
    explanation = buildPlanExplanation(summary, dispatches, dispatchPlan);
  }

  if (!steps.length) {
    return null;
  }

  return {
    type: "plan",
    source: "policy",
    generatedBy: "harness",
    decision,
    skip: decision === "skip" ? 1 : 0,
    skipReason,
    planningMode: summary.planningMode,
    planningDepth: summary.planningDepth,
    assuranceDepth: summary.assuranceDepth,
    flowPath: summary.flowPath,
    explanation,
    steps,
  };
}

module.exports = {
  buildOperatorPlanEvent,
  shouldSkipDetailedPlan,
};
