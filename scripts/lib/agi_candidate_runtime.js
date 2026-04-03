"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ensureDir, readJsonIfExists, writeJsonFile, repoRelative } = require("./logging_surface");
const { assertEvalLaneAccess, loadEvalLanePolicy, loadEvalSuiteForLane } = require("./eval_lane_policy");
const { loadAgiV1ProfileConfig, buildAgiV1PromotionDecision } = require("./agi_v1_profile");

const defaultKnowledgeSystemPolicyPath = path.join(__dirname, "..", "config", "knowledge_system_policy.json");
const defaultToolRegistryManifestPath = path.join(__dirname, "..", "config", "tool_registry_manifest.json");
const defaultModelRoutingPolicyPath = path.join(__dirname, "..", "config", "model_routing_policy.json");
const defaultAutonomyRiskPolicyPath = path.join(__dirname, "..", "config", "autonomy_risk_policy.json");
const defaultClaimGatePolicyPath = path.join(__dirname, "..", "config", "agi_claim_gate_policy.json");

function safeString(value, max = 4000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function nowIso(value = Date.now()) {
  const parsed = Number(value);
  return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString();
}

function uniqueStrings(values, max = 32) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 320);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function slugify(value, fallback = "item", max = 80) {
  const raw = safeString(value, 200).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (raw || fallback).slice(0, max);
}

function parseJson(filePath, fallback = null) {
  const payload = readJsonIfExists(filePath);
  return payload === null ? fallback : payload;
}

function writeJson(targetPath, payload) {
  ensureDir(path.dirname(targetPath));
  writeJsonFile(targetPath, payload);
}

function appendJsonLine(targetPath, payload) {
  ensureDir(path.dirname(targetPath));
  fs.appendFileSync(targetPath, `${JSON.stringify(payload)}\n`, "utf8");
}

function resolveWorkspacePath(workspaceRoot, candidate, fallbackRelative = "") {
  const raw = safeString(candidate, 800) || safeString(fallbackRelative, 800);
  if (!raw) return "";
  return path.isAbsolute(raw) ? path.normalize(raw) : path.join(workspaceRoot, raw);
}

function parseTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(0, Math.trunc(numeric));
  const parsed = Date.parse(safeString(value, 160));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJsonFileChecked(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeKnowledgeSystemPolicy(input, { workspaceRoot }) {
  const payload = input && typeof input === "object" ? input : {};
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "knowledge-system-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    workspaceRoot,
    knowledgeRoot: resolveWorkspacePath(workspaceRoot, payload.knowledgeRoot, "logs/archive/raw/knowledge_store"),
    indexPath: resolveWorkspacePath(workspaceRoot, payload.indexPath, "logs/archive/raw/knowledge_store/knowledge_index.json"),
    archivePath: resolveWorkspacePath(workspaceRoot, payload.archivePath, "logs/archive/raw/knowledge_store/archive/knowledge_archive.jsonl"),
    journalPath: resolveWorkspacePath(workspaceRoot, payload.journalPath, "logs/archive/raw/knowledge_store/knowledge_journal.jsonl"),
    retrievalEvalHistoryPath: resolveWorkspacePath(workspaceRoot, payload.retrievalEvalHistoryPath, "logs/archive/raw/knowledge_store/retrieval_eval_history.jsonl"),
    generatedSkillRegistryPath: resolveWorkspacePath(workspaceRoot, payload.generatedSkillRegistryPath, "scripts/config/generated_skill_registry.json"),
    generatedSkillsRoot: resolveWorkspacePath(workspaceRoot, payload.generatedSkillsRoot, ".agents/skills/generated"),
    generatedSkillArchivePath: resolveWorkspacePath(workspaceRoot, payload.generatedSkillArchivePath, "logs/archive/raw/knowledge_store/archive/generated_skill_archive.jsonl"),
    runtimeToolRegistryPath: resolveWorkspacePath(workspaceRoot, payload.runtimeToolRegistryPath, "logs/archive/raw/knowledge_store/runtime_tool_registry.json"),
    runtimeToolRegistryHistoryPath: resolveWorkspacePath(workspaceRoot, payload.runtimeToolRegistryHistoryPath, "logs/archive/raw/knowledge_store/runtime_tool_registry_history.jsonl"),
    retrieval: Object.freeze({
      maxEntries: Math.max(1, Math.trunc(Number(payload.retrieval && payload.retrieval.maxEntries) || 6)),
      maxChars: Math.max(400, Math.trunc(Number(payload.retrieval && payload.retrieval.maxChars) || 2400)),
      staleAfterDays: Math.max(1, Math.trunc(Number(payload.retrieval && payload.retrieval.staleAfterDays) || 45)),
      minimumTrustLevel: safeString(payload.retrieval && payload.retrieval.minimumTrustLevel, 40) || "medium",
    }),
    promotion: Object.freeze({
      allowedTrustLevels: uniqueStrings(payload.promotion && payload.promotion.allowedTrustLevels, 8),
      archiveAfterDays: Math.max(1, Math.trunc(Number(payload.promotion && payload.promotion.archiveAfterDays) || 120)),
      pruneAfterDays: Math.max(1, Math.trunc(Number(payload.promotion && payload.promotion.pruneAfterDays) || 240)),
    }),
    readWritePolicy: Object.freeze({
      writableActors: uniqueStrings(payload.readWritePolicy && payload.readWritePolicy.writableActors, 16),
      readableActors: uniqueStrings(payload.readWritePolicy && payload.readWritePolicy.readableActors, 16),
      protectedKinds: uniqueStrings(payload.readWritePolicy && payload.readWritePolicy.protectedKinds, 16),
    }),
  });
}

