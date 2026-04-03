"use strict";

const fs = require("fs");
const path = require("path");
const {
  loadEvalSuiteFromFile,
  normalizeEvalSuite,
} = require("./eval_harness_policy");

const defaultEvalLanePolicyPath = path.join(__dirname, "..", "config", "eval_lane_policy.json");

const defaultEvalLanePolicy = Object.freeze({
  schema: "eval-lane-policy.v1",
  version: "2026-03-29.r1",
  publicLaneId: "public_regression",
  aggregateOutputPath: "output/eval_lane_aggregate.json",
  protectedPaths: ["protected/holdout"],
  lanes: [
    {
      id: "public_regression",
      visibility: "public",
      suitePaths: ["scripts/config/eval_suite_default.json"],
      outputPath: "output/public_regression_latest.json",
      historyPath: "logs/archive/raw/public_regression_runs.jsonl",
      summaryPath: "output/public_regression_summary.json",
      allowedActors: ["developer", "ci", "release", "optimizer", "runtime"],
      verifierPolicy: {
        requireAllCasesPass: true,
        minPassRate: 1,
        minScoreRate: 1,
        blockedTaskOutcomeStatuses: ["FAILED_VALIDATION", "NEEDS_INPUT", "PARTIAL", "BLOCKED"],
        allowedExecutorStatuses: ["completed"],
      },
    },
  ],
});

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function resolveWorkspacePath(workspaceRoot, candidate, fallbackRelative = "") {
  const raw = safeString(candidate, 600) || safeString(fallbackRelative, 600);
  if (!raw) return "";
  return path.isAbsolute(raw) ? path.normalize(raw) : path.join(workspaceRoot, raw);
}

function uniqueStrings(values, max = 24) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 160);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeVerifierPolicy(input) {
  const source = input && typeof input === "object" ? input : {};
  const minPassRate = Number.isFinite(Number(source.minPassRate)) ? Math.max(0, Math.min(1, Number(source.minPassRate))) : 1;
  const minScoreRate = Number.isFinite(Number(source.minScoreRate)) ? Math.max(0, Math.min(1, Number(source.minScoreRate))) : 1;
  return Object.freeze({
    requireAllCasesPass: source.requireAllCasesPass !== false,
    minPassRate: Number(minPassRate.toFixed(4)),
    minScoreRate: Number(minScoreRate.toFixed(4)),
    blockedTaskOutcomeStatuses: uniqueStrings(source.blockedTaskOutcomeStatuses, 12).map((entry) => entry.toUpperCase()),
    allowedExecutorStatuses: uniqueStrings(source.allowedExecutorStatuses, 12).map((entry) => entry.toLowerCase()),
  });
}

