"use strict";

const path = require("path");
const {
  buildRuntimeSnapshotFromArtifacts,
  httpFetchText,
  normalizeOpenAIBlogLearningPolicy,
  runOpenAIBlogLearningCycle,
} = require("./openai_blog_learning");

const workspaceRootDefault = path.resolve(__dirname, "..", "..");
const defaultAnthropicEngineeringLearningPolicyPath = path.join(
  workspaceRootDefault,
  "scripts",
  "config",
  "anthropic_engineering_learning_policy.json"
);

function loadAnthropicEngineeringLearningPolicy(policyPath = defaultAnthropicEngineeringLearningPolicyPath) {
  delete require.cache[require.resolve(policyPath)];
  return normalizeAnthropicEngineeringLearningPolicy(require(policyPath), { policyPath });
}

function normalizeAnthropicEngineeringLearningPolicy(policy, { policyPath = defaultAnthropicEngineeringLearningPolicyPath } = {}) {
  return normalizeOpenAIBlogLearningPolicy(policy, { policyPath });
}

async function runAnthropicEngineeringLearningCycle({
  policy = loadAnthropicEngineeringLearningPolicy(),
  fetchText = httpFetchText,
  now = new Date(),
} = {}) {
  return runOpenAIBlogLearningCycle({ policy, fetchText, now });
}

function buildAnthropicEngineeringRuntimeSnapshot(policy, runtimeState = {}) {
  return buildRuntimeSnapshotFromArtifacts(policy, runtimeState);
}

module.exports = {
  buildAnthropicEngineeringRuntimeSnapshot,
  defaultAnthropicEngineeringLearningPolicyPath,
  loadAnthropicEngineeringLearningPolicy,
  normalizeAnthropicEngineeringLearningPolicy,
  runAnthropicEngineeringLearningCycle,
};
