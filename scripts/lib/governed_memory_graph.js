"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  ensureDir,
  getLoggingSurfacePaths,
  readJson,
  repoRelative,
} = require("./logging_surface");

const workspaceRootDefault = path.resolve(__dirname, "..", "..");

function safeString(value, max = 400) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : "";
  }
  if (value == null) return "";
  return safeString(String(value), max);
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value = Date.now()) {
  const parsed = safeNumber(value, Date.now());
  return new Date(parsed).toISOString();
}

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0) {
  const parsed = Math.trunc(safeNumber(value, fallback));
  return Math.min(max, Math.max(min, parsed));
}

function uniqueStrings(values, maxItems = 16, maxChars = 160) {
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

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJsonObject(targetPath) {
  const payload = readJson(targetPath);
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function ensureFile(targetPath, initialText = "") {
  ensureDir(path.dirname(targetPath));
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, initialText, "utf8");
  }
}

function writeJsonIfChanged(targetPath, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  ensureDir(path.dirname(targetPath));
  if (fs.existsSync(targetPath)) {
    const current = fs.readFileSync(targetPath, "utf8");
    if (current === next) return false;
  }
  fs.writeFileSync(targetPath, next, "utf8");
  return true;
}

function appendJsonLine(targetPath, value) {
  ensureDir(path.dirname(targetPath));
  fs.appendFileSync(targetPath, `${JSON.stringify(value)}\n`, "utf8");
}

