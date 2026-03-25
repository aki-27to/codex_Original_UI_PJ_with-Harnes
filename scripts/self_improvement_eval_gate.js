#!/usr/bin/env node
"use strict";

const {
  loadOpenAIBlogLearningPolicy,
  refreshSelfImprovementArtifacts,
} = require("./lib/openai_blog_learning");
const {
  loadAnthropicEngineeringLearningPolicy,
} = require("./lib/anthropic_engineering_learning");

function summarizeLane(label, result) {
  const state = result && result.state && typeof result.state === "object" ? result.state : {};
  const gate = result && result.gate && typeof result.gate === "object" ? result.gate : {};
  console.log(
    `[self-improvement] lane=${label} gate=${String(gate.status || state.gateStatus || "UNKNOWN")} applied=${Number(state.appliedHintCount) || 0} proposalOnly=${Number(state.proposalOnlyCount) || 0} blocked=${Number(state.blockedCount) || 0}`
  );
  console.log(
    `[self-improvement] lane=${label} state=${String(state.statePath || "-")} gatePath=${String(state.gatePath || "-")} proposals=${String(state.proposalDir || "-")}`
  );
}

async function main() {
  const lanes = [
    { label: "openai_blog", policy: loadOpenAIBlogLearningPolicy() },
    { label: "anthropic_engineering", policy: loadAnthropicEngineeringLearningPolicy() },
  ];
  let failed = false;
  for (const lane of lanes) {
    const result = refreshSelfImprovementArtifacts({ policy: lane.policy });
    summarizeLane(lane.label, result);
    if (result && result.gate && String(result.gate.status || "") === "FAIL") {
      failed = true;
    }
  }
  if (failed) {
    process.exitCode = 1;
  }
}

Promise.resolve(main()).catch((error) => {
  console.error(`[self-improvement] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
