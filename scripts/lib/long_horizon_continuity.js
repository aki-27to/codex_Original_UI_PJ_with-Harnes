"use strict";

const fs = require("fs");
const path = require("path");
const {
  ensureDir,
  getLoggingSurfacePaths,
  readJsonIfExists,
  repoRelative,
  writeJson,
} = require("./logging_surface");
const {
  defaultTaskContractManifestPath,
  loadTaskContractManifest,
  resolveTaskContractForFamily,
  summarizeTaskContract,
} = require("./task_contract_policy");
const {
  buildAcceptanceContract,
  buildCloseoutSummary,
  buildPlanArtifact,
  buildReplanArtifact,
  buildTaskOperatingSummary,
  buildTaskSpec,
  ensureLifecycle,
  ensurePlanStateShape,
  lifecycleAllowsAbandon,
  lifecycleAllowsArchive,
  lifecycleAllowsResume,
  transitionLifecycle,
} = require("./structured_task_lifecycle");
const {
  loadGeneratedSkillRegistry,
  retrieveKnowledgeSlice,
} = require("./agi_candidate_runtime");

const defaultContinuityPolicyPath = path.join(__dirname, "..", "config", "long_horizon_continuity_policy.json");
const defaultRepoLocalSkillCatalogPath = path.join(__dirname, "..", "config", "repo_local_skill_catalog.json");

function safeString(value, max = 4000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function nowIso(value = Date.now()) {
  const parsed = Number(value);
  return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString();
}

function slugify(value, fallback = "item", max = 80) {
  const raw = safeString(value, 200).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (raw || fallback).slice(0, max);
}

function clampPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
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

function normalizePathList(workspaceRoot, values, max = 32) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values : []) {
    const raw = safeString(entry, 600);
    if (!raw) continue;
    const absolute = path.resolve(workspaceRoot, raw);
    const relative = repoRelative(workspaceRoot, absolute);
    if (!relative || seen.has(relative)) continue;
    seen.add(relative);
    out.push(relative);
    if (out.length >= max) break;
  }
  return out;
}

function resolveWorkspacePath(workspaceRoot, candidate, fallbackRelative = "") {
  const raw = safeString(candidate, 800) || safeString(fallbackRelative, 800);
  if (!raw) return "";
  return path.isAbsolute(raw) ? path.normalize(raw) : path.join(workspaceRoot, raw);
}