function overwriteJsonl(targetPath, records) {
  ensureDir(path.dirname(targetPath));
  const lines = Array.isArray(records) ? records.map((entry) => JSON.stringify(entry)) : [];
  fs.writeFileSync(targetPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
}

function toWorkspaceId(workspaceRoot) {
  return stableHash({ workspaceRoot }).slice(0, 16);
}

function getMemoryPaths(workspaceRoot = workspaceRootDefault) {
  const logging = getLoggingSurfacePaths(workspaceRoot);
  const root = path.join(logging.runtimeStateRoot, "memory");
  const indexesRoot = path.join(root, "indexes");
  const projectionsRoot = path.join(root, "projections");
  const retrievalRoot = path.join(root, "retrieval");
  const outputRoot = path.join(workspaceRoot, "output", "memory");
  return {
    workspaceRoot,
    root,
    eventsPath: path.join(root, "memory_events.jsonl"),
    feedbackPath: path.join(root, "memory_feedback.jsonl"),
    tombstonesPath: path.join(root, "memory_tombstones.jsonl"),
    indexes: {
      root: indexesRoot,
      byId: path.join(indexesRoot, "by_id.json"),
      byScope: path.join(indexesRoot, "by_scope.json"),
      byType: path.join(indexesRoot, "by_type.json"),
      byTaskFamily: path.join(indexesRoot, "by_task_family.json"),
      byAgent: path.join(indexesRoot, "by_agent.json"),
      byWorkspace: path.join(indexesRoot, "by_workspace.json"),
    },
    projections: {
      root: projectionsRoot,
      specGraph: path.join(projectionsRoot, "spec_graph.json"),
      workspaceProgressRoot: path.join(projectionsRoot, "workspace_progress"),
      preferenceProfilesRoot: path.join(projectionsRoot, "preference_profiles"),
      semanticLessonsRoot: path.join(projectionsRoot, "semantic_lessons"),
      failurePatternsRoot: path.join(projectionsRoot, "failure_patterns"),
      activeRuntimeHintsRoot: path.join(projectionsRoot, "active_runtime_hints"),
      improvementStateRoot: path.join(projectionsRoot, "improvement_state"),
      evalObservationsRoot: path.join(projectionsRoot, "eval_observations"),
    },
    retrieval: {
      root: retrievalRoot,
      packsPath: path.join(retrievalRoot, "packs.jsonl"),
      lastPackByThread: path.join(retrievalRoot, "last_pack_by_thread.json"),
      lastPackByWorkspace: path.join(retrievalRoot, "last_pack_by_workspace.json"),
    },
    output: {
      root: outputRoot,
      latestOverviewJson: path.join(outputRoot, "latest_overview.json"),
      latestOverviewMd: path.join(outputRoot, "latest_overview.md"),
      promotedSemanticMemory: path.join(outputRoot, "promoted_semantic_memory.json"),
      preferenceProfilesReport: path.join(outputRoot, "preference_profiles_report.json"),
      improvementDashboard: path.join(outputRoot, "improvement_dashboard.json"),
      memoryHealthReportMd: path.join(outputRoot, "memory_health_report.md"),
    },
  };
}

function ensureMemoryLayout(paths) {
  [
    paths.root,
    paths.indexes.root,
    paths.projections.root,
    paths.projections.workspaceProgressRoot,
    paths.projections.preferenceProfilesRoot,
    paths.projections.semanticLessonsRoot,
    paths.projections.failurePatternsRoot,
    paths.projections.activeRuntimeHintsRoot,
    paths.projections.improvementStateRoot,
    paths.projections.evalObservationsRoot,
    paths.retrieval.root,
    paths.output.root,
  ].forEach(ensureDir);
  ensureFile(paths.eventsPath);
  ensureFile(paths.feedbackPath);
  ensureFile(paths.tombstonesPath);
}

function loadJsonl(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  return fs.readFileSync(targetPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && typeof entry === "object");
}

function loadConfigJson(workspaceRoot, ...segments) {
  return readJson(path.join(workspaceRoot, ...segments)) || {};
}

function loadTypeCatalog(workspaceRoot) {
  const catalog = loadConfigJson(workspaceRoot, "scripts", "config", "memory_type_catalog.json");
  const types = Array.isArray(catalog.types) ? catalog.types : [];
  const byId = {};
  for (const entry of types) {
    const id = safeString(entry && entry.id, 80);
    if (!id) continue;
    byId[id] = entry;
  }
  return byId;
}

function classifyMemorySection(item) {
  switch (safeString(item && item.type, 80)) {
    case "constitution_ref":
      return "spec";
    case "requirement_ref":
      return "intent";
    case "workspace_progress":
      return "workspace_progress";
    case "preference_signal":
      return "preference";
    case "episodic_event":
    case "eval_observation":
      return "experience";
    case "semantic_lesson":
    case "failure_pattern":
    case "runtime_hint":
      return "semantic";
    case "improvement_candidate":
      return "improvement";
    default:
      return "experience";
  }
}

function scoreBand(score, thresholds = {}) {
  const value = safeNumber(score, 0);
  const high = safeNumber(thresholds.highConfidenceScore, 0.68);
  const minimum = safeNumber(thresholds.minimumSelectionScore, 0.18);
  if (value >= high) return "high";
  if (value >= minimum) return "selected";
  return "below_threshold";
}

function parseTimestamp(value) {
  const text = safeString(value, 80);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pruneJsonlFile(targetPath, { maxEntries = 0, maxDays = 0 } = {}) {
  const records = loadJsonl(targetPath);
  if (!records.length) return 0;
  let kept = records.slice();
  if (safeNumber(maxDays, 0) > 0) {
    const cutoff = Date.now() - safeNumber(maxDays, 0) * 86400000;
    kept = kept.filter((entry) => {
      const ts = parseTimestamp(entry && (entry.recordedAt || entry.generatedAt || entry.updatedAt));
      return !ts || ts >= cutoff;
    });
  }
  if (safeNumber(maxEntries, 0) > 0 && kept.length > maxEntries) {
    kept = kept.slice(-maxEntries);
  }
  if (kept.length === records.length) return 0;
  overwriteJsonl(targetPath, kept);
  return records.length - kept.length;
}

function reviveLifecycle(items, previousById) {
  const nowIso = toIso();
  return items.map((item) => {
    const previous = previousById && previousById[item.memoryId] && typeof previousById[item.memoryId] === "object"
      ? previousById[item.memoryId]
      : null;
    if (!previous) {
      item.lifecycle.createdAt = safeString(item.lifecycle && item.lifecycle.createdAt, 80) || nowIso;
      item.lifecycle.updatedAt = safeString(item.lifecycle && item.lifecycle.updatedAt, 80) || nowIso;
      return item;
    }
    const previousCreatedAt = safeString(previous.createdAt, 80);
    const previousUpdatedAt = safeString(previous.updatedAt, 80);
    const previousHash = safeString(previous.contentHash, 80);
    const previousStatus = safeString(previous.status, 80);
    item.lifecycle.createdAt = previousCreatedAt || safeString(item.lifecycle && item.lifecycle.createdAt, 80) || nowIso;
    item.lifecycle.updatedAt = previousHash === safeString(item.evidence && item.evidence.contentHash, 80) && previousStatus === safeString(item.status, 80)
      ? (previousUpdatedAt || item.lifecycle.updatedAt || nowIso)
      : nowIso;
    return item;
  });
}

function collectMemoryHealth({ items, paths, retentionPolicy, currentEvents = [] }) {
  const expiryByType = retentionPolicy && retentionPolicy.expiryByType && typeof retentionPolicy.expiryByType === "object"
    ? retentionPolicy.expiryByType
    : {};
  const staleMemoryWarnings = [];
  for (const item of items) {
    const expiryDays = safeNumber(expiryByType[item.type], 0);
    if (!expiryDays) continue;
    if (["revoked", "expired"].includes(safeString(item.status, 40))) continue;
    const updatedAt = parseTimestamp(item.lifecycle && item.lifecycle.updatedAt);
    if (!updatedAt) continue;
    const ageDays = Math.max(0, (Date.now() - updatedAt) / 86400000);
    if (ageDays < expiryDays) continue;
    staleMemoryWarnings.push({
      memoryId: item.memoryId,
      type: item.type,
      ageDays: Number(ageDays.toFixed(1)),
      expiryDays,
    });
  }
  const combinedEvents = [...loadJsonl(paths.eventsPath), ...currentEvents]
    .filter((entry) => entry && typeof entry === "object")
    .sort((left, right) => parseTimestamp(right && right.recordedAt) - parseTimestamp(left && left.recordedAt));
  const recentPromotions = combinedEvents
    .filter((entry) => safeString(entry && entry.eventType, 80) === "memory_item_upsert" && ["promoted", "reinforced"].includes(safeString(entry && entry.status, 40)))
    .slice(0, 5)
    .map((entry) => ({
      memoryId: safeString(entry && entry.memoryId, 120),
      memoryType: safeString(entry && entry.memoryType, 80),
      status: safeString(entry && entry.status, 40),
      recordedAt: safeString(entry && entry.recordedAt, 80),
    }));
  const recentRevocations = combinedEvents
    .filter((entry) => (
      safeString(entry && entry.eventType, 80) === "memory_item_tombstone"
      || ["revoked", "expired", "blocked"].includes(safeString(entry && entry.status, 40))
    ))
    .slice(0, 5)
    .map((entry) => ({
      memoryId: safeString(entry && entry.memoryId, 120),
      memoryType: safeString(entry && entry.memoryType, 80),
      status: safeString(entry && entry.status, 40) || safeString(entry && entry.eventType, 80),
      recordedAt: safeString(entry && entry.recordedAt, 80),
    }));
  return {
    staleMemoryWarnings,
    recentPromotions,
    recentRevocations,
  };
}

function buildBaseItem({
  memoryId,
  type,
  status,
  authorityTier,
  sourceTier,
  scope,
  summary,
  structured,
  evidence,
  retrieval,
}) {
  const item = {
    memoryId,
    schema: "memory-item.v1",
    type,
    status,
    authorityTier,
    sourceTier,
    scope: scope && typeof scope === "object" ? scope : {},
    content: {
      summary: safeString(summary, 400),
      structured: structured && typeof structured === "object" ? structured : {},
    },
    evidence: {
      sourceRefs: uniqueStrings(evidence && evidence.sourceRefs, 16, 220),
      contentHash: "",
      supportCount: clampInt(evidence && evidence.supportCount, 0, 9999, 0),
      confidence: Number(safeNumber(evidence && evidence.confidence, 0).toFixed(3)),
      lastValidatedAt: safeString(evidence && evidence.lastValidatedAt, 80) || toIso(),
    },
    retrieval: {
      topics: uniqueStrings(retrieval && retrieval.topics, 16, 80),
      lexicalTriggers: uniqueStrings(retrieval && retrieval.lexicalTriggers, 20, 80),
      negativeTriggers: uniqueStrings(retrieval && retrieval.negativeTriggers, 12, 80),
      priority: clampInt(retrieval && retrieval.priority, 0, 100, 0),
    },
    lifecycle: {
      createdAt: toIso(),
      updatedAt: toIso(),
      expiresAt: safeString(structured && structured.expiresAt, 80) || null,
      supersedes: uniqueStrings(structured && structured.supersedes, 12, 120),
      conflictsWith: uniqueStrings(structured && structured.conflictsWith, 12, 120),
    },
  };
  item.evidence.contentHash = stableHash({
    type: item.type,
    status: item.status,
    summary: item.content.summary,
    structured: item.content.structured,
    scope: item.scope,
  });
  return item;
}

function buildSpecGraphItems({ workspaceRoot, phaseStatus, runtime }) {
  const catalog = loadConfigJson(workspaceRoot, "scripts", "config", "memory_spec_graph_catalog.json");
  const workspaceId = toWorkspaceId(workspaceRoot);
  const nodes = Array.isArray(catalog.nodes) ? catalog.nodes : [];
  const items = nodes.map((node) => buildBaseItem({
    memoryId: `spec:${safeString(node && node.id, 80)}`,
    type: "constitution_ref",
    status: "promoted",
    authorityTier: clampInt(node && node.authorityTier, 0, 6, 0),
    sourceTier: "repo",
    scope: {
      workspaceId,
      taskFamilies: uniqueStrings(node && node.taskFamilies, 12, 80),
      agents: uniqueStrings(node && node.agents, 12, 80),
      ownedPaths: uniqueStrings(node && node.ownedPaths, 16, 220),
    },
    summary: safeString(node && node.summary, 320) || safeString(node && node.id, 120),
    structured: {
      nodeId: safeString(node && node.id, 120),
      title: safeString(node && node.title, 160),
      filePath: safeString(node && node.filePath, 220),
      kind: safeString(node && node.kind, 80),
      immutable: Boolean(node && node.immutable),
      tags: uniqueStrings(node && node.tags, 12, 80),
      edges: Array.isArray(node && node.edges) ? node.edges.slice(0, 16) : [],
    },
    evidence: {
      sourceRefs: [safeString(node && node.filePath, 220)].filter(Boolean),
      supportCount: 1,
      confidence: 1,
      lastValidatedAt: toIso(),
    },
    retrieval: {
      topics: uniqueStrings([
        ...(Array.isArray(node && node.tags) ? node.tags : []),
        safeString(node && node.kind, 80),
      ], 16, 80),
      lexicalTriggers: uniqueStrings([
        safeString(node && node.id, 80),
        safeString(node && node.title, 80),
      ], 8, 80),
      priority: clampInt(90 - clampInt(node && node.authorityTier, 0, 6, 0) * 5, 0, 100, 80),
    },
  }));
  if (phaseStatus && typeof phaseStatus === "object") {
    items.push(buildBaseItem({
      memoryId: "spec:requirement_foundation_v1",
      type: "constitution_ref",
      status: "promoted",
      authorityTier: 0,
      sourceTier: "repo",
      scope: { workspaceId, taskFamilies: ["all"], agents: ["default"], ownedPaths: ["output/phase_exit_requirement_foundation_v1.json"] },
      summary: "Requirement Foundation V1 is frozen and treated as a top-level invariant, not a mutable lesson.",
      structured: {
        freezePolicy: safeString(phaseStatus.freezePolicy, 80) || "bug_fix_only",
        auditReportPath: safeString(phaseStatus.auditReportPath, 220),
        completedAt: safeString(phaseStatus.completedAt, 80),
        status: safeString(phaseStatus.status, 40),
      },
      evidence: {
        sourceRefs: [safeString(phaseStatus.auditReportPath, 220), "output/phase_exit_requirement_foundation_v1.json"].filter(Boolean),
        supportCount: 1,
        confidence: 1,
        lastValidatedAt: safeString(phaseStatus.completedAt, 80) || toIso(),
      },
      retrieval: {
        topics: ["freeze", "foundation", "requirement"],
        lexicalTriggers: ["freeze", "foundation", "requirement"],
        priority: 100,
      },
    }));
  }
  if (runtime && runtime.intentFirst && runtime.intentFirst.contract) {
    items.push(buildBaseItem({
      memoryId: "spec:design_acceptance_contract",
      type: "constitution_ref",
      status: "promoted",
      authorityTier: 0,
      sourceTier: "repo",
      scope: { workspaceId, taskFamilies: ["web_creative"], agents: ["default", "frontend_worker"], ownedPaths: ["scripts/config/design_acceptance_contract.json", "docs/DESIGN_ACCEPTANCE_CONTRACT.md"] },
      summary: "Design-sensitive work is completion-gated by benchmark alignment, visual review, independent review, and doc sync.",
      structured: runtime.intentFirst.contract,
      evidence: {
        sourceRefs: ["scripts/config/design_acceptance_contract.json", "docs/DESIGN_ACCEPTANCE_CONTRACT.md"],
        supportCount: 2,
        confidence: 1,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: ["design", "acceptance", "intent-first"],
        lexicalTriggers: ["ui", "ux", "site", "design", "taste"],
        priority: 98,
      },
    }));
  }
  return items;
}

function buildIntentAndPreferenceItems({ workspaceRoot, runtime }) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const intentFirst = runtime && runtime.intentFirst && typeof runtime.intentFirst === "object" ? runtime.intentFirst : {};
  const tasteMemory = intentFirst.tasteMemory && typeof intentFirst.tasteMemory === "object" ? intentFirst.tasteMemory : {};
  const activeProfile = tasteMemory.activeProfile && typeof tasteMemory.activeProfile === "object" ? tasteMemory.activeProfile : {};
  const items = [];
  items.push(buildBaseItem({
    memoryId: "intent:active_requirement_contract",
    type: "requirement_ref",
    status: "promoted",
    authorityTier: 1,
    sourceTier: "runtime",
    scope: {
      workspaceId,
      taskFamilies: uniqueStrings([safeString(runtime && runtime.latestTurn && runtime.latestTurn.family_completion_gate && runtime.latestTurn.family_completion_gate.taskFamily, 80) || "default"], 4, 80),
      agents: uniqueStrings([safeString(runtime && runtime.activeAgent, 80) || "default"], 4, 80),
      ownedPaths: [],
    },
    summary: "Active intent-first requirement state for the current workspace and turn.",
    structured: {
      mode: safeString(intentFirst.mode, 80),
      benchmarkComparisonRequired: Boolean(intentFirst.contract && intentFirst.contract.benchmarkComparisonRequired),
      visualReviewRequired: Boolean(intentFirst.contract && intentFirst.contract.visualReviewRequired),
      independentReviewRequired: Boolean(intentFirst.contract && intentFirst.contract.independentReviewRequired),
      docSyncRequired: Boolean(intentFirst.contract && intentFirst.contract.docSyncRequired),
      technicalVerificationRequired: Boolean(intentFirst.contract && intentFirst.contract.technicalVerificationRequired),
      prohibitedPatterns: uniqueStrings(intentFirst.contract && intentFirst.contract.prohibitedPatterns, 12, 160),
      requiredArtifacts: uniqueStrings(intentFirst.contract && intentFirst.contract.requiredArtifacts, 12, 160),
      tasteMemoryPath: safeString(intentFirst.tasteMemoryPath, 220),
    },
    evidence: {
      sourceRefs: [safeString(intentFirst.contractPath, 220), safeString(intentFirst.tasteMemoryPath, 220)].filter(Boolean),
      supportCount: 2,
      confidence: 0.95,
      lastValidatedAt: toIso(),
    },
    retrieval: {
      topics: ["intent", "requirement", "acceptance"],
      lexicalTriggers: ["benchmark", "visual review", "doc sync"],
      priority: 96,
    },
  }));
  if (activeProfile && Object.keys(activeProfile).length) {
    items.push(buildBaseItem({
      memoryId: `preference:${safeString(tasteMemory.activeProfileId || activeProfile.id, 80) || "default"}`,
      type: "preference_signal",
      status: "promoted",
      authorityTier: 2,
      sourceTier: "runtime",
      scope: {
        workspaceId,
        taskFamilies: ["web_creative"],
        agents: ["default", "frontend_worker", "reviewer"],
        ownedPaths: [],
      },
      summary: safeString(activeProfile.northStar, 320) || "Active taste profile for subjective-quality work.",
      structured: {
        activeProfileId: safeString(tasteMemory.activeProfileId || activeProfile.id, 80) || "default",
        label: safeString(activeProfile.label, 160),
        qualityBar: safeString(activeProfile.qualityBar, 320),
        mustHaves: uniqueStrings(activeProfile.mustHaves, 10, 180),
        avoid: uniqueStrings(activeProfile.avoid, 10, 180),
        benchmarkUrls: uniqueStrings(activeProfile.benchmarkUrls, 8, 220),
        notes: uniqueStrings(activeProfile.notes, 12, 220),
        updatedAt: safeString(activeProfile.updatedAt, 80),
      },
      evidence: {
        sourceRefs: [safeString(intentFirst.tasteMemorySeedPath, 220), safeString(intentFirst.tasteMemoryPath, 220)].filter(Boolean),
        supportCount: 2,
        confidence: 0.9,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: ["taste", "benchmark", "subjective-quality"],
        lexicalTriggers: uniqueStrings([
          ...(Array.isArray(activeProfile.avoid) ? activeProfile.avoid : []),
          ...(Array.isArray(activeProfile.mustHaves) ? activeProfile.mustHaves : []),
        ], 14, 80),
        priority: 92,
      },
    }));
  }
  return items;
}

function buildWorkspaceProgressItem({ workspaceRoot, runtime, traceability, executionOverview }) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object" ? runtime.latestTurn : {};
  const familyGate = latestTurn.family_completion_gate && typeof latestTurn.family_completion_gate === "object"
    ? latestTurn.family_completion_gate
    : {};
  const executionRecent = executionOverview && Array.isArray(executionOverview.recent) ? executionOverview.recent : [];
  const latestSuccess = executionRecent.find((entry) => safeString(entry && entry.taskOutcomeStatus, 80).toUpperCase() === "COMPLETED");
  const latestFailure = executionRecent.find((entry) => {
    const status = safeString(entry && entry.taskOutcomeStatus, 80).toUpperCase();
    return status && status !== "COMPLETED";
  });
  return buildBaseItem({
    memoryId: `workspace:${workspaceId}:progress`,
    type: "workspace_progress",
    status: "promoted",
    authorityTier: 3,
    sourceTier: "runtime",
    scope: {
      workspaceId,
      threadId: safeString(latestTurn.thread_id || latestTurn.threadId, 120),
      taskFamilies: uniqueStrings([safeString(familyGate.taskFamily, 80) || "default"], 4, 80),
      agents: uniqueStrings([safeString(latestTurn.agent_name || runtime.activeAgent, 80) || "default"], 6, 80),
      ownedPaths: uniqueStrings(traceability && traceability.changedPaths, 24, 220),
    },
    summary: "Durable workspace-scoped progress state compiled from the latest turn, evidence traceability, and execution history.",
    structured: {
      workspaceRoot: repoRelative(workspaceRoot, workspaceRoot),
      currentObjective: safeString(latestTurn.summary || latestTurn.title || latestTurn.task_outcome_reason, 280) || "Continue the active governed harness objective.",
      currentMilestones: uniqueStrings([
        safeString(latestTurn.status, 80) && `latest turn status: ${safeString(latestTurn.status, 80)}`,
        safeString(familyGate.status, 80) && `family gate: ${safeString(familyGate.status, 80)}`,
      ].filter(Boolean), 8, 160),
      knownBlockers: uniqueStrings((Array.isArray(familyGate.missingHard) ? familyGate.missingHard : []).map((entry) => safeString(entry && entry.label, 120) || safeString(entry && entry.reason, 120)), 8, 160),
      knownRisks: uniqueStrings([
        safeString(latestFailure && latestFailure.taskOutcomeReason, 200),
        safeString(traceability && traceability.summary, 200),
      ], 8, 200),
      lastSuccessfulValidation: latestSuccess ? [{
        turnId: safeString(latestSuccess.turnId, 120),
        taskOutcomeStatus: safeString(latestSuccess.taskOutcomeStatus, 80),
        completedAt: safeString(latestSuccess.completedAt, 80),
      }] : [],
      lastFailedValidation: latestFailure ? [{
        turnId: safeString(latestFailure.turnId, 120),
        taskOutcomeStatus: safeString(latestFailure.taskOutcomeStatus, 80),
        reason: safeString(latestFailure.taskOutcomeReason, 200),
        completedAt: safeString(latestFailure.completedAt, 80),
      }] : [],
      recentTouchedPaths: uniqueStrings(traceability && traceability.changedPaths, 24, 220),
      nextRecommendedActions: uniqueStrings([
        safeString(familyGate.status, 80) === "failed_validation" ? "Recover the latest failed validation before adding new scope." : "",
        safeString(latestTurn.task_outcome_status, 80).toUpperCase() === "FAILED_VALIDATION" ? "Treat missing evidence as a release blocker and regenerate the required proof." : "",
      ], 6, 220),
      updatedAt: toIso(),
    },
    evidence: {
      sourceRefs: uniqueStrings([
        safeString(traceability && traceability.operatorSummaryPath, 220),
        safeString(traceability && traceability.manifestPath, 220),
      ], 8, 220),
      supportCount: 2,
      confidence: 0.88,
      lastValidatedAt: toIso(),
    },
    retrieval: {
      topics: ["workspace", "progress", "status"],
      lexicalTriggers: ["next", "blocker", "risk", "progress"],
      priority: 88,
    },
  });
}

