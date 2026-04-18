"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  classifySelfImprovementPromotion,
  defaultSelfImprovementPromotionPolicyPath,
  loadSelfImprovementPromotionPolicy,
} = require("./openai_blog_learning");
const {
  defaultPolicyPath: defaultSkillPortfolioPolicyPath,
  loadSkillPortfolioPolicy,
} = require("./skill_portfolio_policy");

const defaultCorrectionLearningContractPath = path.join(__dirname, "..", "config", "correction_learning_contract.json");

const defaultCorrectionLearningContractDefinition = Object.freeze({
  schema: "correction-learning-contract.v1",
  version: "2026-04-15.r1",
  correctionTriggers: Object.freeze([
    "違う",
    "重なってる",
    "はみ出ている",
    "ズレてる",
    "意味が違う",
    "wrong",
    "overflow",
    "overlap",
    "collision",
    "drift",
  ]),
  intentLock: Object.freeze({
    requiredFields: Object.freeze(["userRequest", "latentIntent", "winSignals", "nonTargets"]),
  }),
  acceptanceLock: Object.freeze({
    requiredFields: Object.freeze(["passConditions", "failureConditions", "requiredEvidence"]),
  }),
  correctionEvent: Object.freeze({
    requiredFields: Object.freeze([
      "observed_miss",
      "expected_outcome",
      "artifact_or_surface",
      "user_dissatisfaction_reason",
      "candidate_failed_phase",
      "learning_scope_candidate",
    ]),
    allowedFailedPhases: Object.freeze([
      "intent_lock",
      "acceptance_lock",
      "autonomous_plan",
      "execution",
      "preventive_gates",
      "evidence",
      "review_gate",
      "completion_condition",
      "unknown",
    ]),
    allowedLearningScopes: Object.freeze(["conversation_only", "project", "harness"]),
  }),
  policyPatch: Object.freeze({
    completionArtifactKinds: Object.freeze([
      "machine_readable_contract",
      "planning_rule",
      "review_gate",
      "completion_condition",
      "regression_test",
    ]),
    minArtifactCount: 1,
    replayVerificationRequired: true,
    requireAdjacentReplayCoverage: true,
  }),
  learningTriage: Object.freeze({
    requiredDecisions: Object.freeze([
      "patch_target_decision",
      "improvement_lifecycle_decision",
    ]),
    requiredSteps: Object.freeze([
      "learning_triage",
      "patch_target_decision",
      "improvement_lifecycle_decision",
      "replay_verification",
      "skill_promotion_audit",
    ]),
    patchScopes: Object.freeze(["conversation_only", "project", "harness"]),
    lifecycleDecisions: Object.freeze([
      "proposal_only",
      "shadow_candidate",
      "gated_candidate",
      "auto_apply_candidate",
      "blocked",
    ]),
    decisionPrinciple: "smallest_scope_that_prevents_recurrence",
    smallestScopeFirst: true,
    directSkillPatchDisallowed: true,
    skillCandidateRoute: "post_patch_replay_promotion_audit",
    notes: Object.freeze([
      "skill is not a direct correction patch target",
      "skill promotion is evaluated after reusable workflow evidence and repeated success",
    ]),
    selfImprovementPolicyRef: "scripts/config/self_improvement_promotion_policy.json",
    skillPortfolioPolicyRef: "scripts/config/skill_portfolio_policy.json",
    skillPromotion: Object.freeze({
      eligibleOnlyAfterReplay: true,
      requiresReusableWorkflow: true,
      promotionRule: "scenario_to_role",
    }),
  }),
});

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function compactText(value, max = 240) {
  return safeString(value, max).replace(/\s+/g, " ").trim();
}