function loadKnowledgePolicy(filePath = defaultKnowledgeSystemPolicyPath, { workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  return normalizeKnowledgeSystemPolicy(payload, { workspaceRoot });
}

function ensureKnowledgeStore(policy) {
  ensureDir(policy.knowledgeRoot);
  ensureDir(path.dirname(policy.indexPath));
  ensureDir(path.dirname(policy.archivePath));
  ensureDir(path.dirname(policy.journalPath));
  ensureDir(path.dirname(policy.retrievalEvalHistoryPath));
  ensureDir(path.dirname(policy.generatedSkillRegistryPath));
  ensureDir(policy.generatedSkillsRoot);
  ensureDir(path.dirname(policy.generatedSkillArchivePath));
  ensureDir(path.dirname(policy.runtimeToolRegistryPath));
  ensureDir(path.dirname(policy.runtimeToolRegistryHistoryPath));
  if (!fs.existsSync(policy.indexPath)) {
    writeJson(policy.indexPath, {
      schema: "knowledge-index.v1",
      generatedAt: nowIso(),
      entries: [],
    });
  }
  if (!fs.existsSync(policy.generatedSkillRegistryPath)) {
    writeJson(policy.generatedSkillRegistryPath, {
      schema: "generated-skill-registry.v1",
      generatedAt: nowIso(),
      skills: [],
    });
  }
}

function loadKnowledgeIndex(policy) {
  ensureKnowledgeStore(policy);
  const payload = parseJson(policy.indexPath, {});
  return {
    schema: safeString(payload.schema, 120) || "knowledge-index.v1",
    generatedAt: safeString(payload.generatedAt, 80) || nowIso(),
    entries: ensureArray(payload.entries),
  };
}

function writeKnowledgeIndex(policy, index) {
  writeJson(policy.indexPath, {
    schema: "knowledge-index.v1",
    generatedAt: nowIso(),
    entries: ensureArray(index && index.entries),
  });
}

function registerKnowledgeVersion({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  key,
  title = "",
  kind = "knowledge_note",
  content = "",
  sources = [],
  trustLevel = "medium",
  freshness = "current",
  actor = "runtime",
} = {}) {
  const policy = loadKnowledgePolicy(undefined, { workspaceRoot });
  ensureKnowledgeStore(policy);
  const index = loadKnowledgeIndex(policy);
  const normalizedKey = safeString(key, 160) || `knowledge-${Date.now()}`;
  const versionId = `${normalizedKey}-${Date.now()}`;
  const entryDir = path.join(policy.knowledgeRoot, normalizedKey);
  const versionPath = path.join(entryDir, `${versionId}.json`);
  ensureDir(entryDir);
  const record = {
    schema: "knowledge-record.v1",
    versionId,
    key: normalizedKey,
    title: safeString(title, 240) || normalizedKey,
    kind: safeString(kind, 80) || "knowledge_note",
    trustLevel: safeString(trustLevel, 40) || "medium",
    freshness: safeString(freshness, 40) || "current",
    content: safeString(content, 12000),
    sources: ensureArray(sources).map((entry) => ({
      source: safeString(entry && entry.source, 320),
      citation: safeString(entry && entry.citation, 1000),
      observedAt: safeString(entry && entry.observedAt, 80) || nowIso(),
    })),
    actor: safeString(actor, 80) || "runtime",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  writeJson(versionPath, record);
  const nextEntries = ensureArray(index.entries).filter((entry) => safeString(entry && entry.key, 160) !== normalizedKey);
  nextEntries.push({
    key: normalizedKey,
    latestVersionId: versionId,
    latestPath: repoRelative(workspaceRoot, versionPath),
    title: record.title,
    kind: record.kind,
    trustLevel: record.trustLevel,
    freshness: record.freshness,
    sources: record.sources.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
  writeKnowledgeIndex(policy, { entries: nextEntries });
  appendJsonLine(policy.journalPath, {
    schema: "knowledge-journal-entry.v1",
    recordedAt: nowIso(),
    action: "register",
    key: normalizedKey,
    versionId,
    actor: record.actor,
    path: repoRelative(workspaceRoot, versionPath),
  });
  return { ok: true, key: normalizedKey, versionId, path: repoRelative(workspaceRoot, versionPath) };
}

function retrieveKnowledgeSlice({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  objective = "",
  familyId = "",
  limit = null,
} = {}) {
  const policy = loadKnowledgePolicy(undefined, { workspaceRoot });
  const index = loadKnowledgeIndex(policy);
  const requestedLimit = Math.max(1, Math.trunc(Number(limit) || policy.retrieval.maxEntries));
  const terms = uniqueStrings([
    ...safeString(objective, 2000).toLowerCase().split(/[^a-z0-9_]+/g),
    ...safeString(familyId, 120).toLowerCase().split(/[^a-z0-9_]+/g),
  ], 32);
  const ranked = ensureArray(index.entries).map((entry) => {
    const fullPath = resolveWorkspacePath(workspaceRoot, entry && entry.latestPath);
    const record = parseJson(fullPath, {});
    const haystack = [
      safeString(record && record.title, 400),
      safeString(record && record.content, 4000),
      safeString(entry && entry.kind, 80),
    ].join(" ").toLowerCase();
    const score = terms.reduce((sum, term) => (term && haystack.includes(term) ? sum + 1 : sum), 0);
    return {
      key: safeString(entry && entry.key, 160),
      versionId: safeString(entry && entry.latestVersionId, 160),
      path: repoRelative(workspaceRoot, fullPath),
      trustLevel: safeString(entry && entry.trustLevel, 40),
      freshness: safeString(entry && entry.freshness, 40),
      title: safeString(record && record.title, 240) || safeString(entry && entry.title, 240),
      excerpt: safeString(record && record.content, 1200),
      score,
      updatedAt: safeString(entry && entry.updatedAt, 80),
    };
  }).filter((entry) => entry.score > 0 || !terms.length)
    .sort((left, right) => right.score - left.score || parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt))
    .slice(0, requestedLimit);
  const compacted = [];
  let usedChars = 0;
  for (const entry of ranked) {
    const remaining = Math.max(0, policy.retrieval.maxChars - usedChars);
    if (!remaining) break;
    const excerpt = safeString(entry.excerpt, remaining);
    compacted.push({ ...entry, excerpt });
    usedChars += excerpt.length;
  }
  return {
    schema: "knowledge-retrieval-slice.v1",
    generatedAt: nowIso(),
    objective: safeString(objective, 1200),
    familyId: safeString(familyId, 120),
    totalChars: usedChars,
    entries: compacted,
  };
}

function evaluateRetrievalQuality({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  objective = "",
  familyId = "",
  retrievalSlice = null,
  expectedKeys = [],
} = {}) {
  const policy = loadKnowledgePolicy(undefined, { workspaceRoot });
  const slice = retrievalSlice && typeof retrievalSlice === "object"
    ? retrievalSlice
    : retrieveKnowledgeSlice({ workspaceRoot, objective, familyId });
  const expected = uniqueStrings(expectedKeys, 16);
  const retrievedKeys = ensureArray(slice.entries).map((entry) => safeString(entry && entry.key, 160)).filter(Boolean);
  const matched = expected.filter((entry) => retrievedKeys.includes(entry));
  const precision = retrievedKeys.length ? matched.length / retrievedKeys.length : 0;
  const recall = expected.length ? matched.length / expected.length : 0;
  const report = {
    schema: "retrieval-quality-report.v1",
    generatedAt: nowIso(),
    objective: safeString(objective, 1200),
    familyId: safeString(familyId, 120),
    expectedKeys: expected,
    retrievedKeys,
    matchedKeys: matched,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    score: Number((((precision + recall) / 2)).toFixed(4)),
    unsupportedCitationCount: ensureArray(slice.entries).filter((entry) => !safeString(entry && entry.path, 320)).length,
  };
  appendJsonLine(policy.retrievalEvalHistoryPath, report);
  return report;
}

function archiveKnowledgeEntries({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  keys = [],
  reason = "archive",
} = {}) {
  const policy = loadKnowledgePolicy(undefined, { workspaceRoot });
  const index = loadKnowledgeIndex(policy);
  const targets = new Set(uniqueStrings(keys, 64));
  const kept = [];
  let archivedCount = 0;
  for (const entry of ensureArray(index.entries)) {
    const key = safeString(entry && entry.key, 160);
    if (!targets.has(key)) {
      kept.push(entry);
      continue;
    }
    archivedCount += 1;
    appendJsonLine(policy.archivePath, {
      schema: "knowledge-archive-entry.v1",
      recordedAt: nowIso(),
      reason: safeString(reason, 320),
      entry,
    });
  }
  writeKnowledgeIndex(policy, { entries: kept });
  appendJsonLine(policy.journalPath, {
    schema: "knowledge-journal-entry.v1",
    recordedAt: nowIso(),
    action: "archive",
    keys: Array.from(targets),
    reason: safeString(reason, 320),
  });
  return { ok: true, archivedCount, archivePath: repoRelative(workspaceRoot, policy.archivePath) };
}

function loadGeneratedSkillRegistry({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
} = {}) {
  const policy = loadKnowledgePolicy(undefined, { workspaceRoot });
  ensureKnowledgeStore(policy);
  const payload = parseJson(policy.generatedSkillRegistryPath, {});
  return {
    schema: safeString(payload.schema, 120) || "generated-skill-registry.v1",
    generatedAt: safeString(payload.generatedAt, 80) || nowIso(),
    skills: ensureArray(payload.skills),
  };
}

function writeGeneratedSkillRegistry(policy, registry) {
  writeJson(policy.generatedSkillRegistryPath, {
    schema: "generated-skill-registry.v1",
    generatedAt: nowIso(),
    skills: ensureArray(registry && registry.skills),
  });
}

function registerGeneratedSkill({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  id,
  title,
  trigger = "",
  description = "",
  deterministicPart = "",
  contextualReasoning = "",
  tests = [],
} = {}) {
  const policy = loadKnowledgePolicy(undefined, { workspaceRoot });
  ensureKnowledgeStore(policy);
  const registry = loadGeneratedSkillRegistry({ workspaceRoot });
  const skillId = slugify(id || title, "generated-skill", 120);
  const skillDir = path.join(policy.generatedSkillsRoot, skillId);
  const skillPath = path.join(skillDir, "SKILL.md");
  ensureDir(skillDir);
  const body = [
    `# ${safeString(title, 120) || skillId}`,
    "",
    "## Trigger",
    safeString(trigger, 400) || "generated skill trigger",
    "",
    "## Description",
    safeString(description, 1000) || "Generated reusable skill.",
    "",
    "## Deterministic Part",
    safeString(deterministicPart, 2000) || "No deterministic section recorded.",
    "",
    "## Contextual Reasoning Part",
    safeString(contextualReasoning, 2000) || "No contextual reasoning section recorded.",
    "",
    "## Tests",
    ...ensureArray(tests).map((entry) => `- ${safeString(entry, 200)}`),
    "",
  ].join("\n");
  fs.writeFileSync(skillPath, body, "utf8");
  const skills = ensureArray(registry.skills).filter((entry) => safeString(entry && entry.id, 120) !== skillId);
  skills.push({
    id: skillId,
    title: safeString(title, 120) || skillId,
    path: repoRelative(workspaceRoot, skillPath),
    trigger: safeString(trigger, 400),
    description: safeString(description, 1000),
    deterministicPart: safeString(deterministicPart, 2000),
    contextualReasoning: safeString(contextualReasoning, 2000),
    tests: uniqueStrings(tests, 16),
    generatedAt: nowIso(),
  });
  writeGeneratedSkillRegistry(policy, { skills });
  appendJsonLine(policy.generatedSkillArchivePath.replace("generated_skill_archive", "generated_skill_journal"), {
    schema: "generated-skill-journal-entry.v1",
    recordedAt: nowIso(),
    action: "register",
    id: skillId,
    path: repoRelative(workspaceRoot, skillPath),
  });
  return { ok: true, id: skillId, path: repoRelative(workspaceRoot, skillPath) };
}

function pruneGeneratedSkills({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  ids = [],
  reason = "prune",
} = {}) {
  const policy = loadKnowledgePolicy(undefined, { workspaceRoot });
  const registry = loadGeneratedSkillRegistry({ workspaceRoot });
  const targets = new Set(uniqueStrings(ids, 64));
  const kept = [];
  let archivedCount = 0;
  for (const entry of ensureArray(registry.skills)) {
    const id = safeString(entry && entry.id, 120);
    if (!targets.has(id)) {
      kept.push(entry);
      continue;
    }
    archivedCount += 1;
    appendJsonLine(policy.generatedSkillArchivePath, {
      schema: "generated-skill-archive-entry.v1",
      recordedAt: nowIso(),
      reason: safeString(reason, 320),
      entry,
    });
  }
  writeGeneratedSkillRegistry(policy, { skills: kept });
  return { ok: true, archivedCount, archivePath: repoRelative(workspaceRoot, policy.generatedSkillArchivePath) };
}

function loadToolRegistryManifest(filePath = defaultToolRegistryManifestPath) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  return {
    schema: safeString(payload.schema, 120) || "tool-registry-manifest.v1",
    generatedAt: safeString(payload.generatedAt, 80) || nowIso(),
    tools: ensureArray(payload.tools),
  };
}

function loadRuntimeToolRegistry({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
} = {}) {
  const policy = loadKnowledgePolicy(undefined, { workspaceRoot });
  ensureKnowledgeStore(policy);
  const manifest = loadToolRegistryManifest();
  const runtime = parseJson(policy.runtimeToolRegistryPath, null);
  if (runtime && Array.isArray(runtime.tools)) return runtime;
  writeJson(policy.runtimeToolRegistryPath, manifest);
  return manifest;
}

function writeRuntimeToolRegistry(policy, registry) {
  writeJson(policy.runtimeToolRegistryPath, {
    schema: "tool-registry-manifest.v1",
    generatedAt: nowIso(),
    tools: ensureArray(registry && registry.tools),
  });
}

function computeToolReliabilityScore(tool) {
  const current = Number(tool && tool.reliabilityScore);
  if (Number.isFinite(current)) return Number(Math.max(0, Math.min(1, current)).toFixed(4));
  return safeString(tool && tool.status, 40) === "sandbox" ? 0.6 : 0.8;
}

function registerToolCandidate({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  id,
  capability,
  wrapperTests = [],
  fallbackMode = "degraded",
  riskTier = "medium",
} = {}) {
  const policy = loadKnowledgePolicy(undefined, { workspaceRoot });
  const registry = loadRuntimeToolRegistry({ workspaceRoot });
  const toolId = slugify(id, "tool", 120);
  const nextTools = ensureArray(registry.tools).filter((entry) => safeString(entry && entry.id, 120) !== toolId);
  const candidate = {
    id: toolId,
    capability: safeString(capability, 240),
    riskTier: safeString(riskTier, 40) || "medium",
    wrapperTests: uniqueStrings(wrapperTests, 16),
    reliabilityScore: 0.5,
    status: "sandbox",
    fallbackMode: safeString(fallbackMode, 80) || "degraded",
    registeredAt: nowIso(),
  };
  nextTools.push(candidate);
  writeRuntimeToolRegistry(policy, { tools: nextTools });
  appendJsonLine(policy.runtimeToolRegistryHistoryPath, {
    schema: "runtime-tool-registry-history.v1",
    recordedAt: nowIso(),
    action: "register",
    tool: candidate,
  });
  return { ok: true, tool: candidate };
}

function loadModelRoutingPolicy(filePath = defaultModelRoutingPolicyPath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function routeModel({
  role = "",
  familyId = "",
  budgetTier = "standard",
} = {}) {
  const policy = loadModelRoutingPolicy();
  const roleId = safeString(role, 80) || "executor";
  const family = safeString(familyId, 120);
  const budget = safeString(budgetTier, 80) || "standard";
  const familyOverride = ensureArray(policy.familyOverrides).find((entry) => safeString(entry && entry.familyId, 120) === family);
  const roleRoute = ensureArray(policy.roles).find((entry) => safeString(entry && entry.role, 80) === roleId);
  const budgetPolicy = ensureArray(policy.budgetPolicies).find((entry) => safeString(entry && entry.budgetTier, 80) === budget);
  const modelId = safeString(familyOverride && familyOverride.modelId, 120)
    || safeString(roleRoute && roleRoute.modelId, 120)
    || safeString(policy.defaultModelId, 120)
    || "gpt-5.4";
  return {
    schema: "model-routing-decision.v1",
    generatedAt: nowIso(),
    role: roleId,
    familyId: family,
    budgetTier: budget,
    modelId,
    reasoningEffort: safeString((familyOverride && familyOverride.reasoningEffort) || (roleRoute && roleRoute.reasoningEffort) || policy.defaultReasoningEffort, 40) || "medium",
    fallbackModelId: safeString((budgetPolicy && budgetPolicy.fallbackModelId) || policy.fallbackModelId, 120) || "gpt-5.4-mini",
    rationale: [
      `role=${roleId}`,
      family ? `family=${family}` : "family=default",
      `budgetTier=${budget}`,
    ],
  };
}

function packageAdaptationDataset({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  title = "",
  traces = [],
  disagreementSet = [],
} = {}) {
  const outputRoot = path.join(workspaceRoot, "output", "adaptation");
  ensureDir(outputRoot);
  const datasetId = slugify(title || "adaptation-dataset", "adaptation-dataset", 120);
  const datasetPath = path.join(outputRoot, `${datasetId}-${Date.now()}.json`);
  const payload = {
    schema: "adaptation-dataset.v1",
    generatedAt: nowIso(),
    title: safeString(title, 240) || datasetId,
    traces: ensureArray(traces),
    disagreementSet: ensureArray(disagreementSet),
  };
  writeJson(datasetPath, payload);
  return { ok: true, datasetPath: repoRelative(workspaceRoot, datasetPath), datasetId };
}

function createAdaptationJobSpec({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  datasetPath = "",
  familyId = "",
  role = "",
} = {}) {
  const outputRoot = path.join(workspaceRoot, "output", "adaptation");
  ensureDir(outputRoot);
  const specPath = path.join(outputRoot, `adaptation-job-${Date.now()}.json`);
  const payload = {
    schema: "adaptation-job-spec.v1",
    generatedAt: nowIso(),
    datasetPath: safeString(datasetPath, 400),
    familyId: safeString(familyId, 120),
    role: safeString(role, 80),
    promotionGate: "eval_before_promotion",
  };
  writeJson(specPath, payload);
  return { ok: true, specPath: repoRelative(workspaceRoot, specPath) };
}

function evaluateAdaptationCandidate({
  baselineScore = 0,
  candidateScore = 0,
} = {}) {
  const baseline = Number(baselineScore) || 0;
  const candidate = Number(candidateScore) || 0;
  return {
    schema: "adaptation-candidate-eval.v1",
    generatedAt: nowIso(),
    baselineScore: baseline,
    candidateScore: candidate,
    delta: Number((candidate - baseline).toFixed(4)),
    promote: candidate >= baseline ? 1 : 0,
  };
}

function loadRawEvalSuiteForLane({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  laneId,
  actor = "developer",
  env = process.env,
} = {}) {
  const policy = loadEvalLanePolicy(undefined, { workspaceRoot });
  const lane = assertEvalLaneAccess({ policy, laneId, actor, env, accessMode: "read" });
  const suitePath = Array.isArray(lane && lane.suitePaths) ? lane.suitePaths[0] : "";
  const suite = parseJsonFileChecked(suitePath, { cases: [] });
  return { policy, lane, suite };
}

function exportHumanBaselineTasks({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  laneId = "agi_readiness_public",
  actor = "developer",
} = {}) {
  const { suite } = loadRawEvalSuiteForLane({ workspaceRoot, laneId, actor });
  const outputRoot = path.join(workspaceRoot, "output", "human_baseline");
  ensureDir(outputRoot);
  const exportPath = path.join(outputRoot, `${laneId}-task-export.json`);
  const payload = {
    schema: "human-baseline-task-export.v1",
    generatedAt: nowIso(),
    laneId,
    tasks: ensureArray(suite.cases).map((entry) => ({
      caseId: safeString(entry && entry.id, 120),
      title: safeString(entry && entry.title, 240),
      familyId: safeString(entry && entry.familyId, 120),
      difficultyTier: safeString(entry && entry.difficultyTier, 80),
      humanComparableTaskFraming: safeString(entry && entry.humanComparableTaskFraming, 1200),
      objective: safeString(entry && entry.objective, 1200),
      acceptanceCriteria: ensureArray(entry && entry.acceptanceCriteria),
      humanProfile: entry && entry.humanProfile ? entry.humanProfile : {},
    })),
  };
  writeJson(exportPath, payload);
  return { ok: true, exportPath: repoRelative(workspaceRoot, exportPath), taskCount: payload.tasks.length };
}

function importHumanBaselineRuns({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  importPath,
} = {}) {
  const fullPath = resolveWorkspacePath(workspaceRoot, importPath);
  const payload = parseJsonFileChecked(fullPath, null);
  if (!payload) throw new Error(`human_baseline_import_missing:${fullPath}`);
  return {
    schema: safeString(payload.schema, 120) || "human-baseline-runs.v1",
    generatedAt: safeString(payload.generatedAt, 80) || nowIso(),
    runs: ensureArray(payload.runs),
  };
}

function compareAiToHuman({
  aiResults = [],
  humanRuns = [],
} = {}) {
  const humanByCase = new Map(ensureArray(humanRuns).map((entry) => [safeString(entry && entry.caseId, 120), entry]));
  const comparisons = ensureArray(aiResults).map((entry) => {
    const caseId = safeString(entry && entry.caseId, 120);
    const human = humanByCase.get(caseId);
    const aiScore = Number(entry && entry.score) || 0;
    const humanScore = Number(human && human.score) || 0;
    return {
      caseId,
      familyId: safeString(entry && entry.familyId, 120),
      aiScore,
      humanScore,
      normalizedDelta: Number((aiScore - humanScore).toFixed(4)),
      cognitiveProfile: human && human.cognitiveProfile ? human.cognitiveProfile : {},
    };
  });
  const meanDelta = comparisons.length
    ? comparisons.reduce((sum, entry) => sum + entry.normalizedDelta, 0) / comparisons.length
    : 0;
  return {
    schema: "ai-human-comparison-report.v1",
    generatedAt: nowIso(),
    comparisons,
    scoreNormalization: "direct_case_score_delta",
    meanNormalizedDelta: Number(meanDelta.toFixed(4)),
  };
}

function summarizeEvalResults(results) {
  const cases = ensureArray(results);
  const passCount = cases.filter((entry) => safeString(entry && entry.verdict, 40) === "PASS").length;
  const total = cases.length;
  const averageScore = total ? cases.reduce((sum, entry) => sum + (Number(entry && entry.score) || 0), 0) / total : 0;
  const byFamily = {};
  for (const entry of cases) {
    const familyId = safeString(entry && entry.familyId, 120) || "unknown";
    if (!byFamily[familyId]) byFamily[familyId] = { total: 0, pass: 0, score: 0 };
    byFamily[familyId].total += 1;
    byFamily[familyId].pass += safeString(entry && entry.verdict, 40) === "PASS" ? 1 : 0;
    byFamily[familyId].score += Number(entry && entry.score) || 0;
  }
  return {
    total,
    passCount,
    passRate: total ? Number((passCount / total).toFixed(4)) : 0,
    averageScore: Number(averageScore.toFixed(4)),
    families: Object.fromEntries(Object.entries(byFamily).map(([familyId, value]) => [familyId, {
      total: value.total,
      passRate: value.total ? Number((value.pass / value.total).toFixed(4)) : 0,
      averageScore: value.total ? Number((value.score / value.total).toFixed(4)) : 0,
    }])),
  };
}

function computeGeneralityScorecard({
  publicEval = {},
  holdoutEval = {},
  blackboxEval = {},
  verifierReliabilityScore = 0.9,
  regressionStabilityScore = 1,
  humanBaselineComparisonScore = null,
} = {}) {
  const publicSummary = summarizeEvalResults(ensureArray(publicEval.results));
  const holdoutSummary = summarizeEvalResults(ensureArray(holdoutEval.results));
  const blackboxSummary = summarizeEvalResults(ensureArray(blackboxEval.results));
  const familySet = new Set([
    ...Object.keys(publicSummary.families),
    ...Object.keys(holdoutSummary.families),
    ...Object.keys(blackboxSummary.families),
  ]);
  const familyCoverageScore = familySet.size ? Math.min(1, familySet.size / 10) : 0;
  const performanceScore = publicSummary.averageScore;
  const heldOutRobustnessScore = (holdoutSummary.averageScore + blackboxSummary.averageScore) / 2 || 0;
  const generalityScore = Number(((performanceScore + heldOutRobustnessScore + familyCoverageScore) / 3).toFixed(4));
  const autonomyScore = Number((((publicEval.multiAgentPassRate || 0) + (publicEval.resumeSuccessRate || 0) + (publicEval.replanRecoveryRate || 0)) / 3).toFixed(4));
  return {
    schema: "agi-readiness-scorecard.v1",
    generatedAt: nowIso(),
    performanceScore: Number((performanceScore * 100).toFixed(2)),
    generalityScore: Number((generalityScore * 100).toFixed(2)),
    autonomyScore: Number((autonomyScore * 100).toFixed(2)),
    familyCoverageScore: Number((familyCoverageScore * 100).toFixed(2)),
    heldOutRobustnessScore: Number((heldOutRobustnessScore * 100).toFixed(2)),
    verifierReliabilityScore: Number((Number(verifierReliabilityScore) * 100).toFixed(2)),
    regressionStabilityScore: Number((Number(regressionStabilityScore) * 100).toFixed(2)),
    humanBaselineComparisonScore: humanBaselineComparisonScore === null ? null : Number((Number(humanBaselineComparisonScore) * 100).toFixed(2)),
  };
}

function clusterFailures(results) {
  const cases = ensureArray(results);
  const clusters = {};
  for (const entry of cases) {
    const verdict = safeString(entry && entry.verdict, 40);
    if (verdict === "PASS") continue;
    const type = safeString(entry && entry.failureType, 120) || "unknown_failure";
    if (!clusters[type]) clusters[type] = [];
    clusters[type].push({
      caseId: safeString(entry && entry.caseId, 120),
      familyId: safeString(entry && entry.familyId, 120),
      reason: safeString(entry && entry.reason, 400),
    });
  }
  return {
    schema: "failure-cluster-report.v1",
    generatedAt: nowIso(),
    clusters: Object.entries(clusters).map(([type, items]) => ({
      type,
      count: items.length,
      items,
    })),
  };
}

function generateCurriculum({
  failureClusters = [],
} = {}) {
  const curriculum = ensureArray(failureClusters).flatMap((cluster) => ({
    familyId: safeString(cluster && cluster.items && cluster.items[0] && cluster.items[0].familyId, 120) || "unknown",
    weaknessType: safeString(cluster && cluster.type, 120),
    generatedTasks: Math.max(1, Math.min(3, Number(cluster && cluster.count) || 1)),
    explorationBudget: Math.max(1, Math.min(5, Number(cluster && cluster.count) || 1)),
  }));
  return {
    schema: "curriculum-plan.v1",
    generatedAt: nowIso(),
    curriculum,
  };
}

function runChampionChallenger({
  championScore = 0,
  challengerScore = 0,
} = {}) {
  const champion = Number(championScore) || 0;
  const challenger = Number(challengerScore) || 0;
  return {
    schema: "champion-challenger-report.v1",
    generatedAt: nowIso(),
    championScore: champion,
    challengerScore: challenger,
    promoted: challenger >= champion ? 1 : 0,
    rollbackRequired: challenger < champion ? 1 : 0,
  };
}

function loadAutonomyRiskPolicy(filePath = defaultAutonomyRiskPolicyPath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function buildForensicTraceBundle({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  title = "",
  payload = {},
} = {}) {
  const policy = loadAutonomyRiskPolicy();
  const root = resolveWorkspacePath(workspaceRoot, policy && policy.deploymentControls && policy.deploymentControls.forensicBundleRoot, "logs/archive/raw/deployment_controls/forensic_bundles");
  const bundleDir = path.join(root, `${slugify(title || "incident", "incident", 120)}-${Date.now()}`);
  ensureDir(bundleDir);
  const bundlePath = path.join(bundleDir, "forensic_bundle.json");
  writeJson(bundlePath, {
    schema: "forensic-trace-bundle.v1",
    generatedAt: nowIso(),
    title: safeString(title, 240) || "incident",
    payload,
  });
  return { ok: true, bundlePath: repoRelative(workspaceRoot, bundlePath) };
}

function loadClaimGatePolicy(filePath = defaultClaimGatePolicyPath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function evaluateClaimGate({
  scorecard = {},
  observedHumanBaselineRuns = 0,
  externalAuditArtifacts = [],
  catastrophicWeaknessCount = 0,
} = {}) {
  const policy = loadClaimGatePolicy();
  const checks = {
    performanceScore: Number(scorecard.performanceScore || 0) >= Number(policy.thresholds.performanceScore || 0),
    generalityScore: Number(scorecard.generalityScore || 0) >= Number(policy.thresholds.generalityScore || 0),
    autonomyScore: Number(scorecard.autonomyScore || 0) >= Number(policy.thresholds.autonomyScore || 0),
    familyCoverageScore: Number(scorecard.familyCoverageScore || 0) >= Number(policy.thresholds.familyCoverageScore || 0),
    heldOutRobustnessScore: Number(scorecard.heldOutRobustnessScore || 0) >= Number(policy.thresholds.heldOutRobustnessScore || 0),
    verifierReliabilityScore: Number(scorecard.verifierReliabilityScore || 0) >= Number(policy.thresholds.verifierReliabilityScore || 0),
    regressionStabilityScore: Number(scorecard.regressionStabilityScore || 0) >= Number(policy.thresholds.regressionStabilityScore || 0),
    humanBaselineComparisonScore: Number(scorecard.humanBaselineComparisonScore || 0) >= Number(policy.thresholds.humanBaselineComparisonScore || 0),
    catastrophicWeaknessCap: Number(catastrophicWeaknessCount || 0) <= Number(policy.catastrophicWeaknessCap || 0),
    auditArtifactsPresent: ensureArray(policy.requiredAuditArtifacts).every((entry) => ensureArray(externalAuditArtifacts).includes(entry)),
    observedHumanBaselineRuns: policy.humanBaselineRequiresObservedRuns ? Number(observedHumanBaselineRuns || 0) > 0 : true,
  };
  const allPassed = Object.values(checks).every(Boolean);
  return {
    schema: "agi-claim-gate-report.v1",
    generatedAt: nowIso(),
    checks,
    recommendation: allPassed ? "READY_FOR_EXTERNAL_AUDIT" : Number(scorecard.performanceScore || 0) >= 50 ? "PARTIAL_READINESS" : "NOT_READY",
  };
}

function buildExternalAuditBundle({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  title = "agi-external-audit",
  artifacts = {},
} = {}) {
  const root = path.join(workspaceRoot, "output", "external_audit_bundle", `${slugify(title, "audit", 80)}-${Date.now()}`);
  ensureDir(root);
  const manifestPath = path.join(root, "bundle_manifest.json");
  writeJson(manifestPath, {
    schema: "external-audit-bundle.v1",
    generatedAt: nowIso(),
    artifacts,
  });
  return { ok: true, root: repoRelative(workspaceRoot, root), manifestPath: repoRelative(workspaceRoot, manifestPath) };
}

function normalizeKnowledgeSystemPolicy(input, { workspaceRoot }) {
  const payload = input && typeof input === "object" ? input : {};
  const promotion = payload.promotionPolicy && typeof payload.promotionPolicy === "object" ? payload.promotionPolicy : {};
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "knowledge-system-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    workspaceRoot,
    rootPath: resolveWorkspacePath(workspaceRoot, payload.rootPath, "logs/archive/raw/knowledge_store"),
    indexPath: resolveWorkspacePath(workspaceRoot, payload.indexPath, "logs/archive/raw/knowledge_store/knowledge_index.json"),
    archivePath: resolveWorkspacePath(workspaceRoot, payload.archivePath, "logs/archive/raw/knowledge_store/archive/knowledge_archive.jsonl"),
    journalPath: resolveWorkspacePath(workspaceRoot, payload.journalPath, "logs/archive/raw/knowledge_store/knowledge_journal.jsonl"),
    retrievalEvalHistoryPath: resolveWorkspacePath(workspaceRoot, payload.retrievalEvalHistoryPath, "logs/archive/raw/knowledge_store/retrieval_eval_history.jsonl"),
    generatedSkillRegistryPath: resolveWorkspacePath(workspaceRoot, payload.generatedSkillRegistryPath, "scripts/config/generated_skill_registry.json"),
    generatedSkillsRoot: resolveWorkspacePath(workspaceRoot, payload.generatedSkillsRoot, ".agents/skills/generated"),
    generatedSkillArchivePath: resolveWorkspacePath(workspaceRoot, payload.generatedSkillArchivePath, "logs/archive/raw/knowledge_store/archive/generated_skill_archive.jsonl"),
    toolRegistryStatePath: resolveWorkspacePath(workspaceRoot, payload.toolRegistryStatePath, "logs/archive/raw/knowledge_store/tool_registry_state.json"),
    toolRegistryHistoryPath: resolveWorkspacePath(workspaceRoot, payload.toolRegistryHistoryPath, "logs/archive/raw/knowledge_store/tool_registry_history.jsonl"),
    retrieval: Object.freeze({
      maxEntries: Math.max(1, Math.trunc(Number(payload.retrieval && payload.retrieval.maxEntries) || 5)),
      defaultCharBudget: Math.max(400, Math.trunc(Number(payload.retrieval && payload.retrieval.defaultCharBudget) || 2400)),
      staleAfterDays: Math.max(1, Math.trunc(Number(payload.retrieval && payload.retrieval.staleAfterDays) || 30)),
      supportedTrustLevels: uniqueStrings(payload.retrieval && payload.retrieval.supportedTrustLevels, 12),
    }),
    promotionPolicy: Object.freeze({
      allowTrustLevels: uniqueStrings(promotion.allowTrustLevels, 12),
      denyKinds: uniqueStrings(promotion.denyKinds, 24),
      defaultFreshnessDays: Math.max(1, Math.trunc(Number(promotion.defaultFreshnessDays) || 30)),
    }),
    readWritePolicy: Object.freeze({
      readRoles: uniqueStrings(payload.readWritePolicy && payload.readWritePolicy.readRoles, 16),
      writeRoles: uniqueStrings(payload.readWritePolicy && payload.readWritePolicy.writeRoles, 16),
      archiveRoles: uniqueStrings(payload.readWritePolicy && payload.readWritePolicy.archiveRoles, 16),
    }),
  });
}

function loadKnowledgePolicy(filePath = defaultKnowledgeSystemPolicyPath, { workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return normalizeKnowledgeSystemPolicy(raw ? JSON.parse(raw) : {}, { workspaceRoot });
}

function ensureKnowledgeStore(policy) {
  ensureDir(policy.rootPath);
  ensureDir(path.dirname(policy.indexPath));
  ensureDir(path.dirname(policy.archivePath));
  ensureDir(path.dirname(policy.journalPath));
  ensureDir(path.dirname(policy.retrievalEvalHistoryPath));
  ensureDir(path.dirname(policy.generatedSkillRegistryPath));
  ensureDir(policy.generatedSkillsRoot);
  ensureDir(path.dirname(policy.generatedSkillArchivePath));
  ensureDir(path.dirname(policy.toolRegistryStatePath));
  if (!fs.existsSync(policy.indexPath)) {
    writeJson(policy.indexPath, {
      schema: "knowledge-index.v1",
      generatedAt: nowIso(),
      entries: [],
    });
  }
  if (!fs.existsSync(policy.generatedSkillRegistryPath)) {
    writeJson(policy.generatedSkillRegistryPath, {
      schema: "generated-skill-registry.v1",
      generatedAt: nowIso(),
      skills: [],
    });
  }
  if (!fs.existsSync(policy.toolRegistryStatePath)) {
    writeJson(policy.toolRegistryStatePath, {
      schema: "runtime-tool-registry.v1",
      generatedAt: nowIso(),
      tools: [],
    });
  }
  return policy;
}

function loadKnowledgeIndex(policy) {
  ensureKnowledgeStore(policy);
  const payload = parseJson(policy.indexPath, {}) || {};
  return {
    schema: safeString(payload.schema, 120) || "knowledge-index.v1",
    generatedAt: safeString(payload.generatedAt, 80) || nowIso(),
    entries: ensureArray(payload.entries),
  };
}

function writeKnowledgeIndex(policy, payload) {
  writeJson(policy.indexPath, {
    schema: "knowledge-index.v1",
    generatedAt: nowIso(),
    entries: ensureArray(payload && payload.entries),
  });
}

function registerKnowledgeVersion({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  policy = null,
  key,
  title,
  content,
  source = "local",
  trustLevel = "working",
  freshnessDays = null,
  tags = [],
  familyIds = [],
  promotedBy = "operator",
} = {}) {
  const resolvedPolicy = ensureKnowledgeStore(policy || loadKnowledgePolicy(undefined, { workspaceRoot }));
  const index = loadKnowledgeIndex(resolvedPolicy);
  const normalizedKey = slugify(key || title || "knowledge", "knowledge", 120);
  const existing = index.entries.find((entry) => safeString(entry && entry.key, 120) === normalizedKey);
  const version = existing ? Number(existing.latestVersion || 0) + 1 : 1;
  const relativeArtifactPath = path.join("entries", normalizedKey, `v${version}.json`);
  const absoluteArtifactPath = path.join(resolvedPolicy.rootPath, relativeArtifactPath);
  const entryPayload = {
    schema: "knowledge-entry.v1",
    key: normalizedKey,
    version,
    title: safeString(title || key, 200) || normalizedKey,
    content: safeString(content, 12000),
    source: safeString(source, 240),
    trustLevel: safeString(trustLevel, 80) || "working",
    freshnessDays: Math.max(1, Math.trunc(Number(freshnessDays) || resolvedPolicy.promotionPolicy.defaultFreshnessDays)),
    tags: uniqueStrings(tags, 24),
    familyIds: uniqueStrings(familyIds, 24),
    promotedBy: safeString(promotedBy, 120),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  writeJson(absoluteArtifactPath, entryPayload);
  const indexEntry = {
    key: normalizedKey,
    title: entryPayload.title,
    latestVersion: version,
    latestPath: relativeArtifactPath.replace(/\\/g, "/"),
    source: entryPayload.source,
    trustLevel: entryPayload.trustLevel,
    freshnessDays: entryPayload.freshnessDays,
    tags: entryPayload.tags,
    familyIds: entryPayload.familyIds,
    updatedAt: entryPayload.updatedAt,
  };
  const nextEntries = index.entries.filter((entry) => safeString(entry && entry.key, 120) !== normalizedKey);
  nextEntries.push(indexEntry);
  writeKnowledgeIndex(resolvedPolicy, { entries: nextEntries });
  appendJsonLine(resolvedPolicy.journalPath, {
    schema: "knowledge-journal-entry.v1",
    recordedAt: nowIso(),
    action: "register_version",
    key: normalizedKey,
    version,
    source: entryPayload.source,
    trustLevel: entryPayload.trustLevel,
  });
  return {
    ok: true,
    key: normalizedKey,
    version,
    artifactPath: absoluteArtifactPath,
    relativeArtifactPath: relativeArtifactPath.replace(/\\/g, "/"),
    indexEntry,
  };
}

function retrieveKnowledgeSlice({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  policy = null,
  objective = "",
  familyId = "",
  tags = [],
  charBudget = null,
  limit = null,
} = {}) {
  const resolvedPolicy = ensureKnowledgeStore(policy || loadKnowledgePolicy(undefined, { workspaceRoot }));
  const index = loadKnowledgeIndex(resolvedPolicy);
  const objectiveText = safeString(objective, 4000).toLowerCase();
  const desiredFamily = safeString(familyId, 120);
  const desiredTags = uniqueStrings(tags, 24).map((entry) => entry.toLowerCase());
  const budget = Math.max(400, Math.trunc(Number(charBudget) || resolvedPolicy.retrieval.defaultCharBudget));
  const maxEntries = Math.max(1, Math.trunc(Number(limit) || resolvedPolicy.retrieval.maxEntries));
  const staleAfterMs = resolvedPolicy.retrieval.staleAfterDays * 24 * 60 * 60 * 1000;
  const ranked = index.entries.map((entry) => {
    let score = 0;
    const title = safeString(entry && entry.title, 200).toLowerCase();
    const source = safeString(entry && entry.source, 200).toLowerCase();
    const entryTags = uniqueStrings(entry && entry.tags, 24).map((item) => item.toLowerCase());
    const entryFamilies = uniqueStrings(entry && entry.familyIds, 24);
    if (desiredFamily && entryFamilies.includes(desiredFamily)) score += 4;
    if (objectiveText && title && objectiveText.includes(title)) score += 2;
    if (objectiveText && source && objectiveText.includes(source)) score += 1;
    for (const tag of desiredTags) {
      if (entryTags.includes(tag)) score += 2;
      if (objectiveText.includes(tag)) score += 1;
    }
    if (safeString(entry && entry.trustLevel, 80).toLowerCase() === "verified") score += 1;
    return { entry, score };
  }).filter((entry) => entry.score > 0 || !desiredFamily).sort((left, right) => right.score - left.score || parseTimestamp(right.entry && right.entry.updatedAt) - parseTimestamp(left.entry && left.entry.updatedAt));
  const selected = [];
  let usedChars = 0;
  for (const candidate of ranked) {
    if (selected.length >= maxEntries) break;
    const relativePath = safeString(candidate.entry && candidate.entry.latestPath, 400);
    const absolutePath = relativePath ? path.join(resolvedPolicy.rootPath, relativePath) : "";
    const payload = parseJsonFileChecked(absolutePath, null);
    if (!payload) continue;
    const content = safeString(payload.content, budget);
    if (!content) continue;
    if (usedChars + content.length > budget && selected.length > 0) break;
    const updatedAt = parseTimestamp(payload.updatedAt || payload.createdAt);
    selected.push({
      key: safeString(payload.key, 120),
      version: Number(payload.version || 1),
      title: safeString(payload.title, 200),
      content,
      source: safeString(payload.source, 240),
      trustLevel: safeString(payload.trustLevel, 80),
      stale: updatedAt > 0 ? (Date.now() - updatedAt > staleAfterMs ? 1 : 0) : 0,
      tags: uniqueStrings(payload.tags, 24),
      familyIds: uniqueStrings(payload.familyIds, 24),
      relativePath: relativePath.replace(/\\/g, "/"),
      retrievalScore: candidate.score,
    });
    usedChars += content.length;
  }
  return {
    schema: "knowledge-retrieval-slice.v1",
    generatedAt: nowIso(),
    objective: safeString(objective, 1000),
    familyId: desiredFamily,
    usedChars,
    charBudget: budget,
    entries: selected,
  };
}

function evaluateRetrievalQuality({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  policy = null,
  retrievalSlice,
  taskOutcome = "",
  supportedCitations = [],
} = {}) {
  const resolvedPolicy = ensureKnowledgeStore(policy || loadKnowledgePolicy(undefined, { workspaceRoot }));
  const slice = retrievalSlice && typeof retrievalSlice === "object" ? retrievalSlice : { entries: [] };
  const citations = uniqueStrings(supportedCitations, 64);
  const entries = ensureArray(slice.entries);
  const supportedCount = entries.filter((entry) => citations.includes(safeString(entry && entry.key, 120))).length;
  const staleCount = entries.filter((entry) => Number(entry && entry.stale) === 1).length;
  const score = entries.length ? Math.max(0, Math.min(100, Math.round((supportedCount / entries.length) * 100) - staleCount * 10)) : 0;
  const report = {
    schema: "retrieval-quality-report.v1",
    generatedAt: nowIso(),
    objective: safeString(slice.objective, 1000),
    familyId: safeString(slice.familyId, 120),
    taskOutcome: safeString(taskOutcome, 400),
    entryCount: entries.length,
    supportedCount,
    staleCount,
    score,
    supportedCitations: citations,
  };
  appendJsonLine(resolvedPolicy.retrievalEvalHistoryPath, report);
  return report;
}

function archiveKnowledgeEntries({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  policy = null,
  keys = [],
  reason = "archive",
} = {}) {
  const resolvedPolicy = ensureKnowledgeStore(policy || loadKnowledgePolicy(undefined, { workspaceRoot }));
  const index = loadKnowledgeIndex(resolvedPolicy);
  const normalizedKeys = new Set(uniqueStrings(keys, 64));
  const keptEntries = [];
  const archivedEntries = [];
  for (const entry of index.entries) {
    const key = safeString(entry && entry.key, 120);
    if (!normalizedKeys.has(key)) {
      keptEntries.push(entry);
      continue;
    }
    archivedEntries.push(entry);
    appendJsonLine(resolvedPolicy.archivePath, {
      schema: "knowledge-archive-entry.v1",
      recordedAt: nowIso(),
      reason: safeString(reason, 240),
      entry,
    });
  }
  writeKnowledgeIndex(resolvedPolicy, { entries: keptEntries });
  return {
    ok: true,
    archivedCount: archivedEntries.length,
    archivedKeys: archivedEntries.map((entry) => safeString(entry && entry.key, 120)),
    archivePath: resolvedPolicy.archivePath,
  };
}

function resolveKnowledgePolicyInput(input) {
  if (input && typeof input === "object" && safeString(input.generatedSkillRegistryPath, 400)) {
    return ensureKnowledgeStore(input);
  }
  const workspaceRoot = input && typeof input === "object" && safeString(input.workspaceRoot, 400)
    ? path.resolve(input.workspaceRoot)
    : path.resolve(__dirname, "..", "..");
  return ensureKnowledgeStore(loadKnowledgePolicy(undefined, { workspaceRoot }));
}

function loadGeneratedSkillRegistry(policy) {
  const resolvedPolicy = resolveKnowledgePolicyInput(policy);
  const payload = parseJson(resolvedPolicy.generatedSkillRegistryPath, {}) || {};
  return {
    schema: safeString(payload.schema, 120) || "generated-skill-registry.v1",
    generatedAt: safeString(payload.generatedAt, 80) || nowIso(),
    skills: ensureArray(payload.skills),
  };
}

function writeGeneratedSkillRegistry(policy, payload) {
  const resolvedPolicy = resolveKnowledgePolicyInput(policy);
  writeJson(resolvedPolicy.generatedSkillRegistryPath, {
    schema: "generated-skill-registry.v1",
    generatedAt: nowIso(),
    skills: ensureArray(payload && payload.skills),
  });
}

function registerGeneratedSkill({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  policy = null,
  id,
  title,
  description,
  trigger = "",
  deterministicSteps = [],
  reasoningGuidance = [],
  tests = [],
  sourceTrace = "",
} = {}) {
  const resolvedPolicy = ensureKnowledgeStore(policy || loadKnowledgePolicy(undefined, { workspaceRoot }));
  const registry = loadGeneratedSkillRegistry(resolvedPolicy);
  const normalizedId = slugify(id || title || "generated-skill", "generated-skill", 120);
  const skillDir = path.join(resolvedPolicy.generatedSkillsRoot, normalizedId);
  const skillPath = path.join(skillDir, "SKILL.md");
  ensureDir(skillDir);
  fs.writeFileSync(skillPath, [
    `# ${safeString(title || normalizedId, 160) || normalizedId}`,
    "",
    safeString(description, 1200),
    "",
    "## Trigger",
    safeString(trigger, 800),
    "",
    "## Deterministic Steps",
    ...uniqueStrings(deterministicSteps, 24).map((entry) => `- ${entry}`),
    "",
    "## Contextual Reasoning",
    ...uniqueStrings(reasoningGuidance, 24).map((entry) => `- ${entry}`),
    "",
    "## Tests",
    ...uniqueStrings(tests, 24).map((entry) => `- ${entry}`),
    "",
    `Source Trace: ${safeString(sourceTrace, 400)}`,
    "",
  ].join("\n"), "utf8");
  const entry = {
    id: normalizedId,
    title: safeString(title || normalizedId, 160) || normalizedId,
    description: safeString(description, 1200),
    trigger: safeString(trigger, 800),
    path: path.relative(workspaceRoot, skillPath).replace(/\\/g, "/"),
    deterministicSteps: uniqueStrings(deterministicSteps, 24),
    reasoningGuidance: uniqueStrings(reasoningGuidance, 24),
    tests: uniqueStrings(tests, 24),
    sourceTrace: safeString(sourceTrace, 400),
    updatedAt: nowIso(),
    stale: 0,
  };
  const nextSkills = registry.skills.filter((skill) => safeString(skill && skill.id, 120) !== normalizedId);
  nextSkills.push(entry);
  writeGeneratedSkillRegistry(resolvedPolicy, { skills: nextSkills });
  appendJsonLine(resolvedPolicy.journalPath, {
    schema: "generated-skill-journal-entry.v1",
    recordedAt: nowIso(),
    action: "register_generated_skill",
    skillId: normalizedId,
    sourceTrace: entry.sourceTrace,
  });
  return { ok: true, entry };
}

function pruneGeneratedSkills({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  policy = null,
  staleIds = [],
  reason = "stale_skill",
} = {}) {
  const resolvedPolicy = ensureKnowledgeStore(policy || loadKnowledgePolicy(undefined, { workspaceRoot }));
  const registry = loadGeneratedSkillRegistry(resolvedPolicy);
  const targets = new Set(uniqueStrings(staleIds, 64));
  const kept = [];
  const archived = [];
  for (const entry of registry.skills) {
    const skillId = safeString(entry && entry.id, 120);
    if (!targets.has(skillId)) {
      kept.push(entry);
      continue;
    }
    archived.push(entry);
    appendJsonLine(resolvedPolicy.generatedSkillArchivePath, {
      schema: "generated-skill-archive-entry.v1",
      recordedAt: nowIso(),
      reason: safeString(reason, 240),
      entry,
    });
  }
  writeGeneratedSkillRegistry(resolvedPolicy, { skills: kept });
  return {
    ok: true,
    archivedCount: archived.length,
    archivedSkillIds: archived.map((entry) => safeString(entry && entry.id, 120)),
  };
}

function loadToolRegistryManifest(filePath = defaultToolRegistryManifestPath) {
  const payload = parseJson(filePath, {}) || {};
  return {
    schema: safeString(payload.schema, 120) || "tool-registry-manifest.v1",
    generatedAt: safeString(payload.generatedAt, 80) || nowIso(),
    tools: ensureArray(payload.tools),
  };
}

function loadRuntimeToolRegistry(policy) {
  ensureKnowledgeStore(policy);
  const payload = parseJson(policy.toolRegistryStatePath, {}) || {};
  return {
    schema: safeString(payload.schema, 120) || "runtime-tool-registry.v1",
    generatedAt: safeString(payload.generatedAt, 80) || nowIso(),
    tools: ensureArray(payload.tools),
  };
}

function writeRuntimeToolRegistry(policy, payload) {
  writeJson(policy.toolRegistryStatePath, {
    schema: "runtime-tool-registry.v1",
    generatedAt: nowIso(),
    tools: ensureArray(payload && payload.tools),
  });
}

function computeToolReliabilityScore(toolEntry) {
  const reliability = Number(toolEntry && toolEntry.reliabilityScore);
  if (Number.isFinite(reliability)) return Math.max(0, Math.min(100, Math.round(reliability)));
  const wrapperTests = ensureArray(toolEntry && toolEntry.wrapperTests).length;
  return Math.max(40, Math.min(95, 50 + wrapperTests * 10));
}

function registerToolCandidate({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  policy = null,
  name,
  capability = "",
  riskTier = "medium",
  wrapperTests = [],
  fallbackMode = "degraded",
  status = "sandbox",
  examples = [],
} = {}) {
  const resolvedPolicy = ensureKnowledgeStore(policy || loadKnowledgePolicy(undefined, { workspaceRoot }));
  const runtimeRegistry = loadRuntimeToolRegistry(resolvedPolicy);
  const normalizedName = slugify(name, "tool", 120);
  const entry = {
    name: normalizedName,
    capability: safeString(capability, 400),
    riskTier: safeString(riskTier, 80) || "medium",
    wrapperTests: uniqueStrings(wrapperTests, 24),
    fallbackMode: safeString(fallbackMode, 80) || "degraded",
    status: safeString(status, 80) || "sandbox",
    examples: uniqueStrings(examples, 24),
    reliabilityScore: computeToolReliabilityScore({ wrapperTests }),
    updatedAt: nowIso(),
  };
  const nextTools = runtimeRegistry.tools.filter((tool) => safeString(tool && tool.name, 120) !== normalizedName);
  nextTools.push(entry);
  writeRuntimeToolRegistry(resolvedPolicy, { tools: nextTools });
  appendJsonLine(resolvedPolicy.toolRegistryHistoryPath, {
    schema: "tool-registry-history-entry.v1",
    recordedAt: nowIso(),
    action: "register_tool_candidate",
    entry,
  });
  return { ok: true, entry };
}

function loadModelRoutingPolicy(filePath = defaultModelRoutingPolicyPath) {
  const payload = parseJson(filePath, {}) || {};
  return {
    schema: safeString(payload.schema, 120) || "model-routing-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    models: payload.models && typeof payload.models === "object" ? payload.models : {},
    roleDefaults: payload.roleDefaults && typeof payload.roleDefaults === "object" ? payload.roleDefaults : {},
    familyOverrides: payload.familyOverrides && typeof payload.familyOverrides === "object" ? payload.familyOverrides : {},
    budgetPolicies: payload.budgetPolicies && typeof payload.budgetPolicies === "object" ? payload.budgetPolicies : {},
    fallbackModel: safeString(payload.fallbackModel, 120),
  };
}

function routeModel({
  role = "coordinator",
  familyId = "",
  budgetTier = "standard",
  policy = null,
} = {}) {
  const resolvedPolicy = policy || loadModelRoutingPolicy();
  const familyOverride = resolvedPolicy.familyOverrides && resolvedPolicy.familyOverrides[familyId];
  const roleDefault = resolvedPolicy.roleDefaults && resolvedPolicy.roleDefaults[role];
  const budgetPolicy = resolvedPolicy.budgetPolicies && resolvedPolicy.budgetPolicies[budgetTier];
  const selectedModel = safeString(familyOverride || roleDefault || budgetPolicy || resolvedPolicy.fallbackModel, 120) || "gpt-5.4-mini";
  return {
    schema: "model-route.v1",
    generatedAt: nowIso(),
    role: safeString(role, 80),
    familyId: safeString(familyId, 120),
    budgetTier: safeString(budgetTier, 80),
    selectedModel,
    rationale: [
      familyOverride ? `family_override:${familyId}` : "",
      !familyOverride && roleDefault ? `role_default:${role}` : "",
      !familyOverride && !roleDefault && budgetPolicy ? `budget_policy:${budgetTier}` : "",
      !familyOverride && !roleDefault && !budgetPolicy ? `fallback:${resolvedPolicy.fallbackModel}` : "",
    ].filter(Boolean),
  };
}

function packageAdaptationDataset({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  traces = [],
  corrections = [],
  disagreements = [],
  skillInductions = [],
} = {}) {
  const outputRoot = path.join(workspaceRoot, "output", "adaptation");
  ensureDir(outputRoot);
  const datasetPath = path.join(outputRoot, `adaptation_dataset_${Date.now()}.json`);
  const payload = {
    schema: "adaptation-dataset.v1",
    generatedAt: nowIso(),
    traces: ensureArray(traces),
    corrections: ensureArray(corrections),
    disagreements: ensureArray(disagreements),
    skillInductions: ensureArray(skillInductions),
  };
  writeJson(datasetPath, payload);
  return {
    ok: true,
    datasetPath,
    recordCount: payload.traces.length + payload.corrections.length + payload.disagreements.length + payload.skillInductions.length,
  };
}

function createAdaptationJobSpec({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  familyId = "",
  route = null,
  datasetPath = "",
  candidateId = "",
} = {}) {
  const outputRoot = path.join(workspaceRoot, "output", "adaptation");
  ensureDir(outputRoot);
  const specPath = path.join(outputRoot, `adaptation_job_${Date.now()}.json`);
  const payload = {
    schema: "adaptation-job-spec.v1",
    generatedAt: nowIso(),
    familyId: safeString(familyId, 120),
    candidateId: safeString(candidateId, 120) || `candidate-${Date.now()}`,
    datasetPath: path.relative(workspaceRoot, datasetPath || "").replace(/\\/g, "/"),
    route,
    promotionGate: "eval_before_promotion",
    rollbackTarget: "previous_model_config",
  };
  writeJson(specPath, payload);
  return { ok: true, specPath, payload };
}

function evaluateAdaptationCandidate({
  baselineScore = 0,
  candidateScore = 0,
  minimumGain = 1,
} = {}) {
  const baseline = Number(baselineScore) || 0;
  const candidate = Number(candidateScore) || 0;
  const gain = candidate - baseline;
  return {
    schema: "adaptation-candidate-eval.v1",
    generatedAt: nowIso(),
    baselineScore: baseline,
    candidateScore: candidate,
    gain,
    verdict: gain >= Number(minimumGain || 1) ? "PROMOTE" : "REJECT",
  };
}

function loadRawEvalSuiteForLane({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  laneId,
  actor = "developer",
  env = process.env,
} = {}) {
  const policy = loadEvalLanePolicy(undefined, { workspaceRoot });
  const lane = assertEvalLaneAccess({ policy, laneId, actor, env, accessMode: "read" });
  const suitePath = Array.isArray(lane && lane.suitePaths) && lane.suitePaths[0] ? lane.suitePaths[0] : "";
  const rawSuite = parseJsonFileChecked(suitePath, {}) || {};
  const suite = {
    schema: safeString(rawSuite.schema, 120) || "agi-readiness-suite.v1",
    version: safeString(rawSuite.version, 120) || "2026-03-30.r1",
    suiteId: safeString(rawSuite.suiteId, 120) || lane.id,
    description: safeString(rawSuite.description, 400),
    cases: ensureArray(rawSuite.cases),
  };
  return { policy, lane, suite };
}

function exportHumanBaselineTasks({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  suite,
  destinationPath = "",
} = {}) {
  const outputPath = destinationPath || path.join(workspaceRoot, "output", "human_baseline", `human_tasks_${Date.now()}.json`);
  const payload = {
    schema: "human-baseline-task-export.v1",
    generatedAt: nowIso(),
    suiteId: safeString(suite && suite.suiteId, 120),
    cases: ensureArray(suite && suite.cases).map((entry) => ({
      id: safeString(entry && entry.id, 120),
      title: safeString(entry && entry.title, 240),
      familyId: safeString(entry && entry.familyId, 120),
      difficultyTier: safeString(entry && entry.difficultyTier, 80),
      humanComparableTaskFraming: safeString(entry && entry.humanComparableTaskFraming, 1600),
      objective: safeString(entry && entry.objective, 2000),
      acceptanceCriteria: uniqueStrings(entry && entry.acceptanceCriteria, 24),
      modalityTags: uniqueStrings(entry && entry.modalityTags, 24),
    })),
  };
  writeJson(outputPath, payload);
  return { ok: true, outputPath, caseCount: payload.cases.length };
}

function importHumanBaselineRuns(filePath) {
  const payload = parseJson(filePath, {}) || {};
  return {
    schema: safeString(payload.schema, 120) || "human-baseline-run-import.v1",
    generatedAt: safeString(payload.generatedAt, 80) || nowIso(),
    synthetic: Number(payload.synthetic) === 1 ? 1 : 0,
    runs: ensureArray(payload.runs).map((entry) => ({
      caseId: safeString(entry && entry.caseId, 120),
      score: Math.max(0, Math.min(100, Math.round(Number(entry && entry.score) || 0))),
      completionRate: Math.max(0, Math.min(100, Math.round(Number(entry && entry.completionRate) || 0))),
      domainProfile: safeString(entry && entry.domainProfile, 160),
      cognitiveProfile: safeString(entry && entry.cognitiveProfile, 160),
    })),
  };
}

function compareAiToHuman({
  aiResults = [],
  humanImport = { runs: [] },
} = {}) {
  const humanMap = new Map(ensureArray(humanImport.runs).map((entry) => [safeString(entry && entry.caseId, 120), entry]));
  const comparisons = ensureArray(aiResults).map((entry) => {
    const caseId = safeString(entry && entry.caseId, 120);
    const human = humanMap.get(caseId) || null;
    const aiScore = Math.max(0, Math.min(100, Math.round(Number(entry && entry.score) || 0)));
    const humanScore = human ? Math.max(0, Math.min(100, Math.round(Number(human.score) || 0))) : 0;
    return {
      caseId,
      familyId: safeString(entry && entry.familyId, 120),
      aiScore,
      humanScore,
      normalizedScore: humanScore > 0 ? Number((aiScore / humanScore).toFixed(4)) : 0,
      cognitiveProfile: safeString(human && human.cognitiveProfile, 160),
      domainProfile: safeString(human && human.domainProfile, 160),
      observed: human ? 1 : 0,
    };
  });
  const observed = comparisons.filter((entry) => entry.observed === 1);
  const normalizedAverage = observed.length
    ? Number((observed.reduce((sum, entry) => sum + entry.normalizedScore, 0) / observed.length).toFixed(4))
    : 0;
  return {
    schema: "human-baseline-comparison.v1",
    generatedAt: nowIso(),
    synthetic: Number(humanImport.synthetic) === 1 ? 1 : 0,
    observedCount: observed.length,
    normalizedAverage,
    scorePercent: Math.round(normalizedAverage * 100),
    comparisons,
  };
}

function summarizeEvalResults(results = []) {
  const normalized = ensureArray(results);
  const familyMap = new Map();
  const difficultyMap = new Map();
  let passCount = 0;
  let verifierPassCount = 0;
  for (const result of normalized) {
    const familyId = safeString(result && result.familyId, 120) || "unknown";
    const difficultyTier = safeString(result && result.difficultyTier, 80) || "unknown";
    const score = Math.max(0, Math.min(100, Math.round(Number(result && result.score) || 0)));
    const pass = Number(result && result.pass) === 1 ? 1 : 0;
    const verifierPass = safeString(result && result.verifierVerdict, 80) === "PASS" ? 1 : 0;
    if (pass) passCount += 1;
    if (verifierPass) verifierPassCount += 1;
    const familyBucket = familyMap.get(familyId) || { familyId, count: 0, passCount: 0, averageScore: 0 };
    familyBucket.count += 1;
    familyBucket.passCount += pass;
    familyBucket.averageScore += score;
    familyMap.set(familyId, familyBucket);
    const difficultyBucket = difficultyMap.get(difficultyTier) || { difficultyTier, count: 0, passCount: 0, averageScore: 0 };
    difficultyBucket.count += 1;
    difficultyBucket.passCount += pass;
    difficultyBucket.averageScore += score;
    difficultyMap.set(difficultyTier, difficultyBucket);
  }
  const familyBreakdown = Array.from(familyMap.values()).map((entry) => ({
    familyId: entry.familyId,
    count: entry.count,
    passRate: entry.count ? Number((entry.passCount / entry.count).toFixed(4)) : 0,
    averageScore: entry.count ? Number((entry.averageScore / entry.count).toFixed(2)) : 0,
  }));
  const difficultyBreakdown = Array.from(difficultyMap.values()).map((entry) => ({
    difficultyTier: entry.difficultyTier,
    count: entry.count,
    passRate: entry.count ? Number((entry.passCount / entry.count).toFixed(4)) : 0,
    averageScore: entry.count ? Number((entry.averageScore / entry.count).toFixed(2)) : 0,
  }));
  return {
    schema: "eval-results-summary.v1",
    generatedAt: nowIso(),
    caseCount: normalized.length,
    passRate: normalized.length ? Number((passCount / normalized.length).toFixed(4)) : 0,
    verifierReliabilityRate: normalized.length ? Number((verifierPassCount / normalized.length).toFixed(4)) : 0,
    familyBreakdown,
    difficultyBreakdown,
  };
}

function computeGeneralityScorecard({
  publicSummary,
  holdoutSummary,
  blackboxSummary,
  humanComparison,
  regressionStable = 1,
} = {}) {
  const publicPass = Number(publicSummary && publicSummary.passRate) || 0;
  const publicFamilies = ensureArray(publicSummary && publicSummary.familyBreakdown);
  const holdoutPass = Number(holdoutSummary && holdoutSummary.passRate) || 0;
  const blackboxPass = Number(blackboxSummary && blackboxSummary.passRate) || 0;
  const verifierReliabilityRate = Number(publicSummary && publicSummary.verifierReliabilityRate) || 0;
  const familyCoverageScore = publicFamilies.length
    ? Math.min(100, Math.round((publicFamilies.filter((entry) => Number(entry && entry.passRate) >= 0.5).length / publicFamilies.length) * 100))
    : 0;
  const performanceScore = Math.round(publicPass * 100);
  const heldOutRobustnessScore = Math.round(((holdoutPass + blackboxPass) / 2) * 100);
  const autonomyScore = Math.max(0, Math.min(100, Math.round((performanceScore * 0.45) + (heldOutRobustnessScore * 0.35) + (familyCoverageScore * 0.2))));
  const generalityScore = Math.max(0, Math.min(100, Math.round((performanceScore * 0.35) + (familyCoverageScore * 0.35) + (heldOutRobustnessScore * 0.3))));
  return {
    schema: "agi-readiness-scorecard.v1",
    generatedAt: nowIso(),
    performanceScore,
    generalityScore,
    autonomyScore,
    familyCoverageScore,
    heldOutRobustnessScore,
    verifierReliabilityScore: Math.round(verifierReliabilityRate * 100),
    regressionStabilityScore: regressionStable ? 100 : 0,
    humanBaselineComparisonScore: Math.max(0, Math.min(100, Math.round(Number(humanComparison && humanComparison.scorePercent) || 0))),
  };
}

function clusterFailures(results = []) {
  const clusters = new Map();
  for (const entry of ensureArray(results)) {
    if (Number(entry && entry.pass) === 1) continue;
    const familyId = safeString(entry && entry.familyId, 120) || "unknown";
    const failureType = safeString(entry && entry.failureType, 160) || safeString(entry && entry.verifierVerdict, 80) || "unknown_failure";
    const key = `${familyId}:${failureType}`;
    const bucket = clusters.get(key) || {
      id: slugify(key, "failure-cluster", 120),
      familyId,
      failureType,
      count: 0,
      rootCauseTaxonomy: uniqueStrings(entry && entry.rootCauseTaxonomy, 12),
      missingData: Number(entry && entry.missingData) === 1 ? 1 : 0,
      missingTool: Number(entry && entry.missingTool) === 1 ? 1 : 0,
      missingSkill: Number(entry && entry.missingSkill) === 1 ? 1 : 0,
      missingKnowledge: Number(entry && entry.missingKnowledge) === 1 ? 1 : 0,
    };
    bucket.count += 1;
    clusters.set(key, bucket);
  }
  return {
    schema: "failure-cluster-report.v1",
    generatedAt: nowIso(),
    clusters: Array.from(clusters.values()).sort((left, right) => right.count - left.count),
  };
}

function generateCurriculum({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  failureClusters = { clusters: [] },
  outputPath = "",
} = {}) {
  const destination = outputPath || path.join(workspaceRoot, "output", "improvement", `curriculum_${Date.now()}.json`);
  const tasks = ensureArray(failureClusters.clusters).map((cluster, index) => ({
    id: `curriculum-${index + 1}`,
    familyId: safeString(cluster && cluster.familyId, 120),
    weakness: safeString(cluster && cluster.failureType, 160),
    challengeObjective: `Improve ${safeString(cluster && cluster.failureType, 160)} in ${safeString(cluster && cluster.familyId, 120)}`,
    difficultyTier: index === 0 ? "advanced" : "intermediate",
    explorationBudget: 1 + Math.min(3, Math.max(1, Number(cluster && cluster.count) || 1)),
  }));
  const payload = {
    schema: "curriculum-plan.v1",
    generatedAt: nowIso(),
    tasks,
  };
  writeJson(destination, payload);
  return { ok: true, outputPath: destination, payload };
}

function runChampionChallenger({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  baselineScorecard,
  challengerScorecard,
} = {}) {
  const outputPath = path.join(workspaceRoot, "output", "improvement", `champion_challenger_${Date.now()}.json`);
  const challenger = challengerScorecard && typeof challengerScorecard === "object" ? challengerScorecard : {};
  const baseline = baselineScorecard && typeof baselineScorecard === "object" ? baselineScorecard : {};
  const looksLikeAgiBundle = (
    safeString(challenger && challenger.profile, 40).toLowerCase() === "agi_v1"
    || safeString(challenger && challenger.schema, 120).toLowerCase().includes("agi-v1")
    || Object.prototype.hasOwnProperty.call(challenger, "rawFinalScore")
  );
  if (looksLikeAgiBundle) {
    const profile = loadAgiV1ProfileConfig(undefined, { workspaceRoot });
    const decision = buildAgiV1PromotionDecision({
      challenger,
      incumbent: baseline && Object.keys(baseline).length ? baseline : null,
      profile,
    });
    const payload = {
      schema: "champion-challenger-report.v2",
      generatedAt: nowIso(),
      profile: "agi_v1",
      baseline,
      challenger,
      promotionDecision: decision,
      verdict: decision.promote ? "PROMOTE" : "REJECT",
      holdoutVisibleToImprover: 0,
    };
    writeJson(outputPath, payload);
    return { ok: decision.promote, outputPath, payload };
  }
  const gain = (Number(challenger.generalityScore) || 0) - (Number(baseline.generalityScore) || 0);
  const payload = {
    schema: "champion-challenger-report.v1",
    generatedAt: nowIso(),
    baseline,
    challenger,
    gain,
    verdict: gain > 0 ? "PROMOTE" : "REJECT",
    holdoutVisibleToImprover: 0,
  };
  writeJson(outputPath, payload);
  return { ok: true, outputPath, payload };
}

function loadAutonomyRiskPolicy(filePath = defaultAutonomyRiskPolicyPath) {
  const payload = parseJson(filePath, {}) || {};
  return {
    schema: safeString(payload.schema, 120) || "autonomy-risk-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    autonomyLevels: payload.autonomyLevels && typeof payload.autonomyLevels === "object" ? payload.autonomyLevels : {},
    riskTiers: payload.riskTiers && typeof payload.riskTiers === "object" ? payload.riskTiers : {},
    familyRisk: payload.familyRisk && typeof payload.familyRisk === "object" ? payload.familyRisk : {},
    sensitiveTools: uniqueStrings(payload.sensitiveTools, 24),
    sensitiveStateScopes: uniqueStrings(payload.sensitiveStateScopes, 24),
    deploymentControlStatePath: resolveWorkspacePath(path.resolve(__dirname, "..", ".."), payload.deploymentControlStatePath, "logs/archive/raw/deployment_controls/control_state.json"),
    incidentLogPath: resolveWorkspacePath(path.resolve(__dirname, "..", ".."), payload.incidentLogPath, "logs/archive/raw/deployment_controls/incident_log.jsonl"),
    forensicBundleRoot: resolveWorkspacePath(path.resolve(__dirname, "..", ".."), payload.forensicBundleRoot, "logs/archive/raw/deployment_controls/forensic_bundles"),
  };
}

function loadDeploymentControlState(policy) {
  const payload = parseJson(policy.deploymentControlStatePath, null);
  if (payload && typeof payload === "object") return payload;
  return {
    schema: "deployment-control-state.v1",
    generatedAt: nowIso(),
    canaryEnabled: 0,
    freeze: 0,
    killSwitch: 0,
  };
}

function updateDeploymentControlState(policy, patch = {}) {
  const nextState = {
    ...loadDeploymentControlState(policy),
    ...patch,
    generatedAt: nowIso(),
  };
  writeJson(policy.deploymentControlStatePath, nextState);
  return nextState;
}

function classifyAutonomyRisk({
  familyId = "",
  toolName = "",
  stateScope = "",
  policy = null,
} = {}) {
  const resolvedPolicy = policy || loadAutonomyRiskPolicy();
  const familyRisk = safeString(resolvedPolicy.familyRisk && resolvedPolicy.familyRisk[familyId], 80) || "medium";
  const sensitive = resolvedPolicy.sensitiveTools.includes(toolName) || resolvedPolicy.sensitiveStateScopes.includes(stateScope);
  const effectiveRiskTier = sensitive ? "critical" : familyRisk;
  return {
    schema: "autonomy-risk-classification.v1",
    generatedAt: nowIso(),
    familyId: safeString(familyId, 120),
    toolName: safeString(toolName, 120),
    stateScope: safeString(stateScope, 160),
    riskTier: effectiveRiskTier,
    autonomyLevel: resolvedPolicy.riskTiers && resolvedPolicy.riskTiers[effectiveRiskTier]
      ? safeString(resolvedPolicy.riskTiers[effectiveRiskTier].maxAutonomyLevel || resolvedPolicy.riskTiers[effectiveRiskTier].maxAutonomy, 80)
      : "L1",
  };
}

function assertSafeAction({
  familyId = "",
  toolName = "",
  stateScope = "",
  actor = "runtime",
  approved = false,
  policy = null,
} = {}) {
  const resolvedPolicy = policy || loadAutonomyRiskPolicy();
  const classification = classifyAutonomyRisk({ familyId, toolName, stateScope, policy: resolvedPolicy });
  const tier = resolvedPolicy.riskTiers && resolvedPolicy.riskTiers[classification.riskTier] ? resolvedPolicy.riskTiers[classification.riskTier] : {};
  if (tier.approvalRequired && !approved) {
    throw new Error(`approval_required:${classification.riskTier}:${safeString(actor, 80)}:${safeString(toolName, 120)}:${safeString(stateScope, 160)}`);
  }
  const controlState = loadDeploymentControlState(resolvedPolicy);
  if (Number(controlState.killSwitch) === 1) {
    throw new Error(`kill_switch_active:${safeString(toolName, 120)}`);
  }
  if (Number(controlState.freeze) === 1 && classification.riskTier !== "low") {
    throw new Error(`deployment_freeze_active:${classification.riskTier}:${safeString(toolName, 120)}`);
  }
  return classification;
}

function appendIncidentLog({
  policy = null,
  kind = "incident",
  detail = "",
  taskId = "",
} = {}) {
  const resolvedPolicy = policy || loadAutonomyRiskPolicy();
  appendJsonLine(resolvedPolicy.incidentLogPath, {
    schema: "incident-log-entry.v1",
    recordedAt: nowIso(),
    kind: safeString(kind, 120),
    detail: safeString(detail, 2000),
    taskId: safeString(taskId, 120),
  });
  return { ok: true, incidentLogPath: resolvedPolicy.incidentLogPath };
}

function buildForensicTraceBundle({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  policy = null,
  artifacts = [],
  incidentKind = "incident",
} = {}) {
  const resolvedPolicy = policy || loadAutonomyRiskPolicy();
  const bundleRoot = path.join(resolvedPolicy.forensicBundleRoot, `${slugify(incidentKind, "incident", 60)}-${Date.now()}`);
  ensureDir(bundleRoot);
  const bundlePath = path.join(bundleRoot, "bundle.json");
  const payload = {
    schema: "forensic-trace-bundle.v1",
    generatedAt: nowIso(),
    incidentKind: safeString(incidentKind, 120),
    artifacts: ensureArray(artifacts).map((entry) => path.relative(workspaceRoot, entry).replace(/\\/g, "/")),
  };
  writeJson(bundlePath, payload);
  return { ok: true, bundleRoot, bundlePath, payload };
}

function loadClaimGatePolicy(filePath = defaultClaimGatePolicyPath) {
  const payload = parseJson(filePath, {}) || {};
  return {
    schema: safeString(payload.schema, 120) || "agi-claim-gate-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    thresholds: payload.thresholds && typeof payload.thresholds === "object" ? payload.thresholds : {},
    requiredAuditArtifacts: uniqueStrings(payload.requiredAuditArtifacts, 32),
    blackboxRequired: payload.blackboxRequired !== false,
    humanBaselineRequiresObservedRuns: payload.humanBaselineRequiresObservedRuns !== false,
    catastrophicWeaknessCap: Math.max(0, Math.trunc(Number(payload.catastrophicWeaknessCap) || 0)),
  };
}

function evaluateClaimGate({
  scorecard,
  humanComparison,
  auditArtifacts = [],
  catastrophicWeaknessCount = 0,
  policy = null,
} = {}) {
  const resolvedPolicy = policy || loadClaimGatePolicy();
  const thresholds = resolvedPolicy.thresholds;
  const score = scorecard && typeof scorecard === "object" ? scorecard : {};
  const human = humanComparison && typeof humanComparison === "object" ? humanComparison : {};
  const checks = {
    performanceScore: Number(score.performanceScore || 0) >= Number(thresholds.performanceScore || 0),
    generalityScore: Number(score.generalityScore || 0) >= Number(thresholds.generalityScore || 0),
    autonomyScore: Number(score.autonomyScore || 0) >= Number(thresholds.autonomyScore || 0),
    familyCoverageScore: Number(score.familyCoverageScore || 0) >= Number(thresholds.familyCoverageScore || 0),
    heldOutRobustnessScore: Number(score.heldOutRobustnessScore || 0) >= Number(thresholds.heldOutRobustnessScore || 0),
    verifierReliabilityScore: Number(score.verifierReliabilityScore || 0) >= Number(thresholds.verifierReliabilityScore || 0),
    regressionStabilityScore: Number(score.regressionStabilityScore || 0) >= Number(thresholds.regressionStabilityScore || 0),
    humanBaselineComparisonScore: Number(score.humanBaselineComparisonScore || 0) >= Number(thresholds.humanBaselineComparisonScore || 0),
    humanObservedRuns: resolvedPolicy.humanBaselineRequiresObservedRuns ? Number(human.observedCount || 0) > 0 && Number(human.synthetic || 0) === 0 : true,
    catastrophicWeaknessCap: Number(catastrophicWeaknessCount || 0) <= Number(resolvedPolicy.catastrophicWeaknessCap || 0),
    requiredAuditArtifacts: resolvedPolicy.requiredAuditArtifacts.every((entry) => ensureArray(auditArtifacts).includes(entry)),
  };
  const readyForExternalAudit = Object.values(checks).every(Boolean);
  return {
    schema: "agi-claim-gate-report.v1",
    generatedAt: nowIso(),
    checks,
    claimRecommendation: readyForExternalAudit ? "READY_FOR_EXTERNAL_AUDIT" : (Number(score.performanceScore || 0) >= 50 ? "PARTIAL_READINESS" : "NOT_READY"),
  };
}

function buildExternalAuditBundle({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  readinessReport,
  scorecard,
  outputs = {},
} = {}) {
  const bundleRoot = path.join(workspaceRoot, "output", "external_audit_bundle", `${Date.now()}`);
  ensureDir(bundleRoot);
  const manifest = {
    schema: "external-audit-bundle-manifest.v1",
    generatedAt: nowIso(),
    readinessReport: path.relative(workspaceRoot, safeString(outputs.readinessReportPath, 400) ? path.join(workspaceRoot, outputs.readinessReportPath) : "").replace(/\\/g, "/"),
    includedArtifacts: Object.entries(outputs).map(([key, value]) => ({
      key,
      path: safeString(value, 400),
    })),
    knownLimitations: uniqueStrings(readinessReport && readinessReport.knownLimitations, 24),
    scorecard,
  };
  writeJson(path.join(bundleRoot, "benchmark_manifest.json"), manifest);
  writeJson(path.join(bundleRoot, "scoring_logic_summary.json"), {
    schema: "scoring-logic-summary.v1",
    generatedAt: nowIso(),
    scorecard,
  });
  writeJson(path.join(bundleRoot, "human_baseline_protocol.json"), {
    schema: "human-baseline-protocol.v1",
    generatedAt: nowIso(),
    requirement: "same_task_same_acceptance_same_budget",
  });
  writeJson(path.join(bundleRoot, "safety_policy_summary.json"), {
    schema: "safety-policy-summary.v1",
    generatedAt: nowIso(),
    source: "scripts/config/autonomy_risk_policy.json",
  });
  writeJson(path.join(bundleRoot, "architecture_summary.json"), {
    schema: "architecture-summary.v1",
    generatedAt: nowIso(),
    source: "docs/CURRENT_ARCHITECTURE.md",
  });
  writeJson(path.join(bundleRoot, "reproducibility_runbook.json"), {
    schema: "reproducibility-runbook.v1",
    generatedAt: nowIso(),
    commands: [
      "node scripts/run_remaining_program.js all",
      "node scripts/remaining_program_e2e_test.js",
    ],
  });
  writeJson(path.join(bundleRoot, "known_limitations.json"), {
    schema: "known-limitations.v1",
    generatedAt: nowIso(),
    limitations: uniqueStrings(readinessReport && readinessReport.knownLimitations, 24),
  });
  return { ok: true, bundleRoot };
}

module.exports = {
  appendIncidentLog,
  archiveKnowledgeEntries,
  assertSafeAction,
  buildExternalAuditBundle,
  buildForensicTraceBundle,
  classifyAutonomyRisk,
  clusterFailures,
  compareAiToHuman,
  computeGeneralityScorecard,
  computeToolReliabilityScore,
  createAdaptationJobSpec,
  defaultAutonomyRiskPolicyPath,
  defaultClaimGatePolicyPath,
  defaultKnowledgeSystemPolicyPath,
  defaultModelRoutingPolicyPath,
  defaultToolRegistryManifestPath,
  ensureKnowledgeStore,
  ensureArray,
  evaluateAdaptationCandidate,
  evaluateClaimGate,
  evaluateRetrievalQuality,
  exportHumanBaselineTasks,
  generateCurriculum,
  importHumanBaselineRuns,
  loadAutonomyRiskPolicy,
  loadEvalLanePolicy,
  loadEvalSuiteForLane,
  loadGeneratedSkillRegistry,
  loadKnowledgeIndex,
  loadKnowledgePolicy,
  loadModelRoutingPolicy,
  loadRawEvalSuiteForLane,
  loadRuntimeToolRegistry,
  loadToolRegistryManifest,
  loadClaimGatePolicy,
  loadDeploymentControlState,
  normalizeKnowledgeSystemPolicy,
  nowIso,
  parseJson,
  parseJsonFileChecked,
  parseTimestamp,
  packageAdaptationDataset,
  pruneGeneratedSkills,
  registerGeneratedSkill,
  registerKnowledgeVersion,
  registerToolCandidate,
  resolveWorkspacePath,
  retrieveKnowledgeSlice,
  routeModel,
  safeString,
  slugify,
  stableHash,
  summarizeEvalResults,
  uniqueStrings,
  updateDeploymentControlState,
  writeGeneratedSkillRegistry,
  writeKnowledgeIndex,
  writeRuntimeToolRegistry,
  writeJson,
  appendJsonLine,
  runChampionChallenger,
};