function parseJsonFile(filePath, fallback = null) {
  const parsed = readJsonIfExists(filePath);
  return parsed === null ? fallback : parsed;
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${String(value || "")}\n`, "utf8");
}

function appendJsonLine(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function parseJsonFileChecked(filePath, { label = "state", required = false } = {}) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) {
    if (required) {
      throw new Error(`continuity_state_missing:${label}:${filePath}`);
    }
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`continuity_state_corrupted:${label}:${filePath}:${error && error.message ? error.message : String(error)}`);
  }
}

function readStructuredJson(filePath, { label = "structured", required = false, fallback = null } = {}) {
  const payload = parseJsonFileChecked(filePath, { label, required });
  if (payload && typeof payload === "object") return payload;
  return typeof fallback === "function" ? fallback() : fallback;
}

function withTaskMutationLock(paths, callback) {
  ensureDir(path.dirname(paths.taskLockPath));
  let fd = null;
  try {
    fd = fs.openSync(paths.taskLockPath, "wx");
    fs.writeFileSync(fd, JSON.stringify({
      schema: "continuity-task-lock.v1",
      acquiredAt: nowIso(),
      pid: process.pid,
      taskRoot: paths.taskRoot,
    }, null, 2));
    return callback();
  } catch (error) {
    if (error && error.code === "EEXIST") {
      throw new Error(`continuity_task_locked:${paths.taskLockPath}`);
    }
    throw error;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(paths.taskLockPath);
      } catch {
        // ignore
      }
    }
  }
}

function parseStringList(raw, delimiter = "|") {
  return uniqueStrings(
    String(raw || "")
      .split(delimiter)
      .map((entry) => safeString(entry, 500))
      .filter(Boolean)
  );
}

function parseKvList(raw, { entryDelimiter = "|", kvDelimiter = "::" } = {}) {
  const out = [];
  for (const entry of parseStringList(raw, entryDelimiter)) {
    const [left, ...rest] = entry.split(kvDelimiter);
    out.push({
      key: safeString(left, 200),
      value: safeString(rest.join(kvDelimiter), 2000),
    });
  }
  return out.filter((entry) => entry.key && entry.value);
}

function normalizeContinuityPolicy(input, { workspaceRoot }) {
  const payload = input && typeof input === "object" ? input : {};
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "long-horizon-continuity-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    workspaceRoot,
    rootPath: resolveWorkspacePath(workspaceRoot, payload.rootPath, "logs/archive/raw/runtime_state/continuity"),
    registryPath: resolveWorkspacePath(workspaceRoot, payload.registryPath, "logs/archive/raw/runtime_state/continuity/task_registry.json"),
    sessionDirectoryName: safeString(payload.sessionDirectoryName, 80) || "sessions",
    artifactDirectoryName: safeString(payload.artifactDirectoryName, 80) || "handoff",
    archiveDirectoryName: safeString(payload.archiveDirectoryName, 80) || "archive",
    stateLockFileName: safeString(payload.stateLockFileName, 80) || ".task.lock",
    lifecycleLogFileName: safeString(payload.lifecycleLogFileName, 80) || "lifecycle_events.jsonl",
    durableMemoryArchiveFileName: safeString(payload.durableMemoryArchiveFileName, 80) || "durable_memory_archive.jsonl",
    defaultPruneAgeDays: Math.max(1, Math.trunc(Number(payload.defaultPruneAgeDays) || 30)),
    durablePromotion: Object.freeze({
      allowKinds: uniqueStrings(payload.durablePromotion && payload.durablePromotion.allowKinds, 24),
      denyKinds: uniqueStrings(payload.durablePromotion && payload.durablePromotion.denyKinds, 24),
    }),
    conflictResolution: Object.freeze({
      precedence: uniqueStrings(payload.conflictResolution && payload.conflictResolution.precedence, 16),
      defaultRule: safeString(payload.conflictResolution && payload.conflictResolution.defaultRule, 160) || "prefer_newer_verified_then_durable_then_session",
    }),
    contextInjectionOrder: uniqueStrings(payload.contextInjectionOrder, 12),
    contextInjectionLimits: Object.freeze({
      taskContract: Math.max(400, Math.trunc(Number(payload.contextInjectionLimits && payload.contextInjectionLimits.task_contract) || Number(payload.contextInjectionLimits && payload.contextInjectionLimits.taskContract) || 2400)),
      verifiedPlanState: Math.max(400, Math.trunc(Number(payload.contextInjectionLimits && payload.contextInjectionLimits.verified_plan_state) || Number(payload.contextInjectionLimits && payload.contextInjectionLimits.verifiedPlanState) || 2600)),
      nextSessionBrief: Math.max(400, Math.trunc(Number(payload.contextInjectionLimits && payload.contextInjectionLimits.next_session_brief) || Number(payload.contextInjectionLimits && payload.contextInjectionLimits.nextSessionBrief) || 2200)),
      unresolvedVerifierFindings: Math.max(400, Math.trunc(Number(payload.contextInjectionLimits && payload.contextInjectionLimits.unresolved_verifier_findings) || Number(payload.contextInjectionLimits && payload.contextInjectionLimits.unresolvedVerifierFindings) || 2200)),
      relevantGlobalMemory: Math.max(400, Math.trunc(Number(payload.contextInjectionLimits && payload.contextInjectionLimits.relevant_global_memory) || Number(payload.contextInjectionLimits && payload.contextInjectionLimits.relevantGlobalMemory) || 1800)),
      relevantKnowledge: Math.max(400, Math.trunc(Number(payload.contextInjectionLimits && payload.contextInjectionLimits.relevant_knowledge) || Number(payload.contextInjectionLimits && payload.contextInjectionLimits.relevantKnowledge) || 1800)),
      skillsMetadata: Math.max(200, Math.trunc(Number(payload.contextInjectionLimits && payload.contextInjectionLimits.skills_metadata) || Number(payload.contextInjectionLimits && payload.contextInjectionLimits.skillsMetadata) || 1200)),
      totalChars: Math.max(2000, Math.trunc(Number(payload.contextInjectionLimits && payload.contextInjectionLimits.totalChars) || 12000)),
    }),
    protectedPaths: uniqueStrings(payload.protectedPaths, 16).map((entry) => resolveWorkspacePath(workspaceRoot, entry)),
    inspectionDefaults: Object.freeze({
      sessionMemoryLimit: Math.max(1, Math.trunc(Number(payload.inspectionDefaults && payload.inspectionDefaults.sessionMemoryLimit) || 20)),
      globalMemoryLimit: Math.max(1, Math.trunc(Number(payload.inspectionDefaults && payload.inspectionDefaults.globalMemoryLimit) || 20)),
      artifactLimit: Math.max(1, Math.trunc(Number(payload.inspectionDefaults && payload.inspectionDefaults.artifactLimit) || 24)),
      verifierLimit: Math.max(1, Math.trunc(Number(payload.inspectionDefaults && payload.inspectionDefaults.verifierLimit) || 20)),
      taskListLimit: Math.max(1, Math.trunc(Number(payload.inspectionDefaults && payload.inspectionDefaults.taskListLimit) || 64)),
    }),
  });
}

function loadContinuityPolicy(filePath = defaultContinuityPolicyPath, { workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return normalizeContinuityPolicy(raw ? JSON.parse(raw) : {}, { workspaceRoot });
}

function loadRepoLocalSkillCatalog(filePath = defaultRepoLocalSkillCatalogPath, { workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const absolutePath = path.resolve(filePath);
  const payload = parseJsonFile(absolutePath, {}) || {};
  const baseSkills = Array.isArray(payload.skills) ? payload.skills : [];
  const generatedRegistry = loadGeneratedSkillRegistry({ workspaceRoot });
  const generatedSkills = Array.isArray(generatedRegistry && generatedRegistry.skills) ? generatedRegistry.skills : [];
  const mergedSkills = [
    ...baseSkills,
    ...generatedSkills.map((entry) => ({
      id: entry && entry.id,
      path: entry && entry.path,
      description: entry && entry.description,
      useWhen: [entry && entry.trigger].filter(Boolean),
      avoidWhen: [],
      expectedArtifacts: entry && entry.tests ? entry.tests : [],
    })),
  ];
  return {
    schema: safeString(payload.schema, 120) || "repo-local-skill-catalog.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    skillsRoot: resolveWorkspacePath(workspaceRoot, payload.skillsRoot, ".agents/skills"),
    skills: mergedSkills.map((entry) => ({
      id: slugify(entry && entry.id, "skill"),
      path: resolveWorkspacePath(workspaceRoot, entry && entry.path),
      description: safeString(entry && entry.description, 400),
      useWhen: uniqueStrings(entry && entry.useWhen, 8),
      avoidWhen: uniqueStrings(entry && entry.avoidWhen, 8),
      expectedArtifacts: uniqueStrings(entry && entry.expectedArtifacts, 16),
    })),
  };
}

function ensureRegistry(policy) {
  const registry = parseJsonFile(policy.registryPath, null);
  if (registry && typeof registry === "object" && Array.isArray(registry.tasks)) {
    let changed = false;
    const normalizedTasks = registry.tasks.map((entry) => {
      const normalized = normalizeRegistryTaskEntry(entry);
      if (JSON.stringify(normalized) !== JSON.stringify(entry || {})) changed = true;
      return normalized;
    });
    if (changed) {
      writeJson(policy.registryPath, {
        schema: "continuity-task-registry.v1",
        updatedAt: nowIso(),
        tasks: normalizedTasks,
      });
    }
    return {
      schema: "continuity-task-registry.v1",
      updatedAt: safeString(registry.updatedAt, 80) || nowIso(),
      tasks: normalizedTasks,
    };
  }
  const fresh = {
    schema: "continuity-task-registry.v1",
    updatedAt: nowIso(),
    tasks: [],
  };
  writeJson(policy.registryPath, fresh);
  return fresh;
}

function writeRegistry(policy, registry) {
  writeJson(policy.registryPath, {
    schema: "continuity-task-registry.v1",
    updatedAt: nowIso(),
    tasks: Array.isArray(registry && registry.tasks) ? registry.tasks.map((entry) => normalizeRegistryTaskEntry(entry)) : [],
  });
}

function readRegistryRows(policy) {
  const registry = ensureRegistry(policy);
  return Array.isArray(registry.tasks) ? registry.tasks.map((entry) => normalizeRegistryTaskEntry(entry)) : [];
}

function listChildTaskRecords(policy, parentTaskId, { lifecycleState = "", limit = null } = {}) {
  const normalizedParentTaskId = safeString(parentTaskId, 120);
  return readRegistryRows(policy)
    .filter((entry) => safeString(entry && entry.parentTaskId, 120) === normalizedParentTaskId)
    .filter((entry) => !safeString(lifecycleState, 80) || safeString(entry && entry.lifecycleState, 80) === safeString(lifecycleState, 80))
    .slice(0, limit || policy.inspectionDefaults.taskListLimit);
}

function listOrphanChildTaskRecords(policy, { rootTaskId = "", limit = null } = {}) {
  const rows = readRegistryRows(policy);
  const knownTaskIds = new Set(rows.map((entry) => safeString(entry && entry.taskId, 120)).filter(Boolean));
  const filtered = rows.filter((entry) => {
    const parentTaskId = safeString(entry && entry.parentTaskId, 120);
    if (!parentTaskId) return false;
    if (safeString(rootTaskId, 120) && safeString(entry && entry.rootTaskId, 120) !== safeString(rootTaskId, 120)) return false;
    return !knownTaskIds.has(parentTaskId);
  });
  return filtered.slice(0, limit || policy.inspectionDefaults.taskListLimit);
}

function deriveLifecycleStateFromRegistryEntry(entry) {
  const current = safeString(entry && entry.lifecycleState, 80);
  if (current) return current;
  const legacyStatus = safeString(entry && entry.status, 80).toUpperCase();
  if (legacyStatus === "COMPLETED") return "completed";
  if (legacyStatus === "FAILED_VALIDATION") return "verifier_failed";
  if (legacyStatus === "ABANDONED") return "abandoned";
  if (legacyStatus === "ARCHIVED") return "archived";
  if (legacyStatus === "PARTIAL" || safeString(entry && entry.phase, 80) === "paused") return "blocked";
  return "planned";
}

function normalizeRegistryTaskEntry(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const taskId = safeString(source.taskId, 120);
  const lifecycleState = deriveLifecycleStateFromRegistryEntry(source);
  const acceptance = source.acceptance && typeof source.acceptance === "object" ? source.acceptance : {};
  return {
    taskId,
    title: safeString(source.title, 200),
    phase: safeString(source.phase, 80),
    status: safeString(source.status, 80) || (lifecycleState === "completed" ? "COMPLETED" : lifecycleState === "verifier_failed" ? "FAILED_VALIDATION" : lifecycleState === "abandoned" ? "ABANDONED" : lifecycleState === "archived" ? "ARCHIVED" : lifecycleState === "blocked" ? "PARTIAL" : "active"),
    lifecycleState,
    activeSessionId: safeString(source.activeSessionId, 120),
    lastSessionId: safeString(source.lastSessionId, 120),
    updatedAt: safeString(source.updatedAt, 80) || nowIso(),
    objective: safeString(source.objective, 320),
    currentStepId: safeString(source.currentStepId, 120),
    blockers: uniqueStrings(source.blockers, 12),
    lastVerifierVerdict: safeString(source.lastVerifierVerdict, 40),
    acceptance: {
      total: Math.max(0, Math.trunc(Number(acceptance.total) || 0)),
      completed: Math.max(0, Math.trunc(Number(acceptance.completed) || 0)),
      remaining: Math.max(0, Math.trunc(Number(acceptance.remaining) || 0)),
    },
    role: safeString(source.role, 80) || "coordinator",
    parentTaskId: safeString(source.parentTaskId, 120),
    rootTaskId: safeString(source.rootTaskId, 120) || taskId,
    orchestrationMode: safeString(source.orchestrationMode, 80) || "single_agent",
    childCount: Math.max(0, Math.trunc(Number(source.childCount) || 0)),
    integrationStatus: safeString(source.integrationStatus, 80) || "not_applicable",
    abandonAllowed: source.abandonAllowed ? 1 : 0,
    archiveAllowed: source.archiveAllowed ? 1 : 0,
  };
}

function updateRegistryTask(policy, taskId, record) {
  const registry = ensureRegistry(policy);
  const nextTasks = [];
  let replaced = false;
  for (const entry of registry.tasks) {
    if (safeString(entry && entry.taskId, 120) !== taskId) {
      nextTasks.push(entry);
      continue;
    }
    nextTasks.push(record);
    replaced = true;
  }
  if (!replaced) nextTasks.push(record);
  writeRegistry(policy, { tasks: nextTasks });
}

function buildTaskPaths({ workspaceRoot, policy, taskId, sessionId = "" }) {
  const loggingPaths = getLoggingSurfacePaths(workspaceRoot);
  const taskRoot = path.join(policy.rootPath, "tasks", taskId);
  const sessionsRoot = path.join(taskRoot, policy.sessionDirectoryName);
  const sessionRoot = sessionId ? path.join(sessionsRoot, sessionId) : "";
  const artifactRoot = sessionRoot ? path.join(sessionRoot, policy.artifactDirectoryName) : "";
  const archiveRoot = path.join(taskRoot, policy.archiveDirectoryName);
  return {
    loggingPaths,
    continuityRoot: policy.rootPath,
    taskRoot,
    sessionsRoot,
    sessionRoot,
    artifactRoot,
    archiveRoot,
    taskStatePath: path.join(taskRoot, "task_state.json"),
    planStatePath: path.join(taskRoot, "plan_state.json"),
    taskSpecPath: path.join(taskRoot, "task_spec.json"),
    planArtifactPath: path.join(taskRoot, "plan.json"),
    acceptanceContractPath: path.join(taskRoot, "acceptance_contract.json"),
    closeoutSummaryPath: path.join(taskRoot, "closeout_summary.json"),
    replanPath: path.join(taskRoot, "replan.json"),
    agentGraphPath: path.join(taskRoot, "agent_graph.json"),
    handoffHistoryPath: path.join(taskRoot, "handoff_history.json"),
    integrationSummaryPath: path.join(taskRoot, "integration_summary.json"),
    globalMemoryPath: path.join(taskRoot, "global_memory.json"),
    verifierStatePath: path.join(taskRoot, "verifier_state.json"),
    artifactIndexPath: path.join(taskRoot, "artifact_index.json"),
    lifecycleLogPath: path.join(taskRoot, policy.lifecycleLogFileName),
    durableMemoryArchivePath: path.join(taskRoot, policy.archiveDirectoryName, policy.durableMemoryArchiveFileName),
    taskLockPath: path.join(taskRoot, policy.stateLockFileName),
    sessionMemoryPath: sessionRoot ? path.join(sessionRoot, "session_memory.json") : "",
    resumeContextPath: sessionRoot ? path.join(sessionRoot, "resume_context.json") : "",
    sprintContractPath: sessionRoot ? path.join(sessionRoot, "sprint_contract.json") : "",
  };
}

function ensureTaskDirs(paths) {
  ensureDir(paths.taskRoot);
  ensureDir(paths.sessionsRoot);
  if (paths.sessionRoot) ensureDir(paths.sessionRoot);
  if (paths.artifactRoot) ensureDir(paths.artifactRoot);
  if (paths.archiveRoot) ensureDir(paths.archiveRoot);
}

function loadTaskBundle(paths) {
  const taskState = parseJsonFileChecked(paths.taskStatePath, { label: "task_state", required: false });
  const planState = parseJsonFileChecked(paths.planStatePath, { label: "plan_state", required: false });
  const globalMemory = parseJsonFileChecked(paths.globalMemoryPath, { label: "global_memory", required: false });
  const verifierState = parseJsonFileChecked(paths.verifierStatePath, { label: "verifier_state", required: false });
  const artifactIndex = parseJsonFileChecked(paths.artifactIndexPath, { label: "artifact_index", required: false });
  const sessionMemory = paths.sessionMemoryPath ? parseJsonFileChecked(paths.sessionMemoryPath, { label: "session_memory", required: false }) : null;
  const sprintContract = paths.sprintContractPath ? parseJsonFileChecked(paths.sprintContractPath, { label: "sprint_contract", required: false }) : null;
  const taskSpec = parseJsonFileChecked(paths.taskSpecPath, { label: "task_spec", required: false });
  const acceptanceContract = parseJsonFileChecked(paths.acceptanceContractPath, { label: "acceptance_contract", required: false });
  const closeoutSummary = parseJsonFileChecked(paths.closeoutSummaryPath, { label: "closeout_summary", required: false });
  const replan = parseJsonFileChecked(paths.replanPath, { label: "replan", required: false });
  const agentGraph = readStructuredJson(paths.agentGraphPath, {
    label: "agent_graph",
    fallback: () => taskState ? buildDefaultAgentGraph(taskState) : null,
  });
  const handoffHistory = readStructuredJson(paths.handoffHistoryPath, {
    label: "handoff_history",
    fallback: () => taskState ? buildDefaultHandoffHistory(taskState) : null,
  });
  const integrationSummary = readStructuredJson(paths.integrationSummaryPath, {
    label: "integration_summary",
    fallback: () => taskState ? buildDefaultIntegrationSummary(taskState) : null,
  });
  if (taskState) ensureLifecycle(taskState, { source: "load_task_bundle", reason: "backfill lifecycle metadata for pre-phase3 tasks" });
  if (planState) ensurePlanStateShape(planState, { objective: safeString(taskState && taskState.objective, 800), sessionId: safeString(taskState && taskState.lastSessionId, 120) });
  return {
    taskState,
    planState,
    taskSpec,
    acceptanceContract,
    closeoutSummary,
    replan,
    agentGraph,
    handoffHistory,
    integrationSummary,
    globalMemory,
    verifierState,
    artifactIndex,
    sessionMemory,
    sprintContract,
  };
}

function createTaskRecordForRegistry(taskState, planState) {
  ensureLifecycle(taskState, { source: "registry_snapshot", reason: "normalize lifecycle before snapshot" });
  const acceptanceRows = Array.isArray(planState && planState.acceptanceCriteria) ? planState.acceptanceCriteria : [];
  return normalizeRegistryTaskEntry({
    taskId: safeString(taskState && taskState.taskId, 120),
    title: safeString(taskState && taskState.title, 200),
    phase: safeString(taskState && taskState.phase, 80),
    status: safeString(taskState && taskState.status, 80),
    lifecycleState: safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80),
    activeSessionId: safeString(taskState && taskState.activeSessionId, 120),
    lastSessionId: safeString(taskState && taskState.lastSessionId, 120),
    updatedAt: safeString(taskState && taskState.updatedAt, 80) || nowIso(),
    objective: safeString(taskState && taskState.objective, 320),
    currentStepId: safeString(planState && planState.currentStepId, 120),
    blockers: uniqueStrings(taskState && taskState.unresolvedItems, 12),
    lastVerifierVerdict: safeString(taskState && taskState.lastVerifierVerdict, 40),
    acceptance: {
      total: acceptanceRows.length,
      completed: acceptanceRows.filter((entry) => safeString(entry && entry.status, 40) === "passed").length,
      remaining: acceptanceRows.filter((entry) => safeString(entry && entry.status, 40) !== "passed").length,
    },
    role: safeString(taskState && taskState.role, 80) || "coordinator",
    parentTaskId: safeString(taskState && taskState.parentTaskId, 120),
    rootTaskId: safeString(taskState && taskState.rootTaskId, 120) || safeString(taskState && taskState.taskId, 120),
    orchestrationMode: safeString(taskState && taskState.orchestrationMode, 80) || "single_agent",
    childCount: Array.isArray(taskState && taskState.childTaskIds) ? taskState.childTaskIds.length : 0,
    integrationStatus: safeString(taskState && taskState.integrationStatus, 80) || "not_applicable",
    abandonAllowed: lifecycleAllowsAbandon(safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80)) ? 1 : 0,
    archiveAllowed: lifecycleAllowsArchive(safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80)) ? 1 : 0,
  });
}

function buildDefaultPlanState({ taskId, objective, acceptanceCriteria, milestones, steps, sessionId }) {
  const normalizedAcceptance = uniqueStrings(acceptanceCriteria, 24).map((text, index) => ({
    id: slugify(`acceptance-${index + 1}`),
    text,
    status: "pending",
    verifiedBy: "",
    lastCheckedAt: "",
    source: "initialize_task",
  }));
  const milestoneRows = (Array.isArray(milestones) && milestones.length ? milestones : ["baseline", "implementation", "verification", "handoff"]).map((title, index) => ({
    id: slugify(`milestone-${index + 1}-${title}`),
    title: safeString(title, 200),
    status: index === 0 ? "in_progress" : "pending",
    updatedAt: nowIso(),
    source: "initialize_task",
  }));
  const stepRows = (Array.isArray(steps) && steps.length ? steps : [
    "lock plan and acceptance",
    "execute current sprint",
    "verify and update unresolved items",
    "close session with handoff",
  ]).map((title, index) => ({
    id: slugify(`step-${index + 1}-${title}`),
    title: safeString(title, 200),
    status: index === 0 ? "in_progress" : "pending",
    priority: index + 1,
    acceptanceRefs: normalizedAcceptance.map((entry) => entry.id).slice(0, Math.min(2, normalizedAcceptance.length)),
    updatedAt: nowIso(),
    source: "initialize_task",
  }));
  return ensurePlanStateShape({
    schema: "long-horizon-plan-state.v1",
    taskId,
    objective: safeString(objective, 400),
    milestones: milestoneRows,
    steps: stepRows,
    currentStepId: stepRows[0] ? stepRows[0].id : "",
    currentSprint: {
      id: slugify(`sprint-${sessionId || "initial"}`),
      title: "initial sprint",
      goal: safeString(objective, 260),
      status: "active",
      stepIds: stepRows.slice(0, Math.min(2, stepRows.length)).map((entry) => entry.id),
      sessionId: safeString(sessionId, 120),
      updatedAt: nowIso(),
    },
    acceptanceCriteria: normalizedAcceptance,
    verifiedAt: "",
    updatedAt: nowIso(),
  }, { objective, sessionId });
}

function buildDefaultSessionMemory({ taskId, sessionId, phase }) {
  return {
    schema: "long-horizon-session-memory.v1",
    taskId,
    sessionId,
    sessionStatus: "active",
    phase: safeString(phase, 80) || "initialize",
    notes: [],
    recentChanges: [],
    hypotheses: [],
    summary: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function buildDefaultGlobalMemory(taskId) {
  return {
    schema: "long-horizon-global-memory.v1",
    taskId,
    entries: [],
    updatedAt: nowIso(),
  };
}

function buildDefaultVerifierState(taskId) {
  return {
    schema: "long-horizon-verifier-state.v1",
    taskId,
    lastVerifierVerdict: "UNKNOWN",
    lastVerifiedAt: "",
    unresolvedFindings: [],
    pendingRechecks: [],
    verificationHistory: [],
    updatedAt: nowIso(),
  };
}

function buildDefaultArtifactIndex(taskId) {
  return {
    schema: "long-horizon-artifact-index.v1",
    taskId,
    artifacts: [],
    updatedAt: nowIso(),
  };
}

function buildDefaultAgentGraph(taskState) {
  const taskId = safeString(taskState && taskState.taskId, 120);
  return {
    schema: "bounded-agent-graph.v1",
    taskId,
    rootTaskId: safeString(taskState && taskState.rootTaskId, 120) || taskId,
    orchestrationMode: safeString(taskState && taskState.orchestrationMode, 80) || "single_agent",
    updatedAt: nowIso(),
    nodes: [{
      taskId,
      role: safeString(taskState && taskState.role, 80) || "coordinator",
      parentTaskId: safeString(taskState && taskState.parentTaskId, 120),
      lifecycleState: safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80) || "planned",
      status: safeString(taskState && taskState.status, 80),
      integrationStatus: safeString(taskState && taskState.integrationStatus, 80) || "not_applicable",
      updatedAt: safeString(taskState && taskState.updatedAt, 80) || nowIso(),
    }],
    edges: [],
    activeChildTaskIds: uniqueStrings(taskState && taskState.childTaskIds, 64),
    pendingChildTaskIds: [],
    orphanChildTaskIds: [],
  };
}

function buildDefaultHandoffHistory(taskState) {
  return {
    schema: "bounded-handoff-history.v1",
    taskId: safeString(taskState && taskState.taskId, 120),
    updatedAt: nowIso(),
    entries: [],
  };
}

function buildDefaultIntegrationSummary(taskState) {
  return {
    schema: "bounded-integration-summary.v1",
    taskId: safeString(taskState && taskState.taskId, 120),
    updatedAt: nowIso(),
    orchestrationMode: safeString(taskState && taskState.orchestrationMode, 80) || "single_agent",
    mergedResults: [],
    pendingIntegrations: [],
    blockedChildren: [],
    verifierFailedChildren: [],
    deniedChildren: [],
    orphanChildTaskIds: [],
    overallStatus: safeString(taskState && taskState.integrationStatus, 80) || "not_applicable",
  };
}

function buildTaskState({
  taskId,
  title,
  objective,
  familyId,
  contract,
  sessionId,
  acceptanceCriteria,
  stopConditions,
  role = "",
  parentTaskId = "",
  rootTaskId = "",
  orchestrationMode = "",
  roleContractId = "",
}) {
  const taskState = {
    schema: "long-horizon-task-state.v1",
    taskId,
    title: safeString(title, 200) || taskId,
    objective: safeString(objective, 800),
    familyId: safeString(familyId, 80) || safeString(contract && contract.familyId, 80),
    taskContractId: safeString(contract && contract.id, 80),
    taskContractSummary: summarizeTaskContract(contract),
    phase: "initialize",
    status: "active",
    progress: {
      percent: 0,
      summary: "initialized",
      updatedAt: nowIso(),
    },
    unresolvedItems: [],
    stopConditions: uniqueStrings(stopConditions && stopConditions.length ? stopConditions : contract && contract.stopConditions, 16),
    acceptanceCriteria: uniqueStrings(acceptanceCriteria, 24),
    approvalBoundary: contract && contract.approvalBoundary ? contract.approvalBoundary : { requiredWhen: [] },
    role: safeString(role, 80) || "coordinator",
    roleContractId: safeString(roleContractId, 80) || safeString(role, 80) || "coordinator",
    parentTaskId: safeString(parentTaskId, 120),
    rootTaskId: safeString(rootTaskId, 120) || taskId,
    orchestrationMode: safeString(orchestrationMode, 80) || "single_agent",
    childTaskIds: [],
    integrationStatus: "not_applicable",
    activeSessionId: safeString(sessionId, 120),
    lastSessionId: safeString(sessionId, 120),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    source: {
      initializedBy: "initialize_task",
      taskContractPath: repoRelative(path.resolve(__dirname, "..", ".."), defaultTaskContractManifestPath),
    },
  };
  ensureLifecycle(taskState, { source: "initialize_task", reason: "task initialized" });
  taskState.revision = 1;
  return taskState;
}

function appendArtifactIndex(artifactIndex, entry) {
  const nextArtifacts = Array.isArray(artifactIndex && artifactIndex.artifacts) ? artifactIndex.artifacts.slice() : [];
  nextArtifacts.push({
    id: safeString(entry && entry.id, 120) || slugify(`${entry && entry.type || "artifact"}-${Date.now()}`, "artifact"),
    type: safeString(entry && entry.type, 120),
    path: safeString(entry && entry.path, 600),
    sessionId: safeString(entry && entry.sessionId, 120),
    createdAt: safeString(entry && entry.createdAt, 80) || nowIso(),
    scope: safeString(entry && entry.scope, 40) || "session",
    humanReadable: entry && entry.humanReadable ? 1 : 0,
    machineReadable: entry && entry.machineReadable !== false ? 1 : 0,
    loadOnResume: entry && entry.loadOnResume === false ? 0 : 1,
    source: safeString(entry && entry.source, 160) || "continuity",
  });
  artifactIndex.artifacts = nextArtifacts;
  artifactIndex.updatedAt = nowIso();
}

function addSessionNote(sessionMemory, { kind, text, source = "update_progress", promoteCandidate = false } = {}) {
  const noteText = safeString(text, 2000);
  if (!noteText) return null;
  const note = {
    id: slugify(`${kind || "note"}-${Date.now()}`, "note", 120),
    kind: safeString(kind, 80) || "session_note",
    text: noteText,
    source: safeString(source, 160),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    recency: Date.now(),
    promoteCandidate: promoteCandidate ? 1 : 0,
  };
  sessionMemory.notes = Array.isArray(sessionMemory.notes) ? sessionMemory.notes : [];
  sessionMemory.notes.push(note);
  sessionMemory.updatedAt = nowIso();
  return note;
}

function addGlobalMemoryEntry(globalMemory, { kind, text, source, promotedFromSessionId = "", confidence = "medium" } = {}, policy) {
  const normalizedKind = safeString(kind, 80) || "workflow_note";
  if (policy.durablePromotion.denyKinds.includes(normalizedKind)) return null;
  if (policy.durablePromotion.allowKinds.length && !policy.durablePromotion.allowKinds.includes(normalizedKind)) return null;
  const body = safeString(text, 2000);
  if (!body) return null;
  globalMemory.entries = Array.isArray(globalMemory.entries) ? globalMemory.entries : [];
  const entry = {
    id: slugify(`${normalizedKind}-${Date.now()}`, "global-memory", 120),
    kind: normalizedKind,
    text: body,
    source: safeString(source, 160) || "close_session",
    promotedFromSessionId: safeString(promotedFromSessionId, 120),
    confidence: safeString(confidence, 40) || "medium",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    recency: Date.now(),
  };
  globalMemory.entries.push(entry);
  globalMemory.updatedAt = nowIso();
  return entry;
}

function normalizeChangedSurfaceEntries(workspaceRoot, values, source = "update_progress") {
  return normalizePathList(workspaceRoot, values, 64).map((relativePath) => ({
    path: relativePath,
    source,
    notedAt: nowIso(),
  }));
}

function updateChangedSurface(sessionMemory, changedEntries) {
  sessionMemory.recentChanges = Array.isArray(sessionMemory.recentChanges) ? sessionMemory.recentChanges : [];
  const seen = new Set(sessionMemory.recentChanges.map((entry) => safeString(entry && entry.path, 400)));
  for (const entry of Array.isArray(changedEntries) ? changedEntries : []) {
    const target = safeString(entry && entry.path, 400);
    if (!target || seen.has(target)) continue;
    sessionMemory.recentChanges.push(entry);
    seen.add(target);
  }
  sessionMemory.updatedAt = nowIso();
}

function updateAcceptanceCriteria(planState, updates = {}) {
  const nextAcceptance = Array.isArray(planState.acceptanceCriteria) ? planState.acceptanceCriteria.slice() : [];
  let changed = false;
  for (const criterion of nextAcceptance) {
    const key = safeString(criterion && criterion.id, 120);
    const nextStatus = safeString(updates[key], 40).toLowerCase();
    if (!nextStatus) continue;
    criterion.status = nextStatus;
    criterion.lastCheckedAt = nowIso();
    if (nextStatus === "passed") {
      criterion.verifiedBy = safeString(criterion.verifiedBy, 120) || "planner_executor_verifier";
    }
    changed = true;
  }
  if (changed) {
    planState.acceptanceCriteria = nextAcceptance;
    planState.updatedAt = nowIso();
  }
}

function updatePlanStep(planState, { currentStepId = "", currentStepStatus = "", sprintTitle = "", sprintGoal = "" } = {}) {
  const nextSteps = Array.isArray(planState.steps) ? planState.steps.slice() : [];
  const normalizedStepId = safeString(currentStepId, 120);
  const normalizedStatus = safeString(currentStepStatus, 40).toLowerCase();
  if (normalizedStepId) {
    for (const step of nextSteps) {
      if (safeString(step && step.id, 120) !== normalizedStepId) continue;
      step.status = normalizedStatus || step.status || "in_progress";
      step.updatedAt = nowIso();
    }
    planState.currentStepId = normalizedStepId;
    planState.steps = nextSteps;
  }
  if (planState.currentSprint && typeof planState.currentSprint === "object") {
    if (safeString(sprintTitle, 200)) planState.currentSprint.title = safeString(sprintTitle, 200);
    if (safeString(sprintGoal, 400)) planState.currentSprint.goal = safeString(sprintGoal, 400);
    planState.currentSprint.updatedAt = nowIso();
  }
  planState.updatedAt = nowIso();
}

function resolveVerifierReport(input) {
  if (input && typeof input === "object") return input;
  return {};
}

function applyVerifierReport(verifierState, reportInput, { source = "verifier", reportPath = "" } = {}) {
  const report = resolveVerifierReport(reportInput);
  const verdict = safeString(report && report.verdict, 40).toUpperCase() || "UNKNOWN";
  const failures = Array.isArray(report && report.failures) ? report.failures : [];
  verifierState.lastVerifierVerdict = verdict;
  verifierState.lastVerifiedAt = safeString(report && report.generatedAt, 80) || nowIso();
  verifierState.unresolvedFindings = failures.map((entry, index) => ({
    id: slugify(`${entry && entry.type || "finding"}-${index + 1}`, "finding", 120),
    type: safeString(entry && entry.type, 120) || "finding",
    reason: safeString(entry && entry.reason, 320) || safeString(entry && entry.observed, 320) || "verifier_failure",
    caseId: safeString(entry && entry.caseId, 120),
    variant: safeString(entry && entry.variant, 80),
    turnId: safeString(entry && entry.turnId, 160),
    sourcePath: safeString(reportPath, 600),
    createdAt: nowIso(),
  }));
  verifierState.pendingRechecks = verifierState.unresolvedFindings.map((entry) => ({
    findingId: entry.id,
    reason: entry.reason,
    status: "pending_recheck",
    createdAt: nowIso(),
  }));
  verifierState.verificationHistory = Array.isArray(verifierState.verificationHistory) ? verifierState.verificationHistory : [];
  verifierState.verificationHistory.push({
    verdict,
    generatedAt: verifierState.lastVerifiedAt,
    failureCount: verifierState.unresolvedFindings.length,
    source: safeString(source, 120),
    sourcePath: safeString(reportPath, 600),
    reason: safeString(report && report.reason, 240),
  });
  verifierState.updatedAt = nowIso();
  return verifierState;
}

function getLatestHandoffArtifact(artifactIndex, type) {
  const artifacts = Array.isArray(artifactIndex && artifactIndex.artifacts) ? artifactIndex.artifacts : [];
  const candidates = artifacts
    .filter((entry) => safeString(entry && entry.type, 120) === type)
    .slice()
    .sort((left, right) => Date.parse(safeString(right && right.createdAt, 80) || 0) - Date.parse(safeString(left && left.createdAt, 80) || 0));
  return candidates[0] || null;
}

function toHumanMarkdown(title, rows) {
  const lines = [`# ${title}`, ""];
  for (const row of Array.isArray(rows) ? rows : []) {
    const label = safeString(row && row.label, 120);
    const value = safeString(row && row.value, 8000);
    if (!label && !value) continue;
    if (label) {
      lines.push(`- ${label}: ${value || "-"}`);
      continue;
    }
    lines.push(`- ${value}`);
  }
  return lines.join("\n");
}