function normalizeEvalLane(input, workspaceRoot) {
  const source = input && typeof input === "object" ? input : {};
  const id = safeString(source.id, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (!id) return null;
  return Object.freeze({
    id,
    visibility: safeString(source.visibility, 40).toLowerCase() || "public",
    suitePaths: uniqueStrings(source.suitePaths, 8).map((entry) => resolveWorkspacePath(workspaceRoot, entry)),
    outputPath: resolveWorkspacePath(workspaceRoot, source.outputPath, `output/${id}_latest.json`),
    historyPath: resolveWorkspacePath(workspaceRoot, source.historyPath, `logs/archive/raw/${id}_runs.jsonl`),
    summaryPath: resolveWorkspacePath(workspaceRoot, source.summaryPath, `output/${id}_summary.json`),
    allowedActors: uniqueStrings(source.allowedActors, 12).map((entry) => entry.toLowerCase()),
    unlockEnvKey: safeString(source.unlockEnvKey, 120),
    verifierPolicy: normalizeVerifierPolicy(source.verifierPolicy),
  });
}

function normalizeEvalLanePolicy(input, { workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const payload = input && typeof input === "object" ? input : {};
  const fallback = defaultEvalLanePolicy;
  const lanes = [];
  const seen = new Set();
  for (const entry of Array.isArray(payload.lanes) ? payload.lanes : fallback.lanes) {
    const normalized = normalizeEvalLane(entry, workspaceRoot);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    lanes.push(normalized);
  }
  const publicLaneId = safeString(payload.publicLaneId, 80).toLowerCase().replace(/[\s-]+/g, "_") || fallback.publicLaneId;
  return Object.freeze({
    schema: safeString(payload.schema, 120) || fallback.schema,
    version: safeString(payload.version, 120) || fallback.version,
    workspaceRoot,
    publicLaneId: lanes.some((entry) => entry.id === publicLaneId) ? publicLaneId : (lanes[0] ? lanes[0].id : fallback.publicLaneId),
    aggregateOutputPath: resolveWorkspacePath(workspaceRoot, payload.aggregateOutputPath, fallback.aggregateOutputPath),
    protectedPaths: uniqueStrings(payload.protectedPaths, 16).map((entry) => resolveWorkspacePath(workspaceRoot, entry)),
    lanes: Object.freeze(lanes),
  });
}

function loadEvalLanePolicy(filePath = defaultEvalLanePolicyPath, { workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return normalizeEvalLanePolicy(raw ? JSON.parse(raw) : {}, { workspaceRoot });
}

function getEvalLane(policy, laneId) {
  const normalized = normalizeEvalLanePolicy(policy, { workspaceRoot: policy && policy.workspaceRoot ? policy.workspaceRoot : path.resolve(__dirname, "..", "..") });
  const id = safeString(laneId, 80).toLowerCase().replace(/[\s-]+/g, "_") || normalized.publicLaneId;
  return normalized.lanes.find((entry) => entry.id === id) || null;
}

function isPathWithin(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  if (root === candidate) return true;
  return candidate.startsWith(`${root}${path.sep}`);
}

function isProtectedEvalPath(policy, candidatePath) {
  const normalized = normalizeEvalLanePolicy(policy, { workspaceRoot: policy && policy.workspaceRoot ? policy.workspaceRoot : path.resolve(__dirname, "..", "..") });
  const resolved = path.resolve(candidatePath);
  return normalized.protectedPaths.some((entry) => isPathWithin(entry, resolved));
}

function assertEvalLaneAccess({ policy, laneId, actor = "developer", accessMode = "read", env = process.env } = {}) {
  const normalized = normalizeEvalLanePolicy(policy, { workspaceRoot: policy && policy.workspaceRoot ? policy.workspaceRoot : path.resolve(__dirname, "..", "..") });
  const lane = getEvalLane(normalized, laneId);
  if (!lane) {
    throw new Error(`unknown_eval_lane:${safeString(laneId, 80) || "missing"}`);
  }
  const normalizedActor = safeString(actor, 80).toLowerCase() || "developer";
  if (!lane.allowedActors.includes(normalizedActor)) {
    throw new Error(`eval_lane_access_denied:${lane.id}:${normalizedActor}:${safeString(accessMode, 40) || "read"}`);
  }
  if (lane.visibility === "protected") {
    if (normalizedActor === "optimizer" || normalizedActor === "runtime") {
      throw new Error(`eval_lane_access_denied:${lane.id}:${normalizedActor}:${safeString(accessMode, 40) || "read"}`);
    }
    if (lane.unlockEnvKey) {
      const token = env && Object.prototype.hasOwnProperty.call(env, lane.unlockEnvKey) ? safeString(env[lane.unlockEnvKey], 120) : "";
      if (!token) {
        throw new Error(`eval_lane_unlock_required:${lane.id}:${lane.unlockEnvKey}`);
      }
    }
  }
  return lane;
}

function mergeEvalSuites(suites, { fallbackId = "merged-suite.v1" } = {}) {
  const normalizedSuites = (Array.isArray(suites) ? suites : []).filter((entry) => entry && typeof entry === "object");
  const cases = [];
  const seen = new Set();
  for (const suite of normalizedSuites) {
    for (const evalCase of Array.isArray(suite.cases) ? suite.cases : []) {
      const caseId = safeString(evalCase && evalCase.id, 120);
      if (!caseId || seen.has(caseId)) continue;
      seen.add(caseId);
      cases.push(evalCase);
    }
  }
  return normalizeEvalSuite({
    suiteId: fallbackId,
    description: "Merged evaluation lane suite",
    cases,
  }, { fallbackId });
}

function loadEvalSuiteForLane({ policy, laneId, actor = "developer", env = process.env } = {}) {
  const lane = assertEvalLaneAccess({ policy, laneId, actor, env, accessMode: "read" });
  const suites = lane.suitePaths.map((suitePath) => loadEvalSuiteFromFile(suitePath));
  const suite = mergeEvalSuites(suites, { fallbackId: `${lane.id}.merged.v1` });
  return { lane, suite };
}

function summarizeEvalLane(lane) {
  const source = lane && typeof lane === "object" ? lane : {};
  return {
    id: safeString(source.id, 80),
    visibility: safeString(source.visibility, 40),
    suiteCount: Array.isArray(source.suitePaths) ? source.suitePaths.length : 0,
    outputPath: safeString(source.outputPath, 260),
    summaryPath: safeString(source.summaryPath, 260),
    protected: safeString(source.visibility, 40) === "protected" ? 1 : 0,
    unlockEnvKey: safeString(source.unlockEnvKey, 120),
  };
}

module.exports = {
  defaultEvalLanePolicyPath,
  assertEvalLaneAccess,
  getEvalLane,
  isProtectedEvalPath,
  loadEvalLanePolicy,
  loadEvalSuiteForLane,
  mergeEvalSuites,
  normalizeEvalLanePolicy,
  summarizeEvalLane,
};
