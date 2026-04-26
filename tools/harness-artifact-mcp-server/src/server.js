#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const SERVER_NAME = "harness-artifact-mcp-server";
const SERVER_VERSION = "0.1.0";
const PROTOCOL_VERSION = "2024-11-05";
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const MAX_TEXT_BYTES = 4096;
const MAX_STRING_LENGTH = 320;

const ALLOWED_ARTIFACTS = Object.freeze([
  { root: "governance_public", relativePath: "output/governance_public/worker_decision_surface.json" },
  { root: "governance_public", relativePath: "output/governance_public/reviewer_start_here.json" },
  { root: "governance_public", relativePath: "output/governance_public/flow_trace_summary.json" },
  { root: "governance_public", relativePath: "output/governance_public/review_load_breakdown.json" },
  { root: "agi_readiness", relativePath: "output/agi_readiness/goal_completion_status.json" },
  { root: "agi_readiness", relativePath: "output/agi_readiness/learning_adoption_status.json" },
  { root: "agi_readiness", relativePath: "output/agi_readiness/subjective_goal_completion_status.json" },
  { root: "logs_current", relativePath: "logs/current/latest_run_summary.json" },
  { root: "logs_current", relativePath: "logs/current/latest_signoff_summary.json" },
  { root: "logs_current", relativePath: "logs/current/operator_summary.json" },
  { root: "logs_current", relativePath: "logs/current/review_load_breakdown.json" }
]);

const ALLOWED_BY_PATH = new Map(
  ALLOWED_ARTIFACTS.map((entry) => [normalizeRelativePath(entry.relativePath), entry])
);

const TOOL_DEFINITIONS = Object.freeze([
  {
    name: "harness_status",
    description: "Return read-only harness artifact status without calculating release or adoption decisions.",
    inputSchema: objectSchema({})
  },
  {
    name: "harness_list_artifacts",
    description: "List allowlisted harness artifacts by root.",
    inputSchema: objectSchema({
      root: { type: "string", enum: ["governance_public", "agi_readiness", "logs_current"] }
    })
  },
  {
    name: "harness_read_artifact",
    description: "Read one allowlisted harness artifact with bounded output and redaction.",
    inputSchema: objectSchema({
      path: { type: "string", description: "Allowlisted repo-relative artifact path." }
    }, ["path"])
  }
]);

const RESOURCE_DEFINITIONS = Object.freeze([
  { uri: "harness://status", name: "Harness artifact status", mimeType: "application/json" },
  { uri: "harness://worker-decision", name: "Worker decision surface", mimeType: "application/json" },
  { uri: "harness://goal-completion", name: "Goal completion status", mimeType: "application/json" },
  { uri: "harness://logs-current", name: "Current log summaries", mimeType: "application/json" }
]);

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function isPathTraversal(value) {
  const normalized = normalizeRelativePath(value);
  return (
    !normalized ||
    path.isAbsolute(value) ||
    normalized.split("/").includes("..") ||
    /^[A-Za-z]:/.test(value)
  );
}

function resolveAllowedArtifact(requestedPath) {
  if (isPathTraversal(requestedPath)) {
    throw new Error("artifact_path_not_allowlisted");
  }
  const normalized = normalizeRelativePath(requestedPath);
  const entry = ALLOWED_BY_PATH.get(normalized);
  if (!entry) {
    throw new Error("artifact_path_not_allowlisted");
  }
  const absolutePath = path.resolve(ROOT_DIR, entry.relativePath);
  const rootPrefix = path.resolve(ROOT_DIR);
  if (!absolutePath.startsWith(rootPrefix + path.sep) && absolutePath !== rootPrefix) {
    throw new Error("artifact_path_not_allowlisted");
  }
  return { ...entry, absolutePath };
}