function buildChangedSurfaceArtifact({ taskState, sessionMemory, artifactIndex }) {
  const changedPaths = Array.isArray(sessionMemory && sessionMemory.recentChanges)
    ? sessionMemory.recentChanges.map((entry) => safeString(entry && entry.path, 400)).filter(Boolean)
    : [];
  const payload = {
    schema: "handoff-changed-surface.v1",
    generatedAt: nowIso(),
    taskId: taskState.taskId,
    changedPaths,
    latestArtifacts: (Array.isArray(artifactIndex && artifactIndex.artifacts) ? artifactIndex.artifacts : [])
      .slice(-12)
      .map((entry) => ({
        type: safeString(entry && entry.type, 120),
        path: safeString(entry && entry.path, 600),
      })),
  };
  return {
    payload,
    markdown: toHumanMarkdown("Changed Surface", changedPaths.map((entry) => ({
      label: "changed",
      value: entry,
    }))),
  };
}

function buildVerificationStatusArtifact({ taskState, verifierState, planState }) {
  const acceptance = Array.isArray(planState && planState.acceptanceCriteria) ? planState.acceptanceCriteria : [];
  const payload = {
    schema: "handoff-verification-status.v1",
    generatedAt: nowIso(),
    taskId: taskState.taskId,
    verifierVerdict: safeString(verifierState && verifierState.lastVerifierVerdict, 40) || "UNKNOWN",
    verifierUpdatedAt: safeString(verifierState && verifierState.lastVerifiedAt, 80),
    unresolvedFindings: Array.isArray(verifierState && verifierState.unresolvedFindings) ? verifierState.unresolvedFindings : [],
    acceptanceCriteria: acceptance.map((entry) => ({
      id: safeString(entry && entry.id, 120),
      text: safeString(entry && entry.text, 300),
      status: safeString(entry && entry.status, 40),
      lastCheckedAt: safeString(entry && entry.lastCheckedAt, 80),
    })),
  };
  const rows = [];
  rows.push({ label: "verifier", value: payload.verifierVerdict });
  for (const entry of payload.acceptanceCriteria) {
    rows.push({ label: `acceptance ${entry.id}`, value: `${entry.status} - ${entry.text}` });
  }
  for (const finding of payload.unresolvedFindings) {
    rows.push({ label: `finding ${finding.id}`, value: `${finding.type} - ${finding.reason}` });
  }
  return {
    payload,
    markdown: toHumanMarkdown("Verification Status", rows),
  };
}