function uniqueStrings(values, max = 16, maxChars = 240) {
  const source = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(/\r?\n|[,;]+/)
      : [];
  const out = [];
  const seen = new Set();
  for (const entry of source) {
    const normalized = compactText(entry, maxChars);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

function normalizePhase(value) {
  const normalized = safeString(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  return normalized || "unknown";
}

function normalizeLearningScope(value) {
  const normalized = safeString(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "conversation" || normalized === "conversation_only") return "conversation_only";
  if (normalized === "project" || normalized === "pj") return "project";
  if (normalized === "harness" || normalized === "global_harness") return "harness";
  return "conversation_only";
}

function normalizeArtifactKind(value) {
  const normalized = safeString(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  return normalized;
}

function normalizeLifecycleDecision(value) {
  const normalized = safeString(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  return normalized;
}

function readJsonFileOrNull(targetPath) {
  try {
    if (!targetPath || !fs.existsSync(targetPath)) return null;
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeCorrectionLearningContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  const correctionEvent = payload.correctionEvent && typeof payload.correctionEvent === "object" ? payload.correctionEvent : {};
  const policyPatch = payload.policyPatch && typeof payload.policyPatch === "object" ? payload.policyPatch : {};
  const intentLock = payload.intentLock && typeof payload.intentLock === "object" ? payload.intentLock : {};
  const acceptanceLock = payload.acceptanceLock && typeof payload.acceptanceLock === "object" ? payload.acceptanceLock : {};
  const learningTriage = payload.learningTriage && typeof payload.learningTriage === "object" ? payload.learningTriage : {};
  const skillPromotion = learningTriage.skillPromotion && typeof learningTriage.skillPromotion === "object"
    ? learningTriage.skillPromotion
    : {};
  return {
    schema: safeString(payload.schema, 80) || defaultCorrectionLearningContractDefinition.schema,
    version: safeString(payload.version, 80) || defaultCorrectionLearningContractDefinition.version,
    correctionTriggers: uniqueStrings(payload.correctionTriggers || defaultCorrectionLearningContractDefinition.correctionTriggers, 16, 80),
    intentLock: {
      requiredFields: uniqueStrings(intentLock.requiredFields || defaultCorrectionLearningContractDefinition.intentLock.requiredFields, 8, 80),
    },
    acceptanceLock: {
      requiredFields: uniqueStrings(acceptanceLock.requiredFields || defaultCorrectionLearningContractDefinition.acceptanceLock.requiredFields, 8, 80),
    },
    correctionEvent: {
      requiredFields: uniqueStrings(correctionEvent.requiredFields || defaultCorrectionLearningContractDefinition.correctionEvent.requiredFields, 8, 80),
      allowedFailedPhases: uniqueStrings(correctionEvent.allowedFailedPhases || defaultCorrectionLearningContractDefinition.correctionEvent.allowedFailedPhases, 12, 80).map(normalizePhase),
      allowedLearningScopes: uniqueStrings(correctionEvent.allowedLearningScopes || defaultCorrectionLearningContractDefinition.correctionEvent.allowedLearningScopes, 6, 80).map(normalizeLearningScope),
    },
    policyPatch: {
      completionArtifactKinds: uniqueStrings(policyPatch.completionArtifactKinds || defaultCorrectionLearningContractDefinition.policyPatch.completionArtifactKinds, 8, 80).map(normalizeArtifactKind),
      minArtifactCount: Math.max(1, Math.trunc(Number(policyPatch.minArtifactCount) || defaultCorrectionLearningContractDefinition.policyPatch.minArtifactCount)),
      replayVerificationRequired: policyPatch.replayVerificationRequired !== false,
      requireAdjacentReplayCoverage: policyPatch.requireAdjacentReplayCoverage !== false,
    },
    learningTriage: {
      requiredDecisions: uniqueStrings(
        learningTriage.requiredDecisions || defaultCorrectionLearningContractDefinition.learningTriage.requiredDecisions,
        6,
        80
      ).map(normalizeArtifactKind),
      requiredSteps: uniqueStrings(
        learningTriage.requiredSteps || defaultCorrectionLearningContractDefinition.learningTriage.requiredSteps,
        8,
        80
      ).map(normalizeArtifactKind),
      patchScopes: uniqueStrings(
        learningTriage.patchScopes || defaultCorrectionLearningContractDefinition.learningTriage.patchScopes,
        6,
        80
      ).map(normalizeLearningScope),
      lifecycleDecisions: uniqueStrings(
        learningTriage.lifecycleDecisions || defaultCorrectionLearningContractDefinition.learningTriage.lifecycleDecisions,
        8,
        80
      ).map(normalizeLifecycleDecision),
      decisionPrinciple: safeString(
        learningTriage.decisionPrinciple,
        160
      ) || defaultCorrectionLearningContractDefinition.learningTriage.decisionPrinciple,
      smallestScopeFirst: learningTriage.smallestScopeFirst !== false,
      directSkillPatchDisallowed: learningTriage.directSkillPatchDisallowed !== false,
      skillCandidateRoute: safeString(
        learningTriage.skillCandidateRoute,
        120
      ) || defaultCorrectionLearningContractDefinition.learningTriage.skillCandidateRoute,
      notes: uniqueStrings(
        learningTriage.notes || defaultCorrectionLearningContractDefinition.learningTriage.notes,
        8,
        180
      ),
      selfImprovementPolicyRef: safeString(
        learningTriage.selfImprovementPolicyRef,
        260
      ) || defaultCorrectionLearningContractDefinition.learningTriage.selfImprovementPolicyRef,
      skillPortfolioPolicyRef: safeString(
        learningTriage.skillPortfolioPolicyRef,
        260
      ) || defaultCorrectionLearningContractDefinition.learningTriage.skillPortfolioPolicyRef,
      skillPromotion: {
        eligibleOnlyAfterReplay: skillPromotion.eligibleOnlyAfterReplay !== false,
        requiresReusableWorkflow: skillPromotion.requiresReusableWorkflow !== false,
        promotionRule: safeString(
          skillPromotion.promotionRule,
          80
        ) || defaultCorrectionLearningContractDefinition.learningTriage.skillPromotion.promotionRule,
      },
    },
  };
}

function loadCorrectionLearningContract(contractPath = defaultCorrectionLearningContractPath) {
  return normalizeCorrectionLearningContract(readJsonFileOrNull(contractPath) || defaultCorrectionLearningContractDefinition);
}

function normalizeIntentLock(value, requirement = {}) {
  const source = value && typeof value === "object" ? value : {};
  const frame = requirement && requirement.userValueFrame && typeof requirement.userValueFrame === "object" ? requirement.userValueFrame : {};
  const explicitGoal = compactText(requirement.explicitGoal, 320);
  const implicitGoal = compactText(requirement.implicitGoal, 320);
  const lockedGoal = compactText(requirement.lockedGoal, 320);
  return {
    schema: "intent-lock.v1",
    source: compactText(source.source, 80) || "runtime_inferred_pre_dispatch",
    userRequest: compactText(source.userRequest, 320) || lockedGoal || explicitGoal,
    latentIntent: compactText(source.latentIntent, 320) || implicitGoal || compactText(frame.valueThesis, 320),
    prohibitedPatterns: uniqueStrings(source.prohibitedPatterns || frame.mustAvoid, 12, 180),
    winSignals: uniqueStrings(source.winSignals || frame.completedMeans, 12, 180),
    nonTargets: uniqueStrings(source.nonTargets || requirement.nonGoals, 12, 180),
    lockStatus: safeString(source.lockStatus, 40).toLowerCase() === "locked" || lockedGoal || explicitGoal ? "locked" : "draft",
  };
}

function buildIntentLock({ requirementContract = {} } = {}) {
  return normalizeIntentLock({
    userRequest: requirementContract.lockedGoal || requirementContract.explicitGoal,
    latentIntent: requirementContract.implicitGoal || requirementContract.userValueFrame && requirementContract.userValueFrame.valueThesis,
    prohibitedPatterns: requirementContract.userValueFrame && requirementContract.userValueFrame.mustAvoid,
    winSignals: requirementContract.userValueFrame && requirementContract.userValueFrame.completedMeans,
    nonTargets: requirementContract.nonGoals,
    lockStatus: requirementContract.lockedGoal ? "locked" : "draft",
  }, requirementContract);
}

function normalizeAcceptanceLock(value, requirement = {}) {
  const source = value && typeof value === "object" ? value : {};
  const acceptanceChecks = Array.isArray(requirement.acceptanceChecks) ? requirement.acceptanceChecks : [];
  const requiredEvidenceFromChecks = acceptanceChecks
    .map((entry) => compactText(entry && entry.title, 180))
    .filter(Boolean);
  const failureFromChecks = acceptanceChecks
    .filter((entry) => entry && entry.blocking !== false)
    .map((entry) => `Failure if unmet: ${compactText(entry.title, 180)}`)
    .filter(Boolean);
  const defaultEvidence = [
    "acceptance check evidence",
    "review evidence",
    "technical verification evidence",
    "replay verification evidence",
  ];
  const defaultFailureModes = [
    "Failure if the outcome drifts from the locked goal or approved scope.",
    "Failure if text overflow, clipping, or collisions remain unresolved.",
    "Failure if required evidence is missing at closeout.",
  ];
  return {
    schema: "acceptance-lock.v1",
    source: compactText(source.source, 80) || "runtime_inferred_pre_dispatch",
    passConditions: uniqueStrings(source.passConditions || requiredEvidenceFromChecks, 16, 180),
    failureConditions: uniqueStrings(source.failureConditions || [...failureFromChecks, ...defaultFailureModes], 16, 180),
    requiredEvidence: uniqueStrings(source.requiredEvidence || [...defaultEvidence, ...requiredEvidenceFromChecks], 16, 180),
    lockStatus: safeString(source.lockStatus, 40).toLowerCase() === "locked" || acceptanceChecks.length ? "locked" : "draft",
  };
}

function buildAcceptanceLock({ requirementContract = {} } = {}) {
  return normalizeAcceptanceLock({}, requirementContract);
}

function normalizeCorrectionEvent(value, contract = loadCorrectionLearningContract()) {
  const source = value && typeof value === "object" ? value : {};
  const observedMiss = compactText(source.observed_miss || source.observedMiss, 240);
  const expectedOutcome = compactText(source.expected_outcome || source.expectedOutcome, 240);
  const artifactOrSurface = compactText(source.artifact_or_surface || source.artifactOrSurface, 240);
  const dissatisfaction = compactText(source.user_dissatisfaction_reason || source.userDissatisfactionReason, 240);
  const failedPhase = normalizePhase(source.candidate_failed_phase || source.candidateFailedPhase || "unknown");
  const learningScope = normalizeLearningScope(source.learning_scope_candidate || source.learningScopeCandidate || "conversation_only");
  const hashSeed = [observedMiss, expectedOutcome, artifactOrSurface, dissatisfaction, failedPhase, learningScope].join("|");
  return {
    schema: "correction-event.v1",
    eventId: compactText(source.eventId, 120) || `correction_${crypto.createHash("sha1").update(hashSeed || "empty").digest("hex").slice(0, 12)}`,
    observed_miss: observedMiss,
    expected_outcome: expectedOutcome,
    artifact_or_surface: artifactOrSurface,
    user_dissatisfaction_reason: dissatisfaction,
    candidate_failed_phase: contract.correctionEvent.allowedFailedPhases.includes(failedPhase) ? failedPhase : "unknown",
    learning_scope_candidate: contract.correctionEvent.allowedLearningScopes.includes(learningScope) ? learningScope : "conversation_only",
  };
}

function createCorrectionEvent(input, options = {}) {
  const contract = options.contract || loadCorrectionLearningContract();
  const normalizedEvent = normalizeCorrectionEvent(input, contract);
  return {
    ...normalizedEvent,
    correction_event_required: true,
    required_patch_targets: contract.policyPatch.completionArtifactKinds.slice(),
    replay_required: contract.policyPatch.replayVerificationRequired,
  };
}

function correctionFeedbackLooksActionable(text, contract = loadCorrectionLearningContract()) {
  const normalized = compactText(text, 4000).toLowerCase();
  if (!normalized) return false;
  return contract.correctionTriggers.some((entry) => normalized.includes(String(entry || "").toLowerCase()));
}

function buildCorrectionLearningDirective({ contract = loadCorrectionLearningContract() } = {}) {
  return [
    "Correction loop: Any user correction must become a structured correction event before closure.",
    `Correction event fields: ${contract.correctionEvent.requiredFields.join(", ")}`,
    `Patch completion: update at least one of ${contract.policyPatch.completionArtifactKinds.join(", ")} and finish replay verification.`,
    `Learning triage: decide patch target scope, lifecycle, and only route reusable workflows to skill promotion after replay.`,
  ].join("\n");
}

function buildCorrectionLearningRuntimeSummary({ contract = loadCorrectionLearningContract() } = {}) {
  return {
    contract: {
      schema: contract.schema,
      version: contract.version,
      correctionEventRequired: true,
      correctionTriggers: contract.correctionTriggers.slice(),
      eventFields: contract.correctionEvent.requiredFields.slice(),
      intentLock: { requiredFields: contract.intentLock.requiredFields.slice() },
      acceptanceLock: { requiredFields: contract.acceptanceLock.requiredFields.slice() },
      correctionEvent: {
        requiredFields: contract.correctionEvent.requiredFields.slice(),
        allowedFailedPhases: contract.correctionEvent.allowedFailedPhases.slice(),
        allowedLearningScopes: contract.correctionEvent.allowedLearningScopes.slice(),
      },
      policyPatchTargets: contract.policyPatch.completionArtifactKinds.slice(),
      policyPatch: {
        completionArtifactKinds: contract.policyPatch.completionArtifactKinds.slice(),
        minArtifactCount: contract.policyPatch.minArtifactCount,
        replayVerificationRequired: contract.policyPatch.replayVerificationRequired,
        requireAdjacentReplayCoverage: contract.policyPatch.requireAdjacentReplayCoverage,
      },
      learningTriage: {
        requiredDecisions: contract.learningTriage.requiredDecisions.slice(),
        requiredSteps: contract.learningTriage.requiredSteps.slice(),
        patchScopes: contract.learningTriage.patchScopes.slice(),
        lifecycleDecisions: contract.learningTriage.lifecycleDecisions.slice(),
        decisionPrinciple: contract.learningTriage.decisionPrinciple,
        smallestScopeFirst: contract.learningTriage.smallestScopeFirst,
        directSkillPatchDisallowed: contract.learningTriage.directSkillPatchDisallowed,
        skillCandidateRoute: contract.learningTriage.skillCandidateRoute,
        notes: contract.learningTriage.notes.slice(),
        selfImprovementPolicyRef: contract.learningTriage.selfImprovementPolicyRef,
        skillPortfolioPolicyRef: contract.learningTriage.skillPortfolioPolicyRef,
        skillPromotion: {
          eligibleOnlyAfterReplay: contract.learningTriage.skillPromotion.eligibleOnlyAfterReplay,
          requiresReusableWorkflow: contract.learningTriage.skillPromotion.requiresReusableWorkflow,
          promotionRule: contract.learningTriage.skillPromotion.promotionRule,
        },
      },
    },
    summary: {
      correctionEventRequired: true,
      eventFieldCount: contract.correctionEvent.requiredFields.length,
      learningScopeIds: contract.correctionEvent.allowedLearningScopes.slice(),
      patchTargets: contract.policyPatch.completionArtifactKinds.slice(),
      replayRequired: contract.policyPatch.replayVerificationRequired,
      requiredDecisions: contract.learningTriage.requiredDecisions.slice(),
      learningTriageSteps: contract.learningTriage.requiredSteps.slice(),
      lifecycleDecisions: contract.learningTriage.lifecycleDecisions.slice(),
    },
  };
}

function triageCorrectionLearning({
  correctionEvent,
  changeClass = "",
  targetPath = "",
  reusableWorkflow = false,
  repeatedSuccessCount = 0,
  guardFailures = 0,
  contract = loadCorrectionLearningContract(),
  lanePolicy = { governance: {} },
  promotionPolicy = null,
  skillPortfolioPolicy = null,
} = {}) {
  const normalizedEvent = normalizeCorrectionEvent(correctionEvent, contract);
  const normalizedChangeClass = safeString(changeClass, 120) || "runtime_policy_tuning";
  const normalizedTargetPath = compactText(targetPath, 260) || `${normalizedEvent.learning_scope_candidate}_patch_target`;
  const loadedPromotionPolicy = promotionPolicy
    ? { policy: promotionPolicy, path: contract.learningTriage.selfImprovementPolicyRef || defaultSelfImprovementPromotionPolicyPath }
    : loadSelfImprovementPromotionPolicy();
  const loadedSkillPortfolioPolicy = skillPortfolioPolicy || loadSkillPortfolioPolicy();
  const lifecycleDecision = classifySelfImprovementPromotion({
    changeClass: normalizedChangeClass,
    target: normalizedTargetPath,
    lanePolicy,
    promotionPolicy: loadedPromotionPolicy && loadedPromotionPolicy.policy ? loadedPromotionPolicy.policy : {},
  });
  const promotionRule = loadedSkillPortfolioPolicy
    && loadedSkillPortfolioPolicy.promotionRules
    && loadedSkillPortfolioPolicy.promotionRules.scenarioToRole
    ? loadedSkillPortfolioPolicy.promotionRules.scenarioToRole
    : { minRuns: 6, maxGuardFailures: 0 };
  const normalizedRepeatedSuccessCount = Math.max(0, Math.trunc(Number(repeatedSuccessCount) || 0));
  const normalizedGuardFailures = Math.max(0, Math.trunc(Number(guardFailures) || 0));
  const skillPromotionEligible = Boolean(reusableWorkflow)
    && (!contract.learningTriage.skillPromotion.eligibleOnlyAfterReplay || contract.policyPatch.replayVerificationRequired)
    && normalizedRepeatedSuccessCount >= Math.max(1, Number(promotionRule.minRuns) || 1)
    && normalizedGuardFailures <= Math.max(0, Number(promotionRule.maxGuardFailures) || 0);

  return {
    schema: "correction-learning-triage.v1",
    correctionEventId: normalizedEvent.eventId,
    stageOrder: contract.learningTriage.requiredSteps.slice(),
    patchTargetDecision: {
      scope: normalizedEvent.learning_scope_candidate,
      targetPath: normalizedTargetPath,
      decisionPrinciple: contract.learningTriage.decisionPrinciple,
      smallestScopeFirst: contract.learningTriage.smallestScopeFirst,
      directSkillPatchDisallowed: contract.learningTriage.directSkillPatchDisallowed,
    },
    improvementLifecycleDecision: {
      changeClass: normalizedChangeClass,
      decision: lifecycleDecision && lifecycleDecision.decision ? lifecycleDecision.decision : "proposal_only",
      rationale: lifecycleDecision && lifecycleDecision.rationale ? lifecycleDecision.rationale : "manual_target_default",
      riskFlags: Array.isArray(lifecycleDecision && lifecycleDecision.riskFlags) ? lifecycleDecision.riskFlags.slice() : [],
      policyPath: loadedPromotionPolicy && loadedPromotionPolicy.path
        ? loadedPromotionPolicy.path
        : contract.learningTriage.selfImprovementPolicyRef || defaultSelfImprovementPromotionPolicyPath,
    },
    replayVerification: {
      required: contract.policyPatch.replayVerificationRequired,
      requireAdjacentReplayCoverage: contract.policyPatch.requireAdjacentReplayCoverage,
    },
    skillPromotionAudit: {
      directPromotionAllowed: !contract.learningTriage.directSkillPatchDisallowed,
      eligibleAfterReplay: skillPromotionEligible,
      requiresReusableWorkflow: contract.learningTriage.skillPromotion.requiresReusableWorkflow,
      promotionRule: contract.learningTriage.skillPromotion.promotionRule,
      repeatedSuccessCount: normalizedRepeatedSuccessCount,
      minRepeatedSuccessRuns: Math.max(1, Number(promotionRule.minRuns) || 1),
      guardFailures: normalizedGuardFailures,
      maxGuardFailures: Math.max(0, Number(promotionRule.maxGuardFailures) || 0),
      policyPath: loadedSkillPortfolioPolicy && loadedSkillPortfolioPolicy.policyPath
        ? loadedSkillPortfolioPolicy.policyPath
        : contract.learningTriage.skillPortfolioPolicyRef || defaultSkillPortfolioPolicyPath,
    },
  };
}

function normalizePolicyPatch(value, contract = loadCorrectionLearningContract()) {
  const source = value && typeof value === "object" ? value : {};
  const artifacts = (Array.isArray(source.patchArtifacts) ? source.patchArtifacts : []).map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const kind = normalizeArtifactKind(item.kind);
    const target = compactText(item.target, 200);
    const changeSummary = compactText(item.changeSummary, 240);
    if (!kind || !target || !changeSummary) return null;
    return {
      id: compactText(item.id, 80) || `patch-${index + 1}`,
      kind,
      target,
      changeSummary,
    };
  }).filter(Boolean).slice(0, 16);
  const replay = source.replayVerification && typeof source.replayVerification === "object" ? source.replayVerification : {};
  return {
    schema: "policy-patch.v1",
    patchId: compactText(source.patchId, 120) || `patch_${crypto.createHash("sha1").update(JSON.stringify(artifacts)).digest("hex").slice(0, 12)}`,
    correctionEventId: compactText(source.correctionEventId, 120),
    patchArtifacts: artifacts,
    replayVerification: {
      status: safeString(replay.status, 40).toLowerCase() === "verified" ? "verified" : "pending",
      evidenceRefs: uniqueStrings(replay.evidenceRefs, 12, 180),
      scenariosCovered: uniqueStrings(replay.scenariosCovered, 12, 180),
    },
    completionStatus: safeString(source.completionStatus, 40).toLowerCase() === "complete" ? "complete" : "pending",
    completionReasons: uniqueStrings(source.completionReasons, 12, 180),
    acceptedArtifactKinds: contract.policyPatch.completionArtifactKinds.slice(),
  };
}

function evaluatePolicyPatchCompletion({ policyPatch, correctionEvent, contract = loadCorrectionLearningContract() } = {}) {
  const normalizedPatch = normalizePolicyPatch(policyPatch, contract);
  const normalizedEvent = normalizeCorrectionEvent(correctionEvent, contract);
  const missing = [];
  if (!normalizedEvent.observed_miss
    || !normalizedEvent.expected_outcome
    || !normalizedEvent.artifact_or_surface
    || !normalizedEvent.user_dissatisfaction_reason) {
    missing.push("correction_event_missing");
  }
  if (normalizedEvent.candidate_failed_phase === "unknown") {
    missing.push("phase_attribution_missing");
  }
  if (!contract.correctionEvent.allowedLearningScopes.includes(normalizedEvent.learning_scope_candidate)) {
    missing.push("learning_scope_unclassified");
  }
  const qualifyingArtifacts = normalizedPatch.patchArtifacts.filter((entry) => contract.policyPatch.completionArtifactKinds.includes(entry.kind));
  if (qualifyingArtifacts.length < contract.policyPatch.minArtifactCount) {
    missing.push("policy_patch_incomplete");
  }
  if (contract.policyPatch.replayVerificationRequired && normalizedPatch.replayVerification.status !== "verified") {
    missing.push("replay_verification_missing");
  }
  if (contract.policyPatch.requireAdjacentReplayCoverage && normalizedPatch.replayVerification.scenariosCovered.length < 2) {
    missing.push("replay_verification_missing");
  }
  return {
    status: missing.length ? "failed_validation" : "pass",
    canClose: missing.length === 0,
    normalizedCorrectionEvent: normalizedEvent,
    normalizedPolicyPatch: normalizedPatch,
    missing,
    reason: missing[0] || "",
  };
}

module.exports = {
  buildAcceptanceLock,
  buildCorrectionLearningDirective,
  buildCorrectionLearningRuntimeSummary,
  buildIntentLock,
  correctionFeedbackLooksActionable,
  createCorrectionEvent,
  defaultCorrectionLearningContractDefinition,
  defaultCorrectionLearningContractPath,
  evaluatePolicyPatchCompletion,
  loadCorrectionLearningContract,
  normalizeAcceptanceLock,
  normalizeCorrectionEvent,
  normalizeCorrectionLearningContract,
  normalizeIntentLock,
  triageCorrectionLearning,
  normalizePolicyPatch,
};
