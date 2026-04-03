"use strict";

const path = require("path");
const { readJsonIfExists, repoRelative } = require("./logging_surface");

const defaultManualSelfImprovementRelativePath = path.join("output", "manual_self_improvement", "latest.json");
const allowedClassifications = new Set(["runtime hint", "quality note", "skill candidate"]);
const allowedPromotionDecisions = new Set(["proposal-only", "blocked"]);

function safeString(value, max = 4000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function normalizeStringList(values, maxItems = 16, maxChars = 160) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, maxChars);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeClassification(value) {
  const normalized = safeString(value, 80).toLowerCase();
  return allowedClassifications.has(normalized) ? normalized : "";
}

function normalizePromotionDecision(value) {
  const normalized = safeString(value, 80).toLowerCase();
  return allowedPromotionDecisions.has(normalized) ? normalized : "";
}

function createCountMap(keys = []) {
  return keys.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function incrementCount(target, key) {
  if (!target || !key || !Object.prototype.hasOwnProperty.call(target, key)) return;
  target[key] += 1;
}

function resolveArtifactPath(workspaceRoot, targetPath = "") {
  const raw = safeString(targetPath, 800) || defaultManualSelfImprovementRelativePath;
  if (path.isAbsolute(raw)) return path.normalize(raw);
  return path.join(workspaceRoot, raw);
}

function validateManualSelfImprovementCapture(payload) {
  const source = payload && typeof payload === "object" ? payload : null;
  const errors = [];
  if (!source) {
    return {
      ok: false,
      errors: ["payload must be a JSON object"],
      normalized: null,
    };
  }
  const schema = safeString(source.schema, 120);
  if (schema !== "manual-self-improvement-capture.v1") {
    errors.push("schema must equal manual-self-improvement-capture.v1");
  }
  const generatedAt = safeString(source.generatedAt, 80);
  if (!generatedAt) {
    errors.push("generatedAt is required");
  }
  const rawSource = source.source && typeof source.source === "object" ? source.source : {};
  const normalizedSource = {
    kind: safeString(rawSource.kind, 80),
    request: safeString(rawSource.request, 1000),
  };
  if (!normalizedSource.kind) {
    errors.push("source.kind is required");
  }
  const rawEntries = Array.isArray(source.entries) ? source.entries : null;
  if (!rawEntries) {
    errors.push("entries must be an array");
  } else if (!rawEntries.length) {
    errors.push("entries must contain at least one item");
  }
  const normalizedEntries = [];
  for (const [index, entry] of (rawEntries || []).entries()) {
    const current = entry && typeof entry === "object" ? entry : {};
    const lessonSummary = safeString(current.lessonSummary, 1200);
    if (!lessonSummary) {
      errors.push(`entries[${index}].lessonSummary is required`);
    }
    const classification = normalizeClassification(current.classification);
    if (!classification) {
      errors.push(`entries[${index}].classification must be one of: runtime hint, quality note, skill candidate`);
    }
    const appliesTo = current.appliesTo && typeof current.appliesTo === "object" ? current.appliesTo : {};
    const normalizedAppliesTo = {
      agent: normalizeStringList(appliesTo.agent, 12, 120),
      taskFamily: normalizeStringList(appliesTo.taskFamily, 12, 120),
      triggers: normalizeStringList(appliesTo.triggers, 16, 160),
    };
    if (!normalizedAppliesTo.agent.length) {
      errors.push(`entries[${index}].appliesTo.agent must contain at least one item`);
    }
    if (!normalizedAppliesTo.taskFamily.length) {
      errors.push(`entries[${index}].appliesTo.taskFamily must contain at least one item`);
    }
    if (!normalizedAppliesTo.triggers.length) {
      errors.push(`entries[${index}].appliesTo.triggers must contain at least one item`);
    }
    const evidence = current.evidence && typeof current.evidence === "object" ? current.evidence : {};
    const normalizedEvidence = {
      summary: safeString(evidence.summary, 1200),
      supportingArtifacts: normalizeStringList(evidence.supportingArtifacts, 16, 260),
    };
    if (!normalizedEvidence.summary) {
      errors.push(`entries[${index}].evidence.summary is required`);
    }
    if (!normalizedEvidence.supportingArtifacts.length) {
      errors.push(`entries[${index}].evidence.supportingArtifacts must contain at least one item`);
    }
    const promotionDecision = normalizePromotionDecision(current.promotionDecision);
    if (!promotionDecision) {
      errors.push(`entries[${index}].promotionDecision must be one of: proposal-only, blocked`);
    }
    normalizedEntries.push({
      lessonSummary,
      classification,
      appliesTo: normalizedAppliesTo,
      evidence: normalizedEvidence,
      promotionDecision,
    });
  }
  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      schema: schema || "manual-self-improvement-capture.v1",
      generatedAt,
      source: normalizedSource,
      entries: normalizedEntries,
    },
  };
}