function buildOpenIssuesArtifact({ taskState, verifierState }) {
  const issues = [
    ...(Array.isArray(taskState && taskState.unresolvedItems) ? taskState.unresolvedItems : []),
    ...(Array.isArray(verifierState && verifierState.unresolvedFindings)
      ? verifierState.unresolvedFindings.map((entry) => safeString(entry && entry.reason, 300))
      : []),
  ].filter(Boolean);
  const payload = {
    schema: "handoff-open-issues.v1",
    generatedAt: nowIso(),
    taskId: taskState.taskId,
    issues: uniqueStrings(issues, 32),
  };
  return {
    payload,
    markdown: toHumanMarkdown("Open Issues", payload.issues.map((entry) => ({ value: entry }))),
  };
}

function buildTaskSummaryArtifact({ taskState, planState }) {
  const payload = {
    schema: "handoff-task-summary.v1",
    generatedAt: nowIso(),
    taskId: taskState.taskId,
    title: taskState.title,
    objective: taskState.objective,
    phase: taskState.phase,
    status: taskState.status,
    progress: taskState.progress,
    currentStepId: safeString(planState && planState.currentStepId, 120),
    currentSprint: planState && planState.currentSprint ? planState.currentSprint : null,
  };
  return {
    payload,
    markdown: toHumanMarkdown("Task Summary", [
      { label: "title", value: payload.title },
      { label: "objective", value: payload.objective },
      { label: "phase", value: payload.phase },
      { label: "status", value: payload.status },
      { label: "progress", value: `${payload.progress && payload.progress.percent || 0}% ${safeString(payload.progress && payload.progress.summary, 200)}` },
      { label: "current step", value: payload.currentStepId || "-" },
    ]),
  };
}

function buildNextSessionBriefArtifact({ taskState, planState, verifierState }) {
  const nextStep = Array.isArray(planState && planState.steps)
    ? planState.steps.find((entry) => safeString(entry && entry.status, 40) === "in_progress")
      || planState.steps.find((entry) => safeString(entry && entry.status, 40) === "pending")
      || null
    : null;
  const blockers = Array.isArray(verifierState && verifierState.unresolvedFindings)
    ? verifierState.unresolvedFindings.map((entry) => safeString(entry && entry.reason, 240)).filter(Boolean)
    : [];
  const payload = {
    schema: "handoff-next-session-brief.v1",
    generatedAt: nowIso(),
    taskId: taskState.taskId,
    nextAction: safeString(nextStep && nextStep.title, 240) || "review unresolved items and continue the current sprint",
    avoid: blockers.length ? blockers : ["do not claim completion before verifier and acceptance criteria are green"],
    stopConditions: Array.isArray(taskState && taskState.stopConditions) ? taskState.stopConditions : [],
    currentStepId: safeString(nextStep && nextStep.id, 120),
  };
  return {
    payload,
    markdown: toHumanMarkdown("Next Session Brief", [
      { label: "next", value: payload.nextAction },
      ...payload.avoid.map((entry) => ({ label: "avoid", value: entry })),
      ...payload.stopConditions.map((entry) => ({ label: "stop when", value: entry })),
    ]),
  };
}

function buildDurableLearningsArtifact({ taskState, globalMemory }) {
  const entries = Array.isArray(globalMemory && globalMemory.entries) ? globalMemory.entries.slice(-12) : [];
  const payload = {
    schema: "handoff-durable-learnings.v1",
    generatedAt: nowIso(),
    taskId: taskState.taskId,
    entries,
  };
  return {
    payload,
    markdown: toHumanMarkdown("Durable Learnings", entries.map((entry) => ({
      label: safeString(entry && entry.kind, 120),
      value: safeString(entry && entry.text, 500),
    }))),
  };
}

function writeHandoffArtifact({ paths, artifactIndex, sessionId, type, artifact, scope = "session" }) {
  const jsonPath = path.join(paths.artifactRoot, `${type}.json`);
  const mdPath = path.join(paths.artifactRoot, `${type}.md`);
  writeJson(jsonPath, artifact.payload);
  writeText(mdPath, artifact.markdown);
  appendArtifactIndex(artifactIndex, {
    type,
    path: repoRelative(paths.loggingPaths.workspaceRoot, jsonPath),
    sessionId,
    humanReadable: false,
    machineReadable: true,
    scope,
    source: "close_session",
  });
  appendArtifactIndex(artifactIndex, {
    type: `${type}_human`,
    path: repoRelative(paths.loggingPaths.workspaceRoot, mdPath),
    sessionId,
    humanReadable: true,
    machineReadable: false,
    loadOnResume: false,
    scope,
    source: "close_session",
  });
  return {
    jsonPath,
    mdPath,
  };
}

function appendLifecycleEvent(paths, taskState, { source = "phase3", reason = "" } = {}) {
  appendJsonLine(paths.lifecycleLogPath, {
    schema: "task-lifecycle-event.v1",
    recordedAt: nowIso(),
    taskId: safeString(taskState && taskState.taskId, 120),
    lifecycleState: safeString(taskState && taskState.lifecycle && taskState.lifecycle.currentState, 80),
    legacyStatus: safeString(taskState && taskState.status, 80),
    source: safeString(source, 120),
    reason: safeString(reason, 400),
  });
}

function writeStructuredArtifacts({
  workspaceRoot,
  paths,
  taskState,
  planState,
  verifierState,
  taskSpec,
  acceptanceContract,
  closeoutSummary = null,
  replan = null,
} = {}) {
  writeJson(paths.taskSpecPath, taskSpec);
  writeJson(paths.planArtifactPath, buildPlanArtifact({ taskId: taskState.taskId, planState, verifierState }));
  writeJson(paths.acceptanceContractPath, acceptanceContract);
  if (closeoutSummary) {
    writeJson(paths.closeoutSummaryPath, closeoutSummary);
  }
  if (replan) {
    writeJson(paths.replanPath, replan);
  }
  return {
    taskSpecPath: repoRelative(workspaceRoot, paths.taskSpecPath),
    planPath: repoRelative(workspaceRoot, paths.planArtifactPath),
    acceptanceContractPath: repoRelative(workspaceRoot, paths.acceptanceContractPath),
    closeoutSummaryPath: closeoutSummary ? repoRelative(workspaceRoot, paths.closeoutSummaryPath) : "",
    replanPath: replan ? repoRelative(workspaceRoot, paths.replanPath) : "",
  };
}

function scoreGlobalMemoryEntry(entry, requestedTags = []) {
  let score = 0;
  score += Number(entry && entry.recency || 0) / 1000000000000;
  const text = safeString(entry && entry.text, 800).toLowerCase();
  for (const tag of Array.isArray(requestedTags) ? requestedTags : []) {
    if (!tag) continue;
    if (text.includes(String(tag).toLowerCase())) score += 2;
  }
  return score;
}

