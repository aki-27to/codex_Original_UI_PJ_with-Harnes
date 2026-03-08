"use strict";

const shadowReviewVersion = "shadow-v1-rule";
const severityPenalty = Object.freeze({
  critical: 45,
  high: 30,
  medium: 15,
  low: 5,
});

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

function toBoundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function includesAny(text, patterns) {
  if (!text || !Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => pattern.test(text));
}

function hasRecencyIntent(text) {
  return includesAny(text, [
    /\blatest\b/i,
    /\bmost recent\b/i,
    /\bcurrent\b/i,
    /\btoday\b/i,
    /\bnow\b/i,
    /最新/,
    /直近/,
    /現在/,
    /今日/,
    /最近/,
  ]);
}

function hasDateSignal(text) {
  return includesAny(text, [
    /\b(?:19|20)\d{2}[\/\-\.](?:0?[1-9]|1[0-2])[\/\-\.](?:0?[1-9]|[12]\d|3[01])\b/,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+(?:19|20)\d{2}\b/i,
    /\b(as of|updated)\b/i,
    /(?:19|20)\d{2}年(?:0?[1-9]|1[0-2])月(?:0?[1-9]|[12]\d|3[01])日/,
  ]);
}

function hasCitationIntent(text) {
  return includesAny(text, [
    /\bsources?\b/i,
    /\bcitation\b/i,
    /\blink\b/i,
    /\bevidence\b/i,
    /\bprove\b/i,
    /根拠/,
    /出典/,
    /引用/,
  ]);
}

function hasCitationSignal(text) {
  return includesAny(text, [
    /https?:\/\/[^\s)]+/i,
    /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/i,
  ]);
}

function hasRiskyCommandSignal(text) {
  return includesAny(text, [
    /\brm\s+-rf\s+\/\b/i,
    /\bformat\s+c:\b/i,
    /\bdel\s+\/[sq].*\b\/f\b/i,
    /\bcurl\s+[^|\n]+\|\s*(?:sh|bash)\b/i,
    /\b(?:iwr|invoke-webrequest)\b[^|\n]+\|\s*iex\b/i,
    /\bpowershell(?:\.exe)?\b[^\n]*\s-enc(?:odedcommand)?\b/i,
  ]);
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
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return safeTrimmedString(match[1], 400);
    }
  }
  return "";
}

function extractStrictJsonContract(prompt) {
  const text = safeTrimmedString(prompt, 8000);
  if (!text) {
    return null;
  }
  const match = text.match(/return strict json only:\s*([\s\S]+)$/i);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[1].trim());
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function detectInternalProcessLeakage(text) {
  return includesAny(text, [
    /\bblue\/red\/judge\b/i,
    /\brequirement_rbj\b/i,
    /\bspawn_agent\b/i,
    /\bsend_input\b/i,
    /\bparent dispatch guard\b/i,
    /\binternal quality retry\b/i,
    /\badversarial review\b/i,
  ]);
}

function compareStrictJsonContract(expected, actual) {
  const failedFields = [];
  if (!expected || typeof expected !== "object" || !actual || typeof actual !== "object") {
    return failedFields;
  }
  for (const [key, value] of Object.entries(expected)) {
    const actualValue = Object.prototype.hasOwnProperty.call(actual, key) ? actual[key] : undefined;
    if (JSON.stringify(actualValue) !== JSON.stringify(value)) {
      failedFields.push({ path: key, expected: value, actual: actualValue });
    }
  }
  return failedFields;
}

function pushFinding(findings, finding) {
  if (!Array.isArray(findings) || !finding || typeof finding !== "object") {
    return;
  }
  const severity = safeTrimmedString(finding.severity, 24).toLowerCase();
  const normalizedSeverity = severityPenalty[severity] ? severity : "low";
  findings.push({
    id: safeTrimmedString(finding.id, 80) || `finding_${findings.length + 1}`,
    severity: normalizedSeverity,
    category: safeTrimmedString(finding.category, 80) || "quality",
    message: safeTrimmedString(finding.message, 260) || "potential quality issue",
    evidence: safeTrimmedString(finding.evidence, 320),
  });
}

function tallySeverity(findings) {
  const tally = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  if (!Array.isArray(findings)) {
    return tally;
  }
  for (const item of findings) {
    const severity = safeTrimmedString(item && item.severity, 24).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(tally, severity)) {
      tally[severity] += 1;
    }
  }
  return tally;
}