function redactString(value) {
  let text = String(value || "");
  text = text.replace(/[A-Za-z]:\\[^\s"'<>|]+/g, "<absolute-path-redacted>");
  text = text.replace(/\\\\\?\\[A-Za-z]:\\[^\s"'<>|]+/g, "<absolute-path-redacted>");
  text = text.replace(/\b(?:sk|ghp|github_pat|xox[baprs])_[A-Za-z0-9_:-]{12,}\b/g, "<secret-redacted>");
  text = text.replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "<secret-redacted>");
  text = text.replace(/(["']?(?:api[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?)[^"',\s}]{8,}/gi, "$1<secret-redacted>");
  if (text.length > MAX_STRING_LENGTH) {
    return `${text.slice(0, MAX_STRING_LENGTH)}...<truncated>`;
  }
  return text;
}

function redactValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 5) return "<max-depth-redacted>";
  if (Array.isArray(value)) return value.slice(0, 12).map((entry) => redactValue(entry, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value).slice(0, 40)) {
      out[redactString(key)] = redactValue(entry, depth + 1);
    }
    return out;
  }
  return redactString(value);
}

function readJsonIfPossible(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, json: null, text: "" };
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return { exists: false, json: null, text: "" };
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return { exists: true, json: JSON.parse(raw), text: raw, stat };
  } catch {
    return { exists: true, json: null, text: raw, stat };
  }
}

function selectedPayload(relativePath, json) {
  if (!json || typeof json !== "object") return null;
  const pick = (keys) => {
    const out = {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(json, key)) {
        out[key] = redactValue(json[key]);
      }
    }
    return out;
  };
  if (relativePath.endsWith("worker_decision_surface.json")) {
    return pick([
      "schema",
      "generatedAt",
      "topLevelOutcome",
      "topLevelSummary",
      "taskOutcomeStatus",
      "taskOutcomeReason",
      "releaseState",
      "adoptionReadiness",
      "adoptionReadinessThreshold",
      "minimalHitl",
      "operatorAction",
      "evidenceSummary"
    ]);
  }
  if (relativePath.endsWith("goal_completion_status.json")) {
    return pick([
      "schema",
      "generatedAt",
      "goalStatus",
      "baseStatus",
      "goalCompletionStatus",
      "subjectiveGoalStatus",
      "compatibilityCompletionStatus",
      "autonomousLearningSummary",
      "blockingReasons"
    ]);
  }
  if (relativePath.endsWith("learning_adoption_status.json")) {
    return pick([
      "schema",
      "generatedAt",
      "scope",
      "primaryLaneKey",
      "selectedInLatestPackCount",
      "effectiveContributionCount",
      "likelyContributoryCount",
      "rolledBackAfterHarmCount",
      "requiredThresholds",
      "summary"
    ]);
  }
  return pick([
    "schema",
    "generatedAt",
    "updatedAt",
    "status",
    "verdict",
    "latestRunStatus",
    "signoffStatus",
    "reviewLoadStatus",
    "designConformanceStatus",
    "summary"
  ]);
}

function artifactSummary(entry) {
  const absolutePath = path.resolve(ROOT_DIR, entry.relativePath);
  const read = readJsonIfPossible(absolutePath);
  const stat = read.stat || (fs.existsSync(absolutePath) ? fs.statSync(absolutePath) : null);
  return {
    root: entry.root,
    path: entry.relativePath,
    exists: Boolean(read.exists),
    size: stat ? stat.size : 0,
    mtime: stat ? stat.mtime.toISOString() : null,
    schema: read.json && typeof read.json.schema === "string" ? redactString(read.json.schema) : null,
    generatedAt: read.json && typeof read.json.generatedAt === "string" ? redactString(read.json.generatedAt) : null
  };
}