function truncateText(value, maxChars) {
  const text = safeString(value, Math.max(100, maxChars * 2));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function buildResumeContext({
  workspaceRoot,
  policy,
  taskState,
  planState,
  globalMemory,
  verifierState,
  artifactIndex,
  skillCatalog,
  requestedSkillIds = [],
  taskSpec = null,
}) {
  const sections = [];
  const counts = [];
  const nextSessionBriefEntry = getLatestHandoffArtifact(artifactIndex, "next_session_brief");
  const nextSessionBrief = nextSessionBriefEntry
    ? parseJsonFile(resolveWorkspacePath(workspaceRoot, nextSessionBriefEntry.path), {})
    : {};
  const addSection = (id, reason, payload, maxChars) => {
    const serialized = JSON.stringify(payload, null, 2);
    const truncated = truncateText(serialized, maxChars);
    sections.push({
      id,
      reason,
      chars: truncated.length,
      payload,
      preview: truncated,
    });
    counts.push(truncated.length);
  };
  addSection(
    "task_contract",
    "active stop conditions and contract must outrank all other context",
    {
      taskContractId: safeString(taskState && taskState.taskContractId, 120),
      stopConditions: Array.isArray(taskState && taskState.stopConditions) ? taskState.stopConditions : [],
      approvalBoundary: taskState && taskState.approvalBoundary ? taskState.approvalBoundary : {},
    },
    policy.contextInjectionLimits.taskContract
  );
  addSection(
    "verified_plan_state",
    "latest plan and acceptance state is needed to resume without replaying the full transcript",
    {
      currentStepId: safeString(planState && planState.currentStepId, 120),
      currentSprint: planState && planState.currentSprint ? planState.currentSprint : {},
      acceptanceCriteria: Array.isArray(planState && planState.acceptanceCriteria) ? planState.acceptanceCriteria : [],
      milestones: Array.isArray(planState && planState.milestones) ? planState.milestones : [],
    },
    policy.contextInjectionLimits.verifiedPlanState
  );
  addSection(
    "next_session_brief",
    "previous session closeout tells the next session what to do first",
    nextSessionBrief,
    policy.contextInjectionLimits.nextSessionBrief
  );
  addSection(
    "unresolved_verifier_findings",
    "unresolved verifier issues block false completion",
    {
      verifierVerdict: safeString(verifierState && verifierState.lastVerifierVerdict, 40),
      unresolvedFindings: Array.isArray(verifierState && verifierState.unresolvedFindings) ? verifierState.unresolvedFindings : [],
    },
    policy.contextInjectionLimits.unresolvedVerifierFindings
  );
  const requestedTags = [
    safeString(taskState && taskState.familyId, 80),
    safeString(taskState && taskState.phase, 80),
    ...uniqueStrings(requestedSkillIds, 8),
  ].filter(Boolean);
  const relevantGlobalMemory = (Array.isArray(globalMemory && globalMemory.entries) ? globalMemory.entries : [])
    .slice()
    .sort((left, right) => scoreGlobalMemoryEntry(right, requestedTags) - scoreGlobalMemoryEntry(left, requestedTags))
    .slice(0, 6);
  addSection(
    "relevant_global_memory",
    "only durable entries that match the current task family and active concerns should carry forward",
    relevantGlobalMemory,
    policy.contextInjectionLimits.relevantGlobalMemory
  );
  const relevantKnowledge = retrieveKnowledgeSlice({
    workspaceRoot,
    objective: safeString(taskState && taskState.objective, 1200),
    familyId: safeString(taskState && taskState.familyId, 80),
    limit: 4,
  });
  addSection(
    "relevant_knowledge",
    "versioned externalized knowledge augments durable memory with attributable support",
    {
      taskSpecId: safeString(taskSpec && taskSpec.taskId, 120),
      entries: Array.isArray(relevantKnowledge && relevantKnowledge.entries) ? relevantKnowledge.entries : [],
      totalChars: Number(relevantKnowledge && relevantKnowledge.totalChars) || 0,
    },
    policy.contextInjectionLimits.relevantKnowledge || 1800
  );
  const relevantSkills = (Array.isArray(skillCatalog && skillCatalog.skills) ? skillCatalog.skills : [])
    .filter((entry) => requestedSkillIds.length === 0 || requestedSkillIds.includes(entry.id))
    .slice(0, 6)
    .map((entry) => ({
      id: entry.id,
      description: entry.description,
      expectedArtifacts: entry.expectedArtifacts,
      useWhen: entry.useWhen,
    }));
  addSection(
    "skills_metadata",
    "metadata-first skill loading keeps prompts smaller than loading every skill body",
    relevantSkills,
    policy.contextInjectionLimits.skillsMetadata
  );
  const totalChars = counts.reduce((sum, value) => sum + value, 0);
  return {
    schema: "long-horizon-resume-context.v1",
    generatedAt: nowIso(),
    taskId: safeString(taskState && taskState.taskId, 120),
    injectionOrder: policy.contextInjectionOrder,
    conflictResolution: policy.conflictResolution,
    sections,
    metrics: {
      totalChars,
      sectionCount: sections.length,
      withinBudget: totalChars <= policy.contextInjectionLimits.totalChars ? 1 : 0,
      budgetChars: policy.contextInjectionLimits.totalChars,
    },
    sources: {
      taskStatePath: repoRelative(workspaceRoot, path.join(policy.rootPath, "tasks", safeString(taskState && taskState.taskId, 120), "task_state.json")),
      planStatePath: repoRelative(workspaceRoot, path.join(policy.rootPath, "tasks", safeString(taskState && taskState.taskId, 120), "plan_state.json")),
      verifierStatePath: repoRelative(workspaceRoot, path.join(policy.rootPath, "tasks", safeString(taskState && taskState.taskId, 120), "verifier_state.json")),
    },
  };
}

function assertTaskExists(taskState, taskId) {
  if (!taskState) {
    throw new Error(`continuity_task_not_found:${taskId}`);
  }
}

function listTasksByLifecycle(policy, { state = "", limit = null } = {}) {
  const registry = ensureRegistry(policy);
  const normalizedState = safeString(state, 80);
  const rows = Array.isArray(registry.tasks) ? registry.tasks : [];
  const filtered = normalizedState
    ? rows.filter((entry) => safeString(entry && entry.lifecycleState, 80) === normalizedState)
    : rows;
  return filtered
    .slice()
    .sort((left, right) => {
      const leftTs = Date.parse(safeString(left && left.updatedAt, 80)) || 0;
      const rightTs = Date.parse(safeString(right && right.updatedAt, 80)) || 0;
      return rightTs - leftTs;
    })
    .slice(0, limit || policy.inspectionDefaults.taskListLimit);
}

function listTasksByBucket(policy, { bucket = "", limit = null } = {}) {
  const registry = ensureRegistry(policy);
  const rows = Array.isArray(registry.tasks) ? registry.tasks : [];
  const normalizedBucket = safeString(bucket, 80);
  const filtered = rows.filter((entry) => {
    const lifecycleState = safeString(entry && entry.lifecycleState, 80);
    if (normalizedBucket === "active_tasks") {
      return ["initialized", "planned", "running", "awaiting_approval"].includes(lifecycleState);
    }
    if (normalizedBucket === "blocked_tasks") {
      return lifecycleState === "blocked";
    }
    if (normalizedBucket === "verifier_failed_tasks") {
      return lifecycleState === "verifier_failed";
    }
    if (normalizedBucket === "abandoned_tasks") {
      return lifecycleState === "abandoned";
    }
    if (normalizedBucket === "archived_tasks") {
      return lifecycleState === "archived";
    }
    return false;
  });
  return filtered
    .slice()
    .sort((left, right) => {
      const leftTs = Date.parse(safeString(left && left.updatedAt, 80)) || 0;
      const rightTs = Date.parse(safeString(right && right.updatedAt, 80)) || 0;
      return rightTs - leftTs;
    })
    .slice(0, limit || policy.inspectionDefaults.taskListLimit);
}

function parseTimestampValue(entry) {
  const updatedAt = safeString(entry && entry.updatedAt, 80);
  if (updatedAt) {
    const parsed = Date.parse(updatedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  const createdAt = safeString(entry && entry.createdAt, 80);
  if (createdAt) {
    const parsed = Date.parse(createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  const recency = Number(entry && entry.recency);
  if (Number.isFinite(recency) && recency > 0) return recency;
  return 0;
}

function readLifecycleEvents(paths, { limit = 50 } = {}) {
  if (!paths.lifecycleLogPath || !fs.existsSync(paths.lifecycleLogPath)) return [];
  const lines = fs.readFileSync(paths.lifecycleLogPath, "utf8")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const parsed = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // ignore malformed rows
    }
  }
  return parsed.slice(-Math.max(1, limit));
}

function buildInspectFailurePayload({ taskId, mode, taskRoot, error, sessionId = "" } = {}) {
  const message = safeString(error && error.message ? error.message : String(error), 1200);
  const code = safeString(message.split(":")[0], 120) || "continuity_inspection_failed";
  return {
    ok: false,
    taskId: safeString(taskId, 120),
    sessionId: safeString(sessionId, 120),
    mode: safeString(mode, 80),
    errorCode: code,
    error: message,
    taskRoot: safeString(taskRoot, 600),
    recovery: {
      recommendedActions: [
        "inspect registry or lifecycle state first",
        "restore from checkpoint or archive if the task state is corrupted",
        "avoid resume/update until the corrupted state is repaired",
      ],
    },
  };
}

function summarizeOrchestrationState({ policy, taskState, integrationSummary } = {}) {
  const taskId = safeString(taskState && taskState.taskId, 120);
  const childRows = taskId ? listChildTaskRecords(policy, taskId, { limit: policy.inspectionDefaults.taskListLimit }) : [];
  const latestIntegratedRoles = new Set(
    (Array.isArray(integrationSummary && integrationSummary.entries) ? integrationSummary.entries : [])
      .filter((entry) => safeString(entry && entry.integrationStatus, 80) === "integrated")
      .map((entry) => safeString(entry && entry.role, 80))
      .filter(Boolean)
  );
  const pendingChildTaskIds = uniqueStrings([
    ...(Array.isArray(integrationSummary && integrationSummary.pendingIntegrations) ? integrationSummary.pendingIntegrations : []),
    ...childRows
      .filter((entry) => ["initialized", "planned", "running", "awaiting_approval"].includes(safeString(entry && entry.lifecycleState, 80)))
      .map((entry) => safeString(entry && entry.taskId, 120)),
  ], 64);
  const blockedChildTaskIds = uniqueStrings([
    ...(Array.isArray(integrationSummary && integrationSummary.blockedChildren) ? integrationSummary.blockedChildren.map((entry) => safeString(entry && entry.childTaskId, 120)) : []),
    ...childRows
      .filter((entry) => safeString(entry && entry.lifecycleState, 80) === "blocked" && !latestIntegratedRoles.has(safeString(entry && entry.role, 80)))
      .map((entry) => safeString(entry && entry.taskId, 120)),
  ], 64);
  const verifierFailedChildTaskIds = uniqueStrings([
    ...(Array.isArray(integrationSummary && integrationSummary.verifierFailedChildren) ? integrationSummary.verifierFailedChildren.map((entry) => safeString(entry && entry.childTaskId, 120)) : []),
    ...childRows
      .filter((entry) => safeString(entry && entry.lifecycleState, 80) === "verifier_failed" && !latestIntegratedRoles.has(safeString(entry && entry.role, 80)))
      .map((entry) => safeString(entry && entry.taskId, 120)),
  ], 64);
  const deniedChildTaskIds = uniqueStrings(
    Array.isArray(integrationSummary && integrationSummary.deniedChildren)
      ? integrationSummary.deniedChildren.map((entry) => safeString(entry && entry.childTaskId, 120))
      : [],
    64
  );
  const orphanChildTaskIds = uniqueStrings([
    ...(Array.isArray(integrationSummary && integrationSummary.orphanChildTaskIds) ? integrationSummary.orphanChildTaskIds : []),
    ...listOrphanChildTaskRecords(policy, {
      rootTaskId: safeString(taskState && taskState.rootTaskId, 120) || taskId,
      limit: policy.inspectionDefaults.taskListLimit,
    }).map((entry) => safeString(entry && entry.taskId, 120)),
  ], 64);
  const blockers = uniqueStrings([
    ...pendingChildTaskIds.map((entry) => `pending child integration: ${entry}`),
    ...blockedChildTaskIds.map((entry) => `blocked child: ${entry}`),
    ...verifierFailedChildTaskIds.map((entry) => `verifier_failed child: ${entry}`),
    ...deniedChildTaskIds.map((entry) => `denied child action: ${entry}`),
    ...orphanChildTaskIds.map((entry) => `orphan child: ${entry}`),
  ], 48);
  return {
    childRows,
    pendingChildTaskIds,
    blockedChildTaskIds,
    verifierFailedChildTaskIds,
    deniedChildTaskIds,
    orphanChildTaskIds,
    blockers,
    overallStatus: blockers.length
      ? (verifierFailedChildTaskIds.length || deniedChildTaskIds.length ? "verifier_failed" : "blocked")
      : (pendingChildTaskIds.length ? "pending" : "ready"),
  };
}

function initializeTask({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  taskId,
  sessionId,
  title,
  objective,
  familyId,
  acceptanceCriteria = [],
  deliverables = [],
  stopConditions = [],
  milestones = [],
  steps = [],
  verifierRequirements = [],
  role = "",
  parentTaskId = "",
  rootTaskId = "",
  orchestrationMode = "",
  roleContractId = "",
} = {}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const normalizedTaskId = slugify(taskId, "task", 120);
  const normalizedSessionId = slugify(sessionId || `session-${Date.now()}`, "session", 120);
  const paths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId, sessionId: normalizedSessionId });
  return withTaskMutationLock(paths, () => {
    ensureTaskDirs(paths);
    const manifest = loadTaskContractManifest(defaultTaskContractManifestPath);
    const contract = resolveTaskContractForFamily({ manifest, familyId });
    const taskState = buildTaskState({
      taskId: normalizedTaskId,
      title,
      objective,
      familyId,
      contract,
      sessionId: normalizedSessionId,
      acceptanceCriteria,
      stopConditions,
      role,
      parentTaskId,
      rootTaskId,
      orchestrationMode,
      roleContractId,
    });
    transitionLifecycle(taskState, "planned", { source: "initialize_task", reason: "task spec and plan generated" });
    const planState = buildDefaultPlanState({
      taskId: normalizedTaskId,
      objective,
      acceptanceCriteria: taskState.acceptanceCriteria,
      milestones,
      steps,
      sessionId: normalizedSessionId,
    });
    const sessionMemory = buildDefaultSessionMemory({
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      phase: taskState.phase,
    });
    const sprintContract = {
      schema: "long-horizon-sprint-contract.v1",
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      sprintId: safeString(planState.currentSprint && planState.currentSprint.id, 120),
      goal: safeString(planState.currentSprint && planState.currentSprint.goal, 320) || safeString(objective, 320),
      activeStepIds: Array.isArray(planState.currentSprint && planState.currentSprint.stepIds) ? planState.currentSprint.stepIds : [],
      acceptanceRefs: Array.isArray(planState.acceptanceCriteria) ? planState.acceptanceCriteria.map((entry) => entry.id) : [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const globalMemory = buildDefaultGlobalMemory(normalizedTaskId);
    const verifierState = buildDefaultVerifierState(normalizedTaskId);
    const artifactIndex = buildDefaultArtifactIndex(normalizedTaskId);
    const agentGraph = buildDefaultAgentGraph(taskState);
    const handoffHistory = buildDefaultHandoffHistory(taskState);
    const integrationSummary = buildDefaultIntegrationSummary(taskState);
    const taskSpec = buildTaskSpec({
      taskId: normalizedTaskId,
      title,
      objective,
      familyId,
      contract,
      acceptanceCriteria: taskState.acceptanceCriteria,
      deliverables,
      stopConditions: taskState.stopConditions,
      verifierRequirements,
    });
    const acceptanceContract = buildAcceptanceContract({ taskSpec, planState, verifierState });
    writeJson(paths.taskStatePath, taskState);
    writeJson(paths.planStatePath, planState);
    writeJson(paths.sessionMemoryPath, sessionMemory);
    writeJson(paths.sprintContractPath, sprintContract);
    writeJson(paths.globalMemoryPath, globalMemory);
    writeJson(paths.verifierStatePath, verifierState);
    writeJson(paths.artifactIndexPath, artifactIndex);
    writeJson(paths.agentGraphPath, agentGraph);
    writeJson(paths.handoffHistoryPath, handoffHistory);
    writeJson(paths.integrationSummaryPath, integrationSummary);
    const structuredPaths = writeStructuredArtifacts({
      workspaceRoot,
      paths,
      taskState,
      planState,
      verifierState,
      taskSpec,
      acceptanceContract,
    });
    appendLifecycleEvent(paths, taskState, { source: "initialize_task", reason: "initialized and planned" });
    updateRegistryTask(policy, normalizedTaskId, createTaskRecordForRegistry(taskState, planState));
    return {
      ok: true,
      mode: "initialize_task",
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      paths: {
        taskStatePath: repoRelative(workspaceRoot, paths.taskStatePath),
        planStatePath: repoRelative(workspaceRoot, paths.planStatePath),
        sessionMemoryPath: repoRelative(workspaceRoot, paths.sessionMemoryPath),
        sprintContractPath: repoRelative(workspaceRoot, paths.sprintContractPath),
        ...structuredPaths,
      },
      taskState,
      planState,
      taskSpec,
      acceptanceContract,
    };
  });
}

function updateTask({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  taskId,
  sessionId,
  phase = "",
  progressPercent = null,
  progressSummary = "",
  currentStepId = "",
  currentStepStatus = "",
  sprintTitle = "",
  sprintGoal = "",
  note = "",
  noteKind = "session_note",
  promoteNote = false,
  openIssues = [],
  changedFiles = [],
  acceptanceUpdates = {},
  verifierReport = null,
  verifierReportPath = "",
  durableEntries = [],
  replanReason = "",
  role = "",
  parentTaskId = "",
  rootTaskId = "",
  orchestrationMode = "",
  roleContractId = "",
  childTaskIds = null,
  integrationStatus = "",
} = {}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const normalizedTaskId = slugify(taskId, "task", 120);
  const normalizedSessionId = slugify(sessionId, "session", 120);
  const paths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId, sessionId: normalizedSessionId });
  return withTaskMutationLock(paths, () => {
    ensureTaskDirs(paths);
    const taskPaths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId });
    const bundle = loadTaskBundle({
      ...taskPaths,
      sessionMemoryPath: paths.sessionMemoryPath,
      sprintContractPath: paths.sprintContractPath,
    });
    assertTaskExists(bundle.taskState, normalizedTaskId);
    const manifest = loadTaskContractManifest(defaultTaskContractManifestPath);
    const contract = resolveTaskContractForFamily({ manifest, familyId: bundle.taskState.familyId });
    const taskState = bundle.taskState;
    const planState = bundle.planState || buildDefaultPlanState({ taskId: normalizedTaskId, objective: taskState.objective, acceptanceCriteria: taskState.acceptanceCriteria, sessionId: normalizedSessionId });
    const taskSpec = bundle.taskSpec || buildTaskSpec({
      taskId: normalizedTaskId,
      title: taskState.title,
      objective: taskState.objective,
      familyId: taskState.familyId,
      contract,
      acceptanceCriteria: taskState.acceptanceCriteria,
      stopConditions: taskState.stopConditions,
    });
    const sessionMemory = bundle.sessionMemory || buildDefaultSessionMemory({ taskId: normalizedTaskId, sessionId: normalizedSessionId, phase: taskState.phase });
    const globalMemory = bundle.globalMemory || buildDefaultGlobalMemory(normalizedTaskId);
    const verifierState = bundle.verifierState || buildDefaultVerifierState(normalizedTaskId);
    const artifactIndex = bundle.artifactIndex || buildDefaultArtifactIndex(normalizedTaskId);
    const agentGraph = bundle.agentGraph || buildDefaultAgentGraph(taskState);
    const handoffHistory = bundle.handoffHistory || buildDefaultHandoffHistory(taskState);
    const integrationSummary = bundle.integrationSummary || buildDefaultIntegrationSummary(taskState);

    if (safeString(phase, 80)) {
      taskState.phase = safeString(phase, 80);
      sessionMemory.phase = taskState.phase;
    }
    if (safeString(role, 80)) taskState.role = safeString(role, 80);
    if (safeString(roleContractId, 80)) taskState.roleContractId = safeString(roleContractId, 80);
    if (safeString(parentTaskId, 120)) taskState.parentTaskId = safeString(parentTaskId, 120);
    if (safeString(rootTaskId, 120)) taskState.rootTaskId = safeString(rootTaskId, 120);
    if (safeString(orchestrationMode, 80)) taskState.orchestrationMode = safeString(orchestrationMode, 80);
    if (Array.isArray(childTaskIds) && childTaskIds.length) {
      taskState.childTaskIds = uniqueStrings([...(Array.isArray(taskState.childTaskIds) ? taskState.childTaskIds : []), ...childTaskIds], 64);
    }
    if (safeString(integrationStatus, 80)) taskState.integrationStatus = safeString(integrationStatus, 80);
    if (progressPercent !== null && progressPercent !== undefined) {
      taskState.progress.percent = clampPercent(progressPercent);
    }
    if (safeString(progressSummary, 240)) {
      taskState.progress.summary = safeString(progressSummary, 240);
    }
    taskState.progress.updatedAt = nowIso();
    taskState.updatedAt = nowIso();
    taskState.revision = Number(taskState.revision || 0) + 1;
    updatePlanStep(planState, { currentStepId, currentStepStatus, sprintTitle, sprintGoal });
    updateAcceptanceCriteria(planState, acceptanceUpdates);
    if (safeString(note, 2000)) {
      const createdNote = addSessionNote(sessionMemory, {
        kind: noteKind,
        text: note,
        source: "update_task",
        promoteCandidate: promoteNote,
      });
      if (promoteNote && createdNote) {
        addGlobalMemoryEntry(globalMemory, {
          kind: noteKind,
          text: createdNote.text,
          source: "update_task",
          promotedFromSessionId: normalizedSessionId,
        }, policy);
      }
    }
    const changedEntries = normalizeChangedSurfaceEntries(workspaceRoot, changedFiles, "update_task");
    updateChangedSurface(sessionMemory, changedEntries);
    taskState.unresolvedItems = Array.isArray(openIssues)
      ? uniqueStrings(openIssues, 24)
      : uniqueStrings(taskState.unresolvedItems, 24);
    if (verifierReport) {
      applyVerifierReport(verifierState, verifierReport, { source: "update_task", reportPath: verifierReportPath });
      taskState.lastVerifierVerdict = verifierState.lastVerifierVerdict;
    }
    for (const entry of Array.isArray(durableEntries) ? durableEntries : []) {
      addGlobalMemoryEntry(globalMemory, {
        kind: entry.kind,
        text: entry.text,
        source: "update_task",
        promotedFromSessionId: normalizedSessionId,
      }, policy);
    }
    const acceptanceContract = buildAcceptanceContract({ taskSpec, planState, verifierState });
    let replan = null;
    const verifierFailed = safeString(verifierState.lastVerifierVerdict, 40) === "FAIL";
    const explicitReplan = safeString(replanReason, 400);
    if (verifierFailed) {
      transitionLifecycle(taskState, "verifier_failed", { source: "update_task", reason: "verifier report is failing" });
      replan = buildReplanArtifact({ taskState, planState, verifierState, acceptanceContract, reason: "verifier_fail" });
    } else if (explicitReplan) {
      transitionLifecycle(taskState, "blocked", { source: "update_task", reason: explicitReplan });
      replan = buildReplanArtifact({ taskState, planState, verifierState, acceptanceContract, reason: explicitReplan });
    } else if (safeString(phase, 80) === "awaiting_approval") {
      transitionLifecycle(taskState, "awaiting_approval", { source: "update_task", reason: "phase requested awaiting approval" });
    } else if (taskState.unresolvedItems.length || safeString(currentStepStatus, 40).toLowerCase() === "blocked") {
      transitionLifecycle(taskState, "blocked", { source: "update_task", reason: "open issues or blocked step remain" });
    } else {
      transitionLifecycle(taskState, "running", { source: "update_task", reason: "task execution updated" });
    }
    appendLifecycleEvent(taskPaths, taskState, { source: "update_task", reason: "task updated" });
    writeJson(taskPaths.taskStatePath, taskState);
    writeJson(taskPaths.planStatePath, planState);
    writeJson(paths.sessionMemoryPath, sessionMemory);
    writeJson(taskPaths.globalMemoryPath, globalMemory);
    writeJson(taskPaths.verifierStatePath, verifierState);
    writeJson(taskPaths.artifactIndexPath, artifactIndex);
    writeJson(taskPaths.agentGraphPath, agentGraph);
    writeJson(taskPaths.handoffHistoryPath, handoffHistory);
    writeJson(taskPaths.integrationSummaryPath, integrationSummary);
    const structuredPaths = writeStructuredArtifacts({
      workspaceRoot,
      paths: taskPaths,
      taskState,
      planState,
      verifierState,
      taskSpec,
      acceptanceContract,
      replan,
    });
    updateRegistryTask(policy, normalizedTaskId, createTaskRecordForRegistry(taskState, planState));
    return {
      ok: true,
      mode: "update_task",
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      taskState,
      planState,
      taskSpec,
      acceptanceContract,
      replan,
      structuredPaths,
      sessionMemorySummary: {
        notes: Array.isArray(sessionMemory.notes) ? sessionMemory.notes.length : 0,
        recentChanges: Array.isArray(sessionMemory.recentChanges) ? sessionMemory.recentChanges.length : 0,
      },
      verifierState,
    };
  });
}

