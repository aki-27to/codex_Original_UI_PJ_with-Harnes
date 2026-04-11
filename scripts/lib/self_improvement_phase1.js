"use strict";

const fs = require("fs");
const path = require("path");
const {
  loadOpenAIBlogLearningPolicy,
  loadSelfImprovementPromotionPolicy,
  refreshSelfImprovementArtifacts,
} = require("./openai_blog_learning");
const {
  loadAnthropicEngineeringLearningPolicy,
} = require("./anthropic_engineering_learning");

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadLearningPolicyByLane(lane) {
  const normalized = safeString(lane, 80).toLowerCase() || "openai_blog";
  if (normalized === "anthropic_engineering") {
    return {
      lane: normalized,
      policy: loadAnthropicEngineeringLearningPolicy(),
    };
  }
  return {
    lane: "openai_blog",
    policy: loadOpenAIBlogLearningPolicy(),
  };
}

function clonePolicyForDryRun(policy, dryRunRoot) {
  const source = policy && typeof policy === "object" ? policy : {};
  const cloned = JSON.parse(JSON.stringify(source));
  const root = path.resolve(dryRunRoot);
  cloned.paths = {
    ...(cloned.paths && typeof cloned.paths === "object" ? cloned.paths : {}),
    selfImprovementProposalDir: path.join(root, "self_improvement_proposals"),
    selfImprovementStatePath: path.join(root, "self_improvement_state.json"),
    selfImprovementGatePath: path.join(root, "self_improvement_gate.json"),
    stabilizationMemoryPath: path.join(root, "reinforcement_memory.json"),
    stabilizationPlaybookPath: path.join(root, "stabilization_playbook.md"),
  };
  return cloned;
}

function collectManagedTargets(policy, extraTargets = []) {
  const source = policy && typeof policy === "object" ? policy : {};
  const paths = source.paths && typeof source.paths === "object" ? source.paths : {};
  const targets = [
    paths.selfImprovementProposalDir,
    paths.selfImprovementStatePath,
    paths.selfImprovementGatePath,
    paths.stabilizationMemoryPath,
    paths.stabilizationPlaybookPath,
    ...extraTargets,
  ].filter(Boolean);
  return Array.from(new Set(targets.map((entry) => path.resolve(entry))));
}

function applySimulatedBreak(kind, workspaceRoot) {
  const normalized = safeString(kind, 80).toLowerCase();
  if (!normalized) {
    return [];
  }
  const root = path.resolve(workspaceRoot || path.join(__dirname, "..", ".."));
  if (normalized !== "public_overlay") {
    throw new Error(`unknown_simulated_break:${normalized}`);
  }
  const overlayPath = path.join(root, "scripts", "config", "public_regression_overlay.json");
  const overlay = readJsonIfExists(overlayPath);
  if (!overlay || !Array.isArray(overlay.cases) || !overlay.cases.length) {
    throw new Error("public regression overlay is missing");
  }
  const mutated = JSON.parse(JSON.stringify(overlay));
  mutated.cases[0].input = {
    turnStatus: "failed",
    missingEvidence: true,
  };
  writeJson(overlayPath, mutated);
  return [overlayPath];
}

function summarizeSelfImprovementResult(result) {
  const state = result && result.state && typeof result.state === "object" ? result.state : {};
  const gate = result && result.gate && typeof result.gate === "object" ? result.gate : {};
  return {
    gateStatus: safeString(gate.status, 20) || safeString(state.gateStatus, 20) || "UNKNOWN",
    gateReason: safeString(gate.reason, 120) || safeString(state.gateReason, 120),
    appliedDecision: safeString(state.appliedDecision, 40) || "none",
    appliedHintCount: Number(state.appliedHintCount) || 0,
    proposalOnlyCount: Number(state.proposalOnlyCount) || 0,
    blockedCount: Number(state.blockedCount) || 0,
    statePath: safeString(result && result.paths && result.paths.statePath, 260),
    gatePath: safeString(result && result.paths && result.paths.gatePath, 260),
    proposalDir: safeString(result && result.paths && result.paths.proposalDir, 260),
  };
}

function buildTargetedRegressionPlan({ policy, result, lane }) {
  const loadedPromotionPolicy = loadSelfImprovementPromotionPolicy(policy);
  const promotionPolicy = loadedPromotionPolicy && loadedPromotionPolicy.policy ? loadedPromotionPolicy.policy : {};
  const state = result && result.state && typeof result.state === "object" ? result.state : {};
  const queue = Array.isArray(state.priorityBacklog) ? state.priorityBacklog : [];
  const changeTypes = Array.from(new Set(queue.map((entry) => safeString(entry && entry.changeType, 120)).filter(Boolean)));
  const targetedChecks = Array.from(new Set(changeTypes.flatMap((changeType) => {
    const checks = promotionPolicy && promotionPolicy.targetedRegression && promotionPolicy.targetedRegression[changeType];
    return Array.isArray(checks) ? checks : [];
  })));
  return {
    schema: "self-improvement-targeted-regression-plan.v1",
    generatedAt: new Date().toISOString(),
    lane: safeString(lane, 80) || safeString(result && result.policy && result.policy.source && result.policy.source.name, 120) || "external_learning",
    promotionPolicyPath: safeString(loadedPromotionPolicy && loadedPromotionPolicy.path, 260),
    changeTypes,
    targetedChecks,
    readyToGateCount: Number(state.autoApplyCandidateCount) || 0,
    proposalOnlyCount: Number(state.proposalOnlyCount) || 0,
    blockedCount: Number(state.blockedCount) || 0,
  };
}

module.exports = {
  applySimulatedBreak,
  buildTargetedRegressionPlan,
  clonePolicyForDryRun,
  collectManagedTargets,
  loadLearningPolicyByLane,
  refreshSelfImprovementArtifacts,
  summarizeSelfImprovementResult,
};
