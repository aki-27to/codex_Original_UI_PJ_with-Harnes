"use strict";

const fs = require("fs");
const path = require("path");

const defaultSystemCoherenceReviewContractPath = path.join(__dirname, "..", "config", "system_coherence_review_contract.json");

const defaultSystemCoherenceReviewContract = Object.freeze({
  schema: "system-coherence-review-contract.v1",
  version: "2026-04-07.r1",
  sourceDoc: "docs/SYSTEM_COHERENCE_REVIEW.md",
  requiredCommand: "node scripts/system_coherence_review_test.js",
  primaryExecRoute: "POST /api/exec",
  allowedAuxiliaryRoutePrefix: "/api/batch/",
  reviewPlanes: [
    { id: "execution_path", description: "Standard execution route remains primary." },
    { id: "governance_rules", description: "Governance rules remain internally consistent." },
    { id: "machine_contracts", description: "Machine-readable contracts remain synchronized." },
    { id: "server_runtime", description: "Server/runtime behavior matches the contracts." },
    { id: "evaluation_memory", description: "Eval, memory, and lifecycle surfaces stay aligned." },
    { id: "artifact_surface", description: "Artifact taxonomy and repo hygiene remain coherent." },
  ],
  coreChangePathGlobs: [
    "server.js",
    "package.json",
    "start_codex_ui.bat",
    ".codex/**",
    "scripts/**",
    "web/**",
    "docs/AGENT_OPERATING_RULES.md",
    "docs/EVIDENCE_CONTRACT.md",
    "docs/CURRENT_ARCHITECTURE.md",
    "docs/SINGLE_HARNESS_MULTI_PLANE.md",
    "docs/ARCHITECTURE_CHANGELOG.md",
    "docs/SYSTEM_COHERENCE_REVIEW.md",
  ],
  corePromptMarkers: ["/api/exec", "architecture", "governance", "contract", "eval", "memory", "artifact surface", "lifecycle", "whole-system"],
  requiredDocs: ["docs/CURRENT_ARCHITECTURE.md", "docs/SINGLE_HARNESS_MULTI_PLANE.md", "docs/ARCHITECTURE_CHANGELOG.md"],
  requiredMachineContracts: [
    "scripts/config/agent_governance_contracts.json",
    "scripts/config/harness_plane_contract.json",
    "scripts/config/evidence_contract.json",
    "scripts/config/task_outcome_contract.json",
  ],
});

function safeString(value, max = 2000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function normalizeRelativePath(value) {
  return safeString(value, 260).replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueStrings(values, max = 64) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = normalizeRelativePath(entry);
    if (!text || out.includes(text)) {
      continue;
    }
    out.push(text);
    if (out.length >= max) {
      break;
    }
  }
  return Object.freeze(out);
}

function uniqueLowerStrings(values, max = 64) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 160).toLowerCase();
    if (!text || out.includes(text)) {
      continue;
    }
    out.push(text);
    if (out.length >= max) {
      break;
    }
  }
  return Object.freeze(out);
}

