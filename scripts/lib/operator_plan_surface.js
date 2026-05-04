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
  if (normalized === "reviewer") return "レビュー";
  if (normalized === "tester") return "テスト";
  if (normalized === "dedicated tests") return "専用テスト";
  if (normalized === "signoff") return "承認用チェック";
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
    const participationMode = safeString(item.participationMode, 40).toLowerCase();
    return {
      dispatchId: safeString(item.dispatchId, 120) || `dispatch-${index + 1}`,
      ownerAgent: formatOwnerLabel(item.ownerAgent),
      participationMode: ["writer", "advisory", "review", "test", "discovery"].includes(participationMode) ? participationMode : "",
      mayWrite: item.mayWrite ? 1 : 0,
      taskSummary: safeString(item.taskSummary, 240),
      ownedPaths: uniqueStrings(item.ownedPaths, 8),
      requestClauseRefs: uniqueStrings(item.requestClauseRefs, 24),
      requirementRefs: uniqueStrings(item.requirementRefs, 16),
      acceptanceCheckRefs: uniqueStrings(item.acceptanceCheckRefs, 16),
      acceptanceChecks: uniqueStrings(item.acceptanceChecks, 8),
    };
  }).filter((dispatch) => dispatch.ownerAgent || dispatch.taskSummary || dispatch.ownedPaths.length > 0);
}

function normalizeAcceptanceIds(requirementContract) {
  return toArray(requirementContract && requirementContract.acceptanceChecks).map((entry) => {
    if (entry && typeof entry === "object" && entry.id) {
      return safeString(entry.id, 120);
    }
    return "";
  }).filter(Boolean);
}

function buildCoordinationSummary(dispatchPlan, dispatches) {
  const plan = dispatchPlan && typeof dispatchPlan === "object" ? dispatchPlan : {};
  const normalizedDispatches = toArray(dispatches);
  const writerDispatch = normalizedDispatches.find((entry) => entry && entry.participationMode === "writer" && entry.mayWrite);
  const integrationOwner = safeString(plan.integrationOwner, 80) || safeString(writerDispatch && writerDispatch.ownerAgent, 80);
  const advisoryAgents = uniqueStrings(
    toArray(plan.advisoryAgents).length
      ? plan.advisoryAgents
      : normalizedDispatches
        .filter((entry) => entry && entry.participationMode === "advisory")
        .map((entry) => entry.ownerAgent),
    6
  );
  const coordinationMode = safeString(plan.coordinationMode, 40) || (integrationOwner ? "single_writer" : "");
  return {
    coordinationMode,
    singleWriter: plan.singleWriter || coordinationMode === "single_writer" ? 1 : 0,
    integrationOwner,
    advisoryAgents,
    freshReviewerRequired: plan.freshReviewerRequired || plan.reviewerRequired ? 1 : 0,
  };
}

function formatCoordinationSummary(summary) {
  const source = summary && typeof summary === "object" ? summary : {};
  if (!source.singleWriter || !source.integrationOwner) {
    return "";
  }
  const parts = [`single writer=${source.integrationOwner}`];
  if (Array.isArray(source.advisoryAgents) && source.advisoryAgents.length) {
    parts.push(`advisors=${source.advisoryAgents.join(",")}`);
  }
  parts.push(`fresh reviewer=${source.freshReviewerRequired ? "required" : "not-required"}`);
  return parts.join("; ");
}