function resumeTask({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  taskId,
  sessionId,
  requestedSkillIds = [],
} = {}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const normalizedTaskId = slugify(taskId, "task", 120);
  const registry = ensureRegistry(policy);
  const existing = registry.tasks.find((entry) => safeString(entry && entry.taskId, 120) === normalizedTaskId) || null;
  const normalizedSessionId = slugify(sessionId || `resume-${Date.now()}`, "session", 120);
  const paths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId, sessionId: normalizedSessionId });
  return withTaskMutationLock(paths, () => {
    ensureTaskDirs(paths);
    const taskPaths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId });
    const baseBundle = loadTaskBundle(taskPaths);
    assertTaskExists(baseBundle.taskState, normalizedTaskId);
    const lifecycleState = safeString(baseBundle.taskState && baseBundle.taskState.lifecycle && baseBundle.taskState.lifecycle.currentState, 80);
    if (!lifecycleAllowsResume(lifecycleState)) {
      throw new Error(`continuity_resume_forbidden:${lifecycleState || "unknown"}`);
    }
    const sessionMemory = buildDefaultSessionMemory({
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      phase: safeString(baseBundle.taskState && baseBundle.taskState.phase, 80),
    });
    writeJson(paths.sessionMemoryPath, sessionMemory);
    const sprintContract = {
      schema: "long-horizon-sprint-contract.v1",
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      sprintId: slugify(`resume-${Date.now()}`, "sprint"),
      goal: safeString(baseBundle.planState && baseBundle.planState.currentSprint && baseBundle.planState.currentSprint.goal, 320) || safeString(baseBundle.taskState && baseBundle.taskState.objective, 320),
      activeStepIds: Array.isArray(baseBundle.planState && baseBundle.planState.steps)
        ? baseBundle.planState.steps.filter((entry) => ["in_progress", "pending", "blocked"].includes(safeString(entry && entry.status, 40))).map((entry) => entry.id).slice(0, 3)
        : [],
      acceptanceRefs: Array.isArray(baseBundle.planState && baseBundle.planState.acceptanceCriteria) ? baseBundle.planState.acceptanceCriteria.map((entry) => entry.id) : [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    writeJson(paths.sprintContractPath, sprintContract);
    baseBundle.taskState.activeSessionId = normalizedSessionId;
    baseBundle.taskState.lastSessionId = normalizedSessionId;
    baseBundle.taskState.revision = Number(baseBundle.taskState.revision || 0) + 1;
    transitionLifecycle(baseBundle.taskState, "running", { source: "resume_task", reason: "session resumed" });
    writeJson(taskPaths.taskStatePath, baseBundle.taskState);
    appendLifecycleEvent(taskPaths, baseBundle.taskState, { source: "resume_task", reason: "session resumed" });
    updateRegistryTask(policy, normalizedTaskId, createTaskRecordForRegistry(baseBundle.taskState, baseBundle.planState));
    const skillCatalog = loadRepoLocalSkillCatalog(undefined, { workspaceRoot });
    const resumeContext = buildResumeContext({
      workspaceRoot,
      policy,
      taskState: baseBundle.taskState,
      planState: baseBundle.planState,
      globalMemory: baseBundle.globalMemory,
      verifierState: baseBundle.verifierState,
      artifactIndex: baseBundle.artifactIndex,
      skillCatalog,
      requestedSkillIds,
    });
    writeJson(paths.resumeContextPath, resumeContext);
    appendArtifactIndex(baseBundle.artifactIndex, {
      type: "resume_context",
      path: repoRelative(workspaceRoot, paths.resumeContextPath),
      sessionId: normalizedSessionId,
      scope: "session",
      source: "resume_task",
    });
    writeJson(taskPaths.artifactIndexPath, baseBundle.artifactIndex);
    return {
      ok: true,
      mode: "resume_task",
      taskId: normalizedTaskId,
      previousTaskRecord: existing,
      sessionId: normalizedSessionId,
      resumeContextPath: repoRelative(workspaceRoot, paths.resumeContextPath),
      resumeContext,
    };
  });
}

