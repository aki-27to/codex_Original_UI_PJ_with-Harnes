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
  detectUnsolicitedClosingProposal,
  extractExactReplyContract,
  leadContainsCompletionClaim,
  promptAllowsOptionalFollowUp,
  stripInternalProcessDisclosure,
  stripUnsolicitedClosingProposal,
};
