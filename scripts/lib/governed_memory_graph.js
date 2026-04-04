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
const {
  loadOpenAIBlogLearningPolicy,
  refreshSelfImprovementArtifacts,
} = require("./openai_blog_learning");
const {
  loadAnthropicEngineeringLearningPolicy,
} = require("./anthropic_engineering_learning");
const {
  buildTaskPaths,
  loadContinuityPolicy,
} = require("./long_horizon_continuity");

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

function readJsonArray(targetPath) {
  const payload = readJson(targetPath);
  return Array.isArray(payload) ? payload : [];
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

function maskOpaqueId(value, prefix = "mem") {
  const text = safeString(value, 240);
  if (!text) return "";
  return `${prefix}_${stableHash(text).slice(0, 10)}`;
}

function humanizeCompactIdentifier(value) {
  const text = safeString(value, 240);
  if (!text) return "";
  return text.replace(/\b([A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)+)\b/g, (_, token) => token.replace(/[_-]+/g, " "));
}

function normalizePublicText(value, workspaceRoot) {
  let text = safeString(value, 600);
  if (!text) return "";
  const absoluteRoot = safeString(path.resolve(workspaceRoot), 400);
  const forwardRoot = absoluteRoot.replace(/\\/g, "/");
  if (absoluteRoot) {
    text = text.split(absoluteRoot).join("<workspace-root>");
  }
  if (forwardRoot && forwardRoot !== absoluteRoot) {
    text = text.split(forwardRoot).join("<workspace-root>");
  }
  text = text
    .replace(/\bturn[-:][A-Za-z0-9_-]+\b/g, "<turn-ref>")
    .replace(/\bthread[-:][A-Za-z0-9_-]+\b/g, "<thread-ref>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/ig, "<opaque-id>");
  return text;
}

function normalizePublicTimestamp(value) {
  const text = safeString(value, 80);
  if (!text) return "";
  if (/^\d{13}$/.test(text)) {
    const asNumber = Number(text);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return new Date(asNumber).toISOString();
    }
  }
  if (/^\d{10}$/.test(text)) {
    const asNumber = Number(text);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return new Date(asNumber * 1000).toISOString();
    }
  }
  return text;
}

function collectTextFragments(value, workspaceRoot, depth = 0) {
  if (depth > 3 || value == null) return [];
  if (typeof value === "string") {
    const normalized = normalizePublicText(humanizeCompactIdentifier(value), workspaceRoot).trim();
    if (!normalized || normalized === "[object Object]") return [];
    return [normalized];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTextFragments(entry, workspaceRoot, depth + 1)).slice(0, 8);
  }
  if (value && typeof value === "object") {
    const preferredKeys = ["summary", "reason", "message", "title", "status", "hint", "label", "code", "nextAction", "gatingReason"];
    const keys = [
      ...preferredKeys.filter((key) => Object.prototype.hasOwnProperty.call(value, key)),
      ...Object.keys(value).filter((key) => !preferredKeys.includes(key)),
    ];
    const collected = [];
    for (const key of keys) {
      collected.push(...collectTextFragments(value[key], workspaceRoot, depth + 1));
      if (collected.length >= 8) break;
    }
    return collected.slice(0, 8);
  }
  return [];
}

function coerceSummaryText(value, workspaceRoot, fallback = "") {
  const [first] = collectTextFragments(value, workspaceRoot, 0);
  return first || fallback;
}

function coerceSummaryList(values, workspaceRoot, limit = 8) {
  return uniqueStrings(collectTextFragments(values, workspaceRoot, 0), limit, 220);
}

function normalizePublicPath(workspaceRoot, rawPath) {
  const text = safeString(rawPath, 400);
  if (!text) return "";
  try {
    const resolved = path.isAbsolute(text) ? path.normalize(text) : path.resolve(workspaceRoot, text);
    const workspaceResolved = path.resolve(workspaceRoot);
    if (resolved.toLowerCase().startsWith(workspaceResolved.toLowerCase())) {
      return repoRelative(workspaceRoot, resolved);
    }
    return `<external>/${path.basename(resolved)}`;
  } catch {
    return normalizePublicText(text, workspaceRoot);
  }
}

function sanitizePublicValue(value, workspaceRoot) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePublicValue(entry, workspaceRoot));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "workspaceRoot") {
        out.workspace = ".";
        continue;
      }
      if (/path$/i.test(key) || /paths$/i.test(key)) {
        out[key] = Array.isArray(entry)
          ? entry.map((item) => normalizePublicPath(workspaceRoot, item))
          : normalizePublicPath(workspaceRoot, entry);
        continue;
      }
      if (/turnId$/i.test(key) || /threadId$/i.test(key) || /memoryId$/i.test(key) || /sampleTurnIds$/i.test(key)) {
        out[key] = Array.isArray(entry)
          ? entry.map((item) => maskOpaqueId(item, key.toLowerCase().includes("turn") ? "turn" : key.toLowerCase().includes("thread") ? "thread" : "mem"))
          : maskOpaqueId(entry, key.toLowerCase().includes("turn") ? "turn" : key.toLowerCase().includes("thread") ? "thread" : "mem");
        continue;
      }
      out[key] = sanitizePublicValue(entry, workspaceRoot);
    }
    return out;
  }
  if (typeof value === "string") {
    return normalizePublicText(value, workspaceRoot);
  }
  return value;
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
  const publicOutputRoot = path.join(workspaceRoot, "output", "memory_public");
  const agiReadinessRoot = path.join(workspaceRoot, "output", "agi_readiness");
  const continuityPublicRoot = path.join(workspaceRoot, "output", "continuity_public");
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
      observationStateRoot: path.join(projectionsRoot, "observation_state"),
      continuityStateRoot: path.join(projectionsRoot, "continuity_state"),
      familyCoverageRoot: path.join(projectionsRoot, "family_coverage"),
      readinessRoot: path.join(projectionsRoot, "readiness"),
      bottlenecksRoot: path.join(projectionsRoot, "bottlenecks"),
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
    publicOutput: {
      root: publicOutputRoot,
      latestOverviewJson: path.join(publicOutputRoot, "latest_overview.json"),
      latestOverviewMd: path.join(publicOutputRoot, "latest_overview.md"),
      workspaceProgressJson: path.join(publicOutputRoot, "workspace_progress_public.json"),
      latestPackJson: path.join(publicOutputRoot, "latest_pack_public.json"),
      promotionHealthJson: path.join(publicOutputRoot, "promotion_revocation_health_public.json"),
      memoryEvalStatusJson: path.join(publicOutputRoot, "memory_eval_public_status.json"),
      memoryEvalStatusMd: path.join(publicOutputRoot, "memory_eval_public_status.md"),
      openAIBlogLaneJson: path.join(publicOutputRoot, "openai_primary_lane_projection.json"),
      anthropicLaneJson: path.join(publicOutputRoot, "anthropic_secondary_lane_projection.json"),
      exportManifestJson: path.join(publicOutputRoot, "export_manifest.json"),
    },
    agiReadiness: {
      root: agiReadinessRoot,
      latestJson: path.join(agiReadinessRoot, "latest_readiness.json"),
      latestMd: path.join(agiReadinessRoot, "latest_readiness.md"),
      domainCoverageMatrixJson: path.join(agiReadinessRoot, "domain_coverage_matrix.json"),
      promotionTrendJson: path.join(agiReadinessRoot, "promotion_trend.json"),
      blockedReasonsJson: path.join(agiReadinessRoot, "blocked_reasons.json"),
      nextBottlenecksJson: path.join(agiReadinessRoot, "next_bottlenecks.json"),
      nextBottlenecksMd: path.join(agiReadinessRoot, "next_bottlenecks.md"),
    },
    continuityPublic: {
      root: continuityPublicRoot,
      latestSummaryJson: path.join(continuityPublicRoot, "latest_continuity.json"),
      latestSummaryMd: path.join(continuityPublicRoot, "latest_continuity.md"),
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
    paths.projections.observationStateRoot,
    paths.projections.continuityStateRoot,
    paths.projections.familyCoverageRoot,
    paths.projections.readinessRoot,
    paths.projections.bottlenecksRoot,
    paths.retrieval.root,
    paths.output.root,
    paths.agiReadiness.root,
    paths.continuityPublic.root,
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

function loadTaskFamilyProfiles(workspaceRoot) {
  const payload = loadConfigJson(workspaceRoot, "scripts", "config", "task_family_profiles.json");
  const families = Array.isArray(payload.families) ? payload.families : [];
  const byId = {};
  for (const entry of families) {
    const id = safeString(entry && entry.id, 80);
    if (!id) continue;
    byId[id] = entry;
  }
  return {
    defaultFamily: safeString(payload.defaultFamily, 80) || "deterministic_code",
    families,
    byId,
  };
}

function loadObservationPolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "governed_observation_policy.json");
}

function loadAgiReadinessPolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "agi_readiness_live_policy.json");
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
  const itemTypeById = new Map((Array.isArray(items) ? items : []).map((item) => [safeString(item && item.memoryId, 120), safeString(item && item.type, 80)]));
  const resolveMemoryType = (entry) => {
    const explicit = safeString(entry && entry.memoryType, 80) || safeString(entry && entry.type, 80);
    if (explicit) return explicit;
    const memoryId = safeString(entry && entry.memoryId, 120);
    return itemTypeById.get(memoryId) || "unknown";
  };
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
      memoryType: resolveMemoryType(entry),
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
      memoryType: resolveMemoryType(entry),
      status: safeString(entry && entry.status, 40) || safeString(entry && entry.eventType, 80),
      recordedAt: safeString(entry && entry.recordedAt, 80),
    }));
  return {
    staleMemoryWarnings,
    recentPromotions,
    recentRevocations,
  };
}

function summarizePack(pack, thresholds = {}) {
  const items = Array.isArray(pack && pack.items) ? pack.items : [];
  const highConfidenceScore = safeNumber(thresholds.highConfidenceScore, 0.68);
  const selectedMemoryIds = Array.isArray(pack && pack.selectedMemoryIds)
    ? pack.selectedMemoryIds.slice(0, 24)
    : items.map((entry) => safeString(entry && entry.memoryId, 120)).filter(Boolean).slice(0, 24);
  const sectionCounts = pack && pack.sectionCounts && typeof pack.sectionCounts === "object"
    ? pack.sectionCounts
    : items.reduce((acc, entry) => {
      const section = classifyMemorySection(entry);
      acc[section] = safeNumber(acc[section], 0) + 1;
      return acc;
    }, {});
  return {
    packId: safeString(pack && pack.packId, 120),
    generatedAt: safeString(pack && (pack.generatedAt || pack.compiledAt), 80),
    compiledAt: safeString(pack && pack.compiledAt, 80),
    selectedCount: clampInt(pack && (pack.selectedCount || items.length), 0, 999999, items.length),
    highConfidenceCount: Number.isFinite(Number(pack && pack.highConfidenceCount))
      ? clampInt(pack.highConfidenceCount, 0, 999999, 0)
      : items.filter((entry) => safeNumber(entry && entry.score, 0) >= highConfidenceScore).length,
    reusedSelectedCount: clampInt(pack && pack.reusedSelectedCount, 0, 999999, 0),
    explicitTaskFamilyMismatchCount: clampInt(pack && pack.explicitTaskFamilyMismatchCount, 0, 999999, 0),
    sectionCounts,
    activeAgent: safeString(pack && pack.activeAgent, 80),
    taskFamily: safeString(pack && pack.taskFamily, 80),
    memoryIds: selectedMemoryIds,
  };
}

function buildPersistedItemsFromCanonicalStore(workspaceRoot, paths) {
  const workspaceId = toWorkspaceId(workspaceRoot);
  const byId = readJsonObject(paths.indexes.byId);
  const byTaskFamily = readJsonObject(paths.indexes.byTaskFamily);
  const byAgent = readJsonObject(paths.indexes.byAgent);
  const collectKeysForMemoryId = (indexMap, memoryId) => Object.entries(indexMap || {})
    .filter(([, ids]) => Array.isArray(ids) && ids.includes(memoryId))
    .map(([key]) => safeString(key, 80))
    .filter(Boolean);
  const items = Object.entries(byId).map(([memoryId, meta]) => ({
    memoryId,
    type: safeString(meta && meta.type, 80),
    status: safeString(meta && meta.status, 40),
    sourceTier: safeString(meta && meta.sourceTier, 40),
    authorityTier: clampInt(meta && meta.authorityTier, 0, 6, 0),
    scope: meta && meta.scope && typeof meta.scope === "object"
      ? {
        workspaceId: safeString(meta.scope.workspaceId, 120) || workspaceId,
        threadId: safeString(meta.scope.threadId, 120),
        taskFamilies: uniqueStrings(meta.scope.taskFamilies, 16, 80).length
          ? uniqueStrings(meta.scope.taskFamilies, 16, 80)
          : collectKeysForMemoryId(byTaskFamily, memoryId),
        agents: uniqueStrings(meta.scope.agents, 16, 80).length
          ? uniqueStrings(meta.scope.agents, 16, 80)
          : collectKeysForMemoryId(byAgent, memoryId),
        ownedPaths: uniqueStrings(meta.scope.ownedPaths, 24, 220),
      }
      : {
        workspaceId,
        taskFamilies: collectKeysForMemoryId(byTaskFamily, memoryId),
        agents: collectKeysForMemoryId(byAgent, memoryId),
        ownedPaths: [],
      },
    content: {
      summary: safeString(meta && meta.summary, 400),
      structured: meta && meta.structured && typeof meta.structured === "object" ? meta.structured : {},
    },
    evidence: {
      sourceRefs: uniqueStrings(meta && meta.sourceRefs, 16, 220),
      supportCount: clampInt(meta && meta.supportCount, 0, 9999, 1),
      confidence: Number(safeNumber(meta && meta.confidence, 0).toFixed(3)),
    },
    retrieval: meta && meta.retrieval && typeof meta.retrieval === "object" ? meta.retrieval : {},
    lifecycle: {
      createdAt: safeString(meta && meta.createdAt, 80),
      updatedAt: safeString(meta && meta.updatedAt, 80),
    },
  }));
  const workspaceProgressStructured = readJsonObject(path.join(paths.projections.workspaceProgressRoot, `${workspaceId}.json`));
  if (Object.keys(workspaceProgressStructured).length) {
    items.push({
      memoryId: `workspace:${workspaceId}:progress`,
      type: "workspace_progress",
      status: "promoted",
      sourceTier: "runtime",
      authorityTier: 3,
      lifecycle: {
        updatedAt: safeString(workspaceProgressStructured.updatedAt, 80),
      },
      content: { structured: workspaceProgressStructured },
    });
  }
  return items;
}

function normalizePersistedPackForPublic({ pack, items, workspaceRoot }) {
  const retrievalPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json");
  const thresholds = retrievalPolicy && retrievalPolicy.scoreThresholds && typeof retrievalPolicy.scoreThresholds === "object"
    ? retrievalPolicy.scoreThresholds
    : {};
  const isolationPolicy = getTaskFamilyIsolationPolicy(retrievalPolicy);
  const hardExcludeTypes = uniqueStrings(isolationPolicy.hardExcludeTypes, 16, 80);
  const minimumSelectionScore = safeNumber(thresholds.minimumSelectionScore, 0.18);
  const highConfidenceScore = safeNumber(thresholds.highConfidenceScore, 0.68);
  const byId = new Map((Array.isArray(items) ? items : []).map((item) => [safeString(item && item.memoryId, 120), item]));
  const rawItems = Array.isArray(pack && pack.items) ? pack.items : [];
  const normalizedItems = rawItems
    .map((entry) => {
      const memoryId = safeString(entry && entry.memoryId, 120);
      const persisted = byId.get(memoryId);
      const taskFamilies = uniqueStrings(
        (entry && entry.whyIncluded && entry.whyIncluded.taskFamilies) || (persisted && persisted.scope && persisted.scope.taskFamilies),
        8,
        80
      );
      const mismatch = taskFamilies.length
        && !taskFamilies.includes("all")
        && !taskFamilies.includes("default")
        && !taskFamilies.includes(safeString(pack && pack.taskFamily, 80) || "default");
      return {
        ...entry,
        whyIncluded: {
          ...(entry && entry.whyIncluded && typeof entry.whyIncluded === "object" ? entry.whyIncluded : {}),
          taskFamilies,
          explicitTaskFamilyMismatch: mismatch,
        },
        status: safeString(entry && entry.status, 40) || safeString(persisted && persisted.status, 40),
        type: safeString(entry && entry.type, 80) || safeString(persisted && persisted.type, 80),
      };
    })
    .filter((entry) => {
      if (!entry || !safeString(entry.memoryId, 120)) return false;
      if (["revoked", "expired", "blocked"].includes(safeString(entry.status, 40))) return false;
      if (safeNumber(entry.score, 0) < minimumSelectionScore) return false;
      if (Boolean(entry.whyIncluded && entry.whyIncluded.explicitTaskFamilyMismatch)
        && hardExcludeTypes.includes(safeString(entry.type, 80))) {
        return false;
      }
      return true;
    });
  const sectionCounts = normalizedItems.reduce((acc, entry) => {
    const section = classifyMemorySection(entry);
    acc[section] = safeNumber(acc[section], 0) + 1;
    return acc;
  }, {});
  return {
    ...pack,
    items: normalizedItems,
    selectedCount: normalizedItems.length,
    highConfidenceCount: normalizedItems.filter((entry) => safeNumber(entry && entry.score, 0) >= highConfidenceScore).length,
    reusedSelectedCount: normalizedItems.filter((entry) => byId.has(safeString(entry && entry.memoryId, 120))).length,
    explicitTaskFamilyMismatchCount: normalizedItems.filter((entry) => Boolean(entry && entry.whyIncluded && entry.whyIncluded.explicitTaskFamilyMismatch)).length,
    sectionCounts,
    selectedMemoryIds: normalizedItems.map((entry) => safeString(entry && entry.memoryId, 120)).filter(Boolean),
  };
}