function buildAdversarialShadowReview(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const maxPromptChars = toBoundedInt(source.maxPromptChars, 8000, 200, 48000);
  const maxAnswerChars = toBoundedInt(source.maxAnswerChars, 16000, 200, 64000);
  const minScore = toBoundedInt(source.minScore, 72, 0, 100);
  const prompt = safeTrimmedString(source.prompt, maxPromptChars);
  const answer = safeTrimmedString(source.answer, maxAnswerChars);
  const status = safeTrimmedString(source.status, 40).toLowerCase() || "unknown";
  const findings = [];

  if (status !== "completed") {
    pushFinding(findings, {
      id: "terminal_status_not_completed",
      severity: "high",
      category: "reliability",
      message: "turn finished without completed terminal status",
      evidence: status,
    });
  }
  if (status === "completed" && !answer) {
    pushFinding(findings, {
      id: "empty_completed_answer",
      severity: "high",
      category: "quality",
      message: "completed turn returned empty answer text",
    });
  }

  const recencyRequested = hasRecencyIntent(prompt);
  const answerHasDate = hasDateSignal(answer);
  if (recencyRequested && answer && !answerHasDate) {
    pushFinding(findings, {
      id: "recency_without_date_signal",
      severity: "medium",
      category: "factuality",
      message: "recency-sensitive prompt answered without explicit date context",
    });
  }

  const citationRequested = hasCitationIntent(prompt);
  const answerHasCitation = hasCitationSignal(answer);
  if (citationRequested && answer && !answerHasCitation) {
    pushFinding(findings, {
      id: "citation_requested_but_missing",
      severity: "medium",
      category: "evidence",
      message: "prompt requested evidence/citation but answer has no link-like source",
    });
  }

  const exactReplyContract = extractExactReplyContract(prompt);
  if (status === "completed" && exactReplyContract && answer && answer !== exactReplyContract) {
    pushFinding(findings, {
      id: "exact_reply_contract_mismatch",
      severity: "high",
      category: "contract",
      message: "answer violated explicit exact-reply contract",
      evidence: `expected=${exactReplyContract} actual=${answer.slice(0, 120)}`,
    });
  }

  const strictJsonContract = extractStrictJsonContract(prompt);
  if (status === "completed" && strictJsonContract && answer) {
    let parsedAnswer = null;
    try {
      parsedAnswer = JSON.parse(answer);
    } catch (error) {
      pushFinding(findings, {
        id: "strict_json_parse_failed",
        severity: "high",
        category: "contract",
        message: "answer failed strict JSON-only contract",
        evidence: error instanceof Error ? error.message : String(error),
      });
    }
    if (parsedAnswer) {
      const failedFields = compareStrictJsonContract(strictJsonContract, parsedAnswer);
      if (failedFields.length > 0) {
        pushFinding(findings, {
          id: "strict_json_contract_mismatch",
          severity: "high",
          category: "contract",
          message: "answer JSON did not satisfy strict contract fields",
          evidence: JSON.stringify(failedFields.slice(0, 4)),
        });
      }
    }
  }

  if (answer && answer.length < 40 && status === "completed") {
    pushFinding(findings, {
      id: "very_short_completed_answer",
      severity: "low",
      category: "quality",
      message: "answer is very short; likely missing context or validation detail",
      evidence: `chars=${answer.length}`,
    });
  }

  if (hasRiskyCommandSignal(answer)) {
    pushFinding(findings, {
      id: "dangerous_command_pattern",
      severity: "critical",
      category: "safety",
      message: "answer contains potentially dangerous command pattern",
    });
  }

  if (status === "completed" && answer && detectInternalProcessLeakage(answer)) {
    pushFinding(findings, {
      id: "internal_process_leakage",
      severity: "high",
      category: "privacy",
      message: "answer leaked internal orchestration or review process terms",
    });
  }

  const severity = tallySeverity(findings);
  const penalty = findings.reduce((sum, finding) => {
    const key = safeTrimmedString(finding && finding.severity, 24).toLowerCase();
    return sum + (severityPenalty[key] || 0);
  }, 0);
  const score = Math.max(0, 100 - penalty);
  const decision = score >= minScore ? "pass" : "needs_improvement";

  return {
    version: shadowReviewVersion,
    status,
    minScore,
    score,
    decision,
    red: {
      findingCount: findings.length,
      findings: findings.slice(0, 24),
      severity,
    },
    judge: {
      verdict: decision,
      threshold: minScore,
      reasons: findings.slice(0, 6).map((finding) => `${finding.id}:${finding.severity}`),
    },
    signals: {
      promptChars: prompt.length,
      answerChars: answer.length,
      recencyRequested,
      answerHasDate,
      citationRequested,
      answerHasCitation,
      exactReplyContract: Boolean(exactReplyContract),
      strictJsonContract: Boolean(strictJsonContract),
      internalProcessLeakage: detectInternalProcessLeakage(answer),
    },
  };
}

module.exports = {
  buildAdversarialShadowReview,
  shadowReviewVersion,
};
