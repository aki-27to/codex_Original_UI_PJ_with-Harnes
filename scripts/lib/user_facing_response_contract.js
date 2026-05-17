"use strict";

const fs = require("fs");
const path = require("path");

const defaultUserFacingResponseContractPath = path.join(
  __dirname,
  "..",
  "config",
  "user_facing_response_contract.json"
);

const defaultUserFacingResponseContractDefinition = Object.freeze({
  schema: "user-facing-response-contract.v1",
  version: "2026-04-12.r2",
  closeInPlace: {
    enabled: true,
    exemptTaskOutcomeStatuses: Object.freeze(["NEEDS_INPUT", "BLOCKED"]),
    allowedPromptSignals: Object.freeze([
      "option",
      "options",
      "alternative",
      "alternatives",
      "trade-off",
      "tradeoffs",
      "compare",
      "comparison",
      "recommend",
      "recommended",
      "choose",
      "decision",
      "next step",
      "next steps",
      "roadmap",
      "plan",
      "break down",
      "organize",
      "detail",
      "details",
      "dig deeper",
      "\u9078\u629e\u80a2",
      "\u6bd4\u8f03",
      "\u63a8\u5968",
      "\u8a73\u3057\u304f",
      "\u8a73\u7d30",
      "\u6b21\u306e\u30b9\u30c6\u30c3\u30d7",
      "\u30ed\u30fc\u30c9\u30de\u30c3\u30d7",
      "\u8a08\u753b",
      "\u6574\u7406",
    ]),
    prohibitedClosingStarts: Object.freeze([
      "if you'd like",
      "if you like",
      "if you want",
      "let me know if",
      "would you like me to",
      "i can also",
      "i can break this down",
      "i can drill into",
      "i can walk through",
      "\u5fc5\u8981\u306a\u3089",
      "\u5fc5\u8981\u3067\u3042\u308c\u3070",
      "\u3082\u3057\u5fc5\u8981\u306a\u3089",
      "\u3082\u3057\u5fc5\u8981\u3067\u3042\u308c\u3070",
    ]),
  },
  completionClaims: {
    requireCompletedTaskOutcome: true,
    prohibitedLeadPhrases: Object.freeze([
      "done",
      "fixed",
      "completed",
      "resolved",
      "implemented",
      "shipped",
      "reflected",
      "\u4fee\u6b63\u6e08\u307f\u3067\u3059",
      "\u53cd\u6620\u6e08\u307f\u3067\u3059",
      "\u5bfe\u5fdc\u6e08\u307f\u3067\u3059",
      "\u5b8c\u4e86\u3057\u307e\u3057\u305f",
      "\u5b8c\u4e86\u3067\u3059",
      "\u89e3\u6d88\u3057\u307e\u3057\u305f",
      "\u76f4\u3057\u307e\u3057\u305f",
      "\u3067\u304d\u307e\u3057\u305f",
    ]),
  },
  reportingSeparation: {
    enabled: true,
    ordinaryTaskReports: Object.freeze({
      primarySection: "task_verdict",
      secondarySection: "program_readiness",
      programReadinessOptionalWhenIrrelevant: true,
      leadWithProgramReadiness: false,
      treatProgramReadinessNotYetAsBackgroundByDefault: true,
      treatResidualIncompletionAsBackgroundByDefault: true,
      residualIncompletionPromptSignals: Object.freeze([
        "why incomplete",
        "why is this not complete",
        "why not complete",
        "what remains",
        "remaining blocker",
        "remaining blockers",
        "why unfinished",
        "\u306a\u305c\u672a\u5b8c\u4e86",
        "\u672a\u5b8c\u4e86\u306e\u7406\u7531",
        "\u4f55\u304c\u6b8b\u3063\u3066\u3044\u308b",
      ]),
    }),
    programReadinessBlockingActivation: Object.freeze({
      requiresExplicitUserRequest: true,
      explicitRequestScopes: Object.freeze(["readiness", "release", "whole_harness_completion"]),
    }),
  },
  internalProcessDisclosure: {
    enabled: true,
    prohibitedPhrases: Object.freeze([
      "blue/red/judge",
      "requirement_rbj",
      "spawn_agent",
      "send_input",
      "parent dispatch guard",
      "internal quality retry",
      "adversarial review",
    ]),
  },
  exactReplyContracts: {
    bypassCloseInPlace: true,
    bypassEvidenceChecks: true,
  },
  intentFidelityFrame: {
    enabled: true,
    shadowRuntimeObservation: true,
    emitFrameObservation: true,
    emitWarningObservation: true,
    triggerPromptSignals: Object.freeze([
      "intent",
      "wrong",
      "misunderstood",
      "shallow",
      "appease",
      "best",
      "why",
      "rationale",
      "design",
      "principle",
      "coherent",
      "context",
      "overall",
      "should",
      "compare",
      "\u9055\u3046",
      "\u7406\u89e3\u3057\u3066\u3044\u306a\u3044",
      "\u610f\u56f3",
      "\u6d45\u3044",
      "\u8fce\u5408",
      "\u30d9\u30b9\u30c8",
      "\u306a\u305c",
      "\u7406\u7531",
      "\u8a2d\u8a08",
      "\u601d\u60f3",
      "\u7d71\u4e00\u611f",
      "\u6838\u5fc3",
      "\u3061\u3083\u3093\u3068",
      "\u5168\u4f53",
      "\u6587\u8108",
      "\u3069\u3046\u5b9f\u88c5",
      "\u3069\u3046\u3059\u308b\u306e\u304c\u3088\u3044",
      "\u3069\u3046\u3059\u308b\u306e\u304c\u30d9\u30b9\u30c8",
    ]),
    highFrictionSignals: Object.freeze([
      "wrong",
      "misunderstood",
      "shallow",
      "off-intent",
      "appease",
      "\u9055\u3046",
      "\u7406\u89e3\u3057\u3066\u3044\u306a\u3044",
      "\u89e3\u91c8\u304c\u7570\u306a\u308b",
      "\u6d45\u3044",
      "\u8fce\u5408",
      "\u610f\u56f3\u4e0d\u4e00\u81f4",
    ]),
    requiredFrameFields: Object.freeze([
      "must_answer",
      "must_not_do",
      "independent_standard",
    ]),
    responseModes: Object.freeze([
      "short",
      "rationale",
      "correction",
      "design",
      "review",
      "implementation_report",
    ]),
    answerAdherence: {
      minMustAnswerTermOverlap: 1,
    },
    selectiveRepair: {
      enabled: false,
      allowedResponseModes: Object.freeze([
        "rationale",
        "correction",
        "design",
        "review",
      ]),
      repairableWarningKinds: Object.freeze([
        "answer_misses_must_answer",
        "possible_user_appeasement",
      ]),
      emitNotAppliedObservation: true,
    },
  },
});