function globToRegExp(globPattern) {
  const escaped = String(globPattern || "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function normalizeReviewPlanes(values) {
  const source = Array.isArray(values) ? values : defaultSystemCoherenceReviewContract.reviewPlanes;
  const out = [];
  const seen = new Set();
  for (const entry of source) {
    const plane = entry && typeof entry === "object" ? entry : {};
    const id = safeString(plane.id, 80).toLowerCase().replace(/[\s-]+/g, "_");
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(Object.freeze({
      id,
      description: safeString(plane.description, 240),
    }));
  }
  return Object.freeze(out.length ? out : defaultSystemCoherenceReviewContract.reviewPlanes.slice());
}

function normalizeSystemCoherenceReviewContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  return Object.freeze({
    schema: safeString(payload.schema, 120) || defaultSystemCoherenceReviewContract.schema,
    version: safeString(payload.version, 120) || defaultSystemCoherenceReviewContract.version,
    sourceDoc: normalizeRelativePath(payload.sourceDoc) || defaultSystemCoherenceReviewContract.sourceDoc,
    requiredCommand: safeString(payload.requiredCommand, 200) || defaultSystemCoherenceReviewContract.requiredCommand,
    primaryExecRoute: safeString(payload.primaryExecRoute, 120) || defaultSystemCoherenceReviewContract.primaryExecRoute,
    allowedAuxiliaryRoutePrefix: safeString(payload.allowedAuxiliaryRoutePrefix, 120) || defaultSystemCoherenceReviewContract.allowedAuxiliaryRoutePrefix,
    reviewPlanes: normalizeReviewPlanes(payload.reviewPlanes),
    coreChangePathGlobs: uniqueStrings(payload.coreChangePathGlobs || defaultSystemCoherenceReviewContract.coreChangePathGlobs),
    corePromptMarkers: uniqueLowerStrings(payload.corePromptMarkers || defaultSystemCoherenceReviewContract.corePromptMarkers),
    requiredDocs: uniqueStrings(payload.requiredDocs || defaultSystemCoherenceReviewContract.requiredDocs),
    requiredMachineContracts: uniqueStrings(payload.requiredMachineContracts || defaultSystemCoherenceReviewContract.requiredMachineContracts),
  });
}

function loadSystemCoherenceReviewContract(filePath = defaultSystemCoherenceReviewContractPath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return normalizeSystemCoherenceReviewContract(raw ? JSON.parse(raw) : {});
}

function matchesCoreChangePath(relativePath, contract) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return false;
  }
  return contract.coreChangePathGlobs.some((globPattern) => globToRegExp(globPattern).test(normalizedPath));
}

function requiresSystemCoherenceReview({ prompt = "", changedPaths = [], contract } = {}) {
  const normalizedContract = normalizeSystemCoherenceReviewContract(contract);
  const normalizedPrompt = safeString(prompt, 4000).toLowerCase();
  const pathHit = uniqueStrings(changedPaths).some((entry) => matchesCoreChangePath(entry, normalizedContract));
  if (pathHit) {
    return true;
  }
  return normalizedContract.corePromptMarkers.some((marker) => normalizedPrompt.includes(marker));
}

function hasRequiredSystemReviewCommand({ sampleCommands = [], contract } = {}) {
  const normalizedContract = normalizeSystemCoherenceReviewContract(contract);
  const normalizedNeedle = safeString(normalizedContract.requiredCommand, 200).toLowerCase();
  return Array.isArray(sampleCommands) && sampleCommands.some((entry) => safeString(entry, 500).toLowerCase().includes(normalizedNeedle));
}

function evaluateSystemCoherenceReview({ prompt = "", changedPaths = [], sampleCommands = [], docSyncEvidence = null, contract } = {}) {
  const normalizedContract = normalizeSystemCoherenceReviewContract(contract);
  const required = requiresSystemCoherenceReview({ prompt, changedPaths, contract: normalizedContract });
  const commandObserved = hasRequiredSystemReviewCommand({ sampleCommands, contract: normalizedContract });
  const docSyncPass = !required || (docSyncEvidence && docSyncEvidence.status === "PASS");
  const missing = [];
  if (required && !commandObserved) {
    missing.push("system_coherence_review_missing");
  }
  if (required && !docSyncPass) {
    missing.push("doc_sync_missing");
  }
  return {
    required,
    commandObserved,
    docSyncPass,
    status: required ? (missing.length ? "FAIL" : "PASS") : "SKIPPED",
    reviewPlanes: normalizedContract.reviewPlanes.map((entry) => entry.id),
    requiredCommand: normalizedContract.requiredCommand,
    missing,
  };
}

module.exports = {
  defaultSystemCoherenceReviewContractPath,
  evaluateSystemCoherenceReview,
  hasRequiredSystemReviewCommand,
  loadSystemCoherenceReviewContract,
  matchesCoreChangePath,
  normalizeSystemCoherenceReviewContract,
  requiresSystemCoherenceReview,
};
