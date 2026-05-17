"use strict";

const {
  containsAnyLiteral,
  loadUserFacingResponseContract,
  normalizeUserFacingResponseContract,
} = require("./user_facing_response_contract");

const defaultUserFacingResponseContract = loadUserFacingResponseContract();

function safeTrimmedString(value, max = 12000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function extractExactReplyContract(prompt) {
  const text = safeTrimmedString(prompt, 4000);
  if (!text) {
    return "";
  }
  const patterns = [
    /reply with exactly:\s*([^\r\n]+)/i,
    /reply with exactly\s+([^\r\n]+)/i,
    /respond with exactly:\s*([^\r\n]+)/i,
    /respond with exactly\s+([^\r\n]+)/i,
    /final reply must be exactly:\s*([^\r\n]+)/i,
    /final reply must be exactly\s+([^\r\n]+)/i,
    /final answer must be exactly:\s*([^\r\n]+)/i,
    /final answer must be exactly\s+([^\r\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return safeTrimmedString(match[1], 400);
    }
  }
  return "";
}

function resolveResponseContract(input) {
  if (!input) {
    return defaultUserFacingResponseContract;
  }
  return normalizeUserFacingResponseContract(input);
}

function promptAllowsOptionalFollowUp(prompt, responseContract = defaultUserFacingResponseContract) {
  const text = safeTrimmedString(prompt, 16000);
  if (!text) {
    return false;
  }
  const contract = resolveResponseContract(responseContract);
  return containsAnyLiteral(text, contract.closeInPlace.allowedPromptSignals);
}

function isOptionalClosingStart(text, responseContract = defaultUserFacingResponseContract) {
  const value = safeTrimmedString(text, 600);
  if (!value) {
    return false;
  }
  const contract = resolveResponseContract(responseContract);
  return containsAnyLiteral(value, contract.closeInPlace.prohibitedClosingStarts, { startsWith: true });
}

function shouldModerateClosing(prompt, taskOutcomeStatus, responseContract = defaultUserFacingResponseContract) {
  const contract = resolveResponseContract(responseContract);
  if (!contract.closeInPlace.enabled) {
    return false;
  }
  const outcome = safeTrimmedString(taskOutcomeStatus, 40).toUpperCase();
  if (contract.closeInPlace.exemptTaskOutcomeStatuses.includes(outcome)) {
    return false;
  }
  if (contract.exactReplyContracts.bypassCloseInPlace && extractExactReplyContract(prompt)) {
    return false;
  }
  if (promptAllowsOptionalFollowUp(prompt, contract)) {
    return false;
  }
  return true;
}

function promptRequestsProgramReadinessBlocking(prompt, responseContract = defaultUserFacingResponseContract) {
  const contract = resolveResponseContract(responseContract);
  const reportingSeparation = contract.reportingSeparation;
  if (!reportingSeparation.enabled) {
    return false;
  }
  const activation = reportingSeparation.programReadinessBlockingActivation;
  if (!activation.requiresExplicitUserRequest) {
    return true;
  }
  const text = safeTrimmedString(prompt, 16000).toLowerCase();
  if (!text) {
    return false;
  }
  return activation.explicitRequestScopes.some((scope) => {
    const normalized = safeTrimmedString(scope, 120).toLowerCase();
    if (!normalized) {
      return false;
    }
    const variants = [
      normalized,
      normalized.replace(/_/g, " "),
      normalized.replace(/_/g, "-"),
    ];
    return variants.some((variant) => variant && text.includes(variant));
  });
}

function promptRequestsResidualIncompletionExplanation(prompt, responseContract = defaultUserFacingResponseContract) {
  const contract = resolveResponseContract(responseContract);
  const text = safeTrimmedString(prompt, 16000).toLowerCase();
  if (!text) {
    return false;
  }
  return containsAnyLiteral(
    text,
    contract.reportingSeparation.ordinaryTaskReports.residualIncompletionPromptSignals
  );
}

const decisionRationalePromptSignals = Object.freeze([
  "why",
  "reason",
  "rationale",
  "valid",
  "best",
  "compare",
  "which",
  "decision",
  "should",
  "design",
  "implementation",
  "\u306a\u305c",
  "\u7406\u7531",
  "\u59a5\u5f53",
  "\u30d9\u30b9\u30c8",
  "\u6bd4\u8f03",
  "\u3069\u3063\u3061",
  "\u5224\u65ad",
  "\u8a2d\u8a08",
  "\u5b9f\u88c5\u3059\u3079\u304d",
  "\u3069\u3046\u5b9f\u88c5",
  "\u3069\u3046\u3059\u308b\u306e\u304c\u3088\u3044",
  "\u3069\u3046\u3059\u308b\u306e\u304c\u30d9\u30b9\u30c8",
]);

const decisionRationaleAnswerSignals = Object.freeze({
  conclusion: Object.freeze([
    "best",
    "recommend",
    "conclusion",
    "\u7d50\u8ad6",
    "\u8981\u3059\u308b\u306b",
    "\u30d9\u30b9\u30c8",
    "\u6700\u521d\u306f",
    "\u3059\u3079\u304d",
  ]),
  reason: Object.freeze([
    "because",
    "reason",
    "rationale",
    "valid",
    "\u7406\u7531",
    "\u306a\u305c\u306a\u3089",
    "\u6839\u62e0",
    "\u59a5\u5f53",
  ]),
  uncertainty_or_limit: Object.freeze([
    "uncertain",
    "limit",
    "risk",
    "not yet",
    "\u4e0d\u78ba\u5b9f",
    "\u9650\u754c",
    "\u305f\u3060\u3057",
    "\u307e\u3060",
    "\u30ea\u30b9\u30af",
    "\u904e\u5270",
  ]),
  rejected_alternative: Object.freeze([
    "alternative",
    "instead",
    "avoid",
    "reject",
    "\u4ed6\u6848",
    "\u4ee3\u66ff",
    "\u63a1\u3089\u306a\u3044",
    "\u907f\u3051\u308b",
    "\u3088\u308a",
    "\u3067\u306f\u306a\u304f",
  ]),
});

function promptBypassesDecisionRationaleLint(prompt, responseContract = defaultUserFacingResponseContract) {
  const text = safeTrimmedString(prompt, 16000);
  if (!text) {
    return true;
  }
  const contract = resolveResponseContract(responseContract);
  if (contract.exactReplyContracts.bypassEvidenceChecks !== false && extractExactReplyContract(text)) {
    return true;
  }
  return text.trim().startsWith("/");
}

function promptNeedsDecisionRationale(prompt, responseContract = defaultUserFacingResponseContract) {
  if (promptBypassesDecisionRationaleLint(prompt, responseContract)) {
    return false;
  }
  return containsAnyLiteral(prompt, decisionRationalePromptSignals);
}

function detectThinDecisionRationale({
  prompt = "",
  answer = "",
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  if (!promptNeedsDecisionRationale(prompt, responseContract)) {
    return null;
  }
  const text = safeTrimmedString(answer, 16000);
  const missing = Object.entries(decisionRationaleAnswerSignals)
    .filter(([, signals]) => !containsAnyLiteral(text, signals))
    .map(([component]) => component);
  if (missing.length < 2) {
    return null;
  }
  return {
    kind: "thin_decision_rationale",
    missing,
    mode: "warning",
  };
}

function promptRequiresMachineReadableOnly(prompt) {
  const text = safeTrimmedString(prompt, 4000).toLowerCase();
  if (!text) {
    return false;
  }
  return [
    "json only",
    "valid json",
    "machine-readable only",
    "reply only with json",
    "respond only with json",
    "\u6a5f\u68b0\u53ef\u8aad",
    "json\u3060\u3051",
  ].some((signal) => text.includes(signal));
}

function promptBypassesIntentFidelityFrame(prompt, responseContract = defaultUserFacingResponseContract) {
  const text = safeTrimmedString(prompt, 16000);
  if (!text) {
    return true;
  }
  const contract = resolveResponseContract(responseContract);
  if (contract.exactReplyContracts.bypassEvidenceChecks !== false && extractExactReplyContract(text)) {
    return true;
  }
  if (text.trim().startsWith("/")) {
    return true;
  }
  return promptRequiresMachineReadableOnly(text);
}

function normalizeRecentUserMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .map((entry) => {
      if (typeof entry === "string") {
        return safeTrimmedString(entry, 4000);
      }
      if (entry && typeof entry === "object") {
        return safeTrimmedString(entry.text || entry.content || entry.message || "", 4000);
      }
      return "";
    })
    .filter(Boolean)
    .slice(-8);
}

function promptNeedsIntentFidelityFrame(
  prompt,
  context = {},
  responseContract = defaultUserFacingResponseContract
) {
  const contract = resolveResponseContract(responseContract);
  const frameContract = contract.intentFidelityFrame || {};
  if (!frameContract.enabled || promptBypassesIntentFidelityFrame(prompt, contract)) {
    return false;
  }
  const text = safeTrimmedString(prompt, 16000);
  if (containsAnyLiteral(text, frameContract.triggerPromptSignals)) {
    return true;
  }
  const ctx = context && typeof context === "object" ? context : {};
  if (
    ctx.previousAssistantWasChallenged ||
    ctx.requiresConversationHistory ||
    ctx.touchesRequirementUnderstanding ||
    ctx.userDissatisfaction
  ) {
    return true;
  }
  const recentText = normalizeRecentUserMessages(ctx.recentUserMessages).join("\n");
  return containsAnyLiteral(recentText, frameContract.highFrictionSignals);
}

function firstNonEmptyLine(text, max = 320) {
  return splitLines(text)[0] ? safeTrimmedString(splitLines(text)[0], max) : "";
}

function summarizeLatestRequest(prompt) {
  const text = safeTrimmedString(prompt, 16000);
  if (!text) {
    return "";
  }
  const lines = splitLines(text);
  const lastQuestion = lines
    .slice()
    .reverse()
    .find((line) => /[?\uff1f]\s*$/.test(line));
  return safeTrimmedString(lastQuestion || lines[lines.length - 1] || text, 320);
}

function deriveResponseMode(prompt, context, responseContract) {
  const text = safeTrimmedString(prompt, 16000);
  const recentText = normalizeRecentUserMessages(context && context.recentUserMessages).join("\n");
  const joined = [recentText, text].filter(Boolean).join("\n");
  const contract = resolveResponseContract(responseContract);
  const highFrictionSignals = contract.intentFidelityFrame.highFrictionSignals;
  if (containsAnyLiteral(joined, highFrictionSignals)) {
    return "correction";
  }
  if (containsAnyLiteral(text, ["review", "\u30ec\u30d3\u30e5\u30fc", "\u6307\u6458", "\u554f\u984c\u70b9"])) {
    return "review";
  }
  if (containsAnyLiteral(text, ["changed", "implemented", "verified", "\u5909\u66f4", "\u5b9f\u88c5\u6e08\u307f", "\u691c\u8a3c"])) {
    return "implementation_report";
  }
  if (containsAnyLiteral(text, ["design", "implementation", "best", "\u8a2d\u8a08", "\u5b9f\u88c5", "\u30d9\u30b9\u30c8", "\u601d\u60f3"])) {
    return "design";
  }
  if (promptNeedsDecisionRationale(text, contract)) {
    return "rationale";
  }
  return "short";
}

function deriveInferredIntent(prompt, context, responseContract) {
  const text = safeTrimmedString(prompt, 16000);
  const contract = resolveResponseContract(responseContract);
  if (containsAnyLiteral(text, contract.intentFidelityFrame.highFrictionSignals)) {
    return "Resolve a possible intent mismatch and answer the user's actual concern rather than only the surface wording.";
  }
  if (containsAnyLiteral(text, ["\u8a2d\u8a08", "\u601d\u60f3", "\u7d71\u4e00\u611f", "design", "principle", "coherent"])) {
    return "Choose a coherent design direction that preserves the user's intent and avoids scattered local patches.";
  }
  if (promptNeedsDecisionRationale(text, contract)) {
    return "Support a decision with a defensible conclusion, rationale, limits, and rejected alternatives.";
  }
  const recent = normalizeRecentUserMessages(context && context.recentUserMessages).join("\n");
  if (containsAnyLiteral(recent, contract.intentFidelityFrame.highFrictionSignals)) {
    return "Continue from the user's prior correction and avoid repeating the same intent-understanding failure.";
  }
  return "Answer the user's current request directly with the smallest useful scope.";
}

function deriveActiveFrustrationOrRisk(prompt, context, responseContract) {
  const text = safeTrimmedString(prompt, 16000);
  const recent = normalizeRecentUserMessages(context && context.recentUserMessages).join("\n");
  const contract = resolveResponseContract(responseContract);
  const joined = [recent, text].filter(Boolean).join("\n");
  if (containsAnyLiteral(joined, contract.intentFidelityFrame.highFrictionSignals)) {
    return "The user is signaling that a locally plausible answer may still be off-intent, shallow, or overly agreeable.";
  }
  if (containsAnyLiteral(joined, ["\u7d71\u4e00\u611f", "coherent", "scattered", "\u30d0\u30e9\u30d0\u30e9"])) {
    return "A narrow patch may create incoherent behavior unless it is tied to the existing intent-first architecture.";
  }
  return "";
}

function deriveDecisionAtStake(prompt, responseContract) {
  const text = safeTrimmedString(prompt, 16000);
  if (!promptNeedsDecisionRationale(text, responseContract)) {
    return "";
  }
  return "Decide the best answer, implementation, or design direction for the user's request.";
}

function deriveMustNotDo(prompt, context, responseContract) {
  const text = safeTrimmedString(prompt, 16000);
  const recent = normalizeRecentUserMessages(context && context.recentUserMessages).join("\n");
  const contract = resolveResponseContract(responseContract);
  const joined = [recent, text].filter(Boolean).join("\n");
  if (containsAnyLiteral(joined, ["\u8fce\u5408", "appease", "\u63d0\u6848\u3057\u305f\u3089\u3059\u3050", "agree"])) {
    return "Do not merely agree with the user's proposed direction without applying an independent standard.";
  }
  if (containsAnyLiteral(joined, contract.intentFidelityFrame.highFrictionSignals)) {
    return "Do not answer only the latest wording while ignoring the user's broader correction or frustration.";
  }
  if (containsAnyLiteral(joined, ["lint", "\u30ea\u30f3\u30c8", "\u691c\u51fa\u5668"])) {
    return "Do not propose another isolated detector when the issue is broader intent fidelity.";
  }
  return "Do not add low-value surrounding explanation that misses the direct point.";
}

function deriveIndependentStandard(prompt, context) {
  const text = safeTrimmedString(prompt, 16000);
  if (containsAnyLiteral(text, ["\u8a2d\u8a08", "\u601d\u60f3", "\u7d71\u4e00\u611f", "design", "principle", "coherent"])) {
    return "Intent fidelity, coherence with existing requirement contracts, observability, reversibility, and low false-positive blast radius.";
  }
  if (containsAnyLiteral(text, ["\u30d9\u30b9\u30c8", "best", "should", "\u3069\u3046\u3059\u308b\u306e\u304c"])) {
    return "User-adoptable outcome, evidence, bounded scope, implementation cost, and residual risk.";
  }
  if (context && context.requirementSnapshot) {
    return "The locked requirement, acceptance checks, non-goals, and evidence expectations.";
  }
  return "The user's explicit request, inferred intent, adoption readiness, evidence, and safety boundaries.";
}

function buildIntentFidelityFrame({
  prompt = "",
  recentUserMessages = [],
  previousAssistantAnswer = "",
  requirementSnapshot = null,
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  const context = {
    recentUserMessages,
    previousAssistantAnswer,
    requirementSnapshot,
  };
  const contract = resolveResponseContract(responseContract);
  const literalRequest = summarizeLatestRequest(prompt);
  const responseMode = deriveResponseMode(prompt, context, contract);
  const activeRisk = deriveActiveFrustrationOrRisk(prompt, context, contract);
  const decisionAtStake = deriveDecisionAtStake(prompt, contract);
  const confidence = activeRisk || decisionAtStake ? "high" : "medium";
  return {
    literal_request: literalRequest,
    inferred_intent: deriveInferredIntent(prompt, context, contract),
    active_frustration_or_risk: activeRisk,
    decision_at_stake: decisionAtStake,
    must_answer: literalRequest || firstNonEmptyLine(prompt, 320),
    must_not_do: deriveMustNotDo(prompt, context, contract),
    independent_standard: deriveIndependentStandard(prompt, context),
    confidence,
    response_mode: contract.intentFidelityFrame.responseModes.includes(responseMode)
      ? responseMode
      : "short",
  };
}

const answerTermStopWords = Object.freeze([
  "about",
  "after",
  "answer",
  "before",
  "central",
  "direct",
  "explain",
  "frame",
  "layer",
  "should",
  "that",
  "this",
  "whether",
  "with",
]);

function extractMeaningfulTerms(text) {
  const normalized = safeTrimmedString(text, 1200).toLowerCase();
  if (!normalized) {
    return [];
  }
  const matches = normalized.match(/[a-z0-9_]{4,}|[\u3040-\u30ff\u3400-\u9fff]{2,}/g) || [];
  const out = [];
  const seen = new Set();
  for (const raw of matches) {
    const term = raw.trim();
    if (!term || answerTermStopWords.includes(term) || seen.has(term)) {
      continue;
    }
    seen.add(term);
    out.push(term);
  }
  return out.slice(0, 24);
}

function countTermOverlap(terms, text) {
  const answer = safeTrimmedString(text, 16000).toLowerCase();
  if (!answer || !Array.isArray(terms)) {
    return 0;
  }
  return terms.filter((term) => term && answer.includes(term)).length;
}

function looksLikeAppeasementWithoutStandard(answer) {
  const text = safeTrimmedString(answer, 16000).toLowerCase();
  if (!text) {
    return false;
  }
  const appeasingLead = [
    "yes",
    "exactly",
    "that is right",
    "you're right",
    "\u305d\u306e\u901a\u308a",
    "\u304a\u3063\u3057\u3083\u308b\u901a\u308a",
    "\u305d\u3046\u3067\u3059",
  ].some((signal) => text.startsWith(signal) || text.includes(`${signal}\u3002`));
  if (!appeasingLead) {
    return false;
  }
  return !containsAnyLiteral(text, [
    "standard",
    "basis",
    "because",
    "reason",
    "\u57fa\u6e96",
    "\u6839\u62e0",
    "\u7406\u7531",
    "\u306a\u305c\u306a\u3089",
  ]);
}

function detectIntentFrameAdherence({
  frame = null,
  answer = "",
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  const contract = resolveResponseContract(responseContract);
  const frameContract = contract.intentFidelityFrame || {};
  if (!frameContract.enabled || !frame || typeof frame !== "object") {
    return null;
  }
  const missing = frameContract.requiredFrameFields
    .filter((field) => !safeTrimmedString(frame[field], 1200));
  if (missing.length > 0) {
    return {
      kind: "missing_intent_frame_field",
      missing,
      mode: "warning",
    };
  }
  const text = safeTrimmedString(answer, 24000);
  if (!text) {
    return {
      kind: "answer_misses_must_answer",
      mode: "warning",
    };
  }
  const terms = extractMeaningfulTerms(frame.must_answer);
  const minOverlap = Math.max(0, frameContract.answerAdherence.minMustAnswerTermOverlap || 0);
  if (terms.length > 0 && countTermOverlap(terms, text) < minOverlap) {
    return {
      kind: "answer_misses_must_answer",
      mode: "warning",
      terms: terms.slice(0, 8),
    };
  }
  if (looksLikeAppeasementWithoutStandard(text)) {
    return {
      kind: "possible_user_appeasement",
      mode: "warning",
    };
  }
  return null;
}

function buildIntentFrameRepairPrompt({
  frame = null,
  warning = null,
  answer = "",
} = {}) {
  if (!frame || !warning) {
    return "";
  }
  return [
    "Revise the final answer to satisfy the intent fidelity frame.",
    `must_answer: ${safeTrimmedString(frame.must_answer, 600)}`,
    `must_not_do: ${safeTrimmedString(frame.must_not_do, 600)}`,
    `independent_standard: ${safeTrimmedString(frame.independent_standard, 600)}`,
    `warning: ${safeTrimmedString(warning.kind, 120)}`,
    "",
    "Keep the answer concise, direct, and user-facing. Do not expose this frame.",
    "",
    safeTrimmedString(answer, 12000),
  ].join("\n");
}

function selectIntentFrameRepairAction({
  frame = null,
  warning = null,
  answer = "",
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  const contract = resolveResponseContract(responseContract);
  const repair = contract.intentFidelityFrame.selectiveRepair;
  const originalAnswer = safeTrimmedString(answer, 24000);
  if (!repair.enabled) {
    return {
      applied: false,
      reason: "disabled",
      answer: originalAnswer,
    };
  }
  if (!frame || !warning) {
    return {
      applied: false,
      reason: "no_warning",
      answer: originalAnswer,
    };
  }
  const responseMode = safeTrimmedString(frame.response_mode, 80).toLowerCase();
  const warningKind = safeTrimmedString(warning.kind, 120).toLowerCase();
  if (!repair.allowedResponseModes.includes(responseMode)) {
    return {
      applied: false,
      reason: "response_mode_not_allowed",
      answer: originalAnswer,
    };
  }
  if (!repair.repairableWarningKinds.includes(warningKind)) {
    return {
      applied: false,
      reason: "warning_not_repairable",
      answer: originalAnswer,
    };
  }
  return {
    applied: false,
    reason: "model_retry_required",
    answer: originalAnswer,
    retryPrompt: buildIntentFrameRepairPrompt({ frame, warning, answer: originalAnswer }),
  };
}

function splitParagraphs(text) {
  return safeTrimmedString(text, 16000)
    .split(/\r?\n\s*\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitLines(text) {
  return safeTrimmedString(text, 16000)
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stripLeadingSentenceWhen(text, predicate) {
  const original = safeTrimmedString(text, 16000);
  if (!original || typeof predicate !== "function") {
    return original;
  }
  const match = original.match(/^(.+?[.!?\u3002\uff01\uff1f])(\s+|$)([\s\S]*)$/);
  if (!match) {
    return original;
  }
  const leadSentence = safeTrimmedString(match[1], 1600);
  if (!leadSentence || !predicate(leadSentence)) {
    return original;
  }
  const remainder = safeTrimmedString(match[3], 16000);
  return remainder || original;
}

function containsInternalProcessDisclosure(text, responseContract = defaultUserFacingResponseContract) {
  const contract = resolveResponseContract(responseContract);
  if (!contract.internalProcessDisclosure.enabled) {
    return false;
  }
  return containsAnyLiteral(text, contract.internalProcessDisclosure.prohibitedPhrases);
}

function detectUnsolicitedClosingProposal({
  prompt = "",
  answer = "",
  taskOutcomeStatus = "",
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  const contract = resolveResponseContract(responseContract);
  if (!shouldModerateClosing(prompt, taskOutcomeStatus, contract)) {
    return null;
  }
  const text = safeTrimmedString(answer, 16000);
  if (!text) {
    return null;
  }
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length > 1 && isOptionalClosingStart(paragraphs[paragraphs.length - 1], contract)) {
    return {
      kind: "paragraph",
      text: paragraphs[paragraphs.length - 1],
    };
  }
  const lines = splitLines(text);
  if (lines.length > 1 && isOptionalClosingStart(lines[lines.length - 1], contract)) {
    return {
      kind: "line",
      text: lines[lines.length - 1],
    };
  }
  const sentenceMatch = text.match(/[.!?\u3002\uff01\uff1f]\s*(.+)$/);
  if (sentenceMatch && sentenceMatch[1] && isOptionalClosingStart(sentenceMatch[1], contract)) {
    return {
      kind: "sentence",
      text: safeTrimmedString(sentenceMatch[1], 600),
    };
  }
  return null;
}

function stripUnsolicitedClosingProposal({
  prompt = "",
  answer = "",
  taskOutcomeStatus = "",
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  const original = safeTrimmedString(answer, 16000);
  const contract = resolveResponseContract(responseContract);
  if (!original || !shouldModerateClosing(prompt, taskOutcomeStatus, contract)) {
    return original;
  }

  let current = original;
  let changed = false;

  while (true) {
    const paragraphs = splitParagraphs(current);
    if (paragraphs.length <= 1 || !isOptionalClosingStart(paragraphs[paragraphs.length - 1], contract)) {
      break;
    }
    paragraphs.pop();
    current = paragraphs.join("\n\n").trim();
    changed = true;
  }

  while (true) {
    const lines = splitLines(current);
    if (lines.length <= 1 || !isOptionalClosingStart(lines[lines.length - 1], contract)) {
      break;
    }
    lines.pop();
    current = lines.join("\n").trim();
    changed = true;
  }

  const sentenceMatch = current.match(/^(.*?)([.!?\u3002\uff01\uff1f]\s*)(.+)$/s);
  if (sentenceMatch && sentenceMatch[3] && isOptionalClosingStart(sentenceMatch[3], contract)) {
    current = safeTrimmedString(`${sentenceMatch[1]}${sentenceMatch[2]}`, 16000);
    changed = true;
  }

  return changed ? current : original;
}

function stripInternalProcessDisclosure({
  answer = "",
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  const original = safeTrimmedString(answer, 16000);
  const contract = resolveResponseContract(responseContract);
  if (!original || !contract.internalProcessDisclosure.enabled) {
    return original;
  }

  let current = original;
  let changed = false;

  const originalParagraphs = splitParagraphs(current);
  const filteredParagraphs = originalParagraphs.filter((paragraph) => !containsInternalProcessDisclosure(paragraph, contract));
  if (filteredParagraphs.length !== originalParagraphs.length) {
    current = filteredParagraphs.join("\n\n").trim();
    changed = true;
  }

  const originalLines = splitLines(current);
  const filteredLines = originalLines.filter((line) => !containsInternalProcessDisclosure(line, contract));
  if (filteredLines.length !== originalLines.length) {
    current = filteredLines.join("\n").trim();
    changed = true;
  }

  return changed ? current : original;
}

function looksLikeProgramReadinessLead(text) {
  const normalized = safeTrimmedString(text, 1600).toLowerCase();
  if (!normalized) {
    return false;
  }
  const readinessMarkers = [
    "program readiness",
    "goal_completion_status",
    "goal status",
    "goalstatus",
    "repo 全体",
    "repo全体",
    "ハーネス全体",
    "system readiness",
  ];
  const notYetMarkers = ["not_yet", "not yet", "未完了"];
  return readinessMarkers.some((marker) => normalized.includes(marker))
    && notYetMarkers.some((marker) => normalized.includes(marker));
}

function looksLikeResidualIncompletionLead(text) {
  const normalized = safeTrimmedString(text, 1600).toLowerCase();
  if (!normalized) {
    return false;
  }
  const incompletionMarkers = [
    "not complete",
    "still not complete",
    "not fully complete",
    "unfinished",
    "remaining blocker",
    "remaining blockers",
    "what remains",
    "residual blocker",
    "residual blockers",
    "\u672a\u5b8c\u4e86",
    "\u307e\u3060\u5b8c\u4e86\u3067\u306f\u306a\u3044",
    "\u4f55\u304c\u6b8b\u3063\u3066\u3044\u308b",
  ];
  return containsAnyLiteral(normalized, incompletionMarkers);
}

function stripLeadingProgramReadinessLead({
  prompt = "",
  answer = "",
  taskOutcomeStatus = "",
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  const original = safeTrimmedString(answer, 16000);
  const contract = resolveResponseContract(responseContract);
  if (!original || !contract.reportingSeparation.enabled) {
    return original;
  }
  if (safeTrimmedString(taskOutcomeStatus, 40).toUpperCase() !== "COMPLETED") {
    return original;
  }
  if (contract.reportingSeparation.ordinaryTaskReports.leadWithProgramReadiness) {
    return original;
  }
  if (promptRequestsProgramReadinessBlocking(prompt, contract)) {
    return original;
  }

  const paragraphs = splitParagraphs(original);
  if (paragraphs.length > 1 && looksLikeProgramReadinessLead(paragraphs[0])) {
    return paragraphs.slice(1).join("\n\n").trim();
  }

  const lines = splitLines(original);
  if (lines.length > 1 && looksLikeProgramReadinessLead(lines[0])) {
    return lines.slice(1).join("\n").trim();
  }

  return stripLeadingSentenceWhen(original, looksLikeProgramReadinessLead);
}

function stripLeadingResidualIncompletionLead({
  prompt = "",
  answer = "",
  taskOutcomeStatus = "",
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  const original = safeTrimmedString(answer, 16000);
  const contract = resolveResponseContract(responseContract);
  if (!original || !contract.reportingSeparation.enabled) {
    return original;
  }
  if (safeTrimmedString(taskOutcomeStatus, 40).toUpperCase() !== "COMPLETED") {
    return original;
  }
  if (!contract.reportingSeparation.ordinaryTaskReports.treatResidualIncompletionAsBackgroundByDefault) {
    return original;
  }
  if (promptRequestsProgramReadinessBlocking(prompt, contract)) {
    return original;
  }
  if (promptRequestsResidualIncompletionExplanation(prompt, contract)) {
    return original;
  }

  const paragraphs = splitParagraphs(original);
  if (paragraphs.length > 1 && looksLikeResidualIncompletionLead(paragraphs[0])) {
    return paragraphs.slice(1).join("\n\n").trim();
  }

  const lines = splitLines(original);
  if (lines.length > 1 && looksLikeResidualIncompletionLead(lines[0])) {
    return lines.slice(1).join("\n").trim();
  }

  return stripLeadingSentenceWhen(original, looksLikeResidualIncompletionLead);
}

function leadContainsCompletionClaim(text, responseContract = defaultUserFacingResponseContract) {
  const contract = resolveResponseContract(responseContract);
  if (!contract.completionClaims.requireCompletedTaskOutcome) {
    return false;
  }
  const lead = safeTrimmedString(text, 320);
  if (!lead) {
    return false;
  }
  return containsAnyLiteral(lead, contract.completionClaims.prohibitedLeadPhrases);
}

module.exports = {
  defaultUserFacingResponseContract,
  containsInternalProcessDisclosure,
  buildIntentFidelityFrame,
  detectThinDecisionRationale,
  detectIntentFrameAdherence,
  detectUnsolicitedClosingProposal,
  extractExactReplyContract,
  leadContainsCompletionClaim,
  promptNeedsDecisionRationale,
  promptNeedsIntentFidelityFrame,
  promptRequestsProgramReadinessBlocking,
  promptRequestsResidualIncompletionExplanation,
  promptAllowsOptionalFollowUp,
  selectIntentFrameRepairAction,
  stripLeadingResidualIncompletionLead,
  stripLeadingProgramReadinessLead,
  stripInternalProcessDisclosure,
  stripUnsolicitedClosingProposal,
};