function closeSession({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  taskId,
  sessionId,
  completionClaim = "",
  phase = "",
  progressPercent = null,
  progressSummary = "",
  changedFiles = [],
  openIssues = [],
  durableEntries = [],
  verifierReport = null,
  verifierReportPath = "",
} = {}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const normalizedTaskId = slugify(taskId, "task", 120);
  const normalizedSessionId = slugify(sessionId, "session", 120);
  const taskPaths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId });
  const sessionPaths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId, sessionId: normalizedSessionId });
  return withTaskMutationLock(sessionPaths, () => {
    ensureTaskDirs(sessionPaths);
    const bundle = loadTaskBundle({
      ...taskPaths,
      sessionMemoryPath: sessionPaths.sessionMemoryPath,
      sprintContractPath: sessionPaths.sprintContractPath,
    });
    assertTaskExists(bundle.taskState, normalizedTaskId);
    const manifest = loadTaskContractManifest(defaultTaskContractManifestPath);
    const contract = resolveTaskContractForFamily({ manifest, familyId: bundle.taskState.familyId });
    const taskState = bundle.taskState;
    const planState = bundle.planState || buildDefaultPlanState({ taskId: normalizedTaskId, objective: taskState.objective, acceptanceCriteria: taskState.acceptanceCriteria, sessionId: normalizedSessionId });
    const taskSpec = bundle.taskSpec || buildTaskSpec({
      taskId: normalizedTaskId,
      title: taskState.title,
      objective: taskState.objective,
      familyId: taskState.familyId,
      contract,
      acceptanceCriteria: taskState.acceptanceCriteria,
      stopConditions: taskState.stopConditions,
    });
    const sessionMemory = bundle.sessionMemory || buildDefaultSessionMemory({ taskId: normalizedTaskId, sessionId: normalizedSessionId, phase: taskState.phase });
    const globalMemory = bundle.globalMemory || buildDefaultGlobalMemory(normalizedTaskId);
    const verifierState = bundle.verifierState || buildDefaultVerifierState(normalizedTaskId);
    const artifactIndex = bundle.artifactIndex || buildDefaultArtifactIndex(normalizedTaskId);
    const agentGraph = bundle.agentGraph || buildDefaultAgentGraph(taskState);
    const handoffHistory = bundle.handoffHistory || buildDefaultHandoffHistory(taskState);
    const integrationSummary = bundle.integrationSummary || buildDefaultIntegrationSummary(taskState);

    if (safeString(phase, 80)) taskState.phase = safeString(phase, 80);
    if (progressPercent !== null && progressPercent !== undefined) taskState.progress.percent = clampPercent(progressPercent);
    if (safeString(progressSummary, 240)) taskState.progress.summary = safeString(progressSummary, 240);
    taskState.progress.updatedAt = nowIso();
    taskState.revision = Number(taskState.revision || 0) + 1;
    updateChangedSurface(sessionMemory, normalizeChangedSurfaceEntries(workspaceRoot, changedFiles, "close_session"));
    taskState.unresolvedItems = Array.isArray(openIssues)
      ? uniqueStrings(openIssues, 24)
      : uniqueStrings(taskState.unresolvedItems, 24);
    if (verifierReport) {
      applyVerifierReport(verifierState, verifierReport, { source: "close_session", reportPath: verifierReportPath });
      taskState.lastVerifierVerdict = verifierState.lastVerifierVerdict;
    }
    for (const entry of Array.isArray(durableEntries) ? durableEntries : []) {
      addGlobalMemoryEntry(globalMemory, {
        kind: entry.kind,
        text: entry.text,
        source: "close_session",
        promotedFromSessionId: normalizedSessionId,
      }, policy);
    }

    const acceptanceContract = buildAcceptanceContract({ taskSpec, planState, verifierState });
    const unresolvedAcceptance = Array.isArray(acceptanceContract.items)
      ? acceptanceContract.items.filter((entry) => safeString(entry && entry.status, 40) !== "passed")
      : [];
    const unresolvedVerifier = Array.isArray(verifierState.unresolvedFindings) ? verifierState.unresolvedFindings : [];
    const orchestrationState = summarizeOrchestrationState({
      policy,
      taskState,
      integrationSummary,
    });
    const unresolvedOrchestration = Array.isArray(orchestrationState.blockers) ? orchestrationState.blockers : [];
    if (unresolvedOrchestration.length) {
      taskState.unresolvedItems = uniqueStrings([...(Array.isArray(taskState.unresolvedItems) ? taskState.unresolvedItems : []), ...unresolvedOrchestration], 24);
    }
    const completionRequested = safeString(completionClaim, 80).toLowerCase() === "completed";
    let replan = null;
    if (completionRequested && unresolvedAcceptance.length === 0 && unresolvedVerifier.length === 0 && taskState.unresolvedItems.length === 0) {
      transitionLifecycle(taskState, "completed", { source: "close_session", reason: "acceptance and verifier are green" });
    } else if (completionRequested) {
      transitionLifecycle(taskState, "verifier_failed", { source: "close_session", reason: "completion claim rejected by acceptance/verifier guard" });
      replan = buildReplanArtifact({ taskState, planState, verifierState, acceptanceContract, reason: "closeout_guard_failed" });
    } else if (safeString(taskState.phase, 80) === "awaiting_approval") {
      transitionLifecycle(taskState, "awaiting_approval", { source: "close_session", reason: "session closed while awaiting approval" });
    } else if (taskState.unresolvedItems.length || unresolvedAcceptance.length || unresolvedVerifier.length) {
      transitionLifecycle(taskState, "blocked", { source: "close_session", reason: "remaining work or unresolved verification" });
    } else {
      transitionLifecycle(taskState, "planned", { source: "close_session", reason: "session closed with resumable remaining work" });
    }

    taskState.activeSessionId = "";
    taskState.lastSessionId = normalizedSessionId;
    taskState.updatedAt = nowIso();
    sessionMemory.sessionStatus = safeString(taskState.lifecycle && taskState.lifecycle.currentState, 80) === "completed" ? "completed" : "closed";
    sessionMemory.summary = safeString(progressSummary, 400) || safeString(taskState.progress && taskState.progress.summary, 400);
    sessionMemory.updatedAt = nowIso();
    planState.verifiedAt = safeString(verifierState && verifierState.lastVerifiedAt, 80);
    planState.updatedAt = nowIso();

    const closeoutSummary = buildCloseoutSummary({
      taskState,
      planState,
      verifierState,
      acceptanceContract,
      completionClaim,
    });
    closeoutSummary.orchestration = {
      pendingChildTaskIds: orchestrationState.pendingChildTaskIds,
      blockedChildTaskIds: orchestrationState.blockedChildTaskIds,
      verifierFailedChildTaskIds: orchestrationState.verifierFailedChildTaskIds,
      deniedChildTaskIds: orchestrationState.deniedChildTaskIds,
      orphanChildTaskIds: orchestrationState.orphanChildTaskIds,
      overallStatus: orchestrationState.overallStatus,
    };
    closeoutSummary.blockers = uniqueStrings([
      ...(Array.isArray(closeoutSummary.blockers) ? closeoutSummary.blockers : []),
      ...unresolvedOrchestration,
    ], 64);
    closeoutSummary.remainingWork = uniqueStrings([
      ...(Array.isArray(closeoutSummary.remainingWork) ? closeoutSummary.remainingWork : []),
      ...unresolvedOrchestration,
    ], 64);
    closeoutSummary.closeAllowed = closeoutSummary.closeAllowed && unresolvedOrchestration.length === 0 ? 1 : 0;
    const taskSummary = buildTaskSummaryArtifact({ taskState, planState });
    const nextSessionBrief = buildNextSessionBriefArtifact({ taskState, planState, verifierState });
    const openIssuesArtifact = buildOpenIssuesArtifact({ taskState, verifierState });
    const verificationStatus = buildVerificationStatusArtifact({ taskState, verifierState, planState });
    const changedSurface = buildChangedSurfaceArtifact({ taskState, sessionMemory, artifactIndex });
    const durableLearnings = buildDurableLearningsArtifact({ taskState, globalMemory });
    const artifactPaths = {
      task_summary: writeHandoffArtifact({ paths: sessionPaths, artifactIndex, sessionId: normalizedSessionId, type: "task_summary", artifact: taskSummary }),
      next_session_brief: writeHandoffArtifact({ paths: sessionPaths, artifactIndex, sessionId: normalizedSessionId, type: "next_session_brief", artifact: nextSessionBrief }),
      open_issues: writeHandoffArtifact({ paths: sessionPaths, artifactIndex, sessionId: normalizedSessionId, type: "open_issues", artifact: openIssuesArtifact }),
      verification_status: writeHandoffArtifact({ paths: sessionPaths, artifactIndex, sessionId: normalizedSessionId, type: "verification_status", artifact: verificationStatus }),
      changed_surface: writeHandoffArtifact({ paths: sessionPaths, artifactIndex, sessionId: normalizedSessionId, type: "changed_surface", artifact: changedSurface }),
      durable_learnings: writeHandoffArtifact({ paths: sessionPaths, artifactIndex, sessionId: normalizedSessionId, type: "durable_learnings", artifact: durableLearnings, scope: "global" }),
    };

    const structuredPaths = writeStructuredArtifacts({
      workspaceRoot,
      paths: taskPaths,
      taskState,
      planState,
      verifierState,
      taskSpec,
      acceptanceContract,
      closeoutSummary,
      replan,
    });
    appendLifecycleEvent(taskPaths, taskState, { source: "close_session", reason: "session closed" });
    writeJson(taskPaths.taskStatePath, taskState);
    writeJson(taskPaths.planStatePath, planState);
    writeJson(taskPaths.globalMemoryPath, globalMemory);
    writeJson(taskPaths.verifierStatePath, verifierState);
    writeJson(taskPaths.artifactIndexPath, artifactIndex);
    writeJson(taskPaths.agentGraphPath, agentGraph);
    writeJson(taskPaths.handoffHistoryPath, handoffHistory);
    writeJson(taskPaths.integrationSummaryPath, integrationSummary);
    writeJson(sessionPaths.sessionMemoryPath, sessionMemory);
    updateRegistryTask(policy, normalizedTaskId, createTaskRecordForRegistry(taskState, planState));
    return {
      ok: true,
      mode: "close_session",
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      taskStatus: taskState.status,
      lifecycleState: safeString(taskState.lifecycle && taskState.lifecycle.currentState, 80),
      unresolvedAcceptanceCount: unresolvedAcceptance.length,
      unresolvedVerifierCount: unresolvedVerifier.length,
      unresolvedItemCount: taskState.unresolvedItems.length,
      closeoutSummaryPath: structuredPaths.closeoutSummaryPath,
      replanPath: structuredPaths.replanPath,
      closeoutSummary,
      artifactPaths: Object.fromEntries(Object.entries(artifactPaths).map(([key, value]) => [key, {
        jsonPath: repoRelative(workspaceRoot, value.jsonPath),
        mdPath: repoRelative(workspaceRoot, value.mdPath),
      }])),
    };
  });
}

function abandonTask({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  taskId,
  sessionId = "",
  reason = "",
} = {}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const normalizedTaskId = slugify(taskId, "task", 120);
  const normalizedSessionId = safeString(sessionId, 120) ? slugify(sessionId, "session", 120) : "";
  const taskPaths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId });
  const sessionPaths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId, sessionId: normalizedSessionId });
  return withTaskMutationLock(taskPaths, () => {
    ensureTaskDirs(sessionPaths.sessionRoot ? sessionPaths : taskPaths);
    const bundle = loadTaskBundle({
      ...taskPaths,
      sessionMemoryPath: sessionPaths.sessionMemoryPath,
      sprintContractPath: sessionPaths.sprintContractPath,
    });
    assertTaskExists(bundle.taskState, normalizedTaskId);
    if (!lifecycleAllowsAbandon(safeString(bundle.taskState && bundle.taskState.lifecycle && bundle.taskState.lifecycle.currentState, 80))) {
      throw new Error(`continuity_task_cannot_abandon:${normalizedTaskId}`);
    }
    const taskState = bundle.taskState;
    const planState = bundle.planState || buildDefaultPlanState({ taskId: normalizedTaskId, objective: taskState.objective, acceptanceCriteria: taskState.acceptanceCriteria, sessionId: normalizedSessionId });
    const taskSpec = bundle.taskSpec || buildTaskSpec({
      taskId: normalizedTaskId,
      title: taskState.title,
      objective: taskState.objective,
      familyId: taskState.familyId,
      contract: resolveTaskContractForFamily({ manifest: loadTaskContractManifest(defaultTaskContractManifestPath), familyId: taskState.familyId }),
      acceptanceCriteria: taskState.acceptanceCriteria,
      stopConditions: taskState.stopConditions,
    });
    const verifierState = bundle.verifierState || buildDefaultVerifierState(normalizedTaskId);
    const acceptanceContract = buildAcceptanceContract({ taskSpec, planState, verifierState });
    transitionLifecycle(taskState, "abandoned", { source: "abandon_task", reason: safeString(reason, 400) || "operator abandoned task" });
    taskState.phase = "abandoned";
    taskState.activeSessionId = "";
    taskState.lastSessionId = normalizedSessionId || safeString(taskState.lastSessionId, 120);
    taskState.updatedAt = nowIso();
    if (safeString(reason, 400)) {
      taskState.unresolvedItems = uniqueStrings([safeString(reason, 400), ...taskState.unresolvedItems], 24);
    }
    const closeoutSummary = buildCloseoutSummary({
      taskState,
      planState,
      verifierState,
      acceptanceContract,
      completionClaim: "abandoned",
    });
    const structuredPaths = writeStructuredArtifacts({
      workspaceRoot,
      paths: taskPaths,
      taskState,
      planState,
      verifierState,
      taskSpec,
      acceptanceContract,
      closeoutSummary,
      replan: bundle.replan || null,
    });
    if (bundle.sessionMemory && sessionPaths.sessionMemoryPath) {
      bundle.sessionMemory.sessionStatus = "abandoned";
      bundle.sessionMemory.summary = safeString(reason, 400) || bundle.sessionMemory.summary;
      bundle.sessionMemory.updatedAt = nowIso();
      writeJson(sessionPaths.sessionMemoryPath, bundle.sessionMemory);
    }
    writeJson(taskPaths.taskStatePath, taskState);
    writeJson(taskPaths.planStatePath, planState);
    writeJson(taskPaths.globalMemoryPath, bundle.globalMemory || buildDefaultGlobalMemory(normalizedTaskId));
    writeJson(taskPaths.verifierStatePath, verifierState);
    writeJson(taskPaths.artifactIndexPath, bundle.artifactIndex || buildDefaultArtifactIndex(normalizedTaskId));
    appendLifecycleEvent(taskPaths, taskState, { source: "abandon_task", reason: safeString(reason, 400) || "operator abandoned task" });
    updateRegistryTask(policy, normalizedTaskId, createTaskRecordForRegistry(taskState, planState));
    return {
      ok: true,
      mode: "abandon_task",
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      taskStatus: taskState.status,
      lifecycleState: safeString(taskState.lifecycle && taskState.lifecycle.currentState, 80),
      closeoutSummaryPath: structuredPaths.closeoutSummaryPath,
    };
  });
}