function loadPersistedGovernedMemoryState({ workspaceRoot = workspaceRootDefault } = {}) {
  const paths = getMemoryPaths(workspaceRoot);
  ensureMemoryLayout(paths);
  const items = buildPersistedItemsFromCanonicalStore(workspaceRoot, paths);
  const workspaceId = toWorkspaceId(workspaceRoot);
  const lastPackByWorkspace = readJsonObject(paths.retrieval.lastPackByWorkspace);
  const packs = loadJsonl(paths.retrieval.packsPath);
  const storedPack = lastPackByWorkspace[workspaceId] && typeof lastPackByWorkspace[workspaceId] === "object"
    ? lastPackByWorkspace[workspaceId]
    : (packs.length ? packs[packs.length - 1] : {});
  const pack = normalizePersistedPackForPublic({ pack: storedPack, items, workspaceRoot });
  const retentionPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retention_policy.json");
  const retrievalPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json");
  const workspaceProgressItem = items.find((item) => item.type === "workspace_progress" && item.content && item.content.structured && Object.keys(item.content.structured).length)
    || items.find((item) => item.type === "workspace_progress");
  const typeCounts = {};
  const statusCounts = {};
  for (const item of items) {
    typeCounts[item.type] = safeNumber(typeCounts[item.type], 0) + 1;
    statusCounts[item.status] = safeNumber(statusCounts[item.status], 0) + 1;
  }
  const health = collectMemoryHealth({ items, paths, retentionPolicy, currentEvents: [] });
  return {
    paths,
    items,
    pack,
    workspaceProgressItem,
    summary: {
      enabled: true,
      schema: "governed-memory-graph-runtime.v1",
      status: "ready",
      workspaceId,
      canonicalRoot: repoRelative(workspaceRoot, paths.root),
      eventLogPath: repoRelative(workspaceRoot, paths.eventsPath),
      outputRoot: repoRelative(workspaceRoot, paths.output.root),
      publicOutputRoot: repoRelative(workspaceRoot, paths.publicOutput.root),
      canonicalEventCount: loadJsonl(paths.eventsPath).length,
      itemCount: items.length,
      promotedCount: items.filter((item) => ["promoted", "reinforced"].includes(safeString(item.status, 40))).length,
      typeCounts,
      statusCounts,
      staleMemoryWarnings: health.staleMemoryWarnings,
      recentPromotions: health.recentPromotions,
      recentRevocations: health.recentRevocations,
      workspaceProgress: workspaceProgressItem && workspaceProgressItem.content && workspaceProgressItem.content.structured
        ? workspaceProgressItem.content.structured
        : {},
      workspaceProgressUpdatedAt: safeString(workspaceProgressItem && workspaceProgressItem.lifecycle && workspaceProgressItem.lifecycle.updatedAt, 80),
      latestPack: summarizePack(pack, retrievalPolicy && retrievalPolicy.scoreThresholds),
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
    },
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

function buildWorkspaceProgressItem({ workspaceRoot, runtime, traceability, executionOverview, continuityBridge = null }) {
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
  const continuitySummary = continuityBridge && continuityBridge.summary && typeof continuityBridge.summary === "object"
    ? continuityBridge.summary
    : {};
  const continuityProgress = continuitySummary.workspaceProgress && typeof continuitySummary.workspaceProgress === "object"
    ? continuitySummary.workspaceProgress
    : {};
  const continuityUpdatedAt = safeString(continuitySummary.updatedAt, 80);
  const currentObjective = coerceSummaryText(
    continuityProgress.currentObjective || latestTurn.summary || latestTurn.title || humanizeCompactIdentifier(latestTurn.task_outcome_reason),
    workspaceRoot,
    "Continue the active governed harness objective."
  );
  const currentMilestones = uniqueStrings([
    ...(Array.isArray(continuityProgress.currentMilestones) ? continuityProgress.currentMilestones : []),
    safeString(latestTurn.status, 80) && `latest turn status: ${humanizeCompactIdentifier(safeString(latestTurn.status, 80))}`,
    safeString(familyGate.status, 80) && `family gate: ${humanizeCompactIdentifier(safeString(familyGate.status, 80))}`,
  ].filter(Boolean), 8, 160);
  const knownBlockers = uniqueStrings([
    ...(Array.isArray(continuityProgress.knownBlockers) ? continuityProgress.knownBlockers : []),
    ...((Array.isArray(familyGate.missingHard) ? familyGate.missingHard : [])
      .map((entry) => coerceSummaryText(entry && (entry.label || entry.reason || entry), workspaceRoot))
      .filter(Boolean)),
  ], 8, 180);
  const knownRisks = coerceSummaryList([
    ...(Array.isArray(continuityProgress.knownRisks) ? continuityProgress.knownRisks : []),
    latestFailure && humanizeCompactIdentifier(latestFailure.taskOutcomeReason),
    traceability && traceability.summary,
  ], workspaceRoot, 8);
  const recentTouchedPaths = uniqueStrings([
    ...(Array.isArray(continuityProgress.recentTouchedPaths) ? continuityProgress.recentTouchedPaths : []),
    ...(Array.isArray(traceability && traceability.changedPaths) ? traceability.changedPaths : []),
  ], 24, 220);
  const nextRecommendedActions = uniqueStrings([
    ...(Array.isArray(continuityProgress.nextRecommendedActions) ? continuityProgress.nextRecommendedActions : []),
    safeString(familyGate.status, 80) === "failed_validation" ? "Recover the latest failed validation before adding new scope." : "",
    safeString(latestTurn.task_outcome_status, 80).toUpperCase() === "FAILED_VALIDATION" ? "Treat missing evidence as a release blocker and regenerate the required proof." : "",
  ], 6, 220);
  const lastSuccessfulValidation = Array.isArray(continuityProgress.lastSuccessfulValidation) && continuityProgress.lastSuccessfulValidation.length
    ? continuityProgress.lastSuccessfulValidation
    : (latestSuccess ? [{
      turnId: safeString(latestSuccess.turnId, 120),
      taskOutcomeStatus: safeString(latestSuccess.taskOutcomeStatus, 80),
      completedAt: safeString(latestSuccess.completedAt, 80),
    }] : []);
  const lastFailedValidation = Array.isArray(continuityProgress.lastFailedValidation) && continuityProgress.lastFailedValidation.length
    ? continuityProgress.lastFailedValidation
    : (latestFailure ? [{
      turnId: safeString(latestFailure.turnId, 120),
      taskOutcomeStatus: safeString(latestFailure.taskOutcomeStatus, 80),
      reason: coerceSummaryText(humanizeCompactIdentifier(latestFailure.taskOutcomeReason), workspaceRoot),
      completedAt: safeString(latestFailure.completedAt, 80),
    }] : []);
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
      currentObjective,
      currentMilestones,
      knownBlockers,
      knownRisks,
      lastSuccessfulValidation,
      lastFailedValidation,
      recentTouchedPaths,
      nextRecommendedActions,
      updatedAt: continuityUpdatedAt || toIso(),
    },
    evidence: {
      sourceRefs: uniqueStrings([
        safeString(traceability && traceability.operatorSummaryPath, 220),
        safeString(traceability && traceability.manifestPath, 220),
        continuitySummary && continuitySummary.sourcePath,
      ], 8, 220),
      supportCount: clampInt((continuitySummary && continuitySummary.taskCount ? 1 : 0) + 2, 2, 8, 2),
      confidence: 0.88,
      lastValidatedAt: continuityUpdatedAt || toIso(),
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
      summary: `${safeString(entry && entry.executionProfile, 80) || "runtime"} episode finished as ${taskOutcomeStatus}.`,
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
  const primaryState = readJsonObject(path.join(workspaceRoot, "output", "openai_blog_self_improvement_state.json"));
  const secondaryState = readJsonObject(path.join(workspaceRoot, "output", "anthropic_engineering_self_improvement_state.json"));
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
  for (const entry of Array.isArray(primaryState.appliedHints) ? primaryState.appliedHints.slice(0, 8) : []) {
    const hint = entry && entry.runtimeRetrievalHint && typeof entry.runtimeRetrievalHint === "object" ? entry.runtimeRetrievalHint : {};
    items.push(buildBaseItem({
      memoryId: `hint:openai:${safeString(hint.hintId, 160) || stableHash(entry).slice(0, 12)}`,
      type: "runtime_hint",
      status: "promoted",
      authorityTier: 5,
      sourceTier: "external_primary",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(hint.appliesToTaskFamilies, 8, 80),
        agents: uniqueStrings(hint.appliesToAgents, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(entry && entry.title, 320) || safeString(hint.hintId, 200) || "Primary runtime hint.",
      structured: {
        ...entry,
        runtimeRetrievalHint: hint,
      },
      evidence: {
        sourceRefs: uniqueStrings([
          "output/openai_blog_self_improvement_state.json",
          safeString(external.ledgerPath, 220),
          safeString(external.digestPath, 220),
        ], 4, 220),
        supportCount: 2,
        confidence: 0.88,
        lastValidatedAt: safeString(primaryState.generatedAt, 80) || toIso(),
      },
      retrieval: {
        topics: uniqueStrings(hint.topics, 8, 80),
        lexicalTriggers: uniqueStrings(hint.lexicalTriggers, 12, 80),
        priority: clampInt(70 + safeNumber(hint.articleBoost, 0), 0, 100, 70),
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
  for (const entry of Array.isArray(secondaryState.appliedHints) ? secondaryState.appliedHints.slice(0, 8) : []) {
    const hint = entry && entry.runtimeRetrievalHint && typeof entry.runtimeRetrievalHint === "object" ? entry.runtimeRetrievalHint : {};
    items.push(buildBaseItem({
      memoryId: `hint:anthropic:${safeString(hint.hintId, 160) || stableHash(entry).slice(0, 12)}`,
      type: "runtime_hint",
      status: "shadow",
      authorityTier: 5,
      sourceTier: "external_secondary",
      scope: {
        workspaceId,
        taskFamilies: uniqueStrings(hint.appliesToTaskFamilies, 8, 80),
        agents: uniqueStrings(hint.appliesToAgents, 8, 80),
        ownedPaths: [],
      },
      summary: safeString(entry && entry.title, 320) || safeString(hint.hintId, 200) || "Secondary runtime hint.",
      structured: {
        ...entry,
        runtimeRetrievalHint: hint,
      },
      evidence: {
        sourceRefs: uniqueStrings([
          "output/anthropic_engineering_self_improvement_state.json",
          safeString(secondary.curatedDocPath, 220),
        ], 4, 220),
        supportCount: 1,
        confidence: 0.66,
        lastValidatedAt: safeString(secondaryState.generatedAt, 80) || toIso(),
      },
      retrieval: {
        topics: uniqueStrings(hint.topics, 8, 80),
        lexicalTriggers: uniqueStrings(hint.lexicalTriggers, 12, 80),
        negativeTriggers: ["override", "constitution"],
        priority: clampInt(46 + safeNumber(hint.articleBoost, 0), 0, 100, 46),
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

function normalizeTaskFamilyId(taskFamily, readinessPolicy) {
  const normalized = safeString(taskFamily, 80).toLowerCase();
  if (!normalized) return "";
  const buckets = Array.isArray(readinessPolicy && readinessPolicy.coverageBuckets) ? readinessPolicy.coverageBuckets : [];
  for (const bucket of buckets) {
    const aliases = uniqueStrings(bucket && bucket.aliases, 16, 80).map((entry) => entry.toLowerCase());
    if (safeString(bucket && bucket.id, 80).toLowerCase() === normalized || aliases.includes(normalized)) {
      return safeString(bucket && bucket.id, 80);
    }
  }
  return normalized;
}

function memoryAppliesToTaskFamily(item, taskFamily, readinessPolicy = null) {
  const normalizedTaskFamily = normalizeTaskFamilyId(taskFamily, readinessPolicy) || safeString(taskFamily, 80);
  const taskFamilies = uniqueStrings(item && item.scope && item.scope.taskFamilies, 16, 80);
  if (!taskFamilies.length || taskFamilies.includes("all") || taskFamilies.includes("default")) return true;
  return taskFamilies.some((entry) => normalizeTaskFamilyId(entry, readinessPolicy) === normalizedTaskFamily);
}

function memoryAppliesToAgent(item, agentRole) {
  const normalizedAgent = safeString(agentRole, 80) || "default";
  const agents = uniqueStrings(item && item.scope && item.scope.agents, 16, 80);
  if (!agents.length || agents.includes("all") || agents.includes("default")) return true;
  return agents.includes(normalizedAgent);
}

function normalizeContinuityLifecycleState(value) {
  const normalized = safeString(value, 80).toLowerCase();
  if (["planned", "running", "blocked", "verifier_failed", "completed", "archived", "abandoned"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "failed_validation") return "verifier_failed";
  if (normalized === "complete") return "completed";
  return normalized || "planned";
}

function buildContinuityBridge({ workspaceRoot }) {
  let policy;
  try {
    policy = loadContinuityPolicy(undefined, { workspaceRoot });
  } catch {
    return {
      policy: null,
      sourcePath: "",
      tasks: [],
      summary: {
        generatedAt: toIso(),
        updatedAt: "",
        taskCount: 0,
        activeTaskCount: 0,
        blockedSubtaskCount: 0,
        verifierFailedSubtaskCount: 0,
        integrationPendingCount: 0,
        handoffCount: 0,
        finalReleaseState: "unknown",
        workspaceProgress: {},
        horizon: {},
      },
    };
  }
  const registry = readJsonObject(policy.registryPath);
  const rows = Array.isArray(registry.tasks) ? registry.tasks : [];
  const tasks = rows.map((row) => {
    const taskId = safeString(row && row.taskId, 120);
    const paths = buildTaskPaths({ workspaceRoot, policy, taskId });
    const taskState = readJsonObject(paths.taskStatePath);
    const planState = readJsonObject(paths.planStatePath);
    const verifierState = readJsonObject(paths.verifierStatePath);
    const closeoutSummary = readJsonObject(paths.closeoutSummaryPath);
    const integrationSummary = readJsonObject(paths.integrationSummaryPath);
    const agentGraph = readJsonObject(paths.agentGraphPath);
    const lifecycleEvents = loadJsonl(paths.lifecycleLogPath);
    const familyId = safeString(
      taskState.familyId
      || taskState.taskFamily
      || taskState.family
      || planState.taskFamily
      || closeoutSummary.taskFamily
      || row.familyId,
      80
    ) || "workflow_execution";
    const lifecycleState = normalizeContinuityLifecycleState(
      row && row.lifecycleState
      || taskState.lifecycleState
      || closeoutSummary.lifecycleState
      || integrationSummary.lifecycleState
      || row && row.status
    );
    const stepCount = Array.isArray(planState.steps) ? planState.steps.length : clampInt(planState.stepCount, 0, 9999, 0);
    const subgoalCount = Array.isArray(taskState.subgoals) ? taskState.subgoals.length : clampInt(taskState.subgoalCount || stepCount, 0, 9999, stepCount);
    const verifierCheckpointCount =
      (Array.isArray(verifierState.checkpoints) ? verifierState.checkpoints.length : 0)
      + (Array.isArray(verifierState.verificationHistory) ? verifierState.verificationHistory.length : 0)
      + (Array.isArray(verifierState.verifierHistory) ? verifierState.verifierHistory.length : 0);
    const replanCount =
      clampInt(planState.replanCount, 0, 9999, 0)
      || lifecycleEvents.filter((entry) => /replan/i.test(safeString(entry && (entry.eventType || entry.status || entry.phase), 120))).length;
    const touchedPaths = uniqueStrings([
      ...(Array.isArray(closeoutSummary.recentTouchedPaths) ? closeoutSummary.recentTouchedPaths : []),
      ...(Array.isArray(integrationSummary.changedPaths) ? integrationSummary.changedPaths : []),
      ...(Array.isArray(taskState.recentTouchedPaths) ? taskState.recentTouchedPaths : []),
    ], 24, 220);
    const nextActions = uniqueStrings([
      ...(Array.isArray(closeoutSummary.nextRecommendedActions) ? closeoutSummary.nextRecommendedActions : []),
      ...(Array.isArray(integrationSummary.nextRecommendedActions) ? integrationSummary.nextRecommendedActions : []),
      ...(Array.isArray(taskState.nextRecommendedActions) ? taskState.nextRecommendedActions : []),
    ], 12, 220);
    const blockers = uniqueStrings([
      ...(Array.isArray(row && row.blockers) ? row.blockers : []),
      ...(Array.isArray(taskState.blockers) ? taskState.blockers : []),
      ...(Array.isArray(verifierState.blockers) ? verifierState.blockers : []),
      ...(Array.isArray(closeoutSummary.knownBlockers) ? closeoutSummary.knownBlockers : []),
    ], 12, 220);
    const risks = uniqueStrings([
      ...(Array.isArray(taskState.knownRisks) ? taskState.knownRisks : []),
      ...(Array.isArray(closeoutSummary.knownRisks) ? closeoutSummary.knownRisks : []),
      ...(Array.isArray(integrationSummary.knownRisks) ? integrationSummary.knownRisks : []),
    ], 12, 220);
    const updatedAt = safeString(
      closeoutSummary.updatedAt
      || integrationSummary.updatedAt
      || verifierState.updatedAt
      || planState.updatedAt
      || taskState.updatedAt
      || row && row.updatedAt,
      80
    ) || toIso();
    const lastSuccessfulValidation = [];
    if (safeString(row && row.lastVerifierVerdict, 40).toUpperCase() === "PASS" || safeString(verifierState.lastVerifierVerdict, 40).toUpperCase() === "PASS") {
      lastSuccessfulValidation.push({
        taskId,
        verdict: "PASS",
        completedAt: safeString(verifierState.updatedAt || closeoutSummary.updatedAt || updatedAt, 80),
      });
    }
    const lastFailedValidation = [];
    if (safeString(row && row.lastVerifierVerdict, 40).toUpperCase() === "FAIL" || safeString(verifierState.lastVerifierVerdict, 40).toUpperCase() === "FAIL" || lifecycleState === "verifier_failed") {
      lastFailedValidation.push({
        taskId,
        verdict: "FAIL",
        reason: coerceSummaryText(verifierState.reason || closeoutSummary.reason || blockers, workspaceRoot, "verifier failed"),
        completedAt: safeString(verifierState.updatedAt || updatedAt, 80),
      });
    }
    return {
      taskId,
      title: safeString(row && row.title, 220) || safeString(taskState.title, 220),
      familyId,
      normalizedFamilyId: normalizeTaskFamilyId(familyId, loadAgiReadinessPolicy(workspaceRoot)) || familyId,
      lifecycleState,
      role: safeString(row && row.role, 80) || safeString(taskState.role, 80) || "default",
      parentTaskId: safeString(row && row.parentTaskId, 120),
      rootTaskId: safeString(row && row.rootTaskId, 120) || taskId,
      stepCount,
      subgoalCount,
      verifierCheckpointCount,
      replanCount,
      integrationStatus: safeString(row && row.integrationStatus, 80) || safeString(integrationSummary.status, 80) || "unknown",
      lastVerifierVerdict: safeString(row && row.lastVerifierVerdict, 40) || safeString(verifierState.lastVerifierVerdict, 40),
      blockers,
      risks,
      recentTouchedPaths: touchedPaths,
      nextRecommendedActions: nextActions,
      lastSuccessfulValidation,
      lastFailedValidation,
      updatedAt,
      closeoutOutcome: safeString(closeoutSummary.outcome || closeoutSummary.status, 80),
      finalReleaseState: safeString(closeoutSummary.finalReleaseState || closeoutSummary.releaseState || integrationSummary.finalReleaseState || integrationSummary.releaseState, 80),
      evidenceRefs: uniqueStrings([
        fs.existsSync(paths.closeoutSummaryPath) ? repoRelative(workspaceRoot, paths.closeoutSummaryPath) : "",
        fs.existsSync(paths.verifierStatePath) ? repoRelative(workspaceRoot, paths.verifierStatePath) : "",
        fs.existsSync(paths.integrationSummaryPath) ? repoRelative(workspaceRoot, paths.integrationSummaryPath) : "",
        fs.existsSync(paths.taskStatePath) ? repoRelative(workspaceRoot, paths.taskStatePath) : "",
      ], 8, 220),
      agentTree: agentGraph && Object.keys(agentGraph).length ? agentGraph : null,
    };
  }).sort((left, right) => parseTimestamp(right && right.updatedAt) - parseTimestamp(left && left.updatedAt));

  const latestRootTask = tasks.find((task) => !safeString(task && task.parentTaskId, 120)) || tasks[0] || null;
  const summary = {
    generatedAt: toIso(),
    updatedAt: latestRootTask ? safeString(latestRootTask.updatedAt, 80) : "",
    sourcePath: repoRelative(workspaceRoot, policy.registryPath),
    taskCount: tasks.length,
    activeTaskCount: tasks.filter((task) => !["completed", "archived", "abandoned"].includes(task.lifecycleState)).length,
    blockedSubtaskCount: tasks.filter((task) => safeString(task.parentTaskId, 120) && task.lifecycleState === "blocked").length,
    verifierFailedSubtaskCount: tasks.filter((task) => safeString(task.parentTaskId, 120) && task.lifecycleState === "verifier_failed").length,
    integrationPendingCount: tasks.filter((task) => !["integrated", "complete", "completed", "released"].includes(safeString(task.integrationStatus, 80).toLowerCase())).length,
    handoffCount: tasks.filter((task) => safeString(task.parentTaskId, 120)).length,
    finalReleaseState: safeString(latestRootTask && latestRootTask.finalReleaseState, 80) || "unknown",
    activeAgentTree: latestRootTask && latestRootTask.agentTree ? latestRootTask.agentTree : {},
    workspaceProgress: {
      currentObjective: coerceSummaryText(
        latestRootTask && (latestRootTask.title || latestRootTask.closeoutOutcome || latestRootTask.finalReleaseState),
        workspaceRoot,
        "Continue the active continuity objective."
      ),
      currentMilestones: uniqueStrings(tasks.slice(0, 4).map((task) => `${humanizeCompactIdentifier(task.lifecycleState)}: ${safeString(task.title, 120) || task.taskId}`), 8, 180),
      knownBlockers: uniqueStrings(tasks.flatMap((task) => task.blockers || []), 12, 220),
      knownRisks: uniqueStrings(tasks.flatMap((task) => task.risks || []), 12, 220),
      recentTouchedPaths: uniqueStrings(tasks.flatMap((task) => task.recentTouchedPaths || []), 24, 220),
      nextRecommendedActions: uniqueStrings(tasks.flatMap((task) => task.nextRecommendedActions || []), 12, 220),
      lastSuccessfulValidation: tasks.flatMap((task) => task.lastSuccessfulValidation || []).slice(0, 4),
      lastFailedValidation: tasks.flatMap((task) => task.lastFailedValidation || []).slice(0, 4),
    },
    horizon: {
      activeTaskId: safeString(latestRootTask && latestRootTask.taskId, 120),
      stepCount: clampInt(latestRootTask && latestRootTask.stepCount, 0, 99999, 0),
      subgoalCount: clampInt(latestRootTask && latestRootTask.subgoalCount, 0, 99999, 0),
      verifierCheckpointCount: clampInt(latestRootTask && latestRootTask.verifierCheckpointCount, 0, 99999, 0),
      replanCount: clampInt(latestRootTask && latestRootTask.replanCount, 0, 99999, 0),
      closureOutcome: safeString(latestRootTask && (latestRootTask.closeoutOutcome || latestRootTask.lifecycleState), 80),
    },
  };
  return {
    policy,
    sourcePath: repoRelative(workspaceRoot, policy.registryPath),
    tasks,
    summary,
  };
}

function deriveObservationOutcome(status, policy) {
  const normalizedStatus = safeString(status, 80).toUpperCase();
  const mapped = policy && policy.outcomeMap && typeof policy.outcomeMap === "object"
    ? safeString(policy.outcomeMap[normalizedStatus], 40)
    : "";
  return mapped || safeString(policy && policy.defaultOutcome, 40) || "not_applicable";
}

function buildObservationEvents({ workspaceRoot, runtime, traceability, pack, items, paths, continuityBridge }) {
  const policy = loadObservationPolicy(workspaceRoot);
  const eligibleTypes = new Set(uniqueStrings(
    (policy && (policy.eligibleMemoryTypes || policy.eligibleTypes)) || [],
    12,
    80
  ));
  const workspaceId = toWorkspaceId(workspaceRoot);
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object" ? runtime.latestTurn : {};
  const taskFamily = safeString(pack && pack.taskFamily, 80)
    || safeString(latestTurn.family_completion_gate && latestTurn.family_completion_gate.taskFamily, 80)
    || "default";
  const agentRole = safeString(pack && pack.activeAgent, 80) || safeString(latestTurn.agent_name, 80) || "default";
  const existingEvents = loadJsonl(paths.eventsPath);
  const existingKeys = new Set(existingEvents
    .filter((entry) => safeString(entry && entry.eventType, 80) === "memory_observation_recorded")
    .map((entry) => safeString(entry && entry.observationKey, 240))
    .filter(Boolean));
  const itemById = new Map((Array.isArray(items) ? items : []).map((item) => [safeString(item && item.memoryId, 120), item]));
  const recorded = [];
  const rejected = [];
  const nowIso = toIso();
  const requireEvidenceRefs = policy && Object.prototype.hasOwnProperty.call(policy, "requireEvidenceRefs")
    ? policy.requireEvidenceRefs !== false
    : true;
  const selectedIds = uniqueStrings(pack && pack.selectedMemoryIds, 32, 120);
  const buildObservationKey = ({ turnId = "", threadId = "", continuityTaskId = "", memoryId = "", taskFamily: family = "", agentRole: role = "" }) => {
    return stableHash({
      workspaceId,
      turnId: safeString(turnId, 120),
      threadId: safeString(threadId, 120),
      continuityTaskId: safeString(continuityTaskId, 120),
      memoryId: safeString(memoryId, 120),
      taskFamily: safeString(family, 80),
      agentRole: safeString(role, 80),
    }).slice(0, 24);
  };
  const pushRejected = ({ memoryId, item, reason, turnId = "", threadId = "", continuityTaskId = "", family = taskFamily, role = agentRole, evidenceRefs = [] }) => {
    rejected.push({
      schema: "memory-event.v1",
      eventId: stableHash({ type: "rejected", memoryId, reason, turnId, threadId, continuityTaskId, family, role }).slice(0, 20),
      eventType: "memory_observation_rejected",
      recordedAt: nowIso,
      workspaceId,
      turnId: safeString(turnId, 120),
      threadId: safeString(threadId, 120),
      continuityTaskId: safeString(continuityTaskId, 120),
      memoryId: safeString(memoryId, 120),
      memoryType: safeString(item && item.type, 80) || "unknown",
      sourceTier: safeString(item && item.sourceTier, 40) || "unknown",
      authorityTier: clampInt(item && item.authorityTier, 0, 9999, 9),
      matchedMemoryIds: [safeString(memoryId, 120)].filter(Boolean),
      taskFamily: safeString(family, 80),
      agentRole: safeString(role, 80),
      observedOutcome: "rejected",
      evidenceRefs: uniqueStrings(evidenceRefs, 8, 220),
      status: "rejected",
      reason: safeString(reason, 120),
      observationKey: buildObservationKey({ turnId, threadId, continuityTaskId, memoryId, taskFamily: family, agentRole: role }),
    });
  };
  const maybeRecord = ({ memoryId, item, turnId = "", threadId = "", continuityTaskId = "", family = taskFamily, role = agentRole, outcome = "neutral", evidenceRefs = [] }) => {
    const observationKey = buildObservationKey({ turnId, threadId, continuityTaskId, memoryId, taskFamily: family, agentRole: role });
    if (safeString(policy && policy.sameTurnDedupe, 20) !== "false" && existingKeys.has(observationKey)) {
      pushRejected({ memoryId, item, reason: "duplicate_observation", turnId, threadId, continuityTaskId, family, role, evidenceRefs });
      return;
    }
    if (requireEvidenceRefs && !uniqueStrings(evidenceRefs, 8, 220).length) {
      pushRejected({ memoryId, item, reason: "missing_evidence_refs", turnId, threadId, continuityTaskId, family, role, evidenceRefs });
      return;
    }
    existingKeys.add(observationKey);
    recorded.push({
      schema: "memory-event.v1",
      eventId: stableHash({ type: "recorded", observationKey, outcome }).slice(0, 20),
      eventType: "memory_observation_recorded",
      recordedAt: nowIso,
      workspaceId,
      turnId: safeString(turnId, 120),
      threadId: safeString(threadId, 120),
      continuityTaskId: safeString(continuityTaskId, 120),
      taskFamily: safeString(family, 80),
      agentRole: safeString(role, 80),
      memoryId: safeString(memoryId, 120),
      memoryType: safeString(item && item.type, 80) || "unknown",
      sourceTier: safeString(item && item.sourceTier, 40) || "unknown",
      authorityTier: clampInt(item && item.authorityTier, 0, 9999, 9),
      matchedMemoryIds: [safeString(memoryId, 120)].filter(Boolean),
      observedOutcome: safeString(outcome, 40) || "neutral",
      evidenceRefs: uniqueStrings(evidenceRefs, 8, 220),
      status: safeString(outcome, 40) || "neutral",
      observationKey,
    });
  };
  const baseEvidenceRefs = uniqueStrings([
    safeString(traceability && traceability.operatorSummaryPath, 220),
    safeString(traceability && traceability.manifestPath, 220),
  ], 8, 220);
  const turnOutcome = deriveObservationOutcome(safeString(latestTurn.task_outcome_status, 80), policy);
  for (const memoryId of selectedIds) {
    const item = itemById.get(memoryId);
    if (!item || !eligibleTypes.has(safeString(item.type, 80))) continue;
    if (!memoryAppliesToTaskFamily(item, taskFamily, loadAgiReadinessPolicy(workspaceRoot))) {
      pushRejected({
        memoryId,
        item,
        reason: "task_family_mismatch",
        turnId: safeString(latestTurn.turn_id || latestTurn.turnId, 120),
        threadId: safeString(latestTurn.thread_id || latestTurn.threadId, 120),
        family: taskFamily,
        role: agentRole,
        evidenceRefs: baseEvidenceRefs,
      });
      continue;
    }
    if (!memoryAppliesToAgent(item, agentRole)) continue;
    maybeRecord({
      memoryId,
      item,
      turnId: safeString(latestTurn.turn_id || latestTurn.turnId, 120),
      threadId: safeString(latestTurn.thread_id || latestTurn.threadId, 120),
      family: taskFamily,
      role: agentRole,
      outcome: turnOutcome,
      evidenceRefs: baseEvidenceRefs,
    });
  }
  const readinessPolicy = loadAgiReadinessPolicy(workspaceRoot);
  const continuityTasks = Array.isArray(continuityBridge && continuityBridge.tasks) ? continuityBridge.tasks : [];
  for (const task of continuityTasks) {
    if (!["completed", "blocked", "verifier_failed"].includes(safeString(task && task.lifecycleState, 80))) continue;
    const continuityOutcome = task.lifecycleState === "completed" ? "success" : task.lifecycleState === "verifier_failed" ? "failure" : "neutral";
    const continuityEvidence = uniqueStrings(task && task.evidenceRefs, 8, 220);
    const continuityMatches = items.filter((item) => {
      if (!eligibleTypes.has(safeString(item && item.type, 80))) return false;
      if (!memoryAppliesToTaskFamily(item, safeString(task && task.familyId, 80), readinessPolicy)) return false;
      if (!memoryAppliesToAgent(item, safeString(task && task.role, 80) || "default")) return false;
      return true;
    });
    for (const item of continuityMatches) {
      maybeRecord({
        memoryId: safeString(item && item.memoryId, 120),
        item,
        continuityTaskId: safeString(task && task.taskId, 120),
        family: safeString(task && task.familyId, 80),
        role: safeString(task && task.role, 80) || "default",
        outcome: continuityOutcome,
        evidenceRefs: continuityEvidence,
      });
    }
  }
  return [...recorded, ...rejected];
}

function buildObservationProjection({ workspaceRoot, items, events }) {
  const itemById = new Map((Array.isArray(items) ? items : []).map((item) => [safeString(item && item.memoryId, 120), item]));
  const recorded = Array.isArray(events) ? events.filter((entry) => safeString(entry && entry.eventType, 80) === "memory_observation_recorded") : [];
  const rejected = Array.isArray(events) ? events.filter((entry) => safeString(entry && entry.eventType, 80) === "memory_observation_rejected") : [];
  const byMemoryId = {};
  const byLane = {
    external_primary: { observationCount: 0, successCount: 0, failureCount: 0, neutralCount: 0, notApplicableCount: 0, awaitingObservationCount: 0, lastObservedAt: "" },
    external_secondary: { observationCount: 0, successCount: 0, failureCount: 0, neutralCount: 0, notApplicableCount: 0, awaitingObservationCount: 0, lastObservedAt: "" },
  };
  for (const event of recorded) {
    const memoryId = safeString(event && event.memoryId, 120);
    if (!memoryId) continue;
    const current = byMemoryId[memoryId] && typeof byMemoryId[memoryId] === "object" ? byMemoryId[memoryId] : {
      memoryId,
      memoryType: safeString(event && event.memoryType, 80) || "unknown",
      sourceTier: safeString(itemById.get(memoryId) && itemById.get(memoryId).sourceTier, 40) || "unknown",
      observationCount: 0,
      successCount: 0,
      failureCount: 0,
      neutralCount: 0,
      notApplicableCount: 0,
      lastObservedAt: "",
      lastOutcome: "",
      sampleTurnIds: [],
      sampleContinuityTaskIds: [],
      taskFamilies: [],
    };
    current.observationCount += 1;
    const outcome = safeString(event && event.observedOutcome, 40);
    if (outcome === "success") current.successCount += 1;
    else if (outcome === "failure") current.failureCount += 1;
    else if (outcome === "neutral") current.neutralCount += 1;
    else current.notApplicableCount += 1;
    current.lastObservedAt = safeString(event && event.recordedAt, 80) || current.lastObservedAt;
    current.lastOutcome = outcome || current.lastOutcome;
    current.sampleTurnIds = uniqueStrings([safeString(event && (event.turnId || event.threadId), 120), ...(Array.isArray(current.sampleTurnIds) ? current.sampleTurnIds : [])], 6, 120);
    current.sampleContinuityTaskIds = uniqueStrings([safeString(event && event.continuityTaskId, 120), ...(Array.isArray(current.sampleContinuityTaskIds) ? current.sampleContinuityTaskIds : [])], 6, 120);
    current.taskFamilies = uniqueStrings([safeString(event && event.taskFamily, 80), ...(Array.isArray(current.taskFamilies) ? current.taskFamilies : [])], 8, 80);
    current.successRate = Number((current.successCount / Math.max(1, current.observationCount)).toFixed(4));
    byMemoryId[memoryId] = current;
    const laneKey = current.sourceTier === "external_primary" ? "external_primary" : current.sourceTier === "external_secondary" ? "external_secondary" : "";
    if (laneKey) {
      const lane = byLane[laneKey];
      lane.observationCount += 1;
      if (outcome === "success") lane.successCount += 1;
      else if (outcome === "failure") lane.failureCount += 1;
      else if (outcome === "neutral") lane.neutralCount += 1;
      else lane.notApplicableCount += 1;
      lane.lastObservedAt = safeString(event && event.recordedAt, 80) || lane.lastObservedAt;
    }
  }
  for (const item of items) {
    const tier = safeString(item && item.sourceTier, 40);
    if (!["external_primary", "external_secondary"].includes(tier)) continue;
    if (!["runtime_hint", "semantic_lesson", "improvement_candidate"].includes(safeString(item && item.type, 80))) continue;
    const observation = byMemoryId[safeString(item && item.memoryId, 120)];
    if (!observation) {
      byLane[tier].awaitingObservationCount += 1;
    }
  }
  return {
    schema: "governed-memory-observation-projection.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    observationCount: recorded.length,
    rejectedCount: rejected.length,
    rejectedReasons: rejected.reduce((acc, entry) => {
      const reason = safeString(entry && entry.reason, 80) || "unknown";
      acc[reason] = safeNumber(acc[reason], 0) + 1;
      return acc;
    }, {}),
    byMemoryId,
    byLane,
    recentObservations: recorded.slice(-16).reverse(),
  };
}

function buildCanonicalReinforcementMemory({ workspaceRoot, laneItems, observationProjection, sourceTier }) {
  const byMemoryId = observationProjection && observationProjection.byMemoryId && typeof observationProjection.byMemoryId === "object"
    ? observationProjection.byMemoryId
    : {};
  const recentObservations = [];
  const articleStats = {};
  const hintStats = {};
  const topicStats = {};
  let observationCount = 0;
  let lastObservedAt = "";
  for (const item of laneItems) {
    const memoryId = safeString(item && item.memoryId, 120);
    const observation = byMemoryId[memoryId];
    if (!observation) continue;
    observationCount += clampInt(observation.observationCount, 0, 999999, 0);
    if (parseTimestamp(observation.lastObservedAt) > parseTimestamp(lastObservedAt)) {
      lastObservedAt = safeString(observation.lastObservedAt, 80);
    }
    recentObservations.push({
      memoryId,
      memoryType: safeString(item && item.type, 80),
      articleId: safeString(item && item.content && item.content.structured && item.content.structured.articleId, 160),
      outcome: safeString(observation.lastOutcome, 40),
      observedAt: safeString(observation.lastObservedAt, 80),
      sourceTier,
    });
    const articleId = safeString(item && item.content && item.content.structured && item.content.structured.articleId, 160);
    if (articleId) {
      articleStats[articleId] = {
        successCount: clampInt(observation.successCount, 0, 999999, 0),
        failureCount: clampInt(observation.failureCount, 0, 999999, 0),
        observedCount: clampInt(observation.observationCount, 0, 999999, 0),
        successRate: Number(safeNumber(observation.successRate, 0).toFixed(4)),
        lastObservedAt: safeString(observation.lastObservedAt, 80),
        sampleTurnIds: uniqueStrings(observation.sampleTurnIds, 6, 120),
      };
    }
    const hintId = safeString(item && item.content && item.content.structured && item.content.structured.runtimeRetrievalHint && item.content.structured.runtimeRetrievalHint.hintId, 160);
    if (hintId) {
      hintStats[hintId] = {
        successCount: clampInt(observation.successCount, 0, 999999, 0),
        failureCount: clampInt(observation.failureCount, 0, 999999, 0),
        observedCount: clampInt(observation.observationCount, 0, 999999, 0),
        successRate: Number(safeNumber(observation.successRate, 0).toFixed(4)),
        lastObservedAt: safeString(observation.lastObservedAt, 80),
        sampleTurnIds: uniqueStrings(observation.sampleTurnIds, 6, 120),
      };
    }
    for (const topic of uniqueStrings(item && item.retrieval && item.retrieval.topics, 8, 80)) {
      const current = topicStats[topic] && typeof topicStats[topic] === "object" ? topicStats[topic] : {
        successCount: 0,
        failureCount: 0,
        observedCount: 0,
        successRate: 0,
        lastObservedAt: "",
      };
      current.successCount += clampInt(observation.successCount, 0, 999999, 0);
      current.failureCount += clampInt(observation.failureCount, 0, 999999, 0);
      current.observedCount += clampInt(observation.observationCount, 0, 999999, 0);
      current.successRate = Number((current.successCount / Math.max(1, current.observedCount)).toFixed(4));
      if (parseTimestamp(observation.lastObservedAt) > parseTimestamp(current.lastObservedAt)) {
        current.lastObservedAt = safeString(observation.lastObservedAt, 80);
      }
      topicStats[topic] = current;
    }
  }
  return {
    schema: "learning-reinforcement-memory.v1",
    generatedAt: toIso(),
    lastObservedAt,
    observationCount,
    recentObservations: recentObservations.slice(0, 12),
    articleStats,
    hintStats,
    topicStats,
  };
}

function mergeObservationStatusIntoState(state, laneSummary) {
  if (!state || typeof state !== "object") return state;
  const next = { ...state };
  next.observationCount = clampInt(laneSummary && laneSummary.observationCount, 0, 999999, 0);
  next.lastObservedAt = safeString(laneSummary && laneSummary.lastObservedAt, 80);
  next.awaitingObservationCount = clampInt(laneSummary && laneSummary.awaitingObservationCount, 0, 999999, 0);
  if (safeString(next.observationStatus, 40) !== "disabled") {
    next.observationStatus = next.observationCount > 0
      ? (next.awaitingObservationCount > 0 ? "awaiting_observations" : "observed")
      : (next.awaitingObservationCount > 0 ? "starved" : "unobserved");
  }
  if (next.nextPriority && typeof next.nextPriority === "object") {
    next.nextPriority = {
      ...next.nextPriority,
      reinforcement: {
        ...(next.nextPriority.reinforcement && typeof next.nextPriority.reinforcement === "object" ? next.nextPriority.reinforcement : {}),
        observedCount: clampInt(laneSummary && laneSummary.observationCount, 0, 999999, 0),
        lastObservedAt: safeString(laneSummary && laneSummary.lastObservedAt, 80),
      },
    };
  }
  return next;
}

function refreshLearningLaneArtifactsFromCanonical({ workspaceRoot, items, observationProjection }) {
  const openaiPolicy = loadOpenAIBlogLearningPolicy(path.join(workspaceRoot, "scripts", "config", "openai_blog_learning_policy.json"));
  const anthropicPolicy = loadAnthropicEngineeringLearningPolicy(path.join(workspaceRoot, "scripts", "config", "anthropic_engineering_learning_policy.json"));
  const openaiLaneItems = items.filter((item) => safeString(item && item.sourceTier, 40) === "external_primary");
  const anthropicLaneItems = items.filter((item) => safeString(item && item.sourceTier, 40) === "external_secondary");
  const openaiReinforcement = buildCanonicalReinforcementMemory({
    workspaceRoot,
    laneItems: openaiLaneItems,
    observationProjection,
    sourceTier: "external_primary",
  });
  const anthropicReinforcement = buildCanonicalReinforcementMemory({
    workspaceRoot,
    laneItems: anthropicLaneItems,
    observationProjection,
    sourceTier: "external_secondary",
  });
  writeJsonIfChanged(openaiPolicy.paths.stabilizationMemoryPath, openaiReinforcement);
  writeJsonIfChanged(path.join(workspaceRoot, "output", "anthropic_engineering_reinforcement_memory.json"), anthropicReinforcement);
  try {
    refreshSelfImprovementArtifacts({ policy: openaiPolicy, now: new Date() });
  } catch {
    // Keep the governed memory graph resilient when upstream learning artifacts are incomplete.
  }
  try {
    refreshSelfImprovementArtifacts({ policy: anthropicPolicy, now: new Date() });
  } catch {
    // Anthropic lane can remain proposal-only if artifacts are incomplete.
  }
  const openaiLaneSummary = observationProjection && observationProjection.byLane && observationProjection.byLane.external_primary
    ? observationProjection.byLane.external_primary
    : {};
  const anthropicLaneSummary = observationProjection && observationProjection.byLane && observationProjection.byLane.external_secondary
    ? observationProjection.byLane.external_secondary
    : {};
  const openaiStatePath = openaiPolicy.paths.selfImprovementStatePath;
  const anthropicStatePath = anthropicPolicy.paths.selfImprovementStatePath;
  writeJsonIfChanged(openaiStatePath, mergeObservationStatusIntoState(readJsonObject(openaiStatePath), openaiLaneSummary));
  writeJsonIfChanged(anthropicStatePath, mergeObservationStatusIntoState(readJsonObject(anthropicStatePath), anthropicLaneSummary));
  return {
    openaiReinforcement,
    anthropicReinforcement,
    openaiState: readJsonObject(openaiStatePath),
    anthropicState: readJsonObject(anthropicStatePath),
  };
}

function findLatestAgiV1Bundles(workspaceRoot, limit = 8) {
  const root = path.join(workspaceRoot, "output", "agi_v1");
  if (!fs.existsSync(root)) return [];
  const bundles = [];
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const targetPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(targetPath);
      } else if (entry.isFile() && entry.name === "agi_v1_bundle.json") {
        const payload = readJsonObject(targetPath);
        bundles.push({
          path: targetPath,
          payload,
          generatedAt: safeString(payload && (payload.generatedAt || payload.candidate && payload.candidate.generatedAt), 80),
          mtimeMs: fs.statSync(targetPath).mtimeMs,
        });
      }
    }
  }
  return bundles
    .sort((left, right) => {
      const tsDelta = parseTimestamp(right && right.generatedAt) - parseTimestamp(left && left.generatedAt);
      return tsDelta || safeNumber(right && right.mtimeMs, 0) - safeNumber(left && left.mtimeMs, 0);
    })
    .slice(0, limit);
}

function collectAgiFamilyMetric(bundle, familyName) {
  const candidate = bundle && bundle.candidate && typeof bundle.candidate === "object" ? bundle.candidate : {};
  const familySummaries = candidate.familySummaries && typeof candidate.familySummaries === "object"
    ? candidate.familySummaries
    : (candidate.familySummary && typeof candidate.familySummary === "object" ? candidate.familySummary : {});
  const family = familySummaries[familyName] && typeof familySummaries[familyName] === "object" ? familySummaries[familyName] : {};
  const main = family.main && typeof family.main === "object" ? family.main : {};
  return {
    familyName,
    value: Number.isFinite(Number(main.value)) ? Number(Number(main.value).toFixed(6)) : null,
    threshold: Number.isFinite(Number(main.threshold)) ? Number(main.threshold) : null,
    supportStatus: safeString(main.supportStatus, 40) || "unknown",
    passFail: typeof main.passFail === "boolean" ? main.passFail : null,
    details: main.details && typeof main.details === "object" ? main.details : {},
  };
}

function buildFamilyCoverageProjection({ workspaceRoot, items, continuityBridge, latestAgiBundle }) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const buckets = Array.isArray(policy.coverageBuckets) ? policy.coverageBuckets : [];
  const latestMetrics = latestAgiBundle ? {
    G_breadth: collectAgiFamilyMetric(latestAgiBundle, "G_breadth"),
    H_horizon: collectAgiFamilyMetric(latestAgiBundle, "H_horizon"),
  } : {};
  const breadthMatrix = latestMetrics.G_breadth && latestMetrics.G_breadth.details && Array.isArray(latestMetrics.G_breadth.details.matrix)
    ? latestMetrics.G_breadth.details.matrix
    : [];
  const breadthByDomain = new Map(breadthMatrix.map((entry) => [normalizeTaskFamilyId(entry && entry.domainFamily, policy), entry]));
  const taskByBucket = {};
  for (const task of Array.isArray(continuityBridge && continuityBridge.tasks) ? continuityBridge.tasks : []) {
    const bucketId = normalizeTaskFamilyId(task && task.familyId, policy);
    if (!bucketId) continue;
    taskByBucket[bucketId] = taskByBucket[bucketId] || [];
    taskByBucket[bucketId].push(task);
  }
  const rows = buckets.map((bucket) => {
    const bucketId = safeString(bucket && bucket.id, 80);
    const tasks = Array.isArray(taskByBucket[bucketId]) ? taskByBucket[bucketId] : [];
    const lastSuccessfulTask = tasks.find((task) => task.lifecycleState === "completed") || null;
    const lastFailedTask = tasks.find((task) => ["blocked", "verifier_failed"].includes(task.lifecycleState)) || null;
    const bucketItems = items.filter((item) => memoryAppliesToTaskFamily(item, bucketId, policy));
    const activeLessons = bucketItems.filter((item) => safeString(item && item.type, 80) === "semantic_lesson" && ["promoted", "reinforced", "shadow"].includes(safeString(item && item.status, 40)));
    const availableHints = bucketItems.filter((item) => safeString(item && item.type, 80) === "runtime_hint" && !["blocked", "revoked", "expired"].includes(safeString(item && item.status, 40)));
    const breadthEntry = breadthByDomain.get(bucketId);
    const domainScore = breadthEntry && Number.isFinite(Number(breadthEntry.domainScore))
      ? Number(Number(breadthEntry.domainScore).toFixed(4))
      : (lastSuccessfulTask ? 1 : lastFailedTask ? 0.25 : 0);
    const breadthFloor = Number.isFinite(Number(policy.breadthFloorDefault)) ? Number(policy.breadthFloorDefault) : 0.7;
    return {
      familyId: bucketId,
      label: safeString(bucket && bucket.label, 120) || bucketId,
      lastSuccessfulTask: lastSuccessfulTask ? {
        taskId: safeString(lastSuccessfulTask.taskId, 120),
        title: safeString(lastSuccessfulTask.title, 200),
        updatedAt: safeString(lastSuccessfulTask.updatedAt, 80),
      } : null,
      lastFailedTask: lastFailedTask ? {
        taskId: safeString(lastFailedTask.taskId, 120),
        title: safeString(lastFailedTask.title, 200),
        lifecycleState: safeString(lastFailedTask.lifecycleState, 80),
        updatedAt: safeString(lastFailedTask.updatedAt, 80),
      } : null,
      activeLessons: activeLessons.slice(0, 8).map((item) => ({
        memoryId: safeString(item.memoryId, 120),
        status: safeString(item.status, 40),
        summary: safeString(item.content && item.content.summary, 240),
      })),
      availableHints: availableHints.slice(0, 8).map((item) => ({
        memoryId: safeString(item.memoryId, 120),
        status: safeString(item.status, 40),
        summary: safeString(item.content && item.content.summary, 240),
      })),
      breadthFloor: breadthFloor,
      domainScore,
      breadthFloorStatus: domainScore >= breadthFloor ? "pass" : "fail",
    };
  });
  return {
    schema: "agi-readiness-domain-coverage-matrix.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    rows,
    horizon: continuityBridge && continuityBridge.summary ? continuityBridge.summary.horizon : {},
  };
}

function buildBreadthSemantics({ workspaceRoot, metrics, coverage }) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const semanticsPolicy = policy && policy.breadthSemantics && typeof policy.breadthSemantics === "object"
    ? policy.breadthSemantics
    : {};
  const rows = Array.isArray(coverage && coverage.rows) ? coverage.rows : [];
  const coverageFamilyCount = rows.length;
  const failedFamilies = rows
    .filter((row) => safeString(row && row.breadthFloorStatus, 20) !== "pass")
    .map((row) => safeString(row && row.familyId, 80))
    .filter(Boolean);
  const coveredFamilyCount = rows.filter((row) => safeString(row && row.breadthFloorStatus, 20) === "pass").length;
  const supportedCoverageBreadth = coverageFamilyCount > 0
    ? Number((coveredFamilyCount / coverageFamilyCount).toFixed(6))
    : null;
  const evaluatedBreadth = metrics && metrics.G_breadth && Number.isFinite(Number(metrics.G_breadth.value))
    ? Number(Number(metrics.G_breadth.value).toFixed(6))
    : null;
  const headlineMode = safeString(semanticsPolicy.headlineMode, 80) || "repo_coverage_breadth";
  const headlineBreadth = headlineMode === "repo_coverage_breadth"
    ? supportedCoverageBreadth
    : evaluatedBreadth;
  return {
    mode: headlineMode,
    evaluatedField: safeString(semanticsPolicy.evaluatedField, 80) || "evaluatedBreadth",
    coverageField: safeString(semanticsPolicy.coverageField, 80) || "supportedCoverageBreadth",
    evaluatedBreadth,
    supportedCoverageBreadth,
    headlineBreadth,
    coverageFamilyCount,
    coveredFamilyCount,
    failedFamilies,
  };
}

function derivePromotionComparison({ workspaceRoot, candidate, promotionDecision }) {
  const policy = loadAgiReadinessPolicy(workspaceRoot);
  const semantics = policy && policy.promotionSemantics && typeof policy.promotionSemantics === "object"
    ? policy.promotionSemantics
    : {};
  const incumbentIdentifier = safeString(promotionDecision && promotionDecision.incumbentIdentifier, 120);
  const challengerIdentifier = safeString(
    promotionDecision && promotionDecision.challengerIdentifier,
    120
  ) || safeString(candidate && candidate.candidateId, 120);
  let comparisonMode = safeString(semantics.distinctComparisonMode, 80) || "distinct_comparison";
  if (!incumbentIdentifier) {
    comparisonMode = safeString(semantics.coldStartMode, 80) || "cold_start";
  } else if (!challengerIdentifier || incumbentIdentifier === challengerIdentifier) {
    comparisonMode = safeString(semantics.selfSnapshotMode, 80) || "self_snapshot";
  }
  const distinctComparison = comparisonMode === (safeString(semantics.distinctComparisonMode, 80) || "distinct_comparison");
  const coldStart = comparisonMode === (safeString(semantics.coldStartMode, 80) || "cold_start");
  let promotionInterpretation = "distinct_incumbent_comparison";
  let promotionEvidenceStrength = "distinct_incumbent_challenger_decision";
  let promote = typeof promotionDecision && typeof promotionDecision.promote === "boolean" ? promotionDecision.promote : null;
  if (comparisonMode === (safeString(semantics.selfSnapshotMode, 80) || "self_snapshot")) {
    promotionInterpretation = "not_a_distinct_incumbent_comparison";
    promotionEvidenceStrength = "self_snapshot_only";
    promote = null;
  } else if (coldStart) {
    promotionInterpretation = "cold_start_threshold_evaluation";
    promotionEvidenceStrength = "cold_start_threshold_gated";
  }
  return {
    comparisonMode,
    distinctComparison,
    coldStart,
    incumbentIdentifier,
    challengerIdentifier,
    promote,
    promotionInterpretation,
    promotionEvidenceStrength,
  };
}

function filterPromotionReasons(reasons, promotionContext) {
  const rawReasons = uniqueStrings(reasons, 16, 220);
  if (!promotionContext || !promotionContext.distinctComparison) {
    return rawReasons.filter((reason) => reason !== "challenger_strictly_beats_incumbent_under_fail_closed_rule");
  }
  return rawReasons;
}

function buildReadinessConsistencyChecks({ readiness, coverage, blockedReasons, bottlenecks }) {
  const failedFamilies = uniqueStrings(readiness && readiness.failedFamilies, 16, 80);
  const supportedCoverageBreadth = Number.isFinite(Number(readiness && readiness.supportedCoverageBreadth))
    ? Number(readiness.supportedCoverageBreadth)
    : null;
  const evaluatedBreadth = Number.isFinite(Number(readiness && readiness.evaluatedBreadth))
    ? Number(readiness.evaluatedBreadth)
    : null;
  const headlineMode = safeString(readiness && readiness.breadthSemantics && readiness.breadthSemantics.mode, 80);
  const blockedReasonList = Array.isArray(blockedReasons && blockedReasons.reasons) ? blockedReasons.reasons : [];
  const bottleneckItems = Array.isArray(bottlenecks && bottlenecks.items) ? bottlenecks.items : [];
  const checks = [];
  const breadthConsistent = Boolean(
    headlineMode
    && Number.isFinite(supportedCoverageBreadth)
    && Number.isFinite(evaluatedBreadth)
    && (failedFamilies.length === 0 || supportedCoverageBreadth < 1)
  );
  checks.push({
    id: "readiness_breadth_semantics_consistent",
    status: breadthConsistent ? "PASS" : "FAIL",
    detail: breadthConsistent
      ? "headline breadth distinguishes evaluated bundle breadth from repo-wide supported coverage breadth"
      : "headline breadth does not clearly distinguish evaluated breadth from repo-wide supported coverage breadth",
  });
  const selfCompareMisreported = !(
    safeString(readiness && readiness.promotionComparisonMode, 80) === "self_snapshot"
    && (readiness && readiness.incumbentVsChallenger && readiness.incumbentVsChallenger.promote !== null)
  ) && !(
    safeString(readiness && readiness.promotionComparisonMode, 80) === "self_snapshot"
    && blockedReasonList.includes("challenger_strictly_beats_incumbent_under_fail_closed_rule")
  );
  checks.push({
    id: "promotion_surface_not_self_comparison_misreported",
    status: selfCompareMisreported ? "PASS" : "FAIL",
    detail: selfCompareMisreported
      ? "promotion surface does not present self-comparison as a distinct incumbent comparison"
      : "self-comparison readiness still exposes distinct-comparison promotion semantics",
  });
  const coverageReflected = failedFamilies.length === 0 || (
    blockedReasonList.some((reason) => reason.includes("breadth coverage incomplete across supported families"))
    && bottleneckItems.some((item) => safeString(item && item.summary, 240).includes("breadth coverage incomplete across supported families"))
  );
  checks.push({
    id: "coverage_failures_reflected_in_bottlenecks",
    status: coverageReflected ? "PASS" : "FAIL",
    detail: coverageReflected
      ? "coverage failures are reflected in readiness blocked reasons and next bottlenecks"
      : "coverage failures are not surfaced in readiness blocked reasons or next bottlenecks",
  });
  return checks;
}

function buildAgiReadinessArtifacts({ workspaceRoot, items, continuityBridge }) {
  const bundles = findLatestAgiV1Bundles(workspaceRoot, 8);
  const latestBundleEntry = bundles[0] || null;
  const latestBundle = latestBundleEntry && latestBundleEntry.payload && typeof latestBundleEntry.payload === "object"
    ? latestBundleEntry.payload
    : null;
  const candidate = latestBundle && latestBundle.candidate && typeof latestBundle.candidate === "object" ? latestBundle.candidate : {};
  const promotionDecision = latestBundle && latestBundle.promotionDecision && typeof latestBundle.promotionDecision === "object"
    ? latestBundle.promotionDecision
    : {};
  const familyIds = ["G_breadth", "G_depth", "A_adapt", "R_robust", "H_horizon", "P_context", "I_eval", "S_trust", "C_corr", "E_epi"];
  const metrics = Object.fromEntries(familyIds.map((id) => [id, collectAgiFamilyMetric(latestBundle, id)]));
  const coverage = buildFamilyCoverageProjection({ workspaceRoot, items, continuityBridge, latestAgiBundle: latestBundle });
  const breadthSemantics = buildBreadthSemantics({ workspaceRoot, metrics, coverage });
  const promotionContext = derivePromotionComparison({ workspaceRoot, candidate, promotionDecision });
  const headlineMetrics = {
    G_breadth: Number.isFinite(Number(breadthSemantics.headlineBreadth)) ? Number(breadthSemantics.headlineBreadth) : null,
    G_depth: metrics.G_depth && Number.isFinite(Number(metrics.G_depth.value)) ? Number(metrics.G_depth.value) : null,
    A_adapt: metrics.A_adapt && Number.isFinite(Number(metrics.A_adapt.value)) ? Number(metrics.A_adapt.value) : null,
    R_robust: metrics.R_robust && Number.isFinite(Number(metrics.R_robust.value)) ? Number(metrics.R_robust.value) : null,
    H_horizon: metrics.H_horizon && Number.isFinite(Number(metrics.H_horizon.value)) ? Number(metrics.H_horizon.value) : null,
    P_context: metrics.P_context && Number.isFinite(Number(metrics.P_context.value)) ? Number(metrics.P_context.value) : null,
  };
  const weakestCapability = Object.entries(headlineMetrics)
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((left, right) => safeNumber(left[1], 1) - safeNumber(right[1], 1))[0] || null;
  const weakestGate = ["I_eval", "S_trust", "C_corr", "E_epi"]
    .map((id) => metrics[id])
    .filter((entry) => Number.isFinite(Number(entry && entry.value)))
    .sort((left, right) => safeNumber(left && left.value, 1) - safeNumber(right && right.value, 1))[0] || null;
  const blockedReasons = filterPromotionReasons([
    ...(Array.isArray(candidate.blockingReasons) ? candidate.blockingReasons : []),
    ...(Array.isArray(promotionDecision.blockingConditions) ? promotionDecision.blockingConditions : []),
    ...(Array.isArray(promotionDecision.reasons) ? promotionDecision.reasons : []),
  ], promotionContext);
  if (breadthSemantics.failedFamilies.length) {
    blockedReasons.push(`breadth coverage incomplete across supported families: ${breadthSemantics.failedFamilies.join(", ")}`);
  }
  const normalizedBlockedReasons = uniqueStrings(blockedReasons, 12, 220);
  const trend = bundles.map((entry) => {
    const payload = entry && entry.payload && typeof entry.payload === "object" ? entry.payload : {};
    const candidateBundle = payload.candidate && typeof payload.candidate === "object" ? payload.candidate : {};
    const decision = payload.promotionDecision && typeof payload.promotionDecision === "object" ? payload.promotionDecision : {};
    const promotion = derivePromotionComparison({ workspaceRoot, candidate: candidateBundle, promotionDecision: decision });
    return {
      runId: safeString(payload.runId || candidateBundle.runId, 120),
      generatedAt: safeString(payload.generatedAt || candidateBundle.generatedAt, 80),
      rawFinalScore: Number.isFinite(Number(candidateBundle.rawFinalScore)) ? Number(Number(candidateBundle.rawFinalScore).toFixed(6)) : null,
      displayFinalScore: Number.isFinite(Number(candidateBundle.displayFinalScore)) ? Number(Number(candidateBundle.displayFinalScore).toFixed(6)) : null,
      catastrophicRisk: candidateBundle.riskSummary && Number.isFinite(Number(candidateBundle.riskSummary.cvar))
        ? Number(Number(candidateBundle.riskSummary.cvar).toFixed(6))
        : null,
      promote: promotion.promote,
      comparisonMode: promotion.comparisonMode,
      distinctComparison: promotion.distinctComparison,
      promotionInterpretation: promotion.promotionInterpretation,
      promotionEvidenceStrength: promotion.promotionEvidenceStrength,
      incumbentIdentifier: promotion.incumbentIdentifier,
      challengerIdentifier: promotion.challengerIdentifier,
      blockedReasons: uniqueStrings(filterPromotionReasons([
        ...(Array.isArray(candidateBundle.blockingReasons) ? candidateBundle.blockingReasons : []),
        ...(Array.isArray(decision.blockingConditions) ? decision.blockingConditions : []),
        ...(Array.isArray(decision.reasons) ? decision.reasons : []),
      ], promotion), 8, 180),
    };
  });
  const readiness = {
    schema: "agi-readiness-live-summary.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    latestRunId: safeString(latestBundle && latestBundle.runId, 120),
    profile: safeString(latestBundle && latestBundle.profile, 80) || "agi_v1",
    laneId: safeString(latestBundle && latestBundle.laneId, 120),
    suiteId: safeString(latestBundle && latestBundle.suiteId, 160),
    metrics,
    catastrophicRisk: candidate && candidate.riskSummary ? {
      cvar: Number.isFinite(Number(candidate.riskSummary.cvar)) ? Number(Number(candidate.riskSummary.cvar).toFixed(6)) : null,
      supportStatus: safeString(candidate.riskSummary.supportStatus, 40) || "unknown",
    } : { cvar: null, supportStatus: "unknown" },
    rawFinalScore: Number.isFinite(Number(candidate.rawFinalScore)) ? Number(Number(candidate.rawFinalScore).toFixed(6)) : null,
    displayFinalScore: Number.isFinite(Number(candidate.displayFinalScore)) ? Number(Number(candidate.displayFinalScore).toFixed(6)) : null,
    breadthSemantics: {
      mode: breadthSemantics.mode,
      headlineField: "supportedCoverageBreadth",
      evaluatedField: breadthSemantics.evaluatedField,
      coverageField: breadthSemantics.coverageField,
    },
    evaluatedBreadth: breadthSemantics.evaluatedBreadth,
    supportedCoverageBreadth: breadthSemantics.supportedCoverageBreadth,
    coverageFamilyCount: breadthSemantics.coverageFamilyCount,
    coveredFamilyCount: breadthSemantics.coveredFamilyCount,
    failedFamilies: breadthSemantics.failedFamilies,
    headlineMetrics,
    headlineBreadth: breadthSemantics.headlineBreadth,
    promotionComparisonMode: promotionContext.comparisonMode,
    distinctComparison: promotionContext.distinctComparison,
    promotionInterpretation: promotionContext.promotionInterpretation,
    promotionEvidenceStrength: promotionContext.promotionEvidenceStrength,
    incumbentVsChallenger: {
      incumbentIdentifier: promotionContext.incumbentIdentifier,
      challengerIdentifier: promotionContext.challengerIdentifier,
      promote: promotionContext.promote,
      comparisonMode: promotionContext.comparisonMode,
      distinctComparison: promotionContext.distinctComparison,
    },
    blockedReasons: normalizedBlockedReasons,
    weakestCapabilityFamily: weakestCapability ? safeString(weakestCapability[0], 80) : "",
    weakestGateFamily: weakestGate ? weakestGate.familyName : "",
    domainCoveragePath: repoRelative(workspaceRoot, getMemoryPaths(workspaceRoot).agiReadiness.domainCoverageMatrixJson),
    recentImprovement: trend.length > 1 && Number.isFinite(Number(trend[0].rawFinalScore)) && Number.isFinite(Number(trend[1].rawFinalScore))
      ? Number((safeNumber(trend[0].rawFinalScore, 0) - safeNumber(trend[1].rawFinalScore, 0)).toFixed(6))
      : null,
    recentRegression: trend.length > 1 && Number.isFinite(Number(trend[0].catastrophicRisk)) && Number.isFinite(Number(trend[1].catastrophicRisk))
      ? Number((safeNumber(trend[0].catastrophicRisk, 0) - safeNumber(trend[1].catastrophicRisk, 0)).toFixed(6))
      : null,
  };
  return {
    readiness,
    coverage,
    promotionTrend: {
      schema: "agi-readiness-promotion-trend.v1",
      generatedAt: toIso(),
      workspaceId: toWorkspaceId(workspaceRoot),
      entries: trend,
    },
    blockedReasons: {
      schema: "agi-readiness-blocked-reasons.v1",
      generatedAt: toIso(),
      workspaceId: toWorkspaceId(workspaceRoot),
      reasons: normalizedBlockedReasons,
      promotionComparisonMode: promotionContext.comparisonMode,
      distinctComparison: promotionContext.distinctComparison,
      failedFamilies: breadthSemantics.failedFamilies,
    },
  };
}

function renderAgiReadinessMarkdown(readiness, coverage, blockedReasons, bottlenecks = null) {
  const lines = [
    "# AGI Readiness",
    "",
    `- Run: ${safeString(readiness && readiness.latestRunId, 120) || "-"}`,
    `- Raw final score: ${Number.isFinite(Number(readiness && readiness.rawFinalScore)) ? readiness.rawFinalScore : "-"}`,
    `- Display final score: ${Number.isFinite(Number(readiness && readiness.displayFinalScore)) ? readiness.displayFinalScore : "-"}`,
    `- Catastrophic risk (CVaR): ${readiness && readiness.catastrophicRisk && Number.isFinite(Number(readiness.catastrophicRisk.cvar)) ? readiness.catastrophicRisk.cvar : "-"}`,
    `- Promotion comparison mode: ${safeString(readiness && readiness.promotionComparisonMode, 80) || "-"}`,
    `- Promote: ${readiness && readiness.incumbentVsChallenger && readiness.incumbentVsChallenger.promote !== null ? String(readiness.incumbentVsChallenger.promote) : "n/a"}`,
    `- Repo-wide coverage breadth: ${Number.isFinite(Number(readiness && readiness.supportedCoverageBreadth)) ? readiness.supportedCoverageBreadth : "-"}`,
    `- Evaluated breadth: ${Number.isFinite(Number(readiness && readiness.evaluatedBreadth)) ? readiness.evaluatedBreadth : "-"}`,
    `- Weakest capability family: ${safeString(readiness && readiness.weakestCapabilityFamily, 80) || "-"}`,
    `- Weakest hard gate: ${safeString(readiness && readiness.weakestGateFamily, 80) || "-"}`,
    "",
    "## Domain Coverage",
  ];
  for (const row of Array.isArray(coverage && coverage.rows) ? coverage.rows : []) {
    lines.push(`- ${safeString(row.familyId, 80)}: score=${safeNumber(row.domainScore, 0).toFixed(3)} floor=${safeNumber(row.breadthFloor, 0.7).toFixed(2)} status=${safeString(row.breadthFloorStatus, 20)}`);
  }
  lines.push("", "## Blocked Reasons");
  for (const reason of Array.isArray(blockedReasons && blockedReasons.reasons) ? blockedReasons.reasons : []) {
    lines.push(`- ${safeString(reason, 220)}`);
  }
  if (bottlenecks && Array.isArray(bottlenecks.items) && bottlenecks.items.length) {
    lines.push("", "## Next Bottlenecks");
    for (const item of bottlenecks.items) {
      lines.push(`- ${safeString(item.classification, 80)}: ${safeString(item.summary, 240)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function buildContinuityPublicArtifacts({ workspaceRoot, continuityBridge, retrievalPacks }) {
  const summary = continuityBridge && continuityBridge.summary && typeof continuityBridge.summary === "object"
    ? continuityBridge.summary
    : {};
  const packs = Array.isArray(retrievalPacks) ? retrievalPacks : [];
  const roleMemoryPackSections = {};
  for (const pack of packs.slice(-12)) {
    const agent = safeString(pack && pack.activeAgent, 80) || "default";
    roleMemoryPackSections[agent] = roleMemoryPackSections[agent] || {};
    for (const [section, count] of Object.entries(pack && pack.sectionCounts && typeof pack.sectionCounts === "object" ? pack.sectionCounts : {})) {
      roleMemoryPackSections[agent][section] = Math.max(safeNumber(roleMemoryPackSections[agent][section], 0), safeNumber(count, 0));
    }
  }
  const artifact = {
    schema: "continuity-public-summary.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    activeAgentTree: sanitizePublicValue(summary.activeAgentTree || {}, workspaceRoot),
    handoffCount: clampInt(summary.handoffCount, 0, 999999, 0),
    blockedSubtasks: clampInt(summary.blockedSubtaskCount, 0, 999999, 0),
    verifierFailedSubtasks: clampInt(summary.verifierFailedSubtaskCount, 0, 999999, 0),
    integrationPendingCount: clampInt(summary.integrationPendingCount, 0, 999999, 0),
    finalReleaseState: safeString(summary.finalReleaseState, 80) || "unknown",
    roleMemoryPackSections,
    horizon: sanitizePublicValue(summary.horizon || {}, workspaceRoot),
  };
  const markdown = [
    "# Continuity Public Summary",
    "",
    `- handoffCount: ${artifact.handoffCount}`,
    `- blockedSubtasks: ${artifact.blockedSubtasks}`,
    `- verifierFailedSubtasks: ${artifact.verifierFailedSubtasks}`,
    `- integrationPendingCount: ${artifact.integrationPendingCount}`,
    `- finalReleaseState: ${artifact.finalReleaseState}`,
    "",
    "## Role Memory Pack Sections",
    ...Object.entries(roleMemoryPackSections).map(([agent, sections]) => `- ${agent}: ${Object.entries(sections).map(([section, count]) => `${section}=${count}`).join(", ")}`),
  ].join("\n") + "\n";
  return { artifact, markdown };
}

function buildNextBottlenecks({ workspaceRoot, memoryEval, readinessArtifacts, continuityArtifacts, openAIBlogLane, anthropicLane }) {
  const items = [];
  const evalFailures = Array.isArray(memoryEval && memoryEval.checks) ? memoryEval.checks.filter((entry) => safeString(entry && entry.status, 20) !== "PASS") : [];
  if (evalFailures.length) {
    items.push({
      classification: "evidence bottleneck",
      summary: safeString(evalFailures[0].detail || evalFailures[0].title, 240),
      source: "memory_eval",
    });
  }
  const readiness = readinessArtifacts && readinessArtifacts.readiness ? readinessArtifacts.readiness : {};
  const failedFamilies = uniqueStrings(readiness && readiness.failedFamilies, 16, 80);
  if (failedFamilies.length) {
    items.push({
      classification: "scope/coverage bottleneck",
      summary: `breadth coverage incomplete across supported families: ${failedFamilies.join(", ")}`,
      source: "agi_readiness",
    });
  }
  if (safeString(readiness.weakestCapabilityFamily, 80)) {
    items.push({
      classification: "capability bottleneck",
      summary: `weakest family is ${safeString(readiness.weakestCapabilityFamily, 80)}`,
      source: "agi_readiness",
    });
  }
  if (safeString(readiness.weakestGateFamily, 80)) {
    items.push({
      classification: "governance bottleneck",
      summary: `hard gate pressure at ${safeString(readiness.weakestGateFamily, 80)}`,
      source: "agi_readiness",
    });
  }
  const continuity = continuityArtifacts && continuityArtifacts.artifact ? continuityArtifacts.artifact : {};
  if (clampInt(continuity.blockedSubtasks, 0, 999999, 0) > 0 || clampInt(continuity.verifierFailedSubtasks, 0, 999999, 0) > 0) {
    items.push({
      classification: "scope/coverage bottleneck",
      summary: `continuity has ${clampInt(continuity.blockedSubtasks, 0, 999999, 0)} blocked and ${clampInt(continuity.verifierFailedSubtasks, 0, 999999, 0)} verifier-failed subtasks`,
      source: "continuity",
    });
  }
  if (safeString(openAIBlogLane && openAIBlogLane.compatibilityState && openAIBlogLane.compatibilityState.observationStatus, 40) === "starved") {
    items.push({
      classification: "observation bottleneck",
      summary: "primary learning lane is still starved for successful runtime observations",
      source: "openai_primary_lane",
    });
  }
  if (safeString(anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.status, 40) === "shadow_only") {
    items.push({
      classification: "governance bottleneck",
      summary: "secondary learning lane remains shadow-only and does not yet promote into runtime",
      source: "anthropic_secondary_lane",
    });
  }
  const limit = clampInt(loadAgiReadinessPolicy(workspaceRoot).bottleneckLimit, 1, 10, 3);
  const limited = items.slice(0, limit);
  return {
    schema: "agi-readiness-next-bottlenecks.v1",
    generatedAt: toIso(),
    workspaceId: toWorkspaceId(workspaceRoot),
    items: limited,
  };
}

function renderNextBottlenecksMarkdown(payload) {
  const lines = ["# Next Bottlenecks", ""];
  for (const item of Array.isArray(payload && payload.items) ? payload.items : []) {
    lines.push(`- ${safeString(item.classification, 80)}: ${safeString(item.summary, 240)} (${safeString(item.source, 80)})`);
  }
  return `${lines.join("\n")}\n`;
}

function collectItems({ workspaceRoot, runtime, traceability, continuityBridge = null }) {
  const executionOverview = runtime && runtime.executionOverview && typeof runtime.executionOverview === "object" ? runtime.executionOverview : {};
  const evalHistory = runtime && runtime.evalHistory && typeof runtime.evalHistory === "object" ? runtime.evalHistory : {};
  return [
    ...buildSpecGraphItems({ workspaceRoot, phaseStatus: runtime && runtime.phaseStatus, runtime }),
    ...buildIntentAndPreferenceItems({ workspaceRoot, runtime }),
    buildWorkspaceProgressItem({ workspaceRoot, runtime, traceability, executionOverview, continuityBridge }),
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
      structured: item.content.structured,
      scope: item.scope,
      retrieval: item.retrieval,
      sourceRefs: uniqueStrings(item.evidence && item.evidence.sourceRefs, 16, 220),
      supportCount: clampInt(item.evidence && item.evidence.supportCount, 0, 9999, 0),
      confidence: Number(safeNumber(item.evidence && item.evidence.confidence, 0).toFixed(3)),
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

function getTaskFamilyIsolationPolicy(policy) {
  return policy && policy.taskFamilyIsolation && typeof policy.taskFamilyIsolation === "object"
    ? policy.taskFamilyIsolation
    : {};
}

function hasExplicitTaskFamilyMismatch(item, taskFamily) {
  const activeTaskFamily = safeString(taskFamily, 80) || "default";
  const taskFamilies = uniqueStrings(item && item.scope && item.scope.taskFamilies, 16, 80);
  if (!taskFamilies.length) return false;
  if (taskFamilies.includes("all") || taskFamilies.includes("default")) return false;
  return !taskFamilies.includes(activeTaskFamily);
}

function scoreItem(item, context, policy) {
  const weights = policy && policy.scoringWeights && typeof policy.scoringWeights === "object"
    ? policy.scoringWeights
    : (policy && policy.weights && typeof policy.weights === "object" ? policy.weights : {});
  const isolation = getTaskFamilyIsolationPolicy(policy);
  const mismatchPenalty = safeNumber(isolation.explicitMismatchPenalty, 0.38);
  const hardExcludeTypes = uniqueStrings(isolation.hardExcludeTypes, 16, 80);
  const explicitFamilyMismatch = hasExplicitTaskFamilyMismatch(item, context && context.taskFamily);
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
    explicitTaskFamilyMismatch: explicitFamilyMismatch ? 1 : 0,
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
  if (explicitFamilyMismatch) score -= mismatchPenalty;
  const hardExcluded = explicitFamilyMismatch && hardExcludeTypes.includes(safeString(item && item.type, 80));
  return {
    score: Number(score.toFixed(4)),
    factors,
    section: classifyMemorySection(item),
    hardExcluded,
    explicitFamilyMismatch,
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
    if (entry.hardExcluded) continue;
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
      explicitTaskFamilyMismatch: Boolean(entry.explicitFamilyMismatch),
    };
    selectionReasons[entry.item.memoryId] = reason;
    sectionEntries[entry.section].push({
      memoryId: entry.item.memoryId,
      type: entry.item.type,
      status: entry.item.status,
      score: entry.score,
      summary: entry.item.content.summary,
      structured: entry.item.content.structured,
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
    explicitTaskFamilyMismatchCount: selected.filter((entry) => Boolean(entry.explicitFamilyMismatch)).length,
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
        explicitTaskFamilyMismatch: hasExplicitTaskFamilyMismatch(item, context.taskFamily),
      },
      summary: item.content.summary,
    })),
  };
}

function buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime, currentEvents = [] }) {
  const retentionPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retention_policy.json");
  const retrievalPolicy = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json");
  const typeCounts = {};
  const statusCounts = {};
  for (const item of items) {
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }
  const workspaceProgress = items.find((item) => item.type === "workspace_progress" && item.content && item.content.structured && Object.keys(item.content.structured).length)
    || items.find((item) => item.type === "workspace_progress")
    || null;
  const health = collectMemoryHealth({ items, paths, retentionPolicy, currentEvents });
  return {
    enabled: true,
    schema: "governed-memory-graph-runtime.v1",
    status: "ready",
    workspaceId: toWorkspaceId(workspaceRoot),
    canonicalRoot: repoRelative(workspaceRoot, paths.root),
    eventLogPath: repoRelative(workspaceRoot, paths.eventsPath),
    outputRoot: repoRelative(workspaceRoot, paths.output.root),
    publicOutputRoot: repoRelative(workspaceRoot, paths.publicOutput.root),
    itemCount: items.length,
    promotedCount: items.filter((item) => item.status === "promoted" || item.status === "reinforced").length,
    canonicalEventCount: loadJsonl(paths.eventsPath).length + currentEvents.length,
    typeCounts,
    statusCounts,
    staleMemoryWarnings: health.staleMemoryWarnings,
    recentPromotions: health.recentPromotions,
    recentRevocations: health.recentRevocations,
    workspaceProgress: workspaceProgress ? workspaceProgress.content.structured : {},
    latestPack: summarizePack(pack, retrievalPolicy && retrievalPolicy.scoreThresholds),
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

function renderPublicOverviewMarkdown({
  overview = {},
  workspaceProgress = {},
  latestPack = {},
  promotionHealth = {},
  evalStatus = {},
  openAIBlogLane = {},
  anthropicLane = {},
} = {}) {
  const pack = latestPack && typeof latestPack.latestPack === "object" ? latestPack.latestPack : {};
  const lines = [
    "# Governed Memory Public Overview",
    "",
    `- Workspace: ${safeString(overview.workspaceId, 120) || "-"}`,
    `- Canonical root: ${safeString(overview.canonicalRoot, 220) || "-"}`,
    `- Public output root: ${safeString(overview.publicOutputRoot, 220) || "-"}`,
    `- Canonical events: ${clampInt(overview.canonicalEventCount, 0, 999999, 0)}`,
    `- Items: ${clampInt(overview.itemCount, 0, 999999, 0)}`,
    `- Promoted: ${clampInt(overview.promotedCount, 0, 999999, 0)}`,
    `- Latest pack: ${clampInt(pack.selectedCount, 0, 999999, 0)} items for ${safeString(pack.activeAgent, 80) || "default"} (${clampInt(pack.highConfidenceCount, 0, 999999, 0)} high-confidence)`,
    `- Latest pack reused items: ${clampInt(pack.reusedSelectedCount, 0, 999999, 0)}`,
    `- Latest pack task-family mismatches: ${clampInt(pack.explicitTaskFamilyMismatchCount, 0, 999999, 0)}`,
    `- Memory eval: ${safeString(evalStatus.status, 20) || "UNKNOWN"}`,
    `- Recent promotions: ${Array.isArray(promotionHealth.recentPromotions) ? promotionHealth.recentPromotions.length : 0}`,
    `- Recent revocations: ${Array.isArray(promotionHealth.recentRevocations) ? promotionHealth.recentRevocations.length : 0}`,
    `- Stale warnings: ${clampInt(promotionHealth.staleWarningCount, 0, 999999, 0)}`,
    "",
    "## Type Counts",
  ];
  for (const [key, value] of Object.entries(overview.typeCounts || {}).sort((left, right) => String(left[0]).localeCompare(String(right[0])))) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("", "## Workspace Progress");
  if (safeString(workspaceProgress.currentObjective, 220)) {
    lines.push(`- objective: ${safeString(workspaceProgress.currentObjective, 220)}`);
  }
  for (const milestone of uniqueStrings(workspaceProgress.currentMilestones, 6, 180)) {
    lines.push(`- milestone: ${milestone}`);
  }
  for (const blocker of uniqueStrings(workspaceProgress.knownBlockers, 6, 180)) {
    lines.push(`- blocker: ${blocker}`);
  }
  for (const action of uniqueStrings(workspaceProgress.nextRecommendedActions, 6, 180)) {
    lines.push(`- next: ${action}`);
  }
  lines.push("", "## Lane Health");
  lines.push(`- openai_primary: governed=${safeString(openAIBlogLane && openAIBlogLane.governedOperationalState && openAIBlogLane.governedOperationalState.status, 40) || "UNKNOWN"} / promoted=${clampInt(openAIBlogLane && openAIBlogLane.governedOperationalState && openAIBlogLane.governedOperationalState.promotedLessonCount, 0, 999999, 0)} / canonical-selected=${clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.selectedInLatestPackCount, 0, 999999, 0)} / compatibility=${safeString(openAIBlogLane && openAIBlogLane.compatibilityState && openAIBlogLane.compatibilityState.gateStatus, 40) || "UNKNOWN"}`);
  lines.push(`- anthropic_secondary: governed=${safeString(anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.status, 40) || "UNKNOWN"} / promoted=${clampInt(anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.promotedLessonCount, 0, 999999, 0)} / canonical-selected=${clampInt(anthropicLane && anthropicLane.canonicalCounts && anthropicLane.canonicalCounts.selectedInLatestPackCount, 0, 999999, 0)} / compatibility=${safeString(anthropicLane && anthropicLane.compatibilityState && anthropicLane.compatibilityState.gateStatus, 40) || "UNKNOWN"}`);
  return `${lines.join("\n")}\n`;
}

function syncGovernedMemoryGraph({ workspaceRoot = workspaceRootDefault, runtime = {}, traceability = {}, reason = "manual" } = {}) {
  const paths = getMemoryPaths(workspaceRoot);
  ensureMemoryLayout(paths);
  const previousById = readJsonObject(paths.indexes.byId);
  const previousContinuityState = readJsonObject(path.join(paths.projections.continuityStateRoot, "latest.json"));
  const continuityBridge = buildContinuityBridge({ workspaceRoot });
  const items = reviveLifecycle(
    collectItems({ workspaceRoot, runtime: { ...runtime, traceability }, traceability, continuityBridge }),
    previousById
  );
  const indexes = buildIndexes(items);
  const pack = compileMemoryPack({ workspaceRoot, runtime: { ...runtime, traceability }, items });
  pack.reusedSelectedCount = pack.selectedMemoryIds.filter((memoryId) => previousById && previousById[memoryId]).length;
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
  events.push(...buildObservationEvents({
    workspaceRoot,
    runtime: { ...runtime, traceability },
    traceability,
    pack,
    items,
    paths,
    continuityBridge,
  }));
  const previousTasksById = new Map(
    (Array.isArray(previousContinuityState && previousContinuityState.tasks) ? previousContinuityState.tasks : [])
      .map((task) => [safeString(task && task.taskId, 120), task])
      .filter(([taskId]) => Boolean(taskId))
  );
  for (const task of Array.isArray(continuityBridge && continuityBridge.tasks) ? continuityBridge.tasks : []) {
    const taskId = safeString(task && task.taskId, 120);
    if (!taskId) continue;
    const previousTask = previousTasksById.get(taskId);
    const currentState = safeString(task && task.lifecycleState, 80) || "unknown";
    const previousState = safeString(previousTask && previousTask.lifecycleState, 80);
    const currentIntegrationStatus = safeString(task && task.integrationStatus, 80);
    const previousIntegrationStatus = safeString(previousTask && previousTask.integrationStatus, 80);
    const currentReleaseState = safeString(task && task.finalReleaseState, 80);
    const previousReleaseState = safeString(previousTask && previousTask.finalReleaseState, 80);
    if (
      !previousTask
      || previousState !== currentState
      || previousIntegrationStatus !== currentIntegrationStatus
      || previousReleaseState !== currentReleaseState
    ) {
      events.push({
        schema: "memory-event.v1",
        eventId: stableHash({
          taskId,
          previousState,
          currentState,
          currentIntegrationStatus,
          currentReleaseState,
          reason,
        }).slice(0, 20),
        eventType: "continuity_lifecycle_transition",
        legacyEventType: "continuity.transition",
        recordedAt: safeString(task && task.updatedAt, 80) || toIso(),
        memoryId: `continuity:${taskId}`,
        memoryType: "episodic_event",
        workspaceId: initialSummary.workspaceId,
        continuityTaskId: taskId,
        taskFamily: safeString(task && task.familyId, 80),
        agentRole: safeString(task && task.role, 80) || "default",
        status: currentState,
        sourceTier: "runtime",
        authorityTier: 3,
        reason: "continuity_lifecycle_transition",
        previousState,
        nextState: currentState,
        integrationStatus: currentIntegrationStatus,
        finalReleaseState: currentReleaseState,
        evidenceRefs: uniqueStrings(task && task.evidenceRefs, 8, 220),
      });
    }
  }
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
  const allEvents = loadJsonl(paths.eventsPath);
  const observationProjection = buildObservationProjection({ workspaceRoot, items, events: allEvents });
  writeJsonIfChanged(path.join(paths.projections.observationStateRoot, "latest.json"), observationProjection);
  const learningArtifacts = refreshLearningLaneArtifactsFromCanonical({ workspaceRoot, items, observationProjection });
  const continuityProjection = {
    schema: "governed-memory-continuity-projection.v1",
    generatedAt: toIso(),
    workspaceId: initialSummary.workspaceId,
    summary: continuityBridge && continuityBridge.summary && typeof continuityBridge.summary === "object" ? continuityBridge.summary : {},
    tasks: Array.isArray(continuityBridge && continuityBridge.tasks) ? continuityBridge.tasks : [],
  };
  writeJsonIfChanged(path.join(paths.projections.continuityStateRoot, "latest.json"), continuityProjection);
  const summary = buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime, currentEvents: [] });
  const readinessArtifacts = buildAgiReadinessArtifacts({ workspaceRoot, items, continuityBridge });
  writeJsonIfChanged(path.join(paths.projections.familyCoverageRoot, "latest.json"), readinessArtifacts.coverage);
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "latest.json"), readinessArtifacts.readiness);
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "promotion_trend.json"), readinessArtifacts.promotionTrend);
  writeJsonIfChanged(path.join(paths.projections.readinessRoot, "blocked_reasons.json"), readinessArtifacts.blockedReasons);
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
  const retrievalPacks = loadJsonl(paths.retrieval.packsPath);
  const lastPackByThread = readJsonObject(paths.retrieval.lastPackByThread);
  const threadId = safeString(pack.threadId, 120) || "workspace";
  lastPackByThread[threadId] = pack;
  writeJsonIfChanged(paths.retrieval.lastPackByThread, lastPackByThread);
  const lastPackByWorkspace = readJsonObject(paths.retrieval.lastPackByWorkspace);
  lastPackByWorkspace[summary.workspaceId] = pack;
  writeJsonIfChanged(paths.retrieval.lastPackByWorkspace, lastPackByWorkspace);
  const openAIBlogLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "OpenAI Developers Blog",
    sourceTier: "external_primary",
    laneKey: "openai_primary",
    items,
    pack,
    statePath: "output/openai_blog_self_improvement_state.json",
    ledgerPath: "output/openai_blog_learning_ledger.json",
    digestPath: "output/openai_blog_learning_digest.json",
    reportPath: "output/openai_blog_learning_report.md",
    proposalDir: "output/openai_blog_self_improvement_proposals",
    curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
    observationProjection,
  });
  const anthropicLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "Anthropic Engineering",
    sourceTier: "external_secondary",
    laneKey: "anthropic_secondary",
    items,
    pack,
    statePath: "output/anthropic_engineering_self_improvement_state.json",
    ledgerPath: "output/anthropic_engineering_learning_ledger.json",
    digestPath: "output/anthropic_engineering_learning_digest.json",
    reportPath: "output/anthropic_engineering_learning_report.md",
    proposalDir: "output/anthropic_engineering_self_improvement_proposals",
    curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
    observationProjection,
  });
  const continuityArtifacts = buildContinuityPublicArtifacts({ workspaceRoot, continuityBridge, retrievalPacks });
  const bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: { checks: [] },
    readinessArtifacts,
    continuityArtifacts,
    openAIBlogLane,
    anthropicLane,
  });
  writeJsonIfChanged(path.join(paths.projections.bottlenecksRoot, "latest.json"), bottlenecks);
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
      observationProjection: {
        observationCount: clampInt(observationProjection && observationProjection.observationCount, 0, 999999, 0),
        rejectedCount: clampInt(observationProjection && observationProjection.rejectedCount, 0, 999999, 0),
        byLane: observationProjection && observationProjection.byLane && typeof observationProjection.byLane === "object"
          ? observationProjection.byLane
          : {},
      },
    },
    items: items.filter((item) => item.type === "improvement_candidate" || item.type === "runtime_hint"),
  });
  fs.writeFileSync(paths.output.memoryHealthReportMd, renderOverviewMarkdown(summary), "utf8");
  return {
    summary,
    items,
    pack,
    paths,
    continuityBridge,
    observationProjection,
    learningArtifacts,
    readinessArtifacts,
    eventCount: loadJsonl(paths.eventsPath).length,
  };
}

function buildGovernedMemoryRuntimeSnapshot({ workspaceRoot = workspaceRootDefault, runtime = {}, traceability = {} } = {}) {
  const paths = getMemoryPaths(workspaceRoot);
  ensureMemoryLayout(paths);
  const previousById = readJsonObject(paths.indexes.byId);
  const continuityBridge = buildContinuityBridge({ workspaceRoot });
  const items = reviveLifecycle(
    collectItems({ workspaceRoot, runtime: { ...runtime, traceability }, traceability, continuityBridge }),
    previousById
  );
  const pack = compileMemoryPack({ workspaceRoot, runtime: { ...runtime, traceability }, items });
  pack.reusedSelectedCount = pack.selectedMemoryIds.filter((memoryId) => previousById && previousById[memoryId]).length;
  const summary = buildRuntimeSummary({ workspaceRoot, items, pack, paths, runtime });
  summary.eventCount = loadJsonl(paths.eventsPath).length;
  return summary;
}

function loadPublicExportPolicy(workspaceRoot) {
  return loadConfigJson(workspaceRoot, "scripts", "config", "memory_public_export_policy.json");
}

function buildPublicItemSummary(item, workspaceRoot) {
  const type = safeString(item && item.type, 80);
  const structured = item && item.structured && typeof item.structured === "object" ? item.structured : {};
  if (type === "episodic_event") {
    const outcome = safeString(structured.taskOutcomeStatus, 80).toUpperCase() || safeString(item && item.status, 40).toUpperCase() || "UNSPECIFIED";
    const profile = safeString(structured.executionProfile, 80);
    return normalizePublicText(`${profile || "runtime"} episode finished as ${outcome}.`, workspaceRoot);
  }
  if (type === "eval_observation") {
    const suiteId = safeString(structured.suiteId, 120) || "eval suite";
    const failures = clampInt(structured.failedCases, 0, 9999, 0);
    return normalizePublicText(`${suiteId} completed with ${failures} failures.`, workspaceRoot);
  }
  return normalizePublicText(item && item.summary, workspaceRoot);
}

function sanitizePublicPackItem(item, workspaceRoot, thresholds) {
  const reason = item && item.whyIncluded && typeof item.whyIncluded === "object" ? item.whyIncluded : {};
  return {
    publicRef: maskOpaqueId(item && item.memoryId, "mem"),
    type: safeString(item && item.type, 80),
    status: safeString(item && item.status, 40),
    score: Number(safeNumber(item && item.score, 0).toFixed(4)),
    scoreBand: scoreBand(safeNumber(item && item.score, 0), thresholds || {}),
    sourceTier: safeString(reason && reason.sourceTier, 40),
    authorityTier: clampInt(reason && reason.authorityTier, 0, 6, 0),
    scopeWorkspace: safeString(reason && reason.scopeWorkspace, 120),
    taskFamilies: uniqueStrings(reason && reason.taskFamilies, 8, 80),
    summary: buildPublicItemSummary(item, workspaceRoot),
  };
}

function buildLaneProjection({ workspaceRoot, sourceName, sourceTier, laneKey, items, pack, statePath, ledgerPath, digestPath, reportPath, proposalDir, curatedDocPath, observationProjection = null }) {
  const laneItems = items.filter((item) => safeString(item && item.sourceTier, 40) === sourceTier);
  const lessons = laneItems.filter((item) => safeString(item && item.type, 80) === "semantic_lesson");
  const improvements = laneItems.filter((item) => safeString(item && item.type, 80) === "improvement_candidate");
  const selectedLaneItems = (Array.isArray(pack && pack.items) ? pack.items : []).filter((item) => safeString(item && item.whyIncluded && item.whyIncluded.sourceTier, 40) === sourceTier);
  const compatibilityState = readJsonObject(path.join(workspaceRoot, statePath));
  const compatibilityGatePath = statePath.replace(/_state\.json$/i, "_gate.json");
  const observationLane = observationProjection && observationProjection.byLane && typeof observationProjection.byLane === "object"
    ? observationProjection.byLane[sourceTier]
    : null;
  return {
    schema: "governed-memory-public-lane-projection.v1",
    generatedAt: toIso(),
    laneKey,
    sourceName,
    sourceTier,
    canonicalCounts: {
      derivedFromCanonicalStore: laneItems.length > 0 || safeNumber(observationLane && observationLane.observationCount, 0) > 0,
      lessonCount: lessons.length,
      promotedLessonCount: lessons.filter((item) => ["promoted", "reinforced"].includes(safeString(item && item.status, 40))).length,
      shadowLessonCount: lessons.filter((item) => safeString(item && item.status, 40) === "shadow").length,
      improvementCandidateCount: improvements.length,
      proposalOnlyCount: improvements.filter((item) => safeString(item && item.status, 40) === "proposal_only").length,
      blockedCount: improvements.filter((item) => safeString(item && item.status, 40) === "blocked").length,
      shadowCount: improvements.filter((item) => safeString(item && item.status, 40) === "shadow").length,
      selectedInLatestPackCount: selectedLaneItems.length,
      observationCount: clampInt(observationLane && observationLane.observationCount, 0, 999999, 0),
      awaitingObservationCount: clampInt(observationLane && observationLane.awaitingObservationCount, 0, 999999, 0),
    },
    canonicalHealth: {
      canonicalStatePresent: laneItems.length > 0 || safeNumber(observationLane && observationLane.observationCount, 0) > 0,
      selectedInLatestPackCount: selectedLaneItems.length,
      promotedOrReinforcedCount: laneItems.filter((item) => ["promoted", "reinforced"].includes(safeString(item && item.status, 40))).length,
      shadowOrProposalCount: laneItems.filter((item) => ["shadow", "proposal_only", "candidate"].includes(safeString(item && item.status, 40))).length,
    },
    governedOperationalState: {
      status: lessons.some((item) => ["promoted", "reinforced"].includes(safeString(item && item.status, 40)))
        ? "active"
        : improvements.some((item) => safeString(item && item.status, 40) === "proposal_only")
          ? "proposal_only"
          : lessons.some((item) => safeString(item && item.status, 40) === "shadow")
            ? "shadow_only"
            : "captured_only",
      promotedLessonCount: lessons.filter((item) => ["promoted", "reinforced"].includes(safeString(item && item.status, 40))).length,
      selectedInLatestPackCount: selectedLaneItems.length,
      observationCount: clampInt(observationLane && observationLane.observationCount, 0, 999999, 0),
      awaitingObservationCount: clampInt(observationLane && observationLane.awaitingObservationCount, 0, 999999, 0),
      observationStatus: safeString(compatibilityState.observationStatus, 40) || "unknown",
      lastObservedAt: safeString(observationLane && observationLane.lastObservedAt, 80),
    },
    recentLessons: lessons.slice(0, 4).map((item) => ({
      publicRef: maskOpaqueId(item.memoryId, "mem"),
      status: safeString(item.status, 40),
      summary: normalizePublicText(item.content && item.content.summary, workspaceRoot),
      topics: uniqueStrings(item.retrieval && item.retrieval.topics, 6, 80),
    })),
    compatibilityState: {
      gateStatus: safeString(compatibilityState.gateStatus, 40) || "UNKNOWN",
      gateReason: normalizePublicText(compatibilityState.gateReason, workspaceRoot),
      appliedDecision: safeString(compatibilityState.appliedDecision, 40) || "none",
      observationStatus: safeString(compatibilityState.observationStatus, 40) || "unknown",
      observationCount: clampInt(compatibilityState.observationCount, 0, 999999, 0),
      proposalOnlyCount: clampInt(compatibilityState.proposalOnlyCount, 0, 999999, 0),
      blockedCount: clampInt(compatibilityState.blockedCount, 0, 999999, 0),
      awaitingObservationCount: clampInt(compatibilityState.awaitingObservationCount, 0, 999999, 0),
      policyDisabledCandidateCount: clampInt(compatibilityState.policyDisabledCandidateCount, 0, 999999, 0),
      lastObservedAt: safeString(compatibilityState.lastObservedAt, 80),
      nextPriority: compatibilityState.nextPriority && typeof compatibilityState.nextPriority === "object"
        ? {
          title: normalizePublicText(compatibilityState.nextPriority.title, workspaceRoot),
          changeType: safeString(compatibilityState.nextPriority.changeType, 80),
          readinessStatus: safeString(compatibilityState.nextPriority.readinessStatus, 80),
          gatingReason: normalizePublicText(compatibilityState.nextPriority.gatingReason, workspaceRoot),
          nextAction: normalizePublicText(compatibilityState.nextPriority.nextAction, workspaceRoot),
        }
        : null,
    },
    compatibilityPaths: {
      ledgerPath: normalizePublicPath(workspaceRoot, ledgerPath),
      digestPath: normalizePublicPath(workspaceRoot, digestPath),
      reportPath: normalizePublicPath(workspaceRoot, reportPath),
      proposalDir: normalizePublicPath(workspaceRoot, proposalDir),
      statePath: normalizePublicPath(workspaceRoot, statePath),
      gatePath: normalizePublicPath(workspaceRoot, compatibilityGatePath),
      curatedDocPath: normalizePublicPath(workspaceRoot, curatedDocPath),
    },
  };
}

function evaluateMemoryPublicSuite({ workspaceRoot, paths, summary, pack, items, openAIBlogLane, anthropicLane, observationProjection = null, continuityArtifacts = null, readinessArtifacts = null }) {
  const suite = loadConfigJson(workspaceRoot, "scripts", "config", "memory_eval_suite.json");
  const checks = Array.isArray(suite && suite.checks) ? suite.checks : [];
  const workspaceProgressPath = path.join(paths.projections.workspaceProgressRoot, `${summary.workspaceId}.json`);
  const workspaceProgressProjection = readJsonObject(workspaceProgressPath);
  const workspacePack = pack && typeof pack === "object" ? pack : {};
  const packItems = Array.isArray(workspacePack && workspacePack.items) ? workspacePack.items : [];
  const isolationPolicy = getTaskFamilyIsolationPolicy(loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json"));
  const hardExcludeTypes = uniqueStrings(isolationPolicy.hardExcludeTypes, 16, 80);
  const continuityArtifact = continuityArtifacts && continuityArtifacts.artifact && typeof continuityArtifacts.artifact === "object"
    ? continuityArtifacts.artifact
    : {};
  const readiness = readinessArtifacts && readinessArtifacts.readiness && typeof readinessArtifacts.readiness === "object"
    ? readinessArtifacts.readiness
    : {};
  const readinessBlockedReasons = readinessArtifacts && readinessArtifacts.blockedReasons && typeof readinessArtifacts.blockedReasons === "object"
    ? readinessArtifacts.blockedReasons
    : {};
  const readinessBottlenecks = readinessArtifacts && readinessArtifacts.bottlenecks && typeof readinessArtifacts.bottlenecks === "object"
    ? readinessArtifacts.bottlenecks
    : {};
  const checkResults = checks.map((check) => {
    const id = safeString(check && check.id, 120);
    let pass = false;
    let detail = "";
    if (id === "canonical_store_present") {
      pass = fs.existsSync(paths.eventsPath) && fs.existsSync(paths.indexes.byId);
      detail = pass ? "canonical event log and index are present" : "canonical event log or index is missing";
    } else if (id === "workspace_progress_projection_present") {
      pass = fs.existsSync(workspaceProgressPath);
      detail = pass ? "workspace progress projection present" : "workspace progress projection missing";
    } else if (id === "workspace_progress_projection_populated") {
      const milestoneCount = Array.isArray(workspaceProgressProjection.currentMilestones) ? workspaceProgressProjection.currentMilestones.length : 0;
      pass = Boolean(safeString(workspaceProgressProjection.currentObjective, 240)) || milestoneCount > 0;
      detail = pass ? "workspace progress projection contains objective or milestone data" : "workspace progress projection is structurally present but empty";
    } else if (id === "workspace_progress_updated_at_present") {
      pass = Boolean(safeString(workspaceProgressProjection.updatedAt, 80));
      detail = pass ? "workspace progress projection exposes a durable updatedAt timestamp" : "workspace progress projection is missing durable updatedAt";
    } else if (id === "legacy_learning_compatibility_preserved") {
      const required = [
        "output/openai_blog_learning_digest.json",
        "output/openai_blog_learning_ledger.json",
        "output/openai_blog_self_improvement_state.json",
        "output/anthropic_engineering_learning_digest.json",
        "output/anthropic_engineering_learning_ledger.json",
        "output/anthropic_engineering_self_improvement_state.json",
      ];
      const missing = required.filter((entry) => !fs.existsSync(path.join(workspaceRoot, entry)));
      pass = missing.length === 0;
      detail = pass ? "legacy learning compatibility artifacts remain addressable" : `missing: ${missing.map((entry) => normalizePublicPath(workspaceRoot, entry)).join(", ")}`;
    } else if (id === "bounded_memory_pack_written") {
      const itemCount = Array.isArray(workspacePack && workspacePack.items) ? workspacePack.items.length : 0;
      pass = itemCount > 0 || clampInt(workspacePack && workspacePack.selectedCount, 0, 999999, 0) > 0;
      detail = pass ? "at least one bounded memory pack exists" : "no bounded memory pack found";
    } else if (id === "bounded_memory_pack_reuses_canonical_memory") {
      const reusedCount = clampInt(workspacePack && workspacePack.reusedSelectedCount, 0, 999999, 0);
      pass = reusedCount > 0;
      detail = pass ? `${reusedCount} selected pack item(s) were reused from the canonical store` : "latest bounded memory pack does not yet demonstrate canonical reuse";
    } else if (id === "task_family_isolation_respected") {
      const mismatched = packItems.filter((entry) => {
        const itemType = safeString(entry && entry.type, 80);
        const families = uniqueStrings(entry && entry.whyIncluded && entry.whyIncluded.taskFamilies, 8, 80);
        if (!families.length || families.includes("all") || families.includes("default")) return false;
        if (!hardExcludeTypes.includes(itemType)) return false;
        return !families.includes(safeString(workspacePack && workspacePack.taskFamily, 80) || "default");
      });
      pass = mismatched.length === 0;
      detail = pass ? "latest bounded memory pack respects task-family isolation for hard-excluded governed memory types" : `mismatched items present: ${mismatched.map((entry) => safeString(entry && entry.type, 80)).join(", ")}`;
    } else if (id === "lane_projection_canonical_state_present") {
      const openaiCanonical = openAIBlogLane && openAIBlogLane.canonicalCounts && safeNumber(openAIBlogLane.canonicalCounts.lessonCount, 0) >= 1;
      const anthropicCanonical = anthropicLane && anthropicLane.canonicalCounts && safeNumber(anthropicLane.canonicalCounts.lessonCount, 0) >= 1;
      pass = Boolean(openaiCanonical && anthropicCanonical);
      detail = pass ? "public lane projections expose canonical memory-derived lesson state for primary and secondary learning lanes" : "canonical memory-derived lane state is missing from one or more public projections";
    } else if (id === "promotion_health_memory_type_populated") {
      const promotions = Array.isArray(summary && summary.recentPromotions) ? summary.recentPromotions : [];
      const revocations = Array.isArray(summary && summary.recentRevocations) ? summary.recentRevocations : [];
      const emptyEntry = [...promotions, ...revocations].find((entry) => !safeString(entry && entry.memoryType, 80));
      pass = !emptyEntry;
      detail = pass ? "promotion/revocation health entries expose non-empty memoryType values" : "one or more promotion/revocation health entries are missing memoryType";
    } else if (id === "observation_projection_present") {
      pass = Boolean(
        observationProjection
        && typeof observationProjection === "object"
        && fs.existsSync(path.join(paths.projections.observationStateRoot, "latest.json"))
      );
      detail = pass ? "canonical observation projection is present" : "canonical observation projection missing";
    } else if (id === "continuity_projection_present") {
      pass = fs.existsSync(path.join(paths.projections.continuityStateRoot, "latest.json"))
        && Boolean(continuityArtifact && typeof continuityArtifact === "object" && safeString(continuityArtifact.schema, 120));
      detail = pass ? "continuity projection and public summary are present" : "continuity projection or public summary missing";
    } else if (id === "agi_readiness_surface_present") {
      const required = [
        path.join(paths.projections.readinessRoot, "latest.json"),
        path.join(paths.projections.readinessRoot, "promotion_trend.json"),
        path.join(paths.projections.readinessRoot, "blocked_reasons.json"),
        path.join(paths.projections.familyCoverageRoot, "latest.json"),
      ];
      const missing = required.filter((targetPath) => !fs.existsSync(targetPath));
      pass = missing.length === 0 && safeString(readiness.schema, 120) === "agi-readiness-live-summary.v1";
      detail = pass ? "agi readiness canonical surface is present" : `missing: ${missing.map((entry) => normalizePublicPath(workspaceRoot, entry)).join(", ")}`;
    } else if (id === "readiness_breadth_semantics_consistent") {
      const failedFamilies = uniqueStrings(readiness && readiness.failedFamilies, 16, 80);
      const supportedCoverageBreadth = safeNumber(readiness && readiness.supportedCoverageBreadth, NaN);
      const evaluatedBreadth = safeNumber(readiness && readiness.evaluatedBreadth, NaN);
      const headlineMode = safeString(readiness && readiness.breadthSemantics && readiness.breadthSemantics.mode, 80);
      pass = Boolean(
        headlineMode
        && Number.isFinite(supportedCoverageBreadth)
        && Number.isFinite(evaluatedBreadth)
        && (failedFamilies.length === 0 || supportedCoverageBreadth < 1)
      );
      detail = pass
        ? "readiness headline exposes evaluated breadth separately from repo-wide supported coverage breadth"
        : "readiness headline breadth semantics are missing or inconsistent with coverage failures";
    } else if (id === "promotion_surface_not_self_comparison_misreported") {
      const selfSnapshot = safeString(readiness && readiness.promotionComparisonMode, 80) === "self_snapshot";
      const promoteValue = readiness && readiness.incumbentVsChallenger ? readiness.incumbentVsChallenger.promote : undefined;
      const reasons = Array.isArray(readinessBlockedReasons && readinessBlockedReasons.reasons) ? readinessBlockedReasons.reasons : [];
      pass = !selfSnapshot || (promoteValue === null && !reasons.includes("challenger_strictly_beats_incumbent_under_fail_closed_rule"));
      detail = pass
        ? "promotion surface distinguishes self-snapshot from distinct incumbent comparison"
        : "self-snapshot readiness is still exposed like a distinct incumbent/challenger promotion result";
    } else if (id === "coverage_failures_reflected_in_bottlenecks") {
      const failedFamilies = uniqueStrings(readiness && readiness.failedFamilies, 16, 80);
      const reasons = Array.isArray(readinessBlockedReasons && readinessBlockedReasons.reasons) ? readinessBlockedReasons.reasons : [];
      const bottlenecks = Array.isArray(readinessBottlenecks && readinessBottlenecks.items) ? readinessBottlenecks.items : [];
      pass = failedFamilies.length === 0 || (
        reasons.some((reason) => reason.includes("breadth coverage incomplete across supported families"))
        && bottlenecks.some((item) => safeString(item && item.summary, 240).includes("breadth coverage incomplete across supported families"))
      );
      detail = pass
        ? "coverage failures are reflected in readiness blocked reasons and next bottlenecks"
        : "coverage failures are not reflected in readiness blocked reasons or next bottlenecks";
    } else if (id === "lane_projection_real_observations_reflected") {
      const primaryObserved = clampInt(openAIBlogLane && openAIBlogLane.canonicalCounts && openAIBlogLane.canonicalCounts.observationCount, 0, 999999, 0);
      const secondaryAwaiting = clampInt(anthropicLane && anthropicLane.canonicalCounts && anthropicLane.canonicalCounts.awaitingObservationCount, 0, 999999, 0);
      const primaryState = safeString(
        openAIBlogLane && openAIBlogLane.governedOperationalState && openAIBlogLane.governedOperationalState.observationStatus,
        40
      ) || safeString(openAIBlogLane && openAIBlogLane.compatibilityState && openAIBlogLane.compatibilityState.observationStatus, 40);
      const secondaryState = safeString(
        anthropicLane && anthropicLane.governedOperationalState && anthropicLane.governedOperationalState.observationStatus,
        40
      ) || safeString(anthropicLane && anthropicLane.compatibilityState && anthropicLane.compatibilityState.observationStatus, 40);
      pass = Boolean(
        openAIBlogLane
        && anthropicLane
        && openAIBlogLane.canonicalCounts
        && anthropicLane.canonicalCounts
        && typeof primaryObserved === "number"
        && typeof secondaryAwaiting === "number"
        && primaryState
        && secondaryState
      );
      detail = pass
        ? `lane projections reflect canonical observation state (${primaryState}/${secondaryState})`
        : "lane projections do not yet reflect canonical observation state";
    }
    return {
      id,
      title: safeString(check && check.title, 240),
      status: pass ? "PASS" : "FAIL",
      detail,
    };
  });
  const failedChecks = checkResults.filter((entry) => entry.status !== "PASS").map((entry) => entry.id);
  return {
    schema: "memory-eval-public-status.v1",
    generatedAt: toIso(),
    suiteSchema: safeString(suite && suite.schema, 120) || "memory-eval-suite.v1",
    suiteVersion: safeString(suite && suite.version, 80),
    status: failedChecks.length ? "FAIL" : "PASS",
    failedCheckIds: failedChecks,
    checks: checkResults,
  };
}

function renderMemoryEvalMarkdown(result) {
  const lines = [
    "# Memory Eval Public Status",
    "",
    `- Status: ${safeString(result && result.status, 20) || "UNKNOWN"}`,
    `- Generated At: ${safeString(result && result.generatedAt, 80) || "-"}`,
    "",
    "## Checks",
  ];
  for (const entry of Array.isArray(result && result.checks) ? result.checks : []) {
    lines.push(`- ${safeString(entry.id, 120)}: ${safeString(entry.status, 20)} (${safeString(entry.detail, 280) || safeString(entry.title, 240)})`);
  }
  return `${lines.join("\n")}\n`;
}

function buildGovernedMemoryPublicArtifacts({ workspaceRoot = workspaceRootDefault } = {}) {
  const policy = loadPublicExportPolicy(workspaceRoot);
  const persisted = loadPersistedGovernedMemoryState({ workspaceRoot });
  const { paths, items, pack, summary } = persisted;
  const thresholds = loadConfigJson(workspaceRoot, "scripts", "config", "memory_retrieval_policy.json").scoreThresholds || {};
  const observationProjectionPath = path.join(paths.projections.observationStateRoot, "latest.json");
  const continuityProjectionPath = path.join(paths.projections.continuityStateRoot, "latest.json");
  const readinessProjectionPath = path.join(paths.projections.readinessRoot, "latest.json");
  const promotionTrendProjectionPath = path.join(paths.projections.readinessRoot, "promotion_trend.json");
  const blockedReasonsProjectionPath = path.join(paths.projections.readinessRoot, "blocked_reasons.json");
  const coverageProjectionPath = path.join(paths.projections.familyCoverageRoot, "latest.json");
  const bottlenecksProjectionPath = path.join(paths.projections.bottlenecksRoot, "latest.json");
  const allEvents = loadJsonl(paths.eventsPath);
  let observationProjection = readJsonObject(observationProjectionPath);
  if (!observationProjection || typeof observationProjection !== "object" || safeString(observationProjection.schema, 120) !== "governed-memory-observation-projection.v1") {
    observationProjection = buildObservationProjection({ workspaceRoot, items, events: allEvents });
    writeJsonIfChanged(observationProjectionPath, observationProjection);
  }
  let continuityProjection = readJsonObject(continuityProjectionPath);
  const retrievalPacks = loadJsonl(paths.retrieval.packsPath);
  const continuityBridge = continuityProjection && typeof continuityProjection === "object"
    ? {
      summary: continuityProjection.summary && typeof continuityProjection.summary === "object" ? continuityProjection.summary : {},
      tasks: Array.isArray(continuityProjection.tasks) ? continuityProjection.tasks : [],
    }
    : buildContinuityBridge({ workspaceRoot });
  if (!continuityProjection || typeof continuityProjection !== "object" || safeString(continuityProjection.schema, 120) !== "governed-memory-continuity-projection.v1") {
    continuityProjection = {
      schema: "governed-memory-continuity-projection.v1",
      generatedAt: toIso(),
      workspaceId: summary.workspaceId,
      summary: continuityBridge.summary && typeof continuityBridge.summary === "object" ? continuityBridge.summary : {},
      tasks: Array.isArray(continuityBridge.tasks) ? continuityBridge.tasks : [],
    };
    writeJsonIfChanged(continuityProjectionPath, continuityProjection);
  }
  const fallbackReadinessArtifacts = buildAgiReadinessArtifacts({ workspaceRoot, items, continuityBridge });
  const readinessProjection = fallbackReadinessArtifacts.readiness;
  writeJsonIfChanged(readinessProjectionPath, readinessProjection);
  const promotionTrendProjection = fallbackReadinessArtifacts.promotionTrend;
  writeJsonIfChanged(promotionTrendProjectionPath, promotionTrendProjection);
  const blockedReasonsProjection = fallbackReadinessArtifacts.blockedReasons;
  writeJsonIfChanged(blockedReasonsProjectionPath, blockedReasonsProjection);
  const coverageProjection = fallbackReadinessArtifacts.coverage;
  writeJsonIfChanged(coverageProjectionPath, coverageProjection);
  const workspaceProgress = sanitizePublicValue(summary.workspaceProgress || {}, workspaceRoot);
  const workspaceProgressPublic = {
    schema: "governed-memory-workspace-progress-public.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    updatedAt: normalizePublicTimestamp(summary.workspaceProgressUpdatedAt),
    currentObjective: coerceSummaryText(workspaceProgress.currentObjective, workspaceRoot),
    currentMilestones: coerceSummaryList(workspaceProgress.currentMilestones, workspaceRoot, safeNumber(policy && policy.limits && policy.limits.maxMilestones, 6)),
    knownBlockers: coerceSummaryList(workspaceProgress.knownBlockers, workspaceRoot, safeNumber(policy && policy.limits && policy.limits.maxBlockers, 6)),
    knownRisks: coerceSummaryList(workspaceProgress.knownRisks, workspaceRoot, safeNumber(policy && policy.limits && policy.limits.maxRisks, 6)),
    recentTouchedPaths: uniqueStrings(workspaceProgress.recentTouchedPaths, safeNumber(policy && policy.limits && policy.limits.maxTouchedPaths, 8), 220).map((entry) => normalizePublicPath(workspaceRoot, entry)),
    nextRecommendedActions: coerceSummaryList(workspaceProgress.nextRecommendedActions, workspaceRoot, safeNumber(policy && policy.limits && policy.limits.maxNextActions, 6)),
    lastSuccessfulValidation: Array.isArray(workspaceProgress.lastSuccessfulValidation) ? workspaceProgress.lastSuccessfulValidation.slice(0, 2).map((entry) => ({
      reference: maskOpaqueId(entry && entry.turnId, "turn"),
      taskOutcomeStatus: safeString(entry && entry.taskOutcomeStatus, 80),
      completedAt: normalizePublicTimestamp(entry && entry.completedAt),
    })) : [],
    lastFailedValidation: Array.isArray(workspaceProgress.lastFailedValidation) ? workspaceProgress.lastFailedValidation.slice(0, 2).map((entry) => ({
      reference: maskOpaqueId(entry && entry.turnId, "turn"),
      taskOutcomeStatus: safeString(entry && entry.taskOutcomeStatus, 80),
      reason: coerceSummaryText(entry && entry.reason, workspaceRoot),
      completedAt: normalizePublicTimestamp(entry && entry.completedAt),
    })) : [],
  };
  if (!safeString(workspaceProgressPublic.updatedAt, 80)) {
    workspaceProgressPublic.updatedAtReason = "canonical_workspace_progress_updated_at_missing";
  }
  const latestPackPublic = {
    schema: "governed-memory-latest-pack-public.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    packId: safeString(summary.latestPack && summary.latestPack.packId, 120) || maskOpaqueId(`${summary.workspaceId}:${summary.latestPack && summary.latestPack.compiledAt}`, "pack"),
    latestPack: {
      generatedAt: safeString(summary.latestPack && summary.latestPack.generatedAt, 80),
      compiledAt: safeString(summary.latestPack && summary.latestPack.compiledAt, 80),
      activeAgent: safeString(summary.latestPack && summary.latestPack.activeAgent, 80),
      taskFamily: safeString(summary.latestPack && summary.latestPack.taskFamily, 80),
      selectedCount: clampInt(summary.latestPack && summary.latestPack.selectedCount, 0, 999999, 0),
      highConfidenceCount: clampInt(summary.latestPack && summary.latestPack.highConfidenceCount, 0, 999999, 0),
      reusedSelectedCount: clampInt(summary.latestPack && summary.latestPack.reusedSelectedCount, 0, 999999, 0),
      explicitTaskFamilyMismatchCount: clampInt(summary.latestPack && summary.latestPack.explicitTaskFamilyMismatchCount, 0, 999999, 0),
      sectionCounts: summary.latestPack && summary.latestPack.sectionCounts && typeof summary.latestPack.sectionCounts === "object" ? summary.latestPack.sectionCounts : {},
      selectedItems: (Array.isArray(pack && pack.items) ? pack.items : []).slice(0, safeNumber(policy && policy.limits && policy.limits.maxPackItems, 12)).map((entry) => sanitizePublicPackItem(entry, workspaceRoot, thresholds)),
    },
  };
  const promotionHealthPublic = {
    schema: "governed-memory-promotion-health-public.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    staleWarningCount: Array.isArray(summary.staleMemoryWarnings) ? summary.staleMemoryWarnings.length : 0,
    recentPromotions: Array.isArray(summary.recentPromotions) ? summary.recentPromotions.map((entry) => ({
      publicRef: maskOpaqueId(entry && entry.memoryId, "mem"),
      memoryType: safeString(entry && entry.memoryType, 80),
      status: safeString(entry && entry.status, 40),
      recordedAt: safeString(entry && entry.recordedAt, 80),
    })) : [],
    recentRevocations: Array.isArray(summary.recentRevocations) ? summary.recentRevocations.map((entry) => ({
      publicRef: maskOpaqueId(entry && entry.memoryId, "mem"),
      memoryType: safeString(entry && entry.memoryType, 80),
      status: safeString(entry && entry.status, 40),
      recordedAt: safeString(entry && entry.recordedAt, 80),
    })) : [],
  };
  const publicOverview = {
    schema: "governed-memory-public-overview.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    canonicalRoot: summary.canonicalRoot,
    publicOutputRoot: repoRelative(workspaceRoot, paths.publicOutput.root),
    canonicalEventCount: clampInt(summary.canonicalEventCount, 0, 999999, 0),
    itemCount: clampInt(summary.itemCount, 0, 999999, 0),
    promotedCount: clampInt(summary.promotedCount, 0, 999999, 0),
    typeCounts: summary.typeCounts,
    statusCounts: summary.statusCounts,
    workspaceProgressPath: repoRelative(workspaceRoot, paths.publicOutput.workspaceProgressJson),
    latestPackPath: repoRelative(workspaceRoot, paths.publicOutput.latestPackJson),
    promotionHealthPath: repoRelative(workspaceRoot, paths.publicOutput.promotionHealthJson),
    evalStatusPath: repoRelative(workspaceRoot, paths.publicOutput.memoryEvalStatusJson),
    compatibilityProjectionPaths: summary.compatibilityProjectionPaths,
    latestPack: {
      selectedCount: clampInt(summary.latestPack && summary.latestPack.selectedCount, 0, 999999, 0),
      highConfidenceCount: clampInt(summary.latestPack && summary.latestPack.highConfidenceCount, 0, 999999, 0),
      reusedSelectedCount: clampInt(summary.latestPack && summary.latestPack.reusedSelectedCount, 0, 999999, 0),
      explicitTaskFamilyMismatchCount: clampInt(summary.latestPack && summary.latestPack.explicitTaskFamilyMismatchCount, 0, 999999, 0),
      activeAgent: safeString(summary.latestPack && summary.latestPack.activeAgent, 80),
      taskFamily: safeString(summary.latestPack && summary.latestPack.taskFamily, 80),
      sectionCounts: summary.latestPack && summary.latestPack.sectionCounts && typeof summary.latestPack.sectionCounts === "object" ? summary.latestPack.sectionCounts : {},
    },
    staleWarningCount: Array.isArray(summary.staleMemoryWarnings) ? summary.staleMemoryWarnings.length : 0,
  };
  const openAIBlogLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "OpenAI Developers Blog",
    sourceTier: "external_primary",
    laneKey: "openai_primary",
    items,
    pack,
    statePath: "output/openai_blog_self_improvement_state.json",
    ledgerPath: "output/openai_blog_learning_ledger.json",
    digestPath: "output/openai_blog_learning_digest.json",
    reportPath: "output/openai_blog_learning_report.md",
    proposalDir: "output/openai_blog_self_improvement_proposals",
    curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
    observationProjection,
  });
  const anthropicLane = buildLaneProjection({
    workspaceRoot,
    sourceName: "Anthropic Engineering",
    sourceTier: "external_secondary",
    laneKey: "anthropic_secondary",
    items,
    pack,
    statePath: "output/anthropic_engineering_self_improvement_state.json",
    ledgerPath: "output/anthropic_engineering_learning_ledger.json",
    digestPath: "output/anthropic_engineering_learning_digest.json",
    reportPath: "output/anthropic_engineering_learning_report.md",
    proposalDir: "output/anthropic_engineering_self_improvement_proposals",
    curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
    observationProjection,
  });
  const continuityArtifacts = buildContinuityPublicArtifacts({ workspaceRoot, continuityBridge, retrievalPacks });
  const readinessArtifacts = {
    readiness: readinessProjection && typeof readinessProjection === "object" ? readinessProjection : fallbackReadinessArtifacts.readiness,
    coverage: coverageProjection && typeof coverageProjection === "object" ? coverageProjection : fallbackReadinessArtifacts.coverage,
    promotionTrend: promotionTrendProjection && typeof promotionTrendProjection === "object" ? promotionTrendProjection : fallbackReadinessArtifacts.promotionTrend,
    blockedReasons: blockedReasonsProjection && typeof blockedReasonsProjection === "object" ? blockedReasonsProjection : fallbackReadinessArtifacts.blockedReasons,
  };
  let evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary,
    pack,
    items,
    openAIBlogLane,
    anthropicLane,
    observationProjection,
    continuityArtifacts,
    readinessArtifacts,
  });
  let bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: evalStatus,
    readinessArtifacts,
    continuityArtifacts,
    openAIBlogLane,
    anthropicLane,
  });
  readinessArtifacts.bottlenecks = bottlenecks;
  const readinessConsistencyChecks = buildReadinessConsistencyChecks({
    readiness: readinessArtifacts.readiness,
    coverage: readinessArtifacts.coverage,
    blockedReasons: readinessArtifacts.blockedReasons,
    bottlenecks,
  });
  readinessArtifacts.readiness.consistencyChecks = readinessConsistencyChecks;
  writeJsonIfChanged(readinessProjectionPath, readinessArtifacts.readiness);
  writeJsonIfChanged(blockedReasonsProjectionPath, readinessArtifacts.blockedReasons);
  writeJsonIfChanged(bottlenecksProjectionPath, bottlenecks);
  evalStatus = evaluateMemoryPublicSuite({
    workspaceRoot,
    paths,
    summary,
    pack,
    items,
    openAIBlogLane,
    anthropicLane,
    observationProjection,
    continuityArtifacts,
    readinessArtifacts,
  });
  bottlenecks = buildNextBottlenecks({
    workspaceRoot,
    memoryEval: evalStatus,
    readinessArtifacts,
    continuityArtifacts,
    openAIBlogLane,
    anthropicLane,
  });
  readinessArtifacts.bottlenecks = bottlenecks;
  writeJsonIfChanged(bottlenecksProjectionPath, bottlenecks);
  const exportManifest = {
    schema: "governed-memory-public-export-manifest.v1",
    generatedAt: toIso(),
    workspaceId: summary.workspaceId,
    sourceMode: "redacted_live_export",
    canonicalReuseVerified: clampInt(summary.latestPack && summary.latestPack.reusedSelectedCount, 0, 999999, 0) > 0,
    regenerateCommands: {
      liveRedactedExport: "npm run artifact:memory-public",
      deterministicSampleExport: "npm run artifact:memory-public:sample",
    },
    outputs: {
      latestOverviewJson: repoRelative(workspaceRoot, paths.publicOutput.latestOverviewJson),
      latestOverviewMd: repoRelative(workspaceRoot, paths.publicOutput.latestOverviewMd),
      workspaceProgressJson: repoRelative(workspaceRoot, paths.publicOutput.workspaceProgressJson),
      latestPackJson: repoRelative(workspaceRoot, paths.publicOutput.latestPackJson),
      promotionHealthJson: repoRelative(workspaceRoot, paths.publicOutput.promotionHealthJson),
      memoryEvalStatusJson: repoRelative(workspaceRoot, paths.publicOutput.memoryEvalStatusJson),
      memoryEvalStatusMd: repoRelative(workspaceRoot, paths.publicOutput.memoryEvalStatusMd),
      openAIBlogLaneJson: repoRelative(workspaceRoot, paths.publicOutput.openAIBlogLaneJson),
      anthropicLaneJson: repoRelative(workspaceRoot, paths.publicOutput.anthropicLaneJson),
      agiReadinessJson: repoRelative(workspaceRoot, paths.agiReadiness.latestJson),
      agiReadinessMd: repoRelative(workspaceRoot, paths.agiReadiness.latestMd),
      domainCoverageMatrixJson: repoRelative(workspaceRoot, paths.agiReadiness.domainCoverageMatrixJson),
      promotionTrendJson: repoRelative(workspaceRoot, paths.agiReadiness.promotionTrendJson),
      blockedReasonsJson: repoRelative(workspaceRoot, paths.agiReadiness.blockedReasonsJson),
      nextBottlenecksJson: repoRelative(workspaceRoot, paths.agiReadiness.nextBottlenecksJson),
      nextBottlenecksMd: repoRelative(workspaceRoot, paths.agiReadiness.nextBottlenecksMd),
      continuityPublicJson: repoRelative(workspaceRoot, paths.continuityPublic.latestSummaryJson),
      continuityPublicMd: repoRelative(workspaceRoot, paths.continuityPublic.latestSummaryMd),
    },
  };
  return {
    paths,
    summary,
    publicOverview,
    workspaceProgressPublic,
    latestPackPublic,
    promotionHealthPublic,
    evalStatus,
    openAIBlogLane,
    anthropicLane,
    observationProjection,
    continuityArtifacts,
    readinessArtifacts,
    bottlenecks,
    exportManifest,
  };
}

function exportGovernedMemoryPublicArtifacts({ workspaceRoot = workspaceRootDefault } = {}) {
  const artifacts = buildGovernedMemoryPublicArtifacts({ workspaceRoot });
  const { paths } = artifacts;
  ensureDir(paths.publicOutput.root);
  writeJsonIfChanged(paths.publicOutput.latestOverviewJson, artifacts.publicOverview);
  fs.writeFileSync(paths.publicOutput.latestOverviewMd, renderPublicOverviewMarkdown({
    overview: artifacts.publicOverview,
    workspaceProgress: artifacts.workspaceProgressPublic,
    latestPack: artifacts.latestPackPublic,
    promotionHealth: artifacts.promotionHealthPublic,
    evalStatus: artifacts.evalStatus,
    openAIBlogLane: artifacts.openAIBlogLane,
    anthropicLane: artifacts.anthropicLane,
  }), "utf8");
  writeJsonIfChanged(paths.publicOutput.workspaceProgressJson, artifacts.workspaceProgressPublic);
  writeJsonIfChanged(paths.publicOutput.latestPackJson, artifacts.latestPackPublic);
  writeJsonIfChanged(paths.publicOutput.promotionHealthJson, artifacts.promotionHealthPublic);
  writeJsonIfChanged(paths.publicOutput.memoryEvalStatusJson, artifacts.evalStatus);
  fs.writeFileSync(paths.publicOutput.memoryEvalStatusMd, renderMemoryEvalMarkdown(artifacts.evalStatus), "utf8");
  writeJsonIfChanged(paths.publicOutput.openAIBlogLaneJson, artifacts.openAIBlogLane);
  writeJsonIfChanged(paths.publicOutput.anthropicLaneJson, artifacts.anthropicLane);
  ensureDir(paths.agiReadiness.root);
  writeJsonIfChanged(paths.agiReadiness.latestJson, artifacts.readinessArtifacts.readiness);
  fs.writeFileSync(
    paths.agiReadiness.latestMd,
    renderAgiReadinessMarkdown(
      artifacts.readinessArtifacts.readiness,
      artifacts.readinessArtifacts.coverage,
      artifacts.readinessArtifacts.blockedReasons,
      artifacts.bottlenecks
    ),
    "utf8"
  );
  writeJsonIfChanged(paths.agiReadiness.domainCoverageMatrixJson, artifacts.readinessArtifacts.coverage);
  writeJsonIfChanged(paths.agiReadiness.promotionTrendJson, artifacts.readinessArtifacts.promotionTrend);
  writeJsonIfChanged(paths.agiReadiness.blockedReasonsJson, artifacts.readinessArtifacts.blockedReasons);
  writeJsonIfChanged(paths.agiReadiness.nextBottlenecksJson, artifacts.bottlenecks);
  fs.writeFileSync(paths.agiReadiness.nextBottlenecksMd, renderNextBottlenecksMarkdown(artifacts.bottlenecks), "utf8");
  ensureDir(paths.continuityPublic.root);
  writeJsonIfChanged(paths.continuityPublic.latestSummaryJson, artifacts.continuityArtifacts.artifact);
  fs.writeFileSync(paths.continuityPublic.latestSummaryMd, artifacts.continuityArtifacts.markdown, "utf8");
  writeJsonIfChanged(paths.publicOutput.exportManifestJson, artifacts.exportManifest);
  return artifacts;
}

module.exports = {
  buildGovernedMemoryPublicArtifacts,
  buildGovernedMemoryRuntimeSnapshot,
  exportGovernedMemoryPublicArtifacts,
  getMemoryPaths,
  loadPersistedGovernedMemoryState,
  syncGovernedMemoryGraph,
};