function buildTraceRefs({ dispatches = [], requirementContract } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const requestCoverage = requirement.requestCoverage && typeof requirement.requestCoverage === "object"
    ? requirement.requestCoverage
    : {};
  const mappedRequirementRefs = toArray(requestCoverage.mappedRequirements).flatMap((entry) => uniqueStrings(entry && entry.requirementRefs, 8));
  const requestClauseRefs = uniqueStrings(toArray(dispatches).flatMap((dispatch) => toArray(dispatch && dispatch.requestClauseRefs)), 24);
  const mappedClauseRefs = uniqueStrings(
    toArray(requestCoverage.mappedRequirements).map((entry) => safeString(entry && entry.clauseId, 160)),
    24
  );
  const requirementRefs = uniqueStrings(toArray(dispatches).flatMap((dispatch) => toArray(dispatch && dispatch.requirementRefs)), 24);
  const acceptanceCheckRefs = uniqueStrings(toArray(dispatches).flatMap((dispatch) => toArray(dispatch && dispatch.acceptanceCheckRefs)), 16);
  return {
    requestClauseRefs: requestClauseRefs.length
      ? requestClauseRefs
      : uniqueStrings([
        ...toArray(requestCoverage.coreObligations),
        ...mappedClauseRefs,
      ], 24),
    requirementRefs: requirementRefs.length ? requirementRefs : uniqueStrings(mappedRequirementRefs, 24),
    acceptanceCheckRefs: acceptanceCheckRefs.length ? acceptanceCheckRefs : uniqueStrings(normalizeAcceptanceIds(requirement), 16),
  };
}

function withTraceRefs(step, refs) {
  return {
    ...step,
    requestClauseRefs: uniqueStrings(refs && refs.requestClauseRefs, 24),
    requirementRefs: uniqueStrings(refs && refs.requirementRefs, 24),
    acceptanceCheckRefs: uniqueStrings(refs && refs.acceptanceCheckRefs, 16),
  };
}

function normalizeAcceptanceTitles(requirementContract) {
  return toArray(requirementContract && requirementContract.acceptanceChecks).map((entry) => {
    if (entry && typeof entry === "object" && entry.title) {
      return safeString(entry.title, 160);
    }
    return safeString(String(entry || ""), 160);
  }).filter(Boolean);
}

function stripTerminalPunctuation(text) {
  return safeString(text, 240).replace(/[。.!?]+$/u, "").trim();
}

function buildGoalSummary(requirementContract) {
  const lockedGoal = safeString(requirementContract && requirementContract.lockedGoal, 220);
  if (lockedGoal) {
    return lockedGoal;
  }
  const displayGoal = safeString(requirementContract && requirementContract.displayContract && requirementContract.displayContract.goal, 220);
  if (displayGoal) {
    return displayGoal;
  }
  const explicitGoal = safeString(requirementContract && requirementContract.explicitGoal, 220);
  if (explicitGoal) {
    return explicitGoal;
  }
  const implicitGoal = safeString(requirementContract && requirementContract.implicitGoal, 220);
  if (implicitGoal) {
    return implicitGoal;
  }
  const baselineScope = uniqueStrings(requirementContract && requirementContract.baselineScope, 3);
  return baselineScope.length ? baselineScope.join(" / ") : "";
}

function buildPrimaryOpenQuestion(requirementContract) {
  const questions = uniqueStrings(requirementContract && requirementContract.openQuestions, 4);
  return questions[0] || "";
}

function isGenericTaskSummary(text) {
  const normalized = stripTerminalPunctuation(text).toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized === "clarify unresolved requirements, non-goals, and approval-boundary items before implementation"
    || normalized === "own runtime, server, protocol, and orchestration behavior changes"
    || normalized === "own ui and operator-facing web changes"
    || normalized === "own contracts, docs sync, and operator-visible harness wiring"
    || normalized.startsWith("single writer applies the final ")
    || normalized.startsWith("advisory only:")
    || normalized === "実装に入る前に、未解決の要件、非対象範囲、前提、承認境界を整理する"
    || normalized === "契約、docs sync、runtime 可観測性、signoff 向け証跡更新を担当する"
    || normalized === "サーバー側のオーケストレーション、ポリシー、runtime 振る舞い変更を担当する"
    || normalized === "ui とオペレーター向け web 変更を担当する"
    || normalized === "選択された範囲の specialist 実行を担当する";
}

function summarizeOwnedPaths(dispatches) {
  const paths = uniqueStrings(toArray(dispatches).flatMap((dispatch) => toArray(dispatch && dispatch.ownedPaths)), 3);
  return paths.length ? paths.join(" / ") : "";
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
  return `この直接応答ターンでは、詳細な実行計画を省略しました (${summary.planningDepth} / ${summary.assuranceDepth})。`;
}