function buildManualSelfImprovementRuntimeSummary({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  artifactPath = "",
} = {}) {
  const resolvedPath = resolveArtifactPath(workspaceRoot, artifactPath);
  const relativePath = repoRelative(workspaceRoot, resolvedPath);
  const payload = readJsonIfExists(resolvedPath);
  if (!payload) {
    return {
      enabled: true,
      status: "missing",
      artifactPath: relativePath,
      entryCount: 0,
      invalidReason: "artifact_missing_or_unreadable",
      schema: "",
      generatedAt: "",
      source: {
        kind: "",
        request: "",
      },
      sourceKind: "",
      request: "",
      requestSummary: "",
      proposalOnlyCount: 0,
      blockedCount: 0,
      autoApplyCandidateCount: 0,
      runtimeHintCount: 0,
      qualityNoteCount: 0,
      skillCandidateCount: 0,
      classificationCounts: createCountMap(["runtime hint", "quality note", "skill candidate"]),
      promotionDecisionCounts: createCountMap(["auto-apply candidate", "proposal-only", "blocked"]),
      agents: [],
      taskFamilies: [],
      triggers: [],
      entries: [],
      lessons: [],
    };
  }
  const validation = validateManualSelfImprovementCapture(payload);
  if (!validation.ok) {
    return {
      enabled: true,
      status: "invalid",
      artifactPath: relativePath,
      entryCount: Array.isArray(payload.entries) ? payload.entries.length : 0,
      invalidReason: validation.errors[0] || "invalid_capture",
      validationErrors: validation.errors.slice(0, 12),
      schema: safeString(payload.schema, 120),
      generatedAt: safeString(payload.generatedAt, 80),
      source: {
        kind: safeString(payload.source && payload.source.kind, 80),
        request: safeString(payload.source && payload.source.request, 320),
      },
      sourceKind: safeString(payload.source && payload.source.kind, 80),
      request: safeString(payload.source && payload.source.request, 320),
      requestSummary: safeString(payload.source && payload.source.request, 320),
      proposalOnlyCount: 0,
      blockedCount: 0,
      autoApplyCandidateCount: 0,
      runtimeHintCount: 0,
      qualityNoteCount: 0,
      skillCandidateCount: 0,
      classificationCounts: createCountMap(["runtime hint", "quality note", "skill candidate"]),
      promotionDecisionCounts: createCountMap(["auto-apply candidate", "proposal-only", "blocked"]),
      agents: [],
      taskFamilies: [],
      triggers: [],
      entries: [],
      lessons: [],
    };
  }
  const normalized = validation.normalized;
  const classificationCounts = createCountMap(["runtime hint", "quality note", "skill candidate"]);
  const promotionDecisionCounts = createCountMap(["auto-apply candidate", "proposal-only", "blocked"]);
  const agents = [];
  const taskFamilies = [];
  const triggers = [];
  const entries = [];
  const lessons = [];
  for (const entry of normalized.entries) {
    incrementCount(classificationCounts, entry.classification);
    incrementCount(promotionDecisionCounts, entry.promotionDecision);
    agents.push(...entry.appliesTo.agent);
    taskFamilies.push(...entry.appliesTo.taskFamily);
    triggers.push(...entry.appliesTo.triggers);
    const normalizedEntry = {
      lessonSummary: safeString(entry.lessonSummary, 240),
      classification: entry.classification,
      promotionDecision: entry.promotionDecision,
      evidenceSummary: safeString(entry.evidence.summary, 240),
      supportingArtifacts: entry.evidence.supportingArtifacts.slice(0, 4),
      appliesTo: {
        agent: entry.appliesTo.agent.slice(0, 4),
        taskFamily: entry.appliesTo.taskFamily.slice(0, 4),
        triggers: entry.appliesTo.triggers.slice(0, 4),
      },
    };
    entries.push(normalizedEntry);
    lessons.push({
      ...normalizedEntry,
    });
  }
  return {
    enabled: true,
    status: "ready",
    artifactPath: relativePath,
    schema: normalized.schema,
    generatedAt: normalized.generatedAt,
    source: {
      kind: normalized.source.kind,
      request: safeString(normalized.source.request, 320),
    },
    sourceKind: normalized.source.kind,
    request: safeString(normalized.source.request, 320),
    requestSummary: safeString(normalized.source.request, 320),
    entryCount: normalized.entries.length,
    proposalOnlyCount: promotionDecisionCounts["proposal-only"],
    blockedCount: promotionDecisionCounts.blocked,
    autoApplyCandidateCount: promotionDecisionCounts["auto-apply candidate"],
    runtimeHintCount: classificationCounts["runtime hint"],
    qualityNoteCount: classificationCounts["quality note"],
    skillCandidateCount: classificationCounts["skill candidate"],
    classificationCounts,
    promotionDecisionCounts,
    agents: normalizeStringList(agents, 16, 120),
    taskFamilies: normalizeStringList(taskFamilies, 16, 120),
    triggers: normalizeStringList(triggers, 20, 160),
    entries,
    lessons: lessons.slice(0, 5),
  };
}

module.exports = {
  buildManualSelfImprovementRuntimeSummary,
  defaultManualSelfImprovementRelativePath,
  resolveArtifactPath,
  validateManualSelfImprovementCapture,
};