function archiveTask({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  taskId,
  sessionId = "",
  reason = "",
} = {}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const normalizedTaskId = slugify(taskId, "task", 120);
  const normalizedSessionId = safeString(sessionId, 120) ? slugify(sessionId, "session", 120) : "";
  const taskPaths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId });
  return withTaskMutationLock(taskPaths, () => {
    ensureTaskDirs(taskPaths);
    const bundle = loadTaskBundle(taskPaths);
    assertTaskExists(bundle.taskState, normalizedTaskId);
    if (!lifecycleAllowsArchive(safeString(bundle.taskState && bundle.taskState.lifecycle && bundle.taskState.lifecycle.currentState, 80))) {
      throw new Error(`continuity_task_cannot_archive:${normalizedTaskId}`);
    }
    const taskState = bundle.taskState;
    const planState = bundle.planState || buildDefaultPlanState({ taskId: normalizedTaskId, objective: taskState.objective, acceptanceCriteria: taskState.acceptanceCriteria, sessionId: normalizedSessionId });
    transitionLifecycle(taskState, "archived", { source: "archive_task", reason: safeString(reason, 400) || "operator archived task" });
    taskState.phase = "archived";
    taskState.activeSessionId = "";
    taskState.updatedAt = nowIso();
    const archiveManifestPath = path.join(taskPaths.archiveRoot, "archive_manifest.json");
    writeJson(archiveManifestPath, {
      schema: "continuity-archive-manifest.v1",
      generatedAt: nowIso(),
      taskId: normalizedTaskId,
      lifecycleState: safeString(taskState.lifecycle && taskState.lifecycle.currentState, 80),
      reason: safeString(reason, 400) || "operator archived task",
      sessionId: normalizedSessionId,
      taskRoot: repoRelative(workspaceRoot, taskPaths.taskRoot),
      taskStatePath: repoRelative(workspaceRoot, taskPaths.taskStatePath),
      planStatePath: repoRelative(workspaceRoot, taskPaths.planStatePath),
      closeoutSummaryPath: repoRelative(workspaceRoot, taskPaths.closeoutSummaryPath),
    });
    writeJson(taskPaths.taskStatePath, taskState);
    appendLifecycleEvent(taskPaths, taskState, { source: "archive_task", reason: safeString(reason, 400) || "operator archived task" });
    updateRegistryTask(policy, normalizedTaskId, createTaskRecordForRegistry(taskState, planState));
    return {
      ok: true,
      mode: "archive_task",
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      taskStatus: taskState.status,
      lifecycleState: safeString(taskState.lifecycle && taskState.lifecycle.currentState, 80),
      archiveManifestPath: repoRelative(workspaceRoot, archiveManifestPath),
    };
  });
}

function pruneDurableMemory({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  taskId,
  ageDays = null,
  force = false,
} = {}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  const normalizedTaskId = slugify(taskId, "task", 120);
  const taskPaths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId });
  return withTaskMutationLock(taskPaths, () => {
    ensureTaskDirs(taskPaths);
    const bundle = loadTaskBundle(taskPaths);
    assertTaskExists(bundle.taskState, normalizedTaskId);
    const lifecycleState = safeString(bundle.taskState && bundle.taskState.lifecycle && bundle.taskState.lifecycle.currentState, 80);
    const effectiveAgeDays = Math.max(1, Math.trunc(Number(ageDays) || policy.defaultPruneAgeDays));
    if (lifecycleAllowsResume(lifecycleState) && !force) {
      return {
        ok: true,
        mode: "prune_durable_memory",
        taskId: normalizedTaskId,
        skipped: true,
        skippedBecause: "task_active",
        lifecycleState,
        prunedCount: 0,
        archivedCount: 0,
      };
    }
    const globalMemory = bundle.globalMemory || buildDefaultGlobalMemory(normalizedTaskId);
    const entries = Array.isArray(globalMemory.entries) ? globalMemory.entries : [];
    const cutoff = Date.now() - effectiveAgeDays * 24 * 60 * 60 * 1000;
    const staleEntries = [];
    const keptEntries = [];
    for (const entry of entries) {
      if (parseTimestampValue(entry) > 0 && parseTimestampValue(entry) < cutoff) {
        staleEntries.push(entry);
        continue;
      }
      keptEntries.push(entry);
    }
    for (const entry of staleEntries) {
      appendJsonLine(taskPaths.durableMemoryArchivePath, {
        schema: "durable-memory-pruned.v1",
        recordedAt: nowIso(),
        taskId: normalizedTaskId,
        archivedBy: "prune_durable_memory",
        entry,
      });
    }
    globalMemory.entries = keptEntries;
    globalMemory.updatedAt = nowIso();
    writeJson(taskPaths.globalMemoryPath, globalMemory);
    appendLifecycleEvent(taskPaths, bundle.taskState, {
      source: "prune_durable_memory",
      reason: staleEntries.length ? `pruned ${staleEntries.length} stale durable entries` : "no stale durable entries found",
    });
    return {
      ok: true,
      mode: "prune_durable_memory",
      taskId: normalizedTaskId,
      skipped: false,
      lifecycleState,
      prunedCount: staleEntries.length,
      archivedCount: staleEntries.length,
      keptCount: keptEntries.length,
      archivePath: repoRelative(workspaceRoot, taskPaths.durableMemoryArchivePath),
    };
  });
}

function inspectTask({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  taskId,
  sessionId = "",
  mode = "task_state",
  limit = null,
} = {}) {
  const policy = loadContinuityPolicy(undefined, { workspaceRoot });
  if (mode === "registry") {
    return ensureRegistry(policy);
  }
  if (["active_tasks", "blocked_tasks", "verifier_failed_tasks", "abandoned_tasks", "archived_tasks"].includes(mode)) {
    return listTasksByBucket(policy, { bucket: mode, limit });
  }
  const normalizedTaskId = slugify(taskId, "task", 120);
  const normalizedSessionId = safeString(sessionId, 120) ? slugify(sessionId, "session", 120) : "";
  const paths = buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId, sessionId: normalizedSessionId });
  let bundle;
  try {
    bundle = loadTaskBundle({
      ...buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId }),
      sessionMemoryPath: paths.sessionMemoryPath,
      sprintContractPath: paths.sprintContractPath,
    });
  } catch (error) {
    return buildInspectFailurePayload({
      taskId: normalizedTaskId,
      sessionId: normalizedSessionId,
      mode,
      taskRoot: repoRelative(workspaceRoot, path.join(policy.rootPath, "tasks", normalizedTaskId)),
      error,
    });
  }
  assertTaskExists(bundle.taskState, normalizedTaskId);
  const contract = resolveTaskContractForFamily({
    manifest: loadTaskContractManifest(defaultTaskContractManifestPath),
    familyId: bundle.taskState.familyId,
  });
  const taskSpec = bundle.taskSpec || buildTaskSpec({
    taskId: normalizedTaskId,
    title: bundle.taskState.title,
    objective: bundle.taskState.objective,
    familyId: bundle.taskState.familyId,
    contract,
    acceptanceCriteria: bundle.taskState.acceptanceCriteria,
    stopConditions: bundle.taskState.stopConditions,
  });
  const acceptanceContract = bundle.acceptanceContract || buildAcceptanceContract({
    taskSpec,
    planState: bundle.planState,
    verifierState: bundle.verifierState,
  });
  const agentGraph = bundle.agentGraph || buildDefaultAgentGraph(bundle.taskState);
  const handoffHistory = bundle.handoffHistory || buildDefaultHandoffHistory(bundle.taskState);
  const integrationSummary = bundle.integrationSummary || buildDefaultIntegrationSummary(bundle.taskState);
  const childTasks = listChildTaskRecords(policy, normalizedTaskId, { limit: limit || policy.inspectionDefaults.taskListLimit });
  const blockedChildren = childTasks.filter((entry) => safeString(entry && entry.lifecycleState, 80) === "blocked");
  const verifierFailedChildren = childTasks.filter((entry) => safeString(entry && entry.lifecycleState, 80) === "verifier_failed");
  const orphanChildren = listOrphanChildTaskRecords(policy, {
    rootTaskId: safeString(bundle.taskState && bundle.taskState.rootTaskId, 120) || normalizedTaskId,
    limit: limit || policy.inspectionDefaults.taskListLimit,
  });
  const operatingSummary = buildTaskOperatingSummary({
    taskState: bundle.taskState,
    planState: bundle.planState,
    verifierState: bundle.verifierState,
    acceptanceContract,
  });
  switch (mode) {
    case "task_state":
      return bundle.taskState;
    case "plan_state":
      return bundle.planState;
    case "task_spec":
      return taskSpec;
    case "acceptance_contract":
      return acceptanceContract;
    case "closeout_summary":
      return bundle.closeoutSummary || buildCloseoutSummary({
        taskState: bundle.taskState,
        planState: bundle.planState,
        verifierState: bundle.verifierState,
        acceptanceContract,
      });
    case "replan":
      return bundle.replan || null;
    case "operating_summary":
      return operatingSummary;
    case "handoff_artifacts":
      return (Array.isArray(bundle.artifactIndex && bundle.artifactIndex.artifacts) ? bundle.artifactIndex.artifacts : [])
        .filter((entry) => safeString(entry && entry.type, 120).endsWith("_human") === false)
        .slice(-(limit || policy.inspectionDefaults.artifactLimit));
    case "global_memory":
      return (Array.isArray(bundle.globalMemory && bundle.globalMemory.entries) ? bundle.globalMemory.entries : []).slice(-(limit || policy.inspectionDefaults.globalMemoryLimit));
    case "session_memory":
      return bundle.sessionMemory || buildDefaultSessionMemory({ taskId: normalizedTaskId, sessionId: normalizedSessionId, phase: safeString(bundle.taskState && bundle.taskState.phase, 80) });
    case "verifier_unresolved":
      return (Array.isArray(bundle.verifierState && bundle.verifierState.unresolvedFindings) ? bundle.verifierState.unresolvedFindings : []).slice(0, limit || policy.inspectionDefaults.verifierLimit);
    case "lifecycle_log":
      return readLifecycleEvents(buildTaskPaths({ workspaceRoot, policy, taskId: normalizedTaskId }), { limit: limit || policy.inspectionDefaults.artifactLimit });
    case "agent_graph":
      return agentGraph;
    case "active_agent_tree":
      return {
        taskId: normalizedTaskId,
        lifecycleState: safeString(bundle.taskState && bundle.taskState.lifecycle && bundle.taskState.lifecycle.currentState, 80),
        nodes: Array.isArray(agentGraph && agentGraph.nodes) ? agentGraph.nodes : [],
        edges: Array.isArray(agentGraph && agentGraph.edges) ? agentGraph.edges : [],
        childTasks,
      };
    case "handoff_history":
      return Array.isArray(handoffHistory && handoffHistory.entries) ? handoffHistory.entries.slice(-(limit || policy.inspectionDefaults.artifactLimit)) : [];
    case "integration_summary":
      return integrationSummary;
    case "child_tasks":
      return childTasks;
    case "blocked_subtasks":
      return blockedChildren;
    case "verifier_failed_subtasks":
      return verifierFailedChildren;
    case "pending_integrations":
      return Array.isArray(integrationSummary && integrationSummary.pendingIntegrations) ? integrationSummary.pendingIntegrations.slice(0, limit || policy.inspectionDefaults.artifactLimit) : [];
    case "orphan_subtasks":
      return orphanChildren;
    default:
      throw new Error(`unknown_inspection_mode:${mode}`);
  }
}

module.exports = {
  addGlobalMemoryEntry,
  abandonTask,
  archiveTask,
  applyVerifierReport,
  buildResumeContext,
  buildTaskPaths,
  closeSession,
  defaultContinuityPolicyPath,
  defaultRepoLocalSkillCatalogPath,
  initializeTask,
  inspectTask,
  listTasksByBucket,
  listTasksByLifecycle,
  loadContinuityPolicy,
  loadRepoLocalSkillCatalog,
  parseKvList,
  parseStringList,
  pruneDurableMemory,
  resumeTask,
  updateTask,
};