function buildSkipStep(requirementContract) {
  return withTraceRefs({
    stepId: "plan-skip",
    step: "多段の実行計画は作らず、そのまま回答または確認を行います。",
    status: "skipped",
    phase: "planning",
    kind: "skip",
    ownerAgent: "default",
  }, buildTraceRefs({ requirementContract }));
}

function buildDiscoverySteps(dispatches, requirementContract) {
  const primary = dispatches[0] || {};
  const traceRefs = buildTraceRefs({ dispatches: [primary], requirementContract });
  const goal = stripTerminalPunctuation(buildGoalSummary(requirementContract));
  const openQuestion = stripTerminalPunctuation(buildPrimaryOpenQuestion(requirementContract));
  const concreteTaskSummary = isGenericTaskSummary(primary.taskSummary) ? "" : stripTerminalPunctuation(primary.taskSummary);
  const firstStepText = concreteTaskSummary
    || (goal && openQuestion
      ? `目標「${goal}」を進める前に、未解決の確認事項を整理します。主要な確認点: ${openQuestion}。`
      : goal
        ? `目標「${goal}」を安全な形にするため、未解決の確認事項を整理します。`
        : openQuestion
          ? `未解決の確認事項を整理します。主要な確認点: ${openQuestion}。`
          : "実装に入る前に、未解決の要件、前提、ユーザー判断境界を整理します。");
  const waitStepText = openQuestion
    ? `確認待ち: ${openQuestion}。回答が揃うまで実装には進みません。`
    : goal
      ? `確認待ち: 「${goal}」に必要なユーザー判断が揃うまで実装には進みません。`
      : "未解決の確認事項が残る場合は、実装前にユーザー入力を求めて停止します。";
  return [
    withTraceRefs({
      stepId: primary.dispatchId || "discovery-clarify",
      step: firstStepText,
      status: "in_progress",
      phase: "planning",
      kind: "discovery",
      ownerAgent: primary.ownerAgent || "default",
    }, traceRefs),
    withTraceRefs({
      stepId: "needs-input-stop",
      step: waitStepText,
      status: "pending",
      phase: "report",
      kind: "needs_input",
      ownerAgent: primary.ownerAgent || "default",
    }, traceRefs),
  ];
}

function buildClarificationSteps(clarification, dispatches, requirementContract) {
  const primary = dispatches[0] || {};
  const traceRefs = buildTraceRefs({ dispatches: [primary], requirementContract });
  const goal = stripTerminalPunctuation(buildGoalSummary(requirementContract));
  const question = clarification && clarification.question
    ? clarification.question
    : "実装前に確認質問を 1 つ行います。";
  return [
    withTraceRefs({
      stepId: primary.dispatchId || "clarification-question",
      step: `実装前に確認質問を 1 つ行います。${goal ? ` 目標: 「${goal}」。` : ""} ${question}`,
      status: "in_progress",
      phase: "planning",
      kind: "clarification",
      ownerAgent: primary.ownerAgent || "default",
    }, traceRefs),
    withTraceRefs({
      stepId: "clarification-wait",
      step: `回答待ち: ${stripTerminalPunctuation(question)}。回答を受け取り次第、実行計画を更新します。`,
      status: "pending",
      phase: "report",
      kind: "needs_input",
      ownerAgent: primary.ownerAgent || "default",
    }, traceRefs),
  ];
}

function buildExecutionStep(dispatches, requirementContract) {
  const traceRefs = buildTraceRefs({ dispatches, requirementContract });
  const owners = joinOwnerLabels(dispatches.map((dispatch) => dispatch.ownerAgent));
  const concreteSummaries = uniqueStrings(
    dispatches
      .map((dispatch) => dispatch.taskSummary)
      .filter((summary) => !isGenericTaskSummary(summary)),
    3
  );
  const goal = stripTerminalPunctuation(buildGoalSummary(requirementContract));
  const ownedPaths = summarizeOwnedPaths(dispatches);
  const acceptanceTitles = normalizeAcceptanceTitles(requirementContract).slice(0, 2);
  const workSummary = concreteSummaries.length
    ? concreteSummaries.join(" / ")
    : goal
      ? `「${goal}」を形にする実装`
      : "担当範囲の変更";
  const details = [];
  if (ownedPaths) details.push(`対象: ${ownedPaths}`);
  if (acceptanceTitles.length) details.push(`完了条件: ${acceptanceTitles.join(" / ")}`);
  const detail = details.length ? ` ${details.join(" / ")}。` : "";
  return withTraceRefs({
    stepId: "execution",
    step: `実行: ${owners} が ${workSummary} を進めます。${detail}`,
    status: "in_progress",
    phase: "execution",
    kind: "execution",
    ownerAgent: owners,
  }, traceRefs);
}