function buildEpisodicAndFailureItems({ workspaceRoot, runtime, executionOverview, evalHistory }) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const items = [];
  const recent = executionOverview && Array.isArray(executionOverview.recent) ? executionOverview.recent : [];
  for (const entry of recent.slice(0, 8)) {
    const taskOutcomeStatus = safeString(entry && entry.taskOutcomeStatus, 80).toUpperCase() || "UNSPECIFIED";
    items.push(buildBaseItem({
      memoryId: `episode:${safeString(entry && entry.turnId, 120) || stableHash(entry).slice(0, 12)}`,
      type: "episodic_event",
      status: "captured",
      authorityTier: 4,
      sourceTier: "runtime",
      scope: {
        workspaceId,
        threadId: safeString(entry && entry.threadId, 120),
        taskFamilies: uniqueStrings([safeString(runtime && runtime.latestTurn && runtime.latestTurn.family_completion_gate && runtime.latestTurn.family_completion_gate.taskFamily, 80) || "default"], 4, 80),
        agents: uniqueStrings([safeString(entry && entry.agentName, 80)], 4, 80),
        ownedPaths: [],
      },
      summary: `${safeString(entry && entry.turnId, 120) || "turn"} finished as ${taskOutcomeStatus}.`,
      structured: {
        turnId: safeString(entry && entry.turnId, 120),
        status: safeString(entry && entry.status, 40),
        taskOutcomeStatus,
        taskOutcomeReason: safeString(entry && entry.taskOutcomeReason, 240),
        executionProfile: safeString(entry && entry.executionProfile, 80),
        completedAt: safeString(entry && entry.completedAt, 80),
        fileChanges: clampInt(entry && entry.fileChanges, 0, 9999, 0),
        commandExecutions: clampInt(entry && entry.commandExecutions, 0, 9999, 0),
        collabCalls: clampInt(entry && entry.collabCalls, 0, 9999, 0),
      },
      evidence: {
        sourceRefs: ["logs/archive/raw/harness_execution_memory.json"],
        supportCount: 1,
        confidence: 0.8,
        lastValidatedAt: safeString(entry && entry.completedAt, 80) || toIso(),
      },
      retrieval: {
        topics: ["execution", "episode"],
        lexicalTriggers: uniqueStrings([taskOutcomeStatus, safeString(entry && entry.executionProfile, 80)], 8, 80),
        priority: taskOutcomeStatus === "COMPLETED" ? 55 : 70,
      },
    }));
  }
  const patterns = executionOverview && Array.isArray(executionOverview.patterns) ? executionOverview.patterns : [];
  for (const entry of patterns.slice(0, 6)) {
    items.push(buildBaseItem({
      memoryId: `failure:${safeString(entry && entry.signature, 120) || stableHash(entry).slice(0, 12)}`,
      type: "failure_pattern",
      status: "promoted",
      authorityTier: 5,
      sourceTier: "runtime",
      scope: {
        workspaceId,
        taskFamilies: ["default"],
        agents: ["default", "reviewer", "tester"],
        ownedPaths: [],
      },
      summary: safeString(entry && entry.hint, 320) || safeString(entry && entry.signature, 320),
      structured: {
        signature: safeString(entry && entry.signature, 220),
        code: safeString(entry && entry.code, 120),
        severity: safeString(entry && entry.severity, 80),
        status: safeString(entry && entry.status, 80),
        count: clampInt(entry && entry.count, 0, 99999, 0),
        lastSeenAt: safeString(entry && entry.lastSeenAt, 80),
      },
      evidence: {
        sourceRefs: ["logs/archive/raw/harness_execution_memory.json"],
        supportCount: clampInt(entry && entry.count, 1, 99999, 1),
        confidence: 0.85,
        lastValidatedAt: safeString(entry && entry.lastSeenAt, 80) || toIso(),
      },
      retrieval: {
        topics: ["failure", "pattern", safeString(entry && entry.severity, 40)],
        lexicalTriggers: uniqueStrings([safeString(entry && entry.code, 80), safeString(entry && entry.signature, 80)], 10, 80),
        priority: clampInt(60 + clampInt(entry && entry.count, 0, 20, 0), 0, 95, 60),
      },
    }));
  }
  for (const run of Array.isArray(evalHistory && evalHistory.recentRuns) ? evalHistory.recentRuns.slice(0, 6) : []) {
    items.push(buildBaseItem({
      memoryId: `eval:${safeString(run && run.runId, 120) || stableHash(run).slice(0, 12)}`,
      type: "eval_observation",
      status: "captured",
      authorityTier: 4,
      sourceTier: "eval",
      scope: {
        workspaceId,
        taskFamilies: ["default"],
        agents: ["default", "reviewer", "tester"],
        ownedPaths: [],
      },
      summary: `${safeString(run && run.suiteId, 160) || "eval suite"} score ${safeNumber(run && run.scoreRate, 0).toFixed(2)} with ${clampInt(run && run.failedCases, 0, 9999, 0)} failures.`,
      structured: {
        runId: safeString(run && run.runId, 120),
        suiteId: safeString(run && run.suiteId, 160),
        variantLabel: safeString(run && run.variantLabel, 120),
        scoreRate: Number(safeNumber(run && run.scoreRate, 0).toFixed(4)),
        passRate: Number(safeNumber(run && run.passRate, 0).toFixed(4)),
        failedCases: clampInt(run && run.failedCases, 0, 9999, 0),
        probePersistedRecords: clampInt(run && run.probePersistedRecords, 0, 9999, 0),
        generatedAt: safeString(run && run.generatedAt, 80),
      },
      evidence: {
        sourceRefs: ["logs/archive/raw/eval_runs.jsonl"],
        supportCount: 1,
        confidence: 0.9,
        lastValidatedAt: safeString(run && run.generatedAt, 80) || toIso(),
      },
      retrieval: {
        topics: ["eval", "regression"],
        lexicalTriggers: uniqueStrings([safeString(run && run.suiteId, 80), safeString(run && run.variantLabel, 80)], 8, 80),
        priority: 72,
      },
    }));
  }
  return items;
}

