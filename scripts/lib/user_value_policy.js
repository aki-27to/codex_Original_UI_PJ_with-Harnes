"use strict";

const defaultWeights = Object.freeze({
  correctness: 0.4,
  completeness: 0.2,
  specificity: 0.15,
  actionability: 0.15,
  followUpCorrectionPressure: 0.1,
});

const defaultPenaltyPatterns = Object.freeze([
  /\b(?:not\s+sure|unsure|unclear|cannot\s+tell|can't\s+tell|need\s+more\s+context|need\s+more\s+information)\b/gi,
  /\b(?:maybe|perhaps|probably|might|could\s+be)\b/gi,
  /\?{1,}/g,
]);

function safeString(value, max = 4000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function clampNumber(value, fallback, min = 0, max = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizePattern(entry) {
  if (entry && typeof entry === "object") {
    const mode = safeString(entry.mode || entry.type, 16).toLowerCase();
    const value = safeString(entry.value, 400);
    const flags = safeString(entry.flags, 8).replace(/[^gimsuy]/g, "");
    if (mode === "regex" && value) {
      try {
        return { type: "regex", regex: new RegExp(value, flags || "i"), source: value };
      } catch {
        return null;
      }
    }
    if (value) return { type: "string", value: value.toLowerCase(), source: value };
    return null;
  }
  const value = safeString(entry, 400);
  return value ? { type: "string", value: value.toLowerCase(), source: value } : null;
}

function normalizePatternList(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const entry of values.slice(0, 32)) {
    const normalized = normalizePattern(entry);
    if (normalized) out.push(normalized);
  }
  return out;
}

function normalizeUserValueScoring(input) {
  const payload = input && typeof input === "object" ? input : {};
  const weights = payload.weights && typeof payload.weights === "object" ? payload.weights : {};
  return {
    weights: {
      correctness: clampNumber(weights.correctness, defaultWeights.correctness),
      completeness: clampNumber(weights.completeness, defaultWeights.completeness),
      specificity: clampNumber(weights.specificity, defaultWeights.specificity),
      actionability: clampNumber(weights.actionability, defaultWeights.actionability),
      followUpCorrectionPressure: clampNumber(weights.followUpCorrectionPressure, defaultWeights.followUpCorrectionPressure),
    },
    correctnessVeto: payload.correctnessVeto !== false,
    winThreshold: clampNumber(payload.winThreshold, 0.05, 0.01, 0.5),
  };
}

function normalizeUserValueRubric(input) {
  const payload = input && typeof input === "object" ? input : {};
  return {
    taskClass: safeString(payload.taskClass || payload.kind, 80).toLowerCase() || "coding_repo",
    taskFamily: safeString(payload.taskFamily || payload.family, 80).toLowerCase() || "",
    criticalPatterns: normalizePatternList(payload.criticalPatterns),
    coveragePatterns: normalizePatternList(payload.coveragePatterns),
    actionabilityPatterns: normalizePatternList(payload.actionabilityPatterns),
    specificityPatterns: normalizePatternList(payload.specificityPatterns),
    penaltyPatterns: normalizePatternList(payload.penaltyPatterns),
  };
}

function countPatternHits(text, patterns) {
  const sourceText = safeString(text, 24000);
  const lowered = sourceText.toLowerCase();
  const hits = [];
  let matched = 0;
  for (const pattern of Array.isArray(patterns) ? patterns : []) {
    let pass = false;
    if (pattern.type === "regex" && pattern.regex) {
      pass = pattern.regex.test(sourceText);
      pattern.regex.lastIndex = 0;
    } else if (pattern.type === "string" && pattern.value) {
      pass = lowered.includes(pattern.value);
    }
    if (pass) {
      matched += 1;
      hits.push(pattern.source);
    }
  }
  return {
    matched,
    total: Array.isArray(patterns) ? patterns.length : 0,
    ratio: Array.isArray(patterns) && patterns.length ? matched / patterns.length : 0,
    hits,
  };
}

function computeSpecificityScore(text, rubric) {
  const sourceText = safeString(text, 24000);
  const inlineCodeHits = (sourceText.match(/`[^`]+`/g) || []).length;
  const pathHits = (sourceText.match(/\b[a-z0-9_.-]+\.(?:js|json|md|html|css|ts)\b/gi) || []).length;
  const commandHits = (sourceText.match(/\b(?:node|npm|pnpm|yarn|git|rg|curl|powershell|apply_patch)\b/gi) || []).length;
  const numericHits = (sourceText.match(/\b\d+(?:\.\d+)?\b/g) || []).length;
  const rubricHits = countPatternHits(sourceText, rubric.specificityPatterns || []);
  const raw = inlineCodeHits + pathHits + commandHits + Math.min(numericHits, 2) + rubricHits.matched;
  return {
    score: clampNumber(raw / 4, 0),
    inlineCodeHits,
    pathHits,
    commandHits,
    numericHits,
    rubricHits,
  };
}

function computeActionabilityScore(text, rubric) {
  const sourceText = safeString(text, 24000);
  const orderedStepHits = (sourceText.match(/^\s*\d+\.\s+/gm) || []).length;
  const bulletHits = (sourceText.match(/^\s*[-*]\s+/gm) || []).length;
  const imperativeHits = (sourceText.match(/\b(?:update|add|run|change|expose|extend|write|compare|surface|verify|record|implement|review)\b/gi) || []).length;
  const verificationHits = (sourceText.match(/\b(?:test|verify|assert|pass|fail|render|smoke)\b/gi) || []).length;
  const rubricHits = countPatternHits(sourceText, rubric.actionabilityPatterns || []);
  const raw =
    Math.min(orderedStepHits, 2) +
    Math.min(bulletHits, 2) +
    Math.min(imperativeHits, 2) +
    Math.min(verificationHits, 2) +
    rubricHits.matched;
  return {
    score: clampNumber(raw / 5, 0),
    orderedStepHits,
    bulletHits,
    imperativeHits,
    verificationHits,
    rubricHits,
  };
}

function computeFamilySpecificSignals(text, rubric) {
  const family = safeString(rubric && rubric.taskFamily, 80).toLowerCase();
  const sourceText = safeString(text, 24000).toLowerCase();
  if (family !== "web_creative") {
    return {
      taskFamily: family,
      specificityBonus: 0,
      actionabilityBonus: 0,
      completenessBonus: 0,
      matchedSignals: [],
    };
  }
  const signalGroups = [
    ["benchmark", ["benchmark", "reference", "beat", "superior"]],
    ["hierarchy", ["hierarchy", "typography", "spacing", "rhythm"]],
    ["layout", ["layout", "grid", "hero", "section"]],
    ["responsive", ["responsive", "desktop", "mobile"]],
    ["motion", ["motion", "animation", "transition"]],
    ["realness", ["proof", "credibility", "real-world", "concrete"]],
  ];
  const matchedSignals = [];
  for (const [label, tokens] of signalGroups) {
    if (tokens.some((token) => sourceText.includes(token))) matchedSignals.push(label);
  }
  return {
    taskFamily: family,
    specificityBonus: Number(Math.min(0.35, matchedSignals.length * 0.06).toFixed(4)),
    actionabilityBonus: Number(Math.min(0.25, matchedSignals.length * 0.04).toFixed(4)),
    completenessBonus: Number(Math.min(0.2, matchedSignals.length * 0.03).toFixed(4)),
    matchedSignals,
  };
}

function computeFollowUpPressureScore(text, rubric) {
  const sourceText = safeString(text, 24000);
  const patterns = [...defaultPenaltyPatterns, ...normalizePatternList(rubric.penaltyPatterns || []).map((entry) => {
    if (entry.type === "regex" && entry.regex) return entry.regex;
    return new RegExp(entry.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  })];
  let penaltyHits = 0;
  for (const pattern of patterns) {
    const matches = sourceText.match(pattern);
    penaltyHits += Array.isArray(matches) ? matches.length : 0;
  }
  const rawPenalty = clampNumber(penaltyHits / 4, 0, 0, 1);
  return {
    score: Number((1 - rawPenalty).toFixed(4)),
    penaltyHits,
    rawPenalty: Number(rawPenalty.toFixed(4)),
  };
}

function scoreUserValueResponse({ prompt, response, rubric, scoring }) {
  const normalizedRubric = normalizeUserValueRubric(rubric);
  const normalizedScoring = normalizeUserValueScoring(scoring);
  const critical = countPatternHits(response, normalizedRubric.criticalPatterns);
  const coverage = countPatternHits(response, normalizedRubric.coveragePatterns);
  const specificity = computeSpecificityScore(response, normalizedRubric);
  const actionability = computeActionabilityScore(response, normalizedRubric);
  const familySignals = computeFamilySpecificSignals(response, normalizedRubric);
  const followUpPressure = computeFollowUpPressureScore(response, normalizedRubric);
  const correctnessScore = critical.total > 0 ? critical.ratio : (safeString(response).length > 0 ? 1 : 0);
  const completenessScoreBase = coverage.total > 0 ? coverage.ratio : correctnessScore;
  const completenessScore = clampNumber(completenessScoreBase + familySignals.completenessBonus, completenessScoreBase);
  const specificityScore = clampNumber(specificity.score + familySignals.specificityBonus, specificity.score);
  const actionabilityScore = clampNumber(actionability.score + familySignals.actionabilityBonus, actionability.score);
  const weightedScore =
    correctnessScore * normalizedScoring.weights.correctness +
    completenessScore * normalizedScoring.weights.completeness +
    specificityScore * normalizedScoring.weights.specificity +
    actionabilityScore * normalizedScoring.weights.actionability +
    followUpPressure.score * normalizedScoring.weights.followUpCorrectionPressure;
  return {
    promptChars: safeString(prompt, 24000).length,
    responseChars: safeString(response, 24000).length,
    taskClass: normalizedRubric.taskClass,
    taskFamily: normalizedRubric.taskFamily,
    correctness: Number(correctnessScore.toFixed(4)),
    completeness: Number(completenessScore.toFixed(4)),
    specificity: Number(specificityScore.toFixed(4)),
    actionability: Number(actionabilityScore.toFixed(4)),
    followUpCorrectionPressure: Number(followUpPressure.score.toFixed(4)),
    correctionPressureRaw: followUpPressure.rawPenalty,
    criticalHits: critical,
    coverageHits: coverage,
    specificitySignals: specificity,
    actionabilitySignals: actionability,
    familySignals,
    followUpSignals: followUpPressure,
    score: Number(weightedScore.toFixed(4)),
    measured: true,
  };
}

function buildUserValueRunSummary({ caseResults, suite }) {
  const results = Array.isArray(caseResults) ? caseResults.filter((entry) => entry && entry.userValue) : [];
  if (!results.length) return null;
  const scoring = normalizeUserValueScoring(suite && suite.scoring);
  const sums = {
    score: 0,
    correctness: 0,
    completeness: 0,
    specificity: 0,
    actionability: 0,
    followUpCorrectionPressure: 0,
    correctionPressureRaw: 0,
  };
  for (const entry of results) {
    sums.score += Number(entry.userValue.score) || 0;
    sums.correctness += Number(entry.userValue.correctness) || 0;
    sums.completeness += Number(entry.userValue.completeness) || 0;
    sums.specificity += Number(entry.userValue.specificity) || 0;
    sums.actionability += Number(entry.userValue.actionability) || 0;
    sums.followUpCorrectionPressure += Number(entry.userValue.followUpCorrectionPressure) || 0;
    sums.correctionPressureRaw += Number(entry.userValue.correctionPressureRaw) || 0;
  }
  const count = results.length;
  return {
    kind: "user_value",
    caseCount: count,
    scoring,
    score: Number((sums.score / count).toFixed(4)),
    correctness: Number((sums.correctness / count).toFixed(4)),
    completeness: Number((sums.completeness / count).toFixed(4)),
    specificity: Number((sums.specificity / count).toFixed(4)),
    actionability: Number((sums.actionability / count).toFixed(4)),
    followUpCorrectionPressure: Number((sums.followUpCorrectionPressure / count).toFixed(4)),
    correctionPressureRaw: Number((sums.correctionPressureRaw / count).toFixed(4)),
  };
}

function compareUserValueRuns(runA, runB, suiteScoring) {
  const left = runA && runA.userValue ? runA.userValue : null;
  const right = runB && runB.userValue ? runB.userValue : null;
  const scoring = normalizeUserValueScoring(suiteScoring);
  if (!left || !right) return null;
  if (scoring.correctnessVeto && left.correctness !== right.correctness) {
    return {
      winner: left.correctness > right.correctness ? "A" : "B",
      reason: "correctness_veto",
      delta: Number((left.correctness - right.correctness).toFixed(4)),
      userValue: { left, right },
    };
  }
  const scoreDelta = Number((left.score - right.score).toFixed(4));
  if (Math.abs(scoreDelta) >= scoring.winThreshold) {
    return {
      winner: scoreDelta > 0 ? "A" : "B",
      reason: "user_value_score",
      delta: scoreDelta,
      userValue: { left, right },
    };
  }
  return {
    winner: "tie",
    reason: "user_value_draw",
    delta: scoreDelta,
    userValue: { left, right },
  };
}

module.exports = {
  defaultWeights,
  normalizeUserValueScoring,
  normalizeUserValueRubric,
  scoreUserValueResponse,
  buildUserValueRunSummary,
  compareUserValueRuns,
};