function buildQualityStep(dispatchPlan, requirementContract) {
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
  return withTraceRefs({
    stepId: "quality",
    step: `品質ゲート: 最終報告の前に ${labels.join("、")} の証跡を揃えます。`,
    status: "pending",
    phase: "quality",
    kind: "quality",
    ownerAgent: labels.join(", "),
  }, buildTraceRefs({ dispatches: normalizeDispatches(dispatchPlan), requirementContract }));
}

function buildReportStep(dispatches, requirementContract) {
  const goal = stripTerminalPunctuation(buildGoalSummary(requirementContract));
  return withTraceRefs({
    stepId: "report",
    step: goal
      ? `最終報告: 「${goal}」への対応結果、証跡の要約、残るリスクをまとめます。`
      : "最終結果、証跡の要約、残るリスクをオペレーターに報告します。",
    status: "pending",
    phase: "report",
    kind: "report",
    ownerAgent: "default",
  }, buildTraceRefs({ dispatches, requirementContract }));
}

function buildPlanExplanation(summary, dispatches, dispatchPlan, requirementContract) {
  const owners = joinOwnerLabels(dispatches.map((dispatch) => dispatch.ownerAgent));
  const goal = stripTerminalPunctuation(buildGoalSummary(requirementContract));
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
  const qualitySummary = flags.length ? `品質=${flags.join("、")}` : "品質=なし";
  return `ポリシープランを確定しました (${summary.planningMode} / ${summary.planningDepth} / ${summary.assuranceDepth} / ${summary.flowPath})。${goal ? ` 目標=${goal};` : ""} 担当=${owners}; ${qualitySummary}。`;
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
  const coordination = buildCoordinationSummary(dispatchPlan, dispatches);

  let decision = "plan";
  let skipReason = "";
  let steps = [];
  let explanation = "";

  if (shouldSkipDetailedPlan({ selection, dispatchPlan, requirementContract, agentName })) {
    decision = "skip";
    skipReason = "direct_response_only";
    steps = [buildSkipStep(requirementContract)];
    explanation = buildSkipExplanation(summary);
  } else if (clarification.action === "ask_user_once") {
    steps = buildClarificationSteps(clarification, dispatches, requirementContract);
    explanation = clarification.summary
      ? `${buildPlanExplanation(summary, dispatches, dispatchPlan, requirementContract)} ${clarification.summary}`
      : buildPlanExplanation(summary, dispatches, dispatchPlan, requirementContract);
  } else if (dispatchPlan && dispatchPlan.proposalOnly) {
    steps = buildDiscoverySteps(dispatches, requirementContract);
    explanation = buildPlanExplanation(summary, dispatches, dispatchPlan, requirementContract);
  } else {
    steps = [buildExecutionStep(dispatches, requirementContract)];
    const qualityStep = buildQualityStep(dispatchPlan, requirementContract);
    if (qualityStep) {
      steps.push(qualityStep);
    }
    steps.push(buildReportStep(dispatches, requirementContract));
    explanation = buildPlanExplanation(summary, dispatches, dispatchPlan, requirementContract);
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
    coordinationMode: coordination.coordinationMode,
    singleWriter: coordination.singleWriter,
    integrationOwner: coordination.integrationOwner,
    advisoryAgents: coordination.advisoryAgents,
    freshReviewerRequired: coordination.freshReviewerRequired,
    explanation,
    steps,
  };
}

module.exports = {
  buildOperatorPlanEvent,
  shouldSkipDetailedPlan,
};