function buildSemanticAndImprovementItems({ workspaceRoot, runtime }) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const items = [];
  const external = runtime && runtime.externalLearning && typeof runtime.externalLearning === "object" ? runtime.externalLearning : {};
  const secondary = runtime && runtime.secondaryLearning && runtime.secondaryLearning.anthropicEngineering && typeof runtime.secondaryLearning.anthropicEngineering === "object"
    ? runtime.secondaryLearning.anthropicEngineering
    : {};
  const manual = runtime && runtime.manualSelfImprovement && typeof runtime.manualSelfImprovement === "object" ? runtime.manualSelfImprovement : {};
  const nextPriority = external.selfImprovement && external.selfImprovement.nextPriority && typeof external.selfImprovement.nextPriority === "object"
    ? external.selfImprovement.nextPriority
    : null;
  if (nextPriority) {
    items.push(buildBaseItem({
      memoryId: `improvement:openai:${stableHash(nextPriority).slice(0, 12)}`,
      type: "improvement_candidate",
      status: safeString(nextPriority.readinessStatus, 80) === "awaiting_observations" ? "shadow" : "candidate",
      authorityTier: 6,
      sourceTier: "external_primary",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(external.runtimeRetrieval && external.runtimeRetrieval.applyToTaskFamilies, 8, 80),
        agents: uniqueStrings(external.runtimeRetrieval && external.runtimeRetrieval.applyToAgents, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(nextPriority.title, 320) || "Primary-lane improvement candidate.",
      structured: nextPriority,
      evidence: {
        sourceRefs: uniqueStrings([safeString(external.ledgerPath, 220), safeString(external.digestPath, 220)], 4, 220),
        supportCount: clampInt(external.trackedArticles, 1, 999, 1),
        confidence: 0.82,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: ["improvement", "primary-lane"],
        lexicalTriggers: uniqueStrings([safeString(nextPriority.changeType, 80), safeString(nextPriority.gatingReason, 80)], 8, 80),
        priority: 66,
      },
    }));
  }
  for (const article of Array.isArray(external.recentArticles) ? external.recentArticles.slice(0, 4) : []) {
    items.push(buildBaseItem({
      memoryId: `lesson:openai:${stableHash(article).slice(0, 12)}`,
      type: "semantic_lesson",
      status: "promoted",
      authorityTier: 5,
      sourceTier: "external_primary",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(external.runtimeRetrieval && external.runtimeRetrieval.applyToTaskFamilies, 8, 80),
        agents: uniqueStrings(external.runtimeRetrieval && external.runtimeRetrieval.applyToAgents, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(article && article.title, 320) || "Primary external lesson.",
      structured: article,
      evidence: {
        sourceRefs: uniqueStrings([safeString(article && article.url, 220), safeString(external.curatedDocPath, 220)], 4, 220),
        supportCount: 1,
        confidence: 0.78,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: uniqueStrings(article && article.topicTags, 8, 80),
        lexicalTriggers: uniqueStrings([safeString(article && article.title, 80)], 6, 80),
        priority: 64,
      },
    }));
  }
  for (const article of Array.isArray(secondary.recentArticles) ? secondary.recentArticles.slice(0, 4) : []) {
    items.push(buildBaseItem({
      memoryId: `lesson:anthropic:${stableHash(article).slice(0, 12)}`,
      type: "semantic_lesson",
      status: "shadow",
      authorityTier: 5,
      sourceTier: "external_secondary",
      scope: {
        workspaceId,
        taskFamilies: ["default"],
        agents: ["default", "reviewer", "tester"],
        ownedPaths: [],
      },
      summary: safeString(article && article.title, 320) || "Secondary external lesson.",
      structured: {
        ...article,
        portabilityMode: safeString(secondary.portabilityMode, 80),
      },
      evidence: {
        sourceRefs: uniqueStrings([safeString(article && article.url, 220), safeString(secondary.curatedDocPath, 220)], 4, 220),
        supportCount: 1,
        confidence: 0.64,
        lastValidatedAt: toIso(),
      },
      retrieval: {
        topics: ["secondary", "portable-principles"],
        lexicalTriggers: uniqueStrings([safeString(article && article.title, 80), safeString(article && article.portability, 80)], 8, 80),
        negativeTriggers: ["override", "constitution"],
        priority: 42,
      },
    }));
  }
  for (const lesson of Array.isArray(manual.entries) ? manual.entries.slice(0, 6) : []) {
    items.push(buildBaseItem({
      memoryId: `manual:${stableHash(lesson).slice(0, 12)}`,
      type: safeString(lesson && lesson.classification, 80).toLowerCase() === "runtime hint" ? "runtime_hint" : "improvement_candidate",
      status: safeString(lesson && lesson.promotionDecision, 80).toLowerCase() === "blocked" ? "blocked" : "proposal_only",
      authorityTier: 6,
      sourceTier: "manual",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(lesson && lesson.appliesTo && lesson.appliesTo.taskFamily, 8, 80),
        agents: uniqueStrings(lesson && lesson.appliesTo && lesson.appliesTo.agent, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(lesson && lesson.lessonSummary, 320),
      structured: lesson,
      evidence: {
        sourceRefs: uniqueStrings(lesson && lesson.supportingArtifacts, 8, 220),
        supportCount: 1,
        confidence: 0.7,
        lastValidatedAt: safeString(manual.generatedAt, 80) || toIso(),
      },
      retrieval: {
        topics: uniqueStrings([safeString(lesson && lesson.classification, 80), ...((lesson && lesson.appliesTo && lesson.appliesTo.taskFamily) || [])], 8, 80),
        lexicalTriggers: uniqueStrings(lesson && lesson.appliesTo && lesson.appliesTo.triggers, 10, 80),
        priority: 58,
      },
    }));
  }
  return items;
}

function collectItems({ workspaceRoot, runtime, traceability }) {
  const executionOverview = runtime && runtime.executionOverview && typeof runtime.executionOverview === "object" ? runtime.executionOverview : {};
  const evalHistory = runtime && runtime.evalHistory && typeof runtime.evalHistory === "object" ? runtime.evalHistory : {};
  return [
    ...buildSpecGraphItems({ workspaceRoot, phaseStatus: runtime && runtime.phaseStatus, runtime }),
    ...buildIntentAndPreferenceItems({ workspaceRoot, runtime }),
    buildWorkspaceProgressItem({ workspaceRoot, runtime, traceability, executionOverview }),
    ...buildEpisodicAndFailureItems({ workspaceRoot, runtime, executionOverview, evalHistory }),
    ...buildSemanticAndImprovementItems({ workspaceRoot, runtime }),
  ];
}

function buildIndexes(items) {
  const byId = {};
  const byScope = {};
  const byType = {};
  const byTaskFamily = {};
  const byAgent = {};
  const byWorkspace = {};
  for (const item of items) {
    byId[item.memoryId] = {
      type: item.type,
      status: item.status,
      authorityTier: item.authorityTier,
      sourceTier: item.sourceTier,
      contentHash: item.evidence.contentHash,
      createdAt: safeString(item.lifecycle && item.lifecycle.createdAt, 80),
      updatedAt: item.lifecycle.updatedAt,
      summary: item.content.summary,
    };
    const workspaceId = safeString(item.scope && item.scope.workspaceId, 120) || "global";
    byWorkspace[workspaceId] = byWorkspace[workspaceId] || [];
    byWorkspace[workspaceId].push(item.memoryId);
    const scopeKey = `${workspaceId}:${safeString(item.scope && item.scope.threadId, 120) || "workspace"}`;
    byScope[scopeKey] = byScope[scopeKey] || [];
    byScope[scopeKey].push(item.memoryId);
    byType[item.type] = byType[item.type] || [];
    byType[item.type].push(item.memoryId);
    for (const family of uniqueStrings(item.scope && item.scope.taskFamilies, 12, 80)) {
      byTaskFamily[family] = byTaskFamily[family] || [];
      byTaskFamily[family].push(item.memoryId);
    }
    for (const agent of uniqueStrings(item.scope && item.scope.agents, 12, 80)) {
      byAgent[agent] = byAgent[agent] || [];
      byAgent[agent].push(item.memoryId);
    }
  }
  return { byId, byScope, byType, byTaskFamily, byAgent, byWorkspace };
}

function scoreItem(item, context, policy) {
  const weights = policy && policy.scoringWeights && typeof policy.scoringWeights === "object"
    ? policy.scoringWeights
    : (policy && policy.weights && typeof policy.weights === "object" ? policy.weights : {});
  const authorityMatch = 1 - Math.min(1, Math.max(0, safeNumber(item.authorityTier, 6) / 6));
  const scopeMatch = safeString(item.scope && item.scope.workspaceId, 120) === safeString(context.workspaceId, 120) ? 1 : 0;
  const taskFamilies = uniqueStrings(item.scope && item.scope.taskFamilies, 16, 80);
  const taskFamilyMatch = taskFamilies.includes(context.taskFamily) ? 1 : taskFamilies.includes("default") ? 0.5 : 0;
  const agents = uniqueStrings(item.scope && item.scope.agents, 16, 80);
  const agentMatch = agents.includes(context.activeAgent) ? 1 : agents.includes("default") ? 0.5 : 0;
  const pathMatch = uniqueStrings(item.scope && item.scope.ownedPaths, 24, 220).some((entry) => context.ownedPaths.some((owned) => owned && entry && entry.includes(owned))) ? 1 : 0;
  const updatedAt = Date.parse(safeString(item.lifecycle && item.lifecycle.updatedAt, 80));
  const ageDays = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 86400000) : 365;
  const freshness = Math.max(0, Math.min(1, 1 - ageDays / 30));
  const evidenceStrength = Math.max(0, Math.min(1, safeNumber(item.evidence && item.evidence.supportCount, 0) / 4));
  const reinforcement = item.status === "reinforced" ? 1 : item.status === "promoted" ? 0.8 : item.status === "shadow" ? 0.35 : 0.2;
  const factors = {
    authorityMatch: Number(authorityMatch.toFixed(4)),
    scopeMatch: Number(scopeMatch.toFixed(4)),
    taskFamilyMatch: Number(taskFamilyMatch.toFixed(4)),
    agentMatch: Number(agentMatch.toFixed(4)),
    ownedPathMatch: Number(pathMatch.toFixed(4)),
    freshness: Number(freshness.toFixed(4)),
    evidenceStrength: Number(evidenceStrength.toFixed(4)),
    reinforcement: Number(reinforcement.toFixed(4)),
  };
  let score = 0;
  score += safeNumber(weights.authorityMatch, 0.28) * authorityMatch;
  score += safeNumber(weights.scopeMatch, 0.22) * scopeMatch;
  score += safeNumber(weights.taskFamilyMatch, 0.16) * taskFamilyMatch;
  score += safeNumber(weights.ownedPathMatch, 0.12) * pathMatch;
  score += safeNumber(weights.freshness, 0.1) * freshness;
  score += safeNumber(weights.evidenceStrength, 0.07) * evidenceStrength;
  score += safeNumber(weights.reinforcement, 0.05) * reinforcement;
  score += 0.04 * agentMatch;
  const penalties = policy && policy.penalties && typeof policy.penalties === "object" ? policy.penalties : {};
  if (item.status === "revoked" || item.status === "expired") score -= safeNumber(penalties.stale, 0.3);
  if (item.sourceTier === "external_secondary") score -= safeNumber(penalties.secondarySource, 0.12);
  if (item.status === "shadow") score -= safeNumber(penalties.shadowOnly, 0.08);
  if (item.status === "blocked") score -= safeNumber(penalties.policyBlocked, 0.35);
  return {
    score: Number(score.toFixed(4)),
    factors,
    section: classifyMemorySection(item),
  };
}

function compileMemoryPack({ workspaceRoot, runtime, items }) {
  const policy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json");
  const sectionBudgets = policy && policy.sectionBudgets && typeof policy.sectionBudgets === "object" ? policy.sectionBudgets : {};
  const thresholds = policy && policy.scoreThresholds && typeof policy.scoreThresholds === "object" ? policy.scoreThresholds : {};
  const minimumSelectionScore = safeNumber(thresholds.minimumSelectionScore, 0.18);
  const highConfidenceScore = safeNumber(thresholds.highConfidenceScore, 0.68);
  const limit = clampInt(policy && (policy.defaultPackBudget || (policy.packLimits && policy.packLimits.maxItems)), 4, 40, 18);
  const activeAgent = safeString(runtime && runtime.activeAgent, 80) || "default";
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object" ? runtime.latestTurn : {};
  const context = {
    workspaceId: toWorkspaceId(workspaceRoot),
    activeAgent,
    threadId: safeString(latestTurn.thread_id || latestTurn.threadId, 120),
    taskFamily: safeString(latestTurn.family_completion_gate && latestTurn.family_completion_gate.taskFamily, 80) || "default",
    ownedPaths: uniqueStrings(runtime && runtime.traceability && runtime.traceability.changedPaths, 24, 220),
  };
  const allScored = items
    .map((item) => ({ item, ...scoreItem(item, context, policy) }))
    .sort((left, right) => right.score - left.score)
  const selected = [];
  const sectionCounts = {
    spec: 0,
    intent: 0,
    workspace_progress: 0,
    experience: 0,
    semantic: 0,
    preference: 0,
    improvement: 0,
  };
  for (const entry of allScored) {
    if (selected.length >= limit) break;
    if (entry.score < minimumSelectionScore) continue;
    if (["revoked", "expired", "blocked"].includes(safeString(entry.item && entry.item.status, 40))) continue;
    const section = entry.section;
    const budget = clampInt(sectionBudgets[section], 0, 20, limit);
    if (budget > 0 && safeNumber(sectionCounts[section], 0) >= budget) continue;
    sectionCounts[section] = safeNumber(sectionCounts[section], 0) + 1;
    selected.push(entry);
  }
  const selectionReasons = {};
  const sectionEntries = {
    spec: [],
    intent: [],
    workspace_progress: [],
    experience: [],
    semantic: [],
    preference: [],
    improvement: [],
  };
  for (const entry of selected) {
    const reason = {
      section: entry.section,
      score: entry.score,
      scoreBand: scoreBand(entry.score, thresholds),
      sourceTier: entry.item.sourceTier,
      authorityTier: entry.item.authorityTier,
      factors: entry.factors,
    };
    selectionReasons[entry.item.memoryId] = reason;
    sectionEntries[entry.section].push({
      memoryId: entry.item.memoryId,
      type: entry.item.type,
      status: entry.item.status,
      score: entry.score,
      summary: entry.item.content.summary,
      whyIncluded: reason,
    });
  }
  const generatedAt = toIso();
  const packId = stableHash({
    generatedAt,
    workspaceId: context.workspaceId,
    threadId: context.threadId,
    activeAgent,
    taskFamily: context.taskFamily,
    selectedMemoryIds: selected.map((entry) => entry.item.memoryId),
  }).slice(0, 20);
  return {
    packId,
    schema: "memory-pack.v1",
    generatedAt,
    compiledAt: generatedAt,
    context,
    workspaceId: context.workspaceId,
    threadId: context.threadId,
    activeAgent,
    taskFamily: context.taskFamily,
    thresholds: {
      minimumSelectionScore,
      highConfidenceScore,
    },
    sectionCounts,
    sections: sectionEntries,
    selectedMemoryIds: selected.map((entry) => entry.item.memoryId),
    selectionReasons,
    selectedCount: selected.length,
    highConfidenceCount: selected.filter((entry) => entry.score >= highConfidenceScore).length,
    items: selected.map(({ item, score }) => ({
      memoryId: item.memoryId,
      type: item.type,
      status: item.status,
      score,
      section: classifyMemorySection(item),
      scoreBand: scoreBand(score, thresholds),
      whyIncluded: {
        authorityTier: item.authorityTier,
        sourceTier: item.sourceTier,
        scopeWorkspace: safeString(item.scope && item.scope.workspaceId, 120),
        taskFamilies: uniqueStrings(item.scope && item.scope.taskFamilies, 8, 80),
      },
      summary: item.content.summary,
    })),
  };
}

function buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime, currentEvents = [] }) {
  const retentionPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retention_policy.json");
  const typeCounts = {};
  const statusCounts = {};
  for (const item of items) {
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }
  const workspaceProgress = items.find((item) => item.type === "workspace_progress") || null;
  const health = collectMemoryHealth({ items, paths, retentionPolicy, currentEvents });
  return {
    enabled: true,
    schema: "governed-memory-graph-runtime.v1",
    status: "ready",
    workspaceId: toWorkspaceId(workspaceRoot),
    canonicalRoot: repoRelative(workspaceRoot, paths.root),
    eventLogPath: repoRelative(workspaceRoot, paths.eventsPath),
    outputRoot: repoRelative(workspaceRoot, paths.output.root),
    itemCount: items.length,
    promotedCount: items.filter((item) => item.status === "promoted" || item.status === "reinforced").length,
    typeCounts,
    statusCounts,
    staleMemoryWarnings: health.staleMemoryWarnings,
    recentPromotions: health.recentPromotions,
    recentRevocations: health.recentRevocations,
    workspaceProgress: workspaceProgress ? workspaceProgress.content.structured : {},
    latestPack: {
      packId: safeString(pack.packId, 120),
      generatedAt: safeString(pack.generatedAt, 80),
      compiledAt: pack.compiledAt,
      selectedCount: pack.selectedCount,
      highConfidenceCount: clampInt(pack.highConfidenceCount, 0, 9999, 0),
      sectionCounts: pack.sectionCounts && typeof pack.sectionCounts === "object" ? pack.sectionCounts : {},
      activeAgent: pack.activeAgent,
      taskFamily: pack.taskFamily,
      memoryIds: Array.isArray(pack.selectedMemoryIds) ? pack.selectedMemoryIds.slice(0, 24) : pack.items.map((entry) => entry.memoryId),
    },
    compatibilityProjectionPaths: uniqueStrings([
      "output/openai_blog_learning_digest.json",
      "output/openai_blog_learning_ledger.json",
      "output/openai_blog_self_improvement_state.json",
      "output/openai_blog_self_improvement_gate.json",
      "output/openai_blog_reinforcement_memory.json",
      "output/anthropic_engineering_learning_digest.json",
      "output/anthropic_engineering_learning_ledger.json",
      "output/anthropic_engineering_self_improvement_state.json",
      "output/anthropic_engineering_self_improvement_gate.json",
    ], 16, 220),
    activeAgent: safeString(runtime && runtime.activeAgent, 80) || "default",
  };
}