function readArtifact(relativePath) {
  const entry = resolveAllowedArtifact(relativePath);
  const read = readJsonIfPossible(entry.absolutePath);
  if (!read.exists) {
    return {
      ok: false,
      path: entry.relativePath,
      reason: "artifact_missing"
    };
  }
  if (read.json) {
    return {
      ok: true,
      path: entry.relativePath,
      root: entry.root,
      format: "json",
      payload: selectedPayload(entry.relativePath, read.json),
      schema: typeof read.json.schema === "string" ? redactString(read.json.schema) : null,
      generatedAt: typeof read.json.generatedAt === "string" ? redactString(read.json.generatedAt) : null,
      observationOnly: true
    };
  }
  return {
    ok: true,
    path: entry.relativePath,
    root: entry.root,
    format: "text",
    textPreview: redactString(read.text.slice(0, MAX_TEXT_BYTES)),
    truncated: read.text.length > MAX_TEXT_BYTES,
    observationOnly: true
  };
}

function buildHarnessStatus() {
  const artifacts = ALLOWED_ARTIFACTS.map(artifactSummary);
  return {
    ok: true,
    server: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      rootDir: redactString(ROOT_DIR)
    },
    accessMode: "read-only",
    observationOnly: true,
    decisionAuthority: "existing harness artifacts and evaluators",
    prohibitedActions: ["write", "delete", "shell", "external_network", "decision_recalculation"],
    allowedRoots: ["governance_public", "agi_readiness", "logs_current"],
    artifacts
  };
}

function listArtifacts(root) {
  const entries = root
    ? ALLOWED_ARTIFACTS.filter((entry) => entry.root === root)
    : ALLOWED_ARTIFACTS;
  return {
    ok: true,
    root: root || "all",
    artifacts: entries.map(artifactSummary),
    observationOnly: true
  };
}

function toolResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(redactValue(payload), null, 2)
      }
    ]
  };
}

function rpcResult(id, result) {
  writeJsonRpc({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message, data) {
  writeJsonRpc({
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error: { code, message, data: redactValue(data || {}) }
  });
}

function writeJsonRpc(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function readResource(uri) {
  if (uri === "harness://status") return buildHarnessStatus();
  if (uri === "harness://worker-decision") return readArtifact("output/governance_public/worker_decision_surface.json");
  if (uri === "harness://goal-completion") return readArtifact("output/agi_readiness/goal_completion_status.json");
  if (uri === "harness://logs-current") return listArtifacts("logs_current");
  throw new Error("resource_not_found");
}

function handleToolCall(name, args) {
  if (name === "harness_status") return buildHarnessStatus();
  if (name === "harness_list_artifacts") return listArtifacts(args && args.root);
  if (name === "harness_read_artifact") return readArtifact(args && args.path);
  throw new Error("tool_not_found");
}

function handleMessage(message) {
  const id = message && message.id;
  try {
    if (!message || typeof message !== "object") {
      rpcError(null, -32600, "Invalid Request");
      return;
    }
    if (message.method === "initialize") {
      rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      });
      return;
    }
    if (message.method === "tools/list") {
      rpcResult(id, { tools: TOOL_DEFINITIONS });
      return;
    }
    if (message.method === "tools/call") {
      const params = message.params || {};
      rpcResult(id, toolResult(handleToolCall(params.name, params.arguments || {})));
      return;
    }
    if (message.method === "resources/list") {
      rpcResult(id, { resources: RESOURCE_DEFINITIONS });
      return;
    }
    if (message.method === "resources/read") {
      const payload = readResource(message.params && message.params.uri);
      rpcResult(id, {
        contents: [
          {
            uri: message.params && message.params.uri,
            mimeType: "application/json",
            text: JSON.stringify(redactValue(payload), null, 2)
          }
        ]
      });
      return;
    }
    if (typeof message.method === "string" && message.method.startsWith("notifications/")) {
      return;
    }
    rpcError(id, -32601, "Method not found");
  } catch (error) {
    rpcError(id, -32000, error && error.message ? error.message : String(error));
  }
}

function main() {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          handleMessage(JSON.parse(line));
        } catch (error) {
          rpcError(null, -32700, "Parse error", { message: error && error.message ? error.message : String(error) });
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  ALLOWED_ARTIFACTS,
  buildHarnessStatus,
  listArtifacts,
  readArtifact,
  redactStringForTest: redactString,
  resolveAllowedArtifact
};
