#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  defaultSelfImprovementPromotionPolicyPath,
  loadSelfImprovementPromotionPolicy,
} = require("./lib/openai_blog_learning");
const { buildTargetedRegressionPlan } = require("./lib/self_improvement_phase1");

function main() {
  const loaded = loadSelfImprovementPromotionPolicy(defaultSelfImprovementPromotionPolicyPath);
  const policy = loaded && loaded.policy ? loaded.policy : {};
  assert.strictEqual(policy.schema, "self-improvement-promotion-policy.v2", "self improvement promotion schema mismatch");
  for (const lifecycle of ["proposal_only", "shadow_candidate", "gated_candidate", "auto_apply_candidate", "blocked"]) {
    assert(Array.isArray(policy.lifecycles) && policy.lifecycles.includes(lifecycle), `missing lifecycle ${lifecycle}`);
  }
  for (const changeClass of [
    "planner_strategy",
    "decomposition_policy",
    "tool_selection_policy",
    "retry_recovery_policy",
    "memory_pack_policy",
    "skill_surface_policy",
  ]) {
    assert(policy.changeClasses && policy.changeClasses[changeClass], `missing change class ${changeClass}`);
  }
  assert(Array.isArray(policy.shadowCandidate && policy.shadowCandidate.changeClasses), "shadow candidate classes must exist");
  assert(Array.isArray(policy.gatedCandidate && policy.gatedCandidate.changeClasses), "gated candidate classes must exist");
  assert(Array.isArray(policy.blocked && policy.blocked.changeClasses), "blocked change classes must exist");

  const targetedPlan = buildTargetedRegressionPlan({
    policy: loaded.path,
    lane: "openai_blog",
    result: {
      state: {
        autoApplyCandidateCount: 0,
        proposalOnlyCount: 1,
        blockedCount: 0,
        priorityBacklog: [
          { changeType: "planner_strategy" },
          { changeType: "skill_surface_policy" },
        ],
      },
      policy: {
        source: {
          name: "OpenAI Developers Blog",
        },
      },
    },
  });
  assert.strictEqual(targetedPlan.schema, "self-improvement-targeted-regression-plan.v1", "targeted regression plan schema mismatch");
  assert(targetedPlan.changeTypes.includes("planner_strategy"), "targeted regression plan must include planner_strategy");
  assert(targetedPlan.changeTypes.includes("skill_surface_policy"), "targeted regression plan must include skill_surface_policy");
  assert(targetedPlan.targetedChecks.includes("self_improvement_gate"), "planner strategy must trigger self improvement gate");
  assert(targetedPlan.targetedChecks.includes("skill_portfolio_audit"), "skill surface policy must trigger skill portfolio audit");

  process.stdout.write("PASS self_improvement_governance_test\n");
}

main();