function renderOverviewMarkdown(summary) {
  const lines = [
    "# Governed Memory Overview",
    "",
    `- Workspace: ${safeString(summary.workspaceId, 120)}`,
    `- Canonical root: ${safeString(summary.canonicalRoot, 220)}`,
    `- Event log: ${safeString(summary.eventLogPath, 220)}`,
    `- Items: ${clampInt(summary.itemCount, 0, 999999, 0)}`,
    `- Promoted: ${clampInt(summary.promotedCount, 0, 999999, 0)}`,
    `- Latest pack: ${clampInt(summary.latestPack && summary.latestPack.selectedCount, 0, 999999, 0)} items for ${safeString(summary.latestPack && summary.latestPack.activeAgent, 80) || "default"} (${clampInt(summary.latestPack && summary.latestPack.highConfidenceCount, 0, 999999, 0)} high-confidence)`,
    "",
    "## Type Counts",
  ];
  for (const [key, value] of Object.entries(summary.typeCounts || {}).sort((left, right) => String(left[0]).localeCompare(String(right[0])))) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("", "## Workspace Progress");
  for (const blocker of uniqueStrings(summary.workspaceProgress && summary.workspaceProgress.knownBlockers, 8, 180)) {
    lines.push(`- blocker: ${blocker}`);
  }
  for (const action of uniqueStrings(summary.workspaceProgress && summary.workspaceProgress.nextRecommendedActions, 8, 180)) {
    lines.push(`- next: ${action}`);
  }
  if (Array.isArray(summary.staleMemoryWarnings) && summary.staleMemoryWarnings.length) {
    lines.push("", "## Stale Warnings");
    for (const warning of summary.staleMemoryWarnings.slice(0, 6)) {
      lines.push(`- ${safeString(warning.memoryId, 120)} (${safeString(warning.type, 80)}): ${safeNumber(warning.ageDays, 0).toFixed(1)}d >= ${clampInt(warning.expiryDays, 0, 9999, 0)}d`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function syncGovernedMemoryGraph({ workspaceRoot = workspaceRootDefault, runtime = {}, traceability = {}, reason = "manual" } = {}) {
  const paths = getMemoryPaths(workspaceRoot);
  ensureMemoryLayout(paths);
  const previousById = readJsonObject(paths.indexes.byId);
  const items = reviveLifecycle(
    collectItems({ workspaceRoot, runtime: { ...runtime, traceability }, traceability }),
    previousById
  );
  const indexes = buildIndexes(items);
  const pack = compileMemoryPack({ workspaceRoot, runtime: { ...runtime, traceability }, items });
  const initialSummary = buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime, currentEvents: [] });
  const events = [];
  for (const item of items) {
    const previous = previousById[item.memoryId];
    if (!previous || safeString(previous.contentHash, 80) !== safeString(item.evidence.contentHash, 80) || safeString(previous.status, 80) !== safeString(item.status, 80)) {
      events.push({
        schema: "memory-event.v1",
        eventId: stableHash({ memoryId: item.memoryId, contentHash: item.evidence.contentHash, reason }).slice(0, 20),
        eventType: "memory_item_upsert",
        legacyEventType: previous ? "memory.updated" : "memory.captured",
        recordedAt: toIso(),
        memoryId: item.memoryId,
        memoryType: item.type,
        workspaceId: initialSummary.workspaceId,
        threadId: safeString(item.scope && item.scope.threadId, 120),
        status: item.status,
        sourceTier: item.sourceTier,
        authorityTier: item.authorityTier,
        reason,
        contentHash: item.evidence.contentHash,
      });
    }
  }
  events.push({
    schema: "memory-event.v1",
    eventId: stableHash({ packId: pack.packId, reason, generatedAt: pack.generatedAt }).slice(0, 20),
    eventType: "memory_pack_compiled",
    recordedAt: safeString(pack.generatedAt, 80) || toIso(),
    memoryId: `pack:${safeString(pack.packId, 120)}`,
    memoryType: "memory_pack",
    status: "compiled",
    sourceTier: "runtime",
    authorityTier: 3,
    reason,
    workspaceId: initialSummary.workspaceId,
    threadId: safeString(pack.threadId, 120),
    packId: safeString(pack.packId, 120),
    selectedCount: clampInt(pack.selectedCount, 0, 999999, 0),
  });
  for (const event of events) {
    appendJsonLine(paths.eventsPath, event);
  }
  const retentionPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retention_policy.json");
  pruneJsonlFile(paths.eventsPath, {
    maxEntries: clampInt(retentionPolicy && retentionPolicy.eventStore && retentionPolicy.eventStore.maxEvents, 0, 999999, 12000),
    maxDays: clampInt(retentionPolicy && retentionPolicy.eventStore && retentionPolicy.eventStore.maxDays, 0, 3650, 180),
  });
  writeJsonIfChanged(paths.indexes.byId, indexes.byId);
  writeJsonIfChanged(paths.indexes.byScope, indexes.byScope);
  writeJsonIfChanged(paths.indexes.byType, indexes.byType);
  writeJsonIfChanged(paths.indexes.byTaskFamily, indexes.byTaskFamily);
  writeJsonIfChanged(paths.indexes.byAgent, indexes.byAgent);
  writeJsonIfChanged(paths.indexes.byWorkspace, indexes.byWorkspace);
  const summary = buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime, currentEvents: [] });
  writeJsonIfChanged(paths.projections.specGraph, items.filter((item) => item.type === "constitution_ref"));
  writeJsonIfChanged(path.join(paths.projections.workspaceProgressRoot, `${summary.workspaceId}.json`), summary.workspaceProgress);
  writeJsonIfChanged(path.join(paths.projections.preferenceProfilesRoot, "active.json"), items.filter((item) => item.type === "preference_signal"));
  writeJsonIfChanged(path.join(paths.projections.semanticLessonsRoot, "primary.json"), items.filter((item) => item.type === "semantic_lesson" && item.sourceTier === "external_primary"));
  writeJsonIfChanged(path.join(paths.projections.semanticLessonsRoot, "secondary.json"), items.filter((item) => item.type === "semantic_lesson" && item.sourceTier === "external_secondary"));
  writeJsonIfChanged(path.join(paths.projections.failurePatternsRoot, "latest.json"), items.filter((item) => item.type === "failure_pattern"));
  writeJsonIfChanged(path.join(paths.projections.activeRuntimeHintsRoot, "latest.json"), items.filter((item) => item.type === "runtime_hint"));
  writeJsonIfChanged(path.join(paths.projections.improvementStateRoot, "latest.json"), items.filter((item) => item.type === "improvement_candidate"));
  writeJsonIfChanged(path.join(paths.projections.evalObservationsRoot, "latest.json"), items.filter((item) => item.type === "eval_observation"));
  appendJsonLine(paths.retrieval.packsPath, pack);
  pruneJsonlFile(paths.retrieval.packsPath, {
    maxEntries: clampInt(retentionPolicy && retentionPolicy.projectionRetention && retentionPolicy.projectionRetention.maxRecentPackEntries, 0, 999999, 120),
  });
  const lastPackByThread = readJsonObject(paths.retrieval.lastPackByThread);
  const threadId = safeString(pack.threadId, 120) || "workspace";
  lastPackByThread[threadId] = pack;
  writeJsonIfChanged(paths.retrieval.lastPackByThread, lastPackByThread);
  const lastPackByWorkspace = readJsonObject(paths.retrieval.lastPackByWorkspace);
  lastPackByWorkspace[summary.workspaceId] = pack;
  writeJsonIfChanged(paths.retrieval.lastPackByWorkspace, lastPackByWorkspace);
  writeJsonIfChanged(paths.output.latestOverviewJson, summary);
  ensureDir(paths.output.root);
  fs.writeFileSync(paths.output.latestOverviewMd, renderOverviewMarkdown(summary), "utf8");
  writeJsonIfChanged(paths.output.promotedSemanticMemory, items.filter((item) => item.type === "semantic_lesson" && (item.status === "promoted" || item.status === "reinforced")));
  writeJsonIfChanged(paths.output.preferenceProfilesReport, {
    generatedAt: toIso(),
    activeProfileIds: items.filter((item) => item.type === "preference_signal").map((item) => item.memoryId),
    profiles: items.filter((item) => item.type === "preference_signal").map((item) => item.content.structured),
  });
  writeJsonIfChanged(paths.output.improvementDashboard, {
    generatedAt: toIso(),
    summary: {
      workspaceId: summary.workspaceId,
      staleMemoryWarnings: summary.staleMemoryWarnings,
      recentPromotions: summary.recentPromotions,
      recentRevocations: summary.recentRevocations,
      latestPack: summary.latestPack,
    },
    items: items.filter((item) => item.type === "improvement_candidate" || item.type === "runtime_hint"),
  });
  fs.writeFileSync(paths.output.memoryHealthReportMd, renderOverviewMarkdown(summary), "utf8");
  return {
    summary,
    items,
    pack,
    paths,
    eventCount: loadJsonl(paths.eventsPath).length,
  };
}

function buildGovernedMemoryRuntimeSnapshot({ workspaceRoot = workspaceRootDefault, runtime = {}, traceability = {} } = {}) {
  const paths = getMemoryPaths(workspaceRoot);
  ensureMemoryLayout(paths);
  const previousById = readJsonObject(paths.indexes.byId);
  const items = reviveLifecycle(
    collectItems({ workspaceRoot, runtime: { ...runtime, traceability }, traceability }),
    previousById
  );
  const pack = compileMemoryPack({ workspaceRoot, runtime: { ...runtime, traceability }, items });
  const summary = buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime });
  summary.eventCount = loadJsonl(paths.eventsPath).length;
  return summary;
}

module.exports = {
  buildGovernedMemoryRuntimeSnapshot,
  getMemoryPaths,
  syncGovernedMemoryGraph,
};