function safeString(value, max = 4000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value !== 0 : fallback;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizeStatusId(value) {
  return safeString(value, 80)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeLiteralList(values, fallback) {
  const source = Array.isArray(values) ? values : fallback;
  const out = [];
  const seen = new Set();
  for (const value of source) {
    const normalized = safeString(value, 200).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return Object.freeze(out.length ? out : fallback.slice());
}

function normalizeStatusList(values, fallback) {
  const source = Array.isArray(values) ? values : fallback;
  const out = [];
  const seen = new Set();
  for (const value of source) {
    const normalized = normalizeStatusId(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return Object.freeze(out.length ? out : fallback.slice());
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
}

function containsAnyLiteral(text, literals, { startsWith = false } = {}) {
  const normalizedText = safeString(text, 16000).toLowerCase();
  if (!normalizedText || !Array.isArray(literals) || literals.length === 0) {
    return false;
  }
  return literals.some((literal) => {
    if (!literal) {
      return false;
    }
    return startsWith ? normalizedText.startsWith(literal) : normalizedText.includes(literal);
  });
}

function normalizeUserFacingResponseContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  const reportingSeparation = payload.reportingSeparation && typeof payload.reportingSeparation === "object"
    ? payload.reportingSeparation
    : defaultUserFacingResponseContractDefinition.reportingSeparation;
  const ordinaryTaskReports = reportingSeparation.ordinaryTaskReports && typeof reportingSeparation.ordinaryTaskReports === "object"
    ? reportingSeparation.ordinaryTaskReports
    : defaultUserFacingResponseContractDefinition.reportingSeparation.ordinaryTaskReports;
  const programReadinessBlockingActivation = reportingSeparation.programReadinessBlockingActivation && typeof reportingSeparation.programReadinessBlockingActivation === "object"
    ? reportingSeparation.programReadinessBlockingActivation
    : defaultUserFacingResponseContractDefinition.reportingSeparation.programReadinessBlockingActivation;
  const intentFidelityFrame = payload.intentFidelityFrame && typeof payload.intentFidelityFrame === "object"
    ? payload.intentFidelityFrame
    : defaultUserFacingResponseContractDefinition.intentFidelityFrame;
  const intentFrameAnswerAdherence = intentFidelityFrame.answerAdherence && typeof intentFidelityFrame.answerAdherence === "object"
    ? intentFidelityFrame.answerAdherence
    : defaultUserFacingResponseContractDefinition.intentFidelityFrame.answerAdherence;
  const intentFrameSelectiveRepair = intentFidelityFrame.selectiveRepair && typeof intentFidelityFrame.selectiveRepair === "object"
    ? intentFidelityFrame.selectiveRepair
    : defaultUserFacingResponseContractDefinition.intentFidelityFrame.selectiveRepair;
  return Object.freeze({
    schema: safeString(payload.schema, 120) || defaultUserFacingResponseContractDefinition.schema,
    version: safeString(payload.version, 120) || defaultUserFacingResponseContractDefinition.version,
    closeInPlace: Object.freeze({
      enabled: normalizeBoolean(
        payload.closeInPlace && payload.closeInPlace.enabled,
        defaultUserFacingResponseContractDefinition.closeInPlace.enabled
      ),
      exemptTaskOutcomeStatuses: normalizeStatusList(
        payload.closeInPlace && payload.closeInPlace.exemptTaskOutcomeStatuses,
        defaultUserFacingResponseContractDefinition.closeInPlace.exemptTaskOutcomeStatuses
      ),
      allowedPromptSignals: normalizeLiteralList(
        payload.closeInPlace && payload.closeInPlace.allowedPromptSignals,
        defaultUserFacingResponseContractDefinition.closeInPlace.allowedPromptSignals
      ),
      prohibitedClosingStarts: normalizeLiteralList(
        payload.closeInPlace && payload.closeInPlace.prohibitedClosingStarts,
        defaultUserFacingResponseContractDefinition.closeInPlace.prohibitedClosingStarts
      ),
    }),
    completionClaims: Object.freeze({
      requireCompletedTaskOutcome: normalizeBoolean(
        payload.completionClaims && payload.completionClaims.requireCompletedTaskOutcome,
        defaultUserFacingResponseContractDefinition.completionClaims.requireCompletedTaskOutcome
      ),
      prohibitedLeadPhrases: normalizeLiteralList(
        payload.completionClaims && payload.completionClaims.prohibitedLeadPhrases,
        defaultUserFacingResponseContractDefinition.completionClaims.prohibitedLeadPhrases
      ),
    }),
    reportingSeparation: Object.freeze({
      enabled: normalizeBoolean(
        reportingSeparation.enabled,
        defaultUserFacingResponseContractDefinition.reportingSeparation.enabled
      ),
      ordinaryTaskReports: Object.freeze({
        primarySection: safeString(
          ordinaryTaskReports.primarySection,
          80
        ).toLowerCase() || defaultUserFacingResponseContractDefinition.reportingSeparation.ordinaryTaskReports.primarySection,
        secondarySection: safeString(
          ordinaryTaskReports.secondarySection,
          80
        ).toLowerCase() || defaultUserFacingResponseContractDefinition.reportingSeparation.ordinaryTaskReports.secondarySection,
        programReadinessOptionalWhenIrrelevant: normalizeBoolean(
          ordinaryTaskReports.programReadinessOptionalWhenIrrelevant,
          defaultUserFacingResponseContractDefinition.reportingSeparation.ordinaryTaskReports.programReadinessOptionalWhenIrrelevant
        ),
        leadWithProgramReadiness: normalizeBoolean(
          ordinaryTaskReports.leadWithProgramReadiness,
          defaultUserFacingResponseContractDefinition.reportingSeparation.ordinaryTaskReports.leadWithProgramReadiness
        ),
        treatProgramReadinessNotYetAsBackgroundByDefault: normalizeBoolean(
          ordinaryTaskReports.treatProgramReadinessNotYetAsBackgroundByDefault,
          defaultUserFacingResponseContractDefinition.reportingSeparation.ordinaryTaskReports.treatProgramReadinessNotYetAsBackgroundByDefault
        ),
        treatResidualIncompletionAsBackgroundByDefault: normalizeBoolean(
          ordinaryTaskReports.treatResidualIncompletionAsBackgroundByDefault,
          defaultUserFacingResponseContractDefinition.reportingSeparation.ordinaryTaskReports.treatResidualIncompletionAsBackgroundByDefault
        ),
        residualIncompletionPromptSignals: normalizeLiteralList(
          ordinaryTaskReports.residualIncompletionPromptSignals,
          defaultUserFacingResponseContractDefinition.reportingSeparation.ordinaryTaskReports.residualIncompletionPromptSignals
        ),
      }),
      programReadinessBlockingActivation: Object.freeze({
        requiresExplicitUserRequest: normalizeBoolean(
          programReadinessBlockingActivation.requiresExplicitUserRequest,
          defaultUserFacingResponseContractDefinition.reportingSeparation.programReadinessBlockingActivation.requiresExplicitUserRequest
        ),
        explicitRequestScopes: normalizeLiteralList(
          programReadinessBlockingActivation.explicitRequestScopes,
          defaultUserFacingResponseContractDefinition.reportingSeparation.programReadinessBlockingActivation.explicitRequestScopes
        ),
      }),
    }),
    internalProcessDisclosure: Object.freeze({
      enabled: normalizeBoolean(
        payload.internalProcessDisclosure && payload.internalProcessDisclosure.enabled,
        defaultUserFacingResponseContractDefinition.internalProcessDisclosure.enabled
      ),
      prohibitedPhrases: normalizeLiteralList(
        payload.internalProcessDisclosure && payload.internalProcessDisclosure.prohibitedPhrases,
        defaultUserFacingResponseContractDefinition.internalProcessDisclosure.prohibitedPhrases
      ),
    }),
    exactReplyContracts: Object.freeze({
      bypassCloseInPlace: normalizeBoolean(
        payload.exactReplyContracts && payload.exactReplyContracts.bypassCloseInPlace,
        defaultUserFacingResponseContractDefinition.exactReplyContracts.bypassCloseInPlace
      ),
      bypassEvidenceChecks: normalizeBoolean(
        payload.exactReplyContracts && payload.exactReplyContracts.bypassEvidenceChecks,
        defaultUserFacingResponseContractDefinition.exactReplyContracts.bypassEvidenceChecks
      ),
    }),
    intentFidelityFrame: Object.freeze({
      enabled: normalizeBoolean(
        intentFidelityFrame.enabled,
        defaultUserFacingResponseContractDefinition.intentFidelityFrame.enabled
      ),
      shadowRuntimeObservation: normalizeBoolean(
        intentFidelityFrame.shadowRuntimeObservation,
        defaultUserFacingResponseContractDefinition.intentFidelityFrame.shadowRuntimeObservation
      ),
      emitFrameObservation: normalizeBoolean(
        intentFidelityFrame.emitFrameObservation,
        defaultUserFacingResponseContractDefinition.intentFidelityFrame.emitFrameObservation
      ),
      emitWarningObservation: normalizeBoolean(
        intentFidelityFrame.emitWarningObservation,
        defaultUserFacingResponseContractDefinition.intentFidelityFrame.emitWarningObservation
      ),
      triggerPromptSignals: normalizeLiteralList(
        intentFidelityFrame.triggerPromptSignals,
        defaultUserFacingResponseContractDefinition.intentFidelityFrame.triggerPromptSignals
      ),
      highFrictionSignals: normalizeLiteralList(
        intentFidelityFrame.highFrictionSignals,
        defaultUserFacingResponseContractDefinition.intentFidelityFrame.highFrictionSignals
      ),
      requiredFrameFields: normalizeLiteralList(
        intentFidelityFrame.requiredFrameFields,
        defaultUserFacingResponseContractDefinition.intentFidelityFrame.requiredFrameFields
      ),
      responseModes: normalizeLiteralList(
        intentFidelityFrame.responseModes,
        defaultUserFacingResponseContractDefinition.intentFidelityFrame.responseModes
      ),
      answerAdherence: Object.freeze({
        minMustAnswerTermOverlap: normalizeNonNegativeInteger(
          intentFrameAnswerAdherence.minMustAnswerTermOverlap,
          defaultUserFacingResponseContractDefinition.intentFidelityFrame.answerAdherence.minMustAnswerTermOverlap
        ),
      }),
      selectiveRepair: Object.freeze({
        enabled: normalizeBoolean(
          intentFrameSelectiveRepair.enabled,
          defaultUserFacingResponseContractDefinition.intentFidelityFrame.selectiveRepair.enabled
        ),
        allowedResponseModes: normalizeLiteralList(
          intentFrameSelectiveRepair.allowedResponseModes,
          defaultUserFacingResponseContractDefinition.intentFidelityFrame.selectiveRepair.allowedResponseModes
        ),
        repairableWarningKinds: normalizeLiteralList(
          intentFrameSelectiveRepair.repairableWarningKinds,
          defaultUserFacingResponseContractDefinition.intentFidelityFrame.selectiveRepair.repairableWarningKinds
        ),
        emitNotAppliedObservation: normalizeBoolean(
          intentFrameSelectiveRepair.emitNotAppliedObservation,
          defaultUserFacingResponseContractDefinition.intentFidelityFrame.selectiveRepair.emitNotAppliedObservation
        ),
      }),
    }),
  });
}

function loadUserFacingResponseContract(filePath = defaultUserFacingResponseContractPath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = raw ? JSON.parse(raw) : {};
  return normalizeUserFacingResponseContract(parsed);
}

function summarizeUserFacingResponseContract(spec) {
  const contract = normalizeUserFacingResponseContract(spec);
  return {
    schema: contract.schema,
    version: contract.version,
    closeInPlaceEnabled: contract.closeInPlace.enabled,
    exemptTaskOutcomeStatuses: contract.closeInPlace.exemptTaskOutcomeStatuses.slice(),
    allowedPromptSignalCount: contract.closeInPlace.allowedPromptSignals.length,
    prohibitedClosingCount: contract.closeInPlace.prohibitedClosingStarts.length,
    completionClaimGateEnabled: contract.completionClaims.requireCompletedTaskOutcome,
    reportingSeparation: contract.reportingSeparation,
    internalProcessDisclosureEnabled: contract.internalProcessDisclosure.enabled,
    internalProcessPhraseCount: contract.internalProcessDisclosure.prohibitedPhrases.length,
    intentFidelityFrameEnabled: contract.intentFidelityFrame.enabled,
    intentFidelityFramePromptSignalCount: contract.intentFidelityFrame.triggerPromptSignals.length,
    intentFidelityFrameSelectiveRepairEnabled: contract.intentFidelityFrame.selectiveRepair.enabled,
  };
}

module.exports = {
  containsAnyLiteral,
  defaultUserFacingResponseContractPath,
  loadUserFacingResponseContract,
  normalizeUserFacingResponseContract,
  summarizeUserFacingResponseContract,
};
